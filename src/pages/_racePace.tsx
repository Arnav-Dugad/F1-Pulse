/* Race weekend · race pace distribution + gap charts. */
import { useMemo, useState, type CSSProperties } from "react";
import { Activity, BarChart3, Loader2, Timer } from "lucide-react";
import { fullName, teamColor } from "../lib/media";
import { lapTime, plural } from "../lib/format";
import { Glass, Section, Segmented, Skeleton, Source, StateView, Toggle, cx } from "../ui/core";
import { LineChart, type Series } from "../ui/charts";
import type { Race as RaceData, Result } from "../types";
import {
  codeOf, fmtSigned, isClassified, jolpicaGaps, neutralWindows, openf1Gaps, quantile, secs, useWidth,
  type AnalysisState, type GapModel, type LapData,
} from "./_raceData";
import "./_race.css";

type PitStop = NonNullable<RaceData["PitStops"]>[number];

function LoadCta({ icon, title, text, laps, analysis, eligible }: { icon: React.ReactNode; title: string; text: string; laps: LapData; analysis?: AnalysisState; eligible?: boolean }) {
  return (
    <Glass className="rw-cta reveal">
      <span className="rw-cta-icon">{icon}</span>
      <div className="rw-cta-copy">
        <h3>{title}</h3>
        <p className="muted">{text}</p>
      </div>
      <div className="rw-cta-acts">
        <button className="btn primary lg" onClick={laps.load} disabled={laps.loading}>{laps.loading ? <><Loader2 className="rw-spin" />Loading laps…</> : <><Activity />Load lap data</>}</button>
        {eligible && analysis?.status === "idle" && <button className="btn glass-btn sm" onClick={analysis.start}>Use OpenF1 timing instead</button>}
      </div>
    </Glass>
  );
}

/* ───────── Race pace (box plots) ───────── */
type Box = { r: Result; n: number; q1: number; med: number; q3: number; lo: number; hi: number; best: number; mean: number; outliers: number[] };

