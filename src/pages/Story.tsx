import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Crown, Flag as FlagIcon, Pause, Play, RotateCcw,
  Sparkles, TrendingUp, Trophy, Zap,
} from "lucide-react";
import { allResults, request, standings, teamStandings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, navigate, setQuery, type Route } from "../lib/router";
import { shortRace, useCalendar, useSeasonProgress, type SeasonProgress } from "../lib/season";
import { circuitMedia, driverMedia, fullName, initials, teamColor, teamOf, teamShortName } from "../lib/media";
import { formatDay, ordinal, plural, pts } from "../lib/format";
import { Img, Page, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, TeamLogo, TrackMap } from "../ui/media";
import { ProgressNote } from "../ui/progress-note";
import { PIT_LANE_FROM, clinchIndex, pointsSystem, storyChapters, weekendMax, type StoryChapter, type StoryFact } from "../season-analytics.mjs";
import { RankDelta, emptyEnvelope, reducedMotionNow } from "./_champ";
import { careerBefore, useSprints } from "./_season";
import type { Driver, Result, Team, TeamStanding } from "../types";
import "./story.css";

const AUTOPLAY_MS = 7000;
const FIRST_SEASON = 1950;

export default function Story({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle(`${year} Season Story`);
  return <StoryBook key={season} route={route} season={season} year={year} />;
}

function StoryBook({ route, season, year }: { route: Route; season: string; year: string }) {
  const progress = useSeasonProgress(season, year);
  const results = useData(() => allResults(season), [season]);
  const sprints = useSprints(season, year);
  const cal = useCalendar(season);
  const ds = useData(() => standings(season), [season]);
  const cs = useData(() => (+year >= 1958 ? teamStandings(season) : Promise.resolve(emptyEnvelope<TeamStanding[]>([]))), [season]);
  const career = useData(async () => emptyEnvelope(await careerBefore(+year)), [year]);
  const p = progress.value?.data;

  const total = Math.max(cal.value?.data.length || 0, p?.rounds.length || 0);
  const clinch = useMemo(() => {
    const sys = pointsSystem(year);
    if (!sys || !p?.rounds.length || !cal.value) return null;
    const sprintRounds = new Set((sprints.value?.data || []).filter((s) => s.SprintResults?.length).map((s) => s.round));
    const done = new Set(p.rounds.map((r) => r.round));
    const calendar = cal.value.data;
    const max = calendar.map((r, i) => weekendMax(sys, { sprint: done.has(r.round) ? sprintRounds.has(r.round) : !!r.Sprint, double: sys.doubleFinale && i === calendar.length - 1 }));
    return clinchIndex(p.drivers.map((d) => d.cumulative), 0, max);
  }, [year, p, cal.value, sprints.value]);

  const chapters = useMemo<StoryChapter[]>(() => {
    if (!p || !results.value || career.loading) return [];
    const c = career.value?.data;
    return storyChapters(p, results.value.data, sprints.value?.data || [], c?.complete ? { winsBefore: c.winsBefore, priorSeasons: c.prior, clinch } : { priorSeasons: new Set(p.drivers.map((d) => d.driver.driverId)), clinch });
  }, [p, results.value, sprints.value, career.loading, career.value, clinch]);
  const historyComplete = !!career.value?.data.complete;

  const n = chapters.length;
  const last = n + 1;
  const parse = (v: string | null) => (v === "end" ? last : v && /^\d+$/.test(v) ? Math.max(0, chapters.findIndex((c) => c.round === v) + 1) : 0);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [playing, setPlaying] = useState(false);
  const wanted = route.query.get("ch");
  // Honour a shared ?ch= once the chapters exist.
  useEffect(() => { if (n) setIdx(parse(wanted)); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: number, fromAuto = false) => {
    const next = Math.max(0, Math.min(last, i));
    if (!fromAuto) setPlaying(false);
    setDir(next >= idx ? 1 : -1);
    setIdx(next);
    setQuery({ ch: next === 0 ? null : next === last ? "end" : chapters[next - 1].round });
  };
  const chHref = (i: number) => `story?ch=${i <= 0 ? "" : i >= last ? "end" : chapters[i - 1]?.round}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!playing) return;
    if (idx >= last) { setPlaying(false); return; }
    const t = window.setTimeout(() => { if (!document.hidden) go(idx + 1, true); }, AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, idx, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const ch = idx >= 1 && idx <= n ? chapters[idx - 1] : null;
  const champion = ds.value?.data[0];
  const latest = useMemo(() => new Map((p?.drivers || []).map((d) => [d.driver.driverId, d.team.constructorId])), [p]);
  const tint = ch?.winner ? teamColor(ch.winner.Constructor) : champion ? teamColor(teamOf(champion, year, latest)) : undefined;
  useAmbient(tint);

  const loading = progress.loading || results.loading || career.loading || cal.loading;
  const error = progress.error || results.error;

  return (
    <Page className="sy">
      {loading ? (
        <Skeleton h="min(78vh, 760px)" r={36} className="sy-skel" />
      ) : error ? (
        <StateView error={error} onRetry={() => { progress.reload(); results.reload(); }} />
      ) : !n ? (
        <>
          <Intro year={year} chapters={[]} total={total} onStart={() => undefined} p={p} />
          <StateView empty emptyTitle="The story hasn't started" emptyText={`No ${year} Grand Prix has been classified yet. Pick another season above.`} />
        </>
      ) : (
        <>
          <div className="sy-stage-wrap" style={{ "--tint": tint || "var(--accent)" } as CSSProperties}>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={idx}
                custom={dir}
                className="sy-motion"
                initial={reducedMotionNow() ? { opacity: 0 } : { opacity: 0, x: 60 * dir, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={reducedMotionNow() ? { opacity: 0 } : { opacity: 0, x: -40 * dir, filter: "blur(8px)" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {idx === 0 ? (
                  <Intro year={year} chapters={chapters} total={total} onStart={() => { go(1); }} p={p} />
                ) : ch ? (
                  <Chapter ch={ch} year={year} total={total} historyComplete={historyComplete} progress={p!} />
                ) : (
                  <EndCard year={year} total={total} done={n} champion={champion} team={champion && teamOf(champion, year, latest)} constructor={cs.value?.data[0]} progress={p} onRestart={() => go(1)} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <nav className="sy-controls glass" aria-label="Story navigation">
            <Link to={chHref(idx - 1)} data-swipe="prev" className={cx("sy-nav-btn", idx === 0 && "off")} aria-disabled={idx === 0} tabIndex={idx === 0 ? -1 : 0}
              onClick={(e) => { e.preventDefault(); if (idx > 0) go(idx - 1); }} aria-label="Previous chapter"><ChevronLeft /></Link>
            <button type="button" className="sy-play" onClick={() => { if (idx >= last) go(1); setPlaying((x) => !x); }} aria-pressed={playing} aria-label={playing ? "Pause autoplay" : "Autoplay chapters"}>
              {playing ? <Pause /> : <Play />}
              {playing && <span key={idx} className="sy-timer" style={{ animationDuration: AUTOPLAY_MS + "ms" }} />}
            </button>
            <Rail chapters={chapters} idx={idx} go={go} />
            <span className="sy-count" aria-live="polite">{idx === 0 ? "Intro" : idx === last ? "Finale" : `${idx} / ${n}`}</span>
            <Link to={chHref(idx + 1)} data-swipe="next" className={cx("sy-nav-btn", idx === last && "off")} aria-disabled={idx === last} tabIndex={idx === last ? -1 : 0}
              onClick={(e) => { e.preventDefault(); if (idx < last) go(idx + 1); }} aria-label="Next chapter"><ChevronRight /></Link>
          </nav>
          <p className="sy-hint faint xsmall"><span className="kbd">←</span><span className="kbd">→</span> or swipe to turn the page</p>
          <Source value={results.value} />
        </>
      )}
    </Page>
  );
}

/* ───────────────────────── Progress rail ───────────────────────── */
function Rail({ chapters, idx, go }: { chapters: StoryChapter[]; idx: number; go: (i: number) => void }) {
  const last = chapters.length + 1;
  return (
    <div className="sy-rail" role="tablist" aria-label="Chapters">
      <button role="tab" aria-selected={idx === 0} className={cx("sy-rail-dot intro", idx === 0 && "cur", idx > 0 && "done")} onClick={() => go(0)} title="Intro" aria-label="Intro"><BookOpen size={11} /></button>
      {chapters.map((c, i) => (
        <button key={c.round} role="tab" aria-selected={idx === i + 1} className={cx("sy-rail-dot", idx === i + 1 && "cur", idx > i + 1 && "done")} onClick={() => go(i + 1)} title={`Round ${c.round} · ${c.raceName}`} aria-label={`Round ${c.round}, ${c.raceName}`}>
          <Flag country={c.country} />
        </button>
      ))}
      <button role="tab" aria-selected={idx === last} className={cx("sy-rail-dot end", idx === last && "cur")} onClick={() => go(last)} title="Finale" aria-label="Finale"><Trophy size={11} /></button>
    </div>
  );
}

/* ───────────────────────── Intro ───────────────────────── */
function SeasonPicker({ year }: { year: string }) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: now - FIRST_SEASON + 1 }, (_, i) => String(now - i));
  return (
    <div className="sy-picker">
      <Link to={`story?season=${+year - 1}`} className={cx("icon-btn sy-glass-icon", +year <= FIRST_SEASON && "off")} aria-label="Previous season" aria-disabled={+year <= FIRST_SEASON} onClick={(e) => { if (+year <= FIRST_SEASON) e.preventDefault(); }}><ArrowLeft /></Link>
      <label className="field">
        <span className="sr-only">Season</span>
        <select className="select" value={year} onChange={(e) => navigate(`story?season=${e.target.value}`)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <Link to={`story?season=${+year + 1}`} className={cx("icon-btn sy-glass-icon", +year >= now && "off")} aria-label="Next season" aria-disabled={+year >= now} onClick={(e) => { if (+year >= now) e.preventDefault(); }}><ArrowRight /></Link>
    </div>
  );
}

function Intro({ year, chapters, total, onStart, p }: { year: string; chapters: StoryChapter[]; total: number; onStart: () => void; p?: SeasonProgress }) {
  const winners = new Set(chapters.map((c) => c.winner?.Driver.driverId).filter(Boolean)).size;
  const leaders = new Set(chapters.map((c) => c.top[0]?.id).filter(Boolean)).size;
  const photo = circuitMedia(chapters[0]?.circuitId).hero;
  const complete = total > 0 && chapters.length >= total;
  return (
    <section className="sy-stage sy-intro">
      <div className="sy-bg">{photo && <Img src={photo} alt="" eager />}<span className="sy-scrim" /></div>
      <div className="sy-intro-inner">
        <span className="eyebrow sy-eyebrow"><BookOpen size={14} />Season Story</span>
        <SeasonPicker year={year} />
        <h1 className="sy-year" aria-label={`${year} season`}>{year}</h1>
        <p className="sy-intro-lede">
          {chapters.length
            ? <>The {year} World Championship in {plural(chapters.length, "chapter")}{complete ? "" : ` — ${total - chapters.length} still to be written`}. Every winner, every swing in the standings, told round by round from the results.</>
            : <>Choose a season to begin.</>}
        </p>
        {chapters.length > 0 && (
          <>
            <div className="sy-intro-stats">
              <div><b>{chapters.length}</b><span>{complete ? "Rounds" : "Rounds so far"}</span></div>
              <div><b>{winners}</b><span>Different winners</span></div>
              <div><b>{leaders}</b><span>{leaders === 1 ? "Leader" : "Leaders"} of the table</span></div>
              <div><b>{p?.drivers.length || "—"}</b><span>Drivers</span></div>
            </div>
            <button className="btn lg sy-start" onClick={onStart}>Begin the story<ArrowRight /></button>
          </>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Round chapter ───────────────────────── */
function Chapter({ ch, year, total, historyComplete, progress }: { ch: StoryChapter; year: string; total: number; historyComplete: boolean; progress: SeasonProgress }) {
  const photo = circuitMedia(ch.circuitId).hero;
  const w = ch.winner;
  const circuit = ch.race?.Circuit;
  const verified = useMaidenCheck(ch, year);
  const facts = ch.facts.filter((f) => f.kind !== "podium-check" || verified.value?.data.includes(f.id));
  return (
    <section className={cx("sy-stage sy-chapter", !photo && "no-photo")} aria-label={`Round ${ch.round}: ${ch.raceName}`}>
      <div className="sy-bg">
        {photo ? <Img src={photo} alt="" eager /> : <TrackMap circuitId={ch.circuitId} mode="draw" className="sy-bg-track" label={`${circuit?.circuitName || "Circuit"} layout`} />}
        <span className="sy-scrim" />
      </div>
      <div className="sy-chapter-inner">
        <div className="sy-chapter-main">
          <span className="eyebrow sy-eyebrow"><span className="sy-round-chip">Round {ch.round}<small>/{total}</small></span>{formatDay(ch.date, { year: "numeric", month: "long" })}</span>
          <h2 className="sy-race">
            <Flag country={ch.country} large />
            <span>{shortRace(ch.raceName)}<small>{circuit ? `${circuit.circuitName} · ${circuit.Location.locality}` : ch.raceName}</small></span>
          </h2>
          {w ? <Winner r={w} year={year} /> : <p className="sy-nowinner">No classified winner was recorded.</p>}
          <Podium podium={ch.podium} year={year} />
          {ch.sprintWinner && <p className="sy-sprint"><Zap size={13} />Sprint won by <b>{fullName(ch.sprintWinner.Driver)}</b></p>}
        </div>
        <aside className="sy-panel glass">
          {facts.length > 0 && (
            <ul className="sy-facts" aria-label="Notable">
              {facts.map((f, i) => <Fact key={f.kind + f.id + i} f={f} year={year} index={ch.index} total={total} historyComplete={historyComplete} />)}
            </ul>
          )}
          <h3 className="sy-panel-title">Standings after round {ch.round}</h3>
          <ol className="sy-table">
            {ch.top.map((t) => {
              const team = progress.drivers.find((d) => d.driver.driverId === t.id)?.team;
              return (
                <li key={t.id} style={{ "--tint": teamColor(team) } as CSSProperties}>
                  <span className={cx("pos", t.rank <= 3 && "p" + t.rank)}>{t.rank}</span>
                  <RankDelta value={t.delta} title={ch.index ? "Change vs the previous round" : "First round"} />
                  <span className="sy-table-name"><i className="team-bar" /><b>{t.driver.familyName}</b></span>
                  {t.gained > 0 && <span className="sy-gain">+{pts(t.gained)}</span>}
                  <b className="sy-table-pts">{pts(t.points)}</b>
                </li>
              );
            })}
          </ol>
          <p className="sy-panel-note">Summed from race and sprint classifications.</p>
          <ProgressNote progress={progress} kind="driver" />
          <Link className="btn sm glass-btn" to={"race/" + ch.round}>Race report<ArrowRight /></Link>
        </aside>
      </div>
    </section>
  );
}

function Winner({ r, year }: { r: Result; year: string }) {
  const m = driverMedia(r.Driver.driverId, year);
  const name = fullName(r.Driver);
  const tint = teamColor(r.Constructor);
  const grid = Number(r.grid);
  return (
    <div className="sy-winner" style={{ "--tint": tint } as CSSProperties}>
      <div className="sy-winner-art">
        {m?.front ? (
          <DriverPortrait id={r.Driver.driverId} name={name} year={year} variant="front" eager className="sy-portrait" />
        ) : m?.photo ? (
          <Img src={m.photo} alt={`${name}, ${year}`} className="sy-photo" eager />
        ) : (
          <span className="sy-mono" aria-hidden><span>{initials(name)}</span></span>
        )}
      </div>
      <div className="sy-winner-copy">
        <span className="sy-label"><Trophy size={13} />Winner</span>
        <Link to={"driver/" + r.Driver.driverId} className="sy-winner-name">{r.Driver.givenName} <b>{r.Driver.familyName}</b></Link>
        <span className="sy-winner-team"><TeamLogo id={r.Constructor.constructorId} name={r.Constructor.name} year={year} size={24} />{teamShortName(r.Constructor.name, year)}{grid > 0 ? ` · from P${grid}` : grid === 0 && +year >= PIT_LANE_FROM ? " · from the pit lane" : ""}</span>
      </div>
    </div>
  );
}

function Podium({ podium, year }: { podium: Result[]; year: string }) {
  if (podium.length < 2) return null;
  return (
    <ol className="sy-podium" aria-label="Podium">
      {podium.map((r) => (
        <li key={r.Driver.driverId} style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
          <span className={cx("pos", "p" + r.position)}>{r.position}</span>
          <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={32} />
          <span><b>{r.Driver.familyName}</b><small>{teamShortName(r.Constructor.name, year)}</small></span>
        </li>
      ))}
    </ol>
  );
}

function Fact({ f, year, index, total, historyComplete }: { f: StoryFact; year: string; index: number; total: number; historyComplete: boolean }) {
  let icon: ReactNode = <Sparkles size={14} />, text: ReactNode, tone = "";
  switch (f.kind) {
    case "maiden-win":
      if (historyComplete) { text = <><b>{f.name}</b> takes his first Grand Prix win</>; tone = "gold"; icon = <Trophy size={14} />; }
      else text = <><b>{f.name}</b>'s first win of {year}</>;
      break;
    case "first-season-win": text = <><b>{f.name}</b>'s first win of {year}{historyComplete ? ` — career win no. ${f.career}` : ""}</>; break;
    case "season-win": text = <><b>{f.name}</b>'s {ordinal(f.count)} win of the season</>; break;
    case "from-grid": text = <>Won from {f.grid === 0 ? "the pit lane" : `${ordinal(f.grid)} on the grid`}</>; icon = <TrendingUp size={14} />; break;
    case "maiden-podium":
    case "podium-check": text = <>First Grand Prix podium for <b>{f.name}</b> ({ordinal(f.position)})</>; tone = "gold"; break;
    case "lead-change": text = <><b>{f.name}</b> takes the championship lead</>; icon = <Crown size={14} />; tone = "blue"; break;
    case "mover": text = <>Biggest mover: <b>{f.name}</b>, up {plural(f.gain, "place")} to {ordinal(f.to)}</>; icon = <TrendingUp size={14} />; break;
    case "clinch": {
      const left = total - 1 - index;
      text = <><b>{f.name}</b> clinches the {year} title{left > 0 ? ` with ${plural(left, "round")} to spare` : " at the final round"}</>;
      icon = <Crown size={14} />; tone = "gold";
      break;
    }
  }
  return <li className={cx("sy-fact", tone)}>{icon}<span>{text}</span></li>;
}

/** Verifies "first podium" for drivers with earlier seasons but no wins: two tiny requests per candidate, only for this chapter. */
function useMaidenCheck(ch: StoryChapter, year: string) {
  const ids = ch.facts.filter((f) => f.kind === "podium-check").map((f) => f.id);
  return useData(async () => {
    if (!ids.length) return emptyEnvelope<string[]>([]);
    const maiden: string[] = [];
    let meta = emptyEnvelope(null).meta;
    for (const id of ids) {
      let earlier = false;
      for (const pos of [2, 3]) {
        const r = await request<any>("jolpica", `drivers/${id}/results/${pos}.json`, { limit: 1 });
        meta = r.meta;
        const race = r.data.MRData.RaceTable.Races[0];
        if (race && (+race.season < +year || (+race.season === +year && +race.round < +ch.round))) { earlier = true; break; }
      }
      if (!earlier) maiden.push(id);
    }
    return { data: maiden, meta };
  }, [year, ch.round, ids.join(",")]);
}

/* ───────────────────────── Finale ───────────────────────── */
function EndCard({ year, total, done, champion, team, constructor, progress, onRestart }: {
  year: string; total: number; done: number; champion?: { Driver: Driver; points: string; wins: string }; team?: Team;
  constructor?: { Constructor: Team; points: string; wins: string }; progress?: SeasonProgress; onRestart: () => void;
}) {
  const complete = total > 0 && done >= total;
  const now = new Date().getFullYear();
  if (!champion)
    return (
      <section className="sy-stage sy-end"><div className="sy-end-inner"><StateView empty emptyTitle="No standings published" emptyText="The provider hasn't published a championship table for this season." /></div></section>
    );
  const m = driverMedia(champion.Driver.driverId, year);
  const name = fullName(champion.Driver);
  return (
    <section className="sy-stage sy-end" style={{ "--tint": teamColor(team) } as CSSProperties}>
      <div className="sy-bg"><span className="sy-end-glow" /><span className="sy-scrim" /></div>
      <div className="sy-end-inner">
        <div className="sy-end-copy">
          <span className="eyebrow sy-eyebrow"><Crown size={14} />{complete ? `${year} World Champion` : `Leader after ${plural(done, "round")} — ${total - done} to go`}</span>
          <h2 className="sy-end-name">{champion.Driver.givenName}<b>{champion.Driver.familyName}</b></h2>
          <p className="sy-end-team">{team && <TeamLogo id={team.constructorId} name={team.name} year={year} size={30} />}{team ? teamShortName(team.name, year) : ""} · {champion.Driver.nationality}</p>
          <div className="sy-intro-stats">
            <div><b>{pts(champion.points)}</b><span>Points</span></div>
            <div><b>{champion.wins}</b><span>{+champion.wins === 1 ? "Win" : "Wins"}</span></div>
            {constructor && <div><b className="sy-small-b">{teamShortName(constructor.Constructor.name, year)}</b><span>{complete ? "Constructors' champion" : "Constructors' leader"}</span></div>}
          </div>
          <div className="sy-end-actions">
            <button className="btn lg sy-start" onClick={onRestart}><RotateCcw />Replay the season</button>
            <Link className="btn lg sy-glass-btn" to="standings?view=story">Full standings<ArrowRight /></Link>
          </div>
          <div className="sy-end-more">
            {+year > FIRST_SEASON && <Link className="link" to={`story?season=${+year - 1}`}><ArrowLeft />{+year - 1} story</Link>}
            {+year < now && <Link className="link" to={`story?season=${+year + 1}`}>{+year + 1} story<ArrowRight /></Link>}
          </div>
          <ProgressNote progress={progress} kind="driver" />
        </div>
        <div className="sy-end-art">
          {m?.front ? <DriverPortrait id={champion.Driver.driverId} name={name} year={year} variant="front" eager className="sy-end-portrait" />
            : m?.photo ? <Img src={m.photo} alt={`${name}, ${year}`} className="sy-photo big" eager />
            : <span className="sy-mono big" aria-hidden><span>{initials(name)}</span><FlagIcon size={20} /></span>}
        </div>
      </div>
    </section>
  );
}
