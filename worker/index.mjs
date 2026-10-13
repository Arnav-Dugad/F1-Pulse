const inflight = new Map();
const archives = new Map();
const openEndpoints = new Set([
  "sessions",
  "drivers",
  "laps",
  "car_data",
  "location",
  "position",
  "intervals",
  "pit",
  "stints",
  "race_control",
  "team_radio",
  "weather",
  "session_result",
  "starting_grid",
  "overtakes",
]);
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const fail = (message, status = 400) =>
  Response.json(
    { error: message },
    { status, headers: { ...headers, "Cache-Control": "no-store" } },
  );
export function resolveUpstream(url) {
  const kind = url.pathname.split("/")[2],
    q = new URLSearchParams(url.searchParams),
    path = q.get("path");
  q.delete("path");
  if (
    [...q].length > 16 ||
    [...q].some(
      ([k, v]) =>
        !/^\w+(?:[<>]=?)?$/.test(k) || v.length > 180 || /[\r\n]/.test(v),
    )
  )
    throw Error("Invalid query");
  if (kind === "jolpica") {
    if (
      !path ||
      !/^([\w-]+\/)*[\w-]+\.json$/.test(path) ||
      path.includes("..") ||
      path.length > 220
    )
      throw Error("Invalid results path");
    q.set(
      "limit",
      String(Math.min(100, Math.max(1, Number(q.get("limit") || 100)))),
    );
    return {
      kind,
      url: new URL("https://api.jolpi.ca/ergast/f1/" + path + "?" + q),
      ttl: 600,
    };
  }
  if (kind === "openf1") {
    if (!openEndpoints.has(path)) throw Error("Invalid archive endpoint");
    if (path === "sessions") {
      if (
        !/^20\d\d$/.test(q.get("year") || "") &&
        !/^\d+$/.test(q.get("session_key") || "")
      )
        throw Error("Choose an archive year");
    } else if (!/^\d+$/.test(q.get("session_key") || ""))
      throw Error("Choose a historical session");
    if (["car_data", "location"].includes(path)) {
      const start = Date.parse(q.get("date>=") || ""),
        end = Date.parse(q.get("date<=") || "");
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end - start > 180000 ||
        !/^\d+$/.test(q.get("driver_number") || "")
      )
        throw Error(
          "Telemetry requires one driver and a window of up to three minutes",
        );
    }
    const upstreamQuery = new URLSearchParams(
      [...q].map(([k, v]) => [k.endsWith("=") ? k.slice(0, -1) : k, v]),
    );
    return {
      kind,
      url: new URL("https://api.openf1.org/v1/" + path + "?" + upstreamQuery),
      ttl: 3600,
    };
  }
  if (kind === "weather") {
    const lat = Number(q.get("latitude")),
      lon = Number(q.get("longitude"));
    if (
      !q.has("latitude") ||
      !q.has("longitude") ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw Error("Invalid circuit coordinates");
    return {
      kind,
      url: new URL(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation_probability&forecast_days=7&timezone=auto`,
      ),
      ttl: 1800,
    };
  }
  if (kind === "wiki") {
    const title = q.get("title");
    if (!title || title.length > 140 || /[\r\n]/.test(title))
      throw Error("Invalid article");
    return {
      kind,
      url: new URL(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
          encodeURIComponent(title),
      ),
      ttl: 86400,
    };
  }
  if (kind === "news")
    return {
      kind,
      url: new URL("https://feeds.bbci.co.uk/sport/formula1/rss.xml"),
      ttl: 900,
    };
  throw Error("Unknown data source");
}
const clean = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
export function parseNews(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 30)
    .map((m) => {
      const tag = (n) =>
        clean(
          m[1].match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`))?.[1] || "",
        );
      return {
        title: tag("title"),
        url: tag("link"),
        date: tag("pubDate"),
        publisher: "BBC Sport",
      };
    })
    .filter(
      (x) => x.title && /^https:\/\/(www\.)?bbc\.(com|co\.uk)\//.test(x.url),
    );
}
async function archiveAllowed(key) {
  if (archives.has(key)) return archives.get(key);
  const r = await fetch(
    "https://api.openf1.org/v1/sessions?session_key=" + key,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!r.ok) return false;
  const a = await r.json();
  const ok =
    Array.isArray(a) &&
    a.length > 0 &&
    Date.parse(a[0].date_end) < Date.now() - 30 * 60000;
  if (ok) archives.set(key, true);
  return ok;
}
async function getData(spec) {
  if (
    spec.kind === "openf1" &&
    spec.url.searchParams.has("session_key") &&
    spec.url.pathname != "/v1/sessions" &&
    !(await archiveAllowed(spec.url.searchParams.get("session_key")))
  )
    return fail(
      "This session is not available in the free historical archive.",
      403,
    );
  const r = await fetch(spec.url, {
    headers: {
      Accept: spec.kind === "news" ? "application/xml" : "application/json",
      "User-Agent": "F1Pulse/2.0 (independent noncommercial fan site)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 404 && spec.kind === "openf1")
    return Response.json(
      {
        data: [],
        meta: {
          source: spec.kind,
          url: spec.url.toString(),
          fetchedAt: new Date().toISOString(),
          status: "No archived measurements for this selection",
        },
      },
      { headers: { ...headers, "Cache-Control": "public, max-age=300" } },
    );
  if (!r.ok)
    return fail(
      r.status === 429
        ? "Source rate limit reached. Please try again shortly."
        : `Source unavailable (HTTP ${r.status}).`,
      r.status === 429 ? 429 : r.status === 403 ? 403 : 502,
    );
  const data =
    spec.kind === "news" ? parseNews(await r.text()) : await r.json();
  return Response.json(
    {
      data,
      meta: {
        source: spec.kind,
        url: spec.url.toString(),
        fetchedAt: new Date().toISOString(),
        status: spec.kind === "openf1" ? "Historical" : "Published source data",
      },
    },
    { headers: { ...headers, "Cache-Control": `public, max-age=${spec.ttl}` } },
  );
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET") return fail("Read-only API", 405);
    let spec;
    try {
      spec = resolveUpstream(url);
    } catch (e) {
      return fail(e.message);
    }
    const canonical = new URL(url);
    canonical.searchParams.sort();
    const key = new Request(canonical);
    const cache = globalThis.caches?.default;
    const hit = await cache?.match(key);
    if (hit) return hit;
    const id = canonical.toString();
    if (inflight.has(id)) return (await inflight.get(id)).clone();
    const promise = getData(spec).catch(() =>
      fail("Source timed out or could not be reached.", 502),
    );
    inflight.set(id, promise);
    try {
      const response = await promise;
      if (response.ok && cache) ctx.waitUntil(cache.put(key, response.clone()));
      return response.clone();
    } finally {
      inflight.delete(id);
    }
  },
};
