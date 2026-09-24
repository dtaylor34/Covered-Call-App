// ─── src/lib/ytd.js ──────────────────────────────────────────────────────────
// Year-to-date realized/open P&L, estimated tax, and portfolio health.
// Ported from the prototype's totals/ytd block (Portfolio.dc.html). Pure.

import { positionCalcs, taxEstimate } from "./coveredCallMath";

/**
 * @param {Array} closed   closed calls [{ contracts, fillCall, buyback, stockGain, closedOn, how, strike, expiry, sym, delivered }]
 * @param {Array} positions open positions (for open P&L + health)
 * @param {object} rates   { fed, state, niit }
 * @param {number} year    calendar year to total (e.g. 2026)
 */
export function ytdSummary(closed, positions, rates, year) {
  const { rate } = taxEstimate(rates, 0);

  let cPrem = 0, cBuy = 0, cOpt = 0, cStock = 0;
  const rows = (closed || [])
    .filter((c) => String(c.closedOn || "").slice(0, 4) === String(year))
    .map((c) => {
      const q = (c.contracts || 1) * 100;
      const prem = (c.fillCall || 0) * q;
      const bb = (c.buyback || 0) * q;
      const opt = prem - bb;
      const stock = c.stockGain || 0;
      const total = opt + stock;
      cPrem += prem; cBuy += bb; cOpt += opt; cStock += stock;
      return { ...c, shares: q, premium: prem, buyback: bb, opt, stock, total, tax: Math.max(0, total) * rate };
    });

  const openCalcs = (positions || []).map(positionCalcs);
  const openPL = openCalcs.reduce((a, c) => a + c.close, 0);
  const openKept = openCalcs.reduce((a, c) => a + c.kept, 0);
  const shareCost = openCalcs.reduce((a, c) => a + c.shareCost, 0);
  const marketVal = openCalcs.reduce((a, c) => a + c.marketValue, 0);
  const premium = openCalcs.reduce((a, c) => a + c.premium, 0);
  const buyback = openCalcs.reduce((a, c) => a + c.buyback, 0);

  const realized = cOpt + cStock;
  const gross = realized + openPL;
  const net = gross - Math.max(0, gross) * rate;
  const accountHealth = shareCost ? (marketVal + premium - buyback) / shareCost : 0;

  return {
    year, rate,
    premiumRealized: cOpt, stockRealized: cStock, realized,
    openPL, openKept,
    premTax: Math.max(0, cOpt) * rate,
    realizedTax: Math.max(0, realized) * rate,
    gross, net, accountHealth,
    closedCount: rows.length,
    rows,
  };
}
