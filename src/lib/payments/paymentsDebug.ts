/**
 * IAP / payments debug logging. Filter device logs with: IAP_DEBUG
 *
 * Set VITE_PAYMENTS_DEBUG=false in .env to silence (defaults to on in dev).
 *
 * Tools provided:
 *   - iapDebug / iapDebugWarn / iapDebugError — leveled console logs
 *   - timed()       — wrap a promise, log start + done + elapsed ms
 *   - withTimeout() — fail (with explicit log) after N ms instead of hanging
 *   - serializeError() — flatten RevenueCat / Capacitor error objects
 */

const PREFIX = "[IAP_DEBUG]";

let stepCounter = 0;
function nextSeq(): number {
    stepCounter += 1;
    return stepCounter;
}

function isDebugEnabled(): boolean {
    const flag = import.meta.env.VITE_PAYMENTS_DEBUG;
    if (flag === "false" || flag === "0") return false;
    if (flag === "true" || flag === "1") return true;
    return import.meta.env.DEV;
}

function now(): number {
    try {
        return performance.now();
    } catch {
        return Date.now();
    }
}

function fmt(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;
    return { ...data, t: Math.round(now()) };
}

export function iapDebug(step: string, data?: Record<string, unknown>): void {
    if (!isDebugEnabled()) return;
    const seq = nextSeq();
    const payload = fmt(data);
    if (payload !== undefined) {
        console.log(PREFIX, `#${seq}`, step, payload);
    } else {
        console.log(PREFIX, `#${seq}`, step, { t: Math.round(now()) });
    }
}

export function iapDebugWarn(step: string, data?: Record<string, unknown>): void {
    if (!isDebugEnabled()) return;
    const seq = nextSeq();
    const payload = fmt(data);
    if (payload !== undefined) {
        console.warn(PREFIX, `#${seq}`, step, payload);
    } else {
        console.warn(PREFIX, `#${seq}`, step, { t: Math.round(now()) });
    }
}

export function iapDebugError(step: string, err: unknown, data?: Record<string, unknown>): void {
    if (!isDebugEnabled()) return;
    const seq = nextSeq();
    const errPayload = serializeError(err);
    const payload = { ...(data ?? {}), ...errPayload, t: Math.round(now()) };
    console.error(PREFIX, `#${seq}`, step, payload);
}

/**
 * Wrap a promise with detailed timing. Logs `:start` before awaiting,
 * `:done` (with elapsed ms) on resolve, and `:failed` on reject.
 * Always rethrows so callers see the original error.
 */
export async function timed<T>(
    label: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
): Promise<T> {
    iapDebug(`${label}:start`, context);
    const startedAt = now();
    try {
        const value = await fn();
        const elapsedMs = Math.round(now() - startedAt);
        iapDebug(`${label}:done`, { elapsedMs, ...(context ?? {}) });
        return value;
    } catch (err) {
        const elapsedMs = Math.round(now() - startedAt);
        iapDebugError(`${label}:failed`, err, { elapsedMs, ...(context ?? {}) });
        throw err;
    }
}

/**
 * Race a promise against a timeout so a hung native bridge call produces
 * a definitive log line instead of disappearing. Logs a warning when the
 * timeout fires, and throws an Error so callers' catch blocks run.
 */
export function withTimeout<T>(
    label: string,
    ms: number,
    fn: () => Promise<T>
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const startedAt = now();
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            const elapsedMs = Math.round(now() - startedAt);
            iapDebugWarn(`${label}:timeout`, { afterMs: ms, elapsedMs });
            reject(new Error(`[IAP_DEBUG] ${label} timed out after ${ms}ms`));
        }, ms);
        fn().then(
            (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

/** Normalize RevenueCat / Capacitor errors for logging. */
export function serializeError(err: unknown): Record<string, unknown> {
    if (err == null) return { error: "null" };
    if (typeof err === "string") return { message: err };
    const anyErr = err as Record<string, unknown>;
    const out: Record<string, unknown> = {
        message: anyErr.message ?? String(err),
        name: anyErr.name,
        code: anyErr.code,
        userCancelled: anyErr.userCancelled,
        underlyingErrorMessage: anyErr.underlyingErrorMessage,
        readableErrorCode: anyErr.readableErrorCode,
    };
    if (err instanceof Error && err.stack) {
        out.stack = err.stack;
    }
    try {
        out.raw = JSON.stringify(err, Object.getOwnPropertyNames(err as object));
    } catch {
        out.raw = String(err);
    }
    return out;
}
