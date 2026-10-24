import { test } from "node:test";
import assert from "node:assert/strict";
import {
  qualiPace, despike, smoothSeries, noiseLevel, detectSteps, stepLevels, lapOneGains, eraTable, roundFactor, roundEntries,
  encodeEdits, decodeEdits, normaliseEntries, whatIfSeason, whatIfDiff, teammateComparisons, fitRatings, careerRatings,
  eraRating, RATING_BASE,
} from "../src/analytics-x.mjs";

const d = (id) => ({ driverId: id, givenName: id, familyName: id.toUpperCase(), nationality: "", dateOfBirth: "", url: "" });
const t = (id) => ({ constructorId: id, name: id, nationality: "", url: "" });

/* ───────────── Qualifying pace ───────────── */
const q = (driver, team, pos, Q1, Q2, Q3) => ({ Driver: d(driver), Constructor: t(team), position: String(pos), positionText: String(pos), points: "0", grid: "", laps: "", status: "", Q1, Q2, Q3 });
const qr = (round, rows) => ({ season: "2026", round: String(round), raceName: "R" + round, date: "", url: "", Circuit: {}, QualifyingResults: rows });

test("qualifying pace compares each car with the fastest time of its own session", () => {
  const res = qualiPace([
    qr(1, [
      q("a", "red", 1, "1:30.000", "1:29.500", "1:29.000"),
      q("b", "red", 2, "1:30.200", "1:29.700", "1:29.300"),
      q("c", "blue", 3, "1:30.100", "1:29.900", "1:29.445"),
      q("e", "green", 11, "1:30.900", "1:30.450"), // Q2 exit: vs Q2 fastest 1:29.500
      q("f", "grey", 16, "1:31.800"), // Q1 exit: vs Q1 fastest 1:30.000
    ]),
  ]);
  const by = Object.fromEntries(res.teams.map((x) => [x.id, x]));
  assert.equal(by.red.raw[0], 0, "pole car is the reference");
  assert.equal(by.red.who[0].driverId, "a");
  assert.equal(by.blue.raw[0], 0.5);
  assert.equal(by.green.raw[0], 1.061);
  assert.equal(by.green.who[0].session, "Q2");
  assert.equal(by.grey.raw[0], 2);
  assert.deepEqual(res.teams.map((x) => x.id), ["red", "blue", "green", "grey"]);
});

test("qualifying outliers stay in raw but not in the fitted series", () => {
  const res = qualiPace([qr(1, [q("a", "red", 1, "1:30.000"), q("b", "blue", 2, "1:36.000")])]);
  const blue = res.teams.find((x) => x.id === "blue");
  assert.equal(blue.raw[0], 6.667);
  assert.equal(blue.gaps[0], null);
  assert.equal(blue.excluded, 1);
});

/* ───────────── Step detection ───────────── */
test("smoothing and noise level", () => {
  assert.deepEqual(smoothSeries([1, 2, null, 4, 6]), [1.5, 1.5, null, 5, 5]);
  assert.equal(noiseLevel([1, 1, 1, 1]), 0.04, "floored");
  assert.ok(noiseLevel([1, 1.1, 0.95, 1.08, 1.0, 1.15, 0.9]) > 0.05);
});

test("a clear step in pace is detected with its size and position", () => {
  const v = [1.0, 1.05, 0.98, 1.02, 1.01, null, 0.5, 0.52, 0.48, 0.51, 0.5];
  const steps = detectSteps(v);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].index, 6, "index in the original (null-including) series");
  assert.ok(Math.abs(steps[0].effect + 0.5) < 0.03);
  assert.ok(steps[0].z >= 3);
  const lv = stepLevels(v, steps);
  assert.equal(lv[5], null);
  assert.ok(Math.abs(lv[0] - 1.012) < 1e-9 && Math.abs(lv[10] - 0.502) < 1e-9);
});

test("noise and small shifts are not called steps", () => {
  assert.deepEqual(detectSteps([1, 1.3, 0.8, 1.2, 0.9, 1.25, 0.85, 1.1, 0.95, 1.2]), []);
  assert.deepEqual(detectSteps([1, 1.01, 1, 1.01, 1, 0.9, 0.91, 0.9, 0.91, 0.9]), [], "0.1 pp is below the minimum effect");
  assert.deepEqual(detectSteps([1, 0.5, 0.5]), [], "too short");
});

test("isolated spikes are removed before fitting, sustained shifts are kept", () => {
  const { clean, spikes } = despike([1, 1.05, 0.95, 2.6, 1.02, 0.98, 1.0]);
  assert.deepEqual(spikes, [3]);
  assert.equal(clean[3], null);
  assert.deepEqual(despike([1, 1, 1, 2, 2, 2, 2]).spikes, [], "a step is not a spike");
});

