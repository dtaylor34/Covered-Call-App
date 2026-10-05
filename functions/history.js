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
const { _internal: schwab } = require("./schwab");
const YahooFinance = require("yahoo-finance2").default;
const yfChart = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const MAX_SAMPLES = 760; // ~3 years of trading days (rolling window)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Schwab enrichment (hybrid data source) ────────────────────────────────────
// When an owner/admin has a live Schwab connection, we snapshot from Schwab's
// real-time market data instead of Yahoo (15-min delayed; after-hours bids → 0).
// Yahoo stays the always-on fallback, so collection never breaks if the Schwab
// token lapses (Schwab refresh tokens expire after 7 days and need a re-login).

// Find a connected owner/admin and return a valid Schwab access token, or null.
// Resolved ONCE per collection run and reused for every symbol (token lasts ~30m).
async function resolveSchwabToken() {
  const db = admin.firestore();
  let admins;
  try { admins = await db.collection("users").where("role", "in", ["owner", "admin"]).get(); }
  catch (e) { console.warn("history: could not query admins for Schwab token:", e.message); return null; }
  for (const u of admins.docs) {
    try {
      const sec = await schwab.getSecret(u.id);
      if (sec?.refreshToken) {
        const token = await schwab.ensureFreshToken(u.id, sec);
        if (token) { console.log(`history: using Schwab data via ${u.id.slice(0, 6)}…`); return token; }
      }
    } catch (e) { /* no connection / expired — try next admin */ }
  }
  return null;
}

// Snapshot price + ATM ~30-DTE call from Schwab. Returns null on any failure so
// the caller falls back to Yahoo. Schwab reports IV as a percent → store decimal.
async function schwabResolve(token, symbol) {
  const hdr = { headers: { Authorization: `Bearer ${token}` } };
  let price = 0, open = null, high = null, low = null;
  try {
    const r = await fetch(`${schwab.SCHWAB_MARKET_URL}/quotes?symbols=${encodeURIComponent(symbol)}&fields=quote&indicative=false`, hdr);
    if (r.ok) {
      const d = await r.json(); const q = d?.[symbol]?.quote;
      price = q?.lastPrice || q?.mark || 0;
      open = q?.openPrice ?? null; high = q?.highPrice ?? null; low = q?.lowPrice ?? null;
    }
  } catch (e) { /* fall through to chain / Yahoo */ }

  let iv = 0, callStrike = null, callBid = null, callAsk = null, expiry = null;
  try {
    const params = new URLSearchParams({ symbol: symbol.toUpperCase(), contractType: "CALL", strikeCount: "8", includeQuotes: "TRUE", strategy: "SINGLE" });
    const r = await fetch(`${schwab.SCHWAB_MARKET_URL}/chains?${params}`, hdr);
    if (r.ok) {
      const d = await r.json();
      if (!price) price = d?.underlyingPrice || 0;
      const map = d?.callExpDateMap || {};
      let bestKey = null, bestDiff = Infinity;
      for (const key of Object.keys(map)) {           // key = "YYYY-MM-DD:DTE"
        const dte = parseInt(key.split(":")[1], 10);
        if (!(dte >= 1)) continue;
        const diff = Math.abs(dte - 30);
        if (diff < bestDiff) { bestDiff = diff; bestKey = key; }
      }
      if (bestKey && price) {
        expiry = bestKey.split(":")[0];
        const strikes = map[bestKey];
        let best = null;
        for (const s of Object.keys(strikes)) {
          const leg = strikes[s]?.[0]; if (!leg) continue;
          const k = leg.strikePrice ?? parseFloat(s);
          if (!best || Math.abs(k - price) < Math.abs(best.k - price)) best = { k, leg };
        }
        if (best) { callStrike = best.k; callBid = best.leg.bid || 0; callAsk = best.leg.ask || 0; iv = (best.leg.volatility || 0) / 100; }
      }
    }
  } catch (e) { /* fall through */ }

  if (!(price > 0)) return null;
  return { price, o: open, h: high, l: low, c: price, iv, callStrike, callBid, callAsk, expiry, src: "schwab" };
}

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

