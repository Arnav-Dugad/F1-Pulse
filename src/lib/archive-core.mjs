/**
 * Pure analytics over the race archive (public/data/archive.json, built by scripts/fetch-archive.mjs).
 * No DOM, no network — everything here is unit-tested in tests/archive.test.mjs.
 *
 * Conventions
 * - A "start" is any result row except withdrawals / non-qualifiers (positionText W or F, or a
 *   "did not start / qualify" status).
 * - A win is a classified P1 row. Shared drives (1950s) credit every listed driver, as the
 *   official statistics do.
 * - Pole: Jolpica's qualifying P1 where a qualifying table exists (1994+), otherwise the driver who
 *   started from grid P1 (the closest available proxy for pole before 1994); 2021 sprint weekends
 *   credit the sprint winner, as the official records do.
 * - Fastest lap: rank 1 in the race classification, only where Jolpica publishes fastest-lap data.
 */

export const MODERN_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const ERAS = [
  { id: "all", label: "All time", from: 1950, to: 9999 },
  { id: "1950-79", label: "1950–79", from: 1950, to: 1979 },
  { id: "1980-99", label: "1980–99", from: 1980, to: 1999 },
  { id: "2000-13", label: "2000–13", from: 2000, to: 2013 },
  { id: "2014-21", label: "2014–21", from: 2014, to: 2021 },
  { id: "2022+", label: "2022+", from: 2022, to: 9999 },
];
export const eraById = (id) => ERAS.find((e) => e.id === id) || ERAS[0];

const NUMERIC = /^\d+$/;
const NON_START = /did not (start|qualify|pre-?qualify)|withdr|not (started|qualified)|excluded from qualifying/i;
export const isStart = (row) => row.text !== "W" && row.text !== "F" && (NUMERIC.test(row.text) || !NON_START.test(row.status));
const round2 = (n) => Math.round(n * 100) / 100;

/* ───────────────────────── Decoding & merging ───────────────────────── */

function decodeRace(r, statuses) {
  const [season, round, name, circuit, date, pole, rows, sprint] = r;
  const results = rows.map(([d, c, grid, text, pts, s, laps, fl, ms], order) => ({
    d, c, grid, text, pos: NUMERIC.test(text) ? +text : null, pts, status: statuses[s] ?? "", laps, fl: fl || 0, ms: ms || 0, order,
  }));
  return {
    season, round, name, circuit, date, pole: pole ?? -1, results,
    sprint: (sprint || []).map(([d, c, text, pts]) => ({ d, c, text, pos: NUMERIC.test(text) ? +text : null, pts })),
  };
}

/** Expand the compact JSON file into indexed objects. */
export function decodeArchive(file) {
  const drivers = file.drivers.map(([id, given, family, dob, nat, code]) => ({ id, given, family, name: `${given} ${family}`, dob, nat, code }));
  const teams = file.constructors.map(([id, name, nat]) => ({ id, name, nat }));
  const circuits = file.circuits.map(([id, name, locality, country, lat, lon]) => ({ id, name, locality, country, lat, lon }));
  const races = file.races.map((r) => decodeRace(r, file.statuses)).sort((a, b) => a.season - b.season || a.round - b.round);
  return index({
    generatedAt: file.generatedAt, first: file.first, last: file.last, qualifyingFrom: file.qualifyingFrom,
    drivers, teams, circuits, races, live: [],
  });
}

function index(a) {
  a.driverIndex = new Map(a.drivers.map((d, i) => [d.id, i]));
  a.teamIndex = new Map(a.teams.map((t, i) => [t.id, i]));
  a.circuitIndex = new Map(a.circuits.map((c, i) => [c.id, i]));
  a.seasons = [...new Set(a.races.map((r) => r.season))];
  return a;
}

/**
 * Append (or replace) one season of Jolpica-shaped races. `poles` maps round → driverId (qualifying P1),
 * `sprints` are Jolpica races carrying SprintResults. Returns a new archive; the input is untouched.
 */
