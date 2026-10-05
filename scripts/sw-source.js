/**
 * The service worker source. Built and versioned by `npm run pwa:offline`
 * (scripts/build-sw.mjs), which copies this to /sw.js with the version and
 * precache list injected. Edit this file, never /sw.js directly.
 *
 * Strategy, chosen for a shop:
 *
 *   - Navigations        NETWORK FIRST, falling back to cache, then /offline.
 *                        Stock and prices change; a stale catalogue is worse
 *                        than an honest offline page.
 *   - Static assets       CACHE FIRST. /_next/static is content-hashed, so a
 *                        hit is guaranteed to be correct.
 *   - /api/*              NETWORK ONLY. Never cache a cart, a session or a
 *                        price - a cached /api/cart would show the wrong cart.
 *   - Product photos      STALE WHILE REVALIDATE. Browsing still works on a
 *                        patchy connection and a photo does not go stale.
 */

const VERSION = "__VERSION__";
const CACHE = `dynamic-carts-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` rejects the whole install if any single request fails, and a
      // missing icon should not cost the user offline support. Add them
      // individually and tolerate misses.
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))),
      )
      // Activate immediately rather than waiting for every old tab to close,
      // so an update is picked up on the next load instead of the next launch.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // "skipWaiting" from the update prompt in install-prompt.tsx.
  if (event.data === "skipWaiting") self.skipWaiting();
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

function isProductPhoto(url) {
  return url.pathname.startsWith("/products/") && /\.(jpg|jpeg|png|webp|avif)$/i.test(url.pathname);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("You are offline.", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    // Swallow the rejection: the cached copy, if any, is what gets returned.
    .catch(() => undefined);

  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin (Google avatars, Google OAuth) is left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic: carts, sessions and prices must be live or absent.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isProductPhoto(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});