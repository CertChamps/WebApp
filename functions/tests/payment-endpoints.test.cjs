const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-source.cjs');
const policy = load('src/payments/policy.ts');

function fixture() {
    const docs = new Map([['user-data/user1', { isPro: false }]]);
    const ref = path => ({ path, async get() { return snap(path); }, async update(data) {
        if (!docs.has(path)) throw new Error('Missing document');
        docs.set(path, { ...docs.get(path), ...data });
    }, async set(data) { docs.set(path, data); } });
    const snap = path => ({ exists: docs.has(path), data: () => docs.get(path) });
    const db = {
        doc: ref,
        async runTransaction(callback) { return callback({
            get: r => r.get(),
            set: (r, data, options) => docs.set(r.path, options?.merge ? { ...docs.get(r.path), ...data } : data),
            delete: r => docs.delete(r.path),
        }); },
    };
    const admin = { firestore: () => db, auth: () => ({ verifyIdToken: async token => {
        if (token !== 'good') throw new Error('Invalid token');
        return { uid: 'user1' };
    } }) };
    const state = load('src/payments/state.ts', { 'firebase-admin': admin, './policy': policy });
    const calls = { checkout: [], expired: [], portal: [] };
    let subscriptions = [];
    let currentEvent;
    const session = { id: 'cs_1', url: 'https://checkout.stripe.test/session', status: 'open', allow_promotion_codes: true, metadata: { plan: 'monthly', priceId: 'price_month' } };
    const client = {
        prices: { retrieve: async id => ({ active: true, currency: 'eur', unit_amount: id === 'price_month' ? 400 : 4000,
            recurring: { interval: id === 'price_month' ? 'month' : 'year', interval_count: 1, usage_type: 'licensed' } }) },
        customers: { create: async () => ({ id: 'cus_1' }), retrieve: async () => ({ id: 'cus_1', metadata: { firebaseUid: 'user1' } }) },
        subscriptions: { list: () => {
            const result = Promise.resolve({ data: subscriptions });
            result[Symbol.asyncIterator] = async function* () { yield* subscriptions; };
            return result;
        } },
        checkout: { sessions: {
            create: async params => { calls.checkout.push(params); return { ...session, metadata: params.metadata }; },
            retrieve: async () => session,
            expire: async id => { calls.expired.push(id); },
        } },
        billingPortal: { sessions: { create: async params => { calls.portal.push(params); return { url: 'https://billing.stripe.test/portal' }; } } },
        webhooks: { constructEvent: (_body, sig) => { if (sig !== 'valid') throw new Error('Bad signature'); return currentEvent; } },
    };
    class Stripe { constructor() { return client; } }
    const endpoints = load('src/payments/stripe.ts', {
        'firebase-functions/v2': { https: { onRequest: (_options, handler) => handler } },
        'firebase-admin': admin, stripe: Stripe, './policy': policy, './state': state,
    });
    process.env.STRIPE_MONTHLY_PRICE_ID = 'price_month';
    process.env.STRIPE_ANNUAL_PRICE_ID = 'price_year';
    process.env.STRIPE_SECRET_KEY = 'test-only';
    process.env.STRIPE_WEBHOOK_SECRET = 'test-only';
    async function request(name, body = {}, headers = {}) {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; }, end() {} };
        await endpoints[name]({ method: 'POST', body: { idToken: 'good', ...body }, headers, rawBody: Buffer.from('test') }, res);
        return res;
    }
    return { docs, calls, client, request, state, admin, setSubscriptions: value => { subscriptions = value; }, setEvent: value => { currentEvent = value; } };
}

