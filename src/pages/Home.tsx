import { ProgressNote } from "../ui/progress-note";
import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CalendarPlus, Check, Clock, Flag as FlagIcon, Timer, Trophy, Zap } from "lucide-react";
import { allResults, news, standings, teamStandings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { buildCalendar, weekendSessions } from "../domain.mjs";
import { shortRace, splitCalendar, useCalendar, useSeasonProgress } from "../lib/season";
import { circuitMedia, driverMedia, fullName, teamColor, teamOf, teamShortName } from "../lib/media";
import { countdown, download, formatClock, formatDateRange, formatWeekday, hasStarted, plural, pts, relativeTime, sessionDate, timezoneLabel } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo, TrackMap } from "../ui/media";
import { DriverCard, RaceCard } from "../ui/cards";
import { Bar, LineChart, Ring } from "../ui/charts";
import type { Race, Result } from "../types";
import "./home.css";

export default function Home(_: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle("");
  const cal = useCalendar(season);
  const ds = useData(() => standings(season), [season]);
  const cs = useData(() => teamStandings(season), [season]);
  const results = useData(() => allResults(season), [season]);
  const progress = useSeasonProgress(season, year);
  const now = useNow(60_000);
  const list = cal.value?.data || [];
  const { next } = splitCalendar(list, now);
  const latestRace = [...(results.value?.data || [])].reverse().find((r) => r.Results?.length);
  const latest = useMemo(() => new Map((progress.value?.data.drivers || []).map((d) => [d.driver.driverId, d.team.constructorId])), [progress.value]);
  const top = ds.value?.data || [];
  useAmbient(teamColor(top[0] && teamOf(top[0], year, latest)), teamColor(top[1] && teamOf(top[1], year, latest)));
  const topColors = top.slice(0, 3).map((s) => teamColor(teamOf(s, year, latest)));
  const winners = useMemo(() => {
    const m = new Map<string, Result>();
    for (const r of results.value?.data || []) {
      const w = r.Results?.find((x) => x.position === "1");
      if (w) m.set(r.round, w);
    }
    return m;
  }, [results.value]);

  return (
    <Page className="home">
      {cal.loading ? (
        <Skeleton h="min(78vh, 720px)" r={36} />
      ) : cal.error ? (
        <StateView error={cal.error} onRetry={cal.reload} />
      ) : next ? (
        <NextRaceHero race={next} total={list.length} cars={topColors} />
      ) : (
        <SeasonHero year={year} leader={ds.value?.data[0]} latestTeams={latest} latest={latestRace} complete={!!list.length} />
      )}

      {next && <WeekendStrip race={next} />}

      <Section title={latestRace ? "Latest result" : "Results"} subtitle={latestRace ? `${latestRace.raceName} · Round ${latestRace.round}` : undefined}
        action={latestRace && <Link className="btn sm" to={"race/" + latestRace.round}>Full classification<ArrowRight /></Link>}>
        {results.loading ? <Skeleton h={460} r={32} /> : latestRace ? <Podium race={latestRace} year={year} /> : <StateView empty emptyTitle="No races yet" emptyText="The season hasn't started. Results appear here moments after each chequered flag." />}
        <Source value={results.value} />
      </Section>

      <Section title="Championship" subtitle={progress.value?.data.rounds.length ? `After ${plural(progress.value.data.rounds.length, "round")}` : undefined}
        action={<Link className="btn sm" to="standings">Standings & season story<ArrowRight /></Link>}>
        <div className="split even">
          <DriverTable data={ds.value?.data} loading={ds.loading} error={ds.error} year={year} latest={latest} />
          <TeamTable data={cs.value?.data} loading={cs.loading} error={cs.error} year={year} />
        </div>
        <Source value={ds.value} />
      </Section>

      <Section title="The title fight" subtitle="Cumulative points, race by race — hover or use arrow keys to scrub.">
        <TitleFight progress={progress} />
      </Section>

      <Section title="Season at a glance">
        <SeasonPulse races={list} progress={progress.value?.data} winners={winners} />
      </Section>

      {ds.value?.data.length ? (
        <Section title="Meet the grid" subtitle={`The ${year} championship order`} action={<Link className="btn sm" to="drivers">All drivers<ArrowRight /></Link>}>
          <div className="rail" style={{ "--col": "minmax(220px, 250px)" } as CSSProperties}>
            {ds.value.data.slice(0, 12).map((s, i) => (
              <DriverCard key={s.Driver.driverId} driver={s.Driver} team={teamOf(s, year, latest)} year={year} rank={+s.position} stat={pts(s.points)} statLabel="PTS" index={i} />
            ))}
          </div>
        </Section>
      ) : null}

      {next && (
        <Section title="Coming up" action={<Link className="btn sm" to="calendar">Full calendar<ArrowRight /></Link>}>
          <div className="grid" style={{ "--min": "260px" } as CSSProperties}>
            {list.filter((r) => +r.round >= +next.round).slice(0, 4).map((r, i) => (
              <RaceCard key={r.round} race={r} next={r.round === next.round} index={i} compact />
            ))}
          </div>
        </Section>
      )}

      <Headlines />
    </Page>
  );
}

