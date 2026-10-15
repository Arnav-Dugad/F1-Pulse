import { sharedTransition } from "../ui/cards";
import { ProgressNote } from "../ui/progress-note";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Cake, ChevronLeft, ChevronRight, Crown, ExternalLink, Flag as FlagIcon, Gauge, Hash, Medal, MoveRight, Swords, Timer, TrendingUp, Trophy, UserX, Users, Zap } from "lucide-react";
import { allResults, driverCareer, sprintResults, standings, standingsHistory, useData, wiki, wikiTitle, type StandingsList } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { shortRace, useCalendar, useSeasonProgress } from "../lib/season";
import { driverGallery, driverMedia, fullName, initials, isLightColor, MEDIA_SEASON, teamColor, teamOf, teamShortName } from "../lib/media";
import { age, formatDay, hasStarted, ordinal, plural, pts } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo } from "../ui/media";
import { FavoriteButton } from "../ui/cards";
import { LineChart } from "../ui/charts";
import {
  driverInfo, driverQualifying, driverRaces, emptyEnvelope, findTeammate, finishDescription, finishDuel, finishLabel, finishTone,
  isClassified, loadHistoryLite, pairColors, poleCount, qualiDuel, resultTeammates, roundRanges, seasonStats, seasonTeammates, teamStints, TugRow, useParallax,
  type Mate,
} from "./_drivers";
import { Gallery } from "../ui/gallery";
import type { Driver, Race, Result, Standing, Team } from "../types";
import "./driver.css";

type Entry = { race: Race; result: Result };

