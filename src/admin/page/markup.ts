import { MODEL_MAX_LENGTH } from '../../config/schema.js';
import { styles } from './styles.js';

export const markup = () => String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI 管理</title><link rel="stylesheet" href="/tokens.css">
<style>${styles}</style></head><body><main class="qb-page">
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
`;
