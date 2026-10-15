import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownUp, Info, Plus, Sparkles, Star, X } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { ordinal, plural, pts } from "../lib/format";
import { eraById, firstRaces, isStart, modernPoints, rookieSeasons, useArchive, type Archive, type ArchiveBundle, type Rookie } from "../lib/archive";
import { Counter, Glass, Page, Section, Segmented, Source, Toggle, cx, useAmbient, useTitle } from "../ui/core";
import { Flag, TeamLogo } from "../ui/media";
import { LineChart } from "../ui/charts";
import { ArchiveError, ArchiveHero, ArchiveLoading, DriverPick, EraSwitch, Face } from "./_archive-ui";
import "./rookies.css";

type Sort = "season" | "points" | "norm" | "wins" | "podiums" | "best" | "h2h" | "starts";
type Row = Rookie & { norm: number; h2hPct: number | null };
const DEFAULT_TRACE = ["hamilton", "max_verstappen", "leclerc", "piastri", "antonelli", "villeneuve"];

export default function Rookies({ route }: { route: Route }) {
  useTitle("Rookie seasons");
  useAmbient("#30d158", "#0a84ff");
  const a = useArchive();
  if (a.loading || (!a.value && !a.error)) return <Page className="rk"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="rk"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  return <RookiesView bundle={a.value} route={route} />;
}

