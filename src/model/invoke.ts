import type { PluginContext } from '@qqbot/sdk';
import type { Config } from '../config/schema.js';
import { generate } from './client.js';
import type { Prepared } from './client.js';
import { safeError } from '../types.js';
import { bestEffort, finish } from '../storage/usage.js';
import type { Call } from '../storage/requests.js';
import type { AIResponse } from '../types.js';

export async function invoke(ctx: PluginContext<Config>, call: Call, prepared: Prepared,
    beforeSend: () => Promise<void>, fetcher: typeof fetch = fetch): Promise<AIResponse> {
    let started: number | null = null;
    let metering: Pick<AIResponse, 'usage'> | null = null;

    try {
        await beforeSend();
        started = Date.now();
        const result = await generate(prepared, fetcher, value => { metering = value; });
        call.result = { status: 'success', usage: result.usage, duration: Date.now() - started, error: null };

        return result;
    } catch (cause) {
        const error = safeError(cause, started === null);
        const status = started === null ? 'not_sent'
            : error.code === 'HTTP_ERROR' || error.code === 'INVALID_RESPONSE' ? 'failed' : 'unknown';
        call.result = {
            status, usage: (metering as Pick<AIResponse, 'usage'> | null)?.usage ?? null,
            duration: started === null ? null : Date.now() - started, error: error.code
        };
        throw error;
    } finally {
        if (call.source !== 'chat') {
            await bestEffort(ctx, () => finish(ctx, call, 'not_applicable'));
        }
    }
}
