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
