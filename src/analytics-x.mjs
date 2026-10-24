/**
 * Extended analytics — pure, deterministic helpers behind the Insights upgrade tracker and launch
 * table, the What If championship sandbox and the Career Ratings model. No DOM, no network;
 * everything is unit-tested in tests/analytics-x.test.mjs.
 */
import { timeSeconds } from "./math.mjs";
import { counted, countingRules } from "./progress.mjs";

const NUMERIC = /^\d+$/;
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const median = (v) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round3 = (n) => Math.round(n * 1000) / 1000;

/* ───────────────────────── Qualifying pace & step changes ───────────────────────── */

const SESSIONS = ["Q3", "Q2", "Q1"];

/**
 * Each team's qualifying pace per round as a percentage gap to the fastest time *of the same
 * session*: every car is compared in the deepest session it set a time in (a Q3 car with pole, a
 * Q1-eliminated car with the Q1 benchmark), and the team keeps its best car. Gaps above `maxGap` %
 * (wet sessions, crashes, failures) are kept in `raw` but left out of `gaps`.
 */
export function qualiPace(qualifying, { maxGap = 5 } = {}) {
  const races = [...qualifying].filter((r) => r.QualifyingResults?.length).sort((a, b) => +a.round - +b.round);
  const rounds = races.map((r) => ({ round: r.round, raceName: r.raceName }));
  const teams = new Map();
  races.forEach((race, i) => {
    const rows = race.QualifyingResults;
    const fastest = {};
    for (const s of SESSIONS) {
      const times = rows.map((r) => timeSeconds(r[s])).filter((t) => t && t > 0);
      fastest[s] = times.length ? Math.min(...times) : null;
    }
    for (const r of rows) {
      const id = r.Constructor.constructorId;
      if (!teams.has(id)) teams.set(id, { id, team: r.Constructor, raw: Array(races.length).fill(null), who: Array(races.length).fill(null) });
      const t = teams.get(id);
      t.team = r.Constructor;
      for (const s of SESSIONS) {
        const time = timeSeconds(r[s]);
        if (!time || !fastest[s]) continue;
        const gap = ((time - fastest[s]) / fastest[s]) * 100;
        if (t.raw[i] === null || gap < t.raw[i]) { t.raw[i] = round3(gap); t.who[i] = { driverId: r.Driver.driverId, name: r.Driver.familyName, session: s }; }
        break;
      }
    }
  });
  const list = [...teams.values()].map((t) => {
    const gaps = t.raw.map((g) => (g === null || g > maxGap ? null : g));
    // One-off sessions (rain, a red flag at the wrong moment) are set aside before fitting.
    const { clean, spikes } = despike(gaps);
    const valid = clean.filter((g) => g !== null);
    const steps = detectSteps(clean);
    const first = valid.slice(0, 3), last = valid.slice(-3);
    const change = valid.length >= 6 ? { first: mean(first), last: mean(last), delta: mean(last) - mean(first) } : null;
    return { ...t, gaps, clean, spikes, excluded: t.raw.filter((g) => g !== null && g > maxGap).length, mean: valid.length ? mean(valid) : null, trend: smoothSeries(clean), levels: stepLevels(clean, steps), steps, change };
  });
  const missing = rounds.filter((_, i) => list.every((t) => t.raw[i] === null)).map((r) => r.round);
  return { rounds, missing, teams: list.sort((a, b) => (a.mean ?? 99) - (b.mean ?? 99)) };
}

/**
 * Removes isolated spikes: a value further than max(k·σ, `floor`) from the median of its
 * neighbourhood (±`half` valid points) becomes null. σ is the series' robust noise level.
 */
export function despike(values, { half = 2, k = 3, floor = 0.5 } = {}) {
  const idx = [];
  values.forEach((v, i) => { if (v !== null && v !== undefined) idx.push(i); });
  const limit = Math.max(k * noiseLevel(values), floor);
  const clean = [...values], spikes = [];
  idx.forEach((i, p) => {
    const near = idx.slice(Math.max(0, p - half), p + half + 1).map((j) => values[j]);
    if (near.length >= 3 && Math.abs(values[i] - median(near)) > limit) { clean[i] = null; spikes.push(i); }
  });
  return { clean, spikes };
}

