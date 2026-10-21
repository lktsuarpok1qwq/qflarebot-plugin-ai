export type ProviderName = 'openai_compatible';

export type AIMessage = { role: 'user'; content: string; imageUrl?: string }
    | { role: 'system' | 'assistant'; content: string; imageUrl?: never };

export interface Usage {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
}

export interface AIResponse {
    text: string;
    provider: ProviderName;
    model: string;
    finishReason: string | null;
    usage: Usage;
}

export interface GenerateOptions {
    prompt: string;
    imageUrl?: string;
    responseFormat?: 'text' | 'json_object';
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    requestMaxChars?: number;
    /** 调用方填写稳定的服务名称，用于 Service 记录；不是身份认证。 */
    sourceLabel?: string;
}

export interface ChatOptions extends Omit<GenerateOptions, 'prompt' | 'imageUrl'> { messages: AIMessage[] }

export interface AIService {
    generate(options: GenerateOptions): Promise<AIResponse>;
    chat(options: ChatOptions): Promise<AIResponse>;
}

export type ErrorCode = 'INVALID_ARGUMENT' | 'INVALID_CONFIG' | 'STORAGE_UNAVAILABLE'
    | 'BUDGET_EXHAUSTED' | 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'INTERNAL_ERROR';
export type ErrorDetails = Partial<Pick<AIResponse, 'finishReason' | 'usage'>> & { httpStatus?: number };
export type AIError = Error & { code: ErrorCode; requestNotSent: boolean } & ErrorDetails;

const knownErrors = new WeakSet<Error>();

export function isAIError(error: unknown): error is AIError {
    return error instanceof Error && knownErrors.has(error);
}

export function aiError(code: ErrorCode, message: string, requestNotSent = true, details: ErrorDetails = {}): AIError {
    const error = Object.assign(new Error(message), { code, requestNotSent, ...details });
    knownErrors.add(error);

    return error;
}

export function safeError(error: unknown, requestNotSent = false): AIError {
    if (isAIError(error)) {
        return error as AIError;
    }

    return aiError('INTERNAL_ERROR', '服务暂不可用', requestNotSent);
}

export type ModelStatus = 'unknown' | 'success' | 'failed' | 'not_sent';
export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'partial' | 'unknown' | 'not_sent' | 'not_applicable';
export type Source = 'chat' | 'service' | 'admin_test';
export interface Round { user: string; assistant: string }