function RookiesView({ bundle, route }: { bundle: ArchiveBundle; route: Route }) {
  const { archive, envelope } = bundle;
  const [era, setEra] = useState(eraById(route.query.get("era")).id);
  const range = eraById(era);
  const [sort, setSort] = useState<Sort>("points");
  const [desc, setDesc] = useState(true);
  const [regulars, setRegulars] = useState(true);
  const [shown, setShown] = useState(40);

  const rows: Row[] = useMemo(() => {
    const bySeason = new Map<number, typeof archive.races>();
    for (const r of archive.races) (bySeason.get(r.season) || bySeason.set(r.season, []).get(r.season)!).push(r);
    return rookieSeasons(archive).map((r) => {
      let norm = 0;
      for (const race of bySeason.get(r.season) || []) {
        const me = race.results.find((x) => x.d === r.idx);
        if (me && isStart(me)) norm += modernPoints(me.pos);
      }
      return { ...r, norm, h2hPct: r.ahead + r.behind ? r.ahead / (r.ahead + r.behind) : null };
    });
  }, [archive]);
  const latestSeason = archive.races.at(-1)?.season || 0;
  const current = rows.filter((r) => r.season === latestSeason).sort((x, y) => y.points - x.points);
  const inEra = rows.filter((r) => r.season >= range.from && r.season <= range.to && (!regulars || r.starts >= 5));
  const value = (r: Row) => (sort === "best" ? -(r.best ?? 99) : sort === "h2h" ? r.h2hPct ?? -1 : r[sort]);
  const sorted = [...inEra].sort((x, y) => (desc ? -1 : 1) * (value(x) - value(y)) || y.points - x.points);
  const rookieWinners = rows.filter((r) => r.wins > 0);
  const bestNorm = [...rows].sort((x, y) => y.norm - x.norm)[0];
  const head = (key: Sort, label: string, cls = "r") => (
    <th className={cls} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(true)))}>{label}<ArrowDownUp size={12} /></button>
    </th>
  );

  return (
    <Page className="rk">
      <ArchiveHero
        eyebrow="Archive · Rookies"
        icon={<Sparkles size={14} />}
        title="First seasons"
        accent="Every debut year, compared"
        lede="Each driver's first World Championship season: results, best finish and how they stacked up against the team-mate in the other car."
        photo={circuitMedia("silverstone").hero}
        tint="#30d158"
        stats={[
          { label: "Rookie seasons", value: <Counter value={rows.length} /> },
          { label: "Won as a rookie", value: <Counter value={rookieWinners.length} /> },
          { label: `${latestSeason} rookies`, value: <Counter value={current.length} /> },
        ]}
        figure={bestNorm && <BestRookie archive={archive} r={bestNorm} />}
      />

      {current.length > 0 && (
        <Section id="current" title={`${latestSeason} rookies`} subtitle={archive.live.includes(latestSeason) ? "This season's debutants so far." : "The most recent rookie class."}>
          <div className="rk-current">
            {current.map((r, i) => <RookieCard key={r.idx} archive={archive} r={r} index={i} current />)}
          </div>
          <Source value={envelope} label="Race results" />
        </Section>
      )}

      <div className="arx-controls reveal">
        <EraSwitch value={era} onChange={(e) => { setEra(e); setShown(40); setQuery({ era: e === "all" ? null : e }); }} />
        <label className="row rk-toggle"><Toggle checked={regulars} onChange={setRegulars} label="Only drivers with at least five starts" /><span className="small muted">5+ starts</span></label>
      </div>

      <Section id="every-rookie" title="Every rookie season" subtitle={`${plural(inEra.length, "driver")} · sort any column. “2010+ pts” rescoring is a what-if normalisation.`}>
        <Glass className="card flush reveal rk-table">
          <div className="table-wrap">
            <table className="tbl">
              <caption className="sr-only">Rookie seasons with results and team-mate comparison</caption>
              <thead>
                <tr>
                  <th>Driver</th>
                  {head("season", "Season")}
                  {head("starts", "Starts")}
                  {head("points", "Points")}
                  {head("norm", "2010+ pts")}
                  {head("wins", "Wins")}
                  {head("podiums", "Podiums")}
                  {head("best", "Best")}
                  {head("h2h", "vs team-mate")}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, shown).map((r) => {
                  const d = archive.drivers[r.idx];
                  const t = archive.teams[r.team];
                  const mate = r.mates[0] ? archive.drivers[r.mates[0].idx] : null;
                  return (
                    <tr key={r.idx} className={cx(r.season === latestSeason && "rk-now")}>
                      <td>
                        <Link to={"driver/" + d.id} className="rk-driver" style={{ "--tint": teamColor(t?.id) } as CSSProperties}>
                          <Face archive={archive} idx={r.idx} size={32} year={r.season} team={r.team} />
                          <span><strong>{d.name}{r.season === latestSeason && <span className="chip green rk-new">Current</span>}</strong><small><Flag nationality={d.nat} />{t?.name}{r.teams.length > 1 ? ` +${r.teams.length - 1}` : ""}</small></span>
                        </Link>
                      </td>
                      <td className="r">{r.season}</td>
                      <td className="r">{r.starts}</td>
                      <td className="r"><b>{pts(r.points)}</b></td>
                      <td className="r">{r.norm}</td>
                      <td className="r">{r.wins || "—"}</td>
                      <td className="r">{r.podiums || "—"}</td>
                      <td className="r">{r.best ? <span className={cx("pos", r.best <= 3 && "p" + r.best)}>{r.best}</span> : "—"}</td>
                      <td className="r">
                        {r.h2hPct === null ? <span className="faint">—</span> : (
                          <span className="rk-h2h" title={mate ? `Most races alongside ${mate.name}` : undefined}>
                            <b>{r.ahead}–{r.behind}</b>
                            <small>{mate ? `vs ${mate.family}${r.mates.length > 1 ? ` +${r.mates.length - 1}` : ""}` : ""}</small>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > shown && (
            <div className="rk-more"><button type="button" className="btn sm" onClick={() => setShown((s) => s + 60)}>Show {Math.min(60, sorted.length - shown)} more</button><span className="faint small">{shown} of {sorted.length}</span></div>
          )}
        </Glass>
        <p className="arx-note"><Info />A rookie season is a driver's first season with a Grand Prix start. Points as awarded at the time (race + sprint). “vs team-mate” counts races where both started for the same constructor: finishing ahead (or classified when the other wasn't) – finishing behind.</p>
        <Source value={envelope} label="Race results" />
      </Section>

      <FirstRaces archive={archive} defaults={[...current.slice(0, 2).map((r) => archive.drivers[r.idx].id), ...DEFAULT_TRACE]} />
      <Source value={envelope} label="Race results" />
    </Page>
  );
}

function BestRookie({ archive, r }: { archive: Archive; r: Row }) {
  const d = archive.drivers[r.idx];
  return (
    <Link to={"driver/" + d.id} className="rk-best reveal" style={{ "--tint": teamColor(archive.teams[r.team]?.id) } as CSSProperties}>
      <span className="rk-best-label"><Star size={13} />Strongest rookie season · 2010+ scale</span>
      <Face archive={archive} idx={r.idx} size={128} year={r.season} team={r.team} className="rk-best-face" />
      <strong>{d.name}</strong>
      <span className="rk-best-sub">{r.season} · {archive.teams[r.team]?.name}</span>
      <span className="rk-best-stats"><span><b>{r.norm}</b><small>pts (2010+)</small></span><span><b>{r.wins}</b><small>wins</small></span><span><b>{r.podiums}</b><small>podiums</small></span></span>
    </Link>
  );
}

function RookieCard({ archive, r, index, current }: { archive: Archive; r: Row; index: number; current?: boolean }) {
  const d = archive.drivers[r.idx];
  const t = archive.teams[r.team];
  const mate = r.mates[0];
  const tint = teamColor(t?.id);
  return (
    <Link to={"driver/" + d.id} className="rk-card glass interactive reveal" style={{ "--i": index, "--tint": tint } as CSSProperties}>
      <span className="rk-card-glow" aria-hidden />
      <div className="rk-card-head">
        <Face archive={archive} idx={r.idx} size={64} year={r.season} team={r.team} />
        <span>
          <strong>{d.name}</strong>
          <small><TeamLogo id={t?.id} name={t?.name || ""} year={String(r.season)} size={18} />{t?.name}</small>
        </span>
        {current && <span className="chip green">Rookie</span>}
      </div>
      <div className="rk-card-stats">
        <span><b>{pts(r.points)}</b><small>points</small></span>
        <span><b>{r.podiums}</b><small>podiums</small></span>
        <span><b>{r.best ? ordinal(r.best) : "—"}</b><small>best</small></span>
        <span><b>{r.starts}</b><small>starts</small></span>
      </div>
      {mate && (
        <div className="rk-card-mate">
          <span className="faint xsmall">vs {archive.drivers[mate.idx].name}</span>
          <span className="rk-mate-bar" role="img" aria-label={`Ahead of team-mate ${mate.ahead} times, behind ${mate.behind}`}>
            <span style={{ flexGrow: mate.ahead || 0.0001 }} className="me" />
            <span style={{ flexGrow: mate.behind || 0.0001 }} className="them" />
          </span>
          <span className="xsmall"><b>{mate.ahead}</b>–{mate.behind}</span>
        </div>
      )}
    </Link>
  );
}

/* ───────────────────────── First N races ───────────────────────── */
function FirstRaces({ archive, defaults }: { archive: Archive; defaults: string[] }) {
  const [n, setN] = useState<"10" | "20" | "40">("20");
  const [normalised, setNormalised] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>(() => [...new Set(defaults.map((id) => archive.driverIndex.get(id)).filter((x): x is number => x !== undefined))].slice(0, 5));
  const [adding, setAdding] = useState(false);
  const traces = useMemo(() => picked.map((idx) => ({ idx, list: firstRaces(archive, idx, +n, normalised) })), [archive, picked, n, normalised]);
  const seen = new Set<string>();
  const series = traces.map(({ idx, list }) => {
    const first = list[0]?.race.results.find((r) => r.d === idx);
    const color = teamColor(first ? archive.teams[first.c]?.id : undefined);
    const dashed = seen.has(color);
    seen.add(color);
    return { id: String(idx), name: `${archive.drivers[idx].family} (${list[0]?.race.season ?? "—"})`, color, dashed, values: Array.from({ length: +n }, (_, i) => list[i]?.cumulative ?? null) };
  });
  return (
    <Section id="first-races" title="The first races" subtitle={`Cumulative points over each driver's first ${n} starts.`}>
      <Glass className="card reveal">
        <div className="rk-trace-controls">
          <Segmented label="Number of starts" value={n} onChange={setN} options={[{ value: "10", label: "10 starts" }, { value: "20", label: "20" }, { value: "40", label: "40" }]} />
          <label className="row"><Toggle checked={normalised} onChange={setNormalised} label="Normalise to the 2010+ points system" /><span className="small">2010+ points <span className="arx-badge">what-if</span></span></label>
        </div>
        <div className="rk-trace-chips">
          <AnimatePresence initial={false}>
            {picked.map((idx, i) => (
              <motion.button key={idx} layout type="button" className="rk-chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                style={{ "--tint": series[i]?.color } as CSSProperties} onPointerEnter={() => setFocus(String(idx))} onPointerLeave={() => setFocus(null)}
                onClick={() => setPicked(picked.filter((x) => x !== idx))} aria-label={`Remove ${archive.drivers[idx].name}`}>
                <Face archive={archive} idx={idx} size={26} />
                <span><strong>{archive.drivers[idx].family}</strong><small>{series[i]?.values.filter((v) => v !== null).at(-1) ?? 0} pts</small></span>
                {series[i]?.dashed && <i className="rk-dash" title="Dashed line: same team colour as another driver" />}
                <X size={13} />
              </motion.button>
            ))}
          </AnimatePresence>
          {picked.length < 6 && !adding && <button type="button" className="btn sm" onClick={() => setAdding(true)}><Plus />Add driver</button>}
        </div>
        {adding && (
          <div className="rk-add">
            <DriverPick archive={archive} value={null} label="Add a driver to the chart" onChange={(idx) => { if (idx !== null && !picked.includes(idx)) setPicked([...picked, idx]); setAdding(false); }} />
          </div>
        )}
        {series.length ? (
          <LineChart
            ariaLabel={`Cumulative ${normalised ? "normalised " : ""}points over the first ${n} starts`}
            series={series}
            labels={Array.from({ length: +n }, (_, i) => String(i + 1))}
            focus={focus}
            onFocus={setFocus}
            height={340}
            yFormat={(v) => pts(v)}
            tooltipTitle={(i) => `Start ${i + 1}`}
          />
        ) : <p className="muted small">Add a driver to start comparing.</p>}
        <p className="arx-note"><Info />{normalised ? "What-if normalisation: every finish rescored 25-18-15-12-10-8-6-4-2-1 (top ten), no fastest-lap or sprint points — so eras compare on one scale." : "Points as awarded at the time, including sprint points on that weekend. Scoring systems differ across eras."} X axis = the driver's nth Grand Prix start.</p>
      </Glass>
    </Section>
  );
}
