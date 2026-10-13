// Retire the previous site's offline shell after the replacement is deployed.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("f1-pulse-shell-"))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  ),
);
