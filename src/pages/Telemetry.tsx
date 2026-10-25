import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, ArrowRight, ChevronLeft, ChevronRight, Download, Gauge, Info, Map as MapIcon, Maximize2, Minus, Plus, Zap } from "lucide-react";
import { request } from "../api";
import { Link, type Route } from "../lib/router";
import { download, lapTime, toCSV } from "../lib/format";
import { distanceTrace, lapDelta, sampleAt } from "../math.mjs";
import { Glass, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import type { ArchiveDriver, CarSample, Envelope, Lap, LocationSample, Session } from "../types";
import {
  ArchiveControls, ArchiveHero, ArchiveStatus, ArchiveUnavailable, DriverBadge, LoadProgress, PaceSummary,
  displayName, lapEnd, signed, surname, useArchive, validLap, type Archive,
} from "./_archive";
import { CornerAnalysis } from "./_labcorners";
import { MiniSectorBoard, MiniSectorHistory, SEG_COLOUR, SEG_LABEL, SegLegend, hasSegments, useSegmentOverlay, type SegLap } from "./_labsectors";
import "./telemetry.css";

/* ───────────────────────── Types & numeric helpers ───────────────────────── */
type Row = CarSample & { t: number; d: number };
type XKey = "d" | "t";
type NumKey = "speed" | "throttle" | "brake" | "n_gear" | "rpm" | "drs" | "d" | "t";
type Field = "speed" | "throttle" | "brake" | "n_gear" | "rpm" | "drs";
type Win = [number, number];

/** Last index whose key ≤ x (rows sorted by key), or -1. */
function idxLE(rows: Row[], key: XKey, x: number) {
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][key] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
function valueAt(rows: Row[], key: XKey, field: NumKey, x: number, step = false): number | null {
  if (!rows.length || x < rows[0][key] || x > rows[rows.length - 1][key]) return null;
  const i = Math.max(0, idxLE(rows, key, x));
  const a = rows[i], b = rows[i + 1];
  if (!b || step) return a[field];
  if (b.t - a.t > 3) return null; // never interpolate across a sample gap
  const span = b[key] - a[key];
  if (!span) return a[field];
  return a[field] + ((b[field] - a[field]) * (x - a[key])) / span;
}
function deltaAt(delta: { distance: number; delta: number }[], d: number): number | null {
  if (delta.length < 2) return null;
  const end = delta[delta.length - 1].distance;
  if (d < 0 || d > end || !end) return null;
  const f = (d / end) * (delta.length - 1), i = Math.floor(f), r = f - i;
  const a = delta[i], b = delta[Math.min(delta.length - 1, i + 1)];
  if (!Number.isFinite(a.delta) || !Number.isFinite(b.delta)) return null;
  return a.delta + (b.delta - a.delta) * r;
}
const niceStep = (span: number, target = 6) => {
  const raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 2.5, 5, 10].find((n) => n * mag >= raw)! * mag;
};
const fmtX = (v: number, key: XKey, span: number) =>
  key === "d" ? (span > 1800 ? `${(v / 1000).toFixed(span > 4000 ? 1 : 2)} km` : `${Math.round(v)} m`) : `${v.toFixed(span > 20 ? 0 : 1)} s`;

const CHANNELS: { key: Field; label: string; unit: string; h: number; step?: boolean; lanes?: boolean }[] = [
  { key: "speed", label: "Speed", unit: "km/h", h: 170 },
  { key: "throttle", label: "Throttle", unit: "%", h: 74 },
  { key: "brake", label: "Brake", unit: "pressed", h: 50, step: true, lanes: true },
  { key: "n_gear", label: "Gear", unit: "", h: 74, step: true },
  { key: "rpm", label: "Engine", unit: "rpm", h: 82 },
  { key: "drs", label: "DRS", unit: "raw code", h: 50, step: true },
];
/** DRS has no data from 2026 (active aero replaced it): drop the empty lane instead of a flat line. */
const activeChannels = (rows: { drs: number }[]) => CHANNELS.filter((c) => c.key !== "drs" || rows.some((r) => r.drs > 0));
const HEAD = 20, GAP = 12, PAD_L = 46, PAD_R = 12, AXIS = 26;

function formatValue(field: Field, v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (field) {
    case "speed": return `${Math.round(v)}`;
    case "throttle": return `${Math.round(v)}%`;
    case "brake": return v > 0 ? "On" : "Off";
    case "n_gear": return v === 0 ? "N" : String(Math.round(v));
    case "rpm": return Math.round(v).toLocaleString();
    case "drs": return String(Math.round(v));
  }
}

/* ───────────────────────── Car-data loader (rate-limit aware, sequential) ───────────────────────── */
type CarState = { sig: string; loading: boolean; step: number; label: string; a?: CarSample[]; b?: CarSample[]; meta?: Envelope<unknown>["meta"]; error?: string };

