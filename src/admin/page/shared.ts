import { MAX_SETTINGS_BYTES } from '../../config/schema.js';
import { metrics } from '../metrics.js';

// 公共请求和页面状态先初始化；控件函数在设置绑定后接入同一浏览器模块。
export const initialize = () => String.raw`
const $ = id => document.getElementById(id);
const bridge = await createBridge();
bridge.setTitle('AI 管理');

if (bridge.embedded) {
    const root = document.documentElement;
    root.classList.add('embedded');
    // 宿主边框占 2px，高度过渡由宿主承接；达到 4000px 上限后才由内页滚动。
    new ResizeObserver(() => {
        const height = Math.ceil(document.body.getBoundingClientRect().height) + 2;
        root.classList.toggle('frame-scroll', height > 4000);
        bridge.resize(height);
    }).observe(document.body);
}

if (!bridge.embedded) {
    const theme = matchMedia('(prefers-color-scheme: dark)');
    theme.addEventListener('change', event => { document.documentElement.dataset.theme = event.matches ? 'dark' : 'light'; });
}

let reportCursor = null, historyCursor = null, selectedHistory = null;
let servicesCursor = null, servicesLabel = '', servicesPeriod = 'week', servicesLoading = false, servicesLoaded = false, servicesSequence = 0;
let activeReport = null, activeReportRange = null, reportLoaded = false, reportLoading = false;
let reportSequence = 0, historySequence = 0, historyDetailRequest = null, historyLoading = false;
const setText = (id, value) => { $(id).textContent = value; };
let feedbackTimer;
let activePage = 'connection', clearingHistory = false, viewVersion = 0;
let historyDetailTrigger = null, focusVersion = 0, historySelectionVersion = 0, historyNeedsReload = false;
// 详情等待期间用户若选了新位置，完成后不再移动焦点或视口。
document.addEventListener('focusin', () => { focusVersion++; });

function feedback(message, error = false, warning = false) {
    if (bridge.embedded) {
        bridge.toast(message, error ? 'error' : warning ? 'warning' : 'success');

        return;
    }

    clearTimeout(feedbackTimer);
    $('feedback').hidden = false;
    setText('feedback-text', message);
    $('feedback').className = 'notice' + (error ? ' error' : warning ? ' warning' : '');
    feedbackTimer = setTimeout(() => { $('feedback').hidden = true; }, error || warning ? 5000 : 3000);
}

$('feedback').querySelector('button').onclick = () => {
    clearTimeout(feedbackTimer);
    $('feedback').hidden = true;
};

async function api(path, data) {
    let result, json;
    const encoded = data === undefined ? undefined : JSON.stringify(data);

    if (encoded !== undefined && new TextEncoder().encode(encoded).byteLength > (path === '/api/settings' ? ${MAX_SETTINGS_BYTES} : 8192)) {
        throw Object.assign(new Error('提交内容过大，请缩短后重试'), { requestNotSent: true });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const timeoutError = () => Object.assign(new Error(data === undefined || [400, 401, 403].includes(result?.status)
        ? '请求超时，请稍后重试' : '请求超时，操作结果未确认；请重新加载核对'), { status: result?.status });

    try {
        try { result = await bridge.fetch(path, { signal: controller.signal, ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: encoded }) }); }
        catch {
            if (controller.signal.aborted) { throw timeoutError(); }

            throw new Error(data === undefined ? '网络连接失败，请稍后重试' : '网络连接失败，操作结果未确认；请重新加载核对');
        }

        try { json = await result.json(); } catch { /* 不回显解析器截取的响应正文。 */ }

        if (controller.signal.aborted) {
            throw timeoutError();
        }

        if (!json || typeof json !== 'object' || Array.isArray(json) || !Object.keys(json).length) {
            throw Object.assign(new Error(data === undefined ? '管理接口响应异常，请稍后重试' : '管理接口响应异常，操作结果未确认；请重新加载核对'), { status: result.status });
        }

        if (!result.ok) {
            throw Object.assign(new Error(typeof json.error === 'string' && json.error ? json.error : '操作失败，请稍后重试'), {
                code: typeof json.code === 'string' ? json.code : undefined,
                field: typeof json.field === 'string' ? json.field : undefined, status: result.status
            });
        }

        checkResponse(path, json, data !== undefined);

        return json;
    } finally { clearTimeout(timer); }
}

const serviceStatusNames = { success: '生成成功', failed: '生成失败', not_sent: '未请求模型', unknown: '结果未知', pending: '进行中' };

// 只检查当前页面消费的公开回执；异常不能成为成功或改变当前目标。
function checkResponse(path, value, write) {
    const fail = () => { throw new Error(write ? '管理接口响应异常，操作结果未确认；请重新加载核对' : '管理接口响应异常，请稍后重试'); };
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    const text = v => typeof v === 'string';
    const count = v => Number.isSafeInteger(v) && v >= 0;
    const optionalCount = v => v === null || count(v);
    const cursor = v => v === null || (text(v) && Boolean(v));
    const metric = v => object(v) && ${JSON.stringify(metrics)}.every(key => text(v[key]) && /^\d+$/.test(v[key]));
    const url = new URL(path, location.href);
    let valid = true;

    if (url.pathname === '/api/report') {
        valid = metric(value.total) && Array.isArray(value.groups) && value.groups.every(row => {
            if (!metric(row) || !text(row.group_key)) { return false; }

            try {
                const key = JSON.parse(row.group_key);

                return Array.isArray(key) && key.length === 1 && text(key[0]);
            } catch { return false; }
        }) && Array.isArray(value.errors) && value.errors.every(row => object(row) && text(row.model_error) && text(row.delivery_error) && text(row.calls) && /^\d+$/.test(row.calls))
            && text(value.from) && text(value.to) && ['model', 'source'].includes(value.group)
            && value.group === (url.searchParams.get('group') || 'model')
            && typeof value.incomplete === 'boolean' && cursor(value.nextCursor);
    } else if (url.pathname === '/api/conversations') {
        if (url.searchParams.has('id')) {
            valid = value.conversation_id === url.searchParams.get('id') && Array.isArray(value.rounds)
                && value.rounds.every(row => object(row) && text(row.user) && text(row.assistant));
        } else {
            valid = Array.isArray(value.items) && value.items.every(row => object(row) && text(row.conversation_id)
                && text(row.bot_id) && text(row.scene) && text(row.scope_id) && count(row.last_success_at_ms)) && cursor(value.nextCursor);
        }
    } else if (url.pathname === '/api/service-calls') {
        valid = Array.isArray(value.items) && value.items.every(row => object(row) && text(row.request_id) && count(row.created_at_ms)
            && (row.source_label === null || text(row.source_label)) && text(row.model) && text(row.status) && Object.hasOwn(serviceStatusNames, row.status)
            && (row.model_error === null || text(row.model_error)) && optionalCount(row.model_duration_ms)
            && optionalCount(row.input_tokens) && optionalCount(row.output_tokens)) && cursor(value.nextCursor);
    } else if (url.pathname === '/api/conversations/clear') { valid = value.cleared === true; }
    else if (url.pathname === '/api/test') {
        valid = value.connected === true && ['complete', 'output_limit'].includes(value.outcome) && text(value.model)
            && text(value.text) && (value.outcome === 'output_limit' || Boolean(value.text.trim())) && count(value.elapsedMs)
            && object(value.usage) && ['inputTokens', 'outputTokens'].every(key => optionalCount(value.usage[key]));
    }

    if (!valid) { fail(); }
}

async function busy(element, action, trigger = document.activeElement, view = viewVersion) {
    if (element.getAttribute('aria-busy') === 'true') { return; }

    const buttons = element.matches('button') ? [element] : [...element.querySelectorAll('button')];
    let restore = true;
    buttons.forEach(button => { button.disabled = true; });
    element.setAttribute('aria-busy', 'true');

    try { restore = await action() !== false; }
    catch (error) { if (view === viewVersion) { feedback(error.message || '操作失败，请稍后重试', true); } }
    finally {
        buttons.forEach(button => { button.disabled = false; });
        element.removeAttribute('aria-busy');

        if (restore) { restoreFocus(trigger); }
    }
}

function focusLost() {
    const active = document.activeElement;

    return active === document.body || !active?.getClientRects().length || active.matches(':disabled');
}

function restoreFocus(trigger, fallback) {
    if (!focusLost()) { return; }

    const target = [trigger, fallback].find(node => node?.isConnected && !node.matches(':disabled') && node.getClientRects().length);
    target?.focus({ preventScroll: true });
}
`;

