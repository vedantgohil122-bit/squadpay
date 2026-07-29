// SquadPay Service Worker v2 — full offline + push support
// - App shell cache (HTML/CSS/JS/icons)
// - API GET cache (stale-while-revalidate) for offline viewing
// - Background sync for queued mutations
// - Push notification handling

const SHELL_CACHE = 'squadpay-shell-v3';
const API_CACHE = 'squadpay-api-v3';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Background sync for offline queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'squadpay-sync') {
    event.waitUntil(
      // Notify clients to flush queue
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'SYNC_QUEUE' }));
      })
    );
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || 'SquadPay 🔔';
  const options = {
    body: data.body || data.message || 'Squad mein kuch naya hua hai',
    icon: '/icon-192.png',
    badge: '/favicon.png',
    tag: data.tag || 'squadpay',
    data: data,
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || (data.squadId ? `/app/squad/${data.squadId}` : '/app');
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests — stale-while-revalidate for GET, network-only for mutations
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      event.respondWith(
        caches.open(API_CACHE).then((cache) =>
          cache.match(request).then((cached) => {
            const fetchPromise = fetch(request)
              .then((resp) => {
                if (resp.ok) cache.put(request, resp.clone());
                return resp;
              })
              .catch(() => cached);
            return cached || fetchPromise;
          })
        )
      );
    }
    // POST/PUT/DELETE go to network — if offline, client will queue via IndexedDB
    return;
  }

  // Navigation: network-first, fallback to cache + offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
