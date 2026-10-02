// ─── sw.js — Service Worker (intentionally NON-CACHING) ─────────────────────
// A cache-first service worker previously served stale JS bundles after a
// deploy, which showed up as a blank screen on next load. This version does the
// opposite: on activate it PURGES all caches, and it installs no fetch handler,
// so every request goes straight to the network. The app therefore always loads
// fresh. Firebase Hosting already handles correct caching (index.html = no-cache,
// hashed JS/CSS = immutable), so no SW caching is needed for this live-data app.
//
// Existing users on the old cache-first SW pick this up on their next load:
// it activates immediately (skipWaiting + claim) and deletes the stale caches.
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k))); // purge ALL old caches
      await self.clients.claim();
    })()
  );
});

// No "fetch" handler on purpose — requests are not intercepted, so content is
// always served from the network (never a stale cache).