export function mergeSeason(archive, season, races, poles = new Map(), sprints = []) {
  const drivers = [...archive.drivers], teams = [...archive.teams], circuits = [...archive.circuits];
  const di = new Map(archive.driverIndex), ti = new Map(archive.teamIndex), ci = new Map(archive.circuitIndex);
  const driver = (d) => {
    if (!di.has(d.driverId)) {
      di.set(d.driverId, drivers.length);
      drivers.push({ id: d.driverId, given: d.givenName, family: d.familyName, name: `${d.givenName} ${d.familyName}`, dob: d.dateOfBirth || "", nat: d.nationality || "", code: d.code || "" });
    }
    return di.get(d.driverId);
  };
  const team = (c) => {
    if (!ti.has(c.constructorId)) {
      ti.set(c.constructorId, teams.length);
      teams.push({ id: c.constructorId, name: c.name, nat: c.nationality || "" });
    }
    return ti.get(c.constructorId);
  };
  const circuit = (c) => {
    if (!ci.has(c.circuitId)) {
      ci.set(c.circuitId, circuits.length);
      circuits.push({ id: c.circuitId, name: c.circuitName, locality: c.Location?.locality || "", country: c.Location?.country || "", lat: +c.Location?.lat || 0, lon: +c.Location?.long || 0 });
    }
    return ci.get(c.circuitId);
  };
  const sprintBy = new Map(sprints.map((s) => [String(s.round), s.SprintResults || []]));
  const added = races.filter((r) => r.Results?.length).map((r) => {
    const results = r.Results.map((x, order) => ({
      d: driver(x.Driver), c: team(x.Constructor), grid: +x.grid || 0, text: x.positionText,
      pos: NUMERIC.test(x.positionText) ? +x.positionText : null, pts: +x.points || 0, status: x.status || "",
      laps: +x.laps || 0, fl: +(x.FastestLap?.rank || 0), ms: +(x.Time?.millis || 0), order,
    }));
    const sprint = (sprintBy.get(String(r.round)) || []).map((x) => ({
      d: driver(x.Driver), c: team(x.Constructor), text: x.positionText, pos: NUMERIC.test(x.positionText) ? +x.positionText : null, pts: +x.points || 0,
    }));
    // Qualifying P1 is only kept when that driver appears in the archive (so they have a name).
    const pole = di.get(poles.get(String(r.round)) ?? "") ?? -1;
    return { season: +season, round: +r.round, name: r.raceName, circuit: circuit(r.Circuit), date: r.date, pole, results, sprint };
  });
  const kept = archive.races.filter((r) => r.season !== +season);
  return index({
    ...archive, drivers, teams, circuits,
    races: [...kept, ...added].sort((a, b) => a.season - b.season || a.round - b.round),
    live: [...new Set([...archive.live, +season])],
  });
}

/* ───────────────────────── Basic helpers ───────────────────────── */

export const inRange = (season, from = 0, to = 9999) => season >= from && season <= to;
export const racesIn = (archive, from = 0, to = 9999) => archive.races.filter((r) => inRange(r.season, from, to));
/** The Indianapolis 500 (1950–60) counted for the drivers' championship only — no constructors raced it. */
export const isIndy500 = (archive, race) => race.season <= 1960 && archive.circuits[race.circuit]?.id === "indianapolis";

/**
 * Pole sitter with provenance: qualifying P1 when published, else grid P1. In 2021 the sprint
 * winner was officially credited with pole on sprint weekends.
 */
export function poleOf(race) {
  if (race.season === 2021 && race.sprint.length) {
    const s = race.sprint.find((x) => x.pos === 1);
    if (s) return { d: s.d, c: s.c, source: "sprint" };
  }
  if (race.pole >= 0) {
    const row = race.results.find((x) => x.d === race.pole);
    return { d: race.pole, c: row ? row.c : -1, source: "qualifying" };
  }
  const row = race.results.find((x) => x.grid === 1);
  return row ? { d: row.d, c: row.c, source: "grid" } : null;
}
export const hasFastestLap = (race) => race.results.some((x) => x.fl === 1);
export const winnersOf = (race) => race.results.filter((x) => x.pos === 1);

