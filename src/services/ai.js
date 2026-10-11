// ─── src/services/ai.js ──────────────────────────────────────────────────────
// Client wrapper for AI-backed features (Anthropic via a Cloud Function).
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Exit-timing advice for a treasury call/put straddle back-test.
// payload: { instrument, strike, callPrem, putPrem, contracts, multiplier,
//            callBE, putBE, path:[{ d, c }] }  → { advice, model }
export const optionsExitAdvice = (payload) =>
  httpsCallable(getFunctions(getApp()), "optionsExitAdvice", { timeout: 70000 })(payload).then((r) => r.data);
