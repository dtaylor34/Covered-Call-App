// ─── src/services/priceHistory.js ────────────────────────────────────────────
// Client wrapper for getPriceHistory (Schwab real-time when connected, else Yahoo).
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Returns { symbol, range, source, price, points:[{ t, c }] }.
export const getPriceHistory = (symbol, range) =>
  httpsCallable(getFunctions(getApp()), "getPriceHistory")({ symbol, range }).then((r) => r.data);