/** Seasons covered by qualifying-based poles and by fastest-lap ranks. */
export function coverage(archive) {
  const quali = archive.races.find((r) => r.pole >= 0);
  const fl = archive.races.find(hasFastestLap);
  return { qualifyingFrom: quali?.season ?? null, fastestLapFrom: fl?.season ?? null, first: archive.races[0]?.season ?? null, last: archive.races.at(-1)?.season ?? null };
}

/** Calendar age at a date: whole years plus remaining days. */
export function ageAt(dob, date) {
  if (!dob || !date) return null;
  const b = new Date(dob + "T00:00:00Z"), d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(+b) || Number.isNaN(+d) || d < b) return null;
  let years = d.getUTCFullYear() - b.getUTCFullYear();
  // 29 Feb birthdays roll over to 1 Mar in non-leap years.
  const anniversary = (y) => new Date(Date.UTC(y, b.getUTCMonth(), b.getUTCDate()));
  if (anniversary(d.getUTCFullYear()) > d) years--;
  const last = anniversary(b.getUTCFullYear() + years);
  return { years, days: Math.round((+d - +last) / 864e5), totalDays: Math.round((+d - +b) / 864e5) };
}

/* ───────────────────────── Career tallies ───────────────────────── */

const blank = (idx) => ({ idx, starts: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, points: 0, hatTricks: 0, oneTwos: 0, best: null, seasons: new Set(), first: null, last: null });

/**
 * One pass over the races in range → per-driver and per-constructor aggregates.
 * Constructor `starts` = races with at least one starting car; podiums count cars.
 */
export function tally(archive, from = 0, to = 9999) {
  const drivers = new Map(), teams = new Map();
  const get = (m, i) => (m.get(i) || m.set(i, blank(i)).get(i));
  let races = 0, fastestLapRaces = 0;
  for (const race of archive.races) {
    if (!inRange(race.season, from, to)) continue;
    races++;
    const fl = hasFastestLap(race);
    if (fl) fastestLapRaces++;
    const pole = poleOf(race);
    const teamStarted = new Set();
    const winners = new Set();
    for (const r of race.results) {
      const d = get(drivers, r.d);
      d.points += r.pts;
      const t = get(teams, r.c);
      t.points += r.pts;
      if (!isStart(r)) continue;
      d.starts++;
      d.seasons.add(race.season);
      d.first ??= race;
      d.last = race;
      teamStarted.add(r.c);
      t.seasons.add(race.season);
      t.first ??= race;
      t.last = race;
      if (r.pos !== null) {
        if (d.best === null || r.pos < d.best) d.best = r.pos;
        if (t.best === null || r.pos < t.best) t.best = r.pos;
        if (r.pos <= 3) { d.podiums++; t.podiums++; }
        if (r.pos === 1) { d.wins++; winners.add(r.c); }
      }
      if (r.fl === 1) { d.fastestLaps++; t.fastestLaps++; }
      if (r.pos === 1 && r.fl === 1 && pole && pole.d === r.d) d.hatTricks++;
    }
    for (const c of teamStarted) get(teams, c).starts++;
    for (const c of winners) get(teams, c).wins++;
    if (pole) {
      get(drivers, pole.d).poles++;
      if (pole.c >= 0) get(teams, pole.c).poles++;
    }
    const p1 = race.results.find((x) => x.pos === 1), p2 = race.results.find((x) => x.pos === 2);
    if (p1 && p2 && p1.c === p2.c) get(teams, p1.c).oneTwos++;
    for (const s of race.sprint) {
      get(drivers, s.d).points += s.pts;
      get(teams, s.c).points += s.pts;
    }
  }
  for (const m of [drivers, teams]) for (const v of m.values()) v.points = round2(v.points);
  return { drivers: [...drivers.values()], teams: [...teams.values()], races, fastestLapRaces };
}

