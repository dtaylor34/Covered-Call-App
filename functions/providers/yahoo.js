// ─── functions/providers/yahoo.js ────────────────────────────────────────────
// Yahoo Finance provider using yahoo-finance2 v3 npm package.
// Phase 1 (free) — 15-minute delayed data, no API key required.
//
// Maps Yahoo's response format to the standardized shapes defined
// in docs/DATA_LAYER.md (StockQuote, OptionsChain).
//
// v3 API: requires `new YahooFinance()` constructor, supports CJS require.
// ─────────────────────────────────────────────────────────────────────────────

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Suppress yahoo-finance2's internal validation warnings for missing fields
const YF_OPTIONS = {
  validateResult: false,
};

/**
 * Fetch a stock quote and map to StockQuote shape.
 *
 * @param {string} symbol - Ticker symbol (e.g. "AAPL")
 * @returns {Object} StockQuote shape
 */
async function fetchQuote(symbol) {
  const result = await yahooFinance.quote(symbol.toUpperCase(), {}, YF_OPTIONS);

  return {
    symbol: result.symbol,
    price: result.regularMarketPrice || 0,
    change: result.regularMarketChange || 0,
    changePercent: result.regularMarketChangePercent || 0,
    open: result.regularMarketOpen || 0,
    high: result.regularMarketDayHigh || 0,
    low: result.regularMarketDayLow || 0,
    previousClose: result.regularMarketPreviousClose || 0,
    volume: result.regularMarketVolume || 0,
    marketCap: result.marketCap || 0,
    fiftyTwoWeekHigh: result.fiftyTwoWeekHigh || 0,
    fiftyTwoWeekLow: result.fiftyTwoWeekLow || 0,
    dividendYield: result.dividendYield ? result.dividendYield / 100 : 0,
    earningsDate: result.earningsTimestamp
      ? new Date(result.earningsTimestamp * 1000).toISOString().split("T")[0]
      : null,
    shortName: result.shortName || result.longName || symbol,
    delay: 15,
    provider: "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch all available option expirations for a symbol.
 *
 * @param {string} symbol - Ticker symbol
 * @returns {string[]} Array of ISO date strings
 */
async function fetchExpirations(symbol) {
  const result = await yahooFinance.options(symbol.toUpperCase(), {}, YF_OPTIONS);

  if (!result.expirationDates || result.expirationDates.length === 0) {
    return [];
  }

  return result.expirationDates.map((d) => {
    // yahoo-finance2 returns Date objects
    if (d instanceof Date) return d.toISOString().split("T")[0];
    if (typeof d === "number") return new Date(d * 1000).toISOString().split("T")[0];
    return String(d);
  });
}

/**
 * Fetch options chain for a symbol (optionally for a specific expiration).
 * If no expiration given, fetches the nearest expiration.
 *
 * @param {string} symbol - Ticker symbol
 * @param {string} [expiration] - ISO date string (e.g. "2026-03-20") or null for nearest
 * @returns {Object} OptionsChain shape (without Greeks — provider index adds those)
 */
async function fetchOptionsChain(symbol, expiration = null) {
  const sym = symbol.toUpperCase();

  // First get all expirations
  const allExpirations = await fetchExpirations(sym);

  if (allExpirations.length === 0) {
    throw new Error(`No options available for ${sym}`);
  }

  // If specific expiration requested, use it; otherwise fetch nearest
  const targetExpiration = expiration || allExpirations[0];

  // Fetch the chain for this expiration
  const queryOpts = { date: new Date(targetExpiration) };
  const result = await yahooFinance.options(sym, queryOpts, YF_OPTIONS);

  // Get underlying price from the options response
  const underlyingPrice = result.quote?.regularMarketPrice
    || result.underlyingSymbol?.regularMarketPrice
    || 0;

  // Map calls
  const calls = (result.options?.[0]?.calls || []).map((c) =>
    mapContract(c, sym, targetExpiration, "call")
  );

  // Map puts
  const puts = (result.options?.[0]?.puts || []).map((p) =>
    mapContract(p, sym, targetExpiration, "put")
  );

  return {
    symbol: sym,
    underlyingPrice,
    expirations: allExpirations,
    chain: {
      [targetExpiration]: { calls, puts },
    },
    hasGreeks: false, // Yahoo doesn't provide Greeks — engine will calculate
    delay: 15,
    provider: "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch options chain for MULTIPLE expirations (for scoring across dates).
 *
 * @param {string} symbol
 * @param {number} [maxExpirations=4] - How many expirations to fetch
 * @returns {Object} OptionsChain shape with multiple expirations populated
 */
async function fetchMultiExpirationChain(symbol, maxExpirations = 4) {
  const sym = symbol.toUpperCase();
  const allExpirations = await fetchExpirations(sym);

  if (allExpirations.length === 0) {
    throw new Error(`No options available for ${sym}`);
  }

  // Filter to expirations within scoring range (7–60 days)
  const now = new Date();
  const relevantExpirations = allExpirations.filter((exp) => {
    const dte = Math.round((new Date(exp) - now) / (1000 * 60 * 60 * 24));
    return dte >= 7 && dte <= 60;
  }).slice(0, maxExpirations);

  // If no expirations in range, take the nearest ones
  const expsToFetch = relevantExpirations.length > 0
    ? relevantExpirations
    : allExpirations.slice(0, Math.min(maxExpirations, allExpirations.length));

  let underlyingPrice = 0;
  const chainData = {};

  // Fetch each expiration (sequential to be gentle on Yahoo's rate limits)
  for (const exp of expsToFetch) {
    try {
      const queryOpts = { date: new Date(exp) };
      const result = await yahooFinance.options(sym, queryOpts, YF_OPTIONS);

      if (!underlyingPrice) {
        underlyingPrice = result.quote?.regularMarketPrice || 0;
      }

      const calls = (result.options?.[0]?.calls || []).map((c) =>
        mapContract(c, sym, exp, "call")
      );
      const puts = (result.options?.[0]?.puts || []).map((p) =>
        mapContract(p, sym, exp, "put")
      );

      chainData[exp] = { calls, puts };

      // Small delay between requests to avoid rate limiting
      await sleep(200);
    } catch (err) {
      console.warn(`Failed to fetch ${sym} chain for ${exp}:`, err.message);
      // Continue with other expirations
    }
  }

  return {
    symbol: sym,
    underlyingPrice,
    expirations: allExpirations,
    chain: chainData,
    hasGreeks: false,
    delay: 15,
    provider: "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a single Yahoo option contract to our standard shape.
 */
function mapContract(raw, symbol, expiration, type) {
  const now = new Date();
  const expDate = new Date(expiration);
  const daysToExpiration = Math.max(0, Math.round((expDate - now) / (1000 * 60 * 60 * 24)));

  return {
    contractSymbol: raw.contractSymbol || `${symbol}_${expiration}_${type}_${raw.strike}`,
    strike: raw.strike || 0,
    expiration,
    type,
    lastPrice: raw.lastPrice || 0,
    bid: raw.bid || 0,
    ask: raw.ask || 0,
    volume: raw.volume || 0,
    openInterest: raw.openInterest || 0,
    impliedVolatility: raw.impliedVolatility || 0, // Yahoo provides this as decimal (e.g. 0.28)
    inTheMoney: raw.inTheMoney || false,
    daysToExpiration,
    // Greeks will be added by engine/greeks.js via provider index
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    rho: null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  fetchQuote,
  fetchExpirations,
  fetchOptionsChain,
  fetchMultiExpirationChain,
};
