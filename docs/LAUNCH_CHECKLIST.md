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
   - Enable **Google** provider (click Google → Enable → Save)
   - Enable **Apple** provider (requires Apple Developer account, can skip initially)
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

> **Important:** Cloud Functions require the **Blaze (pay-as-you-go)** plan.
> Upgrade at: Firebase Console → bottom of left sidebar → Upgrade.
> Free tier is generous — you'll pay $0-5/month for your first 100 users.

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

## Completed — Production Launch Status

| Step | Item | Status |
|------|------|--------|
| 1 | Firebase project (covered-calls-prod) | ✅ Done |
| 2 | Custom domain | ⏭ Skipped (using .web.app) |
| 3 | Environment variables (.env) | ✅ Done |
| 4 | Stripe account + product + webhook | ✅ Done |
| 5 | Dependencies installed | ✅ Done |
| 6a | Firebase CLI login | ✅ Done |
| 6b | Firestore rules deployed | ✅ Done |
| 6c | Cloud Functions deployed | ✅ Done |
| 6d | Frontend built and deployed | ✅ Done |
| 7 | Custom domain | ⏭ Later |
| 8 | Owner account created | ✅ Done |
| 9 | Full flow tested (signup, trial, payment, admin) | ✅ Done |
| 10 | Stripe live mode | ✅ Live (real Amex charged $1) |

---

## What You Now Have

| Feature | Status |
|---------|--------|
| **PWA** — installable from browser, works fullscreen on mobile | ✅ |
| **Auth** — email/password + Google + Apple sign-in | ✅ |
| **Onboarding** — 3-step flow with promo code support | ✅ |
| **FAMILY34 promo code** — permanent free access for family | ✅ |
| **7-day trial** — smart paywall with days remaining | ✅ |
| **Stripe payments** — checkout, subscription management, webhooks | ✅ |
| **Dashboard** — scored covered call recommendations | ✅ |
| **Research history** — full context saved per search | ✅ |
| **Analytics** — custom events, admin dashboard with 5 tabs | ✅ |
| **Admin panel** — user management, role-based access | ✅ |
| **Financial disclaimer** — visible on dashboard | ✅ |
| **Versioned deploys** — Git tags + rollback scripts | ✅ |
| **GitHub repo** — private, v1.0.0 tagged | ✅ |

---

## NEXT: App Marketplace Setup

When you're ready to distribute beyond the web, here are the marketplaces
and what's required for each.

### Apple App Store + TestFlight + Sign in with Apple

Everything is under one account: the **Apple Developer Program**.

| What | Link | Cost |
|------|------|------|
| Enroll in Developer Program | https://developer.apple.com/programs/enroll/ | $99/year |
| TestFlight (beta testing) | https://developer.apple.com/testflight/ | Free (included) |
| App Store Connect (manage apps) | https://appstoreconnect.apple.com | Free (included) |
| Compare memberships | https://developer.apple.com/support/compare-memberships/ | — |

**What this unlocks:**
- Sign in with Apple on your web app (already coded, needs this account to activate)
- TestFlight beta testing (up to 100 internal testers, no review needed)
- App Store distribution (review required, 1-7 days)
- Apple takes 15-30% of in-app subscription revenue

**Enrollment requirements (individual/sole proprietor):**
- Apple ID with two-factor authentication
- Government-issued photo ID
- $99 USD annual fee
- Approval takes 1-5 business days

**Enrollment requirements (organization/LLC):**
- All of the above, plus:
- D-U-N-S Number (free from Dun & Bradstreet)
- Legal entity name matching D-U-N-S records
- Business website with your domain
- Approval takes 1-4 weeks

### Google Play Store (Android)

| What | Link | Cost |
|------|------|------|
| Google Play Console signup | https://play.google.com/console | $25 one-time |
| Getting started guide | https://support.google.com/googleplay/android-developer/answer/6112435 | — |
| Account requirements | https://support.google.com/googleplay/android-developer/answer/13628312 | — |

**What this unlocks:**
- Publish Android apps on Google Play Store
- Internal testing, closed testing, open testing tracks
- Google takes 15% of subscription revenue (first $1M/year)

