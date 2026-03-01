# 🚀 Launch Checklist — Covered Calls Manager

Everything you need to go from this project to live users in a browser.
Follow these steps in order. Each one takes 5–30 minutes.

---

## STEP 1: Create a Production Firebase Project (15 min)

You need a **separate** Firebase project from your dev/emulator one.

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add Project** → name it `covered-calls-prod` (or whatever you want)
3. Disable Google Analytics (or enable — your choice, you have custom analytics)
4. Once created, click **Build → Authentication**
   - Click **Get Started**
   - Enable **Email/Password** provider
5. Click **Build → Firestore Database**
   - Click **Create Database**
   - Choose **Start in production mode**
   - Pick `us-central1` (or closest region)
6. Click **Project Settings** (gear icon) → **Your Apps** → **Web** (</> icon)
   - Register app name: `Covered Calls Manager`
   - Copy the `firebaseConfig` values — you'll need them in Step 3

---

## STEP 2: Register a Domain (10 min)

Buy a domain from any registrar (Namecheap, Google Domains, Cloudflare, etc).

Suggestions: `coveredcalls.app`, `coveredcallsmanager.com`, `ccmanager.io`

> **If you want to skip this for now:** Firebase gives you a free URL at
> `your-project.web.app` and `your-project.firebaseapp.com`. You can always
> add a custom domain later.

---

## STEP 3: Configure Environment Variables (5 min)

In the project root, create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your Firebase config values from Step 1:

```
VITE_FB_API_KEY=AIzaSy...your-real-key
VITE_FB_AUTH_DOMAIN=covered-calls-prod.firebaseapp.com
VITE_FB_PROJECT_ID=covered-calls-prod
VITE_FB_STORAGE_BUCKET=covered-calls-prod.appspot.com
VITE_FB_MESSAGING_ID=123456789
VITE_FB_APP_ID=1:123456789:web:abc123
```

---

## STEP 4: Set Up Stripe (20 min)

### 4a. Create Stripe Account
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Sign up
2. Stay in **Test Mode** for now (toggle in top-right)

### 4b. Create Your Product
1. Go to **Products** → **Add Product**
   - Name: `Covered Calls Manager Pro`
   - Description: `Full access to scored covered call recommendations`
2. Add a **Price**:
   - Monthly: `$10.00` (or your chosen price)
   - Billing period: Monthly
3. Click **Create Product**
4. Copy the **Price ID** (starts with `price_...`)

### 4c. Create Webhook Endpoint
1. Go to **Developers → Webhooks** → **Add endpoint**
2. For now, leave the URL blank — you'll fill it in after deploying functions (Step 6)
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the **Signing Secret** (starts with `whsec_...`)

### 4d. Get Your Secret Key
1. Go to **Developers → API Keys**
2. Copy the **Secret key** (starts with `sk_test_...`)

### 4e. Configure Functions Environment
```bash
cd functions
cp .env.example .env
```

Edit `functions/.env`:
```
STRIPE_SECRET_KEY=sk_test_...your_key
STRIPE_WEBHOOK_SECRET=whsec_...your_signing_secret
STRIPE_PRICE_ID=price_...your_price_id
APP_URL=https://covered-calls-prod.web.app
```

> **Change `APP_URL`** to your custom domain once configured (e.g., `https://coveredcalls.app`)

---

## STEP 5: Install Dependencies (2 min)

```bash
# Root (frontend)
npm install

# Functions (backend)
cd functions
npm install
cd ..
```

---

## STEP 6: Deploy Everything (10 min)

### 6a. Log in to Firebase CLI
```bash
firebase login
firebase use covered-calls-prod
```

> If this is a new machine: `npm install -g firebase-tools` first.

### 6b. Deploy Firestore Rules + Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 6c. Deploy Cloud Functions
```bash
firebase deploy --only functions
```

After this succeeds, note the **stripeWebhook URL** in the output. It looks like:
```
✔ functions[stripeWebhook(us-central1)]: Successful create
   https://us-central1-covered-calls-prod.cloudfunctions.net/stripeWebhook
```

**Go back to Stripe Dashboard → Webhooks → your endpoint → Update URL** with this.

### 6d. Build & Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

### 6e. Verify It's Live
Visit `https://covered-calls-prod.web.app` (or your custom domain).
You should see the login screen.

---

## STEP 7: Add Custom Domain (Optional, 15 min)

1. In Firebase Console → **Hosting** → **Add custom domain**
2. Enter your domain (e.g., `coveredcalls.app`)
3. Firebase gives you DNS records to add at your registrar:
   - Usually a TXT record (for verification)
   - An A record pointing to Firebase's IP
4. Add the records at your registrar
5. Wait for DNS propagation (usually 10–30 minutes, sometimes up to 24 hours)
6. Firebase auto-provisions an SSL certificate

