// Insight service worker.
//
// What it does:
//  - /_next/static/* (content-hashed, immutable): cache-first.
//  - Page navigations: network-first; a successful, non-redirected page is
//    stored so it can be opened later without a connection. Offline, the
//    cached copy of that page is served, falling back to the cached POS.
//  - /api/*: never intercepted. Sales made offline go through the IndexedDB
//    queue in lib/offline/, which is the single source of truth for what is
//    waiting to sync. A cached API response must never look like success.

const VERSION = "insight-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(PAGE_CACHE)
            .then((cache) => cache.match(url.pathname).then((hit) => hit || cache.match("/pos")))
            .then(
              (hit) =>
                hit ||
                new Response(
                  "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font-family:sans-serif;padding:24px\"><h1>You're offline</h1><p>Open Insight's Point of Sale once while online so it is available offline.</p>",
                  { headers: { "Content-Type": "text/html" }, status: 503 }
                )
            )
        )
    );
  }
});
