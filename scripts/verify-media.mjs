// Verifies season media in src/data/media.json against Jolpica race results.
//   node scripts/verify-media.mjs
// - every referenced file exists under public/ and is recorded in public/media/sources.json
// - every driver who started a race in a season has at least a `head` (coverage %)
// - the media `team` equals the constructor of the driver's latest race that season
// - every gallery image exists (driver/team galleries, 2026 race-weekend galleries, helmets)
// - Wikimedia Commons photos (public/data/wikimedia.json): file exists and is recorded, free licence,
//   non-empty artist credit, Commons file page as source, plausible photo year, no orphan files;
//   prints coverage for all drivers, race winners, champions, constructors and circuits
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

// ── Race-weekend galleries and helmets (official, scripts/fetch-media-extra.py) ──
const extraStart = bytes;
let raceImages = 0;
for (const [key, list] of Object.entries(media.galleries?.races || {})) {
  if (!/^\d{4}-\d{1,2}$/.test(key)) fail(`race gallery key ${key} is not "<season>-<round>"`);
  if (list.length > 8) fail(`race gallery ${key}: ${list.length} photos (max 8)`);
  if (new Set(list.map((i) => i.src)).size !== list.length) fail(`race gallery ${key}: duplicate photos`);
  for (const img of list) {
    raceImages++;
    checkFile(img.src, `race gallery ${key}`);
    if (!img.caption || !img.credit) fail(`race gallery ${key}: ${img.src} lacks caption/credit`);
  }
}
let helmetFiles = 0;
for (const [id, years] of Object.entries(media.helmets || {}))
  for (const [year, src] of Object.entries(years)) {
    helmetFiles++;
    checkFile(src, `helmet ${id} ${year}`);
  }
console.log(`race galleries: ${Object.keys(media.galleries?.races || {}).length} rounds, ${raceImages} photos · helmets: ${helmetFiles} files for ${Object.keys(media.helmets || {}).length} drivers · ${((bytes - extraStart) / 1e6).toFixed(2)} MB`);

// ── Wikimedia Commons photos (public/data/wikimedia.json, scripts/fetch-wikimedia.py) ──
// Every file exists locally, is recorded in sources.json, has a free licence and a non-empty credit,
// and its photo year is plausible for the person (not before they were 12).
const FREE = /^(cc0|cc[- ]?zero|public domain|pd\b|pd[- ]|cc[- ]by(?:[- ]sa)?(?:[- ]\d(?:\.\d)?)?|cc[- ]by[- ]sa|gfdl|gnu free documentation|attribution|copyrighted free use|free art licen[cs]e|fal\b|no restrictions|mit|bsd|ogl|open government licen[cs]e)/i;
const NONFREE = /(non[- ]?free|fair use|all rights reserved|\bnc\b|non[- ]?commercial|\bnd\b|no[- ]?deriv)/i;
const wikiPath = join(root, "public/data/wikimedia.json");
if (existsSync(wikiPath)) {
  const wiki = JSON.parse(readFileSync(wikiPath, "utf8"));
  const archive = JSON.parse(readFileSync(join(root, "public/data/archive.json"), "utf8"));
  const history = JSON.parse(readFileSync(join(root, "public/data/history.json"), "utf8"));
  const commonsStart = bytes;
  const born = Object.fromEntries(archive.drivers.map((d) => [d[0], +d[3].slice(0, 4)]));
  const referenced = new Set();
  const checkPhoto = (p, where, birth) => {
    for (const key of ["src", "head"]) if (p[key]) { referenced.add(p[key]); checkFile(p[key], `${where}.${key}`); }
    const c = p.credit || {};
    if (!c.artist?.trim()) fail(`${where}: empty artist credit`);
    if (!c.license || !FREE.test(c.license) || NONFREE.test(c.license)) fail(`${where}: licence "${c.license}" is not a free licence`);
    if (!/^https:\/\/(commons|en)\.wikimedia\.org\/wiki\/File:|^https:\/\/en\.wikipedia\.org\/wiki\/File:/.test(c.source || "")) fail(`${where}: source ${c.source} is not a Wikimedia file page`);
    if (c.licenseUrl && !/^https?:\/\//.test(c.licenseUrl)) fail(`${where}: bad licence URL ${c.licenseUrl}`);
    if (birth && c.date && +c.date < birth + 12) fail(`${where}: photo dated ${c.date} but the driver was born in ${birth} (wrong person?)`);
  };
  for (const [id, p] of Object.entries(wiki.drivers)) checkPhoto(p, `commons driver ${id}`, born[id]);
  for (const [id, p] of Object.entries(wiki.constructors)) checkPhoto(p, `commons constructor ${id}`);
  for (const [id, list] of Object.entries(wiki.circuits)) list.forEach((p, i) => checkPhoto(p, `commons circuit ${id}[${i}]`));
  const { readdirSync } = await import("node:fs");
  for (const dir of ["drivers", "teams", "circuits"]) {
    const folder = join(root, "public/media/commons", dir);
    if (!existsSync(folder)) continue;
    for (const f of readdirSync(folder))
      if (/\.(webp|jpe?g|png)$/.test(f) && !/-800\.(webp|avif)$/.test(f) && !referenced.has(`/media/commons/${dir}/${f}`)) fail(`orphan Commons file /media/commons/${dir}/${f}`);
  }
  // Coverage: all drivers / race winners / world champions, constructors, circuits (archive + current season).
  const winners = new Set(), champions = new Set();
  for (const race of archive.races) for (const row of race[6]) if (row[3] === "1") winners.add(archive.drivers[row[0]][0]);
  for (const rows of Object.values(history.drivers)) if (rows[0]?.[1] === "1") champions.add(rows[0][0]);
  const pct = (have, all) => `${[...all].filter((x) => have[x]).length}/${all.size} (${(([...all].filter((x) => have[x]).length / Math.max(1, all.size)) * 100).toFixed(1)}%)`;
  const allDrivers = new Set(archive.drivers.map((d) => d[0]));
  const constructorsAll = new Set(archive.constructors.map((c) => c[0]));
  const circuitsAll = new Set(archive.circuits.map((c) => c[0]));
  const heads = Object.values(wiki.drivers).filter((p) => p.head).length;
  console.table({
    "drivers 1950-2025": pct(wiki.drivers, allDrivers),
    "race winners": pct(wiki.drivers, winners),
    "world champions": pct(wiki.drivers, champions),
    "constructors": pct(wiki.constructors, constructorsAll),
    "circuits": pct(wiki.circuits, circuitsAll),
  });
  const places = Object.values(wiki.circuits).reduce((n, l) => n + l.length, 0);
  console.log(`commons: ${Object.keys(wiki.drivers).length} driver photos (${heads} headshots), ${Object.keys(wiki.constructors).length} constructor photos, ${places} circuit photos · ${((bytes - commonsStart) / 1e6).toFixed(2)} MB`);
  const missingChamps = [...champions].filter((c) => !wiki.drivers[c]);
  if (missingChamps.length) console.log(`  champions without a Commons photo: ${missingChamps.join(", ")}`);
} else console.log("commons: public/data/wikimedia.json not found (run python scripts/fetch-wikimedia.py)");

console.log(`total checked media: ${(bytes / 1e6).toFixed(2)} MB`);
console.log(problems ? `${problems} problem(s)` : "media OK");
process.exit(problems ? 1 : 0);
