// ─── functions/engine/riskFreeRate.js ────────────────────────────────────────
// Fetches the current US Treasury risk-free rate for Black-Scholes calculations.
// Uses the US Treasury XML feed for the 13-week T-bill rate.
// Cached in Firestore for 24 hours to minimize external calls.
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");

const CACHE_KEY = "meta/riskFreeRate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback rate if Treasury API is unreachable
const FALLBACK_RATE = 0.045; // 4.5% — reasonable approximation

/**
 * Get the current risk-free rate. Returns from Firestore cache if fresh,
 * otherwise fetches from Treasury and caches.
 *
 * @returns {Promise<number>} Annual risk-free rate as decimal (e.g. 0.045)
 */
async function getRiskFreeRate() {
  const db = admin.firestore();

  try {
    // Check cache first
    const cacheDoc = await db.collection("marketData").doc(CACHE_KEY).get();
    if (cacheDoc.exists) {
      const data = cacheDoc.data();
      const age = Date.now() - data.fetchedAt.toMillis();
      if (age < CACHE_TTL_MS) {
        return data.rate;
      }
    }

    // Fetch fresh rate
    const rate = await fetchTreasuryRate();

    // Cache it
    await db.collection("marketData").doc(CACHE_KEY).set({
      rate,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "us-treasury-13week",
    });

    return rate;
  } catch (error) {
    console.error("Risk-free rate fetch failed, using fallback:", error.message);
    return FALLBACK_RATE;
  }
}

/**
 * Fetch the 13-week Treasury bill rate from the US Treasury API.
 * Falls back to a reasonable default if the API is unreachable.
 */
async function fetchTreasuryRate() {
  try {
    // Use the Treasury's daily rate feed
    // The 13-week (3-month) T-bill is the standard proxy for risk-free rate
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");

    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/${month}?type=daily_treasury_bill_rates&field_tdr_date_value_month=${year}${month}&page&_format=csv`;

    const response = await fetch(url, {
      headers: { "User-Agent": "CoveredCallsManager/1.0 (educational)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`Treasury API returned ${response.status}, using fallback rate`);
      return FALLBACK_RATE;
    }

    const text = await response.text();
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      return FALLBACK_RATE;
    }

    // CSV header row has column names, find the 13-week column
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const wk13Index = headers.findIndex((h) => h.includes("13") && h.toUpperCase().includes("WEEK"));

    // Take the last (most recent) data row
    const lastRow = lines[lines.length - 1].split(",").map((v) => v.trim().replace(/"/g, ""));

    if (wk13Index >= 0 && lastRow[wk13Index]) {
      const rate = parseFloat(lastRow[wk13Index]);
      if (!isNaN(rate) && rate > 0 && rate < 20) {
        return rate / 100; // Convert from percentage to decimal
      }
    }

    return FALLBACK_RATE;
  } catch (error) {
    console.warn("Treasury rate fetch error:", error.message);
    return FALLBACK_RATE;
  }
}

module.exports = { getRiskFreeRate };
