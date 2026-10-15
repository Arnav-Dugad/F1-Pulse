/**
 * Pure analysis helpers for the Lab pages (Telemetry, Strategy, Replay).
 * No DOM, no fetching — everything here is deterministic and unit-tested in tests/lab.test.mjs.
 */

/* ───────────────────────── Generic numeric helpers ───────────────────────── */

const finiteNums = (values) => values.filter((v) => typeof v === "number" && Number.isFinite(v));

export function medianOf(values) {
  const x = finiteNums(values).sort((a, b) => a - b);
  if (!x.length) return null;
  return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
}

/** Median absolute deviation (unscaled). */
export function mad(values) {
  const m = medianOf(values);
  if (m === null) return null;
  return medianOf(finiteNums(values).map((v) => Math.abs(v - m)));
}

/** Linear interpolation of `field` at `x` on rows sorted by `key`; null outside the range. */
export function interpAt(rows, key, field, x) {
  if (!rows.length || !(x >= rows[0][key]) || !(x <= rows[rows.length - 1][key])) return null;
  let lo = 0, hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][key] < x) lo = mid + 1;
    else hi = mid;
  }
  const b = rows[lo], a = rows[Math.max(0, lo - 1)];
  if (b[key] === a[key]) return b[field];
  return a[field] + ((b[field] - a[field]) * (x - a[key])) / (b[key] - a[key]);
}

/* ───────────────────────── 1 · Mini-sectors ───────────────────────── */

/**
 * OpenF1 `laps.segments_sector_N` status codes (as documented by OpenF1 and observed in
 * archived 2023–2025 sessions; e.g. Monza 2024 race: 2048, 2049, 2051, 2064 and null occur).
 *   2048 → yellow  (segment completed, no personal improvement)
 *   2049 → green   (personal best in the session)
 *   2051 → purple  (overall best in the session)
 *   2064 → pit     (car in the pit lane)
 *   0 / null → not available
 * Anything else (2050, 2052, 2068 are listed by OpenF1 with unknown meaning) → "unknown".
 */
export const SEGMENT_CODES = { 2048: "yellow", 2049: "green", 2051: "purple", 2064: "pit" };

export function segmentStatus(code) {
  if (code === null || code === undefined || code === 0) return "none";
  return SEGMENT_CODES[code] || "unknown";
}

/** The three sectors' segment statuses for one lap ([] when the provider sent none). */
export function lapSegments(lap) {
  return [1, 2, 3].map((n) => {
    const raw = lap?.[`segments_sector_${n}`];
    return Array.isArray(raw) ? raw.map(segmentStatus) : [];
  });
}

export function segmentSummary(lap) {
  const out = { purple: 0, green: 0, yellow: 0, pit: 0, none: 0, unknown: 0, total: 0 };
  for (const sector of lapSegments(lap)) for (const s of sector) { out[s]++; out.total++; }
  return out;
}

/** Cumulative straight-line path length along points [{x, y}]. */
export function pathLengths(points) {
  const cum = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++)
    cum[i] = cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return cum;
}

/**
 * Approximate placement of mini-sectors on a lap's location trace.
 * points: [{t (s from lap start), x, y}] sorted by t. sectors: [s1, s2, s3] durations (or nulls).
 * counts: segments per sector. Sector boundaries come from the measured sector times (time → path
 * position); inside each sector the segments are spread in equal path-length slices — real timing
 * loops are not equally spaced, so this is a proportional approximation.
 * Returns [{ sector (1-3), index, f0, f1 }] as fractions of the total path length.
 */
export function mapSegments(points, sectors, counts) {
  if (points.length < 2) return [];
  const cum = pathLengths(points);
  const total = cum[cum.length - 1] || 1;
  const rows = points.map((p, i) => ({ t: p.t, c: cum[i] }));
  const fracAt = (t) => {
    const c = interpAt(rows, "t", "c", t);
    return c === null ? null : c / total;
  };
  let bounds = [0, 1 / 3, 2 / 3, 1];
  const [s1, s2] = sectors || [];
  if (Number.isFinite(s1) && Number.isFinite(s2)) {
    const b1 = fracAt(s1), b2 = fracAt(s1 + s2);
    if (b1 !== null && b2 !== null && b1 > 0 && b2 > b1 && b2 < 1) bounds = [0, b1, b2, 1];
  }
  const out = [];
  for (let s = 0; s < 3; s++) {
    const n = counts[s] || 0;
    for (let k = 0; k < n; k++) {
      const span = bounds[s + 1] - bounds[s];
      out.push({ sector: s + 1, index: k, f0: bounds[s] + (span * k) / n, f1: bounds[s] + (span * (k + 1)) / n });
    }
  }
  return out;
}

