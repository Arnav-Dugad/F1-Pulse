import { Countdown } from "../ui/countdown";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, type MotionProps } from "motion/react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Camera, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, ChevronsUpDown, Clock, CloudSun, Download, Droplets, Flag as FlagIcon, Gauge, Info, MapPin, Minus, RotateCcw,
  Thermometer, Timer, Trophy, Wind, Wrench, Zap,
} from "lucide-react";
import { pitStops, raceResult, useData, weather, type Weather } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { buildCalendar, weekendSessions } from "../domain.mjs";
import { timeSeconds } from "../math.mjs";
import { shortRace, useCalendar } from "../lib/season";
import { circuitMedia, driverMedia, fullName, raceGallery, teamColor, teamShortName, useTrackOutline } from "../lib/media";
import {
  countdown, download, formatClock, formatDateRange, formatSession, formatWeekday, hasStarted, plural, pts, relativeTime,
  sessionDate, timezoneLabel, toCSV,
} from "../lib/format";
import { Glass, Img, Page, Section, Segmented, Skeleton, Source, StateView, Toggle, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo, TrackMap } from "../ui/media";
import { LineChart, type Series } from "../ui/charts";
import type { Driver, Envelope, Race as RaceData, Result } from "../types";
import { neutralWindows, useAnalysis, useLapData, type AnalysisState, type LapData } from "./_raceData";
import { Confetti, RaceReport, useCelebration } from "./_raceReport";
import { QualifyingDeepDive, StartingGrid } from "./_raceGrid";
import { RaceGaps, RacePace } from "./_racePace";
import { RaceDayWeather } from "./_raceWeather";
import { RCStrip, SessionAnalysis } from "./_raceAnalysis";
import { StrategyExplorer } from "./_raceStrategy";
import { Gallery } from "../ui/gallery";
import "./race.css";

/* ───────────────────────── Helpers ───────────────────────── */
type Loaded<T> = { loading: boolean; value?: Envelope<T>; error?: string; reload: () => void };
type Phase = "upcoming" | "loading" | "pending" | "completed" | "error";

