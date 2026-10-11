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

// ── Single-day intraday series (Data Trend → day snapshot) ────────────────────
// Regular-hours bars for ONE past session, fetched on demand when the user opens
// a day from the Data Trend chart. The caller picks the bar size (interval):
//   1m  → finest detail, but Yahoo only serves 1-minute bars for the last ~7 days
//   5m  → default; reaches ~60 days back (matches the Data Trend window)
//   30m / 1h → coarse "full day at a glance", available further back
// Returns [{ m, t, c }] (m = minutes since the 9:30 ET open).
const DAY_INTERVALS = { "1m": "1m", "5m": "5m", "30m": "30m", "1h": "60m" };
exports.getIntradayDay = onCall({ cors: true, timeoutSeconds: 30 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const date = String(request.data.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError("invalid-argument", "Invalid date.");
  const intervalKey = DAY_INTERVALS[String(request.data.interval || "5m")] ? String(request.data.interval) : "5m";
  const interval = DAY_INTERVALS[intervalKey];
  const [y, m, d] = date.split("-").map(Number);
  // Pad ±1 day so the ET session is fully covered regardless of UTC offset.
  const start = new Date(Date.UTC(y, m - 1, d - 1));
  const end = new Date(Date.UTC(y, m - 1, d + 2));

  let bars = null;
  try {
    const r = await yf.chart(symbol, { period1: start, period2: end, interval }, YF);
    bars = (r.quotes || []).filter((x) => x.date && x.close != null).map((x) => ({ t: new Date(x.date).getTime(), c: x.close }));
  } catch (e) {
    throw new HttpsError("unavailable", `Could not load ${intervalKey} data for ${symbol}.`);
  }

  const minutes = [];
  for (const b of bars) {
    const p = etParts(b.t);
    if (p.date !== date) continue;
    if (p.mins < OPEN_MIN || p.mins > CLOSE_MIN) continue;
    minutes.push({ m: p.mins - OPEN_MIN, t: b.t, c: b.c });
  }
  if (!minutes.length) {
    const hint = intervalKey === "1m" ? " 1-minute bars are only available for about the last 7 days." : "";
    throw new HttpsError("unavailable", `No ${intervalKey} data for ${symbol} on ${date}.${hint}`);
  }
  minutes.sort((a, b) => a.m - b.m);
  return { symbol, date, interval: intervalKey, minutes };
});

// Close price at an EXACT session minute, interpolated between the two 5-min
// bars that bracket it (so "minute 8" is 9:38, not snapped to the 9:40 bar).
// bars must be sorted ascending by `mins`.
function closeAtMinute(bars, targetMins) {
  if (!bars.length) return null;
  if (targetMins <= bars[0].mins) return bars[0].c;
  if (targetMins >= bars[bars.length - 1].mins) return bars[bars.length - 1].c;
  for (let i = 0; i < bars.length - 1; i++) {
    const a = bars[i], b = bars[i + 1];
    if (targetMins >= a.mins && targetMins <= b.mins) {
      const f = b.mins > a.mins ? (targetMins - a.mins) / (b.mins - a.mins) : 0;
      return a.c + f * (b.c - a.c);
    }
  }
  return bars[bars.length - 1].c;
}

// Fetch regular-hours bars for the last `days` sessions, choosing the finest
// interval that covers the window: Yahoo serves 5-min bars ~60 days back and
// 60-min bars ~730 days back. Beyond 60 days the minute is approximated from
// hourly bars. Returns { interval, sessions (Map date→[{t,c,mins}]), dates }.
async function fetchSessionsMap(symbol, days) {
  const interval = days <= 58 ? "5m" : "60m";
  let bars = null;
  try {
    const r = await yf.chart(symbol, { period1: new Date(Date.now() - days * 86400000), interval }, YF);
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
  return { interval, sessions, dates: [...sessions.keys()].sort() };
}

// ── Minute-N pattern over recent history (Data Trend) ─────────────────────────
// For each of the last ~days trading days, the price at the EXACT minute N
// (interpolated from the bars) vs that day's PRIOR close (buy/sell signal) and
// the day's END-OF-DAY close. Range up to ~2 years (hourly beyond ~60 days).
exports.getMinuteTrend = onCall({ cors: true, timeoutSeconds: 30 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const minute = Math.max(0, Math.round(Number(request.data.minute) || 15));
  const days = Math.min(730, Math.max(5, Math.round(Number(request.data.days) || 30)));

  const { interval, sessions, dates } = await fetchSessionsMap(symbol, days);
  const target = OPEN_MIN + minute;
  const trend = [];
  for (let i = 0; i < dates.length; i++) {
    const dayBars = sessions.get(dates[i]).slice().sort((a, b) => a.mins - b.mins);
    const capC = closeAtMinute(dayBars, target); // interpolated price at the exact minute
    const eod = dayBars[dayBars.length - 1].c;
    const priorClose = i > 0 ? sessions.get(dates[i - 1])[sessions.get(dates[i - 1]).length - 1].c : null;
    const signal = priorClose == null ? null : (capC < priorClose ? "B" : capC > priorClose ? "S" : null);
    // capturedMin is the EXACT requested minute (not the snapped bar minute).
    trend.push({ date: dates[i], captured: capC, capturedMin: minute, eod, priorClose, signal });
  }
  return { symbol, minute, days, interval, trend };
});

// ── Bulk intraday for the Stacked View ────────────────────────────────────────
// Every session's intraday path (normalized client-side), plus each day's prior
// close, minute-N capture, and buy/sell signal — one call, for layering all days
// on a single chart.
exports.getIntradayRange = onCall({ cors: true, timeoutSeconds: 45 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  const minute = Math.max(0, Math.round(Number(request.data.minute) || 15));
  const days = Math.min(730, Math.max(5, Math.round(Number(request.data.days) || 30)));

  const { interval, sessions, dates } = await fetchSessionsMap(symbol, days);
  const target = OPEN_MIN + minute;
  const out = [];
  for (let i = 0; i < dates.length; i++) {
    const dayBars = sessions.get(dates[i]).slice().sort((a, b) => a.mins - b.mins);
    const priorClose = i > 0 ? sessions.get(dates[i - 1])[sessions.get(dates[i - 1]).length - 1].c : null;
    const capC = closeAtMinute(dayBars, target);
    const signal = priorClose == null ? null : (capC < priorClose ? "B" : capC > priorClose ? "S" : null);
    out.push({
      date: dates[i], priorClose, captured: capC, capturedMin: minute, signal,
      minutes: dayBars.map((b) => ({ m: b.mins - OPEN_MIN, c: b.c })),
    });
  }
  return { symbol, minute, days, interval, sessions: out };
});
