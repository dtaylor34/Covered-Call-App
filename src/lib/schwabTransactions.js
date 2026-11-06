// ─── src/lib/schwabTransactions.js ───────────────────────────────────────────
// Realized option P&L from Schwab Trader API *transactions* (not orders), to tie
// out to Schwab's Gain/Loss report. Each TRADE transaction's `netAmount` is
// already net of commissions + fees.
//
// Realized = CLOSED positions only. A contract is counted when it is actually
// closed — bought/sold back (a CLOSING trade that covers the opened quantity) OR
// past its expiration (expired worthless / assigned). Anything still open (a
// sell-to-open with no close, expiry still in the future) is EXCLUDED, so the
// history never reflects working positions.

import { parseOccSymbol } from "./schwabPositions";

const asArray = (data) => (Array.isArray(data) ? data : (data?.transactions || (data ? [data] : [])));
const legsOf = (t) => t.transferItems || t.transactionItems || t.items || [];
const optionLeg = (t) => legsOf(t).find((it) => String(it?.instrument?.assetType || "").toUpperCase() === "OPTION");
const feesOf = (t) => legsOf(t).reduce((f, it) => f + (String(it?.feeType || "") ? Math.abs(Number(it.cost ?? it.amount) || 0) : 0), 0);

/**
 * @param {Array} payloads  one Schwab transactions payload per account (or merged)
 * @param {number} now      clock (ms) for the expiration check (injectable for tests)
 * @returns {{ realized, fees, closedCount, openCount, symbols }}
 *   realized = Σ netAmount over CLOSED option contracts (net of fees → matches CS)
 */
export function realizedFromTransactions(payloads, now = Date.now()) {
  const txns = [].concat(...(payloads || []).map(asArray));
  const bySym = {}; // occSymbol -> { net, openQty, closeQty, fees, count }
  for (const t of txns) {
    if (String(t.type || "").toUpperCase() !== "TRADE") continue;
    const leg = optionLeg(t);
    const sym = String(leg?.instrument?.symbol || "").trim();
    if (!sym) continue;
    const g = (bySym[sym] = bySym[sym] || { net: 0, openQty: 0, closeQty: 0, fees: 0, count: 0 });
    g.net += Number(t.netAmount) || 0;
    g.fees += feesOf(t);
    g.count++;
    const qty = Math.abs(Number(leg.amount ?? leg.quantity) || 0);
    const effect = String(leg.positionEffect || "").toUpperCase();
    if (effect.includes("CLOS")) g.closeQty += qty;
    else if (effect.includes("OPEN")) g.openQty += qty;
  }

  let realized = 0, fees = 0, closedCount = 0, openCount = 0;
  for (const sym of Object.keys(bySym)) {
    const g = bySym[sym];
    const occ = parseOccSymbol(sym);
    const expMs = occ?.expiry ? Date.parse(`${occ.expiry}T23:59:59Z`) : NaN;
    const closedByTrade = g.openQty > 0 && g.closeQty >= g.openQty;  // bought/sold back
    const expired = Number.isFinite(expMs) && expMs < now;           // expired worthless / assigned
    if (closedByTrade || expired) { realized += g.net; fees += g.fees; closedCount++; }
    else openCount++;                                                 // still open → not realized
  }
  return { realized, fees, closedCount, openCount, symbols: Object.keys(bySym).length };
}