/** Sorted leaderboard for a metric. `winPct` needs `minStarts`. */
export function leaderboard(list, metric, { minStarts = 0, limit = 20 } = {}) {
  const value = (x) => (metric === "winPct" ? (x.starts ? x.wins / x.starts : 0) : x[metric] || 0);
  return list
    .filter((x) => (metric === "winPct" ? x.starts >= minStarts && x.wins > 0 : value(x) > 0))
    .map((x) => ({ ...x, value: value(x) }))
    .sort((a, b) => b.value - a.value || b.wins - a.wins || a.starts - b.starts)
    .slice(0, limit);
}

/* ───────────────────────── Ages ───────────────────────── */

/**
 * Youngest / oldest race winners or podium finishers — one entry per driver (their first
 * qualifying result for "youngest", their last for "oldest").
 */
export function ageRecords(archive, { kind = "win", order = "youngest", from = 0, to = 9999, limit = 10 } = {}) {
  const best = new Map();
  for (const race of archive.races) {
    if (!inRange(race.season, from, to)) continue;
    for (const r of race.results) {
      if (r.pos === null || r.pos > (kind === "win" ? 1 : 3)) continue;
      const age = ageAt(archive.drivers[r.d]?.dob, race.date);
      if (!age) continue;
      const prev = best.get(r.d);
      if (!prev || (order === "youngest" ? age.totalDays < prev.age.totalDays : age.totalDays > prev.age.totalDays)) best.set(r.d, { idx: r.d, race, age, row: r });
    }
  }
  return [...best.values()].sort((a, b) => (order === "youngest" ? 1 : -1) * (a.age.totalDays - b.age.totalDays)).slice(0, limit);
}

/* ───────────────────────── Streaks & season bests ───────────────────────── */

/**
 * Longest runs of consecutive wins. Drivers: consecutive starts (a race not entered doesn't break a
 * run). Constructors: consecutive championship races, excluding the 1950–60 Indianapolis 500.
 */
export function winStreaks(archive, { kind = "driver", from = 0, to = 9999, limit = 10 } = {}) {
  const runs = [];
  const open = new Map();
  const close = (k) => {
    const s = open.get(k);
    if (s && s.length > 1) runs.push(s);
    open.delete(k);
  };
  for (const race of archive.races) {
    if (!inRange(race.season, from, to)) continue;
    if (kind === "driver") {
      for (const r of race.results) {
        if (!isStart(r)) continue;
        if (r.pos === 1) {
          const s = open.get(r.d);
          if (s) { s.length++; s.end = race; } else open.set(r.d, { idx: r.d, length: 1, start: race, end: race });
        } else close(r.d);
      }
    } else {
      if (isIndy500(archive, race)) continue;
      const won = new Set(winnersOf(race).map((r) => r.c));
      for (const k of [...open.keys()]) if (!won.has(k)) close(k);
      for (const c of won) {
        const s = open.get(c);
        if (s) { s.length++; s.end = race; } else open.set(c, { idx: c, length: 1, start: race, end: race });
      }
    }
  }
  for (const k of [...open.keys()]) close(k);
  return runs.sort((a, b) => b.length - a.length || a.start.season - b.start.season).slice(0, limit);
}

