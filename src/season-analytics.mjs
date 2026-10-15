/**
 * Season analytics — pure, deterministic helpers behind Standings, Scenarios, Insights and Story.
 * Everything here works on published Jolpica race / sprint / qualifying / pit-stop tables and
 * is unit-tested in tests/season-analytics.test.mjs. Nothing touches the DOM or the network.
 */
import { timeSeconds } from "./math.mjs";

/* ───────────────────────── Points systems ───────────────────────── */

/**
 * Points awarded per finishing position for seasons without dropped scores (1991 onward).
 * Returns null for 1950–1990, when only a driver's best results counted.
 */
export function pointsSystem(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1991) return null;
  const race = y >= 2010 ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] : y >= 2003 ? [10, 8, 6, 5, 4, 3, 2, 1] : [10, 6, 4, 3, 2, 1];
  const sprint = y >= 2022 ? [8, 7, 6, 5, 4, 3, 2, 1] : y === 2021 ? [3, 2, 1] : [];
  const fastestLap = y >= 2019 && y <= 2024;
  return { year: y, race, sprint, fastestLap, raceMax: race[0] + (fastestLap ? 1 : 0), sprintMax: sprint[0] || 0, doubleFinale: y === 2014 };
}

/** Most points one driver can score in a weekend (race win, fastest lap, sprint win, 2014 double finale). */
export function weekendMax(sys, weekend) {
  if (!sys) return 0;
  const race = weekend.double ? sys.race[0] * 2 : sys.raceMax;
  return race + (weekend.sprint && sys.sprint.length ? sys.sprintMax : 0);
}

const raceStart = (r) => Date.parse(r.date + "T" + (r.time || "23:59:59Z"));

/**
 * Weekends still to come after the published standings round. A weekend's sprint counts only if
 * the provider's calendar lists one (`Sprint`) and the system awards sprint points.
 */
export function remainingWeekends(calendar, standingsRound, year, now = Date.now()) {
  const sys = pointsSystem(year);
  const finale = calendar.at(-1);
  return calendar
    .filter((r) => +r.round > standingsRound || (+r.round === standingsRound && raceStart(r) + 3 * 3600e3 > now))
    .map((r) => {
      const sprint = !!(r.Sprint && sys?.sprint.length && +r.round > standingsRound);
      const double = !!(sys?.doubleFinale && finale && r.round === finale.round);
      const w = { round: r.round, raceName: r.raceName, circuitId: r.Circuit?.circuitId || "", country: r.Circuit?.Location?.country || "", date: r.date, sprint, double, max: 0 };
      w.max = weekendMax(sys, w);
      return w;
    });
}

/* ───────────────────────── Championship decider ───────────────────────── */

/** Smallest finishing position (best) whose points are ≥ `need`, or null when no single result is enough. */
export function positionForPoints(table, need) {
  if (need <= 0) return { pos: null, any: true };
  for (let i = table.length - 1; i >= 0; i--) if (table[i] >= need) return { pos: i + 1, any: false };
  return null;
}

/**
 * Exact title arithmetic for the next weekend and the rest of the season.
 * `standings`: [{ id, name, points, wins }] in official order. Clinching means a lead strictly
 * greater than every point still available — a tie would go to count-back, which we don't assume.
 */
