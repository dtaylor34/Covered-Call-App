// ─── functions/schwab.js ──────────────────────────────────────────────────────
// Cloud Functions for Schwab API integration.
// Branch: feature/api-integration
//
// All Schwab API calls are proxied through here — credentials never leave
// the server, and tokens are refreshed automatically before each call.
//
// Exports (add to functions/index.js):
//   exports.schwabInitiateOAuth  = schwab.schwabInitiateOAuth;
//   exports.schwabExchangeToken  = schwab.schwabExchangeToken;
//   exports.schwabRefreshToken   = schwab.schwabRefreshToken;
//   exports.schwabGetPositions   = schwab.schwabGetPositions;
//   exports.schwabGetBuyingPower = schwab.schwabGetBuyingPower;
//   exports.schwabGetQuotes      = schwab.schwabGetQuotes;
//   exports.schwabGetOptionChain = schwab.schwabGetOptionChain;
// ─────────────────────────────────────────────────────────────────────────────

const admin   = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// ── Schwab API base URLs ──────────────────────────────────────────────────────
const SCHWAB_AUTH_URL   = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL  = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_TRADER_URL = "https://api.schwabapi.com/trader/v1";
const SCHWAB_MARKET_URL = "https://api.schwabapi.com/marketdata/v1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth.uid;
}

function encodeCredentials(appKey, appSecret) {
  return Buffer.from(`${appKey}:${appSecret}`).toString("base64");
}

async function getConnection(uid) {
  const db  = admin.firestore();
  const ref = db.collection("users").doc(uid).collection("brokerConnections").doc("schwab");
  const doc = await ref.get();
  if (!doc.exists) {
    throw new HttpsError("not-found", "No Schwab connection found. Please connect your account first.");
  }
  return { ref, data: doc.data() };
}

