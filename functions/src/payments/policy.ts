export type Provider = "stripe" | "apple";
export type Plan = "monthly" | "annual";
export interface BillingState {
    active: boolean;
    plan: Plan | null;
    periodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    status: string;
    productId?: string | null;
}
export const PLANS = {
    monthly: { amount: 400, interval: "month", env: "STRIPE_MONTHLY_PRICE_ID" },
    annual: { amount: 4000, interval: "year", env: "STRIPE_ANNUAL_PRICE_ID" },
} as const;

export function validPlan(value: unknown): value is Plan {
    return value === "monthly" || value === "annual";
}

/** Both providers retain their own state, so expiry of one cannot revoke the other. */
export function summarizeBilling(states: Partial<Record<Provider, BillingState>>, preferred: Provider, now = Date.now() / 1000) {
    const active = ([preferred, preferred === "apple" ? "stripe" : "apple"] as Provider[])
        .find(provider => states[provider]?.active &&
            (states[provider]!.periodEnd === null || states[provider]!.periodEnd! > now));
    const provider = active ?? preferred;
    const state = states[provider];
    return {
        isPro: !!active,
        paymentProvider: provider,
        subscriptionPeriodEnd: state?.periodEnd ?? null,
        subscriptionPlan: state?.plan ?? null,
        subscriptionCancelAtPeriodEnd: state?.cancelAtPeriodEnd ?? false,
    };
}

interface RcSubscription {
    store?: string;
    expires_date?: string | null;
    grace_period_expires_date?: string | null;
    refunded_at?: string | null;
    unsubscribe_detected_at?: string | null;
    billing_issues_detected_at?: string | null;
}
export interface RcSubscriber {
    entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string; grace_period_expires_date?: string | null }>;
    subscriptions?: Record<string, RcSubscription>;
}
const APPLE_PLAN_BY_PRODUCT: Record<string, Plan> = {
    CertChamps_ACE: "annual",
    CertChamps_ACE_yearly: "annual",
    CertChamps_ACE_Monthly: "monthly",
    CertChamps_ACE_monthly: "monthly",
    CertChamps_ACE_month: "monthly",
};

export function appleBillingState(subscriber: RcSubscriber, now = Date.now()): BillingState {
    const ent = subscriber.entitlements?.["CertChamps ACE"];
    const productId = ent?.product_identifier ?? null;
    const sub = productId ? subscriber.subscriptions?.[productId] : undefined;
    const expiry = ent?.expires_date ? Date.parse(ent.expires_date) : NaN;
    const grace = Date.parse(ent?.grace_period_expires_date ?? sub?.grace_period_expires_date ?? "");
    const end = Math.max(Number.isFinite(expiry) ? expiry : 0, Number.isFinite(grace) ? grace : 0);
    // Only a verified App Store subscription with the ACE entitlement grants access.
    const active = !!ent && !!sub && ["app_store", "mac_app_store"].includes(sub.store ?? "") &&
        !sub.refunded_at && end > now;
    return {
        active,
        plan: productId ? APPLE_PLAN_BY_PRODUCT[productId] ?? null : null,
        productId,
        periodEnd: end ? Math.floor(end / 1000) : null,
        cancelAtPeriodEnd: !!sub?.unsubscribe_detected_at,
        status: active ? (sub?.billing_issues_detected_at ? "grace_period" : "active") : "expired",
    };
}