/** Most wins in a single season (with that season's race count for context). */
export function seasonBests(archive, { kind = "driver", from = 0, to = 9999, limit = 10 } = {}) {
  const per = new Map(), racesPer = new Map();
  for (const race of archive.races) {
    if (!inRange(race.season, from, to)) continue;
    if (kind === "constructor" && isIndy500(archive, race)) continue;
    racesPer.set(race.season, (racesPer.get(race.season) || 0) + 1);
    const ids = new Set(winnersOf(race).map((r) => (kind === "driver" ? r.d : r.c)));
    for (const id of ids) {
      const k = race.season + ":" + id;
      const v = per.get(k) || { idx: id, season: race.season, wins: 0 };
      v.wins++;
      per.set(k, v);
    }
  }
  return [...per.values()]
    .map((v) => ({ ...v, races: racesPer.get(v.season) || 0, pct: v.wins / (racesPer.get(v.season) || 1) }))
    .sort((a, b) => b.wins - a.wins || b.pct - a.pct)
    .slice(0, limit);
}

/* ───────────────────────── Circuits ───────────────────────── */

/**
 * Per circuit: mean places gained (grid − finish) by classified finishers who took a grid slot,
 * and how often the pole sitter won.
 */
export function circuitTendencies(archive, { from = 0, to = 9999, minRaces = 3 } = {}) {
  const per = new Map();
  for (const race of archive.races) {
    if (!inRange(race.season, from, to)) continue;
    const v = per.get(race.circuit) || { idx: race.circuit, races: 0, gain: 0, samples: 0, poleRaces: 0, poleWins: 0, first: race.season, last: race.season };
    v.races++;
    v.last = race.season;
    for (const r of race.results) if (r.pos !== null && r.grid > 0) { v.gain += r.grid - r.pos; v.samples++; }
    const pole = poleOf(race);
    if (pole) {
      v.poleRaces++;
      if (race.results.some((r) => r.d === pole.d && r.pos === 1)) v.poleWins++;
    }
    per.set(race.circuit, v);
  }
  return [...per.values()]
    .filter((v) => v.races >= minRaces)
    .map((v) => ({ ...v, avgGain: v.samples ? v.gain / v.samples : 0, conversion: v.poleRaces ? v.poleWins / v.poleRaces : 0 }));
}

/* ───────────────────────── Dominance ───────────────────────── */

/**
 * Per season: the champion's share of wins and of all points scored (race + sprint, as scored —
 * before any dropped-score rules), and how many different drivers won. `champions` maps season →
 * driverId (final tables); seasons without one use the current points leader (`complete: false`).
 */
export function dominance(archive, champions = new Map()) {
  const out = [];
  for (const season of archive.seasons) {
    const races = archive.races.filter((r) => r.season === season);
    const points = new Map(), wins = new Map();
    let total = 0;
    const winners = new Set();
    for (const race of races) {
      for (const r of [...race.results, ...race.sprint]) {
        points.set(r.d, (points.get(r.d) || 0) + r.pts);
        total += r.pts;
      }
      for (const w of winnersOf(race)) { wins.set(w.d, (wins.get(w.d) || 0) + 1); winners.add(w.d); }
    }
    const champId = champions.get(season);
    let champ = champId !== undefined ? archive.driverIndex.get(champId) : undefined;
    const complete = champ !== undefined;
    if (champ === undefined) champ = [...points.entries()].sort((a, b) => b[1] - a[1] || (wins.get(b[0]) || 0) - (wins.get(a[0]) || 0))[0]?.[0];
    if (champ === undefined) continue;
    out.push({
      season, races: races.length, champion: champ, complete,
      wins: wins.get(champ) || 0, winShare: races.length ? (wins.get(champ) || 0) / races.length : 0,
      points: round2(points.get(champ) || 0), totalPoints: round2(total), pointsShare: total ? (points.get(champ) || 0) / total : 0,
      winners: winners.size,
    });
  }
  return out;
}

/* ───────────────────────── Normalised scoring ───────────────────────── */

export const modernPoints = (pos, system = MODERN_POINTS) => (pos !== null && pos >= 1 && pos <= system.length ? system[pos - 1] : 0);

