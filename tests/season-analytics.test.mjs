import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pointsSystem, weekendMax, remainingWeekends, decider, clinchIndex, positionForPoints, rng, hashSeed,
  formInputs, simulateChampionship, pointsMatrix, consistency, statusCause, reliability, rollingAverage,
  formTrend, positionsGained, commonSessionGap, teammateGaps, pitLeague, storyChapters,
} from "../src/season-analytics.mjs";
import { buildProgress } from "../src/progress.mjs";

const d = (id) => ({ driverId: id, givenName: id, familyName: id.toUpperCase(), nationality: "", dateOfBirth: "", url: "" });
const t = (id) => ({ constructorId: id, name: id, nationality: "", url: "" });
const row = (driver, team, position, points, extra = {}) => ({ Driver: d(driver), Constructor: t(team), position: String(position), positionText: String(position), points: String(points), grid: String(position), laps: "50", status: "Finished", ...extra });
const race = (round, results, extra = {}) => ({ season: "2026", round: String(round), raceName: "Race " + round, date: `2026-0${Math.min(9, round)}-01`, time: "13:00:00Z", url: "", Circuit: { circuitId: "c" + round, circuitName: "", url: "", Location: { lat: "0", long: "0", locality: "", country: "Italy" } }, Results: results, ...extra });

test("points systems by era", () => {
  assert.equal(pointsSystem(1990), null);
  assert.deepEqual(pointsSystem(1995).race, [10, 6, 4, 3, 2, 1]);
  assert.deepEqual(pointsSystem(2005).race, [10, 8, 6, 5, 4, 3, 2, 1]);
  const s2024 = pointsSystem(2024);
  assert.equal(s2024.raceMax, 26);
  assert.equal(s2024.sprintMax, 8);
  const s2026 = pointsSystem(2026);
  assert.equal(s2026.raceMax, 25);
  assert.equal(weekendMax(s2026, { sprint: true, double: false }), 33);
  assert.equal(weekendMax(pointsSystem(2014), { sprint: false, double: true }), 50);
  assert.equal(pointsSystem(2021).sprintMax, 3);
});

test("remaining weekends include calendar sprints after the standings round", () => {
  const cal = [race(17, []), race(18, [], { Sprint: { date: "2026-10-24", time: "" } }), race(19, [])];
  const w = remainingWeekends(cal, 17, 2026, Date.parse("2026-12-01"));
  assert.deepEqual(w.map((x) => [x.round, x.sprint, x.max]), [["18", true, 33], ["19", false, 25]]);
});

test("decider: margins, impossibility this weekend and earliest clinch", () => {
  const weekends = [
    { round: "18", raceName: "United States Grand Prix", sprint: true, double: false, max: 33 },
    { round: "19", raceName: "Mexico City Grand Prix", sprint: false, double: false, max: 25 },
    { round: "20", raceName: "São Paulo Grand Prix", sprint: true, double: false, max: 33 },
    { round: "21", raceName: "Las Vegas Grand Prix", sprint: false, double: false, max: 25 },
    { round: "22", raceName: "Qatar Grand Prix", sprint: true, double: false, max: 33 },
    { round: "23", raceName: "Abu Dhabi Grand Prix", sprint: false, double: false, max: 25 },
  ];
  const total = 174;
  const res = decider([{ id: "a", name: "A", points: 300 }, { id: "b", name: "B", points: 250 }, { id: "c", name: "C", points: 100 }], weekends, 2026);
  assert.equal(res.total, total);
  assert.equal(res.settled, false);
  assert.deepEqual(res.alive.map((r) => r.id), ["b"], "C is 200 behind with 174 left");
  // After the US GP 141 remain: A must outscore B by 141 − 50 + 1 = 92 > 33 → impossible.
  assert.equal(res.next.needs[0].margin, 92);
  assert.equal(res.next.possible, false);
  // Earliest: 50 + cumulative max > remaining after. k=0: 83 > 141 no; k=1: 108 > 116 no; k=2: 141 > 83 yes.
  assert.equal(res.earliest.round, "20");
  const b = res.chasers[0];
  assert.equal(b.deficit, 50);
  assert.equal(b.safeThisWeekend, true, "B can lose at most 33 this weekend and stays alive (141 − 50 = 91)");
});

