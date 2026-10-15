import { test } from "node:test";
import assert from "node:assert/strict";
import {
  segmentStatus, lapSegments, segmentSummary, mapSegments, slicePath, pathLengths,
  detectCorners, mergeCorners, cornerMetrics, windowDelta,
  neutralWindows, classifyLaps, polyfit, fitStints, compoundSummary, medianOf, mad,
  chunkWindows, fetchEstimate, trackAt, mergeSamples,
} from "../src/lab.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("mini-sector status codes", () => {
  assert.equal(segmentStatus(2048), "yellow");
  assert.equal(segmentStatus(2049), "green");
  assert.equal(segmentStatus(2051), "purple");
  assert.equal(segmentStatus(2064), "pit");
  assert.equal(segmentStatus(0), "none");
  assert.equal(segmentStatus(null), "none");
  assert.equal(segmentStatus(2052), "unknown");
  const lap = { segments_sector_1: [2048, 2049, null], segments_sector_2: [2051], segments_sector_3: null };
  assert.deepEqual(lapSegments(lap), [["yellow", "green", "none"], ["purple"], []]);
  const s = segmentSummary(lap);
  assert.equal(s.total, 4);
  assert.equal(s.purple, 1);
  assert.equal(s.none, 1);
});

test("mini-sectors are placed proportionally inside measured sector bounds", () => {
  // Straight line 0..300 m covered at constant speed in 30 s; sectors 10 s each.
  const pts = Array.from({ length: 31 }, (_, i) => ({ t: i, x: i * 10, y: 0 }));
  const segs = mapSegments(pts, [10, 10, 10], [2, 1, 3]);
  assert.equal(segs.length, 6);
  near(segs[0].f0, 0); near(segs[0].f1, 1 / 6); near(segs[1].f1, 1 / 3);
  near(segs[2].f0, 1 / 3); near(segs[2].f1, 2 / 3);
  near(segs[5].f1, 1);
  // Missing sector times fall back to equal thirds.
  near(mapSegments(pts, [null, null, null], [1, 1, 1])[1].f0, 1 / 3);
  const cum = pathLengths(pts);
  const piece = slicePath(pts, cum, 0.25, 0.5);
  near(piece[0].x, 75); near(piece.at(-1).x, 150);
});

// Synthetic lap: 1000 m straight at 300, brake to 100 at 1300 m, accelerate; second corner at 2300 m.
function synthetic(shift = 0, minA = 100, minB = 150) {
  const rows = [];
  for (let d = 0; d <= 3000; d += 10) {
    const v1 = d < 1100 + shift ? 300 : d < 1300 + shift ? 300 - ((d - 1100 - shift) / 200) * (300 - minA) : Math.min(300, minA + (d - 1300 - shift) * 0.4);
    const v2 = d < 2150 ? 300 : d < 2300 ? 300 - ((d - 2150) / 150) * (300 - minB) : Math.min(300, minB + (d - 2300) * 0.4);
    const speed = Math.min(v1, v2);
    const brake = (d >= 1100 + shift && d < 1300 + shift) || (d >= 2150 && d < 2300) ? 100 : 0;
    rows.push({ d, speed, brake });
  }
  return rows;
}

test("corner detection finds braking zones with a sufficient drop and brake applied", () => {
  const rows = synthetic();
  const corners = detectCorners(rows);
  assert.equal(corners.length, 2);
  assert.ok(Math.abs(corners[0].apex - 1300) <= 20);
  assert.ok(Math.abs(corners[1].apex - 2300) <= 20);
  assert.ok(Math.abs(corners[0].brakeD - 1100) <= 20);
  // A lift without brake is not a corner.
  const lift = rows.map((r) => ({ ...r, brake: 0 }));
  assert.equal(detectCorners(lift).length, 0);
  // Small dips are ignored.
  const flat = rows.map((r) => ({ ...r, speed: 300 - (Math.abs(r.d - 500) < 30 ? 10 : 0), brake: Math.abs(r.d - 500) < 30 ? 100 : 0 }));
  assert.equal(detectCorners(flat).length, 0);
});

