// ─── src/lib/coveredCallMath.js ──────────────────────────────────────────────
// Pure covered-call math, ported verbatim from the working prototype
// (handover/reference/Portfolio.dc.html <script type="text/x-dc">).
//
// Rules of the road:
//   • Pure functions only — no React, no Firestore, no I/O. Fully unit-tested.
//   • `iv` is always a DECIMAL here (0.22 = 22%). Callers convert stored percents.
//   • Money helpers work in dollars; `shares = contracts * 100`.
//   • Risk-free rate r = 4% (matches the prototype and docs/BROKER math notes).
//
// Verified against the PFE acceptance trade in handover/HANDOVER.md.
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_FREE_RATE = 0.04;
export const DEFAULT_IV = 0.25;          // 25% when a position has none
export const DEFAULT_TARGET_YIELD = 1;   // 1% per month "Ready" threshold

// ── Black-Scholes ─────────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz-Stegun approximation, as in the prototype). */
export function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Black-Scholes value of a call (per share).
 * @param {number} S underlying price
 * @param {number} K strike
 * @param {number} days calendar days to expiry
 * @param {number} iv implied vol as a decimal (0.22)
 */
export function callVal(S, K, days, iv) {
  if (days <= 0.001) return Math.max(0, S - K);
  const T = days / 365, r = RISK_FREE_RATE, v = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / v;
  return S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d1 - v);
}

/** Put value via put-call parity: P = C − S + K·e^(−rT). */
export function putVal(S, K, days, iv) {
  const T = days / 365;
  return callVal(S, K, days, iv) - S + K * Math.exp(-RISK_FREE_RATE * T);
}

/** Probability the call finishes in the money ≈ N(d1) (the prototype's "call chance"). */
export function callDelta(S, K, days, iv) {
  if (days <= 0.001) return S >= K ? 1 : 0;
  const T = days / 365, v = iv * Math.sqrt(T);
  return ncdf((Math.log(S / K) + (RISK_FREE_RATE + iv * iv / 2) * T) / v);
}

// ── Strike stepping ───────────────────────────────────────────────────────────

/** Strike increment used when suggesting a call: 0.5 (<$50), 1 (<$200), else 5. */
export function strikeStep(price) {
  if (price < 50) return 0.5;
  if (price < 200) return 1;
  return 5;
}

/** Ceil x up to the nearest `step` (with the prototype's epsilon guard). */
export function ceilTo(x, step) {
  return Math.ceil(x / step - 1e-9) * step;
}

// ── Per-position P&L ──────────────────────────────────────────────────────────

/**
 * Core covered-call numbers for one position.
 * @param {object} p { contracts, fillStock, fillCall, strike, liveStock, liveCall }
 * @returns {object} dollar figures + breakeven/maxProfit/health
 */
export function positionCalcs(p) {
  const contracts = p.contracts || 1;
  const shares = contracts * 100;
  const { fillStock, fillCall, strike: K, liveStock, liveCall } = p;

  const shareCost = fillStock * shares;
  const premium = fillCall * shares;
  const buyback = liveCall * shares;
  const kept = premium - buyback;
  const marketValue = liveStock * shares;
  const stockPL = marketValue - shareCost;
  const close = stockPL + kept;                       // P&L if closed now
  const breakeven = fillStock - fillCall;
  const maxProfit = (K - fillStock) * shares + premium;
  const health = shareCost ? (marketValue + premium - buyback) / shareCost : 0;
  const basis = shareCost - premium;                  // "money in the trade"

  return { contracts, shares, shareCost, premium, buyback, kept, marketValue, stockPL, close, breakeven, maxProfit, health, basis };
}

// ── Stoplight ─────────────────────────────────────────────────────────────────

/**
 * Health stoplight for an open call.
 *   Red    if S ≥ K or delta ≥ 0.60
 *   Yellow if delta ≥ 0.35 or S < breakeven
 *   Green  otherwise
 * @returns {{ key:'g'|'y'|'r', label:string, delta:number }}
 */
export function stoplight({ liveStock, strike, daysToExpiry, iv, breakeven }) {
  const delta = callDelta(liveStock, strike, Math.max(1, Math.round(daysToExpiry || 1)), iv);
  let key, label;
  if (liveStock >= strike || delta >= 0.6) { key = 'r'; label = 'Likely called'; }
  else if (delta >= 0.35 || liveStock < breakeven) { key = 'y'; label = liveStock < breakeven ? 'Watch · below BE' : 'Watch · near strike'; }
  else { key = 'g'; label = 'Good'; }
  return { key, label, delta };
}

// ── GTC buy-back fill estimate ────────────────────────────────────────────────

/**
 * When does a GTC buy-back at `gtc` fill, and how much premium does it lock in?
 * Steps down from `daysLeft` in 0.25-day increments to the first day the modeled
 * call value is ≤ the GTC price at stock price S.
 * @returns {{ fillDays:number|null, gtcKeep:number }} fillDays = days-to-expiry
 *          at which it fills (null if never within the window); gtcKeep in dollars.
 */
