import { ProgressNote } from "../ui/progress-note";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Download, History, Info,
  Pause, Play, Search, SkipBack, SkipForward, Trophy,
} from "lucide-react";
import { allResults, roundStandings, standings, teamStandings, useData, type StandingsList } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, navigate, setQuery, useHref, type Route } from "../lib/router";
import { shortRace, useCalendar, useSeasonProgress, type SeasonProgress } from "../lib/season";
import { circuitMedia, driverMedia, fullName, initials, teamColor, teamMedia, teamOf, teamShortName } from "../lib/media";
import { download, formatDay, plural, pts, toCSV } from "../lib/format";
import { recordedRank } from "../domain.mjs";
import { Counter, Glass, Img, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { CarImage, DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo } from "../ui/media";
import { Bar, LineChart } from "../ui/charts";
import { RankDelta, Tween, emptyEnvelope, reducedMotionNow } from "./_champ";
import type { Driver, Envelope, Standing, Team, TeamStanding } from "../types";
import "./standings.css";

type View = "drivers" | "constructors" | "story";
type Kind = "drivers" | "constructors";
const VIEWS: readonly View[] = ["drivers", "constructors", "story"];
const isView = (v: string | null): v is View => !!v && (VIEWS as readonly string[]).includes(v);
const CONSTRUCTORS_FROM = 1958;

export default function Standings({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  const q = route.query.get("view");
  const [view, setView] = useState<View>(isView(q) ? q : "drivers");
  const changeView = (v: View) => { setView(v); setQuery({ view: v === "drivers" ? null : v }); };
  const hasTeams = +year >= CONSTRUCTORS_FROM;
  useTitle(`${year} Standings`);

  const ds = useData(() => standings(season), [season]);
  const cs = useData(() => (hasTeams ? teamStandings(season) : Promise.resolve(emptyEnvelope<TeamStanding[]>([]))), [season]);
  const results = useData(() => allResults(season), [season]);
  const progress = useSeasonProgress(season, year);
  const cal = useCalendar(season);

  /** Each driver's constructor at their most recent classified round (Constructors[] is not chronological). */
  const latest = useMemo(() => new Map((progress.value?.data.drivers || []).map((d) => [d.driver.driverId, d.team.constructorId])), [progress.value]);
  /** Constructor per driver for every round, from that race's classification. */
  const teamByRound = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const race of results.value?.data || []) m.set(race.round, new Map((race.Results || []).map((r) => [r.Driver.driverId, r.Constructor.constructorId])));
    return m;
  }, [results.value]);
  const first = ds.value?.data[0], second = ds.value?.data[1];
  const leaderTeam = first && teamOf(first, year, latest);
  const teamLeader = cs.value?.data[0]?.Constructor;
  useAmbient(teamColor(view === "constructors" && teamLeader ? teamLeader : leaderTeam), teamColor(second && teamOf(second, year, latest)));

  /** Grand Prix podium finishes per driver and per constructor, from published classifications. */
  const podiums = useMemo(() => {
    const drivers = new Map<string, number>(), teams = new Map<string, number>();
    for (const race of results.value?.data || [])
      for (const r of race.Results || []) {
        if (!/^\d+$/.test(r.positionText) || +r.position > 3) continue;
        drivers.set(r.Driver.driverId, (drivers.get(r.Driver.driverId) || 0) + 1);
        teams.set(r.Constructor.constructorId, (teams.get(r.Constructor.constructorId) || 0) + 1);
      }
    return { drivers, teams };
  }, [results.value]);

  const p = progress.value?.data;
  const total = cal.value?.data.length || 0;
  const done = p?.rounds.length || 0;

  return (
    <Page className="st">
      <StandingsHero view={view} ds={ds} cs={cs} p={p} total={total} year={year} latest={latest} />

      <div className="st-switch reveal">
        <Segmented
          size="lg"
          label="Standings view"
          value={view}
          onChange={changeView}
          options={[
            { value: "drivers", label: "Drivers" },
            { value: "constructors", label: "Constructors" },
            { value: "story", label: "Season story" },
          ]}
        />
        <p className="faint small">
          {done ? <>After {plural(done, "round")}{total ? ` of ${total}` : ""} · {p?.rounds.at(-1) ? shortRace(p.rounds.at(-1)!.raceName) : ""}</> : "Official championship tables"}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === "drivers" && (
            <Section title="Drivers' Championship" subtitle="Official standings. Podiums are counted from Grand Prix classifications.">
              {ds.loading || ds.error || !ds.value?.data.length ? (
                <StateView loading={ds.loading} error={ds.error} onRetry={ds.reload} empty emptyTitle="No standings yet" emptyText="The championship table appears after the first Grand Prix of the season." skeleton={<TableSkeleton />} />
              ) : (
                <DriverTable list={ds.value.data} p={p} podiums={podiums.drivers} podiumsReady={!!results.value} year={year} latest={latest} />
              )}
              <Source value={ds.value} />
            </Section>
          )}
          {view === "constructors" && (
            <Section title="Constructors' Championship" subtitle="Official standings. Podiums count every Grand Prix top-three finish by the team's cars.">
              {!hasTeams ? (
                <StateView empty emptyTitle="No constructors' championship" emptyText={`The constructors' championship was first awarded in ${CONSTRUCTORS_FROM}. Choose a later season to see team standings.`} />
              ) : cs.loading || cs.error || !cs.value?.data.length ? (
                <StateView loading={cs.loading} error={cs.error} onRetry={cs.reload} empty emptyTitle="No constructors' standings yet" emptyText="The table appears after the first Grand Prix of the season." skeleton={<TableSkeleton />} />
              ) : (
                <TeamTable list={cs.value.data} drivers={ds.value?.data || []} p={p} podiums={podiums.teams} podiumsReady={!!results.value} year={year} />
              )}
              <Source value={cs.value} />
            </Section>
          )}
          {view === "story" && <SeasonStory route={route} progress={progress} hasTeams={hasTeams} latest={latest} teamByRound={teamByRound} />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
type DS = ReturnType<typeof useData<Standing[]>>;
type CS = ReturnType<typeof useData<TeamStanding[]>>;

function StandingsHero({ view, ds, cs, p, total, year, latest }: { view: View; ds: DS; cs: CS; p?: SeasonProgress; total: number; year: string; latest: Map<string, string> }) {
  if (ds.loading) return <Skeleton h="min(64vh, 600px)" r={36} className="st-hero-skel" />;
  if (ds.error) return <StateView error={ds.error} onRetry={ds.reload} />;
  const done = p?.rounds.length || 0;
  const complete = total > 0 && done >= total;
  const photo = circuitMedia(p?.rounds.at(-1)?.circuitId).hero;
  const teamMode = view === "constructors" && !!cs.value?.data.length;
  const list = ds.value?.data || [];
  const teams = cs.value?.data || [];

  if (!list.length)
    return (
      <section className="st-hero empty">
        <div className="st-hero-media"><span className="st-hero-scrim" /></div>
        <div className="st-hero-inner">
          <div className="st-hero-copy">
            <span className="eyebrow st-hero-eyebrow rise"><Trophy size={14} />{year} World Championship</span>
            <h1 className="display st-hero-title rise" style={{ "--i": 1 } as CSSProperties}>All square<span>Every driver on zero</span></h1>
            <p className="st-hero-line rise" style={{ "--i": 2 } as CSSProperties}>Standings appear here moments after the first chequered flag.</p>
          </div>
        </div>
      </section>
    );

  const leadPts = teamMode ? +teams[0].points : +list[0].points;
  const secondPts = teamMode ? (teams[1] ? +teams[1].points : null) : (list[1] ? +list[1].points : null);
  const wins = teamMode ? +teams[0].wins : +list[0].wins;
  const secondName = teamMode ? (teams[1] ? teamShortName(teams[1].Constructor.name, year) : "") : list[1]?.Driver.familyName || "";
  const leaderCar = teamOf(list[0], year, latest);
  const tint = teamMode ? teamColor(teams[0].Constructor) : teamColor(leaderCar);
  const label = complete ? (teamMode ? `${year} Constructors' Champion` : `${year} World Champion`) : teamMode ? `${year} Constructors' leader` : `${year} Championship leader`;

  return (
    <section className="st-hero" style={{ "--tint": tint } as CSSProperties}>
      <div className="st-hero-media">
        {photo && <Img src={photo} alt="" eager />}
        <span className="st-hero-scrim" />
      </div>
      <div className="st-hero-inner">
        <div className="st-hero-copy">
          <span className="eyebrow st-hero-eyebrow rise"><Trophy size={14} />{label}</span>
          {teamMode ? (
            <TeamHeroName team={teams[0].Constructor} year={year} />
          ) : (
            <DriverHeroName s={list[0]} year={year} team={leaderCar} />
          )}
          <div className="st-hero-stats rise" style={{ "--i": 3 } as CSSProperties}>
            <HeroStat label="Points" value={<Counter value={leadPts} decimals={Number.isInteger(leadPts) ? 0 : 1} />} />
            <HeroStat label="Wins" value={<Counter value={wins} />} />
            <HeroStat label={secondName ? `Gap to ${secondName}` : "Gap to P2"} value={secondPts === null ? "—" : <Counter value={leadPts - secondPts} prefix="+" decimals={Number.isInteger(leadPts - secondPts) ? 0 : 1} />} />
            <HeroStat label="Rounds" value={done ? <><Counter value={done} />{total ? <small>/{total}</small> : null}</> : "—"} />
          </div>
          <div className="st-hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
            {teamMode ? (
              <Link className="btn lg primary" to={"team/" + teams[0].Constructor.constructorId}>Team profile<ArrowRight /></Link>
            ) : (
              <Link className="btn lg primary" to={"driver/" + list[0].Driver.driverId}>Driver profile<ArrowRight /></Link>
            )}
            <Link className="btn lg glass-btn" to="scenarios">Title maths</Link>
          </div>
        </div>
        <div className="st-hero-figure" aria-hidden={!teamMode && !driverMedia(list[0].Driver.driverId, year)?.front}>
          {teamMode ? <TeamFigure team={teams[0].Constructor} year={year} /> : <DriverFigure d={list[0].Driver} year={year} team={leaderCar} />}
        </div>
      </div>
    </section>
  );
}

function DriverHeroName({ s, year, team }: { s: Standing; year: string; team?: Team }) {
  return (
    <>
      <h1 className="display st-hero-title rise" style={{ "--i": 1 } as CSSProperties}>{s.Driver.givenName}<span>{s.Driver.familyName}</span></h1>
      <p className="st-hero-line rise" style={{ "--i": 2 } as CSSProperties}>
        <Flag nationality={s.Driver.nationality} large />
        {team && <TeamLogo id={team.constructorId} name={team.name} year={year} size={30} />}
        <span>{team ? teamShortName(team.name, year) : ""}<small>{s.Driver.nationality}{s.Driver.permanentNumber ? ` · #${s.Driver.permanentNumber}` : ""}</small></span>
      </p>
    </>
  );
}

function TeamHeroName({ team, year }: { team: Team; year: string }) {
  const short = teamShortName(team.name, year);
  const words = short.split(" ");
  return (
    <>
      <h1 className="display st-hero-title rise" style={{ "--i": 1 } as CSSProperties}>
        {words.length > 1 ? <>{words.slice(0, -1).join(" ")}<span>{words.at(-1)}</span></> : short}
      </h1>
      <p className="st-hero-line rise" style={{ "--i": 2 } as CSSProperties}>
        <Flag nationality={team.nationality} large />
        <TeamLogo id={team.constructorId} name={team.name} year={year} size={30} />
        <span>{team.name}<small>{team.nationality}</small></span>
      </p>
    </>
  );
}

function DriverFigure({ d, year, team }: { d: Driver; year: string; team?: Team }) {
  const name = fullName(d);
  if (driverMedia(d.driverId, year)?.front)
    return (
      <div className="st-portrait">
        <NumberArt id={d.driverId} number={d.permanentNumber} year={year} className="st-portrait-number" />
        <DriverPortrait id={d.driverId} name={name} year={year} eager className="st-portrait-photo" />
      </div>
    );
  return (
    <div className="st-monogram" style={{ "--tint": teamColor(team) } as CSSProperties}>
      <span className="st-monogram-ring" />
      <span className="st-monogram-text">{initials(name)}</span>
      {d.permanentNumber && <span className="st-monogram-num">#{d.permanentNumber}</span>}
    </div>
  );
}

function TeamFigure({ team, year }: { team: Team; year: string }) {
  if (teamMedia(team.constructorId, year))
    return (
      <div className="st-car">
        <TeamLogo id={team.constructorId} name={team.name} year={year} size={86} variant="white" className="st-car-logo" />
        <CarImage id={team.constructorId} name={team.name} year={year} eager className="st-car-img" />
      </div>
    );
  return (
    <div className="st-monogram" style={{ "--tint": teamColor(team) } as CSSProperties}>
      <span className="st-monogram-ring" />
      <span className="st-monogram-text">{initials(teamShortName(team.name, year))}</span>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="st-hero-stat">
      <span className="st-hero-stat-value">{value}</span>
      <span className="st-hero-stat-label">{label}</span>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="stack" style={{ "--gap": "10px" } as CSSProperties}>
      <Skeleton h={56} r={20} />
      {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={52} r={14} style={{ opacity: 1 - i * 0.09 }} />)}
    </div>
  );
}

/* ───────────────────────── Sortable table helpers ───────────────────────── */
type SortDir = 1 | -1;
function useSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initial, dir: 1 });
  const toggle = (key: K, natural: SortDir = 1) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as SortDir } : { key, dir: natural }));
  return { sort, toggle };
}

