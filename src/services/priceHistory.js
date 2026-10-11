// ─── src/services/priceHistory.js ────────────────────────────────────────────
// Client wrapper for getPriceHistory (Schwab real-time when connected, else Yahoo).
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Returns { symbol, range, source, price, points:[{ t, c }] }.
export const getPriceHistory = (symbol, range) =>
  httpsCallable(getFunctions(getApp()), "getPriceHistory")({ symbol, range }).then((r) => r.data);

// Most recent regular-hours session minute-by-minute + prior session close.
// Returns { symbol, session, prevClose, last, minutes:[{ m, t, c }] }.
export const getIntradayCompare = (symbol) =>
  httpsCallable(getFunctions(getApp()), "getIntradayCompare")({ symbol }).then((r) => r.data);

// Minute-N pattern over recent days. Returns { symbol, minute, days,
// trend:[{ date, captured, capturedMin, eod, priorClose, signal }] }.
export const getMinuteTrend = (symbol, minute, days) =>
  httpsCallable(getFunctions(getApp()), "getMinuteTrend")({ symbol, minute, days }).then((r) => r.data);

// Regular-hours bars for one past session (on-demand day detail). interval is
// one of "1m" | "5m" | "30m" | "1h". Returns { symbol, date, interval, minutes:[{ m, t, c }] }.
export const getIntradayDay = (symbol, date, interval = "5m") =>
  httpsCallable(getFunctions(getApp()), "getIntradayDay")({ symbol, date, interval }).then((r) => r.data);

// Every session's intraday path for the Stacked View (one call). Returns
// { symbol, minute, days, interval, sessions:[{ date, priorClose, captured, signal, minutes:[{m,c}] }] }.
export const getIntradayRange = (symbol, minute, days) =>
  httpsCallable(getFunctions(getApp()), "getIntradayRange")({ symbol, minute, days }).then((r) => r.data);
