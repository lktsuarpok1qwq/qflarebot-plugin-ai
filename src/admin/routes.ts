import type { Route, RouteInput } from '@qqbot/sdk';
import type { Config } from '../config/schema.js';
import { ensureSchema, DAY } from '../storage/database.js';
import { clearHistory } from '../chat/session.js';
import { report, reportQuery, serviceCalls, serviceQuery } from './reports.js';
import { createAIService } from '../model/service.js';
import { aiError, isAIError } from '../types.js';
import { page } from './page.js';
import { publicSettings, readSavedSettings, saveSettings, settingsContext } from '../config/store.js';
import { MAX_SETTINGS_BYTES } from '../config/schema.js';

async function bounded<T>(work: Promise<T>, timeout = 5000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([work, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('operation_timeout')), timeout);
        })]);
    } finally {
        clearTimeout(timer);
    }
}

async function readBytes(stream: ReadableStream | null, maximum: number, timeout = 5000): Promise<Uint8Array> {
    if (!stream) {
        throw new Error('object_missing');
    }

    const reader = stream.getReader();
    const pieces: Uint8Array[] = [];
    let size = 0;

    try {
        await bounded((async () => {
            for (; ;) {
                const part = await reader.read();

                if (part.done) {
                    break;
                }

                size += part.value.byteLength;

                if (size > maximum) {
                    throw new Error('object_too_large');
                }

                pieces.push(part.value);
            }
        })(), timeout);
    } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        // 读取超时后底层操作可能仍未结束，通过取消释放读取资源。
        void reader.closed.catch(() => undefined);
    }

    const result = new Uint8Array(size);
    let offset = 0;

    for (const piece of pieces) {
        result.set(piece, offset);
        offset += piece.byteLength;
    }

    return result;
}

type Input = RouteInput<Config>;
const json = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

function field(value: unknown, maximum = 2048): string {
    if (typeof value !== 'string' || !value || value.length > maximum) {
        throw aiError('INVALID_ARGUMENT', '参数为空或过长');
    }

    return value;
}

async function body(request: Request, maximum = 8192): Promise<Record<string, unknown>> {
    if (!request.headers.get('content-type')?.includes('application/json')) {
        throw aiError('INVALID_ARGUMENT', '请使用 JSON 请求');
    }

    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(await readBytes(request.body, maximum)));

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error();
        }

        return value as Record<string, unknown>;
    } catch {
        throw aiError('INVALID_ARGUMENT', 'JSON 无效或请求过大');
    }
}

const route = (method: Route<Config>['method'], path: string, action: (input: Input) => Promise<Response>): Route<Config> => ({
    method, path, auth: 'admin', async handler(input) {
        if (!input.authenticated) {
            return json({ error: '需要管理员登录' }, 401);
        }

        try {
            return await action(input);
        } catch (error) {
            const known = isAIError(error);
            input.ctx.logger.warn('AI 管理操作未完成', { code: known ? error.code : 'STORAGE_ERROR' });

            return json({
                error: known ? error.message : '存储暂不可用', code: known ? error.code : 'STORAGE_UNAVAILABLE',
                ...(known ? { requestNotSent: error.requestNotSent, httpStatus: error.httpStatus } : {}),
                ...(known && 'field' in error && typeof error.field === 'string' ? { field: error.field } : {})
            },
                known && error.code === 'INVALID_ARGUMENT' ? 400 : 503);
        }
    }
});

async function conversations({ ctx, request }: Input): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const id = params.get('id');

    const cursor = params.get('cursor') ?? '';

    if (id) { field(id, 4096); }
    else if (cursor.length > 4096) { throw aiError('INVALID_ARGUMENT', '分页参数过长'); }

    ctx = await settingsContext(ctx);
    const cutoff = Date.now() - ctx.config.qq.inactivityDays * DAY;

    if (id) {
        const row = await ctx.db.first<{ messages_json: string }>(`SELECT conversation_id,bot_id,scene,scope_id,messages_json,last_success_at_ms
            FROM {conversations} WHERE conversation_id=? AND last_success_at_ms>? AND messages_json<>'[]'`, id, cutoff);

        if (!row) { return json({ error: '会话不存在或历史已过期' }, 404); }

        if (new TextEncoder().encode(row.messages_json).byteLength > 524288) { return json({ error: '会话过大，请缩小历史保留上限或清空该会话' }, 413); }

        const { messages_json, ...meta } = row;

        return json({ ...meta, rounds: JSON.parse(messages_json) });
    }

    const rows = await ctx.db.all(`SELECT conversation_id,bot_id,scene,scope_id,last_success_at_ms,lock_until_ms
        FROM {conversations} WHERE conversation_id>? AND last_success_at_ms>? AND messages_json<>'[]'
        ORDER BY conversation_id LIMIT 26`, cursor, cutoff);

    return json({ items: rows.slice(0, 25), nextCursor: rows.length > 25 ? rows[24]!.conversation_id : null });
}

export const adminRoutes: Route<Config>[] = [
    {
        method: 'GET', path: '/ui', auth: 'admin', handler: ({ authenticated }) => authenticated
            ? new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
            : json({ error: '需要管理员登录' }, 401)
    },
    route('GET', '/api/settings', async ({ ctx }) => json(publicSettings(await readSavedSettings(ctx.db)))),
    route('POST', '/api/settings', async ({ ctx, request }) => {
        const saved = await saveSettings(ctx.db, await body(request, MAX_SETTINGS_BYTES));

        return saved ? json(publicSettings(saved))
            : json({ error: '设置已在其他页面修改，请刷新页面后重试', code: 'SETTINGS_CONFLICT' }, 409);
    }),
    route('GET', '/api/report', async ({ ctx, request }) => {
        const query = reportQuery(new URL(request.url).searchParams);
        await ensureSchema(ctx.db);

        return json(await report(ctx.db, query));
    }),
    route('GET', '/api/conversations', conversations),
    route('GET', '/api/service-calls', async ({ ctx, request }) => {
        const query = serviceQuery(new URL(request.url).searchParams);
        await ensureSchema(ctx.db);

        return json(await serviceCalls(ctx.db, query));
    }),
    route('POST', '/api/conversations/clear', async ({ ctx, request }) => {
        const id = field((await body(request)).id, 4096);
        await ensureSchema(ctx.db);
        await clearHistory(ctx.db, id);

        return json({ cleared: true });
    }),
    route('POST', '/api/test', async ({ ctx, request }) => {
        await body(request);
        ctx = await settingsContext(ctx);
        const started = Date.now();
        const model = ctx.config.connection.model;

        try {
            const answer = await createAIService(ctx, undefined, 'admin_test').generate({
                prompt: '只回答 OK',
                maxOutputTokens: 16, timeoutMs: 10000
            });

            return json({
                outcome: answer.finishReason === 'length' ? 'output_limit' : 'complete', connected: true,
                provider: answer.provider, model: answer.model, text: Array.from(answer.text).slice(0, 200).join(''),
                usage: answer.usage, elapsedMs: Date.now() - started
            });
        } catch (error) {
            if (!isAIError(error) || error.code !== 'INVALID_RESPONSE' || error.finishReason !== 'length') {
                throw error;
            }

            return json({
                outcome: 'output_limit', connected: true, provider: 'openai_compatible',
                model, text: '', usage: error.usage,
                elapsedMs: Date.now() - started
            });
        }
    })
];
