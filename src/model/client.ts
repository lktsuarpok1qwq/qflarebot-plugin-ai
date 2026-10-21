import { configuredProvider, requireInteger } from '../config/schema.js';
import type { Config, GenerationConfig } from '../config/schema.js';
import { aiError, isAIError } from '../types.js';
import type { AIMessage, AIResponse, ChatOptions, Usage } from '../types.js';

export const MAX_REQUEST_BYTES = 65536;
export const MAX_RESPONSE_BYTES = 262144;
export const emptyUsage = (): Usage => ({
    inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null
});
export const chars = (value: string): number => Array.from(value).length;
export const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
export interface Prepared {
    endpoint: string;
    key: string;
    provider: AIResponse['provider'];
    model: string;
    body: Uint8Array;
    timeoutMs: number;
    responseFormat: 'text' | 'json_object';
}

// 只传图片 URL，图片正文不经过 Worker，也不计入插件的请求体预算。
export function imageUrl(value: unknown): string {
    let url: URL;

    try {
        if (typeof value !== 'string' || !value || value.length > 8192 || value.trim() !== value || /[\u0000-\u0020\u007f]/.test(value)) {
            throw new Error('invalid_url');
        }

        url = new URL(value);

        if (url.href.length > 8192) {
            throw new Error('invalid_url');
        }
    } catch {
        throw aiError('INVALID_ARGUMENT', '图片地址无效或过长');
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
        throw aiError('INVALID_ARGUMENT', '图片需使用可公开访问的 HTTPS 地址');
    }

    return url.href;
}

// QQ 使用已配置的参数边界；Service 传入 null，由调用方逐次指定参数。
export function prepare(config: Config, generation: GenerationConfig | null, messages: AIMessage[], overrides: Partial<ChatOptions> = {}): Prepared {
    const input = prepareInput(generation, messages, overrides);

    return prepareConnection(configuredProvider(config), input);
}

// 与连接无关的内容和生成参数先校验，Service 无效输入不读取设置。
export function prepareInput(generation: GenerationConfig | null, messages: AIMessage[], overrides: Partial<ChatOptions> = {}) {
    for (const key of ['maxOutputTokens', 'timeoutMs', 'temperature'] as const) {
        if (overrides[key] !== undefined && (typeof overrides[key] !== 'number' || !Number.isFinite(overrides[key]))) {
            throw aiError('INVALID_ARGUMENT', '生成参数必须为有限数值');
        }
    }

    const maxOutputTokens = overrides.maxOutputTokens ?? generation?.maxOutputTokens ?? 1024;
    const timeoutMs = overrides.timeoutMs ?? generation?.timeoutMs ?? 20000;

    // setTimeout 使用有符号 32 位毫秒延时，超出范围可能立即触发。
    if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
        throw aiError('INVALID_ARGUMENT', 'Token 或超时参数超出允许范围');
    }

    const temperature = overrides.temperature ?? (generation?.sendTemperature ? generation.temperature : null);

    if (generation) {
        requireInteger(generation.maxOutputTokens);
        requireInteger(generation.timeoutMs);

        if (maxOutputTokens > generation.maxOutputTokens || timeoutMs > generation.timeoutMs) {
            throw aiError('INVALID_ARGUMENT', 'Token 或超时参数超出允许范围');
        }

        if (temperature !== null && (!Number.isFinite(generation.temperatureMin) || !Number.isFinite(generation.temperatureMax)
            || generation.temperatureMin > generation.temperatureMax)) {
            throw aiError('INVALID_CONFIG', '温度范围配置无效');
        }

        if (temperature !== null && (!Number.isFinite(temperature)
            || temperature < generation.temperatureMin || temperature > generation.temperatureMax)) {
            throw aiError('INVALID_ARGUMENT', '温度超出允许范围');
        }
    }

    if (!messages.length || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
        throw aiError('INVALID_ARGUMENT', '消息内容无效');
    }

    const responseFormat = overrides.responseFormat ?? 'text';

    if (overrides.responseFormat === null || !['text', 'json_object'].includes(responseFormat)) {
        throw aiError('INVALID_ARGUMENT', '输出格式无效');
    }

    if (responseFormat === 'json_object' && !messages.some(m => m.role !== 'assistant' && /json/i.test(m.content))) {
        throw aiError('INVALID_ARGUMENT', 'JSON 输出需在提示词中说明 JSON 格式并提供示例');
    }

    let imageCount = 0;
    const content = messages.map(message => {
        if (message.imageUrl === undefined) {
            return { role: message.role, content: message.content };
        }

        if (message.role !== 'user' || ++imageCount > 1) {
            throw aiError('INVALID_ARGUMENT', '每次最多一张图片，且仅限用户消息');
        }

        return {
            role: message.role, content: [{ type: 'text', text: message.content },
            { type: 'image_url', image_url: { url: imageUrl(message.imageUrl) } }]
        };
    });

    return { content, maxOutputTokens, temperature, timeoutMs, responseFormat };
}

export function prepareConnection(provider: ReturnType<typeof configuredProvider>, input: ReturnType<typeof prepareInput>): Prepared {
    const { content, maxOutputTokens, temperature, timeoutMs, responseFormat } = input;
    // 大小检查与发送共用本次编码，原生 fetch 直接接收这份请求字节。
    const body = new TextEncoder().encode(JSON.stringify({
        model: provider.model, messages: content, stream: false,
        [provider.maxTokenParameter]: maxOutputTokens, ...(temperature === null ? {} : { temperature }),
        ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {})
    }));

    if (body.byteLength > MAX_REQUEST_BYTES) {
        throw aiError('INVALID_ARGUMENT', '请求内容太长');
    }

    return {
        endpoint: provider.endpoint, key: provider.apiKey, provider: provider.provider,
        model: provider.model, body, timeoutMs, responseFormat
    };
}

