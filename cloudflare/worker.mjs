import handleF1Request from '../api/f1.mjs';

function withCacheStatus(response, status) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('X-F1-Pulse-Cache', status);
    headers.delete('Vercel-CDN-Cache-Control');
    return new Response(response.body, { status: response.status, headers });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/api/f1') {
            // Validation stays in the shared proxy. Only successful responses enter the cache.
            if (request.method !== 'GET') return handleF1Request(request);
            const canonicalURL = new URL(url);
            canonicalURL.searchParams.sort();
            const key = new Request(canonicalURL, { method: 'GET' });
            const cache = globalThis.caches?.default;
            const cached = cache ? await cache.match(key) : null;
            if (cached) return withCacheStatus(cached, 'HIT');

            const response = await handleF1Request(request);
            if (response.ok && cache) {
                const ttl = Number(response.headers.get('X-F1-Pulse-Cache-TTL')) || 8;
                const cacheHeaders = new Headers(response.headers);
                cacheHeaders.set('Cache-Control', `public, max-age=${ttl}`);
                cacheHeaders.delete('Vercel-CDN-Cache-Control');
                const cacheResponse = new Response(response.clone().body, { headers: cacheHeaders });
                ctx.waitUntil(cache.put(key, cacheResponse).catch(() => {}));
            }
            return response.ok ? withCacheStatus(response, 'MISS') : response;
        }
        if (url.pathname.startsWith('/api/')) {
            return Response.json({ error: 'Unknown API route' }, { status: 404 });
        }
        if (url.pathname === '/') {
            url.pathname = '/index.html';
            return env.ASSETS.fetch(new Request(url, request));
        }
        return env.ASSETS.fetch(request);
    },
};
