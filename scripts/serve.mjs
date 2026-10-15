/**
 * Local verification server running the same Worker handler, with filesystem static assets and the
 * response headers from dist/_headers (CSP, caching) applied as Cloudflare would. Set
 * PULSE_NO_HEADERS=1 to serve without them.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import worker from "../worker/index.mjs";
const root = resolve(process.env.PULSE_DIST || "dist"),
  port = Number(process.env.PULSE_PORT || 8787),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".png": "image/png",
    ".ttf": "font/ttf",
    ".avif": "image/avif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain",
    ".mp3": "audio/mpeg",
  };
/** Minimal Cloudflare `_headers` support: path patterns with `*` splats, later rules win. */
const headerRules = [];
if (process.env.PULSE_NO_HEADERS !== "1") {
  try {
    let rule = null;
    for (const line of (await readFile(resolve(root, "_headers"), "utf8")).split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      if (!/^\s/.test(line)) {
        const pattern = new RegExp("^" + line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
        headerRules.push((rule = { pattern, headers: {} }));
      } else if (rule) {
        const i = line.indexOf(":");
        if (i > 0) rule.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
    }
  } catch {}
}
const ruleHeaders = (pathname) =>
  Object.assign({}, ...headerRules.filter((r) => r.pattern.test(pathname)).map((r) => r.headers));
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
            "Cache-Control":
              extname(path) === ".html" ? "no-cache" : "no-store",
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
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:${port}` + req.url, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
      ...(chunks.length && !["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await worker.fetch(request, env, {
      waitUntil: (p) => p.catch(() => {}),
    });
    const extra = new URL(request.url).pathname.startsWith("/api/") ? {} : ruleHeaders(new URL(request.url).pathname);
    res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...extra });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`F1 Pulse verification server: http://127.0.0.1:${port}`),
);
