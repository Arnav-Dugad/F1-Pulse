import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowDown, ArrowRight, ArrowUp, CloudRain, Droplets, ExternalLink, Flag as FlagIcon, Gauge, Info, Pause, Play, Radio, RotateCcw,
  SkipBack, SkipForward, Thermometer, Timer, Users, Wind,
} from "lucide-react";
import { request, useData } from "../api";
import { Link, parseRoute, setQuery, type Route } from "../lib/router";
import { plural } from "../lib/format";
import { sampleAt } from "../math.mjs";
import { Glass, Page, Section, Segmented, Skeleton, Source, StateView, Toggle, cx, useAmbient, useTitle } from "../ui/core";
import { TrackMap } from "../ui/media";
import { teamShortName } from "../lib/media";
import { LineChart } from "../ui/charts";
import type { ArchiveDriver, CarSample, Envelope, Lap, LocationSample } from "../types";
import {
  ArchiveControls, ArchiveHero, ArchiveStatus, ArchiveUnavailable, DriverBadge, LoadProgress, PaceSummary,
  circuitIdOf, displayName, emptyEnvelope, lapEnd, surname, teamHex, useArchive, utcClock, type Archive,
} from "./_archive";
import { FieldReplay } from "./_labfield";
import "./replay.css";

/* ───────────────────────── Types ───────────────────────── */
type PositionSample = { date: string; driver_number: number; position: number };
type ControlMsg = { date: string; category?: string | null; flag?: string | null; message: string; driver_number?: number | null; lap_number?: number | null; scope?: string | null; sector?: number | null };
type Stint = { driver_number: number; stint_number?: number; compound?: string | null; lap_start?: number | null; lap_end?: number | null; tyre_age_at_start?: number | null };
type Pit = { driver_number: number; lap_number?: number | null; date?: string | null; pit_duration?: number | null; stop_duration?: number | null; lane_duration?: number | null };
type WeatherSample = { date: string; air_temperature?: number | null; track_temperature?: number | null; humidity?: number | null; wind_speed?: number | null; wind_direction?: number | null; rainfall?: number | null; pressure?: number | null };
type RadioClip = { date: string; driver_number: number; recording_url?: string | null };
type Pt = { t: number; x: number; y: number };
type Meta = Envelope<unknown>["meta"];

const SPEEDS = ["0.5", "1", "2", "4", "8"] as const;
type View = "duel" | "field";
type Speed = (typeof SPEEDS)[number];

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};
const parseTimes = (list: LocationSample[]): Pt[] => list.map((s) => ({ t: Date.parse(s.date), x: s.x, y: -s.y }));
/** Last index with t ≤ x, or -1. */
function lastLE<T>(list: T[], x: number, key: (v: T) => number) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Flag / category → colour token for race-control messages. */
function controlTone(m: Pick<ControlMsg, "flag" | "category" | "message">) {
  const f = (m.flag || "").toUpperCase(), c = (m.category || "").toLowerCase(), msg = (m.message || "").toUpperCase();
  if (f === "RED") return { c: "var(--accent)", label: "Red flag" };
  if (f === "DOUBLE YELLOW") return { c: "var(--yellow)", label: "Double yellow" };
  if (f === "YELLOW") return { c: "var(--yellow)", label: "Yellow" };
  if (f === "GREEN" || f === "CLEAR") return { c: "var(--green)", label: f === "GREEN" ? "Green" : "Clear" };
  if (f === "BLUE") return { c: "var(--blue)", label: "Blue flag" };
  if (f === "CHEQUERED") return { c: "var(--label)", label: "Chequered" };
  if (f === "BLACK AND WHITE") return { c: "var(--label-2)", label: "Black & white" };
  if (c === "safetycar" || /SAFETY CAR/.test(msg)) return { c: "var(--orange)", label: /VIRTUAL/.test(msg) ? "VSC" : "Safety car" };
  if (c === "drs") return { c: "var(--teal)", label: "DRS" };
  if (c === "carevent") return { c: "var(--purple)", label: "Car event" };
  return { c: "var(--label-3)", label: m.category || "Notice" };
}

/* ───────────────────────── Replay data loader (sequential, rate-limit aware) ───────────────────────── */
type ReplayState = {
  sig: string; loading: boolean; step: number; label: string; error?: string;
  a?: LocationSample[]; b?: LocationSample[]; meta?: Meta;
  position?: PositionSample[]; positionError?: string; positionMeta?: Meta;
  control?: ControlMsg[]; controlError?: string; controlMeta?: Meta;
};
const TOTAL_STEPS = 4;

