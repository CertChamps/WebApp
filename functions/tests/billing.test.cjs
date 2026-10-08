const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appleBillingState, summarizeBilling, PLANS, validPlan } = require('./helpers/load-source.cjs')('src/payments/policy.ts');

const now = Date.parse('2026-09-28T12:00:00Z');
const future = new Date(now + 86400000).toISOString();
const past = new Date(now - 86400000).toISOString();
function subscriber(product = 'CertChamps_ACE', overrides = {}, entitlement = {}) {
    return {
        entitlements: { 'CertChamps ACE': { product_identifier: product, expires_date: future, ...entitlement } },
        subscriptions: { [product]: { store: 'app_store', expires_date: future, ...overrides } },
    };
}
const active = { active: true, plan: 'annual', periodEnd: now / 1000 + 86400, cancelAtPeriodEnd: false, status: 'active' };

test('prices are EUR 4 per month and EUR 40 per year; arbitrary plans rejected', () => {
    assert.equal(PLANS.monthly.amount, 400);
    assert.equal(PLANS.annual.amount, 4000);
    for (const plan of [null, '', 'week', {}, '__proto__']) assert.equal(validPlan(plan), false);
    assert.equal(validPlan('monthly'), true);
});
test('Apple monthly and annual subscriptions grant the same ACE entitlement', () => {
    assert.equal(appleBillingState(subscriber(), now).plan, 'annual');
    const state = appleBillingState(subscriber('CertChamps_ACE_Monthly'), now);
    assert.equal(state.plan, 'monthly');
    assert.equal(state.active, true);
});
test('cancellation retains paid access and marks renewal off', () => {
    const state = appleBillingState(subscriber(undefined, { unsubscribe_detected_at: past }), now);
    assert.equal(state.active, true);
    assert.equal(state.cancelAtPeriodEnd, true);
});
test('expired subscriptions revoke access', () => {
    assert.equal(appleBillingState(subscriber(undefined, {}, { expires_date: past }), now).active, false);
});
test('billing grace period retains access, but billing retry without grace does not', () => {
    const sub = { billing_issues_detected_at: past, grace_period_expires_date: future };
    assert.equal(appleBillingState(subscriber(undefined, sub, { expires_date: past }), now).status, 'grace_period');
    assert.equal(appleBillingState(subscriber(undefined, { billing_issues_detected_at: past }, { expires_date: past }), now).active, false);
});
test('a refund revokes access even if the original expiry is in the future', () => {
    assert.equal(appleBillingState(subscriber(undefined, { refunded_at: past }), now).active, false);
});
test('Stripe and test-store RevenueCat purchases cannot grant Apple access', () => {
    for (const store of ['stripe', 'test_store', 'play_store', undefined]) {
        assert.equal(appleBillingState(subscriber(undefined, { store }), now).active, false);
    }
});
test('missing entitlement and invalid subscription dates cannot grant perpetual access', () => {
    assert.equal(appleBillingState({}, now).active, false);
    for (const expires_date of [null, 'bad-date']) {
        assert.equal(appleBillingState(subscriber(undefined, {}, { expires_date }), now).active, false);
    }
});
test('Apple expiry cannot revoke an active Stripe subscription', () => {
    const result = summarizeBilling({ stripe: active, apple: { ...active, active: false } }, 'apple', now / 1000);
    assert.equal(result.isPro, true);
    assert.equal(result.paymentProvider, 'stripe');
});
test('Stripe cancellation cannot revoke active Apple access', () => {
    const result = summarizeBilling({ apple: active, stripe: { ...active, active: false } }, 'stripe', now / 1000);
    assert.equal(result.isPro, true);
    assert.equal(result.paymentProvider, 'apple');
});
test('paid-through cancellation remains active; expired cached provider state does not', () => {
    assert.equal(summarizeBilling({ apple: { ...active, cancelAtPeriodEnd: true } }, 'apple', now / 1000).isPro, true);
    assert.equal(summarizeBilling({ apple: { ...active, periodEnd: now / 1000 - 1 } }, 'stripe', now / 1000).isPro, false);
});