/* ───────────────────────── Hero: next race ───────────────────────── */
function NextRaceHero({ race, total, cars }: { race: Race; total: number; cars: string[] }) {
  const { timezone } = usePrefs();
  const media = circuitMedia(race.Circuit.circuitId);
  const start = race.FirstPractice?.date || race.SprintQualifying?.date || race.date;
  const target = sessionDate(race.date, race.time).getTime();
  const live = hasStarted(race.date, race.time);
  return (
    <section className="hero">
      <div className="hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="hero-scrim" />
      </div>
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="eyebrow hero-eyebrow rise"><span className="dot live" />{live ? "Race day" : "Next Grand Prix"} · Round {race.round} of {total}</span>
          <h1 className="display hero-title rise" style={{ "--i": 1 } as CSSProperties}>
            {race.raceName.replace(/ Grand Prix$/, "")}
            <span>Grand Prix</span>
          </h1>
          <p className="hero-place rise" style={{ "--i": 2 } as CSSProperties}>
            <Flag country={race.Circuit.Location.country} large />
            <span>{race.Circuit.circuitName}<small>{race.Circuit.Location.locality} · {formatDateRange(start, race.date)}</small></span>
          </p>
          <div className="rise" style={{ "--i": 3 } as CSSProperties}>
            <Countdown target={target} />
            <p className="hero-start">
              <Clock size={14} />Lights out {formatWeekday(race.date, race.time, timezone)} {formatClock(race.date, race.time, timezone)} · {timezoneLabel(timezone)}
            </p>
          </div>
          <div className="hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
            <Link className="btn lg primary" to={"race/" + race.round}>Race weekend<ArrowRight /></Link>
            <button className="btn lg glass-btn" onClick={() => download(`f1-pulse-${race.season}-r${race.round}.ics`, buildCalendar([race], true), "text/calendar;charset=utf-8")}>
              <CalendarPlus />Add to calendar
            </button>
          </div>
        </div>
        <Link to={"circuit/" + race.Circuit.circuitId} className="hero-track" aria-label={`${race.Circuit.circuitName} circuit guide`}>
          <TrackMap circuitId={race.Circuit.circuitId} cars={cars} label={`${race.Circuit.circuitName} layout`} />
          <span className="hero-track-label">Circuit guide <ArrowRight size={14} /></span>
        </Link>
      </div>
    </section>
  );
}

