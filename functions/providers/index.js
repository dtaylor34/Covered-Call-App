// ─── functions/providers/index.js ────────────────────────────────────────────
// Provider Abstraction Layer
//
// Routes all market data requests to the active provider.
// Reads ACTIVE_PROVIDER from Firebase environment config.
// Handles Greek enrichment for providers that don't supply Greeks.
//
// GOLDEN RULE: All API endpoints import from this file, NEVER from
// individual provider files directly.
// ─────────────────────────────────────────────────────────────────────────────

const { enrichChainWithGreeks } = require("../engine/greeks");
const { getRiskFreeRate } = require("../engine/riskFreeRate");
const { updateProviderStatus } = require("../cache/firestore");

// ── Provider registry ──
const PROVIDERS = {
  yahoo: () => require("./yahoo"),
  polygon: () => require("./polygon"),
  tradier: () => require("./tradier"),
};

/**
 * Get the active provider module based on environment config.
 * Defaults to "yahoo" if not set.
 */
function getActiveProvider() {
  // Firebase Functions v2 uses process.env directly
  // Firebase Functions v1 uses functions.config()
  const providerName = process.env.ACTIVE_PROVIDER
    || process.env.MARKET_ACTIVE_PROVIDER
    || "yahoo";

  if (!PROVIDERS[providerName]) {
    console.error(`Unknown provider: ${providerName}, falling back to yahoo`);
    return PROVIDERS.yahoo();
  }

  return PROVIDERS[providerName]();
}

/**
 * Get the name of the active provider.
 */
function getActiveProviderName() {
  return process.env.ACTIVE_PROVIDER
    || process.env.MARKET_ACTIVE_PROVIDER
    || "yahoo";
}

// ─── Public API (used by functions/api/*.js) ────────────────────────────────

/**
 * Fetch a stock quote from the active provider.
 *
 * @param {string} symbol - Ticker symbol
 * @returns {Object} StockQuote shape
 */
async function getQuote(symbol) {
  const provider = getActiveProvider();
  try {
    const quote = await provider.fetchQuote(symbol);
    await updateProviderStatus(getActiveProviderName(), "ok");
    return quote;
  } catch (error) {
    await updateProviderStatus(getActiveProviderName(), "error", error.message);
    throw error;
  }
}

/**
 * Fetch options chain and enrich with Greeks if needed.
 *
 * @param {string} symbol - Ticker symbol
 * @param {string} [expiration] - Specific expiration date or null for nearest
 * @returns {Object} OptionsChain shape with Greeks populated
 */
async function getOptionsChain(symbol, expiration = null) {
  const provider = getActiveProvider();
  try {
    const chain = await provider.fetchOptionsChain(symbol, expiration);

    // If provider doesn't supply Greeks, calculate them
    if (!chain.hasGreeks) {
      const riskFreeRate = await getRiskFreeRate();
      enrichChainWithGreeks(chain, riskFreeRate);
    }

    // Remove internal flag before returning
    delete chain.hasGreeks;

    await updateProviderStatus(getActiveProviderName(), "ok");
    return chain;
  } catch (error) {
    await updateProviderStatus(getActiveProviderName(), "error", error.message);
    throw error;
  }
}

/**
 * Fetch multi-expiration chain (for scoring) and enrich with Greeks.
 *
 * @param {string} symbol - Ticker symbol
 * @param {number} [maxExpirations=4] - How many expirations to fetch
 * @returns {Object} OptionsChain shape with multiple expirations + Greeks
 */
async function getFullChain(symbol, maxExpirations = 4) {
  const provider = getActiveProvider();
  try {
    // Use multi-expiration fetch if available, otherwise fall back
    const fetchFn = provider.fetchMultiExpirationChain || provider.fetchOptionsChain;
    const chain = await fetchFn(symbol, maxExpirations);

    if (!chain.hasGreeks) {
      const riskFreeRate = await getRiskFreeRate();
      enrichChainWithGreeks(chain, riskFreeRate);
    }

    delete chain.hasGreeks;

    await updateProviderStatus(getActiveProviderName(), "ok");
    return chain;
  } catch (error) {
    await updateProviderStatus(getActiveProviderName(), "error", error.message);
    throw error;
  }
}

/**
 * Fetch available option expirations for a symbol.
 *
 * @param {string} symbol - Ticker symbol
 * @returns {string[]} Array of ISO date strings
 */
async function getExpirations(symbol) {
  const provider = getActiveProvider();
  return provider.fetchExpirations(symbol);
}

module.exports = {
  getQuote,
  getOptionsChain,
  getFullChain,
  getExpirations,
  getActiveProviderName,
};