test("corner merging and per-driver metrics", () => {
  const a = detectCorners(synthetic(0)), b = detectCorners(synthetic(30, 110));
  const merged = mergeCorners(a, b);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].seenBy, "both");
  const mA = cornerMetrics(synthetic(0), merged[0].apex, { exit: 100 });
  const mB = cornerMetrics(synthetic(30, 110), merged[0].apex, { exit: 100 });
  assert.ok(mB.brakeD > mA.brakeD, "B brakes later");
  assert.equal(mA.minSpeed, 100);
  assert.ok(mB.minSpeed >= 110);
  assert.ok(mA.exitSpeed !== null);
  const delta = [{ distance: 0, delta: 0 }, { distance: 1000, delta: 0.1 }, { distance: 2000, delta: -0.2 }];
  near(windowDelta(delta, 500, 1500), -0.1);
  assert.equal(windowDelta(delta, 500, 5000), null);
});

test("neutralisation windows from race control", () => {
  const rc = [
    { date: "2023-04-02T04:20:00Z", category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN LIGHT - PIT EXIT OPEN" },
    { date: "2023-04-02T05:04:27Z", category: "SafetyCar", message: "SAFETY CAR DEPLOYED" },
    { date: "2023-04-02T05:07:27Z", category: "SafetyCar", message: "SAFETY CAR IN THIS LAP" },
    { date: "2023-04-02T05:09:12Z", category: "Flag", flag: "CLEAR", scope: "Track", message: "TRACK CLEAR" },
    { date: "2023-04-02T05:20:00Z", category: "Flag", flag: "YELLOW", scope: "Sector", message: "YELLOW IN TRACK SECTOR 4" },
    { date: "2023-04-02T05:48:36Z", category: "SafetyCar", message: "VIRTUAL SAFETY CAR DEPLOYED" },
    { date: "2023-04-02T05:49:00Z", category: "Flag", flag: "RED", scope: "Track", message: "RED FLAG" },
    { date: "2023-04-02T05:50:52Z", category: "Flag", flag: "CLEAR", scope: "Track", message: "TRACK CLEAR" },
    { date: "2023-04-02T06:38:32Z", category: "SafetyCar", message: "SAFETY CAR DEPLOYED" },
  ];
  const w = neutralWindows(rc);
  assert.equal(w.length, 3);
  assert.equal(w[0].kind, "SC");
  assert.equal(w[0].end, Date.parse("2023-04-02T05:09:12Z"));
  assert.equal(w[1].kind, "RED");
  assert.equal(w[2].end, Infinity);
});

function race() {
  const laps = [], t0 = Date.parse("2024-09-01T13:03:00Z");
  let t = t0;
  for (let lap = 1; lap <= 30; lap++) {
    const age = lap <= 15 ? lap - 1 : lap - 16;
    let dur = 82 + 0.1 * age;
    if (lap === 1) dur = 90;
    if (lap === 22) dur = 120; // outlier (traffic / incident)
    laps.push({
      driver_number: 16, lap_number: lap, lap_duration: dur, date_start: new Date(t).toISOString(), is_pit_out_lap: lap === 16,
      segments_sector_1: [2048], segments_sector_2: [2048], segments_sector_3: lap === 15 ? [2048, 2064] : [2048],
    });
    t += dur * 1000;
  }
  const stints = [
    { driver_number: 16, stint_number: 1, compound: "MEDIUM", lap_start: 1, lap_end: 15, tyre_age_at_start: 0 },
    { driver_number: 16, stint_number: 2, compound: "HARD", lap_start: 16, lap_end: 30, tyre_age_at_start: 0 },
  ];
  return { laps, stints, t0 };
}

test("clean-lap classification excludes lap 1, pit laps, neutralised laps and outliers", () => {
  const { laps, stints } = race();
  const sc = { start: Date.parse(laps[7].date_start) + 10000, end: Date.parse(laps[8].date_start) + 5000, kind: "SC" };
  const c = classifyLaps(laps, stints, [sc]);
  const reason = (n) => c.find((r) => r.lap === n).reason;
  assert.equal(reason(1), "lap1");
  assert.equal(reason(15), "pit-in");
  assert.equal(reason(16), "pit-out");
  assert.equal(reason(8), "neutralised");
  assert.equal(reason(9), "neutralised");
  assert.equal(reason(10), "restart");
  assert.equal(reason(22), "outlier");
  assert.equal(reason(5), null);
  assert.equal(c.find((r) => r.lap === 20).age, 4);
});

test("polynomial fits and stint degradation slopes", () => {
  const lin = polyfit([0, 1, 2, 3, 4], [80, 80.1, 80.2, 80.3, 80.4], 1);
  near(lin.coef[0], 80); near(lin.coef[1], 0.1); near(lin.r2, 1);
  const q = polyfit([0, 1, 2, 3, 4, 5], [1, 2, 5, 10, 17, 26], 2);
  near(q.coef[0], 1, 1e-6); near(q.coef[1], 0, 1e-6); near(q.coef[2], 1, 1e-6);
  assert.equal(polyfit([1, 2], [1, 2], 1), null);
  const { laps, stints } = race();
  const fits = fitStints(classifyLaps(laps, stints, []), 1);
  assert.equal(fits.length, 2);
  near(fits[0].slope, 0.1, 1e-9);
  near(fits[0].base, 82, 1e-9);
  assert.equal(fits[1].compound, "HARD");
  near(fitStints(classifyLaps(laps, stints, []), 1, { fuel: 0.05 })[0].slope, 0.15, 1e-9);
  assert.equal(fitStints(classifyLaps(laps, stints, []), 2).length, 2);
  const summary = compoundSummary(fits);
  assert.deepEqual(summary.map((s) => s.compound), ["MEDIUM", "HARD"]);
  near(summary[0].slope.median, 0.1, 1e-9);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
});

test("replay windows, estimates and interpolation", () => {
  assert.deepEqual(chunkWindows(0, 400000), [[0, 180000], [180000, 360000], [360000, 400000]]);
  assert.ok(fetchEstimate(20) >= 8 && fetchEstimate(20) < 20);
  assert.ok(fetchEstimate(40) > 45, "second batch waits for the per-minute budget");
  assert.equal(fetchEstimate(0), 0);
  const ts = [0, 1000, 2000, 9000], xs = [0, 10, 20, 90], ys = [0, 0, 0, 0];
  assert.deepEqual(trackAt(ts, xs, ys, 1500), [15, 0]);
  assert.equal(trackAt(ts, xs, ys, 5000), null, "no interpolation across a gap");
  assert.equal(trackAt(ts, xs, ys, -1), null);
  assert.deepEqual(mergeSamples([{ t: 1 }, { t: 3 }], [{ t: 2 }, { t: 3 }]).map((s) => s.t), [1, 2, 3]);
});

import { neutralWindows as windowsFor } from "../src/lab.mjs";
test("2026 abbreviated race-control messages are recognised as a VSC", () => {
  const msgs = [
    { date: "2026-10-11T12:16:35+00:00", category: "SafetyCar", message: "VSC DEPLOYED", lap_number: 8, flag: null, scope: null },
    { date: "2026-10-11T12:17:40+00:00", category: "SafetyCar", message: "VSC ENDING", lap_number: 9, flag: null, scope: null },
    { date: "2026-10-11T12:18:40+00:00", category: "Flag", message: "GREEN LIGHT - TRACK CLEAR", lap_number: 9, flag: "GREEN", scope: "Track" },
  ];
  const w = windowsFor(msgs);
  assert.ok(w.length >= 1);
  assert.equal(w[0].kind, "VSC");
});
