// Minimal offline-first service worker for the Insight PWA.
//
// Scope: cache the app shell (the static assets Next.js needs to render the
// login-checked shell and the POS route) so the app can *open* with no
// network. It deliberately does not cache API responses — sales, inventory,
// and everything transactional flow through the IndexedDB queue in
// lib/offline/, not through the service worker cache, so there is exactly
// one source of truth for "what's pending sync."

const CACHE_NAME = "insight-shell-v1";
const APP_SHELL = ["/", "/pos", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept API calls — those must reach the network directly (or
  // fail loudly) so the sync engine's own retry/queue logic is what handles
  // connectivity, not a stale cached response masquerading as success.
  if (request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