export function decider(standings, weekends, year) {
  const sys = pointsSystem(year);
  const list = [...standings].map((s) => ({ ...s, points: Number(s.points), wins: Number(s.wins || 0) })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  if (!sys || !list.length) return null;
  const maxes = weekends.map((w) => w.max);
  const total = maxes.reduce((s, x) => s + x, 0);
  const after = maxes.map((_, k) => maxes.slice(k + 1).reduce((s, x) => s + x, 0));
  const leader = list[0];
  const rivals = list.slice(1).map((r) => ({ ...r, deficit: leader.points - r.points, alive: r.points + total >= leader.points }));
  const alive = rivals.filter((r) => r.alive);
  const settled = !alive.length;
  const closest = alive[0];

  // Earliest weekend at which the leader can clinch: he takes the maximum every weekend, the closest rival scores nothing.
  let earliest = null;
  if (!settled && closest) {
    let gained = 0;
    for (let k = 0; k < weekends.length; k++) {
      gained += maxes[k];
      if (closest.deficit + gained > after[k]) { earliest = k; break; }
    }
  }

  let next = null;
  if (!settled && weekends.length) {
    const w = weekends[0];
    const swing = maxes[0];
    const needs = alive.map((r) => {
      // The leader clinches against r after this weekend iff deficit + (leaderGain − rGain) > pointsAfter.
      const margin = Math.floor(after[0] - r.deficit) + 1;
      return { id: r.id, name: r.name, deficit: r.deficit, margin, possible: margin <= swing, guaranteed: margin <= -swing };
    });
    const possible = needs.every((n) => n.possible);
    // Finishing combinations for a race-only weekend (the fastest-lap bonus point is left out).
    let combos = [];
    if (possible && !w.sprint) {
      const table = w.double ? sys.race.map((p) => p * 2) : sys.race;
      for (let pl = 1; pl <= table.length; pl++) {
        const lp = table[pl - 1];
        const rivalsNeed = needs.filter((n) => !n.guaranteed).map((n) => {
          const allowed = lp - n.margin; // most points the rival may score
          if (allowed < 0) return { id: n.id, name: n.name, worst: undefined };
          // Lowest-indexed (best) position whose points ≤ allowed, skipping the leader's own position.
          let best = null;
          for (let q = 1; q <= table.length + 1; q++) {
            if (q === pl) continue;
            const qp = table[q - 1] || 0;
            if (qp <= allowed) { best = q; break; }
          }
          return { id: n.id, name: n.name, worst: best };
        });
        if (rivalsNeed.every((r) => r.worst !== undefined && r.worst !== null))
          combos.push({ leaderPos: pl, leaderPoints: lp, rivals: rivalsNeed.map((r) => ({ id: r.id, name: r.name, atBest: r.worst, any: r.worst === (pl === 1 ? 2 : 1), scoresNothing: r.worst > table.length })) });
      }
    }
    next = { ...w, swing, after: after[0], possible, needs, combos, leaderMaxIfWinsAll: swing };
  }

  // What every live chaser needs.
  const chasers = alive.map((r) => {
    const remaining = weekends.length;
    const safeMargin = after[0] - r.deficit; // largest amount the leader can outscore r by this weekend while r stays alive
    const mustScoreIfLeaderMax = next ? Math.max(0, (maxes[0] || 0) - safeMargin) : 0;
    const table = weekends[0]?.double ? sys.race.map((p) => p * 2) : sys.race;
    // The leader takes the win in this scenario, so the chaser's best possible result is P2.
    const p2 = next && !weekends[0].sprint ? positionForPoints(table.slice(1), mustScoreIfLeaderMax) : null;
    const position = p2 ? { pos: p2.pos === null ? null : p2.pos + 1, any: p2.any } : null;
    return {
      id: r.id, name: r.name, points: r.points, deficit: r.deficit, maxPossible: r.points + total,
      perWeekend: remaining ? r.deficit / remaining : 0,
      canLeadThisWeekend: !!weekends.length && r.deficit < maxes[0],
      canTieThisWeekend: !!weekends.length && r.deficit === maxes[0],
      safeThisWeekend: !weekends.length || safeMargin >= (maxes[0] || 0),
      eliminatedIfOutscoredBy: Math.floor(safeMargin) + 1,
      mustScoreIfLeaderMax,
      mustFinish: position,
    };
  });

  return {
    year: sys.year, sys, leader, rivals, alive, settled, total, after, maxes,
    clinched: settled,
    earliest: earliest === null ? null : { index: earliest, ...weekends[earliest] },
    next, chasers,
  };
}

/**
 * Index of the round after which `leaderIndex` mathematically clinched, from cumulative points
 * per driver (`cum[d][i]`) and the most each later round could award (`maxPerRound`, full calendar).
 * Returns null if the title was never clinched before the end of the supplied rounds.
 */
export function clinchIndex(cum, leaderIndex, maxPerRound) {
  const rounds = cum[leaderIndex]?.length || 0;
  for (let i = 0; i < rounds; i++) {
    const left = maxPerRound.slice(i + 1).reduce((s, x) => s + x, 0);
    const lead = Math.min(...cum.map((c, d) => (d === leaderIndex ? Infinity : cum[leaderIndex][i] - (c[i] ?? 0))));
    if (lead > left) return i;
  }
  return null;
}

/* ───────────────────────── Deterministic random numbers ───────────────────────── */

export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32 — tiny, fast, reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── Championship Monte Carlo ───────────────────────── */

const classified = (r) => /^\d+$/.test(r.positionText);
const didNotStart = (r) => /^[WF]$/.test(r.positionText) || /did not (start|qualify|prequalify)|withdrew|107%/i.test(r.status || "");

/**
 * Recency-weighted form for every driver who took part in the latest Grand Prix: their last
 * `window` Grand Prix outcomes (a finishing position, or null for a non-finish), most recent first.
 */
export function formInputs(races, { window = 8 } = {}) {
  const done = races.filter((r) => r.Results?.length).sort((a, b) => +a.round - +b.round);
  const last = done.at(-1);
  if (!last) return [];
  return last.Results.filter((r) => !didNotStart(r)).map((entry) => {
    const id = entry.Driver.driverId;
    const outcomes = [];
    for (let i = done.length - 1; i >= 0 && outcomes.length < window; i--) {
      const r = done[i].Results.find((x) => x.Driver.driverId === id);
      if (!r || didNotStart(r)) continue;
      outcomes.push(classified(r) ? Number(r.position) : null);
    }
    return { id, team: entry.Constructor.constructorId, outcomes };
  });
}

/**
 * A chunkable Monte Carlo of the rest of the season. Each simulated weekend every driver draws a
 * Grand Prix outcome from their recency-weighted recent form (plus a small field-wide prior so
 * nobody is certain), the draws are ranked into a unique classification and scored with the
 * season's points system; sprint weekends draw again and use the sprint table.
 */
export function createSimulation(input) {
  const { drivers, teams = [], weekends, year, sims = 20000, seed = 1, decay = 0.8, prior = 0.5 } = input;
  const sys = pointsSystem(year);
  if (!sys) throw Error("The model supports 1991 onward");
  const random = rng(seed);
  const n = drivers.length;
  const field = Math.max(n, 2);
  const runners = drivers.map((d) => d.outcomes?.length ? d : { ...d, outcomes: [] });
  // Pre-build cumulative distributions over positions 1..field and "DNF" (index field).
  const cdfs = runners.map((d) => {
    const w = new Float64Array(field + 1);
    d.outcomes.forEach((o, age) => { const k = o === null ? field : Math.min(field, o) - 1; w[k] += Math.pow(decay, age); });
    for (let k = 0; k < field; k++) w[k] += (prior * 0.92) / field;
    w[field] += prior * 0.08;
    let s = 0;
    for (let k = 0; k <= field; k++) s += w[k];
    let acc = 0;
    return Array.from(w, (x) => (acc += x / s));
  });
  const draw = (i) => {
    const u = random(), c = cdfs[i];
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < u) lo = mid + 1; else hi = mid; }
    return lo === field ? Infinity : lo + 1 + (random() - 0.5) * 2;
  };
  const teamIndex = new Map(teams.map((t, i) => [t.id, i]));
  const driverTeam = runners.map((d) => (teamIndex.has(d.team) ? teamIndex.get(d.team) : -1));
  const extra = (input.others || []).map((o) => ({ ...o, points: Number(o.points), wins: Number(o.wins || 0) }));
  const base = runners.map((d) => Number(d.points || 0));
  const baseWins = runners.map((d) => Number(d.wins || 0));
  const all = n + extra.length;
  const finals = Array.from({ length: all }, () => new Float32Array(sims));
  const teamFinals = teams.map(() => new Float32Array(sims));
  const titles = new Float64Array(all);
  const teamTitles = new Float64Array(teams.length);
  const clinchAt = new Float64Array(weekends.length + 1);
  const maxes = weekends.map((w) => weekendMax(sys, w));
  const after = maxes.map((_, k) => maxes.slice(k + 1).reduce((s, x) => s + x, 0));
  let done = 0;

  const score = new Float64Array(n), order = new Int32Array(n), pts = new Float64Array(all), wins = new Float64Array(all);
  const runEvent = (table, double, fastest) => {
    let m = 0;
    for (let i = 0; i < n; i++) { score[i] = draw(i); order[m++] = i; }
    const idx = Array.from(order.subarray(0, m)).sort((a, b) => score[a] - score[b]);
    let finishers = 0;
    for (let p = 0; p < idx.length; p++) if (score[idx[p]] !== Infinity) finishers++;
    for (let p = 0; p < Math.min(table.length, finishers); p++) pts[idx[p]] += table[p] * (double ? 2 : 1);
    if (fastest && finishers) { const k = Math.floor(random() * Math.min(10, finishers)); pts[idx[k]] += 1; }
    return finishers ? idx[0] : -1;
  };

  function step(count) {
    const end = Math.min(sims, done + count);
    for (let s = done; s < end; s++) {
      for (let i = 0; i < n; i++) { pts[i] = base[i]; wins[i] = baseWins[i]; }
      for (let j = 0; j < extra.length; j++) { pts[n + j] = extra[j].points; wins[n + j] = extra[j].wins; }
      let clinched = -1;
      for (let k = 0; k < weekends.length; k++) {
        const w = weekends[k];
        if (w.sprint && sys.sprint.length) runEvent(sys.sprint, false, false);
        const winner = runEvent(sys.race, w.double, sys.fastestLap);
        if (winner >= 0) wins[winner]++;
        if (clinched < 0) {
          let a = -Infinity, b = -Infinity;
          for (let i = 0; i < all; i++) { const v = pts[i]; if (v > a) { b = a; a = v; } else if (v > b) b = v; }
          if (a - b > after[k]) clinched = k;
        }
      }
      clinchAt[clinched < 0 ? weekends.length : clinched]++;
      let best = 0;
      for (let i = 0; i < all; i++) {
        finals[i][s] = pts[i];
        if (pts[i] > pts[best] || (pts[i] === pts[best] && wins[i] > wins[best])) best = i;
      }
      titles[best]++;
      if (teams.length) {
        let tb = 0;
        for (let t = 0; t < teams.length; t++) teamFinals[t][s] = Number(teams[t].points || 0);
        for (let i = 0; i < n; i++) if (driverTeam[i] >= 0) teamFinals[driverTeam[i]][s] += pts[i] - base[i];
        for (let t = 1; t < teams.length; t++) if (teamFinals[t][s] > teamFinals[tb][s]) tb = t;
        teamTitles[tb]++;
      }
    }
    done = end;
    return done >= sims;
  }

  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const summarise = (arr, count) => {
    const sorted = arr.slice(0, count).sort();
    let sum = 0;
    for (let i = 0; i < count; i++) sum += sorted[i];
    return { mean: count ? sum / count : 0, p10: count ? quantile(sorted, 0.1) : 0, p50: count ? quantile(sorted, 0.5) : 0, p90: count ? quantile(sorted, 0.9) : 0 };
  };

  function result() {
    const count = done || 1;
    const ids = [...runners.map((d) => d.id), ...extra.map((o) => o.id)];
    return {
      sims: done,
      drivers: ids.map((id, i) => ({ id, title: titles[i] / count, ...summarise(finals[i], done), current: i < n ? base[i] : extra[i - n].points, racing: i < n })).sort((a, b) => b.title - a.title || b.mean - a.mean),
      teams: teams.map((t, i) => ({ id: t.id, title: teamTitles[i] / count, ...summarise(teamFinals[i], done), current: Number(t.points || 0) })).sort((a, b) => b.title - a.title || b.mean - a.mean),
      clinch: weekends.map((w, k) => ({ round: w.round, raceName: w.raceName, probability: clinchAt[k] / count })).concat([{ round: "", raceName: "", probability: clinchAt[weekends.length] / count }]),
    };
  }

  return { step, result, get done() { return done; }, total: sims };
}

