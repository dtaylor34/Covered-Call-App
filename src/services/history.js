// ─── src/services/history.js ──────────────────────────────────────────────────
// Client wrapper for the historical-data Cloud Functions.
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Manually run a collection pass now (owner/admin only). Returns { collected, results }.
export const collectHistoryNow = (data) =>
  httpsCallable(getFunctions(getApp()), "collectHistoryNow")(data || {}).then((r) => r.data);