test("decider: race-only combinations and must-score thresholds", () => {
  const weekends = [{ round: "22", raceName: "Qatar", sprint: false, double: false, max: 25 }, { round: "23", raceName: "Abu Dhabi", sprint: false, double: false, max: 25 }];
  const res = decider([{ id: "a", name: "A", points: 400 }, { id: "b", name: "B", points: 380 }], weekends, 2026);
  // After round 22, 25 remain: A must outscore B by 25 − 20 + 1 = 6.
  assert.equal(res.next.needs[0].margin, 6);
  assert.equal(res.next.possible, true);
  const second = res.next.combos.find((c) => c.leaderPos === 2);
  assert.equal(second.rivals[0].atBest, 4, "18 − 12 = 6 → B 4th or lower");
  const b = res.chasers[0];
  // B is safe if outscored by ≤ 25 − 20 = 5. If A wins (25) B needs ≥ 20 → not possible with P2 (18)? 18 → no: needs P1 which is taken.
  assert.equal(b.mustScoreIfLeaderMax, 20);
  assert.equal(b.mustFinish, null, "no single result is worth 20 points");
  assert.equal(positionForPoints([25, 18, 15, 12, 10], 11).pos, 4);
});

test("win and rival second still clinches when the margin allows", () => {
  const weekends = [{ round: "22", raceName: "Qatar", sprint: false, double: false, max: 25 }, { round: "23", raceName: "Abu Dhabi", sprint: false, double: false, max: 25 }];
  const res = decider([{ id: "a", name: "A", points: 400 }, { id: "b", name: "B", points: 380 }], weekends, 2026);
  const win = res.next.combos.find((c) => c.leaderPos === 1);
  assert.equal(win.rivals[0].atBest, 2);
  assert.equal(win.rivals[0].any, true);
});

test("settled championship and historical clinch index", () => {
  const res = decider([{ id: "a", name: "A", points: 400 }, { id: "b", name: "B", points: 300 }], [{ round: "23", raceName: "x", sprint: false, double: false, max: 25 }], 2026);
  assert.equal(res.settled, true);
  assert.equal(res.next, null);
  // Leader 0: after round 1 lead 25 vs 50 left; after round 2 lead 50 > 25 left.
  assert.equal(clinchIndex([[25, 50, 75], [0, 0, 0]], 0, [25, 25, 25]), 1);
  assert.equal(clinchIndex([[25, 43, 61], [18, 36, 54]], 0, [25, 25, 25]), 2);
});

test("seeded random numbers are reproducible", () => {
  const a = rng(hashSeed("2026:17")), b = rng(hashSeed("2026:17"));
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.notEqual(rng(1)(), rng(2)());
});