test("two steps are found by binary segmentation", () => {
  const v = [2, 2.02, 1.98, 2.01, 1.5, 1.52, 1.49, 1.51, 1.0, 1.02, 0.99, 1.01];
  const steps = detectSteps(v);
  assert.deepEqual(steps.map((s) => s.index), [4, 8]);
  assert.ok(steps.every((s) => s.effect < -0.4));
});

/* ───────────── Lap one ───────────── */
const res = (driver, team, grid, pos, extra = {}) => ({ Driver: d(driver), Constructor: t(team), grid: String(grid), position: String(pos), positionText: String(pos), points: "0", laps: "50", status: "Finished", ...extra });
test("lap-one gains: grid vs end of lap 1, pit-lane starts, lap-1 retirements, non-starters", () => {
  const races = [
    { season: "2024", round: "1", raceName: "One", Results: [res("a", "red", 1, 1), res("b", "red", 2, 2), res("c", "blue", 3, 3), res("e", "blue", 0, 4), res("f", "x", 5, 5, { positionText: "R", status: "Collision" }), res("g", "x", 6, 6, { positionText: "W", status: "Did not start" })] },
    { season: "2024", round: "2", raceName: "Two", Results: [res("a", "red", 2, 1), res("b", "red", 1, 2)] },
    { season: "2024", round: "3", raceName: "Three", Results: [res("a", "red", 1, 1)] },
  ];
  const laps = new Map([
    ["1", [{ driverId: "c", position: "1" }, { driverId: "a", position: "2" }, { driverId: "e", position: "3" }, { driverId: "b", position: "4" }]],
    ["2", [{ driverId: "a", position: "1" }, { driverId: "b", position: "2" }]],
  ]);
  const r = lapOneGains(races, laps);
  assert.equal(r.loaded, 2, "round 3 not loaded yet");
  const by = Object.fromEntries(r.drivers.map((x) => [x.id, x]));
  assert.equal(by.c.total, 2);
  assert.equal(by.e.total, 2, "pit-lane start counts from the back of a 5-car field");
  assert.equal(by.e.pitLane, 1);
  assert.equal(by.a.total, 0, "−1 then +1");
  assert.equal(by.a.starts, 2);
  assert.equal(by.b.total, -3);
  assert.equal(by.b.worst.gain, -2);
  assert.equal(by.f.out, 1);
  assert.equal(by.f.starts, 0);
  assert.equal(by.g, undefined, "non-starters are ignored");
  assert.equal(r.best.gain, 2);
  assert.equal(r.worst.id, "b");
});

/* ───────────── What If ───────────── */
const row = (dd, c, pos, pts, extra = {}) => ({ d: dd, c, grid: 1, text: pos === null ? "R" : String(pos), pos, pts, status: pos === null ? "Engine" : "Finished", laps: 50, fl: 0, ms: 0, order: 0, ...extra });

test("era tables and round multipliers", () => {
  assert.deepEqual(eraTable(1955).race, [8, 6, 4, 3, 2]);
  assert.equal(eraTable(1955).fastestLap, "any");
  assert.deepEqual(eraTable(1975).race, [9, 6, 4, 3, 2, 1]);
  assert.equal(eraTable(2021).fastestLap, "top10");
  assert.equal(eraTable(2025).fastestLap, null);
  assert.deepEqual(eraTable(2023).sprint, [8, 7, 6, 5, 4, 3, 2, 1]);
  const T = eraTable(2021).race;
  assert.equal(roundFactor([row(0, 0, 1, 12.5), row(1, 0, 2, 9), row(2, 1, 3, 7.5)], T), 0.5);
  assert.equal(roundFactor([row(0, 0, 1, 50), row(1, 0, 2, 36), row(2, 1, 3, 30)], T), 2);
  assert.equal(roundFactor([row(0, 0, 1, 26), row(1, 0, 2, 18), row(2, 1, 3, 15)], T), 1, "fastest-lap point doesn't skew");
  // 1950s shared drive: two P1 rows are skipped.
  assert.equal(roundFactor([row(0, 0, 1, 5), row(1, 0, 1, 4), row(2, 1, 2, 6), row(3, 1, 3, 4)], eraTable(1951).race), 1);
});

