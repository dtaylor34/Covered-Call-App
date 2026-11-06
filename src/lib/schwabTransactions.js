// ─── src/lib/schwabTransactions.js ───────────────────────────────────────────
// Realized option P&L from Schwab Trader API *transactions* (not orders), to tie
// out to Schwab's Gain/Loss report. Each TRADE transaction's `netAmount` is
// already net of commissions + fees, so nothing fee-related is estimated here.
//
// Realized = CLOSED positions only. A contract is counted when it is actually
// closed — bought/sold back (a CLOSING trade that covers the opened quantity) OR
// past its expiration (expired worthless / assigned). Anything still open (a
// sell-to-open with no close, expiry still in the future) is EXCLUDED, so the
// history never reflects working positions. Returns a per-contract breakdown so
// the total can be reconciled line-by-line against Schwab's report.

import { parseOccSymbol } from "./schwabPositions";

const asArray = (data) => (Array.isArray(data) ? data : (data?.transactions || (data ? [data] : [])));
const legsOf = (t) => t.transferItems || t.transactionItems || t.items || [];
const optionLeg = (t) => legsOf(t).find((it) => String(it?.instrument?.assetType || "").toUpperCase() === "OPTION");
const feesOf = (t) => legsOf(t).reduce((f, it) => f + (String(it?.feeType || "") ? Math.abs(Number(it.cost ?? it.amount) || 0) : 0), 0);
const txMs = (t) => { const v = Date.parse(t.time || t.tradeDate || t.settlementDate || ""); return Number.isFinite(v) ? v : 0; };

/**
 * @param {Array} payloads  one Schwab transactions payload per account (or merged)
 * @param {number} now      clock (ms) for the expiration check (injectable for tests)
 * @param {object} window   optional { startMs, endMs } — count only contracts whose
 *                          close (last trade / expiry) falls inside, matching a CS report period
 * @returns {{ realized, fees, closedCount, openCount, closed: [], open: [] }}
 */
export function realizedFromTransactions(payloads, now = Date.now(), window = null) {
  const txns = [].concat(...(payloads || []).map(asArray));
  const bySym = {}; // occSymbol -> { net, openQty, closeQty, fees, count, lastMs, desc }
  for (const t of txns) {
    if (String(t.type || "").toUpperCase() !== "TRADE") continue;
    const leg = optionLeg(t);
    const sym = String(leg?.instrument?.symbol || "").trim();
    if (!sym) continue;
    const g = (bySym[sym] = bySym[sym] || { net: 0, openQty: 0, closeQty: 0, fees: 0, count: 0, lastMs: 0, desc: leg.instrument?.description || sym });
    g.net += Number(t.netAmount) || 0;
    g.fees += feesOf(t);
    g.count++;
    g.lastMs = Math.max(g.lastMs, txMs(t));
    const qty = Math.abs(Number(leg.amount ?? leg.quantity) || 0);
    const effect = String(leg.positionEffect || "").toUpperCase();
    if (effect.includes("CLOS")) g.closeQty += qty;
    else if (effect.includes("OPEN")) g.openQty += qty;
  }

  const inWindow = (ms) => !window || ((!window.startMs || ms >= window.startMs) && (!window.endMs || ms <= window.endMs));
  let realized = 0, fees = 0;
  const closed = [], open = [];
  for (const sym of Object.keys(bySym)) {
    const g = bySym[sym];
    const occ = parseOccSymbol(sym);
    const expMs = occ?.expiry ? Date.parse(`${occ.expiry}T23:59:59Z`) : NaN;
    const closedByTrade = g.openQty > 0 && g.closeQty >= g.openQty; // bought/sold back
    const expired = Number.isFinite(expMs) && expMs < now;          // expired worthless / assigned
    const closeMs = closedByTrade ? g.lastMs : (Number.isFinite(expMs) ? expMs : g.lastMs);
    if ((closedByTrade || expired) && inWindow(closeMs)) {
      realized += g.net; fees += g.fees;
      closed.push({ symbol: sym, desc: g.desc, realized: g.net, fees: g.fees, via: closedByTrade ? "closed" : "expired", whenMs: closeMs });
    } else {
      open.push({ symbol: sym, desc: g.desc, net: g.net });
    }
  }
  closed.sort((a, b) => (b.whenMs || 0) - (a.whenMs || 0));
  return { realized, fees, closedCount: closed.length, openCount: open.length, closed, open };
}
