// ─── functions/providers/tradier.js ──────────────────────────────────────────
// Tradier provider — Phase 3 alternative.
//
// STUB FILE — implement if choosing Tradier over Polygon.
// See docs/DATA_LAYER.md Section 3.3 for migration checklist.
//
// Required: Set TRADIER_API_KEY in Firebase environment config
// API docs: https://docs.tradier.com/
// ─────────────────────────────────────────────────────────────────────────────

async function fetchQuote(symbol) {
  throw new Error(
    "Tradier provider not yet implemented. " +
    "Set ACTIVE_PROVIDER=yahoo or implement this module. " +
    "See docs/DATA_LAYER.md Section 3.3"
  );
}

async function fetchExpirations(symbol) {
  throw new Error("Tradier provider not yet implemented.");
}

async function fetchOptionsChain(symbol, expiration) {
  throw new Error("Tradier provider not yet implemented.");
}

module.exports = { fetchQuote, fetchExpirations, fetchOptionsChain };
