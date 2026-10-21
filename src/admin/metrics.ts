// 全部报表聚合共用同一次明细快照。
export const dimensions = ['model', 'source', 'model_error', 'delivery_error'] as const;
const expressions: Record<string, string> = { calls: '1', unfinished: 'completed_at_ms IS NULL AND valid_until_ms>snapshot_at_ms' };

for (const status of ['success', 'failed', 'unknown', 'not_sent']) {
    expressions['model_' + status] = `model_status='${status}'`;
}

for (const status of ['success', 'failed', 'partial', 'unknown', 'not_sent', 'pending', 'not_applicable']) {
    expressions['delivery_' + status] = `(CASE WHEN completed_at_ms IS NULL AND valid_until_ms<=snapshot_at_ms AND delivery_status='pending' THEN 'unknown' ELSE delivery_status END)='${status}'`;
}

for (const field of ['input_tokens', 'output_tokens', 'total_tokens', 'cached_input_tokens', 'reasoning_tokens']) {
    expressions[field + '_sum'] = `COALESCE(${field},0)`;
    expressions[field + '_unknown'] = `${field} IS NULL`;
}

expressions.duration_sum = 'COALESCE(model_duration_ms,0)';
expressions.duration_samples = 'model_duration_ms IS NOT NULL';
expressions.duration_max = 'COALESCE(model_duration_ms,0)';

export const metrics = Object.keys(expressions);
export const detailMetrics = Object.entries(expressions).map(([key, value]) => `(${value}) AS ${key}`).join(',');
export const detailDimensions = dimensions.map(key => `COALESCE(${key},'') AS ${key}`).join(',');
export const totals = (asText = false): string => metrics.map(key => {
    const value = `COALESCE(${key === 'duration_max' ? 'MAX' : 'SUM'}(${key}),0)`;

    return `${asText ? `CAST(${value} AS TEXT)` : value} AS ${key}`;
}).join(',');
