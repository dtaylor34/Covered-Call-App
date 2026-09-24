# Handover: Working covered calls, lots, and Google Sheet sync

Target repo: `dtaylor34/Covered-Call-App` (React / Vite / Firebase / Stripe, Schwab OAuth).
This folder holds the design prototypes, a spreadsheet template, and working sync code. Build it into the existing app.

## Ground rules

- **Match the existing app, not the prototype's look.** The prototypes are light-themed layout and behavior references. Use the app's dark theme, mint accent, mono labels, card components, tab bar, and trial gating as they are today.
- **Surgical changes.** Extend existing tabs and components. Don't rewrite or restyle tabs that aren't listed below.
- **Keep the existing disclaimer** and the "Position Summary" / "What Should I Do Right Now?" cards. They become part of the expanded row (see Working tab).
- **Plan first.** Before each phase, list the files you'll touch and wait for approval. Ship each phase as its own small PR.

## What's in this folder

| Path | What it is |
|---|---|
| `reference/Portfolio.dc.html` | Main prototype: working calls list, totals, stoplight, expand, lots, year-to-date/tax, Sheet settings. The `<script type="text/x-dc">` block at the bottom has all the math in plain JS; port it, don't reinvent it. |
| `reference/Main.dc.html` | Single-position detail: time decay chart, price/P&L chart, exit paths, what-if sliders. |
| `reference/Mobile.dc.html` | Mobile glance card. |
| `sheets-sync/functions/sheetsSync.js` | Firebase callable functions: `connectSheet`, `syncSheet`, `sheetServiceAccount`. Ready to deploy. |
| `sheets-sync/src/lib/sheetSync.js` | Client helper: maps app events to ledger rows, calls the functions. |
| `sheets-sync/src/components/SheetSettings.jsx` | Paste-a-Sheet-ID settings panel (unstyled, restyle to match). |
| `Covered_Calls_Ledger.xlsx` | Google Sheets template: Summary, Transactions, Positions, Lots, Reconcile, Setup. The sync writes to fixed columns; see its Setup tab. |

The `.dc.html` files use a custom template runtime (`<x-dc>`, `sc-for`, `sc-if`, `{{holes}}`). Treat them as readable specs, not code to import.

## Where things go in the app

| App tab | Add |
|---|---|
| **Working** | Totals strip, list of working covered calls (one row each), health stoplight column with hover legend, row expand. The expanded row reuses the existing Position Summary cards and powers "What Should I Do Right Now?" with the fill estimate, time/price charts and the four exit paths. Below the list: "Shares by lot". Add/paste form (thinkorswim parser) opens from the Working header. |
| **Dashboard** | Year-to-date strip: premium realized, stock gains realized, open P&L, est. tax on premium, net after tax. Account health. |
| **Trades** (locked tier) | Closed covered calls history with est. tax per row and tax-rate inputs. |
| **APIs** | Google Sheet connection (`SheetSettings`), next to Schwab. |

## Data model (Firestore, per user)

```
users/{uid}                      { sheetId, sheetTitle, taxRates: { fed, state, niit }, targetYieldPct }
users/{uid}/positions/{id}       { sym, contracts, strike, expiry, fillStock, fillCall, gtc, iv,
                                   lotId, liveStock, liveCall, updatedAt }
users/{uid}/lots/{id}            { sym, shares, cost, bought, premiumKept, lastPrice? }
users/{uid}/closed/{id}          { sym, contracts, strike, expiry, fillStock, fillCall, buyback,
                                   how: 'bought'|'expired'|'called', stockGain, delivered, closedOn }
```

- Position ID: `${sym}-${strike}-${expiry}` lowercased, non-alphanumerics to `-` (e.g. `pfe-28-2026-10-16`). Same ID in the Sheet.
- Every call has a `lotId`. A new call either creates a lot (new purchase) or points at an existing free lot.
- Schwab: live prices and open orders can come from the existing Schwab integration. As far as I know Schwab's positions API gives average cost, not tax lots, so lots come from transaction history or manual entry.

## Math (port from `Portfolio.dc.html`)

Put these in one pure module (e.g. `src/lib/coveredCallMath.js`) with unit tests.

- **Option value:** Black-Scholes call, r = 4%, IV per position (default 25%). Put via parity: `P = C − S + K·e^(−rT)`.
- **Call chance (delta):** `N(d1)`.
- **Stoplight:** Red if `S ≥ K` or delta ≥ 0.60. Yellow if delta ≥ 0.35 or `S < breakeven`. Otherwise Green. Hover legend text is in the prototype.
- **Per position:** premium = fillCall × shares; buy back = liveCall × shares; kept = premium − buy back; if closed now = (liveStock − fillStock) × shares + kept; breakeven = fillStock − fillCall; max profit = (K − fillStock) × shares + premium; health = (liveStock × shares + premium − buy back) / (fillStock × shares).
- **GTC fill estimate:** first day (stepping 0.25 days) where modeled call ≤ GTC price at the current/what-if stock price.
- **Lots:** effective cost = cost − (premiumKept + open call premium) / shares.
- **Free-lot signal:** strike step 0.5 (<$50), 1 (<$200), 5 (else). K = ceil(max(effective cost, S)). 30-day call yield vs target (default 1%/month): Ready ≥ target; Thin ≥ 0.35 × target; Hold otherwise, with a scan upward for the price where it turns Ready.
- **Delivery order on assignment:** highest cost ≤ strike first, then lowest cost above the strike.
- **Wash-sale flag:** lot under cost and another lot of the same symbol bought within the last 30 days. Clear date = latest such buy + 31 days.
- **Tax estimate:** combined rate = federal + state + 3.8% if NIIT. Applied to max(0, realized). Label everything "estimate, not tax advice".

## Acceptance checks (PFE, the real first trade)

Inputs: bought 100 @ $27.80, sold 1 × Oct 16 '26 $28 call @ $0.55, live stock $27.775, live call $0.57, 25 days, IV 22%, GTC $0.10.

- Money in trade $2,725.00 · If closed now −$4.50 (shares −$2.50, call −$2.00) · Max profit +$75.00 · Breakeven $27.25
- Health 99.8% · Call chance 47% → Yellow · Modeled call ≈ $0.57 · GTC fill keeps $45.00
- Lots at $27.775 with lots at $27.80 / $29.10 / $26.40: deliver the $27.80 lot if called at $28; $26.40 lot → Ready ($28 call ≈ $0.64, 2.3%/mo); $29.10 lot → Thin ($29.50 call ≈ $0.18, 0.6%/mo) and wash-sale flagged.
- Sheet: after syncing these two fills, Summary shows If closed −$4.50 and Account health 99.8%.

## Phases

1. Math module + unit tests using the acceptance numbers.
2. Firestore model, manual add/edit/close, thinkorswim paste parser (port `parsePaste` / `saveForm`).
3. Working tab: totals, rows, stoplight + hover, expand with existing Position Summary and the charts/exit paths.
4. Shares by lot section, lot picker in the add form, lot-aware closing.
5. APIs tab: deploy `sheetsSync.js`, add `SheetSettings`, call `syncQuietly` on save / close / price update.
6. Dashboard year-to-date and Trades history + tax (respect tier locks).
7. Optional: auto-import open calls and fills from Schwab instead of manual entry.

## Sheet sync setup

1. Enable the Google Sheets API in the Firebase project's Google Cloud console.
2. `cd functions && npm i googleapis`; add `Object.assign(exports, require('./sheetsSync'))` to `functions/index.js`.
3. User imports `Covered_Calls_Ledger.xlsx` into Google Sheets, shares it with the service account shown in APIs, pastes the Sheet ID.
