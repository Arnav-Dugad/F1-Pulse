import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sectorMarks, slowestCorners, crossingTimes, orderAt, stopsByDriver, neutralLap, pitBattles, battleSummary, pitLoss,
  wetScore, modernPts, wetDryTable, teammateWetEdge, sessionRain, sessionPace,
} from "../src/race-x.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const T0 = Date.parse("2025-09-07T13:00:00Z");

/** OpenF1-shaped laps for one driver from per-lap durations (s), first line crossing at T0 + offset. */
function lapsFor(driver, durations, offset = 0) {
  let t = T0 + offset * 1000;
  return durations.map((d, i) => {
    const lap = { driver_number: driver, lap_number: i + 1, date_start: new Date(t).toISOString(), lap_duration: d, is_pit_out_lap: false };
    t += d * 1000;
    return lap;
  });
}
const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

// Car 1 runs 1.0 s behind car 2, stops first (lap 10) and comes out ahead after car 2 stops (lap 12): undercut worked.
const car1 = lapsFor(1, seq(20, (l) => (l === 10 ? 100 : l === 11 ? 102 : l > 11 ? 88 : 90)), 1);
const car2 = lapsFor(2, seq(20, (l) => (l === 12 ? 100 : l === 13 ? 102 : l > 13 ? 88.5 : 90)), 0);
// Car 3 leads car 4 by 2 s and stops first (lap 5); car 4 stays out on quicker laps and stops on lap 8: overcut worked.
const car3 = lapsFor(3, seq(20, (l) => (l === 5 ? 100 : l === 6 ? 102 : 90)), -40);
const car4 = lapsFor(4, seq(20, (l) => (l === 8 ? 100 : l === 9 ? 102 : l >= 5 && l <= 7 ? 89 : 90)), -38);
// Car 5 is 30 s clear of everyone: never part of a battle.
const car5 = lapsFor(5, seq(20, (l) => (l === 6 ? 100 : l === 7 ? 102 : 90)), -80);
const laps = [...car1, ...car2, ...car3, ...car4, ...car5];
const pits = [
  { driver_number: 1, lap_number: 10, lane_duration: 22.1 },
  { driver_number: 2, lap_number: 12, lane_duration: 22.4 },
  { driver_number: 3, lap_number: 5, lane_duration: 22.0 },
  { driver_number: 4, lap_number: 8, pit_duration: 23.0 },
  { driver_number: 5, lap_number: 6, lane_duration: 21.9 },
  { driver_number: 5, lap_number: 1, lane_duration: null }, // formation-lap artefact
];

test("line-crossing times and running order", () => {
  const cross = crossingTimes(car2);
  near(cross.get(2).get(1), T0 + 90_000);
  near(cross.get(2).get(20), T0 + (11 * 90 + 100 + 102 + 7 * 88.5) * 1000);
  const all = crossingTimes(laps);
  const order = orderAt(all, 9);
  assert.deepEqual([...order.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n), [5, 4, 3, 2, 1]); // car 4 has already overcut car 3 by lap 9
});

test("pit stops are grouped, sorted and cleaned", () => {
  const s = stopsByDriver(pits);
  assert.deepEqual(s.get(5).map((x) => x.lap), [6]);
  assert.equal(s.get(4)[0].lane, 23.0); // falls back to pit_duration
  assert.equal(neutralLap([{ start: 3, end: 5 }], 4), true);
  assert.equal(neutralLap([{ start: 3, end: 5 }], 6), false);
});

test("undercut and overcut outcomes", () => {
  const battles = pitBattles({ laps, pits });
  assert.equal(battles.length, 2);
  const [over, under] = battles;
  assert.equal(over.first, 3);
  assert.equal(over.second, 4);
  assert.equal(over.kind, "overcut");
  assert.equal(over.outcome, "overcut-worked");
  assert.equal(over.caller, 4);
  near(over.before, -2);
  assert.ok(over.after > 0);
  near(over.gain, over.after - over.before);
  assert.equal(under.first, 1);
  assert.equal(under.second, 2);
  assert.equal(under.outcome, "undercut-worked");
  near(under.before, 1);
  near(under.after, -3);
  near(under.gain, 4);
  assert.deepEqual(under.posBefore, [5, 4]);
  assert.deepEqual(under.posAfter, [4, 5]);
  assert.deepEqual(under.lane, [22.1, 22.4]);
  const s = battleSummary(battles);
  assert.deepEqual(s.undercut, { tries: 1, worked: 1 });
  assert.deepEqual(s.overcut, { tries: 1, worked: 1 });
});

test("battle thresholds: gap window, lap spread, neutralised and same-lap stops", () => {
  assert.equal(pitBattles({ laps, pits, window: 0.5 }).length, 0);
  assert.equal(pitBattles({ laps, pits, maxLapsApart: 1 }).length, 0);
  const n = pitBattles({ laps, pits, neutral: [{ start: 12, end: 13 }] });
  const u = n.find((b) => b.first === 1);
  assert.equal(u.neutralised, true);
  assert.equal(u.outcome, "neutralised");
  assert.equal(battleSummary(n).neutralised, 1);
  const same = pits.map((p) => (p.driver_number === 2 ? { ...p, lap_number: 10 } : p));
  assert.equal(pitBattles({ laps, pits: same }).some((b) => b.first === 1 || b.second === 1), false);
});

