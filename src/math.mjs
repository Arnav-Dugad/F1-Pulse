export const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
export function timeSeconds(value) {
  if (!value) return null;
  const a = String(value).split(":").map(Number);
  if (a.some((x) => !Number.isFinite(x))) return null;
  return a.reduce((s, x) => s * 60 + x, 0);
}
export function summarize(results) {
  const valid = results.filter((r) => Number.isFinite(Number(r.position)));
  if (!valid.length) return null;
  return {
    starts: valid.length,
    wins: valid.filter((r) => Number(r.position) === 1).length,
    podiums: valid.filter((r) => Number(r.position) <= 3).length,
    points: valid.reduce((s, r) => s + Number(r.points), 0),
    averageFinish:
      valid.reduce((s, r) => s + Number(r.position), 0) / valid.length,
    gain: valid
      .filter((r) => Number(r.grid) > 0)
      .reduce((s, r) => s + Number(r.grid) - Number(r.position), 0),
    retirements: valid.filter((r) => !/^Finished$|^\+\d+ Laps?$/.test(r.status))
      .length,
  };
}
export function headToHead(races, a, b) {
  let aw = 0,
    bw = 0,
    ties = 0;
  for (const r of races) {
    const x = r.Results?.find((x) => x.Driver.driverId === a),
      y = r.Results?.find((x) => x.Driver.driverId === b);
    if (!x || !y) continue;
    if (+x.position < +y.position) aw++;
    else if (+y.position < +x.position) bw++;
    else ties++;
  }
  return { a: aw, b: bw, ties, paired: aw + bw + ties };
}
export function strategyTime(
  laps,
  base,
  stops,
  degradation,
  pitLoss,
  traffic = 0,
) {
  if (
    !Number.isInteger(laps) ||
    laps < 1 ||
    [base, degradation, pitLoss, traffic].some(
      (x) => !Number.isFinite(x) || x < 0,
    )
  )
    throw Error("Invalid simulation assumptions");
  if (
    stops.some((x) => !Number.isInteger(x) || x <= 0 || x >= laps) ||
    new Set(stops).size !== stops.length
  )
    throw Error("Stops must be unique laps inside the race");
  const sorted = [...stops].sort((a, b) => a - b),
    stints = [];
  let start = 0,
    time = sorted.length * pitLoss + traffic;
  for (const end of [...sorted, laps]) {
    const n = end - start;
    time += n * base + (degradation * n * (n - 1)) / 2;
    stints.push({ start: start + 1, end, laps: n });
    start = end;
  }
  return { time, stints };
}
export function projectChampionship(
  standings,
  order,
  season,
  kind = "race",
  fastestId = "",
) {
  if (new Set(order).size !== order.length)
    throw Error("Each driver can appear only once");
  if (season < 2010)
    throw Error("Scenario scoring is supported from 2010 onward");
  const ids = new Set(standings.map((s) => s.Driver.driverId));
  if (order.some((x) => !ids.has(x))) throw Error("Unknown driver");
  if (kind === "sprint" && season < 2021) throw Error("Sprints began in 2021");
  const scoring =
    kind === "sprint"
      ? season === 2021
        ? [3, 2, 1]
        : [8, 7, 6, 5, 4, 3, 2, 1]
      : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return standings
    .map((s) => {
      const p = order.indexOf(s.Driver.driverId),
        bonus =
          kind === "race" &&
          season >= 2019 &&
          season <= 2024 &&
          p >= 0 &&
          p < 10 &&
          s.Driver.driverId === fastestId
            ? 1
            : 0;
      const added = p >= 0 ? (scoring[p] || 0) + bonus : 0;
      return {
        ...s,
        originalPoints: Number(s.points),
        added,
        projected: Number(s.points) + added,
      };
    })
    .sort((a, b) => b.projected - a.projected || +a.position - +b.position);
}
export function distanceTrace(samples) {
  let distance = 0;
  return samples.map((s, i) => {
    if (i) {
      const dt = (Date.parse(s.date) - Date.parse(samples[i - 1].date)) / 1000;
      if (dt <= 0 || dt > 3)
        throw Error(
          "Telemetry contains gaps; a distance comparison is unavailable",
        );
      distance += ((samples[i - 1].speed + s.speed) / 2 / 3.6) * dt;
    }
    return {
      ...s,
      distance,
      elapsed: (Date.parse(s.date) - Date.parse(samples[0].date)) / 1000,
    };
  });
}
export function interpolate(trace, distance, field) {
  if (
    !trace.length ||
    distance < trace[0].distance ||
    distance > trace.at(-1).distance
  )
    return null;
  let lo = 0,
    hi = trace.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (trace[mid].distance < distance) lo = mid + 1;
    else hi = mid;
  }
  const b = trace[lo],
    a = trace[Math.max(0, lo - 1)];
  if (a.distance === b.distance) return b[field];
  return (
    a[field] +
    ((b[field] - a[field]) * (distance - a.distance)) /
      (b.distance - a.distance)
  );
}
export function lapDelta(a, b, steps = 200) {
  if (!a.length || !b.length) return [];
  const end = Math.min(a.at(-1).distance, b.at(-1).distance);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const distance = (end * i) / steps;
    return {
      distance,
      delta:
        interpolate(b, distance, "elapsed") -
        interpolate(a, distance, "elapsed"),
    };
  });
}
export function median(values) {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return null;
  return x.length % 2
    ? x[(x.length - 1) / 2]
    : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
}
export function sampleAt(samples, t) {
  if (
    !samples.length ||
    t < Date.parse(samples[0].date) ||
    t > Date.parse(samples.at(-1).date)
  )
    return null;
  let lo = 0,
    hi = samples.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (Date.parse(samples[mid].date) <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo],
    b = samples[lo + 1];
  if (!b) return a;
  const gap = Date.parse(b.date) - Date.parse(a.date);
  if (gap > 3000) return null;
  const ratio = (t - Date.parse(a.date)) / gap;
  return { ...a, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}
