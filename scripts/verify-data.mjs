import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import worker from "../worker/index.mjs";
const report = [];
async function check(source, path, params, verify) {
  const q = new URLSearchParams({ ...params, ...(path ? { path } : {}) });
  const r = await worker.fetch(
    new Request(`https://f1pulse.test/api/${source}?${q}`),
    {},
    { waitUntil() {} },
  );
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  verify(body.data);
  report.push({
    source,
    path,
    status: r.status,
    meta: body.meta,
    count: Array.isArray(body.data) ? body.data.length : undefined,
  });
  console.log("Verified", source, path);
  await new Promise((r) => setTimeout(r, 700));
  return body.data;
}
await check("jolpica", "1950.json", {}, (d) =>
  assert.ok(d.MRData.RaceTable.Races.length > 0),
);
await check("jolpica", "current.json", {}, (d) =>
  assert.ok(d.MRData.RaceTable.Races.length > 0),
);
await check("jolpica", "current/driverStandings.json", {}, (d) =>
  assert.ok(
    d.MRData.StandingsTable.StandingsLists[0].DriverStandings.length > 0,
  ),
);
await check("jolpica", "current/last/results.json", {}, (d) =>
  assert.ok(d.MRData.RaceTable.Races[0].Results.length > 0),
);
await check("jolpica", "2025/1/qualifying.json", {}, (d) =>
  assert.ok(d.MRData.RaceTable.Races[0].QualifyingResults.length > 0),
);
await check("weather", "", { latitude: "26.0325", longitude: "50.5106" }, (d) =>
  assert.equal(typeof d.current.temperature_2m, "number"),
);
const ss = await check(
  "openf1",
  "sessions",
  { year: "2025", session_name: "Race" },
  (d) => assert.ok(d.length),
);
const key = ss[0].session_key;
await check("openf1", "drivers", { session_key: String(key) }, (d) =>
  assert.ok(d.length),
);
const laps = await check(
  "openf1",
  "laps",
  { session_key: String(key), driver_number: "1" },
  (d) => assert.ok(d.length),
);
const lap = laps.find(
  (l) =>
    l.date_start &&
    l.lap_duration > 0 &&
    l.lap_duration < 180 &&
    !l.is_pit_out_lap &&
    l.lap_number > 2,
);
assert.ok(lap);
const params = {
  session_key: String(key),
  driver_number: "1",
  "date>=": lap.date_start,
  "date<=": new Date(
    Date.parse(lap.date_start) + lap.lap_duration * 1000,
  ).toISOString(),
};
await check("openf1", "car_data", params, (d) => assert.ok(d.length > 5));
await check("openf1", "location", params, (d) => assert.ok(d.length > 5));
await check("openf1", "stints", { session_key: String(key) }, (d) =>
  assert.ok(d.length),
);
await check("news", "", {}, (d) => assert.ok(d.length));
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/real-data-verification.json",
  JSON.stringify({ verifiedAt: new Date().toISOString(), report }, null, 2),
);
console.log("All real-data checks passed");