test("pit-lane loss against the median green lap", () => {
  const l = pitLoss({ laps: [...car1], pits: [pits[0]] });
  assert.equal(l.n, 1);
  near(l.perStop[0].loss, 100 + 102 - 2 * 88);
  near(l.lane, 22.1);
  // Neutralised stops are excluded.
  assert.equal(pitLoss({ laps: car1, pits: [pits[0]], neutral: [{ start: 10, end: 10 }] }).n, 0);
});

test("sector marks and slowest corners on estimated distance", () => {
  const rows = seq(100, (i) => ({ t: i, d: i * 50 }));
  assert.deepEqual(sectorMarks(rows, 30, 40), [1500, 3500]);
  assert.deepEqual(sectorMarks(rows, null, 40), []);
  const lap = (minA, minB) => {
    const out = [];
    for (let d = 0; d <= 3000; d += 10) {
      const v1 = d < 1100 ? 300 : d < 1300 ? 300 - ((d - 1100) / 200) * (300 - minA) : Math.min(300, minA + (d - 1300) * 0.4);
      const v2 = d < 2150 ? 300 : d < 2300 ? 300 - ((d - 2150) / 150) * (300 - minB) : Math.min(300, minB + (d - 2300) * 0.4);
      out.push({ d, speed: Math.min(v1, v2), brake: (d >= 1100 && d < 1300) || (d >= 2150 && d < 2300) ? 100 : 0 });
    }
    return out;
  };
  const corners = slowestCorners(lap(100, 150), lap(110, 140), 1);
  assert.equal(corners.length, 1);
  assert.ok(Math.abs(corners[0].apex - 1300) <= 20);
  near(corners[0].a, 100);
  near(corners[0].b, 110);
  near(corners[0].diff, -10);
  assert.equal(slowestCorners(lap(100, 150), lap(110, 140), 5).length, 2);
});

test("wet score and modern points", () => {
  near(wetScore([2021, 12, 1.2, 0.6, 5, 0.8, 1, 15]), 1.5);
  assert.equal(wetScore(undefined), 0);
  assert.equal(modernPts(1), 25);
  assert.equal(modernPts(10), 1);
  assert.equal(modernPts(11), 0);
  assert.equal(modernPts(null), 0);
});

const race = (wet, rows) => ({ wet, results: rows.map(([d, c, pos, grid]) => ({ d, c, pos, grid, start: true })) });
const races = [
  race(true, [[1, 10, 1, 5], [2, 10, 3, 1], [3, 20, 2, 2]]),
  race(true, [[1, 10, 2, 4], [2, 10, null, 2], [3, 20, 1, 1]]),
  race(false, [[1, 10, 3, 3], [2, 10, 1, 1], [3, 20, 2, 2]]),
  race(false, [[1, 10, 3, 3], [2, 10, 2, 2], [3, 20, 1, 1]]),
];

test("wet vs dry table per driver and team", () => {
  const t = wetDryTable(races, { minWet: 2, minDry: 2 });
  assert.equal(t[0].id, 1); // biggest uplift
  near(t[0].wet.ptsPerStart, (25 + 18) / 2);
  near(t[0].dry.ptsPerStart, 15);
  near(t[0].wet.avgGained, (4 + 2) / 2);
  near(t[0].uplift, 21.5 - 15);
  const d2 = t.find((r) => r.id === 2);
  near(d2.wet.finishRate, 0.5);
  assert.equal(wetDryTable(races, { minWet: 3, minDry: 2 }).length, 0);
  const teams = wetDryTable(races, { by: "team", minWet: 2, minDry: 2 });
  assert.equal(teams.length, 2);
  // A team counts once per race (its first listed starter).
  assert.equal(teams.find((r) => r.id === 10).wet.starts, 2);
});

test("team-mate head-to-head edge in the wet", () => {
  const e = teammateWetEdge(races);
  assert.deepEqual(e.get(1).wet, { won: 2, n: 2 });
  assert.deepEqual(e.get(1).dry, { won: 0, n: 2 });
  near(e.get(1).delta, 1);
  near(e.get(2).delta, -1);
  assert.equal(e.has(3), false); // no team-mate
});

test("measured session rain and wet pace", () => {
  const samples = seq(60, (i) => ({ date: new Date(T0 + i * 60e3).toISOString(), rainfall: i > 50 ? 1 : 0, track_temperature: 20 + i * 0.1, air_temperature: 15 }));
  const r = sessionRain(samples);
  assert.equal(r.samples, 60);
  assert.equal(r.rainSamples, 10);
  near(r.share, 10 / 60);
  assert.equal(r.wet, true);
  assert.equal(sessionRain(samples, 0.2).wet, false);
  near(r.track.min, 20.1);
  assert.equal(sessionRain([]).wet, false);
  const pace = sessionPace([...lapsFor(7, seq(10, () => 100)), ...lapsFor(8, seq(10, () => 101)), ...lapsFor(9, seq(3, () => 99))]);
  assert.equal(pace.length, 2);
  assert.equal(pace[0].driver, 7);
  near(pace[1].gapPct, 1);
});