/** Points of the path between fractions f0..f1 of its total length (endpoints interpolated). */
export function slicePath(points, cum, f0, f1) {
  if (points.length < 2) return [];
  const total = cum[cum.length - 1] || 1;
  const a = f0 * total, b = f1 * total;
  const at = (c) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < c) i++;
    const r = cum[i] === cum[i - 1] ? 0 : (c - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * r, y: points[i - 1].y + (points[i].y - points[i - 1].y) * r };
  };
  const out = [at(a)];
  for (let i = 0; i < points.length; i++) if (cum[i] > a && cum[i] < b) out.push({ x: points[i].x, y: points[i].y });
  out.push(at(b));
  return out;
}

/* ───────────────────────── 2 · Corner detection ───────────────────────── */

/**
 * Automated braking-zone detection on a speed trace against estimated distance.
 * rows: [{ d, speed, brake }] sorted by d. A corner is a local speed minimum that is the lowest
 * point within ±mergeDist, sits at least `minDrop` km/h below the preceding peak and has the brake
 * applied somewhere between that peak and the minimum.
 * Returns [{ apex, minSpeed, peak, peakD, brakeD }] in lap order.
 */
export function detectCorners(rows, { minDrop = 25, mergeDist = 150, lookback = 900, smooth = 2 } = {}) {
  const n = rows.length;
  if (n < 5) return [];
  const s = rows.map((_, i) => {
    let sum = 0, k = 0;
    for (let j = Math.max(0, i - smooth); j <= Math.min(n - 1, i + smooth); j++) { sum += rows[j].speed; k++; }
    return sum / k;
  });
  const out = [];
  let lastApexIdx = 0;
  for (let i = 1; i < n - 1; i++) {
    if (!(s[i] <= s[i - 1] && s[i] < s[i + 1])) continue;
    const d = rows[i].d;
    let lowest = true;
    for (let j = i - 1; j >= 0 && rows[j].d >= d - mergeDist; j--) if (s[j] < s[i]) { lowest = false; break; }
    if (lowest) for (let j = i + 1; j < n && rows[j].d <= d + mergeDist; j++) if (s[j] < s[i]) { lowest = false; break; }
    if (!lowest) continue;
    let peakIdx = i;
    for (let j = i - 1; j >= lastApexIdx && rows[j].d >= d - lookback; j--) if (s[j] > s[peakIdx]) peakIdx = j;
    const drop = s[peakIdx] - s[i];
    if (drop < minDrop) continue;
    let brakeIdx = -1;
    for (let j = peakIdx; j <= i; j++) if (rows[j].brake > 0) { brakeIdx = j; break; }
    if (brakeIdx < 0) continue;
    let minSpeed = rows[i].speed;
    for (let j = Math.max(0, i - smooth); j <= Math.min(n - 1, i + smooth); j++) minSpeed = Math.min(minSpeed, rows[j].speed);
    out.push({ apex: d, minSpeed, peak: rows[peakIdx].speed, peakD: rows[peakIdx].d, brakeD: rows[brakeIdx].d });
    lastApexIdx = i;
  }
  return out;
}

/** Merge two drivers' corner lists into one set of shared apexes (mean position when matched). */
export function mergeCorners(a, b, dist = 150) {
  const all = [...a.map((c) => ({ ...c, who: 0 })), ...b.map((c) => ({ ...c, who: 1 }))].sort((x, y) => x.apex - y.apex);
  const groups = [];
  for (const c of all) {
    const g = groups[groups.length - 1];
    if (g && c.apex - g.items[g.items.length - 1].apex <= dist && !g.items.some((x) => x.who === c.who)) g.items.push(c);
    else groups.push({ items: [c] });
  }
  return groups.map((g, i) => ({
    n: i + 1,
    apex: g.items.reduce((s, c) => s + c.apex, 0) / g.items.length,
    seenBy: g.items.length === 2 ? "both" : g.items[0].who === 0 ? "a" : "b",
  }));
}

