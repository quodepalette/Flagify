// Flagify service worker — offline-first cache for the app shell.
// Bump this version string whenever you change index.html/scripts.js/styles.css
// so returning visitors pick up the new files instead of a stale cache.
const CACHE_NAME = 'flagify-cache-v4';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './scripts.js',
  './countries-data.json',
  './manifest.json',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Cache-first for the app shell, falling back to the network (and caching
// the response) for anything else — like flag images from the CDN.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          // Network failed and we had nothing cached for this exact
          // request. Returning `undefined` here (the old behavior, via
          // `.catch(() => cached)` where `cached` was undefined) is invalid
          // for respondWith() and Chrome/Brave turn that into a hard
          // net::ERR_FAILED for the whole navigation — even for users who
          // already have the app shell cached.
          //
          // For page navigations, fall back to the cached shell so the app
          // still opens instead of hard-failing during a network blip.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then(
              (shell) => shell || Response.error()
            );
          }
          // For everything else (images, data, etc.) let it fail as a
          // normal, well-formed network error response instead of an
          // invalid undefined value.
          return Response.error();
        });
    })
  );
});
