const CACHE_NAME = 'order-manager-cache-v1';
const urlsToCache = [
  './',  // Cache the root
  './orders.html',  // Entry point
  './products.html',  // Other pages
  './borrowers.html',
  './statistics.html',
  './import_export.html',
  './css/borrowers.css',  // CSS files (add all your CSS)
  './js/db.js',  // JS files (add all your JS)
  './js/orders.js',
  './js/products.js',
  './js/borrowers.js',
  './ui/orders_ui.js',
  './ui/borrowers_ui.js',  // Add others as needed
  'https://sql.js.org/dist/sql-wasm.js',  // Cache SQL.js (from CDN)
  'https://sql.js.org/dist/sql-wasm.wasm'  // Cache the WASM binary (critical for offline SQL.js)
  // Add any initial DB file if you have one, e.g., './data/initial.db'
];

// Install event: Cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();  // Activate SW immediately
});

// Activate event: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();  // Take control of pages immediately
});

// Fetch event: Serve from cache offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;  // Serve from cache
        }
        // Online: Fetch and cache dynamically
        return fetch(event.request).then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return networkResponse;
        });
      }).catch(() => {
        // Offline fallback (optional: return a cached offline page)
        return caches.match('./orders.html');
      })
  );
});