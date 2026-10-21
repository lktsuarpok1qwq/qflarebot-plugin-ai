import type { PluginDB } from '@qqbot/sdk';
import { aiError } from '../types.js';

export const DAY = 86400000;
export const beijingDay = (now: number): string => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const SCHEMA_VERSION = 14;
export const statisticsStart = (now: number): number => Math.floor((now + 8 * 3600000) / DAY) * DAY - 8 * 3600000 - 89 * DAY;

interface SettingsRow { version: number; config_json: string | null; revision: string | null }
const pending = new WeakMap<PluginDB, Promise<SettingsRow | undefined>>();
const ddl = [
    `CREATE TABLE IF NOT EXISTS {settings} (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, config_json TEXT, revision TEXT,
        CHECK((config_json IS NULL AND revision IS NULL) OR (config_json IS NOT NULL AND revision IS NOT NULL)))`,
    `CREATE TABLE IF NOT EXISTS {conversations} (
        conversation_id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, scene TEXT NOT NULL, scope_id TEXT NOT NULL,
        messages_json TEXT NOT NULL DEFAULT '[]', last_success_at_ms INTEGER,
        epoch INTEGER NOT NULL DEFAULT 0, lock_owner TEXT, lock_until_ms INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID`,
    `CREATE TABLE IF NOT EXISTS {usage_detail} (
        request_id TEXT PRIMARY KEY, created_at_ms INTEGER NOT NULL,
        source TEXT NOT NULL, source_label TEXT, model TEXT NOT NULL DEFAULT '',
        model_status TEXT NOT NULL DEFAULT 'unknown', delivery_status TEXT NOT NULL,
        model_error TEXT, delivery_error TEXT, model_duration_ms INTEGER,
        input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, cached_input_tokens INTEGER,
        reasoning_tokens INTEGER, valid_until_ms INTEGER NOT NULL,
        completed_at_ms INTEGER) WITHOUT ROWID`,
    `CREATE TABLE IF NOT EXISTS {service_usage} (
        request_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
        source TEXT NOT NULL, source_label TEXT, model TEXT NOT NULL DEFAULT '',
        model_status TEXT NOT NULL DEFAULT 'unknown', delivery_status TEXT NOT NULL,
        model_error TEXT, delivery_error TEXT, model_duration_ms INTEGER,
        input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, cached_input_tokens INTEGER,
        reasoning_tokens INTEGER, valid_until_ms INTEGER NOT NULL,
        completed_at_ms INTEGER, PRIMARY KEY(created_at_ms,request_id)) WITHOUT ROWID`,
    `CREATE INDEX IF NOT EXISTS {usage_time} ON {usage_detail}(created_at_ms, request_id)`
];

function missingSettings(db: PluginDB, error: unknown): boolean {
    const missing = error instanceof Error
        ? /^(?:D1_ERROR: )?no such table: ([A-Za-z0-9_]+)(?:: SQLITE_ERROR)?$/.exec(error.message) : null;

    return missing?.[1] === db.table('settings');
}

function checkSettingsRow(row: SettingsRow | null | undefined): asserts row is SettingsRow {
    if (row?.version !== SCHEMA_VERSION || (row.config_json === null) !== (row.revision === null)) {
        throw aiError('STORAGE_UNAVAILABLE', '数据库结构或设置不完整');
    }
}

const readRow = (db: PluginDB) => db.first<SettingsRow>('SELECT version,config_json,revision FROM {settings} WHERE id=1');

// 缺表已由本次读取确认时不再探测；就绪缓存不保留设置快照。
function schemaReady(db: PluginDB, missing = false): Promise<SettingsRow | undefined> {
    let ready = pending.get(db);

    if (!ready) {
        ready = (async () => {
            if (!missing) {
                const current = await db.first<{ version: number }>('SELECT version FROM {settings} WHERE id=1')
                    .catch(error => {
                        if (!missingSettings(db, error)) { throw error; }

                        return undefined;
                    });

                if (current !== undefined) {
                    if (current?.version !== SCHEMA_VERSION) {
                        throw aiError('STORAGE_UNAVAILABLE', '数据库结构不匹配');
                    }

                    return undefined;
                }
            }

            let row: SettingsRow | undefined | null;

            try {
                const results = await db.batch<SettingsRow>([
                    ...ddl.map(sql => ({ sql })),
                    {
                        sql: 'INSERT INTO {settings}(id,version) VALUES(1,?) ON CONFLICT(id) DO NOTHING RETURNING version,config_json,revision',
                        params: [SCHEMA_VERSION]
                    }
                ]);
                row = results.at(-1)?.results[0];
            } catch {
                // 提交回执未知时只读核对，不重放初始化写入。
            }

            // 并发插入零行或回执丢失时，仍以实际存储为准。
            row ??= await readRow(db);
            checkSettingsRow(row);

            return row;
        })().then(row => {
            pending.set(db, Promise.resolve(undefined));

            return row;
        }, () => {
            pending.delete(db);
            throw aiError('STORAGE_UNAVAILABLE', '数据库初始化失败');
        });
        pending.set(db, ready);
    }

    return ready;
}

export async function ensureSchema(db: PluginDB): Promise<void> {
    await schemaReady(db);
}

// 用一条语句读取当前配置与表结构版本，不跨请求缓存。
export async function settingsRow(db: PluginDB, initialize = true) {
    let row;

    try {
        row = await readRow(db);
    } catch (error) {
        if (!missingSettings(db, error)) { throw error; }

        if (!initialize) { return undefined; }

        row = await schemaReady(db, true) ?? await readRow(db);
    }

    checkSettingsRow(row);
    pending.set(db, Promise.resolve(undefined));

    return row.config_json === null ? null : { config_json: row.config_json, revision: row.revision! };
}
