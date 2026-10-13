/** Local verification server running the same Worker handler, with filesystem static assets. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import worker from "../worker/index.mjs";
const root = resolve("dist"),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
const cache = new Map();
globalThis.caches = {
  default: {
    async match(r) {
      const v = cache.get(r.url);
      if (v && Date.now() < v.expires) return v.response.clone();
      cache.delete(r.url);
    },
    async put(r, response) {
      const ttl = Number(
        response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 0,
      );
      cache.set(r.url, {
        expires: Date.now() + ttl * 1000,
        response: response.clone(),
      });
    },
  },
};
const env = {
  ASSETS: {
    async fetch(request) {
      let path = resolve(
        root,
        "." + decodeURIComponent(new URL(request.url).pathname),
      );
      if (path !== root && !path.startsWith(root + sep))
        return new Response("Not found", { status: 404 });
      try {
        if ((await stat(path)).isDirectory())
          path = resolve(path, "index.html");
        return new Response(await readFile(path), {
          headers: {
            "Content-Type": types[extname(path)] || "application/octet-stream",
          },
        });
      } catch {
        if (extname(path)) return new Response("Not found", { status: 404 });
        return new Response(await readFile(resolve(root, "index.html")), {
          headers: { "Content-Type": "text/html" },
        });
      }
    },
  },
};
createServer(async (req, res) => {
  try {
    const request = new Request("http://127.0.0.1:8787" + req.url, {
      method: req.method,
    });
    const response = await worker.fetch(request, env, {
      waitUntil: (p) => p.catch(() => {}),
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(8787, "0.0.0.0", () =>
  console.log("F1 Pulse verification server: http://127.0.0.1:8787"),
);
