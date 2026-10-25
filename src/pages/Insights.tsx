import { useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { ArrowRight, Download, Gauge, Info, Play, Rocket, RotateCcw, Timer, TrendingUp, Users, Wrench, Zap } from "lucide-react";
import { allResults, pitStops, qualifyingResults, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { shortRace, useCalendar } from "../lib/season";
import { circuitMedia, fullName, teamColor, teamShortName } from "../lib/media";
import { download, plural, pts, toCSV } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, TeamLogo } from "../ui/media";
import {
  CAUSES, formTrend, pitLeague, pointsMatrix, positionsGained, reliability, rollingAverage, statusCause, teammateGaps,
  type CauseKey, type PitRound, type Reliability as RelData, type TeammatePair,
} from "../season-analytics.mjs";
import { Lazy, Trend, useSprints } from "./_season";
import { LaunchBoard, UpgradeTracker } from "./_insights-x";
import type { Driver, Envelope, Race, Team } from "../types";
import "./insights.css";

export default function Insights(_: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle(`${year} Insights`);
  const results = useData(() => allResults(season), [season]);
  const sprints = useSprints(season, year);
  const cal = useCalendar(season);
  const races = useMemo(() => (results.value?.data || []).filter((r) => r.Results?.length), [results.value]);
  const teamPoints = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of races) for (const x of r.Results || []) m.set(x.Constructor.constructorId, (m.get(x.Constructor.constructorId) || 0) + +x.points);
    return m;
  }, [races]);
  const topTeam = [...teamPoints.entries()].sort((a, b) => b[1] - a[1]);
  useAmbient(teamColor(topTeam[0]?.[0]), teamColor(topTeam[1]?.[0]));

  const loading = results.loading;
  const failed = results.error;
  const empty = !loading && !failed && !races.length;

  return (
    <Page className="ins">
      <InsightsHero year={year} races={races} total={cal.value?.data.length || 0} loading={loading} />

      {failed ? (
        <Section title="Insights"><StateView error={failed} onRetry={results.reload} /></Section>
      ) : empty ? (
        <Section title="Insights"><StateView empty emptyTitle="No races classified yet" emptyText={`Insights for ${year} appear after the first Grand Prix.`} /></Section>
      ) : (
        <>
          <Section id="teammates" title="Teammate gap index" subtitle="The only fair fight in Formula 1: same car, same weekend. Qualifying and race head-to-heads, plus the average qualifying gap.">
            <Lazy height={520}>{() => (loading ? <Skeleton h={520} r={28} /> : <Teammates season={season} year={year} races={races} order={teamPoints} />)}</Lazy>
          </Section>

          <Section id="upgrades" title="Upgrade tracker" subtitle="Each team's qualifying pace round by round — best car, as a gap to the fastest time of the same session — with automatic detection of step changes.">
            <Lazy height={560}>{() => <UpgradeTracker season={season} year={year} />}</Lazy>
          </Section>

          <Section id="reliability" title="Reliability" subtitle="Every non-finish, grouped by the cause the results record gives.">
            <Lazy height={480}>{() => (loading ? <Skeleton h={480} r={28} /> : <Reliability races={races} year={year} />)}</Lazy>
            <Source value={results.value} />
          </Section>

          <Section id="form" title="Form curves" subtitle="Rolling five-round average of points scored (Grand Prix + sprint), driver by driver, on one shared scale.">
            <Lazy height={560}>{() => (loading || sprints.loading ? <Skeleton h={560} r={28} /> : <FormCurves races={races} sprints={sprints.value?.data || []} year={year} />)}</Lazy>
            <Source value={results.value} />
          </Section>

          <Section id="pit-stops" title="Pit-stop league" subtitle="Fastest and median pit-lane times per team, loaded race by race when you ask for them.">
            <PitStops key={season + ":" + races.length} season={season} year={year} races={races} />
          </Section>

          <Section id="positions-gained" title="Positions gained" subtitle="Grid to chequered flag, summed over the season for classified finishers.">
            <Lazy height={520}>{() => (loading ? <Skeleton h={520} r={28} /> : <Gained races={races} year={year} />)}</Lazy>
            <Source value={results.value} />
          </Section>

          <Section id="launch" title="Start performance" subtitle="Places gained or lost on the opening lap: grid slot against running order at the end of lap 1, loaded race by race when you ask for it.">
            <LaunchBoard key={season + ":" + races.length} season={season} year={year} races={races} />
          </Section>
        </>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function InsightsHero({ year, races, total, loading }: { year: string; races: Race[]; total: number; loading: boolean }) {
  const last = races.at(-1);
  const photo = circuitMedia(last?.Circuit.circuitId).hero;
  const stats = useMemo(() => {
    let dnf = 0, finishes = 0;
    const winners = new Set<string>();
    for (const r of races)
      for (const x of r.Results || []) {
        const c = statusCause(x.status, x.positionText);
        if (c === "finished") finishes++;
        else if (c !== "dnq" && c !== "dns") dnf++;
        if (x.position === "1") winners.add(x.Driver.driverId);
      }
    return { dnf, finishes, winners: winners.size };
  }, [races]);
  return (
    <section className="ins-hero">
      <div className="ins-hero-media">{photo && <Img src={photo} alt="" eager />}<span className="ins-hero-scrim" /></div>
      <div className="ins-hero-inner">
        <span className="eyebrow ins-hero-eyebrow rise"><Gauge size={14} />Lab · {year} season</span>
        <h1 className="display ins-hero-title rise" style={{ "--i": 1 } as CSSProperties}>Insights<span>Beneath the results</span></h1>
        <p className="ins-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>Teammate battles, upgrades, reliability, form, pit work, starts and racecraft — computed from every published classification of {year}.</p>
        <div className="ins-hero-stats rise" style={{ "--i": 3 } as CSSProperties}>
          {loading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={78} r={20} />) : (
            <>
              <div><b><Counter value={races.length} />{total ? <small>/{total}</small> : null}</b><span>Rounds analysed</span></div>
              <div><b><Counter value={stats.winners} /></b><span>Different winners</span></div>
              <div><b><Counter value={stats.finishes} /></b><span>Finishes</span></div>
              <div><b><Counter value={stats.dnf} /></b><span>Non-finishes</span></div>
            </>
          )}
        </div>
        <nav className="ins-hero-nav rise" style={{ "--i": 4 } as CSSProperties} aria-label="Jump to analysis">
          {[["teammates", "Teammates", Users], ["upgrades", "Upgrades", Zap], ["reliability", "Reliability", Wrench], ["form", "Form", TrendingUp], ["pit-stops", "Pit stops", Timer], ["positions-gained", "Positions gained", ArrowRight], ["launch", "Starts", Rocket]].map(([id, label, Icon]) => {
            const I = Icon as typeof Users;
            return <a key={id as string} href={"#" + id} onClick={(e) => { e.preventDefault(); document.getElementById(id as string)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="btn sm glass-btn"><I />{label as string}</a>;
          })}
        </nav>
      </div>
    </section>
  );
}

/* ───────────────────────── Teammates ───────────────────────── */
function Teammates({ season, year, races, order }: { season: string; year: string; races: Race[]; order: Map<string, number> }) {
  const q = useData(() => qualifyingResults(season), [season]);
  const teams = useMemo(
    () => (q.value ? teammateGaps(q.value.data, races).sort((a, b) => (order.get(b.id) || 0) - (order.get(a.id) || 0)) : []),
    [q.value, races, order],
  );
  if (q.loading) return <div className="grid" style={{ "--min": "320px" } as CSSProperties}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={300} r={28} />)}</div>;
  if (q.error) return <StateView error={q.error} onRetry={q.reload} />;
  const noQuali = !q.value?.data.length;
  if (!teams.length) return <StateView empty emptyTitle="No teammate pairs" emptyText="No team ran two cars in the same Grand Prix this season." />;
  return (
    <>
      {noQuali && <p className="notice ins-note"><Info />The data provider has no qualifying classification for {year}, so only race head-to-heads are shown.</p>}
      <div className="grid ins-mates" style={{ "--min": "330px", "--gap": "16px" } as CSSProperties}>
        {teams.map((t, i) => <TeamPairs key={t.id} team={t.team} pairs={t.pairs} year={year} index={i} />)}
      </div>
      <p className="ins-foot"><Info size={13} />Qualifying gap: the slower driver's time vs the faster one's in the best session both set a time (Q3, else Q2, else Q1), as a percentage. Sessions with a gap over 5% (crashes, failures, red flags) are left out of the average and shown as excluded. Race head-to-head compares finishing order among starters, including retirements.</p>
      <Source value={q.value} label="Qualifying" />
    </>
  );
}

function TeamPairs({ team, pairs, year, index }: { team: Team; pairs: TeammatePair[]; year: string; index: number }) {
  const [sel, setSel] = useState(0);
  const p = pairs[sel] || pairs[0];
  const tint = teamColor(team);
  return (
    <Glass className="card ins-pair reveal" style={{ "--tint": tint, "--i": Math.min(index, 8) } as CSSProperties}>
      <div className="ins-pair-head">
        <TeamLogo id={team.constructorId} name={team.name} year={year} size={34} />
        <Link to={"team/" + team.constructorId} className="ins-pair-team">{teamShortName(team.name, year)}</Link>
        {pairs.length > 1 && (
          <label className="field ins-pair-pick">
            <span className="sr-only">Teammate pairing</span>
            <select className="select" value={sel} onChange={(e) => setSel(+e.target.value)}>
              {pairs.map((x, i) => <option key={i} value={i}>{x.a.familyName} / {x.b.familyName} ({x.rounds || x.raced})</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="ins-pair-drivers">
        <Link to={"driver/" + p.a.driverId} className="ins-pair-d"><DriverAvatar id={p.a.driverId} name={fullName(p.a)} year={year} team={team.constructorId} size={46} /><b>{p.a.familyName}</b></Link>
        <div className="ins-pair-gap">
          {p.meanGap !== null ? (
            <>
              <b>{p.meanGap.toFixed(3)}%</b>
              <small>avg qualifying gap</small>
            </>
          ) : <small>No common qualifying times</small>}
        </div>
        <Link to={"driver/" + p.b.driverId} className="ins-pair-d right"><DriverAvatar id={p.b.driverId} name={fullName(p.b)} year={year} team={team.constructorId} size={46} /><b>{p.b.familyName}</b></Link>
      </div>
      <H2H label="Qualifying" a={p.quali.a} b={p.quali.b} />
      <H2H label="Race" a={p.race.a} b={p.race.b} />
      {p.sessions.length > 1 && <GapStrip pair={p} />}
      <p className="ins-pair-meta">
        {p.medianGap !== null && <>Median {p.medianGap.toFixed(3)}% · </>}
        {plural(p.sessions.length - p.excluded, "session")} compared{p.excluded ? ` · ${p.excluded} excluded` : ""}
      </p>
    </Glass>
  );
}

function H2H({ label, a, b }: { label: string; a: number; b: number }) {
  const n = a + b;
  return (
    <div className="ins-h2h" aria-label={`${label} head-to-head ${a} to ${b}`} role="img">
      <span className="ins-h2h-n">{a}</span>
      <span className="ins-h2h-bar">
        <motion.i className="a" initial={{ width: "50%" }} whileInView={{ width: n ? (a / n) * 100 + "%" : "50%" }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        <span className="ins-h2h-label">{label}</span>
      </span>
      <span className="ins-h2h-n">{b}</span>
    </div>
  );
}

/** Per-session gap (above the line: first driver faster). */
function GapStrip({ pair }: { pair: TeammatePair }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = pair.sessions;
  const lim = Math.max(0.5, ...s.map((x) => Math.min(5, Math.abs(x.gap))));
  const h = s[hover ?? -1];
  return (
    <div className="ins-strip">
      <div className="ins-strip-bars" onPointerLeave={() => setHover(null)}>
        {s.map((x, i) => {
          const v = Math.max(-1, Math.min(1, x.gap / lim));
          const out = Math.abs(x.gap) > 5;
          return (
            <button key={i} type="button" className={cx("ins-strip-bar", v >= 0 ? "pos" : "neg", out && "out", hover === i && "on")} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`Round ${x.round}, ${x.session}: ${x.gap >= 0 ? pair.a.familyName : pair.b.familyName} faster by ${Math.abs(x.gap).toFixed(3)}%`}>
              <i style={{ height: Math.abs(v) * 50 + "%" }} />
            </button>
          );
        })}
      </div>
      <p className="ins-strip-cap">
        {h ? <>R{h.round} {shortRace(h.raceName)} · {h.session}: <b>{h.gap >= 0 ? pair.a.familyName : pair.b.familyName}</b> by {Math.abs(h.gap).toFixed(3)}%{Math.abs(h.gap) > 5 ? " (excluded)" : ""}</> : <>Each bar is one qualifying: up = {pair.a.familyName} faster, down = {pair.b.familyName}.</>}
      </p>
    </div>
  );
}

/* ───────────────────────── Reliability ───────────────────────── */
type RelRow = RelData["teams"][number] | RelData["drivers"][number];
function Reliability({ races, year }: { races: Race[]; year: string }) {
  const [mode, setMode] = useState<"teams" | "drivers">("teams");
  const rel = useMemo(() => reliability(races), [races]);
  const used = CAUSES.filter((c) => rel.totals[c.key] > 0);
  const totalNon = used.reduce((s, c) => s + rel.totals[c.key], 0);
  if (!totalNon) return <StateView empty emptyTitle="Every starter finished" emptyText="No retirements, disqualifications or non-starts recorded this season." />;
  const peak = Math.max(...used.map((c) => rel.totals[c.key]));
  const rows: RelRow[] = (mode === "teams" ? (rel.teams as RelRow[]) : (rel.drivers as RelRow[])).filter((r) => r.total > 0);
  const cellMax = Math.max(1, ...rows.flatMap((r) => used.map((c) => r.counts[c.key])));
  const unspecified = rel.totals.unspecified / totalNon;
  const exportCSV = () => download(`f1-pulse-${year}-reliability-${mode}.csv`, toCSV([
    [mode === "teams" ? "Team" : "Driver", "Starts", "Non-finishes", ...used.map((c) => c.label)],
    ...rows.map((r) => ["driver" in r ? fullName(r.driver) : r.team.name, r.starts, r.total, ...used.map((c) => r.counts[c.key])]),
  ]), "text/csv;charset=utf-8");

  return (
    <div className="ins-rel">
      <Glass className="card ins-rel-sum reveal">
        <h3 className="ins-h3">Why races ended early</h3>
        <ul className="ins-causes">
          {[...used].sort((a, b) => rel.totals[b.key] - rel.totals[a.key]).map((c, i) => (
            <li key={c.key} title={rel.statuses[c.key].map(([s, n]) => `${s} (${n})`).join(", ")}>
              <span>{c.label}</span>
              <span className="ins-cause-bar"><motion.i initial={{ width: 0 }} whileInView={{ width: (rel.totals[c.key] / peak) * 100 + "%" }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.04 }} /></span>
              <b>{rel.totals[c.key]}</b>
            </li>
          ))}
        </ul>
        <p className="ins-foot flat">{plural(totalNon, "non-finish", "non-finishes")} from {plural(races.length, "Grand Prix", "Grands Prix")}. Hover a cause for the exact wording in the results.{unspecified > 0.4 ? " Recent results often record only “Retired”, so many causes aren't specified." : ""}</p>
      </Glass>
      <Glass className="card flush ins-rel-table reveal">
        <div className="ins-toolbar">
          <Segmented label="Group by" value={mode} onChange={setMode} options={[{ value: "teams", label: "Teams" }, { value: "drivers", label: "Drivers" }]} />
          <button className="btn sm glass-btn" onClick={exportCSV}><Download />CSV</button>
        </div>
        <div className="table-wrap" tabIndex={0}>
          <table className="tbl ins-matrix">
            <thead>
              <tr>
                <th scope="col">{mode === "teams" ? "Team" : "Driver"}</th>
                {used.map((c) => <th key={c.key} scope="col" className="c" title={c.label}><span className="ins-vert">{c.label}</span></th>)}
                <th scope="col" className="r">Total</th>
                <th scope="col" className="r">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ "--tint": teamColor(r.team) } as CSSProperties}>
                  <td>
                    {"driver" in r ? (
                      <Link to={"driver/" + r.id} className="sa-who"><DriverAvatar id={r.id} name={fullName(r.driver)} year={year} team={r.team.constructorId} size={26} /><span><b>{r.driver.familyName}</b></span></Link>
                    ) : (
                      <Link to={"team/" + r.id} className="sa-who"><TeamLogo id={r.id} name={r.team.name} year={year} size={26} /><span><b>{teamShortName(r.team.name, year)}</b></span></Link>
                    )}
                  </td>
                  {used.map((c) => {
                    const v = r.counts[c.key as CauseKey];
                    return <td key={c.key} className="c"><span className={cx("ins-mcell", !v && "zero")} style={{ "--v": Math.round((v / cellMax) * 85) + "%" } as CSSProperties}>{v || "·"}</span></td>;
                  })}
                  <td className="r"><b>{r.total}</b></td>
                  <td className="r faint">{r.starts ? Math.round((r.total / (r.starts + (r.counts.dns || 0))) * 100) + "%" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ins-foot"><Info size={13} />Rate = non-finishes ÷ entries. Classified drivers whose status records a failure (e.g. “Engine” on the final laps) count as non-finishes. Did-not-qualify entries are left out.</p>
      </Glass>
    </div>
  );
}

/* ───────────────────────── Form curves ───────────────────────── */
type FormSort = "points" | "form" | "rising";
function FormCurves({ races, sprints, year }: { races: Race[]; sprints: Race[]; year: string }) {
  const [sort, setSort] = useState<FormSort>("points");
  const m = useMemo(() => pointsMatrix(races, sprints), [races, sprints]);
  const cards = useMemo(() => m.drivers
    .filter((d) => d.cells.filter(Boolean).length >= 2)
    .map((d) => {
      const raw = d.cells.map((c) => (c ? c.points : null));
      const rolling = rollingAverage(raw, 5);
      return { ...d, raw, rolling, trend: formTrend(raw, 5) };
    }), [m]);
  const sorted = useMemo(() => {
    const c = [...cards];
    if (sort === "form") c.sort((a, b) => (b.trend.last ?? 0) - (a.trend.last ?? 0));
    if (sort === "rising") c.sort((a, b) => b.trend.delta - a.trend.delta);
    return c.slice(0, 24);
  }, [cards, sort]);
  if (m.rounds.length < 3) return <StateView empty emptyTitle="Too early for form" emptyText="Form curves need at least three rounds." />;
  const max = Math.max(5, ...cards.flatMap((c) => c.rolling.filter((v): v is number => v !== null)));
  return (
    <>
      <div className="ins-toolbar plain">
        <Segmented label="Sort drivers" value={sort} onChange={setSort} options={[{ value: "points", label: "Season points" }, { value: "form", label: "Current form" }, { value: "rising", label: "Most improved" }]} />
        <span className="faint small">Shared scale 0–{Math.ceil(max)} pts per round</span>
      </div>
      <div className="ins-multiples">
        {sorted.map((c, i) => <FormCard key={c.id} card={c} max={max} rounds={m.rounds} year={year} index={i} />)}
      </div>
      <p className="ins-foot"><Info size={13} />Each line is the average of a driver's last five rounds (or fewer, early on); gaps mark rounds they missed. Arrows compare the latest five-round average with the five before it (±1.5 pts = steady).</p>
    </>
  );
}

function FormCard({ card, max, rounds, year, index }: {
  card: { id: string; driver: Driver; team: Team; rolling: (number | null)[]; raw: (number | null)[]; total: number; trend: ReturnType<typeof formTrend> };
  max: number; rounds: { round: string; raceName: string }[]; year: string; index: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 240, H = 72;
  const n = rounds.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => H - 3 - (v / max) * (H - 8);
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  card.rolling.forEach((v, i) => { if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
  if (cur.length) segs.push(cur);
  const tint = teamColor(card.team);
  const last = card.trend.last;
  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hv = hover !== null ? card.rolling[hover] : null;
  return (
    <Glass className="card tight ins-form reveal" style={{ "--tint": tint, "--i": Math.min(index, 12) } as CSSProperties}>
      <div className="ins-form-head">
        <DriverAvatar id={card.id} name={fullName(card.driver)} year={year} team={card.team.constructorId} size={30} />
        <Link to={"driver/" + card.id} className="ins-form-name"><b>{card.driver.familyName}</b><small>{teamShortName(card.team.name, year)}</small></Link>
        <Trend dir={card.trend.dir} delta={card.trend.delta} />
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="ins-form-svg" preserveAspectRatio="none" role="img" tabIndex={0}
        aria-label={`${fullName(card.driver)}: rolling average ${last === null ? "—" : last.toFixed(1)} points per round`}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1)))); } }}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="ins-form-base" />
        {segs.map((sg, k) => (
          <g key={k}>
            <path d={`M${sg.map((p) => p.join(",")).join("L")}L${sg.at(-1)![0]},${H}L${sg[0][0]},${H}Z`} className="ins-form-area" />
            <path d={"M" + sg.map((p) => p.join(",")).join("L")} className="ins-form-line" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="ins-form-cursor" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="ins-form-foot">
        {hover !== null ? (
          <span>R{rounds[hover].round} {shortRace(rounds[hover].raceName)} · <b>{hv === null ? "absent" : hv.toFixed(1)}</b>{card.raw[hover] !== null ? <> ({pts(card.raw[hover]!)} scored)</> : null}</span>
        ) : (
          <span><b>{last === null ? "—" : last.toFixed(1)}</b> pts / round now · {pts(card.total)} total</span>
        )}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Pit stops ───────────────────────── */
const pitCache = new Map<string, Envelope<Race | undefined>>();
type PitState = { loaded: number; total: number; failed: string[]; running: boolean; rounds: PitRound[]; meta?: Envelope<unknown> };

function PitStops({ season, year, races }: { season: string; year: string; races: Race[] }) {
  const cachedRounds = () => races.filter((r) => pitCache.has(`${season}:${r.round}`));
  const build = (list: Race[]): PitRound[] => list.map((r) => {
    const env = pitCache.get(`${season}:${r.round}`);
    return { round: r.round, raceName: r.raceName, stops: env?.data?.PitStops || [], teams: new Map((r.Results || []).map((x) => [x.Driver.driverId, x.Constructor])) };
  });
  const [state, setState] = useState<PitState>(() => {
    const have = cachedRounds();
    const anyMeta = have.length ? pitCache.get(`${season}:${have[0].round}`) : undefined;
    return { loaded: have.length, total: races.length, failed: [], running: false, rounds: build(have), meta: anyMeta };
  });
  const cancelled = useRef(false);
  if (+year < 2011)
    return <StateView empty emptyTitle="No pit-stop timing before 2011" emptyText="The data provider publishes pit-stop durations from the 2011 season onward." />;

  const load = async (only?: string[]) => {
    cancelled.current = false;
    const todo = races.filter((r) => (only ? only.includes(r.round) : !pitCache.has(`${season}:${r.round}`)));
    setState((s) => ({ ...s, running: true, failed: only ? s.failed.filter((x) => !only.includes(x)) : [] }));
    for (const r of todo) {
      if (cancelled.current) break;
      try {
        const env = await pitStops(season, r.round);
        pitCache.set(`${season}:${r.round}`, { ...env, data: env.data[0] });
        setState((s) => ({ ...s, meta: s.meta || env }));
      } catch {
        setState((s) => ({ ...s, failed: [...s.failed, r.round] }));
      }
      const have = cachedRounds();
      setState((s) => ({ ...s, loaded: have.length, rounds: build(have) }));
    }
    setState((s) => ({ ...s, running: false }));
  };

  const league = pitLeague(state.rounds);
  const fastest = league.filter((t) => t.fastest).sort((a, b) => a.fastest!.seconds - b.fastest!.seconds)[0];
  const done = state.loaded >= races.length;
  const lo = league.length ? Math.min(...league.map((t) => t.fastest?.seconds ?? t.median)) : 0;
  const hi = league.length ? Math.max(...league.map((t) => t.median)) : 1;
  const scale = (v: number) => 8 + ((v - lo) / Math.max(0.1, hi - lo)) * 92;
  const driverName = new Map(races.flatMap((r) => (r.Results || []).map((x) => [x.Driver.driverId, x.Driver.familyName] as const)));

  return (
    <div className="ins-pit">
      {!done && (
        <Glass className="card ins-pit-load reveal">
          <div>
            <h3 className="ins-h3"><Timer size={16} />{state.loaded ? `${state.loaded} of ${races.length} rounds loaded` : `Pit stops for ${plural(races.length, "round")}`}</h3>
            <p className="muted small">One request per Grand Prix, spaced out to respect the data provider's limits{state.running ? " — this takes a few seconds" : ""}. Results are kept for this visit.</p>
          </div>
          {state.running ? (
            <div className="ins-pit-progress" role="progressbar" aria-valuemin={0} aria-valuemax={races.length} aria-valuenow={state.loaded} aria-label="Pit-stop rounds loaded">
              <span style={{ width: (state.loaded / Math.max(1, races.length)) * 100 + "%" }} />
            </div>
          ) : (
            <button className="btn primary" onClick={() => load()}><Play />{state.loaded ? "Load the rest" : "Load pit-stop data"}</button>
          )}
        </Glass>
      )}
      {state.failed.length > 0 && !state.running && (
        <p className="notice ins-note"><Info />{plural(state.failed.length, "round")} couldn't be loaded (R{state.failed.join(", R")}). <button className="btn sm glass-btn" onClick={() => load(state.failed)}><RotateCcw />Retry</button></p>
      )}
      {league.length > 0 && (
        <div className="ins-pit-grid">
          {fastest?.fastest && (
            <Glass className="card ins-pit-best reveal" style={{ "--tint": teamColor(fastest.team) } as CSSProperties}>
              <span className="eyebrow"><Timer size={13} />Quickest pit-lane time</span>
              <b className="ins-pit-best-time">{fastest.fastest.seconds.toFixed(3)}<small>s</small></b>
              <p><TeamLogo id={fastest.id} name={fastest.team.name} year={year} size={26} /><span><b>{teamShortName(fastest.team.name, year)}</b> · {driverName.get(fastest.fastest.driverId) || fastest.fastest.driverId}<small>R{fastest.fastest.round} {shortRace(fastest.fastest.raceName)}, lap {fastest.fastest.lap}</small></span></p>
            </Glass>
          )}
          <Glass className="card flush reveal">
            <ol className="ins-pit-list">
              {league.map((t, i) => (
                <li key={t.id} style={{ "--tint": teamColor(t.team) } as CSSProperties}>
                  <span className="ins-pit-rank">{i + 1}</span>
                  <Link to={"team/" + t.id} className="sa-who"><TeamLogo id={t.id} name={t.team.name} year={year} size={28} /><span><b>{teamShortName(t.team.name, year)}</b><small>{plural(t.stops, "stop")}{t.excluded ? ` · ${t.excluded} excluded` : ""}</small></span></Link>
                  <span className="ins-pit-track" role="img" aria-label={`Median ${t.median.toFixed(3)} s, fastest ${t.fastest?.seconds.toFixed(3)} s`}>
                    {t.fastest && <i className="fast" style={{ left: scale(t.fastest.seconds) + "%" }} title={`Fastest ${t.fastest.seconds.toFixed(3)} s`} />}
                    <i className="med" style={{ width: scale(t.median) + "%" }} />
                  </span>
                  <span className="ins-pit-vals"><b>{t.median.toFixed(2)}s</b><small>best {t.fastest?.seconds.toFixed(2)}s</small></span>
                </li>
              ))}
            </ol>
          </Glass>
        </div>
      )}
      <p className="ins-foot"><Info size={13} />These are <b>pit-lane times</b> — from pit entry to pit exit, including the drive through the lane — not the stationary time under the jacks, so they also depend on each circuit's pit-lane length. Ranked by median; stops over 60 s (red flags, repairs) are excluded.{!done && league.length ? ` Partial: ${state.loaded} of ${races.length} rounds.` : ""}</p>
      {state.meta && <Source value={state.meta} label="Pit stops" />}
    </div>
  );
}

/* ───────────────────────── Positions gained ───────────────────────── */
function Gained({ races, year }: { races: Race[]; year: string }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => positionsGained(races), [races]);
  if (!rows.length) return <StateView empty emptyTitle="No classified finishers" />;
  const shown = all ? rows : rows.slice(0, 15);
  const peak = Math.max(1, ...rows.map((r) => Math.abs(r.total)));
  const climb = [...rows].filter((r) => r.best).sort((a, b) => b.best!.gain - a.best!.gain)[0];
  return (
    <div className="ins-gain">
      {climb?.best && (
        <Glass className="card ins-gain-best reveal" style={{ "--tint": teamColor(climb.team) } as CSSProperties}>
          <span className="eyebrow"><TrendingUp size={13} />Biggest single climb</span>
          <b className="ins-gain-best-n">+{climb.best.gain}</b>
          <p><DriverAvatar id={climb.id} name={fullName(climb.driver)} year={year} team={climb.team.constructorId} size={34} /><span><b>{climb.driver.familyName}</b><small>{climb.best.from ? `P${climb.best.from}` : "Pit lane"} → P{climb.best.to} · R{climb.best.round} {shortRace(climb.best.raceName)}</small></span></p>
        </Glass>
      )}
      <Glass className="card flush reveal">
        <div className="table-wrap" tabIndex={0}>
          <table className="tbl ins-gain-tbl">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Driver</th>
                <th scope="col" className="ins-gain-col"><span className="sr-only">Positions gained or lost</span></th>
                <th scope="col" className="r">Net</th>
                <th scope="col" className="r">Per race</th>
                <th scope="col" className="r sa-hide-sm">Best</th>
                <th scope="col" className="r sa-hide-sm">Finishes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} style={{ "--tint": teamColor(r.team) } as CSSProperties}>
                  <td className="faint">{i + 1}</td>
                  <td><Link to={"driver/" + r.id} className="sa-who"><DriverAvatar id={r.id} name={fullName(r.driver)} year={year} team={r.team.constructorId} size={28} /><span><b>{r.driver.familyName}</b><small>{teamShortName(r.team.name, year)}</small></span></Link></td>
                  <td className="ins-gain-col">
                    <span className="ins-div" role="img" aria-label={`${r.total >= 0 ? "Gained" : "Lost"} ${Math.abs(r.total)} places`}>
                      <i className={r.total >= 0 ? "up" : "down"} style={{ width: (Math.abs(r.total) / peak) * 50 + "%" }} />
                    </span>
                  </td>
                  <td className="r"><b className={cx("ins-net", r.total > 0 ? "up" : r.total < 0 ? "down" : "")}>{r.total > 0 ? "+" : ""}{r.total}</b></td>
                  <td className="r">{r.avg > 0 ? "+" : ""}{r.avg.toFixed(1)}</td>
                  <td className="r sa-hide-sm">{r.best ? `${r.best.gain > 0 ? "+" : ""}${r.best.gain}` : "—"}</td>
                  <td className="r sa-hide-sm">{r.races}{r.pitLane ? <small className="faint"> ({r.pitLane} PL)</small> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ins-foot spread">
          <span><Info size={13} />Net = Σ(grid − finish) over classified finishes. Pit-lane starts (PL) count from the back of the field; before 2000 a missing grid slot can mean "unknown", so those results are left out. Disqualified results are excluded.</span>
          {rows.length > 15 && <button className="btn sm plain" onClick={() => setAll((a) => !a)}>{all ? "Top 15" : `All ${rows.length}`}</button>}
        </div>
      </Glass>
    </div>
  );
}
