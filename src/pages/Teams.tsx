import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, History, LayoutGrid, Table2, Trophy } from "lucide-react";
import { allResults, sprintResults, standings, teamStandings, teams, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { fullName, isLightColor, isMediaSeason, teamColor, teamMedia, teamOf, teamShortName } from "../lib/media";
import { useSeasonProgress } from "../lib/season";
import { plural, pts } from "../lib/format";
import { Counter, Glass, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { CarImage, TeamLogo } from "../ui/media";
import { TeamCard } from "../ui/cards";
import type { Driver, Envelope, Race, Standing, Team } from "../types";
import { EvolutionTable } from "./_evolution";
import "./teams.css";

type Row = { team: Team; position?: string; points?: string; wins?: string; drivers: Driver[] };
type View = "cards" | "table" | "evolution";
const VIEWS: View[] = ["cards", "table", "evolution"];

/**
 * Drivers who raced for a constructor, derived from the drivers' standings.
 * Jolpica's `Constructors` list is not chronological, so the current team comes from `teamOf`
 * (latest-race constructor from the season's results). Current drivers come first, then anyone
 * who drove for the team earlier in the season (stand-ins, mid-season swaps).
 */
function roster(constructorId: string, list: Standing[], year: string, latest?: Map<string, string>): Driver[] {
  const current = list.filter((s) => teamOf(s, year, latest)?.constructorId === constructorId);
  const former = list.filter((s) => teamOf(s, year, latest)?.constructorId !== constructorId && s.Constructors.some((c) => c.constructorId === constructorId));
  return [...current, ...former].map((s) => s.Driver);
}

export default function Teams({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle("Teams");
  const cs = useData(() => teamStandings(season), [season]);
  const ds = useData(() => standings(season), [season]);
  const tl = useData(() => teams(season), [season]);
  const progress = useSeasonProgress(season, year);
  const latest = useMemo(() => progress.value ? new Map(progress.value.data.drivers.map((d) => [d.driver.driverId, d.team.constructorId])) : undefined, [progress.value]);
  const [view, setView] = useState<View>(() => VIEWS.find((v) => v === route.query.get("view")) || "cards");
  const changeView = (v: View) => { setView(v); setQuery({ view: v === "cards" ? null : v }); };

  const rows = useMemo<Row[]>(() => {
    const st = cs.value?.data || [];
    const drv = ds.value?.data || [];
    const base: Omit<Row, "drivers">[] = st.length
      ? st.map((s) => ({ team: s.Constructor, position: s.position, points: s.points, wins: s.wins }))
      : [];
    // Constructors that entered but have no standings entry (pre-1958, or excluded teams) follow the classified ones.
    for (const t of tl.value?.data || []) if (!base.some((b) => b.team.constructorId === t.constructorId)) base.push({ team: t });
    return base.map((b) => ({ ...b, drivers: roster(b.team.constructorId, drv, year, latest) }));
  }, [cs.value, ds.value, tl.value, latest, year]);

  const hasStandings = !!cs.value?.data.length;
  useAmbient(teamColor(rows[0]?.team), teamColor(rows[1]?.team));
  const loading = cs.loading || (tl.loading && !hasStandings);
  const error = !rows.length ? cs.error || tl.error : undefined;

  return (
    <Page className="tms">
      {loading ? (
        <Skeleton h="min(78vh, 700px)" r={36} />
      ) : error ? (
        <StateView error={error} onRetry={() => { cs.reload(); tl.reload(); }} />
      ) : !rows.length ? (
        <StateView empty emptyTitle={`No constructors found for ${year}`} emptyText="The data source has no constructor entries for this season." />
      ) : (
        <Hero rows={rows} year={year} hasStandings={hasStandings} />
      )}

      {!!rows.length && (
        <Section
          title={hasStandings ? "Championship order" : "The field"}
          subtitle={hasStandings ? `${year} constructors' standings${ds.value?.data.length ? " · drivers listed newest first" : ""}` : +year < 1958 ? "The constructors' championship began in 1958 — teams are listed as published." : "Constructors as published for this season."}
          action={<Segmented<View> label="Layout" value={view} onChange={changeView} options={[
            { value: "cards", label: <span className="tms-seg"><LayoutGrid size={15} />Cards</span> },
            { value: "table", label: <span className="tms-seg"><Table2 size={15} />Compare</span> },
            { value: "evolution", label: <span className="tms-seg"><History size={15} />Evolution</span> },
          ]} />}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              {view === "cards" ? (
                <div className="grid tms-grid" style={{ "--min": "300px" } as CSSProperties}>
                  {rows.map((r, i) => (
                    <TeamCard key={r.team.constructorId} team={r.team} year={year} drivers={r.drivers.slice(0, 3)} position={r.position} points={r.points !== undefined ? pts(r.points) : undefined} index={i} />
                  ))}
                </div>
              ) : view === "table" ? (
                <CompareTable rows={rows} season={season} year={year} />
              ) : (
                <EvolutionTable teams={rows.map((r) => ({ constructorId: r.team.constructorId, name: teamShortName(r.team.name, year) }))} year={year} />
              )}
            </motion.div>
          </AnimatePresence>
          <Source value={cs.value?.data.length ? cs.value : tl.value} />
        </Section>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero({ rows, year, hasStandings }: { rows: Row[]; year: string; hasStandings: boolean }) {
  const leader = hasStandings ? rows[0] : undefined;
  const second = hasStandings ? rows[1] : undefined;
  const gap = leader && second ? +(leader.points || 0) - +(second.points || 0) : null;
  const withCars = isMediaSeason(year) && rows.some((r) => teamMedia(r.team.constructorId, year));
  const driverCount = new Set(rows.flatMap((r) => r.drivers.map((d) => d.driverId))).size;
  return (
    <section className={cx("tms-hero", withCars ? "cars" : "spectrum")} style={{ "--tint": teamColor(leader?.team || rows[0].team) } as CSSProperties}>
      <div className="tms-hero-bg" aria-hidden><span className="tms-hero-glow" /><span className="tms-hero-lines" /></div>
      <div className="tms-hero-inner">
        <div className="tms-hero-copy">
          <span className="eyebrow tms-eyebrow rise"><span className="dot" />{year} season · {plural(rows.length, "constructor")}</span>
          <h1 className="display tms-title rise" style={{ "--i": 1 } as CSSProperties}>The<span>constructors</span></h1>
          <p className="tms-lede rise" style={{ "--i": 2 } as CSSProperties}>
            {plural(rows.length, "team")}{driverCount ? `, ${plural(driverCount, "driver")}` : ""}{hasStandings ? " and one championship." : "."}
            {" "}Tap a {withCars ? "car" : "colour"} to open its season.
          </p>
          {leader && (
            <div className="tms-leader rise" style={{ "--i": 3, "--tint": teamColor(leader.team) } as CSSProperties}>
              <TeamLogo id={leader.team.constructorId} name={leader.team.name} year={year} size={46} />
              <span className="tms-leader-text">
                <small><Trophy size={12} />{+year < new Date().getFullYear() ? `${year} constructors' champion` : "Leading the constructors'"}</small>
                <strong>{teamShortName(leader.team.name, year)}</strong>
              </span>
              <span className="tms-leader-num"><b><Counter value={+(leader.points || 0)} decimals={Number.isInteger(+(leader.points || 0)) ? 0 : 1} /></b><small>pts</small></span>
              {gap !== null && second && (
                <span className="tms-leader-num"><b>+<Counter value={gap} decimals={Number.isInteger(gap) ? 0 : 1} /></b><small>over {teamShortName(second.team.name, year)}</small></span>
              )}
            </div>
          )}
          <div className="tms-actions rise" style={{ "--i": 4 } as CSSProperties}>
            {leader && <Link className="btn lg primary" to={"team/" + leader.team.constructorId}>{teamShortName(leader.team.name, year)}<ArrowRight /></Link>}
            <Link className="btn lg glass-btn" to="standings">Standings</Link>
          </div>
        </div>
        {withCars ? <Parade rows={rows} year={year} /> : <Spectrum rows={rows} year={year} hasStandings={hasStandings} />}
      </div>
    </section>
  );
}

/** 2026: the cars drive into an echelon formation, championship order top-left to bottom-right. */
function Parade({ rows, year }: { rows: Row[]; year: string }) {
  const list = rows.filter((r) => teamMedia(r.team.constructorId, year));
  return (
    <ol className="tms-parade" aria-label="Cars in championship order" style={{ "--n1": Math.max(1, list.length - 1) } as CSSProperties}>
      {list.map((r, i) => {
        const name = teamShortName(r.team.name, year);
        return (
          <li key={r.team.constructorId} style={{ "--i": i, "--tint": teamColor(r.team) } as CSSProperties}>
            <Link to={"team/" + r.team.constructorId} className="tms-car" aria-label={`${r.position ? "P" + r.position + " " : ""}${name}${r.points !== undefined ? ", " + pts(r.points) + " points" : ""}`}>
              <span className="tms-streak" aria-hidden />
              <CarImage id={r.team.constructorId} name={name} year={year} eager className="tms-car-img" />
              <span className="tms-car-pos" aria-hidden>{r.position || "–"}</span>
              <span className="tms-car-tag" aria-hidden>
                <TeamLogo id={r.team.constructorId} name={r.team.name} year={year} size={20} />
                <b>{name}</b>{r.points !== undefined && <small>{pts(r.points)} pts</small>}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** Historical seasons: no car imagery — a skyline of livery colours, height by points. */
function Spectrum({ rows, year, hasStandings }: { rows: Row[]; year: string; hasStandings: boolean }) {
  const max = Math.max(1, ...rows.map((r) => +(r.points || 0)));
  const list = rows.slice(0, 24);
  return (
    <div className={cx("tms-spectrum", list.length > 14 && "dense")} role="list" aria-label={hasStandings ? "Constructors by points" : "Constructors"}>
      {list.map((r, i) => {
        const tint = teamColor(r.team);
        const h = hasStandings ? 18 + (82 * +(r.points || 0)) / max : 64;
        const name = teamShortName(r.team.name, year);
        return (
          <Link role="listitem" key={r.team.constructorId} to={"team/" + r.team.constructorId} className={cx("tms-pillar", isLightColor(tint) && "light")} style={{ "--tint": tint, "--h": h + "%", "--i": i } as CSSProperties}
            aria-label={`${r.position ? "P" + r.position + " " : ""}${name}${r.points !== undefined ? ", " + pts(r.points) + " points" : ""}`}>
            <span className="tms-pillar-bar">
              <span className="tms-pillar-name" aria-hidden>{name}</span>
            </span>
            <span className="tms-pillar-pos" aria-hidden>{r.position || "·"}</span>
          </Link>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Compare table ───────────────────────── */
type SortKey = "position" | "points" | "wins" | "podiums" | "best";
type Split = { driver: Driver; points: number };
type Agg = { podiums: number; best: number | null; split: Split[]; races: number };

function CompareTable({ rows, season, year }: { rows: Row[]; season: string; year: string }) {
  const data = useData<{ races: Race[]; sprints: Race[] }>(async () => {
    const [r, s] = await Promise.all([
      allResults(season),
      +year >= 2021 ? sprintResults(season).catch(() => ({ data: [] as Race[] })) : Promise.resolve({ data: [] as Race[] }),
    ]);
    return { data: { races: r.data, sprints: s.data }, meta: r.meta } as Envelope<{ races: Race[]; sprints: Race[] }>;
  }, [season]);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "position", desc: false });

  const agg = useMemo(() => {
    const m = new Map<string, Agg & { byDriver: Map<string, Split> }>();
    const get = (id: string) => {
      if (!m.has(id)) m.set(id, { podiums: 0, best: null, split: [], races: 0, byDriver: new Map() });
      return m.get(id)!;
    };
    const add = (id: string, d: Driver, p: number) => {
      const a = get(id);
      const s = a.byDriver.get(d.driverId) || { driver: d, points: 0 };
      s.points += p;
      a.byDriver.set(d.driverId, s);
    };
    for (const race of data.value?.data.races || []) {
      const entered = new Set<string>();
      for (const r of race.Results || []) {
        const a = get(r.Constructor.constructorId);
        entered.add(r.Constructor.constructorId);
        const classified = /^\d+$/.test(r.positionText);
        const pos = +r.position;
        if (classified && pos <= 3) a.podiums++;
        if (classified && (a.best === null || pos < a.best)) a.best = pos;
        add(r.Constructor.constructorId, r.Driver, +(r.points || 0));
      }
      entered.forEach((id) => get(id).races++);
    }
    for (const race of data.value?.data.sprints || []) for (const r of race.SprintResults || []) add(r.Constructor.constructorId, r.Driver, +(r.points || 0));
    for (const a of m.values()) a.split = [...a.byDriver.values()].sort((x, y) => y.points - x.points);
    return m;
  }, [data.value]);

  const sorted = useMemo(() => {
    const val = (r: Row): number => {
      const a = agg.get(r.team.constructorId);
      switch (sort.key) {
        case "position": return r.position ? +r.position : 999;
        case "points": return +(r.points ?? NaN) || a?.split.reduce((s, x) => s + x.points, 0) || 0;
        case "wins": return +(r.wins || 0);
        case "podiums": return a?.podiums || 0;
        case "best": return a?.best ?? 999;
      }
    };
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => dir * (val(a) - val(b)) || (+(a.position || 999) - +(b.position || 999)));
  }, [rows, agg, sort]);

  const head = (key: SortKey, label: string, cls?: string, lowFirst = false) => {
    const active = sort.key === key;
    return (
      <th className={cls} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button type="button" onClick={() => setSort(active ? { key, desc: !sort.desc } : { key, desc: !lowFirst })}>
          {label}{active && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
      </th>
    );
  };

  if (data.error) return <StateView error={data.error} onRetry={data.reload} />;
  return (
    <Glass className="card flush tms-compare reveal">
      <div className="table-wrap" tabIndex={0}>
        <table className="tbl tms-tbl">
          <thead>
            <tr>
              {head("position", "Pos", "c", true)}
              <th>Team</th>
              {head("points", "Points", "r")}
              {head("wins", "Wins", "r")}
              {head("podiums", "Podiums", "r")}
              {head("best", "Best", "r", true)}
              <th className="tms-split-h">Points split · race + sprint</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const a = agg.get(r.team.constructorId);
              const tint = teamColor(r.team);
              const total = a?.split.reduce((s, x) => s + x.points, 0) || 0;
              const pos = r.position ? +r.position : 0;
              return (
                <motion.tr layout="position" transition={{ type: "spring", stiffness: 420, damping: 38 }} key={r.team.constructorId} className={cx(isLightColor(tint) && "light")} style={{ "--tint": tint } as CSSProperties}>
                  <td className="c"><span className={cx("pos", pos > 0 && pos <= 3 && "p" + pos)}>{r.position || "–"}</span></td>
                  <td>
                    <Link to={"team/" + r.team.constructorId} className="tms-tbl-team">
                      <span className="team-bar" />
                      <TeamLogo id={r.team.constructorId} name={r.team.name} year={year} size={30} />
                      <strong>{teamShortName(r.team.name, year)}</strong>
                    </Link>
                  </td>
                  <td className="r tms-tbl-pts">{r.points !== undefined ? pts(r.points) : data.loading ? "…" : total ? pts(total) : "–"}</td>
                  <td className="r">{r.wins ?? "–"}</td>
                  <td className="r">{data.loading ? <Skeleton h={14} w={22} r={6} style={{ display: "inline-block" }} /> : a?.podiums ?? 0}</td>
                  <td className="r">{data.loading ? <Skeleton h={14} w={26} r={6} style={{ display: "inline-block" }} /> : a?.best ? "P" + a.best : "–"}</td>
                  <td className="tms-split-cell">
                    {data.loading ? <Skeleton h={10} r={99} /> : a && total > 0 ? (
                      <div className="tms-split">
                        <div className="tms-split-bar" role="img" aria-label={a.split.map((s) => `${fullName(s.driver)} ${pts(s.points)} points`).join(", ")}>
                          {a.split.map((s, k) => s.points > 0 && (
                            <span key={s.driver.driverId} className={"tms-seg-" + Math.min(k, 3)} style={{ flexGrow: s.points } as CSSProperties} title={`${fullName(s.driver)} · ${pts(s.points)} pts`} />
                          ))}
                        </div>
                        <div className="tms-split-names">
                          {a.split.filter((s) => s.points > 0).slice(0, 3).map((s, k) => (
                            <span key={s.driver.driverId}><i className={"tms-seg-" + Math.min(k, 3)} />{s.driver.code || s.driver.familyName.slice(0, 3).toUpperCase()} {pts(s.points)}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="faint small">No points scored</span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tms-compare-foot">
        <p className="source">Points, wins and position: official constructors' standings. Podiums, best finish and the split are counted from published race{+year >= 2021 ? " and sprint" : ""} classifications, so the split can differ from the official total where penalties or shared drives applied.</p>
        <Source value={data.value} label="Results" />
      </div>
    </Glass>
  );
}
