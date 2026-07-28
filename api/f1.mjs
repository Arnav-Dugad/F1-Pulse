const PROVIDERS = {
    jolpica: {
        origin: 'https://api.jolpi.ca',
        basePath: '/ergast/f1/',
    },
    openf1: {
        origin: 'https://api.openf1.org',
        basePath: '/v1/',
    },
};

const OPENF1_ENDPOINTS = new Set([
    'drivers',
    'sessions',
    'meetings',
    'position',
    'intervals',
    'laps',
    'weather',
    'stints',
    'pit',
    'race_control',
    'team_radio',
    'location',
    'car_data',
]);

export const config = {
    runtime: 'edge',
};

function jsonResponse(body, status, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            ...extraHeaders,
        },
    });
}

function isValidPath(provider, path) {
    if (!path || path.length > 220 || path.includes('..') || path.includes('//')) return false;
    if (provider === 'openf1') return OPENF1_ENDPOINTS.has(path);
    return /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.json$/.test(path);
}

function isValidQuery(params) {
    if ([...params].length > 16) return false;
    return [...params].every(([key, value]) => (
        /^[a-z_]+(?:[<>])?$/.test(key)
        && value.length <= 160
        && !/[\r\n]/.test(value)
    ));
}

function cacheSeconds(provider, path) {
    if (provider === 'openf1') {
        if (['position', 'intervals', 'weather', 'race_control', 'car_data', 'location'].includes(path)) return 8;
        if (['stints', 'pit', 'laps', 'team_radio'].includes(path)) return 20;
        if (['drivers', 'sessions'].includes(path)) return 300;
        return 3600;
    }

    if (/current\/next\.json$/.test(path)) return 60;
    if (/^current(?:\.json|\/.*standings\.json)$/.test(path)) return 300;
    if (/^current\/last\//.test(path)) return 300;
    if (/^current\//.test(path)) return 900;
    return 86400;
}

export default async function handler(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                Allow: 'GET, OPTIONS',
                'Cache-Control': 'private, no-store',
            },
        });
    }

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, OPTIONS' });
    }

    const incoming = new URL(request.url);
    const providerName = incoming.searchParams.get('provider') || '';
    const path = incoming.searchParams.get('path') || '';
    const provider = PROVIDERS[providerName];

    if (!provider || !isValidPath(providerName, path)) {
        return jsonResponse({ error: 'Unsupported Formula 1 API route' }, 400);
    }

    const upstreamParams = new URLSearchParams(incoming.searchParams);
    upstreamParams.delete('provider');
    upstreamParams.delete('path');
    if (!isValidQuery(upstreamParams)) {
        return jsonResponse({ error: 'Unsupported query parameters' }, 400);
    }

    const upstream = new URL(`${provider.basePath}${path}`, provider.origin);
    upstream.search = upstreamParams.toString();
    const ttl = cacheSeconds(providerName, path);
    const staleWindow = Math.max(60, ttl * 6);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);

    try {
        const response = await fetch(upstream, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            return jsonResponse({
                error: 'Formula 1 data provider unavailable',
                status: response.status,
            }, response.status >= 500 ? 502 : response.status);
        }

        return new Response(response.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=0, must-revalidate',
                'CDN-Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${staleWindow}`,
                'Vercel-CDN-Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${staleWindow}`,
                'X-Content-Type-Options': 'nosniff',
                'X-F1-Pulse-Cache-TTL': String(ttl),
                'X-F1-Pulse-Provider': providerName,
            },
        });
    } catch (error) {
        return jsonResponse({
            error: error?.name === 'AbortError' ? 'Formula 1 data request timed out' : 'Formula 1 data request failed',
        }, 502);
    } finally {
        clearTimeout(timeout);
    }
}