function Digit({ value }: { value: string }) {
  return (
    <span className="digit">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={value} initial={{ y: "-70%", opacity: 0, filter: "blur(4px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: "70%", opacity: 0, filter: "blur(4px)" }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Countdown({ target }: { target: number }) {
  const now = useNow(1000);
  const c = countdown(target, now);
  if (c.done) return <div className="countdown done"><span className="chip accent"><span className="live-dot" />Lights out — race underway or complete</span></div>;
  const units: [number, string][] = [[c.days, "days"], [c.hours, "hrs"], [c.minutes, "min"], [c.seconds, "sec"]];
  return (
    <div className="countdown" role="timer" aria-label={`${c.days} days, ${c.hours} hours, ${c.minutes} minutes until lights out`}>
      {units.map(([v, label]) => (
        <div className="cd-unit" key={label}>
          <span className="cd-value" aria-hidden>{String(v).padStart(2, "0").split("").map((d, i) => <Digit key={i} value={d} />)}</span>
          <span className="cd-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Hero: season (no upcoming race) ───────────────────────── */
function SeasonHero({ year, leader, latest, latestTeams, complete }: { year: string; latestTeams: Map<string, string>; leader?: { Driver: any; Constructors: any[]; points: string; wins: string }; latest?: Race; complete: boolean }) {
  const team = leader && teamOf(leader, year, latestTeams);
  const media = circuitMedia(latest?.Circuit.circuitId);
  return (
    <section className="hero season-hero" style={{ "--tint": teamColor(team) } as CSSProperties}>
      <div className="hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="hero-scrim" />
      </div>
      <div className="hero-inner">
        <div className="hero-copy">
          <span className="eyebrow hero-eyebrow rise"><Trophy size={14} />{complete ? `${year} World Champion` : `${year} season`}</span>
          {leader ? (
            <>
              <h1 className="display hero-title rise" style={{ "--i": 1 } as CSSProperties}>{leader.Driver.givenName}<span>{leader.Driver.familyName}</span></h1>
              <p className="hero-place rise" style={{ "--i": 2 } as CSSProperties}>
                <Flag nationality={leader.Driver.nationality} large />
                <span>{team ? teamShortName(team.name, year) : ""}<small>{pts(leader.points)} points · {plural(+leader.wins, "win")}</small></span>
              </p>
              <div className="hero-actions rise" style={{ "--i": 3 } as CSSProperties}>
                <Link className="btn lg primary" to="standings">Final standings<ArrowRight /></Link>
                <Link className="btn lg glass-btn" to={"driver/" + leader.Driver.driverId}>Driver profile</Link>
              </div>
            </>
          ) : (
            <h1 className="display hero-title rise">The {year} season<span>is loading</span></h1>
          )}
        </div>
        {leader && (
          <div className="hero-champion">
            <DriverPortrait id={leader.Driver.driverId} name={fullName(leader.Driver)} year={year} eager className="hero-champion-photo" />
            <NumberArt id={leader.Driver.driverId} number={leader.Driver.permanentNumber} year={year} className="hero-champion-number" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Weekend schedule ───────────────────────── */
function WeekendStrip({ race }: { race: Race }) {
  const { timezone } = usePrefs();
  const now = useNow(30_000);
  const sessions = weekendSessions(race);
  const nextIndex = sessions.findIndex((s) => sessionDate(s.date, s.time).getTime() > now);
  return (
    <Glass className="weekend reveal">
      <div className="weekend-head">
        <span className="eyebrow"><Timer size={14} />Weekend schedule</span>
        <span className="faint small">Times in {timezoneLabel(timezone)}</span>
      </div>
      <ol className="weekend-list">
        {sessions.map((s, i) => {
          const done = nextIndex === -1 || i < nextIndex;
          return (
            <li key={s.label} className={cx("session", done && "done", i === nextIndex && "next", s.label === "Grand Prix" && "gp")}>
              <span className="session-day">{formatWeekday(s.date, s.time, timezone)}</span>
              <strong>{s.label}</strong>
              <span className="session-time">{done ? <><Check size={13} />Done</> : formatClock(s.date, s.time, timezone)}</span>
              {i === nextIndex && <span className="session-next">Next · {relativeTime(sessionDate(s.date, s.time).toISOString(), now)}</span>}
            </li>
          );
        })}
      </ol>
    </Glass>
  );
}

/* ───────────────────────── Podium ───────────────────────── */
function Podium({ race, year }: { race: Race; year: string }) {
  const top = (race.Results || []).slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const fastest = race.Results?.find((r) => r.FastestLap?.rank === "1");
  const media = circuitMedia(race.Circuit.circuitId);
  return (
    <Glass className="podium-card reveal">
      <div className="podium-bg">{media.hero && <Img src={media.hero} alt="" />}</div>
      <div className="podium-head">
        <div className="row">
          <Flag country={race.Circuit.Location.country} large />
          <div>
            <strong className="title-3">{race.raceName}</strong>
            <p className="muted small">{race.Circuit.circuitName} · {new Date(race.date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
          </div>
        </div>
        {fastest && (
          <span className="chip purple"><Zap />Fastest lap · {fastest.Driver.familyName} {fastest.FastestLap?.Time.time}</span>
        )}
      </div>
      <div className="podium">
        {order.map((r) => {
          const p = +r.position;
          const tint = teamColor(r.Constructor);
          return (
            <Link key={r.Driver.driverId} to={"driver/" + r.Driver.driverId} className={cx("step", `p${p}`)} style={{ "--tint": tint } as CSSProperties}>
              <span className="step-figure">
                {driverMedia(r.Driver.driverId, year)?.front ? (
                  <DriverPortrait id={r.Driver.driverId} name={fullName(r.Driver)} year={year} variant="front" className="step-photo" />
                ) : (
                  <span className="step-fallback"><DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={p === 1 ? 132 : 108} /></span>
                )}
              </span>
              <span className="step-block">
                <span className="step-pos">{p}</span>
                <span className="step-name"><small>{r.Driver.givenName}</small>{r.Driver.familyName}</span>
                <span className="step-team"><TeamLogo id={r.Constructor.constructorId} name={r.Constructor.name} year={year} size={20} variant="white" />{teamShortName(r.Constructor.name, year)}</span>
                <span className="step-time">{p === 1 ? r.Time?.time || r.status : r.Time?.time || r.status}</span>
                <span className="step-pts">+{pts(r.points)} pts</span>
              </span>
            </Link>
          );
        })}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Standings tables ───────────────────────── */
function DriverTable({ data, loading, error, year, latest }: { latest: Map<string, string>; data?: { position: string; points: string; wins: string; Driver: any; Constructors: any[] }[]; loading: boolean; error?: string; year: string }) {
  if (loading || error || !data?.length) return <StateView loading={loading} error={error} empty emptyTitle="No standings yet" skeleton={<Skeleton h={520} r={28} />} />;
  const max = +data[0].points || 1;
  return (
    <Glass className="card standings-card reveal">
      <div className="card-title"><h3>Drivers</h3><span className="eyebrow">Points</span></div>
      <div className="list">
        {data.slice(0, 10).map((s, i) => {
          const team = teamOf(s, year, latest);
          return (
            <Link key={s.Driver.driverId} to={"driver/" + s.Driver.driverId} className="list-row standing-row" style={{ "--tint": teamColor(team) } as CSSProperties}>
              <span className={cx("pos", +s.position <= 3 && "p" + s.position)}>{s.position}</span>
              <DriverAvatar id={s.Driver.driverId} name={fullName(s.Driver)} year={year} team={team?.constructorId} size={38} />
              <span className="sr-main">
                <strong>{fullName(s.Driver)}</strong>
                <Bar value={+s.points} max={max} color={teamColor(team)} index={i} />
              </span>
              <span className="sr-points"><b>{pts(s.points)}</b>{i > 0 && <small>−{pts(max - +s.points)}</small>}</span>
            </Link>
          );
        })}
      </div>
    </Glass>
  );
}

function TeamTable({ data, loading, error, year }: { data?: { position: string; points: string; wins: string; Constructor: any }[]; loading: boolean; error?: string; year: string }) {
  if (loading || error || !data?.length) return <StateView loading={loading} error={error} empty emptyTitle="No constructors' standings" emptyText="The constructors' championship began in 1958." skeleton={<Skeleton h={520} r={28} />} />;
  const max = +data[0].points || 1;
  return (
    <Glass className="card standings-card reveal" style={{ "--i": 1 } as CSSProperties}>
      <div className="card-title"><h3>Constructors</h3><span className="eyebrow">Points</span></div>
      <div className="list">
        {data.slice(0, 10).map((s, i) => (
          <Link key={s.Constructor.constructorId} to={"team/" + s.Constructor.constructorId} className="list-row standing-row">
            <span className={cx("pos", +s.position <= 3 && "p" + s.position)}>{s.position}</span>
            <TeamLogo id={s.Constructor.constructorId} name={s.Constructor.name} year={year} size={38} />
            <span className="sr-main">
              <strong>{teamShortName(s.Constructor.name, year)}</strong>
              <Bar value={+s.points} max={max} color={teamColor(s.Constructor)} index={i} />
            </span>
            <span className="sr-points"><b>{pts(s.points)}</b>{i > 0 && <small>−{pts(max - +s.points)}</small>}</span>
          </Link>
        ))}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Title fight chart ───────────────────────── */
function TitleFight({ progress }: { progress: ReturnType<typeof useSeasonProgress> }) {
  const [focus, setFocus] = useState<string | null>(null);
  const p = progress.value?.data;
  if (progress.loading || progress.error || !p?.rounds.length)
    return <StateView loading={progress.loading} error={progress.error} onRetry={progress.reload} empty emptyTitle="No rounds completed" skeleton={<Skeleton h={420} r={28} />} />;
  const top = p.drivers.slice(0, 6);
  const seen = new Set<string>();
  const series = top.map((d) => {
    const team = d.team.constructorId;
    const dashed = seen.has(team);
    seen.add(team);
    return { id: d.driver.driverId, name: d.driver.familyName, color: teamColor(team), values: d.cumulative, dashed };
  });
  return (
    <Glass className="card reveal">
      <div className="fight-legend">
        {top.map((d, i) => (
          <button key={d.driver.driverId} className={cx("fight-chip", focus && focus !== d.driver.driverId && "dim")} onPointerEnter={() => setFocus(d.driver.driverId)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(d.driver.driverId)} onBlur={() => setFocus(null)} style={{ "--tint": teamColor(d.team) } as CSSProperties}>
            <span className="fc-rank">{i + 1}</span>
            <span><strong>{d.driver.familyName}</strong><small>{pts(d.cumulative.at(-1) || 0)} pts</small></span>
            {series[i].dashed && <i className="fc-dash" title="Second driver of this team (dashed line)" />}
          </button>
        ))}
      </div>
      <LineChart
        ariaLabel="Cumulative championship points of the top six drivers after each round"
        series={series}
        labels={p.rounds.map((r) => "R" + r.round)}
        tooltipTitle={(i) => `Round ${p.rounds[i].round} · ${shortRace(p.rounds[i].raceName)}`}
        focus={focus}
        onFocus={setFocus}
        height={380}
      />
      <p className="source">Race and sprint classification points, summed by round.</p>
      <ProgressNote progress={p} kind="driver" />
    </Glass>
  );
}

/* ───────────────────────── Season pulse ───────────────────────── */
function SeasonPulse({ races, progress, winners }: { races: Race[]; progress?: { rounds: unknown[]; drivers: { driver: any; wins: number }[] }; winners: Map<string, Result> }) {
  const done = progress?.rounds.length || 0;
  const total = races.length;
  const uniqueWinners = new Set([...winners.values()].map((w) => w.Driver.driverId));
  const sprintCount = races.filter((r) => r.Sprint).length;
  const leader = progress?.drivers[0];
  const second = progress?.drivers[1] as any;
  const gap = leader && second ? (leader as any).cumulative.at(-1) - second.cumulative.at(-1) : 0;
  const remaining = total - done;
  return (
    <div className="pulse-grid">
      <Glass className="card pulse-ring reveal">
        <Ring value={total ? done / total : 0} size={168} stroke={13} label={`${done} of ${total} rounds complete`}>
          <div><span className="ring-num"><Counter value={done} /></span><span className="ring-of">of {total} rounds</span></div>
        </Ring>
        <p className="muted small center">{remaining > 0 ? `${plural(remaining, "Grand Prix", "Grands Prix")} to go` : "Season complete"}</p>
      </Glass>
      <Glass className="card kpi reveal" style={{ "--i": 1 } as CSSProperties}>
        <span className="label"><FlagIcon size={13} /> Different winners</span>
        <span className="value"><Counter value={uniqueWinners.size} /></span>
        <span className="detail">from {plural(winners.size, "race")}</span>
        <div className="winner-stack">
          {[...uniqueWinners].slice(0, 7).map((id) => {
            const w = [...winners.values()].find((x) => x.Driver.driverId === id)!;
            const count = [...winners.values()].filter((x) => x.Driver.driverId === id).length;
            return <span key={id} title={`${fullName(w.Driver)} · ${plural(count, "win")}`}><DriverAvatar id={id} name={fullName(w.Driver)} year={races[0]?.season || ""} team={w.Constructor.constructorId} size={34} /></span>;
          })}
        </div>
      </Glass>
      <Glass className="card kpi reveal" style={{ "--i": 2 } as CSSProperties}>
        <span className="label"><Trophy size={13} /> Leader's margin</span>
        <span className="value"><Counter value={gap} /><small className="unit"> pts</small></span>
        <span className="detail">{leader ? `${leader.driver.familyName} over ${second?.driver.familyName}` : "—"}</span>
        {remaining > 0 && +(races[0]?.season || 0) >= 2025 && <span className="detail">Up to {remaining * 25 + Math.max(0, races.filter((r) => r.Sprint && +r.round > done).length) * 8} pts still available</span>}
      </Glass>
      <Glass className="card kpi reveal" style={{ "--i": 3 } as CSSProperties}>
        <span className="label"><Zap size={13} /> Sprint weekends</span>
        <span className="value"><Counter value={sprintCount} /></span>
        <span className="detail">{plural(total, "round")} on the calendar</span>
      </Glass>
    </div>
  );
}

/* ───────────────────────── Headlines ───────────────────────── */
function Headlines() {
  const n = useData(() => news(), []);
  const items = n.value?.data.slice(0, 6) || [];
  if (n.error || (!n.loading && !items.length)) return null;
  return (
    <Section title="Headlines" subtitle="From BBC Sport — opens the publisher's site." action={<Link className="btn sm" to="news">More news<ArrowRight /></Link>}>
      {n.loading ? <Skeleton h={220} r={28} /> : (
        <div className="headlines">
          {items.map((item, i) => (
            <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="headline glass reveal interactive" style={{ "--i": i } as CSSProperties}>
              <span className="eyebrow">{item.publisher} · {relativeTime(new Date(item.date).toISOString())}</span>
              <strong>{item.title}</strong>
              <ArrowRight size={16} className="headline-arrow" />
            </a>
          ))}
        </div>
      )}
      <Source value={n.value} />
    </Section>
  );
}
