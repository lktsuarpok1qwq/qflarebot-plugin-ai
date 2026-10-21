import { adminRoutes } from './admin/routes.js';
import { definePlugin } from '@qqbot/sdk';
import type { Config } from './config/schema.js';
import { handleChat, QQ_LOCAL_BUDGET_MS, QQ_REPLY_RESERVE_MS } from './chat/handler.js';
import { maintain } from './storage/maintenance.js';
import { createAIService } from './model/service.js';
import { readSavedSettings, readSettings, settingsContext } from './config/store.js';
import { statisticsStart } from './storage/database.js';
import type { AIService } from './types.js';

export type { AIService, AIResponse, AIMessage, GenerateOptions, ChatOptions, AIError } from './types.js';
export default definePlugin<Config>({
    name: 'ai', displayName: 'AI 文字聊天', apiVersion: 4,
    description: '在 QQ 中向 AI 提问，管理聊天记录并查看用量',
    permissions: ['net', 'db', 'admin'],
    configSchema: { type: 'object', properties: {} },
    ui: { path: '/ui', title: 'AI 管理', icon: 'message-circle' }, routes: adminRoutes,
    commands: {
        ai: {
            description: '与 AI 对话', usage: '/ai <问题>', scenes: ['group', 'c2c'],
            handler: async input => {
                const started = Date.now();
                const { session, argText } = input;

                if (!session.canReply || !['group', 'c2c'].includes(session.scene)
                    || session.timestamp < statisticsStart(started)) { return; }

                const tip = !argText.trim() ? '用法：/ai <问题>'
                    : !session.id || !session.botId || !session.userId || !session.targetId ? '会话身份不完整' : null;

                if (tip) {
                    try { await session.reply(tip); }
                    catch { input.ctx.logger.warn('AI 提示未确认投递'); }

                    return;
                }

                let ctx;

                try { ctx = await settingsContext(input.ctx); }
                catch {
                    if (input.session.canReply && Date.now() + QQ_REPLY_RESERVE_MS < started + QQ_LOCAL_BUDGET_MS) {
                        await input.session.reply('设置读取失败，请稍后重试');
                    }

                    return;
                }

                await handleChat({ ...input, ctx }, undefined, started);
            }
        }
    },
    services: {
        'ai.llm': ctx => createAIService(ctx, undefined, 'service', () => readSettings(ctx.db)) satisfies AIService
    },
    cron: {
        maintenance: {
            cron: '7 16 * * *', handler: async ({ ctx }) => {
                // 未使用的空库无需建表或清理；其他存储异常仍拒绝维护。
                const saved = await readSavedSettings(ctx.db, false);

                if (saved) { await maintain({ ...ctx, config: saved.config }); }
            }
        }
    }
});
