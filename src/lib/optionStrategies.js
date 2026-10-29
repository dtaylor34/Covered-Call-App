// ─── src/lib/optionStrategies.js ─────────────────────────────────────────────
// Groups the Options Manager's individual option legs (optionPositions) into
// recognized multi-leg strategies (straddle, strangle, vertical, iron condor,
// butterfly, …) and derives the strategy-level numbers the Working tab needs:
// net credit/debit, open P&L, breakevens, max profit/loss, net delta, and —
// using mechanical management rules — where to take profits.
//
// Pure functions, no React / no network. Black-Scholes comes from coveredCallMath
// so the "current" (mark-to-model) and time-decay curves match the rest of the app.

import { optType, isLong, optionCalcs, daysToExpiry } from "./optionsMath";
import { callVal, putVal, DEFAULT_IV } from "./coveredCallMath";

export const MANAGE_DTE = 21; // classic "manage before gamma blows up" threshold

const legQty = (l) => Math.max(1, Math.round(l?.contracts || 1));
const legMult = (l) => Number(l?.multiplier) || 100;
const firstVal = (legs, k) => { for (const l of legs) { const v = Number(l?.[k]); if (v > 0) return v; } return 0; };

// ── Grouping + classification ─────────────────────────────────────────────────

/**
 * Group flat option legs into strategies by (symbol, account, expiry).
 * @param {Array} positions  optionPositions docs
 * @returns {Array} [{ key, sym, acct, expiry, legs, strategy, multiLeg }]
 */
export function groupIntoStrategies(positions) {
  const groups = {};
  for (const p of positions || []) {
    const sym = String(p.sym || "").toUpperCase();
    const key = `${sym}|${p.acct || p.acctId || ""}|${p.expiry || ""}`;
    (groups[key] = groups[key] || { key, sym, acct: p.acct || null, acctId: p.acctId || null, expiry: p.expiry, legs: [] }).legs.push(p);
  }
  return Object.values(groups)
    .map((g) => ({ ...g, ...classifyLegs(g.legs) }))
    .sort((a, b) => (daysToExpiry(a.expiry) ?? 1e9) - (daysToExpiry(b.expiry) ?? 1e9));
}

/** Name a leg set. Returns { strategy, multiLeg }. */
export function classifyLegs(legs) {
  const n = legs.length;
  if (n === 1) {
    const l = legs[0];
    return { strategy: `${isLong(l) ? "Long" : "Short"} ${optType(l) === "CALL" ? "call" : "put"}`, multiLeg: false };
  }
  const calls = legs.filter((l) => optType(l) === "CALL");
  const puts = legs.filter((l) => optType(l) === "PUT");
  const longs = legs.filter(isLong);
  const allLong = legs.every(isLong);
  const allShort = legs.every((l) => !isLong(l));
  const sameDir = allLong || allShort;

  if (n === 2 && calls.length === 1 && puts.length === 1 && sameDir) {
    const sameStrike = Number(calls[0].strike) === Number(puts[0].strike);
    return { strategy: `${allLong ? "Long" : "Short"} ${sameStrike ? "straddle" : "strangle"}`, multiLeg: true };
  }
  if (n === 2 && calls.length === 2 && longs.length === 1) return { strategy: "Call vertical", multiLeg: true };
  if (n === 2 && puts.length === 2 && longs.length === 1) return { strategy: "Put vertical", multiLeg: true };
  if (n === 4 && calls.length === 2 && puts.length === 2) return { strategy: "Iron condor", multiLeg: true };
  if (n === 3 && (calls.length === 3 || puts.length === 3)) return { strategy: "Butterfly", multiLeg: true };
  return { strategy: `Custom ${n}-leg`, multiLeg: true };
}

// ── Black-Scholes helpers ───────────────────────────────────────────────────────

/** Back out implied vol (decimal) from a live mark by bisecting the BS value. */
export function ivFromMark(type, S, K, days, mark) {
  if (!(S > 0) || !(K > 0) || !(days > 0) || !(mark > 0)) return DEFAULT_IV;
  const f = type === "CALL" ? callVal : putVal;
  let lo = 0.01, hi = 3;
  if (f(S, K, days, hi) < mark) return hi;
  if (f(S, K, days, lo) > mark) return lo;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(S, K, days, m) < mark) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Strategy P&L (dollars) at expiration for underlying price x. `per` from strategyCalcs. */
export function payoffExp(per, x) {
  let s = 0;
  for (const { c } of per) {
    const intr = c.call ? Math.max(x - c.K, 0) : Math.max(c.K - x, 0);
    s += (c.long ? intr - c.fill : c.fill - intr) * c.mult * c.qty;
  }
  return s;
}

/** Strategy P&L (dollars) right now (mark-to-model) at underlying x with `days` left. */
export function valueNow(per, x, days) {
  let s = 0;
  const d = Math.max(days, 0.001);
  for (const { c, iv } of per) {
    const v = c.call ? callVal(x, c.K, d, iv) : putVal(x, c.K, d, iv);
    s += (c.long ? v - c.fill : c.fill - v) * c.mult * c.qty;
  }
  return s;
}

// ── Strategy-level numbers ──────────────────────────────────────────────────────

/**
 * @param {object} group  one entry from groupIntoStrategies (legs may carry live marks)
 * @param {object} opts   { liveUnderlying }
 */
