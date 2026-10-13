import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeRacePage,
  snapshotMatches,
  normalizePreference,
  validSeason,
  validTimezone,
  seasonHref,
  buildCalendar,
  recordedRank,
  weekendSessions,
} from "../src/domain.mjs";
test("unranked first-round standings remain unknown instead of NaN or a fabricated rank", () => {
  for (const value of ["-", "", undefined, null, "0", "1.5"])
    assert.equal(recordedRank(value), null);
  assert.equal(recordedRank("01"), 1);
  assert.equal(recordedRank("20"), 20);
});

test("pagination merges split races without mutating cached source arrays or duplicating drivers", () => {
  const first = Object.freeze({
    season: "2025",
    round: "1",
    Results: Object.freeze([{ Driver: { driverId: "a" }, points: "25" }]),
  });
  const second = {
    season: "2025",
    round: "1",
    Results: [{ Driver: { driverId: "b" }, points: "18" }],
  };
  const joined = mergeRacePage(mergeRacePage([], [first]), [second]);
  assert.equal(joined[0].Results.length, 2);
  assert.equal(first.Results.length, 1);
  assert.equal(mergeRacePage(joined, [second])[0].Results.length, 2);
  assert.notEqual(joined[0].Results, first.Results);
  assert.equal(mergeRacePage([], [first])[0].Results.length, 1);
});
test("dated current-season fallback rejects the wrong season and invalid metadata", () => {
  const snapshot = {
    fetchedAt: "2026-10-13T05:00:00Z",
    responses: {
      "current.json": { MRData: { RaceTable: { season: "2026" } } },
    },
  };
  assert.equal(snapshotMatches(snapshot, "current.json", 2026), true);
  assert.equal(snapshotMatches(snapshot, "current.json", 2027), false);
  assert.equal(snapshotMatches(snapshot, "current/drivers.json", 2026), false);
  assert.equal(
    snapshotMatches({ ...snapshot, fetchedAt: "broken" }, "current.json", 2026),
    false,
  );
});
test("corrupt browser preferences cannot crash favorite lists or timezone formatting", () => {
  assert.equal(
    normalizePreference("timezone", { hacked: true }, "local"),
    "local",
  );
  assert.equal(normalizePreference("season", "1888", "current"), "current");
  assert.equal(normalizePreference("theme", "unknown", "dark"), "dark");
  assert.deepEqual(
    normalizePreference(
      "favorites",
      ["driver:norris", {}, "driver:norris", "team:mclaren", "javascript:foo"],
      [],
    ),
    ["driver:norris", "team:mclaren"],
  );
  assert.equal(validSeason("9999", 2026), false);
  assert.equal(validTimezone("Asia/Kolkata"), true);
  assert.equal(validTimezone(undefined), false);
});
test("season-aware destinations preserve intentional archive links and comparison selections", () => {
  assert.equal(seasonHref("race/5", "2025"), "#/race/5?season=2025");
  assert.equal(
    seasonHref("telemetry?season=2023", "2026"),
    "#/telemetry?season=2023",
  );
  assert.match(
    seasonHref("analytics?a=norris&b=piastri", "2025"),
    /a=norris&b=piastri&season=2025/,
  );
});
const race = {
  season: "2025",
  round: "1",
  raceName: "Example, Grand Prix; Test",
  date: "2025-03-16",
  time: "04:00:00Z",
  Circuit: { circuitName: "Circuit; City, Country" },
  FirstPractice: { date: "2025-03-14", time: "01:00:00Z" },
  Qualifying: { date: "2025-03-15", time: "05:00:00Z" },
};
test("calendar exports sort actual sessions, escape fields, and use stable per-session IDs", () => {
  assert.deepEqual(
    weekendSessions(race).map((s) => s.label),
    ["Practice 1", "Qualifying", "Grand Prix"],
  );
  const csv = buildCalendar([race], true, new Date("2026-10-13T00:00:00Z"));
  assert.equal((csv.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(csv, /DTSTART:20250314T010000Z/);
  assert.match(csv, /SUMMARY:Example\\, Grand Prix\\; Test/);
  assert.match(csv, /UID:2025-1-qualifying@f1pulse/);
  assert.match(csv, /DTSTAMP:20261013T000000Z/);
  assert.equal((buildCalendar([race]).match(/BEGIN:VEVENT/g) || []).length, 1);
});
test("calendar keeps missing session times all-day and folds long Unicode lines at 75 bytes", () => {
  const calendar = buildCalendar([
    { ...race, time: undefined, raceName: "São ".repeat(40) },
  ]);
  assert.match(calendar, /DTSTART;VALUE=DATE:20250316/);
  for (const line of calendar.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(calendar.includes("\r\n "));
});
