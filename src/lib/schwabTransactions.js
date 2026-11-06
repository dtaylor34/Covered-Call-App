// ─── src/lib/schwabTransactions.js ───────────────────────────────────────────
// Realized P&L from Schwab Trader API *transactions* (not orders). Each
// transaction's `netAmount` is already net of commissions + fees, so nothing is
// estimated. Realized counts CLOSED positions only — never working positions:
//   • OPTION closed = bought/sold back to flat, or past expiration (expired/assigned)
//   • STOCK  closed = bought and fully sold back to flat (e.g. called away)
// A share lot you still hold (the stock backing your covered calls) is OPEN and
// excluded. Option-premium realized and stock realized are broken out separately
// (an assigned covered call's premium is option income; the called-away shares
// are a separate stock realization — Schwab's Gain/Loss report combines them).

import { parseOccSymbol } from "./schwabPositions";

const asArray = (data) => (Array.isArray(data) ? data : (data?.transactions || (data ? [data] : [])));
const legsOf = (t) => t.transferItems || t.transactionItems || t.items || [];
const TRADABLE = new Set(["OPTION", "EQUITY", "ETF", "COLLECTIVE_INVESTMENT"]);
const tradeLeg = (t) => legsOf(t).find((it) => TRADABLE.has(String(it?.instrument?.assetType || "").toUpperCase()));
const feesOf = (t) => legsOf(t).reduce((f, it) => f + (String(it?.feeType || "") ? Math.abs(Number(it.cost ?? it.amount) || 0) : 0), 0);
const txMs = (t) => { const v = Date.parse(t.time || t.tradeDate || t.settlementDate || ""); return Number.isFinite(v) ? v : 0; };

/**
 * @param {Array} payloads  one Schwab transactions payload per account (or merged)
 * @param {number} now      clock (ms) for the expiration check (injectable for tests)
 * @param {object} window   optional { startMs, endMs } to match a CS report period
 * @returns {{ optionRealized, stockRealized, realized, fees, closedCount, openCount, closed, open }}
 */
export function realizedFromTransactions(payloads, now = Date.now(), window = null) {
  const txns = [].concat(...(payloads || []).map(asArray));
  const bySym = {}; // symbol -> { net, qty, fees, count, lastMs, isOption, desc }
  for (const t of txns) {
    const leg = tradeLeg(t);
    const sym = String(leg?.instrument?.symbol || "").trim();
    if (!sym) continue;
    const isOption = String(leg.instrument.assetType).toUpperCase() === "OPTION";
    const g = (bySym[sym] = bySym[sym] || { net: 0, qty: 0, fees: 0, count: 0, lastMs: 0, isOption, desc: leg.instrument?.description || sym });
    g.net += Number(t.netAmount) || 0;
    g.qty += Number(leg.amount ?? leg.quantity) || 0; // signed: + bought, − sold
    g.fees += feesOf(t);
    g.count++;
    g.lastMs = Math.max(g.lastMs, txMs(t));
  }

  const inWindow = (ms) => !window || ((!window.startMs || ms >= window.startMs) && (!window.endMs || ms <= window.endMs));
  let optionRealized = 0, stockRealized = 0, fees = 0;
  const closed = [], open = [];
  for (const sym of Object.keys(bySym)) {
    const g = bySym[sym];
    const occ = g.isOption ? parseOccSymbol(sym) : null;
    const expMs = occ?.expiry ? Date.parse(`${occ.expiry}T23:59:59Z`) : NaN;
    const roundTripped = g.count >= 2 && Math.abs(g.qty) < 1e-6;       // flattened (bought back / sold back)
    const expired = g.isOption && Number.isFinite(expMs) && expMs < now; // expired worthless / assigned
    const isClosed = roundTripped || expired;
    const whenMs = expired && Number.isFinite(expMs) ? Math.max(g.lastMs, expMs) : g.lastMs;
    if (isClosed && inWindow(whenMs)) {
      if (g.isOption) optionRealized += g.net; else stockRealized += g.net;
      fees += g.fees;
      closed.push({ symbol: sym, desc: g.desc, kind: g.isOption ? "option" : "stock", realized: g.net, fees: g.fees, via: expired && !roundTripped ? "expired" : "closed", whenMs });
    } else {
      open.push({ symbol: sym, desc: g.desc, kind: g.isOption ? "option" : "stock", net: g.net });
    }
  }
  closed.sort((a, b) => (b.whenMs || 0) - (a.whenMs || 0));
  return {
    optionRealized, stockRealized, realized: optionRealized + stockRealized, fees,
    closedCount: closed.length, openCount: open.length, closed, open,
  };
}