/**
 * One driver's metrics around a shared apex. `from`/`to` bound the search (previous/next apex).
 * Returns { minSpeed, minD, brakeD, exitSpeed } (nulls when the trace doesn't cover it).
 */
export function cornerMetrics(rows, apex, { search = 120, exit = 100, from = -Infinity, to = Infinity, approach = 600 } = {}) {
  let minIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i].d;
    if (d < apex - search || d > apex + search || d <= from || d >= to) continue;
    if (minIdx < 0 || rows[i].speed < rows[minIdx].speed) minIdx = i;
  }
  if (minIdx < 0) return { minSpeed: null, minD: null, brakeD: null, exitSpeed: null };
  const minD = rows[minIdx].d;
  // Walk back from the minimum to the start of the last continuous brake application.
  let brakeD = null;
  let j = minIdx;
  while (j >= 0 && rows[j].brake <= 0 && rows[j].d > minD - approach && rows[j].d > from) j--;
  if (j >= 0 && rows[j].brake > 0) {
    while (j > 0 && rows[j - 1].brake > 0 && rows[j - 1].d > minD - approach && rows[j - 1].d > from) j--;
    brakeD = rows[j].d;
  }
  return { minSpeed: rows[minIdx].speed, minD, brakeD, exitSpeed: interpAt(rows, "d", "speed", apex + exit) };
}

/** Change in an estimated delta curve [{distance, delta}] between two distances. */
export function windowDelta(delta, d0, d1) {
  const pts = delta.filter((p) => Number.isFinite(p.delta));
  const a = interpAt(pts, "distance", "delta", d0), b = interpAt(pts, "distance", "delta", d1);
  return a === null || b === null ? null : b - a;
}

/* ───────────────────────── 3 · Tyre degradation from real laps ───────────────────────── */

/**
 * Neutralisation windows from OpenF1 race_control: Safety Car / VSC deployment or a red flag opens a
 * window; the next track-wide GREEN/CLEAR flag (or "TRACK CLEAR") closes it.
 * Returns [{ start, end, kind: "SC" | "VSC" | "RED" }] in ms (end = Infinity when never closed).
 */
