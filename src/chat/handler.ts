import type { CommandInput } from '@qqbot/sdk';
import { configuredProvider, requireInteger, snapshot } from '../config/schema.js';
import type { Config } from '../config/schema.js';
import { acquire, release, saveHistory } from './session.js';
import type { Lease } from './session.js';
import { ensureSchema, statisticsStart } from '../storage/database.js';
import { invoke } from '../model/invoke.js';
import { chars, imageUrl, prepareConnection, prepareInput } from '../model/client.js';
import { checkOutput, splitMarkdownOutput, readHistory } from './output.js';
import { admit } from '../storage/requests.js';
import type { Call } from '../storage/requests.js';
import { aiError, safeError } from '../types.js';
import type { AIMessage, DeliveryStatus, Round } from '../types.js';
import { bestEffort, finish } from '../storage/usage.js';

export const QQ_LOCAL_BUDGET_MS = 24000;
export const QQ_FINISH_RESERVE_MS = 6000;
export const QQ_REPLY_RESERVE_MS = 1500;

export async function handleChat(input: CommandInput<Config>, fetcher: typeof fetch = fetch, started = Date.now()): Promise<void> {
    const { session, ctx, argText } = input;
    const config = snapshot(ctx.config);
    let lease: Lease | null = null;
    let call: Call | null = null;
    let released = false;
    let admitted = false;
    let modelReturned = false;
    let delivery: DeliveryStatus = 'not_sent';
    let deliveryError: string | null = null;
    const tip = async (text: string) => {
        if (session.canReply && Date.now() + QQ_REPLY_RESERVE_MS < started + QQ_LOCAL_BUDGET_MS) {
            try {
                await session.reply(text);
            } catch {
                ctx.logger.warn('AI 提示未确认投递');
            }
        }
    };

    try {
        if (!['group', 'c2c'].includes(session.scene) || !session.canReply) {
            return;
        }

        if (!argText.trim()) {
            await tip('用法：/ai <问题>');

            return;
        }

        if (!session.id || !session.botId || !session.userId || !session.targetId) {
            throw aiError('INVALID_ARGUMENT', '会话身份不完整');
        }

        if (session.timestamp < statisticsStart(started)) {
            return;
        }

        checkOutput(config);
        const quoted = session.quote?.content ?? '';
        const attachments = [...(session.attachments ?? []), ...(session.quote?.attachments ?? [])];
        let picture: string | undefined;

        if (attachments.length) {
            if (config.qq.visionEnabled !== true) {
                throw aiError('INVALID_ARGUMENT', '识别图片未开启，请在 QQ 对话设置中开启');
            }

            if (attachments.length > 1) {
                throw aiError('INVALID_ARGUMENT', '每次只能识别一张图片，请分开提问');
            }

            const attachment = attachments[0]!;
            picture = imageUrl(attachment.url);
            const filenameExtension = attachment.filename?.match(/\.[^./\\]+$/)?.[0];
            const supported = attachment.contentType
                ? /^image\/(jpeg|png|gif|webp)$/i.test(attachment.contentType)
                : /\.(jpe?g|png|gif|webp)$/i.test(filenameExtension ?? new URL(picture).pathname);

            if (!supported) {
                throw aiError('INVALID_ARGUMENT', '仅支持 JPEG、PNG、GIF、WebP 图片，请重新发送图片');
            }
        }

        if (session.quote && !quoted.trim() && !session.quote.attachments?.length) {
            throw aiError('INVALID_ARGUMENT', '无法读取引用原文，请直接补充问题');
        }

        for (const n of [config.qq.maxQuestionChars, config.qq.maxQuotedChars, config.qq.maxCombinedInputChars]) {
            requireInteger(n);
        }

        const questionChars = chars(argText);
        const quotedChars = chars(quoted);

        if (questionChars > config.qq.maxQuestionChars || quotedChars > config.qq.maxQuotedChars
            || questionChars + quotedChars > config.qq.maxCombinedInputChars) {
            throw aiError('INVALID_ARGUMENT', '内容太长');
        }

        const identity = session.scene === 'group'
            ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
                new TextEncoder().encode(JSON.stringify([session.botId, session.targetId, session.userId])))))
                .slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('') : '';
        const user = (session.scene === 'group'
            ? `[群成员 ${identity}；昵称 ${session.userName}]\n` : '')
            + argText + (quoted ? `\n\n[引用原文]\n${quoted}` : '');
        const system: AIMessage[] = [config.qq.systemPrompt]
            .filter(Boolean).map(content => ({ role: 'system', content }));
        const question: AIMessage = { role: 'user', content: user, ...(picture ? { imageUrl: picture } : {}) };
        const initialInput = prepareInput(config.qq, [...system, question]);
        const provider = configuredProvider(config);
        const initialPrepared = prepareConnection(provider, initialInput);
        const scopeId = session.scene === 'group' ? session.targetId : session.userId;
        call = {
            id: JSON.stringify([session.botId, session.scene, scopeId, session.id]), owner: crypto.randomUUID(),
            source: 'chat', sourceLabel: null, until: started + QQ_LOCAL_BUDGET_MS
        };
        await ensureSchema(ctx.db);

        if (Date.now() + QQ_FINISH_RESERVE_MS >= call.until) {
            throw aiError('BUDGET_EXHAUSTED', '剩余请求时间不足');
        }

        lease = await acquire(ctx.db, session.botId, session.scene, scopeId, call.owner, Date.now(), call.until, config, call.id);

        if (!lease) {
            const recorded = await ctx.db.first('SELECT 1 FROM {usage_detail} WHERE request_id=?', call.id);

            if (!recorded) {
                await tip('正在回答其他问题，请稍后再问');
            }

            return;
        }

        call.lease = lease;
        const previous = config.qq.multiTurnEnabled ? readHistory(JSON.parse(lease.history) as Round[], config) : null;
        const messages: AIMessage[] = [...system];

        for (const round of previous?.rounds ?? []) {
            messages.push({ role: 'user', content: round.user }, { role: 'assistant', content: round.assistant });
        }

        messages.push(question);
        const prepared = previous?.rounds.length ? prepareConnection(provider, prepareInput(config.qq, messages)) : initialPrepared;
        const beforeSend = async () => {
            const remaining = call!.until - Date.now() - QQ_FINISH_RESERVE_MS;

            if (remaining <= 0) {
                throw aiError('BUDGET_EXHAUSTED', '剩余请求时间不足');
            }

            prepared.timeoutMs = Math.min(prepared.timeoutMs, remaining);
        };

        if (Date.now() + QQ_FINISH_RESERVE_MS >= call.until) {
            throw aiError('BUDGET_EXHAUSTED', '剩余请求时间不足');
        }

        admitted = await admit(ctx.db, call, prepared, Date.now(), started);

        if (!admitted) {
            throw aiError('STORAGE_UNAVAILABLE', '本次调用未获准，请稍后再试');
        }

        const response = await invoke(ctx, call, prepared, beforeSend, fetcher);
        modelReturned = true;
        const segments = splitMarkdownOutput(response.text, config, response.finishReason === 'length');
        const sent: string[] = [];

        for (const segment of segments) {
            const allowed = Date.now() + QQ_REPLY_RESERVE_MS < call.until;

            if (!allowed) {
                delivery = sent.length ? 'partial' : 'not_sent';
                deliveryError = 'budget';
                break;
            }

            const message = segment.markdown ? { markdown: { content: segment.text }, text: segment.text } : segment.text;
            const result = await session.reply(message).catch(() => ({ ok: false, status: 0 }));

            if (!result.ok) {
                // SDK 可能在内部重试；最终状态不能排除先前已投递成功的情况。
                delivery = sent.length ? 'partial' : 'unknown';
                deliveryError = 'send_unconfirmed';
                break;
            }

            sent.push(segment.text);
            delivery = sent.length === segments.length ? 'success' : 'partial';
        }

        if (sent.length && config.qq.multiTurnEnabled) {
            await bestEffort(ctx, async () => {
                released = await saveHistory(ctx.db, lease!, previous!,
                    {
                        user: user + (picture ? '\n[本轮附有图片；图片未保留，再次分析需重新提供]' : ''),
                        assistant: sent.join('')
                    }, config, Date.now());
            });
        }
    } catch (cause) {
        const error = safeError(cause, !admitted);

        ctx.logger.warn('AI 请求未完成', { code: error.code });

        if (!admitted) {
            await tip(error.message);
        } else if (!modelReturned && lease) {
            await bestEffort(ctx, async () => {
                if (Date.now() + QQ_REPLY_RESERVE_MS < call!.until) {
                    await tip(error.message);
                }
            });
        }
    } finally {
        if (call && admitted) {
            await bestEffort(ctx, () => finish(ctx, call!, delivery, deliveryError));
        }

        if (lease && !released) {
            await bestEffort(ctx, () => release(ctx.db, lease!));
        }
    }
}
