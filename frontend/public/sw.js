const CACHE_NAME = 'streamforge-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/vite.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing StreamForge Service Worker v2...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // Force immediate activation
    self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating StreamForge Service Worker v2...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Take control of all clients immediately
    self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 🚀 CRÍTICO: Não interceptar chamadas para API, Gateway, Nexus ou Porta de DEV (Vite)
    // Isso evita problemas de streaming, P2P e HMR em desenvolvimento
    if (
        url.port === '3000' ||
        url.port === '3333' ||
        url.port === '3005' ||
        url.port === '5173' || // Porta do Vite DEV
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('/stream/') ||
        url.hostname !== self.location.hostname ||
        url.search.includes('t=') ||
        url.pathname.includes('@vite/client')
    ) {
        return;
    }

    // For navigation requests (HTML pages), use network-first strategy
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // For other requests, use stale-while-revalidate strategy
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Only cache successful responses and GET requests
                    if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch((err) => {
                    if (cachedResponse) return cachedResponse;
                    throw err; // Let it fail normally if not cached
                });

                return cachedResponse || fetchPromise;
            });
        })
    );
});

// Handle push notifications (future use)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || 'Novo conteúdo disponível!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'close', title: 'Fechar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'StreamForge', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

console.log('[SW] StreamForge Service Worker v2 loaded');
