import type { JsonSchema, PluginContext, PluginDB } from '@qqbot/sdk';
import { configSchema, configuredProvider, defaultConfig, temperatureIssue, validModel } from './schema.js';
import type { Config } from './schema.js';
import { aiError } from '../types.js';
import { settingsRow } from '../storage/database.js';

export interface SavedSettings { config: Config; revision: string | null }
const validRevision = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

// 设置由插件统一保存，不回退读取宿主配置。
export function readSavedSettings(db: PluginDB): Promise<SavedSettings>;

export function readSavedSettings(db: PluginDB, initialize: false): Promise<SavedSettings | undefined>;

export async function readSavedSettings(db: PluginDB, initialize = true): Promise<SavedSettings | undefined> {
    try {
        const stored = await settingsRow(db, initialize);

        if (stored === undefined) { return undefined; }

        if (stored !== null && !validRevision(stored.revision)) { throw new Error('invalid_revision'); }

        return {
            config: validateSettings(stored === null ? structuredClone(defaultConfig) : JSON.parse(stored.config_json)),
            revision: stored?.revision ?? null
        };
    } catch {
        throw aiError('STORAGE_UNAVAILABLE', '设置读取失败，请稍后重试');
    }
}

export async function readSettings(db: PluginDB): Promise<Config> {
    return (await readSavedSettings(db)).config;
}

export async function settingsContext(ctx: PluginContext<Config>): Promise<PluginContext<Config>> {
    return { ...ctx, config: await readSettings(ctx.db) };
}

export function publicSettings({ config, revision }: SavedSettings) {
    const { apiKey, ...connection } = config.connection;

    return { config: { ...config, connection }, hasApiKey: Boolean(apiKey), revision };
}

function settingError(message: string, field: string) {
    return Object.assign(aiError('INVALID_ARGUMENT', message), { field });
}

function validate(value: unknown, schema: JsonSchema, prefix = '', key = ''): unknown {
    const fail = () => { throw settingError(`${schema.title ?? '设置'}无效`, prefix ? prefix + '.' + key : key); };

    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) { return fail(); }

        const input = value as Record<string, unknown>;
        const properties = schema.properties as Record<string, JsonSchema>;

        if (Object.keys(input).some(key => !Object.hasOwn(properties, key))) { return fail(); }

        const parent = key ? prefix ? prefix + '.' + key : key : prefix;

        return Object.fromEntries(Object.entries(properties).map(([key, field]) => [key, validate(input[key], field, parent, key)]));
    }

    if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') { return fail(); }
    } else if (schema.type === 'string') {
        if (typeof value !== 'string' || (typeof schema.maxLength === 'number' && value.length > schema.maxLength)) { return fail(); }

        if (Array.isArray(schema.oneOf) && !schema.oneOf.some(choice => choice.const === value)) { return fail(); }
    } else {
        if (typeof value !== 'number' || !Number.isFinite(value)
            || (schema.type === 'integer' && !Number.isSafeInteger(value))
            || (typeof schema.minimum === 'number' && value < schema.minimum)
            || (typeof schema.maximum === 'number' && value > schema.maximum)) { return fail(); }
    }

    return value;
}

export function validateSettings(value: unknown): Config {
    const config = validate(value, configSchema) as Config;

    // 允许在配置插件时保存尚未填完整的连接。
    try {
        configuredProvider({
            ...config, connection: {
                ...config.connection,
                apiKey: config.connection.apiKey || 'unset', model: config.connection.model || 'unset'
            }
        });
    } catch {
        let field = config.connection.apiKey && !config.connection.apiKey.trim() ? 'connection.apiKey'
            : !validModel(config.connection.model) ? 'connection.model' : 'connection.baseUrl';

        try { new Headers({ authorization: 'Bearer ' + config.connection.apiKey }); }
        catch { field = 'connection.apiKey'; }

        throw settingError('请检查 API 地址、密钥和模型', field);
    }

    const issue = temperatureIssue(config.qq);

    if (issue) { throw settingError(issue.message, issue.field); }

    return config;
}

export async function saveSettings(db: PluginDB, data: Record<string, unknown>): Promise<SavedSettings | null> {
    if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config)
        || (data.revision !== null && !validRevision(data.revision))
        || Object.keys(data).some(key => !['config', 'revision'].includes(key))) {
        throw aiError('INVALID_ARGUMENT', '设置内容无效');
    }

    const input = data.config as Record<string, unknown>;
    const connection = input.connection;

    if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
        throw aiError('INVALID_ARGUMENT', 'API 连接无效');
    }

    const fields = connection as Record<string, unknown>;

    if (fields.apiKey !== undefined && typeof fields.apiKey !== 'string') {
        throw aiError('INVALID_ARGUMENT', 'API Key 无效');
    }

    const config = validateSettings({
        ...input, connection: {
            ...fields,
            apiKey: fields.apiKey || ''
        }
    });
    const current = await readSavedSettings(db);

    if (current.revision !== data.revision) { return null; }

    if (!config.connection.apiKey) { config.connection.apiKey = current.config.connection.apiKey; }

    // 已有设置无变化时沿用读取快照；首次保存仍需创建非空版本。
    if (current.revision !== null && JSON.stringify(config) === JSON.stringify(current.config)) { return current; }

    const revision = crypto.randomUUID();
    const encoded = JSON.stringify(config);
    // 版本与所有字段（包括密钥）通过一次条件写入共同更新。
    const statement = {
        sql: `UPDATE {settings} SET config_json=CASE WHEN ? OR revision IS NULL THEN ? ELSE
        json_set(?,'$.connection.apiKey',json_extract(config_json,'$.connection.apiKey')) END,revision=?
        WHERE id=1 AND revision IS ?`,
        params: [fields.apiKey ? 1 : 0, encoded, encoded, revision, data.revision]
    };
    const stored = await db.first<{ config_json: string; revision: string }>(
        statement.sql + ' RETURNING config_json,revision', ...statement.params);

    if (!stored) { return null; }

    return { config: validateSettings(JSON.parse(stored.config_json)), revision: stored.revision };
}
