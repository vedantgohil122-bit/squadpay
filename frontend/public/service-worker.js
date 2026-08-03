// ============================================================
// SERVICE WORKER — app-shell caching only (no offline data sync)
// This is intentionally minimal: it caches the static build files
// (HTML/CSS/JS/icons) so the app installs properly as a PWA and
// loads instantly on repeat visits. It does NOT cache API responses
// or attempt to serve expense/squad data offline — that's a
// separate, bigger feature (see SquadPay roadmap: offline support).
//
// Network-first for navigation requests (so users always get the
// latest deployed version), cache-first for static assets (so
// repeat loads are instant).
// ============================================================

const CACHE_NAME = 'squadpay-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {
      // If pre-caching fails (e.g. offline during install), don't block activation
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept API calls — those must always hit the network live.
  // Caching API responses here would risk showing stale balances/expenses,
  // which is worse than just failing when offline.
  if (request.url.includes('/api/')) return;

  // Navigation requests (loading the app itself): try network first so
  // users always get the latest deployed build; fall back to cache only
  // if genuinely offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets (JS/CSS/images): cache-first for speed, since these are
  // content-hashed by Vite and safe to cache aggressively.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// ------------------------------------------------------------
// PUSH — v6.1: this is what makes a notification show up even
// when the app/tab is fully closed. The browser wakes this
// service worker up when a push arrives from our backend
// (see backend/src/services/push.service.js), regardless of
// whether SquadPay is open anywhere.
// ------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = { title: 'SquadPay', body: 'Naya update aaya hai 🔔', url: '/app' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/app' },
      tag: data.notificationId || undefined, // dedupes if the same notification is pushed twice
    })
  );
});

// Clicking the OS notification focuses an already-open SquadPay tab if one
// exists, otherwise opens a new one — either way, lands on the right squad.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(targetUrl); return client.focus(); }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
