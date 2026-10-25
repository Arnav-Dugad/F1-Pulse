/* Race weekend · shared data layer (OpenF1 session analysis, Jolpica lap data, derived models). */
import { useCallback, useEffect, useRef, useState } from "react";
import { raceLaps, request, sessions, useData } from "../api";
import { sessionDate } from "../lib/format";
import { teamColor } from "../lib/media";
import { timeSeconds } from "../math.mjs";
import type { Envelope, Race as RaceData, Result, Session } from "../types";

/* ───────── Small shared helpers ───────── */
export const EMPTY_META: Envelope<unknown>["meta"] = { source: "", url: "", fetchedAt: "", status: "" };
export const none = <T,>(data: T): Promise<Envelope<T>> => Promise.resolve({ data, meta: EMPTY_META });
export const isClassified = (r: Result) => /^\d+$/.test(r.positionText);
export const codeOf = (r: Pick<Result, "Driver">) => r.Driver.code || r.Driver.familyName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
export const secs = (v?: string) => timeSeconds(v);
export const reducedMotion = () =>
  typeof document !== "undefined" && (document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches);

/** Fires `cb` once, the first time `ref` comes within `margin` of the viewport. */
export function useInViewOnce<T extends Element>(cb: () => void, margin = "300px", enabled = true) {
  const ref = useRef<T>(null);
  const fn = useRef(cb);
  fn.current = cb;
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { fn.current(); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled, margin]);
  return ref;
}

/** Observed content-box width of an element. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ───────── Jolpica lap-by-lap data (shared by lap chart, gaps, pace, report) ───────── */
export type LapData = ReturnType<typeof useLapData>;
export function useLapData(season: string, round: string) {
  const [open, setOpen] = useState(false);
  const laps = useData(() => (open ? raceLaps(season, round) : none([] as RaceData[])), [season, round, open]);
  const list = laps.value?.data[0]?.Laps || [];
  return { open, load: () => setOpen(true), loading: open && laps.loading, error: laps.error, reload: laps.reload, value: open ? laps.value : undefined, laps: list };
}

/* ───────── OpenF1 types ───────── */
export type OFDriver = { driver_number: number; name_acronym: string; full_name: string; last_name?: string; team_name: string; team_colour: string };
export type OFLap = { driver_number: number; lap_number: number; lap_duration: number | null; date_start: string | null; is_pit_out_lap: boolean };
export type OFStint = { driver_number: number; stint_number: number; lap_start: number | null; lap_end: number | null; compound: string | null; tyre_age_at_start: number | null };
export type OFControl = { date: string; lap_number: number | null; category: string; flag: string | null; scope: string | null; sector: number | null; message: string; driver_number: number | null };
export type OFInterval = { date: string; driver_number: number; gap_to_leader: number | string | null; interval: number | string | null };
export type OFOvertake = { date: string; overtaking_driver_number: number; overtaken_driver_number: number; position: number };
export type OFRadio = { date: string; driver_number: number; recording_url: string };
export type OFGrid = { position: number; driver_number: number; lap_duration: number | null; session_key?: number };

export type Who = { n: number; id: string; code: string; name: string; color: string; result?: Result };

export type Analysis = {
  session: Session;
  quali?: Session;
  drivers: OFDriver[];
  laps: OFLap[];
  stints: OFStint[];
  control: OFControl[];
  overtakes: OFOvertake[];
  intervals: OFInterval[];
  radio: OFRadio[];
  grid: OFGrid[];
  env: Partial<Record<Job, Envelope<unknown>>>;
  failed: Job[];
  who: (n: number) => Who;
  /** Lap (of the given driver) in progress at an ISO timestamp, from OpenF1 lap start times. */
  lapAt: (n: number, iso: string) => number | null;
};

const JOBS = ["drivers", "laps", "stints", "race_control", "overtakes", "intervals", "team_radio", "starting_grid"] as const;
export type Job = (typeof JOBS)[number];
export const JOB_LABEL: Record<Job, string> = {
  drivers: "Driver list", laps: "Lap times", stints: "Tyre stints", race_control: "Race control", overtakes: "Overtakes",
  intervals: "Timing gaps", team_radio: "Team radio", starting_grid: "Starting grid",
};

export type AnalysisStatus = "idle" | "loading" | "done" | "error" | "unavailable" | "missing";
export type AnalysisState = { status: AnalysisStatus; done: number; total: number; current?: string; data?: Analysis; error?: string; start: () => void; retry: () => void };

const cache = new Map<string, Analysis>();

