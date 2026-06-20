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
