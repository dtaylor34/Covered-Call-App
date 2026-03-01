// ─── sw.js — Service Worker for Covered Calls Manager ───────────────────────
// Strategy:
//   - Cache-first for static assets (JS, CSS, fonts, images)
//   - Network-first for API calls and HTML (market data must be fresh)
//   - Offline fallback shows cached app shell
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = "cc-app-v1";
const STATIC_CACHE = "cc-static-v1";

// Static assets to pre-cache on install
const PRE_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ── Install: pre-cache app shell ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRE_CACHE);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: route requests to appropriate strategy ──
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip Chrome extensions, Firebase Auth, analytics
  if (
    url.protocol === "chrome-extension:" ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("securetoken") ||
    url.pathname.startsWith("/__/")
  ) {
    return;
  }

  // Google Fonts: cache-first (they never change)
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets (JS, CSS, images): cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML / navigation: network-first (SPA routing)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(request));
});

// ── Strategies ──

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirstHTML(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    // Offline: serve cached index.html for SPA routing
    const cached = await caches.match("/index.html");
    return cached || new Response("Offline — please check your connection.", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}

// ── Helpers ──

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/.test(pathname);
}
