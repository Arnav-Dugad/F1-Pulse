import { ProgressNote } from "../ui/progress-note";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowLeft, ArrowRight, BookOpen, CircleSlash, Crown, ExternalLink, Gauge, Medal, Swords, Target, Trophy, Users, Zap,
} from "lucide-react";
import { paginate, standings, standingsHistory, teamSeasonResults, teamStandings, teams, useData, wiki, wikiTitle, type StandingsList } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { shortRace, useSeasonProgress } from "../lib/season";
import { driverMedia, fullName, initials, isLightColor, teamColor, teamMedia, teamShortName } from "../lib/media";
import { plural, pts } from "../lib/format";
import { headToHead } from "../math.mjs";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { CarImage, DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo } from "../ui/media";
import { FavoriteButton } from "../ui/cards";
import { LineChart } from "../ui/charts";
import type { Driver, Envelope, Race, Standing, Team as TeamT, TeamStanding } from "../types";
import "./team.css";

const EMPTY = { data: [] as Race[], meta: undefined } as unknown as Envelope<Race[]>;
const CURRENT_YEAR = new Date().getFullYear();
const isClassified = (positionText: string) => /^\d+$/.test(positionText);
const dec = (n: number) => (Number.isInteger(n) ? 0 : 1);

/** Darken a hex colour toward black (0–1) — keeps pale liveries legible on light backgrounds. */
function darken(hex: string, amount: number) {
  const v = parseInt(hex.replace("#", ""), 16);
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, "0");
  return `#${f((v >> 16) & 255)}${f((v >> 8) & 255)}${f(v & 255)}`;
}
function useInk() {
  const { theme } = usePrefs();
  return (hex: string) => (theme === "light" && isLightColor(hex) ? darken(hex, 0.45) : hex);
}

/* ───────────────────────── Season model ───────────────────────── */
type Cell = { race: number; sprint: number; pos: string; status: string; grid: string; sprintPos?: string };
type RoundRow = { round: string; raceName: string; country: string; cells: Record<string, Cell>; total: number; hasRace: boolean };
type Line = {
  driver: Driver; starts: number; lastRound: number; racePts: number; sprintPts: number; rounds: number[];
  wins: number; podiums: number; best: number | null; dnfs: number; classified: number; sumPos: number;
};
type SeasonModel = {
  rounds: RoundRow[]; lines: Line[]; wins: number; podiums: number; oneTwos: number; dnfs: number;
  best: number | null; bestCount: number; classificationPts: number; raceRounds: number;
};

function buildSeason(races: Race[], sprints: Race[]): SeasonModel {
  const lines = new Map<string, Line>();
  const line = (d: Driver) => {
    if (!lines.has(d.driverId)) lines.set(d.driverId, { driver: d, starts: 0, lastRound: 0, rounds: [], racePts: 0, sprintPts: 0, wins: 0, podiums: 0, best: null, dnfs: 0, classified: 0, sumPos: 0 });
    return lines.get(d.driverId)!;
  };
  const rows = new Map<string, RoundRow>();
  const row = (r: Race) => {
    if (!rows.has(r.round)) rows.set(r.round, { round: r.round, raceName: r.raceName, country: r.Circuit.Location.country, cells: {}, total: 0, hasRace: false });
    return rows.get(r.round)!;
  };
  const m: SeasonModel = { rounds: [], lines: [], wins: 0, podiums: 0, oneTwos: 0, dnfs: 0, best: null, bestCount: 0, classificationPts: 0, raceRounds: 0 };
  for (const race of races) {
    if (!race.Results?.length) continue;
    const rr = row(race);
    rr.hasRace = true;
    m.raceRounds++;
    const positions: number[] = [];
    for (const r of race.Results) {
      const l = line(r.Driver);
      const p = +(r.points || 0);
      const pos = +r.position;
      l.starts++;
      l.lastRound = Math.max(l.lastRound, +race.round);
      if (!l.rounds.includes(+race.round)) l.rounds.push(+race.round);
      l.racePts += p;
      m.classificationPts += p;
      if (isClassified(r.positionText)) {
        positions.push(pos);
        l.classified++;
        l.sumPos += pos;
        if (l.best === null || pos < l.best) l.best = pos;
        if (pos === 1) { m.wins++; l.wins++; }
        if (pos <= 3) { m.podiums++; l.podiums++; }
        if (m.best === null || pos < m.best) { m.best = pos; m.bestCount = 1; }
        else if (pos === m.best) m.bestCount++;
      }
      if (r.positionText === "R" || r.positionText === "N") { m.dnfs++; l.dnfs++; }
      const c = (rr.cells[r.Driver.driverId] ||= { race: 0, sprint: 0, pos: "", status: "", grid: "" });
      Object.assign(c, { race: p, pos: r.positionText, status: r.status, grid: r.grid });
    }
    if (positions.includes(1) && positions.includes(2)) m.oneTwos++;
  }
  for (const s of sprints) {
    if (!s.SprintResults?.length) continue;
    const rr = row(s);
    for (const r of s.SprintResults) {
      const l = line(r.Driver);
      const p = +(r.points || 0);
      l.sprintPts += p;
      l.lastRound = Math.max(l.lastRound, +s.round);
      if (!l.rounds.includes(+s.round)) l.rounds.push(+s.round);
      m.classificationPts += p;
      const c = (rr.cells[r.Driver.driverId] ||= { race: 0, sprint: 0, pos: "", status: "", grid: "" });
      c.sprint = p;
      c.sprintPos = r.positionText;
    }
  }
  m.rounds = [...rows.values()].sort((a, b) => +a.round - +b.round);
  for (const l of lines.values()) l.rounds.sort((a, b) => a - b);
  for (const r of m.rounds) r.total = Object.values(r.cells).reduce((s, c) => s + c.race + c.sprint, 0);
  // Current line-up first (most recent round), then by number of starts.
  m.lines = [...lines.values()].sort((a, b) => b.lastRound - a.lastRound || b.starts - a.starts || b.racePts + b.sprintPts - (a.racePts + a.sprintPts));
  return m;
}

