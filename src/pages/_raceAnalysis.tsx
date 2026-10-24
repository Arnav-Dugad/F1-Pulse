/* Race weekend · OpenF1 session analysis: overtakes, tyres, race control, team radio. */
import { useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowRight, Database, ExternalLink, Flag as FlagIcon, Layers, Radio, Repeat, ShieldAlert, Sparkles } from "lucide-react";
import { usePrefs } from "../app/prefs";
import { Link } from "../lib/router";
import { plural } from "../lib/format";
import { Glass, Section, Source, StateView, cx } from "../ui/core";
import { DriverAvatar } from "../ui/media";
import type { Race as RaceData, Result } from "../types";
import {
  JOB_LABEL, isClassified, localClock, neutralWindows, useInViewOnce,
  type Analysis, type AnalysisState, type Neutral, type OFControl, type Who,
} from "./_raceData";
import "./_race.css";

/* ───────── Gate: loads the archive on demand / when scrolled into view ───────── */
export function SessionAnalysis({ race, results, analysis, year }: { race: RaceData; results: Result[]; analysis: AnalysisState; year: string }) {
  const ref = useInViewOnce<HTMLDivElement>(analysis.start, "200px", analysis.status === "idle");
  const a = analysis.status === "done" ? analysis.data : undefined;
  const totalLaps = Math.max(1, +results[0]?.laps || 0, ...(a?.laps.map((l) => l.lap_number) || [0]));

  return (
    <>
      <Section id="rw-analysis" title="Session analysis" subtitle="Tyre strategy, overtakes, race control and team radio from the OpenF1 timing archive.">
        <div ref={ref}>
          {analysis.status === "unavailable" ? (
            <Glass className="rw-an-note reveal">
              <Database />
              <div>
                <strong>Not available for {race.season}</strong>
                <p className="muted small">The OpenF1 timing archive begins with the 2023 season, so tyre stints, overtakes, race-control messages, team radio and official intervals can't be shown for this race. Everything above comes from the long-running results archive.</p>
              </div>
            </Glass>
          ) : analysis.status === "missing" ? (
            <StateView empty emptyTitle="This race isn't in the OpenF1 archive" emptyText="No race session matching this date was found in the OpenF1 session list." />
          ) : analysis.status === "error" ? (
            <StateView error={analysis.error} onRetry={analysis.retry} />
          ) : analysis.status === "idle" || analysis.status === "loading" ? (
            <Glass className="rw-an-load reveal">
              <span className="rw-cta-icon"><Layers /></span>
              <div className="rw-an-load-copy">
                <h3>{analysis.status === "loading" ? `Loading ${Math.min(analysis.done + 1, analysis.total)} of ${analysis.total}…` : "Every stint, pass and radio call."}</h3>
                <p className="muted small">{analysis.status === "loading" ? `${analysis.current || "Preparing"} · requests are spaced politely to respect the archive's rate limit.` : "Around nine requests to the OpenF1 archive — loaded once, when you reach this part of the page."}</p>
                {analysis.status === "loading" && (
                  <div className="rw-an-progress" role="progressbar" aria-valuemin={0} aria-valuemax={analysis.total} aria-valuenow={analysis.done} aria-label="Session analysis loading progress">
                    <i style={{ width: `${(analysis.done / analysis.total) * 100}%` }} />
                  </div>
                )}
              </div>
              {analysis.status === "idle" && <button className="btn primary lg" onClick={analysis.start}><Sparkles />Load analysis</button>}
            </Glass>
          ) : a ? (
            <div className="rw-an-ok reveal">
              <span className="chip green"><Database />{a.session.circuit_short_name} · {a.session.session_name} · session {a.session.session_key}</span>
              {a.failed.length > 0 && <span className="chip yellow"><AlertTriangle />Unavailable: {a.failed.map((f) => JOB_LABEL[f]).join(", ")}</span>}
              <span className="faint xsmall">Jump to: <a className="link" href="#rw-tyres" onClick={jump("rw-tyres")}>Tyres</a> · <a className="link" href="#rw-overtakes" onClick={jump("rw-overtakes")}>Overtakes</a> · <a className="link" href="#rw-race-control" onClick={jump("rw-race-control")}>Race control</a> · <a className="link" href="#rw-radio" onClick={jump("rw-radio")}>Team radio</a></span>
            </div>
          ) : null}
        </div>
      </Section>
      {a && (
        <>
          <Tyres a={a} results={results} totalLaps={totalLaps} />
          <Overtakes a={a} totalLaps={totalLaps} year={year} />
          <RaceControl a={a} totalLaps={totalLaps} />
          <TeamRadio a={a} year={year} />
        </>
      )}
    </>
  );
}
const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