function SortTh<K extends string>({ k, label, sort, toggle, natural = 1, className, title }: {
  k: K; label: string; sort: { key: K; dir: SortDir }; toggle: (k: K, natural?: SortDir) => void; natural?: SortDir; className?: string; title?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} scope="col">
      <button type="button" onClick={() => toggle(k, natural)} title={title} className={cx("st-sort", active && "on")}>
        {label}
        {active ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} />}
      </button>
    </th>
  );
}

/** Position change vs the previous round, from per-round ranks derived from classifications. */
function derivedChange(rank: number[] | undefined, last: number) {
  if (!rank || last < 1) return null;
  const now = rank[last], before = rank[last - 1];
  return now && before ? before - now : null;
}
const CHANGE_NOTE = "Change vs the previous round — derived from race and sprint classifications, not the official table.";

/* ───────────────────────── Drivers table ───────────────────────── */
type DKey = "pos" | "change" | "name" | "team" | "wins" | "podiums" | "points";
type DRow = { s: Standing; id: string; pos: number | null; name: string; team?: Team; teamName: string; points: number; wins: number; podiums: number; change: number | null; gapLeader: number; gapAhead: number | null };

function DriverTable({ list, p, podiums, podiumsReady, year, latest }: { list: Standing[]; p?: SeasonProgress; podiums: Map<string, number>; podiumsReady: boolean; year: string; latest: Map<string, string> }) {
  const href = useHref();
  const [term, setTerm] = useState("");
  const { sort, toggle } = useSort<DKey>("pos");
  const rows = useMemo<DRow[]>(() => {
    const last = (p?.rounds.length || 0) - 1;
    const byId = new Map(p?.drivers.map((d) => [d.driver.driverId, d]));
    const lead = +list[0].points;
    return list.map((s, i) => {
      const team = teamOf(s, year, latest);
      return {
        s, id: s.Driver.driverId, pos: recordedRank(s.position), name: fullName(s.Driver), team, teamName: team ? teamShortName(team.name, year) : "",
        points: +s.points, wins: +s.wins, podiums: podiums.get(s.Driver.driverId) || 0,
        change: derivedChange(byId.get(s.Driver.driverId)?.rank, last),
        gapLeader: lead - +s.points, gapAhead: i ? +list[i - 1].points - +s.points : null,
      };
    });
  }, [list, p, podiums, year, latest]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const filtered = t ? rows.filter((r) => [r.name, r.teamName, r.s.Driver.code, r.s.Driver.nationality].some((x) => x?.toLowerCase().includes(t))) : rows;
    const val = (r: DRow): number | string => {
      switch (sort.key) {
        case "pos": return r.pos ?? 999;
        case "change": return r.change ?? -999;
        case "name": return r.s.Driver.familyName;
        case "team": return r.teamName;
        default: return r[sort.key];
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return c * sort.dir || (a.pos ?? 999) - (b.pos ?? 999);
    });
  }, [rows, term, sort]);
  const max = rows[0]?.points || 1;
  const exportCSV = () =>
    download(`f1-pulse-${year}-driver-standings.csv`, toCSV([
      ["Position", "Driver", "Code", "Nationality", "Team", "Points", "Wins", "Podiums", "Gap to leader", "Gap to car ahead", "Change vs previous round (derived)"],
      ...rows.map((r) => [r.pos, r.name, r.s.Driver.code, r.s.Driver.nationality, r.team?.name, r.points, r.wins, podiumsReady ? r.podiums : "", r.gapLeader, r.gapAhead ?? "", r.change ?? ""]),
    ]), "text/csv;charset=utf-8");

  return (
    <Glass className="card flush st-table-card reveal">
      <TableToolbar term={term} setTerm={setTerm} placeholder="Search driver, team or nationality" count={shown.length} total={rows.length} onExport={exportCSV} />
      <div className="table-wrap">
        <table className="tbl st-tbl">
          <thead>
            <tr>
              <SortTh k="pos" label="Pos" sort={sort} toggle={toggle} />
              <SortTh k="change" label="±" sort={sort} toggle={toggle} natural={-1} title={CHANGE_NOTE} className="c" />
              <SortTh k="name" label="Driver" sort={sort} toggle={toggle} />
              <SortTh k="team" label="Team" sort={sort} toggle={toggle} />
              <SortTh k="wins" label="Wins" sort={sort} toggle={toggle} natural={-1} className="r" />
              <SortTh k="podiums" label="Podiums" sort={sort} toggle={toggle} natural={-1} className="r" />
              <SortTh k="points" label="Points" sort={sort} toggle={toggle} natural={-1} className="r" />
              <th className="r" scope="col">Gap</th>
              <th className="r st-hide-sm" scope="col">To ahead</th>
              <th className="st-hide-sm" scope="col"><span className="sr-only">Points share</span></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((r, i) => (
                <motion.tr
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  className="st-row"
                  style={{ "--tint": teamColor(r.team) } as CSSProperties}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) navigate(href("driver/" + r.id)); }}
                >
                  <td><span className={cx("pos", r.pos !== null && r.pos <= 3 && "p" + r.pos)}>{r.pos ?? "—"}</span></td>
                  <td className="c"><RankDelta value={r.change} title={CHANGE_NOTE} /></td>
                  <td>
                    <span className="st-ident">
                      <DriverAvatar id={r.id} name={r.name} year={year} team={r.team?.constructorId} size={38} />
                      <span className="st-ident-text">
                        <Link to={"driver/" + r.id} className="st-ident-name">{r.s.Driver.givenName} <b>{r.s.Driver.familyName}</b></Link>
                        <small><Flag nationality={r.s.Driver.nationality} />{r.s.Driver.code || r.s.Driver.nationality}{r.s.Driver.permanentNumber ? ` · #${r.s.Driver.permanentNumber}` : ""}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    {r.team && (
                      <Link to={"team/" + r.team.constructorId} className="st-team">
                        <i className="team-bar" />
                        <TeamLogo id={r.team.constructorId} name={r.team.name} year={year} size={26} />
                        <span>{r.teamName}</span>
                      </Link>
                    )}
                  </td>
                  <td className="r">{r.wins || <span className="faint">0</span>}</td>
                  <td className="r">{podiumsReady ? r.podiums || <span className="faint">0</span> : <span className="faint">…</span>}</td>
                  <td className="r"><strong className="st-points">{pts(r.points)}</strong></td>
                  <td className="r st-gap">{r.pos === 1 ? <span className="chip solid st-leader">Leader</span> : `−${pts(r.gapLeader)}`}</td>
                  <td className="r st-gap st-hide-sm">{r.gapAhead === null ? "—" : `−${pts(r.gapAhead)}`}</td>
                  <td className="st-hide-sm st-bar-cell"><Bar value={r.points} max={max} color={teamColor(r.team)} index={i} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {!shown.length && <p className="st-noresults">No driver matches “{term}”.</p>}
      </div>
      <p className="st-foot"><Info size={13} />Points, wins and positions are the official table. ± compares derived ranks after the last two rounds (race + sprint classifications summed).</p>
    </Glass>
  );
}