const R1 = { round: "1", name: "One", results: [row(0, 0, 1, 25, { fl: 1 }), row(1, 0, 2, 18), row(2, 1, 3, 15), row(3, 1, null, 0), row(4, 2, null, 0, { text: "W", status: "Withdrew" })], sprint: [] };
const R2 = { round: "2", name: "Two", results: [row(1, 0, 1, 26, { fl: 1 }), row(0, 0, 2, 18), row(3, 1, 3, 15), row(2, 1, null, 0, { text: "D", status: "Disqualified" })], sprint: [{ d: 2, c: 1, pos: 1, pts: 8 }, { d: 0, c: 0, pos: 2, pts: 7 }] };
const season2021 = { season: 2021, rounds: [R1, R2] };

test("entries: finishers, then retirements and disqualifications; non-starters left out", () => {
  const e = roundEntries(R2);
  assert.deepEqual(e.map((x) => [x.d, x.st]), [[1, "f"], [0, "f"], [3, "f"], [2, "d"]]);
  assert.deepEqual(roundEntries(R1).map((x) => x.d), [0, 1, 2, 3]);
});

test("edits round-trip through the URL encoding; originals and garbage are dropped", () => {
  const list = normaliseEntries([{ ...roundEntries(R1)[1] }, { ...roundEntries(R1)[0] }, { ...roundEntries(R1)[2], st: "d" }, { ...roundEntries(R1)[3], st: "f" }]);
  const edits = new Map([["1", list], ["2", roundEntries(R2)]]);
  const text = encodeEdits(edits, season2021.rounds);
  assert.equal(text, "1.1032_");
  const back = decodeEdits(text, season2021.rounds);
  assert.deepEqual([...back.keys()], ["1"]);
  assert.deepEqual(back.get("1").map((x) => [x.d, x.st]), [[1, "f"], [0, "f"], [3, "f"], [2, "d"]]);
  assert.equal(decodeEdits("1.0012~9.01~x", season2021.rounds).size, 0, "duplicate index, unknown round");
  assert.equal(decodeEdits("1.012", season2021.rounds).size, 0, "incomplete list");
});

test("baseline keeps the recorded points; an edited round is rescored", () => {
  const base = whatIfSeason(season2021);
  const pts = Object.fromEntries(base.drivers.map((x) => [x.d, x.points]));
  assert.deepEqual(pts, { 0: 50, 1: 44, 2: 23, 3: 15 });
  // Swap the top two in round 1: the fastest-lap point stays with driver 0 (still in the top ten).
  const e = roundEntries(R1);
  const edits = new Map([["1", [e[1], e[0], e[2], e[3]]]]);
  const s = whatIfSeason(season2021, { edits });
  const p2 = Object.fromEntries(s.drivers.map((x) => [x.d, x.points]));
  assert.equal(p2[0], 18 + 1 + 18 + 7);
  assert.equal(p2[1], 25 + 26);
  assert.equal(s.drivers[0].d, 1);
  const diff = whatIfDiff(base, s);
  assert.equal(diff[0].rankDelta, 1);
  assert.equal(diff.find((x) => x.d === 0).pointsDelta, -6);
});

test("fastest-lap point needs a top-ten finish from 2019; DSQ scores nothing", () => {
  const e = roundEntries(R1);
  const edits = new Map([["1", [e[1], e[2], { ...e[3], st: "f" }, { ...e[0], st: "r" }]]]);
  const s = whatIfSeason(season2021, { edits });
  const p = Object.fromEntries(s.drivers.map((x) => [x.d, x.points]));
  assert.equal(p[0], 18 + 7, "retired: no race points, no bonus");
  assert.equal(p[3], 15 + 15, "retirement promoted to P3");
  const dsq = whatIfSeason(season2021, { edits: new Map([["1", [{ ...e[0], st: "d" }, e[1], e[2], e[3]]]]) });
  assert.equal(dsq.drivers.find((x) => x.d === 0).points, 18 + 7);
});

test("alternative points systems score every finish in full and only count sprints they define", () => {
  const s = whatIfSeason(season2021, { system: "1991" });
  const p = Object.fromEntries(s.drivers.map((x) => [x.d, x.points]));
  assert.deepEqual(p, { 0: 16, 1: 16, 2: 4, 3: 4 });
  assert.deepEqual(s.drivers.slice(0, 2).map((x) => x.d).sort(), [0, 1], "level on points and count-back");
  const cur = whatIfSeason(season2021, { system: "current" });
  assert.equal(cur.drivers.find((x) => x.d === 2).points, 15 + 8, "sprint win counted");
});