/** Run a whole simulation synchronously (tests, small inputs). */
export function simulateChampionship(input) {
  const sim = createSimulation(input);
  while (!sim.step(5000));
  return sim.result();
}

/* ───────────────────────── Points heatmap ───────────────────────── */

/** Per-round points (Grand Prix + sprint) for every driver and constructor, with finishing detail. */
export function pointsMatrix(races, sprints = []) {
  const done = races.filter((r) => r.Results?.length).sort((a, b) => +a.round - +b.round);
  const sprintBy = new Map(sprints.map((s) => [s.round, s.SprintResults || []]));
  const rounds = done.map((r) => ({ round: r.round, raceName: r.raceName, country: r.Circuit?.Location?.country || "", circuitId: r.Circuit?.circuitId || "", sprint: (sprintBy.get(r.round) || []).length > 0 }));
  const drivers = new Map(), teams = new Map();
  done.forEach((race, i) => {
    const sp = new Map((sprintBy.get(race.round) || []).map((r) => [r.Driver.driverId, r]));
    const seen = new Set();
    const touch = (r) => {
      const id = r.Driver.driverId;
      if (!drivers.has(id)) drivers.set(id, { id, driver: r.Driver, team: r.Constructor, cells: Array(done.length).fill(null), total: 0 });
      return drivers.get(id);
    };
    for (const r of race.Results) {
      const d = touch(r);
      d.team = r.Constructor;
      const s = sp.get(r.Driver.driverId);
      const racePts = Number(r.points || 0), sprintPts = s ? Number(s.points || 0) : 0;
      d.cells[i] = { points: racePts + sprintPts, race: racePts, sprint: sprintPts, pos: classified(r) ? Number(r.position) : null, posText: r.positionText, grid: Number(r.grid || 0), status: r.status, sprintPos: s ? (classified(s) ? Number(s.position) : null) : undefined, team: r.Constructor.constructorId };
      d.total += racePts + sprintPts;
      seen.add(r.Driver.driverId);
    }
    for (const [id, s] of sp) {
      if (seen.has(id)) continue;
      const d = touch(s);
      const p = Number(s.points || 0);
      d.cells[i] = { points: p, race: 0, sprint: p, pos: null, posText: "—", grid: 0, status: "Sprint only", sprintPos: classified(s) ? Number(s.position) : null, team: s.Constructor.constructorId };
      d.total += p;
    }
    for (const d of drivers.values()) {
      const c = d.cells[i];
      if (!c) continue;
      if (!teams.has(c.team)) {
        const src = race.Results.find((r) => r.Constructor.constructorId === c.team) || sp.get(d.id);
        teams.set(c.team, { id: c.team, team: src.Constructor, cells: Array(done.length).fill(null), total: 0 });
      }
      const t = teams.get(c.team);
      const cell = (t.cells[i] ||= { points: 0, race: 0, sprint: 0, drivers: [] });
      cell.points += c.points; cell.race += c.race; cell.sprint += c.sprint;
      cell.drivers.push({ id: d.id, name: d.driver.familyName, pos: c.pos, posText: c.posText, points: c.points });
      t.total += c.points;
    }
  });
  const byTotal = (a, b) => b.total - a.total;
  return { rounds, drivers: [...drivers.values()].sort(byTotal), teams: [...teams.values()].sort(byTotal) };
}

