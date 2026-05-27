// RSVP Speed Reader Pro – Service Worker
// Strategie: Cache-First für App-Shell, Network-First für externe Ressourcen

const CACHE_NAME = 'rsvp-reader-v8';
const CACHE_VERSION = 7;

// Ressourcen die beim Install gecacht werden
const APP_SHELL = [
  './index.html',
  './styles.css',
  './db.js',
  './state.js',
  './reader.js',
  './stats.js',
  './backup.js',
  './settings.js',
  './library.js',
  './ui.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Externe CDN-Ressourcen (PDF.js etc.) – werden beim ersten Aufruf gecacht
const CDN_CACHE_NAME = 'rsvp-cdn-v1';
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js',
];

// ── Install: App-Shell in Cache legen ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Alte Caches aufräumen ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CDN_CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-First für App, CDN-Cache für externe Ressourcen ──────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Externe CDN-Anfragen: Cache-First, bei Miss netzwerk + in Cache speichern
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // offline fallback auf gecachte Version
        })
      )
    );
    return;
  }

  // App-Shell und lokale Ressourcen: Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache =>
              cache.put(event.request, response.clone())
            );
          }
          return response;
        });
      })
    );
  }
});

// ── Update-Nachricht an alle Clients senden ───────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
