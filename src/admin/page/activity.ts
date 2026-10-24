export const activity = String.raw`
const names = { model_success: '生成成功', model_failed: '生成失败', model_unknown: '生成结果未知', model_not_sent: '未请求模型', delivery_success: '回复已全部发送', delivery_failed: '回复发送失败', delivery_partial: '回复已部分发送', delivery_unknown: '回复发送结果未知', delivery_not_sent: '回复未发送', delivery_pending: '回复尚未完成', delivery_not_applicable: '无需 QQ 回复' };
const sceneNames = { c2c: '私聊', group: '群聊' };
const sourceNames = { chat: 'QQ 聊天', service: '其他插件', admin_test: '连接测试' };
const errorNames = { INVALID_ARGUMENT: '调用参数无效', INVALID_CONFIG: '连接配置无效', STORAGE_UNAVAILABLE: '数据存储不可用', BUDGET_EXHAUSTED: '处理时间不足', HTTP_ERROR: '模型接口拒绝请求', TIMEOUT: '模型等待超时', NETWORK_ERROR: '模型网络请求失败', INVALID_RESPONSE: '模型响应无效', INTERNAL_ERROR: '服务暂不可用', budget: '发送时间不足', send_unconfirmed: '发送结果未确认' };

function identifier(value) {
    const span = document.createElement('span');
    span.className = 'qb-mono';
    span.textContent = value;

    return span;
}

function errorLabel(code) {
    if (!code) { return '—'; }

    const span = document.createElement('span');
    span.textContent = errorNames[code] || '未知错误';
    span.title = code;

    return span;
}

function scopeLabel(item) {
    const span = document.createElement('span');
    span.append('机器人 ', identifier(item.bot_id), ' · ' + (sceneNames[item.scene] || item.scene) + ' / ', identifier(item.scope_id));

    return span;
}

function groupLabel(group, key) {
    const values = JSON.parse(key);

    if (group === 'source') { return sourceNames[values[0]] || values[0]; }

    return identifier(values[0]);
}

function next(id, cursor) { $(id).hidden = !cursor; }

function time(value) { return value ? new Date(Number(value)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无'; }

function reportState() {
    if (reportLoading) { $('report-form').setAttribute('aria-busy', 'true'); }
    else { $('report-form').removeAttribute('aria-busy'); }

    $('report-form').querySelector('button').disabled = reportLoading;
    $('report-next').disabled = reportLoading || !reportCursor;
    $('report-next').hidden = !reportCursor;
    $('report-loading').hidden = !reportLoading;
    $('report-data').hidden = !reportLoaded || reportLoading;
}

function invalidateReport(message = '筛选条件已修改，请重新查询') {
    reportSequence++;
    reportCursor = null;
    reportLoaded = false;
    activeReport = null;
    activeReportRange = null;
    setText('report-range', message);
    reportState();
}

async function loadReport(cursor = '') {
    if (reportLoading) { return; }

    if (!cursor && !validReportDates()) { return; }

    const sequence = ++reportSequence, trigger = document.activeElement;
    reportLoading = true;

    if (!cursor) {
        reportCursor = null;
        reportLoaded = false;
        activeReportRange = null;
        activeReport = new URLSearchParams();
        ['period', 'group', 'source', 'model', 'from', 'to'].forEach(key => { if (!$(key).disabled && $(key).value) { activeReport.set(key, $(key).value); } });
    }

    const params = new URLSearchParams(activeReport);

    if (cursor) { params.set('cursor', cursor); }

    reportState();
    setText('report-range', '正在查询统计…');

    try {
        const r = await api('/api/report?' + params);

        if (sequence !== reportSequence) { return; }

        reportLoaded = true;
        activeReportRange = { from: r.from, to: r.to };
        const t = r.total;
        setText('report-range', r.from + ' 至 ' + r.to + ' · 北京时间');
        setText('calls', t.calls);
        setText('success', t.model_success);
        setText('latency', t.duration_samples === '0' ? '未知' : (Number(t.duration_sum) / Number(t.duration_samples)).toFixed(1));
        $('quality').hidden = false;
        $('quality').className = 'notice' + (r.incomplete ? ' warning' : '');
        setText('quality', '尚未完成 ' + t.unfinished + ' 次。' + (r.incomplete ? '部分调用结果未知，未知不能视为零。' : '调用记录完整。'));
        const fields = [['input_tokens', '输入'], ['output_tokens', '输出'], ['total_tokens', '合计'], ['cached_input_tokens', '缓存输入'], ['reasoning_tokens', '推理']];
        table('token-table', ['Token 用量', '已记录', '未提供用量的次数'], fields.map(([key, label]) => [label, t[key + '_sum'], t[key + '_unknown']]));
        const states = Object.entries(t).filter(([key]) => key.startsWith('model_') || key.startsWith('delivery_'));
        table('states', ['状态/耗时', '值'], [...states.map(([k, v]) => [names[k] || k, v]), ['耗时有效样本', t.duration_samples], ['最大耗时 ms', t.duration_samples === '0' ? '未知' : t.duration_max]]);
        table('errors', ['模型错误', '投递错误', '次数'], r.errors.map(e => [errorLabel(e.model_error), errorLabel(e.delivery_error), e.calls]));
        table('groups', ['类别', '调用次数', '生成成功', '输入用量 / 未提供次数', '输出用量 / 未提供次数'], r.groups.map(g => [groupLabel(r.group, g.group_key), g.calls, g.model_success, g.input_tokens_sum + ' / ' + g.input_tokens_unknown, g.output_tokens_sum + ' / ' + g.output_tokens_unknown]));
        reportCursor = r.nextCursor;
        feedback('统计已更新');
    } catch (error) {
        if (sequence === reportSequence) {
            setText('report-range', cursor ? '翻页失败，请重试下一页' : '查询失败，请重试');
            feedback(error.message || '统计查询失败', true);
        }
    } finally {
        reportLoading = false;
        reportState();
        restoreFocus(trigger, $('report-form').querySelector('button'));
    }
}

function validReportDates() {
    for (const id of ['from', 'to']) { clearFieldError($(id), $(id + '-error')); }

    if ($('period').value !== 'custom') { return true; }

    const beijingNow = Date.now() + 8 * 3600000;
    const today = new Date(beijingNow).toISOString().slice(0, 10);
    const start = new Date(beijingNow - 89 * 86400000).toISOString().slice(0, 10);

    for (const id of ['from', 'to']) {
        const value = $(id).value;
        let message = '';

        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) { message = '请填写有效的 YYYY-MM-DD 日期'; }
        else if (value < start || value > today) { message = '请选择最近 90 日内的日期，不能包含未来日期'; }
        else if (id === 'to' && value < $('from').value) { message = '结束日期不能早于起始日期'; }

        if (message) {
            fieldError($(id), $(id + '-error'), message);
            $(id).focus();

            return false;
        }
    }

    return true;
}

$('period').addEventListener('change', () => {
    const custom = $('period').value === 'custom';
    $('custom-dates').classList.toggle('hidden', !custom);

    for (const id of ['from', 'to']) {
        $(id).disabled = !custom;
        $(id).required = custom;
        clearFieldError($(id), $(id + '-error'));
    }
});
$('report-form').addEventListener('input', event => {
    if (['from', 'to'].includes(event.target.id)) { clearFieldError(event.target, $(event.target.id + '-error')); }

    invalidateReport();
});
$('report-form').addEventListener('change', () => invalidateReport());
$('report-form').addEventListener('submit', event => {
    event.preventDefault();
    loadReport();
});
$('report-next').onclick = () => loadReport(reportCursor);

function servicesState() {
    $('services-form').setAttribute('aria-busy', String(servicesLoading));
    $('services-load').disabled = servicesLoading;
    $('services-next').disabled = servicesLoading || !servicesCursor;
    $('services-next').hidden = !servicesCursor;
    $('services-loading').hidden = !servicesLoading;
    $('services-list').hidden = !servicesLoaded || servicesLoading;
}

function invalidateServices() {
    servicesSequence++;
    servicesCursor = null;
    servicesLoaded = false;
    setText('services-state', '筛选条件已修改，请重新加载');
    servicesState();
}

async function loadServices(cursor = '') {
    if (servicesLoading) { return; }

    if (!cursor) {
        clearFieldError($('services-label'), $('services-label-error'));

        if (Array.from($('services-label').value).length > 100) {
            fieldError($('services-label'), $('services-label-error'), '服务名称最多 100 个字符');
            $('services-label').focus();

            return;
        }
    }

    const sequence = ++servicesSequence, trigger = document.activeElement;
    servicesLoading = true;

    if (!cursor) {
        servicesCursor = null;
        servicesLoaded = false;
        servicesLabel = $('services-label').value;
        servicesPeriod = $('services-period').value;
    }

    const params = new URLSearchParams({ label: servicesLabel, period: servicesPeriod });

    if (cursor) { params.set('cursor', cursor); }

    servicesState();
    setText('services-state', '正在加载记录…');

    try {
        const result = await api('/api/service-calls?' + params);

        if (sequence !== servicesSequence) { return; }

        table('services-list', ['调用服务', '时间（北京）', '模型', '结果', '耗时 ms', '输入 Token', '输出 Token'], result.items.map(item => {
            const status = document.createElement('span');
            status.append(serviceStatusNames[item.status]);

            if (item.model_error) { status.append(' · ', errorLabel(item.model_error)); }

            return [item.source_label?.trim() ? identifier(item.source_label) : '未标注', time(item.created_at_ms), identifier(item.model),
                status, item.model_duration_ms, item.input_tokens, item.output_tokens];
        }));
        servicesLoaded = true;
        servicesCursor = result.nextCursor;
        setText('services-load', '重新加载记录');
        setText('services-state', (servicesPeriod === 'week' ? '最近 7 天' : '最近 90 天') + ' · 每页最多 25 条 · 最新调用在前');
        feedback('Service 记录已加载');
    } catch (error) {
        if (sequence === servicesSequence) {
            setText('services-state', cursor ? '翻页失败，请重试下一页' : '加载失败，请重试');
            feedback(error.message || '记录加载失败', true);
        }
    } finally {
        servicesLoading = false;
        servicesState();
        restoreFocus(trigger, $('services-load'));
    }
}

$('services-form').addEventListener('submit', event => {
    event.preventDefault();
    loadServices();
});
$('services-label').addEventListener('input', () => {
    clearFieldError($('services-label'), $('services-label-error'));
    invalidateServices();
});
$('services-period').addEventListener('change', invalidateServices);
$('services-next').onclick = () => loadServices(servicesCursor);

// 连接测试可能产生 admin_test 明细；仅失效可能包含本次调用的统计，不主动回查。
function invalidateTestReport(model, started) {
    if (!activeReport || (activeReport.get('source') && activeReport.get('source') !== 'admin_test')
        || (model !== null && activeReport.get('model') && activeReport.get('model') !== model)) { return; }

    const day = timestamp => new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
    const range = activeReportRange || (activeReport.get('period') === 'custom'
        ? { from: activeReport.get('from'), to: activeReport.get('to') } : null);

    if (range && (range.to < day(started) || range.from > day(Date.now()))) { return; }

    invalidateReport('连接测试可能更新统计，请重新查询');
}

$('test').onclick = async () => {
    if (settingsNeedReload || !connectionReady() || testingConnection || savingSettings || loadingSettings || JSON.stringify(collectSettings('connection')) !== settingsBaseline.connection) { return; }

    const trigger = document.activeElement;
    const view = viewVersion;
    const started = Date.now();
    let model = null, mayRecord = true;
    testingConnection = true;
    settingsState();
    $('test-summary').hidden = false;
    $('test-summary').className = 'notice';
    setText('test-summary', '正在测试已保存的 API 配置…');
    $('test-metrics').hidden = true;
    $('test-details').hidden = true;
    $('test-details').open = false;
    setText('test-result', '');

    try {
        const result = await api('/api/test', {});
        model = result.model;
        const limited = result.outcome === 'output_limit';
        const message = limited ? '接口已连通，但测试回答未完成：已达到输出上限' : '连接成功，已生成回答';
        $('test-summary').className = 'notice' + (limited ? ' warning' : '');
        $('test-summary').hidden = true;
        $('test-metrics').hidden = false;
        table('test-metrics', ['模型', '耗时', '输入 Token', '输出 Token', '回答'],
            [[identifier(result.model), result.elapsedMs + ' ms', result.usage?.inputTokens, result.usage?.outputTokens, result.text || '未生成正文']]);
        $('test-details').hidden = false;
        setText('test-result', JSON.stringify(result, null, 2));

        if (view === viewVersion) { feedback(message + '，已记录统计', false, limited); }
    } catch (error) {
        mayRecord = !error.requestNotSent && !['INVALID_ARGUMENT', 'INVALID_CONFIG'].includes(error.code) && ![401, 403].includes(error.status);
        $('test-summary').className = 'notice error';
        $('test-summary').hidden = true;

        if (view === viewVersion) { feedback(error.message, true); }
    } finally {
        $('test-summary').hidden = true;
        setText('test-summary', '');
        testingConnection = false;

        if (mayRecord) { invalidateTestReport(model, started); }

        settingsState();
        restoreFocus(trigger, $('test'));
    }
};
`;
