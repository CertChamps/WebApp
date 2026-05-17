# Apple In-App Purchase setup for CertChamps ACE

This guide walks through every external account / config step required to
make the **iPad Apple IAP** flow work end-to-end alongside the existing
**web Stripe** flow. The code in this repo is already wired — what
remains is the dashboard work.

> **TL;DR architecture.** On web (and on Android Capacitor today) the
> upgrade button hits `createProCheckout` and goes through Stripe. On
> Capacitor iOS, the upgrade button calls `Purchases.purchasePackage()`
> (RevenueCat SDK) which opens Apple's StoreKit sheet. RevenueCat
> verifies the receipt with Apple, then posts a webhook to our
> `revenueCatWebhook` Firebase Function, which writes the **same**
> `isPro`, `subscriptionPeriodEnd`, `paymentProvider` fields on
> `user-data/{uid}` that the Stripe webhook writes. The rest of the app
> doesn't know or care which provider charged the user.

## Inventory of moving parts

| Piece | Where it lives | What it does |
| --- | --- | --- |
| Subscription product | **App Store Connect** | The actual sellable item Apple charges through. |
| App ID + IAP capability | **Apple Developer portal** + **Xcode** | Authorises your bundle id to sell IAPs. |
| In-App Purchase Key (`.p8`) | **App Store Connect** → Users and Access → Integrations | Lets RevenueCat ask Apple's StoreKit Server for receipts. |
| App-Specific Shared Secret | **App Store Connect** → App → App Information | Legacy verification path RevenueCat also uses. |
| RevenueCat project + app | **RevenueCat dashboard** | Receipt validation, subscription state of record, webhooks. |
| RevenueCat public iOS API key | **RC dashboard** → API keys | Bundled into the iOS app (`appl_...`). Safe to ship. |
| RevenueCat REST API key | **RC dashboard** → API keys | Server-side secret for `verifyAppleEntitlement`. Never bundle. |
| RevenueCat webhook auth | **RC dashboard** → Integrations → Webhooks | Bearer token RevenueCat sends to our Firebase Function. We invent it. |
| Firebase Function secrets | **Firebase CLI** | Holds the two RevenueCat secrets above. |
| Apple App Store Server Notifications V2 | **App Store Connect** → App → App Information → URLs | Pointed at RevenueCat (not at us). RC handles all parsing. |

## Step 0 — Prerequisites

You need:

- **Apple Developer Program** membership ($99/year) in good standing.
- **App Store Connect** access for `com.certchamps.app`.
- The bank/tax/contracts modules in App Store Connect must be
  **completed**, otherwise paid in-app products will be stuck in
  "Ready to Submit" / "Missing Metadata" and StoreKit will return an
  empty offering.
- A **RevenueCat** account → <https://app.revenuecat.com/signup>. Free
  tier covers up to $2.5K MTR.
- Firebase CLI logged in to the `certchamps-a7527` project
  (`firebase use certchamps-a7527`).

## Step 1 — Create the subscription in App Store Connect

1. Go to <https://appstoreconnect.apple.com/> → Apps → **CertChamps**.
2. Sidebar → **Subscriptions** (under "Monetization").
3. Create a **Subscription Group**: `CertChamps ACE`.
   (Subscriptions must live inside a group even if you only have one.)
4. Inside the group, **Create Subscription**:
   - **Reference Name**: `ACE Yearly`
   - **Product ID**: `certchamps_ace_yearly`
     **(must match the constant `ACE_PRODUCT_IDENTIFIER` in
     `src/lib/payments/applePayment.ts`)**
5. Set **Duration**: `1 Year`.
6. Add **Subscription Prices**:
   - Base price: **€30.00** in Ireland.
   - Apple will auto-fill the equivalent for every other storefront.
     Review the matrix before you save.
7. Add **App Store Localization** for at least English (Ireland):
   - **Display Name**: `CertChamps ACE`
   - **Description**: a couple of sentences — Apple requires this.
8. Save. The product status will be **Ready to Submit** /
   **Missing Metadata** until you upload a build that contains it.
   That's fine — sandbox testing works as soon as the product is
   created.

## Step 2 — Apple Developer portal capability

1. <https://developer.apple.com/account/resources/identifiers/> → pick
   the **App ID** `com.certchamps.app`.
2. **Capabilities** → enable **In-App Purchase**. Save.
3. (Already done in this repo: the **Sign in with Apple** capability.)
4. Regenerate the **Provisioning Profile** for the app (Apple does this
   automatically if you use Automatic Signing in Xcode — just open
   Xcode once after this step so it refreshes).

## Step 3 — Enable IAP capability in Xcode

1. Open `capacitor-shell/ios/App/App.xcworkspace` on your Mac.
2. Select the **App** target → **Signing & Capabilities** tab.
3. Click **+ Capability** → add **In-App Purchase**.
4. Xcode will modify `App.entitlements` automatically (you'll see
   `com.apple.developer.in-app-payments` added). Commit that file.

## Step 4 — Create the RevenueCat project

1. <https://app.revenuecat.com/> → **Create new project** → name it
   `CertChamps`.