/** Match an OpenF1 driver to the Jolpica classification row: acronym, then race number, then surname. */
function mapDrivers(drivers: OFDriver[], results: Result[]) {
  const map = new Map<number, Result>();
  for (const d of drivers) {
    const r =
      results.find((x) => x.Driver.code && x.Driver.code === d.name_acronym) ||
      results.find((x) => x.Driver.permanentNumber && +x.Driver.permanentNumber === d.driver_number) ||
      results.find((x) => !!d.last_name && x.Driver.familyName.localeCompare(d.last_name, undefined, { sensitivity: "base" }) === 0);
    if (r && ![...map.values()].includes(r)) map.set(d.driver_number, r);
  }
  return map;
}

function build(session: Session, quali: Session | undefined, parts: Partial<Record<Job, Envelope<unknown[]>>>, failed: Job[], results: Result[]): Analysis {
  const arr = <T,>(k: Job) => ((parts[k]?.data as T[] | undefined) || []);
  const drivers = arr<OFDriver>("drivers");
  const laps = arr<OFLap>("laps");
  const byNum = mapDrivers(drivers, results);
  const dMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const who = (n: number): Who => {
    const r = byNum.get(n);
    const d = dMap.get(n);
    if (r) return { n, id: r.Driver.driverId, code: codeOf(r), name: `${r.Driver.givenName} ${r.Driver.familyName}`, color: teamColor(r.Constructor), result: r };
    return { n, id: "#" + n, code: d?.name_acronym || "#" + n, name: d?.full_name || `Car ${n}`, color: d?.team_colour ? "#" + d.team_colour : "#8E8E99" };
  };
  // Lap start times per driver, for mapping timestamps (overtakes, radio) onto laps.
  const starts = new Map<number, [number, number][]>();
  for (const l of laps) {
    if (!l.date_start) continue;
    const t = Date.parse(l.date_start);
    if (!Number.isFinite(t)) continue;
    starts.set(l.driver_number, [...(starts.get(l.driver_number) || []), [l.lap_number, t]]);
  }
  for (const list of starts.values()) list.sort((a, b) => a[1] - b[1]);
  const leaderish = [...starts.values()].sort((a, b) => b.length - a.length)[0] || [];
  const lapAt = (n: number, iso: string) => {
    const t = Date.parse(iso);
    const list = starts.get(n)?.length ? starts.get(n)! : leaderish;
    if (!list.length || !Number.isFinite(t)) return null;
    let lap: number | null = null;
    for (const [num, s] of list) { if (s <= t) lap = num; else break; }
    return lap ?? Math.max(1, list[0][0] - 1);
  };
  const env: Partial<Record<Job, Envelope<unknown>>> = {};
  for (const k of JOBS) if (parts[k]) env[k] = parts[k];
  const t0 = Date.parse(session.date_start);
  const grid = arr<OFGrid>("starting_grid");
  return {
    session, quali, drivers, laps, failed, env, who, lapAt,
    stints: arr<OFStint>("stints"),
    control: arr<OFControl>("race_control").slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    overtakes: arr<OFOvertake>("overtakes").filter((o) => !Number.isFinite(t0) || Date.parse(o.date) >= t0 - 600e3),
    intervals: arr<OFInterval>("intervals"),
    radio: arr<OFRadio>("team_radio").filter((r) => /^https:\/\//.test(r.recording_url)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    grid: grid.slice().sort((a, b) => a.position - b.position),
  };
}

/**
 * Session analysis from the OpenF1 archive (2023 onward), loaded on demand — one request per
 * endpoint (≈ 9 in total), spaced by the shared request queue.
 */
export function useAnalysis(race: RaceData, results: Result[]): AnalysisState {
  const key = race.season + ":" + race.round;
  const eligible = +race.season >= 2023;
  const total = JOBS.length + 1;
  const [s, set] = useState<Omit<AnalysisState, "start" | "retry">>(() =>
    cache.has(key) ? { status: "done", done: total, total, data: cache.get(key) } : { status: eligible ? "idle" : "unavailable", done: 0, total },
  );
  const running = useRef(false);
  const live = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  // Leaving the page drops the analysis requests still queued behind the rate limiter.
  useEffect(() => { live.current = true; return () => { live.current = false; abort.current?.abort(); }; }, []);

  const start = useCallback(async () => {
    if (!eligible || running.current || cache.has(key)) return;
    running.current = true;
    const put = (v: Omit<AnalysisState, "start" | "retry">) => live.current && set(v);
    put({ status: "loading", done: 0, total, current: "Session list" });
    try {
      const list = await sessions(race.season);
      const target = sessionDate(race.date, race.time || "12:00:00Z").getTime();
      const near = (x: Session) => Math.abs(Date.parse(x.date_start) - target);
      const session = list.data.filter((x) => x.session_name === "Race" && near(x) < 36 * 3600e3).sort((a, b) => near(a) - near(b))[0];
      if (!session) { put({ status: "missing", done: 1, total }); return; }
      const quali = list.data.find((x) => x.meeting_key === session.meeting_key && x.session_name === "Qualifying");
      const sk = session.session_key;
      let done = 1;
      put({ status: "loading", done, total, current: JOB_LABEL[JOBS[0]] });
      abort.current = new AbortController();
      const signal = abort.current.signal;
      const fetchJob = async (job: Job): Promise<Envelope<unknown[]>> => {
        if (job !== "starting_grid") return request<unknown[]>("openf1", job, { session_key: sk }, signal);
        // The archive files the grid under the race or (in older data) the qualifying session.
        const a = await request<unknown[]>("openf1", job, { session_key: sk }, signal);
        if ((a.data || []).length || !quali) return a;
        return request<unknown[]>("openf1", job, { session_key: quali.session_key }, signal);
      };
      const settled = await Promise.allSettled(JOBS.map((job) =>
        fetchJob(job).finally(() => { done++; put({ status: "loading", done, total, current: JOB_LABEL[JOBS[Math.min(done - 1, JOBS.length - 1)]] }); }),
      ));
      const parts: Partial<Record<Job, Envelope<unknown[]>>> = {};
      const failed: Job[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled" && Array.isArray(r.value.data)) parts[JOBS[i]] = r.value;
        else failed.push(JOBS[i]);
      });
      if (failed.length === JOBS.length) {
        const reason = settled.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        throw reason instanceof Error ? reason : Error("The OpenF1 archive is unavailable right now.");
      }
      const data = build(session, quali, parts, failed, resultsRef.current);
      if (!failed.length) cache.set(key, data);
      put({ status: "done", done: total, total, data });
    } catch (e) {
      put({ status: "error", done: 0, total, error: e instanceof Error ? e.message : String(e) });
    } finally {
      running.current = false;
    }
  }, [eligible, key, race.season, race.date, race.time, total]);

  const retry = useCallback(() => { cache.delete(key); start(); }, [key, start]);
  return { ...s, start, retry };
}

