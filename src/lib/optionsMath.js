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

// Free-roll / scale-out plan for a (primarily long) option position.
// The idea: once you can sell PART of the position for enough to recover your
// entire cost, the contracts you keep are "free-running" — house money, with no
// original capital left at risk. For an even lot that break-even is simply 2×
// entry (sell half, get your money back); this generalizes to any lot size and
// to positions that have already been partly scaled out (`scaledOut`/`recovered`).
export function freeRollPlan(p) {
  const c = optionCalcs(p);
  const { qty, mult, fill, live, long } = c;
  const scaledOut = Math.max(0, Math.round(Number(p.scaledOut) || 0)); // contracts already sold
  const recovered = Math.max(0, Number(p.recovered) || 0);             // $ already pulled back out
  const origQty = qty + scaledOut;
  const origCost = fill * mult * origQty;              // what the whole lot cost to put on
  const remainingCost = Math.max(0, origCost - recovered);
  const sellQty = Math.max(1, Math.floor(qty / 2));    // "sell half" (keep the larger half on odd lots)
  const keepQty = qty - sellQty;
  // Price at which selling `sellQty` now recovers the remaining unrecovered cost.
  const freeRollPrice = sellQty > 0 && mult > 0 ? remainingCost / (sellQty * mult) : null;
  const proceedsNow = sellQty * live * mult;           // cash if you sold half at the live mark
  const recoverPct = origCost > 0 ? ((recovered + proceedsNow) / origCost) * 100 : 0;
  // Progress toward free-roll, measured on the premium you still need to capture:
  // 0% at your entry price, 100% once the mark reaches the free-roll price. (Using
  // live/freeRollPrice would wrongly read ~50% the moment you open the trade.)
  const denom = (freeRollPrice != null ? freeRollPrice : 2 * fill) - fill;
  const progressPct = denom > 0 ? Math.max(0, Math.min(100, ((live - fill) / denom) * 100)) : 100;
  const freeRunning = long && recovered >= origCost - 1e-6 && qty >= 1; // whole cost already back out
  const applicable = long && qty >= 2;                 // need ≥2 contracts to sell half and keep some
  const ready = applicable && keepQty >= 1 && freeRollPrice != null && live >= freeRollPrice;
  return {
    applicable, freeRunning, ready, sellQty, keepQty,
    origQty, origCost, remainingCost, recovered, scaledOut,
    freeRollPrice, proceedsNow, recoverPct, progressPct, long,
  };
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