function TableToolbar({ term, setTerm, placeholder, count, total, onExport }: { term: string; setTerm: (s: string) => void; placeholder: string; count: number; total: number; onExport: () => void }) {
  return (
    <div className="st-toolbar">
      <label className="search-input st-search">
        <Search />
        <span className="sr-only">{placeholder}</span>
        <input className="input" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} />
      </label>
      <span className="faint small st-count">{count === total ? plural(total, "entry", "entries") : `${count} of ${total}`}</span>
      <button className="btn sm glass-btn" onClick={onExport}><Download />CSV</button>
    </div>
  );
}

/* ───────────────────────── Constructors table ───────────────────────── */
type TKey = "pos" | "change" | "name" | "wins" | "podiums" | "points";
type TRow = { s: TeamStanding; id: string; pos: number | null; name: string; points: number; wins: number; podiums: number; change: number | null; gapLeader: number; gapAhead: number | null; drivers: Standing[] };

function TeamTable({ list, drivers, p, podiums, podiumsReady, year }: { list: TeamStanding[]; drivers: Standing[]; p?: SeasonProgress; podiums: Map<string, number>; podiumsReady: boolean; year: string }) {
  const href = useHref();
  const [term, setTerm] = useState("");
  const { sort, toggle } = useSort<TKey>("pos");
  const rows = useMemo<TRow[]>(() => {
    const last = (p?.rounds.length || 0) - 1;
    const byId = new Map(p?.teams.map((t) => [t.team.constructorId, t]));
    const lead = +list[0].points;
    return list.map((s, i) => ({
      s, id: s.Constructor.constructorId, pos: recordedRank(s.position), name: teamShortName(s.Constructor.name, year),
      points: +s.points, wins: +s.wins, podiums: podiums.get(s.Constructor.constructorId) || 0,
      change: derivedChange(byId.get(s.Constructor.constructorId)?.rank, last),
      gapLeader: lead - +s.points, gapAhead: i ? +list[i - 1].points - +s.points : null,
      drivers: drivers.filter((d) => d.Constructors.some((c) => c.constructorId === s.Constructor.constructorId)),
    }));
  }, [list, drivers, p, podiums, year]);
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const filtered = t ? rows.filter((r) => [r.name, r.s.Constructor.name, r.s.Constructor.nationality, ...r.drivers.map((d) => fullName(d.Driver))].some((x) => x.toLowerCase().includes(t))) : rows;
    const val = (r: TRow): number | string => (sort.key === "pos" ? r.pos ?? 999 : sort.key === "change" ? r.change ?? -999 : sort.key === "name" ? r.name : r[sort.key]);
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return c * sort.dir || (a.pos ?? 999) - (b.pos ?? 999);
    });
  }, [rows, term, sort]);
  const max = rows[0]?.points || 1;
  const exportCSV = () =>
    download(`f1-pulse-${year}-constructor-standings.csv`, toCSV([
      ["Position", "Constructor", "Nationality", "Points", "Wins", "Podiums", "Gap to leader", "Gap to team ahead", "Drivers", "Change vs previous round (derived)"],
      ...rows.map((r) => [r.pos, r.s.Constructor.name, r.s.Constructor.nationality, r.points, r.wins, podiumsReady ? r.podiums : "", r.gapLeader, r.gapAhead ?? "", r.drivers.map((d) => fullName(d.Driver)).join(" / "), r.change ?? ""]),
    ]), "text/csv;charset=utf-8");

  return (
    <Glass className="card flush st-table-card reveal">
      <TableToolbar term={term} setTerm={setTerm} placeholder="Search team or driver" count={shown.length} total={rows.length} onExport={exportCSV} />
      <div className="table-wrap">
        <table className="tbl st-tbl">
          <thead>
            <tr>
              <SortTh k="pos" label="Pos" sort={sort} toggle={toggle} />
              <SortTh k="change" label="±" sort={sort} toggle={toggle} natural={-1} title={CHANGE_NOTE} className="c" />
              <SortTh k="name" label="Constructor" sort={sort} toggle={toggle} />
              <th scope="col">Drivers</th>
              <SortTh k="wins" label="Wins" sort={sort} toggle={toggle} natural={-1} className="r" />
              <SortTh k="podiums" label="Podiums" sort={sort} toggle={toggle} natural={-1} className="r" />
              <SortTh k="points" label="Points" sort={sort} toggle={toggle} natural={-1} className="r" />
              <th className="r" scope="col">Gap</th>
              <th className="r st-hide-sm" scope="col">To ahead</th>
              <th className="st-hide-sm" scope="col"><span className="sr-only">Points share</span></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((r, i) => (
                <motion.tr
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  className="st-row"
                  style={{ "--tint": teamColor(r.s.Constructor) } as CSSProperties}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) navigate(href("team/" + r.id)); }}
                >
                  <td><span className={cx("pos", r.pos !== null && r.pos <= 3 && "p" + r.pos)}>{r.pos ?? "—"}</span></td>
                  <td className="c"><RankDelta value={r.change} title={CHANGE_NOTE} /></td>
                  <td>
                    <span className="st-ident">
                      <i className="team-bar" />
                      <TeamLogo id={r.id} name={r.s.Constructor.name} year={year} size={40} />
                      <span className="st-ident-text">
                        <Link to={"team/" + r.id} className="st-ident-name"><b>{r.name}</b></Link>
                        <small><Flag nationality={r.s.Constructor.nationality} />{r.s.Constructor.nationality}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="st-pair">
                      {r.drivers.slice(0, 4).map((d) => (
                        <Link key={d.Driver.driverId} to={"driver/" + d.Driver.driverId} title={`${fullName(d.Driver)} · ${pts(d.points)} pts`}>
                          <DriverAvatar id={d.Driver.driverId} name={fullName(d.Driver)} year={year} team={r.id} size={32} />
                        </Link>
                      ))}
                      {r.drivers.length > 4 && <span className="st-pair-more">+{r.drivers.length - 4}</span>}
                      <span className="st-pair-names">{r.drivers.slice(0, 2).map((d) => d.Driver.familyName).join(" · ")}</span>
                    </span>
                  </td>
                  <td className="r">{r.wins || <span className="faint">0</span>}</td>
                  <td className="r">{podiumsReady ? r.podiums || <span className="faint">0</span> : <span className="faint">…</span>}</td>
                  <td className="r"><strong className="st-points">{pts(r.points)}</strong></td>
                  <td className="r st-gap">{r.pos === 1 ? <span className="chip solid st-leader">Leader</span> : `−${pts(r.gapLeader)}`}</td>
                  <td className="r st-gap st-hide-sm">{r.gapAhead === null ? "—" : `−${pts(r.gapAhead)}`}</td>
                  <td className="st-hide-sm st-bar-cell"><Bar value={r.points} max={max} color={teamColor(r.s.Constructor)} index={i} /></td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {!shown.length && <p className="st-noresults">No constructor matches “{term}”.</p>}
      </div>
      <p className="st-foot"><Info size={13} />Driver avatars list everyone who scored championship points for the team this season (per the official drivers' table).</p>
    </Glass>
  );
}

