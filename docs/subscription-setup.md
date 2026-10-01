# CertChamps subscriptions: setup and launch

The code supports **€4 per month** and **€40 per year**, both granting ACE. Website purchases use Stripe Checkout; the native iPad app uses Apple In-App Purchase through RevenueCat. Safari on iPad counts as the website. Apple Pay in Stripe Checkout is a wallet option, separate from App Store subscriptions.

The source changes alone do not activate billing. Complete the dashboard configuration, deploy the Firebase functions and website, and upload a new iPad build. No live products, secrets, prices or subscriptions were changed by this coding task.

## 1. App Store Connect

1. Open **My Apps → CertChamps**. Confirm the bundle ID is `com.certchamps.app`. Complete the Paid Apps agreement, banking and tax details if still outstanding.
2. Open **Subscriptions** and use one subscription group, named **CertChamps ACE**. Both durations must be in this same group and at the same subscription level because they provide identical access. Do not create separate groups for monthly and annual.
3. Configure these auto-renewable subscriptions. The identifiers are case-sensitive and match the code:

   | Reference name | Product ID | Duration | Ireland customer price |
   | --- | --- | --- | --- |
   | ACE Monthly | `CertChamps_ACE_Monthly` | 1 month | €4.00 |
   | ACE Annual | `CertChamps_ACE` | 1 year | €40.00 |

   The annual identifier already appears in this repository. Reuse it if it already exists as a one-year subscription. Do not create a duplicate annual product or change its identifier. If its existing duration is different, resolve the product mapping before release.
4. For each product, open **Subscription Prices → Add Subscription Price**, select Ireland and the target price. Expand **See Additional Prices** if necessary. Review other EUR storefronts explicitly if you want them all to charge exactly €4/€40; review Apple's converted prices for other currencies. The app displays the actual localized StoreKit price. If your account does not offer an exact requested price point, resolve that in App Store Connect before launch; the app cannot override Apple's price.
5. If the existing annual subscription is €30, schedule its new price deliberately. Preserve existing subscribers' price if you want grandfathering, or follow Apple's price-increase workflow. This code does not migrate existing subscribers automatically.
6. Add localized names/descriptions, availability, review screenshots and review notes for both products and the group. Example review path: sign in → account → Payments → Monthly/Annual. Include a review account and explain Restore purchases and Manage in App Store.
7. Keep these as ordinary renewing monthly/yearly subscriptions. Do not choose a monthly payment plan with a twelve-month commitment. Disable introductory offers for this launch unless you intentionally want different initial charges.
8. In **Users and Access → Integrations → In-App Purchase**, generate an In-App Purchase key. Download its `.p8` file once and retain its Key ID and Issuerokay ID securely. Upload these to RevenueCat in the next section. This is a different credential from an App Store Connect API key used to import product information.
9. Add both subscriptions to the app-version submission when Apple requires the first subscriptions to be reviewed with a new app version. Finish the TestFlight checks below before submission.

Apple references: [subscription levels](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information), [pricing and existing subscribers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions/), [In-App Purchase keys](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases).

## 2. RevenueCat

1. Open the existing CertChamps project and its App Store app. Confirm bundle ID `com.certchamps.app` and upload the In-App Purchase `.p8` key, Key ID and Issuer ID. Run credential validation. The installed Capacitor SDK requires this key to record StoreKit 2 purchases correctly. [RevenueCat key setup](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration).
2. Under **Product Catalog → Products**, import or manually add both App Store product IDs above. An App Store Connect API key can enable product import; manual entry is also possible.
3. Open/create the entitlement with identifier **`CertChamps ACE`** (space included). Attach **both** products. Keep legitimate legacy ACE products attached if existing customers still use them. Remove test-only products from the production entitlement before release.
4. Open/create offering **`CertChamps_ACE`** (underscore included) and configure:

   | Package | App Store product |
   | --- | --- |
   | Monthly: `$rc_monthly` | `CertChamps_ACE_Monthly` |
   | Annual: `$rc_annual` | `CertChamps_ACE` |

   Make it the default offering too. The code requests this exact offering and checks package, product and duration. A missing or misconfigured plan is unavailable; it never silently purchases another package.
