import type { PluginDB } from '@qqbot/sdk';
import type { Config } from '../config/schema.js';
import { DAY } from '../storage/database.js';
import { chars } from '../model/client.js';
import { trimHistory } from './output.js';
import type { History } from './output.js';
import type { Round } from '../types.js';

export interface Lease { id: string; owner: string; epoch: number; until: number; history: string }

export async function acquire(db: PluginDB, botId: string, scene: string, scopeId: string,
    owner: string, now: number, until: number, config: Config, requestId: string): Promise<Lease | null> {
    const id = JSON.stringify([botId, scene, scopeId]);
    const row = await db.first<{ epoch: number; messages_json?: string }>(
        `INSERT INTO {conversations}(conversation_id,bot_id,scene,scope_id,lock_owner,lock_until_ms)
            SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM {usage_detail} WHERE request_id=?)
            ON CONFLICT(conversation_id) DO UPDATE SET
            lock_owner=excluded.lock_owner,lock_until_ms=excluded.lock_until_ms
            WHERE {conversations}.lock_until_ms<=? RETURNING epoch${config.qq.multiTurnEnabled
            ? ",CASE WHEN last_success_at_ms>? THEN messages_json ELSE '[]' END AS messages_json" : ''}`, id, botId, scene, scopeId, owner, until, requestId, now,
        ...(config.qq.multiTurnEnabled ? [now - config.qq.inactivityDays * DAY] : []));

    return row ? {
        id, owner, epoch: row.epoch, until,
        history: row.messages_json ?? '[]'
    } : null;
}

export async function saveHistory(db: PluginDB, lease: Lease, previous: History, round: Round,
    config: Config, now: number): Promise<boolean> {
    if (!config.qq.multiTurnEnabled || now >= lease.until) {
        return false;
    }

    const length = chars(round.user) + chars(round.assistant);
    const fits = length <= config.qq.historyMaxChars;
    const history = fits ? trimHistory({
        rounds: [...previous.rounds, round], lengths: [...previous.lengths, length], chars: previous.chars + length
    }, config) : previous;
    // 清空后的历史保持现值，仍在同一次写入中释放自己的有效锁。
    const result = await db.run(`UPDATE {conversations} SET messages_json=CASE WHEN epoch=? THEN ? ELSE messages_json END,
        last_success_at_ms=CASE WHEN epoch=? AND ?=1 THEN ? ELSE last_success_at_ms END,
        lock_owner=NULL,lock_until_ms=0 WHERE conversation_id=? AND lock_owner=? AND lock_until_ms>?`,
        lease.epoch, JSON.stringify(history.rounds), lease.epoch, fits ? 1 : 0, now, lease.id, lease.owner, now);

    return result.changes === 1;
}

export async function release(db: PluginDB, lease: Lease, now = Date.now()): Promise<void> {
    // 过期租约已可重新取得，无需写入解锁。
    if (now >= lease.until) { return; }

    await db.run('UPDATE {conversations} SET lock_owner=NULL,lock_until_ms=0 WHERE conversation_id=? AND lock_owner=?',
        lease.id, lease.owner);
}

export async function clearHistory(db: PluginDB, id: string): Promise<void> {
    await db.run(`UPDATE {conversations} SET messages_json='[]',last_success_at_ms=NULL,epoch=epoch+1
        WHERE conversation_id=? AND (messages_json<>'[]' OR last_success_at_ms IS NOT NULL OR lock_until_ms>?)`,
        id, Date.now());
}