export function strategyCalcs(group, opts = {}) {
  const legs = group.legs || [];
  const S = Number(opts.liveUnderlying) || firstVal(legs, "liveUnderlying") || firstVal(legs, "fillUnderlying") || 0;
  const dte = Math.max(0, daysToExpiry(group.expiry) ?? 0);

  let openPL = 0, netEntry = 0, curLiq = 0, netCallQty = 0, netPutQty = 0;
  const per = legs.map((l) => {
    const c = optionCalcs(l);
    openPL += c.pl;
    netEntry += c.long ? -c.cost : c.cost;   // cash flow at entry: credit positive, debit negative
    curLiq += c.long ? c.value : -c.value;   // net liquidation value right now
    const signedQty = (c.long ? 1 : -1) * c.qty;
    if (c.call) netCallQty += signedQty; else netPutQty += signedQty;
    const mark = c.live > 0 ? c.live : c.fill;
    const rawIv = Number(l.iv);
    const iv = rawIv > 0 ? (rawIv > 3 ? rawIv / 100 : rawIv) : ivFromMark(c.call ? "CALL" : "PUT", S, c.K, Math.max(dte, 0.5), mark);
    return { leg: l, c, iv };
  });

  const kind = netEntry > 0 ? "credit" : "debit";
  const credit = Math.max(0, netEntry);
  const debit = Math.max(0, -netEntry);

  // Sample the expiration payoff to find breakevens + bounded extremes.
  const strikes = legs.map((l) => Number(l.strike) || 0);
  const hi = S > 0 ? S * 3 : (Math.max(...strikes, 0) * 2 || 100);
  const N = 200, step = hi / N;
  const bes = [];
  let prev = null, sampMax = -Infinity, sampMin = Infinity;
  for (let i = 0; i <= N; i++) {
    const x = step * i, y = payoffExp(per, x);
    sampMax = Math.max(sampMax, y); sampMin = Math.min(sampMin, y);
    if (prev && (prev.y < 0) !== (y < 0)) bes.push(prev.x + ((x - prev.x) * -prev.y) / (y - prev.y));
    prev = { x, y };
  }
  const maxProfit = netCallQty > 0 ? Infinity : sampMax;   // net long calls → unbounded upside
  const maxLoss = netCallQty < 0 ? -Infinity : sampMin;    // net short calls → unbounded loss up

  const basis = kind === "credit" ? credit : debit;
  const pctOfMax = basis > 0 ? (openPL / basis) * 100 : 0;

  return {
    S, dte, per, openPL, netEntry, kind, credit, debit, curLiq,
    breakevens: bes, maxProfit, maxLoss, netCallQty, netPutQty, pctOfMax,
    mult: legMult(legs[0] || {}),
  };
}

// ── Mechanical profit-taking guidance ───────────────────────────────────────────

const rd = (v) => Math.round(v || 0).toLocaleString("en-US");
const pctOf = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/**
 * Industry-standard management rules →
 *   Credit: take profit at 50% of max credit; manage at 21 DTE; stop at 2× credit.
 *   Debit:  scale out at +50%, take profit at +100%; soft stop at −50%; mind theta ≤21 DTE.
 * @returns {{ kind, manageDte, maxProfit, targets, health, recommendation }}
 */
export function profitTargets(calc) {
  const { kind, credit, debit, openPL, dte, maxProfit } = calc;
  const targets = [];
  let health = { color: "neutral", label: "On track" };
  let recommendation = "";

  if (kind === "credit") {
    const tp = 0.5 * credit, stop = -2 * credit;
    targets.push({ label: "Take profit — 50% of max", plDollar: tp });
    targets.push({ label: "Defensive stop — 2× credit", plDollar: stop, stop: true });
    if (openPL >= tp) { health = { color: "good", label: "Take profit" }; recommendation = `Captured ${pctOf(openPL, credit)} of the max credit — at/above the 50% target. Consider closing to lock it in.`; }
    else if (openPL <= stop) { health = { color: "bad", label: "Past stop" }; recommendation = `Loss has reached 2× the credit received ($${rd(-openPL)}). Consider cutting the trade.`; }
    else if (dte <= MANAGE_DTE) { health = { color: "warn", label: `Manage · ${dte}d` }; recommendation = `Inside ${MANAGE_DTE} DTE (${dte}d left) — gamma risk rises. Consider closing or rolling even before the 50% target.`; }
    else recommendation = `Captured ${pctOf(openPL, credit)} of max credit. Target: close at 50% (≈ $${rd(tp)} profit).`;
  } else {
    const t1 = 0.5 * debit, t2 = 1.0 * debit, stop = -0.5 * debit;
    targets.push({ label: "Scale out — +50%", plDollar: t1 });
    targets.push({ label: "Take profit — +100%", plDollar: t2 });
    targets.push({ label: "Soft stop — −50%", plDollar: stop, stop: true });
    if (openPL >= t2) { health = { color: "good", label: "Take profit" }; recommendation = `Up ${pctOf(openPL, debit)} on the debit paid — past +100%. Consider taking profits.`; }
    else if (openPL >= t1) { health = { color: "good", label: "Scale out" }; recommendation = `Up ${pctOf(openPL, debit)} — past the +50% target. Consider scaling out part of the position.`; }
    else if (openPL <= stop) { health = { color: "bad", label: "Soft stop" }; recommendation = `Down ${pctOf(-openPL, debit)} of the debit — at the −50% soft stop. Consider cutting.`; }
    else if (dte <= MANAGE_DTE) { health = { color: "warn", label: `Theta · ${dte}d` }; recommendation = `Inside ${MANAGE_DTE} DTE (${dte}d) — time decay accelerates against long options. Manage if it isn't working.`; }
    else recommendation = `${openPL >= 0 ? "Up" : "Down"} ${pctOf(Math.abs(openPL), debit)} on debit. First target: +50% (≈ $${rd(t1)} profit).`;
  }
  return { kind, manageDte: MANAGE_DTE, maxProfit, targets, health, recommendation };
}
