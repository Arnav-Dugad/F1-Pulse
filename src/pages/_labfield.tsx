/**
 * Race Replay 2.0 — full-field mode for the Race replay page.
 * Every driver's reported OpenF1 location for a chosen 3-minute window (one queued request per driver,
 * loaded only on explicit action), optional "follow the race" chaining of consecutive windows, canvas
 * rendering with team-colour motion trails, a pulsing leader halo, hover labels and an animated running order.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowDown, ArrowUp, Crown, FastForward, Loader2, Pause, Play, RotateCcw, SkipBack, SkipForward, Users, X } from "lucide-react";
import { request } from "../api";
import { usePrefs } from "../app/prefs";
import { plural } from "../lib/format";
import { fetchEstimate, mergeSamples, trackAt } from "../lab.mjs";
import { Glass, Segmented, Source, Toggle, cx } from "../ui/core";
import type { ArchiveDriver, Envelope, LocationSample } from "../types";
import { displayName, teamHex, utcClock, type Archive } from "./_archive";
import "./_lab.css";

type Pt = { t: number; x: number; y: number };
type Track = { ts: Float64Array; xs: Float64Array; ys: Float64Array; n: number };
type PositionSample = { date: string; driver_number: number; position: number };
type Meta = Envelope<unknown>["meta"];

const WINDOW = 180000; // the Worker's maximum car-data/location window
const TRAIL_MS = 3200;
const CONCURRENCY = 3;
const SPEEDS = ["1", "2", "4", "8", "16"] as const;
type Speed = (typeof SPEEDS)[number];

/** Session-scoped cache of fetched windows: `${session}:${driver}:${windowStart}` → samples. */
const cache = new Map<string, Pt[]>();

