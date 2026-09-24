## [2.0.11] — 2026-09-24

### Security
- **Inactivity auto-logout** — signs the user out after 30 minutes with no interaction (mouse/keyboard/touch/scroll/tab-visibility), and shows a "signed out for your security" notice on the login screen. Protects unattended sessions on shared or public devices.

---

## [2.0.10] — 2026-09-24

### Security
- **Shared-device isolation** — logout now wipes all per-user `cc:*` localStorage (transactions, tax rates, last position/symbol/tab), and signing in as a different user on the same browser clears the previous user's local state first. Prevents any UI-state bleed between accounts on a shared device. Server-side data isolation (Firestore rules + function uid-scoping) was already enforced and re-verified with a two-user cross-tenant attack test.
- **OAuth code hygiene** — the Schwab `?code=` is stripped from the URL, history, and referrer immediately on callback, before the token exchange.

---

## [2.0.9] — 2026-09-24

### Added
- **Working covered calls, tax lots & Google Sheet sync** (handover build) — new portfolio tracker:
  - Working tab: totals, per-call rows with a health stoplight + hover legend, expandable detail (Position Summary, GTC fill estimate, four exit paths), thinkorswim paste parser.
  - Shares by lot: effective cost, Ready/Thin/Hold signal, delivery hints, wash-sale flags, lot picker.
  - Dashboard year-to-date strip + Trades closed history with per-row estimated tax.
  - Pure math module (`coveredCallMath.js`) + parser + YTD, 30 unit tests (vitest).
  - New per-user Firestore collections `positions` / `lots` / `closed` (owner-scoped rules).
- **Live portfolio data** — Working portfolio runs off Yahoo (always) and Schwab (real-time, when the user's key is connected; Yahoo fallback).
- **Google Sheet ledger sync** — `sheetsSync` functions + dark `SheetSettings` in the APIs tab; requires the Google Sheets API enabled in the project.

---

## [2.0.8] — 2026-09-21

### Security
- **Broker credentials are now bulletproof** — a user's Schwab App Key / Secret / OAuth tokens can never be seen by anyone but them. See new **docs/BROKER_CONNECTIONS.md**.
  - Secrets are **AES-256-GCM encrypted** at rest (`functions/crypto.js`) with a key held in Secret Manager (`SCHWAB_ENC_KEY`), stored in a sealed `users/{uid}/private/schwabSecret` doc.
  - `firestore.rules`: `private/**` is `read,write:false` for all clients (no admin exception); `brokerConnections` is now `read:owner, write:false` and holds **non-sensitive status only** (`status`, `appKeyLast4`, `accountCount`).
  - The browser no longer writes or reads credentials — removed the client-side plaintext write in `useBrokerConnection`; `APITab` sends creds once to the Cloud Function over HTTPS; disconnect wipes secrets server-side via new `schwabDisconnect`.
  - Functions never log credentials or Schwab response bodies.

### Setup required before the Schwab tab works in an environment
- `firebase functions:secrets:set SCHWAB_ENC_KEY` (see docs/BROKER_CONNECTIONS.md §5), then deploy `firestore:rules` + the `schwab*` functions.

---

## [2.0.7] — 2026-09-21

### Fixed
- **Stale market prices** — the deployed Cloud Functions (last deploy 2026-03-13) ran an outdated `yahoo-finance2` that had broken against Yahoo's live API, so `getStockQuote` fell into its stale-cache fallback and served frozen prices (e.g. GOOGL stuck at $311.24). Redeployed functions with current deps (`yahoo-finance2` 3.13.1, `firebase-functions` 7.2.2), restoring live quotes. See DATA_LAYER.md §3.1 (Yahoo reliability).
- **Selection tab showed hardcoded prices** — the "Position Setup" card read a static `STOCK_DATA` table (and a hashed fake daily change) instead of the market-data API. `SelectionTab` now overlays the live quote via `useStockQuote`, falling back to the static table only when the market is closed / API is down, with a LIVE/EST. source badge.

---

## [2.0.6] — 2026-04-14

### Fixed
- **Firebase `app/no-app` in dev** — `schwabApi.js` now uses `getFunctions(getApp())` at call time so Vite’s module order cannot evaluate Functions before `initializeApp()` runs.
- **Vite HMR WebSocket mismatch** — `server.strictPort: true` on port 3000 so the dev server does not silently move to 3001/3002 while the client still targets 3000; kill other processes on 3000 if the server fails to start.

---

## [2.0.5] — 2026-04-14

### Fixed
- **Local dev black screen** — service worker is no longer registered on `localhost` / `127.0.0.1`; in dev, existing registrations are unregistered so stale cached JS cannot block Vite.

---

## [2.0.4] — 2026-03-12

### Added
- **Scanner filter bar** — strike range (% + dollar) and DTE range dual sliders above results table
- **Strike range control** on Selection tab — slider with auto-calculated dollar range, dims out-of-range strikes
- **After-hours stale serving** — serves last good cached result with "as of market close" label instead of 0 results

### Fixed
- **Apple Sign-In** — wired up Services ID, Team ID, key, and authorized domains in Firebase + Apple Developer portal
- **Auth error persistence** — errors now local to AuthScreen, cleared on mount, only shown after user interaction
- **Scoring engine** — maxStrikeRatio, minOpenInterest, lastPrice fallback for after-hours bid=0, $0.05 premium floor

### Changed
- `deploy.sh` — fixed `grep -P` (Perl regex) incompatibility on macOS

---

## [2.0.3] — 2026-03-03

### Changed
- **Working tab** in default view (basic tier) via useFeatureAccess.
- **Market data label:** show "15min delay" only, with info icon + tooltip "15min delay using Yahoo" (Material Icons Outlined); tooltip positioned so it stays on screen.
- **Theme docs:** THEME_REFACTOR_README (root/CSS variables, 25 tokens), theme.js fallback aligned with ThemeContext, CURSOR_WORKFLOW/DEPLOYMENT/UPGRADE_README updated for useTheme().

### Added
- Material Icons Outlined font in index.html for info icon.

---

## [2.0.2] — 2026-03-02

### Changed
- index.html, ThemeContext, ProfileTab, Dashboard — small updates and tweaks.

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

---

## [1.0.0] — 2026-02-27

### 🚀 Initial Release
- Firebase Auth, trial system, role-based admin panel, audit log, routing/protection, Firestore schema, design system, infrastructure.

---

## Version History Summary

| Version | Date       | Type  | Summary |
|---------|------------|-------|---------|
| 2.0.4   | 2026-03-12 | MINOR | Scanner filters, strike range, after-hours serving, Apple Sign-In fix |
| 2.0.3   | 2026-03-03 | PATCH | Working tab default, 15min delay tooltip, Material Icons |
| 2.0.2   | 2026-03-02 | PATCH | index.html, ThemeContext, ProfileTab, Dashboard tweaks |
| 2.0.1   | 2026-03-02 | PATCH | Dashboard and useFeatureAccess tweaks |
| 2.0.0   | 2026-03-02 | MAJOR | Theme refactor, new tabs, OAuth, upgrade flow |
| 1.0.0   | 2026-02-27 | MAJOR | Initial release |