/** A season's drivers rescored with one points system (Grand Prix finishes only; no fastest-lap or sprint points). */
export function rescoreSeason(archive, season, system = MODERN_POINTS) {
  const per = new Map();
  const races = archive.races.filter((r) => r.season === season);
  races.forEach((race, i) => {
    for (const r of race.results) {
      if (!isStart(r) && !r.pts) continue;
      const v = per.get(r.d) || { idx: r.d, team: r.c, points: 0, actual: 0, wins: 0, podiums: 0, starts: 0, places: [], trace: Array(races.length).fill(null) };
      v.team = r.c;
      v.points += modernPoints(r.pos, system);
      v.actual += r.pts;
      if (isStart(r)) v.starts++;
      if (r.pos === 1) v.wins++;
      if (r.pos !== null && r.pos <= 3) v.podiums++;
      if (r.pos !== null) v.places.push(r.pos);
      v.trace[i] = v.points;
      per.set(r.d, v);
    }
    for (const s of race.sprint) {
      const v = per.get(s.d);
      if (v) v.actual += s.pts;
    }
  });
  const countback = (a, b) => {
    for (let p = 1; p <= 40; p++) {
      const d = b.places.filter((x) => x === p).length - a.places.filter((x) => x === p).length;
      if (d) return d;
    }
    return 0;
  };
  const list = [...per.values()].map((v) => ({ ...v, actual: round2(v.actual) }));
  list.sort((a, b) => b.points - a.points || countback(a, b));
  list.forEach((v, i) => (v.rank = i + 1));
  // Fill gaps so each trace is cumulative across the season even through missed rounds.
  for (const v of list) {
    let run = 0;
    v.trace = v.trace.map((x) => (x === null ? run : (run = x)));
  }
  return { season, races: races.length, list };
}

/** Champion vs runner-up under the modern points system for every season. */
export function normalisedChampions(archive, champions = new Map(), system = MODERN_POINTS) {
  return archive.seasons.map((season) => {
    const { list, races } = rescoreSeason(archive, season, system);
    const officialId = champions.get(season);
    const official = officialId !== undefined ? archive.driverIndex.get(officialId) : undefined;
    const champ = list.find((v) => v.idx === official) || list[0];
    const rival = list.find((v) => v.idx !== champ?.idx);
    return {
      season, races, complete: official !== undefined, champion: champ?.idx ?? -1, rescoredLeader: list[0]?.idx ?? -1,
      points: champ?.points || 0, perStart: champ?.starts ? champ.points / champ.starts : 0,
      margin: champ && rival ? champ.points - rival.points : 0, maxShare: champ && races ? champ.points / (races * system[0]) : 0,
    };
  });
}

/** Cumulative points over a driver's first `n` starts (raw = official race + sprint points; normalised = modern system). */
export function firstRaces(archive, driverIdx, n = 20, normalised = false) {
  const out = [];
  let sum = 0;
  for (const race of archive.races) {
    const r = race.results.find((x) => x.d === driverIdx);
    if (!r || !isStart(r)) continue;
    const sprint = race.sprint.filter((s) => s.d === driverIdx).reduce((a, s) => a + s.pts, 0);
    sum += normalised ? modernPoints(r.pos) : r.pts + sprint;
    out.push({ race, pos: r.pos, cumulative: round2(sum) });
    if (out.length >= n) break;
  }
  return out;
}

/* ───────────────────────── Careers, debuts, rookies ───────────────────────── */

const careerCache = new WeakMap();
/** Per driver: first/last start, starts, wins, podiums, seasons. Cached per archive. */
export function careers(archive) {
  if (careerCache.has(archive)) return careerCache.get(archive);
  const list = archive.drivers.map((_, idx) => ({ idx, first: null, last: null, starts: 0, wins: 0, podiums: 0, seasons: [] }));
  for (const race of archive.races)
    for (const r of race.results) {
      if (!isStart(r)) continue;
      const c = list[r.d];
      c.first ??= race;
      c.last = race;
      c.starts++;
      if (r.pos === 1) c.wins++;
      if (r.pos !== null && r.pos <= 3) c.podiums++;
      if (c.seasons.at(-1) !== race.season) c.seasons.push(race.season);
    }
  careerCache.set(archive, list);
  return list;
}

