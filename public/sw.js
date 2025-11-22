// public/sw.js
const CACHE_NAME = 'smartqr-static-v1';
const TAILWIND_CDN = 'https://cdn.tailwindcss.com';

// Install / Activate
self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const reqUrl = new URL(request.url);

  // Cache-first strategy for the Tailwind CDN script
  if (request.url === TAILWIND_CDN || request.url.startsWith(TAILWIND_CDN + '/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cachedResp =>
          cachedResp || fetch(request).then(networkResp => {
            // store a clone
            cache.put(request, networkResp.clone());
            return networkResp;
          }).catch(() => cachedResp) // fallback to cachedResp if network fails
        )
      )
    );
    return;
  }

  // For other requests, prefer network but fallback to cache
  event.respondWith(
    fetch(request)
      .then(networkResp => {
        // Optionally cache static assets (images, scripts) on the fly
        // but keep cache size limited in production
        return networkResp;
      })
      .catch(() => caches.match(request))
  );
});