/* ───────── Tyre story ───────── */
const COMPOUND: Record<string, { cls: string; letter: string; label: string }> = {
  SOFT: { cls: "soft", letter: "S", label: "Soft" }, MEDIUM: { cls: "medium", letter: "M", label: "Medium" }, HARD: { cls: "hard", letter: "H", label: "Hard" },
  INTERMEDIATE: { cls: "inter", letter: "I", label: "Intermediate" }, WET: { cls: "wet", letter: "W", label: "Wet" },
};
const compound = (c: string | null) => COMPOUND[(c || "").toUpperCase()] || { cls: "unknown", letter: "?", label: "Unknown" };

function Tyres({ a, results, totalLaps }: { a: Analysis; results: Result[]; totalLaps: number }) {
  const rows = useMemo(() => {
    const by = new Map<number, typeof a.stints>();
    for (const s of a.stints) by.set(s.driver_number, [...(by.get(s.driver_number) || []), s]);
    const list = [...by.entries()].map(([n, stints]) => ({ who: a.who(n), stints: stints.sort((x, y) => x.stint_number - y.stint_number) }));
    const rank = (w: Who) => (w.result ? results.indexOf(w.result) : 999);
    return list.sort((x, y) => rank(x.who) - rank(y.who));
  }, [a, results]);
  if (a.failed.includes("stints")) return <Section id="rw-tyres" title="Tyre story"><StateView error="Tyre stints couldn't be loaded from the archive." /></Section>;
  if (!rows.length) return <Section id="rw-tyres" title="Tyre story"><StateView empty emptyTitle="No stint data" emptyText="The archive has no tyre stints for this race." /></Section>;

  const groups = new Map<number, Who[]>();
  for (const r of rows) {
    if (!r.who.result || !isClassified(r.who.result)) continue;
    const stops = r.stints.length - 1;
    groups.set(stops, [...(groups.get(stops) || []), r.who]);
  }
  const groupList = [...groups.entries()].sort((x, y) => x[0] - y[0]);
  const fieldSize = results.length;
  const used = new Set(rows.flatMap((r) => r.stints.map((s) => compound(s.compound).cls)));
  const ticks = Array.from({ length: Math.floor(totalLaps / 10) }, (_, i) => (i + 1) * 10).filter((t) => t < totalLaps);

  return (
    <Section id="rw-tyres" title="Tyre story" subtitle="Every driver's compound strategy, stint by stint, in finishing order.">
      <Glass className="card rw-ty reveal">
        <div className="rw-ty-legend">
          {Object.values(COMPOUND).filter((c) => used.has(c.cls)).map((c) => <span key={c.cls}><i className={"rw-tyre " + c.cls}>{c.letter}</i>{c.label}</span>)}
          <span><i className="rw-ty-usedkey" />Used set at stint start</span>
        </div>
        <div className="rw-ty-scale" aria-hidden>
          <span />
          <span className="rw-pit-axis">
            <span style={{ left: 0 }}>L1</span>
            {ticks.map((t) => <span key={t} style={{ left: `${(t / totalLaps) * 100}%` }}>L{t}</span>)}
            <span style={{ left: "100%" }}>L{totalLaps}</span>
          </span>
        </div>
        <ol className="rw-ty-list">
          {rows.map(({ who, stints }, i) => (
            <li key={who.n} className="rw-ty-row reveal" style={{ "--tint": who.color, "--i": i % 10 } as CSSProperties}>
              <span className="rw-ty-who">
                <span className="rw-pit-pos">{who.result ? (isClassified(who.result) ? who.result.position : who.result.positionText) : "—"}</span>
                <strong>{who.code}</strong>
              </span>
              <span className="rw-ty-track" role="img" aria-label={`${who.name}: ${stints.map((s) => `${compound(s.compound).label} laps ${s.lap_start ?? "?"}–${s.lap_end ?? "?"}`).join(", ")}`}>
                {stints.map((s) => {
                  const start = s.lap_start ?? 1;
                  const end = s.lap_end ?? (who.result ? +who.result.laps : start);
                  const len = Math.max(1, end - start + 1);
                  const c = compound(s.compound);
                  const isUsed = (s.tyre_age_at_start || 0) > 0;
                  const pct = (len / totalLaps) * 100;
                  return (
                    <span key={s.stint_number} className={cx("rw-stint", c.cls, isUsed && "used")} style={{ left: `${((start - 1) / totalLaps) * 100}%`, width: `${pct}%` }}
                      title={`Stint ${s.stint_number} · ${c.label}${isUsed ? ` (used, ${s.tyre_age_at_start} laps old)` : " (new)"} · laps ${start}–${end} · ${plural(len, "lap")}`}>
                      <i className={"rw-tyre " + c.cls}>{c.letter}</i>
                      {pct > 9 && <b>{len}</b>}
                    </span>
                  );
                })}
              </span>
              <span className="rw-ty-n">{stints.length - 1}<small>{stints.length - 1 === 1 ? "stop" : "stops"}</small></span>
            </li>
          ))}
        </ol>
      </Glass>

      {groupList.length > 0 && (
        <div className="rw-ty-groups">
          {groupList.map(([stops, list], gi) => {
            const pos = list.map((w) => +w.result!.position).sort((x, y) => x - y);
            const avg = pos.reduce((s, v) => s + v, 0) / pos.length;
            return (
              <Glass key={stops} className="card rw-ty-group reveal" style={{ "--i": gi } as CSSProperties}>
                <div className="rw-ty-group-head">
                  <b>{stops === 0 ? "No stop" : `${stops}-stop`}</b>
                  <span className="faint small">{plural(list.length, "finisher")} · best P{pos[0]} · average P{avg.toFixed(1)}</span>
                </div>
                <div className="rw-ty-dots" role="img" aria-label={`${stops}-stop finishers took positions ${pos.join(", ")}`}>
                  <span className="rw-ty-dots-line" />
                  {list.map((w) => (
                    <span key={w.n} className="rw-ty-dot" style={{ left: `${((+w.result!.position - 1) / Math.max(1, fieldSize - 1)) * 100}%`, "--tint": w.color } as CSSProperties} title={`${w.code} · P${w.result!.position}`}>
                      <small>{w.code}</small>
                    </span>
                  ))}
                </div>
                <div className="rw-ty-dots-axis faint xsmall"><span>P1</span><span>P{fieldSize}</span></div>
                <div className="rw-ty-who">
                  {[...list].sort((x, y) => +x.result!.position - +y.result!.position).map((w) => (
                    <span key={w.n} style={{ "--tint": w.color } as CSSProperties}><b>P{w.result!.position}</b>{w.code}</span>
                  ))}
                </div>
              </Glass>
            );
          })}
        </div>
      )}
      <p className="source">Stops are counted as stints minus one, so tyre changes under a red flag count too. Strategy groups include classified finishers only.</p>
      <Source value={a.env.stints} label="Stints" />
    </Section>
  );
}

