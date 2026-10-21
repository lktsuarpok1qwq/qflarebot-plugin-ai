import type { PluginDB } from '@qqbot/sdk';
import { MODEL_MAX_LENGTH } from '../config/schema.js';
import { beijingDay, DAY, statisticsStart } from '../storage/database.js';
import { detailDimensions, detailMetrics, dimensions, metrics, totals } from './metrics.js';
import { aiError } from '../types.js';

interface ServiceCall {
    request_id: string;
    created_at_ms: number;
    source_label: string | null;
    model: string;
    status: string;
    model_error: string | null;
    model_duration_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
}

// Service 明细按组合主键定位；只在手动查看时读取。
export function serviceQuery(params: URLSearchParams, now = Date.now()) {
    const label = params.get('label') ?? '';
    const cursor = params.get('cursor') ?? '';
    const period = params.get('period') ?? 'week';

    if (!['week', 'all'].includes(period)) { throw aiError('INVALID_ARGUMENT', '查看范围无效'); }

    const end = statisticsStart(now) + 90 * DAY;
    const from = period === 'week' ? end - 7 * DAY : statisticsStart(now);
    let position: [number, string] | undefined;

    if (Array.from(label).length > 100 || cursor.length > 512) {
        throw aiError('INVALID_ARGUMENT', '筛选或分页参数过长');
    }

    if (cursor) {
        try {
            const value: unknown = JSON.parse(cursor);

            if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || value[0] < 0
                || typeof value[1] !== 'string' || !value[1] || value[1].length > 128) { throw new Error(); }

            position = value as [number, string];
        } catch {
            throw aiError('INVALID_ARGUMENT', '分页参数无效');
        }
    }

    // 组合上界直接定位游标，同毫秒翻页也不回扫已读请求键。
    const upper: [number, string] = position && position[0] < end ? position : [end, ''];

    return { now, from, upper, label };
}

export async function serviceCalls(db: PluginDB, query: ReturnType<typeof serviceQuery>) {
    const { now, from, upper, label } = query;
    const rows = await db.all<ServiceCall>(`SELECT request_id,created_at_ms,source_label,model,
        CASE WHEN completed_at_ms IS NULL AND valid_until_ms>? THEN 'pending' ELSE model_status END AS status,
        model_error,model_duration_ms,input_tokens,output_tokens
        FROM {service_usage} WHERE source='service' AND created_at_ms>=? AND (created_at_ms,request_id)<(?,?)
        ${label ? 'AND source_label=?' : ''}
        ORDER BY created_at_ms DESC,request_id DESC LIMIT 26`,
        now, from, ...upper, ...(label ? [label] : []));
    const items = rows.slice(0, 25);
    const last = items.at(-1);

    return {
        items, nextCursor: rows.length > 25 ? JSON.stringify([last!.created_at_ms, last!.request_id]) : null,
        snapshotAt: now
    };
}

export function validDate(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < '1970-01-01') {
        throw aiError('INVALID_ARGUMENT', '日期应为有效的 YYYY-MM-DD');
    }

    return value;
}

export function reportRange(params: URLSearchParams, now: number): [string, string] {
    const today = beijingDay(now);
    const period = params.get('period') ?? 'today';

    if (period === 'today') { return [today, today]; }

    if (period === 'week') { return [beijingDay(now - 6 * DAY), today]; }

    if (period === 'month') { return [today.slice(0, 7) + '-01', today]; }

    if (period === 'all') { return [beijingDay(statisticsStart(now)), today]; }

    if (period !== 'custom') {
        throw aiError('INVALID_ARGUMENT', '统计区间无效');
    }

    const from = validDate(params.get('from'));
    const to = validDate(params.get('to'));

    if (from > to || from < beijingDay(statisticsStart(now)) || to > today) {
        throw aiError('INVALID_ARGUMENT', '只能查询最近 90 日，不能包含未来日期');
    }

    return [from, to];
}

