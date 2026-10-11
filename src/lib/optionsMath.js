// ─── src/lib/optionsMath.js ──────────────────────────────────────────────────
// Single-leg option math for the Options Manager's Working/History tabs. Handles
// long (bought-to-open) and short (sold-to-open) calls & puts, equity (×100) and
// futures options (custom multiplier). P&L sign is direction-aware: a long
// option gains as its price rises; a short option gains as its price decays.

export const optType = (p) => String(p?.type || "CALL").toUpperCase();
export const isLong = (p) => String(p?.direction || "long").toLowerCase() !== "short";

// Core dollar figures for one option position.
export function optionCalcs(p) {
  const qty = Math.max(1, Math.round(p.contracts || 1));
  const mult = Number(p.multiplier) || 100;        // shares/contract (100 equity)
  const fill = Number(p.fillPrice) || 0;           // option price at entry
  const live = p.livePrice != null && p.livePrice !== "" ? Number(p.livePrice) : fill;
  const long = isLong(p);
  const call = optType(p) === "CALL";
  const K = Number(p.strike) || 0;

  const cost = fill * mult * qty;                  // premium paid (long) / received (short)
  const value = live * mult * qty;                 // current market value of the option
  const pl = long ? value - cost : cost - value;   // long: up is good; short: decay is good
  const plPct = cost ? (pl / cost) * 100 : 0;

  // Underlying breakeven at expiry (same formula regardless of direction).
  const breakeven = K > 0 ? (call ? K + fill : K - fill) : null;

  // Simple single-leg extremes (per position, in dollars).
  let maxProfit = null, maxLoss = null;
  if (long) { maxProfit = call ? Infinity : (K - fill) * mult * qty; maxLoss = -cost; }
  else { maxProfit = cost; maxLoss = call ? -Infinity : -((K - fill) * mult * qty); }

  return { qty, mult, fill, live, long, call, K, cost, value, pl, plPct, breakeven, maxProfit, maxLoss };
}

// In/out-of-the-money + distance for a quick status chip.
export function moneyness(p, underlying) {
  const K = Number(p.strike) || 0;
  const S = Number(underlying);
  if (!(K > 0) || !Number.isFinite(S)) return { label: "—", itm: false, pct: null };
  const call = optType(p) === "CALL";
  const itm = call ? S > K : S < K;
  const pct = ((S - K) / K) * 100; // + = above strike
  return { label: itm ? "ITM" : "OTM", itm, pct };
}

// Realized P&L for a CLOSED option. Direction-aware; entry premium may be
// unknown (then pl is null until filled in). exitPrice is 0 for "expired".
export function closedOptionPnL(r) {
  const qty = Math.max(1, Math.round(r.contracts || 1));
  const mult = Number(r.multiplier) || 100;
  const fill = r.fillPrice != null && r.fillPrice !== "" ? Number(r.fillPrice) : null;
  const exit = Number(r.exitPrice) || 0;
  const long = isLong(r);
  const premiumKnown = fill != null;
  const entryVal = premiumKnown ? fill * mult * qty : null; // paid (long) / received (short)
  const exitVal = exit * mult * qty;
  const pl = !premiumKnown ? null : (long ? exitVal - entryVal : entryVal - exitVal);
  const daysHeld = (Number.isFinite(r.openedAtMs) && Number.isFinite(r.closedOnMs)) ? Math.max(0, Math.round((r.closedOnMs - r.openedAtMs) / 86400000)) : null;
  return { qty, mult, long, premiumKnown, entryVal, exitVal, pl, daysHeld, fill, exit };
}

export const optionId = (sym, type, strike, expiry, direction, acct) =>
  [String(sym || "").toUpperCase(), String(type || "CALL").toUpperCase(), Number(strike) || 0, expiry, String(direction || "long").toLowerCase(), acct || ""]
    .filter((x) => x !== "" && x != null).join("-").replace(/\s+/g, "");

export const daysToExpiry = (expiry) => {
  const [y, m, d] = String(expiry || "").split("-").map(Number);
  if (!y) return null;
  const exp = new Date(y, m - 1, d); exp.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((exp - now) / 86400000);
};