/* ───────── Overtakes ───────── */
function Overtakes({ a, totalLaps, year }: { a: Analysis; totalLaps: number; year: string }) {
  const [filter, setFilter] = useState<string>("all");
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const list = useMemo(() => a.overtakes.map((o) => ({ o, lap: a.lapAt(o.overtaking_driver_number, o.date), by: a.who(o.overtaking_driver_number), on: a.who(o.overtaken_driver_number) })), [a]);
  if (a.failed.includes("overtakes")) return <Section id="rw-overtakes" title="Overtakes"><StateView error="Overtakes couldn't be loaded from the archive." /></Section>;
  if (!list.length) return <Section id="rw-overtakes" title="Overtakes"><StateView empty emptyTitle="No overtakes recorded" emptyText="The archive has no position exchanges for this race." /></Section>;

  const made = new Map<number, number>(), lost = new Map<number, number>();
  for (const x of list) { made.set(x.by.n, (made.get(x.by.n) || 0) + 1); lost.set(x.on.n, (lost.get(x.on.n) || 0) + 1); }
  const board = [...made.entries()].sort((p, q) => q[1] - p[1]);
  const victim = [...lost.entries()].sort((p, q) => q[1] - p[1])[0];
  const perLap = Array.from({ length: totalLaps }, () => 0);
  for (const x of list) if (x.lap && x.lap <= totalLaps) perLap[x.lap - 1]++;
  const peak = Math.max(1, ...perLap);
  const busiest = perLap.indexOf(Math.max(...perLap)) + 1;
  const max = board[0]?.[1] || 1;
  const shown = list.filter((x) => filter === "all" || String(x.by.n) === filter || String(x.on.n) === filter);
  const drivers = [...new Set(list.flatMap((x) => [x.by.n, x.on.n]))].map((n) => a.who(n)).sort((p, q) => p.code.localeCompare(q.code));

  return (
    <Section id="rw-overtakes" title="Overtakes" subtitle="Every recorded change of position between two cars, lap by lap.">
      <div className="rw-ov-kpis">
        <Glass className="kpi reveal"><span className="label"><Repeat size={13} /> Position exchanges</span><span className="value">{list.length}</span><span className="detail">Busiest: lap {busiest} ({perLap[busiest - 1]})</span></Glass>
        <Glass className="kpi reveal" style={{ "--i": 1 } as CSSProperties}><span className="label">Most passes made</span><span className="value">{a.who(board[0][0]).code}</span><span className="detail">{a.who(board[0][0]).name} · {board[0][1]}</span></Glass>
        {victim && <Glass className="kpi reveal" style={{ "--i": 2 } as CSSProperties}><span className="label">Most often passed</span><span className="value">{a.who(victim[0]).code}</span><span className="detail">{a.who(victim[0]).name} · {victim[1]}</span></Glass>}
      </div>

      <Glass className="card rw-ov-hist reveal">
        <div className="card-title"><h3>Passes per lap</h3><span className="faint small">{hoverLap ? `Lap ${hoverLap} · ${plural(perLap[hoverLap - 1], "pass", "passes")}` : `Peak ${peak} on a single lap`}</span></div>
        <div className="rw-ov-bars" role="img" aria-label={`Overtakes per lap; the busiest was lap ${busiest} with ${perLap[busiest - 1]}`} onPointerLeave={() => setHoverLap(null)}>
          {perLap.map((v, i) => (
            <span key={i} className={cx("rw-ov-bar", hoverLap === i + 1 && "on")} onPointerEnter={() => setHoverLap(i + 1)} title={`Lap ${i + 1}: ${v}`}>
              <i style={{ height: v ? `${Math.max(6, (v / peak) * 100)}%` : 0, "--i": i } as CSSProperties} />
            </span>
          ))}
        </div>
        <div className="rw-wx-axis" aria-hidden><span>L1</span><span>L{Math.round(totalLaps / 2)}</span><span>L{totalLaps}</span></div>
      </Glass>

      <div className="rw-ov-split">
        <Glass className="card reveal">
          <div className="card-title"><h3>Leaderboard</h3><span className="faint xsmall">made · lost</span></div>
          <ol className="rw-ov-board">
            {board.slice(0, 10).map(([n, c]) => {
              const w = a.who(n);
              return (
                <li key={n} style={{ "--tint": w.color, "--w": `${(c / max) * 100}%` } as CSSProperties}>
                  {w.result ? <DriverAvatar id={w.id} name={w.name} year={year} team={w.result.Constructor.constructorId} size={28} /> : <span className="rw-code-dot" />}
                  <span className="rw-ov-board-main"><strong>{w.code}</strong><span className="rw-mover-bar"><i /></span></span>
                  <b>{c}</b><span className="faint small">{lost.get(n) || 0}</span>
                </li>
              );
            })}
          </ol>
        </Glass>
        <Glass className="card reveal rw-ov-feed" style={{ "--i": 1 } as CSSProperties}>
          <div className="rw-ov-feed-head">
            <h3>Timeline</h3>
            <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter overtakes by driver">
              <option value="all">All drivers</option>
              {drivers.map((d) => <option key={d.n} value={String(d.n)}>{d.code} · {d.name}</option>)}
            </select>
          </div>
          <ol className="rw-ov-list">
            {shown.map((x, i) => (
              <li key={i}>
                <span className="rw-ov-lap">{x.lap ? `L${x.lap}` : "—"}</span>
                <span className="rw-code" style={{ "--tint": x.by.color } as CSSProperties}>{x.by.code}</span>
                <ArrowRight size={13} className="faint" />
                <span className="rw-code muted-code" style={{ "--tint": x.on.color } as CSSProperties}>{x.on.code}</span>
                <span className="faint small">for P{x.o.position}</span>
              </li>
            ))}
          </ol>
        </Glass>
      </div>
      <p className="source">Position exchanges as recorded by the OpenF1 archive — they can include changes during pit-stop cycles, not only on-track passes. Laps are matched from timestamps using each driver's lap start times.</p>
      <Source value={a.env.overtakes} label="Overtakes" />
    </Section>
  );
}

