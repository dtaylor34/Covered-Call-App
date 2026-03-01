// ─── functions/engine/greeks.js ──────────────────────────────────────────────
// Black-Scholes Greek calculator for options pricing.
// Provider-independent — works with any data source that supplies IV.
//
// Inputs:  S (stock price), K (strike), T (years to expiry), r (risk-free rate), σ (IV)
// Outputs: delta, gamma, theta, vega, rho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard normal cumulative distribution function (CDF).
 * Approximation accurate to ~1e-7 using Abramowitz and Stegun formula 26.2.17.
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal probability density function (PDF).
 */
function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate d1 and d2 from Black-Scholes formula.
 * @param {number} S - Current stock price
 * @param {number} K - Strike price
 * @param {number} T - Time to expiration in years
 * @param {number} r - Risk-free interest rate (decimal)
 * @param {number} sigma - Implied volatility (decimal)
 */
function calcD1D2(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { d1: 0, d2: 0 };
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * Calculate all five Greeks for a single option contract.
 *
 * @param {Object} params
 * @param {number} params.stockPrice      - Current underlying price (S)
 * @param {number} params.strike          - Option strike price (K)
 * @param {number} params.daysToExpiry    - Days until expiration
 * @param {number} params.riskFreeRate    - Annual risk-free rate (decimal, e.g. 0.045)
 * @param {number} params.impliedVolatility - IV (decimal, e.g. 0.28 for 28%)
 * @param {string} params.type            - "call" or "put"
 * @returns {Object} { delta, gamma, theta, vega, rho }
 */
function calculateGreeks({ stockPrice, strike, daysToExpiry, riskFreeRate, impliedVolatility, type = "call" }) {
  const S = stockPrice;
  const K = strike;
  const T = Math.max(daysToExpiry / 365, 0.0001); // Avoid division by zero
  const r = riskFreeRate;
  const sigma = impliedVolatility;

  // Guard against bad inputs
  if (!S || !K || !sigma || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const { d1, d2 } = calcD1D2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const isCall = type === "call";

  // ── Delta ──
  // Call: N(d1), Put: N(d1) - 1
  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;

  // ── Gamma ── (same for calls and puts)
  // N'(d1) / (S × σ × √T)
  const gamma = normalPDF(d1) / (S * sigma * sqrtT);

  // ── Theta ── (per day, negative for long options)
  // Call: -(S × N'(d1) × σ) / (2√T) - r × K × e^(-rT) × N(d2)
  // Put:  -(S × N'(d1) × σ) / (2√T) + r × K × e^(-rT) × N(-d2)
  const expNegRT = Math.exp(-r * T);
  const thetaCommon = -(S * normalPDF(d1) * sigma) / (2 * sqrtT);
  const theta = isCall
    ? (thetaCommon - r * K * expNegRT * normalCDF(d2)) / 365
    : (thetaCommon + r * K * expNegRT * normalCDF(-d2)) / 365;

  // ── Vega ── (per 1% change in IV, same for calls and puts)
  // S × √T × N'(d1) / 100
  const vega = (S * sqrtT * normalPDF(d1)) / 100;

  // ── Rho ── (per 1% change in rate)
  // Call: K × T × e^(-rT) × N(d2) / 100
  // Put:  -K × T × e^(-rT) × N(-d2) / 100
  const rho = isCall
    ? (K * T * expNegRT * normalCDF(d2)) / 100
    : -(K * T * expNegRT * normalCDF(-d2)) / 100;

  return {
    delta: round(delta, 4),
    gamma: round(gamma, 4),
    theta: round(theta, 4),
    vega: round(vega, 4),
    rho: round(rho, 4),
  };
}

/**
 * Enrich an options chain with calculated Greeks.
 * Mutates the chain contracts in place, adding delta/gamma/theta/vega/rho.
 *
 * @param {Object} chain - OptionsChain shape (see DATA_LAYER.md Section 2.2)
 * @param {number} riskFreeRate - Annual risk-free rate (decimal)
 * @returns {Object} The same chain object, now with Greeks on each contract
 */
function enrichChainWithGreeks(chain, riskFreeRate) {
  const S = chain.underlyingPrice;
  if (!S) return chain;

  for (const expDate of Object.keys(chain.chain)) {
    const expContracts = chain.chain[expDate];

    for (const contract of [...(expContracts.calls || []), ...(expContracts.puts || [])]) {
      if (!contract.impliedVolatility || contract.impliedVolatility <= 0) continue;

      const greeks = calculateGreeks({
        stockPrice: S,
        strike: contract.strike,
        daysToExpiry: contract.daysToExpiration,
        riskFreeRate,
        impliedVolatility: contract.impliedVolatility,
        type: contract.type,
      });

      Object.assign(contract, greeks);
    }
  }

  return chain;
}

function round(val, decimals) {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

module.exports = { calculateGreeks, enrichChainWithGreeks, normalCDF };