export const controls = String.raw`
function button(text, action, danger = false) {
    const element = document.createElement('button');
    element.textContent = text;
    element.className = 'qb-btn' + (danger ? ' danger' : '');
    element.addEventListener('click', () => busy(element, () => action(element)));

    return element;
}

function table(id, headers, rows) {
    // 隐藏的容器不能可靠设置 scrollTop；新结果使用空容器，切页复用时不重建。
    const previous = $(id), target = previous.cloneNode(false);
    previous.replaceWith(target);

    if (!rows.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = '暂无记录';
        target.append(p);

        return;
    }

    const table = document.createElement('table'), head = document.createElement('thead'), tr = document.createElement('tr');
    headers.forEach(label => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        tr.append(th);
    });
    head.append(tr);
    table.append(head);
    const body = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(value => {
            const td = document.createElement('td');

            if (value instanceof Node) { td.append(value); } else { td.textContent = value == null ? '未知' : String(value); }

            tr.append(td);
        });
        body.append(tr);
    });
    table.append(body);
    target.append(table);
}

let confirming = false;

// 同一观察器按动画帧重新观察固定探针，裁切面积不变时也能感知宿主滚动。
function watchVisibleArea(update) {
    const probe = document.createElement('div');
    probe.className = 'viewport-probe';
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
    let frame, stopped = false;
    const observer = new IntersectionObserver(([entry]) => {
        if (stopped) { return; }

        observer.unobserve(probe);
        const rect = entry.intersectionRect, viewport = window.visualViewport;
        const left = Math.max(rect.left, viewport?.offsetLeft || 0), top = Math.max(rect.top, viewport?.offsetTop || 0);
        const right = Math.min(rect.right, viewport ? viewport.offsetLeft + viewport.width : innerWidth);
        const bottom = Math.min(rect.bottom, viewport ? viewport.offsetTop + viewport.height : innerHeight);
        update({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
        frame = requestAnimationFrame(() => { if (!stopped) { observer.observe(probe); } });
    });
    observer.observe(probe);

    return () => {
        stopped = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        probe.remove();
    };
}

async function confirmAction(message, { title, accept, danger = false }) {
    if (confirming) { return false; }

    confirming = true;
    const dialog = $('confirm'), trigger = document.activeElement;
    let accepted = false;
    let stop = () => { };

    try {
        let previous = '';
        const position = area => {
            if (!area.width || !area.height) { return; }

            const key = [area.top, area.left, area.width, area.height].join(',');

            if (key === previous) { return; }

            previous = key;

            for (const [name, value] of Object.entries({ top: area.top + area.height / 2, left: area.left + area.width / 2, width: area.width, height: area.height })) {
                dialog.style.setProperty('--confirm-' + name, value + 'px');
            }
        };
        const area = await new Promise(resolve => {
            stop = watchVisibleArea(bounds => {
                if (dialog.open) { position(bounds); }

                resolve(bounds);
            });
        });

        if (!area.width || !area.height) { return false; }

        position(area);
        const scroll = { x: scrollX, y: scrollY };
        setText('confirm-title', title);
        setText('confirm-text', message);
        const submit = dialog.querySelector('[value=confirm]');
        submit.textContent = accept;
        submit.className = 'qb-btn ' + (danger ? 'destructive' : 'qb-btn--primary');
        dialog.returnValue = 'cancel';

        return await new Promise(resolve => {
            dialog.onclose = () => {
                accepted = dialog.returnValue === 'confirm';
                resolve(accepted);
            };
            dialog.onclick = event => {
                const bounds = dialog.getBoundingClientRect();

                if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) { dialog.close('cancel'); }
            };
            dialog.showModal();
            dialog.querySelector('[value=cancel]').focus({ preventScroll: true });
            window.scrollTo(scroll.x, scroll.y);
        });
    } catch {
        if (dialog.open) { dialog.close('cancel'); }

        feedback('无法打开确认框，请重试', true);

        return false;
    } finally {
        stop();
        dialog.onclose = null;
        dialog.onclick = null;
        confirming = false;

        if (!accepted) {
            requestAnimationFrame(() => {
                const fields = [...(trigger?.closest('form')?.querySelectorAll('input,select,textarea') || [])];
                const fallback = fields.find(control => !control.matches(':disabled') && control.getClientRects().length)
                    || (trigger?.id === 'clear-history' ? $('history-refresh') : document.querySelector('nav [aria-selected=true]'));
                restoreFocus(trigger, fallback);
            });
        }
    }
}
`;
