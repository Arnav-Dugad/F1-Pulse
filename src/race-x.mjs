/**
 * Pure analysis helpers for the race-weekend deep dives and the Weather Impact lab:
 *   1 · qualifying lap overlay (sector marks, slowest-corner minimum speeds)
 *   2 · pit-stop strategy explorer (undercut / overcut outcomes, pit-lane loss)
 *   3 · wet vs dry performance (modelled race-window rainfall, OpenF1 rainfall flags)
 * No DOM, no fetching — deterministic and unit-tested in tests/race-x.test.mjs.
 */
import { cornerMetrics, detectCorners, interpAt, medianOf, mergeCorners } from "./lab.mjs";

/* ───────────────────────── 1 · Qualifying lap overlay ───────────────────────── */

/**
 * Estimated distance of the sector boundaries on one lap. rows: [{ t (s from lap start), d }]
 * sorted by t; s1/s2: measured sector durations. Returns up to two distances.
 */
export function sectorMarks(rows, s1, s2) {
  const out = [];
  if (!Number.isFinite(s1)) return out;
  const pts = rows.filter((r) => Number.isFinite(r.t) && Number.isFinite(r.d));
  for (const t of [s1, Number.isFinite(s2) ? s1 + s2 : null]) {
    if (t === null) continue;
    const d = interpAt(pts, "t", "d", t);
    if (d !== null) out.push(d);
  }
  return out;
}

/**
 * Minimum-speed comparison at the slowest corners of two laps on estimated distance.
 * rows: [{ d, speed, brake }] sorted by d. Corners come from the Lab's automated braking-zone
 * detector; the `limit` slowest (by the lower of the two minimum speeds) are returned in lap order.
 */
export function slowestCorners(rowsA, rowsB, limit = 5) {
  const ok = (r) => r.filter((x) => Number.isFinite(x.d) && Number.isFinite(x.speed));
  const a = ok(rowsA), b = ok(rowsB);
  if (a.length < 10 || b.length < 10) return [];
  const merged = mergeCorners(detectCorners(a), detectCorners(b));
  const rows = merged.map((c, i, list) => {
    const prev = list[i - 1]?.apex, next = list[i + 1]?.apex;
    const from = prev === undefined ? -Infinity : prev + 40, to = next === undefined ? Infinity : next - 40;
    const ma = cornerMetrics(a, c.apex, { from, to }), mb = cornerMetrics(b, c.apex, { from, to });
    return { n: c.n, apex: c.apex, a: ma.minSpeed, b: mb.minSpeed, diff: ma.minSpeed !== null && mb.minSpeed !== null ? ma.minSpeed - mb.minSpeed : null };
  }).filter((c) => c.a !== null && c.b !== null);
  return rows
    .sort((x, y) => Math.min(x.a, x.b) - Math.min(y.a, y.b))
    .slice(0, limit)
    .sort((x, y) => x.apex - y.apex);
}

/* ───────────────────────── 2 · Pit-stop strategy explorer ───────────────────────── */

/**
 * Line-crossing time (ms) at the end of every lap, per driver: the start of the next lap, or
 * start + duration for a driver's last lap. Map<driver, Map<lap, ms>>.
 */
export function crossingTimes(laps) {
  const by = new Map();
  for (const l of laps || []) {
    if (!l || !Number.isFinite(l.driver_number) || !Number.isFinite(l.lap_number)) continue;
    const m = by.get(l.driver_number) || new Map();
    m.set(l.lap_number, l);
    by.set(l.driver_number, m);
  }
  const out = new Map();
  for (const [n, m] of by) {
    const ends = new Map();
    for (const [lap, l] of m) {
      const next = m.get(lap + 1);
      const ns = next?.date_start ? Date.parse(next.date_start) : NaN;
      const s = l.date_start ? Date.parse(l.date_start) : NaN;
      const end = Number.isFinite(ns) ? ns : Number.isFinite(s) && Number.isFinite(l.lap_duration) && l.lap_duration > 0 ? s + l.lap_duration * 1000 : NaN;
      if (Number.isFinite(end)) ends.set(lap, end);
    }
    out.set(n, ends);
  }
  return out;
}

