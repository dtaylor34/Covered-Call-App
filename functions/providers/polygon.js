// ─── functions/providers/polygon.js ──────────────────────────────────────────
// Polygon.io / Massive provider — Phase 2 (future).
//
// STUB FILE — implement when upgrading from Yahoo to Polygon.
// See docs/DATA_LAYER.md Section 3.2 for migration checklist.
//
// Required: npm install @polygon.io/client-js
// Required: Set POLYGON_API_KEY in Firebase environment config
// ─────────────────────────────────────────────────────────────────────────────

async function fetchQuote(symbol) {
  throw new Error(
    "Polygon provider not yet implemented. " +
    "Set ACTIVE_PROVIDER=yahoo or implement this module. " +
    "See docs/DATA_LAYER.md Section 3.2"
  );
}

async function fetchExpirations(symbol) {
  throw new Error("Polygon provider not yet implemented.");
}

async function fetchOptionsChain(symbol, expiration) {
  throw new Error("Polygon provider not yet implemented.");
}

async function fetchMultiExpirationChain(symbol, maxExpirations) {
  throw new Error("Polygon provider not yet implemented.");
}

module.exports = {
  fetchQuote,
  fetchExpirations,
  fetchOptionsChain,
  fetchMultiExpirationChain,
};
