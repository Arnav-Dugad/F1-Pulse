/**
 * Accuracy audit against live published data.
 *  1. Points progression computed by the site (src/progress.mjs) must equal the official standings.
 *  2. Every 2026 driver and constructor must map to the right official photo/logo/car.
 *  3. Every 2026 circuit must have an outline, map and photograph.
 *   node scripts/verify-accuracy.mjs [seasons…]
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { buildProgress } from "../src/progress.mjs";

const media = JSON.parse(await readFile("src/data/media.json", "utf8"));
const tracks = JSON.parse(await readFile("public/data/tracks.json", "utf8"));
const API = "https://api.jolpi.ca/ergast/f1/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, params = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(API + path + "?" + new URLSearchParams({ limit: "100", ...params }));
    if (r.status === 429) { await wait(4000 * (attempt + 1)); continue; }
    assert.ok(r.ok, `${path} → HTTP ${r.status}`);
    await wait(350);
    return (await r.json()).MRData;
  }
  throw Error("rate limited: " + path);
}
async function paginate(path, key) {
  const races = new Map();
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    const mr = await get(path, { offset: String(offset) });
    total = +mr.total;
    for (const race of mr.RaceTable.Races) {
      const prev = races.get(race.round);
      if (prev) prev[key].push(...race[key]);
      else races.set(race.round, { ...race, [key]: [...race[key]] });
    }
  }
  return [...races.values()];
}

/**
 * Official decisions that race classifications cannot show. The site discloses these next to its
 * charts (ProgressNote); anything not listed here is treated as a defect.
 */
const KNOWN_ADJUSTMENTS = { 2007: ["mclaren"], 2020: ["racing_point"] };

const report = { checkedAt: new Date().toISOString(), seasons: {}, media: [], circuits: [] };
let failures = 0;
const fail = (msg) => { failures++; console.log("  ✗ " + msg); };

const args = process.argv.slice(2);
const seasons = args[0] === "all" ? Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => String(1950 + i)).reverse() : args.length ? args : ["2026", "2025", "2007", "1988"];
for (const season of seasons) {
  console.log(`\nSeason ${season}: points progression vs official standings`);
  const results = await paginate(`${season}/results.json`, "Results");
  const sprints = +season >= 2021 ? await paginate(`${season}/sprint.json`, "SprintResults") : [];
  const progress = buildProgress(results, sprints);
  const ds = (await get(`${season}/driverStandings.json`)).StandingsTable.StandingsLists[0].DriverStandings;
  const cs = +season >= 1958 ? (await get(`${season}/constructorStandings.json`)).StandingsTable.StandingsLists[0].ConstructorStandings : [];
  let mismatches = 0;
  const check = (id, ours, official, kind) => {
    if (Math.abs(ours - official) < 1e-9) return;
    mismatches++;
    const expected = (KNOWN_ADJUSTMENTS[season] || []).includes(id) || progress.rules.approximate[kind];
    if (expected) console.log(`  ⚠ ${id}: computed ${ours}, official ${official} (${progress.rules.approximate[kind] ? "shared drives — flagged approximate" : "official penalty/exclusion — disclosed on site"})`);
    else fail(`${id}: computed ${ours}, official ${official}`);
  };
  for (const s of ds) check(s.Driver.driverId, progress.drivers.find((d) => d.driver.driverId === s.Driver.driverId)?.cumulative.at(-1) ?? 0, +s.points, "drivers");
  for (const s of cs || []) check(s.Constructor.constructorId, progress.teams.find((t) => t.team.constructorId === s.Constructor.constructorId)?.cumulative.at(-1) ?? 0, +s.points, "constructors");
  const winsOk = ds.every((s) => (progress.drivers.find((d) => d.driver.driverId === s.Driver.driverId)?.wins ?? 0) === +s.wins);
  if (!winsOk) fail("win counts differ from official standings");
  console.log(`  ✓ ${ds.length} drivers, ${cs.length} constructors, ${progress.rounds.length} rounds — ${mismatches} difference(s) from the official table${winsOk ? ", wins match" : ""}`);
  report.seasons[season] = { rounds: progress.rounds.length, drivers: ds.length, constructors: cs.length, mismatches, winsOk };

  if (season === "2026") {
    console.log("\n2026 media mapping");
    for (const s of ds) {
      const id = s.Driver.driverId === "arvid_lindblad" ? "arvid_lindblad" : s.Driver.driverId;
      const m = media.drivers[id];
      // Standings list constructors in no particular order; the latest race decides the current team.
      const team = progress.drivers.find((d) => d.driver.driverId === s.Driver.driverId)?.team.constructorId;
      const ok = m && m.team === team;
      for (const key of ["front", "card", "number", "head"]) {
        if (m?.[key]) await access("public" + m[key]).catch(() => fail(`${id}: missing file ${m[key]}`));
      }
      // A driver who raced for several teams is checked against the most recent one.
      if (!m) fail(`${id}: no 2026 portrait`);
      else if (!ok) fail(`${id}: photo shows ${m.team}, standings list ${s.Constructors.map((c) => c.constructorId).join(" → ")}`);
      report.media.push({ driver: id, team, photoTeam: m?.team, ok: !!ok });
    }
    for (const s of cs) {
      const t = media.teams[s.Constructor.constructorId];
      if (!t) fail(`${s.Constructor.constructorId}: no logo/car`);
      else for (const key of ["logo", "logoWhite", "car", "carFront"]) await access("public" + t[key]).catch(() => fail(`missing ${t[key]}`));
    }
    console.log(`  ✓ checked ${ds.length} drivers and ${cs.length} constructors`);
    console.log("\n2026 circuits");
    for (const race of (await get("2026.json")).RaceTable.Races) {
      const id = race.Circuit.circuitId;
      const c = media.circuits[id] || {};
      const problems = [!tracks[id] && "outline", !c.map && "map", !c.hero && "photo"].filter(Boolean);
      if (problems.length) fail(`${id}: missing ${problems.join(", ")}`);
      report.circuits.push({ round: race.round, circuit: id, outline: !!tracks[id], map: !!c.map, photo: !!c.hero });
    }
    console.log(`  ✓ ${report.circuits.length} circuits checked`);
  }
}
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/accuracy-report.json", JSON.stringify(report, null, 2));
console.log(failures ? `\n${failures} problem(s) found` : "\nAll accuracy checks passed");
process.exit(failures ? 1 : 0);
