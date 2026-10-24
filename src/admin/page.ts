import { configSchema, MODEL_MAX_LENGTH, MAX_SETTINGS_BYTES, temperatureIssue, validModel } from '../config/schema.js';
import { metrics } from './metrics.js';

// 仅在访问管理页面时生成 HTML，聊天与 Service 不拼接页面。
export const page = () => String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 管理</title><link rel="stylesheet" href="/tokens.css">
<style>
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--qb-border-strong) transparent}html{scrollbar-gutter:stable}html.embedded{overflow-y:hidden}html.embedded.frame-scroll{overflow-y:auto}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:var(--qb-border-strong);border-radius:var(--qb-radius-full)}::-webkit-scrollbar-thumb:hover{background:var(--qb-fg-muted)}
body{margin:0;color:var(--qb-fg);font-family:var(--qb-font-sans);font-size:var(--qb-text-base);line-height:var(--qb-leading);background:var(--qb-bg)}
main.qb-page{max-width:1120px;margin:0 auto;padding:16px;display:grid;gap:16px}h2{font-size:var(--qb-text-xl);margin:0 0 12px}h3{font-size:var(--qb-text-base)}nav{display:flex;flex-wrap:wrap;gap:4px;padding-bottom:12px;border-bottom:1px solid var(--qb-border)}nav .qb-btn{border-color:transparent;background:transparent;border-radius:var(--qb-radius-full)}nav .qb-btn[aria-selected=true]{background:var(--qb-primary);color:var(--qb-on-primary)}
p{line-height:1.6;margin:8px 0}section{padding:16px}.row{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.section-heading h2,.section-heading h3{margin:0;min-width:0;flex:1;overflow-wrap:anywhere}.filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(220px,1.3fr);gap:12px}.filters label{min-width:0}.query-group{display:flex;gap:8px;align-items:end;min-width:0}.dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) auto;gap:12px;margin-top:12px;align-items:end}.dates label{min-width:0}.date-hint{display:flex;align-items:center;min-height:var(--qb-control-height)}
label{display:flex;flex-direction:column;gap:6px;min-width:130px;flex:1}.qb-input{width:100%;min-height:var(--qb-control-height)}button,.actions .qb-btn{min-height:var(--qb-control-height)}summary{cursor:pointer;min-height:32px;padding:6px 0}#services-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,180px) auto;gap:12px;align-items:end}#services-label-error{grid-column:1/-1;margin:0}#from-error{grid-column:1;grid-row:2}#to-error{grid-column:2;grid-row:2}.qb-btn{border-color:var(--qb-border-strong)}.actions a.qb-btn{display:inline-flex;align-items:center;text-decoration:none}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}.qb-btn:disabled:hover{background:var(--qb-surface-muted)}.qb-btn--primary:disabled:hover{background:var(--qb-primary)}.qb-btn:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--qb-ring);outline-offset:2px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.metric{background:var(--qb-surface-muted);padding:14px;border-radius:var(--qb-radius)}
.metric strong{display:block;font-size:var(--qb-text-2xl);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.metric span{color:var(--qb-fg-muted);font-size:12px}
.scroll{max-width:100%;overflow:auto;max-height:400px}section.qb-card{min-width:0}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--qb-border);vertical-align:top;overflow-wrap:anywhere}th{font-size:12px;color:var(--qb-fg-muted)}
:is(#services-list,#groups,#test-metrics) table{min-width:680px}:is(#services-list,#groups,#test-metrics) :is(th,td){white-space:nowrap}:is(#services-list,#groups,#test-metrics) td:first-child,#services-list td:nth-child(3),#test-metrics td:last-child{white-space:normal;min-width:120px;max-width:260px}
#conversations button{white-space:nowrap}#rounds{max-height:600px;overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 var(--qb-font-mono);margin:8px 0;background:var(--qb-surface-muted);border-radius:var(--qb-radius);padding:12px;max-height:360px;overflow:auto}#rounds pre{max-height:none;overflow:visible}
.notice{padding:12px;border-radius:var(--qb-radius);background:var(--qb-surface-muted);overflow-wrap:anywhere}.warning{color:var(--qb-warning);background:var(--qb-warning-bg)}.error{color:var(--qb-danger);background:var(--qb-danger-bg)}
.qb-btn.danger{color:var(--qb-danger);background:var(--qb-danger-bg)}.qb-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--qb-danger-bg),var(--qb-danger) 10%)}.qb-btn.destructive{background:var(--qb-danger);color:var(--qb-on-accent)}.qb-btn.destructive:hover:not(:disabled){background:color-mix(in srgb,var(--qb-danger),var(--qb-fg) 10%)}.qb-btn.danger:disabled:hover{background:var(--qb-danger-bg)}.qb-btn.destructive:disabled:hover{background:var(--qb-danger)}.muted{color:var(--qb-fg-muted)}
.actions{display:flex;gap:8px;flex-wrap:wrap}fieldset>.actions{margin-top:12px}.hidden,[hidden]{display:none!important}.viewport-probe{position:fixed;inset:0;pointer-events:none}dialog{position:fixed;inset:auto;top:var(--confirm-top,50%);left:var(--confirm-left,50%);transform:translate(-50%,-50%);margin:0;max-height:calc(var(--confirm-height,100vh) - 32px);overflow:auto;color:var(--qb-fg);background:var(--qb-surface);border:1px solid var(--qb-border);border-radius:var(--qb-radius-xl);padding:24px;max-width:480px;width:min(480px,calc(var(--confirm-width,100vw) - 32px));box-shadow:var(--qb-shadow)}#confirm-text{overflow-wrap:anywhere}dialog::backdrop{background:var(--qb-overlay)}
.setting{display:grid;grid-template-columns:minmax(150px,1fr) minmax(0,1fr);column-gap:16px;row-gap:6px;align-items:center;padding:12px 0;border-bottom:1px solid var(--qb-border)}.setting label{min-width:0}.setting small{color:var(--qb-fg-muted);line-height:1.5;font-size:12px}.control-wrap{min-width:0}.checkbox-wrap{display:flex;justify-content:flex-end}.setting .toggle-target{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;min-width:0;cursor:pointer}.setting input[role=switch]{appearance:none;position:relative;flex:none;width:42px;height:22px;margin:0;border:0;border-radius:var(--qb-radius-full);background:var(--qb-border-strong);cursor:pointer}.setting input[role=switch]:before{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:var(--qb-fg-muted)}.setting input[role=switch]:checked{background:var(--qb-accent)}.setting input[role=switch]:checked:before{left:23px;background:var(--qb-on-accent)}.setting input[role=switch]:disabled{opacity:.5;cursor:not-allowed}.setting textarea{min-height:100px;resize:vertical}fieldset{border:0;padding:0;margin:0;min-width:0}:is(#connection-advanced,#qq-advanced){padding:12px 0}:is(#connection-advanced,#qq-advanced) summary{cursor:pointer;font-weight:600;min-height:44px;padding:12px 0}.setting-group{margin:16px 0;padding:0;border-block:1px solid var(--qb-border)}.setting-group>.setting:last-child{border-bottom:0}.setting-disabled label,.setting-disabled .qb-input{color:var(--qb-fg-muted)}.setting-disabled .qb-input{background:var(--qb-surface-muted);cursor:not-allowed}.settings-state{min-height:24px}.field-error{grid-column:2;margin:0;color:var(--qb-danger);font-size:12px;line-height:1.5}.qb-input[aria-invalid=true]{border-color:var(--qb-danger)}.qb-input[aria-invalid=true]:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--qb-danger) 22%,transparent)}.skeleton{display:grid;gap:12px;margin:12px 0}.skeleton span{display:block;height:32px;border-radius:var(--qb-radius);background:var(--qb-surface-muted)}#feedback{position:fixed;inset-block-start:max(12px,env(safe-area-inset-top));inset-inline-end:max(12px,env(safe-area-inset-right));max-width:min(400px,calc(100% - 24px));z-index:10;display:flex;align-items:center;gap:12px;box-shadow:var(--qb-shadow-overlay)}#feedback .toast-close{padding:0;min-width:44px;justify-content:center;flex:none}#settings-problem{margin-bottom:12px}#settings-notices:not(:has(> :not([hidden]))){display:none}@media(max-width:900px){.filters{grid-template-columns:repeat(2,minmax(0,1fr))}} @media(max-width:600px){#services-form{grid-template-columns:minmax(0,1fr) auto}#services-form>label:first-child{grid-column:1/-1}.setting{grid-template-columns:1fr;gap:8px}.field-error{grid-column:1}.checkbox-wrap{justify-content:flex-start}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}nav .qb-btn{justify-content:center}nav .qb-btn:last-child:nth-child(odd){grid-column:1/-1}.filters .model-filter,.query-group{grid-column:1/-1}.dates{grid-template-columns:repeat(2,minmax(0,1fr))}.date-hint{grid-column:1/-1;min-height:0}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:last-child{grid-column:1/-1}section{padding:16px}button,.qb-input,.actions .qb-btn,summary{min-height:44px}label{min-width:120px}th,td{padding:8px}main.qb-page{padding:12px}}@media(pointer:coarse){main.qb-page{--qb-control-height:var(--qb-touch-min)}button,.qb-input,.actions .qb-btn,summary{min-height:var(--qb-touch-min)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style></head><body><main class="qb-page">
<nav role="tablist" aria-label="功能导航"><button id="connection-nav" class="qb-btn" data-page="connection" role="tab" aria-selected="true" tabindex="0" aria-controls="connection-page">API 连接</button><button id="qq-nav" class="qb-btn" data-page="qq" role="tab" aria-selected="false" tabindex="-1" aria-controls="qq-page">QQ 对话</button><button id="report-title" class="qb-btn" data-page="report" role="tab" aria-selected="false" tabindex="-1" aria-controls="report-page">使用统计</button><button id="history-nav" class="qb-btn" data-page="history" role="tab" aria-selected="false" tabindex="-1" aria-controls="history-page">聊天历史</button><button id="services-nav" class="qb-btn" data-page="services" role="tab" aria-selected="false" tabindex="-1" aria-controls="services-page">Service 记录</button></nav>
<div id="feedback" class="notice" role="status" aria-live="polite" hidden><span id="feedback-text"></span><button type="button" class="qb-btn toast-close" aria-label="关闭提示"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
<div id="settings-notices"><div id="settings-loading" role="status" hidden><span>正在加载设置…</span><div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div><div id="settings-problem" class="notice warning" role="status" hidden></div></div>
<section id="connection-page" class="qb-card" role="tabpanel" aria-labelledby="connection-title"><div class="section-heading"><h2 id="connection-title">API 连接</h2><button type="button" class="qb-btn" data-reload-settings disabled>重新加载设置</button></div>
<p class="muted">支持 OpenAI、DeepSeek 等兼容接口。</p>
<form id="settings-form" novalidate><fieldset id="settings-fields" disabled><div id="connection-fields"></div>
<details id="connection-advanced"><summary>高级设置</summary><div id="connection-advanced-fields"></div></details>
<div class="actions"><button id="settings-save" type="submit" class="qb-btn qb-btn--primary" disabled>保存设置</button><button id="settings-undo" type="button" class="qb-btn" disabled>撤销修改</button><button id="test" type="button" class="qb-btn" disabled>测试连接</button></div>
</fieldset><p id="settings-state" class="muted settings-state" role="status"></p></form>
<p id="test-help" class="muted">使用已保存的配置测试一次，并计入用量统计。</p><div id="test-summary" class="notice" role="status" hidden></div><div id="test-metrics" class="scroll" hidden></div>
<details id="test-details" hidden><summary>技术详情</summary><pre id="test-result"></pre></details></section>
<section id="qq-page" class="qb-card" role="tabpanel" aria-labelledby="qq-title" hidden><div class="section-heading"><h2 id="qq-title">QQ 对话</h2><button type="button" class="qb-btn" data-reload-settings disabled>重新加载设置</button></div>
<form id="qq-settings-form" novalidate><fieldset id="qq-settings-fields" disabled><div id="qq-fields"></div>
<details id="qq-advanced"><summary>高级设置</summary><div id="qq-advanced-fields"></div></details>
<div class="actions"><button id="qq-settings-save" type="submit" class="qb-btn qb-btn--primary" disabled>保存设置</button><button id="qq-settings-undo" type="button" class="qb-btn" disabled>撤销修改</button></div>
</fieldset><p id="qq-settings-state" class="muted settings-state" role="status"></p></form></section>
<section id="report-page" class="qb-card" role="tabpanel" aria-labelledby="report-heading" hidden><h2 id="report-heading">使用统计</h2><p class="muted">始终记录调用，保留最近 90 天（含今天）；每天清理到期数据。</p>
<p id="report-help" class="muted">筛选决定看哪些记录；统计方式决定按模型或调用来源分别汇总。</p>
<form id="report-form" novalidate><div class="filters">
<label>时间范围<select id="period" class="qb-input"><option value="today">今日</option><option value="week">最近 7 日（含今天）</option><option value="month">本月</option><option value="all">最近 90 天</option><option value="custom">自定义</option></select></label>
<label>来源筛选<select id="source" class="qb-input" aria-describedby="report-help"><option value="">全部</option><option value="chat">QQ 聊天</option><option value="service">其他插件</option><option value="admin_test">连接测试</option></select></label>
<label class="model-filter">模型筛选<input id="model" class="qb-input" maxlength="${MODEL_MAX_LENGTH}" placeholder="留空查看全部模型" aria-describedby="report-help"></label>
<div class="query-group"><label>统计方式<select id="group" class="qb-input" aria-describedby="report-help"><option value="model">按模型统计</option><option value="source">按来源统计</option></select></label>
<button class="qb-btn qb-btn--primary" type="submit">查询</button></div></div>
<div id="custom-dates" class="dates hidden"><label>起始日期<input id="from" disabled type="text" placeholder="yyyy-mm-dd" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxlength="10" autocomplete="off" class="qb-input" aria-describedby="date-help"></label><label>结束日期<input id="to" disabled type="text" placeholder="yyyy-mm-dd" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxlength="10" autocomplete="off" class="qb-input" aria-describedby="date-help"></label><span id="date-help" class="muted date-hint">最近 90 日内</span><p id="from-error" class="field-error" role="alert" hidden></p><p id="to-error" class="field-error" role="alert" hidden></p></div></form>
<p id="report-range" class="muted" role="status">尚未加载，请点击查询查看</p><div id="report-loading" class="skeleton" aria-label="正在查询统计" hidden><span></span><span></span><span></span></div><div id="report-data" hidden><div id="quality" class="notice" hidden></div>
<div class="grid"><div class="metric"><strong id="calls">—</strong><span title="已接受的请求，包括失败和未完成的调用">调用次数</span></div><div class="metric"><strong id="success">—</strong><span>生成成功</span></div><div class="metric"><strong id="latency">—</strong><span>平均等待时间（毫秒）</span></div></div>
<div class="scroll" id="token-table"></div><details><summary>调用详情</summary><div id="states" class="scroll"></div><div id="errors" class="scroll"></div></details>
<h3>分类统计</h3><div id="groups" class="scroll"></div></div><button id="report-next" class="qb-btn" hidden>下一页统计</button>
</section>
<section id="history-page" class="qb-card" role="tabpanel" aria-labelledby="history-heading" hidden><div class="section-heading"><h2 id="history-heading">聊天历史</h2><button id="history-refresh" class="qb-btn">加载会话</button></div><p class="muted">回复只保留已确认发送的内容。</p>
<p id="history-state" class="muted" role="status">尚未加载，请点击加载查看</p><div id="history-loading" class="skeleton" aria-label="正在加载会话" hidden><span></span><span></span><span></span></div>
<div id="history-detail" hidden><div class="section-heading"><h3 id="history-name"></h3><button id="history-close" class="qb-btn">收起详情</button></div><div id="rounds"></div><button id="clear-history" class="qb-btn danger">清空此会话</button></div><div id="conversations" class="scroll"></div><button id="history-next" class="qb-btn" hidden>下一页</button></section>
<section id="services-page" class="qb-card" role="tabpanel" aria-labelledby="services-heading" hidden><h2 id="services-heading">Service 记录</h2><p id="services-help" class="muted">查看哪些服务调用了 AI，默认最近 7 天，可查看最近 90 天。名称由调用方填写，未填写显示“未标注”。</p>
<form id="services-form" class="row" novalidate><label>调用服务<input id="services-label" class="qb-input" placeholder="留空查看全部，填写完整名称筛选" aria-describedby="services-help"></label><label>查看范围<select id="services-period" class="qb-input" aria-describedby="services-help"><option value="week">最近 7 天</option><option value="all">最近 90 天</option></select></label><button id="services-load" class="qb-btn qb-btn--primary" type="submit">加载记录</button><p id="services-label-error" class="field-error" role="alert" hidden></p></form>
<p id="services-state" class="muted" role="status">尚未加载，请点击加载记录</p><div id="services-loading" class="skeleton" aria-label="正在加载 Service 记录" hidden><span></span><span></span></div><div id="services-list" class="scroll" hidden></div><button id="services-next" class="qb-btn" hidden>下一页记录</button></section>
<dialog id="confirm" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text"><h2 id="confirm-title">确认操作</h2><p id="confirm-text"></p><form method="dialog" class="actions"><button class="qb-btn" value="cancel" autofocus>取消</button><button class="qb-btn qb-btn--primary" value="confirm">继续</button></form></dialog>
</main><script type="module">
import { createBridge } from '/bridge.js';

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

const settingsSchema = ${JSON.stringify(configSchema).replace(/</g, '\\u003c')};
const temperatureIssue = ${temperatureIssue.toString()};
const validModel = ${validModel.toString()};
let savedSettings = null, savingSettings = false, testingConnection = false, loadingSettings = false, settingsNeedReload = false;
const settingsBaseline = { connection: '', qq: '' };
const settingId = (group, suffix) => (group === 'connection' ? 'settings-' : 'qq-settings-') + suffix;
const settingsControls = new Map();
const qqSettingParents = {
    temperature: 'sendTemperature', temperatureMin: 'sendTemperature', temperatureMax: 'sendTemperature',
    historyMaxTurns: 'multiTurnEnabled', historyMaxChars: 'multiTurnEnabled'
};
const qqAdvancedFields = new Set(['timeoutMs', 'maxQuestionChars', 'maxQuotedChars', 'maxCombinedInputChars',
    'maxSegmentUtf8Bytes', 'maxReplySegments', 'outputHardLimit']);

function renderSettingsFields(properties, prefix, target) {
    for (const [key, schema] of Object.entries(properties)) {
        const path = prefix ? prefix + '.' + key : key;
        const row = document.createElement('div');
        row.className = 'setting';
        const description = document.createElement('div');
        const label = document.createElement('label');
        label.htmlFor = 'setting-' + path;
        label.id = label.htmlFor + '-label';
        label.textContent = schema.title;
        description.append(label);
        let control;

        if (schema.oneOf) {
            control = document.createElement('select');

            for (const choice of schema.oneOf) {
                const option = document.createElement('option');
                option.value = choice.const;
                option.textContent = choice.title;
                control.append(option);
            }
        } else {
            control = document.createElement(schema.format === 'textarea' ? 'textarea' : 'input');

            if (control.tagName === 'INPUT') { control.type = schema.writeOnly ? 'password' : schema.type === 'boolean' ? 'checkbox' : ['number', 'integer'].includes(schema.type) ? 'number' : 'text'; }

            if (schema.type === 'number') { control.step = 'any'; }

            if (schema.type === 'integer') { control.step = '1'; }

            if (schema.minimum !== undefined) { control.min = schema.minimum; }

            if (schema.maximum !== undefined) { control.max = schema.maximum; }

            if (schema.maxLength !== undefined) { control.maxLength = schema.maxLength; }

            if (schema.writeOnly) { control.autocomplete = 'new-password'; }
        }

        control.id = 'setting-' + path;
        control.className = schema.type === 'boolean' ? '' : 'qb-input';

        if (schema.type === 'boolean') { control.setAttribute('role', 'switch'); }

        if (schema.type === 'number' || schema.type === 'integer') { control.required = true; }

        if (schema.description || schema.writeOnly) {
            const hint = document.createElement('small');
            hint.id = control.id + '-help';
            hint.textContent = schema.writeOnly ? '留空保留已保存的密钥；填写可替换。' : schema.description;
            description.append(hint);
            control.setAttribute('aria-describedby', hint.id);
        }

        const wrap = document.createElement('div');
        wrap.className = 'control-wrap';

        if (schema.type === 'boolean') {
            wrap.classList.add('checkbox-wrap');
            const hit = document.createElement('label');
            hit.className = 'toggle-target';
            hit.append(control);
            wrap.append(hit);
        } else { wrap.append(control); }

        const error = document.createElement('p');
        error.id = control.id + '-error';
        error.className = 'field-error';
        error.hidden = true;
        error.setAttribute('role', 'alert');
        row.append(description, wrap, error);
        let container = $(path === 'connection.maxTokenParameter' ? 'connection-advanced-fields' : target);

        if (prefix === 'qq' && qqAdvancedFields.has(key)) { container = $('qq-advanced-fields'); }

        const group = prefix === 'qq' && (['sendTemperature', 'multiTurnEnabled'].includes(key) ? key : qqSettingParents[key]);

        if (group) {
            let section = $('setting-group-' + group);

            if (!section) {
                section = document.createElement('div');
                section.id = 'setting-group-' + group;
                section.className = 'setting-group';
                section.setAttribute('role', 'group');
                section.setAttribute('aria-labelledby', 'setting-qq.' + group + '-label');
                container.append(section);
            }

            container = section;
        }

        container.append(row);
        settingsControls.set(path, { control, row, schema, prefix, error });
    }
}

for (const group of ['connection', 'qq']) { renderSettingsFields(settingsSchema.properties[group].properties, group, group + '-fields'); }

function settingEnabled(path) {
    const parent = path.startsWith('qq.') && qqSettingParents[path.slice(3)];

    return !parent || settingsControls.get('qq.' + parent).control.checked;
}

function collectSettings(group) {
    const fields = {};

    for (const [path, { control, schema, prefix }] of settingsControls) {
        if (prefix !== group || (schema.writeOnly && !control.value)) { continue; }

        const key = path.split('.').pop();
        fields[key] = !settingEnabled(path) && savedSettings ? savedSettings.config[prefix][key]
            : schema.type === 'boolean' ? control.checked : ['number', 'integer'].includes(schema.type) ? control.valueAsNumber : control.value;
    }

    return fields;
}

function settingsState() {
    for (const group of ['connection', 'qq']) {
        const dirty = settingsDirty(group);
        $(settingId(group, 'fields')).disabled = !savedSettings || savingSettings || testingConnection || loadingSettings;
        $(settingId(group, 'save')).disabled = !dirty || settingsNeedReload || savingSettings || testingConnection || loadingSettings;
        $(settingId(group, 'undo')).disabled = !dirty || savingSettings || testingConnection || loadingSettings;
        $(settingId(group, 'state')).textContent = loadingSettings ? '正在读取设置…' : testingConnection ? '正在测试，请稍候再修改设置' : savingSettings ? '正在保存…' : settingsNeedReload ? '设置待核对，请重新加载' : !savedSettings ? '尚未加载，请点击加载设置' : dirty ? '有未保存的修改' : '暂无未保存修改';
    }

    $('test').disabled = settingsNeedReload || !connectionReady() || JSON.stringify(collectSettings('connection')) !== settingsBaseline.connection || savingSettings || testingConnection || loadingSettings;
    $('test').setAttribute('aria-busy', String(testingConnection));
    setText('test-help', settingsNeedReload ? '请重新加载设置，核对后再测试连接。' : savedSettings && !connectionReady() ? '请先保存 API Key 和模型，再测试连接。' : '使用已保存的配置测试一次，并计入用量统计。');

    for (const element of document.querySelectorAll('[data-reload-settings]')) {
        element.textContent = savedSettings ? '重新加载设置' : '加载设置';
        element.disabled = loadingSettings || savingSettings || testingConnection;
    }

    for (const group of ['connection', 'qq']) {
        $(settingId(group, 'form')).setAttribute('aria-busy', String(loadingSettings || savingSettings || testingConnection));
    }

    for (const [path, { control, row }] of settingsControls) {
        const disabled = !settingEnabled(path);
        row.classList.toggle('setting-disabled', disabled);
        control.disabled = disabled;

        if (disabled) { clearSettingError(path); }
    }
}

function connectionReady() { return Boolean(savedSettings?.hasApiKey && savedSettings.config.connection.model.trim()); }

function checkSettings(result, write = false) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const fail = () => { throw new Error('设置响应异常，请重新加载核对'); };

    if (!object(result) || !object(result.config) || typeof result.hasApiKey !== 'boolean'
        || (result.revision !== null && (typeof result.revision !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(result.revision)))) { fail(); }

    if (write && result.revision === null) { fail(); }

    // 只检查页面所需的公开字段，不接收密钥原文，不改写有效设置。
    for (const [path, { schema, prefix }] of settingsControls) {
        const fields = result.config[prefix];

        if (!object(fields)) { fail(); }

        const key = path.split('.').pop(), value = fields[key];

        if (schema.writeOnly) {
            if (Object.hasOwn(fields, key)) { fail(); }

            continue;
        }

        const numeric = ['number', 'integer'].includes(schema.type);

        if (numeric ? typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isSafeInteger(value))
            || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)
            : typeof value !== schema.type || (schema.maxLength !== undefined && value.length > schema.maxLength)
            || (schema.oneOf && !schema.oneOf.some(choice => choice.const === value))) { fail(); }
    }

    if (!validModel(result.config.connection.model)) { fail(); }
}