export function reportQuery(params: URLSearchParams, now = Date.now()) {
    const [from, to] = reportRange(params, now);
    const group = params.get('group') ?? 'model';
    const source = params.get('source') ?? '';

    if (source && !['chat', 'service', 'admin_test'].includes(source)) {
        throw aiError('INVALID_ARGUMENT', '统计来源无效');
    }

    const keys: Record<string, string> = { model: 'json_array(model)', source: 'json_array(source)' };

    if (!Object.hasOwn(keys, group)) {
        throw aiError('INVALID_ARGUMENT', '统计分组无效');
    }

    const filter: string[] = [];
    const filters: string[] = [];

    for (const key of ['model', 'source']) {
        const value = params.get(key);

        if (value) {
            if (value.length > MODEL_MAX_LENGTH) { throw aiError('INVALID_ARGUMENT', '筛选值过长'); }

            filter.push(`${key}=?`);
            filters.push(value);
        }
    }

    const cursor = params.get('cursor') ?? '';

    const offset = cursor ? Number(cursor) : 0;

    if ((cursor && !/^[1-9]\d{0,15}$/.test(cursor)) || !Number.isSafeInteger(offset)
        || offset % 50 !== 0 || offset > Number.MAX_SAFE_INTEGER - 50) {
        throw aiError('INVALID_ARGUMENT', '分页参数无效');
    }

    return { now, from, to, group, source, filters, filter, offset, key: keys[group] };
}

export async function report(db: PluginDB, query: ReturnType<typeof reportQuery>) {
    const { now, from, to, group, source, filters, filter, offset, key } = query;
    const tables = source === 'chat' ? ['usage_detail']
        : source === 'service' || source === 'admin_test' ? ['service_usage'] : ['usage_detail', 'service_usage'];
    const facts = tables.map(table => `SELECT ${detailDimensions},${detailMetrics} FROM {${table}}, clock
        WHERE created_at_ms>=from_ms AND created_at_ms<to_ms`).join(' UNION ALL ');
    const sql = `WITH clock AS (SELECT ? AS snapshot_at_ms, ? AS from_ms, ? AS to_ms), facts AS NOT MATERIALIZED (
        ${facts}), selected AS MATERIALIZED
        (SELECT ${dimensions.join(',')},${totals()} FROM facts ${filter.length ? 'WHERE ' + filter.join(' AND ') : ''} GROUP BY ${dimensions.join(',')})`;
    const values = [now, Date.parse(from + 'T00:00:00+08:00'), Date.parse(to + 'T00:00:00+08:00') + DAY, ...filters];
    // 筛选后的聚合只物化一次，所有输出共用同一条语句和快照。
    const row = await db.first<{ total: string; groups: string; errors: string }>(`${sql}
        SELECT (SELECT json_array(${metrics.join(',')}) FROM (SELECT ${totals(true)} FROM selected)) AS total,
        (SELECT json_group_array(json_array(group_key,${metrics.join(',')})) FROM
            (SELECT ${key} AS group_key,${totals(true)} FROM selected
            GROUP BY group_key ORDER BY group_key LIMIT 51 OFFSET ?)) AS groups,
        (SELECT json_group_array(json_array(model_error,delivery_error,calls)) FROM
            (SELECT model_error,delivery_error,CAST(SUM(calls) AS TEXT) AS calls FROM selected
            WHERE model_error<>'' OR delivery_error<>'' GROUP BY model_error,delivery_error
            ORDER BY SUM(calls) DESC,model_error,delivery_error LIMIT 50)) AS errors`, ...values, offset);
    const metricValues = (values: string[]): Record<string, string> =>
        Object.fromEntries(metrics.map((key, index) => [key, values[index]!]));
    const total = metricValues(JSON.parse(row!.total) as string[]);
    const grouped = (JSON.parse(row!.groups) as string[][]).map(([group_key, ...values]) =>
        ({ group_key: group_key!, ...metricValues(values) }));
    const errors = (JSON.parse(row!.errors) as string[][]).map(([model_error, delivery_error, calls]) =>
        ({ model_error: model_error!, delivery_error: delivery_error!, calls: calls! }));

    return {
        from, to, group, total, groups: grouped.slice(0, 50), nextCursor: grouped.length > 50 ? String(offset + 50) : null,
        errors,
        incomplete: total.unfinished !== '0' || total.model_unknown !== '0' || total.delivery_unknown !== '0',
        snapshotAt: now
    };
}