/* ───────────────────────── Consistency ───────────────────────── */

const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
export const stdDev = (v) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

/**
 * Grand Prix consistency: spread of classified finishing positions and of points, non-finish rate,
 * and an index = 100 × max(0, 1 − σ(position) / 8) × (1 − non-finish rate).
 */
export function consistency(races, { minShare = 0.5 } = {}) {
  const done = races.filter((r) => r.Results?.length);
  const map = new Map();
  for (const race of [...done].sort((a, b) => +a.round - +b.round))
    for (const r of race.Results) {
      if (didNotStart(r)) continue;
      const id = r.Driver.driverId;
      if (!map.has(id)) map.set(id, { id, driver: r.Driver, team: r.Constructor, positions: [], points: [], starts: 0, dnfs: 0 });
      const d = map.get(id);
      d.team = r.Constructor;
      d.starts++;
      d.points.push(Number(r.points || 0));
      if (classified(r) && !/disqualified|excluded/i.test(r.status)) d.positions.push(Number(r.position));
      else d.dnfs++;
    }
  const min = Math.max(1, Math.ceil(done.length * minShare));
  return [...map.values()].map((d) => {
    const sdPos = stdDev(d.positions), dnfRate = d.starts ? d.dnfs / d.starts : 0;
    return {
      id: d.id, driver: d.driver, team: d.team, starts: d.starts, finishes: d.positions.length, dnfs: d.dnfs, dnfRate,
      meanPos: d.positions.length ? mean(d.positions) : null, sdPos, meanPts: mean(d.points), sdPts: stdDev(d.points),
      index: d.positions.length >= 2 ? Math.round(100 * Math.max(0, 1 - sdPos / 8) * (1 - dnfRate)) : null,
      qualified: d.starts >= min && d.positions.length >= 2,
    };
  }).sort((a, b) => (b.qualified - a.qualified) || (b.index ?? -1) - (a.index ?? -1) || a.sdPos - b.sdPos);
}

