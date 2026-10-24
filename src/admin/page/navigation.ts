export const navigation = String.raw`
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
`;
