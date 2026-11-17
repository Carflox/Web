const SHELL_CACHE = 'yc-nice-lady-shell-v13-kit-font';
const IMAGE_CACHE = 'yc-nice-lady-images-v1';
const IMAGE_CACHE_LIMIT = 120;
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/img/pwa-icon.svg',
  '/img/logo-transparent.png?v=20261114-1',
  '/css/style.css?v=kit-options-20261116-5',
  '/js/script.js',
  '/js/supabase-config.js',
  '/js/store.js?v=kit-options-20261116-3',
  '/js/admin.js?v=kit-options-20261116-1'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('yc-nice-lady-') && ![SHELL_CACHE, IMAGE_CACHE].includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Esta sección necesita conexión a internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        return (await caches.match(request)) || (await caches.match('/')) || (await caches.match('/index.html')) || new Response('YC NICE LADY necesita abrirse una vez con internet para guardar la tienda en este dispositivo.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (url.pathname.includes('/storage/v1/object/public/')
    || (url.pathname.includes('/storage/buckets/') && url.pathname.includes('/files/'))) {
    const cachePromise = caches.open(IMAGE_CACHE);
    const updatePromise = cachePromise.then(cache => fetch(request).then(async response => {
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        await trimImageCache(cache);
      }
      return response;
    }));
    event.waitUntil(updatePromise.catch(() => {}));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const saved = await cache.match(request);
      if (saved) return saved;
      try { return await updatePromise; }
      catch { return new Response('', { status: 504, statusText: 'Offline image unavailable' }); }
    })());
    return;
  }

  if (url.origin === self.location.origin && /\.(?:css|js|svg|png|jpe?g|webp|woff2?)$/i.test(url.pathname)) {
    const cachePromise = caches.open(SHELL_CACHE);
    const updatePromise = cachePromise.then(cache => fetch(request).then(async response => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
    event.waitUntil(updatePromise.catch(() => {}));
    event.respondWith((async () => {
      const cache = await cachePromise;
      const saved = await cache.match(request);
      if (saved) return saved;
      return updatePromise;
    })());
  }
});

async function trimImageCache(cache) {
  const requests = await cache.keys();
  while (requests.length > IMAGE_CACHE_LIMIT) await cache.delete(requests.shift());
}