export function neutralWindows(control) {
  const rows = [...(control || [])].filter((m) => m && m.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const out = [];
  let open = null;
  for (const m of rows) {
    const t = Date.parse(m.date), msg = String(m.message || "").toUpperCase(), flag = String(m.flag || "").toUpperCase();
    const cat = String(m.category || "").toLowerCase();
    let kind = null;
    if (flag === "RED") kind = "RED";
    else if ((cat === "safetycar" || /SAFETY CAR|\bV?SC\b/.test(msg)) && /DEPLOYED/.test(msg)) kind = /VIRTUAL|\bVSC\b/.test(msg) ? "VSC" : "SC";
    if (kind) {
      if (!open) open = { start: t, end: Infinity, kind };
      else if (kind === "RED") open.kind = "RED";
      continue;
    }
    const clears = ((flag === "GREEN" || flag === "CLEAR") && (!m.scope || String(m.scope).toLowerCase() === "track")) || /TRACK CLEAR/.test(msg);
    if (clears && open) { open.end = t; out.push(open); open = null; }
  }
  if (open) out.push(open);
  return out;
}

export const EXCLUSIONS = {
  "no-time": "No lap time",
  lap1: "Lap 1",
  "pit-out": "Pit out-lap",
  "pit-in": "Pit in-lap",
  "pit-lane": "Pit-lane segment",
  neutralised: "SC / VSC / red flag",
  restart: "Restart lap",
  "no-stint": "No stint record",
  outlier: "Over 107% of stint median",
};

/**
 * Classify every lap as clean (reason null) or excluded with a reason.
 * laps: OpenF1 laps (all drivers); stints: OpenF1 stints; windows: neutralWindows().
 */
export function classifyLaps(laps, stints, windows, threshold = 1.07) {
  const byDriver = new Map();
  for (const s of stints || []) {
    if (!s || !Number.isFinite(s.driver_number)) continue;
    const list = byDriver.get(s.driver_number) || [];
    list.push(s);
    byDriver.set(s.driver_number, list);
  }
  for (const list of byDriver.values()) list.sort((a, b) => (a.lap_start || 0) - (b.lap_start || 0));
  const sorted = [...(laps || [])].filter((l) => l && Number.isFinite(l.lap_number)).sort((a, b) => a.driver_number - b.driver_number || a.lap_number - b.lap_number);
  const out = [];
  let prev = null;
  for (const l of sorted) {
    const list = byDriver.get(l.driver_number) || [];
    const idx = list.findIndex((s) => l.lap_number >= (s.lap_start || 1) && l.lap_number <= (s.lap_end ?? Infinity));
    const stint = idx >= 0 ? list[idx] : null;
    const time = Number.isFinite(l.lap_duration) && l.lap_duration > 0 ? l.lap_duration : null;
    const start = l.date_start ? Date.parse(l.date_start) : NaN;
    const end = Number.isFinite(start) && time ? start + time * 1000 : NaN;
    const segs = [l.segments_sector_1, l.segments_sector_2, l.segments_sector_3].flatMap((x) => (Array.isArray(x) ? x : []));
    const neutral = Number.isFinite(start) && windows.some((w) => start < w.end && (Number.isFinite(end) ? end : start) > w.start);
    let reason = null;
    if (time === null) reason = "no-time";
    else if (l.lap_number === 1) reason = "lap1";
    else if (l.is_pit_out_lap || (stint && idx > 0 && l.lap_number === stint.lap_start)) reason = "pit-out";
    else if (stint && idx < list.length - 1 && l.lap_number === stint.lap_end) reason = "pit-in";
    else if (segs.includes(2064)) reason = "pit-lane";
    else if (neutral) reason = "neutralised";
    else if (prev && prev.driver === l.driver_number && prev.lap === l.lap_number - 1 && prev.neutral) reason = "restart";
    else if (!stint) reason = "no-stint";
    const age = stint ? (stint.tyre_age_at_start || 0) + (l.lap_number - (stint.lap_start || 1)) : null;
    out.push({
      driver: l.driver_number, lap: l.lap_number, time, start: Number.isFinite(start) ? start : null,
      stint: stint ? stint.stint_number ?? idx + 1 : null, compound: stint ? String(stint.compound || "UNKNOWN").toUpperCase() : null, age, reason,
    });
    prev = { driver: l.driver_number, lap: l.lap_number, neutral };
  }
  // Outliers: slower than threshold × the median of the stint's otherwise-clean laps.
  const groups = new Map();
  for (const r of out) if (!r.reason) { const k = r.driver + ":" + r.stint; groups.set(k, [...(groups.get(k) || []), r]); }
  for (const list of groups.values()) {
    const m = medianOf(list.map((r) => r.time));
    for (const r of list) if (m !== null && r.time > m * threshold) r.reason = "outlier";
  }
  return out;
}

/** Least-squares polynomial fit (degree 1 or 2). Returns { coef: [a, b, c?], r2, rmse, n } or null. */
export function polyfit(xs, ys, degree = 1) {
  const n = Math.min(xs.length, ys.length);
  const k = degree + 1;
  if (n < k + 1) return null;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const p = Array.from({ length: k }, (_, j) => xs[i] ** j);
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) A[r][c] += p[r] * p[c];
      A[r][k] += p[r] * ys[i];
    }
  }
  // Gauss–Jordan with partial pivoting.
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  const coef = A.map((row, i) => row[k] / row[i]);
  const f = (x) => coef.reduce((s, a, j) => s + a * x ** j, 0);
  const mean = ys.slice(0, n).reduce((s, y) => s + y, 0) / n;
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) { ssr += (ys[i] - f(xs[i])) ** 2; sst += (ys[i] - mean) ** 2; }
  return { coef, r2: sst ? 1 - ssr / sst : 1, rmse: Math.sqrt(ssr / n), n };
}

export const evalPoly = (coef, x) => coef.reduce((s, a, j) => s + a * x ** j, 0);

