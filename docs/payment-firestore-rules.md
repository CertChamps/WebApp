# Merge billing protections into your existing Firestore rules

This repository does not contain the deployed Firestore rules. Before launch, inspect them in Firebase and merge these protections into the existing `user-data/{uid}` create/update conditions. Keep the app's other validation and access rules. These are examples to merge, not a complete replacement ruleset.

```text
function billingFields() {
  return [
    'isPro', 'paymentProvider', 'subscriptionPlan', 'subscriptionPeriodEnd',
    'subscriptionCancelAtPeriodEnd', 'billingSubscriptions',
    'stripeCustomerId', 'stripeSubscriptionId', 'stripeCheckoutSessionId',
    'appleOriginalTransactionId', 'appleProductId', 'googleProductId'
  ];
}

// Add this condition to EVERY existing rule allowing updates to user-data.
function leavesBillingUnchanged() {
  return !request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(billingFields());
}

// The existing sign-up code creates isPro:false. Allow that default but
// disallow client-supplied provider IDs, entitlements or subscription dates.
function safeInitialBilling() {
  return request.resource.data.get('isPro', false) == false
    && !request.resource.data.keys().hasAny([
      'paymentProvider', 'subscriptionPlan', 'subscriptionPeriodEnd',
      'subscriptionCancelAtPeriodEnd', 'billingSubscriptions',
      'stripeCustomerId', 'stripeSubscriptionId', 'stripeCheckoutSessionId',
      'appleOriginalTransactionId', 'appleProductId', 'googleProductId'
    ]);
}
```

Your owner update permission should require authentication, ownership, its existing profile validation **and** `leavesBillingUnchanged()`. Owner creation should include `safeInitialBilling()`. Restrict client deletion of the root account document; account removal should go through the authenticated `deleteAccount` function so billing is handled. Admin SDK functions bypass these client rules and can still update subscriptions.

These collections are only for backend use:

```text
match /stripe_subscriptions/{id} { allow read, write: if false; }
match /apple_subscriptions/{id} { allow read, write: if false; }
match /billing_checkout_locks/{id} { allow read, write: if false; }
```

Firestore combines matching `allow` rules with OR. Adding a restrictive rule does not override an existing permissive catch-all. Remove or narrow any broader rule that lets a client write these documents or fields. Also protect `isAdmin` and other privilege fields using the app's existing role policy.

Verify in the Rules Simulator or emulator:

- Signed-out writes fail.
- User A cannot modify user B's profile/billing data.
- A new account can set `isPro:false`, but not true or a provider/customer ID.
- An owner can edit allowed profile fields without modifying billing fields.
- Adding/removing/replacing a billing field or nested entitlement fails.
- Client writes to all three private collections fail.
- Backend webhooks can update state through the Admin SDK.

Reference: [Firestore rules for restricting fields](https://firebase.google.com/docs/firestore/security/rules-fields).