async function collectForSymbol(symbol, schwabToken) {
  const db = admin.firestore();

  // Prefer Schwab (real-time) when a token is available; fall back to Yahoo.
  let data = schwabToken ? await schwabResolve(schwabToken, symbol).catch(() => null) : null;

  if (!data) {
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
    data = { price, o: quote.open ?? null, h: quote.high ?? null, l: quote.low ?? null, c: price, iv, callStrike, callBid, callAsk, expiry, src: "yahoo" };
  }

  const sample = { d: todayISO(), price: data.price, o: data.o ?? null, h: data.h ?? null, l: data.l ?? null, c: data.c ?? data.price, iv: data.iv, callStrike: data.callStrike, callBid: data.callBid, callAsk: data.callAsk, expiry: data.expiry, src: data.src };
  const ref = db.collection("history").doc(symbol);
  const snap = await ref.get();
  const samples = (snap.exists && snap.data().samples) || [];
  const i = samples.findIndex((s) => s.d === sample.d);
  if (i >= 0) samples[i] = sample; else samples.push(sample);           // one point per day (idempotent)
  samples.sort((a, b) => (a.d < b.d ? -1 : 1));                          // keep chronological
  const trimmed = samples.slice(-MAX_SAMPLES);

  await ref.set({ symbol, samples: trimmed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("trackedSymbols").doc(symbol).set(
    { lastCollectedAt: FieldValue.serverTimestamp(), points: trimmed.length }, { merge: true });
  return sample;
}

async function collectAll() {
  const db = admin.firestore();
  const schwabToken = await resolveSchwabToken().catch(() => null);
  const snap = await db.collection("trackedSymbols").get();
  const results = [];
  for (const doc of snap.docs) {
    try { const s = await collectForSymbol(doc.id, schwabToken); results.push({ symbol: doc.id, ok: true, src: s.src }); }
    catch (e) { console.error(`history collect failed for ${doc.id}:`, e.message); results.push({ symbol: doc.id, ok: false, error: e.message }); }
  }
  console.log(`history: collected ${results.filter((r) => r.ok).length}/${results.length} (${schwabToken ? "schwab+yahoo" : "yahoo only"})`);
  return results;
}

// Daily at 4:30pm ET on weekdays (after US market close).
// Binds SCHWAB_ENC_KEY so the collector can decrypt an admin's Schwab token for
// real-time snapshots (falls back to Yahoo when unavailable).
exports.collectDailyHistory = onSchedule(
  { schedule: "30 16 * * 1-5", timeZone: "America/New_York", timeoutSeconds: 540, memory: "512MiB", secrets: [schwab.SCHWAB_ENC_KEY] },
  async () => { await collectAll(); }
);

// Manual trigger (owner/admin) — seeds the first data point + for testing.
exports.collectHistoryNow = onCall({ cors: true, timeoutSeconds: 300, secrets: [schwab.SCHWAB_ENC_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const udoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  const role = udoc.exists ? udoc.data().role : null;
  if (!["owner", "admin"].includes(role)) throw new HttpsError("permission-denied", "Admins only.");
  const results = await collectAll();
  return { results, collected: results.filter((r) => r.ok).length };
});

// ── Backfill daily OHLC history ───────────────────────────────────────────────
// Loads real historical daily open/high/low/close from Yahoo so you can analyze
// trends and test enter/exit prices immediately (instead of waiting for forward
// collection). Merges by date: fills OHLC on days we already have, adds the rest.
// Keeps any live-collected IV/options fields already stored for a date.
async function backfillSymbol(symbol, years, track = true) {
  const db = admin.firestore();
  const period1 = new Date(Date.now() - years * 366 * 86400000);
  const r = await yfChart.chart(symbol, { period1, interval: "1d" }, { validateResult: false });
  const rows = (r.quotes || []).filter((q) => q && q.date && q.close != null && Number.isFinite(q.close));
  if (!rows.length) return { symbol, added: 0, total: 0 };

  const ref = db.collection("history").doc(symbol);
  const snap = await ref.get();
  const byDate = new Map(((snap.exists && snap.data().samples) || []).map((s) => [s.d, s]));

  let added = 0;
  for (const q of rows) {
    const d = new Date(q.date).toISOString().slice(0, 10);
    const cur = byDate.get(d);
    if (cur) {
      if (cur.o == null) cur.o = q.open ?? null;
      if (cur.h == null) cur.h = q.high ?? null;
      if (cur.l == null) cur.l = q.low ?? null;
      if (cur.c == null) cur.c = q.close;
      if (cur.price == null) cur.price = q.close;
    } else {
      byDate.set(d, { d, price: q.close, o: q.open ?? null, h: q.high ?? null, l: q.low ?? null, c: q.close, iv: 0, callStrike: null, callBid: null, callAsk: null, expiry: null, src: "yahoo-bf" });
      added++;
    }
  }
  const merged = [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-MAX_SAMPLES);
  await ref.set({ symbol, samples: merged, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Only touch the tracked registry for symbols we actually track (not ad-hoc tests).
  if (track) await db.collection("trackedSymbols").doc(symbol).set({ points: merged.length, lastCollectedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { symbol, added, total: merged.length };
}

exports.backfillHistory = onCall({ cors: true, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const udoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  const role = udoc.exists ? udoc.data().role : null;
  if (!["owner", "admin"].includes(role)) throw new HttpsError("permission-denied", "Admins only.");

  const years = Math.min(3, Math.max(1, Math.round(request.data?.years || 2)));
  const track = request.data?.track !== false; // ad-hoc single-symbol tests pass track:false
  const db = admin.firestore();
  const only = request.data?.symbol ? [String(request.data.symbol).trim().toUpperCase()] : null;
  const symbols = only || (await db.collection("trackedSymbols").get()).docs.map((d) => d.id);

  const results = [];
  for (const sym of symbols) {
    try { results.push(await backfillSymbol(sym, years, track)); }
    catch (e) { results.push({ symbol: sym, error: e.message }); }
    await sleep(120); // be gentle on Yahoo's rate limits
  }
  const ok = results.filter((r) => !r.error);
  console.log(`backfill: ${ok.length}/${results.length} symbols, ${years}y`);
  return { years, count: ok.length, total: results.length, results };
});