/* ───────────────────────── Reliability ───────────────────────── */

export const CAUSES = [
  { key: "engine", label: "Engine / power unit" },
  { key: "gearbox", label: "Gearbox / driveline" },
  { key: "hydraulics", label: "Hydraulics" },
  { key: "collision", label: "Collision / accident" },
  { key: "spun", label: "Spun off" },
  { key: "brakes", label: "Brakes" },
  { key: "suspension", label: "Suspension" },
  { key: "electrical", label: "Electrical" },
  { key: "mechanical", label: "Other mechanical" },
  { key: "unspecified", label: "Retired (cause not given)" },
  { key: "disqualified", label: "Disqualified" },
  { key: "dns", label: "Withdrew / DNS" },
];

/** Classify a Jolpica status: "finished", "dnq" (never part of the race) or a CAUSES key. */
export function statusCause(status = "", positionText = "") {
  const s = status.trim().toLowerCase();
  if (/^finished$|^\+\d+ laps?$|^lapped$/.test(s)) return "finished";
  if (/did not (qualify|prequalify)|^107%|excluded from qualifying/.test(s) || positionText === "F") return "dnq";
  if (/disqualified|excluded/.test(s) || positionText === "D" || positionText === "E") return "disqualified";
  if (/did not start|withdrew|not restarted|non-starter/.test(s) || positionText === "W") return "dns";
  if (/hydraulic/.test(s)) return "hydraulics";
  if (/spun/.test(s)) return "spun";
  if (/collision|accident|crash|debris|damage|fatal/.test(s)) return "collision";
  if (/brake/.test(s)) return "brakes";
  if (/suspension|wishbone|track rod|upright/.test(s)) return "suspension";
  if (/electric|electronic|alternator|battery|wiring|sensor|ecu|spark/.test(s)) return "electrical";
  if (/gearbox|transmission|clutch|driveshaft|differential|drivetrain|halfshaft|axle|gear selection/.test(s)) return "gearbox";
  if (/engine|power unit|turbo|ers|mgu|energy store|fuel|oil|water|overheating|cooling|radiator|exhaust|pneumatic|injection|ignition|throttle|piston|valve|crankshaft|camshaft|con-rod|power loss/.test(s)) return "engine";
  if (/^retired$|not classified|^dnf$|^$/.test(s)) return "unspecified";
  return "mechanical";
}