function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function token(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// 成功正文与错误诊断共用大小和超时边界，不信任 Content-Length。
async function readResponse(response: Response, signal: AbortSignal): Promise<string> {
    if (!response.body) {
        throw aiError('INVALID_RESPONSE', '模型响应为空', false);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const onAbort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
        for (; ;) {
            signal.throwIfAborted();
            const chunk = await reader.read();
            signal.throwIfAborted();

            if (chunk.done) {
                break;
            }

            size += chunk.value.byteLength;

            if (size > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw aiError('INVALID_RESPONSE', '模型响应超出大小限制', false);
            }

            chunks.push(chunk.value);
        }
    } finally {
        signal.removeEventListener('abort', onAbort);
        reader.releaseLock();
    }

    if (chunks.length === 1) {
        return new TextDecoder().decode(chunks[0]);
    }

    const data = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return new TextDecoder().decode(data);
}

export async function generate(prepared: Prepared, fetcher: typeof fetch = fetch,
    onUsage?: (value: Pick<AIResponse, 'usage'>) => void): Promise<AIResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), prepared.timeoutMs);
    let attempted = false;

    try {
        attempted = true;
        // 当前 workerd 不接受 redirect: 'error'；manual 返回 3xx，由后续状态检查拒绝。
        const response = await fetcher(prepared.endpoint, {
            method: 'POST', redirect: 'manual',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${prepared.key}` },
            body: prepared.body, signal: controller.signal
        });

        if (!response.ok) {
            const status = response.status;
            let imageDownloadFailed = false;

            if (status === 400 || status === 422) {
                try {
                    const json = record(JSON.parse(await readResponse(response, controller.signal)));
                    const detail = record(json.error).message;
                    imageDownloadFailed = typeof detail === 'string' && /\bfailed to download image\b/i.test(detail);
                } catch {
                    // 诊断缺失、过大或读取失败时仍保留已收到的 HTTP 拒绝，不暴露上游正文。
                }
            } else {
                await response.body?.cancel().catch(() => undefined);
            }

            const message = status >= 300 && status < 400 ? 'API 地址发生重定向，请填写最终接口地址'
                : imageDownloadFailed ? '模型服务无法下载图片，请检查图片链接是否可访问'
                    : status === 400 || status === 422 ? '模型服务拒绝请求，请检查模型和请求内容'
                        : status === 401 ? 'API 鉴权失败，请检查密钥'
                            : status === 403 ? 'API 拒绝访问，请检查账户或模型权限'
                                : status === 404 ? 'API 地址或模型不存在，请检查配置'
                                    : status === 429 ? 'API 限流或额度不足，请检查服务商账户'
                                        : status >= 500 ? '模型服务暂不可用，请稍后手动重试' : '模型服务拒绝请求';
            throw aiError('HTTP_ERROR', `${message}（HTTP ${status}）`, false, { httpStatus: status });
        }

        const body = await readResponse(response, controller.signal);

        let json: Record<string, unknown>;

        try {
            json = record(JSON.parse(body));
        } catch {
            throw aiError('INVALID_RESPONSE', '模型响应格式无效', false);
        }

        const choice = record(Array.isArray(json.choices) ? json.choices[0] : undefined);
        const text = record(choice.message).content;

        const u = record(json.usage);
        const usage: Usage = {
            inputTokens: token(u.prompt_tokens), outputTokens: token(u.completion_tokens), totalTokens: token(u.total_tokens),
            cachedInputTokens: token(record(u.prompt_tokens_details).cached_tokens ?? u.prompt_cache_hit_tokens),
            reasoningTokens: token(record(u.completion_tokens_details).reasoning_tokens ?? u.reasoning_tokens)
        };

        if (usage.inputTokens !== null && usage.cachedInputTokens !== null && usage.cachedInputTokens > usage.inputTokens) {
            usage.cachedInputTokens = null;
        }

        const metering = { usage };
        onUsage?.(metering);

        if (typeof text !== 'string' || !text.trim()) {
            throw aiError('INVALID_RESPONSE', choice.finish_reason === 'length'
                ? '接口已响应，但输出预算耗尽，尚未生成正文' : '接口已响应，但模型未返回文字回答', false,
                { ...metering, finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null });
        }

        if (prepared.responseFormat === 'json_object') {
            let value: unknown;

            try {
                value = JSON.parse(text);
            } catch {
                // 仅返回固定错误，不泄露模型输出或解析器截取的内容。
            }

            if (choice.finish_reason === 'length' || value === null || typeof value !== 'object' || Array.isArray(value)) {
                throw aiError('INVALID_RESPONSE', choice.finish_reason === 'length'
                    ? 'JSON 回答被截断，请调整输出上限' : '模型未返回有效的 JSON 对象', false,
                    { ...metering, finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null });
            }
        }

        return {
            text, provider: prepared.provider, model: prepared.model,
            finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
            ...metering
        };
    } catch (error) {
        if (isAIError(error)) {
            throw error;
        }

        if (controller.signal.aborted) {
            throw aiError('TIMEOUT', '模型请求超时，结果未知', !attempted);
        }

        throw aiError('NETWORK_ERROR', '模型网络请求失败，结果未知', !attempted);
    } finally {
        clearTimeout(timer);
    }
}
