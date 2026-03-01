// ─── functions/cache/firestore.js ────────────────────────────────────────────
// Cache layer using Firestore. Reads return cached data if fresh,
// writes store data with a timestamp for TTL checking.
//
// All market data caching goes through this module.
// When scaling to Redis, replace this file — API layer doesn't change.
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");

/**
 * Get cached data if it exists and hasn't expired.
 *
 * @param {string} cacheKey - Firestore document path under marketData/
 * @param {number} ttlSeconds - Max age in seconds before data is stale
 * @returns {Object|null} Cached data or null if miss/expired
 */
async function getCached(cacheKey, ttlSeconds) {
  try {
    const db = admin.firestore();
    const doc = await db.collection("marketData").doc(cacheKey).get();

    if (!doc.exists) return null;

    const data = doc.data();
    if (!data.fetchedAt) return null;

    const ageMs = Date.now() - data.fetchedAt.toMillis();
    const ttlMs = ttlSeconds * 1000;

    if (ageMs > ttlMs) {
      // Data exists but is stale — return it with stale flag
      // Caller can decide to use it or fetch fresh
      return { ...data.payload, _stale: true, _ageSeconds: Math.round(ageMs / 1000) };
    }

    return { ...data.payload, _stale: false };
  } catch (error) {
    console.error(`Cache read error for ${cacheKey}:`, error.message);
    return null;
  }
}

/**
 * Write data to cache with current timestamp.
 *
 * @param {string} cacheKey - Firestore document path under marketData/
 * @param {Object} payload - The data to cache
 */
async function setCache(cacheKey, payload) {
  try {
    const db = admin.firestore();
    await db.collection("marketData").doc(cacheKey).set({
      payload,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Cache write error for ${cacheKey}:`, error.message);
    // Don't throw — cache failures shouldn't break the API
  }
}

/**
 * Get cached data, falling back to stale data if cache miss.
 * Returns null only if no data exists at all.
 *
 * @param {string} cacheKey
 * @param {number} ttlSeconds
 * @returns {Object|null} Fresh or stale data, or null
 */
async function getCachedOrStale(cacheKey, ttlSeconds) {
  try {
    const db = admin.firestore();
    const doc = await db.collection("marketData").doc(cacheKey).get();

    if (!doc.exists) return null;

    const data = doc.data();
    if (!data.payload) return null;

    const ageMs = data.fetchedAt ? Date.now() - data.fetchedAt.toMillis() : Infinity;
    const isStale = ageMs > ttlSeconds * 1000;

    return {
      ...data.payload,
      _stale: isStale,
      _ageSeconds: Math.round(ageMs / 1000),
    };
  } catch (error) {
    console.error(`Cache read error for ${cacheKey}:`, error.message);
    return null;
  }
}

/**
 * Update provider status in Firestore for admin panel monitoring.
 *
 * @param {string} provider - Provider name (yahoo, polygon, tradier)
 * @param {string} status - "ok" | "error" | "degraded"
 * @param {string} [message] - Optional status message
 */
async function updateProviderStatus(provider, status, message = "") {
  try {
    const db = admin.firestore();
    await db.collection("marketData").doc("meta_providerStatus").set({
      provider,
      status,
      message,
      lastCheck: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error("Provider status update failed:", error.message);
  }
}

module.exports = { getCached, setCache, getCachedOrStale, updateProviderStatus };
