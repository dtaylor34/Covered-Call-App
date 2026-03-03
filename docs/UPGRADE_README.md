# v2.0 — Dashboard Upgrade

## Summary
Major upgrade: 7-tab dashboard with 3-tier subscription gating, state persistence, and shared data flow between tabs.

## 12 Files (2,589 lines)

### NEW — 9 files
| File | Lines | Purpose |
|------|-------|---------|
| `src/hooks/usePersistedState.js` | 52 | localStorage-backed useState, auto-restores on reload |
| `src/hooks/useFeatureAccess.js` | 101 | Tier config (Basic/Advanced/Expert), `canAccess()` check |
| `src/contexts/ThemeContext.jsx` | 168 | Dark/Light/High Contrast, responsive breakpoints |
| `src/components/WorkingTab.jsx` | 246 | P&L buyback table, position summary, guidance |
| `src/components/RiskTab.jsx` | 73 | 6 risk scenarios with severity and actions |
| `src/components/TransactionsTab.jsx` | 198 | Log positions, toggle open/closed, copy for Docs |
| `src/components/GlossaryTab.jsx` | 126 | 35+ searchable terms across 7 categories |
| `src/components/SetupTab.jsx` | 194 | 4 broker guides (Schwab, E*TRADE, Merrill, Morgan Stanley) |
| `src/components/ProfileTab.jsx` | 254 | User info, plan cards, theme toggle, billing |

### UPDATED — 4 files
| File | Lines | Changes |
|------|-------|---------|
| `src/theme.js` | 149 | Rebuilt: 3 palettes (dark/light/highContrast), reads `cc:theme` from localStorage on load |
| `src/contexts/AuthContext.jsx` | 391 | Added `plan`, `theme` fields + `updatePlan()`, `updateUserTheme()`, `updateProfile()` |
| `src/components/CoveredCallsDashboard.jsx` | 618 | Added `onPositionChange` prop callback |
| `src/views/Dashboard.jsx` | 321 | Complete rebuild: 7-tab shell, tier gating, persisted state |

## Tier Gating

| Tab | Basic ($10) | Advanced ($20) | Expert ($30) |
|-----|-------------|----------------|--------------|
| Dashboard | ✅ | ✅ | ✅ |
| Glossary | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ |
| Working (P&L) | 🔒 blur+overlay | ✅ | ✅ |
| Risk | 🔒 blur+overlay | ✅ | ✅ |
| Transactions | 🔒 blur+overlay | ✅ | ✅ |
| Setup (Brokers) | 🔒 blur+overlay | 🔒 blur+overlay | ✅ |
| Custom Themes | 🔒 | 🔒 | ✅ |

FAMILY34 code → Expert-level access (all features unlocked).

## State Persistence (3 Layers)

1. **localStorage** — Active tab, symbol, contract, transactions, theme preference (instant restore)
2. **Firestore** — Plan, theme, search history, user profile (cross-device)
3. **React state** — Active position flows Dashboard → Working/Transactions/Setup (in-session)

## Data Flow
```
Dashboard tab → user searches symbol, selects contract
  ↓ onPositionChange callback
Dashboard shell → stores in activePosition (persisted)
  ↓ prop drilling
Working tab → auto-shows P&L table for that symbol/contract
Transactions tab → offers "Log this position" button
Setup tab → shows symbol in broker quick-reference
```

## Deploy
```bash
# Copy all files into your project maintaining structure
cp -r src/ /path/to/your/cc-app/src/

# Build and deploy
npm run build
firebase deploy --only hosting

# Git
git add -A
git commit -m "v2.0 — 7-tab dashboard, tier gating, state persistence"
git tag v2.0.0 -m "Dashboard upgrade: Working, Risk, Transactions, Glossary, Setup, Profile tabs"
git push origin main --tags
```

## Sticky Header Behavior
The header and tab bar use a two-layer sticky system from the prototype:

1. **Header (fixed, z-index 50)** — Slides up and away with `translateY(-100%)` when scrolling down past 80px. Smoothly returns with a 300ms ease transition when scrolling back up or reaching the top of the page.

2. **Tab bar (sticky, z-index 40)** — Always pinned at `top: 0`. When the header is hidden, the tab bar gains a subtle box-shadow so users always know where they are. Horizontally scrollable on mobile with hidden scrollbar.

3. **Spacer div** — Prevents content from jumping when the fixed header mounts. Height matches the header (52px mobile, 56px desktop).

Scroll handler uses `passive: true` for performance and a ref for `lastScrollY` to avoid re-renders on every scroll event.

## Theme System Architecture

**See `docs/THEME_REFACTOR_README.md` for the current theme system.** Summary:

- **Functional components** use `const { T } = useTheme()` from `ThemeContext.jsx`. Theme switching is instant (no reload).
- **Three palettes:** dark, light, highContrast. All 25 color tokens exist in each; ThemeContext sets `--theme-bg` / `--theme-text` on the document root so `index.html` body follows the active theme.
- **Persistence:** React context + localStorage (`cc:theme`) + Firestore (`userData.theme`) via AuthContext.
- **Class components** (e.g. ErrorBoundary) still use the static `import { T } from "../theme"` fallback; `theme.js` exports a dark-only fallback and structural constants (ROLES, STATUS_STYLES, hasPermission).

## What's NOT Changed
- App.jsx routing (no new routes needed)
- firebase.js
- theme.js (still works, ThemeContext is additive)
- useMarketData.js hooks
- Cloud Functions
- AuthScreen, OnboardingScreen, PaywallScreen, AdminPanel
- SearchHistory page (still accessible at /history)
- Stripe integration
- Analytics service
