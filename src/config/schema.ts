import type { JsonSchema } from '@qqbot/sdk';
import { aiError } from '../types.js';
import type { ProviderName } from '../types.js';

export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokenParameter: 'max_tokens' | 'max_completion_tokens';
}

export const MODEL_MAX_LENGTH = 512;
export const MAX_SETTINGS_BYTES = 131072;

// 模型名原样传给接口，禁止原生单行控件会丢弃或无法清楚显示的控制字符。
export function validModel(value: string): boolean {
    return (!value || Boolean(value.trim())) && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}

export const INCOMPLETE = '\n（回答可能不完整）';

// 为截断提示和一个完整的 Unicode 码点预留空间。
export const MIN_REPLY_BYTES = new TextEncoder().encode(INCOMPLETE).byteLength + 4;

export interface GenerationConfig {
    systemPrompt: string;
    sendTemperature: boolean;
    temperature: number;
    temperatureMin: number;
    temperatureMax: number;
    maxOutputTokens: number;
    timeoutMs: number;
}

export interface QQConfig extends GenerationConfig {
    visionEnabled: boolean;
    multiTurnEnabled: boolean;
    historyMaxTurns: number;
    historyMaxChars: number;
    inactivityDays: number;
    maxQuestionChars: number;
    maxQuotedChars: number;
    maxCombinedInputChars: number;
    maxSegmentUtf8Bytes: number;
    maxReplySegments: number;
    outputHardLimit: number;
}

export interface Config {
    connection: ProviderConfig;
    qq: QQConfig;
}

// 页面与保存接口共用温度关系校验，字段边界仍由 Schema 检查。
export function temperatureIssue(qq: Pick<GenerationConfig, 'temperature' | 'temperatureMin' | 'temperatureMax'>) {
    if (qq.temperatureMin > qq.temperatureMax || qq.temperature < qq.temperatureMin || qq.temperature > qq.temperatureMax) {
        return {
            field: qq.temperatureMin > qq.temperatureMax ? 'qq.temperatureMin' : 'qq.temperature',
            message: '随机性必须在最低和最高温度之间'
        };
    }

    return null;
}

const generation: GenerationConfig = {
    systemPrompt: '请简洁回答', sendTemperature: false, temperature: 0.7, temperatureMin: 0,
    temperatureMax: 2, maxOutputTokens: 1024, timeoutMs: 20000
};

export const defaultConfig: Config = {
    connection: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: '', maxTokenParameter: 'max_tokens' },
    qq: {
        ...generation, visionEnabled: false,
        multiTurnEnabled: true, historyMaxTurns: 10, historyMaxChars: 12000, inactivityDays: 7,
        maxQuestionChars: 1000, maxQuotedChars: 1000, maxCombinedInputChars: 2000,
        maxSegmentUtf8Bytes: 1500, maxReplySegments: 2, outputHardLimit: 3000
    }
};

const text = (title: string): JsonSchema => ({ type: 'string', title });
const integer = (title: string, minimum = 1): JsonSchema => ({ type: 'integer', title, minimum });
const object = (title: string, properties: Record<string, JsonSchema>): JsonSchema => ({ type: 'object', title, properties });

const providerSchema = (title: string) => object(title, {
    baseUrl: { ...text('API 地址'), maxLength: 2048 }, apiKey: { ...text('API Key'), writeOnly: true, maxLength: 4096 },
    model: { ...text('模型'), maxLength: MODEL_MAX_LENGTH },
    maxTokenParameter: {
        type: 'string', title: '输出 Token 参数名称',
        description: '默认 max_tokens；仅在接口要求时更改。',
        oneOf: [{ const: 'max_tokens', title: 'max_tokens（DeepSeek 等）' },
        { const: 'max_completion_tokens', title: 'max_completion_tokens（部分兼容模型）' }]
    }
});

const generationSchema = (title: string) => object(title, {
    systemPrompt: { ...text('回答要求（提示词）'), format: 'textarea', maxLength: 16384 },
    sendTemperature: { type: 'boolean', title: '自定义回答随机性' },
    temperature: { type: 'number', title: '随机性（温度）' },
    temperatureMin: { type: 'number', title: '最低温度' },
    temperatureMax: { type: 'number', title: '最高温度' },
    maxOutputTokens: integer('输出 Token 上限'), timeoutMs: {
        ...integer('模型等待上限（毫秒）'), maximum: 2147483647,
        description: 'QQ 对话等待模型的时间最多约 18 秒，实际可能更短。'
    }
});

export const configSchema: JsonSchema = object('AI', {
    connection: {
        ...providerSchema('API 连接（兼容 OpenAI / DeepSeek）'),
        description: '支持 OpenAI、DeepSeek 等兼容接口。'
    },
    qq: object('QQ 对话', {
        ...(generationSchema('QQ 对话').properties as Record<string, JsonSchema>),
        visionEnabled: {
            type: 'boolean', title: '识别图片',
            description: '每次一张，可随问题附图或引用图片。需支持看图的模型，如 DeepSeek Flash；图片不保留。'
        },
        multiTurnEnabled: { type: 'boolean', title: '记住聊天上下文' }, historyMaxTurns: { ...integer('最多保留问答轮数') },
        historyMaxChars: { ...integer('聊天记录总字数上限') }, inactivityDays: integer('无新记录时保留天数'),
        maxQuestionChars: integer('问题字符上限'), maxQuotedChars: integer('引用字符上限'),
        maxCombinedInputChars: integer('问题与引用合计字符上限'),
        maxSegmentUtf8Bytes: integer('每条回复大小（UTF-8 字节）', MIN_REPLY_BYTES), maxReplySegments: integer('每次最多回复条数'),
        outputHardLimit: integer('每次回复总大小（UTF-8 字节）', MIN_REPLY_BYTES),
    })
});

export function requireInteger(value: number, minimum = 1): void {
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw aiError('INVALID_CONFIG', '数值配置无效');
    }
}

export function configuredProvider(config: Config): ProviderConfig & { provider: ProviderName; endpoint: string } {
    const selected = config.connection;
    let url: URL;

    try {
        url = new URL(selected.baseUrl);
    } catch {
        throw aiError('INVALID_CONFIG', 'API 地址无效');
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || !selected.apiKey.trim() || !selected.model || !validModel(selected.model) || selected.model.length > MODEL_MAX_LENGTH
        || !['max_tokens', 'max_completion_tokens'].includes(selected.maxTokenParameter)) {
        throw aiError('INVALID_CONFIG', '请检查 API 地址、密钥、模型和 Token 参数');
    }

    try {
        new Headers({ authorization: `Bearer ${selected.apiKey}` });
    } catch {
        throw aiError('INVALID_CONFIG', 'API Key 格式无效，请检查换行或非法字符');
    }

    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';

    return { ...selected, provider: 'openai_compatible', endpoint: url.href };
}

// 两个配置分组均为基本类型字段，分别复制以固定本次 QQ 请求的设置。
export function snapshot(config: Config): Config {
    return { connection: { ...config.connection }, qq: { ...config.qq } };
}
