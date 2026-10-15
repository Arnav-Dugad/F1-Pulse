import { validSeason, mergeRacePage } from "../src/domain.mjs";
const inflight = new Map();
export function legacyDestination(url) {
  const routes = {
    "/drivers.html": "drivers",
    "/teams.html": "teams",
    "/schedule.html": "calendar",
    "/about.html": "settings",
    "/driver-profile.html": "drivers",
    "/team-profile.html": "teams",
    "/race-detail.html": "calendar",
  };
  let route = routes[url.pathname];
  if (!route) return null;
  const driver = url.searchParams.get("driver"),
    team = url.searchParams.get("team"),
    round = url.searchParams.get("round");
  if (url.pathname === "/driver-profile.html" && /^[\w-]+$/.test(driver || ""))
    route = "driver/" + driver;
  if (url.pathname === "/team-profile.html" && /^[\w-]+$/.test(team || ""))
    route = "team/" + team;
  if (url.pathname === "/race-detail.html" && /^\d{1,3}$/.test(round || ""))
    route = "race/" + round;
  const season = url.searchParams.get("season");
  const destination = new URL("/", url);
  destination.hash =
    "/" + route + "?season=" + (validSeason(season) ? season : "current");
  return destination.toString();
}
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
  if (!/^\/api\/(jolpica|openf1|weather|climate|wiki|news)$/.test(url.pathname))
    throw Error("Unknown data source");
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
    const limit = Number(q.get("limit") ?? 100),
      offset = Number(q.get("offset") ?? 0);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      throw Error("Invalid pagination");
    q.set("limit", String(Math.min(100, limit)));
    // Completed seasons never change, so they can be cached at the edge for a day.
    const year = Number(path.match(/^(\d{4})\//)?.[1]);
    return {
      kind,
      url: new URL("https://api.jolpi.ca/ergast/f1/" + path + "?" + q),
      ttl: year && year < new Date().getUTCFullYear() ? 86400 : 600,
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
      !q.get("latitude").trim() ||
      !q.get("longitude").trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw Error("Invalid circuit coordinates");
    return {
      kind,
      url: new URL(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation_probability&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`,
      ),
      ttl: 1800,
    };
  }
  if (kind === "climate") {
    // Open-Meteo historical reanalysis: hourly detail for up to 7 days, daily summaries for up to 12 years.
    const lat = Number(q.get("latitude")),
      lon = Number(q.get("longitude")),
      start = q.get("start_date") || "",
      end = q.get("end_date") || "",
      mode = q.get("mode") === "hourly" ? "hourly" : "daily";
    const days = (Date.parse(end) - Date.parse(start)) / 864e5;
    if (
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      !(days >= 0) || days > (mode === "hourly" ? 7 : 4400) || Date.parse(start) < Date.parse("1950-01-01")
    )
      throw Error("Invalid climate request");
    const fields =
      mode === "hourly"
        ? "hourly=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,cloud_cover"
        : "daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset";
    return {
      kind,
      url: new URL(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&${fields}&timezone=auto`),
      ttl: 604800,
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
  const upstream = () =>
    fetch(spec.url, {
      headers: {
        Accept: spec.kind === "news" ? "application/xml" : "application/json",
        "User-Agent": "F1Pulse/3.0 (independent noncommercial fan site)",
      },
      signal: AbortSignal.timeout(20000),
    });
  let r = await upstream();
  // Ride out short upstream rate-limit bursts once before reporting them.
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    r = await upstream();
  }
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

/* ─────────── Precomputed season data ─────────── */
export const VERSION = "3.1.0";
const JOLPICA = "https://api.jolpi.ca/ergast/f1/";
const UA = "F1Pulse/3.1 (independent noncommercial fan site)";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
/** Seasons before the running year never change, so they can live at the edge for a day. */
export const seasonTtl = (year, now = new Date()) =>
  /^\d{4}$/.test(String(year)) && +year < now.getUTCFullYear() ? 86400 : 600;

/** One Jolpica JSON document, with the proxy's timeout and single 429 retry. */
async function jolpica(path, params = {}) {
  const url = new URL(JOLPICA + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const get = () =>
    fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
  let r = await get();
  if (r.status === 429) {
    await pause(1500);
    r = await get();
  }
  if (!r.ok)
    throw new UpstreamError(
      r.status === 429
        ? "Source rate limit reached. Please try again shortly."
        : `Source unavailable (HTTP ${r.status}).`,
      r.status === 429 ? 429 : 502,
    );
  return r.json();
}

/**
 * Every page of a Jolpica race table, merged per race, as the browser's paginated path assembles
 * it. Requests are sequential and spaced to respect Jolpica's burst limit.
 */
export async function collectRaces(path, key, { gap = 260, get = jolpica } = {}) {
  let offset = 0,
    total = Infinity,
    requests = 0;
  const merged = new Map();
  while (offset < total) {
    if (requests) await pause(gap);
    const mr = (await get(path, { limit: 100, offset })).MRData;
    requests++;
    total = Number(mr?.total);
    const limit = Number(mr?.limit);
    const races = mr?.RaceTable?.Races;
    if (!Number.isFinite(total) || !Array.isArray(races))
      throw new UpstreamError("Invalid results pagination", 502);
    for (const race of races) {
      // A race's rows can straddle two pages: append them in page order.
      const prev = merged.get(race.round);
      merged.set(race.round, { ...race, [key]: [...(prev?.[key] || []), ...(race[key] || [])] });
    }
    if (!Number.isInteger(limit) || limit < 1 || (offset < total && !races.length))
      throw new UpstreamError("Incomplete results pagination", 502);
    offset += limit;
    if (offset > 10000) throw new UpstreamError("Too many results", 502);
  }
  const data = [...merged.values()].sort((a, b) => +a.round - +b.round);
  return { data, requests };
}

/** Calendar, race results and sprint results for one season in a single envelope. */
export async function seasonData(year, opts = {}) {
  const get = opts.get || jolpica;
  const gap = opts.gap ?? 260;
  const calendarDoc = await get(`${year}.json`, { limit: 100 });
  const calendar = calendarDoc?.MRData?.RaceTable?.Races;
  if (!Array.isArray(calendar)) throw new UpstreamError("Invalid calendar", 502);
  const season = calendar[0]?.season || calendarDoc.MRData.RaceTable.season || String(year);
  await pause(gap);
  const results = await collectRaces(`${year}/results.json`, "Results", { gap, get });
  // Sprints only exist from 2021; skip the request for older seasons.
  let sprints = { data: [], requests: 0 };
  if (+season >= 2021) {
    await pause(gap);
    sprints = await collectRaces(`${year}/sprint.json`, "SprintResults", { gap, get });
  }
  // Keep the client's merge semantics for race results (latest page wins per driver).
  const merged = mergeRacePage([], results.data);
  return {
    data: {
      season,
      round: merged.at(-1)?.round || "0",
      calendar,
      results: merged,
      sprints: sprints.data,
    },
    meta: {
      source: "jolpica",
      url: `${JOLPICA}${year}/results.json`,
      fetchedAt: new Date().toISOString(),
      status: "Published source data",
      requests: 1 + results.requests + sprints.requests,
    },
  };
}

async function seasonResponse(year, env, { persist = false } = {}) {
  const completed = seasonTtl(year) === 86400;
  const ok = (body) =>
    Response.json(body, { headers: { ...headers, "Cache-Control": `public, max-age=${seasonTtl(year)}` } });
  // Completed seasons are immutable: KV (when bound) serves them globally, also where the Cache API is
  // unavailable (e.g. *.workers.dev), so Jolpica is asked at most once a month per season.
  if (completed && env?.PULSE_KV) {
    const stored = await env.PULSE_KV.get(`season:${year}`, "json").catch(() => null);
    if (stored?.data) return ok(stored);
  }
  try {
    const body = await seasonData(year);
    // Completed: global copy (written on a KV miss only). Current: last-known-good copy for when
    // Jolpica is unreachable, written by the scheduled refresh only, to stay within KV write limits.
    if (env?.PULSE_KV && (completed || (year === "current" && persist)))
      await env.PULSE_KV.put(`season:${year}`, JSON.stringify(body), completed ? { expirationTtl: 30 * 86400 } : undefined).catch(() => {});
    return ok(body);
  } catch (e) {
    const saved = year === "current" && env?.PULSE_KV ? await env.PULSE_KV.get("season:current", "json").catch(() => null) : null;
    if (saved?.data)
      return Response.json(
        { ...saved, meta: { ...saved.meta, status: "Saved response — source offline", snapshot: true } },
        { headers: { ...headers, "Cache-Control": "public, max-age=60" } },
      );
    if (e instanceof UpstreamError) return fail(e.message, e.status);
    throw e;
  }
}

/* ─────────── Edge cache ─────────── */
async function edgeCached(url, ctx, produce, { fresh = false } = {}) {
  const canonical = new URL(url);
  canonical.searchParams.sort();
  const key = new Request(canonical);
  const cache = globalThis.caches?.default;
  if (!fresh) {
    const hit = await cache?.match(key);
    if (hit) return hit;
  }
  const id = canonical.toString();
  if (inflight.has(id)) return (await inflight.get(id)).clone();
  const promise = produce().catch(() => fail("Source timed out or could not be reached.", 502));
  inflight.set(id, promise);
  try {
    const response = await promise;
    if (response.ok && cache) ctx?.waitUntil?.(cache.put(key, response.clone()));
    return response.clone();
  } finally {
    inflight.delete(id);
  }
}

async function api(request, env, ctx, opts) {
  const url = new URL(request.url);
  if (url.pathname === "/api/hit") return hit(request, env);
  if (request.method !== "GET") return fail("Read-only API", 405);
  if (url.pathname === "/api/status") return status(env);
  if (url.pathname === "/api/season") {
    const year = url.searchParams.get("year") || "";
    if ([...url.searchParams.keys()].some((k) => k !== "year") || !validSeason(year, new Date().getUTCFullYear()))
      return fail("Choose a season between 1950 and the current year");
    return edgeCached(url, ctx, () => seasonResponse(year, env, { persist: !!opts?.fresh }), opts);
  }
  let spec;
  try {
    spec = resolveUpstream(url);
  } catch (e) {
    return fail(e.message);
  }
  return edgeCached(url, ctx, () => getData(spec), opts);
}

/* ─────────── Privacy-friendly page-view beacon ─────────── */
/** Route path only: no query, no identifiers beyond the page itself. */
export function normalizeHitPath(value) {
  if (typeof value !== "string") return null;
  const path = value.replace(/^[#/]+/, "").split(/[?#]/)[0].toLowerCase();
  if (path.length > 100 || !/^[a-z0-9_\-/]*$/.test(path)) return null;
  return "/" + path.replace(/\/+$/, "");
}
async function hit(request, env) {
  const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return fail("Use POST", 405);
  if (request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1") return noContent();
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Cross-site beacon", 403);
  if (Number(request.headers.get("Content-Length") || 0) > 1024) return fail("Beacon too large", 413);
  const text = (await request.text()).slice(0, 1024);
  let raw = text;
  try {
    raw = JSON.parse(text)?.path;
  } catch {}
  const path = normalizeHitPath(raw);
  if (path === null) return fail("Invalid path");
  // No cookies, IP address or user agent are stored: just the page and the visitor's country.
  try {
    env?.PULSE_ANALYTICS?.writeDataPoint({
      blobs: [path, String(request.cf?.country || "XX")],
      doubles: [1],
      indexes: [path.slice(0, 96)],
    });
  } catch {}
  return noContent();
}

/* ─────────── Scheduled refresh + accuracy self-check ─────────── */
let lastReport = null;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/**
 * Re-adds race and sprint points per driver and constructor up to the standings round and compares
 * them with the official tables. Points deductions or late classification changes show up here.
 */
export function auditSeason(season, driverList, constructorList) {
  const round = Number(driverList?.round || constructorList?.round || season.round || 0);
  const sums = { drivers: new Map(), constructors: new Map() };
  const add = (map, id, pts) => id && map.set(id, (map.get(id) || 0) + num(pts));
  for (const race of [...(season.results || []), ...(season.sprints || [])]) {
    if (+race.round > round) continue;
    for (const row of [...(race.Results || []), ...(race.SprintResults || [])]) {
      add(sums.drivers, row.Driver?.driverId, row.points);
      add(sums.constructors, row.Constructor?.constructorId, row.points);
    }
  }
  const compare = (rows, idOf, map) => {
    const mismatches = [];
    const seen = new Set();
    for (const row of rows || []) {
      const id = idOf(row);
      seen.add(id);
      const expected = Math.round((map.get(id) || 0) * 100) / 100;
      const official = num(row.points);
      if (Math.abs(expected - official) > 0.001) mismatches.push({ id, computed: expected, official });
    }
    for (const [id, pts] of map) if (!seen.has(id) && pts > 0) mismatches.push({ id, computed: pts, official: null });
    return { checked: (rows || []).length, mismatches };
  };
  const drivers = compare(driverList?.DriverStandings, (r) => r.Driver?.driverId, sums.drivers);
  const constructors = constructorList
    ? compare(constructorList.ConstructorStandings, (r) => r.Constructor?.constructorId, sums.constructors)
    : { checked: 0, mismatches: [] };
  const resultsRound = Number(season.round || 0);
  return {
    season: season.season,
    round: String(round),
    resultsRound: String(resultsRound),
    inSync: resultsRound === round,
    ok: drivers.mismatches.length === 0 && constructors.mismatches.length === 0,
    drivers,
    constructors,
  };
}

export const WARM_PATHS = [
  "/api/season?year=current",
  "/api/jolpica?path=current.json",
  "/api/jolpica?path=current/driverStandings.json",
  "/api/jolpica?path=current/constructorStandings.json",
  "/api/jolpica?path=current/last/results.json",
];
/** Pre-warm the current-season endpoints and record an accuracy report. */
export async function refresh(env = {}, ctx = {}, { gap = 1500 } = {}) {
  const origin = env.PULSE_ORIGIN || "https://f1-pulse.arnavrival12.workers.dev";
  const started = Date.now();
  const warmed = [];
  const bodies = {};
  for (const path of WARM_PATHS) {
    if (warmed.length) await pause(gap);
    const t = Date.now();
    try {
      const r = await api(new Request(origin + path), env, ctx, { fresh: true });
      warmed.push({ path, status: r.status, ms: Date.now() - t });
      if (r.ok) bodies[path] = await r.json();
    } catch (e) {
      warmed.push({ path, status: 0, ms: Date.now() - t, error: String(e?.message || e) });
    }
  }
  let audit = null;
  const season = bodies["/api/season?year=current"]?.data;
  const ds = bodies["/api/jolpica?path=current/driverStandings.json"]?.data?.MRData?.StandingsTable?.StandingsLists?.[0];
  const cs = bodies["/api/jolpica?path=current/constructorStandings.json"]?.data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (season && ds) {
    try {
      audit = auditSeason(season, ds, cs);
    } catch (e) {
      audit = { ok: false, error: String(e?.message || e) };
    }
  }
  const report = {
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    version: VERSION,
    warmed,
    audit,
    ok: warmed.every((w) => w.status === 200) && !!audit?.ok,
  };
  lastReport = report;
  if (env.PULSE_KV) await env.PULSE_KV.put("status:last", JSON.stringify(report)).catch(() => {});
  return report;
}

async function status(env) {
  let report = lastReport;
  if (env?.PULSE_KV) report = (await env.PULSE_KV.get("status:last", "json").catch(() => null)) || report;
  const meta = env?.CF_VERSION_METADATA;
  return Response.json(
    {
      version: VERSION,
      build: meta ? { id: meta.id, tag: meta.tag || null, timestamp: meta.timestamp || null } : null,
      storage: env?.PULSE_KV ? "kv" : "memory",
      analytics: !!env?.PULSE_ANALYTICS,
      report: report || null,
    },
    { headers: { ...headers, "Cache-Control": "public, max-age=60" } },
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const legacy = legacyDestination(url);
    if (legacy && ["GET", "HEAD"].includes(request.method))
      return Response.redirect(legacy, 308);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    return api(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refresh(env, ctx, { gap: Number(env.PULSE_WARM_GAP_MS ?? 1500) }));
  },
};