function useCarData(ax: Archive) {
  const { sessionKey, aId, bId, chosenA, chosenB, driverA, driverB } = ax;
  const sig = [sessionKey, aId, bId, chosenA?.lap_number, chosenB?.lap_number].join(":");
  const ready = !!(sessionKey && chosenA && chosenB && driverA && driverB && aId !== bId);
  const [state, setState] = useState<CarState>({ sig: "", loading: false, step: 0, label: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const clean = (list: CarSample[]) =>
      [...(list || [])].filter((s) => s && s.date && Number.isFinite(s.speed)).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    const timer = setTimeout(async () => {
      try {
        setState({ sig, loading: true, step: 1, label: `Loading lap 1 of 2 · ${driverA!.name_acronym} lap ${chosenA!.lap_number}…` });
        const x = await request<CarSample[]>("openf1", "car_data", { session_key: sessionKey!, driver_number: aId, "date>=": chosenA!.date_start!, "date<=": lapEnd(chosenA!) });
        if (!live) return;
        setState({ sig, loading: true, step: 2, label: `Loading lap 2 of 2 · ${driverB!.name_acronym} lap ${chosenB!.lap_number}…` });
        const y = await request<CarSample[]>("openf1", "car_data", { session_key: sessionKey!, driver_number: bId, "date>=": chosenB!.date_start!, "date<=": lapEnd(chosenB!) });
        if (!live) return;
        const a = clean(x.data), b = clean(y.data);
        if (a.length < 2 || b.length < 2) throw Error("There are not enough measured car-data samples for this selection. Choose another lap or session.");
        setState({ sig, loading: false, step: 2, label: "", a, b, meta: x.meta });
      } catch (e) {
        if (live) setState({ sig, loading: false, step: 0, label: "", error: (e as Error).message });
      }
    }, 320);
    return () => { live = false; clearTimeout(timer); };
  }, [sig, ready, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = state.sig === sig;
  return {
    ready,
    loading: ready && (!fresh || state.loading),
    step: fresh ? state.step : 0,
    label: fresh && state.label ? state.label : "Preparing request…",
    a: fresh ? state.a : undefined,
    b: fresh ? state.b : undefined,
    meta: fresh ? state.meta : undefined,
    error: fresh ? state.error : undefined,
    retry: () => setRetry((r) => r + 1),
  };
}

/* ───────────────────────── Page ───────────────────────── */
export default function Telemetry(_: { route: Route }) {
  useTitle("Telemetry lab");
  const ax = useArchive("telemetry");
  useAmbient(ax.driverA ? ax.colours[0] : undefined, ax.driverB ? ax.colours[1] : undefined);
  const car = useCarData(ax);

  const hero = (
    <ArchiveHero
      eyebrow={<><Activity />OpenF1 archive · {ax.year}</>}
      title="Telemetry lab"
      sub="Every input, side by side."
      lede="Overlay two measured laps — speed, throttle, brake, gear, revs and DRS — on one linked crosshair, then see where the time goes."
      session={ax.archived ? ax.session : undefined}
      graphic={<SpeedTraceArt a={car.a} b={car.b} colours={ax.colours} labels={[ax.driverA?.name_acronym, ax.driverB?.name_acronym]} />}
    />
  );

  if (!ax.archived)
    return (
      <Page className="tl-page">
        {hero}
        <ArchiveUnavailable year={ax.year} feature="Telemetry" />
      </Page>
    );

  return (
    <Page className="tl-page">
      {hero}
      <ArchiveControls ax={ax} />
      <div className="tl-status"><ArchiveStatus ax={ax} /></div>

      {ax.session && ax.drivers.length > 0 && (
        <>
          <Section id="lap-summary" title="Lap summary" subtitle="Measured lap and sector durations, straight from OpenF1 timing.">
            <LapSummary ax={ax} />
            <Source value={ax.lapsAData.value?.meta.fetchedAt ? ax.lapsAData.value : undefined} />
          </Section>

          {ax.chosenA && ax.chosenB && ax.driverA && ax.driverB && (hasSegments(ax.chosenA as SegLap) || hasSegments(ax.chosenB as SegLap)) && (
            <Section id="mini-sectors" title="Mini-sectors" subtitle="The timing screen's segment colours for each selected lap — purple overall best, green personal best, yellow no improvement.">
              <MiniSectorBoard year={ax.year} rows={[
                { driver: ax.driverA, lap: ax.chosenA as SegLap, colour: ax.colours[0], side: "A" },
                { driver: ax.driverB, lap: ax.chosenB as SegLap, colour: ax.colours[1], side: "B" },
              ]} />
              <MiniSectorHistory
                sides={[
                  { driver: ax.driverA, laps: ax.lapsA as SegLap[], colour: ax.colours[0], side: "A" },
                  { driver: ax.driverB, laps: ax.lapsB as SegLap[], colour: ax.colours[1], side: "B" },
                ]}
                chosen={[ax.chosenA.lap_number, ax.chosenB.lap_number]}
                onPick={(side, lap) => (side === "A" ? ax.setLapA : ax.setLapB)(String(lap))}
              />
              <p className="source">
                Segment status codes from OpenF1 <code>laps</code> (segments_sector_1–3), mapped as 2049 → green, 2051 → purple, 2048 → yellow, 2064 → pit lane, 0 or empty → not available; any other code is shown as unlisted.
                Statuses are set by the timing system when each segment is completed, so purple means the best of the session up to that moment.
              </p>
              <Source value={ax.lapsAData.value?.meta.fetchedAt ? ax.lapsAData.value : undefined} label="Laps" />
            </Section>
          )}

          {car.ready && car.loading && (
            <Section title="Telemetry">
              <LoadProgress step={Math.max(1, car.step)} total={2} label={car.label} />
              <Skeleton h={560} r={28} style={{ marginTop: 16 }} />
            </Section>
          )}
          {car.ready && !car.loading && car.error && (
            <Section title="Telemetry"><StateView error={car.error} onRetry={car.retry} /></Section>
          )}
          {!car.ready && !ax.lapsAData.loading && !ax.lapsBData.loading && !ax.driverData.loading && (
            <Section title="Telemetry">
              <StateView empty emptyTitle="Pick two laps to compare" emptyText="Both drivers need at least one valid timed lap (not a pit-out lap, under three minutes) in this session." />
            </Section>
          )}
          {car.a && car.b && ax.chosenA && ax.chosenB && ax.driverA && ax.driverB && (
            <TelemetryLab
              key={[ax.sessionKey, ax.aId, ax.bId, ax.chosenA.lap_number, ax.chosenB.lap_number].join(":")}
              a={car.a} b={car.b} lapA={ax.chosenA} lapB={ax.chosenB} driverA={ax.driverA} driverB={ax.driverB}
              colours={ax.colours} year={ax.year} session={ax.session} meta={car.meta}
            />
          )}

          <Section id="session-pace" title="Pace across the session" subtitle="Every valid lap for both drivers — context for the laps you're comparing."
            action={<Link className="btn sm" to="replay">Watch the replay<ArrowRight /></Link>}>
            <PaceSummary ax={ax} />
          </Section>
        </>
      )}

      <p className="ax-note">
        <Info />
        <span>
          Archive only: sessions appear after the provider's live window ends, and each telemetry request is bounded to a single driver's lap window of at most three minutes.
          Samples are finite and asynchronous (≈3–4 Hz); gaps are reported, never filled. Data: <a className="link" href="https://openf1.org" target="_blank" rel="noopener noreferrer">OpenF1</a>.
        </span>
      </p>
      <Source value={ax.sessionData.value?.meta.fetchedAt ? ax.sessionData.value : undefined} label="Sessions" />
    </Page>
  );
}

/* ───────────────────────── Hero art: glowing speed trace ───────────────────────── */
function SpeedTraceArt({ a, b, colours, labels }: { a?: CarSample[]; b?: CarSample[]; colours: [string, string]; labels: (string | undefined)[] }) {
  const W = 500, H = 320, top = 40, bottom = 278;
  const real = !!(a?.length && b?.length);
  const paths = useMemo(() => {
    const toPath = (vals: number[], max: number) =>
      vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * W).toFixed(1)},${(bottom - (v / max) * (bottom - top)).toFixed(1)}`).join("");
    if (real) {
      const max = Math.max(...a!.map((s) => s.speed), ...b!.map((s) => s.speed), 1) * 1.04;
      return [toPath(a!.map((s) => s.speed), max), toPath(b!.map((s) => s.speed), max)];
    }
    // Decorative waveform (no data) — straights, braking zones and corners.
    const n = 140, shape = (i: number, k: number) => {
      const x = i / n;
      const v = 0.62 + 0.3 * Math.sin(x * 9.1 + k) * Math.sin(x * 3.3 + 0.6 + k * 0.4) + 0.12 * Math.sin(x * 23 + k);
      return Math.max(0.12, Math.min(0.97, v));
    };
    return [toPath(Array.from({ length: n }, (_, i) => shape(i, 0)), 1), toPath(Array.from({ length: n }, (_, i) => shape(i + 1.6, 0.18)), 1)];
  }, [a, b, real]);
  const top1 = real ? Math.max(...a!.map((s) => s.speed)) : null;
  const top2 = real ? Math.max(...b!.map((s) => s.speed)) : null;
  return (
    <div className="tl-art">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={real ? `Measured speed traces of ${labels[0]} and ${labels[1]}` : "Decorative speed trace"}>
        <defs>
          <filter id="tl-glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
          <linearGradient id="tl-fade" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.12" stopColor="#fff" stopOpacity="1" /><stop offset="0.88" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id="tl-mask"><rect width={W} height={H} fill="url(#tl-fade)" /></mask>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={top + (bottom - top) * f} y2={top + (bottom - top) * f} className="tl-art-grid" />)}
        <g mask="url(#tl-mask)" key={real ? "real" : "deco"}>
          {paths.map((d, i) => (
            <g key={i} style={{ "--c": colours[i] } as CSSProperties}>
              <path d={d} className="tl-art-glow" filter="url(#tl-glow)" />
              <path d={d} className="tl-art-line" pathLength={1} style={{ animationDelay: `${i * 0.25}s` }} />
            </g>
          ))}
        </g>
        <line className="tl-art-scan" x1={0} x2={0} y1={top - 10} y2={bottom + 8} />
      </svg>
      <div className="tl-art-meta">
        {real ? (
          <>
            <span><i className="ax-legend-dot" style={{ "--c": colours[0] } as CSSProperties} />{labels[0]} · top {Math.round(top1!)} km/h</span>
            <span><i className="ax-legend-dot" style={{ "--c": colours[1] } as CSSProperties} />{labels[1]} · top {Math.round(top2!)} km/h</span>
          </>
        ) : (
          <span className="tl-art-hint"><Gauge size={13} />Speed trace · loads with your selection</span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Lap summary ───────────────────────── */
function LapSummary({ ax }: { ax: Archive }) {
  const { chosenA, chosenB, driverA, driverB, colours } = ax;
  if (ax.lapsAData.loading || ax.lapsBData.loading) return <div className="tl-summary"><Skeleton h={210} r={28} /><Skeleton h={210} r={28} /><Skeleton h={210} r={28} /></div>;
  if (!chosenA || !chosenB) return <StateView empty emptyTitle="No valid laps to compare" emptyText="One of the selected drivers has no valid timed lap in this session." />;
  const keys = ["duration_sector_1", "duration_sector_2", "duration_sector_3"] as const;
  const validA = ax.lapsA.filter(validLap), validB = ax.lapsB.filter(validLap);
  const best = keys.map((k) => Math.min(...[...validA, ...validB].map((l) => l[k] ?? Infinity)));
  const pbA = keys.map((k) => Math.min(...validA.map((l) => l[k] ?? Infinity)));
  const pbB = keys.map((k) => Math.min(...validB.map((l) => l[k] ?? Infinity)));
  const delta = chosenB.lap_duration! - chosenA.lap_duration!;
  const leader = delta > 0 ? driverA : delta < 0 ? driverB : undefined;
  const card = (d: ArchiveDriver | undefined, lap: Lap, colour: string, pb: number[], side: string, i: number) => (
    <Glass className="tl-lap reveal" style={{ "--tint": colour, "--i": i } as CSSProperties}>
      <div className="tl-lap-head">
        <DriverBadge driver={d} year={ax.year} size={46} colour={colour} />
        <span className="tl-lap-who">
          <small>Driver {side} · Lap {lap.lap_number}</small>
          <strong>{displayName(d)}</strong>
        </span>
        {lap.lap_number === (side === "A" ? ax.fastestA : ax.fastestB)?.lap_number && <span className="chip purple"><Zap />Fastest</span>}
      </div>
      <div className="tl-lap-time">{lapTime(lap.lap_duration)}</div>
      <div className="tl-sectors">
        {keys.map((k, s) => {
          const v = lap[k];
          const cls = v === null ? "" : v <= best[s] ? "purple" : v <= pb[s] ? "green" : "";
          return (
            <div key={k} className={cx("tl-sector", cls)}>
              <span>S{s + 1}</span>
              <b>{v === null ? "—" : v.toFixed(3)}</b>
            </div>
          );
        })}
      </div>
    </Glass>
  );
  return (
    <>
      <div className="tl-summary">
        {card(driverA, chosenA, colours[0], pbA, "A", 0)}
        {card(driverB, chosenB, colours[1], pbB, "B", 1)}
        <Glass className="tl-lap tl-delta-card reveal" style={{ "--i": 2, "--tint": leader === driverA ? colours[0] : leader === driverB ? colours[1] : "var(--label-3)" } as CSSProperties}>
          <span className="eyebrow">Lap delta · B − A</span>
          <div className="tl-delta-big">{signed(delta)}<small>s</small></div>
          <p className="muted small">{leader ? <><strong>{surname(leader)}</strong> quicker by {Math.abs(delta).toFixed(3)} s on measured lap time</> : "Identical measured lap times"}</p>
          <div className="tl-sector-deltas">
            {keys.map((k, s) => {
              const da = chosenA[k], db = chosenB[k];
              const v = da !== null && db !== null ? db - da : null;
              return (
                <div key={k} className="tl-sd">
                  <span>S{s + 1}</span>
                  <b style={{ color: v === null || Math.abs(v) < 0.0005 ? undefined : v > 0 ? colours[0] : colours[1] }}>{signed(v)}</b>
                  <i style={{ "--w": v === null ? 0 : Math.min(1, Math.abs(v) / 0.6), "--c": v !== null && v > 0 ? colours[0] : colours[1], "--dir": v !== null && v > 0 ? -1 : 1 } as CSSProperties} />
                </div>
              );
            })}
          </div>
        </Glass>
      </div>
      <p className="tl-legend-line xsmall faint">
        <span className="tl-legend-item"><span className="tl-key purple" />Best of both drivers' valid laps</span>{" "}
        <span className="tl-legend-item"><span className="tl-key green" />Personal best in this session</span> · Sector bars point toward the driver who gained.
      </p>
    </>
  );
}

/* ───────────────────────── Telemetry lab ───────────────────────── */
function TelemetryLab({ a, b, lapA, lapB, driverA, driverB, colours, year, session, meta }: {
  a: CarSample[]; b: CarSample[]; lapA: Lap; lapB: Lap; driverA: ArchiveDriver; driverB: ArchiveDriver; colours: [string, string];
  year: string; session?: Session; meta?: Envelope<unknown>["meta"];
}) {
  const prepared = useMemo(() => {
    let distError = "";
    let ta: ReturnType<typeof distanceTrace> | null = null, tb: ReturnType<typeof distanceTrace> | null = null;
    try { ta = distanceTrace(a); tb = distanceTrace(b); } catch (e) { distError = (e as Error).message; ta = tb = null; }
    const sa = Date.parse(lapA.date_start!), sb = Date.parse(lapB.date_start!);
    const rowsA: Row[] = a.map((s, i) => ({ ...s, t: (Date.parse(s.date) - sa) / 1000, d: ta ? ta[i].distance : NaN }));
    const rowsB: Row[] = b.map((s, i) => ({ ...s, t: (Date.parse(s.date) - sb) / 1000, d: tb ? tb[i].distance : NaN }));
    const delta = ta && tb ? lapDelta(ta, tb, 400) : [];
    return { rowsA, rowsB, delta, distError };
  }, [a, b, lapA, lapB]);
  const { rowsA, rowsB, delta, distError } = prepared;
  const [modePref, setMode] = useState<XKey>("d");
  const mode: XKey = distError ? "t" : modePref;
  const end = Math.max(rowsA.at(-1)![mode], rowsB.at(-1)![mode]);
  const [win, setWin] = useState<Win>([0, end]);
  const [cursor, setCursor] = useState<number | null>(null);
  useEffect(() => { setWin([0, end]); setCursor(null); }, [mode, end]);

  // Sector splits from Driver A's measured sector times, placed on the active axis.
  const sectors = useMemo(() => {
    const s1 = lapA.duration_sector_1, s2 = lapA.duration_sector_2;
    if (s1 === null) return [] as number[];
    const at = [s1, s2 !== null ? s1 + s2 : null].filter((v): v is number => v !== null);
    return at.map((t) => (mode === "t" ? t : valueAt(rowsA, "t", "d", t))).filter((v): v is number => v !== null && Number.isFinite(v));
  }, [lapA, mode, rowsA]);
  const presets: { id: string; label: string; w: Win }[] = [{ id: "full", label: "Full lap", w: [0, end] }];
  const bounds = [0, ...sectors, end];
  if (sectors.length === 2) for (let i = 0; i < 3; i++) presets.push({ id: "s" + (i + 1), label: `S${i + 1}`, w: [bounds[i], bounds[i + 1]] });

  const span = win[1] - win[0];
  const minSpan = end * 0.02;
  const clampWin = (w: Win): Win => {
    let [x0, x1] = w;
    if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
    if (x0 < 0) { x1 -= x0; x0 = 0; }
    if (x1 > end) { x0 -= x1 - end; x1 = end; }
    return [Math.max(0, x0), Math.min(end, x1)];
  };
  const zoom = (factor: number) => {
    const c = cursor !== null && cursor >= win[0] && cursor <= win[1] ? cursor : (win[0] + win[1]) / 2;
    setWin(clampWin([c - (c - win[0]) * factor, c + (win[1] - c) * factor]));
  };
  const pan = (dir: number) => setWin(clampWin([win[0] + dir * span * 0.25, win[1] + dir * span * 0.25]));

  const exportCSV = () => {
    const rows: (string | number | null)[][] = [["Driver", "Acronym", "Lap", "UTC timestamp", "Elapsed from lap start (s)", "Estimated distance (m)", "Speed (km/h)", "Throttle (%)", "Brake", "Gear", "RPM", "DRS raw code"]];
    for (const [d, lap, list] of [[driverA, lapA, rowsA], [driverB, lapB, rowsB]] as const)
      for (const r of list) rows.push([displayName(d), d.name_acronym, lap.lap_number, r.date, r.t.toFixed(3), Number.isFinite(r.d) ? r.d.toFixed(1) : "", r.speed, r.throttle, r.brake, r.n_gear, r.rpm, r.drs]);
    const name = `f1-pulse-telemetry-${session?.year || year}-${(session?.location || "session").toLowerCase().replace(/\W+/g, "-")}-${driverA.name_acronym}-L${lapA.lap_number}-vs-${driverB.name_acronym}-L${lapB.lap_number}.csv`;
    download(name, toCSV(rows), "text/csv;charset=utf-8");
  };

  return (
    <>
      <Section id="telemetry-traces" title="Telemetry traces"
        subtitle={mode === "d" ? "Six channels against estimated distance — hover, drag to zoom (mouse), or focus the chart and use ← → + − 0." : "Six channels against time from each lap's start — hover, drag to zoom (mouse), or focus the chart and use ← → + − 0."}
        action={<button className="btn sm" onClick={exportCSV}><Download />Raw CSV · {rowsA.length + rowsB.length} samples</button>}>
        {distError && (
          <div className="notice tl-gap-notice" role="status"><Info /><p><strong>{distError}.</strong> At least one lap has a sample gap over three seconds, so speed can't be integrated into distance. Showing time-based traces instead; the estimated delta and mini-sector map are unavailable.</p></div>
        )}
        <Glass className="tl-lab reveal">
          <div className="tl-toolbar">
            <Segmented<XKey> label="Horizontal axis" value={mode} onChange={(v) => !distError && setMode(v)}
              options={[{ value: "d", label: <span className={cx(distError && "tl-disabled")}>Distance <small>est.</small></span> }, { value: "t", label: "Time" }]} />
            <div className="tl-presets" role="group" aria-label="Window presets">
              {presets.map((p) => {
                const on = Math.abs(p.w[0] - win[0]) < end * 0.002 && Math.abs(p.w[1] - win[1]) < end * 0.002;
                return <button key={p.id} type="button" className={cx("tl-preset", on && "on")} aria-pressed={on} onClick={() => setWin(clampWin(p.w))}>{p.label}</button>;
              })}
            </div>
            <div className="tl-zoom" role="group" aria-label="Zoom and pan">
              <button className="icon-btn" onClick={() => pan(-1)} aria-label="Pan left" disabled={win[0] <= 0}><ChevronLeft /></button>
              <button className="icon-btn" onClick={() => zoom(1.6)} aria-label="Zoom out" disabled={span >= end}><Minus /></button>
              <button className="icon-btn" onClick={() => zoom(0.6)} aria-label="Zoom in" disabled={span <= minSpan * 1.01}><Plus /></button>
              <button className="icon-btn" onClick={() => pan(1)} aria-label="Pan right" disabled={win[1] >= end}><ChevronRight /></button>
              <button className="icon-btn" onClick={() => setWin([0, end])} aria-label="Reset zoom" disabled={win[0] <= 0 && win[1] >= end}><Maximize2 /></button>
            </div>
            <span className="tl-window faint xsmall">{fmtX(win[0], mode, span)} – {fmtX(win[1], mode, span)}</span>
          </div>
          <Overview rowsA={rowsA} rowsB={rowsB} xKey={mode} end={end} win={win} colours={colours} onWin={(w) => setWin(clampWin(w))} sectors={sectors} />
          <div className="tl-body">
            <TraceStack rowsA={rowsA} rowsB={rowsB} xKey={mode} win={win} colours={colours} cursor={cursor} onCursor={setCursor}
              onWin={(w) => setWin(clampWin(w))} onReset={() => setWin([0, end])} onZoom={zoom} sectors={sectors} names={[driverA.name_acronym, driverB.name_acronym]} />
            <Readout rowsA={rowsA} rowsB={rowsB} xKey={mode} cursor={cursor} colours={colours} driverA={driverA} driverB={driverB} year={year} delta={mode === "d" ? delta : []} />
          </div>
        </Glass>
        <p className="source">
          Speed, throttle, brake, gear, RPM and DRS are observed values as received. Distance is <strong>estimated</strong> by trapezoidal integration of speed and isn't rescaled to an official lap length. Sector split lines use {driverA.name_acronym}'s measured sector times.
          DRS codes are shown raw — their meaning varies by season{+year >= 2026 ? " (DRS was replaced by active aerodynamics in 2026)" : ""}.
        </p>
        <Source value={meta ? { data: null, meta } : undefined} label="Car data" />
      </Section>

      <Section id="where-time-goes" title="Where the time goes" subtitle={<>Estimated gap along the lap · <strong>B − A</strong>: above zero {driverA.name_acronym} is ahead, below zero {driverB.name_acronym} is ahead.</>}>
        <div className="tl-split">
          <Glass className="card tl-delta reveal">
            <div className="card-title">
              <h3>Estimated delta</h3>
              <span className="chip yellow">Estimate</span>
            </div>
            {mode === "d" && delta.length ? (
              <DeltaChart delta={delta} win={win} cursor={cursor} onCursor={setCursor} colours={colours} names={[driverA.name_acronym, driverB.name_acronym]} />
            ) : (
              <div className="tl-delta-off">
                <p className="muted small">{distError ? "The delta needs a gap-free speed trace for distance alignment, which these laps don't have." : "The delta is aligned by estimated distance."}</p>
                {!distError && <button className="btn sm" onClick={() => setMode("d")}>Switch to distance</button>}
              </div>
            )}
            <p className="source">Elapsed time compared at equal speed-integrated distance, over the overlapping distance only. Small integration errors accumulate, so the final value can differ from the measured lap-time difference.</p>
          </Glass>
          <TrackMapCard rowsA={rowsA} lapA={lapA} lapB={lapB} driverA={driverA} sessionKey={session?.session_key} delta={delta} xKey={mode} cursor={cursor} onCursor={setCursor} colours={colours} names={[driverA.name_acronym, driverB.name_acronym]} />
        </div>
      </Section>

      <Section id="corners" title="Corner analysis" subtitle={<>Braking zones found automatically on the speed traces, compared corner by corner. <span className="chip yellow">Automated · estimated distance</span></>}>
        {mode === "d" && delta.length ? (
          <CornerAnalysis rowsA={rowsA} rowsB={rowsB} delta={delta} colours={colours} names={[driverA.name_acronym, driverB.name_acronym]}
            cursor={cursor} onCursor={setCursor} onZoom={(w) => setWin(clampWin(w))} />
        ) : (
          <Glass className="card tl-delta-off">
            <p className="muted small">{distError ? "Corner analysis needs gap-free speed traces aligned by estimated distance, which these laps don't have." : "Corner analysis works on estimated distance."}</p>
            {!distError && <button className="btn sm" onClick={() => setMode("d")}>Switch to distance</button>}
          </Glass>
        )}
      </Section>
    </>
  );
}

/* ───────────────────────── Measuring hook ───────────────────────── */
function useWidth<T extends HTMLElement>() {
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

/** Build an SVG path for one channel inside the window (one sample of margin each side). */
function channelPath(rows: Row[], xKey: XKey, field: Field, win: Win, sx: (x: number) => number, sy: (v: number) => number, step?: boolean) {
  if (!rows.length) return "";
  const i0 = Math.max(0, idxLE(rows, xKey, win[0]));
  const i1 = Math.min(rows.length - 1, idxLE(rows, xKey, win[1]) + 1);
  let d = "", prevT = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const r = rows[i];
    const X = sx(r[xKey]).toFixed(1), Y = sy(r[field]).toFixed(1);
    if (!d || r.t - prevT > 3) d += `M${X},${Y}`;
    else d += step ? `H${X}V${Y}` : `L${X},${Y}`;
    prevT = r.t;
  }
  return d;
}

/* ───────────────────────── Overview brush ───────────────────────── */
function Overview({ rowsA, rowsB, xKey, end, win, colours, onWin, sectors }: {
  rowsA: Row[]; rowsB: Row[]; xKey: XKey; end: number; win: Win; colours: [string, string]; onWin: (w: Win) => void; sectors: number[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 46;
  const w = Math.max(1, width - PAD_L - PAD_R);
  const sx = (x: number) => PAD_L + (x / (end || 1)) * w;
  const maxV = Math.max(1, ...rowsA.map((r) => r.speed), ...rowsB.map((r) => r.speed));
  const sy = (v: number) => 4 + (1 - v / maxV) * (H - 8);
  const paths = useMemo(() => width ? [channelPath(rowsA, xKey, "speed", [0, end], sx, sy), channelPath(rowsB, xKey, "speed", [0, end], sx, sy)] : ["", ""],
    [rowsA, rowsB, xKey, end, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<{ kind: "l" | "r" | "pan"; start: number; win: Win } | null>(null);
  const toX = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(end, ((clientX - rect.left - PAD_L) / w) * end));
  };
  const down = (e: ReactPointerEvent) => {
    const x = toX(e.clientX), px = e.clientX - ref.current!.getBoundingClientRect().left;
    const l = sx(win[0]), r = sx(win[1]);
    let kind: "l" | "r" | "pan" = "pan";
    if (Math.abs(px - l) < 10) kind = "l";
    else if (Math.abs(px - r) < 10) kind = "r";
    else if (px < l || px > r) { const s = win[1] - win[0]; onWin([x - s / 2, x + s / 2]); drag.current = { kind: "pan", start: x, win: [x - s / 2, x + s / 2] }; (e.target as Element).setPointerCapture(e.pointerId); return; }
    drag.current = { kind, start: x, win };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const x = toX(e.clientX), dx = x - g.start;
    if (g.kind === "pan") onWin([g.win[0] + dx, g.win[1] + dx]);
    else if (g.kind === "l") onWin([Math.min(x, g.win[1] - end * 0.02), g.win[1]]);
    else onWin([g.win[0], Math.max(x, g.win[0] + end * 0.02)]);
  };
  const full = win[0] <= 0 && win[1] >= end;
  return (
    <div ref={ref} className="tl-overview" aria-hidden>
      {width > 0 && (
        <svg width={width} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          <rect x={PAD_L} y={0} width={w} height={H} rx={10} className="tl-ov-bg" />
          {sectors.map((s, i) => <line key={i} x1={sx(s)} x2={sx(s)} y1={4} y2={H - 4} className="tl-ov-sector" />)}
          <path d={paths[1]} stroke={colours[1]} className="tl-ov-line" />
          <path d={paths[0]} stroke={colours[0]} className="tl-ov-line" />
          {!full && (
            <>
              <rect x={PAD_L} y={0} width={Math.max(0, sx(win[0]) - PAD_L)} height={H} className="tl-ov-dim" />
              <rect x={sx(win[1])} y={0} width={Math.max(0, PAD_L + w - sx(win[1]))} height={H} className="tl-ov-dim" />
            </>
          )}
          <rect x={sx(win[0])} y={1} width={Math.max(2, sx(win[1]) - sx(win[0]))} height={H - 2} rx={9} className="tl-ov-win" />
          <rect x={sx(win[0]) - 3} y={H / 2 - 9} width={6} height={18} rx={3} className="tl-ov-handle" />
          <rect x={sx(win[1]) - 3} y={H / 2 - 9} width={6} height={18} rx={3} className="tl-ov-handle" />
        </svg>
      )}
      <span className="tl-ov-label">Overview · drag to pan, pull the handles to resize</span>
    </div>
  );
}

/* ───────────────────────── Stacked channels ───────────────────────── */
function TraceStack({ rowsA, rowsB, xKey, win, colours, cursor, onCursor, onWin, onReset, onZoom, sectors, names }: {
  rowsA: Row[]; rowsB: Row[]; xKey: XKey; win: Win; colours: [string, string]; cursor: number | null; onCursor: (x: number | null) => void;
  onWin: (w: Win) => void; onReset: () => void; onZoom: (f: number) => void; sectors: number[]; names: [string, string];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(1, width - PAD_L - PAD_R);
  const span = win[1] - win[0] || 1;
  const sx = (x: number) => PAD_L + ((x - win[0]) / span) * w;
  const toX = (px: number) => win[0] + ((px - PAD_L) / w) * span;

  // Vertical domains from the whole lap so scales don't jump while zooming.
  const bands = useMemo(() => {
    const all = [...rowsA, ...rowsB];
    const mx = (f: Field) => Math.max(...all.map((r) => r[f]));
    const mn = (f: Field) => Math.min(...all.map((r) => r[f]));
    let top = 0;
    return activeChannels(all).map((c) => {
      let lo = 0, hi = 100;
      if (c.key === "speed") hi = Math.ceil((mx("speed") + 5) / 50) * 50;
      else if (c.key === "throttle") hi = Math.max(100, mx("throttle"));
      else if (c.key === "brake") hi = Math.max(100, mx("brake"));
      else if (c.key === "n_gear") hi = Math.max(8, mx("n_gear"));
      else if (c.key === "rpm") { lo = Math.max(0, Math.floor(mn("rpm") / 2000) * 2000); hi = Math.max(lo + 1000, Math.ceil(mx("rpm") / 1000) * 1000); }
      else if (c.key === "drs") hi = Math.max(14, mx("drs"));
      const y0 = top + HEAD, y1 = y0 + c.h;
      top = y1 + GAP;
      const sy = (v: number) => y1 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * c.h;
      return { ...c, lo, hi, y0, y1, sy };
    });
  }, [rowsA, rowsB]);
  const plotBottom = bands[bands.length - 1].y1;
  const H = plotBottom + AXIS;

  const paths = useMemo(() => {
    if (!width) return [];
    return bands.map((band) => {
      if (band.lanes) {
        // Two lanes: Driver A on top, Driver B below; filled where the pedal is pressed.
        const lane = (rows: Row[], y0: number, h: number) => {
          const i0 = Math.max(0, idxLE(rows, xKey, win[0])), i1 = Math.min(rows.length - 1, idxLE(rows, xKey, win[1]) + 1);
          let d = "";
          for (let i = i0; i < i1; i++) {
            const r = rows[i], n = rows[i + 1];
            if (r.brake > 0 && n.t - r.t <= 3) {
              const x0 = sx(r[xKey]), x1 = sx(n[xKey]);
              const hh = (Math.min(100, r.brake) / 100) * h;
              d += `M${x0.toFixed(1)},${(y0 + h - hh).toFixed(1)}H${x1.toFixed(1)}V${(y0 + h).toFixed(1)}H${x0.toFixed(1)}Z`;
            }
          }
          return d;
        };
        const lh = (band.h - 6) / 2;
        return { a: lane(rowsA, band.y0, lh), b: lane(rowsB, band.y0 + lh + 6, lh) };
      }
      return { a: channelPath(rowsA, xKey, band.key, win, sx, band.sy, band.step), b: channelPath(rowsB, xKey, band.key, win, sx, band.sy, band.step) };
    });
  }, [bands, rowsA, rowsB, xKey, win, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const ticks = useMemo(() => {
    const step = niceStep(span, Math.max(2, Math.floor(w / 110)));
    const list: number[] = [];
    for (let v = Math.ceil(win[0] / step) * step; v <= win[1] + 1e-9; v += step) list.push(v);
    return list;
  }, [win, span, w]);

  const [brush, setBrush] = useState<[number, number] | null>(null);
  const dragStart = useRef<number | null>(null);
  const local = (e: { clientX: number }) => e.clientX - ref.current!.getBoundingClientRect().left;
  const clampX = (px: number) => Math.max(PAD_L, Math.min(PAD_L + w, px));
  const onDown = (e: ReactPointerEvent<SVGRectElement>) => {
    const px = clampX(local(e));
    onCursor(toX(px));
    if (e.pointerType === "mouse" && e.button === 0) {
      dragStart.current = px;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const px = clampX(local(e));
    onCursor(toX(px));
    if (dragStart.current !== null && Math.abs(px - dragStart.current) > 4) setBrush([dragStart.current, px]);
  };
  const onUp = () => {
    if (brush && Math.abs(brush[1] - brush[0]) > 8) {
      const a = toX(Math.min(...brush)), b = toX(Math.max(...brush));
      onWin([a, b]);
    }
    dragStart.current = null;
    setBrush(null);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const stepX = span / (e.shiftKey ? 20 : 200);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const base = cursor ?? (e.key === "ArrowRight" ? win[0] : win[1]);
      const next = Math.max(win[0], Math.min(win[1], base + (e.key === "ArrowRight" ? stepX : -stepX)));
      onCursor(next);
    } else if (e.key === "+" || e.key === "=") { e.preventDefault(); onZoom(0.6); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); onZoom(1.6); }
    else if (e.key === "0") { e.preventDefault(); onReset(); }
    else if (e.key === "Escape") onCursor(null);
    else if (e.key === "Home") { e.preventDefault(); onCursor(win[0]); }
    else if (e.key === "End") { e.preventDefault(); onCursor(win[1]); }
  };
  const showCursor = cursor !== null && cursor >= win[0] && cursor <= win[1];
  const cx0 = showCursor ? sx(cursor!) : 0;

  return (
    <div
      ref={ref}
      className="tl-stack"
      tabIndex={0}
      role="group"
      aria-label={`Telemetry channels for ${names[0]} and ${names[1]}. Use left and right arrows to move the crosshair, plus and minus to zoom, 0 to reset.`}
      onKeyDown={onKey}
    >
      {width > 0 && (
        <svg width={width} height={H} className="tl-svg" aria-hidden>
          <defs>
            <clipPath id="tl-clip"><rect x={PAD_L} y={0} width={w} height={H} /></clipPath>
            <linearGradient id="tl-speed-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={colours[0]} stopOpacity="0.28" />
              <stop offset="1" stopColor={colours[0]} stopOpacity="0" />
            </linearGradient>
          </defs>
          {bands.map((band, i) => (
            <g key={band.key}>
              <text x={PAD_L} y={band.y0 - 6} className="tl-band-label">{band.label.toUpperCase()}<tspan className="tl-band-unit">{band.unit ? "  " + band.unit : ""}</tspan></text>
              <rect x={PAD_L} y={band.y0} width={w} height={band.h} rx={8} className="tl-band-bg" />
              {!band.lanes && [band.lo, (band.lo + band.hi) / 2, band.hi].map((v, k) => (
                <g key={k}>
                  {k === 1 && <line x1={PAD_L} x2={PAD_L + w} y1={band.sy(v)} y2={band.sy(v)} className="tl-grid" />}
                  <text x={PAD_L - 8} y={band.sy(v) + (k === 0 ? 0 : k === 2 ? 8 : 4)} className="tl-tick" textAnchor="end">
                    {band.key === "rpm" ? `${Math.round(v / 1000)}k` : band.key === "n_gear" ? Math.round(v) : Math.round(v)}
                  </text>
                </g>
              ))}
              {band.lanes && (
                <>
                  <text x={PAD_L - 8} y={band.y0 + (band.h - 6) / 4 + 4} className="tl-tick" textAnchor="end" style={{ fill: colours[0] }}>{names[0]}</text>
                  <text x={PAD_L - 8} y={band.y0 + ((band.h - 6) * 3) / 4 + 10} className="tl-tick" textAnchor="end" style={{ fill: colours[1] }}>{names[1]}</text>
                </>
              )}
              <g clipPath="url(#tl-clip)">
                {band.lanes ? (
                  <>
                    <path d={paths[i]?.a} fill={colours[0]} className="tl-lane" />
                    <path d={paths[i]?.b} fill={colours[1]} className="tl-lane" />
                  </>
                ) : (
                  <>
                    {band.key === "speed" && paths[i]?.a && <path d={paths[i].a + `L${sx(Math.min(win[1], rowsA.at(-1)![xKey])).toFixed(1)},${band.y1}L${sx(Math.max(win[0], rowsA[0][xKey])).toFixed(1)},${band.y1}Z`} fill="url(#tl-speed-fill)" />}
                    <path d={paths[i]?.b} stroke={colours[1]} className={cx("tl-line", band.key === "speed" && "thick")} />
                    <path d={paths[i]?.a} stroke={colours[0]} className={cx("tl-line", band.key === "speed" && "thick")} />
                  </>
                )}
              </g>
            </g>
          ))}
          {sectors.map((s, i) => s > win[0] && s < win[1] ? (
            <g key={i}>
              <line x1={sx(s)} x2={sx(s)} y1={bands[0].y0} y2={plotBottom} className="tl-sector-line" />
              <text x={sx(s) + 5} y={bands[0].y0 + 13} className="tl-sector-text">S{i + 1}│S{i + 2}</text>
            </g>
          ) : null)}
          {ticks.map((t) => (
            <text key={t} x={sx(t)} y={plotBottom + 18} className="tl-tick" textAnchor="middle">{fmtX(t, xKey, span)}</text>
          ))}
          {brush && <rect x={Math.min(...brush)} y={bands[0].y0} width={Math.abs(brush[1] - brush[0])} height={plotBottom - bands[0].y0} className="tl-brush" />}
          {showCursor && (
            <g className="tl-cursor">
              <line x1={cx0} x2={cx0} y1={bands[0].y0 - 4} y2={plotBottom + 4} />
              {bands.filter((b) => !b.lanes).map((band) => (
                [rowsA, rowsB].map((rows, k) => {
                  const v = valueAt(rows, xKey, band.key, cursor!, band.step);
                  return v === null ? null : <circle key={band.key + k} cx={cx0} cy={band.sy(v)} r={band.key === "speed" ? 4.5 : 3.5} fill={colours[k]} />;
                })
              ))}
            </g>
          )}
          <rect
            x={PAD_L} y={bands[0].y0 - HEAD} width={w} height={plotBottom - bands[0].y0 + HEAD + AXIS}
            className="tl-hit"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onPointerLeave={(e) => { if (e.pointerType === "mouse" && dragStart.current === null) onCursor(null); }}
            onDoubleClick={onReset}
          />
        </svg>
      )}
    </div>
  );
}

/* ───────────────────────── Readout ───────────────────────── */
function Readout({ rowsA, rowsB, xKey, cursor, colours, driverA, driverB, year, delta }: {
  rowsA: Row[]; rowsB: Row[]; xKey: XKey; cursor: number | null; colours: [string, string]; driverA: ArchiveDriver; driverB: ArchiveDriver; year: string;
  delta: { distance: number; delta: number }[];
}) {
  const stats = useMemo(() => {
    const s = (rows: Row[]) => ({
      top: Math.max(...rows.map((r) => r.speed)),
      rpm: Math.max(...rows.map((r) => r.rpm)),
      full: (rows.filter((r) => r.throttle >= 98).length / rows.length) * 100,
      brake: (rows.filter((r) => r.brake > 0).length / rows.length) * 100,
    });
    return [s(rowsA), s(rowsB)];
  }, [rowsA, rowsB]);
  const d = cursor !== null && xKey === "d" ? deltaAt(delta, cursor) : null;
  return (
    <aside className="tl-readout glass glass-strong" aria-live="off">
      <div className="tl-ro-head">
        <span className="eyebrow">{cursor === null ? "Lap maxima" : "Crosshair"}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.strong key={cursor === null ? "none" : "pos"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="tl-ro-pos">
            {cursor === null ? "Hover the traces" : xKey === "d" ? `${Math.round(cursor).toLocaleString()} m` : `${cursor.toFixed(2)} s`}
          </motion.strong>
        </AnimatePresence>
      </div>
      <div className="tl-ro-grid">
        <span />
        {[driverA, driverB].map((dr, k) => (
          <span key={k} className="tl-ro-driver" style={{ "--tint": colours[k] } as CSSProperties}>
            <DriverBadge driver={dr} year={year} size={22} colour={colours[k]} />{dr.name_acronym}
          </span>
        ))}
        {cursor === null ? (
          <>
            <span className="tl-ro-label">Top speed</span>{stats.map((s, k) => <b key={k}>{Math.round(s.top)}<small> km/h</small></b>)}
            <span className="tl-ro-label">Peak RPM</span>{stats.map((s, k) => <b key={k}>{Math.round(s.rpm).toLocaleString()}</b>)}
            <span className="tl-ro-label">Full throttle</span>{stats.map((s, k) => <b key={k}>{s.full.toFixed(0)}<small>%</small></b>)}
            <span className="tl-ro-label">On brake</span>{stats.map((s, k) => <b key={k}>{s.brake.toFixed(0)}<small>%</small></b>)}
          </>
        ) : (
          activeChannels([...rowsA, ...rowsB]).map((c) => (
            <ReadoutRow key={c.key} label={c.label} unit={c.key === "speed" ? "km/h" : ""}
              values={[valueAt(rowsA, xKey, c.key, cursor, c.step), valueAt(rowsB, xKey, c.key, cursor, c.step)].map((v) => formatValue(c.key, v))} />
          ))
        )}
      </div>
      {cursor !== null && xKey === "d" && (
        <div className="tl-ro-delta">
          <span>Est. gap B − A</span>
          <b style={{ color: d === null ? undefined : d > 0 ? colours[0] : d < 0 ? colours[1] : undefined }}>{signed(d)} s</b>
        </div>
      )}
      <p className="tl-ro-foot xsmall faint">{cursor === null ? "Maxima and shares of received samples on each lap." : xKey === "d" ? "At equal estimated distance." : "At equal time from lap start."}</p>
    </aside>
  );
}
function ReadoutRow({ label, unit, values }: { label: string; unit: string; values: string[] }) {
  return (
    <>
      <span className="tl-ro-label">{label}</span>
      {values.map((v, k) => <b key={k}>{v}{unit && v !== "—" && <small> {unit}</small>}</b>)}
    </>
  );
}

/* ───────────────────────── Delta chart ───────────────────────── */
function DeltaChart({ delta, win, cursor, onCursor, colours, names }: {
  delta: { distance: number; delta: number }[]; win: Win; cursor: number | null; onCursor: (x: number | null) => void; colours: [string, string]; names: [string, string];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 220, top = 14, bottom = H - 26;
  const w = Math.max(1, width - PAD_L - PAD_R);
  const span = win[1] - win[0] || 1;
  const sx = (x: number) => PAD_L + ((x - win[0]) / span) * w;
  const visible = delta.filter((p) => Number.isFinite(p.delta));
  const maxAbs = Math.max(0.05, ...visible.map((p) => Math.abs(p.delta)));
  const lim = niceStep(maxAbs * 2, 4) * Math.ceil(maxAbs / niceStep(maxAbs * 2, 4));
  const mid = (top + bottom) / 2;
  const sy = (v: number) => mid - (v / lim) * (mid - top);
  const pts = visible.filter((p, i) => (p.distance >= win[0] && p.distance <= win[1]) || (visible[i + 1] && visible[i + 1].distance >= win[0] && p.distance < win[0]) || (visible[i - 1] && visible[i - 1].distance <= win[1] && p.distance > win[1]));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.distance).toFixed(1)},${sy(p.delta).toFixed(1)}`).join("");
  const area = pts.length ? line + `L${sx(pts.at(-1)!.distance).toFixed(1)},${mid}L${sx(pts[0].distance).toFixed(1)},${mid}Z` : "";
  const move = (e: ReactPointerEvent) => {
    const px = e.clientX - ref.current!.getBoundingClientRect().left;
    onCursor(Math.max(win[0], Math.min(win[1], win[0] + ((px - PAD_L) / w) * span)));
  };
  const cv = cursor !== null ? deltaAt(delta, cursor) : null;
  const showCursor = cursor !== null && cursor >= win[0] && cursor <= win[1];
  const final = visible.at(-1)?.delta ?? null;
  return (
    <div ref={ref} className="tl-delta-chart">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Estimated time gap between ${names[1]} and ${names[0]} along the lap; final estimated gap ${signed(final)} seconds`}>
          <defs>
            <clipPath id="tl-d-above"><rect x={PAD_L} y={0} width={w} height={mid} /></clipPath>
            <clipPath id="tl-d-below"><rect x={PAD_L} y={mid} width={w} height={H - mid} /></clipPath>
          </defs>
          {[-lim, -lim / 2, 0, lim / 2, lim].map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={PAD_L + w} y1={sy(v)} y2={sy(v)} className={v === 0 ? "tl-zero" : "tl-grid"} />
              <text x={PAD_L - 8} y={sy(v) + 4} className="tl-tick" textAnchor="end">{v === 0 ? "0" : signed(v, lim < 0.2 ? 2 : 1)}</text>
            </g>
          ))}
          <text x={PAD_L + 8} y={top + 12} className="tl-delta-tag" style={{ fill: colours[0] }}>{names[0]} ahead ▲</text>
          <text x={PAD_L + 8} y={bottom - 6} className="tl-delta-tag" style={{ fill: colours[1] }}>{names[1]} ahead ▼</text>
          <path d={area} fill={colours[0]} opacity={0.22} clipPath="url(#tl-d-above)" />
          <path d={area} fill={colours[1]} opacity={0.22} clipPath="url(#tl-d-below)" />
          <path d={line} className="tl-delta-line" />
          {showCursor && cv !== null && (
            <g className="tl-cursor">
              <line x1={sx(cursor!)} x2={sx(cursor!)} y1={top} y2={bottom} />
              <circle cx={sx(cursor!)} cy={sy(cv)} r={4.5} fill={cv >= 0 ? colours[0] : colours[1]} />
            </g>
          )}
          <rect x={PAD_L} y={0} width={w} height={H} className="tl-hit" onPointerMove={move} onPointerDown={move} onPointerLeave={(e) => e.pointerType === "mouse" && onCursor(null)} />
          <text x={PAD_L + w} y={H - 6} className="tl-tick" textAnchor="end">{fmtX(win[1], "d", span)}</text>
          <text x={PAD_L} y={H - 6} className="tl-tick">{fmtX(win[0], "d", span)}</text>
        </svg>
      )}
      <div className="tl-delta-final">
        <span className="faint xsmall">End of overlap</span>
        <b style={{ color: final === null ? undefined : final > 0 ? colours[0] : colours[1] }}>{signed(final)} s</b>
      </div>
    </div>
  );
}

/* ───────────────────────── Mini track map ───────────────────────── */
const SPEED_STOPS: [number, [number, number, number]][] = [[0, [72, 80, 214]], [0.35, [36, 178, 214]], [0.6, [96, 210, 130]], [0.8, [250, 204, 21]], [1, [255, 69, 58]]];
function speedColour(f: number) {
  const x = Math.max(0, Math.min(1, f));
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    const [p1, c1] = SPEED_STOPS[i];
    if (x <= p1) {
      const [p0, c0] = SPEED_STOPS[i - 1], r = (x - p0) / (p1 - p0 || 1);
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * r)).join(",")})`;
    }
  }
  return "rgb(255,69,58)";
}

