# Covered Calls Manager — Product Requirements Document

> **Status:** Active Development
> **Version:** 1.0.0
> **Last Updated:** 2026-02-27
> **Owner:** Darrell

---

## 1. Product Overview

### 1.1 What It Is
An educational paper-trading application that helps retail investors learn and
practice covered call strategies using real market data. No real money. No
brokerage connections. Users simulate covered call transactions to understand
pricing, timing, risk, and execution language before trading with real capital.

### 1.2 What It Is NOT
- Not a brokerage or trading platform
- Not financial advice
- Not connected to any user's real accounts
- Not processing real financial transactions (subscriptions are separate from trading)

### 1.3 Revenue Model
- **7-day free trial** — full access, no credit card required
- **$10/month subscription** — via Stripe, includes app access + private Slack community
- **Promo codes** — admin-created discounts via Stripe coupons
- **Individual pricing** — admin can override any user's monthly rate

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

| Role       | Access Level | Who |
|------------|-------------|-----|
| Owner      | Full access to everything | Darrell (app creator) |
| Admin      | User management, outreach, Slack | Trusted team members |
| Moderator  | Read-only stats, Slack moderation | Community managers |
| User       | App dashboard (trial or paid) | Customers |

### 2.2 Permission Matrix

| Capability              | Owner | Admin | Moderator | User |
|-------------------------|:-----:|:-----:|:---------:|:----:|
| View dashboard/stats    |   ✓   |   ✓   |     ✓     |      |
| View user list          |   ✓   |   ✓   |     ✓     |      |
| Edit user data          |   ✓   |   ✓   |           |      |
| Change user pricing     |   ✓   |       |           |      |
| Extend/reset trials     |   ✓   |   ✓   |           |      |
| Comp free memberships   |   ✓   |   ✓   |           |      |
| Cancel subscriptions    |   ✓   |   ✓   |           |      |
| Create promo codes      |   ✓   |       |           |      |
| Send outreach email     |   ✓   |   ✓   |           |      |
| Manage Slack community  |   ✓   |   ✓   |     ✓     |      |
| Manage team/roles       |   ✓   |       |           |      |
| View audit log          |   ✓   |   ✓   |           |      |
| Export data             |   ✓   |       |           |      |
| App settings            |   ✓   |       |           |      |
| Use covered calls app   |   ✓   |   ✓   |     ✓     |  ✓   |

### 2.3 Role Assignment
- Owner sets their own role manually in Firestore (one-time setup)
- Owner assigns roles to others via Admin Panel → Users → "Assign Role"
- Users sign up normally; role is assigned afterward
- Removing a role reverts them to regular user

---

## 3. User Flows

### 3.1 New User Flow
```
Visit app → Sign Up (email/password) → Firestore doc created (status: trial)
→ Onboarding (/onboarding):
    Step 1: Profile — name, experience level, investment goal, portfolio size
    Step 2: Preferences — newsletter opt-in, email frequency, notification types
    Step 3: Promo Code — optional code for discounts/extended trial + summary
→ onboardingComplete: true → 7-day trial begins → Full app access
→ Trial expires → Paywall shown
→ Subscribe ($10/mo via Stripe) → Status: active → Slack invite sent
```

### 3.2 Returning User Flow
```
Visit app → Sign In → AuthContext reads Firestore doc → Check status:
  - onboardingComplete: false → Redirect to /onboarding
  - trial + not expired  → Dashboard (with trial banner + search history)
  - trial + expired      → Paywall (/upgrade)
  - active               → Dashboard (PRO badge + search history)
  - canceled/expired sub → Paywall (/upgrade)
```

### 3.3 Admin Flow
```
Sign In → AuthContext reads role → If role exists:
  → "Admin Panel" link appears → Navigate to /admin
  → View is filtered by role permissions
  → All actions write to Firestore + auditLog
```

---

## 4. Feature Specifications

### 4.1 Covered Calls Dashboard (MVP)
- **Symbol search** — manual entry or quick-select presets (META, AAPL, NVDA, etc.)
- **Options chain display** — strike prices, premiums, expiration dates
- **Paper trade simulator** — user "places" a covered call, sees hypothetical P&L
- **Historical playback** — replay past months to test strategies
- **Risk analysis** — color-coded zones (safe/watch/danger) based on stock vs. strike
- **Transaction log** — formatted text showing how to submit the order in brokerage language
- **Day-by-day breakdown** — OHLC data with P&L tracking per day

### 4.2 Authentication, Onboarding & Trial System
- Firebase Auth with email/password
- Firestore user document created on signup (minimal — `onboardingComplete: false`)
- **Onboarding flow** (3-step, shown once after signup):
  - Step 1: Profile — display name (required), experience level (required), investment goal, portfolio size
  - Step 2: Preferences — newsletter opt-in (default: yes), email frequency (daily/weekly/monthly), notification toggles (features, market alerts, education)
  - Step 3: Promo code (optional, validated against `promoCodes` collection) + account summary
  - Skip option available — sets `onboardingComplete: true` with defaults
  - On completion: writes profile + preferences to Firestore, starts trial
