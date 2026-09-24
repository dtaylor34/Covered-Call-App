// ─── functions/schwab.js ──────────────────────────────────────────────────────
// Cloud Functions for Schwab API integration.
//
// SECURITY MODEL (see docs/BROKER_CONNECTIONS.md — read before editing):
//   • The browser NEVER writes or reads Schwab credentials. It only calls these
//     callables over HTTPS. All Firestore writes here use the Admin SDK.
//   • Secrets (appKey, appSecret, accessToken, refreshToken) are AES-256-GCM
//     encrypted (functions/crypto.js) and stored in a PRIVATE document:
//        users/{uid}/private/schwabSecret        ← rules: read/write = false
//     The encryption key (SCHWAB_ENC_KEY) is a Secret Manager secret bound only
//     to these functions, so raw Firestore/console access reveals ciphertext only.
//   • The client-readable status doc holds NON-SENSITIVE fields only:
//        users/{uid}/brokerConnections/schwab    ← rules: read=owner, write=false
//        { broker, status, appKeyLast4, accountCount, connectedAt, updatedAt }
// ─────────────────────────────────────────────────────────────────────────────

const admin   = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore"); // modular: works in emulator + cloud
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { encrypt, decrypt } = require("./crypto");

// Secret Manager binding — makes process.env.SCHWAB_ENC_KEY available at runtime
// only to the functions that declare it in their options.
const SCHWAB_ENC_KEY = defineSecret("SCHWAB_ENC_KEY");

// Options for functions that must encrypt/decrypt credentials.
const CRYPTO_OPTS = { cors: true, secrets: [SCHWAB_ENC_KEY] };

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

// Private, client-unreadable doc holding the encrypted secret bundle.
function secretRef(uid) {
  return admin.firestore()
    .collection("users").doc(uid)
    .collection("private").doc("schwabSecret");
}

// Client-readable doc holding non-sensitive connection status only.
function statusRef(uid) {
  return admin.firestore()
    .collection("users").doc(uid)
    .collection("brokerConnections").doc("schwab");
}

// Write non-sensitive status for the client to observe. Never put secrets here.
async function writeStatus(uid, fields) {
  await statusRef(uid).set({
    broker:    "schwab",
    updatedAt: FieldValue.serverTimestamp(),
    ...fields,
  }, { merge: true });
}

// Read + decrypt the private secret bundle. Throws if the user isn't connected.
async function getSecret(uid) {
  const doc = await secretRef(uid).get();
  if (!doc.exists) {
    throw new HttpsError("not-found", "No Schwab connection found. Please connect your account first.");
  }
  const d = doc.data();
  return {
    appKey:           decrypt(d.appKey),
    appSecret:        decrypt(d.appSecret),
    accessToken:      d.accessToken  ? decrypt(d.accessToken)  : null,
    refreshToken:     d.refreshToken ? decrypt(d.refreshToken) : null,
    expiresAt:        d.expiresAt        || null,
    refreshExpiresAt: d.refreshExpiresAt || null,
  };
}

