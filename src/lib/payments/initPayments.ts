/**
 * RevenueCat SDK lifecycle.
 *
 * Call `initPayments()` exactly once on app boot. Then call
 * `setPaymentsUser(uid)` whenever the user signs in (so RevenueCat's
 * webhook can carry our Firebase UID in `app_user_id`), and
 * `clearPaymentsUser()` on sign-out.
 *
 * All calls are safe no-ops on non-iOS-native platforms, so the rest of
 * the app can wire these up unconditionally.
 *
 * NOTE: We use a STATIC import of `@revenuecat/purchases-capacitor`
 * (rather than a dynamic `import()`) because WKWebView has been observed
 * to hang dynamic imports during heavy boot activity. The package's
 * `index.js` only calls `registerPlugin(...)` at module-load — the
 * actual native or web implementation isn't pulled in until methods on
 * the proxy are invoked — so the static import is safe on every
 * platform.
 */

import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { isAppleIapAvailable } from "./applePayment";
import {
    iapDebug,
    iapDebugError,
    iapDebugWarn,
    timed,
    withTimeout,
} from "./paymentsDebug";

const REVENUECAT_IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as
    | string
    | undefined;

iapDebug("initPayments:module:loaded", {
    hasPurchases: typeof Purchases !== "undefined",
    hasConfigure: typeof Purchases?.configure === "function",
    hasIsConfigured: typeof Purchases?.isConfigured === "function",
    hasGetOfferings: typeof Purchases?.getOfferings === "function",
    hasPurchasePackage: typeof Purchases?.purchasePackage === "function",
});

/** Most native bridge calls should resolve in well under a second. We
 *  use a generous timeout so we get a definitive log line instead of an
 *  indefinite hang. */
const NATIVE_TIMEOUT_MS = 15_000;
const CONFIGURE_TIMEOUT_MS = 20_000;

let configurePromise: Promise<void> | null = null;
let lastConfigureError: unknown = null;
let lastConfiguredUid: string | null = null;

/** Shared accessor used by the apple provider so every file goes through
 *  the same already-imported module. */
export function getPurchases(): typeof Purchases {
    return Purchases;
}

/** Quick visibility into whether the RevenueCat plugin is even registered
 *  on the native side. If the bridge is missing the plugin entirely, this
 *  will return false even before we call configure(). */
function logPluginAvailability(): void {
    try {
        const isAvailable = Capacitor.isPluginAvailable("Purchases");
        iapDebug("plugin:Purchases availability", { isAvailable });
    } catch (err) {
        iapDebugError("plugin:availabilityCheckFailed", err);
    }
}

/**
 * Initialize the RevenueCat SDK. Safe to call multiple times — only the
 * first call actually configures.
 *
 * If `uid` is provided, we configure the SDK already-logged-in as that
 * user. Otherwise we configure anonymously and the caller is expected
 * to call `setPaymentsUser(uid)` later once they know who the user is.
 */
export async function initPayments(uid?: string | null): Promise<void> {
    iapDebug("initPayments:called", {
        platform: Capacitor.getPlatform(),
        isNative: Capacitor.isNativePlatform(),
        hasUid: !!uid,
        hasApiKey: !!REVENUECAT_IOS_API_KEY,
        apiKeyPrefix: REVENUECAT_IOS_API_KEY?.slice(0, 6) ?? null,
        apiKeyLength: REVENUECAT_IOS_API_KEY?.length ?? 0,
    });
    if (!isAppleIapAvailable()) {
        iapDebug("initPayments:skipped", { reason: "not iOS native" });
        return;
    }
    if (!REVENUECAT_IOS_API_KEY) {
        iapDebugWarn("initPayments:skipped", { reason: "VITE_REVENUECAT_IOS_API_KEY missing" });
        console.warn(
            "[initPayments] VITE_REVENUECAT_IOS_API_KEY missing — Apple IAP disabled."
        );
        return;
    }

    logPluginAvailability();

    if (configurePromise) {
        iapDebug("initPayments:awaiting existing configure");
        try {
            await configurePromise;
            iapDebug("initPayments:existing configure resolved");
        } catch (err) {
            iapDebugError("initPayments:existing configure rejected", err);
            throw err;
        }
        return;
    }

    configurePromise = runConfigure(uid ?? null);
    await configurePromise;
}

