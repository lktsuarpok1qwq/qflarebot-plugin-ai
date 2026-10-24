import { markup } from './page/markup.js';
import { initialize, controls } from './page/shared.js';
import { settings } from './page/settings.js';
import { activity } from './page/activity.js';
import { history } from './page/history.js';
import { navigation } from './page/navigation.js';

// 仅访问管理页时组装 HTML；片段按依赖顺序运行于同一浏览器模块，不增加资源请求。
export const page = () => markup() + initialize() + settings() + controls + activity + history + navigation + '</script></body></html>';