export default function DriverPage({ route }: { route: Route }) {
  const id = route.parts[1] || "";
  const { season, year } = usePrefs();
  const info = useData(() => driverInfo(id), [id]);
  const ds = useData(() => standings(season), [season]);
  const res = useData(() => allResults(season), [season]);
  const cal = useCalendar(season);
  const progress = useSeasonProgress(season, year);
  const sprints = useData(() => (+year >= 2021 ? sprintResults(season) : Promise.resolve(emptyEnvelope<Race[]>([]))), [season]);
  const quali = useData(() => driverQualifying(season, id), [season, id]);

  const mine = useMemo(() => driverRaces(res.value?.data || [], id), [res.value, id]);
  const driver: Driver | undefined = info.value?.data || mine[0]?.result.Driver;
  const standing = ds.value?.data.find((s) => s.Driver.driverId === id);
  const stints = useMemo(() => teamStints(mine), [mine]);
  // The team from the driver's most recent race this season (Jolpica's Constructors list is not chronological).
  const team: Team | undefined = mine.at(-1)?.result.Constructor || (standing?.Constructors.length === 1 ? standing.Constructors[0] : undefined);
  const mate = useMemo(() => findTeammate(res.value?.data || [], id), [res.value, id]);
  const mateQuali = useData(() => (mate ? driverQualifying(season, mate.driverId) : Promise.resolve(emptyEnvelope<Race[]>([]))), [season, mate?.driverId]);
  const tint = teamColor(team);
  useAmbient(tint);
  useTitle(driver ? fullName(driver) : info.loading || info.error ? "Driver" : "Driver not found");

  if (info.loading && !driver) return <Page className="drv"><Skeleton h="min(82vh, 760px)" r={36} /><div className="drv-kpi-skel"><Skeleton h={150} r={28} /><Skeleton h={150} r={28} /><Skeleton h={150} r={28} /></div></Page>;
  if (!driver) {
    if (info.error) return <Page className="drv"><h1 className="sr-only">Driver profile unavailable</h1><StateView error={info.error} onRetry={info.reload} /></Page>;
    return <NotFound id={id} />;
  }
  const inSeason = mine.length > 0 || !!standing;

  return (
    <Page className="drv">
      <DriverHero driver={driver} team={team} year={year} standing={standing} stints={stints} inSeason={inSeason} loadingSeason={res.loading} firstRace={mine[0]?.race.date} />

      {res.loading || ds.loading ? (
        <Section><div className="drv-kpi-skel"><Skeleton h={190} r={28} /><Skeleton h={190} r={28} /><Skeleton h={190} r={28} /></div></Section>
      ) : res.error && !standing ? (
        <Section title={`The ${year} season`}><StateView error={res.error} onRetry={res.reload} /></Section>
      ) : !inSeason ? (
        <Section title={`The ${year} season`}>
          <Glass className="state">
            <UserX />
            <h3>{driver.givenName} {driver.familyName} didn't race in {year}</h3>
            <p>Pick another season from the season switcher — the career record below covers every year in the archive.</p>
          </Glass>
        </Section>
      ) : (
        <>
          <SeasonKpis entries={mine} standing={standing} total={ds.value?.data.length || 0} quali={quali.value?.data} qualiLoading={quali.loading} year={year} tint={tint} />
          <RaceStrip entries={mine} calendar={cal.value?.data} sprints={sprints.value?.data} driverId={id} year={year} source={res.value} />
          <SeasonCharts driver={driver} mate={mate} progress={progress} tint={tint} />
          <FormCurve entries={mine} sprints={sprints.value?.data} driverId={id} tint={tint} source={res.value} />
          {mate && (
            <TeammateDuel driver={driver} mate={mate} races={res.value?.data || []} quali={quali.value?.data} mateQuali={mateQuali.value?.data} qualiLoading={quali.loading || mateQuali.loading}
              standings={ds.value?.data || []} year={year} />
          )}
          <RaceRecord entries={mine} quali={quali.value?.data} sprints={sprints.value?.data} driverId={id} multiTeam={stints.length > 1} year={year} source={res.value} />
        </>
      )}

      <Career driver={driver} year={year} seasonRaces={res.value?.data} />
      <DriverGallery driver={driver} />
      <Biography driver={driver} />
      <Adjacent id={id} standings={ds.value?.data} year={year} />

      <nav className="drv-foot reveal" aria-label="Related pages">
        <Link to="drivers" className="btn glass-btn"><ArrowLeft />All drivers</Link>
        <Link to={`compare?a=${driver.driverId}${mate ? `&b=${mate.driverId}` : ""}`} className="btn glass-btn"><Swords />Head to head</Link>
        {team && <Link to={"team/" + team.constructorId} className="btn glass-btn">{teamShortName(team.name, year)}<ArrowRight /></Link>}
      </nav>
    </Page>
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <Page className="drv">
      <Glass className="state drv-notfound">
        <span className="drv-notfound-mark" aria-hidden>?</span>
        <h1 className="title-2">We couldn't find that driver</h1>
        <p>No driver with the id “{id || "—"}” exists in the Formula 1 archive. The link may be mistyped or out of date.</p>
        <Link to="drivers" className="btn primary"><ArrowLeft />Browse the grid</Link>
      </Glass>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function DriverHero({ driver, team, year, standing, stints, inSeason, loadingSeason, firstRace }: {
  driver: Driver; team?: Team; year: string; standing?: { position: string; points: string }; stints: ReturnType<typeof teamStints>;
  inSeason: boolean; loadingSeason: boolean; firstRace?: string;
}) {
  const ref = useParallax<HTMLElement>();
  const name = fullName(driver);
  const tint = teamColor(team);
  const photo = !!driverMedia(driver.driverId, year)?.front;
  const currentYear = String(new Date().getFullYear());
  const live = year === currentYear;
  const born = new Date(driver.dateOfBirth + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const others = stints.filter((s) => s.team.constructorId !== team?.constructorId);
  const ageLabel = live && inSeason ? `${age(driver.dateOfBirth)} years old` : firstRace ? `Aged ${age(driver.dateOfBirth, new Date(firstRace + "T12:00:00Z"))} at the ${year} opener` : null;
  return (
    <section ref={ref} className={cx("drv-hero", photo ? "has-photo" : "is-mono", isLightColor(tint) && "light-tint")} style={{ "--tint": tint } as CSSProperties}>
      <div className="drv-hero-bg" aria-hidden />
      <div className="drv-hero-art" aria-hidden={!photo}>
        {photo ? (
          <>
            <NumberArt id={driver.driverId} number={driver.permanentNumber} year={year} className="drv-hero-number" eager />
            <span className="drv-hero-streak" />
            <span className="drv-hero-glow" />
            <DriverPortrait id={driver.driverId} name={name} year={year} variant="front" eager className="drv-hero-photo" style={sharedTransition("driver", driver.driverId)} />
          </>
        ) : (
          <div className="drv-mono">
            <span className="drv-mono-num">{driver.permanentNumber || driver.code || initials(name)}</span>
            <span className="drv-hero-streak" />
            <span className="drv-mono-plate" style={sharedTransition("driver", driver.driverId)}><span>{initials(name)}</span><small>{driver.code || driver.nationality}</small></span>
          </div>
        )}
      </div>
      <div className="drv-hero-copy">
        <span className="eyebrow drv-eyebrow rise">
          <Flag nationality={driver.nationality} />
          {driver.nationality}
          {standing && <> · P{standing.position} in {year}</>}
        </span>
        <h1 className="drv-name rise" style={{ "--i": 1 } as CSSProperties}>
          <span className="drv-given">{driver.givenName}</span>
          <span className="drv-family">{driver.familyName}</span>
        </h1>
        <div className="drv-team-line rise" style={{ "--i": 2 } as CSSProperties}>
          {team ? (
            <Link to={"team/" + team.constructorId} className="drv-team">
              <TeamLogo id={team.constructorId} name={team.name} year={year} size={34} />
              <span><strong>{teamShortName(team.name, year)}</strong><small>{others.length ? "Most recent race" : `${year} team`}</small></span>
            </Link>
          ) : (
            <span className="drv-team muted-team"><span><strong>{loadingSeason ? "Loading season…" : `Not on the ${year} grid`}</strong><small>Career record below</small></span></span>
          )}
          {others.length > 0 && (
            <span className="drv-stints">Also {others.map((s) => `${teamShortName(s.team.name, year)}, ${roundRanges(s.rounds)}`).join(" · ")}</span>
          )}
        </div>
        <ul className="drv-pills rise" style={{ "--i": 3 } as CSSProperties} aria-label="Driver facts">
          {driver.permanentNumber && <li><Hash size={13} /><span>Number</span><b>{driver.permanentNumber}</b></li>}
          {driver.code && <li><span>Code</span><b>{driver.code}</b></li>}
          {ageLabel && <li><Cake size={13} /><b>{ageLabel}</b></li>}
          <li><span>Born</span><b>{born}</b></li>
        </ul>
        <div className="drv-actions rise" style={{ "--i": 4 } as CSSProperties}>
          <Link to={`compare?a=${driver.driverId}`} className="btn lg primary"><Swords />Compare</Link>
          {team && <Link to={"team/" + team.constructorId} className="btn lg glass-btn">Team<ArrowRight /></Link>}
          <FavoriteButton id={"driver:" + driver.driverId} label={name} className="drv-fav" />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Season KPIs ───────────────────────── */
function SeasonKpis({ entries, standing, total, quali, qualiLoading, year, tint }: {
  entries: Entry[]; standing?: { position: string; points: string; wins: string }; total: number; quali?: Race[]; qualiLoading: boolean; year: string; tint: string;
}) {
  const s = seasonStats(entries.map((e) => e.result));
  const poles = quali ? poleCount(quali) : null;
  const pos = standing ? +standing.position : NaN;
  const primary = [
    { label: "Championship", value: Number.isFinite(pos) ? pos : null, prefix: "P", detail: Number.isFinite(pos) ? `of ${total} classified drivers` : "Not classified in the standings", icon: <Trophy size={14} /> },
    { label: "Points", value: standing ? +standing.points : s.racePoints, decimals: standing && !Number.isInteger(+standing.points) ? 1 : 0, detail: standing ? "Official championship total" : "Grand Prix points only", icon: <Gauge size={14} /> },
    { label: "Wins", value: standing ? +standing.wins : s.wins, detail: `from ${plural(s.starts, "start")}`, icon: <FlagIcon size={14} /> },
  ];
  const secondary: { label: string; value: number | null; decimals?: number; prefix?: string; detail: string; signed?: boolean }[] = [
    { label: "Podiums", value: s.podiums, detail: "Top-three Grand Prix finishes" },
    { label: "Poles", value: qualiLoading ? null : poles, detail: quali?.length ? "Qualifying P1 (Grand Prix grid)" : qualiLoading ? "Loading qualifying…" : "No qualifying data published" },
    { label: "Best finish", value: s.best, prefix: "P", detail: s.best ? `${plural(entries.filter((e) => isClassified(e.result) && +e.result.position === s.best).length, "time")}` : "No classified finish" },
    { label: "Avg finish", value: s.avg, decimals: 1, prefix: "P", detail: `Over ${plural(s.classified, "classified finish", "classified finishes")}` },
    { label: "DNFs", value: s.dnfs, detail: "Retired, disqualified or not classified" },
    { label: "Places gained", value: s.gained, signed: true, detail: "Grid to flag, classified finishes" },
    { label: "Points finishes", value: s.pointsFinishes, detail: `in ${plural(s.starts, "Grand Prix", "Grands Prix")}` },
  ];
  return (
    <Section title={`The ${year} season`} subtitle="Race statistics from the published classifications; championship totals include sprints and penalties.">
      <div className="drv-kpis" style={{ "--tint": tint } as CSSProperties}>
        {primary.map((k, i) => (
          <Glass key={k.label} className="drv-kpi primary reveal" style={{ "--i": i } as CSSProperties}>
            <span className="drv-kpi-label">{k.icon}{k.label}</span>
            <span className="drv-kpi-value">{k.value === null ? "—" : <Counter value={k.value} decimals={k.decimals} prefix={k.prefix} />}</span>
            <span className="drv-kpi-detail">{k.detail}</span>
          </Glass>
        ))}
        <Glass className="drv-kpi-grid reveal" style={{ "--i": 3 } as CSSProperties}>
          {secondary.map((k) => (
            <div key={k.label} className="drv-kpi-cell">
              <span className="drv-kpi-label">{k.label}</span>
              <span className="drv-kpi-num">
                {k.value === null ? "—" : <Counter value={k.value} decimals={k.decimals} prefix={k.signed && k.value > 0 ? "+" : k.prefix || ""} />}
              </span>
              <span className="drv-kpi-detail">{k.detail}</span>
            </div>
          ))}
        </Glass>
      </div>
    </Section>
  );
}

/* ───────────────────────── Race strip ───────────────────────── */
function RaceStrip({ entries, calendar, sprints, driverId, year, source }: {
  entries: Entry[]; calendar?: Race[]; sprints?: Race[]; driverId: string; year: string; source?: Parameters<typeof Source>[0]["value"];
}) {
  const strip = useRef<HTMLOListElement>(null);
  const byRound = new Map(entries.map((e) => [e.race.round, e.result]));
  const sprintByRound = new Map((sprints || []).map((r) => [r.round, r.SprintResults?.find((x) => x.Driver.driverId === driverId)]));
  const rounds = calendar?.length ? calendar : entries.map((e) => e.race);
  const lastDone = entries.at(-1)?.race.round;
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".drv-round.latest");
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2;
  }, [lastDone, rounds.length]);
  return (
    <Section title="Race by race" subtitle={`Every round of ${year}. Tap a round for the full classification.`}>
      <Glass className="drv-strip-card reveal">
        <ol className="drv-strip" ref={strip}>
          {rounds.map((race) => {
            const r = byRound.get(race.round);
            const sprint = sprintByRound.get(race.round);
            const future = !r && !hasStarted(race.date, race.time);
            const tone = future ? "future" : finishTone(r);
            return (
              <li key={race.round}>
                <Link to={"race/" + race.round} className={cx("drv-round", tone, race.round === lastDone && "latest")}
                  aria-label={`Round ${race.round}, ${race.raceName}: ${future ? "upcoming" : finishDescription(r)}${sprint ? `; sprint ${finishLabel(sprint)}` : ""}`}>
                  <span className="drv-round-top"><Flag country={race.Circuit.Location.country} /><span>R{race.round}</span></span>
                  <span className={cx("fin-chip", tone)}>{future ? formatDay(race.date) : finishLabel(r)}</span>
                  <span className="drv-round-name">{shortRace(race.raceName)}</span>
                  {sprint ? <span className="drv-round-sprint" title="Sprint result">S · {finishLabel(sprint)}</span> : <span className="drv-round-sprint empty" />}
                  {r && +r.points > 0 && <span className="drv-round-pts">+{pts(r.points)}</span>}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="fin-legend" aria-hidden>
          <span><i className="fin-chip gold" />Win</span>
          <span><i className="fin-chip silver" />P2</span>
          <span><i className="fin-chip bronze" />P3</span>
          <span><i className="fin-chip points" />Points</span>
          <span><i className="fin-chip none" />No points</span>
          <span><i className="fin-chip dnf" />Not classified</span>
          <span><i className="fin-chip future" />Upcoming</span>
        </div>
      </Glass>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── Charts ───────────────────────── */
function SeasonCharts({ driver, mate, progress, tint }: { driver: Driver; mate?: Driver; progress: ReturnType<typeof useSeasonProgress>; tint: string }) {
  const p = progress.value?.data;
  const me = p?.drivers.find((d) => d.driver.driverId === driver.driverId);
  const other = mate ? p?.drivers.find((d) => d.driver.driverId === mate.driverId) : undefined;
  const [ca, cb] = pairColors(tint, other ? teamColor(other.team) : "#8e8e99");
  if (progress.loading || progress.error || !p || !me)
    return (
      <Section title="Form">
        <StateView loading={progress.loading} error={progress.error} onRetry={progress.reload} empty emptyTitle="No completed rounds yet" skeleton={<div className="split even"><Skeleton h={360} r={28} /><Skeleton h={360} r={28} /></div>} />
      </Section>
    );
  const labels = p.rounds.map((r) => "R" + r.round);
  const title = (i: number) => `Round ${p.rounds[i].round} · ${shortRace(p.rounds[i].raceName)}`;
  const series = (key: "finish" | "cumulative") => [
    { id: driver.driverId, name: driver.familyName, color: ca, values: me[key] as (number | null)[] },
    ...(other ? [{ id: other.driver.driverId, name: other.driver.familyName, color: cb, values: other[key] as (number | null)[], dashed: true }] : []),
  ];
  const finishes = me.finish.filter((f): f is number => f !== null);
  const worst = Math.max(20, ...finishes, ...(other?.finish.filter((f): f is number => f !== null) || []));
  return (
    <Section title="Form" subtitle={other ? `Measured against teammate ${fullName(other.driver)} (dashed).` : undefined}>
      <div className="split even">
        <Glass className="card drv-chart reveal">
          <div className="card-title"><h3>Finishing position</h3><span className="eyebrow">Grand Prix</span></div>
          <LineChart ariaLabel={`${driver.familyName}'s finishing position each round${other ? ` compared with ${other.driver.familyName}` : ""}`} series={series("finish")} labels={labels}
            invert yMin={1} yMax={worst} step={5} yFormat={(v) => "P" + Math.round(v)} tooltipTitle={title} height={300} curve={false} />
          <p className="source">Gaps mark rounds without a classified finish.</p>
        </Glass>
        <Glass className="card drv-chart reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="card-title"><h3>Championship points</h3><span className="eyebrow">Cumulative</span></div>
          <LineChart ariaLabel={`${driver.familyName}'s cumulative points${other ? ` compared with ${other.driver.familyName}` : ""}`} series={series("cumulative")} labels={labels} area tooltipTitle={title} height={300} />
          <p className="source">Race and sprint points summed by round; later penalties may differ from the official table.</p>
        </Glass>
      </div>
      <ProgressNote progress={progress.value?.data} kind="driver" />
        <Source value={progress.value} />
    </Section>
  );
}

/* ───────────────────────── Teammate duel ───────────────────────── */
function TeammateDuel({ driver, mate, races, quali, mateQuali, qualiLoading, standings: table, year }: {
  driver: Driver; mate: Driver; races: Race[]; quali?: Race[]; mateQuali?: Race[]; qualiLoading: boolean; standings: { Driver: Driver; points: string; position: string }[]; year: string;
}) {
  const shared = races.filter((r) => {
    const a = r.Results?.find((x) => x.Driver.driverId === driver.driverId), b = r.Results?.find((x) => x.Driver.driverId === mate.driverId);
    return a && b && a.Constructor.constructorId === b.Constructor.constructorId;
  });
  const team = shared.at(-1)?.Results?.find((x) => x.Driver.driverId === driver.driverId)?.Constructor;
  const tint = teamColor(team);
  const [ca, cb] = pairColors(tint, tint);
  const race = finishDuel(shared, driver.driverId, mate.driverId, true);
  const q = quali && mateQuali ? qualiDuel(quali, mateQuali, true) : null;
  const sa = seasonStats(driverRaces(shared, driver.driverId).map((e) => e.result));
  const sb = seasonStats(driverRaces(shared, mate.driverId).map((e) => e.result));
  const pa = table.find((s) => s.Driver.driverId === driver.driverId), pb = table.find((s) => s.Driver.driverId === mate.driverId);
  return (
    <Section title="Teammate battle" subtitle={`${plural(shared.length, "race")} together${team ? ` at ${teamShortName(team.name, year)}` : ""}. The only truly equal comparison in Formula 1.`}
      action={<Link className="btn sm" to={`compare?a=${driver.driverId}&b=${mate.driverId}`}>Full head to head<ArrowRight /></Link>}>
      <Glass className="card drv-duel reveal" style={{ "--a": ca, "--b": cb } as CSSProperties}>
        <div className="drv-duel-head">
          <span className="drv-duel-side">
            <DriverAvatar id={driver.driverId} name={fullName(driver)} year={year} team={team?.constructorId} size={52} />
            <span><small>{driver.givenName}</small><strong>{driver.familyName}</strong></span>
          </span>
          <span className="drv-duel-score" aria-label={`Race finishes ahead: ${race.a} to ${race.b}`}>
            <b>{race.a}</b><i>–</i><b>{race.b}</b>
          </span>
          <Link to={"driver/" + mate.driverId} className="drv-duel-side b">
            <span><small>{mate.givenName}</small><strong>{mate.familyName}</strong></span>
            <DriverAvatar id={mate.driverId} name={fullName(mate)} year={year} team={team?.constructorId} size={52} />
          </Link>
        </div>
        <TugRow label="Race finishes ahead" detail={`${race.paired} shared races`} a={race.a} b={race.b} colorA={ca} colorB={cb} index={0} icon={<FlagIcon />} />
        <TugRow label="Qualifying ahead" detail={qualiLoading ? "Loading qualifying…" : q?.paired ? `${q.paired} shared sessions` : "No qualifying data"} a={q?.paired ? q.a : null} b={q?.paired ? q.b : null} colorA={ca} colorB={cb} index={1} icon={<Timer />} />
        <TugRow label="Championship points" detail="Season total, all teams" a={pa ? +pa.points : null} b={pb ? +pb.points : null} format={pts} colorA={ca} colorB={cb} index={2} icon={<Trophy />} />
        <TugRow label="Podiums" detail="As teammates" a={sa.podiums} b={sb.podiums} colorA={ca} colorB={cb} index={3} icon={<Medal />} />
        <TugRow label="Average finish" detail="Classified finishes" a={sa.avg} b={sb.avg} lower format={(n) => "P" + n.toFixed(1)} colorA={ca} colorB={cb} index={4} icon={<TrendingUp />} />
        <TugRow label="DNFs" detail="Fewer is better" a={sa.dnfs} b={sb.dnfs} lower colorA={ca} colorB={cb} index={5} icon={<Zap />} />
      </Glass>
    </Section>
  );
}

/* ───────────────────────── Race record table ───────────────────────── */
function RaceRecord({ entries, quali, sprints, driverId, multiTeam, year, source }: {
  entries: Entry[]; quali?: Race[]; sprints?: Race[]; driverId: string; multiTeam: boolean; year: string; source?: Parameters<typeof Source>[0]["value"];
}) {
  const q = new Map((quali || []).map((r) => [r.round, r.QualifyingResults?.[0]]));
  const sp = new Map((sprints || []).map((r) => [r.round, r.SprintResults?.find((x) => x.Driver.driverId === driverId)]));
  const hasSprint = [...sp.values()].some(Boolean);
  return (
    <Section title="The race record" subtitle="Grand Prix classification, round by round.">
      <Glass className="card flush reveal">
        <div className="table-wrap">
          <table className="tbl drv-tbl">
            <thead>
              <tr>
                <th>Rd</th><th>Grand Prix</th>{multiTeam && <th>Team</th>}<th className="c">Quali</th><th className="c">Grid</th><th className="c">Finish</th><th className="r">+/−</th>{hasSprint && <th className="c">Sprint</th>}<th className="r">Pts</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map(({ race, result: r }) => {
                const gain = isClassified(r) && +r.grid > 0 ? +r.grid - +r.position : null;
                const qs = q.get(race.round), s = sp.get(race.round);
                return (
                  <tr key={race.round}>
                    <td className="faint">{race.round}</td>
                    <td><Link to={"race/" + race.round} className="drv-tbl-race"><Flag country={race.Circuit.Location.country} />{race.raceName.replace(/ Grand Prix$/, "")}</Link></td>
                    {multiTeam && <td><span className="chip team" style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>{teamShortName(r.Constructor.name, year)}</span></td>}
                    <td className="c">{qs ? "P" + qs.position : "—"}</td>
                    <td className="c">{+r.grid > 0 ? r.grid : <span className="faint" title="Pit-lane start">PL</span>}</td>
                    <td className="c"><span className={cx("fin-chip", finishTone(r))}>{finishLabel(r)}</span></td>
                    <td className={cx("r", gain !== null && gain > 0 && "drv-up", gain !== null && gain < 0 && "drv-down")}>{gain === null ? "—" : gain > 0 ? `+${gain}` : gain}</td>
                    {hasSprint && <td className="c">{s ? <span title={`${pts(s.points)} sprint points`}>{finishLabel(s)}</span> : <span className="faint">—</span>}</td>}
                    <td className="r"><b>{pts(r.points)}</b>{s && +s.points > 0 && <small className="faint"> +{pts(s.points)}</small>}</td>
                    <td className="faint">{r.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Glass>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── Career ───────────────────────── */
type SeasonRow = { season: string; teams: Team[]; position: number | null; points: number; wins: number; entries: number; podiums: number; list?: StandingsList };

function Career({ driver, year, seasonRaces }: { driver: Driver; year: string; seasonRaces?: Race[] }) {
  const career = useData(() => driverCareer(driver.driverId), [driver.driverId]);
  const [mates, setMates] = useState<Map<string, Map<string, Mate[]>> | null>(null);
  useEffect(() => {
    let live = true;
    loadHistoryLite().then((h) => live && setMates(seasonTeammates(h, driver.driverId))).catch(() => live && setMates(new Map()));
    return () => { live = false; };
  }, [driver.driverId]);
  const history = useData(() => standingsHistory("drivers", driver.driverId), [driver.driverId]);
  const currentYear = new Date().getFullYear();

  const data = useMemo(() => {
    const races = career.value?.data || [];
    const lists = history.value?.data || [];
    const bySeason = new Map<string, SeasonRow>();
    for (const race of races) {
      const r = race.Results?.[0];
      if (!r) continue;
      const row = bySeason.get(race.season) || { season: race.season, teams: [], position: null, points: 0, wins: 0, entries: 0, podiums: 0 };
      row.entries++;
      if (isClassified(r) && +r.position <= 3) row.podiums++;
      if (!row.teams.some((t) => t.constructorId === r.Constructor.constructorId)) row.teams.push(r.Constructor);
      bySeason.set(race.season, row);
    }
    for (const l of lists) {
      const s = l.DriverStandings?.[0];
      const row = bySeason.get(l.season) || { season: l.season, teams: s?.Constructors || [], position: null, points: 0, wins: 0, entries: 0, podiums: 0 };
      row.position = s && +s.position ? +s.position : null;
      row.points = s ? +s.points : 0;
      row.wins = s ? +s.wins : 0;
      row.list = l;
      bySeason.set(l.season, row);
    }
    const rows = [...bySeason.values()].sort((a, b) => +a.season - +b.season);
    const results = races.map((r) => r.Results?.[0]).filter((r): r is Result => !!r);
    const titles = rows.filter((r) => r.position === 1 && +r.season < currentYear);
    const best = rows.reduce<number | null>((m, r) => (r.position && (m === null || r.position < m) ? r.position : m), null);
    return {
      rows,
      titles,
      best,
      bestCount: rows.filter((r) => r.position === best).length,
      entries: results.length,
      wins: results.filter((r) => isClassified(r) && +r.position === 1).length,
      podiums: results.filter((r) => isClassified(r) && +r.position <= 3).length,
      points: lists.reduce((s, l) => s + Number(l.DriverStandings?.[0]?.points || 0), 0),
    };
  }, [career.value, history.value, currentYear]);

  const loading = career.loading || history.loading;
  const error = career.error && history.error ? career.error : undefined;
  const tint = teamColor(data.rows.at(-1)?.teams.at(-1));

  return (
    <Section title="Career" subtitle="Every season in the Jolpica archive. Titles count only completed seasons.">
      {loading ? (
        <div className="stack"><div className="drv-kpi-skel"><Skeleton h={130} r={24} /><Skeleton h={130} r={24} /><Skeleton h={130} r={24} /><Skeleton h={130} r={24} /></div><Skeleton h={320} r={28} /></div>
      ) : error ? (
        <StateView error={error} onRetry={() => { career.reload(); history.reload(); }} />
      ) : !data.rows.length ? (
        <StateView empty emptyTitle="No career record yet" emptyText="Career statistics appear after the driver's first classified Grand Prix." />
      ) : (
        <>
          <div className="drv-career-kpis">
            {data.titles.length > 0 && (
              <Glass className="drv-ckpi titles reveal">
                <span className="drv-kpi-label"><Trophy size={14} />World titles</span>
                <span className="drv-ckpi-value"><Counter value={data.titles.length} /></span>
                <span className="drv-kpi-detail">{data.titles.map((t) => t.season).join(" · ")}</span>
              </Glass>
            )}
            {[
              { label: "Seasons", value: data.rows.length, detail: `${data.rows[0].season}–${data.rows.at(-1)!.season}` },
              { label: "Grand Prix entries", value: data.entries, detail: "Published race classifications" },
              { label: "Wins", value: data.wins, detail: data.entries ? `${((data.wins / data.entries) * 100).toFixed(1)}% of entries` : "" },
              { label: "Podiums", value: data.podiums, detail: data.entries ? `${((data.podiums / data.entries) * 100).toFixed(1)}% of entries` : "" },
              { label: "Championship points", value: Math.round(data.points), detail: "Sum of season totals" },
              { label: "Best championship", value: data.best, prefix: "P", detail: data.best ? (data.bestCount > 1 ? `${data.bestCount} times` : data.rows.find((r) => r.position === data.best)?.season || "") : "Never classified" },
            ].map((k, i) => (
              <Glass key={k.label} className="drv-ckpi reveal" style={{ "--i": i + 1 } as CSSProperties}>
                <span className="drv-kpi-label">{k.label}</span>
                <span className="drv-ckpi-value">{k.value === null ? "—" : <Counter value={k.value} prefix={k.prefix} />}</span>
                <span className="drv-kpi-detail">{k.detail}</span>
              </Glass>
            ))}
          </div>

          <CareerRibbon driverId={driver.driverId} rows={data.rows} mates={mates} year={year} seasonRaces={seasonRaces} />
          <TeamTimeline rows={data.rows} />

          {data.rows.some((r) => r.position) && <ChampionshipChart rows={data.rows} tint={tint} />}

          <Glass className="card flush reveal drv-seasons">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Season</th><th>Team</th><th className="c">Pos</th><th className="r">Points</th><th className="r">Wins</th><th className="r">Podiums</th><th className="r">Entries</th></tr></thead>
                <tbody>
                  {[...data.rows].reverse().map((r) => {
                    const champ = r.position === 1 && +r.season < currentYear;
                    const live = +r.season === currentYear;
                    return (
                      <tr key={r.season} className={cx(champ && "drv-champ-row")}>
                        <td><Link to={`driver/${driver.driverId}?season=${r.season}`} className="drv-season-link">{r.season}</Link>{live && <span className="chip accent drv-live-chip">In progress</span>}</td>
                        <td>
                          <span className="drv-season-teams">
                            {r.teams.map((t) => (
                              <Link key={t.constructorId} to={`team/${t.constructorId}?season=${r.season}`} className="drv-season-team" style={{ "--tint": teamColor(t) } as CSSProperties}>
                                <i />{teamShortName(t.name, r.season)}
                              </Link>
                            ))}
                          </span>
                        </td>
                        <td className="c">{r.position ? <span className={cx("pos", r.position <= 3 && "p" + r.position)}>{champ ? <Trophy size={13} aria-label="Champion" /> : null}{r.position}</span> : <span className="faint">—</span>}</td>
                        <td className="r"><b>{pts(r.points)}</b></td>
                        <td className="r">{r.wins}</td>
                        <td className="r">{r.podiums}</td>
                        <td className="r">{r.entries}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Glass>
          <Source value={career.value || history.value} />
        </>
      )}
    </Section>
  );
}

function TeamTimeline({ rows }: { rows: SeasonRow[] }) {
  const spans: { team: Team; from: string; to: string; seasons: number }[] = [];
  for (const row of rows) {
    for (const t of row.teams) {
      const open = spans.find((s) => s.team.constructorId === t.constructorId && +s.to === +row.season - 1);
      if (open) { open.to = row.season; open.seasons++; }
      else spans.push({ team: t, from: row.season, to: row.season, seasons: 1 });
    }
  }
  spans.sort((a, b) => +a.from - +b.from);
  const total = spans.reduce((s, x) => s + x.seasons, 0);
  return (
    <Glass className="card drv-timeline reveal">
      <div className="card-title"><h3>Teams</h3><span className="eyebrow">{plural(new Set(spans.map((s) => s.team.constructorId)).size, "team")}</span></div>
      <div className="drv-tl-bar" role="img" aria-label={spans.map((s) => `${s.team.name} ${s.from}${s.to !== s.from ? "–" + s.to : ""}`).join(", ")}>
        {spans.map((s, i) => (
          <span key={i} style={{ flexGrow: s.seasons, "--tint": teamColor(s.team), "--i": i } as CSSProperties} title={`${s.team.name} · ${s.from}${s.to !== s.from ? "–" + s.to : ""}`} />
        ))}
      </div>
      <ol className="drv-tl-list" style={{ "--n": total } as CSSProperties}>
        {spans.map((s, i) => (
          <li key={i} style={{ "--tint": teamColor(s.team) } as CSSProperties}>
            <Link to={`team/${s.team.constructorId}?season=${s.to}`} className="drv-tl-item">
              <TeamLogo id={s.team.constructorId} name={s.team.name} year={s.to} size={34} />
              <span><strong>{teamShortName(s.team.name, s.to)}</strong><small>{s.from === s.to ? s.from : `${s.from}–${s.to}`} · {plural(s.seasons, "season")}</small></span>
            </Link>
          </li>
        ))}
      </ol>
    </Glass>
  );
}

function ChampionshipChart({ rows, tint }: { rows: SeasonRow[]; tint: string }) {
  const first = +rows[0].season, last = +rows.at(-1)!.season;
  const bySeason = new Map(rows.map((r) => [+r.season, r]));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const values = years.map((y) => bySeason.get(y)?.position ?? null);
  const worst = Math.max(10, ...values.filter((v): v is number => v !== null));
  return (
    <Glass className="card drv-chart reveal">
      <div className="card-title"><h3>Championship finishing position</h3><span className="eyebrow">By season</span></div>
      <LineChart ariaLabel="Championship position in each season of the driver's career" series={[{ id: "pos", name: "Championship", color: tint, values }]} labels={years.map(String)}
        invert yMin={1} yMax={worst} step={worst > 15 ? 5 : 2} yFormat={(v) => ordinal(Math.round(v))} curve={false} height={260}
        tooltipTitle={(i) => `${years[i]}${bySeason.get(years[i])?.teams.length ? " · " + bySeason.get(years[i])!.teams.map((t) => teamShortName(t.name, String(years[i]))).join(" / ") : " · no entries"}`} />
      <p className="source">Gaps are seasons without a championship classification. The current season reflects the standings to date.</p>
    </Glass>
  );
}

/* ───────────────────────── Biography ───────────────────────── */
function Biography({ driver }: { driver: Driver }) {
  const title = wikiTitle(driver.url);
  const bio = useData(() => wiki(title), [title]);
  const summary = bio.value?.data;
  // Official 2026 photography covers the current grid; Wikipedia imagery is only used for drivers outside it.
  const thumb = !driverMedia(driver.driverId, "2026") ? summary?.thumbnail?.source : undefined;
  const page = summary?.content_urls?.desktop?.page || driver.url;
  if (!title) return null;
  return (
    <Section title="Biography">
      {bio.loading ? (
        <Skeleton h={200} r={28} />
      ) : bio.error || !summary?.extract ? (
        <p className="notice"><BookOpen />The Wikipedia summary couldn't be loaded right now. <a className="link" href={driver.url} target="_blank" rel="noopener noreferrer">Read on Wikipedia<ExternalLink /></a></p>
      ) : (
        <Glass className={cx("card drv-bio reveal", thumb && "with-thumb")}>
          {thumb && (
            <figure className="drv-bio-thumb">
              <Img src={thumb} alt={fullName(driver)} />
              <figcaption>Image via Wikipedia</figcaption>
            </figure>
          )}
          <div className="drv-bio-copy">
            <p className="drv-bio-text">{summary.extract}</p>
            <p className="drv-bio-attr">
              <BookOpen size={14} />
              <span>From Wikipedia, the free encyclopedia · text under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></span>
              <a className="link" href={page} target="_blank" rel="noopener noreferrer">Full article<ExternalLink /></a>
            </p>
          </div>
        </Glass>
      )}
    </Section>
  );
}

/* ───────────────────────── Form curve ───────────────────────── */
const WINDOW = 5;
function FormCurve({ entries, sprints, driverId, tint, source }: {
  entries: Entry[]; sprints?: Race[]; driverId: string; tint: string; source?: Parameters<typeof Source>[0]["value"];
}) {
  const sprintPts = new Map((sprints || []).map((r) => [r.round, Number(r.SprintResults?.find((x) => x.Driver.driverId === driverId)?.points || 0)]));
  const perRound = entries.map((e) => Number(e.result.points || 0) + (sprintPts.get(e.race.round) || 0));
  if (perRound.length < 2)
    return (
      <Section id="form-curve" title="Form curve">
        <StateView empty emptyTitle="Not enough races yet" emptyText="The rolling form curve needs at least two Grand Prix starts this season." />
      </Section>
    );
  const rolling = perRound.map((_, i) => {
    const slice = perRound.slice(Math.max(0, i - WINDOW + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
  const lastAvg = rolling.at(-1)!;
  const prevIdx = rolling.length - 1 - WINDOW;
  const prevAvg = prevIdx >= 0 ? rolling[prevIdx] : rolling[0];
  const delta = lastAvg - prevAvg;
  const trend = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
  const seasonAvg = perRound.reduce((s, v) => s + v, 0) / perRound.length;
  const span = Math.min(WINDOW, perRound.length);
  const Arrow = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : MoveRight;
  const labels = entries.map((e) => "R" + e.race.round);
  return (
    <Section id="form-curve" title="Form curve" subtitle={`Rolling ${WINDOW}-race average of points scored (Grand Prix + sprint), across the races ${entries[0].result.Driver.familyName} started.`}>
      <div className="drv-form">
        <Glass className={cx("card drv-form-kpi reveal", trend)} style={{ "--tint": tint } as CSSProperties}>
          <span className="drv-kpi-label"><TrendingUp size={14} />Last {plural(span, "race")}</span>
          <span className="drv-form-value"><Counter value={lastAvg} decimals={1} /><small>pts / race</small></span>
          <span className={cx("drv-form-trend", trend)} aria-label={`Trend ${trend === "flat" ? "level" : trend}: ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} points per race`}>
            <Arrow size={18} />{trend === "flat" ? "Holding steady" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} vs ${prevIdx >= 0 ? `the ${WINDOW} races before` : "the opening race"}`}
          </span>
          <span className="drv-kpi-detail">Season average {seasonAvg.toFixed(1)} pts per race · {plural(perRound.length, "start")}</span>
        </Glass>
        <Glass className="card drv-chart reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="card-title"><h3>Points per race</h3><span className="eyebrow">Rolling {WINDOW}-race average</span></div>
          <LineChart ariaLabel={`Rolling ${WINDOW}-race points average and points per race`} labels={labels} height={260} area
            series={[
              { id: "rolling", name: `${WINDOW}-race average`, color: tint, values: rolling },
              { id: "race", name: "That round", color: "#8e8e99", values: perRound, dashed: true },
            ]}
            yFormat={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
            tooltipTitle={(i) => `Round ${entries[i].race.round} · ${shortRace(entries[i].race.raceName)}`} />
          <p className="source">Classification points as published; later penalties may differ from the official table. Rounds the driver did not start are skipped.</p>
        </Glass>
      </div>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── Career ribbon ───────────────────────── */
function CareerRibbon({ driverId, rows, mates, year, seasonRaces }: {
  driverId: string; rows: SeasonRow[]; mates: Map<string, Map<string, Mate[]>> | null; year: string; seasonRaces?: Race[];
}) {
  const strip = useRef<HTMLOListElement>(null);
  const currentYear = new Date().getFullYear();
  const live = useMemo(() => (seasonRaces?.length ? resultTeammates(seasonRaces, driverId) : null), [seasonRaces, driverId]);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".drv-rb-season.current") || (strip.current?.lastElementChild as HTMLElement | null);
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2;
  }, [rows.length, year]);
  const matesOf = (r: SeasonRow): Mate[] => {
    const fromSnap = mates?.get(r.season);
    const byTeam = fromSnap || (r.season === year && live ? live : null);
    if (!byTeam) return [];
    const seen = new Map<string, Mate>();
    for (const t of r.teams) for (const m of byTeam.get(t.constructorId) || []) seen.set(m.driverId, m);
    return [...seen.values()];
  };
  return (
    <Glass className="card drv-ribbon reveal">
      <div className="card-title"><h3>Career timeline</h3><span className="eyebrow">{plural(rows.length, "season")} · tap a season</span></div>
      <ol className="drv-rb" ref={strip} aria-label="Seasons">
        {rows.map((r, i) => {
          const champ = r.position === 1 && +r.season < currentYear;
          const colors = r.teams.map((t) => teamColor(t));
          const list = matesOf(r);
          const known = !!mates?.get(r.season) || (r.season === year && !!live);
          return (
            <li key={r.season} className={cx("drv-rb-season", r.season === year && "current", champ && "champ")} style={{ "--i": Math.min(i, 14), "--band": colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : colors[0] || "var(--fill-2)" } as CSSProperties}>
              <Link to={`driver/${driverId}?season=${r.season}`} className="drv-rb-card" aria-current={r.season === year ? "page" : undefined}
                aria-label={`${r.season}: ${r.teams.map((t) => teamShortName(t.name, r.season)).join(" and ")}${r.position ? `, P${r.position} in the championship` : ""}, ${plural(r.wins, "win")}, ${plural(r.podiums, "podium")}`}>
                <span className="drv-rb-band" aria-hidden />
                <span className="drv-rb-top">
                  <span className="drv-rb-year">{r.season}</span>
                  {champ ? <span className="drv-rb-crown" title="World champion"><Crown size={13} /></span> : +r.season === currentYear ? <span className="drv-rb-live">Live</span> : null}
                </span>
                <span className="drv-rb-logos">
                  {r.teams.map((t) => <TeamLogo key={t.constructorId} id={t.constructorId} name={t.name} year={r.season} size={30} />)}
                  <span className="drv-rb-team">{r.teams.map((t) => teamShortName(t.name, r.season)).join(" / ") || "—"}</span>
                </span>
                <span className="drv-rb-pos"><b>{r.position ? "P" + r.position : "—"}</b><small>Championship</small></span>
                <span className="drv-rb-stats"><span><b>{r.wins}</b> W</span><span><b>{r.podiums}</b> Pod</span><span><b>{r.entries}</b> GP</span></span>
                <span className="drv-rb-mates">
                  <Users size={11} />
                  {list.length ? (
                    <>{list.slice(0, 2).map((m) => m.familyName).join(", ")}{list.length > 2 && <i> +{list.length - 2}</i>}</>
                  ) : <i>{known ? "No team-mate classified" : mates === null ? "…" : "—"}</i>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="source">Logos are season-appropriate where official imagery exists (monograms otherwise). Team-mates are drivers classified in that season's standings for the same constructor.</p>
    </Glass>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */
function DriverGallery({ driver }: { driver: Driver }) {
  const images = driverGallery(driver.driverId);
  if (!images.length) return null;
  return (
    <Section id="gallery" title="Trackside gallery" subtitle={`${fullName(driver)} on track · ${MEDIA_SEASON} season photography`}>
      <Gallery images={images} label={`${fullName(driver)} trackside photos`} />
    </Section>
  );
}

/* ───────────────────────── Previous / next ───────────────────────── */
function Adjacent({ id, standings: table, year }: { id: string; standings?: Standing[]; year: string }) {
  const idx = table?.findIndex((s) => s.Driver.driverId === id) ?? -1;
  if (!table || idx < 0) return null;
  const prev = table[idx - 1], next = table[idx + 1];
  if (!prev && !next) return null;
  const card = (s: Standing, dir: "prev" | "next") => {
    const team = teamOf(s, year);
    return (
      <Link to={"driver/" + s.Driver.driverId} className={cx("drv-adj", dir)} data-swipe={dir} style={{ "--tint": teamColor(team) } as CSSProperties}
        aria-label={`${dir === "prev" ? "Previous" : "Next"} in the championship: P${s.position} ${fullName(s.Driver)}`}>
        {dir === "prev" && <ChevronLeft className="drv-adj-chev" />}
        <DriverAvatar id={s.Driver.driverId} name={fullName(s.Driver)} year={year} team={team?.constructorId} size={44} />
        <span className="drv-adj-text"><small>{dir === "prev" ? "Previous" : "Next"} · P{s.position}</small><strong>{fullName(s.Driver)}</strong></span>
        {dir === "next" && <ChevronRight className="drv-adj-chev" />}
      </Link>
    );
  };
  return (
    <nav className="drv-adjacent reveal" aria-label={`Championship order, ${year}`}>
      {prev ? card(prev, "prev") : <span />}
      {next ? card(next, "next") : <span />}
    </nav>
  );
}