function useReplayData(ax: Archive, enabled = true) {
  const { sessionKey, aId, bId, chosenA, driverA, driverB } = ax;
  const sig = [sessionKey, aId, bId, chosenA?.lap_number].join(":");
  const ready = enabled && !!(sessionKey && chosenA && driverA && driverB && aId !== bId);
  const [state, setState] = useState<ReplayState>({ sig: "", loading: false, step: 0, label: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const clean = (list: LocationSample[]) =>
      [...(list || [])].filter((p) => p && p.date && Number.isFinite(p.x) && !(p.x === 0 && p.y === 0 && p.z === 0)).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    const window = { session_key: sessionKey!, "date>=": chosenA!.date_start!, "date<=": lapEnd(chosenA!) };
    const timer = setTimeout(async () => {
      try {
        const next: ReplayState = { sig, loading: true, step: 1, label: `Loading location 1 of 2 · ${driverA!.name_acronym}…` };
        setState(next);
        const x = await request<LocationSample[]>("openf1", "location", { ...window, driver_number: aId });
        if (!live) return;
        setState({ ...next, step: 2, label: `Loading location 2 of 2 · ${driverB!.name_acronym}…` });
        const y = await request<LocationSample[]>("openf1", "location", { ...window, driver_number: bId });
        if (!live) return;
        const a = clean(x.data), b = clean(y.data);
        if (a.length < 2 || b.length < 2) throw Error("There are not enough reported location samples in this window. Choose another lap or session.");
        const done: ReplayState = { sig, loading: true, step: 3, label: "Loading the running order…", a, b, meta: x.meta };
        setState(done);
        try {
          const p = await request<PositionSample[]>("openf1", "position", { session_key: sessionKey! });
          done.position = [...(p.data || [])].filter((r) => r && r.date && Number.isFinite(r.position)).sort((m, n) => Date.parse(m.date) - Date.parse(n.date));
          done.positionMeta = p.meta;
        } catch (e) { done.positionError = (e as Error).message; }
        if (!live) return;
        setState({ ...done, step: 4, label: "Loading the race-control log…" });
        try {
          const c = await request<ControlMsg[]>("openf1", "race_control", { session_key: sessionKey! });
          done.control = [...(c.data || [])].filter((r) => r && r.date && r.message).sort((m, n) => Date.parse(m.date) - Date.parse(n.date));
          done.controlMeta = c.meta;
        } catch (e) { done.controlError = (e as Error).message; }
        if (!live) return;
        setState({ ...done, loading: false, label: "" });
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
    state: fresh ? state : undefined,
    retry: () => setRetry((r) => r + 1),
  };
}

/* ───────────────────────── Page ───────────────────────── */
export default function Replay(_: { route: Route }) {
  useTitle("Race replay");
  const ax = useArchive("replay");
  useAmbient(ax.driverA ? ax.colours[0] : undefined, ax.driverB ? ax.colours[1] : undefined);
  const [view, setViewRaw] = useState<View>(() => (parseRoute().query.get("view") === "field" ? "field" : "duel"));
  const setView = (v: View) => { setViewRaw(v); setQuery({ view: v === "field" ? "field" : null }); };
  const data = useReplayData(ax, view === "duel");
  const circuit = circuitIdOf(ax.session);
  const s = data.state;

  const hero = (
    <ArchiveHero
      className="rp-hero"
      eyebrow={<><Play />OpenF1 archive · {ax.year}</>}
      title="Race replay"
      sub="Relive the racing line."
      lede="Two cars, or the whole field, on one shared session clock. Watch reported positions through a chosen window with glowing trails, the running order and race control in sync."
      session={ax.archived ? ax.session : undefined}
      graphic={ax.archived && circuit ? <TrackMap circuitId={circuit} cars={ax.driverA && ax.driverB ? ax.colours : []} label={`${ax.session?.circuit_short_name || "Circuit"} layout`} lap={11} /> : undefined}
    />
  );

  if (!ax.archived)
    return (
      <Page className="rp-page">
        {hero}
        <ArchiveUnavailable year={ax.year} feature="Race replay" />
      </Page>
    );

  return (
    <Page className="rp-page">
      {hero}
      <ArchiveControls ax={ax} />
      <div className="rp-status"><ArchiveStatus ax={ax} /></div>

      {ax.session && ax.drivers.length > 0 && (
        <>
          <Section id="circuit-stage" title="Circuit stage" subtitle={view === "duel" ? "Space to play or pause · ← → to step a second (Shift for five) · Home to rewind." : "Every driver for a 3-minute window — loads only when you ask. Focus the stage for Space and arrow keys."}
            action={
              <div className="rp-stage-actions">
                <Segmented<View> label="Replay mode" value={view} onChange={setView} options={[{ value: "duel", label: <><Gauge size={14} />Duel</> }, { value: "field", label: <><Users size={14} />Full field</> }]} />
                <Link className="btn sm" to="telemetry">Telemetry lab<ArrowRight /></Link>
              </div>
            }>
            <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}>
            {view === "field" ? <FieldReplay ax={ax} /> : <>
            {data.ready && data.loading && (
              <>
                <LoadProgress step={Math.max(1, s?.step || 0)} total={TOTAL_STEPS} label={s?.label || "Preparing request…"} />
                <div className="rp-grid" style={{ marginTop: 16 }}><Skeleton h={560} r={32} /><Skeleton h={560} r={28} /></div>
              </>
            )}
            {data.ready && !data.loading && s?.error && <StateView error={s.error} onRetry={data.retry} />}
            {!data.ready && !ax.lapsAData.loading && !ax.driverData.loading && (
              <StateView empty emptyTitle="Choose a replay window" emptyText="Driver A needs a valid timed lap (not a pit-out lap, under three minutes) to define the replay window." />
            )}
            {!data.loading && s?.a && s.b && ax.chosenA && ax.driverA && ax.driverB && (
              <ReplayLab
                key={s.sig}
                st={s} lap={ax.chosenA} driverA={ax.driverA} driverB={ax.driverB} drivers={ax.drivers} colours={ax.colours}
                year={ax.year} sessionKey={ax.sessionKey!}
              />
            )}
            </>}
            </motion.div>
            </AnimatePresence>
          </Section>

          <ArchiveDetails ax={ax} />
        </>
      )}

      <p className="ax-note">
        <Info />
        <span>
          This is a replay of the <strong>selected window</strong> (one lap in duel mode, chained 3-minute windows in full-field mode) using the location samples OpenF1 actually reported (≈3–4 Hz, local circuit coordinates) — not a full-race broadcast.
          Positions between samples are interpolated linearly; a car disappears wherever its samples are more than three seconds apart. Archive only: sessions appear after the provider's live window ends.
        </span>
      </p>
      <Source value={ax.sessionData.value?.meta.fetchedAt ? ax.sessionData.value : undefined} label="Sessions" />
    </Page>
  );
}

/* ───────────────────────── Replay lab: stage + tower + feed ───────────────────────── */
function ReplayLab({ st, lap, driverA, driverB, drivers, colours, year, sessionKey }: {
  st: ReplayState; lap: Lap; driverA: ArchiveDriver; driverB: ArchiveDriver; drivers: ArchiveDriver[]; colours: [string, string]; year: string; sessionKey: number;
}) {
  const a = st.a!, b = st.b!;
  const start = Date.parse(lap.date_start!);
  const dur = lap.lap_duration! * 1000;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("1");
  const tRef = useRef(0);
  tRef.current = t;
  const speedRef = useRef(1);
  speedRef.current = +speed;
  const labRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(100, now - last) : 0;
      last = now;
      const next = Math.min(dur, tRef.current + dt * speedRef.current);
      tRef.current = next;
      setT(next);
      if (next >= dur) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);

  const seek = (ms: number) => { const v = Math.max(0, Math.min(dur, ms)); tRef.current = v; setT(v); };
  const toggle = () => {
    if (!playing && tRef.current >= dur) seek(0);
    setPlaying((p) => !p);
  };

  // Keyboard transport: active while focus is on the page body or inside the replay lab.
  const actions = useRef({ toggle, seek });
  actions.current = { toggle, seek };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inLab = labRef.current?.contains(target);
      if (!(target === document.body || target.id === "main" || inLab)) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable) return;
      if (e.key === " " || e.code === "Space") {
        if (/^(BUTTON|A)$/.test(target.tagName)) return;
        e.preventDefault();
        actions.current.toggle();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (target.getAttribute("role") === "slider") return; // the scrubber handles its own arrows
        e.preventDefault();
        actions.current.seek(tRef.current + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 5000 : 1000));
      } else if (e.key === "Home") { e.preventDefault(); actions.current.seek(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const abs = start + t;
  const control = useMemo(() => (st.control || []).filter((m) => { const d = Date.parse(m.date); return d >= start && d <= start + dur; }), [st.control, start, dur]);
  const earlier = useMemo(() => (st.control || []).filter((m) => Date.parse(m.date) < start).slice(-3), [st.control, start]);

  // Optional car data for live speed / gear readouts (two extra requests, on demand).
  const [car, setCar] = useState<{ loading: boolean; step: number; a?: CarSample[]; b?: CarSample[]; error?: string; meta?: Meta }>({ loading: false, step: 0 });
  const loadCar = async () => {
    const params = { session_key: sessionKey, "date>=": lap.date_start!, "date<=": lapEnd(lap) };
    const clean = (l: CarSample[]) => [...(l || [])].filter((s) => s && s.date).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    try {
      setCar({ loading: true, step: 1 });
      const x = await request<CarSample[]>("openf1", "car_data", { ...params, driver_number: driverA.driver_number });
      setCar({ loading: true, step: 2 });
      const y = await request<CarSample[]>("openf1", "car_data", { ...params, driver_number: driverB.driver_number });
      setCar({ loading: false, step: 2, a: clean(x.data), b: clean(y.data), meta: x.meta });
    } catch (e) {
      setCar({ loading: false, step: 0, error: (e as Error).message });
    }
  };

  const tower = useTower(st.position, drivers, abs, start);

  return (
    <div className="rp-lab" ref={labRef}>
      <div className="rp-grid">
        <Glass className="rp-stage reveal" strong>
          <div className="rp-stage-head">
            <span className="rp-live"><span className={cx("rp-rec", playing && "on")} />Replay · {driverA.name_acronym} lap {lap.lap_number} window</span>
            <span className="rp-clock">
              <b>{fmtElapsed(t)}</b><span className="faint"> / {fmtElapsed(dur)}</span>
              <small>{utcClock(abs)} UTC</small>
            </span>
          </div>
          <Stage a={a} b={b} abs={abs} colours={colours} names={[driverA.name_acronym, driverB.name_acronym]} />
          <Transport
            t={t} dur={dur} playing={playing} speed={speed} onSpeed={setSpeed} onToggle={toggle} onSeek={(v) => { seek(v); }}
            markers={control.map((m) => ({ at: Date.parse(m.date) - start, tone: controlTone(m), text: m.message }))}
          />
          <div className="rp-readouts">
            {[driverA, driverB].map((d, k) => (
              <DriverReadout key={d.driver_number} d={d} colour={colours[k]} year={year} abs={abs}
                loc={k === 0 ? a : b} car={k === 0 ? car.a : car.b} position={tower.rows.find((r) => r.d.driver_number === d.driver_number)?.pos} />
            ))}
            <div className="rp-car-load">
              {car.a ? (
                <span className="faint xsmall"><Gauge size={13} />Car data loaded · speed &amp; gear are observed samples</span>
              ) : car.loading ? (
                <span className="faint xsmall"><span className="spinner sm" />Loading car data {car.step} of 2…</span>
              ) : (
                <button className="btn sm" onClick={loadCar}><Gauge />{car.error ? "Retry car data" : "Add speed & gear"}</button>
              )}
              {car.error && <span className="xsmall" style={{ color: "var(--accent)" }}>{car.error}</span>}
            </div>
          </div>
          <Source value={st.meta ? { data: null, meta: st.meta } : undefined} label="Location" />
        </Glass>

        <div className="rp-side">
          <Glass className="rp-panel rp-tower reveal" style={{ "--i": 1 } as CSSProperties}>
            <div className="rp-panel-head">
              <h3><Timer size={15} />Running order</h3>
              <span className="faint xsmall">{tower.rows.length ? `at ${utcClock(abs, 0)}` : ""}</span>
            </div>
            {st.positionError ? (
              <p className="muted small">Running order unavailable: {st.positionError}</p>
            ) : !tower.rows.length ? (
              <p className="muted small rp-empty">No position reported yet at this moment of the session.</p>
            ) : (
              <LayoutGroup>
                <ol className="rp-tower-list" tabIndex={0} aria-label="Running order">
                  {tower.rows.map((r) => {
                    const sel: number = r.d.driver_number === driverA.driver_number ? 0 : r.d.driver_number === driverB.driver_number ? 1 : -1;
                    const change = r.startPos !== undefined ? r.startPos - r.pos : 0;
                    return (
                      <motion.li layout="position" key={r.d.driver_number} transition={{ type: "spring", stiffness: 420, damping: 36 }}
                        className={cx("rp-tower-row", sel >= 0 && "sel")} style={{ "--tint": sel >= 0 ? colours[sel] : teamHex(r.d) } as CSSProperties}>
                        <span className={cx("rp-tpos", r.pos <= 3 && "p" + r.pos)}>{r.pos}</span>
                        <i className="rp-tbar" />
                        <span className="rp-tname"><b>{r.d.name_acronym}</b><small>{teamShortName(r.d.team_name || "")}</small></span>
                        {change !== 0 && (
                          <span role="img" className={cx("rp-tchange", change > 0 ? "up" : "down")} aria-label={`${change > 0 ? "Gained" : "Lost"} ${Math.abs(change)} since window start`}>
                            {change > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(change)}
                          </span>
                        )}
                      </motion.li>
                    );
                  })}
                </ol>
              </LayoutGroup>
            )}
            <p className="rp-panel-foot xsmall faint">Last position OpenF1 reported for each driver at the playback time; arrows compare with the start of the window.</p>
          </Glass>

          <Glass className="rp-panel rp-feed reveal" style={{ "--i": 2 } as CSSProperties}>
            <div className="rp-panel-head">
              <h3><FlagIcon size={15} />Race control</h3>
              <span className="faint xsmall">{plural(control.length, "message")} in window</span>
            </div>
            {st.controlError ? (
              <p className="muted small">Race-control log unavailable: {st.controlError}</p>
            ) : (
              <ControlFeed control={control} earlier={earlier} abs={abs} onSeek={(d) => seek(d - start)} />
            )}
          </Glass>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Position tower ───────────────────────── */
function useTower(position: PositionSample[] | undefined, drivers: ArchiveDriver[], abs: number, start: number) {
  const byDriver = useMemo(() => {
    const m = new Map<number, { t: number; p: number }[]>();
    for (const r of position || []) {
      const list = m.get(r.driver_number) || [];
      list.push({ t: Date.parse(r.date), p: r.position });
      m.set(r.driver_number, list);
    }
    return m;
  }, [position]);
  const at = (n: number, time: number) => {
    const list = byDriver.get(n);
    if (!list) return undefined;
    const i = lastLE(list, time, (v) => v.t);
    return i >= 0 ? list[i].p : undefined;
  };
  const key = drivers.map((d) => `${d.driver_number}:${at(d.driver_number, abs) ?? ""}`).join("|");
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return drivers
      .map((d) => ({ d, pos: at(d.driver_number, abs), startPos: at(d.driver_number, start) }))
      .filter((r): r is { d: ArchiveDriver; pos: number; startPos: number | undefined } => r.pos !== undefined)
      .sort((x, y) => x.pos - y.pos)
      .filter((r) => (seen.has(r.pos) ? false : (seen.add(r.pos), true)))
      .slice(0, drivers.length);
  }, [key, byDriver, start]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows };
}

/* ───────────────────────── Race-control feed ───────────────────────── */
function ControlFeed({ control, earlier, abs, onSeek }: { control: ControlMsg[]; earlier: ControlMsg[]; abs: number; onSeek: (absMs: number) => void }) {
  const shown = control.filter((m) => Date.parse(m.date) <= abs).reverse();
  const upcoming = control.length - shown.length;
  return (
    <div className="rp-feed-body">
      <ol className="rp-feed-list" aria-live="polite">
        <AnimatePresence initial={false}>
          {shown.map((m) => {
            const tone = controlTone(m);
            return (
              <motion.li key={m.date + m.message} layout initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }} className="rp-msg" style={{ "--c": tone.c } as CSSProperties}>
                <button type="button" onClick={() => onSeek(Date.parse(m.date))} aria-label={`Jump to ${utcClock(Date.parse(m.date), 0)}: ${m.message}`}>
                  <span className="rp-msg-meta"><i />{tone.label}<span>{utcClock(Date.parse(m.date), 0)}{m.lap_number ? ` · L${m.lap_number}` : ""}</span></span>
                  <span className="rp-msg-text">{m.message}</span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {!shown.length && <p className="muted small rp-empty">{control.length ? "No messages yet at this point in the window." : "Race control published nothing during this window."}</p>}
      {upcoming > 0 && <p className="faint xsmall">{plural(upcoming, "more message")} later in this window — marked on the timeline.</p>}
      {earlier.length > 0 && (
        <div className="rp-earlier">
          <span className="eyebrow">Before this window</span>
          {[...earlier].reverse().map((m) => {
            const tone = controlTone(m);
            return (
              <p key={m.date + m.message} className="rp-earlier-row" style={{ "--c": tone.c } as CSSProperties}>
                <i /><span>{utcClock(Date.parse(m.date), 0)}</span>{m.message}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Circuit stage ───────────────────────── */
function Stage({ a, b, abs, colours, names }: { a: LocationSample[]; b: LocationSample[]; abs: number; colours: [string, string]; names: [string, string] }) {
  const geo = useMemo(() => {
    const pa = parseTimes(a), pb = parseTimes(b);
    const all = [...pa, ...pb];
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const size = Math.max(maxX - minX, maxY - minY) || 1;
    const pad = size * 0.08;
    const path = pa.map((p, i) => `${i && p.t - pa[i - 1].t <= 3000 ? "L" : "M"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join("");
    return { pa, pb, size, path, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`, first: pa[0] };
  }, [a, b]);
  const r = geo.size * 0.013, font = geo.size * 0.03;
  const cars = [
    { pts: geo.pa, raw: a, colour: colours[0], name: names[0] },
    { pts: geo.pb, raw: b, colour: colours[1], name: names[1] },
  ].map((c) => {
    // At the very start of the window the first sample is often a moment away: snap to it.
    const first = c.raw.length ? Date.parse(c.raw[0].date) : NaN;
    const head = sampleAt(c.raw, abs) || (abs < first && first - abs < 3000 ? c.raw[0] : null);
    if (!head) return { ...c, head: null, trail: [] as Pt[] };
    const hi = lastLE(c.pts, abs, (p) => p.t);
    const trail: Pt[] = [];
    for (let i = hi; i >= 0 && c.pts[i].t > abs - 2600; i--) {
      if (trail.length && trail[trail.length - 1].t - c.pts[i].t > 3000) break;
      trail.push(c.pts[i]);
    }
    trail.reverse();
    trail.push({ t: abs, x: head.x, y: -head.y });
    return { ...c, head: { x: head.x, y: -head.y }, trail };
  });
  return (
    <div className="rp-stage-canvas">
      <svg viewBox={geo.viewBox} role="img" aria-label={`Circuit drawn from ${names[0]}'s reported positions with ${names[0]} and ${names[1]} animated on the shared session clock`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="rp-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={r * 0.9} /></filter>
        </defs>
        <path d={geo.path} className="rp-track-glow" />
        <path d={geo.path} className="rp-track-base" />
        <path d={geo.path} className="rp-track-line" />
        {geo.first && (
          <g className="rp-start">
            <circle cx={geo.first.x} cy={geo.first.y} r={r * 0.75} />
            {(() => {
              // Keep the label inside the drawing: anchor it away from whichever edge the start sits near.
              const [vx, , vw] = geo.viewBox.split(/\s+/).map(Number);
              const right = geo.first.x > vx + vw / 2;
              return <text x={geo.first.x + (right ? -r * 1.4 : r * 1.4)} y={geo.first.y - r * 1.2} fontSize={font * 0.62} textAnchor={right ? "end" : "start"}>WINDOW START</text>;
            })()}
          </g>
        )}
        {cars.map((c, k) => c.head ? (
          <g key={k} style={{ "--c": c.colour } as CSSProperties}>
            {c.trail.slice(1).map((p, i) => (
              <line key={i} x1={c.trail[i].x} y1={c.trail[i].y} x2={p.x} y2={p.y} className="rp-trail" style={{ opacity: ((i + 1) / c.trail.length) * 0.95 }} />
            ))}
            <circle cx={c.head.x} cy={c.head.y} r={r * 2.1} fill={c.colour} filter="url(#rp-glow)" opacity={0.75} />
            <circle cx={c.head.x} cy={c.head.y} r={r} className="rp-car" fill={c.colour} />
            <g transform={`translate(${c.head.x + r * 1.6} ${c.head.y - r * (k === 0 ? 1.6 : -1.6) - (k === 0 ? font * 0.9 : 0)})`}>
              <rect width={font * 0.7 * c.name.length + font * 0.7} height={font * 1.25} rx={font * 0.4} className="rp-tag" />
              <rect width={font * 0.22} height={font * 1.25} rx={font * 0.1} fill={c.colour} />
              <text x={font * 0.48} y={font * 0.92} fontSize={font} className="rp-tag-text">{c.name}</text>
            </g>
          </g>
        ) : null)}
      </svg>
      <div className="rp-stage-legend">
        {cars.map((c, k) => (
          <span key={k} className={cx(!c.head && "gap")}><i className="ax-legend-dot" style={{ "--c": c.colour } as CSSProperties} />{c.name}{!c.head && " · no sample"}</span>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Transport ───────────────────────── */
function Transport({ t, dur, playing, speed, onSpeed, onToggle, onSeek, markers }: {
  t: number; dur: number; playing: boolean; speed: Speed; onSpeed: (s: Speed) => void; onToggle: () => void; onSeek: (ms: number) => void;
  markers: { at: number; tone: { c: string; label: string }; text: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = dur ? (t / dur) * 100 : 0;
  const fromEvent = (e: ReactPointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * dur);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 5000 : 1000;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onSeek(t + step); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onSeek(t - step); }
    else if (e.key === "Home") { e.preventDefault(); onSeek(0); }
    else if (e.key === "End") { e.preventDefault(); onSeek(dur); }
    else if (e.key === "PageUp") { e.preventDefault(); onSeek(t + 10000); }
    else if (e.key === "PageDown") { e.preventDefault(); onSeek(t - 10000); }
  };
  return (
    <div className="rp-transport">
      <div className="rp-buttons">
        <button className="icon-btn" onClick={() => onSeek(t - 5000)} aria-label="Back five seconds"><SkipBack /></button>
        <button className="rp-play" onClick={onToggle} aria-label={playing ? "Pause replay" : t >= dur ? "Replay from the start" : "Play replay"}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={playing ? "pause" : t >= dur ? "again" : "play"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
              {playing ? <Pause /> : t >= dur ? <RotateCcw /> : <Play />}
            </motion.span>
          </AnimatePresence>
        </button>
        <button className="icon-btn" onClick={() => onSeek(t + 5000)} aria-label="Forward five seconds"><SkipForward /></button>
      </div>
      <div className="rp-timeline">
        <div
          ref={ref}
          className="rp-scrub"
          role="slider"
          tabIndex={0}
          aria-label="Replay timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur / 100) / 10}
          aria-valuenow={Math.round(t / 100) / 10}
          aria-valuetext={`${fmtElapsed(t)} of ${fmtElapsed(dur)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e); }}
          onPointerMove={(e) => dragging.current && fromEvent(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="rp-scrub-track"><div className="rp-scrub-fill" style={{ width: pct + "%" }} /></div>
          <div className="rp-scrub-thumb" style={{ left: pct + "%" }} />
        </div>
        <div className="rp-marks">
          {markers.map((m, i) => (
            <button key={i} type="button" className="rp-mark" style={{ left: (m.at / dur) * 100 + "%", "--c": m.tone.c } as CSSProperties}
              onClick={() => onSeek(m.at)} title={`${m.tone.label} · ${m.text}`} aria-label={`Jump to race-control message: ${m.text}`} />
          ))}
        </div>
      </div>
      <Segmented<Speed> label="Playback speed" value={speed} onChange={onSpeed} options={SPEEDS.map((s) => ({ value: s, label: s + "×" }))} />
    </div>
  );
}

/* ───────────────────────── Driver readout ───────────────────────── */
function DriverReadout({ d, colour, year, abs, loc, car, position }: {
  d: ArchiveDriver; colour: string; year: string; abs: number; loc: LocationSample[]; car?: CarSample[]; position?: number;
}) {
  const present = !!sampleAt(loc, abs);
  let sample: CarSample | undefined;
  if (car?.length) {
    const i = lastLE(car, abs, (s) => Date.parse(s.date));
    if (i >= 0 && abs - Date.parse(car[i].date) <= 1500) sample = car[i];
  }
  return (
    <div className={cx("rp-ro", !present && "gap")} style={{ "--tint": colour } as CSSProperties}>
      <DriverBadge driver={d} year={year} size={36} colour={colour} />
      <span className="rp-ro-name"><b>{surname(d)}</b><small>{position ? `P${position}` : "Position —"}{!present && " · no sample"}</small></span>
      {car && (
        <span className="rp-ro-stats">
          <span><b>{sample ? Math.round(sample.speed) : "—"}</b><small>km/h</small></span>
          <span><b>{sample ? (sample.n_gear === 0 ? "N" : sample.n_gear) : "—"}</b><small>gear</small></span>
          <span className="rp-ro-thr"><i style={{ "--v": sample ? Math.min(100, sample.throttle) / 100 : 0 } as CSSProperties} /><small>{sample ? (sample.brake > 0 ? "brake" : `${Math.round(sample.throttle)}%`) : "—"}</small></span>
        </span>
      )}
    </div>
  );
}

/* ───────────────────────── Archive detail tabs ───────────────────────── */
type Tab = "stints" | "pit" | "weather" | "race_control" | "team_radio" | "pace";
const TABS: { value: Tab; label: string }[] = [
  { value: "stints", label: "Stints" }, { value: "pit", label: "Pit stops" }, { value: "weather", label: "Weather" },
  { value: "race_control", label: "Race control" }, { value: "team_radio", label: "Team radio" }, { value: "pace", label: "Pace" },
];
const COMPOUNDS: Record<string, { c: string; ink: string; short: string }> = {
  SOFT: { c: "#E8333F", ink: "#fff", short: "S" }, MEDIUM: { c: "#F5C518", ink: "#111", short: "M" }, HARD: { c: "#F2F2F2", ink: "#111", short: "H" },
  INTERMEDIATE: { c: "#2FB45A", ink: "#fff", short: "I" }, WET: { c: "#2F7DE1", ink: "#fff", short: "W" },
};
const compound = (c?: string | null) => COMPOUNDS[(c || "").toUpperCase()] || { c: "#8E8E99", ink: "#fff", short: "?" };

function ArchiveDetails({ ax }: { ax: Archive }) {
  const [tab, setTab] = useState<Tab>("stints");
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const endpoint = tab === "pace" ? null : tab;
  const data = useData<any[]>(
    () => (visible && endpoint && ax.sessionKey ? request<any[]>("openf1", endpoint, { session_key: ax.sessionKey }) : Promise.resolve(emptyEnvelope<any[]>([]))),
    [visible, endpoint, ax.sessionKey],
  );
  const list = data.value?.data || [];
  return (
    <section className="section rp-details" id="session-detail" ref={ref}>
      <div className="section-head reveal">
        <div>
          <h2>Inside the session</h2>
          <p>Stints, pit stops, weather, the full race-control log and team radio — each loads when you open it.</p>
        </div>
      </div>
      <div className="rp-tabs reveal">
        <Segmented<Tab> label="Session detail" value={tab} onChange={setTab} options={TABS} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}>
          {tab === "pace" ? (
            <PaceSummary ax={ax} />
          ) : !visible || data.loading ? (
            <Skeleton h={360} r={28} />
          ) : data.error ? (
            <StateView error={data.error} onRetry={data.reload} />
          ) : !list.length ? (
            <StateView empty emptyTitle={`No ${TABS.find((x) => x.value === tab)!.label.toLowerCase()} published`} emptyText="OpenF1 has no records of this kind for this session." />
          ) : tab === "stints" ? (
            <Stints list={list as Stint[]} ax={ax} />
          ) : tab === "pit" ? (
            <Pits list={list as Pit[]} ax={ax} />
          ) : tab === "weather" ? (
            <WeatherPanel list={list as WeatherSample[]} />
          ) : tab === "race_control" ? (
            <ControlLog list={list as ControlMsg[]} ax={ax} />
          ) : (
            <TeamRadio list={list as RadioClip[]} ax={ax} />
          )}
          {tab !== "pace" && <Source value={data.value?.meta.fetchedAt ? data.value : undefined} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

const driverLookup = (ax: Archive) => new Map(ax.drivers.map((d) => [d.driver_number, d]));
const selectedTone = (ax: Archive, n: number) => (String(n) === ax.aId ? ax.colours[0] : String(n) === ax.bId ? ax.colours[1] : undefined);

function OnlySelected({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="rp-only">
      <span className="small muted">Selected drivers only</span>
      <Toggle checked={value} onChange={onChange} label="Show only the selected drivers" />
    </label>
  );
}

function Stints({ list, ax }: { list: Stint[]; ax: Archive }) {
  const lookup = driverLookup(ax);
  const maxLap = Math.max(1, ...list.map((s) => s.lap_end || s.lap_start || 0));
  const numbers = [...new Set(list.map((s) => s.driver_number))];
  const order = [...numbers].sort((x, y) => {
    const rank = (n: number) => (String(n) === ax.aId ? 0 : String(n) === ax.bId ? 1 : 2);
    return rank(x) - rank(y) || (lookup.get(x)?.team_name || "").localeCompare(lookup.get(y)?.team_name || "") || x - y;
  });
  const used = [...new Set(list.map((s) => (s.compound || "UNKNOWN").toUpperCase()))];
  return (
    <Glass className="card rp-stints">
      <div className="rp-stint-legend">
        {used.map((c) => <span key={c}><i style={{ background: compound(c).c }} />{c === "UNKNOWN" ? "Unreported" : c[0] + c.slice(1).toLowerCase()}</span>)}
        <span className="faint">· ring = used set at stint start</span>
      </div>
      <div className="rp-stint-scale" aria-hidden><span>Lap 1</span><span>Lap {Math.round(maxLap / 2)}</span><span>Lap {maxLap}</span></div>
      <div className="rp-stint-rows">
        {order.map((n, i) => {
          const d = lookup.get(n);
          const tone = selectedTone(ax, n);
          const stints = list.filter((s) => s.driver_number === n).sort((x, y) => (x.lap_start || 0) - (y.lap_start || 0));
          return (
            <div key={n} className={cx("rp-stint-row", tone && "sel")} style={{ "--tint": tone || teamHex(d), "--i": Math.min(i, 12) } as CSSProperties}>
              <span className="rp-stint-who">
                <DriverBadge driver={d} year={ax.year} size={26} colour={tone} />
                <b>{d?.name_acronym || "#" + n}</b>
              </span>
              <div className="rp-stint-track">
                {stints.map((s, k) => {
                  const from = Math.max(1, s.lap_start || 1), to = Math.max(from, s.lap_end || from);
                  const cp = compound(s.compound);
                  const laps = to - from + 1;
                  return (
                    <span key={k} className={cx("rp-stint", (s.tyre_age_at_start || 0) > 0 && "used")}
                      style={{ left: ((from - 1) / maxLap) * 100 + "%", width: (laps / maxLap) * 100 + "%", "--c": cp.c, "--ink": cp.ink } as CSSProperties}
                      title={`${d?.name_acronym || n} · ${s.compound || "Unreported compound"} · laps ${from}–${to} · tyre age at start ${s.tyre_age_at_start ?? "—"}`}>
                      <span>{cp.short}{laps >= Math.max(3, maxLap / 14) ? <small> {laps}</small> : null}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="source">Stint lap ranges and compounds as reported by OpenF1. Hover a bar for tyre age at the start of the stint.</p>
    </Glass>
  );
}

function Pits({ list, ax }: { list: Pit[]; ax: Archive }) {
  const [only, setOnly] = useState(false);
  const lookup = driverLookup(ax);
  const rows = list.filter((p) => !only || selectedTone(ax, p.driver_number)).sort((x, y) => Date.parse(x.date || "") - Date.parse(y.date || "") || (x.lap_number || 0) - (y.lap_number || 0));
  const lane = (p: Pit) => p.pit_duration ?? p.lane_duration ?? null;
  return (
    <Glass className="card flush rp-table-card">
      <div className="rp-table-head">
        <span className="small muted">{plural(list.length, "pit visit")} recorded</span>
        <OnlySelected value={only} onChange={setOnly} />
      </div>
      <div className="table-wrap" tabIndex={0}>
        <table className="tbl">
          <thead><tr><th>Driver</th><th className="r">Lap</th><th>UTC time</th><th className="r">Pit lane (s)</th><th className="r">Stationary (s)</th></tr></thead>
          <tbody>
            {rows.map((p, i) => {
              const d = lookup.get(p.driver_number);
              const tone = selectedTone(ax, p.driver_number);
              return (
                <tr key={i} className={cx(tone && "rp-sel-row")} style={{ "--tint": tone || teamHex(d) } as CSSProperties}>
                  <td><span className="rp-cell-driver"><i className="rp-dot" />{d ? displayName(d) : "#" + p.driver_number}</span></td>
                  <td className="r">{p.lap_number ?? "—"}</td>
                  <td>{p.date ? utcClock(Date.parse(p.date), 0) : "—"}</td>
                  <td className="r">{lane(p) !== null ? lane(p)!.toFixed(1) : "—"}</td>
                  <td className="r">{p.stop_duration != null ? p.stop_duration.toFixed(1) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted small" style={{ padding: 18 }}>No pit visits for the selected drivers.</p>}
      <p className="source" style={{ padding: "0 18px 16px" }}>Durations exactly as reported; pit-lane time includes entry and exit, stationary time is only published for some sessions.</p>
    </Glass>
  );
}

function WeatherPanel({ list }: { list: WeatherSample[] }) {
  const rows = [...list].filter((w) => w.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const range = (k: keyof WeatherSample) => {
    const v = rows.map((r) => r[k]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return v.length ? [Math.min(...v), Math.max(...v)] as const : null;
  };
  const air = range("air_temperature"), track = range("track_temperature"), hum = range("humidity"), wind = range("wind_speed");
  const rainy = rows.filter((r) => (r.rainfall || 0) > 0).length;
  const every = Math.max(1, Math.ceil(rows.length / 90));
  const sampled = rows.filter((_, i) => i % every === 0 || i === rows.length - 1);
  const fmt = (r: readonly [number, number] | null, unit: string, digits = 1) => (r ? (r[0] === r[1] ? `${r[0].toFixed(digits)}${unit}` : `${r[0].toFixed(digits)}–${r[1].toFixed(digits)}${unit}`) : "—");
  const series = [
    { id: "track", name: "Track", color: "#FF9F0A", values: sampled.map((r) => r.track_temperature ?? null) },
    { id: "air", name: "Air", color: "#64D2FF", values: sampled.map((r) => r.air_temperature ?? null) },
  ];
  const nums = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  return (
    <div className="rp-weather">
      <div className="kpis">
        <Glass className="kpi"><span className="label"><Thermometer size={13} /> Track</span><span className="value">{fmt(track, "°")}</span><span className="detail">Range across the session</span></Glass>
        <Glass className="kpi"><span className="label"><Thermometer size={13} /> Air</span><span className="value">{fmt(air, "°")}</span><span className="detail">Range across the session</span></Glass>
        <Glass className="kpi"><span className="label"><Droplets size={13} /> Humidity</span><span className="value">{fmt(hum, "%", 0)}</span></Glass>
        <Glass className="kpi"><span className="label"><Wind size={13} /> Wind</span><span className="value">{wind ? `${wind[1].toFixed(1)}` : "—"}<small className="faint" style={{ fontSize: "0.45em" }}> m/s max</small></span></Glass>
        <Glass className="kpi"><span className="label"><CloudRain size={13} /> Rainfall</span><span className="value" style={{ fontSize: 22 }}>{rainy ? "Reported" : "None"}</span><span className="detail">{rainy ? `${plural(rainy, "sample")} of ${rows.length} flag rain` : `${rows.length} samples, none flag rain`}</span></Glass>
      </div>
      {nums.length > 1 && (
        <Glass className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><h3>Temperatures through the session</h3><span className="eyebrow">°C · UTC</span></div>
          <LineChart ariaLabel="Track and air temperature through the session" series={series} labels={sampled.map((r) => utcClock(Date.parse(r.date), 0).slice(0, 5))}
            yMin={Math.floor(Math.min(...nums) - 2)} yMax={Math.ceil(Math.max(...nums) + 2)} yFormat={(v) => v.toFixed(0) + "°"} height={260} area />
        </Glass>
      )}
    </div>
  );
}

function ControlLog({ list, ax }: { list: ControlMsg[]; ax: Archive }) {
  const [limit, setLimit] = useState(60);
  const rows = [...list].filter((m) => m.date && m.message).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const lookup = driverLookup(ax);
  return (
    <Glass className="card flush rp-table-card">
      <div className="rp-table-head"><span className="small muted">{plural(rows.length, "message")} in the session log</span></div>
      <ol className="rp-log">
        {rows.slice(0, limit).map((m, i) => {
          const tone = controlTone(m);
          const d = m.driver_number ? lookup.get(m.driver_number) : undefined;
          return (
            <li key={i} className="rp-log-row" style={{ "--c": tone.c } as CSSProperties}>
              <span className="rp-log-time">{utcClock(Date.parse(m.date), 0)}{m.lap_number ? <small>L{m.lap_number}</small> : null}</span>
              <span className="rp-log-tag"><i />{tone.label}</span>
              <span className="rp-log-msg">{m.message}{d && <small> · {d.name_acronym}</small>}</span>
            </li>
          );
        })}
      </ol>
      {rows.length > limit && <div style={{ padding: "0 18px 16px" }}><button className="btn sm" onClick={() => setLimit((l) => l + 120)}>Show more ({rows.length - limit} remaining)</button></div>}
    </Glass>
  );
}

function TeamRadio({ list, ax }: { list: RadioClip[]; ax: Archive }) {
  const [only, setOnly] = useState(true);
  const [limit, setLimit] = useState(40);
  const lookup = driverLookup(ax);
  const rows = list.filter((r) => r.date && (!only || selectedTone(ax, r.driver_number))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return (
    <Glass className="card flush rp-table-card">
      <div className="rp-table-head">
        <span className="small muted">{plural(list.length, "clip")} published · recordings open on OpenF1's host in a new tab</span>
        <OnlySelected value={only} onChange={setOnly} />
      </div>
      <ul className="rp-radio">
        {rows.slice(0, limit).map((r, i) => {
          const d = lookup.get(r.driver_number);
          const tone = selectedTone(ax, r.driver_number);
          const ok = /^https:\/\//.test(r.recording_url || "");
          return (
            <li key={i} className="rp-radio-row" style={{ "--tint": tone || teamHex(d) } as CSSProperties}>
              <span className="rp-radio-icon"><Radio size={15} /></span>
              <DriverBadge driver={d} year={ax.year} size={30} colour={tone} />
              <span className="rp-radio-who"><b>{d ? displayName(d) : "#" + r.driver_number}</b><small>{utcClock(Date.parse(r.date), 0)} UTC</small></span>
              {ok ? (
                <a className="btn sm" href={r.recording_url!} target="_blank" rel="noopener noreferrer">Listen<ExternalLink /></a>
              ) : (
                <span className="faint xsmall">Recording unavailable</span>
              )}
            </li>
          );
        })}
      </ul>
      {!rows.length && <p className="muted small" style={{ padding: 18 }}>{only ? "No radio clips published for the selected drivers — switch the filter off to see everyone." : "No clips."}</p>}
      {rows.length > limit && <div style={{ padding: "0 18px 16px" }}><button className="btn sm" onClick={() => setLimit((l) => l + 80)}>Show more ({rows.length - limit} remaining)</button></div>}
    </Glass>
  );
}