/* ───────── Race control ───────── */
type RcKind = "neutral" | "flag" | "penalty" | "limits" | "drs" | "blue" | "other";
const rcKind = (m: OFControl): RcKind => {
  const msg = (m.message || "").toUpperCase();
  if (m.category === "SafetyCar" || /SAFETY CAR/.test(msg)) return "neutral";
  if (m.flag === "BLUE") return "blue";
  if (/TRACK LIMITS|DELETED/.test(msg)) return "limits";
  if (/PENALTY|INVESTIGATION|NOTED|REVIEWED|INFRINGEMENT|REPRIMAND|DISQUALIF|NO FURTHER ACTION|STEWARDS/.test(msg)) return "penalty";
  if (m.category === "Drs" || /\bDRS\b/.test(msg)) return "drs";
  if (m.category === "Flag" || m.flag) return "flag";
  return "other";
};
const RC_FILTERS: { id: "key" | RcKind | "all"; label: string }[] = [
  { id: "key", label: "Key events" }, { id: "neutral", label: "SC / VSC" }, { id: "flag", label: "Flags" }, { id: "penalty", label: "Stewards" },
  { id: "limits", label: "Track limits" }, { id: "drs", label: "DRS" }, { id: "blue", label: "Blue flags" }, { id: "all", label: "All" },
];
const isKey = (m: OFControl, k: RcKind) => k === "neutral" || k === "penalty" || (k === "flag" && ["RED", "CHEQUERED", "GREEN", "DOUBLE YELLOW"].includes(m.flag || "") && (m.scope || "Track") === "Track") || (k === "flag" && m.flag === "RED");