/* ───────── Race control → neutralisation windows ───────── */
export type Neutral = { kind: "SC" | "VSC" | "RED"; start: number; end: number; open?: boolean };

/** Safety car, virtual safety car and red-flag periods, by (leader) lap number. */
export function neutralWindows(control: OFControl[], totalLaps: number): Neutral[] {
  const out: Neutral[] = [];
  let sc: number | null = null, vsc: number | null = null, red: number | null = null;
  let last = 1;
  for (const m of control) {
    const lap = m.lap_number ?? last;
    last = lap;
    const msg = (m.message || "").toUpperCase();
    // 2026 messages abbreviate ("VSC DEPLOYED", "SC IN THIS LAP"); earlier seasons spell them out.
    if (/VIRTUAL SAFETY CAR DEPLOYED|\bVSC DEPLOYED/.test(msg)) vsc ??= lap;
    else if (/VIRTUAL SAFETY CAR ENDING|VSC ENDING/.test(msg)) { if (vsc !== null) { out.push({ kind: "VSC", start: vsc, end: lap }); vsc = null; } }
    else if (/SAFETY CAR DEPLOYED|\bSC DEPLOYED/.test(msg)) sc ??= lap;
    else if (/SAFETY CAR IN THIS LAP|\bSC IN THIS LAP/.test(msg)) { if (sc !== null) { out.push({ kind: "SC", start: sc, end: lap }); sc = null; } }
    if (m.flag === "RED") red ??= lap;
    else if (red !== null && (m.flag === "GREEN" || /RESUME|TRACK CLEAR|PIT EXIT OPEN/.test(msg)) && lap >= red) { out.push({ kind: "RED", start: red, end: Math.max(red, lap) }); red = null; }
  }
  if (sc !== null) out.push({ kind: "SC", start: sc, end: Math.min(totalLaps, sc + 1), open: true });
  if (vsc !== null) out.push({ kind: "VSC", start: vsc, end: vsc, open: true });
  if (red !== null) out.push({ kind: "RED", start: red, end: red, open: true });
  return out.sort((a, b) => a.start - b.start);
}

/** Deployment counts straight from race-control messages. */
export function deployments(control: OFControl[]) {
  let sc = 0, vsc = 0, red = 0;
  for (const m of control) {
    const msg = (m.message || "").toUpperCase();
    if (/VIRTUAL SAFETY CAR DEPLOYED|\bVSC DEPLOYED/.test(msg)) vsc++;
    else if (/SAFETY CAR DEPLOYED|\bSC DEPLOYED/.test(msg)) sc++;
    if (m.flag === "RED" && (m.scope || "Track") === "Track") red++;
  }
  return { sc, vsc, red };
}

