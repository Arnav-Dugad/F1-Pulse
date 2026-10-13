import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgress } from "../src/progress.mjs";

const d = (id) => ({ driverId: id, givenName: id, familyName: id, nationality: "", dateOfBirth: "", url: "" });
const t = (id) => ({ constructorId: id, name: id, nationality: "", url: "" });
const row = (driver, team, position, points) => ({ Driver: d(driver), Constructor: t(team), position: String(position), positionText: String(position), points: String(points), grid: "1", laps: "50", status: "Finished" });
const race = (round, results) => ({ season: "2026", round: String(round), raceName: "R" + round, date: "2026-01-0" + round, url: "", Circuit: { circuitId: "c" + round, circuitName: "", url: "", Location: { lat: "0", long: "0", locality: "", country: "" } }, Results: results });

test("cumulative points include sprint results and follow the driver's latest team", () => {
  const races = [
    race(1, [row("a", "x", 1, 25), row("b", "y", 2, 18)]),
    race(2, [row("b", "x", 1, 25), row("a", "x", 2, 18)]),
  ];
  const sprints = [{ ...race(2, []), Results: undefined, SprintResults: [row("a", "x", 1, 8)] }];
  const p = buildProgress(races, sprints);
  const a = p.drivers.find((x) => x.driver.driverId === "a");
  const b = p.drivers.find((x) => x.driver.driverId === "b");
  assert.deepEqual(a.cumulative, [25, 51]);
  assert.deepEqual(b.cumulative, [18, 43]);
  assert.equal(b.team.constructorId, "x", "team is taken from the latest race, not the first");
  assert.deepEqual(a.rank, [1, 1]);
  assert.equal(p.teams.find((x) => x.team.constructorId === "x").cumulative.at(-1), 25 + 25 + 18 + 8);
});

test("drivers joining mid-season start from zero and unclassified finishes are null", () => {
  const late = row("c", "z", 3, 0);
  late.positionText = "R";
  const p = buildProgress([race(1, [row("a", "x", 1, 25)]), race(2, [row("a", "x", 1, 25), late])], []);
  const c = p.drivers.find((x) => x.driver.driverId === "c");
  assert.deepEqual(c.cumulative, [0, 0]);
  assert.deepEqual(c.finish, [null, null]);
});

test("ties on points are broken by wins", () => {
  const p = buildProgress([race(1, [row("a", "x", 1, 25), row("b", "y", 2, 18)]), race(2, [row("b", "y", 1, 25), row("a", "x", 3, 18)])], []);
  assert.equal(p.drivers[0].driver.driverId, "a");
  assert.equal(p.drivers[0].cumulative.at(-1), p.drivers[1].cumulative.at(-1));
});

import { counted, countingRules } from "../src/progress.mjs";

test("dropped-score rules count only the best results", () => {
  assert.equal(counted([9, 6, 9, 4, 9], { n: 3 }), 27);
  assert.equal(counted([9, 9, 9, 9, 9, 9, 9], { k: 4, a: 3, b: 2 }), 45);
  assert.equal(counted([1, 2, 3]), 6);
  assert.deepEqual(countingRules(1988).driver, { n: 11 });
  assert.equal(countingRules(1991).driver, undefined);
});

test("1988-style seasons apply best-11 while summing; pre-1979 constructors score their best car only", () => {
  const season = (y, rows) => rows.map((results, i) => ({ ...race(i + 1, results), season: String(y) }));
  // Twelve wins: only eleven count in 1988.
  const p = buildProgress(season(1988, Array.from({ length: 12 }, () => [row("a", "x", 1, 9), row("b", "x", 2, 6)])), []);
  assert.equal(p.drivers[0].cumulative.at(-1), 99);
  assert.equal(p.teams[0].cumulative.at(-1), 12 * 15, "constructors summed every car from 1979");
  const q = buildProgress(season(1975, [[row("a", "x", 1, 9), row("b", "x", 2, 6)]]), []);
  assert.equal(q.teams[0].cumulative.at(-1), 9, "best-placed car only before 1979");
});

test("the Indianapolis 500 never counted for constructors, but later US GPs at Indianapolis did", () => {
  const indy = (y) => ({ ...race(1, [row("a", "x", 1, 8)]), season: String(y), Circuit: { ...race(1, []).Circuit, circuitId: "indianapolis" } });
  assert.equal(buildProgress([indy(1960)], []).teams[0].cumulative.at(-1), 0);
  assert.equal(buildProgress([indy(1960)], []).drivers[0].cumulative.at(-1), 8);
  assert.equal(buildProgress([indy(2007)], []).teams[0].cumulative.at(-1), 8);
});