const md = (date) => date.slice(5, 10);
/** Races held, debuts made and drivers born on a month-day ("MM-DD"). */
export function onThisDay(archive, monthDay) {
  const races = archive.races.filter((r) => md(r.date) === monthDay);
  const cs = careers(archive);
  const debuts = cs.filter((c) => c.first && md(c.first.date) === monthDay).map((c) => ({ ...c, row: c.first.results.find((r) => r.d === c.idx) }));
  const birthdays = archive.drivers
    .map((d, idx) => ({ idx, driver: d, career: cs[idx] }))
    .filter((x) => x.driver.dob && md(x.driver.dob) === monthDay && x.career.starts > 0);
  return { races, debuts, birthdays };
}

/**
 * Every driver's first season with a start: their results that year and how they compared with
 * the team-mates they shared a garage with (races where both started).
 */
export function rookieSeasons(archive) {
  const cs = careers(archive);
  const bySeason = new Map();
  for (const race of archive.races) (bySeason.get(race.season) || bySeason.set(race.season, []).get(race.season)).push(race);
  return cs.filter((c) => c.first).map((c) => {
    const season = c.first.season;
    const v = { idx: c.idx, season, starts: 0, points: 0, wins: 0, podiums: 0, poles: 0, best: null, teams: new Map(), mates: new Map(), ahead: 0, behind: 0, careerStarts: c.starts, careerWins: c.wins };
    for (const race of bySeason.get(season)) {
      const me = race.results.find((r) => r.d === c.idx);
      v.points += race.sprint.filter((s) => s.d === c.idx).reduce((a, s) => a + s.pts, 0);
      if (!me) continue;
      v.points += me.pts;
      if (!isStart(me)) continue;
      v.starts++;
      v.teams.set(me.c, (v.teams.get(me.c) || 0) + 1);
      if (me.pos !== null) {
        if (v.best === null || me.pos < v.best) v.best = me.pos;
        if (me.pos === 1) v.wins++;
        if (me.pos <= 3) v.podiums++;
      }
      const pole = poleOf(race);
      if (pole?.d === c.idx) v.poles++;
      for (const m of race.results) {
        if (m.d === c.idx || m.c !== me.c || !isStart(m)) continue;
        const mate = v.mates.get(m.d) || { idx: m.d, races: 0, ahead: 0, behind: 0 };
        mate.races++;
        const cmp = compareRows(me, m);
        if (cmp < 0) { mate.ahead++; v.ahead++; } else if (cmp > 0) { mate.behind++; v.behind++; }
        v.mates.set(m.d, mate);
      }
    }
    const team = [...v.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    const mates = [...v.mates.values()].sort((a, b) => b.races - a.races);
    return { ...v, points: round2(v.points), team, mates, teams: [...v.teams.keys()] };
  });
}

/* ───────────────────────── Rivalries ───────────────────────── */

/**
 * Who finished ahead: both classified → better position; only one classified → that driver;
 * neither classified → nobody (counted separately). Returns <0 when `a` was ahead.
 */
export function compareRows(a, b) {
  if (a.pos !== null && b.pos !== null) return a.pos - b.pos;
  if (a.pos !== null) return -1;
  if (b.pos !== null) return 1;
  return 0;
}

export function rivalry(archive, aIdx, bIdx) {
  const races = [];
  for (const race of archive.races) {
    const ra = race.results.find((r) => r.d === aIdx), rb = race.results.find((r) => r.d === bIdx);
    if (!ra || !rb || !isStart(ra) || !isStart(rb)) continue;
    const cmp = compareRows(ra, rb);
    const kind = ra.pos !== null && rb.pos !== null ? "both" : ra.pos !== null ? "bOut" : rb.pos !== null ? "aOut" : "bothOut";
    const gapMs = ra.ms && rb.ms ? Math.abs(ra.ms - rb.ms) : null;
    races.push({ race, a: ra, b: rb, ahead: cmp < 0 ? "a" : cmp > 0 ? "b" : null, kind, sameTeam: ra.c === rb.c, gapMs });
  }
  const totals = { races: races.length, a: 0, b: 0, both: { a: 0, b: 0 }, oneOut: { a: 0, b: 0 }, bothOut: 0, sameTeam: { races: 0, a: 0, b: 0 } };
  const seasons = new Map();
  for (const x of races) {
    const s = seasons.get(x.race.season) || { season: x.race.season, races: 0, a: 0, b: 0, sameTeam: 0, aPoints: 0, bPoints: 0 };
    s.races++;
    s.aPoints += x.a.pts;
    s.bPoints += x.b.pts;
    if (x.sameTeam) { s.sameTeam++; totals.sameTeam.races++; }
    if (x.ahead) {
      totals[x.ahead]++;
      s[x.ahead]++;
      if (x.sameTeam) totals.sameTeam[x.ahead]++;
      if (x.kind === "both") totals.both[x.ahead]++;
      else totals.oneOut[x.ahead]++;
    } else totals.bothOut++;
    seasons.set(x.race.season, s);
  }
  // Contiguous spells as team-mates.
  const spells = [];
  for (const x of races) {
    if (!x.sameTeam) continue;
    const last = spells.at(-1);
    if (last && last.team === x.a.c && last.endIndex === races.indexOf(x) - 1) { last.to = x.race.season; last.races++; last.endIndex++; last.end = x.race; }
    else spells.push({ team: x.a.c, from: x.race.season, to: x.race.season, races: 1, endIndex: races.indexOf(x), start: x.race, end: x.race });
  }
  const closest = races
    .filter((x) => x.kind === "both")
    .map((x) => ({ ...x, places: Math.abs(x.a.pos - x.b.pos) }))
    .sort((p, q) => (p.gapMs ?? Infinity) - (q.gapMs ?? Infinity) || p.places - q.places || q.race.season - p.race.season)
    .slice(0, 10);
  return { races, totals, seasons: [...seasons.values()].map((s) => ({ ...s, aPoints: round2(s.aPoints), bPoints: round2(s.bPoints) })), spells, closest };
}

/* ───────────────────────── Lineage ───────────────────────── */

/**
 * Per-season wins, race points (race + sprint) and races entered for a lineage — a list of
 * { constructorId, from, to } spans (the same id can mean different teams in different eras).
 */
export function lineageSeasons(archive, spans) {
  const out = new Map();
  for (const race of archive.races) {
    const won = new Set();
    for (const r of [...race.results, ...race.sprint]) {
      const id = archive.teams[r.c]?.id;
      const span = spans.find((s) => s.constructorId === id && inRange(race.season, s.from, s.to ?? 9999));
      if (!span) continue;
      const v = out.get(race.season) || { season: race.season, constructorId: id, wins: 0, points: 0, races: new Set(), podiums: 0 };
      v.constructorId = id;
      v.points += r.pts;
      if ("grid" in r) {
        v.races.add(race.round);
        if (r.pos === 1 && !won.has(id)) { v.wins++; won.add(id); }
        if (r.pos !== null && r.pos <= 3) v.podiums++;
      }
      out.set(race.season, v);
    }
  }
  return [...out.values()].map((v) => ({ ...v, points: round2(v.points), races: v.races.size })).sort((a, b) => a.season - b.season);
}

/** Which seasons a constructor id actually raced inside a span (to show only ids present in the data). */
export function constructorSeasons(archive, constructorId, from = 0, to = 9999) {
  const idx = archive.teamIndex.get(constructorId);
  if (idx === undefined) return [];
  const seen = new Set();
  for (const race of archive.races) if (inRange(race.season, from, to) && race.results.some((r) => r.c === idx)) seen.add(race.season);
  return [...seen].sort((a, b) => a - b);
}
