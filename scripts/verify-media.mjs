// Verifies season media in src/data/media.json against Jolpica race results.
//   node scripts/verify-media.mjs
// - every referenced file exists under public/ and is recorded in public/media/sources.json
// - every driver who started a race in a season has at least a `head` (coverage %)
// - the media `team` equals the constructor of the driver's latest race that season
// - every gallery image exists
// Jolpica responses are cached in $F1PULSE_CACHE (shared with scripts/fetch-media-seasons.py).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const media = JSON.parse(readFileSync(join(root, "src/data/media.json"), "utf8"));
const sources = new Set(JSON.parse(readFileSync(join(root, "public/media/sources.json"), "utf8")).map((s) => s.file));
const cache = process.env.F1PULSE_CACHE || join(tmpdir(), "f1pulse-media-cache");
mkdirSync(cache, { recursive: true });
const NON_START = new Set(["Did not start", "Withdrew", "Did not qualify", "Did not prequalify", "Excluded"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jolpica(path) {
  const key = join(cache, "jolpica_" + path.replace(/[/?&]/g, "_").replace(/=/g, "-"));
  if (existsSync(key)) return JSON.parse(readFileSync(key, "utf8"));
  for (let attempt = 0, wait = 2000; ; attempt++, wait *= 2) {
    await sleep(800);
    const res = await fetch("https://api.jolpi.ca/ergast/f1/" + path, { headers: { "user-agent": "F1Pulse media verify" } });
    if (res.ok) {
      const text = await res.text();
      writeFileSync(key, text);
      return JSON.parse(text);
    }
    if (attempt > 5 || (res.status !== 429 && res.status < 500)) throw new Error(`Jolpica ${path} -> ${res.status}`);
    await sleep(wait);
  }
}

async function starters(year) {
  const out = new Map(); // driverId -> { team (latest race), round, started }
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    const data = (await jolpica(`${year}/results.json?limit=100&offset=${offset}`)).MRData;
    total = +data.total;
    for (const race of data.RaceTable.Races)
      for (const row of race.Results) {
        const id = row.Driver.driverId, round = +race.round;
        const e = out.get(id) || { team: row.Constructor.constructorId, round: 0, started: false, name: `${row.Driver.givenName} ${row.Driver.familyName}` };
        if (round >= e.round) Object.assign(e, { team: row.Constructor.constructorId, round });
        if (!NON_START.has(row.status)) e.started = true;
        out.set(id, e);
      }
  }
  return out;
}

let problems = 0;
const fail = (msg) => { problems++; console.log("  FAIL " + msg); };
let bytes = 0;
const checkFile = (path, where) => {
  if (!path) return;
  const file = join(root, "public", path);
  if (!existsSync(file)) return fail(`${where}: missing file ${path}`);
  bytes += statSync(file).size;
  if (!sources.has(path)) fail(`${where}: ${path} not recorded in sources.json`);
};

const summary = [];
for (const [year, season] of Object.entries(media.seasons || {}).sort()) {
  const truth = await starters(year);
  const before = bytes;
  let started = 0, withHead = 0, withFull = 0;
  const missing = [];
  for (const [id, d] of Object.entries(season.drivers)) {
    for (const key of ["front", "card", "number", "head", "photo"]) checkFile(d[key], `${year} ${id}.${key}`);
    const t = truth.get(id);
    if (!t) fail(`${year} ${id}: not in Jolpica results`);
    else if (t.team !== d.team) fail(`${year} ${id}: media team ${d.team} != latest-race constructor ${t.team}`);
  }
  for (const [id, t] of truth) {
    if (!t.started) continue;
    started++;
    const d = season.drivers[id];
    if (d?.head) withHead++; else missing.push(`${t.name} (${t.team})`);
    if (d?.front || d?.photo) withFull++;
  }
  const constructors = new Set([...truth.values()].map((t) => t.team));
  const teamsWithLogo = [...constructors].filter((c) => season.teams[c]?.logo).length;
  const teamsWithCar = [...constructors].filter((c) => season.teams[c]?.car).length;
  for (const [id, t] of Object.entries(season.teams))
    for (const key of ["logo", "logoWhite", "car", "carFront", "carLeft"]) checkFile(t[key], `${year} team ${id}.${key}`);
  const pct = ((withHead / started) * 100).toFixed(1);
  summary.push({ year, started, head: `${withHead} (${pct}%)`, portrait: withFull, logos: `${teamsWithLogo}/${constructors.size}`, cars: `${teamsWithCar}/${constructors.size}`, MB: ((bytes - before) / 1e6).toFixed(2) });
  if (missing.length) console.log(`  ${year} starters without head: ${missing.join(", ")}`);
}
console.table(summary);

const gb = bytes;
const seen = new Set();
let galleryImages = 0;
for (const bucket of ["drivers", "teams"])
  for (const [id, list] of Object.entries(media.galleries?.[bucket] || {}))
    for (const img of list) {
      galleryImages++;
      if (seen.has(img.src)) continue;
      seen.add(img.src);
      checkFile(img.src, `gallery ${bucket}/${id}`);
    }
for (const [id, t] of Object.entries(media.teams)) checkFile(t.carLeft, `2026 team ${id}.carLeft`);
const g = media.galleries || {};
console.log(`galleries: ${Object.keys(g.drivers || {}).length} drivers, ${Object.keys(g.teams || {}).length} teams, ${galleryImages} entries, ${seen.size} unique files, ${((bytes - gb) / 1e6).toFixed(2)} MB (incl. 2026 left-side cars)`);
console.log(`total season + gallery media: ${(bytes / 1e6).toFixed(2)} MB`);
console.log(problems ? `${problems} problem(s)` : "media OK");
process.exit(problems ? 1 : 0);
