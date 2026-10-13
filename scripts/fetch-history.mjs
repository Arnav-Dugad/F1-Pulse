/**
 * Snapshot every completed season's final championship tables (drivers 1950–, constructors 1958–)
 * into public/data/history.json. Jolpica only serves standings per season, so career and team
 * histories would otherwise cost one request per season. Completed seasons never change; the
 * current season is always fetched live by the app.
 *   node scripts/fetch-history.mjs [lastSeason]
 */
import { writeFile } from "node:fs/promises";

const last = Number(process.argv[2] || new Date().getFullYear() - 1);
const API = "https://api.jolpi.ca/ergast/f1/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(path, offset) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`${API}${path}?limit=100&offset=${offset}`, { headers: { "User-Agent": "F1Pulse/3.0 history snapshot" } });
    if (r.status === 429) { await wait(5000 * (attempt + 1)); continue; }
    if (!r.ok) throw Error(`${path}: HTTP ${r.status}`);
    await wait(300);
    return (await r.json()).MRData;
  }
  throw Error("rate limited: " + path);
}
/** Fetch every page of a season's standings (some 1950s tables exceed 100 rows). */
async function get(path) {
  let list, offset = 0, total = 1;
  const key = path.includes("driver") ? "DriverStandings" : "ConstructorStandings";
  while (offset < total) {
    const mr = await page(path, offset);
    total = +mr.total;
    const l = mr.StandingsTable.StandingsLists[0];
    if (!list) list = l;
    else list[key].push(...l[key]);
    offset += +mr.limit;
  }
  return list;
}

const out = { generatedAt: new Date().toISOString(), lastSeason: last, drivers: {}, constructors: {}, names: { drivers: {}, constructors: {} }, rounds: {} };
for (let y = 1950; y <= last; y++) {
  const d = await get(`${y}/driverStandings.json`);
  out.rounds[y] = d.round;
  // [driverId, positionText, points, wins, constructorIds]
  out.drivers[y] = d.DriverStandings.map((s) => {
    out.names.drivers[s.Driver.driverId] = [s.Driver.givenName, s.Driver.familyName, s.Driver.nationality];
    for (const c of s.Constructors) out.names.constructors[c.constructorId] = [c.name, c.nationality];
    return [s.Driver.driverId, s.positionText, +s.points, +s.wins, s.Constructors.map((c) => c.constructorId)];
  });
  if (y >= 1958) {
    const c = await get(`${y}/constructorStandings.json`);
    out.constructors[y] = c.ConstructorStandings.map((s) => {
      out.names.constructors[s.Constructor.constructorId] = [s.Constructor.name, s.Constructor.nationality];
      return [s.Constructor.constructorId, s.positionText, +s.points, +s.wins];
    });
  }
  process.stdout.write(`${y} `);
}
await writeFile("public/data/history.json", JSON.stringify(out));
console.log(`\nwrote public/data/history.json (1950–${last})`);