/** Non-finishes by cause for every team and driver (Grand Prix only). */
export function reliability(races) {
  const teams = new Map(), drivers = new Map();
  const totals = Object.fromEntries(CAUSES.map((c) => [c.key, 0]));
  const raw = Object.fromEntries(CAUSES.map((c) => [c.key, new Map()]));
  const bump = (map, id, make, cause, started) => {
    if (!map.has(id)) map.set(id, { ...make(), counts: Object.fromEntries(CAUSES.map((c) => [c.key, 0])), total: 0, starts: 0 });
    const e = map.get(id);
    if (started) e.starts++;
    if (cause) { e.counts[cause]++; e.total++; }
    return e;
  };
  for (const race of races)
    for (const r of race.Results || []) {
      const cause = statusCause(r.status, r.positionText);
      if (cause === "dnq") continue;
      const started = cause !== "dns";
      const c = cause === "finished" ? null : cause;
      bump(teams, r.Constructor.constructorId, () => ({ id: r.Constructor.constructorId, team: r.Constructor }), c, started);
      const d = bump(drivers, r.Driver.driverId, () => ({ id: r.Driver.driverId, driver: r.Driver, team: r.Constructor }), c, started);
      d.team = r.Constructor;
      if (c) { totals[c]++; raw[c].set(r.status, (raw[c].get(r.status) || 0) + 1); }
    }
  const sort = (a, b) => b.total - a.total || a.starts - b.starts;
  return {
    teams: [...teams.values()].sort(sort),
    drivers: [...drivers.values()].sort(sort),
    totals,
    statuses: Object.fromEntries(Object.entries(raw).map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])])),
  };
}

/* ───────────────────────── Form ───────────────────────── */

/** Rolling mean of the last `window` non-null values ending at each index (null where the value is null). */
export function rollingAverage(values, window = 5) {
  return values.map((v, i) => {
    if (v === null || v === undefined) return null;
    const recent = [];
    for (let j = i; j >= 0 && recent.length < window; j--) if (values[j] !== null && values[j] !== undefined) recent.push(values[j]);
    return mean(recent);
  });
}

/** Latest rolling average vs the one `window` appearances earlier. */
export function formTrend(values, window = 5, threshold = 1.5) {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (!present.length) return { last: null, prev: null, delta: 0, dir: "flat" };
  const last = mean(present.slice(-window));
  const before = present.slice(-2 * window, -window);
  if (!before.length) return { last, prev: null, delta: 0, dir: "flat" };
  const prev = mean(before);
  const delta = last - prev;
  return { last, prev, delta, dir: delta > threshold ? "up" : delta < -threshold ? "down" : "flat" };
}

/* ───────────────────────── Positions gained ───────────────────────── */

export const PIT_LANE_FROM = 2000;
/** Grid → finish for classified finishers. Pit-lane starts (grid 0, 2000+) count from the back of the field. */
export function positionsGained(races) {
  const map = new Map();
  for (const race of [...races].sort((a, b) => +a.round - +b.round)) {
    const field = (race.Results || []).filter((r) => !didNotStart(r)).length;
    for (const r of race.Results || []) {
      if (!classified(r) || /disqualified|excluded/i.test(r.status)) continue;
      // Grid 0 means a pit-lane start in modern data but can mean "unknown" in older records.
      if (Number(r.grid) === 0 && Number(race.season) < PIT_LANE_FROM) continue;
      const grid = Number(r.grid) > 0 ? Number(r.grid) : field;
      const gain = grid - Number(r.position);
      const id = r.Driver.driverId;
      if (!map.has(id)) map.set(id, { id, driver: r.Driver, team: r.Constructor, races: 0, total: 0, best: null, pitLane: 0 });
      const d = map.get(id);
      d.team = r.Constructor;
      d.races++;
      d.total += gain;
      if (Number(r.grid) === 0) d.pitLane++;
      if (!d.best || gain > d.best.gain) d.best = { gain, round: race.round, raceName: race.raceName, from: Number(r.grid), to: Number(r.position) };
    }
  }
  return [...map.values()].map((d) => ({ ...d, avg: d.races ? d.total / d.races : 0 })).sort((a, b) => b.total - a.total || b.avg - a.avg);
}

/* ───────────────────────── Teammates ───────────────────────── */

const SESSIONS = ["Q3", "Q2", "Q1"];
/** Best session both teammates set a time in (Q3 > Q2 > Q1), and the gap of b to a in percent. */
export function commonSessionGap(a, b) {
  for (const s of SESSIONS) {
    const ta = timeSeconds(a[s]), tb = timeSeconds(b[s]);
    if (ta && tb) return { session: s, a: ta, b: tb, gap: ((tb - ta) / ta) * 100 };
  }
  return null;
}