/* ───────── Gap models ───────── */
export type GapModel = { source: "openf1" | "jolpica"; laps: number; gap: Map<string, (number | null)[]>; who: Map<string, { code: string; name: string; color: string; result?: Result }> };

/** Gap to leader at the end of every lap, from summed lap times (Jolpica). Index 0 = lap 1. */
export function jolpicaGaps(laps: NonNullable<RaceData["Laps"]>, results: Result[]): GapModel {
  const cum = new Map<string, (number | null)[]>();
  const n = laps.length;
  for (const r of results) cum.set(r.Driver.driverId, Array(n).fill(null));
  const running = new Map<string, number | null>();
  laps.forEach((lap, i) => {
    const seen = new Set<string>();
    for (const t of lap.Timings) {
      const s = timeSeconds(t.time);
      const prev = i === 0 ? 0 : running.get(t.driverId);
      seen.add(t.driverId);
      const v = s === null || prev === null || prev === undefined ? null : prev + s;
      running.set(t.driverId, v);
      const arr = cum.get(t.driverId);
      if (arr) arr[i] = v;
    }
    for (const id of running.keys()) if (!seen.has(id)) running.set(id, null);
  });
  const gap = new Map<string, (number | null)[]>();
  const lead = Array.from({ length: n }, (_, i) => {
    const vals = [...cum.values()].map((a) => a[i]).filter((v): v is number => v !== null);
    return vals.length ? Math.min(...vals) : null;
  });
  for (const [id, arr] of cum) gap.set(id, arr.map((v, i) => (v === null || lead[i] === null ? null : v - lead[i]!)));
  const who = new Map(results.map((r) => [r.Driver.driverId, { code: codeOf(r), name: `${r.Driver.givenName} ${r.Driver.familyName}`, color: teamColor(r.Constructor), result: r }]));
  return { source: "jolpica", laps: n, gap, who };
}

/** Official timing gap to the leader sampled at the end of each lap (OpenF1 intervals + laps). */
export function openf1Gaps(a: Analysis): GapModel | null {
  if (!a.intervals.length || !a.laps.length) return null;
  const samples = new Map<number, { t: number; g: number | string | null; i: number | string | null }[]>();
  for (const s of a.intervals) {
    const t = Date.parse(s.date);
    if (!Number.isFinite(t)) continue;
    let list = samples.get(s.driver_number);
    if (!list) samples.set(s.driver_number, (list = []));
    list.push({ t, g: s.gap_to_leader, i: s.interval });
  }
  for (const list of samples.values()) list.sort((x, y) => x.t - y.t);
  const byDriver = new Map<number, Map<number, OFLap>>();
  let maxLap = 0;
  for (const l of a.laps) {
    let m = byDriver.get(l.driver_number);
    if (!m) byDriver.set(l.driver_number, (m = new Map()));
    m.set(l.lap_number, l);
    maxLap = Math.max(maxLap, l.lap_number);
  }
  const gap = new Map<string, (number | null)[]>();
  const who = new Map<string, { code: string; name: string; color: string; result?: Result }>();
  for (const [n, laps] of byDriver) {
    const w = a.who(n);
    const list = samples.get(n) || [];
    const arr: (number | null)[] = Array(maxLap).fill(null);
    for (let lap = 1; lap <= maxLap; lap++) {
      const cur = laps.get(lap);
      if (!cur) continue;
      const next = laps.get(lap + 1);
      const end = next?.date_start ? Date.parse(next.date_start) : cur.date_start && cur.lap_duration ? Date.parse(cur.date_start) + cur.lap_duration * 1000 : NaN;
      if (!Number.isFinite(end)) continue;
      // Latest published sample at (or just after) the line crossing.
      let lo = 0, hi = list.length - 1, found = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].t <= end + 2000) { found = mid; lo = mid + 1; } else hi = mid - 1; }
      if (found < 0 || end - list[found].t > 30000) continue;
      const s = list[found];
      arr[lap - 1] = typeof s.g === "number" ? s.g : s.g === null && (s.i === null || s.i === 0) ? 0 : null;
    }
    gap.set(w.id, arr);
    who.set(w.id, w);
  }
  return { source: "openf1", laps: maxLap, gap, who };
}

/* ───────── Statistics ───────── */
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export const fmtSigned = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`;
export const localClock = (iso: string, timezone: string) => {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: timezone === "local" ? undefined : timezone });
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
};
