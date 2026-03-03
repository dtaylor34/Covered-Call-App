# v2.1 — Full Theme Hook Refactor

## What Changed

The entire theme system was rebuilt from a static module-level import (`import { T } from "../theme"`) to a reactive React Context hook (`const { T } = useTheme()`). Theme switching is now **instant** — no page reload, no flash of wrong colors, no stale references.

## Architecture

```
ThemeProvider (main.jsx — outermost, no auth dependency)
  └─ AuthProvider (syncs Firestore theme → ThemeContext on login)
       └─ ErrorBoundary (class component — keeps static T fallback)
            └─ App
                 └─ All views & components use useTheme() hook
```

### Three layers of theme persistence:

1. **React Context** (instant, in-session) — `useTheme()` provides `T`, `themeName`, `setTheme()`
2. **localStorage** (instant, survives refresh) — `cc:theme` written by ThemeContext on every change
3. **Firestore** (cross-device, permanent) — `userData.theme` synced by AuthContext on login

### Data flow on theme change:

```
User clicks "Light" in ProfileTab
  → setTheme("light")           ← ThemeContext updates reactive state
  → localStorage.setItem()      ← Persists locally
  → updateUserTheme("light")    ← Syncs to Firestore
  → ALL components re-render with new T instantly
```

### Data flow on login from new device:

```
User logs in on new device
  → AuthContext loads userData from Firestore
  → userData.theme = "light"
  → useEffect syncs to ThemeContext.setTheme("light")
  → localStorage updated, all components re-render
```

## Files Changed (19 total)

### Core Architecture (4 files)

| File | Change |
|------|--------|
| `src/contexts/ThemeContext.jsx` | **Rebuilt** — 182 lines. Canonical source: 3 palettes, `useTheme()` hook, `THEME_OPTIONS` export, `PALETTES` export, memoized `T` object, responsive breakpoints (`isMobile`/`isTablet`/`isDesktop`) |
| `src/theme.js` | **Slimmed** — 73 lines. Static fallback only for ErrorBoundary (class component). Exports `ROLES`, `hasPermission`, `STATUS_STYLES` (structural constants) |
| `src/main.jsx` | **Updated** — ThemeProvider wraps outside AuthProvider |
| `src/contexts/AuthContext.jsx` | **Updated** — Imports `useTheme`, syncs Firestore theme to context on login |

### Views (6 files)

| File | useTheme() calls | Notes |
|------|-----------------|-------|
| `Dashboard.jsx` | 2 | Main + LockedOverlay. Removed local `isMobile` state (uses context) |
| `AuthScreen.jsx` | 1 | |
| `PaywallScreen.jsx` | 1 | |
| `OnboardingScreen.jsx` | 5 | Main + StepProfile, StepPreferences, StepPromo, FieldLabel |
| `SearchHistory.jsx` | 3 | Main + HistoryRow, Checkbox |
| `AdminPanel.jsx` | 6 | Main + Pill, Btn, SmallBtn, Modal, StatCard |

### Components (9 files)

| File | useTheme() calls | Notes |
|------|-----------------|-------|
| `CoveredCallsDashboard.jsx` | 8 | Main + QuoteCard, QuoteStat, RecommendationRow, Cell, ExpandedDetails, DetailRow, ScoreBar |
| `WorkingTab.jsx` | 4 | Main + Card, Badge, StatBox (all converted from arrow to function body) |
| `RiskTab.jsx` | 3 | Main + Card, Badge. SCENARIOS moved inside component with `useMemo` |
| `TransactionsTab.jsx` | 3 | Main + Card, Badge |
| `GlossaryTab.jsx` | 2 | Main + Card |
| `SetupTab.jsx` | 2 | Main + Card |
| `ProfileTab.jsx` | 3 | Main + Card, Badge. `handleThemeChange` now calls `setTheme()` instead of `window.location.reload()` |
| `NewTabPreview.jsx` | 6 | Main + HistoryView, WorkingView, RiskView, TransactionsView, GlossaryView |
| `AdminAnalytics.jsx` | 5 | Main + OverviewTab, PagesTab, ErrorsTab, UsersTab |

### Unchanged

- `ErrorBoundary.jsx` — Class component, keeps `import { T } from "../theme"` (can't use hooks)
- `App.jsx` — No theme references
- `firebase.js`, Cloud Functions, Stripe — No theme references

## What Was Removed

- `window.location.reload()` for theme switching — **completely gone**
- Local `THEME_OPTIONS` array in ProfileTab — **uses ThemeContext export**
- Local `isMobile` state + resize listener in Dashboard — **uses ThemeContext**
- Module-scope `SCENARIOS` with T references in RiskTab — **moved inside component with useMemo**
- Static palette loading in old `theme.js` — **replaced with context**

## Root / index.html and CSS variables

So the **whole page** (including the root `<body>`) follows the active theme when switching Light/Dark/High contrast:

- **index.html** — `<body>` does **not** use a hardcoded background. It uses CSS variables with a dark default:
  - `background: var(--theme-bg, #05070b);`
  - `color: var(--theme-text, #e2e8f0);`
  - Plus `transition` for smooth switches.
- **ThemeContext** — In the same effect that runs when `themeName` changes, it:
  - Sets `--theme-bg` and `--theme-text` on `document.documentElement` so the root picks them up.
  - Sets `document.body.style.backgroundColor` and `document.body.style.color` as a fallback.
  - Updates the `<meta name="theme-color">` so the browser chrome (e.g. mobile status bar) matches the theme.

So clicking Light/Dark/High contrast updates context, localStorage, and Firestore, and the root background and text color update instantly without a full page reload.

## ThemeContext API

```jsx
import { useTheme, THEME_OPTIONS, PALETTES } from "../contexts/ThemeContext";

// Inside any functional component:
const {
  T,           // Color tokens: T.bg, T.text, T.accent, T.border, etc.
  themeName,   // "dark" | "light" | "highContrast"
  setTheme,    // (name: string) => void — instant switch
  isMobile,    // window.innerWidth < 640
  isTablet,    // 640 ≤ width < 1024
  isDesktop,   // width ≥ 1024
  windowWidth, // raw pixel value
} = useTheme();
```

## Adding a New Theme

1. Add palette to `PALETTES` in `ThemeContext.jsx` (must have all 25 color tokens: bg, surface, card, cardHover, border, borderActive, text, textDim, textMuted, accent, accentDim, accentGlow, pro, proDim, warn, warnDim, danger, dangerDim, success, successDim, slack, slackDim, owner, inputBg, overlay).
2. Add entry to `THEME_OPTIONS` array.
3. Optionally add the same palette to the static `DARK` fallback in `theme.js` if you need ErrorBoundary to support the new theme (otherwise ErrorBoundary stays dark).
4. Done — every component using `useTheme()` picks it up automatically.

## Deployment

```bash
cp -r src/ /path/to/cc-app/src/
npm run build
firebase deploy --only hosting
git add -A
git commit -m "v2.1 — full useTheme() hook refactor, live theme switching"
git tag v2.1.0
git push origin main --tags
```

## Build

- 81 modules, 856KB bundle
- Clean build, no errors
- 59 total useTheme() calls across 18 files