// Refresh the access token if it's missing or within 2 minutes of expiry.
// Mutates the private doc (encrypted) and returns a valid access token.
async function ensureFreshToken(uid, secret) {
  const { expiresAt, appKey, appSecret, refreshToken, refreshExpiresAt } = secret;

  // Refresh token itself has expired — user must re-authenticate.
  if (refreshExpiresAt && Date.now() > refreshExpiresAt) {
    await writeStatus(uid, { status: "expired" });
    throw new HttpsError("unauthenticated", "Schwab session expired. Please reconnect your account.");
  }

  // Access token is still valid.
  if (secret.accessToken && expiresAt && Date.now() < expiresAt - 120_000) {
    return secret.accessToken;
  }

  // Refresh the access token.
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
    await writeStatus(uid, { status: "expired" });
    throw new HttpsError("unauthenticated", "Token refresh failed. Please reconnect your Schwab account.");
  }

  const tokens    = await res.json();
  const newExpiry = Date.now() + tokens.expires_in * 1000;

  await secretRef(uid).set({
    accessToken: encrypt(tokens.access_token),
    expiresAt:   newExpiry,
    updatedAt:   FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeStatus(uid, { status: "connected" });

  return tokens.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OAuth Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabInitiateOAuth
 * Encrypts + stores the user's credentials (server-side only) and returns the
 * Schwab OAuth URL. The frontend opens this URL to begin authorization.
 */
exports.schwabInitiateOAuth = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { appKey, appSecret, redirectUri } = request.data;

  if (!appKey || !appSecret) {
    throw new HttpsError("invalid-argument", "App Key and App Secret are required.");
  }
  if (!redirectUri) {
    throw new HttpsError("invalid-argument", "Redirect URI is required.");
  }

  // Encrypted secrets → private, client-unreadable doc.
  await secretRef(uid).set({
    appKey:    encrypt(appKey),
    appSecret: encrypt(appSecret),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Non-sensitive status → client-readable doc (last 4 of the app key only).
  await writeStatus(uid, {
    status:      "pending",
    appKeyLast4: String(appKey).slice(-4),
    createdAt:   FieldValue.serverTimestamp(),
  });

  const authUrl = `${SCHWAB_AUTH_URL}?client_id=${encodeURIComponent(appKey)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return { authUrl };
});

/**
 * schwabExchangeToken
 * Exchanges the OAuth auth code for access + refresh tokens (encrypted at rest),
 * then fetches and stores the user's linked account numbers.
 */
exports.schwabExchangeToken = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { code, redirectUri } = request.data;

  if (!code)        throw new HttpsError("invalid-argument", "Authorization code required.");
  if (!redirectUri) throw new HttpsError("invalid-argument", "Redirect URI required.");

  const secret = await getSecret(uid);
  const credentials = encodeCredentials(secret.appKey, secret.appSecret);

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
    // Never log the response body — it can echo credentials.
    console.error("schwabExchangeToken — token exchange failed with status", tokenRes.status);
    throw new HttpsError("internal", "Token exchange failed. Check your App Key and Secret.");
  }

  const tokens           = await tokenRes.json();
  const expiresAt        = Date.now() + tokens.expires_in * 1000;
  const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  await secretRef(uid).set({
    accessToken:      encrypt(tokens.access_token),
    refreshToken:     encrypt(tokens.refresh_token),
    tokenType:        tokens.token_type,
    expiresAt,
    refreshExpiresAt,
    updatedAt:        FieldValue.serverTimestamp(),
  }, { merge: true });

  // Fetch linked account numbers (non-sensitive identifiers).
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
        broker:     "schwab",
        accountId:  account.accountNumber,
        hashValue:  account.hashValue,
        isDefault:  isFirst,
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });

      isFirst = false;
      accountCount++;
    }
    await batch.commit();
  }

  await writeStatus(uid, {
    status:      "connected",
    accountCount,
    connectedAt: FieldValue.serverTimestamp(),
  });

  return { success: true, accountCount };
});

/**
 * schwabRefreshToken — manually triggered token refresh.
 * Normally handled automatically by ensureFreshToken before each API call.
 */
exports.schwabRefreshToken = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const secret = await getSecret(uid);
  await ensureFreshToken(uid, secret);
  return { success: true };
});

/**
 * schwabDisconnect — removes ALL stored credentials, tokens, status, and linked
 * accounts for the caller. The encrypted private doc can only be deleted here
 * (clients have no write access to it).
 */
exports.schwabDisconnect = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const db  = admin.firestore();

  await secretRef(uid).delete().catch(() => {});
  await statusRef(uid).delete().catch(() => {});

  const accs  = await db.collection("users").doc(uid)
    .collection("brokerAccounts").where("broker", "==", "schwab").get();
  const batch = db.batch();
  accs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  return { success: true };
});

// ═══════════════════════════════════════════════════════════════════════════════
// Account Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabGetPositions — returns positions for a linked account.
 * Input:  { accountHash }   — hashValue from brokerAccounts
 */
exports.schwabGetPositions = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { accountHash } = request.data;
  if (!accountHash) throw new HttpsError("invalid-argument", "accountHash required.");

  const secret = await getSecret(uid);
  const accessToken = await ensureFreshToken(uid, secret);

  const res = await fetch(`${SCHWAB_TRADER_URL}/accounts/${accountHash}?fields=positions`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error("schwabGetPositions failed with status", res.status);
    throw new HttpsError("internal", "Failed to fetch positions from Schwab.");
  }

  return await res.json();
});

/**
 * schwabGetBuyingPower — returns available cash / buying power.
 * Input:  { accountHash }
 */
exports.schwabGetBuyingPower = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { accountHash } = request.data;
  if (!accountHash) throw new HttpsError("invalid-argument", "accountHash required.");

  const secret = await getSecret(uid);
  const accessToken = await ensureFreshToken(uid, secret);

  const res = await fetch(`${SCHWAB_TRADER_URL}/accounts/${accountHash}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new HttpsError("internal", "Failed to fetch account data from Schwab.");
  }

  const data = await res.json();
  const current = data?.securitiesAccount?.currentBalances || {};

  return {
    buyingPower: current.buyingPower || current.availableFunds || 0,
    cashBalance: current.cashBalance || 0,
    accountType: data?.securitiesAccount?.type || "unknown",
    accountId:   data?.securitiesAccount?.accountNumber || accountHash,
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// Market Data Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * schwabGetQuotes — real-time quotes for one or more symbols.
 * Input:  { symbols: ["AAPL", "MSFT"] }
 */
exports.schwabGetQuotes = onCall(CRYPTO_OPTS, async (request) => {
  const uid = requireAuth(request);
  const { symbols } = request.data;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpsError("invalid-argument", "symbols array required.");
  }
  if (symbols.length > 50) {
    throw new HttpsError("invalid-argument", "Maximum 50 symbols per request.");
  }

  const secret = await getSecret(uid);
  const accessToken = await ensureFreshToken(uid, secret);

  const symbolList = symbols.map((s) => s.toUpperCase().trim()).join(",");
  const res = await fetch(
    `${SCHWAB_MARKET_URL}/quotes?symbols=${encodeURIComponent(symbolList)}&fields=quote&indicative=false`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new HttpsError("internal", "Failed to fetch quotes from Schwab.");
  }

  const data = await res.json();

  const quotes = Object.entries(data || {}).map(([symbol, q]) => ({
    symbol,
    lastPrice:    q?.quote?.lastPrice  || q?.quote?.mark || 0,
    bidPrice:     q?.quote?.bidPrice   || 0,
    askPrice:     q?.quote?.askPrice   || 0,
    openPrice:    q?.quote?.openPrice  || 0,
    highPrice:    q?.quote?.highPrice  || 0,
    lowPrice:     q?.quote?.lowPrice   || 0,
    volume:       q?.quote?.totalVolume || 0,
    netChange:    q?.quote?.netChange  || 0,
    netChangePct: q?.quote?.netPercentChange || 0,
    fetchedAt:    new Date().toISOString(),
  }));

  return { quotes, fetchedAt: new Date().toISOString() };
});

/**
 * schwabGetOptionChain — option chain for a symbol.
 * Input:  { symbol, expiration? (YYYY-MM-DD), strikeCount? }
 */
exports.schwabGetOptionChain = onCall({ ...CRYPTO_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const { symbol, expiration, strikeCount = 10 } = request.data;

  if (!symbol) throw new HttpsError("invalid-argument", "symbol required.");

  const secret = await getSecret(uid);
  const accessToken = await ensureFreshToken(uid, secret);

  const params = new URLSearchParams({
    symbol:        symbol.toUpperCase(),
    contractType:  "CALL",
    strikeCount:   String(strikeCount),
    includeQuotes: "TRUE",
    strategy:      "SINGLE",
    optionType:    "S",
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
