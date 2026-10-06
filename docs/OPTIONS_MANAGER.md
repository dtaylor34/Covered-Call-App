# Options Manager — Design Blueprint

> **Status:** Scaffold shipped (v2.0.58) — analysis tabs blank, context TBD
> **Last Updated:** 2026-10-05
> **Related:** [PRD.md](PRD.md), [DATA_LAYER.md](DATA_LAYER.md), [BROKER_CONNECTIONS.md](BROKER_CONNECTIONS.md)

---

## 1. What this is

The app is becoming a **dual-product** platform under one account, one login, and
one Schwab connection:

1. **Covered Calls Manager** — the existing product (unchanged).
2. **Options Manager** — a sibling product for broader options strategies
   (calls, puts, spreads, etc.). Scaffolded now; each tab's context is filled in
   over subsequent iterations.

A **site switch** in the top header toggles between the two products. The choice
is persisted (`cc:appMode` in localStorage: `"coveredCalls"` | `"options"`).

## 2. Why a switch (not a separate app)

- **One account / one Schwab connection.** Both products read the same auth,
  the same `brokerConnections`, the same linked accounts. A user links Schwab
  once and both products use it. (See [BROKER_CONNECTIONS.md](BROKER_CONNECTIONS.md).)
- **Shared shell.** Header, tab bar, theme, billing/trial gating, and the global
  tabs (APIs, Profile, Setup, Glossary) are shared. Only the per-tab *content*
  differs by mode.
- **Lowest risk.** Covered Calls code is untouched; Options renders from a
  separate component tree.

## 3. Architecture

| Piece | Location | Notes |
|---|---|---|
| Site switch + mode state | `src/views/Dashboard.jsx` | `appMode` via `usePersistedState("cc:appMode")`; logo "CC"/"OM" + title swap |
| Shared tab bar | `src/views/Dashboard.jsx` `TABS` | Same tab ids drive both products |
| Covered Calls content | `Dashboard.jsx` (gated `!isOptions`) | Existing panels, unchanged |
| Options content | `src/components/OptionsManager.jsx` | Rendered when `isOptions` |

**Tab ids are shared** across both products so the single tab bar controls both;
only the rendered panel changes by `appMode`. Switching products keeps the active
tab (e.g. you're on "Working" in CC → switch to Options → you're on Options
"Working").

## 4. Options Manager tabs

Mirrors the Covered Calls tab set:

| Tab (id) | Label | Status | Shared? |
|---|---|---|---|
| `dashboard` | Selection | **Blank placeholder** | No (options-specific) |
| `selection` | Dashboard | **Blank placeholder** | No |
| `working` | Working | **Blank placeholder** | No |
| `risk` | Risk | **Blank placeholder** | No |
| `transactions` | Trades | **Blank placeholder** | No |
| `history` | History | **Blank placeholder** | No |
| `api` | APIs | **Live (reused)** | ✅ Schwab connection |
| `profile` | Profile | **Live (reused)** | ✅ account settings |
| `setup` | Setup | **Live (reused)** | ✅ broker setup guides |
| `glossary` | Glossary | **Live (reused)** | ✅ shared glossary |

> The four global tabs render the real components (`APITab`, `ProfileTab`,
> `SetupTab`, `GlossaryTab`) in both products, so **Schwab stays connected and
> consistent** across the switch — that was an explicit requirement.

## 5. Planned context per blank tab (to be defined)

Working hypotheses — refine as we build each:

- **Selection** — screen option plays by return / risk / expiry across strategy
  types (long/short calls & puts, verticals, calendars, etc.).
- **Dashboard** — build & analyze a single position: pricing, Greeks, payoff
  curve, breakevens, probability of profit.
- **Working** — open option positions with live P&L, exits, and per-position
  charts (reuse the covered-call chart engine where it fits).
- **Risk** — multi-leg payoff & scenario analysis across price / time / IV.
- **Trades** — options transaction log + realized results.
- **History** — historical IV, premiums, and price trends (extend the existing
  history collector to multi-leg / non-covered-call data).

## 6. Data & reuse

- **Market data**: reuse `getPriceHistory`, `getBestReturns`, the option-chain
  providers, and the Schwab hybrid (real-time → Yahoo fallback).
- **Positions**: options positions will need a schema distinct from covered-call
  positions (multi-leg). TBD — likely `users/{uid}/optionPositions`.
- **Charts**: `WorkingPositionChart` / `PriceTrendChart` are reusable primitives.

## 7. Open questions

- Separate Firestore collections for options positions/quotes, or a shared
  schema with a `product` discriminator?
- Does the subscription/entitlement model treat Options Manager as the same
  tier, an add-on, or bundled?
- How much of the covered-call math (`coveredCallMath.js`) generalizes vs. needs
  a new multi-leg options math module?
