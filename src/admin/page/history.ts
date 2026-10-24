export const history = String.raw`
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
`;