export function gtcFillEstimate({ S, strike, daysLeft, iv, gtc, fillCall, contracts = 1 }) {
  const shares = contracts * 100;
  const gtcKeep = (fillCall - gtc) * shares;
  const cNow = callVal(S, strike, daysLeft, iv);
  let fillDays = null;
  if (cNow <= gtc) {
    fillDays = daysLeft;
  } else {
    for (let d = daysLeft; d >= 0; d -= 0.25) {
      if (callVal(S, strike, Math.max(0, d), iv) <= gtc) { fillDays = Math.max(0, d); break; }
    }
  }
  return { fillDays, gtcKeep };
}

// ── Lots ──────────────────────────────────────────────────────────────────────

/**
 * Effective per-share cost of a lot after premium kept (from prior closes and
 * from any open call currently covering it).
 * @param {object} lot { shares, cost, premiumKept }
 * @param {object|null} coveringPosition open position covering this lot, or null
 */
export function effectiveLotCost(lot, coveringPosition = null) {
  const openPremium = coveringPosition
    ? coveringPosition.fillCall * (coveringPosition.contracts || 1) * 100
    : 0;
  const kept = (lot.premiumKept || 0) + openPremium;
  return lot.cost - kept / lot.shares;
}

/**
 * Free-lot signal: can this uncovered lot sell a worthwhile call today?
 *   Ready if a ~30-day call at/above cost yields ≥ target (%/month)
 *   Thin  if it yields ≥ 0.35 × target
 *   Hold  otherwise (scans upward for the stock price where it turns Ready)
 * @param {object} args { S, eff, iv, target=1, step? }
 * @returns {{ signal:'ready'|'thin'|'hold', strike, premium, monthlyYieldPct, readyPrice:number|null }}
 */
export function freeLotSignal({ S, eff, iv, target = DEFAULT_TARGET_YIELD, step }) {
  const stp = step || strikeStep(S);
  const strike = ceilTo(Math.max(eff, S), stp);
  const premium = callVal(S, strike, 30, iv);
  const monthlyYieldPct = premium / S * 100;

  if (monthlyYieldPct >= target) {
    return { signal: 'ready', strike, premium, monthlyYieldPct, readyPrice: null };
  }
  if (monthlyYieldPct >= target * 0.35) {
    return { signal: 'thin', strike, premium, monthlyYieldPct, readyPrice: null };
  }
  // Hold: scan upward for the price where a call at/above cost turns Ready.
  let readyPrice = null;
  for (let s2 = S; s2 <= Math.max(eff, S) * 1.25; s2 += stp / 10) {
    const K2 = ceilTo(Math.max(eff, s2), stp);
    if (callVal(s2, K2, 30, iv) / s2 * 100 >= target) { readyPrice = s2; break; }
  }
  return { signal: 'hold', strike, premium, monthlyYieldPct, readyPrice };
}

/**
 * Order lots for delivery if shares are called at strike K:
 * highest cost at or under K first (smallest gain), then lowest cost above K.
 * @param {string} sym
 * @param {number} K strike
 * @param {Array} lots [{ sym, shares, cost }]
 */
export function deliveryOrder(sym, K, lots) {
  const held = lots.filter((l) => l.sym === sym && l.shares > 0);
  const under = held.filter((l) => l.cost <= K).sort((a, b) => b.cost - a.cost);
  const over = held.filter((l) => l.cost > K).sort((a, b) => a.cost - b.cost);
  return under.concat(over);
}

/**
 * Wash-sale flag for selling `lot` at a loss: true if another lot of the same
 * symbol was bought within the last 30 days. Clear date = latest such buy + 31d.
 * @param {object} lot the lot being (potentially) sold at a loss
 * @param {Array} lots all lots
 * @param {Date} today reference date (pass explicitly for deterministic results)
 * @param {number} livePrice current price, to confirm the lot is at a loss
 * @returns {{ wash:boolean, clearDate:Date|null }}
 */
export function washSale(lot, lots, today, livePrice) {
  const atLoss = (livePrice - lot.cost) < -0.005;
  if (!atLoss) return { wash: false, clearDate: null };
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const recent = lots
    .filter((o) => {
      if (o.id === lot.id || o.sym !== lot.sym) return false;
      const ageDays = (t0 - new Date(o.bought)) / 86400000;
      return ageDays >= 0 && ageDays <= 30;
    })
    .map((o) => new Date(o.bought))
    .sort((a, b) => b - a)[0];
  if (!recent) return { wash: false, clearDate: null };
  const clearDate = new Date(recent);
  clearDate.setDate(clearDate.getDate() + 31);
  return { wash: true, clearDate };
}

// ── Tax estimate ──────────────────────────────────────────────────────────────

/**
 * Combined estimated tax on realized gains. NIIT adds 3.8%. Applied to
 * max(0, realized). Always label results "estimate, not tax advice".
 * @param {object} rates { fed, state, niit }  fed/state as percents (24, 9.3)
 * @param {number} realized realized gain in dollars
 * @returns {{ ratePct:number, rate:number, tax:number }}
 */
export function taxEstimate(rates, realized) {
  const ratePct = (Number(rates.fed) || 0) + (Number(rates.state) || 0) + (rates.niit ? 3.8 : 0);
  const rate = ratePct / 100;
  return { ratePct, rate, tax: Math.max(0, realized) * rate };
}
