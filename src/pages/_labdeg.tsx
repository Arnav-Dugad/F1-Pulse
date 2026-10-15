/**
 * Empirical tyre-degradation fit (Strategy lab): one archived race's OpenF1 laps + stints + race control,
 * clean-lap filtering, a linear or quadratic fit per stint, a compound comparison and a hand-off of
 * base pace / degradation into the strategy model.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, FlaskConical, Info, Sparkles, Wand2 } from "lucide-react";
import { request, sessions, useData } from "../api";
import { lapTime, plural } from "../lib/format";
import {
  EXCLUSIONS, classifyLaps, compoundSummary, evalPoly, fitStints, neutralWindows,
  type ClassifiedLap, type ControlLike, type Exclusion, type LapLike, type StintFit, type StintLike,
} from "../lab.mjs";
import { Glass, Segmented, Skeleton, Source, StateView, cx } from "../ui/core";
import type { ArchiveDriver, Envelope, Session } from "../types";
import { ARCHIVE_FIRST_YEAR, LoadProgress, displayName, emptyEnvelope, shortDate, teamHex } from "./_archive";
import "./_lab.css";

export type FitValues = { base: number; deg: number; laps: number; label: string };

export const COMPOUND_STYLE: Record<string, { c: string; ink: string; short: string; name: string }> = {
  SOFT: { c: "#E8333F", ink: "#fff", short: "S", name: "Soft" },
  MEDIUM: { c: "#F5C518", ink: "#111", short: "M", name: "Medium" },
  HARD: { c: "#F2F2F2", ink: "#111", short: "H", name: "Hard" },
  INTERMEDIATE: { c: "#2FB45A", ink: "#fff", short: "I", name: "Intermediate" },
  WET: { c: "#2F7DE1", ink: "#fff", short: "W", name: "Wet" },
};
export const compoundStyle = (c?: string | null) => COMPOUND_STYLE[(c || "").toUpperCase()] || { c: "#8E8E99", ink: "#fff", short: "?", name: "Unreported" };

type Degree = "1" | "2";
type Fuel = "0" | "0.03" | "0.06";
type Loaded = {
  key: number; session: Session;
  drivers: ArchiveDriver[]; laps: LapLike[]; stints: StintLike[]; control: ControlLike[];
  meta: { laps?: Envelope<unknown>["meta"]; stints?: Envelope<unknown>["meta"]; control?: Envelope<unknown>["meta"] };
  controlError?: string;
};

export function DegradationLab({ onUse, season }: { onUse: (v: FitValues) => void; season: string }) {
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: thisYear - ARCHIVE_FIRST_YEAR + 1 }, (_, i) => String(thisYear - i));
  const [year, setYear] = useState(() => (season !== "current" && +season >= ARCHIVE_FIRST_YEAR && +season <= thisYear ? season : String(thisYear)));
  const [key, setKey] = useState("");
  const [degree, setDegree] = useState<Degree>("1");
  const [fuel, setFuel] = useState<Fuel>("0");
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const list = useData(() => (visible ? sessions(year) : Promise.resolve(emptyEnvelope<Session[]>([]))), [visible, year]);
  const races = useMemo(
    () => (list.value?.data || []).filter((s) => s.session_name === "Race" && Date.parse(s.date_end) < Date.now()).sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start)),
    [list.value],
  );
  const session = races.find((s) => String(s.session_key) === key) || races.at(-1);

  // Explicit, sequential load (4 queued OpenF1 requests).
  const [load, setLoad] = useState<{ step: number; label: string; error?: string; running: boolean }>({ step: 0, label: "", running: false });
  const [data, setData] = useState<Loaded | null>(null);
  const live = useRef(0);
  const run = async () => {
    if (!session) return;
    const id = ++live.current;
    const sk = session.session_key;
    const step = (n: number, label: string) => id === live.current && setLoad({ step: n, label, running: true });
    try {
      step(1, "Loading the entry list…");
      const d = await request<ArchiveDriver[]>("openf1", "drivers", { session_key: sk });
      step(2, "Loading every lap of the race…");
      const l = await request<LapLike[]>("openf1", "laps", { session_key: sk });
      step(3, "Loading tyre stints…");
      const s = await request<StintLike[]>("openf1", "stints", { session_key: sk });
      step(4, "Loading race control (safety-car windows)…");
      let control: ControlLike[] = [], controlError: string | undefined, controlMeta: Envelope<unknown>["meta"] | undefined;
      try {
        const c = await request<ControlLike[]>("openf1", "race_control", { session_key: sk });
        control = c.data || [];
        controlMeta = c.meta;
      } catch (e) { controlError = (e as Error).message; }
      if (id !== live.current) return;
      if (!(l.data || []).length) throw Error("OpenF1 has no lap records for this race.");
      if (!(s.data || []).length) throw Error("OpenF1 has no tyre stints for this race, so laps can't be grouped by compound.");
      const seen = new Map<number, ArchiveDriver>();
      for (const x of d.data || []) if (x?.driver_number && !seen.has(x.driver_number)) seen.set(x.driver_number, x);
      setData({ key: sk, session, drivers: [...seen.values()], laps: l.data, stints: s.data, control, controlError, meta: { laps: l.meta, stints: s.meta, control: controlMeta } });
      setLoad({ step: 4, label: "", running: false });
    } catch (e) {
      if (id === live.current) setLoad({ step: 0, label: "", running: false, error: (e as Error).message });
    }
  };
  useEffect(() => () => { live.current++; }, []);
  const current = data && session && data.key === session.session_key ? data : null;

  return (
    <div ref={ref} className="lab-deg">
      <Glass className="lab-deg-controls reveal" strong>
        <label className="ax-field">
          <span className="ax-label">Season</span>
          <select className="select" value={year} onChange={(e) => { setYear(e.target.value); setKey(""); }} aria-label="Season">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="ax-field lab-deg-race">
          <span className="ax-label">Archived race</span>
          {list.loading && visible ? <Skeleton h={42} r={14} /> : (
            <select className="select" value={session?.session_key || ""} onChange={(e) => setKey(e.target.value)} disabled={!races.length} aria-label="Archived race">
              {!races.length && <option value="">{list.error ? "Sessions unavailable" : "No archived races"}</option>}
              {races.map((s) => <option key={s.session_key} value={s.session_key}>{s.location} · {shortDate(s.date_start)}</option>)}
            </select>
          )}
        </label>
        <div className="ax-field">
          <span className="ax-label">Fit</span>
          <Segmented<Degree> label="Fit model" value={degree} onChange={setDegree} options={[{ value: "1", label: "Linear" }, { value: "2", label: "Quadratic" }]} />
        </div>
        <div className="ax-field">
          <span className="ax-label">Fuel-burn correction <small>assumption</small></span>
          <Segmented<Fuel> label="Fuel-burn correction in seconds per lap" value={fuel} onChange={setFuel} options={[{ value: "0", label: "None" }, { value: "0.03", label: "0.03 s" }, { value: "0.06", label: "0.06 s" }]} />
        </div>
        <button className="btn accent lab-deg-go" onClick={run} disabled={!session || load.running}>
          <FlaskConical />{current ? "Refit" : "Fit this race"}<small>4 requests</small>
        </button>
      </Glass>
      {list.error && <StateView error={list.error} onRetry={list.reload} />}

      {load.running && (
        <div className="lab-gap-top"><LoadProgress step={load.step} total={4} label={load.label} /><Skeleton h={420} r={28} style={{ marginTop: 14 }} /></div>
      )}
      {!load.running && load.error && <div className="lab-gap-top"><StateView error={load.error} onRetry={run} /></div>}
      {!load.running && !load.error && !current && (
        <Glass className="lab-empty lab-gap-top reveal">
          <FlaskConical />
          <div>
            <strong>Fit degradation from a real race</strong>
            <p className="muted small">Pick an archived race (OpenF1, {ARCHIVE_FIRST_YEAR} onwards) and press <b>Fit this race</b>. It loads every lap, the tyre stints and the race-control log — four queued requests.</p>
          </div>
        </Glass>
      )}
      {current && !load.running && <FitResults data={current} degree={+degree as 1 | 2} fuel={+fuel} onUse={onUse} />}
    </div>
  );
}

/* ───────────────────────── Results ───────────────────────── */
function FitResults({ data, degree, fuel, onUse }: { data: Loaded; degree: 1 | 2; fuel: number; onUse: (v: FitValues) => void }) {
  const windows = useMemo(() => neutralWindows(data.control), [data.control]);
  const classified = useMemo(() => classifyLaps(data.laps, data.stints, windows), [data.laps, data.stints, windows]);
  const fits = useMemo(() => fitStints(classified, degree, { fuel }), [classified, degree, fuel]);
  const summary = useMemo(() => compoundSummary(fits), [fits]);
  const raceLaps = Math.max(0, ...data.laps.map((l) => l.lap_number));
  const lookup = useMemo(() => new Map(data.drivers.map((d) => [d.driver_number, d])), [data.drivers]);
  const reasons = useMemo(() => {
    const m = new Map<Exclusion, number>();
    for (const r of classified) if (r.reason) m.set(r.reason, (m.get(r.reason) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [classified]);
  const clean = classified.filter((r) => !r.reason).length;
  const numbers = useMemo(() => {
    const count = new Map<number, number>();
    for (const f of fits) count.set(f.driver, (count.get(f.driver) || 0) + f.n);
    return [...new Set(classified.map((r) => r.driver))].sort((a, b) => (count.get(b) || 0) - (count.get(a) || 0) || a - b);
  }, [classified, fits]);
  const [pick, setPick] = useState<number | null>(null);
  const driver = pick !== null && numbers.includes(pick) ? pick : numbers[0];
  const di = numbers.indexOf(driver);
  const usable = summary.filter((s) => s.slope.median !== null && s.base.median !== null);
  const [compound, setCompound] = useState<string>("");
  const chosen = usable.find((s) => s.compound === compound) || [...usable].sort((a, b) => b.stints - a.stints)[0];
  const [applied, setApplied] = useState(false);
  useEffect(() => setApplied(false), [chosen?.compound, degree, fuel, data.key]);

  if (!fits.length)
    return (
      <div className="lab-gap-top">
        <StateView empty emptyTitle="Not enough clean laps to fit" emptyText="After removing lap 1, pit laps, neutralised laps and outliers, no stint kept enough consecutive clean laps (five for linear, seven for quadratic)." />
      </div>
    );

  const apply = () => {
    if (!chosen) return;
    onUse({
      base: Math.round(chosen.base.median! * 10) / 10,
      deg: Math.round(Math.max(0, chosen.slope.median!) * 1000) / 1000,
      laps: raceLaps,
      label: `${data.session.location} ${data.session.year} · ${compoundStyle(chosen.compound).name} · ${degree === 2 ? "quadratic" : "linear"}${fuel ? ` · fuel ${fuel} s/lap` : ""}`,
    });
    setApplied(true);
  };

  return (
    <div className="lab-deg-results">
      <div className="notice lab-deg-notice reveal">
        <Info />
        <p><b>Empirical fit on one race — not a tyre model.</b> {plural(fits.length, "stint")} fitted from {clean} clean laps of {data.session.location} {data.session.year}. Slopes are lap time versus tyre age and include track evolution{fuel ? "" : " and fuel burn (which makes cars faster as the race goes on, so raw slopes can be negative)"}{fuel ? `; an assumed ${fuel} s/lap fuel gain has been added back` : ""}.</p>
      </div>

      <Section2 title="Compound comparison" sub={<>Median slope across fitted stints, ± median absolute deviation. Base = fitted lap time at tyre age 0.</>}>
        <Glass className="card flush reveal">
          <div className="table-wrap">
            <table className="tbl lab-tbl lab-compound-tbl">
              <thead>
                <tr>
                  <th>Use</th><th>Compound</th><th className="r">Stints</th><th className="r">Clean laps</th>
                  <th className="r">Slope <small>s / lap of age</small></th>
                  <th className="r">Base <small>s</small></th>
                  <th className="r">Median R²</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => {
                  const st = compoundStyle(s.compound);
                  const on = chosen?.compound === s.compound;
                  return (
                    <tr key={s.compound} className={cx(on && "lab-row-on")} onClick={() => setCompound(s.compound)}>
                      <td><input type="radio" name="lab-compound" checked={on} onChange={() => setCompound(s.compound)} aria-label={`Use ${st.name} values`} /></td>
                      <td><span className="lab-tyre" style={{ "--c": st.c, "--ink": st.ink } as CSSProperties}>{st.short}</span> {st.name}</td>
                      <td className="r">{s.stints}</td>
                      <td className="r">{s.laps}</td>
                      <td className="r lab-strong">{s.slope.median === null ? "—" : `${s.slope.median >= 0 ? "+" : "−"}${Math.abs(s.slope.median).toFixed(3)}`}<small> ± {s.slope.mad?.toFixed(3) ?? "—"}</small></td>
                      <td className="r">{s.base.median === null ? "—" : s.base.median.toFixed(2)}<small> ± {s.base.mad?.toFixed(2) ?? "—"}</small></td>
                      <td className="r">{s.r2 === null ? "—" : s.r2.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="lab-use">
            <div className="lab-use-text">
              {chosen ? (
                <>
                  <span className="eyebrow"><Wand2 size={13} />Feed the strategy model</span>
                  <p>
                    Base <b>{chosen.base.median!.toFixed(1)} s</b> · degradation <b>{Math.max(0, chosen.slope.median!).toFixed(3)} s/lap</b> · <b>{raceLaps}</b> race laps
                    {chosen.slope.median! < 0 && <span className="faint"> — the fitted slope is negative (fuel burn outweighs wear), so degradation is clamped to 0.</span>}
                  </p>
                </>
              ) : <p className="muted small">No compound has a usable fit.</p>}
            </div>
            <button className="btn primary" onClick={apply} disabled={!chosen}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={applied ? "done" : "use"} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="lab-btn-in">
                  <Sparkles />{applied ? "Applied — scroll up" : "Use these values"}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </Glass>
      </Section2>

      <Section2 title="Lap times and fitted lines" sub="Every lap of one driver; filled dots are the clean laps used in the fit, hollow dots were excluded.">
        <Glass className="card reveal lab-scatter-card">
          <div className="lab-scatter-head">
            <div className="row" style={{ "--gap": "6px" } as CSSProperties}>
              <button className="icon-btn" aria-label="Previous driver" onClick={() => setPick(numbers[(di - 1 + numbers.length) % numbers.length])}><ChevronLeft /></button>
              <span className="ax-select-wrap lab-driver-select">
                <select className="select" value={driver} onChange={(e) => setPick(+e.target.value)} aria-label="Driver">
                  {numbers.map((n) => <option key={n} value={n}>{lookup.get(n) ? displayName(lookup.get(n)) : "#" + n} · #{n}</option>)}
                </select>
              </span>
              <button className="icon-btn" aria-label="Next driver" onClick={() => setPick(numbers[(di + 1) % numbers.length])}><ChevronRight /></button>
            </div>
            <div className="lab-scatter-legend">
              {[...new Set(classified.filter((r) => r.driver === driver && r.compound).map((r) => r.compound!))].map((c) => (
                <span key={c}><i className="lab-tyre sm" style={{ "--c": compoundStyle(c).c, "--ink": compoundStyle(c).ink } as CSSProperties}>{compoundStyle(c).short}</i>{compoundStyle(c).name}</span>
              ))}
              <span><i className="lab-hollow" />Excluded</span>
              <span><i className="lab-neutral-key" />SC / VSC / red</span>
            </div>
          </div>
          <Scatter rows={classified.filter((r) => r.driver === driver)} fits={fits.filter((f) => f.driver === driver)} raceLaps={raceLaps} fuel={fuel}
            label={lookup.get(driver) ? displayName(lookup.get(driver)) : "#" + driver} tint={teamHex(lookup.get(driver))} />
          <StintList fits={fits.filter((f) => f.driver === driver)} degree={degree} />
        </Glass>
      </Section2>

      <div className="lab-reasons reveal">
        <span className="eyebrow">Excluded laps</span>
        {reasons.map(([r, n]) => <span key={r} className="chip">{EXCLUSIONS[r]} · {n}</span>)}
        {windows.length > 0 && <span className="chip yellow">{plural(windows.length, "neutralisation window")} from race control</span>}
        {data.controlError && <span className="chip">Race control unavailable — SC laps rely on the 107% filter</span>}
      </div>
      <p className="source">
        <strong>Method.</strong> Clean laps exclude lap 1, laps without a time, pit out-laps (flagged or first lap of a later stint), in-laps (last lap of a stint before another), laps with a pit-lane mini-sector (code 2064),
        laps overlapping a Safety Car / VSC / red-flag window from race control (deployment or red flag until the next track-wide green or TRACK CLEAR) plus the first lap after it, and laps slower than 107% of their stint's median clean lap.
        Each stint with at least {degree === 2 ? 7 : 5} clean laps is fitted by least squares as lap time = a + b·age{degree === 2 ? " + c·age²" : ""}, where age = tyre age at stint start + laps since. {degree === 2 ? "The quadratic slope is the mean gradient over the observed ages. " : ""}
        Traffic, driver management and track evolution are not separated out.
      </p>
      <div className="lab-sources">
        <Source value={data.meta.laps ? { data: null, meta: data.meta.laps } : undefined} label="Laps" />
        <Source value={data.meta.stints ? { data: null, meta: data.meta.stints } : undefined} label="Stints" />
        <Source value={data.meta.control ? { data: null, meta: data.meta.control } : undefined} label="Race control" />
      </div>
    </div>
  );
}

function Section2({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="lab-sub">
      <div className="lab-sub-head"><h3>{title}</h3><p className="muted small">{sub}</p></div>
      {children}
    </div>
  );
}

function StintList({ fits, degree }: { fits: StintFit[]; degree: 1 | 2 }) {
  if (!fits.length) return <p className="faint small lab-gap-top">No stint of this driver kept enough clean laps to fit.</p>;
  return (
    <div className="lab-stints">
      {fits.map((f) => {
        const st = compoundStyle(f.compound);
        return (
          <div key={f.stint} className="lab-stint" style={{ "--c": st.c, "--ink": st.ink } as CSSProperties}>
            <span className="lab-tyre sm" style={{ "--c": st.c, "--ink": st.ink } as CSSProperties}>{st.short}</span>
            <span><b>Stint {f.stint}</b><small>laps {f.laps[0]}–{f.laps[1]} · {f.n} clean · age {f.ages[0]}–{f.ages[1]}</small></span>
            <span className="lab-stint-num"><b>{f.slope >= 0 ? "+" : "−"}{Math.abs(f.slope).toFixed(3)}</b><small>s/lap{degree === 2 ? ` · c ${f.coef[2] >= 0 ? "+" : "−"}${Math.abs(f.coef[2]).toFixed(4)}` : ""} · R² {f.r2.toFixed(2)}</small></span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Scatter (SVG, hover tooltip) ───────────────────────── */
function Scatter({ rows, fits, raceLaps, fuel, label, tint }: { rows: ClassifiedLap[]; fits: StintFit[]; raceLaps: number; fuel: number; label: string; tint: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<number | null>(null);
  const H = 340, L = 58, R = 14, T = 14, B = 30;
  const w = Math.max(1, width - L - R);
  const timed = rows.filter((r) => r.time !== null);
  const cleanT = timed.filter((r) => !r.reason).map((r) => r.time!);
  const base = cleanT.length ? cleanT : timed.map((r) => r.time!);
  const lo0 = base.length ? Math.min(...base) : 80, hi0 = base.length ? Math.max(...base) : 100;
  const pad = Math.max(0.4, (hi0 - lo0) * 0.18);
  const lo = lo0 - pad, hi = hi0 + pad * 1.6;
  const sx = (lap: number) => L + ((lap - 0.5) / Math.max(1, raceLaps)) * w;
  const sy = (t: number) => T + (1 - (Math.min(hi, Math.max(lo, t)) - lo) / (hi - lo || 1)) * (H - T - B);
  const ticksY = useMemo(() => {
    const span = hi - lo, step = [0.25, 0.5, 1, 2, 5, 10].find((s) => span / s <= 6) || 10;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }, [lo, hi]);
  const ticksX = useMemo(() => {
    const step = raceLaps > 50 ? 10 : 5, out: number[] = [];
    for (let l = step; l <= raceLaps; l += step) out.push(l);
    return [1, ...out];
  }, [raceLaps]);
  const neutral = rows.filter((r) => r.reason === "neutralised");
  const lines = fits.map((f) => {
    const pts: string[] = [];
    for (let lap = f.laps[0]; lap <= f.laps[1]; lap++) {
      const age = f.ages[0] + (lap - f.laps[0]);
      pts.push(`${pts.length ? "L" : "M"}${sx(lap).toFixed(1)},${sy(evalPoly(f.coef, age) - fuel * (lap - 1)).toFixed(1)}`);
    }
    return { d: pts.join(""), c: compoundStyle(f.compound).c, key: f.stint };
  });
  const move = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = -1, bd = Infinity;
    timed.forEach((r, i) => { const d = (sx(r.lap) - px) ** 2 + (sy(r.time!) - py) ** 2; if (d < bd) { bd = d; best = i; } });
    setHover(bd < 30 * 30 ? best : null);
  };
  const h = hover !== null ? timed[hover] : null;
  return (
    <div ref={wrap} className="lab-scatter" style={{ "--tint": tint } as CSSProperties}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`${label}: lap times across the race with fitted degradation lines per stint`}>
          {neutral.map((r) => <rect key={"n" + r.lap} x={sx(r.lap - 0.5)} width={Math.max(1, sx(r.lap + 0.5) - sx(r.lap - 0.5))} y={T} height={H - T - B} className="lab-neutral" />)}
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={L} x2={L + w} y1={sy(v)} y2={sy(v)} className="lab-grid" />
              <text x={L - 8} y={sy(v) + 4} textAnchor="end" className="lab-tick">{lapTime(v)}</text>
            </g>
          ))}
          {ticksX.map((l) => <text key={l} x={sx(l)} y={H - 10} textAnchor="middle" className="lab-tick">L{l}</text>)}
          {lines.map((l) => (
            <g key={l.key}>
              <path d={l.d} className="lab-fit-halo" />
              <path d={l.d} className="lab-fit" stroke={l.c} />
            </g>
          ))}
          {timed.map((r, i) => {
            const st = compoundStyle(r.compound);
            const out = r.time! > hi || r.time! < lo;
            return r.reason ? (
              <circle key={r.lap} cx={sx(r.lap)} cy={sy(r.time!)} r={hover === i ? 5.5 : 3.6} className={cx("lab-dot-x", out && "out")} />
            ) : (
              <circle key={r.lap} cx={sx(r.lap)} cy={sy(r.time!)} r={hover === i ? 6.5 : 4.4} fill={st.c} className="lab-dot" />
            );
          })}
          <rect x={L} y={0} width={w} height={H} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {h && (
        <div className="lab-tip glass glass-strong" style={{ left: Math.min(width - 190, Math.max(0, sx(h.lap) - 90)), top: Math.max(0, sy(h.time!) - 96) }}>
          <b>Lap {h.lap} · {lapTime(h.time)}</b>
          <span>{h.compound ? `${compoundStyle(h.compound).name} · tyre age ${h.age}` : "No stint record"}</span>
          <span className={cx(h.reason ? "faint" : "lab-ok")}>{h.reason ? `Excluded: ${EXCLUSIONS[h.reason]}` : "Clean · used in the fit"}</span>
          {(h.time! > hi || h.time! < lo) && <span className="faint">Off the scale — clipped to the edge</span>}
        </div>
      )}
    </div>
  );
}
