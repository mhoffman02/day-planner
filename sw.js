/**
 * @file sw.js
 * @description Service worker for the Day Planner PWA shell: pre-caches the app
 * shell on install, evicts stale caches on activate, and serves same-origin
 * GET requests stale-while-revalidate (cross-origin requests bypass the cache
 * and fall back to it only on network failure).
 */

// GENERATED value — derived from a content hash of ASSETS_TO_CACHE below by
// tools/update-sw-cache-version.js. Never hand-edit this string: run `npm run build:sw` after
// changing any cached asset's content, which is enforced pre-commit by `build:sw:check`. This
// exists so a cache-busting bump can never again be forgotten by hand (see git history).
//
// Relative (not root-absolute) paths: this worker's own scope is whatever directory it's
// served from (local dev root, or GitHub Pages' /day-planner/ subpath) — an absolute "/"
// path resolves against the origin root instead and 404s under the subpath, which fails the
// whole cache.addAll() and leaves the worker stuck uninstalled.
const CACHE_NAME = 'day-planner-shell-fe6b0fa548';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './src/app.js',
  './src/styles.css',
  './src/vendor/alpine.min.js',
  './icons/icon.svg'
];

// Install Event: Pre-cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-While-Revalidate Strategy for local assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass external API calls (e.g. googleapis or external CDNs) from cache override
  if (!url.origin.includes(self.location.origin)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[SW] Fetch failed, returning cached asset if available:', err);
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
