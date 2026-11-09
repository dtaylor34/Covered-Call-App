# RivetTrade — Project Status

> **Resume point.** Point me here ("read docs/PROJECT_STATUS.md and continue") to pick up.
> This is the living status doc — update it as items close or new ones appear.
> Source of truth is always the git log + the code; if this doc disagrees with the repo, trust the repo.

_Last updated: 2026-11-09 · Live: **v2.6.9** · Branch: `api-integration` (pushed to origin; tags through v2.6.9)_
_Live app: https://covered-calls-prod.web.app · Brand: **RivetTrade** · Firebase project: `covered-calls-prod`_

---

## 🟢 Current state
- **App is live and healthy** at v2.6.9. Everything builds (`npm run build`), tests pass (`npm test` → 73 tests), Schwab is connected.
- **Rebrand to RivetTrade** shipped (title, header, manifest, auth screen, tagline, "Craftsman Approach" positioning). The URL is unchanged (still covered-calls-prod.web.app) — see open item on the domain.
- **Options Working tab** fully revamped: intent-based grouping (combine/ungroup), per-position free-roll "Sell N now" scale-out, sell-to-gain ladder + chart target lines, Call/Put/Total value strip, after-hours "as of close" badge, **Fees column** (round-trip, itemized tooltip), live stock + call prices, portal tooltips, bulk delete, Material chevrons, Roboto font.
- **Covered Calls**: share-allocation pairing fix (each short call gets its own 100-share lot); Best Return Hint / Auto-Optimize no longer recommend ITM strikes; per-row live stock price + call mark.
- **Realized P&L reconcile** (Trade History): pulls Schwab **transactions** (`schwabGetTransactions`, 1-yr, net of real fees), closed-positions-only, option vs. called-away-stock broken out, **per-account picker**, **persists + auto-refreshes**, Monthly P&L reflects it. Current realized for the covered-call account = **$4,761.91** (option premium).

---

## ⏳ Immediate next action (awaiting user)
- **Options live marks — is it Schwab or Yahoo?** Just shipped v2.6.9 (⟲ Update prices button, source+timestamp badge, strike window 50→250). **User to click "Update prices" on Options → Working and report the badge:**
  - `● Schwab live · <time>` → fixed (the strike-window fix did it).
  - `Yahoo · 15-min delayed · <time>` → the `schwabGetOptionChain` call itself is failing server-side → investigate throttling / Schwab options market-data entitlement.
  - `Schwab live` but values still frozen → likely a Schwab **options market-data entitlement** (delayed quotes), which is a Schwab-side setting, not a code fix.

---

## 📋 Open items / backlog

### Realized P&L — exact CS match (optional, bigger build)
- Reconcile shows **option-premium realized ($4,761.91)**; Schwab's *combined* Gain/Loss report is **$4,748.17**. The ~$13.74 difference is the **PFE assignment stock leg** — Schwab folds the assigned call's premium into the stock cost basis; we keep it as clean option income + show called-away stock separately. To match CS's combined figure to the penny would need **full equity tax-lot reconciliation** (cost basis, partial lots, assignment premium rollup). Scoped but not built.
- Possible cleanup: make the transaction reconcile **populate the actual Trade History rows** too, so there's one source of truth (today the rows are order-based/~60-day/gross; the realized is transaction-based/1-yr/net — they can drift).

### Options Fees column
- Commission constant assumes **$0.65/contract**, but this account's actual Schwab option commission is **$0** (only pennies of SEC/reg fees). Consider setting commission to $0 or making it configurable so the Fees column matches the account.

### Market data provider (getBestReturns)
- `getBestReturns` was returning empty because **Yahoo throttles the Cloud Function's datacenter IP**. Mitigated with a cache/stale fallback (v2.6.1). Durable fix: add a **Tradier or Polygon API key** and switch `ACTIVE_PROVIDER` (the provider abstraction already exists in `functions/providers/`).

### Branding follow-ups
- **RivetTrade domain** (not started): if moving to e.g. `rivettrade.com`, it's config, not code (the Schwab redirect uses `window.location.origin`): (1) Firebase Hosting custom domain on the SAME project, (2) **register the new callback URL in the Schwab developer portal** (`https://<domain>/api/schwab/callback` — user must do this), (3) add the domain to Firebase Auth authorized domains. Reconnect Schwab once from the new URL.
- **App icons / favicon** still the old graphics — need RivetTrade icon assets.

### Smaller / nice-to-have
- **Theoretical after-hours option value** ("C"): reprice open options off the live underlying + last IV so after-hours P&L reflects the move (clearly badged "theoretical").
- **Covered-call call-leg live price**: added live mark on the GTC leg; could also show it on the SELL-call leg (points + dollars).
- **Consolidate the two Schwab buttons**: "Import closed trades" (writes rows, ~60-day orders) vs "Refresh from Schwab" (recomputes realized, 1-yr transactions) — could unify once the reconcile populates rows.

### Known debt
- `firebase-admin` on `^12` (bump to 14 is a deliberate 2-major jump).
- ~18 pre-existing transitive npm vulns in `functions/` (googleapis/stripe trees).
- **Google Sheet sync** functions deployed but need the **Google Sheets API enabled** in the GCP project before `connectSheet` works.

---

## 🚀 Deploy & workflow
- **Frontend:** `bash scripts/deploy.sh` — reads version from `docs/CHANGELOG.md` (bump it first), prompts to confirm, builds, deploys hosting, tags, logs to `deployments.log`. **Never raw `firebase deploy` for hosting.**
- **Functions:** `npx firebase-tools deploy --only functions:<name>` (e.g. `schwabGetTransactions`, `getBestReturns`). Note: functions module must cold-load under ~10s (heavy deps like `googleapis` are now lazy-loaded in `sheetsSync.js` — don't re-add top-level heavy requires).
- **Tests/build:** `npm test` (vitest) + `npm run build` before every deploy.
- **Push:** commit, then `git push origin api-integration` + `git push origin v<version>`.
- **Rollback:** `bash scripts/rollback.sh`.

## 🧭 Key architecture notes
- **Two live-mark paths:** `useLivePortfolio` (covered-call Working) and `useOptionLive` (Options Working) — both Schwab-first, Yahoo fallback, 60s refresh, marks held in memory (persisted to Firestore only on explicit Sync).
- **Two Schwab data sources in Trade History:** order-based `closed` records (via `parseSchwabClosedCycles`, ~60-day) drive the rows; transaction-based reconcile (`realizedFromTransactions` over `schwabGetTransactions`) drives the Realized P&L tile + Monthly.
- **Reconcile logic** (`src/lib/schwabTransactions.js`): closed = round-tripped (net qty 0) or expired/assigned (option past expiry); realized = Σ `netAmount` (already net of fees); option vs. stock split by leg assetType.
