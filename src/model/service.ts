import type { PluginContext } from '@qqbot/sdk';
import { configuredProvider } from '../config/schema.js';
import type { Config } from '../config/schema.js';
import { ensureSchema } from '../storage/database.js';
import { invoke } from './invoke.js';
import { chars, prepareInput, prepareConnection } from './client.js';
import type { Call } from '../storage/requests.js';
import { aiError, safeError } from '../types.js';
import type { AIMessage, AIService, ChatOptions, Source } from '../types.js';
import { startUsage } from '../storage/usage.js';

export function createAIService(ctx: PluginContext<Config>, fetcher: typeof fetch = fetch, source: Exclude<Source, 'chat'> = 'service', readConfig = async () => ctx.config): AIService {
    let connection: Promise<ReturnType<typeof configuredProvider>> | undefined;
    const chat = async (options: ChatOptions) => {
        if (!options || typeof options !== 'object' || (options.systemPrompt !== undefined && typeof options.systemPrompt !== 'string')) {
            throw aiError('INVALID_ARGUMENT', 'Service 参数无效');
        }

        const started = Date.now();
        const messages: AIMessage[] = [];
        const system = options.systemPrompt ?? '';

        if (typeof system !== 'string' || !Array.isArray(options.messages) || options.messages.length + (system ? 1 : 0) > 100
            || (options.sourceLabel !== undefined && (typeof options.sourceLabel !== 'string' || chars(options.sourceLabel) > 100))) {
            throw aiError('INVALID_ARGUMENT', 'Service 参数无效');
        }

        if (system) {
            messages.push({ role: 'system', content: system });
        }

        messages.push(...options.messages);

        const requestMaxChars = options.requestMaxChars ?? 4000;

        if (typeof requestMaxChars !== 'number' || !Number.isSafeInteger(requestMaxChars) || requestMaxChars < 1
            || options.requestMaxChars === null) {
            throw aiError('INVALID_ARGUMENT', '输入字符上限必须为正整数');
        }

        const input = prepareInput(null, messages, options);

        if (!options.messages.length || messages.reduce((sum, m) => sum + chars(m.content), 0) > requestMaxChars) {
            throw aiError('INVALID_ARGUMENT', 'Service 内容太长或为空');
        }

        const sourceLabel = options.sourceLabel ?? null;
        // SDK 按请求复用实例；只保留解析后的连接，不复制 QQ 设置。
        const provider = await (connection ??= readConfig().catch(error => {
            connection = undefined;
            throw error;
        }).then(configuredProvider));
        const prepared = prepareConnection(provider, input);
        const call: Call = {
            id: crypto.randomUUID(), owner: crypto.randomUUID(),
            source, sourceLabel,
            until: started + prepared.timeoutMs + 6000
        };
        let admitted = false;

        await ensureSchema(ctx.db);

        try {
            if (Date.now() >= call.until - 6000) {
                throw aiError('BUDGET_EXHAUSTED', '剩余请求时间不足');
            }

            admitted = await startUsage(ctx.db, call, prepared, Date.now());

            if (!admitted) {
                throw aiError('STORAGE_UNAVAILABLE', 'Service 调用未获准');
            }

            return await invoke(ctx, call, prepared, async () => {
                if (Date.now() >= call.until - 6000) {
                    throw aiError('BUDGET_EXHAUSTED', '剩余请求时间不足');
                }

                prepared.timeoutMs = Math.min(prepared.timeoutMs, call.until - Date.now() - 6000);
            }, fetcher);
        } catch (error) {
            throw safeError(error, !admitted);
        }
    };

    return {
        chat, generate: async options => {
            if (!options || typeof options.prompt !== 'string' || !options.prompt.trim()) {
                throw aiError('INVALID_ARGUMENT', '问题不能为空');
            }

            return chat({
                ...options, messages: [{
                    role: 'user', content: options.prompt,
                    ...(options.imageUrl === undefined ? {} : { imageUrl: options.imageUrl })
                }]
            });
        }
    };
}