- Trial countdown: 7 days from `trialStart` timestamp
- Trial banner with progress bar (turns amber at 2 days left)
- Hard paywall after trial expires — no app access
- **Search history**: last 50 symbol searches stored in user doc, shown as "Recent" quick-picks
- **Watchlist**: up to 20 symbols saved for batch quote monitoring

### 4.3 Subscription (Stripe)
- $10/month recurring via Stripe Checkout
- Cloud Function creates Checkout Session → user redirected to Stripe
- Stripe webhook confirms payment → Cloud Function updates Firestore to `active`
- Cancellation handled by Stripe webhook → status set to `canceled`
- Promo codes applied at Stripe Checkout (field enabled automatically)

### 4.4 Slack Community
- Private Slack workspace for paying members
- Auto-invite sent via Slack API when subscription activates
- "Open Slack" button visible in dashboard for active members
- Access revoked (manually or via API) on cancellation

### 4.5 Admin Panel
- **Dashboard** — user count, active subs, MRR, churn, recent activity
- **Users** — filterable table, expandable rows with action buttons
- **Team** — role legend, member list, role assignment
- **Activity Log** — chronological audit trail of all admin actions
- **Outreach** — segment users, compose emails, send via SendGrid
- **Promo Codes** — create/disable Stripe promotion codes (Owner only)

### 4.6 Audit System
- Every admin action logged to Firestore `auditLog` collection
- Records: who, what, whom, details, timestamp
- Visible in Admin Panel → Activity Log tab

---

## 5. Data Model (Firestore Schema)

### 5.1 `users/{uid}`
```
{
  // ── Identity ──
  email:               string    // From Firebase Auth
  name:                string    // User-provided during onboarding
  role:                string|null  // "owner" | "admin" | "moderator" | null

  // ── Onboarding ──
  onboardingComplete:  boolean   // false until onboarding flow finishes
  onboardingCompletedAt: string|null  // ISO timestamp

  // ── Profile (set during onboarding) ──
  experienceLevel:     string|null  // "beginner" | "intermediate" | "advanced" | "expert"
  investmentGoal:      string|null  // "income" | "learn" | "hedge" | "explore"
  portfolioSize:       string|null  // "under10k" | "10k-50k" | "50k-100k" | "100k-500k" | "500kplus"

  // ── Communication Preferences ──
  newsletterOptIn:     boolean   // true = receives email newsletter
  updateFrequency:     string    // "daily" | "weekly" | "monthly"
  notifyNewFeatures:   boolean   // Opt-in for feature announcements
  notifyMarketAlerts:  boolean   // Opt-in for market opportunity digests
  notifyEducation:     boolean   // Opt-in for educational content

  // ── Subscription ──
  trialStart:          string    // ISO 8601 timestamp
  subscriptionStatus:  string    // "trial" | "active" | "expired" | "canceled"
  monthlyRate:         number    // Default 10, overridable by admin
  totalPaid:           number    // Running total of payments received
  stripeCustomerId:    string    // Stripe customer ID (set on first checkout)
  stripeSubscriptionId: string   // Stripe subscription ID (set on payment)
  subscribedAt:        string    // ISO timestamp of first subscription
  canceledAt:          string    // ISO timestamp of cancellation (if applicable)

  // ── Promo ──
  promoCode:           string|null  // Promo code entered during onboarding
  promoAppliedAt:      string|null  // ISO timestamp when promo was applied

  // ── Community ──
  slackJoined:         boolean   // Whether they've joined the Slack workspace
  slackInviteSent:     boolean   // Whether invite was sent

  // ── User Activity ──
  searchHistory:       array     // [{ symbol: "AAPL", searchedAt: ISO }, ...] (max 50)
  watchlist:           array     // ["AAPL", "MSFT", ...] (max 20)
  createdAt:           string    // ISO timestamp
  lastActive:          string    // ISO timestamp, updated on each login
}
```

### 5.2 `auditLog/{auto-id}`
```
{
  action:      string    // e.g. "price_change", "trial_extended", "role_change"
  performedBy: {
    uid:   string
    email: string
    role:  string
  }
  target: {
    uid:   string
    email: string
  }
  details:     object    // Action-specific data (e.g. { from: 10, to: 5 })
  timestamp:   string    // ISO 8601
}
```

### 5.3 `promoCodes/{CODE}` (document ID = uppercase code string)
```
{
  code:            string    // Same as document ID, e.g. "LAUNCH50"
  description:     string    // Human-readable, shown to user on apply (e.g. "50% off first 3 months")
  discountPercent: number|null  // Percentage off (e.g. 50)
  discountAmount:  number|null  // Fixed dollar off (e.g. 5)
  extendedTrialDays: number|null // Extra trial days granted (e.g. 14)
  maxUses:         number|null  // Max total redemptions (null = unlimited)
  usedCount:       number    // Current redemption count
  expiresAt:       string|null  // ISO timestamp (null = never expires)
  active:          boolean   // Can be disabled by Owner
  stripePromoId:   string|null  // Stripe promotion ID (if applicable)
  stripeCouponId:  string|null  // Stripe coupon ID (if applicable)
  createdBy:       string    // Admin email
  createdAt:       string    // ISO timestamp
}
```

