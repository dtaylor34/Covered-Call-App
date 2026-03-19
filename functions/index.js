// ─── functions/index.js ──────────────────────────────────────────────────────
// Cloud Functions entry point.
// Exports all callable functions for the Covered Calls Manager.
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

// Initialize Firebase Admin (once)
admin.initializeApp();

// ── Providers & Engine ──
const { getQuote, getOptionsChain, getFullChain, getExpirations, getActiveProviderName } = require("./providers");
const { scoreCoveredCalls } = require("./engine/scoring");
const { getCached, setCache, getCachedOrStale, updateProviderStatus } = require("./cache/firestore");

// ── Cache TTLs (seconds) ──
const TTL = {
  quote: parseInt(process.env.CACHE_QUOTE_TTL || "60"),
  chain: parseInt(process.env.CACHE_CHAIN_TTL || "300"),
  scores: parseInt(process.env.CACHE_SCORE_TTL || "300"),
};

// ─── Helper: Require authenticated user ─────────────────────────────────────

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to access market data.");
  }
  return request.auth.uid;
}

function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== "string") {
    throw new HttpsError("invalid-argument", "Symbol is required.");
  }
  const clean = symbol.toUpperCase().trim();
  if (!/^[A-Z]{1,5}$/.test(clean)) {
    throw new HttpsError("invalid-argument", "Invalid ticker symbol.");
  }
  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALLABLE FUNCTIONS — Frontend calls these via Firebase SDK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * getStockQuote — Returns current stock price and basic info.
 *
 * Input:  { symbol: "AAPL" }
 * Output: StockQuote shape (see DATA_LAYER.md Section 2.1)
 */
exports.getStockQuote = onCall({ cors: true }, async (request) => {
  requireAuth(request);
  const symbol = validateSymbol(request.data.symbol);
  const cacheKey = `quotes_${symbol}`;

  // Check cache
  const cached = await getCached(cacheKey, TTL.quote);
  if (cached && !cached._stale) {
    return cached;
  }

  try {
    const quote = await getQuote(symbol);
    await setCache(cacheKey, quote);
    return quote;
  } catch (error) {
    // If provider failed but we have stale data, return it
    const stale = await getCachedOrStale(cacheKey, TTL.quote);
    if (stale) {
      return { ...stale, _stale: true, _error: "Provider temporarily unavailable" };
    }
    console.error(`getStockQuote error for ${symbol}:`, error);
    throw new HttpsError("unavailable", `Could not fetch quote for ${symbol}. Try again shortly.`);
  }
});

/**
 * getOptionsChain — Returns options chain with Greeks for a symbol.
 *
 * Input:  { symbol: "AAPL", expiration: "2026-03-20" }  (expiration optional)
 * Output: OptionsChain shape (see DATA_LAYER.md Section 2.2)
 */
exports.getOptionsChain = onCall({ cors: true }, async (request) => {
  requireAuth(request);
  const symbol = validateSymbol(request.data.symbol);
  const expiration = request.data.expiration || null;
  const cacheKey = `chains_${symbol}_${expiration || "nearest"}`;

  const cached = await getCached(cacheKey, TTL.chain);
  if (cached && !cached._stale) {
    return cached;
  }

  try {
    const chain = await getOptionsChain(symbol, expiration);
    await setCache(cacheKey, chain);
    return chain;
  } catch (error) {
    const stale = await getCachedOrStale(cacheKey, TTL.chain);
    if (stale) {
      return { ...stale, _stale: true, _error: "Provider temporarily unavailable" };
    }
    console.error(`getOptionsChain error for ${symbol}:`, error);
    throw new HttpsError("unavailable", `Could not fetch options for ${symbol}. Try again shortly.`);
  }
});

/**
 * getCoveredCalls — Returns scored covered call recommendations.
 *
 * Input:  { symbol: "AAPL" }
 * Output: CoveredCallScore shape (see DATA_LAYER.md Section 2.3)
 */