/** Centred moving mean over the non-null neighbours within ±`half` positions (null where the value is null). */
export function smoothSeries(values, half = 1) {
  return values.map((v, i) => {
    if (v === null || v === undefined) return null;
    const near = [];
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) if (values[j] !== null && values[j] !== undefined) near.push(values[j]);
    return round3(mean(near));
  });
}

/** Robust noise level of a series: MAD of first differences ÷ √2 (insensitive to a few steps). */
export function noiseLevel(values, floor = 0.04) {
  const v = values.filter((x) => x !== null && x !== undefined);
  const diffs = v.slice(1).map((x, i) => x - v[i]);
  if (diffs.length < 2) return floor;
  const m = median(diffs);
  const mad = median(diffs.map((d) => Math.abs(d - m)));
  return Math.max(floor, (1.4826 * mad) / Math.SQRT2);
}

/**
 * Step-change detection by binary segmentation: find the split that maximises the standardised
 * difference in means (each side ≥ `minSeg` points), accept it when the z-score ≥ `z` AND the shift
 * is at least `minEffect` (percentage points), then search each side again. Returns at most
 * `maxSteps` steps, in round order. `effect` < 0 means the car got faster relative to the field.
 */
export function detectSteps(values, { minSeg = 3, minEffect = 0.15, z = 3, maxSteps = 3 } = {}) {
  const idx = [], v = [];
  values.forEach((x, i) => { if (x !== null && x !== undefined) { idx.push(i); v.push(x); } });
  const sigma = noiseLevel(v);
  const found = [];
  const search = (lo, hi) => {
    if (hi - lo < 2 * minSeg) return;
    let best = null;
    for (let k = lo + minSeg; k <= hi - minSeg; k++) {
      const a = v.slice(lo, k), b = v.slice(k, hi);
      const m1 = mean(a), m2 = mean(b);
      const stat = Math.abs(m2 - m1) / (sigma * Math.sqrt(1 / a.length + 1 / b.length));
      if (!best || stat > best.stat) best = { k, stat, m1, m2 };
    }
    if (!best || best.stat < z || Math.abs(best.m2 - best.m1) < minEffect) return;
    found.push({ index: idx[best.k], before: round3(best.m1), after: round3(best.m2), effect: round3(best.m2 - best.m1), z: Math.round(best.stat * 10) / 10 });
    search(lo, best.k);
    search(best.k, hi);
  };
  search(0, v.length);
  return found.sort((a, b) => b.z - a.z).slice(0, maxSteps).sort((a, b) => a.index - b.index);
}

/** Piecewise-constant levels between detected steps (the fitted "trend"), null where the value is null. */
export function stepLevels(values, steps) {
  const cuts = [0, ...steps.map((s) => s.index), values.length];
  const out = Array(values.length).fill(null);
  for (let s = 0; s < cuts.length - 1; s++) {
    const seg = [];
    for (let i = cuts[s]; i < cuts[s + 1]; i++) if (values[i] !== null && values[i] !== undefined) seg.push(values[i]);
    const m = seg.length ? round3(mean(seg)) : null;
    for (let i = cuts[s]; i < cuts[s + 1]; i++) if (values[i] !== null && values[i] !== undefined) out[i] = m;
  }
  return out;
}

/* ───────────────────────── Lap-one launch ───────────────────────── */

const notStarted = (r) => /^[WF]$/.test(r.positionText) || /did not (start|qualify|prequalify)|withdrew|107%|excluded from qualifying/i.test(r.status || "");

/**
 * Positions gained on the opening lap: grid slot vs running position at the end of lap 1
 * (Jolpica lap timings, 1996 onward). `laps`: Map(round → lap-1 Timings). Pit-lane starters
 * (grid 0) start from the back of the field; drivers with no lap-1 timing retired on lap 1.
 */
