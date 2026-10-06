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