test("count-back decides ties on best finishes", () => {
  const S = { season: 2021, rounds: [
    { round: "1", name: "", results: [row(0, 0, 1, 25), row(1, 1, 2, 18), row(2, 2, 3, 15)], sprint: [] },
    { round: "2", name: "", results: [row(1, 1, 1, 25), row(2, 2, 2, 18), row(0, 0, 3, 15)], sprint: [] },
    { round: "3", name: "", results: [row(2, 2, 1, 25), row(0, 0, 2, 18), row(1, 1, 3, 15)], sprint: [] },
    { round: "4", name: "", results: [row(3, 3, 1, 25), row(0, 0, 11, 0), row(1, 1, 12, 0), row(2, 2, null, 0)], sprint: [] },
  ] };
  const r = whatIfSeason(S);
  // All three on 58 with a win, a second and a third each; driver 0's 11th beats driver 1's 12th.
  assert.deepEqual(r.drivers.map((x) => [x.d, x.points]), [[0, 58], [1, 58], [2, 58], [3, 25]]);
  assert.equal(r.drivers[0].wins, 1);
});

test("dropped scores follow the season's rules unless switched off", () => {
  // 1950: best four results counted.
  const mk = (i, p0) => ({ round: String(i), name: "", results: [row(0, 0, p0, p0 === 1 ? 8 : 6), row(1, 1, p0 === 1 ? 2 : 1, p0 === 1 ? 6 : 8)], sprint: [] });
  const S = { season: 1950, rounds: [mk(1, 1), mk(2, 1), mk(3, 1), mk(4, 1), mk(5, 1), mk(6, 2)] };
  const on = whatIfSeason(S);
  const a = on.drivers.find((x) => x.d === 0);
  assert.equal(a.points, 32);
  assert.equal(a.gross, 46);
  assert.equal(a.dropped, 14);
  assert.equal(whatIfSeason(S, { drops: false }).drivers.find((x) => x.d === 0).points, 46);
  assert.deepEqual(on.teams, [], "no constructors' championship before 1958");
});

test("best-car-only constructors before 1979 and the Indianapolis 500 exclusion", () => {
  const S = { season: 1960, rounds: [
    { round: "1", name: "", results: [row(0, 0, 1, 8), row(1, 0, 2, 6), row(2, 1, 3, 4)], sprint: [] },
    { round: "2", name: "Indy", indy: true, results: [row(3, 2, 1, 8), row(2, 1, 2, 6)], sprint: [] },
  ] };
  const r = whatIfSeason(S);
  assert.deepEqual(r.teams.map((x) => [x.c, x.points]), [[0, 8], [1, 4]]);
  assert.equal(r.drivers.find((x) => x.d === 2).points, 10, "drivers keep Indy points");
});

/* ───────────── Ratings ───────────── */
const rr = (season, rows) => ({ season, round: 1, results: rows.map(([dd, c, pos]) => row(dd, c, pos, 0)) });

test("teammate comparisons weigh crowded teams and skip retirements", () => {
  const c = teammateComparisons([rr(2000, [[0, 0, 1], [1, 0, 2], [2, 0, 3], [3, 1, 4], [4, 1, null]])]);
  assert.equal(c.win.length, 3, "three pairs in team 0, none in team 1 (retirement)");
  assert.ok(c.weight.every((w) => w === 0.5));
  const s0 = c.seasons[c.keyOf.get("0:2000")];
  assert.equal(s0.wins, 1);
  assert.equal(s0.comparisons, 1);
});

test("ratings order drivers by head-to-head dominance and centre on 1500", () => {
  const races = [];
  for (let i = 0; i < 20; i++) races.push(rr(2000, [[0, 0, 1], [1, 0, 2]]), rr(2001, [[1, 1, 1], [2, 1, 2]]));
  const out = careerRatings(races);
  const by = Object.fromEntries(out.drivers.map((x) => [x.d, x]));
  assert.ok(by[0].career > by[1].career && by[1].career > by[2].career);
  assert.ok(Math.abs(by[1].career - RATING_BASE) < 40, "middle driver near average");
  assert.equal(by[0].comparisons, 20);
  assert.equal(by[0].h2h, 1);
  assert.equal(by[0].confidence, "low");
  assert.ok(by[0].se > 0);
  assert.equal(by[1].seasons.length, 2);
  assert.ok(eraRating(by[1], 2001, 2001).rating > eraRating(by[1], 2000, 2000).rating, "season curve follows form");
  assert.equal(eraRating(by[0], 1990, 1999), null);
});

test("an even record yields equal ratings; more evidence narrows the interval", () => {
  const even = [];
  for (let i = 0; i < 10; i++) even.push(rr(2010, [[0, 0, 1], [1, 0, 2]]), rr(2010, [[1, 0, 1], [0, 0, 2]]));
  const { r } = fitRatings(teammateComparisons(even));
  assert.ok(Math.abs(r[0] - r[1]) < 1e-6);
  const few = careerRatings(even.slice(0, 4)).drivers[0].se;
  const many = careerRatings(even).drivers[0].se;
  assert.ok(many < few);
});