> **Update your `functions/.env`**: Change `APP_URL` to `https://coveredcalls.app`
> then redeploy functions: `firebase deploy --only functions`

---

## STEP 8: Create Your Owner Account (5 min)

1. Visit your live site
2. Sign up with your email
3. Complete onboarding
4. Open the Firebase Console → **Firestore** → `users` collection
5. Find your user document → click **Edit**
6. Add field: `role` = `owner` (string)
7. Save

You now have full admin panel access at `/admin` in the app.

---

## STEP 9: Test the Full Flow (15 min)

### Free trial flow:
1. Open an **incognito window**
2. Sign up with a test email
3. Complete onboarding → you should land on the dashboard
4. Search a symbol (e.g., AAPL) → verify recommendations load
5. Click a contract → verify it saves to history
6. Go to `/history` → verify entry shows with contract details
7. Click the entry → verify it returns to dashboard with contract expanded

### Payment flow (test mode):
1. In Firebase Console, find your test user's doc
2. Change `trialStart` to a date 8+ days ago (forces expiration)
3. Refresh the app → should redirect to paywall
4. Click **Subscribe Now** → should redirect to Stripe Checkout
5. Use test card: `4242 4242 4242 4242`, any future date, any CVC
6. After payment → should redirect back with `?checkout=success`
7. Verify Firestore user doc now has `subscriptionStatus: "active"`

### Admin panel:
1. Log in as your owner account
2. Go to `/admin` → verify you see the admin panel
3. Check the **Analytics** tab → verify events from your testing appear

---

## STEP 10: Go Live with Stripe (5 min)

Once everything works in test mode:

1. In Stripe Dashboard → toggle **off** Test Mode (top-right switch)
2. Copy your **live** Secret Key (`sk_live_...`)
3. Create a **live** Webhook endpoint with the same URL and events
4. Copy the live **Signing Secret**
5. Update `functions/.env`:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...live_secret
   ```
6. Redeploy functions: `firebase deploy --only functions`

---

## What You Now Have

| Feature | Status |
|---------|--------|
| **PWA** — installable from browser, works fullscreen on mobile | ✅ |
| **Auth** — email/password signup with auto-redirect | ✅ |
| **Onboarding** — 3-step flow with promo code support | ✅ |
| **7-day trial** — hard paywall after expiration | ✅ |
| **Stripe payments** — checkout, subscription management, webhooks | ✅ |
| **Dashboard** — scored covered call recommendations | ✅ |
| **Research history** — full context saved per search | ✅ |
| **Analytics** — custom events, admin dashboard with 5 tabs | ✅ |
| **Admin panel** — user management, role-based access | ✅ |
| **Financial disclaimer** — visible on dashboard | ✅ |
| **Versioned deploys** — rollback scripts included | ✅ |

---

## Files Added/Changed in This Update

```
NEW:
  public/manifest.json          — PWA manifest
  public/sw.js                  — Service worker (cache strategies)
  public/robots.txt             — SEO robots file
  public/icons/                 — App icons (192, 512, maskable, apple-touch, favicon)
  functions/stripe.js           — Stripe checkout, portal, webhook Cloud Functions
  functions/.env.example        — Stripe env var template
  .env.example                  — Frontend Firebase config template
  docs/LAUNCH_CHECKLIST.md      — This file

CHANGED:
  index.html                    — PWA meta tags, Apple meta tags, SW registration
  functions/index.js            — Wired Stripe function exports
  functions/package.json        — Added stripe dependency
  src/views/PaywallScreen.jsx   — Real Stripe Checkout integration
  src/views/Dashboard.jsx       — Manage Billing button, financial disclaimer
```

---

## Common Issues

**"Stripe is not configured" error on checkout:**
→ Check `functions/.env` has the correct `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`.
→ Redeploy functions after changing env vars.

**Webhook events not updating Firestore:**
→ Verify the webhook URL in Stripe matches your deployed function URL exactly.
→ Check `STRIPE_WEBHOOK_SECRET` matches the signing secret from Stripe Dashboard.
→ Check Firebase Functions logs: `firebase functions:log`

**Market data not loading:**
→ Yahoo Finance may rate-limit. Check Functions logs for errors.
→ Verify the functions deployed successfully: `firebase deploy --only functions`

**PWA not showing install prompt:**
→ Must be served over HTTPS (automatic with Firebase Hosting).
→ Chrome only shows the prompt after the user has engaged with the site for ~30 seconds.
→ On iOS, users must manually tap Share → Add to Home Screen.

**Custom domain SSL not working:**
→ Wait up to 24 hours for DNS propagation.
→ Verify DNS records match exactly what Firebase specified.