async function runConfigure(uid: string | null): Promise<void> {
    try {
        iapDebug("initPayments:configure:start", { appUserID: uid });

        // Log level — surface RevenueCat's own native logs in the
        // Xcode console so we can see what the SDK itself is doing.
        try {
            await timed("initPayments:setLogLevel", () =>
                withTimeout("setLogLevel", NATIVE_TIMEOUT_MS, () =>
                    Purchases.setLogLevel({ level: "VERBOSE" as never })
                )
            );
        } catch (err) {
            iapDebugWarn("initPayments:setLogLevel failed (non-fatal)", {
                message: (err as Error)?.message ?? String(err),
            });
        }

        await timed(
            "initPayments:Purchases.configure",
            () =>
                withTimeout("Purchases.configure", CONFIGURE_TIMEOUT_MS, () =>
                    Purchases.configure({
                        apiKey: REVENUECAT_IOS_API_KEY!,
                        appUserID: uid,
                    })
                ),
            { apiKeyPrefix: REVENUECAT_IOS_API_KEY?.slice(0, 6), hasUid: !!uid }
        );

        const isConfiguredResult = await timed(
            "initPayments:Purchases.isConfigured",
            () =>
                withTimeout("Purchases.isConfigured", NATIVE_TIMEOUT_MS, () =>
                    Purchases.isConfigured()
                )
        );
        const appUserIDResult = await timed(
            "initPayments:Purchases.getAppUserID",
            () =>
                withTimeout("Purchases.getAppUserID", NATIVE_TIMEOUT_MS, () =>
                    Purchases.getAppUserID()
                )
        );

        lastConfiguredUid = appUserIDResult.appUserID ?? null;

        iapDebug("initPayments:configure:done", {
            platform: Capacitor.getPlatform(),
            hasUid: !!uid,
            isConfigured: isConfiguredResult.isConfigured,
            appUserID: appUserIDResult.appUserID ?? null,
        });

        // Probe customer + offerings right away so we know whether
        // the dashboard / network side is healthy without requiring
        // the user to navigate to Payments.
        void probePostConfigure();
    } catch (err) {
        lastConfigureError = err;
        iapDebugError("initPayments:configure:failed", err);
        console.error("[initPayments] RevenueCat configure failed", err);
        // Reset so a later call can try again.
        configurePromise = null;
        throw err;
    }
}

/** Ensure the SDK is configured before performing an action. If
 *  `initPayments` never finished (or was never called), this kicks off
 *  configuration on demand. Used by the apple provider's purchase /
 *  isReady paths so the user can still pay even if boot config hung. */
export async function ensureConfigured(uid?: string | null): Promise<boolean> {
    if (!isAppleIapAvailable() || !REVENUECAT_IOS_API_KEY) return false;
    try {
        const probe = await timed("ensureConfigured:probe.isConfigured", () =>
            withTimeout("ensureConfigured.isConfigured", NATIVE_TIMEOUT_MS, () =>
                Purchases.isConfigured()
            )
        );
        if (probe.isConfigured) {
            iapDebug("ensureConfigured:alreadyConfigured");
            return true;
        }
    } catch (err) {
        iapDebugWarn("ensureConfigured:probe failed (will try configure)", {
            message: (err as Error)?.message ?? String(err),
        });
    }
    try {
        iapDebug("ensureConfigured:forcing configure");
        // Reset any stuck promise so we get a fresh attempt.
        configurePromise = null;
        configurePromise = runConfigure(uid ?? null);
        await configurePromise;
        return true;
    } catch (err) {
        iapDebugError("ensureConfigured:configure failed", err);
        return false;
    }
}

/** After successful configure, hit getCustomerInfo + getOfferings so we
 *  surface dashboard / network issues immediately in the logs. */