test('checkout selects each trusted Stripe price and ignores client-controlled amounts/return URLs', async () => {
    for (const [plan, price] of [['monthly', 'price_month'], ['annual', 'price_year']]) {
        const f = fixture();
        assert.equal((await f.request('createProCheckout', { plan, amount: 1, successUrl: 'https://attacker.test' })).statusCode, 200);
        assert.equal(f.calls.checkout[0].line_items[0].price, price);
        assert.equal(f.calls.checkout[0].allow_promotion_codes, true);
        assert.match(f.calls.checkout[0].success_url, /^https:\/\/app\.certchamps\.ie\//);
        assert.equal(f.calls.checkout[0].subscription_data.metadata.firebaseUid, 'user1');
    }
});
test('invalid auth/plan and existing ACE never create checkout', async () => {
    const f = fixture();
    assert.equal((await f.request('createProCheckout', { idToken: 'bad' })).statusCode, 401);
    assert.equal((await f.request('createProCheckout', { plan: 'weekly' })).statusCode, 400);
    f.docs.set('user-data/user1', { isPro: true });
    assert.equal((await f.request('createProCheckout', { plan: 'monthly' })).statusCode, 409);
    assert.equal(f.calls.checkout.length, 0);
});
test('same-plan retries reuse open checkout; switching plans expires it', async () => {
    const f = fixture();
    f.docs.set('user-data/user1', { isPro: false, stripeCustomerId: 'cus_1', stripeCheckoutSessionId: 'cs_1' });
    await f.request('createProCheckout', { plan: 'monthly' });
    assert.equal(f.calls.checkout.length, 0);
    await f.request('createProCheckout', { plan: 'annual' });
    assert.deepEqual(f.calls.expired, ['cs_1']);
    assert.equal(f.calls.checkout[0].line_items[0].price, 'price_year');
});
test('checkout replaces a legacy session without promotion-code entry', async () => {
    const f = fixture();
    f.docs.set('user-data/user1', { isPro: false, stripeCustomerId: 'cus_1', stripeCheckoutSessionId: 'cs_1' });
    const retrieve = f.client.checkout.sessions.retrieve;
    f.client.checkout.sessions.retrieve = async () => ({ ...await retrieve(), allow_promotion_codes: null });
    assert.equal((await f.request('createProCheckout', { plan: 'monthly' })).statusCode, 200);
    assert.deepEqual(f.calls.expired, ['cs_1']);
    assert.equal(f.calls.checkout[0].allow_promotion_codes, true);
});

test('concurrent checkout attempt is rejected while the first holds its lease', async () => {
    const f = fixture();
    const retrieve = f.client.prices.retrieve;
    let release;
    let started;
    const didStart = new Promise(resolve => { started = resolve; });
    f.client.prices.retrieve = async id => {
        started();
        await new Promise(resolve => { release = resolve; });
        return retrieve(id);
    };
    const first = f.request('createProCheckout', { plan: 'monthly' });
    await didStart;
    assert.equal((await f.request('createProCheckout', { plan: 'monthly' })).statusCode, 409);
    release();
    assert.equal((await first).statusCode, 200);
    assert.equal(f.calls.checkout.length, 1);
});
test('portal still works for an expired subscriber and uses the stored customer', async () => {
    const f = fixture();
    f.docs.set('user-data/user1', { isPro: false, stripeCustomerId: 'cus_1' });
    assert.equal((await f.request('createBillingPortalSession', { customer: 'cus_other' })).statusCode, 200);
    assert.equal(f.calls.portal[0].customer, 'cus_1');
});
test('out-of-order Stripe deletion reconciles current active subscription and cancel flag', async () => {
    const f = fixture();
    f.setSubscriptions([{ id: 'sub_new', metadata: { firebaseUid: 'user1' }, status: 'active', current_period_end: Date.now() / 1000 + 5000,
        cancel_at_period_end: true, items: { data: [{ price: { recurring: { interval: 'month' } } }] } }]);
    f.setEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', customer: 'cus_1', metadata: { firebaseUid: 'user1' } } } });
    assert.equal((await f.request('stripeWebhook', {}, { 'stripe-signature': 'valid' })).statusCode, 200);
    const user = f.docs.get('user-data/user1');
    assert.equal(user.isPro, true);
    assert.equal(user.subscriptionPlan, 'monthly');
    assert.equal(user.subscriptionCancelAtPeriodEnd, true);
});
test('invalid Stripe signature cannot change access', async () => {
    const f = fixture();
    assert.equal((await f.request('stripeWebhook', {}, { 'stripe-signature': 'bad' })).statusCode, 400);
    assert.equal(f.docs.get('user-data/user1').isPro, false);
});
test('reconciliation preserves legacy other-provider access and never recreates deleted users', async () => {
    const f = fixture();
    const expired = { active: false, plan: null, periodEnd: null, cancelAtPeriodEnd: false, status: 'expired' };
    f.docs.set('user-data/user1', { isPro: true, stripeCustomerId: 'cus_1', subscriptionPeriodEnd: Date.now() / 1000 + 5000 });
    await f.state.reconcileBilling('user1', 'apple', async () => ({ state: expired }));
    assert.equal(f.docs.get('user-data/user1').isPro, true);
    assert.equal(f.docs.get('user-data/user1').paymentProvider, 'stripe');
    f.docs.delete('user-data/user1');
    const result = await f.state.reconcileBilling('user1', 'stripe', async () => { throw new Error('Should not load'); });
    assert.equal(result, null);
    assert.equal(f.docs.has('user-data/user1'), false);
});

function appleFixture() {
    const f = fixture();
    const records = new Map();
    const endpoints = load('src/iap/revenueCatWebhook.ts', {
        'firebase-functions/v2': { https: { onRequest: (_options, handler) => handler } },
        'firebase-admin': f.admin, '../payments/policy': policy, '../payments/state': f.state,
        'node-fetch': async url => {
            const uid = decodeURIComponent(url.split('/').pop());
            return { ok: true, json: async () => ({ subscriber: records.get(uid) ?? {} }) };
        },
    });
    process.env.REVENUECAT_WEBHOOK_AUTH = 'test-secret';
    async function deliver(event, authorization = 'Bearer test-secret') {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
            send() { return this; }, end() {}, json() { return this; } };
        await endpoints.revenueCatWebhook({ method: 'POST', body: { event }, headers: { authorization } }, res);
        return res;
    }
    return { ...f, records, deliver };
}
function currentApple(cancelled = false) {
    const future = new Date(Date.now() + 86400000).toISOString();
    return {
        entitlements: { 'CertChamps ACE': { product_identifier: 'CertChamps_ACE_Monthly', expires_date: future } },
        subscriptions: { CertChamps_ACE_Monthly: { store: 'app_store', expires_date: future,
            unsubscribe_detected_at: cancelled ? new Date().toISOString() : null } },
    };
}
test('Apple cancellation and stale expiration use current verified subscriber state', async () => {
    const f = appleFixture();
    f.records.set('user1', currentApple(true));
    assert.equal((await f.deliver({ type: 'CANCELLATION', store: 'APP_STORE', app_user_id: 'user1' })).statusCode, 200);
    assert.equal(f.docs.get('user-data/user1').isPro, true);
    assert.equal(f.docs.get('user-data/user1').subscriptionCancelAtPeriodEnd, true);
    await f.deliver({ type: 'EXPIRATION', store: 'APP_STORE', app_user_id: 'user1' });
    assert.equal(f.docs.get('user-data/user1').isPro, true);
});
test('Apple transfer revokes old account and grants new account from current state', async () => {
    const f = appleFixture();
    f.docs.set('user-data/user1', { isPro: true, paymentProvider: 'apple' });
    f.docs.set('user-data/user2', { isPro: false });
    f.records.set('user2', currentApple());
    await f.deliver({ type: 'TRANSFER', transferred_from: ['user1'], transferred_to: ['user2'] });
    assert.equal(f.docs.get('user-data/user1').isPro, false);
    assert.equal(f.docs.get('user-data/user2').isPro, true);
});
test('Apple authorization is required and unrelated stores do not touch access', async () => {
    const f = appleFixture();
    f.records.set('user1', currentApple());
    assert.equal((await f.deliver({ type: 'INITIAL_PURCHASE', app_user_id: 'user1' }, 'Bearer wrong')).statusCode, 401);
    await f.deliver({ type: 'INITIAL_PURCHASE', app_user_id: 'user1', store: 'STRIPE' });
    assert.equal(f.docs.get('user-data/user1').isPro, false);
});