/** Lap-axis strip of neutralised periods — shared with the lap chart. */
export function RCStrip({ windows, totalLaps, className }: { windows: Neutral[]; totalLaps: number; className?: string }) {
  if (!windows.length || totalLaps < 1) return null;
  return (
    <div className={cx("rw-rc-strip", className)} role="img" aria-label={windows.map((w) => `${w.kind === "RED" ? "Red flag" : w.kind} laps ${w.start}–${w.end}`).join(", ")}>
      {windows.map((w, i) => (
        <span key={i} className={cx("rw-rc-band", w.kind.toLowerCase())} style={{ left: `${((w.start - 1) / totalLaps) * 100}%`, width: `${Math.max(0.8, ((w.end - w.start + 1) / totalLaps) * 100)}%` }} title={`${w.kind === "RED" ? "Red flag" : w.kind === "SC" ? "Safety car" : "Virtual safety car"} · laps ${w.start}–${w.end}${w.open ? " (end not signalled)" : ""}`}>
          <b>{w.kind === "RED" ? "RED" : w.kind}</b>
        </span>
      ))}
    </div>
  );
}

function RaceControl({ a, totalLaps }: { a: Analysis; totalLaps: number }) {
  const { timezone } = usePrefs();
  const [f, setF] = useState<(typeof RC_FILTERS)[number]["id"]>("key");
  const items = useMemo(() => a.control.map((m) => ({ m, k: rcKind(m) })), [a]);
  const windows = useMemo(() => neutralWindows(a.control, totalLaps), [a, totalLaps]);
  if (a.failed.includes("race_control")) return <Section id="rw-race-control" title="Race control"><StateView error="Race-control messages couldn't be loaded from the archive." /></Section>;
  if (!items.length) return <Section id="rw-race-control" title="Race control"><StateView empty emptyTitle="No race-control messages" emptyText="The archive has no race-control messages for this race." /></Section>;
  const count = (id: (typeof RC_FILTERS)[number]["id"]) => items.filter((x) => (id === "all" ? true : id === "key" ? isKey(x.m, x.k) : x.k === id)).length;
  const shown = items.filter((x) => (f === "all" ? true : f === "key" ? isKey(x.m, x.k) : x.k === f));
  const markers = shown.filter((x) => x.m.lap_number);

  return (
    <Section id="rw-race-control" title="Race control" subtitle="Flags, safety cars and stewards' decisions, placed on the lap axis.">
      <Glass className="card rw-rc reveal">
        <div className="rw-rc-filters" role="group" aria-label="Filter race-control messages">
          {RC_FILTERS.map((x) => {
            const c = count(x.id);
            if (!c && x.id !== "key" && x.id !== "all") return null;
            return <button key={x.id} type="button" className={cx("rw-rc-filter", f === x.id && "on")} aria-pressed={f === x.id} onClick={() => setF(x.id)}>{x.label}<small>{c}</small></button>;
          })}
        </div>
        <div className="rw-rc-axis-wrap">
          <RCStrip windows={windows} totalLaps={totalLaps} />
          <div className="rw-rc-marks" aria-hidden>
            {markers.map((x, i) => <i key={i} className={cx("rw-rc-mark", "k-" + x.k, x.m.flag && "f-" + x.m.flag.toLowerCase().replace(/\s+/g, "-"))} style={{ left: `${((Math.min(x.m.lap_number!, totalLaps) - 0.5) / totalLaps) * 100}%` }} title={`Lap ${x.m.lap_number}: ${x.m.message}`} />)}
          </div>
          <div className="rw-wx-axis" aria-hidden><span>L1</span><span>L{Math.round(totalLaps / 2)}</span><span>L{totalLaps}</span></div>
        </div>
        {!windows.length && <p className="faint xsmall">No safety car, virtual safety car or red flag was signalled.</p>}
        <ol className="rw-rc-list">
          {shown.map((x, i) => (
            <li key={i} className={cx("rw-rc-item", "k-" + x.k)}>
              <span className="rw-rc-lap">{x.m.lap_number ? `L${x.m.lap_number}` : "—"}<small>{localClock(x.m.date, timezone)}</small></span>
              <span className={cx("rw-rc-icon", "k-" + x.k, x.m.flag && "f-" + x.m.flag.toLowerCase().replace(/\s+/g, "-"))}>{x.k === "neutral" ? <ShieldAlert size={14} /> : <FlagIcon size={14} />}</span>
              <span className="rw-rc-msg">{x.m.message}{x.m.driver_number ? <small className="faint"> · {a.who(x.m.driver_number).code}</small> : null}</span>
            </li>
          ))}
          {!shown.length && <li className="muted small">No messages in this category.</li>}
        </ol>
      </Glass>
      <p className="source">Messages exactly as issued by race control (OpenF1). Lap numbers are the leader's lap; times in your chosen time zone. Bands mark SC/VSC/red-flag periods from deployment to the in-lap or ending message.</p>
      <Source value={a.env.race_control} label="Race control" />
    </Section>
  );
}

