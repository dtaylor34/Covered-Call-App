// ─── src/services/schwabApi.js ────────────────────────────────────────────────
// Thin wrappers around Firebase Cloud Functions for Schwab API operations.
// Branch: feature/api-integration
//
// All Schwab API calls go through Cloud Functions — never directly from the
// browser. This keeps credentials server-side and handles token refresh.
// ─────────────────────────────────────────────────────────────────────────────

import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── Call helper ───────────────────────────────────────────────────────────────
// Resolve Functions at call time via getApp() so this module never reads
// firebase.js exports while that module is still evaluating (Vite chunk order
// can otherwise throw: No Firebase App '[DEFAULT]' has been created).

function call(name) {
  return (data) => httpsCallable(getFunctions(getApp()), name)(data);
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

/**
 * Generates the Schwab OAuth URL and saves credentials to Firestore.
 * Input:  { appKey, appSecret, redirectUri }
 * Output: { authUrl }
 */
export const schwabInitiateOAuth  = (data) => call("schwabInitiateOAuth")(data);

/**
 * Exchanges an auth code for access + refresh tokens.
 * Called after the user completes OAuth in the Schwab window.
 * Input:  { code, redirectUri }
 * Output: { success, accountCount }
 */
export const schwabExchangeToken  = (data) => call("schwabExchangeToken")(data);

/**
 * Manually triggers a token refresh.
 * Normally handled automatically by the Cloud Function before each API call.
 * Input:  {}
 * Output: { success }
 */
export const schwabRefreshToken   = (data) => call("schwabRefreshToken")(data);

// ── Account data ──────────────────────────────────────────────────────────────

/**
 * Returns positions for a linked account.
 * Input:  { accountHash }   — hashValue field from brokerAccounts
 * Output: Schwab account object with positions array
 */
export const schwabGetPositions   = (data) => call("schwabGetPositions")(data);

/**
 * Returns buying power / cash available for a linked account.
 * Input:  { accountHash }
 * Output: { buyingPower, cashBalance, accountType, accountId }
 */
export const schwabGetBuyingPower = (data) => call("schwabGetBuyingPower")(data);

// ── Market data ───────────────────────────────────────────────────────────────

/**
 * Returns a real-time quote for one or more symbols.
 * Input:  { symbols: ["AAPL", "MSFT"] }
 * Output: { quotes: [{ symbol, price, bid, ask, ... }] }
 */
export const schwabGetQuotes      = (data) => call("schwabGetQuotes")(data);

/**
 * Returns the option chain for a symbol and expiration.
 * Input:  { symbol, expiration? }
 * Output: Schwab option chain object
 */
export const schwabGetOptionChain = (data) => call("schwabGetOptionChain")(data);

// ── Helper: handle OAuth callback ─────────────────────────────────────────────
// Call this on the /api/schwab/callback route after the OAuth redirect.
// Extracts the code from the URL and exchanges it for tokens.

export async function handleSchwabCallback() {
  const params      = new URLSearchParams(window.location.search);
  const code        = params.get("code");
  const redirectUri = `${window.location.origin}/api/schwab/callback`;

  if (!code) throw new Error("No authorization code in callback URL.");

  const result = await schwabExchangeToken({ code, redirectUri });
  return result.data;
}
