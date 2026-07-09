// Flagify is now a plain website — no service worker, no offline cache,
// no installability. This file exists ONLY as a one-time kill switch for
// visitors whose browser already registered an earlier version of this
// worker. It clears any cached files, unregisters itself, and forces any
// currently-open tabs (including a home-screen shortcut, if one exists) to
// reload as a normal page with no worker controlling it.
//
// Safe to delete this file entirely a few months from now, once returning
// previously-installed visitors have aged out. Until then, keep it
// deployed at this same path (sw.js) so old registrations can find it.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      await self.registration.unregister();

      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => client.navigate(client.url));
    })()
  );
});
