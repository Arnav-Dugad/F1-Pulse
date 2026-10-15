import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageAt, ageRecords, careers, circuitTendencies, compareRows, decodeArchive, dominance, eraById, firstRaces, isStart, leaderboard,
  lineageSeasons, mergeSeason, modernPoints, normalisedChampions, onThisDay, poleOf, rescoreSeason, rivalry, rookieSeasons,
  seasonBests, tally, winStreaks, constructorSeasons, coverage,
} from "../src/lib/archive-core.mjs";

/*
 * Drivers: 0 ann (b. 1990-05-01), 1 bob (b. 1980-02-29), 2 cat (b. 2000-07-04), 3 dan (b. 1985-03-03)
 * Teams:   0 red, 1 blue, 2 indy
 * Circuits: 0 alpha, 1 beta, 2 indianapolis
 * Row: [d, c, grid, text, pts, status, laps, fl, ms]
 */
const file = {
  generatedAt: "2026-01-01T00:00:00Z", source: "", first: 2010, last: 2011, qualifyingFrom: 1994, sprintFrom: 2021,
  drivers: [["ann", "Ann", "A", "1990-05-01", "British", "ANN"], ["bob", "Bob", "B", "1980-02-29", "German", "BOB"], ["cat", "Cat", "C", "2000-07-04", "Dutch", "CAT"], ["dan", "Dan", "D", "1985-03-03", "French", "DAN"]],
  constructors: [["red", "Red", "Austrian"], ["blue", "Blue", "British"], ["indy", "Indy", "American"]],
  circuits: [["alpha", "Alpha", "A", "X", 0, 0], ["beta", "Beta", "B", "Y", 0, 0], ["indianapolis", "Indy", "I", "USA", 0, 0]],
  statuses: ["Finished", "Engine", "Withdrew", "+1 Lap"],
  races: [
    // 2010 R1 at alpha, qualifying pole bob; ann wins from grid 2 with fastest lap
    [2010, 1, "Alpha GP", 0, "2010-03-14", 1, [[0, 0, 2, "1", 25, 0, 50, 1, 5000000], [1, 0, 1, "2", 18, 0, 50, 2, 5000500], [3, 1, 3, "R", 0, 1, 10, 0, 0], [2, 1, 0, "W", 0, 2, 0, 0, 0]]],
    // 2010 R2 at beta, no qualifying → grid pole ann; ann hat-trick
    [2010, 2, "Beta GP", 1, "2010-05-01", -1, [[0, 0, 1, "1", 25, 0, 60, 1, 6000000], [3, 1, 4, "2", 18, 0, 60, 3, 6010000], [1, 0, 2, "3", 15, 0, 60, 2, 6020000]]],
    // 2011 R1 at alpha: dan wins, cat debuts (2nd) for blue, ann DNF
    [2011, 1, "Alpha GP", 0, "2011-03-14", 0, [[3, 1, 2, "1", 25, 0, 50, 0, 5000000], [2, 1, 5, "2", 18, 0, 50, 0, 5000100], [1, 0, 3, "3", 15, 0, 50, 0, 5003000], [0, 0, 1, "R", 0, 1, 5, 0, 0]], [[2, 1, "1", 8], [0, 0, "2", 7]]],
    // 2011 R2 at beta: ann wins again
    [2011, 2, "Beta GP", 1, "2011-05-01", 0, [[0, 0, 1, "1", 25, 0, 60, 1, 6000000], [2, 1, 2, "2", 18, 0, 60, 0, 6000040], [3, 1, 3, "3", 15, 0, 60, 0, 6000900], [1, 0, 4, "4", 12, 3, 59, 0, 0]]],
  ],
};
const A = decodeArchive(file);

test("decodes index tables and per-race rows", () => {
  assert.equal(A.drivers.length, 4);
  assert.equal(A.races.length, 4);
  assert.equal(A.driverIndex.get("cat"), 2);
  assert.deepEqual(A.seasons, [2010, 2011]);
  const r = A.races[0].results[0];
  assert.equal(r.pos, 1);
  assert.equal(r.fl, 1);
  assert.equal(r.ms, 5000000);
  assert.equal(A.races[0].results[2].pos, null);
  assert.equal(A.races[2].sprint.length, 2);
});