function lastLE<T>(list: T[], x: number, key: (v: T) => number) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
const toTrack = (pts: Pt[]): Track => ({
  ts: Float64Array.from(pts, (p) => p.t), xs: Float64Array.from(pts, (p) => p.x), ys: Float64Array.from(pts, (p) => p.y), n: pts.length,
});
const fmtClock = (ms: number) => {
  const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

/* ───────────────────────── Loader ───────────────────────── */
type LoadState = { window: [number, number]; done: number; total: number; current: number[]; failed: number[] } | null;

function useFieldData(sessionKey: number | undefined, drivers: ArchiveDriver[], origin: number | null) {
  const samples = useRef(new Map<number, Pt[]>());
  const tracks = useRef(new Map<number, Track>());
  const [version, setVersion] = useState(0);
  const [windows, setWindows] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState<LoadState>(null);
  const [error, setError] = useState<string>("");
  const [exhausted, setExhausted] = useState(false);
  const [meta, setMeta] = useState<Meta | undefined>();
  const token = useRef(0);

  // A new session or start point starts a fresh timeline (the cache keeps fetched windows).
  useEffect(() => {
    token.current++;
    samples.current = new Map();
    tracks.current = new Map();
    setWindows([]); setLoading(null); setError(""); setExhausted(false); setVersion((v) => v + 1);
  }, [sessionKey, origin]);
  useEffect(() => () => { token.current++; }, []);

  const loadWindow = useCallback(async (w0: number, only?: number[]) => {
    if (!sessionKey || !drivers.length) return;
    const id = ++token.current;
    const w1 = w0 + WINDOW;
    const list = only || drivers.map((d) => d.driver_number);
    const failed: number[] = [];
    let done = 0, got = 0;
    const current = new Set<number>();
    const queue = [...list];
    const push = () => id === token.current && setLoading({ window: [w0, w1], done, total: list.length, current: [...current], failed: [...failed] });
    push();
    setError("");
    const accept = (n: number, pts: Pt[]) => {
      if (pts.length) got++;
      const merged = mergeSamples(samples.current.get(n) || [], pts);
      samples.current.set(n, merged);
      tracks.current.set(n, toTrack(merged));
    };
    const worker = async () => {
      while (queue.length && id === token.current) {
        const n = queue.shift()!;
        const key = `${sessionKey}:${n}:${w0}`;
        const hit = cache.get(key);
        if (hit) { accept(n, hit); done++; push(); continue; }
        current.add(n); push();
        try {
          const r = await request<LocationSample[]>("openf1", "location", {
            session_key: sessionKey, driver_number: n, "date>=": new Date(w0).toISOString(), "date<=": new Date(w1).toISOString(),
          });
          if (id !== token.current) return;
          const pts = (r.data || [])
            .filter((p) => p && p.date && Number.isFinite(p.x) && !(p.x === 0 && p.y === 0 && p.z === 0))
            .map((p) => ({ t: Date.parse(p.date), x: p.x, y: -p.y }))
            .sort((a, b) => a.t - b.t);
          cache.set(key, pts);
          accept(n, pts);
          setMeta(r.meta);
        } catch {
          failed.push(n);
        }
        current.delete(n);
        done++;
        if (id === token.current) { setVersion((v) => v + 1); push(); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (id !== token.current) return;
    setVersion((v) => v + 1);
    setLoading(null);
    if (failed.length === list.length) {
      setError(`None of the ${plural(list.length, "location request")} for this window succeeded. OpenF1 may be rate-limiting — try again in a minute.`);
      return;
    }
    if (!only) setWindows((ws) => (ws.some((w) => w[0] === w0) ? ws : [...ws, [w0, w1] as [number, number]].sort((a, b) => a[0] - b[0])));
    if (!only && got === 0) setExhausted(true);
    if (failed.length) setError(`${plural(failed.length, "driver")} failed to load for this window.`);
    return failed;
  }, [sessionKey, drivers]);

  const cancel = () => { token.current++; setLoading(null); };
  return { tracks, samples, version, windows, loading, error, exhausted, meta, loadWindow, cancel };
}

/* ───────────────────────── Full-field replay ───────────────────────── */
export function FieldReplay({ ax }: { ax: Archive }) {
  const { reducedMotion, theme } = usePrefs();
  const laps = useMemo(() => ax.lapsA.filter((l) => l.date_start), [ax.lapsA]);
  const [startLap, setStartLap] = useState<number | null>(null);
  const startRow = laps.find((l) => l.lap_number === startLap) || ax.chosenA || laps[0];
  const origin = startRow?.date_start ? Date.parse(startRow.date_start) : null;
  const field = useFieldData(ax.sessionKey, ax.drivers, origin);
  const loadedEnd = field.windows.length ? field.windows[field.windows.length - 1][1] : origin ?? 0;
  const started = field.windows.length > 0;
  const [failedRetry, setFailedRetry] = useState<number[]>([]);
  const [follow, setFollow] = useState(false);

  // Running order for the whole session (one request; shared with the duel replay through the request cache).
  const [position, setPosition] = useState<{ list?: PositionSample[]; error?: string; meta?: Meta }>({});
  const loadPosition = useCallback(async () => {
    if (!ax.sessionKey || position.list) return;
    try {
      const p = await request<PositionSample[]>("openf1", "position", { session_key: ax.sessionKey });
      setPosition({ list: [...(p.data || [])].filter((r) => r && r.date && Number.isFinite(r.position)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), meta: p.meta });
    } catch (e) { setPosition({ error: (e as Error).message }); }
  }, [ax.sessionKey, position.list]);
  useEffect(() => setPosition({}), [ax.sessionKey]);

  const start = async () => {
    if (origin === null) return;
    loadPosition();
    const failed = await field.loadWindow(origin);
    setFailedRetry(failed || []);
  };
  const next = async () => {
    if (field.loading || field.exhausted || !started) return;
    const failed = await field.loadWindow(loadedEnd);
    setFailedRetry(failed || []);
  };

  const n = ax.drivers.length;
  const estimate = fetchEstimate(n + (position.list ? 0 : 1), { used: 4 });

  if (!ax.drivers.length || origin === null)
    return <Glass className="lab-empty"><Users /><div><strong>No replay window yet</strong><p className="muted small">The full-field replay starts at one of Driver A's timed laps. Choose a session and driver with lap data.</p></div></Glass>;

  return (
    <div className="lab-field">
      <Glass className="lab-field-setup reveal" strong>
        <div className="lab-field-setup-main">
          <span className="ax-label">Window start</span>
          <span className="ax-select-wrap">
            <select className="select" value={startRow?.lap_number || ""} onChange={(e) => setStartLap(+e.target.value)} aria-label="Start the full-field window at lap" disabled={!!field.loading}>
              {laps.map((l) => <option key={l.lap_number} value={l.lap_number}>Start of lap {l.lap_number} ({ax.driverA?.name_acronym}) · {utcClock(Date.parse(l.date_start!), 0)} UTC</option>)}
            </select>
          </span>
        </div>
        {!started && !field.loading && (
          <div className="lab-field-cta">
            <p className="small">
              Loads <b>{plural(n, "driver")}</b> × one 3-minute location window — <b>{plural(n + (position.list ? 0 : 1), "request")}</b> through the rate-limited queue, roughly <b>{estimate} s</b>.
            </p>
            <button className="btn accent" onClick={start}><Users />Load full field</button>
          </div>
        )}
        {started && !field.loading && (
          <div className="lab-field-cta">
            <label className="lab-follow">
              <Toggle checked={follow} onChange={setFollow} label="Follow the race: load the next 3-minute window automatically as playback nears the end" />
              <span><b>Follow the race</b><small>Chains the next 3-minute window as playback nears the end · ≈{fetchEstimate(n, { used: n })} s per window</small></span>
            </label>
            {!field.exhausted && <button className="btn sm" onClick={next}><FastForward />Load next 3 min</button>}
          </div>
        )}
      </Glass>

      <AnimatePresence initial={false}>
        {field.loading && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="lab-field-progress glass" role="status" aria-live="polite">
            <div className="lab-fp-top">
              <Loader2 className="lab-spin" size={16} />
              <strong>{started ? "Loading the next window" : "Loading the full field"} · {field.loading.done} of {field.loading.total}</strong>
              <span className="faint xsmall">{utcClock(field.loading.window[0], 0)}–{utcClock(field.loading.window[1], 0)} UTC · requests are queued to respect OpenF1's rate limit</span>
              <button className="btn sm plain" onClick={field.cancel}><X />Cancel</button>
            </div>
            <div className="ax-progress-track"><motion.span className="ax-progress-fill" animate={{ width: `${Math.max(4, (field.loading.done / Math.max(1, field.loading.total)) * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} /></div>
            <div className="lab-fp-chips">
              {ax.drivers.map((d) => {
                const tr = field.tracks.current.get(d.driver_number);
                const state = field.loading!.failed.includes(d.driver_number) ? "fail" : field.loading!.current.includes(d.driver_number) ? "now" : tr && tr.n && tr.ts[tr.n - 1] >= field.loading!.window[0] ? "done" : "wait";
                return <span key={d.driver_number} className={cx("lab-fp-chip", state)} style={{ "--tint": teamHex(d) } as CSSProperties}>{d.name_acronym}</span>;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {field.error && (
        <div className="notice lab-gap-top" role="alert">
          <p>{field.error}{failedRetry.length > 0 && field.windows.length > 0 && (
            <> <button className="link" onClick={async () => setFailedRetry((await field.loadWindow(field.windows[field.windows.length - 1][0], failedRetry)) || [])}>Retry those drivers</button></>
          )}{!field.windows.length && <> <button className="link" onClick={start}>Try again</button></>}</p>
        </div>
      )}

      {started && origin !== null && (
        <FieldLab key={`${ax.sessionKey}:${origin}`} ax={ax} origin={origin} loadedEnd={loadedEnd} field={field} position={position}
          follow={follow} onNeedMore={next} reducedMotion={reducedMotion} theme={theme} />
      )}
      {!started && !field.loading && (
        <div className="lab-field-ghost" aria-hidden><Users size={22} /><span>The circuit and all cars appear here once the field is loaded.</span></div>
      )}
    </div>
  );
}

/* ───────────────────────── Stage + tower + transport ───────────────────────── */
function FieldLab({ ax, origin, loadedEnd, field, position, follow, onNeedMore, reducedMotion, theme }: {
  ax: Archive; origin: number; loadedEnd: number; field: ReturnType<typeof useFieldData>;
  position: { list?: PositionSample[]; error?: string; meta?: Meta }; follow: boolean; onNeedMore: () => void; reducedMotion: boolean; theme: string;
}) {
  const followRef = useRef(follow);
  followRef.current = follow;
  const tRef = useRef(origin);
  const [uiT, setUiT] = useState(origin);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const [speed, setSpeed] = useState<Speed>("2");
  const speedRef = useRef(2);
  speedRef.current = +speed;
  const endRef = useRef(loadedEnd);
  endRef.current = loadedEnd;
  const [hover, setHover] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hover;
  const dirty = useRef(true);
  const buffering = playing && follow && !!field.loading && uiT >= loadedEnd - 50;

  const byDriver = useMemo(() => {
    const m = new Map<number, { t: number; p: number }[]>();
    for (const r of position.list || []) {
      const list = m.get(r.driver_number) || [];
      list.push({ t: Date.parse(r.date), p: r.position });
      m.set(r.driver_number, list);
    }
    return m;
  }, [position.list]);
  const posAt = useCallback((n: number, t: number) => {
    const list = byDriver.get(n);
    if (!list) return undefined;
    const i = lastLE(list, t, (v) => v.t);
    return i >= 0 ? list[i].p : undefined;
  }, [byDriver]);
  const leaderRef = useRef<number | null>(null);

  const seek = (abs: number) => { tRef.current = Math.max(origin, Math.min(endRef.current, abs)); setUiT(tRef.current); dirty.current = true; };
  const toggle = () => {
    if (!playing && tRef.current >= endRef.current - 20 && !(follow && field.loading)) seek(origin);
    setPlaying((p) => !p);
  };

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVis = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  // Follow mode: fetch the next window when playback nears the end of what's loaded.
  useEffect(() => {
    if (follow && !field.loading && !field.exhausted && loadedEnd - uiT < 45000) onNeedMore();
  }, [follow, uiT, loadedEnd, field.loading, field.exhausted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; }, [field.version, theme, hover]);

  /* ── Canvas ── */
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: e.contentRect.width, h: e.contentRect.height, dpr };
      const c = canvasRef.current;
      if (c) { c.width = Math.round(e.contentRect.width * dpr); c.height = Math.round(e.contentRect.height * dpr); }
      dirty.current = true;
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  // Geometry: bounds over everything loaded; outline from the driver with the most samples in the first window.
  const geo = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, best: number | null = null, bestN = 0;
    for (const [num, tr] of field.tracks.current) {
      for (let i = 0; i < tr.n; i++) {
        const x = tr.xs[i], y = tr.ys[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      let k = 0;
      for (let i = 0; i < tr.n && tr.ts[i] <= origin + WINDOW; i++) k++;
      if (k > bestN) { bestN = k; best = num; }
    }
    const outline: Pt[] = [];
    const tr = best !== null ? field.tracks.current.get(best) : undefined;
    if (tr) for (let i = 0; i < tr.n && tr.ts[i] <= origin + WINDOW; i++) outline.push({ t: tr.ts[i], x: tr.xs[i], y: tr.ys[i] });
    return Number.isFinite(minX) ? { minX, maxX, minY, maxY, outline } : null;
  }, [field.version, origin]); // eslint-disable-line react-hooks/exhaustive-deps

  const colours = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(ax.drivers.map((d) => {
      const c = teamHex(d);
      const k = seen.get(c) || 0;
      seen.set(c, k + 1);
      return [d.driver_number, { c, second: k > 0, d }] as const;
    }));
  }, [ax.drivers]);

  const transform = useCallback(() => {
    if (!geo) return null;
    const { w, h } = size.current;
    const pad = Math.max(18, Math.min(w, h) * 0.07);
    const sw = geo.maxX - geo.minX || 1, sh = geo.maxY - geo.minY || 1;
    const k = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
    const ox = (w - sw * k) / 2 - geo.minX * k, oy = (h - sh * k) / 2 - geo.minY * k;
    return { k, X: (x: number) => ox + x * k, Y: (y: number) => oy + y * k };
  }, [geo]);
  const heads = useRef(new Map<number, [number, number]>());

  useEffect(() => {
    if (!onScreen) return;
    let raf = 0, last = 0, lastUi = 0;
    // Theme tokens are re-read about once a second (the theme attribute is applied after this effect runs).
    const read = () => {
      const css = getComputedStyle(wrapRef.current!);
      const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
      return { label: tok("--label", "#fff"), label3: tok("--label-3", "rgba(255,255,255,.5)"), fill: tok("--fill-1", "rgba(255,255,255,.18)"), bg: tok("--bg", "#040406"), glass: tok("--glass-strong", "rgba(30,30,36,.85)") };
    };
    let ink = read(), inkAt = 0;
    const dark = theme !== "light";
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = 0; return; }
      if (now - inkAt > 1000) { const fresh = read(); if (fresh.label !== ink.label || fresh.bg !== ink.bg) dirty.current = true; ink = fresh; inkAt = now; }
      const dt = last ? Math.min(100, now - last) : 0;
      last = now;
      if (playingRef.current) {
        const nextT = tRef.current + dt * speedRef.current;
        if (nextT >= endRef.current) {
          tRef.current = endRef.current;
          if (!(followRef.current && !field.exhausted)) setPlaying(false);
        } else tRef.current = nextT;
        dirty.current = true;
      }
      if (now - lastUi > 200 && (playingRef.current || dirty.current)) { lastUi = now; setUiT(tRef.current); }
      const animateHalo = !reducedMotion;
      if (!dirty.current && !animateHalo) return;
      dirty.current = false;
      const c = canvasRef.current, tf = transform();
      if (!c || !tf) return;
      const ctx = c.getContext("2d")!;
      const { w, h, dpr } = size.current;
      if (w < 10 || h < 10) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const abs = tRef.current;
      // Track outline.
      if (geo && geo.outline.length > 1) {
        ctx.save();
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        geo.outline.forEach((p, i) => { const gap = i && p.t - geo.outline[i - 1].t > 3000; if (!i || gap) ctx.moveTo(tf.X(p.x), tf.Y(p.y)); else ctx.lineTo(tf.X(p.x), tf.Y(p.y)); });
        ctx.strokeStyle = ink.fill; ctx.lineWidth = Math.max(8, Math.min(16, w / 70)); ctx.stroke();
        ctx.strokeStyle = ink.label3; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.stroke();
        ctx.restore();
      }
      const r = Math.max(4, Math.min(7, w / 130));
      const hov = hoverRef.current;
      // Leader from OpenF1 position at playback time.
      let leader: number | null = null;
      for (const d of ax.drivers) if (posAt(d.driver_number, abs) === 1) { leader = d.driver_number; break; }
      leaderRef.current = leader;
      // Trails (sampled every 80 ms of session time, fading tails).
      heads.current = new Map();
      ctx.save();
      ctx.lineCap = "round";
      if (dark) ctx.globalCompositeOperation = "lighter";
      for (const [num, tr] of field.tracks.current) {
        const head = trackAt(tr.ts, tr.xs, tr.ys, abs);
        if (!head) continue;
        heads.current.set(num, [tf.X(head[0]), tf.Y(head[1])]);
        const col = colours.get(num)?.c || "#8E8E99";
        const pts: [number, number][] = [];
        for (let s = abs - TRAIL_MS; s < abs; s += 80) {
          const p = trackAt(tr.ts, tr.xs, tr.ys, s);
          if (!p) { pts.length = 0; continue; }
          pts.push([tf.X(p[0]), tf.Y(p[1])]);
        }
        pts.push([tf.X(head[0]), tf.Y(head[1])]);
        const emph = hov === null || hov === num ? 1 : 0.35;
        ctx.strokeStyle = col;
        for (let i = 1; i < pts.length; i++) {
          const f = i / (pts.length - 1);
          ctx.globalAlpha = 0.16 * f * emph;
          ctx.lineWidth = r * 2.2 * (0.4 + 0.6 * f);
          ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
          ctx.globalAlpha = Math.pow(f, 1.4) * 0.95 * emph;
          ctx.lineWidth = r * 0.85 * (0.35 + 0.65 * f);
          ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
        }
      }
      ctx.restore();
      // Leader halo (pulses unless reduced motion).
      if (leader !== null && heads.current.has(leader)) {
        const [x, y] = heads.current.get(leader)!;
        const col = colours.get(leader)?.c || "#fff";
        const ph = animateHalo ? (Math.sin(now / 320) + 1) / 2 : 0.5;
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.22 * (1 - ph);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, r * (2.2 + 1.4 * ph), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r * (1.9 + 0.5 * ph), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Cars (hovered car drawn last).
      const order = [...heads.current.keys()].sort((a, b) => (a === hov ? 1 : b === hov ? -1 : (a === leader ? 1 : b === leader ? -1 : 0)));
      for (const num of order) {
        const [x, y] = heads.current.get(num)!;
        const info = colours.get(num);
        ctx.globalAlpha = hov === null || hov === num ? 1 : 0.55;
        ctx.fillStyle = info?.c || "#8E8E99";
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.92)" : "rgba(10,10,14,0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, num === hov ? r * 1.25 : r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (info?.second) { ctx.fillStyle = ink.bg; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      // Hover label.
      if (hov !== null && heads.current.has(hov)) {
        const [x, y] = heads.current.get(hov)!;
        const info = colours.get(hov);
        const p = posAt(hov, abs);
        const text = `${p ? "P" + p + "  " : ""}${info?.d.name_acronym || "#" + hov}`;
        ctx.font = "800 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
        const tw = ctx.measureText(text).width;
        const bw = tw + 22, bh = 24;
        let bx = x + r * 1.8, by = y - r * 1.8 - bh;
        if (bx + bw > w - 4) bx = x - r * 1.8 - bw;
        if (by < 4) by = y + r * 1.8;
        ctx.fillStyle = ink.glass;
        ctx.strokeStyle = info?.c || ink.label;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8); else ctx.rect(bx, by, bw, bh);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = info?.c || ink.label;
        ctx.fillRect(bx + 6, by + 6, 3, bh - 12);
        ctx.fillStyle = ink.label;
        ctx.textBaseline = "middle";
        ctx.fillText(text, bx + 14, by + bh / 2 + 0.5);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onScreen, transform, geo, colours, posAt, reducedMotion, theme, ax.drivers, ax.sessionKey, field.exhausted]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best: number | null = null, bd = 18 * 18;
    for (const [num, [x, y]] of heads.current) { const d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = num; } }
    if (best !== hoverRef.current) setHover(best);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); seek(tRef.current + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 5000 : 1000)); }
    else if (e.key === "Home") { e.preventDefault(); seek(origin); }
    else if (e.key === "End") { e.preventDefault(); seek(endRef.current); }
  };

  // Running order at the (throttled) playback time.
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return ax.drivers
      .map((d) => ({ d, pos: posAt(d.driver_number, uiT), startPos: posAt(d.driver_number, origin), seen: !!(field.tracks.current.get(d.driver_number) && trackAt(field.tracks.current.get(d.driver_number)!.ts, field.tracks.current.get(d.driver_number)!.xs, field.tracks.current.get(d.driver_number)!.ys, uiT)) }))
      .filter((r): r is { d: ArchiveDriver; pos: number; startPos: number | undefined; seen: boolean } => r.pos !== undefined)
      .sort((a, b) => a.pos - b.pos)
      .filter((r) => (seen.has(r.pos) ? false : (seen.add(r.pos), true)));
  }, [ax.drivers, posAt, uiT, origin, field.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTrack = [...field.tracks.current.values()].filter((tr) => trackAt(tr.ts, tr.xs, tr.ys, uiT)).length;
  const span = Math.max(1, loadedEnd - origin);
  const pct = ((uiT - origin) / span) * 100;
  const leaderD = rows[0]?.d;

  return (
    <div className="rp-grid lab-field-grid">
      <Glass className="rp-stage lab-field-stage reveal" strong>
        <div className="rp-stage-head">
          <span className="rp-live"><span className={cx("rp-rec", playing && "on")} />Full field · {plural(field.windows.length, "window")} · {onTrack} cars on screen</span>
          <span className="rp-clock">
            <b>{fmtClock(uiT - origin)}</b><span className="faint"> / {fmtClock(span)}</span>
            <small>{utcClock(uiT)} UTC</small>
          </span>
        </div>
        <div ref={wrapRef} className="lab-canvas-wrap" tabIndex={0} onKeyDown={onKey}
          role="application" aria-roledescription="replay stage"
          aria-label={`Full-field replay at ${utcClock(uiT, 0)} UTC. ${leaderD ? `${displayName(leaderD)} leads.` : ""} Space to play or pause, arrows to step. The running order list beside it is the text alternative.`}>
          <canvas ref={canvasRef} onPointerMove={pick} onPointerDown={pick} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)} />
          {buffering && <span className="lab-buffer"><Loader2 className="lab-spin" size={14} />Buffering the next window… {field.loading ? `${field.loading.done}/${field.loading.total}` : ""}</span>}
          <span className="lab-canvas-note">Hover a car for its name · ◉ leader</span>
        </div>
        <div className="rp-transport">
          <div className="rp-buttons">
            <button className="icon-btn" onClick={() => seek(tRef.current - 10000)} aria-label="Back ten seconds"><SkipBack /></button>
            <button className="rp-play" onClick={toggle} aria-label={playing ? "Pause replay" : "Play replay"}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={playing ? "pause" : uiT >= loadedEnd - 20 ? "again" : "play"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                  {playing ? <Pause /> : uiT >= loadedEnd - 20 ? <RotateCcw /> : <Play />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button className="icon-btn" onClick={() => seek(tRef.current + 10000)} aria-label="Forward ten seconds"><SkipForward /></button>
          </div>
          <div className="rp-timeline">
            <Scrubber pct={pct} span={span} t={uiT - origin} windows={field.windows.map((w) => [(w[0] - origin) / span, (w[1] - origin) / span] as [number, number])}
              loading={!!field.loading} onSeek={(f) => seek(origin + f * span)} />
          </div>
          <Segmented<Speed> label="Playback speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: s + "×" }))} />
        </div>
        <div className="lab-field-legend">
          {ax.drivers.map((d) => {
            const info = colours.get(d.driver_number);
            const has = !!field.tracks.current.get(d.driver_number)?.n;
            return (
              <button key={d.driver_number} type="button" className={cx("lab-leg", !has && "off", hover === d.driver_number && "on")} style={{ "--c": info?.c } as CSSProperties}
                onPointerEnter={() => setHover(d.driver_number)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(d.driver_number)} onBlur={() => setHover(null)}
                aria-label={`${displayName(d)}${has ? "" : ", no location samples in the loaded windows"}`}>
                <i className={cx(info?.second && "second")} />{d.name_acronym}
              </button>
            );
          })}
        </div>
        <Source value={field.meta ? { data: null, meta: field.meta } : undefined} label="Location" />
      </Glass>

      <div className="rp-side">
        <Glass className="rp-panel rp-tower lab-field-tower reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="rp-panel-head">
            <h3><Crown size={15} />Running order</h3>
            <span className="faint xsmall">{rows.length ? `at ${utcClock(uiT, 0)}` : ""}</span>
          </div>
          {position.error ? (
            <p className="muted small">Running order unavailable: {position.error}</p>
          ) : !position.list ? (
            <p className="muted small rp-empty"><Loader2 className="lab-spin" size={13} /> Loading positions…</p>
          ) : !rows.length ? (
            <p className="muted small rp-empty">No position reported yet at this moment of the session.</p>
          ) : (
            <LayoutGroup>
              <ol className="rp-tower-list" tabIndex={0} aria-label="Running order">
                {rows.map((r) => {
                  const change = r.startPos !== undefined ? r.startPos - r.pos : 0;
                  return (
                    <motion.li layout="position" key={r.d.driver_number} transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      className={cx("rp-tower-row lab-trow", hover === r.d.driver_number && "sel", !r.seen && "lab-trow-off")} style={{ "--tint": teamHex(r.d) } as CSSProperties}>
                      <button type="button" className="lab-trow-btn" onPointerEnter={() => setHover(r.d.driver_number)} onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover(r.d.driver_number)} onBlur={() => setHover(null)} aria-label={`P${r.pos} ${displayName(r.d)}${r.seen ? "" : ", not on screen"}: highlight on the stage`}>
                        <span className={cx("rp-tpos", r.pos <= 3 && "p" + r.pos, r.pos === 1 && "lab-leader")}>{r.pos}</span>
                        <i className="rp-tbar" />
                        <span className="rp-tname"><b>{r.d.name_acronym}</b><small>{r.d.team_name}</small></span>
                        {change !== 0 && (
                          <motion.span key={r.pos} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className={cx("rp-tchange", change > 0 ? "up" : "down")} aria-hidden>
                            {change > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(change)}
                          </motion.span>
                        )}
                      </button>
                    </motion.li>
                  );
                })}
              </ol>
            </LayoutGroup>
          )}
          <p className="rp-panel-foot xsmall faint">OpenF1's last reported position per driver at the playback time; arrows compare with the window start. Halo marks P1.</p>
          <Source value={position.meta ? { data: null, meta: position.meta } : undefined} label="Positions" />
        </Glass>
        <Glass className="rp-panel lab-field-about reveal" style={{ "--i": 2 } as CSSProperties}>
          <h3 className="lab-about-h">About this view</h3>
          <p className="small muted">
            Each car is drawn from the location samples OpenF1 reported (≈3–4 Hz, local circuit coordinates), interpolated linearly between samples; a car vanishes where its samples are more than three seconds apart.
            Trails show the last {TRAIL_MS / 1000} s of session time. Each window costs one request per driver, so follow mode only loads more while you watch.
          </p>
        </Glass>
      </div>
    </div>
  );
}

function Scrubber({ pct, span, t, windows, loading, onSeek }: { pct: number; span: number; t: number; windows: [number, number][]; loading: boolean; onSeek: (f: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const from = (e: ReactPointerEvent) => { const r = ref.current!.getBoundingClientRect(); onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
  const key = (e: ReactKeyboardEvent) => {
    const step = (e.shiftKey ? 5000 : 1000) / span;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); onSeek(Math.min(1, pct / 100 + step)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); onSeek(Math.max(0, pct / 100 - step)); }
    else if (e.key === "Home") { e.preventDefault(); onSeek(0); }
    else if (e.key === "End") { e.preventDefault(); onSeek(1); }
  };
  return (
    <div ref={ref} className="rp-scrub" role="slider" tabIndex={0} aria-label="Full-field replay timeline"
      aria-valuemin={0} aria-valuemax={Math.round(span / 1000)} aria-valuenow={Math.round(t / 1000)} aria-valuetext={`${fmtClock(t)} of ${fmtClock(span)}`}
      onKeyDown={key} onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); from(e); }}
      onPointerMove={(e) => drag.current && from(e)} onPointerUp={() => (drag.current = false)} onPointerCancel={() => (drag.current = false)}>
      <div className="rp-scrub-track lab-scrub-track">
        {windows.map((w, i) => <span key={i} className="lab-scrub-win" style={{ left: w[0] * 100 + "%", width: (w[1] - w[0]) * 100 + "%" }} />)}
        <div className="rp-scrub-fill" style={{ width: pct + "%" }} />
        {loading && <span className="lab-scrub-loading" />}
      </div>
      <div className="rp-scrub-thumb" style={{ left: pct + "%" }} />
    </div>
  );
}
