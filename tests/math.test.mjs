import { test } from "node:test";
import assert from "node:assert/strict";
import {
  timeSeconds,
  summarize,
  headToHead,
  strategyTime,
  projectChampionship,
  distanceTrace,
  lapDelta,
  sampleAt,
} from "../src/math.mjs";
test("lap parsing and missing data", () => {
  assert.equal(timeSeconds("1:23.450"), 83.45);
  assert.equal(timeSeconds(""), null);
  assert.equal(timeSeconds("invalid"), null);
  assert.equal(summarize([]), null);
});
test("strategy computes degradation by stint age and validates stops", () => {
  assert.equal(strategyTime(4, 90, [2], 0.1, 20).time, 380.2);
  assert.throws(() => strategyTime(60, 90, [20, 20], 0.08, 22));
  assert.throws(() => strategyTime(60, 90, [60], 0.08, 22));
  assert.equal(strategyTime(4, 90, [], 0, 20).time, 360);
});
const standings = [
  { position: "1", points: "100", Driver: { driverId: "a" } },
  { position: "2", points: "90", Driver: { driverId: "b" } },
];
test("season-specific full-event scoring and bonus eligibility", () => {
  assert.equal(
    projectChampionship(standings, ["b", "a"], 2026)[0].projected,
    118,
  );
  assert.equal(
    projectChampionship(standings, ["b", "a"], 2024, "race", "a").find(
      (x) => x.Driver.driverId === "a",
    ).added,
    19,
  );
  assert.equal(
    projectChampionship(standings, ["b", "a"], 2026, "race", "a").find(
      (x) => x.Driver.driverId === "a",
    ).added,
    18,
  );
  assert.equal(
    projectChampionship(standings, ["b", "a"], 2021, "sprint")[0].added,
    2,
  );
  assert.throws(() => projectChampionship(standings, ["a", "a"], 2026));
  assert.throws(() => projectChampionship(standings, ["a"], 2009));
  assert.throws(() => projectChampionship(standings, ["a"], 2020, "sprint"));
});
test("distance alignment yields known physical timing delta", () => {
  const t = "2025-01-01T00:00:";
  const a = distanceTrace(
    [0, 1, 2].map((i) => ({ date: `${t}0${i}Z`, speed: 36 })),
  );
  const b = distanceTrace(
    [0, 1, 2].map((i) => ({ date: `${t}0${i}Z`, speed: 18 })),
  );
  assert.equal(a.at(-1).distance, 20);
  const d = lapDelta(a, b, 2);
  assert.equal(d.at(-1).delta, 1);
  assert.throws(() =>
    distanceTrace([
      { date: t + "00Z", speed: 36 },
      { date: t + "05Z", speed: 36 },
    ]),
  );
});
test("replay uses absolute time and hides gaps", () => {
  const a = [
    { date: "2025-01-01T00:00:00Z", x: 0, y: 0 },
    { date: "2025-01-01T00:00:02Z", x: 20, y: 10 },
  ];
  assert.equal(sampleAt(a, Date.parse(a[0].date) + 1000).x, 10);
  assert.equal(sampleAt(a, Date.parse(a[0].date) - 1), null);
  assert.equal(
    sampleAt(
      [{ ...a[0] }, { ...a[1], date: "2025-01-01T00:00:08Z" }],
      Date.parse(a[0].date) + 1000,
    ),
    null,
  );
});
test("race head to head counts only shared entries", () => {
  const races = [
    {
      Results: [
        { Driver: { driverId: "a" }, position: "1" },
        { Driver: { driverId: "b" }, position: "2" },
      ],
    },
    { Results: [{ Driver: { driverId: "b" }, position: "1" }] },
  ];
  assert.deepEqual(headToHead(races, "a", "b"), {
    a: 1,
    b: 0,
    ties: 0,
    paired: 1,
  });
});
