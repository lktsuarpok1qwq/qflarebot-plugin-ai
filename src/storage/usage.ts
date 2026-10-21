import type { PluginContext, PluginDB } from '@qqbot/sdk';
import type { Config } from '../config/schema.js';
import type { Prepared } from '../model/client.js';
import type { Call } from './requests.js';
import { aiError } from '../types.js';
import type { DeliveryStatus } from '../types.js';

export async function bestEffort(ctx: PluginContext<Config>, action: () => Promise<unknown>): Promise<boolean> {
    try {
        await action();

        return true;
    } catch {
        ctx.logger.warn('AI 状态保存失败');

        return false;
    }
}

export async function finish(ctx: PluginContext<Config>, call: Call, status: DeliveryStatus,
    error: string | null = null): Promise<void> {
    const result = call.result;
    const u = result?.usage;
    // Service 用登记时刻和请求键定位主键，避免额外索引与全表查找。
    const service = call.source !== 'chat';

    if (service && call.createdAt === undefined) { throw aiError('STORAGE_UNAVAILABLE', '调用登记时刻缺失'); }

    await ctx.db.run(`UPDATE ${service ? '{service_usage}' : '{usage_detail}'} SET model_status=?,model_error=?,model_duration_ms=?,
        input_tokens=?,output_tokens=?,total_tokens=?,cached_input_tokens=?,reasoning_tokens=?,
        delivery_status=?,delivery_error=?,completed_at_ms=?
        WHERE ${service ? 'created_at_ms=? AND ' : ''}request_id=? AND completed_at_ms IS NULL`,
        result?.status ?? 'unknown', result?.error ?? null, result?.duration ?? null,
        u?.inputTokens ?? null, u?.outputTokens ?? null, u?.totalTokens ?? null,
        u?.cachedInputTokens ?? null, u?.reasoningTokens ?? null, status, error, Date.now(), ...(service ? [call.createdAt!] : []), call.id);
}

export async function startUsage(db: PluginDB, call: Call, prepared: Prepared, now: number): Promise<boolean> {
    let result;
    call.createdAt = now;

    try {
        result = await db.run(`INSERT INTO {service_usage}(request_id,created_at_ms,source,source_label,
        model,delivery_status,valid_until_ms) VALUES(?,?,?,?,?,'not_applicable',?)`,
            call.id, now, call.source, call.sourceLabel, prepared.model, call.until);
    } catch {
        throw aiError('STORAGE_UNAVAILABLE', '调用登记失败，未发起模型请求');
    }

    return result.changes === 1;
}
