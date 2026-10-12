import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
});

test('homepage maps to index and other pages use the asset binding', async () => {
    let servedPath;
    const env = { ASSETS: { fetch: async (request) => {
        servedPath = new URL(request.url).pathname;
        return new Response('page');
    } } };
    await worker.fetch(new Request('https://example.com/'), env, {});
    assert.equal(servedPath, '/index.html');
    await worker.fetch(new Request('https://example.com/drivers.html'), env, {});
    assert.equal(servedPath, '/drivers.html');
});

test('API caches valid JSON, canonicalizes query order and serves subsequent hits', async () => {
    const stored = new Map();
    const pending = [];
    let upstreamCalls = 0;
    globalThis.caches = { default: {
        match: async (key) => stored.get(key.url)?.clone(),
        put: async (key, response) => stored.set(key.url, response),
    } };
    globalThis.fetch = async () => {
        upstreamCalls++;
        return Response.json({ MRData: { season: '2026' } });
    };
    const ctx = { waitUntil: (promise) => pending.push(promise) };
    const first = await worker.fetch(new Request('https://example.com/api/f1?provider=jolpica&path=current.json'), {}, ctx);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('X-F1-Pulse-Cache'), 'MISS');
    assert.equal(first.headers.get('Vercel-CDN-Cache-Control'), null);
    assert.deepEqual(await first.json(), { MRData: { season: '2026' } });
    await Promise.all(pending);
    assert.equal([...stored.values()][0].headers.get('Cache-Control'), 'public, max-age=300');
    const second = await worker.fetch(new Request('https://example.com/api/f1?path=current.json&provider=jolpica'), {}, ctx);
    assert.equal(second.headers.get('X-F1-Pulse-Cache'), 'HIT');
    assert.equal(upstreamCalls, 1);
    assert.deepEqual(await second.json(), { MRData: { season: '2026' } });
});

test('invalid routes and unsupported methods never reach upstream or cache', async () => {
    globalThis.fetch = () => { throw new Error('unexpected upstream request'); };
    const unsafe = await worker.fetch(new Request('https://example.com/api/f1?provider=openf1&path=../secret'), {}, {});
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.headers.get('Cache-Control'), 'private, no-store');
    const invalidProvider = await worker.fetch(new Request('https://example.com/api/f1?provider=constructor&path=current.json'), {}, {});
    assert.equal(invalidProvider.status, 400);
    const post = await worker.fetch(new Request('https://example.com/api/f1', { method: 'POST' }), {}, {});
    assert.equal(post.status, 405);
    const unknown = await worker.fetch(new Request('https://example.com/api/unknown'), {}, {});
    assert.equal(unknown.status, 404);
});

test('upstream failures are returned without being stored', async () => {
    let cacheWrites = 0;
    globalThis.caches = { default: { match: async () => null, put: async () => cacheWrites++ } };
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    const response = await worker.fetch(new Request('https://example.com/api/f1?provider=jolpica&path=current.json'), {}, { waitUntil: () => {} });
    assert.equal(response.status, 502);
    assert.equal(cacheWrites, 0);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
