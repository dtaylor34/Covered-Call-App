// ─── src/hooks/useMarketData.js ──────────────────────────────────────────────
// React hooks for consuming the market data Cloud Functions.
// All data flows through these hooks — components never call functions directly.
//
// Each hook manages its own loading/error state and auto-refreshes on interval.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { AnalyticsEvents } from "../services/analytics";
import { useBrokerConnection } from "./useBrokerConnection";
import { schwabGetOptionChain } from "../services/schwabApi";

// ── Cloud Function references ──
const fnGetQuote = httpsCallable(functions, "getStockQuote");
const fnGetOptionsChain = httpsCallable(functions, "getOptionsChain");
const fnGetCoveredCalls = httpsCallable(functions, "getCoveredCalls");
const fnGetWatchlistData = httpsCallable(functions, "getWatchlistData");
const fnGetExpirations = httpsCallable(functions, "getExpirations");
const fnGetProviderStatus = httpsCallable(functions, "getProviderStatus");

// ─── useStockQuote ──────────────────────────────────────────────────────────

/**
 * Fetch a stock quote with auto-refresh.
 *
 * @param {string} symbol - Ticker symbol (null to skip)
 * @param {number} [refreshInterval=60000] - Auto-refresh ms (0 to disable)
 * @returns {{ quote, loading, error, refresh }}
 */
export function useStockQuote(symbol, refreshInterval = 60000) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fnGetQuote({ symbol });
      setQuote(result.data);
    } catch (err) {
      setError(err.message || "Failed to fetch quote");
      AnalyticsEvents.apiError("getStockQuote", err.code, err.message);
      console.error("useStockQuote error:", err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetch();
    if (refreshInterval > 0 && symbol) {
      intervalRef.current = setInterval(fetch, refreshInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [fetch, refreshInterval, symbol]);

  return { quote, loading, error, refresh: fetch };
}

// ─── useOptionsChain ────────────────────────────────────────────────────────

/**
 * Normalize Schwab's raw /chains response into the same shape the Yahoo path
 * returns — { underlyingPrice, chain: { "YYYY-MM-DD": { calls:[], puts:[] } } } —
 * so consumers (OptionChain, etc.) don't care which source the data came from.
 * Schwab maps are keyed "YYYY-MM-DD:dte"; each strike → [leg]. Schwab reports
 * IV as a percent, so we divide by 100 to match Yahoo's decimal.
 */
export function normalizeSchwabChain(raw) {
  const out = { underlyingPrice: raw?.underlyingPrice || 0, chain: {} };
  const leg = (l, kStr) => ({
    strike: l?.strikePrice ?? parseFloat(kStr),
    lastPrice: l?.last || l?.mark || 0,
    bid: l?.bid || 0,
    ask: l?.ask || 0,
    impliedVolatility: (l?.volatility || 0) / 100,
    delta: l?.delta ?? null,
    openInterest: l?.openInterest || 0,
    volume: l?.totalVolume || 0,
  });
  const add = (map, side) => {
    for (const expKey of Object.keys(map || {})) {
      const date = expKey.split(":")[0];
      const bucket = (out.chain[date] ||= { calls: [], puts: [] });
      const strikes = map[expKey] || {};
      for (const kStr of Object.keys(strikes)) {
        const l = (strikes[kStr] || [])[0];
        if (l) bucket[side].push(leg(l, kStr));
      }
    }
  };
  add(raw?.callExpDateMap, "calls");
  add(raw?.putExpDateMap, "puts");
  for (const d of Object.keys(out.chain)) {
    out.chain[d].calls.sort((a, b) => a.strike - b.strike);
    out.chain[d].puts.sort((a, b) => a.strike - b.strike);
  }
  return out;
}

/**
 * Fetch an options chain for a symbol and expiration. When the user has a live
 * Schwab connection, pull real-time bid/ask from Schwab (works after hours too);
 * otherwise — or if Schwab returns nothing — fall back to Yahoo (15-min delayed).
 *
 * @param {string} symbol - Ticker symbol (null to skip)
 * @param {string} [expiration] - ISO date string or null for nearest
 * @returns {{ chain, loading, error, refresh, source }}
 */
export function useOptionsChain(symbol, expiration = null) {
  const { activeConnection } = useBrokerConnection();
  const schwabOn = activeConnection?.status === "connected";
  const [chain, setChain] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);

    // Schwab first (real-time, returns bid/ask even after the close).
    if (schwabOn) {
      try {
        const res = await schwabGetOptionChain({ symbol, expiration, strikeCount: 50 });
        const norm = normalizeSchwabChain(res?.data);
        if (Object.keys(norm.chain).length) {
          setChain(norm);
          setSource("schwab");
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Schwab chain failed, falling back to Yahoo:", err?.message);
      }
    }

    // Yahoo fallback (always available, 15-min delayed).
    try {
      const result = await fnGetOptionsChain({ symbol, expiration });
      setChain(result.data);
      setSource("yahoo");
    } catch (err) {
      setError(err.message || "Failed to fetch options chain");
      AnalyticsEvents.apiError("getOptionsChain", err.code, err.message);
      console.error("useOptionsChain error:", err);
    } finally {
      setLoading(false);
    }
  }, [symbol, expiration, schwabOn]);

  useEffect(() => { fetch(); }, [fetch]);

  return { chain, loading, error, refresh: fetch, source };
}