/* ───────────────────────── Page ───────────────────────── */
export default function Team({ route }: { route: Route }) {
  const id = route.parts[1] || "";
  const { season, year } = usePrefs();
  const tl = useData(() => teams(season), [season]);
  const cs = useData(() => teamStandings(season), [season]);
  const res = useData(() => teamSeasonResults(season, id), [season, id]);
  const spr = useData(() => (+year >= 2021 ? paginate(`${season}/constructors/${id}/sprint.json`, "SprintResults") : Promise.resolve(EMPTY)), [season, id]);
  const ds = useData(() => standings(season), [season]);
  const hist = useData(() => standingsHistory("constructors", id), [id]);

  const histTeam = hist.value?.data.at(-1)?.ConstructorStandings?.[0]?.Constructor;
  const seasonTeam = tl.value?.data.find((t) => t.constructorId === id) || res.value?.data[0]?.Results?.[0]?.Constructor;
  const team = seasonTeam || histTeam;
  const standing = cs.value?.data.find((s) => s.Constructor.constructorId === id);
  const model = useMemo(() => buildSeason(res.value?.data || [], spr.value?.data || []), [res.value, spr.value]);
  const tint = teamColor(id);
  const name = team ? teamShortName(team.name, year) : "Team";
  useTitle(team ? name : "Team");
  useAmbient(tint, isLightColor(tint) ? "#8e8e99" : undefined);

  const resolving = !team && (tl.loading || res.loading || hist.loading);
  const failed = !team && !resolving && tl.error && res.error;

  if (resolving)
    return (
      <Page className="tm">
        <Skeleton h="min(74vh, 680px)" r={36} />
        <div className="tm-kpis" style={{ marginTop: 56 }}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={128} r={22} />)}</div>
      </Page>
    );
  if (failed) return <Page className="tm"><StateView error={tl.error} onRetry={() => { tl.reload(); res.reload(); }} /></Page>;
  if (!team || !id) return <Page className="tm"><Missing id={id} year={year} /></Page>;

  const competed = !!(seasonTeam || standing || model.rounds.length);
  const points = standing ? +standing.points : model.classificationPts;
  const lastHist = hist.value?.data.at(-1);

  return (
    <Page className="tm">
      <div className={cx("tm-root", isLightColor(tint) && "light")} style={{ "--tint": tint } as CSSProperties}>
        <Hero id={id} team={team} year={year} standing={standing} count={cs.value?.data.length || 0} points={competed ? points : null} wins={model.wins} />

        {!competed ? (
          <div className="notice tm-absent reveal">
            <CircleSlash />
            <span>
              {name} didn't take part in the {year} championship{res.loading ? "" : " according to the published entry list"}.
              {lastHist && <> Their most recent constructors' standings entry is from <Link className="link" to={`team/${id}?season=${lastHist.season}`}>{lastHist.season}<ArrowRight /></Link></>}
            </span>
          </div>
        ) : (
          <>
            <Lineup model={model} loading={res.loading} error={res.error} onRetry={res.reload} standings={ds.value?.data} year={year} teamName={name} />
            <SeasonNumbers model={model} standing={standing} total={cs.value?.data.length || 0} points={points} loading={res.loading || cs.loading} year={year} source={res.value} />
            {model.rounds.length > 0 && (
              <>
                <Section title="Race by race" subtitle={`Points scored each round, split by driver${+year >= 2021 ? " — sprint points included" : ""}. Hover or use the arrow keys.`}>
                  <RoundsChart model={model} year={year} />
                  <Source value={res.value} />
                </Section>
                <Rivals id={id} season={season} year={year} />
                <Battle model={model} season={season} id={id} year={year} teamName={name} races={res.value?.data || []} />
                <RaceRecord model={model} year={year} source={res.value} />
              </>
            )}
          </>
        )}

        <History id={id} name={name} hist={hist} year={year} />
        <About team={team} name={name} />
      </div>
    </Page>
  );
}

