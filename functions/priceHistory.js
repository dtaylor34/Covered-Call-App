// ─── functions/priceHistory.js ───────────────────────────────────────────────
// Historical price series for the trend chart. HYBRID: when the signed-in caller
// has a connected Schwab account we pull from Schwab's real-time price-history
// endpoint (the same data they see in their Schwab app, using THEIR own token);
// otherwise we fall back to Yahoo (15-min delayed, free). Returns a compact
// [{ t, c }] series (epoch ms + close) plus which source produced it.
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const YahooFinance = require("yahoo-finance2").default;
const { _internal: schwab } = require("./schwab");

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const YF = { validateResult: false };
const DAY = 86400000;

// range → Yahoo { interval, lookback ms }
const YF_RANGES = {
  "1D": { interval: "5m",  ms: 1 * DAY },
  "1W": { interval: "30m", ms: 7 * DAY },
  "1M": { interval: "1d",  ms: 31 * DAY },
  "3M": { interval: "1d",  ms: 93 * DAY },
  "6M": { interval: "1d",  ms: 186 * DAY },
  "1Y": { interval: "1d",  ms: 366 * DAY },
  "2Y": { interval: "1wk", ms: 2 * 366 * DAY },
  "5Y": { interval: "1wk", ms: 5 * 366 * DAY },
  "ALL": { interval: "1mo", ms: null },
};

// range → Schwab price-history params (valid periodType/period/frequency combos)
const SCHWAB_RANGES = {
  "1D": { periodType: "day",   period: 1,  frequencyType: "minute",  frequency: 5 },
  "1W": { periodType: "day",   period: 5,  frequencyType: "minute",  frequency: 30 },
  "1M": { periodType: "month", period: 1,  frequencyType: "daily",   frequency: 1 },
  "3M": { periodType: "month", period: 3,  frequencyType: "daily",   frequency: 1 },
  "6M": { periodType: "month", period: 6,  frequencyType: "daily",   frequency: 1 },
  "1Y": { periodType: "year",  period: 1,  frequencyType: "daily",   frequency: 1 },
  "2Y": { periodType: "year",  period: 2,  frequencyType: "weekly",  frequency: 1 },
  "5Y": { periodType: "year",  period: 5,  frequencyType: "weekly",  frequency: 1 },
  "ALL": { periodType: "year", period: 20, frequencyType: "monthly", frequency: 1 },
};

function requireAuth(req) { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return req.auth.uid; }
function cleanSymbol(s) { const v = String(s || "").trim().toUpperCase(); if (!/^[A-Z.]{1,6}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid symbol."); return v; }

// Pull from Schwab using the caller's own access token. Throws on any problem so
// the caller falls back to Yahoo.
async function schwabHistory(token, symbol, key) {
  const p = SCHWAB_RANGES[key];
  const params = new URLSearchParams({
    symbol, periodType: p.periodType, period: String(p.period),
    frequencyType: p.frequencyType, frequency: String(p.frequency), needExtendedHoursData: "false",
  });
  const res = await fetch(`${schwab.SCHWAB_MARKET_URL}/pricehistory?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`schwab pricehistory ${res.status}`);
  const d = await res.json();
  const points = (d.candles || [])
    .filter((c) => c && c.datetime && c.close != null && Number.isFinite(c.close))
    .map((c) => ({ t: c.datetime, c: c.close }));
  if (!points.length) throw new Error("schwab returned no candles");
  return points;
}

async function yahooHistory(symbol, key) {
  const cfg = YF_RANGES[key];
  const period1 = cfg.ms ? new Date(Date.now() - cfg.ms) : new Date("1970-01-02");
  const r = await yf.chart(symbol, { period1, interval: cfg.interval }, YF);
  const points = (r.quotes || [])
    .filter((q) => q && q.date && q.close != null && Number.isFinite(q.close))
    .map((q) => ({ t: new Date(q.date).getTime(), c: q.close }));
  return { points, price: r.meta?.regularMarketPrice || (points.length ? points[points.length - 1].c : 0) };
}

exports.getPriceHistory = onCall({ cors: true, timeoutSeconds: 30, secrets: [schwab.SCHWAB_ENC_KEY] }, async (request) => {
  const uid = requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const key = SCHWAB_RANGES[String(request.data.range || "6M").toUpperCase()] ? String(request.data.range).toUpperCase() : "6M";

  // 1) Try Schwab with the caller's own connection (real-time).
  try {
    const sec = await schwab.getSecret(uid);
    if (sec?.refreshToken) {
      const token = await schwab.ensureFreshToken(uid, sec);
      const points = await schwabHistory(token, symbol, key);
      return { symbol, range: key, source: "schwab", price: points[points.length - 1].c, points };
    }
  } catch (e) { /* not connected / token expired / Schwab error → fall back to Yahoo */ }

  // 2) Yahoo fallback (always available).
  try {
    const { points, price } = await yahooHistory(symbol, key);
    return { symbol, range: key, source: "yahoo", price, points };
  } catch (e) {
    console.error(`getPriceHistory ${symbol}/${key}:`, e.message);
    throw new HttpsError("unavailable", `Could not load price history for ${symbol}.`);
  }
});