/**
 * Teammate head-to-heads per team: qualifying (positions, plus the percentage gap in the best
 * common session — gaps beyond `outlier` % are left out of the mean as red flags, crashes or
 * failures) and Grand Prix finishing order among race starters.
 */
export function teammateGaps(qualifying, races, { outlier = 5 } = {}) {
  const pairs = new Map();
  const key = (team, x, y) => team + ":" + [x, y].sort().join("|");
  const get = (team, A, B) => {
    const k = key(team.constructorId, A.driverId, B.driverId);
    if (!pairs.has(k)) {
      const [a, b] = [A, B].sort((p, q) => p.driverId.localeCompare(q.driverId));
      pairs.set(k, { team, a, b, q: { a: 0, b: 0, gaps: [] }, r: { a: 0, b: 0 } });
    }
    return pairs.get(k);
  };
  const teamsOf = (rows) => {
    const by = new Map();
    for (const r of rows) {
      const id = r.Constructor.constructorId;
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(r);
    }
    return by;
  };
  for (const race of qualifying)
    for (const rows of teamsOf(race.QualifyingResults || []).values()) {
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const p = get(rows[i].Constructor, rows[i].Driver, rows[j].Driver);
          const [ra, rb] = rows[i].Driver.driverId === p.a.driverId ? [rows[i], rows[j]] : [rows[j], rows[i]];
          if (+ra.position < +rb.position) p.q.a++; else if (+rb.position < +ra.position) p.q.b++;
          const g = commonSessionGap(ra, rb);
          if (g) p.q.gaps.push({ round: race.round, raceName: race.raceName, ...g });
        }
    }
  for (const race of races)
    for (const rows of teamsOf((race.Results || []).filter((r) => !didNotStart(r))).values()) {
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const p = get(rows[i].Constructor, rows[i].Driver, rows[j].Driver);
          const [ra, rb] = rows[i].Driver.driverId === p.a.driverId ? [rows[i], rows[j]] : [rows[j], rows[i]];
          if (+ra.position < +rb.position) p.r.a++; else if (+rb.position < +ra.position) p.r.b++;
        }
    }
  const teams = new Map();
  for (const p of pairs.values()) {
    const kept = p.q.gaps.filter((g) => Math.abs(g.gap) <= outlier);
    const meanGap = kept.length ? mean(kept.map((g) => g.gap)) : null;
    const sorted = kept.map((g) => g.gap).sort((x, y) => x - y);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
    // Orient so `a` is the faster qualifier on average (or wins the qualifying head-to-head).
    const flip = meanGap !== null ? meanGap < 0 : p.q.b > p.q.a;
    const pair = flip
      ? { team: p.team, a: p.b, b: p.a, quali: { a: p.q.b, b: p.q.a }, race: { a: p.r.b, b: p.r.a }, meanGap: meanGap === null ? null : -meanGap, medianGap: median === null ? null : -median, sessions: p.q.gaps.map((g) => ({ ...g, a: g.b, b: g.a, gap: -g.gap })), excluded: p.q.gaps.length - kept.length }
      : { team: p.team, a: p.a, b: p.b, quali: { ...p.q, gaps: undefined }, race: { ...p.r }, meanGap, medianGap: median, sessions: p.q.gaps, excluded: p.q.gaps.length - kept.length };
    delete pair.quali.gaps;
    pair.rounds = pair.quali.a + pair.quali.b;
    pair.raced = pair.race.a + pair.race.b;
    const id = p.team.constructorId;
    if (!teams.has(id)) teams.set(id, { id, team: p.team, pairs: [] });
    teams.get(id).pairs.push(pair);
  }
  for (const t of teams.values()) t.pairs.sort((x, y) => y.rounds + y.raced - (x.rounds + x.raced));
  return [...teams.values()].filter((t) => t.pairs.some((p) => p.rounds + p.raced > 0));
}

/* ───────────────────────── Pit stops ───────────────────────── */

/** Pit-lane time in seconds from Jolpica's `duration` ("22.456" or "1:02.345"). */
export const pitSeconds = (d) => timeSeconds(d);

/**
 * Pit-lane time league per team. `rounds`: [{ round, raceName, stops, teams: Map(driverId → Team) }].
 * Stops longer than `max` seconds (red-flag stops, repairs) are excluded and counted.
 */
