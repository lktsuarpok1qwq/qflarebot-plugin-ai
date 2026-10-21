import type { PluginContext } from '@qqbot/sdk';
import type { Config } from '../config/schema.js';
import { requireInteger } from '../config/schema.js';
import { DAY, ensureSchema, statisticsStart } from './database.js';

export const CLEANUP_ROWS = 200;

export async function maintain(ctx: PluginContext<Config>, now = Date.now()): Promise<void> {
    await ensureSchema(ctx.db);
    requireInteger(ctx.config.qq.inactivityDays);
    const cutoff = statisticsStart(now);
    await ctx.db.batch([
        {
            sql: `DELETE FROM {conversations} WHERE conversation_id IN (
            SELECT conversation_id FROM {conversations}
                WHERE lock_until_ms<=? AND (last_success_at_ms IS NULL OR messages_json='[]' OR last_success_at_ms<=?)
                ORDER BY conversation_id LIMIT 80) AND lock_until_ms<=?`,
            params: [now, now - ctx.config.qq.inactivityDays * DAY, now]
        },
        {
            sql: `DELETE FROM {usage_detail} WHERE request_id IN (
            SELECT request_id FROM {usage_detail}
                WHERE created_at_ms<? AND valid_until_ms<=? ORDER BY created_at_ms,request_id LIMIT ${CLEANUP_ROWS})`, params: [cutoff, now]
        },
        {
            sql: `DELETE FROM {service_usage} WHERE (created_at_ms,request_id) IN (
            SELECT created_at_ms,request_id FROM {service_usage}
                WHERE created_at_ms<? AND valid_until_ms<=? ORDER BY created_at_ms,request_id LIMIT ${CLEANUP_ROWS})`, params: [cutoff, now]
        }
    ]);
}