exports.getCoveredCalls = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const symbol = validateSymbol(request.data.symbol);
  const cacheKey = `scores_${symbol}`;

  // ── Market hours check (US Eastern) ──
  // NYSE/NASDAQ: Mon–Fri 9:30am–4:00pm ET
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nowET.getDay(); // 0=Sun, 6=Sat
  const hour = nowET.getHours();
  const minute = nowET.getMinutes();
  const totalMinutes = hour * 60 + minute;
  const isMarketHours = day >= 1 && day <= 5
    && totalMinutes >= 9 * 60 + 30   // 9:30am
    && totalMinutes < 16 * 60;        // 4:00pm

  const cached = await getCached(cacheKey, TTL.scores);
  const cachedHasResults = (cached?.recommendations?.length || 0) > 0;

  // During market hours: serve fresh cache if valid
  if (isMarketHours && cached && !cached._stale && cachedHasResults) {
    return cached;
  }

  // After hours: if we have a good cached result, serve it with asOfClose label
  // rather than re-fetching (Yahoo returns bid=0 after hours → 0 results)
  if (!isMarketHours && cachedHasResults) {
    return { ...cached, _stale: false, _asOfClose: true };
  }

  try {
    const chain = await getFullChain(symbol, 4);
    const scores = scoreCoveredCalls(chain);

    // Only cache if we got real results — don't cache empty after-hours responses
    if ((scores.recommendations?.length || 0) > 0) {
      await setCache(cacheKey, scores);
    }
    return scores;
  } catch (error) {
    // Fall back to any cached data we have, even if stale
    const stale = await getCachedOrStale(cacheKey, TTL.scores);
    if (stale) {
      return { ...stale, _stale: true, _asOfClose: !isMarketHours, _error: "Provider temporarily unavailable" };
    }
    console.error(`getCoveredCalls error for ${symbol}:`, error);
    throw new HttpsError("unavailable", `Could not score covered calls for ${symbol}. Try again shortly.`);
  }
});

/**
 * getExpirations — Returns available option expiration dates.
 *
 * Input:  { symbol: "AAPL" }
 * Output: { symbol, expirations: ["2026-03-06", ...] }
 */
exports.getExpirations = onCall({ cors: true }, async (request) => {
  requireAuth(request);
  const symbol = validateSymbol(request.data.symbol);
  const cacheKey = `expirations_${symbol}`;

  const cached = await getCached(cacheKey, TTL.chain);
  if (cached && !cached._stale) {
    return cached;
  }

  try {
    const expirations = await getExpirations(symbol);
    const result = { symbol, expirations, provider: getActiveProviderName(), fetchedAt: new Date().toISOString() };
    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`getExpirations error for ${symbol}:`, error);
    throw new HttpsError("unavailable", `Could not fetch expirations for ${symbol}.`);
  }
});

/**
 * getWatchlistData — Batch quote fetch for a user's watchlist.
 *
 * Input:  { symbols: ["AAPL", "MSFT", "GOOGL"] }
 * Output: { quotes: [StockQuote, StockQuote, ...] }
 */
exports.getWatchlistData = onCall({ cors: true, timeoutSeconds: 30 }, async (request) => {
  requireAuth(request);
  const symbols = request.data.symbols;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpsError("invalid-argument", "Provide an array of symbols.");
  }
  if (symbols.length > 20) {
    throw new HttpsError("invalid-argument", "Maximum 20 symbols per request.");
  }

  const quotes = [];
  for (const sym of symbols) {
    try {
      const symbol = validateSymbol(sym);
      const cacheKey = `quotes_${symbol}`;

      let quote = await getCached(cacheKey, TTL.quote);
      if (!quote || quote._stale) {
        quote = await getQuote(symbol);
        await setCache(cacheKey, quote);
      }
      quotes.push(quote);
    } catch (error) {
      // Don't fail the whole batch — just skip errored symbols
      console.warn(`Watchlist fetch failed for ${sym}:`, error.message);
      quotes.push({ symbol: sym, error: true, message: error.message });
    }
  }

  return { quotes, fetchedAt: new Date().toISOString() };
});

/**
 * getProviderStatus — Returns current data provider health for admin panel.
 *
 * Input:  {}
 * Output: { provider, status, lastCheck }
 */
exports.getProviderStatus = onCall({ cors: true }, async (request) => {
  requireAuth(request);

  try {
    const db = admin.firestore();
    const doc = await db.collection("marketData").doc("meta_providerStatus").get();
    if (doc.exists) {
      return doc.data();
    }
    return { provider: getActiveProviderName(), status: "unknown", message: "No health checks recorded yet" };
  } catch (error) {
    return { provider: getActiveProviderName(), status: "unknown", message: error.message };
  }
});

// ── Stripe (Payments) ──
const stripe = require("./stripe");
exports.createCheckoutSession = stripe.createCheckoutSession;
exports.createPortalSession   = stripe.createPortalSession;
exports.stripeWebhook         = stripe.stripeWebhook;

// ── Schwab API Integration (feature/api-integration) ─────────────────────────
// Phase 1: OAuth flow + account sync + market data proxy
const schwab = require("./schwab");
exports.schwabInitiateOAuth  = schwab.schwabInitiateOAuth;
exports.schwabExchangeToken  = schwab.schwabExchangeToken;
exports.schwabRefreshToken   = schwab.schwabRefreshToken;
exports.schwabGetPositions   = schwab.schwabGetPositions;
exports.schwabGetBuyingPower = schwab.schwabGetBuyingPower;
exports.schwabGetQuotes      = schwab.schwabGetQuotes;
exports.schwabGetOptionChain = schwab.schwabGetOptionChain;
