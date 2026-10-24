import { configSchema, temperatureIssue, validModel } from '../../config/schema.js';

export const settings = () => String.raw`
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
`;
