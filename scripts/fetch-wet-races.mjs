/**
 * Modelled race-window rainfall for every World Championship race in public/data/archive.json.
 *
 *   node scripts/fetch-wet-races.mjs            (writes public/data/wet-races.json)
 *
 * For each race: hourly ERA5 reanalysis precipitation (Open-Meteo archive API, models=era5) at the
 * circuit coordinates on race day, summed over the race window. The start time comes from the
 * Jolpica schedule (UTC, published for most races from 2005 onward); when it is missing a 14:00
 * local start is assumed. The window runs from lights out to lights out + the winner's race time
 * (2 h when the winner's time isn't recorded, capped at 4 h); the two hours before the start are
 * summed separately, because rain that stops before lights out still leaves a wet track.
 *
 * This is a model, not an official wet-race classification: ERA5 is a ~31 km grid that smooths
 * local showers, so short, intense storms are often underestimated and dry races next to a shower
 * can pick up a trace. The site labels it as "modelled precipitation".
 *
 * Politeness: one request at a time (Jolpica ≥ 400 ms apart, Open-Meteo ≥ 250 ms), exponential
 * backoff on 429 / 5xx, and every response is cached in the OS temp dir so a rerun is free.
 *
 * Output:
 *   races: [season, round, raceMm, preMm, dayMm, peakMm, timed (1 = official start time), airC][]
 *     raceMm  precipitation in the race window (mm, 0.1 resolution)
 *     preMm   precipitation in the two hours before lights out
 *     dayMm   race-day total (local calendar day)
 *     peakMm  wettest single hour inside the race window
 *     airC    modelled 2 m air temperature at lights out
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const OUT = new URL("public/data/wet-races.json", ROOT);
const CACHE = join(tmpdir(), "f1pulse-wet-races-cache");
const JOLPICA = "https://api.jolpi.ca/ergast/f1/";
const METEO = "https://archive-api.open-meteo.com/v1/archive";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lastAt = { jolpica: 0, meteo: 0 };
const spacing = { jolpica: 400, meteo: 250 };
let requests = 0;

async function cached(key, load) {
  const file = join(CACHE, key.replace(/[^a-z0-9]+/gi, "_") + ".json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {}
  const value = await load();
  await writeFile(file, JSON.stringify(value));
  return value;
}

async function getJSON(kind, url) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const gap = spacing[kind] - (Date.now() - lastAt[kind]);
    if (gap > 0) await wait(gap);
    lastAt[kind] = Date.now();
    requests++;
    let r;
    try {
      r = await fetch(url, { headers: { "User-Agent": "F1Pulse/3.2 wet-race snapshot" }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      const ms = Math.min(120000, 3000 * 2 ** attempt);
      process.stdout.write(`\n  network error (${e.message}); retrying in ${ms / 1000}s `);
      await wait(ms);
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      spacing[kind] = Math.min(5000, spacing[kind] * 2);
      const retryAfter = Number(r.headers.get("retry-after")) * 1000;
      const ms = Math.min(300000, Math.max(retryAfter || 0, 6000 * 2 ** attempt));
      process.stdout.write(`\n  HTTP ${r.status} from ${kind}; backing off ${Math.round(ms / 1000)}s `);
      await wait(ms);
      continue;
    }
    if (!r.ok) throw Error(`${url}: HTTP ${r.status} ${await r.text().catch(() => "")}`);
    spacing[kind] = Math.max(kind === "jolpica" ? 400 : 250, spacing[kind] * 0.9);
    return r.json();
  }
  throw Error("gave up: " + url);
}

/** Jolpica schedule for one season → round → UTC start time ("HH:MM:SSZ") when published. */
async function startTimes(season) {
  const data = await cached(`schedule-${season}`, () => getJSON("jolpica", `${JOLPICA}${season}.json?limit=100`));
  return new Map(data.MRData.RaceTable.Races.map((r) => [+r.round, r.time || null]));
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Sum hourly precipitation over [from, to) in local hours of the day. Open-Meteo's hourly value at
 * hh:00 is the total of the preceding hour, so value i covers (i − 1, i]; partial overlap counts
 * proportionally.
 */
function windowSum(hourly, from, to) {
  let sum = 0, peak = 0;
  hourly.forEach((v, i) => {
    if (typeof v !== "number") return;
    const overlap = Math.max(0, Math.min(i, to) - Math.max(i - 1, from));
    if (overlap > 0) { sum += v * overlap; peak = Math.max(peak, v); }
  });
  return { sum, peak };
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const file = JSON.parse(await readFile(new URL("public/data/archive.json", ROOT), "utf8"));
  const circuits = file.circuits;
  const seasons = [...new Set(file.races.map((r) => r[0]))].sort((a, b) => a - b);
  console.log(`${file.races.length} races, ${seasons[0]}–${seasons.at(-1)}`);

  const times = new Map();
  for (const s of seasons) {
    times.set(s, await startTimes(s));
    process.stdout.write(`\rschedules ${s}`);
  }
  console.log("");

  const out = [];
  let i = 0, timed = 0, failed = 0;
  for (const race of file.races) {
    const [season, round, , circuitIdx, date, , results] = race;
    const c = circuits[circuitIdx];
    const [, , , , lat, lon] = c;
    const winnerMs = results.find((r) => r[3] === "1")?.[8] || 0;
    i++;
    try {
      const data = await cached(`era5-${lat}-${lon}-${date}`, () =>
        getJSON("meteo", `${METEO}?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=precipitation,temperature_2m&timezone=auto&models=era5`),
      );
      const precip = data.hourly?.precipitation || [];
      const temp = data.hourly?.temperature_2m || [];
      const utc = times.get(season)?.get(round);
      let start = 14;
      if (utc && /^\d\d:\d\d/.test(utc)) {
        const [h, m] = utc.split(":").map(Number);
        start = (((h + m / 60 + (data.utc_offset_seconds || 0) / 3600) % 24) + 24) % 24;
        timed++;
      }
      const hours = winnerMs > 0 ? Math.min(4, winnerMs / 3600e3) : 2;
      const end = Math.min(24, start + hours);
      const inRace = windowSum(precip, start, end);
      const before = windowSum(precip, Math.max(0, start - 2), start);
      const day = precip.reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
      const air = temp[Math.min(23, Math.round(start))];
      out.push([season, round, round1(inRace.sum), round1(before.sum), round1(day), round1(inRace.peak), utc ? 1 : 0, typeof air === "number" ? Math.round(air) : null]);
    } catch (e) {
      failed++;
      process.stdout.write(`\n  ${season} R${round} failed: ${e.message}\n`);
    }
    if (i % 10 === 0 || i === file.races.length) process.stdout.write(`\rweather ${i}/${file.races.length} · ${requests} requests`);
  }
  console.log("");

  const json = {
    generatedAt: new Date().toISOString(),
    source: "Open-Meteo historical weather API (ERA5 reanalysis, models=era5) at circuit coordinates; start times from Jolpica",
    sourceUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    method:
      "Hourly modelled precipitation summed over the race window (lights out → lights out + winner's race time, 2 h when unknown, max 4 h) " +
      "and the two hours before it. A 14:00 local start is assumed when no official start time is published. Not an official wet-race classification.",
    first: out[0]?.[0],
    last: out.at(-1)?.[0],
    columns: ["season", "round", "raceMm", "preMm", "dayMm", "peakMm", "timed", "airC"],
    races: out,
  };
  await writeFile(OUT, JSON.stringify(json));
  const size = JSON.stringify(json).length;
  console.log(`wrote public/data/wet-races.json · ${out.length}/${file.races.length} races · ${timed} with official start times · ${failed} failed · ${(size / 1024).toFixed(1)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
