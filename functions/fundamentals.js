// ─── functions/fundamentals.js ───────────────────────────────────────────────
// Earnings date, ex-dividend date, and dividend rate for a symbol, from Yahoo's
// quoteSummary. Feeds the Best Returns scoring (earnings risk / dividend bonus)
// and the Key Events section (earnings / dividend-capture events). Degrades
// gracefully — returns nulls rather than failing hard when data is missing.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const YahooFinance = require("yahoo-finance2").default;

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function requireAuth(req) { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); }
function cleanSymbol(s) { const v = String(s || "").trim().toUpperCase(); if (!/^[A-Z0-9.^=]{1,10}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid symbol."); return v; }
const iso = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : null; } catch { return null; } };

exports.getFundamentals = onCall({ cors: true, timeoutSeconds: 20 }, async (request) => {
  requireAuth(request);
  const symbol = cleanSymbol(request.data.symbol);
  try {
    const r = await yf.quoteSummary(symbol, { modules: ["calendarEvents", "summaryDetail", "price"] }, { validateResult: false });
    const ce = r.calendarEvents || {}, sd = r.summaryDetail || {}, pr = r.price || {};
    const earn = ce.earnings?.earningsDate;
    return {
      symbol,
      price: pr.regularMarketPrice || sd.previousClose || 0,
      earningsDate: Array.isArray(earn) && earn.length ? iso(earn[0]) : null,
      exDivDate: iso(sd.exDividendDate || ce.exDividendDate),
      dividendRate: Number(sd.dividendRate) || 0,
      dividendYield: Number(sd.dividendYield) || 0,
    };
  } catch (e) {
    return { symbol, price: 0, earningsDate: null, exDivDate: null, dividendRate: 0, dividendYield: 0, _unavailable: true };
  }
});