test("starts exclude withdrawals and non-qualifiers", () => {
  assert.equal(isStart({ text: "W", status: "Withdrew" }), false);
  assert.equal(isStart({ text: "F", status: "Did not qualify" }), false);
  assert.equal(isStart({ text: "R", status: "Did not start" }), false);
  assert.equal(isStart({ text: "R", status: "Engine" }), true);
  assert.equal(isStart({ text: "12", status: "+1 Lap" }), true);
});

test("pole uses qualifying P1, falling back to grid P1", () => {
  assert.deepEqual(poleOf(A.races[0]), { d: 1, c: 0, source: "qualifying" });
  assert.deepEqual(poleOf(A.races[1]), { d: 0, c: 0, source: "grid" });
});

test("tally aggregates drivers and constructors, including sprint points", () => {
  const t = tally(A);
  const ann = t.drivers.find((d) => d.idx === 0);
  assert.equal(ann.starts, 4);
  assert.equal(ann.wins, 3);
  assert.equal(ann.podiums, 3);
  assert.equal(ann.poles, 3); // grid pole 2010 R2 + qualifying 2011 R1, R2
  assert.equal(ann.fastestLaps, 3);
  assert.equal(ann.hatTricks, 2); // 2010 R2 and 2011 R2
  assert.equal(ann.points, 25 + 25 + 0 + 25 + 7);
  const cat = t.drivers.find((d) => d.idx === 2);
  assert.equal(cat.starts, 2); // 2010 withdrawal is not a start
  const red = t.teams.find((x) => x.idx === 0);
  assert.equal(red.starts, 4);
  assert.equal(red.wins, 3);
  assert.equal(red.oneTwos, 1);
  assert.equal(red.podiums, 6);
  const blue = t.teams.find((x) => x.idx === 1);
  assert.equal(blue.oneTwos, 1);
  assert.equal(t.races, 4);
  assert.equal(t.fastestLapRaces, 3);
});

test("era filters restrict the tally", () => {
  const t = tally(A, 2011, 2011);
  assert.equal(t.races, 2);
  assert.equal(t.drivers.find((d) => d.idx === 0).wins, 1);
  assert.equal(eraById("2014-21").from, 2014);
  assert.equal(eraById("nope").id, "all");
});

test("leaderboard sorts and applies a minimum for win percentage", () => {
  const t = tally(A);
  assert.deepEqual(leaderboard(t.drivers, "wins").map((x) => x.idx), [0, 3]);
  const pct = leaderboard(t.drivers, "winPct", { minStarts: 3 });
  assert.equal(pct[0].idx, 0);
  assert.equal(pct[0].value, 0.75);
  assert.ok(pct.every((x) => x.starts >= 3));
});

test("calendar ages, including 29 February birthdays", () => {
  assert.deepEqual(ageAt("1990-05-01", "2010-05-01"), { years: 20, days: 0, totalDays: 7305 });
  assert.equal(ageAt("1990-05-01", "2010-04-30").years, 19);
  assert.equal(ageAt("1980-02-29", "2011-03-01").years, 31);
  assert.equal(ageAt("1980-02-29", "2011-02-28").years, 30);
  assert.equal(ageAt("", "2011-02-28"), null);
});

test("youngest and oldest winners — one entry per driver", () => {
  const young = ageRecords(A, { kind: "win", order: "youngest" });
  assert.deepEqual(young.map((x) => x.idx), [0, 3]);
  assert.equal(young[0].race.date, "2010-03-14");
  const old = ageRecords(A, { kind: "win", order: "oldest" });
  assert.equal(old[0].idx, 3);
  const podium = ageRecords(A, { kind: "podium", order: "youngest" });
  assert.equal(podium[0].idx, 2); // cat, 10 years old in this toy data
});

test("win streaks count consecutive starts for drivers, consecutive races for teams", () => {
  const d = winStreaks(A, { kind: "driver" });
  assert.equal(d.length, 1);
  assert.equal(d[0].idx, 0);
  assert.equal(d[0].length, 2);
  const t = winStreaks(A, { kind: "constructor" });
  assert.equal(t[0].idx, 0);
  assert.equal(t[0].length, 2);
});

