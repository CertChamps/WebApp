# Stripe setup – run these on your machine

**Both secrets must be set before `firebase deploy --only functions`.** If you see "STRIPE_WEBHOOK_SECRET not found", complete step 2 below (add webhook in Stripe, then set the secret).

You must be logged in to Firebase first. In a terminal:

```bash
firebase login
```

Then run these from `/home/cian/Documents/CertChamps/WebApp`.

---

## 1. Set Stripe secret key

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

When prompted, paste your **secret** key (starts with `sk_test_...`).

---

## 2. Add webhook in Stripe, then set webhook secret

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **Add endpoint**
3. **Endpoint URL:**  
   `https://us-central1-certchamps-a7527.cloudfunctions.net/stripeWebhook`
4. Under events, add **checkout.session.completed**
5. Create the endpoint, then open it and **Reveal** the **Signing secret** (`whsec_...`)

Then in terminal:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Paste the signing secret when prompted.

---

## 3. Deploy functions

```bash
firebase deploy --only functions
```

---

## Security

If you shared your Stripe secret key in chat or in a file, **rotate it** in Stripe:

- https://dashboard.stripe.com/test/apikeys → find the key → **Roll key** or create a new one and revoke the old one.

Then set the new secret again:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

The **publishable** key (`pk_test_...`) is safe to use in frontend code; only the **secret** key must stay private.