### 5.4 Schema Rules
- **Adding fields:** Safe. Existing documents simply won't have the field.
- **Renaming fields:** FORBIDDEN. Requires migration script.
- **Removing fields:** FORBIDDEN without migration.
- **Type changes:** FORBIDDEN without migration.
- All migrations go in `scripts/migrations/` and are documented in CHANGELOG.

---

## 6. Technical Architecture

### 6.1 Stack
| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 18 + Vite                     |
| Routing    | React Router v7                     |
| Auth       | Firebase Authentication              |
| Database   | Cloud Firestore                     |
| Functions  | Firebase Cloud Functions (Node.js)   |
| Market Data| Yahoo Finance → Polygon (see DATA_LAYER.md) |
| Payments   | Stripe (Checkout + Webhooks)         |
| Email      | SendGrid (outreach)                  |
| Community  | Slack (API invites)                  |
| Hosting    | Firebase Hosting (versioned)         |
| Dev Tools  | Firebase Emulators, Cursor IDE       |

### 6.2 Environments
| Env        | Auth          | Firestore     | Hosting                    |
|------------|---------------|---------------|----------------------------|
| Local      | Emulator:9099 | Emulator:8080 | localhost:3000 (Vite)      |
| Preview    | Production    | Production    | preview-{hash}.web.app     |
| Production | Production    | Production    | your-domain.com            |

### 6.3 Auto-Detection
`src/firebase.js` detects the environment automatically:
- `localhost` → connects to emulators
- Everything else → connects to production Firebase

---

## 7. Security Requirements

### 7.1 Client-Side
- No API keys or secrets in frontend code
- No Stripe secret key anywhere in client bundle
- Auth tokens managed by Firebase SDK (httpOnly cookies)
- All sensitive operations go through Cloud Functions

### 7.2 Firestore Rules
- Users can read/write their own document (non-sensitive fields only)
- Team members (owner/admin/moderator) can read all user documents
- Only owners can modify the `role` field
- Only admins+ can modify `subscriptionStatus` and `monthlyRate`
- Users cannot set their own role on signup

### 7.3 Cloud Functions
- All Stripe operations happen server-side
- Webhook signature verification required
- Admin endpoints verify the caller's role before executing

---

## 8. Release & Deployment Strategy

See `docs/DEPLOYMENT.md` for the full versioned release process.

Summary:
- Semantic versioning (MAJOR.MINOR.PATCH)
- Every release gets a preview channel first
- Production deploys create a named version in Firebase Hosting
- Instant rollback to any previous version
- All releases documented in `docs/CHANGELOG.md`

---

## 9. Roadmap

### Phase 1 — MVP (Current)
- [x] Firebase Auth (email/password)
- [x] Firestore user documents + trial tracking
- [x] Role-based admin panel
- [x] Audit logging
- [x] Trial gate + paywall screen
- [x] **Onboarding flow** (3-step: profile, preferences, promo code)
- [x] Search history persistence (last 50, shown as recent picks)
- [x] Firestore rules for user self-update, promo validation, market data
- [x] Market data layer (provider-agnostic Cloud Functions)
- [x] Yahoo Finance integration (options chains, stock quotes)
- [x] Black-Scholes Greeks calculator
- [x] Covered call scoring engine (composite 0–100)
- [x] Covered calls dashboard (search, quote, recommendations table)
- [x] React hooks for market data (useStockQuote, useCoveredCalls, etc.)
- [ ] Stripe subscription integration
- [ ] Slack auto-invite on subscription

### Phase 2 — Growth
- [ ] Google Sign-In as auth option
- [ ] Annual subscription plan ($89.99/year)
- [ ] Referral program (give a friend 50% off first month)
- [ ] Push notifications for trial expiring
- [ ] Admin email outreach with SendGrid
- [ ] Promo code management in admin panel

### Phase 3 — Mobile
- [ ] React Native wrapper for iOS/Android
- [ ] App Store submission (Apple)
- [ ] Play Store submission (Google)
- [ ] Mobile-optimized dashboard layout

### Phase 4 — Advanced Features
- [ ] Polygon.io upgrade (real-time data, see DATA_LAYER.md Phase 2)
- [ ] Portfolio tracking (multiple positions)
- [ ] Strategy comparison tool
- [ ] Community leaderboard (paper trade P&L rankings)
- [ ] Earnings calendar integration
- [ ] Custom alerts (Slack or push) when stock approaches strike
- [ ] Watchlist with batch quotes and auto-refresh

---

## 10. Disclaimers (Required in App)

The following must be displayed in the app footer and in the app store listing:

> This application is for educational and simulation purposes only.
> It does not constitute financial advice. No real trades are executed.
> No brokerage accounts are connected. Past performance in simulated
> environments does not guarantee future results. Always consult a
> licensed financial advisor before making investment decisions.
