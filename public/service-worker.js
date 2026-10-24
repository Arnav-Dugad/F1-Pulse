/**
 * F1 Pulse service worker.
 * - App shell (built index.html + hashed assets) is precached at install. The list and version are
 *   injected at build time by the `pulse-pwa` plugin in vite.config.js (between the markers below).
 * - Navigations are network-first: a deploy is picked up immediately; the cached shell is only used
 *   when the network is unreachable.
 * - Hashed /assets/* are cache-first. The previous build's shell is kept for one generation so open
 *   tabs can still lazy-load their (old) page chunks; anything else falls back to the app's
 *   stale-chunk reload.
 * - /media/*, /data/* and /icons/* are stale-while-revalidate.
 * - API: completed seasons (immutable) are cache-first for a week; the current season and live
 *   sources are network-first with the cached copy as an offline fallback.
 */
const BUILD = /*__PULSE_BUILD__*/ null /*__PULSE_BUILD_END__*/ || { version: "dev", files: [] };
const SHELL = "pulse-shell-" + BUILD.version;
const MEDIA = "pulse-media-v1";
const DATA = "pulse-data-v1";
const API = "pulse-api-v1";
const LIMITS = { [MEDIA]: 500, [DATA]: 40, [API]: 400 };
const API_MAX_AGE = 7 * 864e5;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one missing file cannot block the update; the shell page is mandatory.
      await Promise.all(
        BUILD.files.map(async (file) => {
          const response = await fetch(new Request(file === "/index.html" ? "/" : file, { cache: "reload" }));
          if (response.ok) await cache.put(file, response);
          else if (file === "/index.html") throw Error("Shell unavailable");
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Keep this build and the newest previous one (versions start with a base-36 timestamp).
      const shells = keys.filter((k) => k.startsWith("pulse-shell-") && k !== SHELL).sort();
      const previous = shells.filter((k) => k < SHELL).at(-1);
      await Promise.all(
        keys
          .filter((k) => k.startsWith("f1-pulse-shell-") || (k.startsWith("pulse-shell-") && k !== SHELL && k !== previous))
          .map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const extra = keys.length - (LIMITS[name] || 200);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}
const cacheable = (response) => response && response.status === 200 && response.type === "basic";
function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function navigation(event) {
  try {
    const preload = await event.preloadResponse;
    const response = preload || (await fetch(event.request));
    if (cacheable(response) && (response.headers.get("content-type") || "").includes("text/html")) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL).then((c) => c.put("/index.html", copy)));
    }
    return response;
  } catch {
    return (
      (await caches.match("/index.html")) ||
      new Response("<!doctype html><meta charset=utf-8><title>Offline</title><p>F1 Pulse is offline.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function asset(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Never keep an SPA fallback page under a script/style URL.
  if (cacheable(response) && !(response.headers.get("content-type") || "").includes("text/html")) {
    const copy = response.clone();
    caches.open(SHELL).then((c) => c.put(request, copy));
  }
  return response;
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const network = fetch(event.request)
    .then(async (response) => {
      if (cacheable(response)) {
        await cache.put(event.request, response.clone());
        trim(name);
      }
      return response;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

/** Seasons before the current year never change; historical archives (OpenF1, ERA5) neither. */
function immutable(url) {
  const year = new Date().getFullYear();
  const path = url.pathname;
  if (path === "/api/season") return /^\d{4}$/.test(url.searchParams.get("year") || "") && +url.searchParams.get("year") < year;
  if (path === "/api/jolpica") {
    const m = (url.searchParams.get("path") || "").match(/^(\d{4})\//);
    return !!m && +m[1] < year;
  }
  return path === "/api/openf1" || path === "/api/climate";
}

async function api(event, url) {
  const cache = await caches.open(API);
  const put = (response) => {
    if (!cacheable(response)) return response;
    const copy = stamp(response.clone());
    event.waitUntil(cache.put(event.request, copy).then(() => trim(API)));
    return response;
  };
  if (immutable(url)) {
    const hit = await cache.match(event.request);
    if (hit && Date.now() - Number(hit.headers.get("sw-cached-at") || 0) < API_MAX_AGE) return hit;
    try {
      return put(await fetch(event.request));
    } catch (e) {
      if (hit) return hit;
      throw e;
    }
  }
  try {
    const response = await fetch(event.request);
    if (response.status >= 500 || response.status === 429) {
      const hit = await cache.match(event.request);
      if (hit) return hit;
    }
    return put(response);
  } catch (e) {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") return event.respondWith(navigation(event));
  const path = url.pathname;
  if (path === "/service-worker.js" || path === "/api/status" || path === "/api/hit") return;
  if (path.startsWith("/assets/")) return event.respondWith(asset(request));
  if (path.startsWith("/media/") || path.startsWith("/icons/")) return event.respondWith(staleWhileRevalidate(event, MEDIA));
  if (path.startsWith("/data/")) return event.respondWith(staleWhileRevalidate(event, DATA));
  if (path.startsWith("/api/")) return event.respondWith(api(event, url));
  // Anything else in the precached shell (theme script, favicon, manifest): network, then cache.
  event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
});

// Session reminders: focus an open F1 Pulse window (or open one) at the notification's page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w)) : self.clients.openWindow(url);
    }),
  );
});