export function RacePace({ race, results, laps, analysis, pits, year }: {
  race: RaceData; results: Result[]; laps: LapData; analysis: AnalysisState; pits: PitStop[]; year: string;
}) {
  void year;
  const [all, setAll] = useState(false);
  const [order, setOrder] = useState<"median" | "finish">("median");
  const [hover, setHover] = useState<string | null>(null);
  const a = analysis.status === "done" ? analysis.data : undefined;
  const source: "jolpica" | "openf1" | null = laps.laps.length ? "jolpica" : a && a.laps.length ? "openf1" : null;
  const windows = useMemo(() => (a && !a.failed.includes("race_control") && a.control.length ? neutralWindows(a.control, +results[0]?.laps || 0) : null), [a, results]);

  const model = useMemo(() => {
    if (!source) return null;
    // driverId → lap → { t, pitIn, pitOut }
    const per = new Map<string, Map<number, { t: number; pitIn: boolean; pitOut: boolean }>>();
    if (source === "jolpica") {
      const stops = new Map<string, Set<number>>();
      for (const s of pits) stops.set(s.driverId, (stops.get(s.driverId) || new Set()).add(+s.lap));
      for (const lap of laps.laps) {
        const n = +lap.number;
        for (const t of lap.Timings) {
          const v = secs(t.time);
          if (v === null) continue;
          const st = stops.get(t.driverId);
          if (!per.has(t.driverId)) per.set(t.driverId, new Map());
          per.get(t.driverId)!.set(n, { t: v, pitIn: !!st?.has(n), pitOut: !!st?.has(n - 1) });
        }
      }
    } else if (a) {
      const outs = new Set(a.laps.filter((l) => l.is_pit_out_lap).map((l) => l.driver_number + ":" + l.lap_number));
      for (const l of a.laps) {
        if (!l.lap_duration) continue;
        const id = a.who(l.driver_number).id;
        if (!per.has(id)) per.set(id, new Map());
        per.get(id)!.set(l.lap_number, { t: l.lap_duration, pitIn: outs.has(l.driver_number + ":" + (l.lap_number + 1)), pitOut: l.is_pit_out_lap });
      }
    }
    const neutral = (n: number) => !!windows?.some((w) => n >= w.start && n <= w.end + (w.kind === "VSC" ? 0 : 1));
    let excluded = 0, kept = 0;
    const boxes: Box[] = [];
    for (const r of results) {
      const m = per.get(r.Driver.driverId);
      if (!m) continue;
      let list = [...m.entries()].filter(([n, x]) => n > 1 && !x.pitIn && !x.pitOut && !neutral(n)).map(([, x]) => x.t);
      if (!windows) {
        const sorted = [...list].sort((p, q) => p - q);
        const med = quantile(sorted, 0.5);
        list = list.filter((t) => t < med * 1.07);
      }
      excluded += m.size - list.length;
      kept += list.length;
      if (list.length < 5) continue;
      const s = list.sort((p, q) => p - q);
      const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
      const inside = s.filter((t) => t >= q1 - 1.5 * iqr && t <= q3 + 1.5 * iqr);
      boxes.push({ r, n: s.length, q1, med, q3, lo: inside[0], hi: inside[inside.length - 1], best: s[0], mean: s.reduce((x, y) => x + y, 0) / s.length, outliers: s.filter((t) => t < q1 - 1.5 * iqr || t > q3 + 1.5 * iqr) });
    }
    return { boxes, excluded, kept };
  }, [source, laps.laps, pits, a, results, windows]);

  return (
    <Section id="rw-pace" title="Race pace" subtitle="Lap-time spread for every driver on representative laps — tighter boxes mean more consistent pace.">
      {!source ? (
        laps.error ? <StateView error={laps.error} onRetry={laps.reload} /> : laps.loading ? <Skeleton h={420} r={28} /> : (
          <LoadCta icon={<BarChart3 />} title="Who was really fastest?" text="Box plots of every driver's racing laps, with lap 1, pit laps and neutralised laps removed. Built from the lap-by-lap archive, loaded on request." laps={laps} analysis={analysis} eligible={+race.season >= 2023} />
        )
      ) : paceBody()}
    </Section>
  );

  function paceBody() {
    if (!model || !model.boxes.length) return <StateView empty emptyTitle="Not enough representative laps" emptyText="After removing lap 1, pit laps and neutralised laps, no driver has five or more laps to analyse." />;
    const pool = model.boxes.filter((b) => all || (isClassified(b.r) && +b.r.position <= 10));
    const rows = [...pool].sort((x, y) => (order === "median" ? x.med - y.med : +x.r.position - +y.r.position));
    const lo = Math.min(...rows.map((b) => Math.min(b.lo, ...b.outliers)));
    const hi = Math.max(...rows.map((b) => Math.max(b.hi, ...b.outliers)));
    const pad = (hi - lo) * 0.04 || 0.5;
    const min = lo - pad, max = hi + pad, span = max - min;
    const x = (t: number) => `${((t - min) / span) * 100}%`;
    // At most ~5 labelled ticks so the axis stays legible on phones (outliers can stretch the span).
    const step = [0.5, 1, 2, 5, 10, 20, 30].find((s) => span / s <= 5) || 60;
    const ticks: number[] = [];
    for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
    const fastestMed = Math.min(...rows.map((b) => b.med));
    const method = windows
      ? `Excludes lap 1, pit in- and out-laps${source === "jolpica" && !pits.length ? " (none recorded)" : ""}, and laps under the safety car, virtual safety car or red flag as signalled in OpenF1 race-control messages (plus the restart lap after SC and red flag periods; laps counted on the leader's lap).`
      : `Excludes lap 1, pit in- and out-laps${source === "jolpica" && !pits.length ? " (no pit data for this race)" : ""}, and any lap at or above 107% of that driver's median — a statistical filter for safety-car and incident laps, used because race-control data isn't available${+race.season >= 2023 ? " yet (load the session analysis below to switch to race-control windows)" : " for this season"}.`;
    return (
      <Glass className="card rw-pace reveal">
        <div className="rw-pace-bar">
          <Segmented label="Order drivers by" value={order} onChange={setOrder} options={[{ value: "median", label: "By median" }, { value: "finish", label: "By finish" }]} />
          <span className={cx("chip", windows ? "yellow" : "blue")}>{windows ? "Race-control filter" : "107% filter"}</span>
          <label className="rw-lap-toggle small muted">All drivers<Toggle checked={all} onChange={setAll} label="Show every driver with enough laps" /></label>
        </div>
        <div className="rw-pace-plot" role="img" aria-label={`Lap time distribution for ${rows.length} drivers. Fastest median ${lapTime(fastestMed)}.`}>
          <div className="rw-pace-axis" aria-hidden>
            {ticks.map((t) => <span key={t} style={{ left: x(t) }}>{Number.isInteger(t) ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : lapTime(t)}</span>)}
          </div>
          {rows.map((b) => (
            <div
              key={b.r.Driver.driverId}
              className={cx("rw-pace-row", hover && hover !== b.r.Driver.driverId && "dim", hover === b.r.Driver.driverId && "on")}
              style={{ "--tint": teamColor(b.r.Constructor) } as CSSProperties}
              onPointerEnter={() => setHover(b.r.Driver.driverId)} onPointerLeave={() => setHover(null)}
              tabIndex={0} onFocus={() => setHover(b.r.Driver.driverId)} onBlur={() => setHover(null)}
              aria-label={`${fullName(b.r.Driver)}: median ${lapTime(b.med)}, middle half ${lapTime(b.q1)} to ${lapTime(b.q3)}, ${b.n} laps`}
            >
              <span className="rw-pace-who"><span className="rw-pace-pos">{isClassified(b.r) ? b.r.position : b.r.positionText}</span><strong>{codeOf(b.r)}</strong></span>
              <span className="rw-pace-track">
                {ticks.map((t) => <i key={t} className="rw-pace-grid" style={{ left: x(t) }} aria-hidden />)}
                <span className="rw-pace-whisker" style={{ left: x(b.lo), width: `calc(${x(b.hi)} - ${x(b.lo)})` }} />
                <span className="rw-pace-box" style={{ left: x(b.q1), width: `max(3px, calc(${x(b.q3)} - ${x(b.q1)}))` }} />
                <span className="rw-pace-med" style={{ left: x(b.med) }} />
                {b.outliers.map((o, k) => <span key={k} className="rw-pace-out" style={{ left: x(o) }} />)}
              </span>
              <span className="rw-pace-val">
                <b>{lapTime(b.med)}</b>
                <small>{b.med === fastestMed ? `${b.n} laps` : `+${(b.med - fastestMed).toFixed(3)} · ${b.n}`}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="rw-pace-legend faint xsmall" aria-hidden>
          <span><i className="box" />Middle 50% of laps</span><span><i className="med" />Median</span><span><i className="wh" />Range (1.5× IQR)</span><span><i className="out" />Outlier lap</span>
        </div>
        <p className="source"><Timer /> Method: {method} {plural(model.kept, "lap")} analysed, {plural(model.excluded, "lap")} excluded. Lap times from {source === "jolpica" ? "the Jolpica lap-by-lap archive" : "OpenF1"}.</p>
        <Source value={source === "jolpica" ? laps.value : a?.env.laps} label="Laps" />
      </Glass>
    );
  }
}


/* ───────── Gap charts ───────── */
export function RaceGaps({ race, results, laps, analysis }: { race: RaceData; results: Result[]; laps: LapData; analysis: AnalysisState }) {
  const eligible = +race.season >= 2023;
  const a = analysis.status === "done" ? analysis.data : undefined;
  const ofModel = useMemo(() => (a ? openf1Gaps(a) : null), [a]);
  const jModel = useMemo(() => (laps.laps.length ? jolpicaGaps(laps.laps, results) : null), [laps.laps, results]);
  const [pick, setPick] = useState<"openf1" | "jolpica" | null>(null);
  const source = pick === "jolpica" && jModel ? "jolpica" : pick === "openf1" && ofModel ? "openf1" : ofModel ? "openf1" : jModel ? "jolpica" : null;
  const model = source === "openf1" ? ofModel : source === "jolpica" ? jModel : null;

  return (
    <Section id="rw-gaps" title="Gaps & intervals" subtitle="Time to the leader at the end of every lap, and a head-to-head worm for any two drivers.">
      {!model ? (
        laps.error ? <StateView error={laps.error} onRetry={laps.reload} /> : laps.loading || analysis.status === "loading" ? (
          <Glass className="card rw-lap-loading"><div className="spinner" /><p className="muted small">{analysis.status === "loading" ? `Loading OpenF1 timing · ${analysis.done} of ${analysis.total}…` : "Fetching lap times from the timing archive…"}</p><Skeleton h={320} r={20} /></Glass>
        ) : (
          <LoadCta icon={<Activity />} title="The race, in seconds." text={eligible ? "Official timing gaps arrive with the session analysis below; lap-time sums from the lap-by-lap archive work for any season." : "Gaps are rebuilt by summing every driver's lap times from the lap-by-lap archive (loaded on request)."} laps={laps} analysis={analysis} eligible={eligible} />
        )
      ) : (
        <GapBody key={source!} model={model} results={results} />
      )}
      {model && ofModel && jModel && (
        <div className="rw-gap-src">
          <Segmented label="Gap source" value={source!} onChange={(v) => setPick(v)} options={[{ value: "openf1", label: "OpenF1 timing" }, { value: "jolpica", label: "Lap-time sums" }]} />
        </div>
      )}
      {model && <Source value={source === "openf1" ? a?.env.intervals : laps.value} label={source === "openf1" ? "Intervals" : "Laps"} />}
    </Section>
  );
}

function GapBody({ model, results }: { model: GapModel; results: Result[] }) {
  const [focus, setFocus] = useState<string | null>(null);
  const ordered = results.filter((r) => model.gap.get(r.Driver.driverId)?.some((v) => v !== null));
  const top = ordered.slice(0, 10);
  const seen = new Set<string>();
  const series: Series[] = top.map((r) => {
    const team = r.Constructor.constructorId;
    const dashed = seen.has(team);
    seen.add(team);
    return { id: "gap-" + r.Driver.driverId, name: codeOf(r), color: model.who.get(r.Driver.driverId)?.color || "#888", values: model.gap.get(r.Driver.driverId) || [], dashed };
  });
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const sorted = [...all].sort((x, y) => x - y);
  // Clip the scale at the 98th percentile so one stricken car doesn't flatten the field.
  const yMax = Math.max(5, Math.ceil(quantile(sorted, 0.98) / 5) * 5);
  const labels = Array.from({ length: model.laps }, (_, i) => "L" + (i + 1));
  const [aId, setA] = useState(ordered[0]?.Driver.driverId || "");
  const [bId, setB] = useState(ordered[1]?.Driver.driverId || "");
  const A = model.who.get(aId), B = model.who.get(bId);
  const worm = (model.gap.get(bId) || []).map((v, i) => {
    const w = model.gap.get(aId)?.[i];
    return v === null || w === null || w === undefined ? null : v - w;
  });
  const opts = ordered.map((r) => ({ id: r.Driver.driverId, label: `${isClassified(r) ? "P" + r.position : r.positionText} · ${fullName(r.Driver)}` }));

  return (
    <div className="rw-gaps">
      <Glass className="card reveal">
        <div className="card-title"><h3>Gap to leader · top ten</h3><span className="chip">{model.source === "openf1" ? "OpenF1 timing gaps" : "Summed lap times"}</span></div>
        <div className="rw-lap-legend" role="group" aria-label="Highlight a driver">
          {series.map((s) => (
            <button key={s.id} type="button" className={cx("rw-lap-chip", focus && focus !== s.id && "dim")} style={{ "--tint": s.color } as CSSProperties} aria-pressed={focus === s.id}
              onClick={() => setFocus((f) => (f === s.id ? null : s.id))} onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)}>
              <span className="rw-lap-pos">{top.find((r) => "gap-" + r.Driver.driverId === s.id)?.position}</span>{s.name}{s.dashed && <i className="rw-lap-dash" />}
            </button>
          ))}
        </div>
        <LineChart
          ariaLabel="Gap to the race leader by lap for the top ten finishers"
          series={series}
          labels={labels}
          invert
          yMin={0}
          yMax={yMax}
          yFormat={(v) => (v === 0 ? "Leader" : `+${v.toFixed(v < 10 ? 1 : 0)}s`)}
          tooltipTitle={(i) => `End of lap ${i + 1}`}
          focus={focus}
          onFocus={setFocus}
          curve={false}
          height={380}
        />
        <p className="source">{model.source === "openf1" ? "Official timing gap to the leader at each line crossing (OpenF1 intervals, sampled at the end of each lap). Lapped cars are not plotted." : "Cumulative race time from summed lap times, minus the leader's at the same lap — a lap-time reconstruction, not the official interval feed."} Scale clipped at +{yMax}s.</p>
      </Glass>

      <Glass className="card reveal rw-worm-card" style={{ "--i": 1 } as CSSProperties}>
        <div className="rw-worm-head">
          <h3>Head-to-head worm</h3>
          <div className="rw-worm-pick">
            <select className="select" value={aId} onChange={(e) => setA(e.target.value)} aria-label="First driver">
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <span className="faint small">vs</span>
            <select className="select" value={bId} onChange={(e) => setB(e.target.value)} aria-label="Second driver">
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {A && B && aId !== bId ? (
          <Worm values={worm} a={A} b={B} />
        ) : <p className="muted small">Choose two different drivers.</p>}
      </Glass>
    </div>
  );
}

/** Diverging area chart of the time between two drivers, lap by lap. Above zero = driver A ahead. */
function Worm({ values, a, b }: { values: (number | null)[]; a: { code: string; color: string }; b: { code: string; color: string } }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 260, pad = { l: 48, r: 14, t: 16, b: 26 };
  const w = Math.max(0, width - pad.l - pad.r), h = H - pad.t - pad.b;
  const nums = values.filter((v): v is number => v !== null);
  const ext = Math.max(1, ...nums.map(Math.abs));
  const n = values.length;
  const x = (i: number) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => pad.t + h / 2 - (v / ext) * (h / 2);
  const sameColor = a.color.toLowerCase() === b.color.toLowerCase();
  const bColor = sameColor ? "var(--label-3)" : b.color;
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => { if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
  if (cur.length) segs.push(cur);
  const zero = y(0);
  const area = (s: [number, number][]) => `M${s[0][0]},${zero}L${s.map((p) => p.join(",")).join("L")}L${s[s.length - 1][0]},${zero}Z`;
  const step = ext > 30 ? 10 : ext > 12 ? 5 : ext > 5 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = -Math.floor(ext / step) * step; v <= ext; v += step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46))));
  const last = [...values].reverse().find((v) => v !== null);
  const id = `worm-${a.code}-${b.code}`.replace(/[^\w-]/g, "");
  const pick = (cx: number) => {
    const r = ref.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.round(((cx - r.left - pad.l) / (w || 1)) * (n - 1)))));
  };
  const hv = hover !== null ? values[hover] : null;
  return (
    <>
      <div className="rw-worm-key small">
        <span><i style={{ background: a.color }} />Above the line: <b>{a.code}</b> ahead</span>
        <span><i style={{ background: bColor }} />Below: <b>{b.code}</b> ahead</span>
        {last !== undefined && last !== null && <span className="faint">Final recorded gap: {a.code} {last >= 0 ? "ahead by" : "behind by"} {Math.abs(last).toFixed(3)}s</span>}
      </div>
      <div
        ref={ref}
        className="chart rw-worm"
        style={{ height: H }}
        tabIndex={0}
        role="img"
        aria-label={`Time gap between ${a.code} and ${b.code} by lap`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setHover((v) => Math.max(0, Math.min(n - 1, (v ?? (e.key === "ArrowRight" ? -1 : n)) + (e.key === "ArrowRight" ? 1 : -1)))); }
          if (e.key === "Escape") setHover(null);
        }}
      >
        {width > 0 && (
          <svg width={width} height={H} aria-hidden>
            <defs>
              <clipPath id={id + "-top"}><rect x={0} y={0} width={width} height={zero} /></clipPath>
              <clipPath id={id + "-bot"}><rect x={0} y={zero} width={width} height={H - zero} /></clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} style={t === 0 ? { stroke: "var(--label-3)" } : undefined} />
                <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? "0" : `${t > 0 ? "+" : "−"}${Math.abs(t)}s`}</text>
              </g>
            ))}
            {values.map((_, i) => (i % labelEvery === 0 || i === n - 1 ? <text key={i} className="axis" x={x(i)} y={H - 6} textAnchor="middle">L{i + 1}</text> : null))}
            {segs.map((s, k) => (
              <g key={k}>
                <path d={area(s)} fill={a.color} opacity={0.32} clipPath={`url(#${id}-top)`} />
                <path d={area(s)} style={{ fill: bColor }} opacity={0.32} clipPath={`url(#${id}-bot)`} />
                <path d={"M" + s.map((p) => p.join(",")).join("L")} fill="none" stroke="var(--label)" strokeWidth={1.6} strokeLinejoin="round" opacity={0.85} />
              </g>
            ))}
            {hover !== null && hv !== null && (
              <g>
                <line className="cursor" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />
                <circle className="dot" cx={x(hover)} cy={y(hv)} r={4.5} style={{ fill: hv >= 0 ? a.color : bColor }} />
              </g>
            )}
          </svg>
        )}
        {hover !== null && hv !== null && (
          <div className="tooltip glass glass-strong" style={{ left: Math.min(Math.max(x(hover), 100), width - 100), top: Math.max(60, y(hv)) }}>
            <div className="t-title">End of lap {hover + 1}</div>
            <div className="t-row"><span>{hv >= 0 ? a.code : b.code} ahead by</span><b>{Math.abs(hv).toFixed(3)}s</b></div>
            {hover > 0 && values[hover - 1] !== null && <div className="t-row faint"><span>Change this lap</span><b>{fmtSigned(hv - (values[hover - 1] as number), 3)}s</b></div>}
          </div>
        )}
      </div>
    </>
  );
}