const EMPTY_META: Envelope<unknown>["meta"] = { source: "", url: "", fetchedAt: "", status: "" };
const none = <T,>(data: T): Promise<Envelope<T>> => Promise.resolve({ data, meta: EMPTY_META });
const classified = (r: Result) => /^\d+$/.test(r.positionText);
const STATUS: Record<string, string> = { R: "DNF", D: "DSQ", E: "EXC", W: "WD", F: "DNQ", N: "NC" };
const posLabel = (r: Result) => (classified(r) ? r.position : STATUS[r.positionText] || r.positionText);
const code = (d: Driver) => d.code || d.familyName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
const secs = (v?: string) => timeSeconds(v);
const gainOf = (r: Result) => (classified(r) && +r.grid > 0 ? +r.grid - +r.position : null);
const weekendStartDate = (r: RaceData) => r.FirstPractice?.date || r.SprintQualifying?.date || r.Qualifying?.date || r.date;
const fmtGap = (s: number) => (s >= 60 ? `+${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}` : `+${s.toFixed(3)}`);
const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/* ───────────────────────── Page ───────────────────────── */
export default function Race({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  const round = route.parts[1] || "";
  const cal = useCalendar(season);
  const list = cal.value?.data || [];
  const index = list.findIndex((r) => r.round === round);
  const race = index >= 0 ? list[index] : undefined;
  useTitle(race ? `${race.raceName} ${race.season}` : "Race weekend");

  if (cal.loading)
    return (
      <Page className="rw">
        <Skeleton h="min(80vh, 760px)" r={36} />
        <div className="split" style={{ marginTop: 24 }}><Skeleton h={420} r={28} /><Skeleton h={420} r={28} /></div>
      </Page>
    );
  if (cal.error) return <Page className="rw"><h1 className="sr-only">Race weekend unavailable</h1><StateView error={cal.error} onRetry={cal.reload} /></Page>;
  if (!race) return <Page className="rw"><NotFound round={round} year={year} list={list} /></Page>;
  return <RaceWeekend key={season + ":" + race.round} race={race} prev={list[index - 1]} next={list[index + 1]} total={list.length} schedule={cal.value!} />;
}

function RaceWeekend({ race, prev, next, total, schedule }: { race: RaceData; prev?: RaceData; next?: RaceData; total: number; schedule: Envelope<RaceData[]> }) {
  const { season, year } = usePrefs();
  const now = useNow(30_000);
  const started = hasStarted(race.date, race.time, now);
  // Only ask for sessions that have begun — keeps the request queue short.
  const qualiStarted = race.Qualifying ? hasStarted(race.Qualifying.date, race.Qualifying.time, now) : started;
  const sprintStarted = !!race.Sprint && hasStarted(race.Sprint.date, race.Sprint.time, now);
  const res = useData(() => (started ? raceResult(season, race.round, "results") : none(undefined)), [season, race.round, started]);
  const quali = useData(() => (qualiStarted ? raceResult(season, race.round, "qualifying") : none(undefined)), [season, race.round, qualiStarted]);
  const sprint = useData(() => (sprintStarted ? raceResult(season, race.round, "sprint") : none(undefined)), [season, race.round, sprintStarted]);

  const results = res.value?.data?.Results || [];
  const winner = results[0];
  const phase: Phase = !started ? "upcoming" : res.loading ? "loading" : res.error ? "error" : results.length ? "completed" : "pending";
  useAmbient(winner ? teamColor(winner.Constructor) : undefined, results[1] ? teamColor(results[1].Constructor) : undefined);
  const cars = phase === "completed" ? results.slice(0, 3).map((r) => teamColor(r.Constructor)) : [];
  const laps = useLapData(season, race.round);
  const analysis = useAnalysis(race, results);
  const pitsEligible = +race.season >= 2011 && started;
  const pits = useData(() => (pitsEligible ? pitStops(season, race.round) : none([] as RaceData[])), [season, race.round, pitsEligible]);
  const qualiRows = quali.value?.data?.QualifyingResults;
  const pitList = useMemo(() => pits.value?.data[0]?.PitStops || [], [pits.value]);

  return (
    <Page className="rw">
      <RaceHero race={race} prev={prev} next={next} total={total} phase={phase} results={results} cars={cars} />

      {phase === "loading" && (
        <div className="rw-after-hero">
          <Skeleton h={380} r={36} />
          <Skeleton h={520} r={28} style={{ marginTop: 24 }} />
        </div>
      )}

      {phase === "error" && (
        <div className="rw-after-hero"><StateView error={res.error} onRetry={res.reload} /></div>
      )}

      {phase === "completed" && (
        <>
          <section className="rw-after-hero">
            <WinnerSpotlight race={race} results={results} year={year} />
            <Source value={res.value} />
          </section>
          <RaceReport race={race} results={results} quali={qualiRows} laps={laps} analysis={analysis} env={res.value} year={year} />
          <RaceGallery race={race} />
          <Section id="rw-classification" title="Classification" subtitle="Official results as published. Sort any column, or export the table.">
            <Classification res={res} quali={quali} sprint={sprint} race={race} year={year} />
          </Section>
          <StartingGrid results={results} quali={qualiRows} analysis={analysis} year={year} resEnv={res.value} qualiEnv={quali.value} />
          {qualiRows?.length ? <QualifyingDeepDive rows={qualiRows} year={year} env={quali.value} race={race} /> : null}
          <Movers results={results} year={year} env={res.value} />
          <LapChart race={race} results={results} year={year} laps={laps} analysis={analysis} />
          <RaceGaps race={race} results={results} laps={laps} analysis={analysis} />
          <RacePace race={race} results={results} laps={laps} analysis={analysis} pits={pitList} year={year} />
          <PitStops race={race} results={results} year={year} data={pits} />
          <StrategyExplorer race={race} results={results} analysis={analysis} year={year} />
          <SessionAnalysis race={race} results={results} analysis={analysis} year={year} />
          <RaceDayWeather race={race} results={results} />
          <Section id="rw-circuit" title="The circuit">
            <CircuitCard race={race} />
          </Section>
        </>
      )}

      {(phase === "upcoming" || phase === "pending") && (
        <>
          {phase === "pending" && (
            <div className="notice rw-after-hero rw-pending" role="status">
              <Info />
              <span>The Grand Prix has started{hasStarted(race.date, race.time, now - 3 * 3600e3) ? " and should be over" : ""}. The classification appears here as soon as the timing archive publishes it — usually within a few hours.</span>
            </div>
          )}
          <div className={cx("rw-pre", phase === "upcoming" && "rw-after-hero")}>
            <Timetable race={race} schedule={schedule} />
            <WeatherCard race={race} />
          </div>
          {(quali.value?.data?.QualifyingResults?.length || sprint.value?.data?.SprintResults?.length) ? (
            <Section id="rw-weekend" title="Weekend so far" subtitle="Sessions already classified this weekend.">
              <Classification res={res} quali={quali} sprint={sprint} race={race} year={year} />
            </Section>
          ) : null}
          <Section id="rw-circuit" title="The circuit">
            <CircuitCard race={race} />
          </Section>
        </>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function RaceHero({ race, prev, next, total, phase, results, cars }: {
  race: RaceData; prev?: RaceData; next?: RaceData; total: number; phase: Phase; results: Result[]; cars: string[];
}) {
  const { year } = usePrefs();
  const media = circuitMedia(race.Circuit.circuitId);
  const outline = useTrackOutline(race.Circuit.circuitId);
  const gp = / Grand Prix$/.test(race.raceName);
  const winner = results[0];
  const fastest = results.find((r) => r.FastestLap?.rank === "1");
  const tint = winner ? teamColor(winner.Constructor) : undefined;
  const ics = () => download(`f1-pulse-${race.season}-r${race.round}-weekend.ics`, buildCalendar([race], true), "text/calendar;charset=utf-8");
  const status = phase === "completed" ? "Completed" : phase === "upcoming" ? (hasStarted(weekendSessions(race)[0]?.date || race.date, weekendSessions(race)[0]?.time) ? "Race weekend live" : "Upcoming") : phase === "pending" ? "Awaiting results" : "";

  return (
    <section className={cx("rw-hero", phase === "completed" && "done")} style={{ "--tint": tint } as CSSProperties}>
      <div className="rw-hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="rw-hero-scrim" />
      </div>

      <nav className="rw-hero-nav" aria-label="Rounds">
        {prev ? (
          <Link className="rw-nav-btn" to={"race/" + prev.round} data-swipe="prev" aria-label={`Previous round: ${prev.raceName}`}>
            <ChevronLeft /><span><small>Round {prev.round}</small>{shortRace(prev.raceName)}</span>
          </Link>
        ) : <span />}
        <Link className="rw-nav-btn rw-nav-all" to="calendar" aria-label="Full calendar"><CalendarDays /><span>Calendar</span></Link>
        {next ? (
          <Link className="rw-nav-btn right" to={"race/" + next.round} data-swipe="next" aria-label={`Next round: ${next.raceName}`}>
            <span><small>Round {next.round}</small>{shortRace(next.raceName)}</span><ChevronRight />
          </Link>
        ) : <span />}
      </nav>

      <div className={cx("rw-hero-inner", !outline && "solo")}>
        <div className="rw-hero-copy">
          <span className="eyebrow rw-hero-eyebrow rise">
            <span className={cx("dot", phase === "upcoming" && "live")} />Round {race.round} of {total} · {race.season}{status && ` · ${status}`}
          </span>
          <h1 className="display rw-hero-title rise" style={{ "--i": 1 } as CSSProperties}>
            {gp ? race.raceName.replace(/ Grand Prix$/, "") : race.raceName}
            {gp && <span>Grand Prix</span>}
          </h1>
          <p className="rw-hero-place rise" style={{ "--i": 2 } as CSSProperties}>
            <Flag country={race.Circuit.Location.country} large />
            <span>
              {race.Circuit.circuitName}
              <small>{race.Circuit.Location.locality}, {race.Circuit.Location.country} · {formatDateRange(weekendStartDate(race), race.date)} {race.season}</small>
            </span>
          </p>

          <div className="rise" style={{ "--i": 3 } as CSSProperties}>
            {phase === "upcoming" && <SessionCountdown race={race} />}
            {phase === "completed" && winner && (
              <div className="rw-hero-result">
                <Link to={"driver/" + winner.Driver.driverId} className="rw-hero-winner" style={{ "--tint": teamColor(winner.Constructor) } as CSSProperties}>
                  <DriverAvatar id={winner.Driver.driverId} name={fullName(winner.Driver)} year={year} team={winner.Constructor.constructorId} size={44} />
                  <span>
                    <small><Trophy size={12} />Winner</small>
                    <strong>{fullName(winner.Driver)}</strong>
                  </span>
                  <span className="rw-hero-winner-time">{winner.Time?.time || winner.status}</span>
                </Link>
                {fastest?.FastestLap && (
                  <span className="rw-chip-glass purple"><Zap size={13} />Fastest lap · {fastest.Driver.familyName} {fastest.FastestLap.Time.time}</span>
                )}
              </div>
            )}
            {phase === "pending" && <span className="rw-chip-glass"><span className="rw-live" />Classification pending</span>}
          </div>

          <div className="rw-hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
            {phase === "completed" ? (
              <button className="btn lg primary" onClick={() => scrollToId("rw-classification")}>Full classification<ChevronDown /></button>
            ) : (
              <button className="btn lg primary" onClick={ics}><CalendarPlus />Add weekend to calendar</button>
            )}
            <Link className="btn lg glass-btn" to={"circuit/" + race.Circuit.circuitId}><MapPin />Circuit guide</Link>
          </div>
        </div>

        {outline && (
          <Link to={"circuit/" + race.Circuit.circuitId} className="rw-hero-track rise" style={{ "--i": 2 } as CSSProperties} aria-label={`${race.Circuit.circuitName} circuit guide`}>
            <TrackMap circuitId={race.Circuit.circuitId} mode="draw" cars={cars} label={`${race.Circuit.circuitName} layout`} />
            <span className="rw-hero-track-label">
              {cars.length ? <span className="rw-track-cars">{results.slice(0, 3).map((r) => <i key={r.Driver.driverId} style={{ background: teamColor(r.Constructor) }} title={`P${r.position} ${r.Driver.familyName}`} />)}Podium</span> : <span />}
              <span>Circuit guide <ArrowRight size={14} /></span>
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

function SessionCountdown({ race }: { race: RaceData }) {
  const { timezone } = usePrefs();
  const now = useNow(1000);
  const upcoming = weekendSessions(race).find((s) => sessionDate(s.date, s.time).getTime() > now);
  if (!upcoming) return <span className="rw-chip-glass accent"><span className="rw-live" />Lights out — race underway</span>;
  return (
    <div className="rw-cd-wrap">
      <span className="rw-cd-label">{upcoming.label} {upcoming.time ? "starts in" : "· day of session in"}</span>
      <Countdown target={sessionDate(upcoming.date, upcoming.time).getTime()} label={upcoming.label} startLights={!!upcoming.time} />
      <p className="rw-cd-when"><Clock size={14} />{formatSession(upcoming.date, upcoming.time, timezone)} · {timezoneLabel(timezone)}</p>
    </div>
  );
}

/* ───────────────────────── Winner spotlight ───────────────────────── */
function WinnerSpotlight({ race, results, year }: { race: RaceData; results: Result[]; year: string }) {
  const w = results[0];
  const tint = teamColor(w.Constructor);
  const hasPhoto = !!driverMedia(w.Driver.driverId, year)?.front;
  const fastest = results.find((r) => r.FastestLap?.rank === "1");
  const finishers = results.filter((r) => classified(r)).length;
  const stats: { label: string; value: ReactNode; detail?: ReactNode }[] = [
    { label: "Race time", value: w.Time?.time || w.status, detail: `${plural(+w.laps, "lap")}` },
    { label: "Started", value: +w.grid > 0 ? `P${w.grid}` : "Pit lane", detail: +w.grid > 1 ? `Gained ${+w.grid - 1}` : +w.grid === 1 ? "From pole" : undefined },
    { label: "Points", value: `+${pts(w.points)}`, detail: "Grand Prix" },
    { label: "Finishers", value: `${finishers}/${results.length}`, detail: "Classified" },
  ];
  // First visit this session: the winner and podium drop in on springs, with a confetti burst.
  const party = useCelebration(race.season + ":" + race.round);
  const drop = (i: number): MotionProps =>
    party.pending
      ? {
          initial: { y: -260, opacity: 0, rotate: i % 2 ? 5 : -5 },
          whileInView: { y: 0, opacity: 1, rotate: 0 },
          viewport: { once: true, amount: 0.3 },
          transition: { type: "spring", stiffness: 210, damping: 12, mass: 0.9, delay: 0.1 + i * 0.14 },
        }
      : {};
  return (
    <Glass className="rw-spot reveal" style={{ "--tint": tint } as CSSProperties}>
      <span className="rw-spot-glow" aria-hidden />
      {party.burst && <Confetti colors={results.slice(0, 3).map((r) => teamColor(r.Constructor))} origin={party.burst} onDone={party.clear} />}
      <motion.div className={cx("rw-spot-figure", !hasPhoto && "mono")} {...drop(0)} onViewportEnter={party.pending ? (e) => party.fire(e?.target) : undefined}>
        <NumberArt id={w.Driver.driverId} number={w.Driver.permanentNumber} year={year} className="rw-spot-number" />
        {hasPhoto ? (
          <DriverPortrait id={w.Driver.driverId} name={fullName(w.Driver)} year={year} variant="front" className="rw-spot-photo" />
        ) : (
          <DriverAvatar id={w.Driver.driverId} name={fullName(w.Driver)} year={year} team={w.Constructor.constructorId} size={168} className="rw-spot-avatar" />
        )}
      </motion.div>
      <div className="rw-spot-body">
        <span className="eyebrow"><Trophy size={14} />Winner · {race.raceName}</span>
        <Link to={"driver/" + w.Driver.driverId} className="rw-spot-name">
          <small>{w.Driver.givenName}</small>
          <strong>{w.Driver.familyName}</strong>
        </Link>
        <Link to={"team/" + w.Constructor.constructorId} className="rw-spot-team">
          <TeamLogo id={w.Constructor.constructorId} name={w.Constructor.name} year={year} size={30} />
          {teamShortName(w.Constructor.name, year)}
          <Flag nationality={w.Driver.nationality} />
        </Link>
        <div className="rw-spot-stats">
          {stats.map((s) => (
            <div key={s.label} className="rw-spot-stat">
              <span className="label">{s.label}</span>
              <b>{s.value}</b>
              {s.detail && <small>{s.detail}</small>}
            </div>
          ))}
        </div>
        <ol className="rw-spot-podium" aria-label="Podium">
          {results.slice(1, 3).map((r, i) => (
            <motion.li key={r.Driver.driverId} {...drop(i + 1)}>
              <Link to={"driver/" + r.Driver.driverId} style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
                <span className={cx("pos", "p" + r.position)}>{r.position}</span>
                <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={34} />
                <span className="rw-spot-podium-name"><strong>{r.Driver.familyName}</strong><small>{teamShortName(r.Constructor.name, year)}</small></span>
                <span className="rw-spot-podium-gap">{r.Time?.time || r.status}</span>
              </Link>
            </motion.li>
          ))}
        </ol>
        {fastest?.FastestLap && (
          <span className="chip purple rw-spot-fl">
            <Zap />Fastest lap · {fullName(fastest.Driver)} · {fastest.FastestLap.Time.time}
            {fastest.FastestLap.lap && ` (lap ${fastest.FastestLap.lap})`}
          </span>
        )}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Sortable table ───────────────────────── */
type Col<T> = {
  key: string; label: ReactNode; title?: string; align?: "r" | "c"; className?: string;
  sort?: (r: T) => number | string | null; desc?: boolean; render: (r: T) => ReactNode;
};
function SortTable<T>({ rows, cols, rowKey, initial, caption, rowClass }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; initial: string; caption: string; rowClass?: (r: T) => string | undefined;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initial, dir: 1 });
  const col = cols.find((c) => c.key === sort.key);
  const sorted = useMemo(() => {
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, col, sort.dir]);
  const toggle = (c: Col<T>) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.desc ? -1 : 1 }));
  return (
    <div className="table-wrap rw-table-wrap">
      <table className="tbl rw-tbl">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {cols.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} className={cx(c.align, c.className)} title={c.title} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined} scope="col">
                  {c.sort ? (
                    <button type="button" className={cx("rw-sort", active && "on")} onClick={() => toggle(c)}>
                      {c.label}
                      {active ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} />}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {sorted.map((r) => (
              <motion.tr key={rowKey(r)} layout="position" transition={{ type: "spring", stiffness: 500, damping: 42 }} className={rowClass?.(r)}>
                {cols.map((c) => <td key={c.key} className={cx(c.align, c.className)}>{c.render(r)}</td>)}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

function DriverCell({ r, year }: { r: Result; year: string }) {
  return (
    <Link to={"driver/" + r.Driver.driverId} className="rw-driver" style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
      <span className="team-bar" />
      <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={32} />
      <span className="rw-driver-name"><small>{r.Driver.givenName}</small><strong>{r.Driver.familyName}</strong></span>
    </Link>
  );
}
function TeamCell({ r, year }: { r: Result; year: string }) {
  return (
    <Link to={"team/" + r.Constructor.constructorId} className="rw-team">
      <TeamLogo id={r.Constructor.constructorId} name={r.Constructor.name} year={year} size={26} />
      <span>{teamShortName(r.Constructor.name, year)}</span>
    </Link>
  );
}
function Gain({ r }: { r: Result }) {
  const g = gainOf(r);
  if (g === null) return <span className="rw-gain none" aria-label="Not applicable">—</span>;
  if (g === 0) return <span className="rw-gain flat" aria-label="No change"><Minus size={13} /></span>;
  return g > 0
    ? <span className="rw-gain up" aria-label={`Gained ${g}`}><ArrowUp size={13} />{g}</span>
    : <span className="rw-gain down" aria-label={`Lost ${-g}`}><ArrowDown size={13} />{-g}</span>;
}
function PosCell({ r }: { r: Result }) {
  const ok = classified(r);
  return <span className={cx("pos", ok && +r.position <= 3 && "p" + r.position, !ok && "rw-pos-out")}>{posLabel(r)}</span>;
}

function resultCols(rows: Result[], year: string): Col<Result>[] {
  const flTimes = rows.map((r) => secs(r.FastestLap?.Time.time)).filter((x): x is number => x !== null);
  const best = flTimes.length ? Math.min(...flTimes) : null;
  const hasFL = flTimes.length > 0;
  const cols: Col<Result>[] = [
    { key: "pos", label: "Pos", sort: (r) => +r.position, render: (r) => <PosCell r={r} /> },
    { key: "driver", label: "Driver", sort: (r) => r.Driver.familyName, render: (r) => <DriverCell r={r} year={year} /> },
    { key: "team", label: "Team", className: "rw-col-team", sort: (r) => r.Constructor.name, render: (r) => <TeamCell r={r} year={year} /> },
    { key: "grid", label: "Grid", align: "r", sort: (r) => (+r.grid > 0 ? +r.grid : 99), render: (r) => (+r.grid > 0 ? r.grid : <span className="faint">Pit</span>) },
    { key: "gain", label: "+/−", title: "Places gained or lost from the starting grid", align: "c", desc: true, sort: gainOf, render: (r) => <Gain r={r} /> },
    { key: "laps", label: "Laps", align: "r", desc: true, sort: (r) => +r.laps, render: (r) => r.laps },
    { key: "time", label: "Time / status", sort: (r) => +r.position, render: (r) => <span className={cx("rw-time", !r.Time && !/^\+/.test(r.status) && r.status !== "Finished" && "out")}>{r.Time?.time || r.status}</span> },
  ];
  if (hasFL)
    cols.push({
      key: "fl", label: "Fastest lap", align: "r", sort: (r) => secs(r.FastestLap?.Time.time),
      render: (r) => {
        const t = secs(r.FastestLap?.Time.time);
        if (t === null) return <span className="faint">—</span>;
        const isBest = best !== null && t === best;
        return <span className={cx("rw-fl", isBest && "best")} title={isBest ? "Fastest lap of the race" : undefined}>{isBest && <Zap size={12} />}{r.FastestLap!.Time.time}{r.FastestLap!.lap && <small>L{r.FastestLap!.lap}</small>}</span>;
      },
    });
  cols.push({ key: "pts", label: "Pts", align: "r", desc: true, sort: (r) => +r.points, render: (r) => <b className={cx("rw-pts", +r.points === 0 && "zero")}>{pts(r.points)}</b> });
  return cols;
}

function qualiGaps(rows: Result[]) {
  const sessions = ["Q3", "Q2", "Q1"] as const;
  const best = Object.fromEntries(sessions.map((s) => {
    const t = rows.map((r) => secs(r[s])).filter((x): x is number => x !== null);
    return [s, t.length ? Math.min(...t) : null];
  })) as Record<(typeof sessions)[number], number | null>;
  const gaps = new Map<string, number | null>();
  for (const r of rows) {
    const s = sessions.find((k) => secs(r[k]) !== null);
    gaps.set(r.Driver.driverId, s && best[s] !== null ? secs(r[s])! - best[s]! : null);
  }
  return { best, gaps };
}

function qualiCols(rows: Result[], year: string): Col<Result>[] {
  const { best, gaps } = qualiGaps(rows);
  const q = (k: "Q1" | "Q2" | "Q3"): Col<Result> => ({
    key: k, label: k, align: "r", sort: (r) => secs(r[k]),
    render: (r) => {
      const t = secs(r[k]);
      if (t === null) return <span className="faint">—</span>;
      return <span className={cx("rw-qt", t === best[k] && "best")} title={t === best[k] ? `Fastest in ${k}` : undefined}>{r[k]}</span>;
    },
  });
  const cols: Col<Result>[] = [
    { key: "pos", label: "Pos", sort: (r) => +r.position, render: (r) => <span className={cx("pos", +r.position <= 3 && "p" + r.position)}>{r.position}</span> },
    { key: "driver", label: "Driver", sort: (r) => r.Driver.familyName, render: (r) => <DriverCell r={r} year={year} /> },
    { key: "team", label: "Team", className: "rw-col-team", sort: (r) => r.Constructor.name, render: (r) => <TeamCell r={r} year={year} /> },
    q("Q1"),
  ];
  if (rows.some((r) => r.Q2)) cols.push(q("Q2"));
  if (rows.some((r) => r.Q3)) cols.push(q("Q3"));
  cols.push({
    key: "gap", label: "Gap", align: "r", title: "Gap to the fastest time of the session in which the driver set their final lap (pole position for Q3 runners)",
    sort: (r) => gaps.get(r.Driver.driverId) ?? null,
    render: (r) => {
      const g = gaps.get(r.Driver.driverId);
      if (g === null || g === undefined) return <span className="faint">—</span>;
      return g === 0 ? <span className="chip purple rw-pole">{r.position === "1" ? "Pole" : "Session best"}</span> : <span className="rw-gap">{fmtGap(g)}</span>;
    },
  });
  return cols;
}

/* ───────────────────────── Classification ───────────────────────── */
type Kind = "race" | "qualifying" | "sprint";
function Classification({ res, quali, sprint, race, year }: {
  res: Loaded<RaceData | undefined>; quali: Loaded<RaceData | undefined>; sprint: Loaded<RaceData | undefined>; race: RaceData; year: string;
}) {
  const tabs = ([
    { kind: "race", label: "Race", rows: res.value?.data?.Results, env: res.value },
    { kind: "qualifying", label: "Qualifying", rows: quali.value?.data?.QualifyingResults, env: quali.value },
    { kind: "sprint", label: "Sprint", rows: sprint.value?.data?.SprintResults, env: sprint.value },
  ] as { kind: Kind; label: string; rows?: Result[]; env?: Envelope<RaceData | undefined> }[]).filter((t) => t.rows?.length) as {
    kind: Kind; label: string; rows: Result[]; env?: Envelope<RaceData | undefined>;
  }[];
  const [tab, setTab] = useState<Kind>("race");
  const loading = res.loading || quali.loading || sprint.loading;
  if (!tabs.length) return loading ? <Skeleton h={560} r={28} /> : <StateView empty emptyTitle="No classification yet" emptyText="Results appear as soon as the timing archive publishes them." />;
  const active = tabs.find((t) => t.kind === tab) || tabs[0];
  const exportCSV = () => {
    const rows = active.rows;
    const csv = active.kind === "qualifying"
      ? toCSV([["Position", "Number", "Driver", "Code", "Team", "Q1", "Q2", "Q3"], ...rows.map((r) => [r.position, r.Driver.permanentNumber, fullName(r.Driver), r.Driver.code, r.Constructor.name, r.Q1, r.Q2, r.Q3])])
      : toCSV([["Position", "Position text", "Driver", "Code", "Team", "Grid", "Places gained", "Laps", "Time / status", "Fastest lap", "Fastest lap number", "Points"],
        ...rows.map((r) => [r.position, r.positionText, fullName(r.Driver), r.Driver.code, r.Constructor.name, r.grid, gainOf(r), r.laps, r.Time?.time || r.status, r.FastestLap?.Time.time, r.FastestLap?.lap, r.points])]);
    download(`f1-pulse-${race.season}-r${race.round}-${active.kind}.csv`, csv, "text/csv;charset=utf-8");
  };
  return (
    <Glass className="rw-class reveal">
      <div className="rw-class-bar">
        <Segmented label="Session" value={active.kind} onChange={setTab} options={tabs.map((t) => ({ value: t.kind, label: t.label }))} />
        <span className="rw-class-meta faint small">{plural(active.rows.length, "driver")}</span>
        <button className="btn sm" onClick={exportCSV}><Download />Export CSV</button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={active.kind} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          {active.kind === "qualifying" ? (
            <>
              <SortTable rows={active.rows} cols={qualiCols(active.rows, year)} rowKey={(r) => r.Driver.driverId} initial="pos" caption={`${race.raceName} qualifying classification`} />
              <p className="rw-foot faint xsmall">Purple marks the fastest time in each session. Gap is measured to the fastest lap of the session in which each driver set their final time — pole position for Q3 runners. Grid penalties are not reflected here.</p>
            </>
          ) : (
            <SortTable rows={active.rows} cols={resultCols(active.rows, year)} rowKey={(r) => r.Driver.driverId} initial="pos" caption={`${race.raceName} ${active.label.toLowerCase()} classification`} rowClass={(r) => (classified(r) ? undefined : "rw-row-out")} />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="rw-class-source"><Source value={active.env} /></div>
    </Glass>
  );
}

/* ───────────────────────── Movers (grid vs finish) ───────────────────────── */
function Movers({ results, year, env }: { results: Result[]; year: string; env?: Envelope<unknown> }) {
  const [focus, setFocus] = useState<string | null>(null);
  const rows = results.filter((r) => gainOf(r) !== null);
  if (rows.length < 3) return null;
  const gainers = [...rows].filter((r) => gainOf(r)! > 0).sort((a, b) => gainOf(b)! - gainOf(a)! || +a.position - +b.position).slice(0, 3);
  const losers = [...rows].filter((r) => gainOf(r)! < 0).sort((a, b) => gainOf(a)! - gainOf(b)! || +a.position - +b.position).slice(0, 3);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(gainOf(r)!)));
  const highlight = new Set([...gainers, ...losers].map((r) => r.Driver.driverId));
  const maxP = Math.max(...rows.map((r) => Math.max(+r.grid, +r.position)));
  const rowH = 17, top = 26, W = 340, xL = 70, xR = 270;
  const H = top + maxP * rowH + 4;
  const y = (p: number) => top + (p - 0.5) * rowH;
  const excluded = results.length - rows.length;
  const item = (r: Result) => {
    const g = gainOf(r)!;
    return (
      <li key={r.Driver.driverId}>
        <Link
          to={"driver/" + r.Driver.driverId}
          className={cx("rw-mover", g > 0 ? "up" : "down", focus === r.Driver.driverId && "on")}
          style={{ "--tint": teamColor(r.Constructor), "--w": `${(Math.abs(g) / maxAbs) * 100}%` } as CSSProperties}
          onPointerEnter={() => setFocus(r.Driver.driverId)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(r.Driver.driverId)} onBlur={() => setFocus(null)}
        >
          <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={34} />
          <span className="rw-mover-main">
            <span className="rw-mover-top"><strong>{r.Driver.familyName}</strong><span className="rw-mover-path">P{r.grid} → P{r.position}</span></span>
            <span className="rw-mover-bar"><i /></span>
          </span>
          <b className="rw-mover-num">{g > 0 ? "+" : "−"}{Math.abs(g)}</b>
        </Link>
      </li>
    );
  };
  return (
    <Section id="rw-movers" title="Movers" subtitle="Starting grid against finishing position. Hover a driver to trace their race.">
      <div className="rw-movers">
        <Glass className="card rw-slope reveal">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Slope chart of starting grid position against finishing position for classified finishers" className="rw-slope-svg">
            <text x={xL} y={14} className="rw-slope-head" textAnchor="middle">GRID</text>
            <text x={xR} y={14} className="rw-slope-head" textAnchor="middle">FINISH</text>
            <line x1={xL} x2={xL} y1={top - 4} y2={H - 2} className="rw-slope-axis" />
            <line x1={xR} x2={xR} y1={top - 4} y2={H - 2} className="rw-slope-axis" />
            {rows.map((r) => {
              const id = r.Driver.driverId;
              const y1 = y(+r.grid), y2 = y(+r.position), xm = (xL + xR) / 2;
              const d = `M${xL},${y1} C${xm},${y1} ${xm},${y2} ${xR},${y2}`;
              const on = focus ? focus === id : highlight.has(id);
              const color = teamColor(r.Constructor);
              return (
                <g key={id} className={cx("rw-slope-line", on && "on", focus && focus !== id && "dim")} onPointerEnter={() => setFocus(id)} onPointerLeave={() => setFocus(null)}>
                  <path d={d} className="hit" />
                  <path d={d} stroke={color} className="ln" />
                  <circle cx={xL} cy={y1} r={3} fill={color} />
                  <circle cx={xR} cy={y2} r={3} fill={color} />
                  <text x={xL - 8} y={y1 + 3.6} textAnchor="end" className="lbl"><tspan className="num">{r.grid}</tspan> {code(r.Driver)}</text>
                  <text x={xR + 8} y={y2 + 3.6} className="lbl">{code(r.Driver)} <tspan className="num">{r.position}</tspan></text>
                </g>
              );
            })}
          </svg>
        </Glass>
        <div className="rw-mover-lists">
          <Glass className="card reveal" style={{ "--i": 1 } as CSSProperties}>
            <div className="card-title"><h3>Biggest gains</h3><ArrowUp size={16} className="rw-green" /></div>
            {gainers.length ? <ol className="rw-mover-list">{gainers.map(item)}</ol> : <p className="muted small">No driver gained places from the grid.</p>}
          </Glass>
          <Glass className="card reveal" style={{ "--i": 2 } as CSSProperties}>
            <div className="card-title"><h3>Places lost</h3><ArrowDown size={16} className="rw-red" /></div>
            {losers.length ? <ol className="rw-mover-list">{losers.map(item)}</ol> : <p className="muted small">No classified driver finished behind their grid slot.</p>}
          </Glass>
        </div>
      </div>
      <p className="source">Classified finishers who started from a grid slot{excluded > 0 ? ` · ${plural(excluded, "driver")} excluded (retired, not classified or pit-lane start)` : ""}.</p>
      <Source value={env} />
    </Section>
  );
}

/* ───────────────────────── Lap chart (lazy) ───────────────────────── */
function LapChart({ results, year, laps, analysis }: { race: RaceData; results: Result[]; year: string; laps: LapData; analysis: AnalysisState }) {
  const [all, setAll] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const open = laps.open;
  const lapList = laps.laps;
  const a = analysis.status === "done" ? analysis.data : undefined;
  const windows = a && !a.failed.includes("race_control") ? neutralWindows(a.control, lapList.length) : [];

  const model = useMemo(() => {
    const byDriver = new Map<string, (number | null)[]>();
    const led = new Map<string, number>();
    const n = lapList.length + 1;
    for (const r of results) {
      const arr: (number | null)[] = Array(n).fill(null);
      arr[0] = +r.grid > 0 ? +r.grid : null;
      byDriver.set(r.Driver.driverId, arr);
    }
    lapList.forEach((lap, i) => {
      for (const t of lap.Timings) {
        const arr = byDriver.get(t.driverId);
        if (arr) arr[i + 1] = +t.position;
        if (t.position === "1") led.set(t.driverId, (led.get(t.driverId) || 0) + 1);
      }
    });
    return { byDriver, led };
  }, [lapList, results]);

  const pool = (all ? results : results.slice(0, 10)).filter((r) => model.byDriver.get(r.Driver.driverId)?.some((v, i) => i > 0 && v !== null));
  const seen = new Set<string>();
  const series: (Series & { result: Result })[] = pool.map((r) => {
    const team = r.Constructor.constructorId;
    const dashed = seen.has(team);
    seen.add(team);
    return { id: r.Driver.driverId, name: code(r.Driver), color: teamColor(team), values: model.byDriver.get(r.Driver.driverId) || [], dashed, result: r };
  });
  const visible = series.filter((s) => !hidden.has(s.id));
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const leaders = [...model.led.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Section id="rw-laps" title="Lap by lap" subtitle="Running order at the end of every lap, from the official timing archive.">
      {!open ? (
        <Glass className="rw-cta reveal">
          <span className="rw-cta-icon"><Activity /></span>
          <div className="rw-cta-copy">
            <h3>Every lap. Every overtake.</h3>
            <p className="muted">Trace the top ten through all {results[0]?.laps ? `${results[0].laps} laps` : "laps"} — undercuts, safety cars and late charges. It's a large dataset, so it loads only when you ask.</p>
          </div>
          <button className="btn primary lg" onClick={laps.load}><Activity />Build lap chart</button>
        </Glass>
      ) : laps.loading ? (
        <Glass className="card rw-lap-loading">
          <div className="spinner" />
          <p className="muted small">Fetching lap-by-lap positions — several pages from the timing archive, this can take a few seconds…</p>
          <Skeleton h={360} r={20} />
        </Glass>
      ) : laps.error ? (
        <StateView error={laps.error} onRetry={laps.reload} />
      ) : !lapList.length ? (
        <StateView empty emptyTitle="No lap timing for this race" emptyText="The timing archive has no lap-by-lap positions for this Grand Prix." />
      ) : (
        <Glass className="card rw-lap reveal">
          <div className="rw-lap-bar">
            <div className="rw-lap-legend" role="group" aria-label="Drivers shown in the lap chart">
              {series.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cx("rw-lap-chip", hidden.has(s.id) && "off", focus && focus !== s.id && !hidden.has(s.id) && "dim")}
                  style={{ "--tint": s.color } as CSSProperties}
                  aria-pressed={!hidden.has(s.id)}
                  aria-label={`${fullName(s.result.Driver)}, finished ${posLabel(s.result)}. ${hidden.has(s.id) ? "Show" : "Hide"} line`}
                  onClick={() => toggle(s.id)}
                  onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)}
                >
                  <span className="rw-lap-pos">{posLabel(s.result)}</span>
                  {s.name}
                  {s.dashed && <i className="rw-lap-dash" title="Second driver of this team (dashed line)" />}
                </button>
              ))}
            </div>
            <div className="rw-lap-tools">
              {hidden.size > 0 && <button className="btn sm plain" onClick={() => setHidden(new Set())}><RotateCcw />Show all</button>}
              <label className="rw-lap-toggle small muted">All finishers<Toggle checked={all} onChange={(v) => { setAll(v); setHidden(new Set()); }} label="Show every driver in the lap chart" /></label>
            </div>
          </div>
          {windows.length > 0 && (
            <div className="rw-lap-rc">
              <RCStrip windows={windows} totalLaps={lapList.length} className="compact" />
            </div>
          )}
          <LineChart
            ariaLabel={`Running position by lap for ${visible.length} drivers`}
            series={visible}
            labels={["Grid", ...lapList.map((l) => "L" + l.number)]}
            invert
            yMin={1}
            yMax={Math.max(results.length, ...visible.flatMap((s) => s.values.filter((v): v is number => v !== null)))}
            yFormat={(v) => "P" + Math.round(v)}
            tooltipTitle={(i) => (i === 0 ? "Starting grid" : `Lap ${lapList[i - 1]?.number}`)}
            focus={focus}
            onFocus={setFocus}
            height={440}
          />
          {leaders.length > 0 && (
            <div className="rw-led">
              <span className="eyebrow"><FlagIcon size={13} />Laps led</span>
              <div className="rw-led-list">
                {leaders.map(([id, n]) => {
                  const r = results.find((x) => x.Driver.driverId === id);
                  if (!r) return null;
                  return (
                    <span key={id} className="rw-led-item" style={{ "--tint": teamColor(r.Constructor), "--w": `${(n / lapList.length) * 100}%` } as CSSProperties}>
                      <DriverAvatar id={id} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={26} />
                      <strong>{r.Driver.familyName}</strong>
                      <b>{n}</b>
                      <i aria-hidden />
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <p className="source">Position at the end of each lap, as recorded in the timing archive. “Grid” is the official starting position; pit-lane starters have no grid value.{windows.length ? " Bands above the chart mark safety-car, VSC and red-flag periods from OpenF1 race control." : ""} Use ← → on the chart to scrub laps.</p>
          <Source value={laps.value} />
        </Glass>
      )}
    </Section>
  );
}

/* ───────────────────────── Pit stops ───────────────────────── */
function PitStops({ race, results, year, data }: { race: RaceData; results: Result[]; year: string; data: Loaded<RaceData[]> }) {
  const eligible = +race.season >= 2011;
  const stops = data.value?.data[0]?.PitStops || [];

  const model = useMemo(() => {
    const by = new Map<string, NonNullable<RaceData["PitStops"]>>();
    for (const s of stops) by.set(s.driverId, [...(by.get(s.driverId) || []), s]);
    for (const list of by.values()) list.sort((a, b) => +a.stop - +b.stop);
    const timed = stops.map((s) => ({ s, t: secs(s.duration) })).filter((x): x is { s: (typeof stops)[number]; t: number } => x.t !== null);
    const fastest = timed.length ? timed.reduce((a, b) => (b.t < a.t ? b : a)) : null;
    const strategies = new Map<number, number>();
    for (const list of by.values()) strategies.set(list.length, (strategies.get(list.length) || 0) + 1);
    const totalLaps = Math.max(+results[0]?.laps || 0, ...stops.map((s) => +s.lap), 1);
    return { by, fastest, strategies: [...strategies.entries()].sort((a, b) => b[1] - a[1]), totalLaps };
  }, [stops, results]);

  if (!eligible)
    return (
      <Section id="rw-pits" title="Pit lane">
        <StateView empty emptyTitle="No pit stop data for this era" emptyText="The timing archive records pit stops from the 2011 season onward." />
      </Section>
    );

  const order = results.filter((r) => model.by.has(r.Driver.driverId));
  const noStop = results.filter((r) => !model.by.has(r.Driver.driverId) && +r.laps > 0).length;
  const fastestDriver = model.fastest ? results.find((r) => r.Driver.driverId === model.fastest!.s.driverId) : undefined;
  const step = model.totalLaps > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(model.totalLaps / step) + 1 }, (_, i) => i * step).filter((t) => t > 0 && t < model.totalLaps);
  const dur = (d: string) => (d.includes(":") ? d : `${(+d).toFixed(1)}s`);

  return (
    <Section id="rw-pits" title="Pit lane" subtitle="Every stop, lap by lap. Durations are pit-lane time from entry to exit, not stationary time.">
      {data.loading ? (
        <Skeleton h={480} r={28} />
      ) : data.error ? (
        <StateView error={data.error} onRetry={data.reload} />
      ) : !stops.length ? (
        <StateView empty emptyTitle="No pit stops recorded" emptyText="The timing archive has no pit stop entries for this race yet." />
      ) : (
        <>
          <div className="rw-pit-kpis">
            <Glass className="kpi rw-pit-kpi fastest reveal">
              <span className="label"><Timer size={13} /> Fastest stop</span>
              <span className="value">{model.fastest ? dur(model.fastest.s.duration) : "—"}</span>
              {model.fastest && <span className="detail">{fastestDriver ? fullName(fastestDriver.Driver) : model.fastest.s.driverId} · lap {model.fastest.s.lap}</span>}
            </Glass>
            <Glass className="kpi rw-pit-kpi reveal" style={{ "--i": 1 } as CSSProperties}>
              <span className="label"><Wrench size={13} /> Total stops</span>
              <span className="value">{stops.length}</span>
              <span className="detail">{plural(model.by.size, "driver")} stopped{noStop ? ` · ${noStop} did not` : ""}</span>
            </Glass>
            <Glass className="kpi rw-pit-kpi reveal" style={{ "--i": 2 } as CSSProperties}>
              <span className="label"><Gauge size={13} /> Strategy split</span>
              <span className="rw-strats">
                {model.strategies.map(([n, count]) => <span key={n} className="chip"><b>{count}×</b>{n}-stop</span>)}
              </span>
            </Glass>
          </div>
          <Glass className="card rw-pits reveal">
            <div className="rw-pit-scale" aria-hidden>
              <span />
              <span className="rw-pit-axis">
                <span style={{ left: 0 }}>L1</span>
                {ticks.map((t) => <span key={t} style={{ left: `${(t / model.totalLaps) * 100}%` }}>L{t}</span>)}
                <span style={{ left: "100%" }}>L{model.totalLaps}</span>
              </span>
              <span />
            </div>
            <ol className="rw-pit-list">
              {order.map((r, i) => {
                const list = model.by.get(r.Driver.driverId)!;
                return (
                  <li key={r.Driver.driverId} className="rw-pit-row reveal" style={{ "--tint": teamColor(r.Constructor), "--i": i % 10 } as CSSProperties}>
                    <Link to={"driver/" + r.Driver.driverId} className="rw-pit-who">
                      <span className="rw-pit-pos">{posLabel(r)}</span>
                      <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={28} />
                      <strong>{r.Driver.familyName}</strong>
                    </Link>
                    <span className="rw-pit-track">
                      <span className="rw-pit-rail" style={{ width: `${(Math.min(+r.laps || model.totalLaps, model.totalLaps) / model.totalLaps) * 100}%` }} />
                      {list.map((s) => {
                        const isFast = model.fastest?.s === s;
                        return (
                          <span
                            key={s.stop}
                            className={cx("rw-pit-stop", isFast && "fast")}
                            style={{ left: `${(+s.lap / model.totalLaps) * 100}%` }}
                            title={`Stop ${s.stop} · lap ${s.lap} · ${dur(s.duration)}${isFast ? " · fastest of the race" : ""}`}
                            aria-label={`Stop ${s.stop} on lap ${s.lap}, ${dur(s.duration)}`}
                            role="img"
                          >
                            <span className="rw-pit-dur">{dur(s.duration)}</span>
                          </span>
                        );
                      })}
                    </span>
                    <span className="rw-pit-text">
                      {list.map((s) => <span key={s.stop} className={cx(model.fastest?.s === s && "fast")}>L{s.lap} · {dur(s.duration)}</span>)}
                    </span>
                    <span className="rw-pit-count"><b>{list.length}</b><small>{list.length === 1 ? "stop" : "stops"}</small></span>
                  </li>
                );
              })}
            </ol>
          </Glass>
          <p className="source"><Zap /> Purple marks the fastest pit-lane time of the race. Long durations usually indicate a stop under red flag or a repair.</p>
          <Source value={data.value} />
        </>
      )}
    </Section>
  );
}

/* ───────────────────────── Race gallery ───────────────────────── */
function RaceGallery({ race }: { race: RaceData }) {
  const images = useMemo(() => raceGallery(race.season, race.round), [race.season, race.round]);
  if (!images.length) return null;
  const credits = [...new Set(images.map((i) => i.credit).filter((c): c is string => !!c))];
  return (
    <Section id="rw-gallery" title="In pictures" subtitle={`Trackside at the ${race.season} ${race.raceName}.`}>
      <Gallery images={images} label={`${race.season} ${race.raceName} photos`} className="rgal" />
      <p className="source"><Camera />{credits.length ? `Photos: ${credits.slice(0, 4).join(" · ")}${credits.length > 4 ? ` and ${credits.length - 4} more` : ""}` : "Official race-weekend photography"}. Select a photo to open it full screen with its caption and credit.</p>
    </Section>
  );
}

/* ───────────────────────── Timetable ───────────────────────── */
function Timetable({ race, schedule }: { race: RaceData; schedule: Envelope<RaceData[]> }) {
  const { timezone } = usePrefs();
  const now = useNow(30_000);
  const sessions = weekendSessions(race);
  const nextIndex = sessions.findIndex((s) => sessionDate(s.date, s.time).getTime() > now);
  const localDay = (date: string, time?: string) =>
    new Date(date + "T" + (time || "12:00:00Z")).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: time ? (timezone === "local" ? undefined : timezone) : "UTC" });
  const ics = () => download(`f1-pulse-${race.season}-r${race.round}-weekend.ics`, buildCalendar([race], true), "text/calendar;charset=utf-8");
  return (
    <Glass className="card rw-tt reveal">
      <div className="card-title">
        <h3><Timer size={17} />Weekend timetable</h3>
        <span className="chip">{timezoneLabel(timezone)}</span>
      </div>
      <ol className="rw-tt-list">
        {sessions.map((s, i) => {
          const done = nextIndex === -1 || i < nextIndex;
          const isNext = i === nextIndex;
          return (
            <li key={s.label} className={cx("rw-tt-row", done && "done", isNext && "next", s.label === "Grand Prix" && "gp")}>
              <span className="rw-tt-day"><b>{formatWeekday(s.date, s.time, timezone)}</b><small>{localDay(s.date, s.time)}</small></span>
              <span className="rw-tt-dot" aria-hidden>{done ? <Check size={11} strokeWidth={3} /> : null}</span>
              <span className="rw-tt-name">
                <strong>{s.label}</strong>
                <small>{done ? "Completed" : isNext ? `Next · ${relativeTime(sessionDate(s.date, s.time).toISOString(), now)}` : s.label === "Grand Prix" ? "Lights out" : "Scheduled"}</small>
              </span>
              <span className="rw-tt-time">
                <b>{formatClock(s.date, s.time, timezone)}</b>
                <small>{s.time ? `${formatClock(s.date, s.time, "UTC")} UTC` : "Time TBC"}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="rw-tt-foot">
        <button className="btn" onClick={ics}><CalendarPlus />Add weekend to calendar</button>
        <span className="faint xsmall">Published schedule · subject to change</span>
      </div>
      <Source value={schedule} label="Schedule" />
    </Glass>
  );
}

/* ───────────────────────── Weather ───────────────────────── */
function WeatherCard({ race }: { race: RaceData }) {
  const { lat, long } = race.Circuit.Location;
  const wx = useData(() => weather(lat, long), [race.Circuit.circuitId]);
  const data = wx.value?.data as (Weather & { utc_offset_seconds?: number }) | undefined;
  const current = data?.current;
  const offset = data?.utc_offset_seconds;
  const start = sessionDate(race.date, race.time || "12:00:00Z").getTime();
  // Race start expressed in circuit-local wall-clock time, matching Open-Meteo's `timezone=auto` hourly keys.
  const localIso = offset !== undefined ? new Date(start + offset * 1000).toISOString() : null;
  const dayKey = localIso ? localIso.slice(0, 10) : race.date;
  const hourKey = localIso && race.time ? localIso.slice(0, 13) : null;
  const hours = (data?.hourly?.time || [])
    .map((t, i) => ({ t, rain: data!.hourly!.precipitation_probability[i], temp: data!.hourly!.temperature_2m[i] }))
    .filter((h) => h.t.startsWith(dayKey));
  const atStart = hourKey ? hours.find((h) => h.t.startsWith(hourKey)) : undefined;
  const dayLabel = new Date(dayKey + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <Glass className="card rw-wx reveal" style={{ "--i": 1 } as CSSProperties}>
      <div className="card-title">
        <h3><CloudSun size={17} />Weather at the circuit</h3>
        <span className="chip blue">Model forecast</span>
      </div>
      {wx.loading ? (
        <Skeleton h={300} r={20} />
      ) : wx.error ? (
        <StateView error={wx.error} onRetry={wx.reload} />
      ) : !current ? (
        <StateView empty emptyTitle="Forecast unavailable" emptyText="The weather model returned no data for these coordinates." />
      ) : (
        <>
          <div className="rw-wx-now">
            <span className="rw-wx-temp">{Math.round(current.temperature_2m)}<sup>°C</sup></span>
            <div className="rw-wx-facts">
              <span><Wind size={15} />{Math.round(current.wind_speed_10m)} km/h wind</span>
              <span><Droplets size={15} />{current.relative_humidity_2m}% humidity</span>
              <span><Thermometer size={15} />{current.precipitation} mm precipitation</span>
            </div>
          </div>
          <p className="faint xsmall rw-wx-stamp">Now at {race.Circuit.Location.locality}{current.time ? ` · ${current.time.replace("T", " ")} local` : ""}</p>
          {hours.length ? (
            <div className="rw-wx-day">
              <div className="rw-wx-day-head">
                <strong>Race day · {dayLabel}</strong>
                {atStart && <span className="chip accent"><FlagIcon />Lights out · {atStart.rain}% rain · {Math.round(atStart.temp)}°C</span>}
              </div>
              <div className="rw-wx-bars" role="img" aria-label={`Hourly rain probability on race day, peaking at ${Math.max(...hours.map((h) => h.rain))}%`}>
                {hours.map((h) => {
                  const isStart = !!hourKey && h.t.startsWith(hourKey);
                  return (
                    <span key={h.t} className={cx("rw-wx-bar", isStart && "start")} title={`${h.t.slice(11, 16)} · ${h.rain}% rain · ${Math.round(h.temp)}°C`}>
                      <i style={{ height: `${Math.max(3, h.rain)}%` }} />
                    </span>
                  );
                })}
              </div>
              <div className="rw-wx-axis" aria-hidden><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
              <p className="faint xsmall">Hourly precipitation probability, circuit local time ({data?.timezone?.replace(/_/g, " ")}).</p>
            </div>
          ) : (
            <div className="notice rw-wx-later"><Info /><span>The race-day forecast appears once {dayLabel} is inside the model's 7-day window.</span></div>
          )}
          <p className="rw-wx-note faint xsmall">Model forecast at circuit coordinates (Open-Meteo) — not trackside sensors.</p>
        </>
      )}
      <Source value={wx.value} label="Forecast" />
    </Glass>
  );
}

/* ───────────────────────── Circuit card ───────────────────────── */
function CircuitCard({ race }: { race: RaceData }) {
  const media = circuitMedia(race.Circuit.circuitId);
  return (
    <Link to={"circuit/" + race.Circuit.circuitId} className="rw-circuit glass interactive reveal">
      <span className={cx("rw-circuit-map", !media.map && "outline")}>
        {media.map ? <Img src={media.map} alt={`${race.Circuit.circuitName} circuit map`} /> : <TrackMap circuitId={race.Circuit.circuitId} mode="static" label={`${race.Circuit.circuitName} layout`} />}
      </span>
      <span className="rw-circuit-copy">
        <span className="eyebrow"><MapPin size={13} />Circuit guide</span>
        <strong className="title-2">{race.Circuit.circuitName}</strong>
        <span className="muted"><Flag country={race.Circuit.Location.country} /> {race.Circuit.Location.locality}, {race.Circuit.Location.country}</span>
        <span className="link">Explore the circuit <ArrowRight /></span>
      </span>
    </Link>
  );
}

/* ───────────────────────── Not found ───────────────────────── */
function NotFound({ round, year, list }: { round: string; year: string; list: RaceData[] }) {
  const last = list.at(-1);
  return (
    <Glass className="rw-404 rise">
      <span className="rw-404-num" aria-hidden>{/^\d+$/.test(round) ? `R${round}` : "R?"}</span>
      <span className="eyebrow"><FlagIcon size={13} />{year} season</span>
      <h1 className="title-1">This round isn't on the calendar.</h1>
      <p className="lede">
        {list.length
          ? `The ${year} championship has ${plural(list.length, "round")}${round ? ` — “${round}” isn't one of them` : ""}.`
          : `The ${year} calendar hasn't been published yet.`}
      </p>
      <div className="rw-404-actions">
        <Link className="btn lg primary" to="calendar"><CalendarDays />Open the calendar</Link>
        {last && <Link className="btn lg glass-btn" to={"race/" + last.round}>Final round · {shortRace(last.raceName)}<ArrowRight /></Link>}
        {!last && <Link className="btn lg glass-btn" to=""><ArrowLeft />Home</Link>}
      </div>
    </Glass>
  );
}
