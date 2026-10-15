/**
 * Snapshot every World Championship race result (1950 → lastSeason) into public/data/archive.json
 * so the Archive pages (Record Book, On This Day, Rivalries, Rookies, Across Eras, Team Lineage)
 * can compute all-time records without hundreds of live requests per visit.
 *
 *   node scripts/fetch-archive.mjs [lastSeason]
 *
 * Sources (Jolpica, the Ergast-compatible F1 API):
 *   {year}/results.json         — every classified/unclassified row incl. grid, status, laps, fastest-lap rank
 *   {year}/qualifying/1.json    — qualifying P1 (pole). Jolpica qualifying coverage starts in 1994; earlier
 *                                  seasons have no qualifying table, so the app falls back to grid P1 there.
 *   {year}/sprint.json          — sprint rows (2021+) so points totals match the official tables.
 *
 * Politeness: one request at a time, ≥ 300 ms apart, exponential backoff on HTTP 429 / 5xx.
 * Pages are cached in the OS temp dir so an interrupted run resumes without refetching.
 *
 * Output (compact, index tables + positional rows):
 *   drivers:      [driverId, givenName, familyName, dateOfBirth, nationality, code]
 *   constructors: [constructorId, name, nationality]
 *   circuits:     [circuitId, circuitName, locality, country, lat, long]
 *   statuses:     [status]
 *   races:        [season, round, raceName, circuitIdx, date, poleDriverIdx (-1 = none/unknown),
 *                  results: [driverIdx, constructorIdx, grid, positionText, points, statusIdx, laps, fastestLapRank (0 = none),
 *                            raceTimeMillis (0 = not timed, i.e. lapped or not classified)][],
 *                  sprint?: [driverIdx, constructorIdx, positionText, points][]]
 *   Result rows keep Jolpica's finishing order.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIRST = 1950;
const QUALI_FROM = 1994;
const SPRINT_FROM = 2021;
const last = Number(process.argv[2] || new Date().getFullYear() - 1);
const API = "https://api.jolpi.ca/ergast/f1/";
const CACHE = join(tmpdir(), "f1pulse-archive-cache");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let lastAt = 0;
/** Spacing between requests: starts at 300 ms, doubles after every 429 and relaxes again on success. */
let gapMs = 300;

async function cached(key, load) {
  const file = join(CACHE, key.replace(/[^a-z0-9]+/gi, "_") + ".json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {}
  const value = await load();
  await writeFile(file, JSON.stringify(value));
  return value;
}

async function page(path, offset) {
  return cached(`${path}@${offset}`, async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const gap = gapMs - (Date.now() - lastAt);
      if (gap > 0) await wait(gap);
      lastAt = Date.now();
      requests++;
      let r;
      try {
        r = await fetch(`${API}${path}?limit=100&offset=${offset}`, {
          headers: { "User-Agent": "F1Pulse/3.0 archive snapshot" },
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        const ms = Math.min(300000, 4000 * 2 ** attempt);
        process.stdout.write(`\n  network error on ${path} (${e.message}); retrying in ${ms / 1000}s `);
        await wait(ms);
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        if (r.status === 429) gapMs = Math.min(8000, gapMs * 2);
        const retryAfter = Number(r.headers.get("retry-after")) * 1000;
        const ms = Math.min(600000, Math.max(retryAfter || 0, 8000 * 2 ** attempt));
        process.stdout.write(`\n  HTTP ${r.status} on ${path}; backing off ${Math.round(ms / 1000)}s `);
        await wait(ms);
        continue;
      }
      if (!r.ok) throw Error(`${path}: HTTP ${r.status}`);
      gapMs = Math.max(300, gapMs * 0.9);
      return (await r.json()).MRData;
    }
    throw Error("gave up (rate limited): " + path);
  });
}

/** Every page of a race-table endpoint, merging each race's `key` array across page boundaries. */
async function races(path, key) {
  const merged = new Map();
  let offset = 0, total = 1;
  while (offset < total) {
    const mr = await page(path, offset);
    total = +mr.total;
    for (const race of mr.RaceTable.Races) {
      const prev = merged.get(race.round);
      if (prev) prev[key].push(...(race[key] || []));
      else merged.set(race.round, { ...race, [key]: [...(race[key] || [])] });
    }
    if (!mr.RaceTable.Races.length) break;
    offset += +mr.limit;
  }
  return [...merged.values()].sort((a, b) => +a.round - +b.round);
}

function indexer() {
  const map = new Map();
  const rows = [];
  return {
    rows,
    get(id, make) {
      if (!map.has(id)) {
        map.set(id, rows.length);
        rows.push(make());
      }
      return map.get(id);
    },
  };
}

await mkdir(CACHE, { recursive: true });
const D = indexer(), C = indexer(), K = indexer(), S = indexer();
const driver = (d) => D.get(d.driverId, () => [d.driverId, d.givenName, d.familyName, d.dateOfBirth || "", d.nationality || "", d.code || ""]);
const team = (c) => C.get(c.constructorId, () => [c.constructorId, c.name, c.nationality || ""]);
const circuit = (c) => K.get(c.circuitId, () => [c.circuitId, c.circuitName, c.Location?.locality || "", c.Location?.country || "", +c.Location?.lat || 0, +c.Location?.long || 0]);
const status = (s) => S.get(s, () => s);
const num = (v) => (v === undefined || v === "" ? 0 : +v);

const out = [];
let rows = 0, poles = 0;
const started = Date.now();
for (let y = FIRST; y <= last; y++) {
  const season = await races(`${y}/results.json`, "Results");
  const quali = y >= QUALI_FROM ? await races(`${y}/qualifying/1.json`, "QualifyingResults") : [];
  const sprint = y >= SPRINT_FROM ? await races(`${y}/sprint.json`, "SprintResults") : [];
  const poleBy = new Map(quali.map((r) => [r.round, r.QualifyingResults[0]?.Driver]));
  const sprintBy = new Map(sprint.map((r) => [r.round, r.SprintResults]));
  for (const race of season) {
    const results = race.Results.map((x) => [
      driver(x.Driver),
      team(x.Constructor),
      num(x.grid),
      x.positionText,
      num(x.points),
      status(x.status || ""),
      num(x.laps),
      num(x.FastestLap?.rank),
      num(x.Time?.millis),
    ]);
    rows += results.length;
    const p = poleBy.get(race.round);
    if (p) poles++;
    const row = [+race.season, +race.round, race.raceName, circuit(race.Circuit), race.date, p ? driver(p) : -1, results];
    const s = sprintBy.get(race.round);
    if (s?.length) row.push(s.map((x) => [driver(x.Driver), team(x.Constructor), x.positionText, num(x.points)]));
    out.push(row);
  }
  process.stdout.write(`${y}(${season.length}) `);
}

const file = {
  generatedAt: new Date().toISOString(),
  source: API,
  first: FIRST,
  last,
  qualifyingFrom: QUALI_FROM,
  sprintFrom: SPRINT_FROM,
  drivers: D.rows,
  constructors: C.rows,
  circuits: K.rows,
  statuses: S.rows,
  races: out,
};
const json = JSON.stringify(file);
await writeFile("public/data/archive.json", json);
console.log(
  `\nwrote public/data/archive.json: ${out.length} races, ${rows} results, ${poles} qualifying poles, ` +
    `${D.rows.length} drivers, ${C.rows.length} constructors, ${K.rows.length} circuits, ` +
    `${(json.length / 1024).toFixed(0)} KB, ${requests} network requests in ${Math.round((Date.now() - started) / 1000)}s`,
);