export function lapOneGains(races, laps) {
  const map = new Map();
  let loaded = 0;
  const events = [];
  for (const race of [...races].sort((a, b) => +a.round - +b.round)) {
    const timings = laps.get(race.round);
    if (!timings) continue;
    loaded++;
    const pos1 = new Map(timings.map((t) => [t.driverId, Number(t.position)]));
    const starters = (race.Results || []).filter((r) => !notStarted(r));
    const field = starters.length;
    for (const r of starters) {
      const id = r.Driver.driverId;
      if (!map.has(id)) map.set(id, { id, driver: r.Driver, team: r.Constructor, starts: 0, total: 0, gained: 0, lost: 0, held: 0, out: 0, pitLane: 0, best: null, worst: null, races: [] });
      const d = map.get(id);
      d.team = r.Constructor;
      const grid = Number(r.grid) || 0;
      const p = pos1.get(id);
      if (!p) { d.out++; d.races.push({ round: race.round, raceName: race.raceName, grid, lap1: null, gain: null }); continue; }
      const from = grid > 0 ? grid : field;
      if (grid === 0) d.pitLane++;
      const gain = from - p;
      d.starts++;
      d.total += gain;
      if (gain > 0) d.gained++; else if (gain < 0) d.lost++; else d.held++;
      const ev = { round: race.round, raceName: race.raceName, from: grid, to: p, gain };
      d.races.push({ round: race.round, raceName: race.raceName, grid, lap1: p, gain });
      if (!d.best || gain > d.best.gain) d.best = ev;
      if (!d.worst || gain < d.worst.gain) d.worst = ev;
      events.push({ id, ...ev });
    }
  }
  const drivers = [...map.values()]
    .map((d) => ({ ...d, avg: d.starts ? d.total / d.starts : 0 }))
    .sort((a, b) => b.total - a.total || b.avg - a.avg);
  const best = [...events].sort((a, b) => b.gain - a.gain)[0] || null;
  const worst = [...events].sort((a, b) => a.gain - b.gain)[0] || null;
  return { drivers, loaded, best, worst, moves: events.reduce((s, e) => s + Math.abs(e.gain), 0) };
}

/* ───────────────────────── What If: points systems ───────────────────────── */

export const WHATIF_SYSTEMS = [
  { id: "actual", label: "As raced", short: "As raced" },
  { id: "current", label: "Current (2025 →)", short: "Current", race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1] },
  { id: "2010", label: "2010–2018", short: "2010–18", race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [] },
  { id: "2003", label: "2003–2009", short: "2003–09", race: [10, 8, 6, 5, 4, 3, 2, 1], sprint: [] },
  { id: "1991", label: "1991–2002", short: "1991–02", race: [10, 6, 4, 3, 2, 1], sprint: [] },
];
export const whatIfSystem = (id) => WHATIF_SYSTEMS.find((s) => s.id === id) || WHATIF_SYSTEMS[0];

