// ─── functions/bestReturns.js ─────────────────────────────────────────────────
// Scores the option chain across expiries for three covered-call strategies
// (see best-returns-spec.md). Earnings/dividend/IV-percentile score terms are
// omitted for now (that data isn't wired yet) — they degrade gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getQuote, getFullChain } = require("./providers");

function requireAuth(req) { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return req.auth.uid; }
function cleanSymbol(s) { const v = String(s || "").trim().toUpperCase(); if (!/^[A-Z.]{1,6}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid symbol."); return v; }

// Piecewise OTM sweet-spot scores from the spec.
function otmScoreNoSale(o) {
  if (o < 7) return Math.max(0, 60 - (7 - o) * 8);
  if (o <= 10) return 60 + (o - 7) / 3 * 40;
  if (o <= 12) return 100 - (o - 10) / 2 * 10;
  if (o <= 15) return 90 - (o - 12) / 3 * 20;
  return Math.max(0, 70 - (o - 15) * 6);
}
function otmScoreSale(o) {
  if (o < 0) return 50;
  if (o <= 1) return 70 + o * 30;
  if (o <= 2) return 100 - (o - 1) * 10;
  if (o <= 3) return 90 - (o - 2) * 15;
  if (o <= 4) return 75 - (o - 3) * 15;
  return Math.max(0, 60 - (o - 4) * 10);
}
const dteScoreSale = (d) => (d <= 21 ? 100 : d <= 30 ? 85 : d <= 45 ? 70 : 50);
const liquidityScore = (c) => Math.min(100, (c.volume || 0) / 10 + (c.openInterest || 0) / 50);
const spreadPct = (c) => (c.bid > 0 ? (c.ask - c.bid) / c.bid * 100 : 999);

function flattenCalls(full, price) {
  const now = Date.now(), out = [];
  for (const [exp, legs] of Object.entries(full?.chain || {})) {
    const dte = Math.round((new Date(exp) - now) / 86400000);
    if (dte < 1) continue;
    for (const c of (legs.calls || [])) {
      if (!(c.strike > 0)) continue;
      out.push({
        strike: c.strike, bid: c.bid || 0, ask: c.ask || 0, last: c.lastPrice || 0,
        iv: c.impliedVolatility || 0, volume: c.volume || 0, openInterest: c.openInterest || 0,
        exp, dte, otmPct: (c.strike - price) / price * 100,
      });
    }
  }
  return out;
}

function pickBestReturn(calls, price) {
  let best = null, score = -1;
  for (const c of calls) {
    if (c.dte < 21 || c.dte > 60) continue;
    // Covered calls: only strikes AT or ABOVE the current price. Deep-ITM strikes
    // have huge bids that are mostly intrinsic value (the stock's own worth), not
    // income — counting them produced absurd "returns" and would just get the
    // shares called away at a loss. Capped at 25% OTM (further out has no premium).
    if (c.otmPct < 0 || c.otmPct > 25) continue;
    // Must be a real, tradeable quote — liquid bid and a sane spread.
    if (c.bid <= 0.30 || spreadPct(c) >= 20) continue;
    // At/above the price the bid is pure time value → genuine income.
    const prem = c.bid;
    const ann = (prem / price) * (365 / c.dte) * 100;
    if (ann > score) { score = ann; best = { ...c, prem, annualized: ann }; }
  }
  if (!best) return null;
  const gtc = Math.max(0.10, Math.round(best.prem * 0.10 * 100) / 100);
  return { ...best, gtc };
}
function pickNoSale(calls, price, contracts) {
  let best = null, score = -Infinity;
  for (const c of calls) {
    if (c.dte < 21 || c.dte > 60) continue;
    if (c.otmPct < 7 || c.otmPct > 15) continue;
    if (c.bid <= 0.5 || spreadPct(c) >= 20) continue;
    const ann = (c.bid / price) * (365 / c.dte) * 100;
    const s = ann * 0.35 + otmScoreNoSale(c.otmPct) * 0.30 + liquidityScore(c) * 0.15;
    if (s > score) { score = s; best = { ...c, annualized: ann }; }
  }
  if (!best) return null;
  let gtc = Math.max(0.10, Math.min(3.00, Math.round(best.bid * 0.04 * 100) / 100));
  return {
    ...best, gtc,
    totalPremium: best.bid * 100 * contracts,
    expectedProfit: (best.bid - gtc) * 100 * contracts,
    pctCaptured: (1 - gtc / best.bid) * 100,
  };
}
function pickSale(calls, price, contracts) {
  let best = null, score = -Infinity;
  for (const c of calls) {
    if (c.dte < 14 || c.dte > 45) continue;
    if (c.otmPct < 0 || c.otmPct > 4) continue;
    if (c.bid <= 0.2 || spreadPct(c) >= 15) continue;
    const stockGain = Math.max(0, c.strike - price);
    const totalPerContract = c.bid * 100 + stockGain * 100;
    const ann = (totalPerContract / (price * 100)) * (365 / c.dte) * 100;
    const s = ann * 0.40 + otmScoreSale(c.otmPct) * 0.25 + dteScoreSale(c.dte) * 0.20;
    if (s > score) { score = s; best = { ...c, annualized: ann, stockGainPerShare: stockGain }; }
  }
  if (!best) return null;
  return {
    ...best, gtc: Math.max(0.05, Math.round(best.bid * 0.10 * 100) / 100),
    totalPremium: best.bid * 100 * contracts,
    stockGain: best.stockGainPerShare * 100 * contracts,
    totalReturn: (best.bid + best.stockGainPerShare) * 100 * contracts,
  };
}

exports.getBestReturns = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const contracts = Math.max(1, Math.round(request.data.contracts || 1));
  const quote = await getQuote(symbol);
  const price = quote.price || 0;
  if (!(price > 0)) throw new HttpsError("internal", `No price for ${symbol}.`);
  const calls = flattenCalls(await getFullChain(symbol, 10), price);
  return {
    symbol, price, contracts,
    bestReturn: pickBestReturn(calls, price),
    noSale: pickNoSale(calls, price, contracts),
    sale: pickSale(calls, price, contracts),
  };
});
