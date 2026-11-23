
const STATIC_CACHE = 'lokalbites-static-v3';
const PRODUCT_CACHE = 'lokalbites-products-v3';

const APP_FILES = [
  '/index.html',
  '/app.js',
  '/styles.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      await cache.addAll(APP_FILES);

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(key =>
            key.startsWith('lokalbites-') &&
            key !== STATIC_CACHE &&
            key !== PRODUCT_CACHE
          )
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never cache private account or payment APIs.
  if (
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/products'
  ) {
    return;
  }

  // Offline product browsing.
  if (url.pathname === '/api/products') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response.ok) {
            const cache = await caches.open(PRODUCT_CACHE);
            await cache.put(request, response.clone());
          }

          return response;
        } catch {
          const cached = await caches.match(request);

          return cached || new Response(
            JSON.stringify({ products: [] }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );
        }
      })()
    );

    return;
  }

  // Offline app shell and images.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        const cached = await caches.match(request);

        if (cached) return cached;

        if (request.mode === 'navigate') {
          return (
            await caches.match('/index.html') ||
            Response.error()
          );
        }

        return Response.error();
      }
    })()
  );
});