2. Inside the project, **Apps** → **+ New** → **App Store**:
   - **App name**: `CertChamps iOS`
   - **Bundle ID**: `com.certchamps.app`
   - Leave the App-Specific Shared Secret + In-App Purchase Key blank
     for now — we'll come back to them.
3. Note the **public API key** for this app
   (starts with `appl_…`) — we'll plug it into `.env.local` shortly.

## Step 5 — Connect Apple ↔ RevenueCat (two credentials)

RevenueCat needs two things from Apple before it can verify a receipt:

### 5a. App-Specific Shared Secret (legacy receipt verification)

1. App Store Connect → **CertChamps** app → **App Information** (left
   sidebar) → **App-Specific Shared Secret** → **Manage** → **Generate**.
2. Copy the secret.
3. RevenueCat dashboard → your iOS app → **App Configuration** →
   paste under **App-Specific Shared Secret** → **Save**.

### 5b. In-App Purchase Key (StoreKit 2 / Server API)

1. App Store Connect → **Users and Access** → **Integrations** tab →
   **In-App Purchase** → **+** to create a new key.
2. Name it `RevenueCat`. **Download the `.p8` file** — Apple only lets
   you download it once.
3. Note the **Key ID** and your **Issuer ID** (top of the page).
4. RevenueCat dashboard → your iOS app → **App Configuration** →
   **In-App Purchase Key Configuration** → upload the `.p8`, paste the
   Key ID and Issuer ID → **Save**.

> Without 5b RevenueCat falls back to the legacy `verifyReceipt`
> endpoint, which works but is slower and gives RC less data. Doing
> both is strongly recommended.

## Step 6 — Point Apple's Server Notifications V2 at RevenueCat

1. RevenueCat dashboard → your iOS app → **App Configuration** → copy
   the **App Store Server Notifications V2 URL** for **Production** and
   **Sandbox**.
2. App Store Connect → **CertChamps** app → **App Information** →
   **App Store Server Notifications**:
   - **Production Server URL Version 2**: paste the production URL.
   - **Sandbox Server URL Version 2**: paste the sandbox URL.
3. Save.

This is critical — without it, renewals/cancellations/refunds will not
flow through to RevenueCat (and therefore not through to our webhook
and not to Firestore).

## Step 7 — Create the entitlement + offering in RevenueCat

1. RevenueCat dashboard → **Entitlements** → **+ New**:
   - **Identifier**: `ace`
     **(must match `ACE_ENTITLEMENT_ID` in
     `src/lib/payments/applePayment.ts` and
     `functions/src/iap/revenueCatWebhook.ts`)**
   - **Display name**: `CertChamps ACE`
2. **Products** → **+ New product**:
   - **Identifier**: `certchamps_ace_yearly` (must match Step 1).
   - **Store**: App Store.
   - Attach the `ace` entitlement.
3. **Offerings** → **+ New offering**:
   - **Identifier**: `default`
     **(must match `ACE_OFFERING_IDENTIFIER` in
     `src/lib/payments/applePayment.ts`)**
   - Mark it as **Current**.
   - Inside it, **+ Add package** → choose `$rc_annual` and attach
     the `certchamps_ace_yearly` product.

## Step 8 — Configure the RevenueCat webhook

1. RevenueCat dashboard → **Project Settings** → **Integrations** →
   **Webhooks** → **+ New**:
   - **URL**:
     `https://us-central1-certchamps-a7527.cloudfunctions.net/revenueCatWebhook`
   - **Authorization Header**: pick a long random string (we'll call it
     `<WEBHOOK_AUTH>`). Tip: `openssl rand -hex 32`.
   - **Header style**: `Bearer <token>` (the code accepts the bare
     string or `Bearer <…>`).
   - **Events**: enable **All** (the webhook ignores types it doesn't
     care about).

2. Save.

## Step 9 — Get the RevenueCat REST API key

1. RevenueCat dashboard → **Project Settings** → **API keys** →
   **+ New Secret API Key**.
2. Name it `firebase-functions`. **Scope**: at minimum `Read customers`.
3. Copy the value (starts with `sk_…`). We'll call it
   `<REST_API_KEY>`.

## Step 10 — Set Firebase Function secrets

From the repo root, with `firebase login` done and `.firebaserc`
pointed at `certchamps-a7527`:

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
# paste <WEBHOOK_AUTH> from step 8