// ─── useCoveredCalls ────────────────────────────────────────────────────────

/**
 * Fetch scored covered call recommendations.
 *
 * @param {string} symbol - Ticker symbol (null to skip)
 * @returns {{ scores, loading, error, refresh }}
 */
export function useCoveredCalls(symbol) {
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fnGetCoveredCalls({ symbol });
      setScores(result.data);
    } catch (err) {
      setError(err.message || "Failed to score covered calls");
      AnalyticsEvents.apiError("getCoveredCalls", err.code, err.message);
      console.error("useCoveredCalls error:", err);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetch(); }, [fetch]);

  return { scores, loading, error, refresh: fetch };
}

// ─── useWatchlist ───────────────────────────────────────────────────────────

/**
 * Fetch batch quotes for a watchlist of symbols.
 *
 * @param {string[]} symbols - Array of ticker symbols
 * @param {number} [refreshInterval=60000] - Auto-refresh ms
 * @returns {{ quotes, loading, error, refresh }}
 */
export function useWatchlist(symbols, refreshInterval = 60000) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!symbols || symbols.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fnGetWatchlistData({ symbols });
      setQuotes(result.data.quotes || []);
    } catch (err) {
      setError(err.message || "Failed to fetch watchlist");
      AnalyticsEvents.apiError("getWatchlistData", err.code, err.message);
      console.error("useWatchlist error:", err);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(symbols)]);

  useEffect(() => {
    fetch();
    if (refreshInterval > 0 && symbols?.length > 0) {
      intervalRef.current = setInterval(fetch, refreshInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [fetch, refreshInterval]);

  return { quotes, loading, error, refresh: fetch };
}

// ─── useExpirations ─────────────────────────────────────────────────────────

/**
 * Fetch available option expirations for a symbol.
 *
 * @param {string} symbol - Ticker symbol (null to skip)
 * @returns {{ expirations, loading, error }}
 */
export function useExpirations(symbol) {
  const [expirations, setExpirations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    fnGetExpirations({ symbol })
      .then((result) => setExpirations(result.data.expirations || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  return { expirations, loading, error };
}

// ─── useProviderStatus ──────────────────────────────────────────────────────

/**
 * Get current data provider health status (for admin panel).
 *
 * @returns {{ status, loading }}
 */
export function useProviderStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fnGetProviderStatus({})
      .then((result) => setStatus(result.data))
      .catch(() => setStatus({ provider: "unknown", status: "error" }))
      .finally(() => setLoading(false));
  }, []);

  return { status, loading };
}
