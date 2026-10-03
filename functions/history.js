// ─── functions/history.js ─────────────────────────────────────────────────────
// Daily historical-data collector for covered-call analysis.
//
// For each symbol in the global `trackedSymbols` registry, once per trading day
// we snapshot: underlying price, ATM ~30-DTE call IV (IV30 proxy), and that
// call's strike/bid/ask. Stored as a rolling series in `history/{symbol}`.
// Enables IV-percentile and premium-trend analysis as history accumulates.
//
//   trackedSymbols/{SYMBOL}  { symbol, type, startedAt, addedBy, lastCollectedAt, points }
//   history/{SYMBOL}         { symbol, samples: [{ d, price, iv, callStrike, callBid, callAsk, expiry }] }
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getQuote, getOptionsChain, getExpirations } = require("./providers");

const MAX_SAMPLES = 760; // ~2 years of trading days (rolling window)

const todayISO = () => new Date().toISOString().slice(0, 10);

// Nearest expiration to 30 days out (the standard IV30 anchor).
function nearest30(exps) {
  const now = Date.now();
  let best = null, bestDiff = Infinity;
  for (const e of exps || []) {
    const dte = Math.round((new Date(e) - now) / 86400000);
    if (dte < 1) continue;
    const diff = Math.abs(dte - 30);
    if (diff < bestDiff) { bestDiff = diff; best = e; }
  }
  return best;
}

async function collectForSymbol(symbol) {
  const db = admin.firestore();
  const quote = await getQuote(symbol);
  const price = quote.price || 0;

  let iv = 0, callStrike = null, callBid = null, callAsk = null, expiry = null;
  try {
    expiry = nearest30(await getExpirations(symbol));
    if (expiry && price) {
      const chain = await getOptionsChain(symbol, expiry);
      const calls = chain?.chain?.[expiry]?.calls || [];
      if (calls.length) {
        const atm = calls.reduce((b, c) => (Math.abs(c.strike - price) < Math.abs(b.strike - price) ? c : b));
        iv = atm.impliedVolatility || 0;
        callStrike = atm.strike; callBid = atm.bid; callAsk = atm.ask;
      }
    }
  } catch (e) {
    console.error(`history: chain fetch failed for ${symbol}:`, e.message); // price still recorded
  }

  const sample = { d: todayISO(), price, iv, callStrike, callBid, callAsk, expiry };
  const ref = db.collection("history").doc(symbol);
  const snap = await ref.get();
  const samples = (snap.exists && snap.data().samples) || [];
  const i = samples.findIndex((s) => s.d === sample.d);
  if (i >= 0) samples[i] = sample; else samples.push(sample);           // one point per day (idempotent)
  const trimmed = samples.slice(-MAX_SAMPLES);

  await ref.set({ symbol, samples: trimmed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("trackedSymbols").doc(symbol).set(
    { lastCollectedAt: FieldValue.serverTimestamp(), points: trimmed.length }, { merge: true });
  return sample;
}

async function collectAll() {
  const db = admin.firestore();
  const snap = await db.collection("trackedSymbols").get();
  const results = [];
  for (const doc of snap.docs) {
    try { await collectForSymbol(doc.id); results.push({ symbol: doc.id, ok: true }); }
    catch (e) { console.error(`history collect failed for ${doc.id}:`, e.message); results.push({ symbol: doc.id, ok: false, error: e.message }); }
  }
  return results;
}

// Daily at 4:30pm ET on weekdays (after US market close).
exports.collectDailyHistory = onSchedule(
  { schedule: "30 16 * * 1-5", timeZone: "America/New_York", timeoutSeconds: 540, memory: "512MiB" },
  async () => { await collectAll(); }
);

// Manual trigger (owner/admin) — seeds the first data point + for testing.
exports.collectHistoryNow = onCall({ cors: true, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const udoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  const role = udoc.exists ? udoc.data().role : null;
  if (!["owner", "admin"].includes(role)) throw new HttpsError("permission-denied", "Admins only.");
  const results = await collectAll();
  return { results, collected: results.filter((r) => r.ok).length };
});