5. Copy the App Store **public SDK key** (`appl_…`) into the frontend build variable `VITE_REVENUECAT_IOS_API_KEY`. This is the public app key, never the backend secret.
6. Obtain a key authorized for the **v1 `GET /subscribers/{app_user_id}`** endpoint and store it as Firebase secret `REVENUECAT_REST_API_KEY`. A RevenueCat v1 secret key works; the app-specific public SDK key is also accepted by this read endpoint. Do not use a v2-only secret key with this v1 integration. [API v1 authentication](https://www.revenuecat.com/docs/api-v1).
7. Under **Integrations → Webhooks**, create or update a webhook:
   - URL: `https://us-central1-certchamps-a7527.cloudfunctions.net/revenueCatWebhook`
   - Authorization header: `Bearer YOUR_RANDOM_SECRET`
   - Set the same random value, without `Bearer `, in Firebase secret `REVENUECAT_WEBHOOK_AUTH`.
   - Select the CertChamps App Store app and all lifecycle events, including purchases, renewals, cancellations, uncancellations, expiration, product changes, billing issues, refunds and transfers.
   - Send sandbox and production events while testing with dedicated test accounts. TestFlight purchases are sandbox transactions; avoid mixing test transactions with real customer accounts. For strict production/test isolation, use separate Firebase/RevenueCat test projects and matching endpoints/keys. This implementation accepts verified sandbox purchases as well as production purchases.
8. Copy the Apple server-notification URL shown in RevenueCat's App Store configuration into App Store Connect's **App Information → App Store Server Notifications**, for both Production and Sandbox, using Version 2. This Apple → RevenueCat URL is different from the RevenueCat → Firebase webhook URL above.
9. Review **Restore behavior**. Recommended here: **Keep with original App User ID**. Users should sign into the same CertChamps account before restoring. If you choose transfer behavior, test both old and new accounts; the webhook reconciles transferred-from and transferred-to IDs. Never use email addresses or a shared account as the RevenueCat user ID: the app uses the Firebase UID.
10. Send a dashboard test event and confirm HTTP 200. Then make an actual sandbox purchase: a test event checks delivery/authentication but does not prove that products, entitlement or purchases work. Both `revenueCatWebhook` and `verifyAppleEntitlement` need a working REST key.

RevenueCat recommends re-fetching current subscriber state after webhooks; the backend follows that approach for retries and out-of-order events. [Webhook configuration and testing](https://www.revenuecat.com/docs/integrations/webhooks), [restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).

## 3. Stripe

1. Start in Stripe's sandbox/test mode. Complete business activation before accepting live payments.
2. Create one product, **CertChamps ACE**, with two fixed recurring prices:
   - EUR **4.00**, billed every **1 month**.
   - EUR **40.00**, billed every **1 year**.
   Use fixed licensed pricing, quantity one. Copy each `price_…` ID. The server verifies the amount, currency and interval against the selected plan.
3. Keep the advertised customer total at €4/€40. Review tax settings carefully: adding exclusive tax would increase checkout totals. Automatic Stripe Tax is not enabled by this change; configure tax treatment with your accounting requirements before launch.
4. Open **Settings → Billing → Customer portal**. Enable cancellation **at the end of the billing period**, payment-method updates and invoice history. Enable subscription switching and include both prices on the same product. Leave quantity changes disabled. Review proration and downgrade scheduling; the portal must show customers the exact effective date and amount before they confirm. Prefer end-of-period changes where available. Save/activate the configuration in both test and live mode. [Stripe portal configuration](https://docs.stripe.com/customer-management/configure-portal).
5. Optionally copy the portal's `bpc_…` configuration ID into `STRIPE_PORTAL_CONFIGURATION_ID`. If omitted, the app uses Stripe's default portal configuration; that default still needs the features above enabled.
6. In **Workbench → Webhooks**, add/update the endpoint:
   `https://us-central1-certchamps-a7527.cloudfunctions.net/stripeWebhook`
   Select snapshot events using API version **`2025-02-24.acacia`**, matching this repository's Stripe SDK. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
7. Copy this endpoint's `whsec_…` signing secret to Firebase secret `STRIPE_WEBHOOK_SECRET`. Copy your test `sk_test_…` key to `STRIPE_SECRET_KEY`. Test and live secrets, price IDs and portal configurations are separate: replace them together at launch. Never put either secret in a `VITE_` variable.
8. Configure failed-payment emails/retries in Stripe. The app grants access for active/trialing subscriptions; it suspends access for past-due, unpaid, incomplete, paused and cancelled states. Customers can still open the portal to resolve payment problems. Successful payment restores access through webhooks. [Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks).
9. Stripe-hosted Checkout can offer Apple Pay on supported browsers/devices when eligible and enabled in your payment-method settings. This is separate from Apple's native App Store purchase sheet. Verify the actual wallet appears on a supported device before advertising Apple Pay. [Stripe Checkout](https://docs.stripe.com/payments/checkout).
10. Existing €30 Stripe subscribers keep their current price until you explicitly migrate them. Old checkouts created a separate product per purchase, so old subscriptions may need migration to the new shared product before portal plan switching works. Cancellation remains available. Do not silently migrate or cancel existing paying users.

Refund operations: refunding a Stripe charge alone does not cancel its subscription. When ending a membership immediately, cancel its subscription too; that lifecycle event updates access. Review disputes/refunds in Stripe. This change does not automatically cancel subscriptions from charge-refund or dispute events.

## 4. Firebase configuration and release

The deployed project in this repository is `certchamps-a7527`. Use Node 24 for backend builds, as declared in `functions/package.json`.

1. Store these secrets with Firebase CLI (each command prompts for the value):

   ```powershell
   firebase functions:secrets:set STRIPE_SECRET_KEY --project certchamps-a7527
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project certchamps-a7527
   firebase functions:secrets:set REVENUECAT_REST_API_KEY --project certchamps-a7527
   firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH --project certchamps-a7527
   ```

2. Copy `functions/.env.payments.example` to `functions/.env.certchamps-a7527` (or merge into that file if it exists), and fill the two Stripe price IDs and optional portal ID. These IDs are configuration, not secret keys. Do not overwrite other function settings.
3. Set `VITE_REVENUECAT_IOS_API_KEY=appl_…` in the frontend's local/production build environment. Rebuild whenever this value changes; Vite embeds it into the app.
4. **Verify the deployed Firestore rules before launch.** No Firestore rules file is present in this repository, so their current protections could not be checked here. Users must not be able to write `isPro`, provider/customer IDs, subscription dates, `billingSubscriptions` or other billing fields; only Admin SDK functions may change them. Apply the merge guidance in `docs/payment-firestore-rules.md` to your existing rules and test with the Rules Simulator/emulator. Do not replace the entire app's rules with the snippet.
5. On a machine with sufficient free space, run from the repository root:

   ```powershell
   npm ci
   npm --prefix functions ci
   npm --prefix functions run test:payments
   npm run build
   firebase deploy --only "functions:createProCheckout,functions:createBillingPortalSession,functions:stripeWebhook,functions:revenueCatWebhook,functions:verifyAppleEntitlement" --project certchamps-a7527
   ```

6. Publish the resulting website through the normal `app.certchamps.ie` deployment process. This repo's `npm run deploy` publishes `dist` through GitHub Pages; verify that it is still your intended production pipeline before running it. Stripe return links use `https://app.certchamps.ie/#/user/manage-account?tab=payments`.
7. On your Mac, build the same frontend with the RevenueCat public key, install the native-shell dependencies and sync:

   ```sh
   npm --prefix capacitor-shell ci
   npm --prefix capacitor-shell run sync:ios
   npm --prefix capacitor-shell run ios:open
   ```

   Ensure `CAPACITOR_LIVE_URL` is unset for TestFlight/App Store builds. In Xcode confirm the bundle ID, signing and In-App Purchase capability; build/archive and upload. The new `SubscriptionManagement` bridge is registered in the existing `MainViewController.swift` and opens Apple's native subscription-management sheet. A fresh native build is required to include it. Native compilation and device behavior must be checked on macOS/iPad.
8. Run the acceptance tests below, then submit the app version and subscriptions to Apple. Keep dashboard webhook delivery logs under observation during release and replay failed deliveries after fixing configuration.

## 5. Acceptance tests before enabling live purchases

Use a different dedicated CertChamps test account for each provider/plan where helpful. Do not create test charges on real customer accounts.

| Test | Expected result |
| --- | --- |
| Website monthly / annual purchase | Stripe shows €4/month or €40/year; paid checkout enables ACE |
| iPad monthly / annual purchase | Correct Apple product/duration/localized price; verified purchase enables ACE |
| Close/cancel checkout or Apple sheet | No ACE grant and no false success message |
| Slow webhook / return URL opened manually | UI waits for server verification; URL alone never grants ACE |
| Double-click or open checkout in two tabs | One outstanding checkout/subscription; existing customers go to management |
| Website cancellation | Portal offers cancel; access remains until paid-through date, then expires |
| iPad cancellation | Native Apple sheet offers cancel; same paid-through behavior |
| Change monthly ↔ annual | Provider shows timing/charge; access remains correct and plan updates when effective |
| Uncancel before expiry | Provider resumes renewal; cancellation flag clears |
| Renewal | Next paid-through date appears and access remains active |
| Failed renewal then recovery | Access follows provider status; portal remains available; payment recovery restores access |
| Restore after reinstall / on another iPad | Same CertChamps account restores its Apple ACE subscription |
| Web subscription used on iPad | ACE access works; management opens Stripe |
| Apple subscription used on website | ACE access works; management opens Apple's subscription page |
| Both providers active on a legacy account | Both management links available; expiry of one does not remove the other's access |
| Apple refund/expiry | RevenueCat reconciliation removes Apple access; active Stripe access remains |
| Duplicate/older webhook replay | Current provider state wins; no stale access grant or revocation |
| Invalid token/webhook signature | Request rejected, no access change |
| Missing monthly package | Monthly shows unavailable; annual is never bought by mistake |
| Delete account | Stripe cancellation uses existing deletion flow; Apple users are told to cancel with Apple separately |

Check each successful transaction in the provider dashboard, RevenueCat for Apple, and Firestore `user-data/{uid}`. Expected fields include `isPro`, `paymentProvider`, `subscriptionPlan`, `subscriptionPeriodEnd`, `subscriptionCancelAtPeriodEnd`, and `billingSubscriptions.stripe` / `.apple`. Stripe customer IDs and legacy transaction maps must remain server-owned.

Separate Stripe and Apple purchases cannot be atomically locked across the two stores. The UI blocks new purchases when ACE is already active; verify rare simultaneous purchases manually. For testing, do not buy a second provider intentionally on the same account unless testing that specific edge case.

## Local validation note

The frontend TypeScript stage passed during this task. The full frontend bundle failed from memory exhaustion while the C: drive was full. The backend build initially found missing pre-existing thumbnail dependencies; reinstalling them also ran out of disk. The incomplete `functions/node_modules` installation was removed to recover space. Restore it with `npm --prefix functions ci` before running the full backend build/deploy. The final frontend type check passed. The payment tests run against current source with simulated provider responses; 22 tests passed. These tests do not replace full builds or live sandbox/device validation. Live billing and native Apple testing require the dashboard setup and a device build above.