/* ───────────────────────── Season story ───────────────────────── */
type Entry = { id: string; name: string; short: string; color: string; value: number; rank: number; teamId?: string; driver?: Driver; team: Team };

function entriesAt(p: SeasonProgress, kind: Kind, frame: number): Entry[] {
  const list: Entry[] = kind === "drivers"
    ? p.drivers.map((d) => ({ id: d.driver.driverId, name: fullName(d.driver), short: d.driver.code || d.driver.familyName.slice(0, 3).toUpperCase(), color: teamColor(d.team), value: d.cumulative[frame] ?? 0, rank: d.rank[frame] ?? 999, teamId: d.team.constructorId, driver: d.driver, team: d.team }))
    : p.teams.map((t) => ({ id: t.team.constructorId, name: t.team.name, short: t.team.name, color: teamColor(t.team), value: t.cumulative[frame] ?? 0, rank: t.rank[frame] ?? 999, teamId: t.team.constructorId, team: t.team }));
  return list.sort((a, b) => a.rank - b.rank || b.value - a.value);
}

function SeasonStory({ route, progress, hasTeams, latest, teamByRound }: { route: Route; progress: ReturnType<typeof useSeasonProgress>; hasTeams: boolean; latest: Map<string, string>; teamByRound: Map<string, Map<string, string>> }) {
  const qKind = route.query.get("kind");
  const [kind, setKindState] = useState<Kind>(qKind === "constructors" && hasTeams ? "constructors" : "drivers");
  const setKind = (k: Kind) => { setKindState(k); setQuery({ kind: k === "drivers" ? null : k }); };
  const p = progress.value?.data;
  const qRound = route.query.get("round");
  const [round, setRoundState] = useState<string | null>(qRound);
  const setRound = (r: string) => { setRoundState(r); setQuery({ round: r }); };
  const rewindRef = useRef<HTMLDivElement>(null);

  if (progress.loading || progress.error || !p?.rounds.length)
    return (
      <Section title="Season story">
        <StateView loading={progress.loading} error={progress.error} onRetry={progress.reload} empty emptyTitle="No rounds completed" emptyText="The season story fills in round by round once results are published." skeleton={<Skeleton h={620} r={32} />} />
      </Section>
    );
  const selected = p.rounds.find((r) => r.round === round)?.round || p.rounds.at(-1)!.round;
  const kindToggle = (
    <Segmented
      label="Championship"
      value={kind}
      onChange={(k) => setKind(k)}
      options={hasTeams ? [{ value: "drivers", label: "Drivers" }, { value: "constructors", label: "Constructors" }] : [{ value: "drivers", label: "Drivers" }]}
    />
  );

  return (
    <>
      <Section
        title="The race for the title"
        subtitle={`Cumulative points after every round — race and sprint classifications summed.${hasTeams ? "" : " The constructors' championship began in 1958."}`}
        action={kindToggle}
      >
        <BarRace
          key={kind}
          p={p}
          kind={kind}
          onOfficial={(r) => { setRound(r); requestAnimationFrame(() => rewindRef.current?.scrollIntoView({ behavior: reducedMotionNow() ? "auto" : "smooth", block: "start" })); }}
        />
        <ProgressNote progress={progress.value?.data} kind="both" />
        <Source value={progress.value} />
      </Section>

      <Section title="Every position, every round" subtitle="Championship rank after each round for the current top ten. Hover or use the arrow keys to scrub.">
        <BumpChart p={p} kind={kind} />
      </Section>

      <div ref={rewindRef} className="st-anchor" />
      <Section title="Official round-by-round rewind" subtitle="The provider's published table after the round you choose — loaded on demand." action={<span className="chip blue"><History />Official data</span>}>
        <RoundRewind rounds={p.rounds} kind={kind} round={selected} setRound={setRound} teamMap={teamByRound.get(selected) || latest} />
      </Section>
    </>
  );
}