/** The Grand Prix and sprint tables a season actually used, and its fastest-lap rule. */
export function eraTable(season) {
  const y = Number(season);
  const race = y >= 2010 ? [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    : y >= 2003 ? [10, 8, 6, 5, 4, 3, 2, 1]
    : y >= 1991 ? [10, 6, 4, 3, 2, 1]
    : y >= 1961 ? [9, 6, 4, 3, 2, 1]
    : y === 1960 ? [8, 6, 4, 3, 2, 1]
    : [8, 6, 4, 3, 2];
  const sprint = y >= 2022 ? [8, 7, 6, 5, 4, 3, 2, 1] : y === 2021 ? [3, 2, 1] : [];
  const fastestLap = y <= 1959 ? "any" : y >= 2019 && y <= 2024 ? "top10" : null;
  return { race, sprint, fastestLap };
}

/**
 * Points multiplier a round actually used (½ for shortened races, 2× for the 2014 finale), read
 * from the recorded points of positions 1–5 (a vote, so a shared drive or bonus point can't skew it).
 */
export function roundFactor(rows, table) {
  const votes = new Map();
  for (let k = 0; k < Math.min(5, table.length); k++) {
    const at = rows.filter((r) => r.pos === k + 1);
    if (at.length !== 1 || !(at[0].pts > 0)) continue;
    const ratio = at[0].pts / table[k];
    const f = [0.5, 1, 2].reduce((b, x) => (Math.abs(x - ratio) < Math.abs(b - ratio) ? x : b), 1);
    votes.set(f, (votes.get(f) || 0) + 1);
  }
  let best = 1, n = 0;
  for (const [f, c] of votes) if (c > n || (c === n && f === 1)) { best = f; n = c; }
  return best;
}

/* ───────────────────────── What If: entries & edits ───────────────────────── */

const DSQ = /disqualified|excluded/i;
const NON_START = /did not (start|qualify|pre-?qualify)|withdr|not (started|qualified)|excluded from qualifying/i;
const isStartRow = (row) => row.text !== "W" && row.text !== "F" && (NUMERIC.test(row.text) || !NON_START.test(row.status || ""));

/**
 * The editable entry list of a round, in the order raced: classified finishers by position, then
 * retirements and disqualifications in the order the provider lists them. Non-starters are left out.
 * Each entry: { k (row index), d, c, st: "f" finished | "r" retired | "d" disqualified }.
 */
export function roundEntries(round) {
  const rows = round.results.map((r, k) => ({ ...r, k })).filter(isStartRow);
  const fin = rows.filter((r) => r.pos !== null).sort((a, b) => a.pos - b.pos || a.k - b.k);
  const out = rows.filter((r) => r.pos === null);
  return [
    ...fin.map((r) => ({ k: r.k, d: r.d, c: r.c, st: "f" })),
    ...out.map((r) => ({ k: r.k, d: r.d, c: r.c, st: r.text === "D" || r.text === "E" || DSQ.test(r.status || "") ? "d" : "r" })),
  ];
}

const sameEntries = (a, b) => a.length === b.length && a.every((e, i) => e.k === b[i].k && e.st === b[i].st);

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * Compact, URL-safe encoding of edited rounds: `round.entries~round.entries`, one character per
 * entry (its position in the original list), followed by `-` for a retirement or `_` for a
 * disqualification. Rounds identical to the original are dropped.
 */
export function encodeEdits(edits, rounds) {
  const parts = [];
  for (const round of rounds) {
    const e = edits.get(round.round);
    if (!e) continue;
    const orig = roundEntries(round);
    if (sameEntries(orig, e)) continue;
    const pos = new Map(orig.map((x, i) => [x.k, i]));
    parts.push(round.round + "." + e.map((x) => ALPHABET[pos.get(x.k)] + (x.st === "r" ? "-" : x.st === "d" ? "_" : "")).join(""));
  }
  return parts.join("~");
}

/** Inverse of encodeEdits; malformed or out-of-range rounds are ignored. */
export function decodeEdits(text, rounds) {
  const edits = new Map();
  if (!text) return edits;
  const byRound = new Map(rounds.map((r) => [String(r.round), r]));
  for (const part of String(text).split("~")) {
    const [rnd, body = ""] = part.split(".");
    const round = byRound.get(rnd);
    if (!round) continue;
    const orig = roundEntries(round);
    const list = [];
    const seen = new Set();
    let ok = true;
    for (let i = 0; i < body.length; i++) {
      const at = ALPHABET.indexOf(body[i]);
      if (at < 0 || at >= orig.length || seen.has(at)) { ok = false; break; }
      seen.add(at);
      const mark = body[i + 1];
      const st = mark === "-" ? "r" : mark === "_" ? "d" : "f";
      if (st !== "f") i++;
      list.push({ ...orig[at], st });
    }
    if (!ok || list.length !== orig.length) continue;
    if (!sameEntries(orig, list)) edits.set(round.round, list);
  }
  return edits;
}

/** Display order of an edited list: finishers first, then retirements, then disqualifications. */
export function normaliseEntries(list) {
  return [...list.filter((e) => e.st === "f"), ...list.filter((e) => e.st === "r"), ...list.filter((e) => e.st === "d")];
}

/* ───────────────────────── What If: championship ───────────────────────── */

/**
 * Championship tables for a season under edits and a points system.
 * `input`: { season, rounds: [{ round, name, indy, results: ARow-like rows, sprint: [{ d, c, pos, pts }] }] }.
 * `opts.edits`: Map(round → entries); `opts.system`: WHATIF_SYSTEMS id; `opts.drops`: apply the
 * season's dropped-score rules (default true).
 *
 * As raced: unedited rounds keep the recorded points exactly; an edited round is rescored with the
 * season's table (× the round's multiplier) and each driver keeps any bonus point they earned
 * (fastest lap — from 2019 only while classified in the top ten). Other systems score every Grand
 * Prix in full with their table and add sprint points only where the system has a sprint table.
 */
export function whatIfSeason(input, { edits = new Map(), system = "actual", drops = true } = {}) {
  const season = Number(input.season);
  const era = eraTable(season);
  const sys = whatIfSystem(system);
  const rules = countingRules(season);
  const ruleD = drops ? rules.driver : undefined;
  const ruleC = drops ? rules.constructor : undefined;
  const hasTeams = season >= 1958;
  const drivers = new Map(), teams = new Map();
  const rounds = input.rounds.map((r) => ({ round: r.round, name: r.name, edited: edits.has(r.round) }));
  const n = input.rounds.length;
  const D = (d, c) => {
    if (!drivers.has(d)) drivers.set(d, { d, c, scores: Array(n).fill(0), places: Array(n).fill(null), cumulative: [], rank: [] });
    return drivers.get(d);
  };
  let teamRound = 0;
  input.rounds.forEach((round, i) => {
    const edit = edits.get(round.round);
    const factor = roundFactor(round.results, era.race);
    const table = sys.race || era.race;
    const gp = new Map(); // d → points this round
    const place = new Map(); // d → best classified place
    const teamCar = new Map(); // c → per-car points (for best-car-only seasons)
    const add = (d, c, p, car = true) => {
      gp.set(d, (gp.get(d) || 0) + p);
      if (car) (teamCar.get(c) || teamCar.set(c, []).get(c)).push(p);
    };
    if (!edit) {
      for (const r of round.results) {
        if (!isStartRow(r) && !(r.pts > 0)) continue;
        D(r.d, r.c).c = r.c;
        const p = system === "actual" ? r.pts : r.pos !== null && !DSQ.test(r.status || "") ? table[r.pos - 1] || 0 : 0;
        add(r.d, r.c, p);
        if (r.pos !== null && (!place.has(r.d) || r.pos < place.get(r.d))) place.set(r.d, r.pos);
      }
    } else {
      const rowAt = new Map(round.results.map((r, k) => [k, r]));
      let p = 0;
      for (const e of edit) {
        const r = rowAt.get(e.k);
        D(e.d, e.c).c = e.c;
        const pos = e.st === "f" ? ++p : null;
        let pts = 0;
        if (system === "actual") {
          const base = (q) => (q !== null && q <= era.race.length ? era.race[q - 1] * factor : 0);
          pts = base(pos);
          if (e.st !== "d") {
            if (era.fastestLap === "top10") pts += r.fl === 1 && pos !== null && pos <= 10 ? 1 : 0;
            else pts += Math.max(0, r.pts - base(r.pos));
          }
        } else pts = pos !== null ? table[pos - 1] || 0 : 0;
        add(e.d, e.c, pts);
        if (pos !== null && (!place.has(e.d) || pos < place.get(e.d))) place.set(e.d, pos);
      }
      // Non-starters keep whatever they were credited (normally nothing).
      for (const r of round.results) if (!isStartRow(r) && r.pts > 0 && system === "actual") add(r.d, r.c, r.pts);
    }
    // Sprints are never edited: recorded points as raced, rescored by sprint position otherwise.
    for (const s of round.sprint || []) {
      const pts = system === "actual" ? s.pts : s.pos !== null && sys.sprint.length ? sys.sprint[s.pos - 1] || 0 : 0;
      if (!pts) continue;
      D(s.d, s.c);
      gp.set(s.d, (gp.get(s.d) || 0) + pts);
      (teamCar.get(s.c) || teamCar.set(s.c, []).get(s.c)).push(pts);
    }
    for (const dr of drivers.values()) {
      dr.scores[i] = gp.get(dr.d) || 0;
      dr.places[i] = place.has(dr.d) ? place.get(dr.d) : null;
      dr.cumulative[i] = Math.round(counted(dr.scores.slice(0, i + 1), ruleD) * 100) / 100;
    }
    const indy = !!round.indy;
    if (hasTeams && !indy) {
      teamRound++;
      for (const [c, cars] of teamCar) {
        if (!teams.has(c)) teams.set(c, { c, scores: [], cumulative: [], rank: [] });
      }
      for (const t of teams.values()) {
        const cars = teamCar.get(t.c) || [];
        t.scores[teamRound - 1] = rules.bestCarOnly ? Math.max(0, ...cars) : cars.reduce((s, x) => s + x, 0);
      }
    }
    for (const t of teams.values()) {
      for (let j = 0; j < teamRound; j++) t.scores[j] ??= 0;
      t.cumulative[i] = Math.round(counted(t.scores.slice(0, teamRound), ruleC) * 100) / 100;
    }
    const list = [...drivers.values()].sort((a, b) => countback(a, b, i));
    list.forEach((dr, k) => (dr.rank[i] = k + 1));
    [...teams.values()].sort((a, b) => b.cumulative[i] - a.cumulative[i]).forEach((t, k) => (t.rank[i] = k + 1));
  });
  const last = n - 1;
  const fin = (dr) => {
    const counts = Array(40).fill(0);
    for (const p of dr.places) if (p !== null && p <= 40) counts[p - 1]++;
    const gross = Math.round(dr.scores.reduce((s, x) => s + x, 0) * 100) / 100;
    return { d: dr.d, c: dr.c, points: dr.cumulative[last] ?? 0, gross, dropped: Math.round((gross - (dr.cumulative[last] ?? 0)) * 100) / 100, wins: counts[0], podiums: counts[0] + counts[1] + counts[2], scores: dr.scores, places: dr.places, cumulative: dr.cumulative, rank: dr.rank };
  };
  return {
    season, rounds, system: sys.id, drops: !!(drops && (rules.driver || rules.constructor)), rules: { driver: rules.driver, constructor: rules.constructor, bestCarOnly: rules.bestCarOnly },
    drivers: [...drivers.values()].sort((a, b) => (a.rank[last] || 999) - (b.rank[last] || 999)).map(fin),
    teams: hasTeams ? [...teams.values()].sort((a, b) => (a.rank[last] || 999) - (b.rank[last] || 999)).map((t) => ({ c: t.c, points: t.cumulative[last] ?? 0, cumulative: t.cumulative, rank: t.rank })) : [],
  };
}

/** Points, then count-back on best finishes (most wins, then most seconds, …), up to round `i`. */
function countback(a, b, i) {
  const diff = (b.cumulative[i] ?? 0) - (a.cumulative[i] ?? 0);
  if (Math.abs(diff) > 1e-9) return diff;
  for (let p = 1; p <= 30; p++) {
    let ca = 0, cb = 0;
    for (let j = 0; j <= i; j++) { if (a.places[j] === p) ca++; if (b.places[j] === p) cb++; }
    if (ca !== cb) return cb - ca;
  }
  return 0;
}

/** Rank and points change of every driver between a baseline and a scenario. */
export function whatIfDiff(base, scenario) {
  const before = new Map(base.drivers.map((d, i) => [d.d, { rank: i + 1, points: d.points }]));
  return scenario.drivers.map((d, i) => {
    const b = before.get(d.d);
    return { d: d.d, rank: i + 1, points: d.points, before: b || null, rankDelta: b ? b.rank - (i + 1) : null, pointsDelta: b ? Math.round((d.points - b.points) * 100) / 100 : d.points };
  });
}

/* ───────────────────────── Career ratings ───────────────────────── */

export const RATING_SCALE = 400 / Math.LN10; // logit → Elo points
export const RATING_BASE = 1500;

/**
 * Teammate comparisons from every Grand Prix: for each constructor, every pair of its cars that
 * both started AND were classified gives one result (who finished ahead). With k classified cars
 * a pair weighs 1/(k − 1), so each driver contributes at most one comparison per race.
 * Returns flat arrays for the fit plus the driver-season index.
 */
export function teammateComparisons(races) {
  const keyOf = new Map(), seasons = [];
  const param = (d, season) => {
    const key = d + ":" + season;
    if (!keyOf.has(key)) { keyOf.set(key, seasons.length); seasons.push({ d, season, comparisons: 0, wins: 0, losses: 0, teams: new Map(), points: 0, teamPoints: 0, starts: 0 }); }
    return keyOf.get(key);
  };
  const win = [], lose = [], weight = [];
  for (const race of races) {
    const starters = race.results.filter(isStartRow);
    const byTeam = new Map();
    const teamPts = new Map();
    for (const r of starters) {
      const p = param(r.d, race.season);
      const s = seasons[p];
      s.starts++;
      s.teams.set(r.c, (s.teams.get(r.c) || 0) + 1);
      s.points += r.pts;
      teamPts.set(r.c, (teamPts.get(r.c) || 0) + r.pts);
      if (r.pos !== null && !DSQ.test(r.status || "")) (byTeam.get(r.c) || byTeam.set(r.c, []).get(r.c)).push(r);
    }
    for (const r of starters) seasons[param(r.d, race.season)].teamPoints += teamPts.get(r.c) || 0;
    for (const cars of byTeam.values()) {
      const k = cars.length;
      if (k < 2) continue;
      for (let i = 0; i < k; i++)
        for (let j = i + 1; j < k; j++) {
          const a = cars[i], b = cars[j];
          if (a.d === b.d || a.pos === b.pos) continue;
          const [w, l] = a.pos < b.pos ? [a, b] : [b, a];
          const pw = param(w.d, race.season), pl = param(l.d, race.season);
          win.push(pw); lose.push(pl); weight.push(1 / (k - 1));
          seasons[pw].comparisons += 1 / (k - 1); seasons[pw].wins += 1 / (k - 1);
          seasons[pl].comparisons += 1 / (k - 1); seasons[pl].losses += 1 / (k - 1);
        }
    }
  }
  return { seasons, keyOf, win, lose, weight };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * Time-varying Bradley–Terry ratings from teammate head-to-heads.
 * Maximises Σ w·log σ(r_winner − r_loser) − λ/2 Σ (r_{d,s} − r_{d,s'})² / gap − μ/2 Σ r²
 * over one rating per driver-season, with damped diagonal-Newton steps. λ lets a driver's level
 * drift between seasons; μ shrinks thin records towards the average (0 = 1500).
 */
export function fitRatings(cmp, { lambda = 4, mu = 0.6, iterations = 160 } = {}) {
  const { seasons, win, lose, weight } = cmp;
  const n = seasons.length;
  const r = new Float64Array(n);
  // Neighbouring seasons of the same driver.
  const byDriver = new Map();
  seasons.forEach((s, i) => (byDriver.get(s.d) || byDriver.set(s.d, []).get(s.d)).push(i));
  const links = [];
  for (const list of byDriver.values()) {
    list.sort((a, b) => seasons[a].season - seasons[b].season);
    for (let k = 1; k < list.length; k++) links.push([list[k - 1], list[k], lambda / Math.max(1, seasons[list[k]].season - seasons[list[k - 1]].season)]);
  }
  const g = new Float64Array(n), h = new Float64Array(n);
  for (let it = 0; it < iterations; it++) {
    g.fill(0); h.fill(mu);
    for (let i = 0; i < n; i++) g[i] = -mu * r[i];
    for (let c = 0; c < win.length; c++) {
      const a = win[c], b = lose[c], w = weight[c];
      const p = sigmoid(r[a] - r[b]);
      g[a] += w * (1 - p); g[b] -= w * (1 - p);
      const info = w * p * (1 - p);
      h[a] += info; h[b] += info;
    }
    for (const [a, b, l] of links) {
      const diff = r[a] - r[b];
      g[a] -= l * diff; g[b] += l * diff;
      h[a] += l; h[b] += l;
    }
    let move = 0;
    for (let i = 0; i < n; i++) { const step = (0.8 * g[i]) / h[i]; r[i] += step; move = Math.max(move, Math.abs(step)); }
    if (move < 1e-5) break;
  }
  // Information per driver-season (head-to-head only) for confidence intervals.
  const info = new Float64Array(n);
  for (let c = 0; c < win.length; c++) {
    const a = win[c], b = lose[c], w = weight[c];
    const p = sigmoid(r[a] - r[b]);
    info[a] += w * p * (1 - p); info[b] += w * p * (1 - p);
  }
  return { r, info };
}

/**
 * Career ratings for every driver: season curve, peak (best season with ≥ `minPeak` comparisons),
 * career (comparison-weighted mean of seasons), ±1.96 standard errors on the Elo scale and the
 * share of team points. `races`: archive races ({ season, results: ARow[] }).
 */
export function careerRatings(races, opts = {}) {
  const { minPeak = 6 } = opts;
  const cmp = teammateComparisons(races);
  const { r, info } = fitRatings(cmp, opts);
  const mu = opts.mu ?? 0.6;
  const elo = (x) => RATING_BASE + RATING_SCALE * x;
  const byDriver = new Map();
  cmp.seasons.forEach((s, i) => {
    const team = [...s.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    const row = {
      season: s.season, rating: Math.round(elo(r[i])), raw: r[i], comparisons: Math.round(s.comparisons * 10) / 10,
      wins: Math.round(s.wins * 10) / 10, losses: Math.round(s.losses * 10) / 10, starts: s.starts, team,
      share: s.teamPoints > 0 ? s.points / s.teamPoints : null, points: s.points, teamPoints: s.teamPoints,
      se: Math.round((RATING_SCALE / Math.sqrt(info[i] + mu)) * 1.96), info: info[i],
    };
    (byDriver.get(s.d) || byDriver.set(s.d, []).get(s.d)).push(row);
  });
  const drivers = [];
  for (const [d, list] of byDriver) {
    list.sort((a, b) => a.season - b.season);
    const compared = list.filter((s) => s.comparisons > 0);
    const totalC = compared.reduce((s, x) => s + x.comparisons, 0);
    const career = totalC ? compared.reduce((s, x) => s + x.raw * x.comparisons, 0) / totalC : 0;
    const peakPool = list.filter((s) => s.comparisons >= minPeak);
    const peak = (peakPool.length ? peakPool : compared).reduce((b, x) => (!b || x.raw > b.raw ? x : b), null);
    const infoSum = list.reduce((s, x) => s + x.info, 0);
    const wins = list.reduce((s, x) => s + x.wins, 0), losses = list.reduce((s, x) => s + x.losses, 0);
    const pts = list.reduce((s, x) => s + x.points, 0), teamPts = list.reduce((s, x) => s + x.teamPoints, 0);
    drivers.push({
      d, seasons: list, career: Math.round(elo(career)), peak: peak ? peak.rating : Math.round(elo(career)), peakSeason: peak?.season ?? list[0].season,
      comparisons: Math.round(totalC * 10) / 10, wins: Math.round(wins * 10) / 10, losses: Math.round(losses * 10) / 10,
      h2h: wins + losses ? wins / (wins + losses) : null, share: teamPts > 0 ? pts / teamPts : null,
      se: Math.round((RATING_SCALE / Math.sqrt(infoSum + mu)) * 1.96),
      first: list[0].season, last: list.at(-1).season, starts: list.reduce((s, x) => s + x.starts, 0),
      confidence: totalC >= 120 ? "high" : totalC >= 40 ? "medium" : "low",
    });
  }
  return { drivers: drivers.sort((a, b) => b.career - a.career), comparisons: cmp.win.length };
}

/** Comparison-weighted rating over the seasons inside [from, to] (null if none were compared). */
export function eraRating(driver, from, to) {
  const list = driver.seasons.filter((s) => s.season >= from && s.season <= to && s.comparisons > 0);
  const c = list.reduce((s, x) => s + x.comparisons, 0);
  if (!c) return null;
  return { rating: Math.round(RATING_BASE + RATING_SCALE * (list.reduce((s, x) => s + x.raw * x.comparisons, 0) / c)), comparisons: Math.round(c * 10) / 10 };
}