function showSettings(result, group = null, confirmed = true) {
    checkSettings(result);
    savedSettings = result;

    if (confirmed) { settingsNeedReload = false; }

    if (!settingsNeedReload) { $('settings-problem').hidden = true; }

    for (const [path, entry] of settingsControls) { if (!group || entry.prefix === group) { clearSettingError(path); } }

    $('test-summary').hidden = true;
    $('test-metrics').hidden = true;
    $('test-details').hidden = true;
    setText('test-result', '');

    for (const [path, { control, schema, prefix }] of settingsControls) {
        if (group && prefix !== group) { continue; }

        const value = result.config[prefix][path.split('.').pop()];

        if (schema.type === 'boolean') { control.checked = value; } else { control.value = schema.writeOnly ? '' : value; }

        if (schema.writeOnly) { control.placeholder = result.hasApiKey ? '已设置，留空保留' : '请输入 API Key'; }
    }

    for (const key of group ? [group] : ['connection', 'qq']) { settingsBaseline[key] = JSON.stringify(collectSettings(key)); }

    settingsState();
}

function settingsDirty(group) {
    return Boolean(savedSettings && JSON.stringify(collectSettings(group)) !== settingsBaseline[group]);
}

function clearSettingError(path) {
    const entry = settingsControls.get(path);

    if (!entry) { return; }

    clearFieldError(entry.control, entry.error);
}