test("Monte Carlo is deterministic, respects certainty and sums to one", () => {
  const races = [1, 2, 3, 4].map((r) => race(r, [row("a", "x", 1, 25), row("b", "y", 2, 18), row("c", "z", 3, 15)]));
  const form = formInputs(races);
  assert.deepEqual(form.find((f) => f.id === "a").outcomes, [1, 1, 1, 1]);
  const pts = { a: 100, b: 72, c: 60 };
  const input = {
    drivers: form.map((f) => ({ ...f, points: pts[f.id], wins: f.id === "a" ? 4 : 0 })),
    teams: [{ id: "x", points: 100 }, { id: "y", points: 72 }, { id: "z", points: 60 }],
    weekends: [{ round: "5", raceName: "R5", sprint: false, double: false, max: 25 }, { round: "6", raceName: "R6", sprint: true, double: false, max: 33 }],
    year: 2026, sims: 3000, seed: 42,
  };
  const r1 = simulateChampionship(input), r2 = simulateChampionship(input);
  assert.deepEqual(r1, r2);
  const sum = r1.drivers.reduce((s, x) => s + x.title, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const a = r1.drivers.find((x) => x.id === "a");
  assert.ok(a.title > 0.5, "the dominant leader is the favourite");
  assert.ok(a.p10 >= 100 && a.p90 <= 158 && a.p10 <= a.mean && a.mean <= a.p90);
  assert.equal(r1.clinch.length, 3);
  assert.ok(Math.abs(r1.clinch.reduce((s, x) => s + x.probability, 0) - 1) < 1e-9);
  // A driver more than the remaining maximum behind can never win.
  const hopeless = simulateChampionship({ ...input, drivers: input.drivers.map((x) => (x.id === "c" ? { ...x, points: 0 } : x)) });
  assert.equal(hopeless.drivers.find((x) => x.id === "c").title, 0);
});

test("points heatmap merges sprint points and builds team cells", () => {
  const races = [race(1, [row("a", "x", 1, 25), row("b", "x", 2, 18, { positionText: "R", status: "Engine" })])];
  const sprints = [{ ...race(1, []), Results: undefined, SprintResults: [row("b", "x", 1, 8)] }];
  const m = pointsMatrix(races, sprints);
  assert.equal(m.rounds[0].sprint, true);
  const b = m.drivers.find((x) => x.id === "b");
  assert.equal(b.cells[0].points, 26);
  assert.equal(b.cells[0].pos, null);
  assert.equal(b.cells[0].sprintPos, 1);
  assert.equal(m.teams[0].cells[0].points, 51);
  assert.equal(m.teams[0].total, 51);
});

test("consistency: spread, DNF rate and index", () => {
  const races = [
    race(1, [row("a", "x", 2, 18), row("b", "y", 1, 25)]),
    race(2, [row("a", "x", 2, 18), row("b", "y", 5, 10, { positionText: "R", status: "Gearbox" })]),
    race(3, [row("a", "x", 2, 18), row("b", "y", 9, 2)]),
  ];
  const c = consistency(races);
  const a = c.find((x) => x.id === "a"), b = c.find((x) => x.id === "b");
  assert.equal(a.sdPos, 0);
  assert.equal(a.index, 100);
  assert.equal(b.dnfs, 1);
  assert.ok(Math.abs(b.dnfRate - 1 / 3) < 1e-9);
  assert.ok(b.index < a.index);
  assert.equal(c[0].id, "a");
});

test("status causes map Jolpica wording into groups", () => {
  assert.equal(statusCause("Finished", "1"), "finished");
  assert.equal(statusCause("+2 Laps", "12"), "finished");
  assert.equal(statusCause("Lapped", "14"), "finished");
  assert.equal(statusCause("Power Unit", "R"), "engine");
  assert.equal(statusCause("Gearbox", "R"), "gearbox");
  assert.equal(statusCause("Hydraulics", "R"), "hydraulics");
  assert.equal(statusCause("Collision damage", "R"), "collision");
  assert.equal(statusCause("Spun off", "R"), "spun");
  assert.equal(statusCause("Brakes", "R"), "brakes");
  assert.equal(statusCause("Front suspension", "R"), "suspension");
  assert.equal(statusCause("Electronics", "R"), "electrical");
  assert.equal(statusCause("Puncture", "R"), "mechanical");
  assert.equal(statusCause("Retired", "R"), "unspecified");
  assert.equal(statusCause("Disqualified", "D"), "disqualified");
  assert.equal(statusCause("Did not start", "W"), "dns");
  assert.equal(statusCause("Did not qualify", "F"), "dnq");
  const rel = reliability([race(1, [row("a", "x", 1, 25), row("b", "x", 2, 0, { positionText: "R", status: "Engine" }), row("c", "y", 3, 0, { positionText: "W", status: "Withdrew" })])]);
  const x = rel.teams.find((r) => r.id === "x");
  assert.equal(x.counts.engine, 1);
  assert.equal(x.starts, 2);
  assert.equal(rel.totals.dns, 1);
  assert.equal(rel.teams.find((x) => x.id === "y").starts, 0);
});

test("rolling form and trend", () => {
  assert.deepEqual(rollingAverage([10, 20, null, 30], 2), [10, 15, null, 25]);
  const tr = formTrend([0, 0, 0, 0, 0, 25, 25, 25, 25, 25], 5);
  assert.equal(tr.dir, "up");
  assert.equal(tr.delta, 25);
  assert.equal(formTrend([5, 5], 5).dir, "flat");
});

test("positions gained counts pit-lane starts from the back", () => {
  const races = [race(1, [row("a", "x", 1, 25, { grid: "5" }), row("b", "y", 2, 18, { grid: "0" }), row("c", "z", 3, 15, { grid: "1", positionText: "R" })])];
  const g = positionsGained(races);
  assert.equal(g.find((x) => x.id === "a").total, 4);
  assert.equal(g.find((x) => x.id === "b").total, 1, "pit lane = P3 of a 3-car field");
  assert.equal(g.find((x) => x.id === "c"), undefined);
});

test("teammate gaps use the best common session and orient to the faster driver", () => {
  assert.deepEqual(commonSessionGap({ Q1: "1:30.000", Q2: "1:29.000" }, { Q1: "1:30.500" }).session, "Q1");
  const q = (round, aTime, bTime, aPos, bPos) => ({ ...race(round, undefined), QualifyingResults: [
    { ...row("a", "x", aPos, 0), Q1: "1:31.000", Q2: "1:30.000", Q3: aTime },
    { ...row("b", "x", bPos, 0), Q1: "1:31.500", Q2: "1:30.300", Q3: bTime },
  ] });
  const qual = [q(1, "1:29.000", "1:29.890", 1, 2), q(2, "1:29.500", "1:29.000", 2, 1), q(3, "1:29.000", "1:35.000", 1, 2)];
  const races = [race(1, [row("a", "x", 1, 25), row("b", "x", 2, 18)])];
  const [team] = teammateGaps(qual, races);
  const p = team.pairs[0];
  assert.equal(p.a.driverId, "a");
  assert.deepEqual(p.quali, { a: 2, b: 1 });
  assert.deepEqual(p.race, { a: 1, b: 0 });
  assert.equal(p.excluded, 1, "a 6.7% gap is treated as an outlier");
  assert.ok(Math.abs(p.meanGap - ((0.89 / 89) * 100 + (-0.5 / 89.5) * 100) / 2) < 1e-9);
});

test("pit league uses medians and excludes red-flag stops", () => {
  const teams = new Map([["a", t("x")], ["b", t("y")]]);
  const rows = pitLeague([{ round: "1", raceName: "R1", teams, stops: [
    { driverId: "a", lap: "10", stop: "1", time: "", duration: "22.100" },
    { driverId: "a", lap: "30", stop: "2", time: "", duration: "23.900" },
    { driverId: "b", lap: "12", stop: "1", time: "", duration: "21.500" },
    { driverId: "b", lap: "40", stop: "2", time: "", duration: "31:02.000" },
  ] }]);
  assert.equal(rows[0].id, "y");
  assert.equal(rows[0].excluded, 1);
  assert.equal(rows[1].median, 23);
  assert.equal(rows[1].fastest.seconds, 22.1);
});

test("story chapters derive maiden wins, lead changes, movers and the clinch", () => {
  const races = [
    race(1, [row("a", "x", 1, 25), row("b", "y", 2, 18), row("c", "z", 3, 15)]),
    race(2, [row("c", "z", 1, 25, { grid: "8" }), row("b", "y", 2, 18), row("a", "x", 3, 15)]),
    race(3, [row("b", "y", 1, 25), row("c", "z", 2, 18), row("a", "x", 3, 15)]),
  ];
  const p = buildProgress(races, []);
  const ch = storyChapters(p, races, [], { winsBefore: { a: 3 }, priorSeasons: new Set(["a", "b"]), clinch: 2 });
  assert.equal(ch.length, 3);
  assert.ok(ch[0].facts.some((f) => f.kind === "first-season-win" && f.id === "a" && f.career === 4));
  assert.ok(ch[0].facts.some((f) => f.kind === "podium-check" && f.id === "b"), "b raced before: must be verified");
  assert.ok(ch[0].facts.some((f) => f.kind === "maiden-podium" && f.id === "c"), "c is a debutant");
  assert.ok(ch[1].facts.some((f) => f.kind === "maiden-win" && f.id === "c"));
  assert.ok(ch[1].facts.some((f) => f.kind === "from-grid" && f.grid === 8));
  assert.ok(ch[2].facts.some((f) => f.kind === "clinch"));
  assert.equal(ch[2].top[0].id, "b");
  assert.ok(ch[2].facts.some((f) => f.kind === "lead-change" && f.id === "b"));
});