test("most wins in a season", () => {
  const s = seasonBests(A, { kind: "driver" });
  assert.deepEqual(s[0], { idx: 0, season: 2010, wins: 2, races: 2, pct: 1 });
});

test("circuit tendencies: places gained and pole conversion", () => {
  const c = circuitTendencies(A, { minRaces: 1 });
  const alpha = c.find((x) => x.idx === 0);
  // 2010: ann 2→1 (+1), bob 1→2 (−1); 2011: dan 2→1 (+1), cat 5→2 (+3), bob 3→3 (0)
  assert.equal(alpha.samples, 5);
  assert.equal(alpha.avgGain, 4 / 5);
  assert.equal(alpha.poleRaces, 2);
  assert.equal(alpha.poleWins, 0);
  const beta = c.find((x) => x.idx === 1);
  assert.equal(beta.conversion, 1);
});

test("dominance shares use the official champion when known", () => {
  const d = dominance(A, new Map([[2010, "ann"]]));
  const y2010 = d.find((x) => x.season === 2010);
  assert.equal(y2010.complete, true);
  assert.equal(y2010.champion, 0);
  assert.equal(y2010.winShare, 1);
  assert.equal(y2010.pointsShare, 50 / 101);
  assert.equal(y2010.winners, 1);
  const y2011 = d.find((x) => x.season === 2011);
  assert.equal(y2011.complete, false);
  assert.equal(y2011.winners, 2);
});

test("modern rescoring ignores sprint and fastest-lap points and breaks ties on countback", () => {
  assert.equal(modernPoints(1), 25);
  assert.equal(modernPoints(10), 1);
  assert.equal(modernPoints(11), 0);
  assert.equal(modernPoints(null), 0);
  const r = rescoreSeason(A, 2011);
  const byIdx = Object.fromEntries(r.list.map((v) => [v.idx, v]));
  assert.equal(byIdx[2].points, 36); // two seconds, sprint excluded
  assert.equal(byIdx[2].actual, 44); // 18+18+8 official incl. sprint
  assert.equal(byIdx[3].points, 40);
  assert.equal(byIdx[0].points, 25);
  assert.equal(r.list[0].idx, 3);
  assert.deepEqual(byIdx[0].trace, [0, 25]);
  const n = normalisedChampions(A, new Map([[2010, "ann"]]));
  assert.equal(n[0].champion, 0);
  assert.equal(n[0].margin, 50 - 33);
  assert.equal(n[1].complete, false);
});

test("first races trace (raw vs normalised)", () => {
  const raw = firstRaces(A, 2, 5);
  assert.deepEqual(raw.map((x) => x.cumulative), [26, 44]);
  const norm = firstRaces(A, 2, 5, true);
  assert.deepEqual(norm.map((x) => x.cumulative), [18, 36]);
});

test("careers, debuts and birthdays", () => {
  const c = careers(A);
  assert.equal(c[2].first.season, 2011);
  assert.equal(c[2].starts, 2);
  const day = onThisDay(A, "05-01");
  assert.equal(day.races.length, 2);
  assert.deepEqual(day.birthdays.map((b) => b.idx), [0]);
  const debut = onThisDay(A, "03-14");
  assert.deepEqual(debut.debuts.map((x) => x.idx).sort(), [0, 1, 2, 3]);
});

test("rookie seasons compare with team-mates", () => {
  const rookies = rookieSeasons(A);
  const cat = rookies.find((r) => r.idx === 2);
  assert.equal(cat.season, 2011);
  assert.equal(cat.starts, 2);
  assert.equal(cat.points, 44);
  assert.equal(cat.best, 2);
  assert.equal(cat.mates[0].idx, 3);
  assert.equal(cat.mates[0].races, 2);
  assert.equal(cat.ahead, 1);
  assert.equal(cat.behind, 1);
});

