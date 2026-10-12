const CACHE_NAME = 'f1-pulse-shell-v6';
const APP_SHELL = [
    './',
    './index.html',
    './drivers.html',
    './teams.html',
    './schedule.html',
    './about.html',
    './driver-profile.html',
    './team-profile.html',
    './race-detail.html',
    './404.html',
    './css/core.css',
    './css/premium.css',
    './css/mobile.css',
    './css/finish.css',
    './css/pages/about.css',
    './css/pages/standings.css',
    './css/pages/race.css',
    './css/pages/schedule.css',
    './og.png',
    './favicon.svg',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/f1-tv-logo.svg',
    './js/api.js',
    './js/components.js',
    './js/experience.js',
    './js/home.js',
    './js/drivers.js',
    './js/teams.js',
    './js/schedule.js',
    './js/about-data.js',
    './js/about.js',
    './js/driver-profile.js',
    './js/team-profile.js',
    './js/race-detail.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => new Response(JSON.stringify({
                error: 'Live Formula 1 data is unavailable while offline.',
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }))
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(event.request, { ignoreSearch: true });
                if (cached) return cached;
                if (event.request.mode === 'navigate') return caches.match('./index.html');
                return new Response('This resource is unavailable while offline.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            })
    );
});