/* ── Bar-chart race ── */
const SPEEDS = ["0.5", "1", "2", "4"] as const;
type Speed = (typeof SPEEDS)[number];

function BarRace({ p, kind, onOfficial }: { p: SeasonProgress; kind: Kind; onOfficial: (round: string) => void }) {
  const { year } = usePrefs();
  const n = p.rounds.length;
  const reduced = reducedMotionNow();
  const [frame, setFrame] = useState(() => (reduced ? n - 1 : 0));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("1");
  const started = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const step = 1500 / +speed;
  const dur = Math.min(1.1, (step / 1000) * 0.9);

  // Autoplay once when the race first scrolls into view.
  useEffect(() => {
    const el = box.current;
    if (!el || reduced || n < 2) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) { started.current = true; setPlaying(true); io.disconnect(); }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [n, reduced]);

  useEffect(() => {
    if (!playing) return;
    if (frame >= n - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setFrame((f) => Math.min(n - 1, f + 1)), step);
    return () => clearTimeout(t);
  }, [playing, frame, n, step]);

  const go = (f: number) => { started.current = true; setPlaying(false); setFrame(Math.max(0, Math.min(n - 1, f))); };
  const toggle = () => {
    started.current = true;
    if (playing) setPlaying(false);
    else { if (frame >= n - 1) setFrame(0); setPlaying(true); }
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT") return;
    if (e.key === " " || e.key === "k") { if (tag === "BUTTON" && e.key === " ") return; e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(frame + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(frame - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(n - 1); }
  };

  const all = useMemo(() => entriesAt(p, kind, frame), [p, kind, frame]);
  const limit = kind === "drivers" ? 10 : 12;
  const rows = all.filter((e) => e.rank !== 999 || e.value > 0).slice(0, limit);
  const max = Math.max(1, rows[0]?.value || 0);
  const r = p.rounds[frame];
  const leader = rows[0], second = rows[1];
  const progressPct = n > 1 ? (frame / (n - 1)) * 100 : 100;

  return (
    <div className="glass st-race reveal" ref={box} tabIndex={0} onKeyDown={onKey} aria-label="Championship bar chart race. Space to play or pause, arrow keys to step through rounds." role="group">
      <div className="st-race-head">
        <div className="st-race-round" aria-live="polite">
          <span className="st-race-r">
            <small>Round</small>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={r.round} initial={{ y: "60%", opacity: 0, filter: "blur(4px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: "-60%", opacity: 0, filter: "blur(4px)" }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                {r.round}
              </motion.b>
            </AnimatePresence>
          </span>
          <span className="st-race-event">
            <span className="row" style={{ "--gap": "10px" } as CSSProperties}><Flag country={r.country} large /><strong>{shortRace(r.raceName)}</strong></span>
            <small>{r.raceName} · {formatDay(r.date, { year: "numeric" })}</small>
          </span>
        </div>
        <div className="st-race-summary">
          {leader && (
            <span className="st-race-lead" style={{ "--tint": leader.color } as CSSProperties}>
              <Trophy size={14} />
              <span><small>Leader</small><b>{kind === "drivers" ? leader.driver?.familyName : teamShortName(leader.team.name, year)}</b></span>
              {second && <span className="st-race-margin">+<Tween value={leader.value - second.value} duration={dur} /></span>}
            </span>
          )}
        </div>
      </div>

      <ol className="st-race-list" aria-label={`Top ${rows.length} after round ${r.round}`}>
        <AnimatePresence initial={false}>
          {rows.map((e, i) => {
            const pct = Math.max(1.5, (e.value / max) * 100);
            return (
              <motion.li
                key={e.id}
                layout="position"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ layout: { type: "spring", stiffness: 210, damping: 28, mass: 0.9 }, default: { duration: 0.3 } }}
                className={cx("st-race-row", i === 0 && "first")}
                style={{ "--tint": e.color } as CSSProperties}
              >
                <span className="st-race-pos">{i + 1}</span>
                <span className="st-race-who">
                  {kind === "drivers" ? (
                    <DriverAvatar id={e.id} name={e.name} year={year} team={e.teamId} size={34} />
                  ) : (
                    <TeamLogo id={e.id} name={e.name} year={year} size={34} />
                  )}
                  <span className="st-race-name">
                    <b className="st-race-full">{kind === "drivers" ? e.driver?.familyName : teamShortName(e.team.name, year)}</b>
                    <b className="st-race-short">{kind === "drivers" ? e.short : initials(teamShortName(e.team.name, year))}</b>
                    {kind === "drivers" && <small>{teamShortName(e.team.name, year)}</small>}
                  </span>
                </span>
                <span className="st-race-track">
                  <motion.span className="st-race-bar" initial={false} animate={{ width: pct + "%" }} transition={{ duration: dur, ease: [0.33, 1, 0.68, 1] }}>
                    <span className="st-race-value"><Tween value={e.value} duration={dur} /></span>
                  </motion.span>
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      <div className="st-race-controls">
        <div className="st-transport">
          <button className="icon-btn" onClick={() => go(0)} disabled={frame === 0} aria-label="First round"><SkipBack /></button>
          <button className="icon-btn" onClick={() => go(frame - 1)} disabled={frame === 0} aria-label="Previous round"><ChevronLeft /></button>
          <button className="st-play" onClick={toggle} aria-label={playing ? "Pause" : frame >= n - 1 ? "Replay from round 1" : "Play"} aria-pressed={playing}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button className="icon-btn" onClick={() => go(frame + 1)} disabled={frame >= n - 1} aria-label="Next round"><ChevronRight /></button>
          <button className="icon-btn" onClick={() => go(n - 1)} disabled={frame >= n - 1} aria-label="Latest round"><SkipForward /></button>
        </div>
        <div className="st-scrub" style={{ "--p": progressPct + "%", "--n": n } as CSSProperties}>
          <input
            type="range"
            min={0}
            max={n - 1}
            step={1}
            value={frame}
            onChange={(e) => go(+e.target.value)}
            aria-label="Round"
            aria-valuetext={`Round ${r.round}: ${r.raceName}`}
            className="st-range"
          />
          <div className="st-ticks" aria-hidden>
            {p.rounds.map((x, i) => (
              <span
                key={x.round}
                className={cx("st-tick", i <= frame && "on", i === frame && "cur")}
                style={{ left: n > 1 ? `calc(${(i / (n - 1)) * 100}% + ${9 - (i / (n - 1)) * 18}px)` : "50%" }}
                title={`Round ${x.round} · ${x.raceName}`}
                onClick={() => go(i)}
              >
                <Flag country={x.country} />
              </span>
            ))}
          </div>
        </div>
        <div className="st-race-extra">
          <Segmented label="Playback speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: s + "×" }))} />
          <button className="btn sm glass-btn" onClick={() => onOfficial(r.round)}><History />Official table · R{r.round}</button>
        </div>
      </div>
      <p className="st-foot inset"><Info size={13} />Summed from published race and sprint classifications. Post-race penalties or points adjustments may make this differ slightly from the official table below. <span className="kbd">Space</span> play/pause · <span className="kbd">←</span><span className="kbd">→</span> step</p>
    </div>
  );
}

/* ── Bump chart ── */
function BumpChart({ p, kind }: { p: SeasonProgress; kind: Kind }) {
  const { year } = usePrefs();
  const [focus, setFocus] = useState<string | null>(null);
  const last = p.rounds.length - 1;
  const top = entriesAt(p, kind, last).filter((e) => e.rank !== 999).slice(0, 10);
  const source = kind === "drivers" ? new Map(p.drivers.map((d) => [d.driver.driverId, d.rank])) : new Map(p.teams.map((t) => [t.team.constructorId, t.rank]));
  const seen = new Set<string>();
  const series = top.map((e) => {
    const dashed = kind === "drivers" && seen.has(e.teamId || "");
    seen.add(e.teamId || "");
    const ranks = source.get(e.id) || [];
    return { id: e.id, name: kind === "drivers" ? e.driver?.familyName || e.name : teamShortName(e.team.name, year), color: e.color, dashed, values: p.rounds.map((_, i) => ranks[i] ?? null) };
  });
  if (p.rounds.length < 2)
    return <StateView empty emptyTitle="One round so far" emptyText="The bump chart needs at least two completed rounds." />;
  const maxRank = Math.max(10, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  return (
    <Glass className="card reveal">
      <div className="st-bump-legend">
        {top.map((e, i) => (
          <button
            key={e.id}
            className={cx("st-bump-chip", focus && focus !== e.id && "dim")}
            style={{ "--tint": e.color } as CSSProperties}
            onPointerEnter={() => setFocus(e.id)}
            onPointerLeave={() => setFocus(null)}
            onFocus={() => setFocus(e.id)}
            onBlur={() => setFocus(null)}
            aria-label={`${series[i].name}, P${i + 1}`}
          >
            <span className="st-bump-rank">{i + 1}</span>
            {series[i].name}
            {series[i].dashed && <i className="st-bump-dash" title="Second driver of this team (dashed line)" />}
          </button>
        ))}
      </div>
      <LineChart
        ariaLabel={`Championship position of the top ten ${kind} after each round`}
        series={series}
        labels={p.rounds.map((r) => "R" + r.round)}
        invert
        yMin={1}
        yMax={maxRank}
        step={maxRank <= 12 ? 1 : maxRank <= 24 ? 3 : 5}
        yFormat={(v) => "P" + Math.round(v)}
        tooltipTitle={(i) => `After round ${p.rounds[i].round} · ${shortRace(p.rounds[i].raceName)}`}
        focus={focus}
        onFocus={setFocus}
        curve
        height={420}
      />
      <p className="source">Ranks derived from summed classification points, ties broken by wins.</p>
    </Glass>
  );
}

/* ── Official round standings rewind ── */
type FrameRow = { id: string; label: string; position: number | null; points: number; wins: number; driver?: Driver; team?: Team };

async function officialFrame(season: string, year: string, round: string, kind: Kind, teamMap: Map<string, string>): Promise<Envelope<FrameRow[]>> {
  const r = await roundStandings(season, round, kind === "drivers" ? "driver" : "constructor");
  const list: StandingsList | undefined = r.data;
  const rows: FrameRow[] = kind === "drivers"
    ? (list?.DriverStandings || []).map((s) => ({ id: s.Driver.driverId, label: fullName(s.Driver), position: recordedRank(s.position), points: +s.points, wins: +s.wins, driver: s.Driver, team: teamOf(s, year, teamMap) }))
    : (list?.ConstructorStandings || []).map((s) => ({ id: s.Constructor.constructorId, label: s.Constructor.name, position: recordedRank(s.position), points: +s.points, wins: +s.wins, team: s.Constructor }));
  return { ...r, data: rows };
}

function RoundRewind({ rounds, kind, round, setRound, teamMap }: { rounds: SeasonProgress["rounds"]; kind: Kind; round: string; setRound: (r: string) => void; teamMap: Map<string, string> }) {
  const { season, year } = usePrefs();
  const index = Math.max(0, rounds.findIndex((r) => r.round === round));
  const current = rounds[index];
  const previous = rounds[index - 1];
  const data = useData(() => officialFrame(season, year, current.round, kind, teamMap), [season, current.round, kind, teamMap.size]);
  const before = useData(() => (previous ? officialFrame(season, year, previous.round, kind, teamMap) : Promise.resolve(emptyEnvelope<FrameRow[]>([]))), [season, previous?.round, kind]);
  const prior = new Map((before.value?.data || []).map((r) => [r.id, r]));
  const rows = data.value?.data || [];
  const leader = rows[0], runner = rows[1];
  const change = (row: FrameRow) => {
    const b = prior.get(row.id);
    return previous && b?.position != null && row.position != null ? b.position - row.position : null;
  };
  const biggest = rows.map((row) => ({ row, gain: change(row) })).filter((x): x is { row: FrameRow; gain: number } => x.gain !== null && x.gain > 0).sort((a, b) => b.gain - a.gain)[0];
  const exportCSV = () =>
    download(`f1-pulse-${year}-round-${current.round}-${kind}.csv`, toCSV([
      ["Round", "Position", kind === "drivers" ? "Driver" : "Constructor", "Points", "Points this round", "Wins", "Position change"],
      ...rows.map((s) => {
        const b = prior.get(s.id);
        return [current.round, s.position, s.label, s.points, !previous ? s.points : b ? s.points - b.points : "", s.wins, change(s) ?? ""];
      }),
    ]), "text/csv;charset=utf-8");
  const name = (row: FrameRow) => (row.driver ? row.driver.familyName : row.team ? teamShortName(row.team.name, year) : row.label);

  return (
    <Glass className="card st-rewind reveal">
      <div className="st-rewind-head">
        <div className="st-rewind-event">
          <span className="st-rewind-num">{current.round.padStart(2, "0")}</span>
          <div>
            <span className="eyebrow">After round {current.round} of {rounds.length} completed</span>
            <h3 className="title-3 row" style={{ "--gap": "10px" } as CSSProperties}><Flag country={current.country} large />{current.raceName}</h3>
            <p className="muted small">{formatDay(current.date, { year: "numeric", month: "long" })} · <Link className="link" to={"race/" + current.round}>Race report<ArrowRight /></Link></p>
          </div>
        </div>
        <div className="st-rewind-nav">
          <button className="icon-btn" onClick={() => previous && setRound(previous.round)} disabled={!previous} aria-label="Previous round"><ChevronLeft /></button>
          <label className="field st-rewind-select">
            <span className="sr-only">Choose round</span>
            <select className="select" value={current.round} onChange={(e) => setRound(e.target.value)}>
              {rounds.map((r) => <option key={r.round} value={r.round}>R{r.round} · {shortRace(r.raceName)}</option>)}
            </select>
          </label>
          <button className="icon-btn" onClick={() => rounds[index + 1] && setRound(rounds[index + 1].round)} disabled={!rounds[index + 1]} aria-label="Next round"><ChevronRight /></button>
          <button className="btn sm glass-btn" onClick={exportCSV} disabled={!rows.length}><Download />CSV</button>
        </div>
      </div>

      {data.loading || data.error || !rows.length ? (
        <StateView loading={data.loading} error={data.error} onRetry={data.reload} empty emptyTitle="No official table for this round" emptyText="The provider hasn't published standings for this round." skeleton={<TableSkeleton />} />
      ) : (
        <>
          <div className="st-rewind-kpis">
            <div className="st-rk"><span>Leader</span><b>{name(leader)}</b><small>{pts(leader.points)} pts</small></div>
            <div className="st-rk"><span>Gap at the top</span><b>{runner ? `${pts(leader.points - runner.points)} pts` : "—"}</b><small>{runner ? `over ${name(runner)}` : "No runner-up"}</small></div>
            <div className="st-rk"><span>Biggest climber</span><b>{biggest ? name(biggest.row) : "—"}</b><small>{biggest ? `Up ${plural(biggest.gain, "place")}` : previous ? "No gains this round" : "First round"}</small></div>
            <div className="st-rk"><span>Leader's wins</span><b>{leader.wins}</b><small>after round {current.round}</small></div>
          </div>
          <div className="table-wrap">
            <table className="tbl st-tbl st-rewind-tbl">
              <thead>
                <tr>
                  <th scope="col">Pos</th>
                  <th className="c" scope="col">±</th>
                  <th scope="col">{kind === "drivers" ? "Driver" : "Constructor"}</th>
                  <th className="r" scope="col">Points</th>
                  <th className="r" scope="col">This round</th>
                  <th className="r" scope="col">Wins</th>
                  <th className="r" scope="col">Gap</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {rows.map((s) => {
                    const b = prior.get(s.id);
                    const gained = !previous ? s.points : b ? s.points - b.points : before.value ? s.points : null;
                    return (
                      <motion.tr key={s.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 34 }} style={{ "--tint": teamColor(s.team) } as CSSProperties}>
                        <td><span className={cx("pos", s.position !== null && s.position <= 3 && "p" + s.position)}>{s.position ?? "—"}</span></td>
                        <td className="c">{before.loading ? <span className="faint">…</span> : <RankDelta value={change(s)} title={previous ? `vs official table after round ${previous.round}` : "First round of the season"} />}</td>
                        <td>
                          {s.driver ? (
                            <Link to={"driver/" + s.id} className="st-ident">
                              <DriverAvatar id={s.id} name={s.label} year={year} team={s.team?.constructorId} size={32} />
                              <span className="st-ident-text"><span className="st-ident-name">{s.driver.givenName} <b>{s.driver.familyName}</b></span><small>{s.team ? teamShortName(s.team.name, year) : ""}</small></span>
                            </Link>
                          ) : (
                            <Link to={"team/" + s.id} className="st-ident">
                              <i className="team-bar" />
                              <TeamLogo id={s.id} name={s.label} year={year} size={32} />
                              <span className="st-ident-name"><b>{s.team ? teamShortName(s.team.name, year) : s.label}</b></span>
                            </Link>
                          )}
                        </td>
                        <td className="r"><strong className="st-points">{pts(s.points)}</strong></td>
                        <td className="r">{gained === null ? "—" : gained > 0 ? <span className="chip green st-gain">+{pts(gained)}</span> : <span className="faint">{gained < 0 ? pts(gained) : "0"}</span>}</td>
                        <td className="r">{s.wins}</td>
                        <td className="r st-gap">{s === leader ? <span className="chip solid st-leader">Leader</span> : `−${pts(leader.points - s.points)}`}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {before.error && (
            <p className="st-foot"><Info size={13} />The previous round's table couldn't be loaded, so changes are omitted. <button className="link" onClick={before.reload}>Retry</button></p>
          )}
        </>
      )}
      <p className="st-foot"><Info size={13} />Official standings as published by the data provider after round {current.round}, including any penalties and adjustments. Changes compare with {previous ? `the official table after round ${previous.round}` : "nothing — this is the first round"}. The bar race above is summed from classifications and may differ slightly.</p>
      <Source value={data.value} label="Official standings" />
    </Glass>
  );
}
