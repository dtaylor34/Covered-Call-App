// ─── src/services/bestReturns.js ─────────────────────────────────────────────
// Client wrapper for the getBestReturns Cloud Function. Scores the live option
// chain for three covered-call strategies (see best-returns-spec.md).
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// Returns { symbol, price, contracts, bestReturn, noSale, sale }.
// Each strategy is null when no strike in that band qualifies.
export const getBestReturns = (symbol, contracts) =>
  httpsCallable(getFunctions(getApp()), "getBestReturns")({ symbol, contracts }).then((r) => r.data);
