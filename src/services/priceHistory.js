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
