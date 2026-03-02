# Changelog — Covered Calls Manager

All notable changes to this project are documented here.
Format follows [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0) — Breaking changes, schema migrations, platform shifts
- **MINOR** (0.1.0) — New features, new components, new admin capabilities
- **PATCH** (0.0.1) — Bug fixes, copy changes, style tweaks

> **Cursor:** Always read this file before making changes. Check the current
> version and do not re-implement or break anything listed here.

---

## [Unreleased]
_Changes that are ready but not yet deployed._

---

## [2.0.1] — 2026-03-02

### Changed
- Dashboard and useFeatureAccess hook updates (tweaks and small fixes).

---

## [2.0.0] — 2026-03-02

### Added
- **Theme system:** ThemeContext, theme refactor (docs/THEME_REFACTOR_README.md), shared design tokens
- **Dashboard tabs:** Glossary, Profile, Risk, Setup, Transactions, Working tabs; NewTabPreview component
- **Hooks:** useFeatureAccess, usePersistedState for feature gating and persisted UI state
- **Docs:** UPGRADE_README.md for upgrade flow and messaging

### Changed
- AuthScreen, PaywallScreen, OnboardingScreen, Dashboard — layout and copy updates
- AdminPanel, AdminAnalytics, CoveredCallsDashboard, SearchHistory — theme and structure
- main.jsx — ThemeProvider wiring; theme.js — token updates

### Fixed
- **Firestore rules:** `getUserRole()` handles missing user docs (exists before get)
- **Emulator config:** Emulators only when `VITE_USE_EMULATORS=true`; `.env.local` no longer overrides production config
- **firebase.js:** Comment for Auth iframe "Could not connect" in dev

### Deploy Notes
- MAJOR version: theme and layout changes; test onboarding and paywall flows after deploy.

---

## [1.0.0] — 2026-02-27

### 🚀 Initial Release

**Authentication**
- Firebase Auth with email/password signup and login
- AuthContext provider manages user state, Firestore doc, role, and trial info
- Friendly error messages for common auth failures
- Auto-detection of Firebase emulators on localhost

**Trial System**
- 7-day free trial starts on signup (no credit card required)
- Trial countdown with progress bar in dashboard header
- Amber warning state when 2 or fewer days remain
- Hard paywall on expiration — redirects to /upgrade
- Trial info derived from `trialStart` field in Firestore

**Role-Based Admin Panel**
- Three role tiers: Owner, Admin, Moderator
- Permission matrix enforced in UI (Gate component) and Firestore rules
- Sidebar navigation with permission-filtered menu items
- Dashboard view: user count, active subs, MRR, churn stats
- Users view: filterable table, expandable rows, inline action buttons
- Team view: role legend, member list, role assignment dropdown
- Activity Log: chronological audit trail of all admin actions

**Admin Actions**
- Change user pricing (writes to Firestore `monthlyRate`)
- Extend trial (resets `trialStart` to today)
- Comp free membership (sets status to `active`, rate to $0)
- Cancel subscription (sets status to `canceled`)
- Assign/change/remove admin roles

**Audit System**
- All admin actions logged to Firestore `auditLog` collection
- Records: performedBy (uid, email, role), target, details, timestamp
- Visible in Admin Panel → Activity Log tab

**Routing & Protection**
- `RequireAuth` — must be logged in
- `RequireAdmin` — must have owner/admin/moderator role
- `RequireAccess` — trial must be active OR subscription must be active
- Floating "⚙ Admin Panel" link for users with roles

**Firestore Schema**
- `users/{uid}` — email, name, role, trialStart, subscriptionStatus, monthlyRate, etc.
- `auditLog/{auto-id}` — action, performedBy, target, details, timestamp
- Security rules enforce role-based read/write access

**Design System**
- Dark theme with accent (#00d4aa), surface layers, ambient glow effects
- Font stack: Space Mono (display), IBM Plex Sans (body), JetBrains Mono (mono)
- Shared tokens in theme.js — all components import from single source
- Inline React styles only (no CSS files)

**Infrastructure**
- Vite dev server on port 3000
- Firebase Emulators (Auth:9099, Firestore:8080, UI:4000)
- Auto emulator detection in firebase.js
- Versioned deployment with preview channels and instant rollback
- Deploy/rollback shell scripts

### Schema
```
users/{uid}: email, name, role, trialStart, subscriptionStatus,
             monthlyRate, totalPaid, stripeCustomerId,
             stripeSubscriptionId, subscribedAt, canceledAt,
             slackJoined, slackInviteSent, promoUsed,
             createdAt, lastActive

auditLog/{auto-id}: action, performedBy{uid,email,role},
                    target{uid,email}, details{}, timestamp
```

### Known Limitations
- Covered calls dashboard is a placeholder (needs component port)
- Stripe integration not yet connected (Checkout + Webhooks)
- Slack auto-invite not yet connected
- Email outreach UI exists but SendGrid not wired
- Promo code management not yet in admin (Stripe coupons)

---

## Version History Summary

| Version | Date       | Type  | Summary                              |
|---------|------------|-------|--------------------------------------|
| 2.0.1   | 2026-03-02 | PATCH | Dashboard and useFeatureAccess tweaks |
| 2.0.0   | 2026-03-02 | MAJOR | Theme refactor, new tabs, OAuth, FAMILY34, upgrade flow |
| 1.1.0   | 2026-03-01 | MINOR | Mobile layout, Google/Apple auth, FAMILY34, smart paywall |
| 1.0.0   | 2026-02-27 | MAJOR | Initial release: auth, trial, admin  |

---

## Template for New Entries

Copy this when adding a new version:

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- (new features)

### Changed
- (modifications to existing features)

### Fixed
- (bug fixes)

### Schema Changes
- (new fields, new collections — NEVER renames or removals)

### Deploy Notes
- (anything special about this deployment)
```
