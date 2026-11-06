// ─── src/lib/schwabTransactions.js ───────────────────────────────────────────
// Parse Schwab Trader API *transactions* (not orders) to a realized P&L that ties
// out to Schwab's Gain/Loss report. Each TRADE transaction's `netAmount` is
// already net of commissions + regulatory fees, so summing the option-trade
// netAmounts over a window that covers both the open and the close of each cycle
// gives the realized option P&L — including the trades older than the ~60-day
// order window, and the exact fees.
//
// NOTE: field names/signs are defensive and will be calibrated against the real
// transactions payload (Schwab's shape varies). `realizedFromTransactions` is a
// diagnostic sum for now; the exact open/close pairing is finalized once we see
// the live data.

const asArray = (data) => (Array.isArray(data) ? data : (data?.transactions || (data ? [data] : [])));
const legsOf = (t) => t.transferItems || t.transactionItems || t.items || [];
const isOptionTx = (t) => legsOf(t).some((it) => String(it?.instrument?.assetType || "").toUpperCase() === "OPTION");
const underlyingOf = (t) => {
  const leg = legsOf(t).find((it) => String(it?.instrument?.assetType || "").toUpperCase() === "OPTION");
  const inst = leg?.instrument || {};
  return String(inst.underlyingSymbol || inst.symbol || "").toUpperCase();
};
const feesOf = (t) => legsOf(t).reduce((f, it) => f + (String(it?.feeType || "") ? Math.abs(Number(it.cost ?? it.amount) || 0) : 0), 0);

/**
 * Realized option P&L from Schwab transaction payloads (one per account, or merged).
 * @returns {{ realized, fees, optionCount, count, bySym }}
 *   realized = Σ netAmount over option TRADE transactions (net of fees → matches CS)
 */
export function realizedFromTransactions(payloads) {
  const txns = [].concat(...(payloads || []).map(asArray));
  let realized = 0, fees = 0, optionCount = 0;
  const bySym = {};
  for (const t of txns) {
    if (String(t.type || "").toUpperCase() !== "TRADE") continue;
    if (!isOptionTx(t)) continue;
    const net = Number(t.netAmount) || 0;
    realized += net;
    fees += feesOf(t);
    optionCount++;
    const sym = underlyingOf(t);
    if (sym) { bySym[sym] = bySym[sym] || { realized: 0, count: 0 }; bySym[sym].realized += net; bySym[sym].count++; }
  }
  return { realized, fees, optionCount, count: txns.length, bySym };
}
