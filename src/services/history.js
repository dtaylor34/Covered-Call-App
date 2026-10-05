// ─── src/services/history.js ──────────────────────────────────────────────────
// Client wrapper for the historical-data Cloud Functions.
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Manually run a collection pass now (owner/admin only). Returns { collected, results }.
export const collectHistoryNow = (data) =>
  httpsCallable(getFunctions(getApp()), "collectHistoryNow")(data || {}).then((r) => r.data);

// Backfill real historical daily OHLC (owner/admin). Long-running — bump the
// callable timeout well past the 70s default. Returns { years, count, results }.
export const backfillHistory = (data) =>
  httpsCallable(getFunctions(getApp()), "backfillHistory", { timeout: 540000 })(data || {}).then((r) => r.data);