firebase functions:secrets:set REVENUECAT_REST_API_KEY
# paste <REST_API_KEY> from step 9
```

Then deploy the new functions:

```bash
firebase deploy --only functions:revenueCatWebhook,functions:verifyAppleEntitlement
```

(Or just `firebase deploy --only functions` to deploy everything.)

## Step 11 — Add the public API key to the iOS bundle

Edit (or create) `.env.local` in the repo root:

```bash
VITE_REVENUECAT_IOS_API_KEY=appl_REPLACE_ME_PUBLIC_KEY
```

This key is public — it's safe to ship in the iOS bundle. The secret
key from Step 9 stays in Firebase Functions only.

Rebuild the web bundle so Capacitor picks it up:

```bash
npm run build
cd capacitor-shell
npx cap sync ios
```

## Step 12 — Add IAP product to a build & sandbox-test on a real iPad

You **cannot** test IAP in the simulator with a real App Store account.
Use a sandbox tester on a real device.

1. App Store Connect → **Users and Access** → **Sandbox Testers** →
   **+** → create a fresh tester (use a brand-new email you control).
   Do NOT sign this account into your iCloud — it's only used at the
   point of purchase.
2. On the iPad, **Settings** → **App Store** → scroll to **Sandbox
   Account** → sign in with the sandbox tester.
3. Build and run the iOS shell to the iPad via Xcode (Product → Run).
4. Sign in to CertChamps → go to **Manage Account** → **Payments** →
   tap **Get ACE**. Apple's StoreKit sheet should appear with
   "Environment: Sandbox" at the top.
5. Confirm. Within a few seconds:
   - The local UI flips to "Active subscription".
   - The Firebase Function log
     (`firebase functions:log --only verifyAppleEntitlement`) shows
     a 200.
   - `user-data/{uid}` in Firestore shows `isPro: true`,
     `paymentProvider: "apple"`, and a `subscriptionPeriodEnd`.
   - Within ~30s, the RevenueCat dashboard → Customers shows the new
     subscriber, and `firebase functions:log --only revenueCatWebhook`
     shows an `INITIAL_PURCHASE` 200.

## Step 13 — Submit IAP product for review with the build

When you ship to the App Store:

1. The subscription product needs to be **submitted with a build** the
   first time. In App Store Connect → app → **App Store** tab → your
   build → **In-App Purchases and Subscriptions** → **+** → tick
   `certchamps_ace_yearly`. Save.
2. **Review notes**: tell Apple "Subscription required to access ACE
   features. Sandbox tester credentials: [email] / [password]." Apple
   rejects subscription IAPs without working test credentials.
3. Submit.

## Step 14 — Day-2 operations

| What happens | Result in our schema |
| --- | --- |
| User subscribes on web Stripe | `paymentProvider: "stripe"`, `stripeCustomerId` set, `isPro: true` |
| User subscribes on iPad Apple | `paymentProvider: "apple"`, `appleOriginalTransactionId` + `appleProductId` set, `isPro: true` |
| Stripe renews | Stripe webhook bumps `subscriptionPeriodEnd` |
| Apple renews | RevenueCat webhook bumps `subscriptionPeriodEnd` |
| User cancels auto-renew (Stripe portal) | Webhook leaves `isPro: true` until period end, then `false` |
| User cancels auto-renew (iOS Settings) | RevenueCat `CANCELLATION` event refreshes period end. `EXPIRATION` event later sets `isPro: false` |
| Apple refund | RevenueCat fires `EXPIRATION` immediately → `isPro: false` |

**Cross-device behaviour.** A user who subscribes on iPad and then
opens the web app sees they're already Pro (Firestore source of truth).
The "Manage subscription" button on web routes to **Apple subscriptions
URL** because `paymentProvider === "apple"`. The reverse works the same
way. The UI never lets a user double-subscribe through the second
provider because the upgrade card hides when `isPro: true`.

## Step 15 — Smoke-test cancellation

In sandbox, Apple compresses the subscription period from 1 year to
~5 minutes, so a renewal/cancel cycle is fast to test:

1. With the sandbox tester subscribed, on iPad: **Settings** → tap your
   sandbox Apple ID at the top → **Subscriptions** → **CertChamps ACE**
   → **Cancel Subscription**.
2. Within ~30s, RevenueCat dashboard shows `CANCELLATION` event and
   `firebase functions:log --only revenueCatWebhook` shows a 200.
3. Wait for the sandbox expiration (5–10 min). The webhook fires
   `EXPIRATION`, and `user-data/{uid}.isPro` flips to `false`. UI gates
   re-engage on next app refresh.

## Common pitfalls

- **`offerings.current` is null in the app.** Almost always one of:
  product not approved, missing localized metadata, bank/tax/contracts
  agreements not signed in App Store Connect, or the iPad isn't signed
  into a sandbox tester. RevenueCat's diagnostics page in their dash
  pinpoints which one.
- **Webhook returns 401.** The Authorization header doesn't match the
  Firebase secret. Re-set the secret, re-deploy, and re-check the
  RC dashboard header.
- **`isPro` flips off mid-period.** Almost always means
  Apple's V2 Server Notifications URL (Step 6) wasn't filled in —
  RevenueCat then thinks the sub expired because it never got a
  renewal event.
- **Apple rejects review with "Guideline 3.1.1 — Payments".** That's
  what happens if Stripe is still reachable from inside the iOS build.
  Our dispatcher prevents this — confirm in Safari Web Inspector on the
  iPad that tapping "Get ACE" calls `Purchases.purchasePackage`, not
  `createProCheckout`.
- **Android Capacitor build on Play Store.** Today this still routes to
  Stripe — Google will reject. When you ship Android, change
  `getPaymentProvider()` in `src/lib/payments/index.ts` so
  `getPlatform() === "android"` also routes to `appleProvider`
  (it's a misnomer at that point — rename it to `iapProvider`). The
  RevenueCat SDK already covers Play Billing.