function clearFieldError(control, error) {
    error.hidden = true;
    error.textContent = '';
    control.removeAttribute('aria-invalid');
    const described = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== error.id);

    if (described.length) { control.setAttribute('aria-describedby', described.join(' ')); }
    else { control.removeAttribute('aria-describedby'); }
}

function fieldError(control, error, message) {
    error.textContent = message;
    error.hidden = false;
    control.setAttribute('aria-invalid', 'true');
    const described = new Set((control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    described.add(error.id);
    control.setAttribute('aria-describedby', [...described].join(' '));
}

function settingError(path, message) {
    const entry = settingsControls.get(path);

    if (!entry) { return false; }

    fieldError(entry.control, entry.error, message);

    return true;
}

function focusSetting(path) {
    const entry = settingsControls.get(path);

    if (!entry || entry.prefix !== activePage) { return; }

    if (path === 'connection.maxTokenParameter') { $('connection-advanced').open = true; }

    if (path.startsWith('qq.') && qqAdvancedFields.has(path.slice(3))) { $('qq-advanced').open = true; }

    const target = entry.control.disabled ? entry.row : entry.control;

    if (target === entry.row) { target.tabIndex = -1; }

    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
}

for (const group of ['connection', 'qq']) {
    const form = $(settingId(group, 'form'));
    form.addEventListener('input', event => {
        const path = event.target.id?.replace(/^setting-/, '');
        clearSettingError(path);
        settingsState();
    });
    form.addEventListener('change', settingsState);
    $(settingId(group, 'undo')).onclick = async () => {
        if (savingSettings || testingConnection || loadingSettings || !settingsDirty(group)) { return; }

        const trigger = document.activeElement;

        if (await confirmAction('撤销' + (group === 'connection' ? ' API 连接' : ' QQ 对话') + '未保存的修改？', { title: '确认撤销修改', accept: '撤销修改' })) {
            showSettings(savedSettings, group, false);
            restoreFocus(trigger, [...form.querySelectorAll('input,select,textarea')].find(control => !control.matches(':disabled') && control.getClientRects().length));
        }
    };
    form.onsubmit = async event => {
        event.preventDefault();

        if (savingSettings || testingConnection || loadingSettings || settingsNeedReload || !savedSettings || !settingsDirty(group)) { return; }

        let invalid = null;

        for (const [path, entry] of settingsControls) {
            if (entry.prefix !== group) { continue; }

            clearSettingError(path);

            const numberInvalid = ['number', 'integer'].includes(entry.schema.type)
                && (!Number.isFinite(entry.control.valueAsNumber) || (entry.schema.type === 'integer' && !Number.isSafeInteger(entry.control.valueAsNumber)));

            if (settingEnabled(path) && (!entry.control.validity.valid || numberInvalid)) {
                settingError(path, entry.schema.title + '无效，请检查填写范围');
                invalid ||= path;
            }
        }

        if (group === 'connection') {
            const connection = collectSettings(group);

            if (!validModel(connection.model)) {
                settingError('connection.model', '模型名称须为单行，不能只含空白或控制字符');
                invalid ||= 'connection.model';
            }

            try {
                if (connection.apiKey && !connection.apiKey.trim()) { throw new Error(); }

                new Headers({ authorization: 'Bearer ' + (connection.apiKey || '') });
            } catch {
                settingError('connection.apiKey', 'API Key 格式无效，请检查空白、换行或非法字符');
                invalid ||= 'connection.apiKey';
            }

            try {
                const url = new URL(collectSettings(group).baseUrl);

                if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) { throw new Error(); }
            } catch {
                settingError('connection.baseUrl', '请填写 HTTPS 地址，不含账号、查询参数或片段');
                invalid ||= 'connection.baseUrl';
            }
        }

        if (!invalid && group === 'qq' && settingEnabled('qq.temperature')) {
            const issue = temperatureIssue(collectSettings('qq'));

            if (issue) {
                settingError(issue.field, issue.message);
                invalid = issue.field;
            }
        }

        if (invalid) {
            focusSetting(invalid);

            return;
        }

        const data = { config: { ...savedSettings.config, [group]: collectSettings(group) }, revision: savedSettings.revision };
        const trigger = event.submitter || document.activeElement;
        const view = viewVersion;
        savingSettings = true;
        settingsState();

        try {
            const result = await api('/api/settings', data);
            checkSettings(result, true);
            showSettings(result, group);

            if (view === viewVersion) { feedback('设置已保存'); }
        } catch (error) {
            if (error.field && settingError(error.field, error.message)) { invalid = error.field; }
            else if (error.requestNotSent) {
                if (view === viewVersion) { feedback(error.message, true); }
            }
            else {
                settingsNeedReload = true;
                setText('settings-problem', error.code === 'SETTINGS_CONFLICT' ? '设置已在其他页面修改，草稿已保留；请重新加载设置后核对' : '保存未确认，草稿已保留；可重新加载设置核对');
                $('settings-problem').hidden = false;

                if (view === viewVersion) { feedback(error.message || '保存失败，请稍后重试', true); }
            }
        } finally {
            savingSettings = false;
            settingsState();

            if (invalid) { if (view === viewVersion && focusLost()) { focusSetting(invalid); } }
            else { restoreFocus(trigger, [...form.querySelectorAll('input,select,textarea')].find(control => !control.matches(':disabled') && control.getClientRects().length)); }
        }
    };
}

async function loadSettings() {
    if (loadingSettings || savingSettings || testingConnection) { return; }

    const trigger = document.activeElement;
    const view = viewVersion;

    if (['connection', 'qq'].some(settingsDirty) && !await confirmAction('重新加载会丢弃 API 连接和 QQ 对话中未保存的修改，继续？', { title: '确认重新加载', accept: '重新加载' })) { return; }

    const reloading = Boolean(savedSettings);
    loadingSettings = true;
    $('settings-loading').hidden = Boolean(savedSettings);
    settingsState();

    try {
        showSettings(await api('/api/settings'));

        if (view === viewVersion) { feedback(reloading ? '设置已重新加载' : '设置已加载'); }
    }
    catch (error) {
        setText('settings-problem', savedSettings ? '设置读取失败，现有草稿已保留；请重新加载' : '设置读取失败，请重新加载');
        $('settings-problem').hidden = false;

        if (view === viewVersion) { feedback(error.message || '设置加载失败', true); }
    } finally {
        loadingSettings = false;
        $('settings-loading').hidden = true;
        settingsState();
        restoreFocus(trigger);
    }
}

for (const element of document.querySelectorAll('[data-reload-settings]')) { element.onclick = loadSettings; }

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

function closeHistory() {
    historySelectionVersion++;
    historyDetailRequest = null;
    selectedHistory = null;
    historyDetailTrigger = null;
    $('history-detail').hidden = true;
    $('history-detail').removeAttribute('aria-busy');
    $('rounds').replaceChildren();
}

$('history-close').onclick = () => {
    const trigger = historyDetailTrigger;
    closeHistory();
    const target = trigger?.isConnected && !trigger.matches(':disabled') ? trigger : $('history-refresh');
    target.focus();
};

function historyState() {
    if (historyNeedsReload && !historyLoading) { setText('history-state', '清空结果未确认，请重新加载会话核对'); }

    $('history-refresh').disabled = historyLoading;
    $('history-next').disabled = historyLoading || !historyCursor;
    $('history-next').hidden = !historyCursor;
    $('history-loading').hidden = !historyLoading;
    $('conversations').hidden = historyLoading || historyNeedsReload;

    if (historyLoading) { $('conversations').setAttribute('aria-busy', 'true'); }
    else { $('conversations').removeAttribute('aria-busy'); }
}

async function loadHistory(cursor = '') {
    if (historyLoading) { return; }

    const sequence = ++historySequence, trigger = document.activeElement;
    historyLoading = true;
    closeHistory();

    if (!cursor) { historyCursor = null; }

    historyState();
    setText('history-state', '正在加载会话…');

    try {
        const r = await api('/api/conversations?' + new URLSearchParams({ cursor }));

        if (sequence !== historySequence) { return; }

        historyNeedsReload = false;
        setText('history-refresh', '重新加载会话');
        historyCursor = r.nextCursor;
        next('history-next', historyCursor);
        table('conversations', ['机器人/会话', '最后成功', '操作'], r.items.map(item => [scopeLabel(item), time(item.last_success_at_ms), button('查看', async trigger => {
            historySelectionVersion++;
            const selection = { id: item.conversation_id, trigger, focus: focusVersion };
            historyDetailRequest = selection;
            $('history-detail').hidden = false;
            $('history-detail').setAttribute('aria-busy', 'true');

            if (!selectedHistory) {
                setText('history-name', '正在读取会话…');
                $('rounds').replaceChildren();
                $('clear-history').disabled = true;
            }

            let detail;

            try {
                detail = await api('/api/conversations?' + new URLSearchParams({ id: selection.id }));
            } catch (error) {
                if (selection !== historyDetailRequest) { return false; }

                $('history-detail').removeAttribute('aria-busy');

                if (!selectedHistory) { closeHistory(); }

                throw error;
            }

            if (selection !== historyDetailRequest) { return false; }

            selectedHistory = item.conversation_id;
            historyDetailTrigger = selection.trigger;
            $('history-detail').removeAttribute('aria-busy');
            $('clear-history').disabled = clearingHistory;
            $('history-detail').hidden = false;
            $('history-name').replaceChildren(scopeLabel(item));
            $('rounds').replaceChildren();
            detail.rounds.forEach((round, i) => {
                const label = document.createElement('h3');
                label.textContent = '第 ' + (i + 1) + ' 轮';
                const pre = document.createElement('pre');
                pre.textContent = '用户：\n' + round.user + '\n\nAI：\n' + round.assistant;
                $('rounds').append(label, pre);
            });
            $('rounds').scrollTop = 0;

            if (selection.focus === focusVersion && (focusLost() || document.activeElement === selection.trigger)) {
                // 详情置于列表前，显式查看后聚焦入口；不访问宿主滚动状态。
                $('history-close').focus();
            }
        })]));

        for (const [index, control] of [...$('conversations').querySelectorAll('button')].entries()) {
            control.dataset.conversation = r.items[index].conversation_id;
        }

        setText('history-state', '本页 ' + r.items.length + ' 个会话');
        feedback('会话已加载');
    } catch (error) {
        if (sequence === historySequence) {
            setText('history-state', cursor ? '翻页失败，请重试下一页' : '会话加载失败，请重新加载');
            feedback(error.message || '会话加载失败', true);
        }
    } finally {
        historyLoading = false;
        historyState();
        restoreFocus(trigger, $('history-refresh'));
    }
}

$('history-refresh').onclick = () => loadHistory();
$('history-next').onclick = () => loadHistory(historyCursor);

// 回执不足以重建完整列表；已确认只移除目标，未知结果保留手动核对入口。
function historyChanged(id, confirmed) {
    if (historyDetailRequest?.id === id) { historyDetailRequest = null; }

    if (selectedHistory === id) {
        const pending = historyDetailRequest;
        closeHistory();
        historyDetailRequest = pending;
    }

    historySequence++;
    historyCursor = null;
    historyNeedsReload ||= !confirmed;

    if (confirmed) {
        for (const control of $('conversations').querySelectorAll('button[data-conversation]')) {
            if (control.dataset.conversation === id) { control.closest('tr').remove(); }
        }
    }

    setText('history-state', historyNeedsReload ? '清空结果未确认，请重新加载会话核对' : '会话列表已变化，请重新加载');
    historyState();
}

$('clear-history').onclick = async event => {
    if (clearingHistory) { return; }

    const trigger = event.currentTarget;
    const view = viewVersion, selection = historySelectionVersion;
    const id = selectedHistory, name = $('history-name').textContent;
    const ownsFeedback = () => view === viewVersion && selection === historySelectionVersion && selectedHistory === id;

    if (!id || !await confirmAction('清空会话 ' + name + ' 的全部历史？后续提问使用空历史，当前回答继续；不删除统计。', { title: '确认清空历史', accept: '清空历史', danger: true })) { return; }

    clearingHistory = true;
    await busy(trigger, async () => {
        try { await api('/api/conversations/clear', { id }); }
        catch (error) {
            const current = ownsFeedback();

            // 本地未发出及明确参数/鉴权拒绝不改变历史；其他失败保留结果未知。
            if (!error.requestNotSent && ![400, 401, 403].includes(error.status)) { historyChanged(id, false); }

            if (current) { feedback(error.message || '清空未确认，请重新加载核对', true); }

            return current;
        }

        const current = ownsFeedback();
        historyChanged(id, true);

        if (current) { feedback('聊天历史已清空'); }

        return current;
    }, trigger, view);

    clearingHistory = false;
    trigger.disabled = !selectedHistory;

    if (!selectedHistory && activePage === 'history') { restoreFocus(trigger, $('history-refresh')); }
};

function selectPage(page, remember = true) {
    if (!['connection', 'qq', 'report', 'history', 'services'].includes(page)) { page = 'connection'; }

    if (activePage === 'history' && page !== activePage) {
        historySequence++;
        closeHistory();

        if (historyLoading) { setText('history-state', '加载已失效，请重新加载'); }
    }

    if (activePage === 'report' && page !== activePage) {
        reportSequence++;

        if (reportLoading) { setText('report-range', '查询已失效，请重新查询'); }
    }

    if (activePage === 'services' && page !== activePage) {
        servicesSequence++;

        if (servicesLoading) { setText('services-state', '加载已失效，请重新加载'); }
    }

    if (activePage !== page) { viewVersion++; }

    activePage = page;
    $('settings-notices').hidden = !['connection', 'qq'].includes(page);

    for (const item of document.querySelectorAll('nav [data-page]')) {
        const selected = item.dataset.page === page;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        $(item.dataset.page + '-page').hidden = !selected;
    }

    // 只定位插件自己的 URL 片段，不访问宿主路由或存储。
    if (remember && location.hash !== '#tab=' + page) { location.replace('#tab=' + page); }
}

for (const button of document.querySelectorAll('nav [data-page]')) {
    button.addEventListener('click', () => selectPage(button.dataset.page));
    button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { return; }

        event.preventDefault();
        const tabs = [...document.querySelectorAll('nav [data-page]')];
        const index = tabs.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectPage(tabs[next].dataset.page);
        tabs[next].focus({ preventScroll: true });
    });
}

const pageFromURL = () => new URLSearchParams(location.hash.slice(1)).get('tab') || 'connection';
addEventListener('hashchange', () => selectPage(pageFromURL(), false));
selectPage(pageFromURL(), false);

settingsState();
reportState();
historyState();
servicesState();
</script></body></html>`;