async function probePostConfigure(): Promise<void> {
    try {
        const info = await timed("probe:getCustomerInfo", () =>
            withTimeout("probe.getCustomerInfo", NATIVE_TIMEOUT_MS, () =>
                Purchases.getCustomerInfo()
            )
        );
        iapDebug("probe:getCustomerInfo:result", {
            originalAppUserId: info.customerInfo?.originalAppUserId ?? null,
        });
    } catch (err) {
        iapDebugError("probe:getCustomerInfo:failed", err);
    }
    try {
        const offerings = await timed("probe:getOfferings", () =>
            withTimeout("probe.getOfferings", NATIVE_TIMEOUT_MS, () =>
                Purchases.getOfferings()
            )
        );
        iapDebug("probe:getOfferings:result", {
            currentOfferingId: offerings.current?.identifier ?? null,
            allOfferingIds: Object.keys(offerings.all ?? {}),
        });
    } catch (err) {
        iapDebugError("probe:getOfferings:failed", err);
    }
}

/** Read-only view of the last configure error so UI can surface it. */
export function getLastConfigureError(): unknown {
    return lastConfigureError;
}

/** Last AppUserID RevenueCat reported back to us after configure / logIn. */
export function getLastConfiguredUid(): string | null {
    return lastConfiguredUid;
}

/**
 * Identify the current user to RevenueCat. Call right after a Firebase
 * sign-in so subsequent purchases carry the Firebase UID into the
 * RevenueCat webhook payload.
 *
 * If `initPayments()` hasn't been called yet, this triggers it with the
 * provided UID. Safe no-op on non-iOS platforms.
 */
export async function setPaymentsUser(uid: string): Promise<void> {
    iapDebug("setPaymentsUser:called", { uid: uid || null });
    if (!isAppleIapAvailable() || !REVENUECAT_IOS_API_KEY) {
        iapDebug("setPaymentsUser:skipped", {
            reason: !isAppleIapAvailable() ? "not iOS native" : "no API key",
        });
        return;
    }
    if (!uid) return;
    try {
        await ensureConfigured(uid);
        const { isConfigured } = await timed(
            "setPaymentsUser:isConfigured",
            () =>
                withTimeout("setPaymentsUser.isConfigured", NATIVE_TIMEOUT_MS, () =>
                    Purchases.isConfigured()
                )
        );
        if (!isConfigured) {
            iapDebugWarn("setPaymentsUser:skipped", { reason: "SDK not configured" });
            return;
        }
        const { appUserID } = await timed(
            "setPaymentsUser:getAppUserID",
            () =>
                withTimeout("setPaymentsUser.getAppUserID", NATIVE_TIMEOUT_MS, () =>
                    Purchases.getAppUserID()
                )
        );
        if (appUserID === uid) {
            iapDebug("setPaymentsUser:alreadyIdentified", { uid });
            return;
        }
        iapDebug("setPaymentsUser:logIn", { from: appUserID ?? null, to: uid });
        await timed("setPaymentsUser:Purchases.logIn", () =>
            withTimeout("Purchases.logIn", NATIVE_TIMEOUT_MS, () =>
                Purchases.logIn({ appUserID: uid })
            )
        );
        lastConfiguredUid = uid;
        console.log("[initPayments] RevenueCat logIn", { uid });
    } catch (err) {
        iapDebugError("setPaymentsUser:failed", err);
        console.warn("[initPayments] setPaymentsUser failed", err);
    }
}

/** Clear the user from RevenueCat on sign-out so subsequent purchases
 *  start from an anonymous identity. */
export async function clearPaymentsUser(): Promise<void> {
    if (!isAppleIapAvailable() || !REVENUECAT_IOS_API_KEY) return;
    try {
        const { isConfigured } = await Purchases.isConfigured();
        if (!isConfigured) return;
        await Purchases.logOut();
        lastConfiguredUid = null;
        console.log("[initPayments] RevenueCat logOut");
    } catch (err) {
        console.warn("[initPayments] clearPaymentsUser failed", err);
    }
}