/* ───────────────────────── Not found ───────────────────────── */
function Missing({ id, year }: { id: string; year: string }) {
  return (
    <Glass className="state tm-missing rise">
      <span className="display gradient-text">404</span>
      <h3>We couldn't find that team</h3>
      <p>{id ? <>No constructor with the id “{id}” appears in the {year} entry list or in the championship archive.</> : "No team was specified."}</p>
      <Link className="btn primary" to="teams">Browse the {year} teams<ArrowRight /></Link>
    </Glass>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero({ id, team, year, standing, count, points, wins }: {
  id: string; team: TeamT; year: string; standing?: TeamStanding; count: number; points: number | null; wins: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const { reducedMotion } = usePrefs();
  const osReduced = useReducedMotion();
  const still = reducedMotion || !!osReduced;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const carX = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const frontY = useTransform(scrollYProgress, [0, 1], ["0%", "-22%"]);
  const wordX = useTransform(scrollYProgress, [0, 1], ["0%", "-12%"]);
  const tint = teamColor(id);
  const light = isLightColor(tint);
  const media = teamMedia(id, year);
  const name = teamShortName(team.name, year);
  return (
    <section ref={ref} className={cx("tm-hero", light && "light", media ? "has-car" : "no-car")} style={{ "--tint": tint } as CSSProperties}>
      <div className="tm-hero-bg" aria-hidden>
        <span className="tm-hero-sheen" />
        <span className="tm-hero-lines" />
        <motion.span className="tm-hero-word" style={still ? undefined : { x: wordX }}>{media ? name : initials(team.name)}</motion.span>
      </div>
      <div className="tm-hero-inner">
        <div className="tm-hero-copy">
          <Link to="teams" className="tm-back rise"><ArrowLeft size={15} />All teams</Link>
          <div className="tm-hero-id rise" style={{ "--i": 1 } as CSSProperties}>
            <span className="tm-hero-logo"><TeamLogo id={id} name={team.name} year={year} size={media ? 64 : 58} variant={light ? "color" : "white"} /></span>
            <span className="eyebrow tm-hero-eyebrow">{year} constructor</span>
          </div>
          <h1 className={cx("display tm-hero-title rise", name.length > 12 && "long")} style={{ "--i": 2 } as CSSProperties}>{name}</h1>
          <p className="tm-hero-meta rise" style={{ "--i": 3 } as CSSProperties}>
            <Flag nationality={team.nationality} large />
            <span>{team.nationality}{team.name !== name && <small>{team.name}</small>}</span>
          </p>
          <div className="tm-hero-chips rise" style={{ "--i": 4 } as CSSProperties}>
            {standing?.position && <span className="tm-chip"><Trophy size={14} /><b>P{standing.position}</b>{count > 0 && <small>of {count}</small>}</span>}
            {points !== null && <span className="tm-chip"><b>{pts(points)}</b><small>{standing ? "pts" : "pts · classification"}</small></span>}
            {points !== null && <span className="tm-chip"><b>{wins}</b><small>{wins === 1 ? "win" : "wins"}</small></span>}
            <FavoriteButton id={"team:" + id} label={name} className="tm-fav" />
          </div>
        </div>
        {media && (
          <motion.div className="tm-front" style={still ? undefined : { y: frontY }}>
            <CarImage id={id} name={name} year={year} view="front" eager className="tm-front-img" />
            <span className="tm-front-label">{year} challenger · head-on</span>
          </motion.div>
        )}
      </div>
      {media && (
        <motion.div className="tm-hero-car" style={still ? undefined : { x: carX }}>
          <span className="tm-hero-car-streak" aria-hidden />
          <CarImage id={id} name={name} year={year} view="side" eager className="tm-hero-car-img" />
          <span className="tm-hero-car-shadow" aria-hidden />
        </motion.div>
      )}
    </section>
  );
}

/* ───────────────────────── Line-up ───────────────────────── */
function Lineup({ model, loading, error, onRetry, standings: st, year, teamName }: {
  model: SeasonModel; loading: boolean; error?: string; onRetry: () => void; standings?: Standing[]; year: string; teamName: string;
}) {
  if (loading || error || !model.lines.length)
    return (
      <Section title="The drivers">
        <StateView loading={loading} error={error} onRetry={onRetry} empty emptyTitle="No race starts yet" emptyText={`${teamName} hasn't started a Grand Prix in ${year} yet.`}
          skeleton={<div className="tm-duo">{[0, 1].map((i) => <Skeleton key={i} h={400} r={28} />)}</div>} />
      </Section>
    );
  // Current race drivers = whoever drove for the team in its most recent round; stand-ins and
  // former drivers are listed separately with the rounds they drove.
  const latest = Math.max(...model.lines.map((l) => l.lastRound));
  const current = model.lines.filter((l) => l.lastRound === latest);
  const main = (current.length >= 2 ? current : [...current, ...model.lines.filter((l) => l.lastRound !== latest)]).slice(0, 2);
  const others = model.lines.filter((l) => !main.includes(l));
  return (
    <Section title="The drivers" subtitle={others.length ? `${plural(model.lines.length, "driver")} raced for ${teamName} in ${year} — most recent line-up first.` : `${teamName}'s ${year} line-up.`}>
      <div className={cx("tm-duo", main.length === 1 && "solo")}>
        {main.map((l, k) => <DuoCard key={l.driver.driverId} line={l} standing={st?.find((s) => s.Driver.driverId === l.driver.driverId)} year={year} index={k} teamName={teamName} latest={latest} />)}
      </div>
      {others.length > 0 && (
        <div className="tm-also reveal">
          <span className="eyebrow"><Users size={13} />Also drove for {teamName} in {year}</span>
          <div className="tm-also-list">
            {others.map((l) => (
              <Link key={l.driver.driverId} to={"driver/" + l.driver.driverId} className="tm-also-item">
                <DriverAvatar id={l.driver.driverId} name={fullName(l.driver)} year={year} size={34} />
                <span><strong>{fullName(l.driver)}</strong><small>{roundRanges(l.rounds)} · {plural(l.starts, "start")} · {pts(l.racePts + l.sprintPts)} pts</small></span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function DuoCard({ line, standing, year, index, teamName, latest }: { line: Line; standing?: Standing; year: string; index: number; teamName: string; latest: number }) {
  const d = line.driver;
  const name = fullName(d);
  const media = driverMedia(d.driverId, year);
  const variant = media?.front ? "front" : media?.card ? "card" : null;
  const teamPts = line.racePts + line.sprintPts;
  const movedOn = line.lastRound < latest;
  const elsewhere = standing && standing.Constructors.length > 1;
  return (
    <Link to={"driver/" + d.driverId} className="tm-duo-card reveal" style={{ "--i": index } as CSSProperties} aria-label={`${name} — driver profile`}>
      <span className="tm-duo-bg" aria-hidden />
      <NumberArt id={d.driverId} number={d.permanentNumber} year={year} className="tm-duo-num" />
      <span className="tm-duo-photo" aria-hidden={!variant}>
        {variant ? <DriverPortrait id={d.driverId} name={name} year={year} variant={variant} className={cx("tm-duo-img", variant)} /> : <span className="tm-duo-mono">{initials(name)}</span>}
      </span>
      <span className="tm-duo-top">
        {movedOn ? <span className="tm-duo-flag">{roundRanges(line.rounds)}</span> : <span className="tm-duo-flag">{year} line-up</span>}
        <FavoriteButton id={"driver:" + d.driverId} label={name} />
      </span>
      <span className="tm-duo-info">
        <span className="tm-duo-name"><small>{d.givenName}</small><strong>{d.familyName}</strong></span>
        <span className="tm-duo-meta"><Flag nationality={d.nationality} />{d.nationality}{d.code && <i>{d.code}</i>}</span>
        <span className="tm-duo-stats">
          <span><b>{standing ? "P" + standing.position : "–"}</b><small>Drivers'</small></span>
          <span><b>{standing ? pts(standing.points) : pts(teamPts)}</b><small>Points</small></span>
          <span><b>{line.wins}</b><small>{line.wins === 1 ? "Win" : "Wins"}</small></span>
          <span><b>{line.podiums}</b><small>Podiums</small></span>
        </span>
        {elsewhere && <span className="tm-duo-note">{pts(teamPts)} of those points scored with {teamName}</span>}
      </span>
    </Link>
  );
}

/** [1,2,3,7,12,13,14] → "Rounds 1–3, 7, 12–14" */
function roundRanges(rounds: number[]) {
  if (!rounds.length) return "No rounds";
  const parts: string[] = [];
  let start = rounds[0], prev = rounds[0];
  for (const r of [...rounds.slice(1), Infinity]) {
    if (r === prev + 1) { prev = r; continue; }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = prev = r;
  }
  return (rounds.length === 1 ? "Round " : "Rounds ") + parts.join(", ");
}

/* ───────────────────────── Season numbers ───────────────────────── */
function SeasonNumbers({ model, standing, total, points, loading, year, source }: {
  model: SeasonModel; standing?: TeamStanding; total: number; points: number; loading: boolean; year: string; source?: Envelope<Race[]>;
}) {
  if (loading) return <Section title="Season in numbers"><div className="tm-kpis">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={128} r={22} />)}</div></Section>;
  const rounds = model.rounds.length;
  const avg = rounds ? points / rounds : 0;
  const tiles: { icon: ReactNode; label: string; value: ReactNode; detail: string; feature?: boolean }[] = [
    { icon: <Trophy size={14} />, label: "Championship", value: standing?.position ? <>P<Counter value={+standing.position} /></> : "–", detail: standing?.position ? `of ${total} constructors` : +year < 1958 ? "No constructors' title before 1958" : "Not classified", feature: true },
    { icon: <Zap size={14} />, label: "Points", value: <Counter value={points} decimals={dec(points)} />, detail: standing ? "Official constructors' table" : "Summed from classifications", feature: true },
    { icon: <Crown size={14} />, label: "Wins", value: <Counter value={model.wins} />, detail: `from ${plural(model.raceRounds, "Grand Prix", "Grands Prix")}` },
    { icon: <Medal size={14} />, label: "Podiums", value: <Counter value={model.podiums} />, detail: "Podium finishes, both cars" },
    { icon: <Users size={14} />, label: "One-twos", value: <Counter value={model.oneTwos} />, detail: model.oneTwos ? "Races finished 1st and 2nd" : "No one-two finishes yet" },
    { icon: <Target size={14} />, label: "Best result", value: model.best ? "P" + model.best : "–", detail: model.best ? `Achieved ${model.bestCount}×` : "No classified finish" },
    { icon: <CircleSlash size={14} />, label: "DNFs", value: <Counter value={model.dnfs} />, detail: "Retired or not classified" },
    { icon: <Gauge size={14} />, label: "Points per round", value: <Counter value={avg} decimals={1} />, detail: `Average across ${plural(rounds, "round")}` },
  ];
  return (
    <Section title="Season in numbers" subtitle={`${year} · ${plural(rounds, "round")} contested`}>
      <div className="tm-kpis">
        {tiles.map((t, i) => (
          <Glass key={t.label} className={cx("kpi tm-kpi reveal", t.feature && "feature")} style={{ "--i": i } as CSSProperties}>
            <span className="label">{t.icon}{t.label}</span>
            <span className="value">{t.value}</span>
            <span className="detail">{t.detail}</span>
          </Glass>
        ))}
      </div>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── Race-by-race stacked bars ───────────────────────── */
function niceStep(max: number) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 2.5, 5, 10].map((n) => n * mag).find((n) => n >= raw) || raw;
}

function RoundsChart({ model, year }: { model: SeasonModel; year: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { rounds, lines } = model;
  const max = Math.max(1, ...rounds.map((r) => r.total));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  const hr = hover !== null ? rounds[hover] : null;
  const totals = lines.map((l) => l.racePts + l.sprintPts);
  return (
    <Glass className="card tm-bars-card reveal">
      <div className="tm-bars-legend">
        {lines.map((l, k) => (
          <span key={l.driver.driverId} className="tm-legend-item">
            <i className={"tm-c" + Math.min(k, 3)} />
            <DriverAvatar id={l.driver.driverId} name={fullName(l.driver)} year={year} size={26} />
            <span><strong>{l.driver.familyName}</strong><small>{pts(totals[k])} pts</small></span>
          </span>
        ))}
      </div>
      <div
        className="tm-bars"
        role="group"
        aria-label="Points per round by driver"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const d = e.key === "ArrowRight" ? 1 : -1;
            setHover((v) => Math.max(0, Math.min(rounds.length - 1, (v ?? (d > 0 ? -1 : rounds.length)) + d)));
          }
          if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        <div className="tm-bars-plot" style={{ "--n": rounds.length } as CSSProperties}>
          {ticks.map((t) => (
            <span key={t} className="tm-bars-tick" style={{ bottom: `${(t / top) * 100}%` }}><i>{t}</i></span>
          ))}
          {rounds.map((r, i) => (
            <div key={r.round} className={cx("tm-bar-col", hover === i && "on", hover !== null && hover !== i && "dim")} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}
              aria-label={`Round ${r.round}, ${r.raceName}: ${pts(r.total)} points`}>
              <span className="tm-bar-stack" style={{ height: `${(r.total / top) * 100}%`, "--i": i } as CSSProperties}>
                {lines.map((l, k) => {
                  const c = r.cells[l.driver.driverId];
                  const v = c ? c.race + c.sprint : 0;
                  return v > 0 ? <span key={l.driver.driverId} className={"tm-c" + Math.min(k, 3)} style={{ flexGrow: v }} /> : null;
                })}
              </span>
              {r.total === 0 && <span className="tm-bar-zero" />}
            </div>
          ))}
          {hr && hover !== null && (
            <div className="tooltip glass glass-strong tm-tip" style={{ left: `clamp(96px, ${((hover + 0.5) / rounds.length) * 100}%, calc(100% - 96px))`, bottom: `${(hr.total / top) * 100}%` }}>
              <div className="t-title">Round {hr.round} · {shortRace(hr.raceName)}</div>
              {lines.map((l, k) => {
                const c = hr.cells[l.driver.driverId];
                if (!c) return null;
                const finish = c.pos ? (isClassified(c.pos) ? "P" + c.pos : c.pos === "R" ? "DNF" : c.pos === "D" ? "DSQ" : c.pos === "N" ? "NC" : c.status || c.pos) : "";
                return (
                  <div className="t-row" key={l.driver.driverId}>
                    <span><i className={"swatch tm-c" + Math.min(k, 3)} />{l.driver.familyName}{finish && <em className="tm-tip-pos">{finish}</em>}</span>
                    <b>{pts(c.race + c.sprint)}{c.sprint > 0 && <small className="tm-tip-sprint"> ({pts(c.sprint)} spr)</small>}</b>
                  </div>
                );
              })}
              <div className="t-row tm-tip-total"><span>Team</span><b>{pts(hr.total)} pts</b></div>
            </div>
          )}
        </div>
        <div className="tm-bars-axis" style={{ "--n": rounds.length } as CSSProperties} aria-hidden>
          {rounds.map((r, i) => <span key={r.round} className={cx(i % 2 === 1 && "minor", hover === i && "on")}>{r.round}</span>)}
        </div>
      </div>
      <p className="source">Classification points per round (race{+year >= 2021 ? " + sprint" : ""}). Post-race penalties published later may differ from the official table.</p>
    </Glass>
  );
}

/* ───────────────────────── Cumulative vs rivals ───────────────────────── */
function Rivals({ id, season, year }: { id: string; season: string; year: string }) {
  const progress = useSeasonProgress(season, year);
  const ink = useInk();
  const [focus, setFocus] = useState<string | null>(null);
  const p = progress.value?.data;
  const idx = p ? p.teams.findIndex((t) => t.team.constructorId === id) : -1;
  const near = useMemo(() => {
    if (!p || idx < 0) return [];
    const start = Math.max(0, Math.min(idx - 2, p.teams.length - 5));
    return p.teams.slice(start, start + 5);
  }, [p, idx]);
  if (progress.loading || progress.error || !p?.rounds.length || idx < 0) {
    if (!progress.loading && !progress.error) return null;
    return (
      <Section title="The fight around them">
        <StateView loading={progress.loading} error={progress.error} onRetry={progress.reload} skeleton={<Skeleton h={420} r={28} />} />
      </Section>
    );
  }
  const series = near.map((t) => ({ id: t.team.constructorId, name: teamShortName(t.team.name, year), color: ink(teamColor(t.team)), values: t.cumulative }));
  return (
    <Section title="The fight around them" subtitle="Cumulative points against the nearest rivals in the constructors' order.">
      <Glass className="card reveal">
        <div className="tm-rivals-legend">
          {near.map((t) => {
            const me = t.team.constructorId === id;
            return (
              <button key={t.team.constructorId} type="button" className={cx("tm-rival", me && "me", focus && focus !== t.team.constructorId && "dim")} style={{ "--tint": ink(teamColor(t.team)) } as CSSProperties}
                onPointerEnter={() => setFocus(t.team.constructorId)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(t.team.constructorId)} onBlur={() => setFocus(null)}
                aria-label={`${teamShortName(t.team.name, year)}: ${pts(t.cumulative.at(-1) || 0)} points`}>
                <span className="tm-rival-rank">{t.rank.at(-1)}</span>
                <span><strong>{teamShortName(t.team.name, year)}</strong><small>{pts(t.cumulative.at(-1) || 0)} pts</small></span>
              </button>
            );
          })}
        </div>
        <LineChart
          ariaLabel="Cumulative constructors' points of this team and its nearest rivals"
          series={series}
          labels={p.rounds.map((r) => "R" + r.round)}
          tooltipTitle={(i) => `Round ${p.rounds[i].round} · ${shortRace(p.rounds[i].raceName)}`}
          focus={focus}
          onFocus={setFocus}
          height={360}
        />
        <p className="source">Race and sprint classification points summed by round; ranks follow those totals and can differ from the official table where penalties applied.</p>
        <ProgressNote progress={progress.value?.data} kind="constructor" />
        <Source value={progress.value} />
      </Glass>
    </Section>
  );
}

/* ───────────────────────── Intra-team battle ───────────────────────── */
function Battle({ model, season, id, year, teamName, races }: { model: SeasonModel; season: string; id: string; year: string; teamName: string; races: Race[] }) {
  const quali = useData(() => paginate(`${season}/constructors/${id}/qualifying.json`, "QualifyingResults"), [season, id]);
  const [a, b] = model.lines;
  const q = useMemo(() => {
    if (!a || !b) return null;
    let x = 0, y = 0, paired = 0;
    for (const r of quali.value?.data || []) {
      const qa = r.QualifyingResults?.find((v) => v.Driver.driverId === a.driver.driverId);
      const qb = r.QualifyingResults?.find((v) => v.Driver.driverId === b.driver.driverId);
      if (!qa || !qb) continue;
      paired++;
      if (+qa.position < +qb.position) x++;
      else if (+qb.position < +qa.position) y++;
    }
    return { a: x, b: y, paired };
  }, [quali.value, a, b]);
  if (!a || !b)
    return a ? (
      <Section title="Team-mate battle">
        <div className="notice reveal"><Users />Only {fullName(a.driver)} raced for {teamName} in {year}, so there's no team-mate comparison.</div>
      </Section>
    ) : null;

  const h2h = headToHead(races, a.driver.driverId, b.driver.driverId);
  const pa = a.racePts + a.sprintPts, pb = b.racePts + b.sprintPts;
  const avg = (l: Line) => (l.classified ? l.sumPos / l.classified : null);
  type Metric = { label: string; a: number | null; b: number | null; fmt?: (v: number) => string; lower?: boolean };
  const metrics: Metric[] = [
    { label: "Race finishes ahead", a: h2h.a, b: h2h.b },
    ...(q && q.paired ? [{ label: "Qualified ahead", a: q.a, b: q.b }] : []),
    { label: "Points for the team", a: pa, b: pb, fmt: pts },
    { label: "Wins", a: a.wins, b: b.wins },
    { label: "Podiums", a: a.podiums, b: b.podiums },
    { label: "Best finish", a: a.best, b: b.best, fmt: (v) => "P" + v, lower: true },
    { label: "Average finish", a: avg(a), b: avg(b), fmt: (v) => "P" + v.toFixed(1), lower: true },
    { label: "DNFs", a: a.dnfs, b: b.dnfs, lower: true },
  ];
  const share = (m: Metric) => {
    const va = m.a ?? 0, vb = m.b ?? 0;
    if (m.a === null && m.b === null) return [0.5, 0.5];
    if (m.lower) {
      if (m.a === null) return [0, 1];
      if (m.b === null) return [1, 0];
      return va + vb === 0 ? [0.5, 0.5] : [vb / (va + vb), va / (va + vb)];
    }
    return va + vb === 0 ? [0.5, 0.5] : [va / (va + vb), vb / (va + vb)];
  };
  const extra = model.lines.length > 2;
  return (
    <Section title="Team-mate battle" subtitle={`${a.driver.familyName} vs ${b.driver.familyName}${extra ? " — the two drivers with the most recent and most starts" : ""}. Head-to-heads count races both started.`}>
      <div className="tm-battle">
        <Glass className="card tm-tape reveal">
          <div className="tm-tape-head">
            <Link to={"driver/" + a.driver.driverId} className="tm-tape-driver">
              <DriverAvatar id={a.driver.driverId} name={fullName(a.driver)} year={year} size={52} />
              <span><small>{a.driver.givenName}</small><strong>{a.driver.familyName}</strong></span>
            </Link>
            <span className="tm-tape-vs"><Swords size={18} /></span>
            <Link to={"driver/" + b.driver.driverId} className="tm-tape-driver r">
              <span><small>{b.driver.givenName}</small><strong>{b.driver.familyName}</strong></span>
              <DriverAvatar id={b.driver.driverId} name={fullName(b.driver)} year={year} size={52} />
            </Link>
          </div>
          <div className="tm-tape-rows">
            {metrics.map((m, i) => {
              const [sa, sb] = share(m);
              const f = (v: number | null) => (v === null ? "–" : m.fmt ? m.fmt(v) : String(v));
              const winA = sa > sb, winB = sb > sa;
              return (
                <div className="tm-tape-row" key={m.label} style={{ "--i": i } as CSSProperties}>
                  <span className={cx("tm-tape-v", winA && "win")}>{f(m.a)}</span>
                  <div className="tm-tape-mid">
                    <span className="tm-tape-label">{m.label}</span>
                    <div className="tm-tape-bars">
                      <span className="tm-tape-bar l"><i className="tm-c0" style={{ width: `${sa * 100}%` }} /></span>
                      <span className="tm-tape-bar r"><i className="tm-c1" style={{ width: `${sb * 100}%` }} /></span>
                    </div>
                  </div>
                  <span className={cx("tm-tape-v r", winB && "win")}>{f(m.b)}</span>
                </div>
              );
            })}
          </div>
          {quali.loading && <p className="faint xsmall">Loading qualifying head-to-head…</p>}
          <Source value={quali.value?.data.length ? quali.value : undefined} label="Qualifying" />
        </Glass>
        <Glass className="card tm-donut-card reveal" style={{ "--i": 1 } as CSSProperties}>
          <span className="eyebrow">Points split</span>
          <Donut a={pa} b={pb} />
          <div className="tm-donut-legend">
            {[{ l: a, v: pa, k: 0 }, { l: b, v: pb, k: 1 }].map(({ l, v, k }) => (
              <span key={l.driver.driverId}>
                <i className={"tm-c" + k} />
                <strong>{l.driver.familyName}</strong>
                <small>{pts(v)} pts · {pa + pb ? Math.round((v / (pa + pb)) * 100) : 0}%</small>
              </span>
            ))}
          </div>
          {extra && <p className="faint xsmall center">Other drivers scored {pts(model.lines.slice(2).reduce((s, l) => s + l.racePts + l.sprintPts, 0))} pts for the team.</p>}
        </Glass>
      </div>
    </Section>
  );
}

function Donut({ a, b }: { a: number; b: number }) {
  const size = 200, stroke = 22, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = a + b;
  const fa = total ? a / total : 0.5;
  const gap = total && a && b ? 0.012 : 0;
  return (
    <div className="tm-donut" role="img" aria-label={`Points split: ${pts(a)} to ${pts(b)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-3)" strokeWidth={stroke} />
        {total > 0 && (
          <>
            <circle className="tm-donut-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
              style={{ stroke: "var(--c0)", strokeDasharray: `${Math.max(0, fa - gap) * c} ${c}`, transform: "rotate(-90deg)", transformOrigin: "center" }} />
            <circle className="tm-donut-arc b" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
              style={{ stroke: "var(--c1)", strokeDasharray: `${Math.max(0, 1 - fa - gap) * c} ${c}`, transform: `rotate(${-90 + fa * 360}deg)`, transformOrigin: "center" }} />
          </>
        )}
      </svg>
      <span className="tm-donut-center"><b><Counter value={total} decimals={dec(total)} /></b><small>pts</small></span>
    </div>
  );
}

/* ───────────────────────── Race record ───────────────────────── */
function RaceRecord({ model, year, source }: { model: SeasonModel; year: string; source?: Envelope<Race[]> }) {
  const drivers = model.lines;
  const chip = (c?: Cell) => {
    if (!c || !c.pos) return <span className="faint">–</span>;
    const pos = isClassified(c.pos) ? +c.pos : 0;
    const label = pos ? "P" + pos : c.pos === "R" ? "DNF" : c.pos === "D" ? "DSQ" : c.pos === "N" ? "NC" : c.pos === "W" ? "DNS" : c.pos === "F" ? "DNQ" : c.pos;
    return (
      <span className="tm-rec-cell" title={c.status}>
        <span className={cx("pos", pos > 0 && pos <= 3 && "p" + pos, !pos && "tm-rec-out")}>{label}</span>
        {c.race + c.sprint > 0 && <small>+{pts(c.race + c.sprint)}</small>}
      </span>
    );
  };
  return (
    <Section title="Race record" subtitle="Every classification, round by round.">
      <Glass className="card flush reveal">
        <div className="table-wrap tm-rec-wrap">
          <table className="tbl tm-rec">
            <thead>
              <tr>
                <th className="c">Rd</th>
                <th>Grand Prix</th>
                {drivers.map((l) => <th key={l.driver.driverId}>{l.driver.code || l.driver.familyName}</th>)}
                <th className="r">Team pts</th>
              </tr>
            </thead>
            <tbody>
              {model.rounds.map((r) => (
                <tr key={r.round}>
                  <td className="c faint">{r.round}</td>
                  <td>
                    {r.hasRace ? <Link to={"race/" + r.round} className="tm-rec-race"><Flag country={r.country} />{shortRace(r.raceName)}</Link> : <span className="tm-rec-race"><Flag country={r.country} />{shortRace(r.raceName)} <span className="chip yellow">Sprint only</span></span>}
                  </td>
                  {drivers.map((l) => <td key={l.driver.driverId}>{chip(r.cells[l.driver.driverId])}</td>)}
                  <td className="r tm-rec-total">{pts(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Glass>
      <p className="source">“+” shows points from that round{+year >= 2021 ? ", sprint included" : ""}. DNF = retired · NC = not classified · DSQ = disqualified.</p>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── History ───────────────────────── */
function History({ id, name, hist, year }: { id: string; name: string; hist: ReturnType<typeof useData<StandingsList[]>>; year: string }) {
  const ink = useInk();
  const rows = useMemo(() => (hist.value?.data || [])
    .map((l) => ({ season: l.season, s: l.ConstructorStandings?.[0] }))
    .filter((r): r is { season: string; s: TeamStanding } => !!r.s)
    .sort((x, y) => +x.season - +y.season), [hist.value]);
  if (hist.loading) return <Section title="History"><Skeleton h={420} r={28} /></Section>;
  if (hist.error) return <Section title="History"><StateView error={hist.error} onRetry={hist.reload} /></Section>;
  if (!rows.length)
    return (
      <Section title="History">
        <StateView empty emptyTitle="No constructors' standings on record" emptyText={`The constructors' championship began in 1958; ${name} has no classified season in the archive.`} />
      </Section>
    );
  const titles = rows.filter((r) => r.s.position === "1" && +r.season < CURRENT_YEAR);
  const positions = rows.map((r) => +r.s.position).filter((n) => Number.isFinite(n) && n > 0);
  const best = positions.length ? Math.min(...positions) : null;
  const worst = positions.length ? Math.max(...positions) : 1;
  const wins = rows.reduce((s, r) => s + +(r.s.wins || 0), 0);
  const first = +rows[0].season, last = +rows.at(-1)!.season;
  const years = Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
  const bySeason = new Map(rows.map((r) => [r.season, r.s]));
  const values = years.map((y) => { const p = bySeason.get(y)?.position; return p && +p > 0 ? +p : null; });
  const tint = ink(teamColor(id));
  const kpis = [
    { label: "Constructors' titles", value: titles.length, detail: titles.length ? `Last in ${titles.at(-1)!.season}` : "Completed seasons only" },
    { label: "Seasons classified", value: rows.length, detail: `${first}–${last}` },
    { label: "Best finish", value: best, detail: best ? `${rows.filter((r) => +r.s.position === best).length}× in the table` : "", fmt: "P" },
    { label: "Race wins", value: wins, detail: "Across classified seasons" },
  ];
  return (
    <Section title="History" subtitle={`${name} in the constructors' championship since ${first}.${first === 1958 ? " The title was first awarded in 1958." : ""}`}>
      <div className="tm-kpis four">
        {kpis.map((k, i) => (
          <Glass key={k.label} className={cx("kpi tm-kpi reveal", i === 0 && titles.length > 0 && "gold")} style={{ "--i": i } as CSSProperties}>
            <span className="label">{i === 0 ? <Trophy size={14} /> : null}{k.label}</span>
            <span className="value">{k.value === null ? "–" : <>{k.fmt}<Counter value={k.value} /></>}</span>
            <span className="detail">{k.detail}</span>
          </Glass>
        ))}
      </div>
      {titles.length > 0 && (
        <div className="tm-titles reveal">
          {titles.map((t, i) => (
            <Link key={t.season} to={`team/${id}?season=${t.season}`} className="tm-title-chip" style={{ "--i": i } as CSSProperties}><Crown size={13} />{t.season}</Link>
          ))}
        </div>
      )}
      <div className="split tm-history">
        <Glass className="card reveal">
          <div className="card-title"><h3>Championship position by season</h3><span className="eyebrow">Higher is better</span></div>
          {rows.length > 1 ? (
            <LineChart
              ariaLabel={`${name} constructors' championship position by season`}
              series={[{ id: "pos-" + id, name, color: tint, values }]}
              labels={years}
              invert
              yMin={1}
              yMax={Math.max(2, worst)}
              step={worst > 12 ? 5 : worst > 6 ? 2 : 1}
              yFormat={(v) => "P" + v}
              tooltipTitle={(i) => `${years[i]} season${+years[i] >= CURRENT_YEAR ? " · in progress" : ""}`}
              curve={false}
              height={340}
            />
          ) : (
            <p className="muted small">Only one classified season — {rows[0].season}, P{rows[0].s.position}.</p>
          )}
          {years.length > rows.length && <p className="source">Gaps are seasons without a constructors' standings entry.</p>}
        </Glass>
        <Glass className="card flush reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="table-wrap tm-hist-wrap">
            <table className="tbl tm-hist">
              <thead><tr><th>Season</th><th className="c">Pos</th><th className="r">Points</th><th className="r">Wins</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const p = +r.s.position;
                  const live = +r.season >= CURRENT_YEAR;
                  return (
                    <tr key={r.season} className={cx(+r.season === +year && "current")}>
                      <td><Link to={`team/${id}?season=${r.season}`} className="tm-hist-season">{r.season}{live && <span className="chip accent">Live</span>}</Link></td>
                      <td className="c"><span className={cx("pos", p > 0 && p <= 3 && "p" + p)}>{r.s.position || r.s.position === "0" ? r.s.position : "–"}</span></td>
                      <td className="r">{pts(r.s.points)}</td>
                      <td className="r">{r.s.wins}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Glass>
      </div>
      <p className="source">Titles count completed seasons only; the {CURRENT_YEAR} season is still running.</p>
      <Source value={hist.value} />
    </Section>
  );
}

/* ───────────────────────── Wikipedia summary ───────────────────────── */
function About({ team, name }: { team: TeamT; name: string }) {
  const title = team.url ? wikiTitle(team.url) : "";
  const w = useData(() => (title ? wiki(title) : Promise.reject(new Error("No encyclopedia entry linked"))), [title]);
  if (!title) return null;
  const s = w.value?.data;
  return (
    <Section title={`About ${name}`}>
      {w.loading ? (
        <Skeleton h={180} r={28} />
      ) : w.error || !s?.extract ? (
        <div className="notice reveal"><BookOpen />The Wikipedia summary isn't available right now. <a className="link" href={team.url} target="_blank" rel="noopener noreferrer">Read on Wikipedia<ExternalLink /></a></div>
      ) : (
        <Glass className="card tm-about reveal">
          {s.thumbnail?.source && <span className="tm-about-thumb"><Img src={s.thumbnail.source} alt={`${s.title} — illustration from Wikipedia`} /></span>}
          <div className="tm-about-body">
            <span className="eyebrow"><BookOpen size={13} />Encyclopedia</span>
            <h3 className="title-3">{s.title}</h3>
            <p className="tm-about-text">{s.extract}</p>
            <p className="source tm-about-attr">
              Summary from <a href={s.content_urls?.desktop?.page || team.url} target="_blank" rel="noopener noreferrer">Wikipedia</a>, available under CC BY-SA 4.0.
              <a className="link" href={s.content_urls?.desktop?.page || team.url} target="_blank" rel="noopener noreferrer">Full article<ExternalLink /></a>
            </p>
          </div>
        </Glass>
      )}
    </Section>
  );
}