/* ───────── Team radio ───────── */
function TeamRadio({ a, year }: { a: Analysis; year: string }) {
  const { timezone } = usePrefs();
  const [who, setWho] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  if (a.failed.includes("team_radio")) return <Section id="rw-radio" title="Team radio"><StateView error="Team radio couldn't be loaded from the archive." /></Section>;
  if (!a.radio.length) return <Section id="rw-radio" title="Team radio"><StateView empty emptyTitle="No team radio published" emptyText="The archive has no radio recordings for this race." /></Section>;
  const counts = new Map<number, number>();
  for (const r of a.radio) counts.set(r.driver_number, (counts.get(r.driver_number) || 0) + 1);
  const people = [...counts.entries()].map(([n, c]) => ({ w: a.who(n), c })).sort((p, q) => (p.w.result ? +p.w.result.position || 99 : 99) - (q.w.result ? +q.w.result.position || 99 : 99));
  const list = a.radio.filter((r) => who === null || r.driver_number === who);
  const visible = more ? list : list.slice(0, 24);

  return (
    <Section id="rw-radio" title="Team radio" subtitle="Published radio clips between drivers and their pit walls, in race order.">
      <Glass className="card rw-radio reveal">
        <div className="rw-radio-people" role="group" aria-label="Filter radio by driver">
          <button type="button" className={cx("rw-rc-filter", who === null && "on")} aria-pressed={who === null} onClick={() => setWho(null)}>Everyone<small>{a.radio.length}</small></button>
          {people.map(({ w, c }) => (
            <button key={w.n} type="button" className={cx("rw-rc-filter team", who === w.n && "on")} style={{ "--tint": w.color } as CSSProperties} aria-pressed={who === w.n} onClick={() => setWho(who === w.n ? null : w.n)}>{w.code}<small>{c}</small></button>
          ))}
        </div>
        <ol className="rw-radio-list">
          {visible.map((r, i) => {
            const w = a.who(r.driver_number);
            const lap = a.lapAt(r.driver_number, r.date);
            return (
              <li key={r.recording_url + i} className="rw-radio-item" style={{ "--tint": w.color } as CSSProperties}>
                {w.result ? <DriverAvatar id={w.id} name={w.name} year={year} team={w.result.Constructor.constructorId} size={34} /> : <span className="rw-code-dot" />}
                <span className="rw-radio-main">
                  {w.result ? <Link to={"driver/" + w.id} className="rw-radio-name">{w.name}</Link> : <strong className="rw-radio-name">{w.name}</strong>}
                  <small className="faint">{lap ? `Lap ${lap} · ` : ""}{localClock(r.date, timezone)}</small>
                </span>
                <span className="rw-radio-wave" aria-hidden>{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ "--k": k } as CSSProperties} />)}</span>
                <audio className="rw-radio-audio" controls preload="none" src={r.recording_url} aria-label={`${w.name}'s team radio${lap ? ` on lap ${lap}` : ""}`} />
                <a className="icon-btn rw-radio-open" href={r.recording_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${w.name}'s radio recording in a new tab`}>
                  <ExternalLink size={15} />
                </a>
              </li>
            );
          })}
        </ol>
        {list.length > visible.length && <button className="btn sm plain rw-radio-more" onClick={() => setMore(true)}>Show all {list.length} clips</button>}
      </Glass>
      <p className="source">Recordings are hosted by Formula 1's live-timing service and open in a new tab. Laps are matched from each clip's timestamp.</p>
      <Source value={a.env.team_radio} label="Team radio" />
    </Section>
  );
}
