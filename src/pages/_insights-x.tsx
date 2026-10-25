/* Insights · upgrade tracker (qualifying pace step changes) and start performance (lap-one launches). Pure maths in src/analytics-x.mjs. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Info, Play, Rocket, RotateCcw, Table2, LineChart as ChartIcon, Zap } from "lucide-react";
import { paginate, qualifyingResults, useData } from "../api";
import { Link } from "../lib/router";
import { shortRace } from "../lib/season";
import { fullName, teamColor, teamShortName } from "../lib/media";
import { download, plural, toCSV } from "../lib/format";
import { Glass, Segmented, Skeleton, Source, StateView, cx } from "../ui/core";
import { DriverAvatar, TeamLogo } from "../ui/media";
import { lapOneGains, qualiPace, type LaunchRow, type TeamPace } from "../analytics-x.mjs";
import { ModelBadge } from "./_season";
import type { Envelope, Race } from "../types";

const fmtPct = (v: number, digits = 2) => `${v.toFixed(digits)}%`;
const fmtPP = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(2)}`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ───────────────────────── Upgrade tracker ───────────────────────── */
export function UpgradeTracker({ season, year }: { season: string; year: string }) {
  const q = useData(() => (+year >= 1994 ? qualifyingResults(season) : Promise.resolve(null as unknown as Envelope<Race[]>)), [season]);
  const pace = useMemo(() => (q.value?.data ? qualiPace(q.value.data) : null), [q.value]);
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  if (+year < 1994) return <StateView empty emptyTitle="No qualifying times before 1994" emptyText="The data provider publishes qualifying lap times from the 1994 season onward, so pace can't be tracked for this year." />;
  if (q.loading) return <Skeleton h={560} r={28} />;
  if (q.error) return <StateView error={q.error} onRetry={q.reload} />;
  if (!pace || pace.rounds.length < 2) return <StateView empty emptyTitle="Too early to track pace" emptyText="The tracker needs qualifying from at least two rounds." />;
  const teams = pace.teams.filter((t) => t.gaps.some((g) => g !== null));
  const steps = teams.flatMap((t) => t.steps.map((s) => ({ ...s, t }))).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const movers = teams.filter((t) => t.change).sort((a, b) => a.change!.delta - b.change!.delta);
  const active = focus ?? steps[0]?.t.id ?? null;
  const exportCSV = () => download(`f1-pulse-${year}-qualifying-pace.csv`, toCSV([
    ["Team", ...pace.rounds.map((r) => `R${r.round} ${shortRace(r.raceName)}`)],
    ...teams.map((t) => [t.team.name, ...t.raw.map((g) => (g === null ? "" : g.toFixed(3)))]),
  ]), "text/csv;charset=utf-8");
  return (
    <div className="ins-up">
      <Glass className="card flush ins-up-main reveal">
        <div className="ins-toolbar">
          <div className="ins-up-legend" role="group" aria-label="Focus a team">
            {teams.map((t) => (
              <button key={t.id} type="button" className={cx("ins-up-chip", active === t.id && "on")} aria-pressed={active === t.id} onClick={() => setFocus(active === t.id ? "" : t.id)} style={{ "--tint": teamColor(t.team) } as CSSProperties}>
                <i className="swatch" style={{ "--c": teamColor(t.team) } as CSSProperties} />{teamShortName(t.team.name, year)}
                {t.steps.length > 0 && <Zap size={11} aria-label={plural(t.steps.length, "detected step")} />}
              </button>
            ))}
          </div>
          <div className="ins-up-tools">
            <Segmented label="View" value={view} onChange={setView} options={[{ value: "chart", label: <><ChartIcon size={14} />Chart</> }, { value: "table", label: <><Table2 size={14} />Table</> }]} />
            <button className="btn sm glass-btn" onClick={exportCSV}><Download />CSV</button>
          </div>
        </div>
        {view === "chart" ? (
          <PaceChart rounds={pace.rounds} teams={teams} focus={active || null} year={year} />
        ) : (
          <PaceTable rounds={pace.rounds} teams={teams} year={year} />
        )}
        <p className="ins-foot"><Info size={13} />Lower is faster. Each car is compared with the fastest time of the deepest session it reached (Q3 with pole, a Q1 exit with the Q1 benchmark) and the team keeps its best car; gaps over 5% are dropped and one-off spikes (rain, red flags — hollow dots) are left out of the fit. Lines are a three-round moving average; dashed steps are the fitted levels between detected changes.{pace.missing.length ? ` No qualifying times published for R${pace.missing.join(", R")}.` : ""}</p>
      </Glass>

      <div className="ins-up-side">
        <Glass className="card reveal">
          <h3 className="ins-h3"><TrendingIcon />Biggest movers this season</h3>
          {movers.length ? (
            <ol className="ins-movers">
              {movers.map((t) => {
                const dlt = t.change!.delta;
                const max = Math.max(0.2, ...movers.map((m) => Math.abs(m.change!.delta)));
                return (
                  <li key={t.id} style={{ "--tint": teamColor(t.team) } as CSSProperties}>
                    <button type="button" className="ins-mover" onClick={() => setFocus(t.id)} aria-label={`${teamShortName(t.team.name, year)}: ${dlt < 0 ? "gained" : "lost"} ${Math.abs(dlt).toFixed(2)} percentage points`}>
                      <TeamLogo id={t.id} name={t.team.name} year={year} size={24} />
                      <span className="ins-mover-name">{teamShortName(t.team.name, year)}<small>{fmtPct(t.change!.first)} → {fmtPct(t.change!.last)}</small></span>
                      <span className="ins-div" aria-hidden><i className={dlt <= 0 ? "up" : "down"} style={{ width: (Math.abs(dlt) / max) * 50 + "%" }} /></span>
                      <b className={cx("ins-net", dlt < -0.05 ? "up" : dlt > 0.05 ? "down" : "")}>{fmtPP(dlt)}</b>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted small">Needs six rounds of qualifying per team.</p>}
          <p className="ins-foot flat"><Info size={13} />Average of the last three rounds minus the first three, in percentage points of the gap (negative = closer to the front).</p>
        </Glass>
        <Glass className="card reveal">
          <h3 className="ins-h3"><Zap size={16} />Detected steps</h3>
          <ModelBadge>Statistical detection</ModelBadge>
          {steps.length ? (
            <ul className="ins-steps">
              {steps.slice(0, 8).map((s) => {
                const r = pace.rounds[s.index];
                return (
                  <li key={s.t.id + s.index} style={{ "--tint": teamColor(s.t.team) } as CSSProperties}>
                    <button type="button" onClick={() => setFocus(s.t.id)} className={cx("ins-step", active === s.t.id && "on")}>
                      <span className={cx("ins-step-arrow", s.effect < 0 ? "up" : "down")}>{s.effect < 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}</span>
                      <span><b>{teamShortName(s.t.team.name, year)}</b> {s.effect < 0 ? "found" : "lost"} {Math.abs(s.effect).toFixed(2)}%<small>From R{r.round} {shortRace(r.raceName)} · {fmtPct(s.before)} → {fmtPct(s.after)} · z {s.z}</small></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted small">No step large enough to stand out from round-to-round noise yet.</p>}
          <p className="ins-foot flat"><Info size={13} />A detected step in pace, possibly an upgrade — not confirmed by the team. Track character, weather and tyre allocations also move qualifying gaps. Steps need ≥3 rounds either side, a shift of ≥0.15 points and z ≥ 3 against the series' own noise.</p>
        </Glass>
      </div>
      <Source value={q.value} label="Qualifying" />
    </div>
  );
}
const TrendingIcon = () => <ArrowUpRight size={16} />;

function PaceChart({ rounds, teams, focus, year }: { rounds: { round: string; raceName: string }[]; teams: TeamPace[]; focus: string | null; year: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 360, pad = { l: 50, r: 14, t: 26, b: 30 };
  const w = Math.max(0, width - pad.l - pad.r), h = H - pad.t - pad.b;
  const n = rounds.length;
  const all = teams.flatMap((t) => (focus !== null && t.id === focus ? t.gaps : t.trend)).filter((v): v is number => v !== null);
  const top = Math.max(0.5, Math.ceil(Math.max(...all, 0) * 2) / 2);
  const ticks: number[] = [];
  const stepT = top > 3 ? 1 : 0.5;
  for (let v = 0; v <= top + 1e-9; v += stepT) ticks.push(v);
  const x = (i: number) => pad.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => pad.t + (v / top) * h;
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const levelPath = (t: TeamPace) => {
    let d = "";
    t.levels.forEach((v, i) => { if (v === null) return; const x0 = x(Math.max(0, i - 0.5)), x1 = x(Math.min(n - 1, i + 0.5)); d += `M${x0.toFixed(1)},${y(v).toFixed(1)}H${x1.toFixed(1)}`; });
    return d;
  };
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 40))));
  const pick = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left - pad.l) / (w || 1)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const focused = teams.find((t) => t.id === focus);
  const rows = hover === null ? [] : teams.map((t) => ({ t, v: t.raw[hover], who: t.who[hover] })).filter((r) => r.v !== null).sort((a, b) => (a.t.id === focus ? -1 : b.t.id === focus ? 1 : a.v! - b.v!));
  const ordered = [...teams].sort((a, b) => (a.id === focus ? 1 : b.id === focus ? -1 : 0));
  return (
    <div
      ref={ref}
      className="chart ins-up-chart"
      style={{ height: H }}
      tabIndex={0}
      role="img"
      aria-label={`Qualifying gap to the session-fastest time per round for ${teams.length} teams${focused ? `; ${teamShortName(focused.team.name, year)} highlighted with ${plural(focused.steps.length, "detected step")}` : ""}. Use the table view for exact values.`}
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
          {ticks.map((v) => (
            <g key={v}>
              <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} />
              <text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? "0" : `+${v.toFixed(1)}%`}</text>
            </g>
          ))}
          <text className="axis ins-up-faster" x={pad.l - 8} y={pad.t - 12} textAnchor="end">faster ↑</text>
          {rounds.map((r, i) => ((i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) || i === n - 1 ? <text key={r.round} className="axis" x={x(i)} y={H - 8} textAnchor="middle">R{r.round}</text> : null))}
          {focused?.steps.map((s) => {
            const xs = x(s.index - 0.5);
            return (
              <g key={"s" + s.index} className="ins-up-step">
                <line x1={xs} x2={xs} y1={pad.t - 4} y2={pad.t + h} />
                <text x={xs + 4} y={pad.t + 8}>{s.effect < 0 ? "▲" : "▼"} {Math.abs(s.effect).toFixed(2)}%</text>
              </g>
            );
          })}
          {ordered.map((t) => {
            const on = focus === null || t.id === focus;
            const c = teamColor(t.team);
            return (
              <g key={t.id} style={{ opacity: on ? 1 : 0.16 }} className="ins-up-series">
                <path d={path(t.trend)} fill="none" stroke={c} strokeWidth={t.id === focus ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                {t.id === focus && <path d={levelPath(t)} fill="none" stroke={c} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />}
                {t.id === focus && t.gaps.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={t.spikes.includes(i) ? "var(--bg-elevated)" : c} stroke={t.spikes.includes(i) ? c : undefined} className={cx("ins-up-dot", t.spikes.includes(i) && "spike")} />))}
                {focus === null && t.steps.map((s) => { const v = t.trend[s.index]; return v === null ? null : <path key={"m" + s.index} d={`M${x(s.index)},${y(v) - 9}l5,7h-10z`} fill={c} />; })}
              </g>
            );
          })}
          {hover !== null && <line className="cursor" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />}
        </svg>
      )}
      {hover !== null && rows.length > 0 && (
        <div className="tooltip glass glass-strong" style={{ left: Math.min(Math.max(x(hover), 110), width - 110), top: 70 }}>
          <div className="t-title">R{rounds[hover].round} · {shortRace(rounds[hover].raceName)}</div>
          {rows.slice(0, 10).map(({ t, v, who }) => (
            <div className="t-row" key={t.id}>
              <span><i className="swatch" style={{ "--c": teamColor(t.team) } as CSSProperties} />{teamShortName(t.team.name, year)}{who ? <small className="faint"> · {who.name} {who.session}</small> : null}</span>
              <b>{v! > 5 ? `${fmtPct(v!)} ✕` : v === 0 ? "pole" : `+${fmtPct(v!, 3)}`}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaceTable({ rounds, teams, year }: { rounds: { round: string; raceName: string }[]; teams: TeamPace[]; year: string }) {
  return (
    <div className="table-wrap ins-up-table" tabIndex={0}>
      <table className="tbl">
        <caption className="sr-only">Qualifying gap to the session-fastest time (%) by team and round</caption>
        <thead>
          <tr><th scope="col">Team</th>{rounds.map((r) => <th key={r.round} scope="col" className="r" title={r.raceName}>R{r.round}</th>)}<th scope="col" className="r">Avg</th></tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id} style={{ "--tint": teamColor(t.team) } as CSSProperties}>
              <th scope="row"><span className="sa-who"><TeamLogo id={t.id} name={t.team.name} year={year} size={22} /><b>{teamShortName(t.team.name, year)}</b></span></th>
              {t.raw.map((g, i) => {
                const step = t.steps.find((s) => s.index === i);
                return <td key={i} className={cx("r", g !== null && g > 5 && "faint", step && "ins-up-stepcell")} title={step ? `Detected step: ${step.effect.toFixed(2)}%` : undefined}>{g === null ? "—" : g.toFixed(2)}{step ? (step.effect < 0 ? " ▲" : " ▼") : ""}</td>;
              })}
              <td className="r"><b>{t.mean === null ? "—" : t.mean.toFixed(2)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Start performance ───────────────────────── */
type Timing = { driverId: string; position: string };
const lapCache = new Map<string, Timing[] | null>(); // null = provider has no lap data for that race
let lapMeta: Envelope<unknown> | undefined;

export function LaunchBoard({ season, year, races }: { season: string; year: string; races: Race[] }) {
  const key = (r: Race) => `${season}:${r.round}`;
  const snapshot = () => {
    const laps = new Map<string, Timing[]>();
    let missing = 0;
    for (const r of races) {
      const v = lapCache.get(key(r));
      if (v) laps.set(r.round, v);
      else if (v === null) missing++;
    }
    return { laps, missing, done: races.filter((r) => lapCache.has(key(r))).length };
  };
  const [state, setState] = useState(() => ({ ...snapshot(), running: false, failed: [] as string[] }));
  const [sort, setSort] = useState<"total" | "avg">("total");
  const [all, setAll] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const data = useMemo(() => lapOneGains(races, state.laps), [races, state.laps]);
  if (+year < 1996) return <StateView empty emptyTitle="No lap charts before 1996" emptyText="The data provider publishes lap-by-lap positions from the 1996 season onward." />;

  const load = async (only?: string[]) => {
    cancelled.current = false;
    const todo = races.filter((r) => (only ? only.includes(r.round) : !lapCache.has(key(r))));
    setState((s) => ({ ...s, running: true, failed: only ? s.failed.filter((x) => !only.includes(x)) : [] }));
    for (const r of todo) {
      if (cancelled.current) return;
      try {
        const env = await paginate(`${season}/${r.round}/laps/1.json`, "Laps");
        const timings = env.data[0]?.Laps?.find((l) => l.number === "1")?.Timings || [];
        lapCache.set(key(r), timings.length ? timings : null);
        lapMeta ??= env;
      } catch {
        setState((s) => ({ ...s, failed: [...s.failed, r.round] }));
      }
      if (cancelled.current) return;
      setState((s) => ({ ...s, ...snapshot() }));
    }
    setState((s) => ({ ...s, running: false }));
  };

  const finished = state.done >= races.length;
  const min = Math.max(2, Math.ceil(data.loaded * 0.4));
  const rows = [...data.drivers].filter((r) => r.starts > 0).sort(sort === "avg" ? (a, b) => (b.starts >= min ? 1 : 0) - (a.starts >= min ? 1 : 0) || b.avg - a.avg : (a, b) => b.total - a.total || b.avg - a.avg);
  const shown = all ? rows : rows.slice(0, 15);
  const peak = Math.max(1, ...rows.map((r) => Math.abs(sort === "avg" ? r.avg : r.total)));
  const name = (id: string) => data.drivers.find((d) => d.id === id);
  const exportCSV = () => download(`f1-pulse-${year}-lap-one.csv`, toCSV([
    ["Driver", "Team", "Starts", "Net places", "Average", "Gained", "Held", "Lost", "Out on lap 1", "Best", "Worst"],
    ...rows.map((r) => [fullName(r.driver), r.team.name, r.starts, r.total, r.avg.toFixed(2), r.gained, r.held, r.lost, r.out, r.best?.gain ?? "", r.worst?.gain ?? ""]),
  ]), "text/csv;charset=utf-8");

  return (
    <div className="ins-pit">
      {!finished && (
        <Glass className="card ins-pit-load reveal">
          <div>
            <h3 className="ins-h3"><Rocket size={16} />{state.done ? `${state.done} of ${races.length} rounds loaded` : `Lap-one positions for ${plural(races.length, "round")}`}</h3>
            <p className="muted small">One small request per Grand Prix (lap 1 only), spaced out to respect the data provider's limits. Results are kept for this visit.</p>
          </div>
          {state.running ? (
            <div className="ins-pit-progress" role="progressbar" aria-valuemin={0} aria-valuemax={races.length} aria-valuenow={state.done} aria-label="Lap-one rounds loaded">
              <span style={{ width: (state.done / Math.max(1, races.length)) * 100 + "%" }} />
            </div>
          ) : (
            <button className="btn primary" onClick={() => load()}><Play />{state.done ? "Load the rest" : "Load lap-one data"}</button>
          )}
        </Glass>
      )}
      {state.failed.length > 0 && !state.running && (
        <p className="notice ins-note"><Info />{plural(state.failed.length, "round")} couldn't be loaded (R{state.failed.join(", R")}). <button className="btn sm glass-btn" onClick={() => load(state.failed)}><RotateCcw />Retry</button></p>
      )}
      {state.missing > 0 && <p className="notice ins-note"><Info />The provider has no lap chart for {plural(state.missing, "round")} of this season; they're left out.</p>}
      {state.running && !rows.length && <Skeleton h={420} r={28} />}
      {rows.length > 0 && (
        <div className="ins-gain">
          <div className="ins-launch-cards">
            {data.best && name(data.best.id) && <LaunchCard label="Best launch" tone="up" row={name(data.best.id)!} ev={data.best} year={year} />}
            {data.worst && data.worst.gain < 0 && name(data.worst.id) && <LaunchCard label="Toughest opening lap" tone="down" row={name(data.worst.id)!} ev={data.worst} year={year} />}
            <Glass className="card ins-launch-sum reveal">
              <span className="eyebrow"><Rocket size={13} />Field</span>
              <b>{data.loaded ? (data.moves / Math.max(1, data.loaded)).toFixed(1) : "—"}</b>
              <small>places changed hands per opening lap on average ({plural(data.loaded, "race")})</small>
            </Glass>
          </div>
          <Glass className="card flush reveal">
            <div className="ins-toolbar">
              <Segmented label="Rank by" value={sort} onChange={setSort} options={[{ value: "total", label: "Season total" }, { value: "avg", label: "Per start" }]} />
              <button className="btn sm glass-btn" onClick={exportCSV}><Download />CSV</button>
            </div>
            <div className="table-wrap" tabIndex={0}>
              <table className="tbl ins-gain-tbl">
                <caption className="sr-only">Lap-one launch leaderboard</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Driver</th>
                    <th scope="col" className="ins-gain-col"><span className="sr-only">Places gained or lost</span></th>
                    <th scope="col" className="r">{sort === "avg" ? "Per start" : "Net"}</th>
                    <th scope="col" className="r sa-hide-sm" title="Starts gained / held / lost">+ / = / −</th>
                    <th scope="col" className="r sa-hide-sm">Best</th>
                    <th scope="col" className="r sa-hide-sm">Worst</th>
                    <th scope="col" className="r" title="Retired on lap 1">L1 out</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => {
                    const v = sort === "avg" ? r.avg : r.total;
                    const ranked = sort === "total" || r.starts >= min;
                    return (
                      <tr key={r.id} className={cx(!ranked && "sa-faded")} style={{ "--tint": teamColor(r.team) } as CSSProperties}>
                        <td className="faint">{ranked ? i + 1 : "—"}</td>
                        <td><Link to={"driver/" + r.id} className="sa-who"><DriverAvatar id={r.id} name={fullName(r.driver)} year={year} team={r.team.constructorId} size={28} /><span><b>{r.driver.familyName}</b><small>{teamShortName(r.team.name, year)} · {plural(r.starts, "start")}{r.pitLane ? ` · ${r.pitLane} PL` : ""}</small></span></Link></td>
                        <td className="ins-gain-col"><span className="ins-div" role="img" aria-label={`${v >= 0 ? "Gained" : "Lost"} ${Math.abs(v).toFixed(sort === "avg" ? 1 : 0)} places`}><i className={v >= 0 ? "up" : "down"} style={{ width: (Math.abs(v) / peak) * 50 + "%" }} /></span></td>
                        <td className="r"><b className={cx("ins-net", v > 0 ? "up" : v < 0 ? "down" : "")}>{v > 0 ? "+" : ""}{sort === "avg" ? v.toFixed(2) : v}</b></td>
                        <td className="r sa-hide-sm faint">{r.gained} / {r.held} / {r.lost}</td>
                        <td className="r sa-hide-sm">{r.best ? <span title={`R${r.best.round} ${shortRace(r.best.raceName)}: P${r.best.from || "L"} → P${r.best.to}`}>{r.best.gain > 0 ? "+" : ""}{r.best.gain}</span> : "—"}</td>
                        <td className="r sa-hide-sm">{r.worst ? <span title={`R${r.worst.round} ${shortRace(r.worst.raceName)}: P${r.worst.from || "L"} → P${r.worst.to}`}>{r.worst.gain > 0 ? "+" : ""}{r.worst.gain}</span> : "—"}</td>
                        <td className="r">{r.out ? <span className="chip sa-dnf">{r.out}</span> : <span className="faint">0</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="ins-foot spread">
              <span><Info size={13} />Places = grid slot − position at the end of lap 1. Pit-lane starters (PL) count from the back of the field; drivers with no lap-1 timing retired on the opening lap and are counted separately; non-starters are excluded. {sort === "avg" ? `Per-start ranking needs ${plural(min, "start")}.` : ""}{!finished ? ` Partial: ${state.done} of ${races.length} rounds.` : ""}</span>
              {rows.length > 15 && <button className="btn sm plain" onClick={() => setAll((a) => !a)}>{all ? "Top 15" : `All ${rows.length}`}</button>}
            </div>
          </Glass>
        </div>
      )}
      {lapMeta && <Source value={lapMeta} label="Lap charts" />}
    </div>
  );
}

function LaunchCard({ label, tone, row, ev, year }: { label: string; tone: "up" | "down"; row: LaunchRow; ev: { round: string; raceName: string; from: number; to: number; gain: number }; year: string }) {
  return (
    <Glass className={cx("card ins-gain-best reveal", tone === "down" && "ins-launch-down")} style={{ "--tint": teamColor(row.team) } as CSSProperties}>
      <span className="eyebrow"><Rocket size={13} />{label}</span>
      <b className="ins-gain-best-n">{ev.gain > 0 ? "+" : ""}{ev.gain}</b>
      <p><DriverAvatar id={row.id} name={fullName(row.driver)} year={year} team={row.team.constructorId} size={34} /><span><b>{row.driver.familyName}</b><small>{ev.from ? `P${ev.from}` : "Pit lane"} → P{ev.to} after lap 1 · R{ev.round} {shortRace(ev.raceName)}</small></span></p>
    </Glass>
  );
}
