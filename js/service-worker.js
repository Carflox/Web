const VERSION = 'appwrite-20261121-1';
const SHELL_CACHE = 'yc-nice-lady-shell-v14-appwrite';
const IMAGE_CACHE = 'yc-nice-lady-images-v1';
const IMAGE_CACHE_LIMIT = 120;

// Debe coincidir con las rutas y versiones de index.html.
const SHELL_ASSETS = [
    '/',
    '/manifest.webmanifest',
    '/img/pwa-icon.svg',
    '/img/logo-transparent.png?v=20261121-1',
    `/css/style.css?v=${VERSION}`,
    `/js/script.js?v=${VERSION}`,
    `/js/config.js?v=${VERSION}`,
    `/js/store.js?v=${VERSION}`
];

const OFFLINE_HOME =
    'YC NICE LADY necesita abrirse una vez con internet para guardar la tienda en este dispositivo.';

self.addEventListener('install', event => {
    event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);

    // Un archivo que falle ya no cancela toda la instalación.
    await Promise.allSettled(SHELL_ASSETS.map(asset => cache.add(asset)));
    await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
    const names = await caches.keys();

    await Promise.all(
        names
        .filter(name => name.startsWith('yc-nice-lady-') && ![SHELL_CACHE, IMAGE_CACHE].includes(name))
        .map(name => caches.delete(name))
    );

    await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    if (request.mode === 'navigate' && sameOrigin) {
    event.respondWith(handleNavigation(request, url));
    return;
    }

  // Fotos de productos en Appwrite Storage: se muestran de inmediato desde caché.
    if (url.pathname.includes('/storage/buckets/') && url.pathname.includes('/files/')) {
    event.respondWith(cacheFirstImage(event, request));
    return;
    }

    if (!sameOrigin) return;

  // Código (JS y CSS): siempre lo más nuevo; la caché solo sirve sin internet.
    if (/\.(?:js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
    }

    if (/\.(?:svg|png|jpe?g|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request));
    }
});

async function handleNavigation(request, url) {
    const isHome = url.pathname === '/' || url.pathname === '/index.html';

    try {
    const response = await fetch(request);

    if (response.ok && isHome) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put('/', response.clone());
    }

    return response;
    } catch {
    if (!isHome) {
        return new Response('Esta sección necesita conexión a internet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    return (
        (await caches.match('/')) ||
        new Response(OFFLINE_HOME, {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
    );
    }
}

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);

    try {
    const response = await fetch(request);

    if (response.ok) await cache.put(request, response.clone());

    return response;
    } catch {
    return (await cache.match(request)) || new Response('', { status: 504 });
    }
}

async function staleWhileRevalidate(event, request) {
    const cache = await caches.open(SHELL_CACHE);
    const saved = await cache.match(request);

    const update = fetch(request)
    .then(async response => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
    })
    .catch(() => null);

    event.waitUntil(update);

    return saved || (await update) || new Response('', { status: 504 });
}

async function cacheFirstImage(event, request) {
    const cache = await caches.open(IMAGE_CACHE);
    const saved = await cache.match(request);

    const update = fetch(request)
    .then(async response => {
        if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        await trimImageCache(cache);
        }

        return response;
    })
    .catch(() => null);

    event.waitUntil(update);

    return (
    saved ||
    (await update) ||
    new Response('', { status: 504, statusText: 'Imagen sin conexión' })
    );
}

async function trimImageCache(cache) {
    const keys = await cache.keys();

    for (const key of keys.slice(0, Math.max(0, keys.length - IMAGE_CACHE_LIMIT))) {
    await cache.delete(key);
    }
}