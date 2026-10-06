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
// Allow equities/ETFs plus futures (ZB=F) and index symbols (^TYX) for charting.
function cleanSymbol(s) { const v = String(s || "").trim().toUpperCase(); if (!/^[A-Z0-9.^=]{1,10}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid symbol."); return v; }

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

// ── Intraday minute compare ───────────────────────────────────────────────────
// Returns the most recent regular-hours session minute-by-minute (indexed from
// the 9:30 ET open), plus the PRIOR session's close — for the "price at minute N
// vs last close" buy/sell tool.
const OPEN_MIN = 9 * 60 + 30, CLOSE_MIN = 16 * 60; // 570, 960 (ET minutes)
function etParts(ms) {
  const d = new Date(new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, mins: d.getHours() * 60 + d.getMinutes() };
}

exports.getIntradayCompare = onCall({ cors: true, timeoutSeconds: 30, secrets: [schwab.SCHWAB_ENC_KEY] }, async (request) => {
  const uid = requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);

  // 1-minute bars, ~7 days. Schwab first (caller's token), else Yahoo.
  let bars = null;
  try {
    const sec = await schwab.getSecret(uid);
    if (sec?.refreshToken) {
      const token = await schwab.ensureFreshToken(uid, sec);
      const params = new URLSearchParams({ symbol, periodType: "day", period: "10", frequencyType: "minute", frequency: "1", needExtendedHoursData: "true" });
      const r = await fetch(`${schwab.SCHWAB_MARKET_URL}/pricehistory?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); const c = (d.candles || []).filter((x) => x.close != null && x.datetime); if (c.length) bars = c.map((x) => ({ t: x.datetime, c: x.close })); }
    }
  } catch (e) { /* fall back to Yahoo */ }

  if (!bars) {
    try {
      const r = await yf.chart(symbol, { period1: new Date(Date.now() - 7 * 86400000), interval: "1m" }, YF);
      bars = (r.quotes || []).filter((x) => x.date && x.close != null).map((x) => ({ t: new Date(x.date).getTime(), c: x.close }));
    } catch (e) {
      throw new HttpsError("unavailable", `Could not load intraday data for ${symbol}.`);
    }
  }
  if (!bars || !bars.length) throw new HttpsError("unavailable", `No intraday data for ${symbol}.`);

  // Group by ET session date, regular hours only (9:30–16:00 ET).
  const sessions = new Map();
  for (const b of bars) {
    const { date, mins } = etParts(b.t);
    if (mins < OPEN_MIN || mins > CLOSE_MIN) continue;
    if (!sessions.has(date)) sessions.set(date, []);
    sessions.get(date).push({ t: b.t, c: b.c, mins });
  }
  const dates = [...sessions.keys()].sort();
  if (!dates.length) throw new HttpsError("unavailable", `No regular-hours data for ${symbol}.`);

  const lastDate = dates[dates.length - 1];
  const lastBars = sessions.get(lastDate);
  const prevDate = dates[dates.length - 2];
  const prevClose = prevDate ? sessions.get(prevDate)[sessions.get(prevDate).length - 1].c : null;

  const minutes = lastBars.map((b) => ({ m: b.mins - OPEN_MIN, t: b.t, c: b.c }));
  return { symbol, session: lastDate, prevClose, last: minutes.length ? minutes[minutes.length - 1].c : null, minutes };
});

// ── Minute-N pattern over recent history (Data Trend) ─────────────────────────
// For each of the last ~days trading days, the price at minute N (nearest 5-min
// bar) vs that day's PRIOR close (buy/sell signal) and the day's END-OF-DAY close.
// 5-minute bars only reach ~60 days back, so this is a recent-pattern view.
exports.getMinuteTrend = onCall({ cors: true, timeoutSeconds: 30 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const minute = Math.max(0, Math.round(Number(request.data.minute) || 15));
  const days = Math.min(58, Math.max(5, Math.round(Number(request.data.days) || 30)));

  let bars = null;
  try {
    const r = await yf.chart(symbol, { period1: new Date(Date.now() - days * 86400000), interval: "5m" }, YF);
    bars = (r.quotes || []).filter((x) => x.date && x.close != null).map((x) => ({ t: new Date(x.date).getTime(), c: x.close }));
  } catch (e) {
    throw new HttpsError("unavailable", `Could not load intraday history for ${symbol}.`);
  }
  if (!bars.length) throw new HttpsError("unavailable", `No intraday history for ${symbol}.`);

  const sessions = new Map();
  for (const b of bars) {
    const { date, mins } = etParts(b.t);
    if (mins < OPEN_MIN || mins > CLOSE_MIN) continue;
    if (!sessions.has(date)) sessions.set(date, []);
    sessions.get(date).push({ t: b.t, c: b.c, mins });
  }
  const dates = [...sessions.keys()].sort();
  const target = OPEN_MIN + minute;
  const trend = [];
  for (let i = 0; i < dates.length; i++) {
    const dayBars = sessions.get(dates[i]);
    const cap = dayBars.reduce((best, x) => (Math.abs(x.mins - target) < Math.abs(best.mins - target) ? x : best), dayBars[0]);
    const eod = dayBars[dayBars.length - 1].c;
    const priorClose = i > 0 ? sessions.get(dates[i - 1])[sessions.get(dates[i - 1]).length - 1].c : null;
    const signal = priorClose == null ? null : (cap.c < priorClose ? "B" : cap.c > priorClose ? "S" : null);
    trend.push({ date: dates[i], captured: cap.c, capturedMin: cap.mins - OPEN_MIN, eod, priorClose, signal });
  }
  return { symbol, minute, days, trend };
});
