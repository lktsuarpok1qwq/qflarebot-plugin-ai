import type { PluginDB } from '@qqbot/sdk';
import type { Lease } from '../chat/session.js';
import type { Prepared } from '../model/client.js';
import { aiError } from '../types.js';
import type { Source, Usage, ModelStatus, ErrorCode } from '../types.js';

export interface Call {
    id: string;
    owner: string;
    source: Source;
    sourceLabel: string | null;
    until: number;
    createdAt?: number;
    lease?: Lease;
    result?: { status: ModelStatus; usage: Usage | null; duration: number | null; error: ErrorCode | null };
}

export async function admit(db: PluginDB, call: Call, prepared: Prepared, now: number, createdAt: number): Promise<boolean> {
    if (!call.lease) { return false; }

    try {
        const result = await db.run(`INSERT INTO {usage_detail}
            (request_id,created_at_ms,source,model,delivery_status,valid_until_ms)
            SELECT ?,?,'chat',?,'pending',? WHERE ?>?
            AND EXISTS(SELECT 1 FROM {conversations} WHERE conversation_id=? AND lock_owner=? AND lock_until_ms>?)
            ON CONFLICT(request_id) DO NOTHING`,
            call.id, createdAt, prepared.model, call.until, call.until, now,
            call.lease.id, call.owner, now);

        return result.changes === 1;
    } catch {
        throw aiError('STORAGE_UNAVAILABLE', '调用登记失败，未发起模型请求');
    }
}
