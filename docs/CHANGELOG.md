## [2.5.1] — 2026-10-29

### Fixed
- **Best Returns PR now tracks the contract count you select.** It only re-fetched on symbol change and showed "premium received" for the contract count from that last fetch (e.g. switching 2 → 1 kept showing 2's premium). PR and the applied-strategy summary now scale off the live `contracts` prop — updating instantly, with no extra chain scoring.

---

## [2.5.0] — 2026-10-29

### Added
- **Schwab real-time price on the covered-calls Selection view.** When your broker is connected, the Current Price card (and everything derived from it — cost to enter, breakeven, ROI tables, the price-trend chart) now uses a live Schwab quote via `useSchwabQuote` (refresh ~45s), badged "LIVE · Schwab real-time". Falls back to Yahoo ("15m delay") when not connected. Resolves the price reading ~15 min stale even with Schwab linked.

### Fixed
- **Risk-free-rate fetch no longer fails on every scoring call.** `riskFreeRate.js` used a cache doc id of `meta/riskFreeRate`, producing the 3-segment path `marketData/meta/riskFreeRate` that Firestore's `.doc()` rejects — so every `getCoveredCalls` silently fell back to a hardcoded 4.5% rate. Fixed to a single-segment id (`meta_riskFreeRate`).

---

## [2.4.1] — 2026-10-29

### Fixed
- **Price trend chart headline now matches the live price.** `PriceTrendChart` showed the last *completed* daily bar (e.g. yesterday's close) as its headline price and badged it "real-time," which contradicted the live Current Price card (e.g. chart $612.49 vs card $629.06). The headline, the line's final point, and the % change now pin to the live `currentPrice` when available.

---

## [2.4.0] — 2026-10-29

### Added
- **Options Dashboard → Strategy Builder.** Prices common multi-leg strategies (verticals, straddle, strangle, iron condor, butterfly, single legs) off the live chain using bid/ask mids, with net debit/credit, max profit/loss, breakevens, and a payoff-at-expiration chart.
- **Working Options → strategy grouping + analysis.** Imported legs now group into recognized strategies (e.g. a straddle shows as one card) with a live net P&L, % of max, DTE, and a health chip. Expand a card for a **Strategy Position chart** — payoff at expiration + current (mark-to-model) P&L curve, breakevens, each leg's strike, a "now" line, **profit-take / stop zones**, and a **time-decay strip** (P&L if price holds, today → expiry).
- **Mechanical profit-taking guidance.** Credit strategies: take profit at 50% of max, manage at 21 DTE, defensive stop at 2× credit. Debit: scale out at +50% / +100%, soft stop at −50%, theta caution ≤21 DTE. Surfaced as a per-strategy recommendation + target lines on the chart.
- **Sync from Schwab (Working Options).** One tap imports new positions, refreshes marks, and archives anything no longer at the broker into history. Live marks auto-refresh (~60s, Schwab-first / Yahoo fallback) with a source badge.
- **Sample straddle** button on the empty Working Options state to try the strategy chart without a live position.

### Changed
- `useOptionsChain` normalizer (`normalizeSchwabChain`) is now exported for reuse by the options live-marks hook.

### Fixed
- **Working tab: Schwab call marks now actually apply.** `useLivePortfolio` read the option-chain callable result without `.data`, so live Schwab call prices silently fell back to Yahoo. Now reads `res.data` as intended.

### Changed
- **Runtime upgrade:** Cloud Functions moved to **Node.js 22** (Node 20 is decommissioned 2026-10-30); `firebase-functions` bumped to **7.4.0**.

---

## [2.3.0] — 2026-10-23

### Added
- **Option chain: live Schwab bid/ask + "Update Prices".** The option-chain ladder now pulls real-time bid/ask from **Schwab when your broker is connected** (works after hours, when Yahoo returns no quotes), falling back to **Yahoo (15-min delayed)** otherwise. A header badge shows the active source (**● Schwab live** vs **Yahoo · 15-min delayed**). New **Update Prices** button re-fetches on demand and stamps the last-updated time.

### Changed
- `schwabGetOptionChain` now requests **calls + puts** (`contractType: ALL`) so the two-sided ladder fills from Schwab.

---

## [2.2.0] — 2026-10-19

### Added
- **Options → Projections: any-symbol back-test.** Free-symbol input (stocks/ETFs/futures, incl. OKLO) with quick-pick chips; both-valuation (Black-Scholes mark-to-market **and** intrinsic) via new Expiration + IV inputs; a standard **strike ladder** around the selected day; a past→future **price projection** to expiration (flat / ±1σ); a **Position Summary** (net cost, daily theta, max loss/gain, breakeven + % move needed, and a −$5/−$2/flat/+$2 **move table**); and the **live option chain** — click a real bid to load that strike + premium.
- **Covered Calls → Projections:** estimate what the call **would have sold for** at entry (Black-Scholes), suggesting an ATM strike + premium when the fields are empty.
- **Minute Compare:** hover tooltip (price, minute, clock time, Δ/% vs prior close).
- **Covered-call chart:** buy-back-cost **hover** (cost to buy back + premium you'd keep at any point); the buy-back-cost curve now shows in all future-window ranges (1m…6m + Range), with an **"est. fill"** marker where it crosses your GTC limit.

### Fixed
- **GTC buy-back signal now reads the truth, not a model.** Fill status comes from the resting Schwab order's **WORKING/FILLED status** (new `parseSchwabGtcOrders`) when synced, else the live call **mark** vs your limit — no more false "fills right away" while the order sits above the limit. The buy-back level + theta arch are calibrated to the **mark-implied IV** (not a 25% default), and days-to-expiry is taken from the real expiration date.
- **Cost-basis guards:** stock-leg metrics (money in / if-closed / max profit / breakeven / health) show "—" with a prompt when no share cost basis is set, instead of nonsense; added cost-basis-free **Premium kept** / **Buy-back now** tiles.
- **Closed-trade lifecycle chart:** exit marker, label, and a new exit vertical line are theme-colored by outcome (were invisible white on light theme).
- **Selection tab:** the price trend chart and the Minute Compare chart now share geometry and align.

---

## [2.1.4] — 2026-10-10

### Added
- **Covered Calls → Projections tab (new)** — back-test a covered call against price history, mirroring the Options Projections:
  - **Pick a working covered call** (pre-fills symbol, cost basis, strike, premium, IV, DTE, entry) or go **Custom**.
  - Every day the short call is **marked with Black-Scholes** (time decay + price move), showing the **covered-call P&L over time** (violet, right axis) = stock move + premium kept, with the **strike** (assignment) and **breakeven** lines on the price chart.
  - Stat cards: **premium collected, P&L now, best buy-back (most premium captured), best total exit, and the if-held-to-expiry outcome** (called away vs expired).
  - **Ask Claude** — a covered-call-specific prompt ("buy back / hold / roll"): **Copy for Pro chat** (free) or **Run via API**. The `optionsExitAdvice` function now accepts a custom prompt so both products share it.
  - Appears in the Covered Calls nav right after Working.

---

## [2.1.3] — 2026-10-10

### Changed / Fixed
- **Breakeven warning no longer false-flags low-cost-basis covered calls** — the ⚠ now compares the call premium to the stock's **market price** (a real per-contract ×100 import error makes the premium ≈ the stock price), instead of to the cost basis. So a legitimately low-cost-basis position (e.g. long-held META with a ~$35 basis) stops showing a false warning.
- **Editable "Share price paid"** in the working-position detail — correct a share cost basis directly if it's ever off (previously only the call price was editable there).

---

## [2.1.2] — 2026-10-10

### Added
- **Capture historical data for treasuries & futures** — the tracked-symbol registry (History tab) now accepts **futures (ZB=F), yields/indexes (^TYX), and ETFs** — previously the input rejected anything that wasn't a plain equity ticker, so treasuries couldn't be logged. New **"+ Track US Treasuries (30y/10y/5y)"** one-click button adds ZB=F / ZN=F / ZF=F plus the ^TYX / ^TNX / ^FVX yield indexes; use **Backfill** to load ~2 years immediately, and daily snapshots accrue going forward to test strategies against real trends.
- **Daily collector hardened for futures/indexes** — the scheduled snapshot now falls back to a daily chart close when a symbol can't be quoted the equity way (so ZB=F / ^TYX get captured forward, price even when no options chain exists).

### Note
- The optional "Run via API" AI function (`optionsExitAdvice`) is temporarily unexported so deploys don't require the Anthropic key — it'll be re-enabled the moment the `ANTHROPIC_API_KEY` secret is set. The Copy-for-Pro-chat path and heuristic are unaffected.

---

## [2.1.1] — 2026-10-10

### Added
- **Options Manager → Backtest tab (new)** — run a **saved strategy** against price history. Pick the strategy + an entry date (click the chart or type it), and every leg is **marked day-by-day with Black-Scholes** (price move + time decay) through the strategy's DTE. The chart shows the underlying (left axis) and the **strategy P&L** (right axis, violet) over the holding window, marks the **best historical exit**, and the cards summarize net-at-entry, best-exit date + P&L, days-to-best, and P&L at end — so you can see when getting in/out would have paid. Appears in the Options nav after Strategies.

---

## [2.1.0] — 2026-10-10

### Added
- **Options Manager → Strategies tab (new) — custom multi-leg builder** — a fully editable, free-form strategy designer:
  - **Add / edit / remove any legs** — each leg is buy/sell · call/put · strike · premium · qty, all editable.
  - **Optional presets** to start from (long/short strangle, straddle, iron condor, call/put debit spread) that drop in legs you can then change freely.
  - **Premium estimates** — one click fills premiums from Black-Scholes using an IV + DTE you set, or type your own; **"↻"** fetches the current underlying price.
  - **Live payoff diagram** — combined P/L at expiry vs price (green profit / red loss), with **breakeven(s)**, **max profit/loss**, the **current price** and its P/L, and net credit/debit.
  - **Save named strategies** and switch between them from a dropdown (each its own setup) — e.g. build your "iron claw" above and below the market and see exactly what it'd look like. Stored per-user in Firestore (new `optionStrategies` collection + rules).

---

## [2.0.99] — 2026-10-10

### Added
- **Breakeven sanity warning (Covered Calls)** — any position whose call premium is over 25% of the share price (the sign of a per-contract ×100 import error, like the META $20.43 breakeven) now shows a **⚠** on the breakeven in the row and a warning in the detail — with a one-click **"Fix: ÷100"** button and a new editable **"Call sold at (entry)"** field so you can correct it instantly. Non-destructive; nothing auto-changes.
- **Combined straddle P&L line (Projections)** — on top of the two breakeven lines, the chart now overlays the **net call+put P&L** over the holding window on a right axis (violet), marks the **best combined exit**, and adds a **Combined (call + put)** card showing P&L now, best exit date, and best P&L.

---

## [2.0.98] — 2026-10-10

### Added
- **Year filter on Monthly P&L** — both the Covered Calls and Options monthly P&L pages now have **All / 2026 / 2025 …** year pills (shown once there's more than one year of history). Filtering recomputes the bar chart, summary cards, table, and the running cumulative for just that year.

---

## [2.0.97] — 2026-10-10

### Added
- **Options Manager → Trades tab (new)** — a flat chronological transaction log: every open and close as its own line item with per-row cash flow (premium paid negative, received positive), status, and running totals (transactions, realized P&L, net cash flow). **Export CSV** included. All five Options tabs are now built (Selection · Working · Risk · Projections · Trades · History).
- **Long/Short toggle per leg in Projections** — the call and the put each have a **long / short** switch. P&L, breakeven profit-direction, zone shading, leg cards, and the Claude prompt all flip accordingly — so you can model buying *or* selling either side (long straddle, short straddle, etc.).
- **Reconnect button on the Covered Calls Working tab** — when Schwab has lapsed, a "↻ Reconnect (saved key)" banner appears up top and re-authorizes with your stored key (no re-typing), right where you'd notice it instead of hunting in the APIs tab.

---

## [2.0.96] — 2026-10-10

### Added
- **Projections now has both AI paths, side by side** — so you can compare answer quality:
  - **📋 Copy for Pro chat** — copies the prompt to paste into claude.ai (your Pro account, free).
  - **⚡ Run via API** — gets Claude's exit advice inline on the page (Anthropic API, small per-click cost). Restored the `optionsExitAdvice` Cloud Function; it needs the one-time `ANTHROPIC_API_KEY` secret and shows a clear message until that's set.
  - The free rules-based heuristic stays above both.

---

## [2.0.95] — 2026-10-10

### Changed
- **Projections AI is now Pro-friendly (no API key, no cost)** — replaced the paid-API "Ask AI" button with **"📋 Copy prompt for Claude"**. It copies the full scenario (strike, premiums, both breakevens, and the price path since entry) as a ready-to-paste question; paste it into **claude.ai** to get exit advice using your **Claude Pro** account — no Anthropic API, no key, no per-click charge. A **View** toggle shows the prompt text (with a manual-copy fallback if the clipboard is blocked). The free rules-based heuristic stays on-page for an instant read. Removed the `optionsExitAdvice` function and `ANTHROPIC_API_KEY` requirement.

---

## [2.0.94] — 2026-10-10

### Added
- **AI exit advisor (Claude) in Projections** — an **"Ask AI: when to exit"** button sends the post-entry price path plus your call/put strike, premiums, and breakevens to Claude, which returns concise, per-leg exit guidance (CALL / PUT / OVERALL) reading momentum and the move into/out of each breakeven. Backed by a new `optionsExitAdvice` Cloud Function (Anthropic). Requires a one-time `ANTHROPIC_API_KEY` secret; until it's set, the button shows a clear "AI isn't configured" message and the rules-based heuristic still works.

---

## [2.0.93] — 2026-10-10

### Added
- **Options Manager → Projections tab (new)** — back-test a CALL and a PUT at a chosen strike against US-Treasury futures history (30y ZB, 10y ZN, 5y ZF):
  - **Two breakeven lines cross the price chart** — the **call breakeven** (green; price must rise above to profit) and the **put breakeven** (blue; price must fall below to profit), with the strike marked and the profit zones shaded. Exactly "where price has to get for the call vs. the put to make money."
  - **Set your entry** (click the chart or a date), then each leg's **P&L is tracked day-by-day** — the chart marks the **best historical exit** for the call and for the put, and leg cards show breakeven, P&L now, and best exit + best P&L.
  - **Exit suggestion (heuristic)** reads the historical path for when to get out; **AI-written exit timing (Claude) is the next step.**
  - The Projections tab appears in the Options Manager nav only (after Risk).

---

## [2.0.92] — 2026-10-10

### Added
- **Options Manager → Risk tab (new) — payoff diagram** with a **Position / Portfolio switch**:
  - **Position** — pick one option; see its profit/loss-at-expiry curve.
  - **Portfolio** — pick a symbol; all your legs on that underlying stack into one combined payoff.
  - Green/red payoff line (profit vs loss), the **zero line**, **breakeven(s)**, the **current underlying** with its P/L marked, and stat cards for P/L-at-current, max profit/loss across the plotted range, and breakeven(s). Direction-aware and multiplier-aware (equity ×100, futures ×1000).

---

## [2.0.91] — 2026-10-10

### Added
- **Options Manager → History tab (new)** — closed options (sold/bought to close, expired, or exercised/assigned) in their own dedicated tab, mirroring the Covered Calls history:
  - **Rows** show the contract, side, strike, close date, entry→exit prices, and **direction-aware realized P&L** (+ outcome and days held). Click to expand the **lifecycle chart** (underlying from entry → exit with strike/breakeven/exit marker) and a realized summary.
  - **Inline edits** — fix entry/exit dates, outcome, entry price, and exit price, or delete a record.
  - **📅 Monthly P&L** — a full-page track record of realized options P&L by month (green/red bar chart, best/worst month, win rate, and a table with running cumulative), with a Back arrow.
  - Entry prices unknown on an imported close are flagged ("add entry") and excluded from totals until filled in.

---

## [2.0.90] — 2026-10-10

### Added
- **Options Manager → Working tab (new)** — a live position tracker for your options plays, mirroring the Covered Calls Working tab but for general single-leg options:
  - **Long & short calls and puts**, on stocks/ETFs **and futures/treasury options** (ZB, /ZB) — the instruments we keep out of the covered-call history live here.
  - **Direction-aware P&L** — long options gain as they rise, short options gain as they decay; totals strip shows debit paid, credit received, current value, and open P&L.
  - **Per-position chart** — underlying price with strike, breakeven, entry dot + date, expiration, current price, ITM shading, ranges (1d→6m + entry→expiration), and hover readout. Works for calls and puts.
  - **Import from Schwab** — one click pulls all your open option positions (long/short, calls/puts, equity + futures options) with live marks; plus a manual **Add** form.
  - **Exit actions** — sell/buy to close (at a price), expired worthless, or exercised/assigned — each moves the position into the options history (the History tab for these lands next).

---

## [2.0.89] — 2026-10-10

### Changed
- **Trade History is covered-calls only** — history now captures *only* covered-call bundles (shares + the call sold against them) on **stocks/ETFs**. Excluded, by design:
  - **Futures & treasury/futures options** (e.g. /ZB, ZB=F, ^TYX) — the Schwab import skips any leg whose asset type isn't a plain equity option, and any non-equity underlying.
  - **Plain stock buys & sells** — these never were options legs, so they don't enter (confirmed/kept out).
  The filter is applied on import, on expiry auto-settlement (only equity covered calls settle into history), and defensively on display (any stray non-equity record is hidden from Trade History and Monthly P&L).

---

## [2.0.88] — 2026-10-10

### Added
- **Auto-settle expirations & assignments on sync** — "Sync from Schwab" now tracks all three ways a covered call closes, not just buy-backs:
  - **Bought back** — from Schwab buy-to-close orders (incl. early GTC fills). *(already did this)*
  - **Called away** — when the call is **in-the-money at expiry**, the position is closed as assigned: the shares are sold at the strike (lots delivered, stock gain recorded).
  - **Expired worthless** — when the call is **out-of-the-money at expiry**, the position closes keeping 100% of the premium.
  The sync settles any working position whose expiry has passed (and wasn't bought back) by comparing the stock's close on the expiry date to the strike — how options actually settle — and reports e.g. "bought back 2, 1 called away (shares sold), 1 expired worthless." All of it lands in Trade History (and the Monthly P&L), and every outcome stays editable there if a settlement needs correcting.

---

## [2.0.87] — 2026-10-10

### Added
- **Monthly P&L track record** — a new **"📅 Monthly P&L"** button in Trade History opens a full page showing your realized premium profit/loss **by month**: a green/red bar chart (profit above the line, loss below), summary cards (total realized, total premiums, best/worst month, win rate), and a table with each month's trades, premiums, realized P&L, win rate, and a **running cumulative** total. A **← Back** arrow (or Esc) returns to Trade History. Buy-backs still missing their opening premium are flagged and excluded until you fill it in.

---

## [2.0.86] — 2026-10-10

### Added
- **One-click Schwab reconnect (no re-typing your key)** — Schwab expires the connection every 7 days, which previously meant re-entering your App Key + Secret each time. Now the APIs tab has a **"↻ Reconnect with saved key"** button that reuses the credentials already stored (encrypted) server-side — you just log into Schwab again. New `schwabReauthorize` function builds the OAuth URL from your stored key; the existing callback/exchange flow finishes it. (The ~weekly re-login is still required — that's Schwab's refresh-token limit — but you no longer re-enter the key.)

---

## [2.0.85] — 2026-10-10

### Changed
- **Import button is always visible in Trade History** — previously it was hidden and replaced by a small hint when Schwab wasn't connected, which read as "no button." Now the **"⬇ Import closed trades from Schwab"** button always shows; if Schwab isn't connected it displays a clear **"Schwab not connected — reconnect in the APIs tab first"** note next to it (Schwab refresh tokens expire every ~7 days, so periodic reconnection is required).

---

## [2.0.84] — 2026-10-10

### Fixed
- **Buy-backs weren't importing** — a buy-back for a call that was still an open position in the app could fall through a gap (skipped by the standalone importer, dropped by a fragile date-guard in the position-closer), so nothing happened. The sync now handles **every buy-to-close in one pass**: if it matches an open position it closes it; otherwise it's imported into Trade History. The date-guard is gone.
- **More robust option parsing** — the order parsers now fall back to the human description (e.g. "META … 10/23/2026 $820 Call") when Schwab's OCC option symbol doesn't parse, so legs aren't silently dropped.
- **Diagnostic sync message** — when nothing imports, the sync now reports what it saw ("Checked 2 accounts · 143 orders · 0 buy-backs found …") so it's clear whether Schwab returned the trades at all vs. they were already recorded. Details also logged to the browser console under `[Schwab sync]`.

---

## [2.0.83] — 2026-10-10

### Changed
- **Trade History rows now show both the covered call and the buy-back** — each closed trade lists its legs like the working view: the **SELL to open** (the covered call, at its fill), the **BUY to close** (the buy-back, at its fill + date), and the backing **shares**. So you see exactly what happened to open and to close the position.
- **Schwab import now brings in every buy-back** — the importer previously only captured calls both opened *and* bought back inside Schwab's ~60-day window. It now imports **every buy-to-close** (buy-back), even when the original sale is older than 60 days. For those, the opening premium is marked unknown ("add premium") and you can enter it inline to compute P&L; realized totals and win rate exclude unknown-premium trades until you fill them in.

---

## [2.0.82] — 2026-10-10

### Changed
- **Sync is now discoverable in Trade History** — the Trade History section always shows when Schwab is connected (even with zero closed trades) and carries its own **"⬇ Import closed trades from Schwab"** button plus an empty state. If Schwab isn't connected it says so ("Connect Schwab in the APIs tab…"), so it's clear why nothing imports. The top-of-tab sync button remains too.

---

## [2.0.81] — 2026-10-10

### Added
- **Trade History on the Working tab** — a new section at the bottom lists every **closed** covered call in the same Schwab-style order rows as the working list. Each row shows the outcome (bought back / expired / called) and realized P&L; click to expand the full **lifecycle chart** (entry dot → strike/breakeven → exit marker) plus a realized summary (premium, buy-back, option P&L, stock P&L, net, days held). A realized-totals strip (closed trades, total premiums, realized P&L, win rate) sits on top.
- **Edit history inline** — in each expanded Trade History row you can correct the entry date, exit date, outcome, buy-back price, share price paid, and stock-at-exit, or delete the record — so the chart and P&L stay accurate.
- **Import closed trades from Schwab** — "⬇ Sync from Schwab" now also reconstructs **fully-closed covered calls** (a sell-to-open paired with a later buy-to-close in Schwab's ~60-day order history) that were never app positions, and drops them into Trade History. De-duplicated so re-syncing won't create copies. (Expirations/assignments aren't in Schwab's orders API, so those still need to be marked by hand; and the sync button now shows whenever Schwab is connected, even with no open positions.)

---

## [2.0.80] — 2026-10-09

### Changed
- **Stacked View is now a show/hide toggle on the View All page** — the flat per-day charts are no longer replaced. Open **⊞ View All** (the flat charts) and use the **▦ Stacked overlay** toggle to show or hide the layered overlay chart above them; toggle it off to go back to just the flat charts. Esc closes the overlay first, then the page.
- **Stacked overlay uses green/red only** — a hovered day now highlights **green for BUY** and **red for SELL** (matching the Data Trend dots), instead of blue/red.

---

## [2.0.79] — 2026-10-09

### Added
- **Editable minute on the Data Trend view** — the captured minute is now an input (header + the View All / Stacked top bars), so you can change it right on the page instead of only from the Intraday tool. Press Enter or tab out to apply.
- **Editable range — look much farther back** — the range is now an editable "days back" field (plus presets out to 1Y / 2Y) in addition to the 1W–2M presets. Up to ~60 days uses 5-minute bars; beyond that it automatically switches to hourly bars so you can go back as far as ~2 years (the active bar size is shown next to the field; the minute is approximate on hourly). New bulk `getIntradayRange` function powers it.
- **Stacked View** — a new "▦ Stacked View" button layers every day in the range on one chart, each day normalized to its own prior close (0% baseline) so the shapes overlay. Earlier days are faint grey, the most recent day is drawn in color on top. Hover any line to highlight it and color it by that day's signal — **blue for a BUY day** (price at your minute was below the prior close) or **red for a SELL day** (above) — with a readout of the date and the minute-N move. Back arrow / Esc returns to the Data Trend view.

---

## [2.0.78] — 2026-10-09

### Added
- **Hover tooltips across the Working Covered Calls table** — every result now explains itself and the truncated ("…") cells can be read in full on hover:
  - **Totals strip** — Money in trade, Premium, Kept so far, If closed now, and Best case each have a plain-English tooltip (and a small ⓘ) describing exactly how they're calculated.
  - **Per-row results** — the stoplight status (e.g. "Good · 11%") explains the health + odds of being called and when your GTC buy-back is likely to fill; the **"if closed …"** cell spells out your net-if-closed and what the % means; the **"buy-back · keeps …"** cell explains the GTC and how much premium you keep. These were the cells getting cut off — the tooltip shows the full number + context.
  - **Column headers** — each Schwab-style column (Strategy, Pos Effect, Strike Type, TIF, Exch, …) has a tooltip explaining the term.
  - **Account tag** — the truncated "··NNNN" chip shows the full Schwab account name on hover.
  - **Recently closed** — each closed-call chip explains how and when it closed.

---

## [2.0.77] — 2026-10-09

### Added
- **Entry dot on the position charts** — the covered-call chart now marks **where you entered the market** with an indigo dot on the price line at the entry date (labeled "entry $X" + shown in the legend), mirroring the "today" dot at the current price. It uses the actual stock price on your entry date from history, falling back to the recorded share price paid.
- **Entry captured in history** — the same entry dot now appears on the **closed-trade lifecycle charts** (Trades → Closed), so for every past trade you can see where you got in relative to the strike, breakeven, and the exit marker. Entry date and share price paid were already stored on each position/closed record; this surfaces them visually.

---

## [2.0.76] — 2026-10-08

### Fixed
- **Data Trend now captures the exact selected minute (root cause)** — `getMinuteTrend` was snapping each day's capture to the nearest 5-minute bar, so selecting minute 8 actually captured minute 10 (9:40) at the data level — which then drove the dot, the B/S signal, and every downstream label. It now **interpolates the price at the exact requested minute** between the two surrounding bars and reports `capturedMin` as the minute you asked for. Combined with the v2.0.75 marker fix, minute 8 is now minute 8 everywhere (dot, signal, snapshot, and the intraday charts). Note: across the full ~60-day window the finest feed is 5-minute bars, so the captured price is an interpolation of the 9:38 value; open an intraday day at **1m** resolution to see the true 9:38 print for days within the last ~7 days.

---

## [2.0.75] — 2026-10-08

### Fixed
- **Intraday marker now sits at the exact selected minute** — the Buy/Sell circle on the intraday day charts was snapping to the nearest 5-minute bar, so a selection of minute 8 (9:38) showed at minute 10 (9:40). The marker is now placed at the true selected minute by interpolating between the two surrounding bars (dead-on at 1m resolution, and positioned correctly between bars at coarser ones), with a small time label (e.g. "9:38 AM") above it.

---

## [2.0.74] — 2026-10-08

### Added
- **"⊞ View All" on the Data Trend chart** — opens a full-page flat grid of every day's intraday chart for the selected range (newest first), so you can scan all the sessions' intraday shapes at once instead of opening them one at a time. Each tile is a full intraday chart (hover readout + drag-to-zoom). A global **resolution toggle** (1m / 5m / 30m / 1h) in the top bar sets the bar size for all tiles at once. A **← Back** arrow (or Esc) returns you to the focused Data Trend view exactly as you left it.

---

## [2.0.73] — 2026-10-08

### Added
- **Resolution toggle on the intraday day chart** — switch the bar size between **1m / 5m / 30m / 1h** to go from a fine minute-by-minute view to a coarse "full day at a glance." `getIntradayDay` now takes an `interval`; the minute-N Buy/Sell marker snaps to the nearest bar so it still shows at coarse resolutions. (1-minute bars are only available ~7 days back — if a day's too old for 1m, the chart says so and you can drop back to 5m; the toggle stays visible so you can switch without reopening.)

---

## [2.0.72] — 2026-10-08

### Added
- **Full intraday chart for a selected Data Trend day** — click any B/S circle and a detailed intraday panel opens below the trend: the day's regular-hours price path (5-min bars), the prior-close reference (dashed), and the minute-N capture point with its Buy/Sell marker. Data is lazy-loaded per day via a new `getIntradayDay` function (kept off the main payload).
- **Focus / zoom** — drag across the intraday chart to zoom into any window (both axes rescale to the selection); "⤢ Reset zoom" or double-click restores the full day.
- **Hover price readout** — moving across the intraday chart shows a crosshair, a dot on the line, and a price + time tag at the cursor (plus the move vs prior close), so you can read the exact value at any point of the day.

---

## [2.0.71] — 2026-10-08

### Added
- **Per-day snapshot popup on the Data Trend chart** — hover (or tap to pin) any B/S circle to see that trading day's snapshot: a mini chart showing prior close → the minute-N dot (with its Buy/Sell marker) → the day's close, plus the numbers (prior close, minute-N price, day close) and how it resolved ("✓ favorable / ✗ unfavorable · closed +X (+Y%) vs the minute-N dot"). The hovered day gets a highlight ring. No extra data fetch — it uses the per-day capture already loaded.

---

## [2.0.70] — 2026-10-08

### Fixed
- **Light mode on the sign-in screen** — the right-hand auth panel (panel background, Google/Apple buttons, email/password fields, and the Sign In / Create Account tab switcher) was hardcoded to dark values, so in light mode it rendered as a dark slab against the light branding panel. All four now use theme tokens (`T.overlay`, `T.card`, `T.inputBg`) so the panel matches the selected theme in light, dark, and high-contrast modes.

---

## [2.0.69] — 2026-10-08

### Added
- **Earnings & dividend awareness in Best Returns** (best-returns-spec2.md §1) — the three strategy buttons now factor in real market events. "Best No-Sale" penalizes strikes whose cushion can't absorb an earnings report inside the expiry window (heavier the closer the strike), adds a bonus when an ex-dividend falls in the cycle, and a bonus when implied vol sits in a high percentile of the collected history. "Best Sale" adds a dividend-capture bonus. Earnings/ex-div dates come from a new `getFundamentals` function; IV percentile is computed from the daily IV history this app collects (null until ~20 samples, so it degrades cleanly).
- **Key Events, fully wired** (best-returns-spec2.md §2) — the Key Events section now generates real, color-coded events for the selected strike/expiry: **Dividend Capture** (green/gray/yellow depending on whether the ex-date lands before expiry and how close the strike is), **Earnings** (red/yellow/green by OTM cushion), **IV Percentile**, **FOMC meeting**, **Expiration week** (gamma), and **Weekly vs Monthly** expiry. Each carries a detailed ⓘ InfoTip (the same component used elsewhere) and events are sorted red → yellow → green → gray. Collapsed by default showing the top event + "· N more events".

---

## [2.0.68] — 2026-10-06

### Added
- **Tell positions apart + see when they close** on the Working tab:
  - **Account badge on each row** — the account nickname (Stock / Roth, or ··NNNN) now shows right next to the symbol, so two of the same contract in different accounts are instantly distinguishable at a glance (no need to expand).
  - **GTC fill status per row** — under the stoplight, each position shows its buy-back status: "↓GTC ~5d" / "↓GTC fills ~now" (highlighted green when imminent) so you can see when a call is about to sell/close.
  - **"Recently closed" strip** — a line at the top listing the latest closed calls (e.g. "PFE $28 bought back @ $0.10 · 2026-10-05"), so you immediately know when an action has closed/sold, with a pointer to Trades → Closed for the full history + lifecycle charts.

---

## [2.0.67] — 2026-10-06

### Added
- **Account nicknames (Stock / Roth)** — in the APIs tab you can now **name each linked Schwab account** (e.g. "Stock", "Roth") with an inline nickname field. Those names show everywhere the account is referenced — on import candidates and in the expanded working-position view ("Schwab account Roth · ··NNNN") — so you can tell which covered call lives in which account instead of staring at raw numbers. New `setAccountLabel` on the broker hook; labels stored on `brokerAccounts`.

---

## [2.0.66] — 2026-10-06

### Added
- **Multi-account Schwab support** — "Import from Schwab" and "Sync from Schwab" now pull covered calls, orders, and buy-backs from **all** your linked Schwab accounts (e.g. your brokerage + Roth), not just one. Each covered call is tagged with its account (last 4 of the account number) so the **same contract held in two accounts no longer collides** — position ids are now account-aware (`positionId` gains an account suffix; positions store `acct`/`acctId`). Import rows and the expanded working-position view show a **"Schwab account ··NNNN"** tag, and sync matches each position within its own account (closes are de-duped across accounts).

### Note
- If you imported a covered call *before* this update (untagged) and re-import it now, the new per-account copy is tagged — you may see the old untagged one as a duplicate to remove once.

---

## [2.0.65] — 2026-10-06

### Added
- **Auto-capture covered-call closes from Schwab** — the Working tab's **"⬇ Sync from Schwab (entry dates + buy-backs)"** now also detects **FILLED buy-to-close** orders and records them as closed trades at the actual fill date & price. So a GTC buy-back you did in Schwab (e.g. PFE $28 call bought back at $0.10) lands in **Closed Trades** automatically instead of being stuck as a working position. New `parseSchwabCloses` parser; `closePosition` accepts the real close date.
- **Closed-trade lifecycle chart + exit marker** — rows in **Closed Trades** (Trades tab) are now **expandable** to show a per-trade chart: the stock from before entry through exit, with strike + breakeven lines, an "entry" marker, and the **trigger/sale marked by a circle inside a white square**, colored by outcome (bought back / expired / called away). Review what happened and when you sold early vs let it expire.

---

## [2.0.64] — 2026-10-05

### Fixed
- **Console 400 errors from the Strikes browser on futures/index symbols** — selecting ZB=F, ^TYX, etc. was calling the equity option-chain endpoints, which rejected them ("Invalid ticker symbol") and spammed the console. The Strikes & Expirations browser now detects futures (`=`) / index (`^`) symbols and skips the chain calls entirely, showing the "no listed chain — use TLT" note without firing (or erroring on) the request.

---

## [2.0.63.1] — 2026-10-05

### Fixed
- **"Could not load intraday history" on Data Trend (and Intraday without Schwab)** — `getIntradayCompare` and `getMinuteTrend` referenced an undefined Yahoo client (`yfChart` instead of `yf`), so the Yahoo path threw. Data Trend (which has no Schwab path) failed outright; Intraday only worked for Schwab-connected users. Fixed the client reference — both now load from Yahoo as intended.

---

## [2.0.63] — 2026-10-05

### Added
- **Data Trend switch on the Minute Compare chart** — an **Intraday / Data Trend** toggle. Data Trend plots, for each of the last ~N trading days, the price captured at your selected **minute N** (dot per day, narrow vertical line from that day's prior close), marked with a green **B** (buy — below prior close) or red **S** (sell — above), plus a faint dot for each day's **end-of-day close** so you can scan for a pattern. Range buttons 1W / 2W / 1M / 2M, and a stats line (B/S counts + "signal→EOD favorable %"). Backed by a new `getMinuteTrend` callable (5-minute bars). **Honest limit:** minute-level history only reaches ~60 days in the data feed, so this is a recent-pattern view — true months/years would require capturing minute N daily going forward (offered as a follow-up).

---

## [2.0.62] — 2026-10-05

### Added
- **Minute Compare chart (Options Dashboard)** — a focused intraday tool: the previous session's **close** shown as a dot + dashed baseline, vs the latest session **minute-by-minute** (vertical sticks, green above / red below the prior close). Enter a **minute number** (e.g. 15 = 9:45 ET) and it compares that minute's price to the prior close and shows a **🔴 SELL MARKET** alert when price is above it or a **🟢 BUY MARKET** alert when below, with the exact prices and difference. Backed by a new `getIntradayCompare` callable (1-minute bars, regular hours indexed from the 9:30 ET open; Schwab real-time → Yahoo fallback; shows the last full session on weekends/holidays).

---

## [2.0.61] — 2026-10-05

### Fixed
- **Strikes not showing on the Options Dashboard** — the strike/bid ladder looked up the chain by an exact expiration-key match, but the returned chain key can differ slightly from the selected date, so it found nothing and rendered empty. Now it falls back to the chain's actual key (matching the main option-chain component), so all strikes with their call/put bids & asks render. Also defaulted the Dashboard symbol to **TLT** (optionable) so the chart *and* the strike chain both populate on first load; ZB=F and other futures remain one pick away in the dropdown.

---

## [2.0.60] — 2026-10-05

### Added
- **Categorized symbol dropdown on the Options Dashboard** — replaced the quick-pick chips with a grouped dropdown covering **all US Treasuries** (futures ZB/UB/ZN/ZF/ZT, ETFs TLT/IEF/SHY/GOVT/…, yields ^TYX/^TNX/^FVX/^IRX), **Grains & Agriculture** (Corn ZC, Soybeans ZS, Wheat, etc. + CORN/SOYB/WEAT/DBA ETFs), **Indexes** (^GSPC/^NDX/^DJI/^RUT/^VIX, ES/NQ/YM/RTY futures, SPY/QQQ/DIA/IWM ETFs), and a set of **optionable Stocks** (so you can analyze an option against a stock). The free-text box remains for anything not listed. New `src/data/optionsSymbols.js` catalog.

---

## [2.0.59] — 2026-10-05

### Added
- **Options Manager → Dashboard tab (first built-out Options view)** — pick a symbol (including US Treasuries: **ZB=F** 30-yr futures, **TLT** ETF, **^TYX** 30-yr yield, quick-picks included), see its **price trend chart** with **Day / Week / Month** views (is it going up or down), and browse a **collapsible Strikes & Expirations** section: select a **year**, switch between all **expiration months** for that year, and a **strike-count limiter** (10 / 20 / 40 / All, centered at-the-money) to tune spacing. Charting works for futures/yield indices; listed option chains populate for optionable symbols (TLT etc.) with a one-click "Use TLT" fallback when a symbol (e.g. ZB futures) has no chain from this data source. `getPriceHistory` now accepts futures/index symbols (`ZB=F`, `^TYX`).

---

## [2.0.58] — 2026-10-05

### Added
- **Dual-product site switch — Covered Calls Manager ↔ Options Manager** — a toggle in the top header switches between two products under one account/login/Schwab connection (logo + title change with it; choice persisted). **Covered Calls Manager** is unchanged. **Options Manager** is a new scaffold that mirrors the same tab bar: the analysis tabs (Selection, Dashboard, Working, Risk, Trades, History) are **blank "coming soon" placeholders** to be filled in, while the global tabs — **APIs (Schwab), Profile, Setup, Glossary** — are **reused live**, so the Schwab connection and account settings work identically in both. New `src/components/OptionsManager.jsx`. Design documented in **docs/OPTIONS_MANAGER.md** + a new §0 in **docs/PRD.md**.

---

## [2.0.57] — 2026-10-04

### Fixed
- **Range view showed no data for just-opened trades** — once the entry date was set to a day or two ago, Range windowed the stock history down to ~0–1 daily bars (nothing to draw), so the chart looked empty. Range now always keeps at least ~2 weeks of stock history so the line is visible, with the entry marker and the projection to expiration still shown.

---

## [2.0.56] — 2026-10-04

### Added
- **Pull entry dates from Schwab** — the app now reads the **SELL_TO_OPEN fill date** (when you sold each call) from your Schwab order history. New Schwab imports auto-stamp the entry date, and there's a **"⬇ Sync entry dates from Schwab"** button on the Working tab that stamps the entry date onto your existing positions by matching each one to its opening fill. (Schwab's orders API only returns ~60 days, so calls opened longer ago still need manual entry.) New `parseSchwabOpenDates` parser; `savePosition` now accepts an `openedAtMs`.

---

## [2.0.55] — 2026-10-04

### Fixed
- **Set the entry date right on the chart** — when a working covered call has no entry date, the chart now shows an inline date picker ("Set the date you sold this call") so you can set it without hunting for a field below. The moment you pick the date (e.g. Oct 2), the grey "entry" line appears and the Range view spans entry → expiration. (The chart's "No entry date set" is why the grey line and the Oct-2 anchor were missing — the date simply hadn't been saved.)

---

## [2.0.54] — 2026-10-04

### Fixed
- **Entry date now saves on pick + recent-entry visibility** — the "Entry date (call sold)" field now commits the moment you choose a date (was only saving on blur, which date pickers don't always fire). Added clear prompts: when no entry date is set the position shows a notice to add it, and when the entry is within the last two weeks the chart points you to the **Range** view — on 1m–6m ranges a just-opened trade sits right on top of the "today" line, so its marker looks missing. In Range view the entry anchors the left edge and is clearly visible.

---

## [2.0.53] — 2026-10-04

### Fixed / Added
- **Editable entry date (fixes missing entry marker)** — the chart's entry line is now the date the **covered call was sold/opened**, not the share-lot purchase date (you may have held the shares for years). Added an **"Entry date (call sold)"** field in the expanded position so you can set it — e.g. set META to Friday and the grey "entry" line appears on the chart. New in-app positions stamp this automatically; older/imported ones can be set here. Removed the incorrect fall-back to the tax-lot bought date.
- **Trade lifecycle groundwork** — closing a position now records the **entry date, exit date, and exit stock/price** on the closed-trade record, so a start-to-finish view of each completed trade (entry → where you got out) can be charted next.

---

## [2.0.52] — 2026-10-04

### Added
- **"Range" view + buy-back-cost theta arch** on the working-position chart. The new **Range** button spans the entire trade end-to-end (bought → expiration). In this view a violet **buy-back-cost curve** is overlaid on a secondary right axis showing how expensive it is to close the call over time — the real premium along the stock's path from entry to today, then the theta-decay projection (stock held flat) from today to expiration — with a dashed **GTC target** line so you can see roughly when/where the buy-back gets cheap enough to fill.

---

## [2.0.51] — 2026-10-04

### Added
- **Short-term chart ranges (1d–3w) + purchase/expiration span** on the working-position chart. Range buttons now run **1d, 2d, 3d, 4d, 1w, 2w, 3w, 1m, 2m, 3m, 4m, 5m, 6m** — sub-week ranges pull 30-minute intraday bars, longer ones use daily. Added **light-grey vertical lines for the purchase date ("bought …") and the expiration date ("exp …")** so you can see the covered call's full time span at a glance (today sits between them in accent). Purchase date comes from the position's open date, falling back to the covering tax lot's bought date for older positions. On daily ranges the axis extends to expiration so the whole span shows; intraday ranges stay zoomed to recent price.

---

## [2.0.50] — 2026-10-04

### Added
- **Chart range selector (1m–6m) + buy-back level line** on the working-position chart. New **1m/2m/3m/4m/5m/6m** buttons change the viewing window instantly (from the 6 months already loaded). Added a green **"Buy-back" line** showing the stock price at which the call decays to your GTC price (e.g. $0.10 or $2.00) — solved from Black-Scholes at today's time-to-expiry — so you can see how far the stock must drop for the GTC buy-back to fill now. Also called out in the readout: "buy-back fills if stock ≤ $X."

---

## [2.0.49] — 2026-10-04

### Added
- **Per-position price chart on Working positions** — expanding a working covered call now shows a line chart (right under the green "GTC buy back" banner) plotting the stock's last 6 months with covered-call overlays: **Strike** (red dashed, with the "called-away" zone shaded), **Breakeven** (amber), **Entry** stock price (grey) and **entry date** marker (for positions opened from now on), the **current price** dot + **today** line, the **expiration/exit** marker, and a shaded **possible-exit window** (now → expiry). Hover for price + date. The option-side numbers (entry call, current call, GTC exit, what you keep) show as a readout below, since they're on a different scale than the stock price. Data is Schwab real-time when connected, else Yahoo.

---

## [2.0.48] — 2026-10-04

### Changed
- **"Copy Order" button** — renamed the Saved Quotes copy button to **"📋 Copy Order"** (from "Send to Schwab / ToS"). It captures the quote's order string to your clipboard so you can paste it straight into the thinkorswim app's order entry, review, and send it yourself.

---

## [2.0.47] — 2026-10-04

### Changed
- **Saved Quotes "Send to Schwab / ToS" clarity** — renamed the copy button to **"📋 Send to Schwab / ToS"** with a help line explaining the stage-don't-send workflow: paste the order string into thinkorswim (Schwab's platform) and it stages the order ticket for you to review and send yourself. Noted that Schwab's API has no stage/save-order endpoint, so the app never sends a trade — placement is always a manual step you control.

---

## [2.0.46] — 2026-10-04

### Added
- **Premium shown on the Best Returns buttons** — each of the three strategy buttons (Best Return / No-Sale / Sale) now ends its detail line with the total premium in grey, e.g. "· $6,800 PR" (premium per share × 100 × your contracts). Quick read of the actual dollar income for each pick.

---

## [2.0.45] — 2026-10-04

### Fixed
- **Couldn't see where a saved quote landed** — after "📝 Save Quote" the only feedback was a green message that auto-cleared, while the Saved Quotes card sat off-screen at the bottom of the page. Now saving **auto-scrolls to the Saved Quotes card** so your new quote jumps into view, and the confirmation text points "below" instead of to another tab. (The quote was always saved — it was purely a visibility issue.)

---

## [2.0.44] — 2026-10-03

### Changed
- **Saved Quotes shown where you save them** — the Saved Quotes card now also renders at the bottom of the **Selection** tab (right under the "📝 Save Quote" button), so a quote appears immediately where you click instead of only on the Dashboard. The Dashboard card also moved to the **top** of the Dashboard tab so it's not buried under the Position Finder. (Same live data in both places.)

---

## [2.0.43] — 2026-10-03

### Added
- **Saved Quotes (new Dashboard card) + thinkorswim export** — staged covered-call listings now live in their own **Saved Quotes** collection (paper, never sent to a broker), shown as a card on the Dashboard. The Selection tab's button is now **"📝 Save Quote"** (writes to Saved Quotes instead of straight to Working). Each saved quote shows the contract, premium, GTC, and IV, plus a ready-to-paste **thinkorswim order string** with a **"📋 Copy TOS order"** button so you can place it for real in TOS. Also **"→ Move to Working"** (promote once filled) and **"✕ Remove."** New `savedQuotes` Firestore rules (owner read/write own).

### Changed
- **"Queue Covered Call" → "Save Quote"** — the Selection-tab action now stages the covered call in Saved Quotes (reviewable on the Dashboard, exportable to TOS) rather than writing directly into Working positions. Promote to Working from the Saved Quotes card when the trade is actually filled.

---

## [2.0.42] — 2026-10-03

### Added
- **"Queue Covered Call" button (paper trade)** — on the Selection tab you can now add the currently configured covered call (symbol, strike, expiration, premium/bid, contracts) straight into your **Working positions** with one click — like staging an order in thinkorswim, but **nothing is sent to Schwab**. It records the fill at the live price + selected bid, sets a sensible GTC buy-to-close (~30% of premium), and shows an inline confirmation. Validates that a strike, expiration, and premium are selected first.

---

## [2.0.41] — 2026-10-03

### Added
- **"Get data ↗" — test any ticker on demand** — type a symbol in the History tab's add box and click "Get data" to immediately pull ~2 years of daily OHLC for it and open the View-data popup (Day/Week/Month), **without adding it to daily tracking**. Lets you backtest enter/exit trends on any stock you're considering. (`backfillHistory` gained a `track:false` option so ad-hoc tests don't clutter the tracked registry.)

---

## [2.0.40] — 2026-10-03

### Added
- **Daily OHLC capture + backfill for enter/exit analysis** — the history collector now stores **open / high / low / close** each day (beginning-of-day and end-of-day prices) instead of just a single close. New **"Backfill 2yr"** button (owner/admin) loads ~2 years of real daily OHLC from Yahoo so you can analyze trends immediately rather than waiting for forward collection (merges by date, keeps any already-collected IV/options data).
- **Day / Week / Month views in "View data"** — the per-symbol data popup now has a granularity toggle that rolls daily OHLC up into weekly/monthly candles (first open, max high, min low, last close) with a close-to-close **Chg%** column (green/red). Daily view also shows IV30 and the ATM call bid. Built for eyeballing enter/exit prices and period trends.

---

## [2.0.39] — 2026-10-03

### Added
- **Price trend chart (above Contract Cost)** — an interactive price chart for the selected stock with **hover crosshair + tooltip** (value + date), a full **range selector** (1D, 1W, 1M, 3M, 6M, 1Y, 2Y, 5Y, All), and three **covered-call views** you can switch between: **Price** (close line), **Strike view** (overlays your selected strike as a dashed line with the "called-away" zone shaded red, plus a breakeven line), and **% Change** (normalized return across the range, green/red). Header shows live price and the period change.
- **Hybrid price data (Schwab → Yahoo)** — a new `getPriceHistory` callable pulls the chart from **Schwab's real-time price history using your own connection** when you're linked (the same data you see in your Schwab app), and falls back to **Yahoo** (15-min delayed) otherwise. The chart labels which source it's showing.

---

## [2.0.38] — 2026-10-03

### Fixed
- **Current Price/Strike column now scales with the grid** — it was a fixed-width flex item outside the stat grid, so it didn't resize like the other columns. Folded it into the Contract Cost grid as a proper equal-width (`1fr`) column (Current Price stacked over Strike), so all three columns scale and align together.

---

## [2.0.37] — 2026-10-03

### Added
- **Current Price + Strike column in Contract Cost** — a new left-hand column shows the live **Current Price** stacked above the selected **Strike** (shows "—" until a strike is picked), so the key reference prices sit right alongside the premium/ROI breakdown.

---

## [2.0.36] — 2026-10-03

### Fixed
- **Page jumped to the Option Chain when applying a Best Returns pick** — selecting a Best Returns button (or any strike) updated the chain's highlighted row, which called `scrollIntoView` and scrolled the whole page down to the chain. The chain now centers the highlighted/ATM row **within its own scroll box only**, so your scroll position stays put when you apply a recommendation.

---

## [2.0.35] — 2026-10-03

### Fixed
- **"Best Return" recommended absurd deep-ITM strikes** — the `getBestReturns` "Best Return" strategy had no floor on strike selection, so it maximized raw bid and dove to the deepest in-the-money strike (e.g. a $100 call on ~$728 META showing "$624.75/sh · 1204% annualized · -86.3% OTM"). That "premium" was almost entirely intrinsic value — the shares would just be called away at $100 for a net loss, and such strikes are barely tradeable. Now "Best Return" only considers strikes **at or above the current price** (0–25% OTM, where the bid is genuine time-value income) and requires a **liquid bid + sane spread**, bringing it in line with real covered-call practice. The "No-Sale" and "Sale" strategies were already OTM-bounded and unaffected.

---

## [2.0.34] — 2026-10-03

### Changed
- **Per-symbol row menu (⋮) on the History tab** — replaced the inline "remove" link with a vertical three-dots menu. It opens a dropdown with **📊 View data** — a popup showing that symbol's full collected history (date, price, IV30, ATM call strike/bid/ask, expiry, data source) newest-first — and **🗑 Remove**. The menu is anchored to the clicked row and closes on outside click; the data popup closes on backdrop click or ✕.

---

## [2.0.33] — 2026-10-03

### Fixed
- **Seeded symbols vanished after a few seconds ("opens then closes")** — root cause: new user docs are created with no `role`, so the operator account was a *viewer*. Seeding wrote 174 symbols to the local Firestore cache (list filled in instantly), then the server rejected the write per security rules and rolled it back (list snapped to 0). Added a secure one-time **owner bootstrap**: a `claimOwnership` callable that promotes ONLY the known operator email (`dtaylor34@gmail.com`) and ONLY if no owner exists yet, plus a **"Claim owner access"** button in the History status strip shown when the current account lacks owner/admin. Once claimed, seeding/add/collect persist normally.

---

## [2.0.32] — 2026-10-03

### Fixed / Added
- **Search filter made obvious (tracked symbols)** — leftover text in the "Search tracked symbols" box was filtering the list down (e.g. "meta" → "1 of 174 shown"), which looked like the list had disappeared. Added an **✕ clear** button inside the search field and a **"show all"** link next to the count whenever a filter is active, so it's always clear the full list is one click away. (Seeding already auto-clears the search as of v2.0.31.)

---

## [2.0.31] — 2026-10-03

### Added
- **History tab status strip** — a line at the top of the Historical Data tab now shows the live **tracked count**, your **access level** (owner/admin/viewer), and whether you can add/seed. View-only users get a clear "an owner/admin must seed (your writes are blocked)" note instead of a silent rules rejection — makes it obvious whether an empty list is a permissions issue vs a data issue.

---

## [2.0.30] — 2026-10-03

### Fixed
- **Console error storm / UI thrash from the Exit Range payoff chart** — before a strike was selected, `strikePrice` was `null`, so the chart received strikes `[0, null, 0]`, collapsing its x/y domain to zero width. Every `px()/py()` then divided by zero and streamed hundreds of `<line>/<circle>/<text> attribute … Expected length "NaN"/"Infinity"` errors into the console on each render (SelectionTab is mounted on every tab, so it ran everywhere — including while on the History tab, where the churn made the symbol list flicker/collapse). Now the chart sanitizes its strikes (drops non-finite/≤0 values, falls back to a spread around the current price), guarantees a non-degenerate domain, and clamps `px()/py()` to finite output so no `NaN`/`Infinity` can ever reach the SVG. SelectionTab also passes a sane strike spread when no strike is chosen yet.

---

## [2.0.29] — 2026-10-03

### Fixed / Changed
- **Tracked-symbols list is now a collapsible card with a top-right open/close toggle** — the registry on the History tab has a clear "Tracked symbols (N tracked)" header and a −/+ toggle on the right to expand/collapse it on demand. It now stays open as you work, **auto-opens after you seed** (universe, holdings, or a single add) and clears any active search so you immediately see the full seeded list, and the long list scrolls inside a fixed-height box with a sticky header instead of pushing the page.

---

## [2.0.28] — 2026-10-03

### Added
- **Covered-call universe + one-click seeding (History tab)** — a curated ~180-name universe (broad-market index ETFs + Technology & Healthcare sector ETFs + the most liquid optionable Tech/Health single names) now lives in `src/data/coveredCallUniverse.js`. Two new buttons: **Seed covered-call universe** (batch-adds the whole list to the daily tracked registry) and **Add my holdings** (adds every ticker you currently hold, including Schwab-imported positions). Collection starts the day each symbol is added.
- **Dashboard dropdown cleanup + real names** — the symbol search dropdown is now built from the same curated universe with real company names and correct **Index / Stock / ETF** categories (new "Index" filter chip). Removed the ~450 placeholder "Mock Stock / Mock ETF" rows that were polluting search.

### Changed
- **Hybrid history data source (Schwab + Yahoo)** — the daily collector now snapshots from **Schwab real-time market data** when an owner/admin has a live Schwab connection (resolved once per run, reused across symbols), and automatically **falls back to Yahoo** otherwise. This gives real bids/IV (Yahoo is 15-min delayed and zeros out bids after hours) while never breaking if the Schwab token lapses (Schwab refresh tokens expire ~weekly and need a re-login). Schwab's credential/token machinery is reused as-is (one implementation of the decrypt+refresh logic); `collectDailyHistory`/`collectHistoryNow` now bind the `SCHWAB_ENC_KEY` secret. Each stored sample records its `src` ("schwab"/"yahoo").

---

## [2.0.27] — 2026-10-03

### Added
- **Best Returns (3 one-click strategies)** — a new section under Contract Cost scores the live option chain for three covered-call goals and applies any pick with one click (strike + expiry + premium flow straight into Contract Cost above): **Best Return** (highest annualized premium, 21–60 DTE), **Best No-Sale Return** (7–15% OTM — income while keeping your shares), and **Best Sale Return** (0–4% OTM — premium plus stock gain to the strike if assigned). Each shows a plain-English recommendation note with a suggested buy-to-close GTC. Backed by the new `getBestReturns` callable (auth-required) scoring annualized return, OTM sweet-spot, liquidity, and spread.
- **Key Events (market notes)** — a collapsible, color-coded panel below Best Returns flagging what happens between now and the selected expiration: weekly-vs-monthly expiration, expiration-week time-decay/assignment risk, and any FOMC decision before expiry. Earnings date, ex-dividend date, and 52-week IV percentile are listed as "pending data" (not silently dropped) until those feeds are wired.
- **Historical Data search** — the History tab now has a search box over the tracked-symbol registry with a live "X of Y tracked" count, so you can quickly check whether a ticker is already being collected.

---

## [2.0.26] — 2026-10-03

### Added
- **Historical Data (new "History" tab)** — a registry of symbols we collect daily covered-call history for: shows each symbol's start date, data-point count, and last-collected time; add new tickers (collection starts that day forward) and remove them (owner/admin). A daily scheduled function snapshots each symbol's underlying price + ATM ~30-DTE call IV (IV30) + that call's strike/bid/ask into a rolling 2-year series (`history/{symbol}`), feeding future IV-percentile and premium-trend analysis. "Collect now" button (owner/admin) seeds the first point. US-Treasury options intentionally excluded (separate future section).

---

## [2.0.25] — 2026-10-02

### Fixed
- **Inputs only accepted one character (symbol search, Exit Early, etc.)** — the Card/Stat/Badge/InfoTip wrapper components were defined inside the Selection/Dashboard tab's render, so every keystroke remounted their subtrees and dropped focus. Stabilized them with useCallback so inputs keep focus and you can type freely across the whole tab.

---

## [2.0.24] — 2026-10-02

### Fixed
- **Exit Early input only accepted one character** — the field was losing focus on every keystroke (re-rendering the whole tab). Extracted it to a self-contained component with its own state: you can now type freely (e.g. 0.10 or 2.00), the "keeps $X" updates live as you type, and Enter commits/blurs.

---

## [2.0.23] — 2026-10-02

### Changed
- **Call/Put-aware bid label** — the Contract Cost label now reads **"Call Bid"** or **"Put Bid"** depending on which side you pick in the chain. Put Bids are now clickable too (red), and the selected side's Bid highlights.

---

## [2.0.22] — 2026-10-02

### Changed
- **Contract Cost section** — renamed "Per Share" → **"Call Bid"**, and added a third column: **Month** (selected expiration + days to expiry) and **Exit Early** — a buy-to-close price field (enter e.g. 0.10 or 2.00) showing what you keep if you buy the call back at that price.

---

## [2.0.21] — 2026-10-02

### Changed
- **Option chain moved under Contract Cost + wired two-way**
  - Click a call's **Bid** in the chain → sets that strike + expiration and uses the **live bid as the premium**, so Contract Cost / Per Share / Total / ROI / breakeven / max profit all update to the real available premium (overrides the Black-Scholes estimate while that strike+expiry stay selected).
  - Selecting the **Best Return Hint** (or a strike) now **highlights the matching Bid** in the chain (row + bid cell) and scrolls to it.

---

## [2.0.20] — 2026-10-02

### Added
- **Option chain on the Dashboard** — thinkorswim-style chain under Position Setup: pick an expiration (month) and see the strike ladder with Calls | Strike | Puts (Last/Bid/Ask), ATM row highlighted + auto-scrolled to, ITM cells tinted. Driven by the shared symbol; click a call's price to use that strike. (Yahoo data, 15-min delayed.)

---

## [2.0.19] — 2026-10-02

### Changed
- **Buy-back now visible on the row** — each covered call shows a third "working order" line under the two legs: `BUY +N … CALL  <gtc> LMT  GTC  buy-back · keeps $X`. No need to expand to see your GTC buy-to-close.

---

## [2.0.18] — 2026-10-02

### Added
- **Auto-import GTC buy-to-close orders** — "Import from Schwab" now also reads your working GTC buy-to-close orders and fills each position's GTC price automatically (so e.g. META comes in at $2.00, not the 0.10 default), shown on the import preview. New `schwabGetOrders` function + `parseSchwabOrders`. Note: Schwab limits the orders window to ~60 days, so very old GTC orders may need to be set by hand.

---

## [2.0.17] — 2026-10-02

### Fixed
- **Blank screen after a deploy** — replaced the cache-first service worker (which could serve a stale JS bundle, showing nothing on next load) with a non-caching SW that purges all old caches and no longer intercepts requests. The app now always loads fresh; Firebase Hosting handles asset caching. If you were stuck on a blank page, one reload (or clear site data) picks up the fix.

---

## [2.0.16] — 2026-10-02

### Added
- **Import from Schwab** — once your Schwab account is connected, the Working tab shows an "Import from Schwab" button that pulls your open covered calls (short call matched to the underlying shares) with cost basis + live prices, so you add them in one click instead of pasting. Schwab reports average cost, so imported shares land as one lot at the average price (split into real tax lots afterward if needed). Includes a raw-positions view for calibration.

---

## [2.0.15] — 2026-09-24

### Added
- **"Read paste" understands the thinkorswim Position Statement grid** — paste your stock + call rows from Monitor → Position Statement and it captures everything, including your **cost basis** (Trade Price) for long-held shares and live prices (Mark) — the best one-paste source. Also more forgiving number entry (\$, commas, spaces) and clearer save errors.

---

## [2.0.14] — 2026-09-24

### Changed
- **Working tab — "Read paste" now understands plain-English notes** — in addition to thinkorswim order lines and the CSV quick-note, the parser reads free-form notes like `100 shares of PFE, sold 1 call at $0.55, hits $28 by Oct 16, breakeven $27.25` (derives symbol, contracts, call price, strike, expiration, and share price from breakeven). Fixes the case where a natural note filled nothing and the form said "Still need: …".

---

## [2.0.13] — 2026-09-24

### Changed
- **Working tab — Schwab-style covered-call rows** — each position now renders as a Schwab/thinkorswim **COVERED** order row with two legs (SELL −N call / BUY +N×100 stock) and Schwab's columns (Side, Qty, Pos Effect, Symbol, Exp `16 OCT 26`, Strike, Strike Type, net Price LMT, Order, TIF, Exch), matching `examples/Example CS Liste Item.png`. Health stoplight + if-closed retained; row expands to full detail. Horizontally scrolls on narrow screens.

---

## [2.0.12] — 2026-09-24

### Changed
- **Working tab — easier covered-call entry** — rebuilt the Add/Update form to match the prototype: two columns (paste box with the exact TOS/quick-note formats shown, and a fields grid), a real **date picker** for expiration, optional IV / current-price fields, a **lot picker as pills**, and a dynamic **Add/Update** button. Responsive — stacks cleanly on mobile/tablet. Field labels aligned to the prototype ("Share price paid", "Call sold at", "GTC buy back", "Shares for this call").

---

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