/** Running order at the end of `lap`: drivers that completed it, ranked by crossing time. Map<driver, position>. */
export function orderAt(cross, lap) {
  const list = [];
  for (const [n, ends] of cross) if (ends.has(lap)) list.push([n, ends.get(lap)]);
  list.sort((x, y) => x[1] - y[1]);
  return new Map(list.map(([n], i) => [n, i + 1]));
}

const laneTime = (p) => {
  const v = Number.isFinite(p?.lane_duration) ? p.lane_duration : p?.pit_duration;
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Pit stops per driver, sorted, de-duplicated; formation-lap entries without a duration are dropped. */
export function stopsByDriver(pits) {
  const by = new Map();
  for (const p of pits || []) {
    if (!p || !Number.isFinite(p.driver_number) || !Number.isFinite(p.lap_number)) continue;
    if (p.lap_number <= 1 && laneTime(p) === null) continue;
    const list = by.get(p.driver_number) || [];
    if (!list.some((x) => x.lap === p.lap_number)) list.push({ lap: p.lap_number, lane: laneTime(p), stop: Number.isFinite(p.stop_duration) ? p.stop_duration : null, date: p.date || null });
    by.set(p.driver_number, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.lap - b.lap);
  return by;
}

/** True when a lap falls inside a lap-based neutralisation window [{ start, end }]. */
export const neutralLap = (windows, lap) => (windows || []).some((w) => lap >= w.start && lap <= w.end);

export const BATTLE_RULES = { window: 3, maxLapsApart: 5 };

/**
 * Undercut / overcut outcomes for pairs of cars running close together before the first of them
 * pits. Heuristic (all thresholds exposed in BATTLE_RULES and the UI copy):
 *  - "before" = end of the lap before the first car's in-lap; the two cars must be within
 *    `window` seconds on the road (line-crossing times) at that point;
 *  - the second car must make its next stop 1..`maxLapsApart` laps later (same-lap stops are not
 *    an undercut), and the first car must not stop again before the comparison;
 *  - "after" = end of the second car's out-lap;
 *  - first stopper behind before → undercut (worked if ahead after); first stopper ahead before →
 *    the car behind stayed out, i.e. an overcut attempt (worked if it is ahead after);
 *  - stops with an in- or out-lap under SC / VSC / red flag are kept but marked `neutralised` and
 *    are not counted as strategy calls.
 * gap values are seconds, positive = the first stopper is behind.
 */
export function pitBattles({ laps, pits, neutral = [], window = BATTLE_RULES.window, maxLapsApart = BATTLE_RULES.maxLapsApart }) {
  const cross = crossingTimes(laps);
  const stops = stopsByDriver(pits);
  const orders = new Map();
  const order = (lap) => orders.get(lap) || orders.set(lap, orderAt(cross, lap)).get(lap);
  const out = [];
  for (const [a, listA] of stops) {
    listA.forEach((sa, ia) => {
      const L0 = sa.lap - 1;
      if (L0 < 1) return;
      const tA0 = cross.get(a)?.get(L0);
      if (tA0 === undefined) return;
      for (const [b, listB] of stops) {
        if (b === a) continue;
        const sb = listB.find((s) => s.lap >= sa.lap);
        if (!sb || sb.lap === sa.lap || sb.lap - sa.lap > maxLapsApart) continue;
        // The second car must not have stopped inside the comparison window already.
        if (listB.some((s) => s.lap > L0 && s.lap < sb.lap)) continue;
        const tB0 = cross.get(b)?.get(L0);
        if (tB0 === undefined) continue;
        const before = (tA0 - tB0) / 1000;
        if (Math.abs(before) > window) continue;
        const nextA = listA[ia + 1];
        const Le = sb.lap + 1;
        if (nextA && nextA.lap <= Le) continue;
        const tA1 = cross.get(a)?.get(Le), tB1 = cross.get(b)?.get(Le);
        if (tA1 === undefined || tB1 === undefined) continue;
        const after = (tA1 - tB1) / 1000;
        const kind = before > 0 ? "undercut" : "overcut";
        const worked = kind === "undercut" ? after < 0 : after > 0;
        const isNeutral = [sa.lap, sa.lap + 1, sb.lap, sb.lap + 1].some((l) => neutralLap(neutral, l));
        out.push({
          first: a, second: b, firstLap: sa.lap, secondLap: sb.lap, lapsApart: sb.lap - sa.lap,
          before, after, swing: before - after,
          posBefore: [order(L0).get(a) ?? null, order(L0).get(b) ?? null],
          posAfter: [order(Le).get(a) ?? null, order(Le).get(b) ?? null],
          lane: [sa.lane, sb.lane],
          kind, worked, neutralised: isNeutral,
          outcome: isNeutral ? "neutralised" : `${kind}-${worked ? "worked" : "failed"}`,
          // The car whose call it was: the first stopper for an undercut, the car that stayed out for an overcut.
          caller: kind === "undercut" ? a : b,
          /** Seconds gained on the rival by the calling car (positive = gained). */
          gain: kind === "undercut" ? before - after : after - before,
        });
      }
    });
  }
  return out.sort((x, y) => x.firstLap - y.firstLap || x.first - y.first);
}

/** Counts per outcome plus success rates over green-flag battles. */
export function battleSummary(battles) {
  const s = { total: battles.length, green: 0, neutralised: 0, undercut: { tries: 0, worked: 0 }, overcut: { tries: 0, worked: 0 } };
  for (const b of battles) {
    if (b.neutralised) { s.neutralised++; continue; }
    s.green++;
    s[b.kind].tries++;
    if (b.worked) s[b.kind].worked++;
  }
  return s;
}

/**
 * Pit-lane time and estimated time loss at this track. For every green-flag stop:
 *   loss = in-lap + out-lap − 2 × the driver's median green lap,
 * where green laps exclude lap 1, in/out laps, laps in neutralisation windows and the lap after
 * them, and laps slower than 107% of the driver's median. Returns medians across stops; pit-lane
 * times over 45 s (repairs, penalties, red-flag stops) are left out of the pit-lane median.
 */
export function pitLoss({ laps, pits, neutral = [] }) {
  const stops = stopsByDriver(pits);
  const by = new Map();
  for (const l of laps || []) {
    if (!l || !Number.isFinite(l.driver_number)) continue;
    (by.get(l.driver_number) || by.set(l.driver_number, new Map()).get(l.driver_number)).set(l.lap_number, l);
  }
  const perStop = [];
  const lanes = [];
  const greenAll = [];
  for (const [n, m] of by) {
    const stopLaps = new Set((stops.get(n) || []).flatMap((s) => [s.lap, s.lap + 1]));
    const green = [...m.values()]
      .filter((l) => l.lap_number > 1 && !l.is_pit_out_lap && !stopLaps.has(l.lap_number) && !neutralLap(neutral, l.lap_number) && !neutralLap(neutral, l.lap_number - 1) && Number.isFinite(l.lap_duration) && l.lap_duration > 0)
      .map((l) => l.lap_duration);
    const med0 = medianOf(green);
    const clean = med0 === null ? [] : green.filter((t) => t <= med0 * 1.07);
    const med = medianOf(clean);
    greenAll.push(...clean);
    for (const s of stops.get(n) || []) {
      if (neutralLap(neutral, s.lap) || neutralLap(neutral, s.lap + 1)) continue;
      // Pit-lane times over 45 s are repairs, penalties or red-flag stops, not a normal stop.
      if (s.lane !== null && s.lane <= 45) lanes.push(s.lane);
      const inLap = m.get(s.lap)?.lap_duration, outLap = m.get(s.lap + 1)?.lap_duration;
      if (med === null || !Number.isFinite(inLap) || !Number.isFinite(outLap)) continue;
      const loss = inLap + outLap - 2 * med;
      // Discard implausible values (repairs, penalties served, red-flag stops).
      if (loss > 5 && loss < 60) perStop.push({ driver: n, lap: s.lap, loss, lane: s.lane });
    }
  }
  return {
    lane: medianOf(lanes),
    loss: medianOf(perStop.map((s) => s.loss)),
    greenLap: medianOf(greenAll),
    n: perStop.length,
    lanes: lanes.length,
    perStop,
  };
}

/* ───────────────────────── 3 · Wet vs dry ───────────────────────── */

/** Modelled rainfall thresholds (mm over the race window plus half of the two hours before it). */
export const WET_THRESHOLDS = [0.5, 1, 2];
export const DEFAULT_WET_MM = 1;

/**
 * Wetness score of one race from the wet-races snapshot row
 * [season, round, raceMm, preMm, dayMm, peakMm, timed, airC]: rain in the race window plus half
 * of the rain in the two hours before lights out (a track that was soaked just before the start
 * races wet for a while).
 */
export const wetScore = (row) => (row ? (row[2] || 0) + 0.5 * (row[3] || 0) : 0);

/** Points on the 2010+ scale (25-18-15-12-10-8-6-4-2-1) for a finishing position; 0 otherwise. */
const MODERN = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const modernPts = (pos) => (Number.isInteger(pos) && pos >= 1 && pos <= 10 ? MODERN[pos - 1] : 0);

/**
 * Wet vs dry comparison per driver or team.
 * races: [{ wet: boolean, results: [{ d, c, pos (null when not classified), grid, start: boolean }] }].
 * Points use the 2010+ scale so eras are comparable; positions gained use classified finishers
 * with a grid slot. Returns rows with wet/dry aggregates and `uplift` = wet − dry points per start.
 */
export function wetDryTable(races, { by = "driver", minWet = 3, minDry = 10 } = {}) {
  const acc = new Map();
  const blank = () => ({ starts: 0, finishes: 0, posSum: 0, pts: 0, wins: 0, podiums: 0, gained: 0, gainedN: 0 });
  for (const race of races || []) {
    const seen = new Set();
    for (const r of race.results || []) {
      if (!r.start) continue;
      const id = by === "team" ? r.c : r.d;
      if (by === "team") {
        // Each team counts once per race (its best-placed car) so two-car and one-car entries compare.
        if (seen.has(id)) continue;
        seen.add(id);
      }
      const row = acc.get(id) || acc.set(id, { id, wet: blank(), dry: blank() }).get(id);
      const t = race.wet ? row.wet : row.dry;
      t.starts++;
      if (r.pos !== null && r.pos !== undefined) {
        t.finishes++;
        t.posSum += r.pos;
        t.pts += modernPts(r.pos);
        if (r.pos === 1) t.wins++;
        if (r.pos <= 3) t.podiums++;
        if (r.grid > 0) { t.gained += r.grid - r.pos; t.gainedN++; }
      }
    }
  }
  const view = (t) => ({
    ...t,
    avgFinish: t.finishes ? t.posSum / t.finishes : null,
    ptsPerStart: t.starts ? t.pts / t.starts : null,
    finishRate: t.starts ? t.finishes / t.starts : null,
    avgGained: t.gainedN ? t.gained / t.gainedN : null,
  });
  return [...acc.values()]
    .filter((r) => r.wet.starts >= minWet && r.dry.starts >= minDry)
    .map((r) => {
      const wet = view(r.wet), dry = view(r.dry);
      return {
        id: r.id, wet, dry,
        uplift: wet.ptsPerStart - dry.ptsPerStart,
        finishDelta: wet.avgFinish !== null && dry.avgFinish !== null ? dry.avgFinish - wet.avgFinish : null,
      };
    })
    .sort((x, y) => y.uplift - x.uplift);
}

/**
 * Team-mate-relative wet skill: in races where two team-mates both started, the share of
 * head-to-heads won in the wet minus the share in the dry (classified ahead, or classified while
 * the team-mate was not). Returns Map<driver, { wet: {won, n}, dry: {won, n}, delta }>.
 */
export function teammateWetEdge(races) {
  const acc = new Map();
  const get = (d) => acc.get(d) || acc.set(d, { wet: { won: 0, n: 0 }, dry: { won: 0, n: 0 } }).get(d);
  for (const race of races || []) {
    const byTeam = new Map();
    for (const r of race.results || []) if (r.start) (byTeam.get(r.c) || byTeam.set(r.c, []).get(r.c)).push(r);
    for (const list of byTeam.values()) {
      if (list.length !== 2) continue;
      const [x, y] = list;
      const ahead = x.pos !== null && (y.pos === null || x.pos < y.pos) ? x : y.pos !== null && (x.pos === null || y.pos < x.pos) ? y : null;
      if (!ahead) continue;
      for (const r of list) {
        const t = race.wet ? get(r.d).wet : get(r.d).dry;
        t.n++;
        if (r === ahead) t.won++;
      }
    }
  }
  for (const v of acc.values()) v.delta = v.wet.n && v.dry.n ? v.wet.won / v.wet.n - v.dry.won / v.dry.n : null;
  return acc;
}

/**
 * Rainfall summary of one OpenF1 session from its `weather` samples (≈ one per minute):
 * share of samples with the rainfall flag set, and median / range of track temperature.
 * A session counts as measured-wet when at least `minShare` of samples report rain.
 */
export function sessionRain(samples, minShare = 0.1) {
  const rows = (samples || []).filter((s) => s && s.date);
  const rain = rows.filter((s) => Number(s.rainfall) > 0).length;
  const track = rows.map((s) => s.track_temperature).filter((v) => Number.isFinite(v));
  const air = rows.map((s) => s.air_temperature).filter((v) => Number.isFinite(v));
  const share = rows.length ? rain / rows.length : 0;
  return {
    samples: rows.length,
    rainSamples: rain,
    share,
    wet: rows.length > 0 && share >= minShare,
    track: { median: medianOf(track), min: track.length ? Math.min(...track) : null, max: track.length ? Math.max(...track) : null },
    air: medianOf(air),
  };
}

/**
 * Wet-session pace: each driver's median clean lap against the best median in the session, in %.
 * laps: OpenF1 laps; excludes lap 1, pit in/out laps (from `pits`), laps over 130% of the
 * session's fastest lap (safety car, incidents) and drivers with fewer than `minLaps` such laps.
 */
export function sessionPace(laps, pits = [], minLaps = 5) {
  const stops = stopsByDriver(pits);
  const valid = (laps || []).filter((l) => l && Number.isFinite(l.lap_duration) && l.lap_duration > 0 && l.lap_number > 1 && !l.is_pit_out_lap);
  const best = Math.min(...valid.map((l) => l.lap_duration));
  if (!Number.isFinite(best)) return [];
  const by = new Map();
  for (const l of valid) {
    if (l.lap_duration > best * 1.3) continue;
    if ((stops.get(l.driver_number) || []).some((s) => s.lap === l.lap_number)) continue;
    (by.get(l.driver_number) || by.set(l.driver_number, []).get(l.driver_number)).push(l.lap_duration);
  }
  const rows = [...by.entries()].filter(([, t]) => t.length >= minLaps).map(([driver, t]) => ({ driver, laps: t.length, median: medianOf(t) }));
  const top = Math.min(...rows.map((r) => r.median));
  return rows.map((r) => ({ ...r, gapPct: ((r.median - top) / top) * 100 })).sort((x, y) => x.median - y.median);
}
