/* Service Worker for KN-Hyperlocal PWA
 * Strategy:
 *   - Network-first for the API + HTML (so users always get fresh data when online)
 *   - Cache-first for static assets (icons, scripts)
 *   - Offline fallback: serve cached index.html when network fails
 */
const CACHE_VERSION = "kn-hyperlocal-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon-32.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Use addAll but tolerate individual failures (e.g., CDN offline)
      Promise.allSettled(APP_SHELL.map(u => cache.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache the API — always go network-first, fall back to last good response
  if (url.hostname === "api.weather.gov") {
    event.respondWith(
      fetch(req).then((res) => {
        // Cache a copy for offline use
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(r => r || new Response(
        JSON.stringify({ error: "offline", features: [] }),
        { headers: { "Content-Type": "application/json" } }
      )))
    );
    return;
  }

  // CDN scripts and static assets — cache-first
  if (url.hostname === "cdn.jsdelivr.net" ||
      url.pathname.match(/\.(png|ico|svg|json|css|js)$/i) ||
      url.pathname === "/" ||
      url.pathname.endsWith("/index.html")) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match("./index.html")))
    );
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});

// Allow page to trigger immediate update
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