export function pitLeague(rounds, { max = 60 } = {}) {
  const map = new Map();
  for (const r of rounds)
    for (const s of r.stops || []) {
      const team = r.teams.get(s.driverId);
      if (!team) continue;
      const t = map.get(team.constructorId) || { id: team.constructorId, team, times: [], fastest: null, excluded: 0 };
      map.set(team.constructorId, t);
      const sec = pitSeconds(s.duration);
      if (sec === null || sec <= 0) continue;
      if (sec > max) { t.excluded++; continue; }
      t.times.push(sec);
      if (!t.fastest || sec < t.fastest.seconds) t.fastest = { seconds: sec, driverId: s.driverId, round: r.round, raceName: r.raceName, lap: s.lap };
    }
  return [...map.values()].filter((t) => t.times.length).map((t) => {
    const sorted = [...t.times].sort((a, b) => a - b);
    const m = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return { id: t.id, team: t.team, stops: sorted.length, fastest: t.fastest, median: m, excluded: t.excluded };
  }).sort((a, b) => a.median - b.median);
}

/* ───────────────────────── Season story ───────────────────────── */

/**
 * Round-by-round chapters with facts computed only from published data.
 * `opts.winsBefore`: career Grand Prix wins before this season, per driver (from final-standings history).
 * `opts.priorSeasons`: drivers who raced in an earlier season. `opts.clinch`: index of the clinching round.
 */
export function storyChapters(progress, races, sprints = [], opts = {}) {
  const byRound = new Map(races.filter((r) => r.Results?.length).map((r) => [r.round, r]));
  const sprintBy = new Map(sprints.map((s) => [s.round, s.SprintResults || []]));
  const winsBefore = opts.winsBefore || {};
  const prior = opts.priorSeasons || new Set();
  const seasonWins = new Map(), seasonPodiums = new Map();
  const leaderAt = (i) => progress.drivers.find((d) => d.rank[i] === 1);
  return progress.rounds.map((round, i) => {
    const race = byRound.get(round.round);
    const results = race?.Results || [];
    const podium = results.filter((r) => classified(r) && Number(r.position) <= 3).sort((a, b) => +a.position - +b.position);
    const winner = podium[0] && Number(podium[0].position) === 1 ? podium[0] : null;
    const facts = [];
    if (winner) {
      const id = winner.Driver.driverId;
      const before = seasonWins.get(id) || 0;
      if (before === 0 && !(winsBefore[id] > 0)) facts.push({ kind: "maiden-win", id, name: winner.Driver.familyName });
      else if (before === 0) facts.push({ kind: "first-season-win", id, name: winner.Driver.familyName, career: (winsBefore[id] || 0) + 1 });
      else facts.push({ kind: "season-win", id, name: winner.Driver.familyName, count: before + 1 });
      seasonWins.set(id, before + 1);
      const grid = Number(winner.grid);
      if ((grid === 0 && Number(race.season) >= PIT_LANE_FROM) || grid >= 6) facts.push({ kind: "from-grid", id, name: winner.Driver.familyName, grid });
    }
    for (const p of podium) {
      const id = p.Driver.driverId;
      const before = seasonPodiums.get(id) || 0;
      if (!before && !(winsBefore[id] > 0) && Number(p.position) > 1) {
        // Known maiden podium only when the driver has no earlier season; otherwise the UI verifies.
        facts.push({ kind: prior.has(id) ? "podium-check" : "maiden-podium", id, name: p.Driver.familyName, position: Number(p.position) });
      }
      seasonPodiums.set(id, before + 1);
    }
    const lead = leaderAt(i), prev = i ? leaderAt(i - 1) : null;
    if (lead && (!prev || prev.driver.driverId !== lead.driver.driverId) && i > 0) facts.push({ kind: "lead-change", id: lead.driver.driverId, name: lead.driver.familyName });
    let mover = null;
    if (i > 0)
      for (const d of progress.drivers) {
        const a = d.rank[i - 1], b = d.rank[i];
        if (a && b && a - b >= 2 && (!mover || a - b > mover.gain)) mover = { id: d.driver.driverId, name: d.driver.familyName, gain: a - b, to: b };
      }
    if (mover) facts.push({ kind: "mover", ...mover });
    if (opts.clinch === i && lead) facts.push({ kind: "clinch", id: lead.driver.driverId, name: lead.driver.familyName, remaining: progress.rounds.length - 1 - i });
    const sp = sprintBy.get(round.round) || [];
    const sprintWinner = sp.find((r) => Number(r.position) === 1 && classified(r)) || null;
    const top = progress.drivers
      .filter((d) => d.rank[i])
      .sort((a, b) => a.rank[i] - b.rank[i])
      .slice(0, 5)
      .map((d) => ({ id: d.driver.driverId, driver: d.driver, points: d.cumulative[i], rank: d.rank[i], delta: i && d.rank[i - 1] ? d.rank[i - 1] - d.rank[i] : null, gained: d.cumulative[i] - (i ? d.cumulative[i - 1] : 0) }));
    return { index: i, ...round, race, winner, podium, sprintWinner, facts, top };
  });
}