/**
 * Fit lap time against tyre age for every stint with enough clean laps.
 * slope = s/lap of tyre age (linear) or the mean derivative over the observed ages (quadratic).
 * base = fitted lap time at tyre age 0 (extrapolated for used sets).
 * fuel (s/lap, an assumption, default 0) adds back an assumed fuel-burn gain: y = time + fuel × (lap − 1),
 * which shifts every slope by exactly `fuel` and expresses bases at lap-1 fuel load.
 */
export function fitStints(classified, degree = 1, { minLaps = degree === 2 ? 7 : 5, fuel = 0 } = {}) {
  const groups = new Map();
  for (const r of classified) {
    if (r.reason || r.age === null || r.stint === null) continue;
    const k = r.driver + ":" + r.stint;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < minLaps) continue;
    const xs = list.map((r) => r.age), ys = list.map((r) => r.time + fuel * (r.lap - 1));
    const ageMin = Math.min(...xs), ageMax = Math.max(...xs);
    if (ageMax - ageMin < minLaps - 1) continue;
    const fit = polyfit(xs, ys, degree);
    if (!fit) continue;
    const slope = degree === 2 ? fit.coef[1] + fit.coef[2] * (ageMin + ageMax) : fit.coef[1];
    out.push({
      driver: list[0].driver, stint: list[0].stint, compound: list[0].compound, n: list.length,
      coef: fit.coef, r2: fit.r2, rmse: fit.rmse, slope, base: fit.coef[0], ages: [ageMin, ageMax],
      laps: [Math.min(...list.map((r) => r.lap)), Math.max(...list.map((r) => r.lap))],
    });
  }
  return out.sort((a, b) => a.driver - b.driver || a.stint - b.stint);
}

/** Per-compound medians and spreads (MAD) of fitted slopes and bases. */
export function compoundSummary(fits) {
  const groups = new Map();
  for (const f of fits) groups.set(f.compound, [...(groups.get(f.compound) || []), f]);
  const order = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
  return [...groups.entries()]
    .map(([compound, list]) => ({
      compound,
      stints: list.length,
      laps: list.reduce((s, f) => s + f.n, 0),
      slope: { median: medianOf(list.map((f) => f.slope)), mad: mad(list.map((f) => f.slope)) },
      base: { median: medianOf(list.map((f) => f.base)), mad: mad(list.map((f) => f.base)) },
      r2: medianOf(list.map((f) => f.r2)),
    }))
    .sort((a, b) => (order.indexOf(a.compound) + 1 || 99) - (order.indexOf(b.compound) + 1 || 99));
}

/* ───────────────────────── 4 · Full-field replay ───────────────────────── */

/** Consecutive request windows of at most `size` ms covering [start, end). */
export function chunkWindows(start, end, size = 180000) {
  const out = [];
  for (let t = start; t < end; t += size) out.push([t, Math.min(end, t + size)]);
  return out;
}

/**
 * Rough wall-clock estimate (s) for n queued OpenF1 requests: the browser queue spaces requests
 * `spacing` ms apart and pauses once `perMinute` OpenF1 requests have started within ~61 s.
 */
export function fetchEstimate(n, { spacing = 400, perMinute = 28, latency = 900, used = 0 } = {}) {
  if (n <= 0) return 0;
  const pauses = Math.floor((n + used - 1) / perMinute);
  const wait = Math.max(0, 61 - (perMinute * spacing) / 1000);
  return Math.round(((n - 1) * spacing + latency) / 1000 + pauses * wait);
}

/** Position of a track at time t from parallel sorted arrays; null across gaps over maxGap ms. */
export function trackAt(ts, xs, ys, t, maxGap = 3000) {
  const n = ts.length;
  if (!n || t < ts[0] || t > ts[n - 1]) return null;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (lo === n - 1) return [xs[lo], ys[lo]];
  const gap = ts[lo + 1] - ts[lo];
  if (gap > maxGap) return null;
  const r = gap ? (t - ts[lo]) / gap : 0;
  return [xs[lo] + (xs[lo + 1] - xs[lo]) * r, ys[lo] + (ys[lo + 1] - ys[lo]) * r];
}

/** Merge new samples into a time-sorted list, dropping exact duplicate timestamps. */
export function mergeSamples(existing, incoming) {
  const all = [...existing, ...incoming].sort((a, b) => a.t - b.t);
  const out = [];
  for (const s of all) if (!out.length || out[out.length - 1].t !== s.t) out.push(s);
  return out;
}