**Enrollment requirements:**
- Google account with 2-step verification
- Government-issued photo ID
- $25 one-time registration fee
- Personal accounts: 12 testers must test for 14 days before publishing
- Organization accounts: D-U-N-S Number required

### Other Marketplaces (Optional, Lower Priority)

| Marketplace | Cost | Notes |
|-------------|------|-------|
| Amazon Appstore | Free | Reaches Fire tablets + some Android. Same APK as Play Store. |
| Samsung Galaxy Store | Free | Pre-installed on Samsung devices. Same APK as Play Store. |
| Microsoft Store | Free | Windows desktop/tablet. PWA works natively here. |

**Recommendation:** Start with Apple ($99/yr) since it unlocks Sign in with Apple
for your current web app AND future iOS distribution. Add Google Play ($25)
when ready to wrap with Capacitor for Android. Skip others until traction.

### Distribution Tiers (from GTM Strategy)

| Tier | Platform | Wrapper | Revenue Share | Status |
|------|----------|---------|---------------|--------|
| **Tier 1** | Web (PWA) | None — direct to browser | Stripe only (~5%) | ✅ LIVE |
| **Tier 2** | Android | Capacitor → Google Play | Stripe (~5%) or Google (15%) | 🔜 Next |
| **Tier 3** | iOS | Capacitor → App Store | Apple (15-30%) requires StoreKit | 🔜 After Android |

### Key Insight: Your Architecture Advantage

Since your app is a web app wrapped in a native shell, most updates deploy
through Firebase Hosting — no app store review needed. You only resubmit to
Apple/Google when changing the native wrapper itself (permissions, SDK version).
All feature work, UI changes, and bug fixes deploy instantly via Firebase.

---

## Files Added/Changed

### v1.0.0 — Initial Production Release
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
  docs/VERSIONING.md            — Git tagging and release workflow
  docs/BRANCHING.md             — Feature branch and prototype workflow

CHANGED:
  index.html                    — PWA meta tags, Apple meta tags, SW registration
  functions/index.js            — Wired Stripe function exports
  functions/package.json        — Added stripe dependency
  src/views/PaywallScreen.jsx   — Real Stripe Checkout integration
  src/views/Dashboard.jsx       — Manage Billing button, financial disclaimer
```

### v1.1.0 — Mobile Layout, OAuth, FAMILY34, Trial Messaging
```
CHANGED:
  src/firebase.js               — Fixed emulator auto-connect, added Google/Apple providers
  src/contexts/AuthContext.jsx   — Google + Apple sign-in, FAMILY34 free access logic
  src/views/AuthScreen.jsx      — Mobile-responsive stacking, OAuth buttons
  src/views/PaywallScreen.jsx   — Trial days countdown, 3 messaging states
```

---

## Common Issues

**"Connected to Firebase Emulators" when running locally:**
→ Delete `.env.local` if it exists — Vite loads it with higher priority than `.env`.
→ Verify `VITE_USE_EMULATORS` is NOT set to `true` in any `.env*` file.
→ Kill and restart `npm run dev` — Vite doesn't hot-reload env changes.

**"permission-denied" on signup or onboarding:**
→ Deploy Firestore rules: `firebase deploy --only firestore:rules`
→ Check that `role` is NOT included in the signup user doc (rules block it).
→ Delete the test user from Auth + Firestore and sign up fresh.

**"apiKey=your-api-key" or "demo-api-key" in network requests:**
→ Your `.env` values aren't loading. Check the file is named exactly `.env`
  (not `.env.txt`), is in the project root, and has no quotes around values.
→ Delete `node_modules/.vite` cache and restart `npm run dev`.

**Cloud Functions deploy fails with "must be on Blaze plan":**
→ Upgrade to Blaze at Firebase Console → left sidebar → Upgrade.
→ Free tier covers most usage. You only pay for overages.

**Cloud Functions deploy fails with "Couldn't find firebase-functions":**
→ Run `cd functions && npm install && cd ..` then deploy again.

**"Stripe is not configured" error on checkout:**
→ Check `functions/.env` has the correct `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`.
→ Redeploy functions after changing env vars.

**Stripe redirects to placeholder.com after checkout:**
→ Update `APP_URL` in `functions/.env` to your real URL.
→ Redeploy functions: `firebase deploy --only functions`

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