function TrackMapCard({ rowsA, lapA, lapB, driverA, sessionKey, delta, xKey, cursor, onCursor, colours, names }: {
  rowsA: Row[]; lapA: Lap; lapB: Lap; driverA: ArchiveDriver; sessionKey?: number; delta: { distance: number; delta: number }[]; xKey: XKey;
  cursor: number | null; onCursor: (x: number | null) => void; colours: [string, string]; names: [string, string];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [want, setWant] = useState(false);
  const [state, setState] = useState<{ loading: boolean; data?: LocationSample[]; meta?: Envelope<unknown>["meta"]; error?: string }>({ loading: false });
  const [retry, setRetry] = useState(0);
  const [colourBy, setColourBy] = useState<"speed" | "faster" | "segments">("speed");
  const [segSide, setSegSide] = useState<"A" | "B">("A");
  const canFaster = delta.length > 1;
  const canSegments = hasSegments(lapA as SegLap) || hasSegments(lapB as SegLap);
  const by = colourBy === "faster" && !canFaster ? "speed" : colourBy === "segments" && !canSegments ? "speed" : colourBy;

  // Location is a separate request — only fetch once the card scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWant(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!want || !sessionKey) return;
    let live = true;
    setState({ loading: true });
    request<LocationSample[]>("openf1", "location", { session_key: sessionKey, driver_number: driverA.driver_number, "date>=": lapA.date_start!, "date<=": lapEnd(lapA) })
      .then((r) => {
        if (!live) return;
        const data = [...(r.data || [])].filter((p) => p && p.date && !(p.x === 0 && p.y === 0 && p.z === 0)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        setState(data.length < 10 ? { loading: false, error: "OpenF1 has too few location samples for this lap to draw the circuit." } : { loading: false, data, meta: r.meta });
      })
      .catch((e) => live && setState({ loading: false, error: (e as Error).message }));
    return () => { live = false; };
  }, [want, sessionKey, driverA.driver_number, lapA, retry]);

  const start = Date.parse(lapA.date_start!);
  const geo = useMemo(() => {
    const data = state.data;
    if (!data) return null;
    const xs = data.map((p) => p.x), ys = data.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
    const pts = data.map((p) => {
      const t = (Date.parse(p.date) - start) / 1000;
      return { x: p.x, y: -p.y, t, speed: valueAt(rowsA, "t", "speed", t), d: Number.isFinite(rowsA[0].d) ? valueAt(rowsA, "t", "d", t) : null };
    });
    const speeds = pts.map((p) => p.speed).filter((v): v is number => v !== null);
    const lo = Math.min(...speeds), hi = Math.max(...speeds);
    // Mini-sectors: equal slices of the overlapping estimated distance.
    const bins = 25, endD = delta.at(-1)?.distance || 0;
    const winner = Array.from({ length: bins }, (_, k) => {
      const g0 = deltaAt(delta, (endD * k) / bins), g1 = deltaAt(delta, (endD * (k + 1)) / bins);
      return g0 === null || g1 === null ? 0 : g1 - g0 > 0 ? 1 : g1 - g0 < 0 ? -1 : 0;
    });
    const segs = [] as { d: string; speed: string; faster: string }[];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      if (q.t - p.t > 3) continue;
      const v = p.speed !== null && q.speed !== null ? (p.speed + q.speed) / 2 : null;
      const md = p.d !== null && q.d !== null ? (p.d + q.d) / 2 : null;
      const bin = md !== null && endD ? Math.floor((md / endD) * bins) : -1;
      const wv = bin >= 0 && bin < bins ? winner[bin] : 0;
      segs.push({
        d: `M${p.x},${p.y}L${q.x},${q.y}`,
        speed: v === null ? "var(--label-4)" : speedColour((v - lo) / (hi - lo || 1)),
        faster: wv > 0 ? colours[0] : wv < 0 ? colours[1] : "var(--label-4)",
      });
    }
    const aWins = winner.filter((x) => x > 0).length, bWins = winner.filter((x) => x < 0).length;
    const outline = pts.map((p, i) => `${i && p.t - pts[i - 1].t <= 3 ? "L" : "M"}${p.x},${p.y}`).join("");
    const dot = Math.max(maxX - minX, maxY - minY) * 0.016;
    return { dot, viewBox: `${minX - pad} ${-maxY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`, segs, outline, lo, hi, aWins, bWins, pts, first: pts[0] };
  }, [state.data, rowsA, delta, colours, start]);

  const overlay = useSegmentOverlay(geo?.pts, lapA as SegLap, (segSide === "A" ? lapA : lapB) as SegLap);

  // Crosshair → Driver A's position on the map.
  const marker = useMemo(() => {
    if (!state.data || cursor === null) return null;
    const t = xKey === "t" ? cursor : valueAt(rowsA, "d", "t", cursor);
    if (t === null) return null;
    const p = sampleAt(state.data, start + t * 1000);
    return p ? { x: p.x, y: -p.y } : null;
  }, [state.data, cursor, xKey, rowsA, start]);

  const hover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current, ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !geo) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best = -1, bestD = Infinity;
    geo.pts.forEach((p, i) => { const dd = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2; if (dd < bestD) { bestD = dd; best = i; } });
    const p = geo.pts[best];
    if (!p) return;
    const x = xKey === "t" ? p.t : p.d;
    if (x !== null && x !== undefined) onCursor(x);
  };

  return (
    <Glass className="card tl-map reveal" style={{ "--i": 1 } as CSSProperties}>
      <div ref={ref} className="card-title">
        <h3><MapIcon size={16} />Track map · {names[0]} lap {lapA.lap_number}</h3>
        {(canFaster || canSegments) && (
          <Segmented label="Colour the track by" value={by} onChange={setColourBy} options={[
            { value: "speed" as const, label: "Speed" },
            ...(canFaster ? [{ value: "faster" as const, label: "Faster" }] : []),
            ...(canSegments ? [{ value: "segments" as const, label: "Mini-sectors" }] : []),
          ]} />
        )}
      </div>
      {!want || state.loading ? (
        <div className="tl-map-loading"><div className="spinner" /><span className="faint small">Loading {names[0]}'s location samples…</span></div>
      ) : state.error ? (
        <StateView error={state.error} onRetry={() => setRetry((r) => r + 1)} />
      ) : geo ? (
        <>
          <div className="tl-map-stage">
            <svg ref={svgRef} viewBox={geo.viewBox} role="img" aria-label={`Circuit drawn from ${names[0]}'s location samples, coloured by ${by === "speed" ? "speed" : "the faster driver per mini-sector"}`}
              onPointerMove={hover} onPointerDown={hover} onPointerLeave={(e) => e.pointerType === "mouse" && onCursor(null)} preserveAspectRatio="xMidYMid meet">
              <path d={geo.outline} className="tl-map-base" />
              {by === "segments" && overlay ? (
                <g className="tl-map-segs lab-map-segs" key={segSide}>
                  {overlay.segs.map((s, i) => <path key={i} d={s.d} stroke={SEG_COLOUR[s.status]} style={{ "--k": i } as CSSProperties}><title>{`S${s.sector} · segment ${s.index + 1}: ${SEG_LABEL[s.status]}`}</title></path>)}
                </g>
              ) : (
                <g className="tl-map-segs">
                  {geo.segs.map((s, i) => <path key={i} d={s.d} stroke={by === "faster" ? s.faster : s.speed} />)}
                </g>
              )}
              {geo.first && <circle cx={geo.first.x} cy={geo.first.y} r={geo.dot * 0.8} className="tl-map-start" />}
              {marker && <circle cx={marker.x} cy={marker.y} r={geo.dot} className="tl-map-marker" style={{ "--c": colours[0] } as CSSProperties} />}
            </svg>
          </div>
          {by === "segments" ? (
            <div className="lab-map-seg-foot">
              <div className="tl-presets" role="group" aria-label="Whose mini-sectors">
                {(["A", "B"] as const).map((k, i) => (
                  <button key={k} type="button" className={cx("tl-preset", segSide === k && "on")} aria-pressed={segSide === k} onClick={() => setSegSide(k)}
                    disabled={!hasSegments((k === "A" ? lapA : lapB) as SegLap)}>
                    <i className="ax-legend-dot" style={{ "--c": colours[i], marginRight: 6 } as CSSProperties} />{names[i]} L{(k === "A" ? lapA : lapB).lap_number}
                  </button>
                ))}
              </div>
              {overlay ? <SegLegend compact /> : <span className="faint xsmall">No segment data for this lap.</span>}
            </div>
          ) : by === "speed" ? (
            <div className="tl-map-legend">
              <span>{Math.round(geo.lo)} km/h</span>
              <i className="tl-ramp" />
              <span>{Math.round(geo.hi)} km/h</span>
            </div>
          ) : (
            <div className="tl-map-legend split">
              <span><i className="ax-legend-dot" style={{ "--c": colours[0] } as CSSProperties} />{names[0]} faster in {geo.aWins} of 25</span>
              <span><i className="ax-legend-dot" style={{ "--c": colours[1] } as CSSProperties} />{names[1]} faster in {geo.bWins} of 25</span>
            </div>
          )}
          <p className="source">
            Path from OpenF1 location samples (local coordinates), ○ marks the lap start. {by === "segments" ? <><strong>Approximate placement:</strong> sector boundaries come from {names[0]}'s measured sector times; inside each sector the mini-sectors are spread proportionally along the path, whereas real timing loops are unevenly spaced.</> : by === "faster" ? "The lap is cut into 25 equal slices of estimated distance (not the official mini-sectors); each goes to whoever loses less estimated time in it — an estimate." : `Colour shows ${names[0]}'s measured speed.`} Hover the map to move the crosshair.
          </p>
          <Source value={state.meta ? { data: null, meta: state.meta } : undefined} label="Location" />
        </>
      ) : (
        <Skeleton h={300} r={22} />
      )}
    </Glass>
  );
}
