// ─── functions/engine/scoring.js ─────────────────────────────────────────────
// Covered Call Scoring Engine
//
// Filters and ranks call options as covered call candidates.
// Produces a composite score (0–100) based on weighted factors.
//
// This is the core IP of the app — the analysis users pay for.
// ─────────────────────────────────────────────────────────────────────────────

// ── Default scoring config (overridable via env) ──
const DEFAULT_CONFIG = {
  minOpenInterest: 100,
  minVolume: 10,
  minDTE: 7,
  maxDTE: 60,
  minStrikeRatio: 0.95, // Strike must be >= 95% of stock price (ATM or OTM)
  weights: {
    yield: 0.30,
    annualized: 0.20,
    probability: 0.20,
    protection: 0.15,
    timeValue: 0.15,
  },
};

/**
 * Score covered call opportunities for a given symbol.
 *
 * @param {Object} chain - OptionsChain shape (with Greeks populated)
 * @param {Object} [config] - Optional scoring config overrides
 * @returns {Object} CoveredCallScore shape (see DATA_LAYER.md Section 2.3)
 */
function scoreCoveredCalls(chain, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const S = chain.underlyingPrice;

  if (!S || S <= 0) {
    return {
      symbol: chain.symbol,
      underlyingPrice: S,
      recommendations: [],
      delay: chain.delay,
      provider: chain.provider,
      scoredAt: new Date().toISOString(),
    };
  }

  // ── Step 1: Collect all eligible call contracts across expirations ──
  const candidates = [];

  for (const expDate of Object.keys(chain.chain)) {
    const expContracts = chain.chain[expDate];
    if (!expContracts.calls) continue;

    for (const call of expContracts.calls) {
      // Apply filters
      if (!passesFilters(call, S, cfg)) continue;

      // Calculate covered call metrics
      const metrics = calculateMetrics(call, S);
      candidates.push({ ...call, ...metrics });
    }
  }

  // ── Step 2: Score each candidate relative to the pool ──
  const scored = candidates.map((c) => ({
    ...c,
    scores: calculateScores(c, candidates, cfg),
  }));

  // ── Step 3: Calculate composite score ──
  for (const item of scored) {
    item.compositeScore = Math.round(
      item.scores.yield * cfg.weights.yield +
      item.scores.annualized * cfg.weights.annualized +
      item.scores.probability * cfg.weights.probability +
      item.scores.protection * cfg.weights.protection +
      item.scores.timeValue * cfg.weights.timeValue
    );
  }

  // ── Step 4: Sort by composite score descending, take top 20 ──
  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  const top = scored.slice(0, 20);

  // ── Step 5: Map to output shape ──
  const recommendations = top.map((c) => ({
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    expiration: c.expiration,
    bid: c.bid,
    ask: c.ask,
    premium: c.premium,
    premiumYield: round(c.premiumYield, 4),
    annualizedReturn: round(c.annualizedReturn, 4),
    maxProfit: round(c.maxProfit, 2),
    maxProfitPercent: round(c.maxProfitPercent, 4),
    downProtection: round(c.downProtection, 4),
    probabilityOTM: round(c.probabilityOTM, 4),
    daysToExpiration: c.daysToExpiration,
    breakeven: round(c.breakeven, 2),
    compositeScore: c.compositeScore,
    volume: c.volume,
    openInterest: c.openInterest,
    impliedVolatility: c.impliedVolatility,
    delta: c.delta,
    theta: c.theta,
    scores: {
      yield: Math.round(c.scores.yield),
      annualized: Math.round(c.scores.annualized),
      probability: Math.round(c.scores.probability),
      protection: Math.round(c.scores.protection),
      timeValue: Math.round(c.scores.timeValue),
    },
  }));

  return {
    symbol: chain.symbol,
    underlyingPrice: S,
    recommendations,
    delay: chain.delay,
    provider: chain.provider,
    scoredAt: new Date().toISOString(),
  };
}

// ─── Filtering ──────────────────────────────────────────────────────────────

function passesFilters(call, stockPrice, cfg) {
  // Must be a call
  if (call.type !== "call") return false;

  // Strike must be at or near the money (>= 95% of stock price by default)
  if (call.strike < stockPrice * cfg.minStrikeRatio) return false;

  // Minimum liquidity
  if ((call.openInterest || 0) < cfg.minOpenInterest) return false;
  if ((call.volume || 0) < cfg.minVolume) return false;

  // DTE range
  if (call.daysToExpiration < cfg.minDTE) return false;
  if (call.daysToExpiration > cfg.maxDTE) return false;

  // Must have a bid (can actually sell this contract)
  if (!call.bid || call.bid <= 0) return false;

  // Must have IV
  if (!call.impliedVolatility || call.impliedVolatility <= 0) return false;

  return true;
}

// ─── Metrics Calculation ────────────────────────────────────────────────────

function calculateMetrics(call, stockPrice) {
  // Use midpoint of bid/ask as premium estimate (more realistic than last price)
  const premium = call.bid && call.ask
    ? (call.bid + call.ask) / 2
    : call.lastPrice || call.bid || 0;

  const premiumYield = premium / stockPrice;
  const annualizedReturn = premiumYield * (365 / call.daysToExpiration);
  const maxProfit = (call.strike - stockPrice) + premium;
  const maxProfitPercent = maxProfit / stockPrice;
  const downProtection = premium / stockPrice;
  const breakeven = stockPrice - premium;

  // Probability OTM: 1 - |delta| is a rough but standard estimate
  // For more accuracy, we'd need full vol surface — this is sufficient for education
  const delta = call.delta || 0;
  const probabilityOTM = 1 - Math.abs(delta);

  return {
    premium: round(premium, 2),
    premiumYield,
    annualizedReturn,
    maxProfit,
    maxProfitPercent,
    downProtection,
    breakeven,
    probabilityOTM,
  };
}

// ─── Relative Scoring ───────────────────────────────────────────────────────

function calculateScores(candidate, pool, cfg) {
  if (pool.length === 0) {
    return { yield: 50, annualized: 50, probability: 50, protection: 50, timeValue: 50 };
  }

  // Score each metric as percentile within the pool (0–100)
  return {
    yield: percentileScore(candidate.premiumYield, pool.map((c) => c.premiumYield)),
    annualized: percentileScore(candidate.annualizedReturn, pool.map((c) => c.annualizedReturn)),
    probability: percentileScore(candidate.probabilityOTM, pool.map((c) => c.probabilityOTM)),
    protection: percentileScore(candidate.downProtection, pool.map((c) => c.downProtection)),
    timeValue: thetaEfficiencyScore(candidate, pool),
  };
}

/**
 * Calculate percentile rank within the pool (0–100).
 */
function percentileScore(value, pool) {
  if (pool.length <= 1) return 50;
  const sorted = [...pool].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= value).length;
  return Math.round((rank / sorted.length) * 100);
}

/**
 * Time value efficiency: how much theta decay works in the seller's favor
 * relative to the premium received.
 * Higher |theta| / premium = more efficient time decay for covered call seller.
 */
function thetaEfficiencyScore(candidate, pool) {
  const efficiency = (val) => {
    if (!val.theta || !val.premium || val.premium <= 0) return 0;
    // Theta is negative for long options, positive decay for seller
    return Math.abs(val.theta) / val.premium;
  };

  const candidateEff = efficiency(candidate);
  const poolEfficiencies = pool.map(efficiency);

  return percentileScore(candidateEff, poolEfficiencies);
}

function round(val, decimals) {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

module.exports = { scoreCoveredCalls };