test("rivalry head-to-head, team-mate spells and closest finishes", () => {
  assert.ok(compareRows({ pos: 1 }, { pos: 2 }) < 0);
  assert.ok(compareRows({ pos: null }, { pos: 9 }) > 0);
  assert.equal(compareRows({ pos: null }, { pos: null }), 0);
  const r = rivalry(A, 0, 1); // ann vs bob, team-mates at red throughout
  assert.equal(r.totals.races, 4);
  assert.equal(r.totals.a, 3);
  assert.equal(r.totals.b, 1);
  assert.deepEqual(r.totals.oneOut, { a: 0, b: 1 });
  assert.equal(r.totals.sameTeam.races, 4);
  assert.equal(r.spells.length, 1);
  assert.equal(r.spells[0].from, 2010);
  assert.equal(r.spells[0].to, 2011);
  assert.equal(r.closest[0].gapMs, 500);
  const s = rivalry(A, 2, 3); // cat vs dan, 2011 only (2010 withdrawal excluded)
  assert.equal(s.totals.races, 2);
  assert.equal(s.closest[0].gapMs, 100);
  assert.equal(s.closest[1].gapMs, 860);
});

test("merging a live season appends drivers and replaces that season", () => {
  const d = (id) => ({ driverId: id, givenName: id, familyName: id.toUpperCase(), nationality: "X", dateOfBirth: "2005-01-01", url: "" });
  const t = (id) => ({ constructorId: id, name: id, nationality: "", url: "" });
  const live = [{
    season: "2012", round: "1", raceName: "Gamma GP", date: "2012-03-01", url: "",
    Circuit: { circuitId: "gamma", circuitName: "Gamma", url: "", Location: { lat: "1", long: "2", locality: "G", country: "Z" } },
    Results: [
      { position: "1", positionText: "1", points: "25", grid: "1", laps: "50", status: "Finished", Driver: d("eve"), Constructor: t("green"), Time: { time: "", millis: "100" }, FastestLap: { rank: "1", lap: "3", Time: { time: "" }, AverageSpeed: { speed: "" } } },
      { position: "2", positionText: "2", points: "18", grid: "2", laps: "50", status: "Finished", Driver: d("ann"), Constructor: t("red") },
    ],
  }];
  const sprint = [{ ...live[0], Results: undefined, SprintResults: [{ position: "1", positionText: "1", points: "8", grid: "1", laps: "20", status: "Finished", Driver: d("ann"), Constructor: t("red") }] }];
  const M = mergeSeason(A, "2012", live, new Map([["1", "eve"]]), sprint);
  assert.equal(A.races.length, 4);
  assert.equal(M.races.length, 5);
  assert.deepEqual(M.live, [2012]);
  const eve = M.driverIndex.get("eve");
  assert.equal(eve, 4);
  assert.equal(M.races[4].pole, eve);
  assert.equal(M.races[4].results[1].d, 0);
  assert.equal(M.races[4].sprint[0].pts, 8);
  assert.equal(M.circuits[M.races[4].circuit].id, "gamma");
  const again = mergeSeason(M, "2012", live);
  assert.equal(again.races.length, 5);
  assert.equal(coverage(M).last, 2012);
});

test("lineage seasons follow constructor spans", () => {
  const seasons = lineageSeasons(A, [{ constructorId: "red", from: 2010, to: 2010 }, { constructorId: "blue", from: 2011 }]);
  assert.deepEqual(seasons.map((s) => [s.season, s.constructorId, s.wins, s.races]), [[2010, "red", 2, 2], [2011, "blue", 1, 2]]);
  assert.equal(seasons[1].points, 25 + 18 + 18 + 15 + 8);
  assert.deepEqual(constructorSeasons(A, "blue"), [2010, 2011]);
  assert.deepEqual(constructorSeasons(A, "nope"), []);
});

test("classified rows always count as starts; 2021 sprint winners take pole", () => {
  assert.equal(isStart({ text: "4", status: "Withdrew" }), true);
  const race = { season: 2021, pole: 1, results: [{ d: 1, c: 0, grid: 2, pos: 2 }, { d: 0, c: 0, grid: 1, pos: 1 }], sprint: [{ d: 0, c: 0, pos: 1 }] };
  assert.deepEqual(poleOf(race), { d: 0, c: 0, source: "sprint" });
  assert.equal(poleOf({ ...race, season: 2022 }).source, "qualifying");
});