// Refresh access token if it's within 2 minutes of expiry.
async function ensureFreshToken(uid, connRef, connData) {
  const { expiresAt, appKey, appSecret, refreshToken, refreshExpiresAt } = connData;

  // Refresh token itself has expired — user must re-authenticate
  if (refreshExpiresAt && Date.now() > refreshExpiresAt) {
    await connRef.update({ status: "expired" });
    throw new HttpsError("unauthenticated", "Schwab session expired. Please reconnect your account.");
  }

  // Access token is still valid
  if (expiresAt && Date.now() < expiresAt - 120_000) {
    return connData.accessToken;
  }

  // Refresh the access token
  const credentials = encodeCredentials(appKey, appSecret);
  const res = await fetch(SCHWAB_TOKEN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    await connRef.update({ status: "expired" });
    throw new HttpsError("unauthenticated", "Token refresh failed. Please reconnect your Schwab account.");
  }

  const tokens     = await res.json();
  const newExpiry  = Date.now() + tokens.expires_in * 1000;

  await connRef.update({
    accessToken: tokens.access_token,
    expiresAt:   newExpiry,
    status:      "connected",
    updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
  });

  return tokens.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OAuth Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabInitiateOAuth
 * Saves credentials and returns the Schwab OAuth URL.
 * Frontend opens this URL in a popup/new tab.
 */
exports.schwabInitiateOAuth = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { appKey, appSecret, redirectUri } = request.data;

  if (!appKey || !appSecret) {
    throw new HttpsError("invalid-argument", "App Key and App Secret are required.");
  }
  if (!redirectUri) {
    throw new HttpsError("invalid-argument", "Redirect URI is required.");
  }

  const db = admin.firestore();
  await db
    .collection("users").doc(uid)
    .collection("brokerConnections").doc("schwab")
    .set({
      broker:    "schwab",
      appKey,
      appSecret,
      status:    "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

  const authUrl = `${SCHWAB_AUTH_URL}?client_id=${encodeURIComponent(appKey)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return { authUrl };
});

/**
 * schwabExchangeToken
 * Exchanges the OAuth auth code for access + refresh tokens.
 * Also fetches and stores the user's linked account numbers.
 */
exports.schwabExchangeToken = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { code, redirectUri } = request.data;

  if (!code)        throw new HttpsError("invalid-argument", "Authorization code required.");
  if (!redirectUri) throw new HttpsError("invalid-argument", "Redirect URI required.");

  const { ref: connRef, data: connData } = await getConnection(uid);
  const credentials = encodeCredentials(connData.appKey, connData.appSecret);

  // Exchange code for tokens
  const tokenRes = await fetch(SCHWAB_TOKEN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("schwabExchangeToken — token exchange failed:", errText);
    throw new HttpsError("internal", "Token exchange failed. Check your App Key and Secret.");
  }

  const tokens = await tokenRes.json();
  const expiresAt        = Date.now() + tokens.expires_in * 1000;
  const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  await connRef.update({
    accessToken:     tokens.access_token,
    refreshToken:    tokens.refresh_token,
    tokenType:       tokens.token_type,
    expiresAt,
    refreshExpiresAt,
    status:          "connected",
    updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
  });

  // Fetch linked account numbers
  const accountsRes = await fetch(`${SCHWAB_TRADER_URL}/accounts/accountNumbers`, {
    headers: { "Authorization": `Bearer ${tokens.access_token}` },
  });

  let accountCount = 0;
  if (accountsRes.ok) {
    const accountsData = await accountsRes.json();
    const db    = admin.firestore();
    const batch = db.batch();
    let isFirst = true;

    for (const account of (accountsData || [])) {
      const accountRef = db
        .collection("users").doc(uid)
        .collection("brokerAccounts").doc(account.accountNumber);

      batch.set(accountRef, {
        broker:      "schwab",
        accountId:   account.accountNumber,
        hashValue:   account.hashValue,
        isDefault:   isFirst, // First account is default
        lastSynced:  admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      isFirst = false;
      accountCount++;
    }
    await batch.commit();
  }

  return { success: true, accountCount };
});

/**
 * schwabRefreshToken — manually triggered token refresh.
 * Normally called automatically by ensureFreshToken before each API call.
 */
exports.schwabRefreshToken = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { ref: connRef, data: connData } = await getConnection(uid);
  await ensureFreshToken(uid, connRef, connData);
  return { success: true };
});

// ═══════════════════════════════════════════════════════════════════════════════
// Account Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabGetPositions — returns positions for a linked account.
 * Input:  { accountHash }   — hashValue from brokerAccounts
 * Output: Schwab account object including positions array
 */
exports.schwabGetPositions = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { accountHash } = request.data;
  if (!accountHash) throw new HttpsError("invalid-argument", "accountHash required.");

  const { ref: connRef, data: connData } = await getConnection(uid);
  const accessToken = await ensureFreshToken(uid, connRef, connData);

  const res = await fetch(`${SCHWAB_TRADER_URL}/accounts/${accountHash}?fields=positions`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error("schwabGetPositions failed:", res.status, await res.text());
    throw new HttpsError("internal", "Failed to fetch positions from Schwab.");
  }

  return await res.json();
});

/**
 * schwabGetBuyingPower — returns available cash / buying power.
 * Input:  { accountHash }
 * Output: { buyingPower, cashBalance, accountType, accountId }
 */
exports.schwabGetBuyingPower = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { accountHash } = request.data;
  if (!accountHash) throw new HttpsError("invalid-argument", "accountHash required.");

  const { ref: connRef, data: connData } = await getConnection(uid);
  const accessToken = await ensureFreshToken(uid, connRef, connData);

  const res = await fetch(`${SCHWAB_TRADER_URL}/accounts/${accountHash}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new HttpsError("internal", "Failed to fetch account data from Schwab.");
  }

  const data = await res.json();
  const current = data?.securitiesAccount?.currentBalances || {};

  return {
    buyingPower:  current.buyingPower        || current.availableFunds || 0,
    cashBalance:  current.cashBalance        || 0,
    accountType:  data?.securitiesAccount?.type || "unknown",
    accountId:    data?.securitiesAccount?.accountNumber || accountHash,
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// Market Data Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabGetQuotes — real-time quotes for one or more symbols.
 * Input:  { symbols: ["AAPL", "MSFT"] }
 * Output: { quotes: [{ symbol, lastPrice, bidPrice, askPrice, ... }] }
 */
exports.schwabGetQuotes = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const { symbols } = request.data;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpsError("invalid-argument", "symbols array required.");
  }
  if (symbols.length > 50) {
    throw new HttpsError("invalid-argument", "Maximum 50 symbols per request.");
  }

  const { ref: connRef, data: connData } = await getConnection(uid);
  const accessToken = await ensureFreshToken(uid, connRef, connData);

  const symbolList = symbols.map((s) => s.toUpperCase().trim()).join(",");
  const res = await fetch(
    `${SCHWAB_MARKET_URL}/quotes?symbols=${encodeURIComponent(symbolList)}&fields=quote&indicative=false`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new HttpsError("internal", "Failed to fetch quotes from Schwab.");
  }

  const data = await res.json();

  // Normalize to a simple array
  const quotes = Object.entries(data || {}).map(([symbol, q]) => ({
    symbol,
    lastPrice:  q?.quote?.lastPrice  || q?.quote?.mark || 0,
    bidPrice:   q?.quote?.bidPrice   || 0,
    askPrice:   q?.quote?.askPrice   || 0,
    openPrice:  q?.quote?.openPrice  || 0,
    highPrice:  q?.quote?.highPrice  || 0,
    lowPrice:   q?.quote?.lowPrice   || 0,
    volume:     q?.quote?.totalVolume || 0,
    netChange:  q?.quote?.netChange  || 0,
    netChangePct: q?.quote?.netPercentChange || 0,
    fetchedAt:  new Date().toISOString(),
  }));

  return { quotes, fetchedAt: new Date().toISOString() };
});

/**
 * schwabGetOptionChain — option chain for a symbol.
 * Input:  { symbol, expiration? (YYYY-MM-DD), strikeCount? }
 * Output: Schwab option chain object
 */
exports.schwabGetOptionChain = onCall({ cors: true, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const { symbol, expiration, strikeCount = 10 } = request.data;

  if (!symbol) throw new HttpsError("invalid-argument", "symbol required.");

  const { ref: connRef, data: connData } = await getConnection(uid);
  const accessToken = await ensureFreshToken(uid, connRef, connData);

  const params = new URLSearchParams({
    symbol:            symbol.toUpperCase(),
    contractType:      "CALL",
    strikeCount:       String(strikeCount),
    includeQuotes:     "TRUE",
    strategy:          "SINGLE",
    optionType:        "S", // Standard options
  });

  if (expiration) {
    params.set("fromDate", expiration);
    params.set("toDate",   expiration);
  }

  const res = await fetch(
    `${SCHWAB_MARKET_URL}/chains?${params}`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new HttpsError("internal", `Failed to fetch option chain for ${symbol}.`);
  }

  return await res.json();
});
