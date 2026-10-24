import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, Bell, BellRing, CalendarPlus, Check, ChevronDown, ChevronRight, Clock, LayoutGrid, ListTree, Search, Trophy, X, Zap } from "lucide-react";
import { allResults, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { buildCalendar } from "../domain.mjs";
import { splitCalendar, useCalendar } from "../lib/season";
import { circuitMedia, fullName, teamColor, teamShortName } from "../lib/media";
import { countdown, download, formatDateRange, formatSession, plural, sessionDate, timezoneLabel } from "../lib/format";
import { Glass, Img, Page, Segmented, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag, TrackMap } from "../ui/media";
import { RaceCard } from "../ui/cards";
import type { Driver, Race, Team } from "../types";
import { downloadWithAlarms, LEAD_MIN, ReminderNote, SessionReminders, useReminders } from "../ui/reminders";
import "./calendar.css";
import "./_calendar-alarms.css";

type Filter = "all" | "upcoming" | "completed" | "sprint";
type View = "grid" | "timeline";
type Winner = { driver: Driver; team: Team; time?: string };

/** A race counts as finished 2.5 h after lights out (same rule as the home page). */
const RACE_WINDOW = 2.5 * 3600e3;
const raceStart = (r: Race) => sessionDate(r.date, r.time).getTime();
const isDone = (r: Race, now: number) => raceStart(r) + RACE_WINDOW <= now;
const weekendStartDate = (r: Race) => r.FirstPractice?.date || r.SprintQualifying?.date || r.Qualifying?.date || r.date;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const FILTERS: Filter[] = ["all", "upcoming", "completed", "sprint"];

export default function Calendar({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle(`${year} calendar`);
  const cal = useCalendar(season);
  const results = useData(() => allResults(season), [season]);
  const now = useNow(30_000);
  const list = cal.value?.data || [];
  const { next, previous } = splitCalendar(list, now);

  const winners = useMemo(() => {
    const m = new Map<string, Winner>();
    for (const r of results.value?.data || []) {
      const w = r.Results?.find((x) => x.position === "1");
      if (w) m.set(r.round, { driver: w.Driver, team: w.Constructor, time: w.Time?.time });
    }
    return m;
  }, [results.value]);

  const lastWinner = previous ? winners.get(previous.round) : undefined;
  useAmbient(lastWinner ? teamColor(lastWinner.team) : undefined);

  const [filter, setFilterState] = useState<Filter>(() => {
    const f = route.query.get("filter") as Filter | null;
    return f && FILTERS.includes(f) ? f : "all";
  });
  const [view, setViewState] = useState<View>(() => (route.query.get("view") === "timeline" ? "timeline" : "grid"));
  const [q, setQState] = useState(() => route.query.get("q") || "");
  const setFilter = (f: Filter) => { setFilterState(f); setQuery({ filter: f === "all" ? null : f }); };
  const setView = (v: View) => { setViewState(v); setQuery({ view: v === "grid" ? null : v }); };
  const setQ = (v: string) => { setQState(v); setQuery({ q: v.trim() || null }); };

  const counts = useMemo(() => ({
    all: list.length,
    upcoming: list.filter((r) => !isDone(r, now)).length,
    completed: list.filter((r) => isDone(r, now)).length,
    sprint: list.filter((r) => r.Sprint).length,
  }), [list, now]);

  const shown = useMemo(() => {
    const needle = norm(q.trim());
    return list.filter((r) => {
      if (filter === "upcoming" && isDone(r, now)) return false;
      if (filter === "completed" && !isDone(r, now)) return false;
      if (filter === "sprint" && !r.Sprint) return false;
      if (!needle) return true;
      return norm(`${r.raceName} ${r.Circuit.circuitName} ${r.Circuit.Location.locality} ${r.Circuit.Location.country}`).includes(needle);
    });
  }, [list, filter, q, now]);

  if (cal.loading)
    return (
      <Page className="cal">
        <Skeleton h="min(62vh, 560px)" r={36} />
        <Skeleton h={58} r={22} style={{ marginTop: 22 }} />
        <div className="cal-grid" style={{ marginTop: 22 }}>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={300} r={28} />)}
        </div>
      </Page>
    );
  if (cal.error)
    return (
      <Page className="cal">
        <StateView error={cal.error} onRetry={cal.reload} />
      </Page>
    );
  if (!list.length)
    return (
      <Page className="cal">
        <StateView empty emptyTitle={`The ${year} calendar isn't published yet`} emptyText="Rounds appear here as soon as the schedule is released by the data provider." />
      </Page>
    );

  const filterLabel = (f: Filter, text: string) => ({ value: f, label: <>{text}<span className="cal-count">{counts[f]}</span></> });

  return (
    <Page className="cal">
      <CalendarHero races={list} year={year} next={next} winners={winners} now={now} />

      <Glass className="cal-controls reveal">
        <Segmented
          label="Filter rounds"
          value={filter}
          onChange={setFilter}
          options={[filterLabel("all", "All"), filterLabel("upcoming", "Upcoming"), filterLabel("completed", "Completed"), filterLabel("sprint", "Sprint")]}
        />
        <label className="search-input cal-search">
          <Search />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Race, country or circuit" aria-label="Search races by name, country or circuit" />
          {q && <button type="button" className="cal-clear" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}
        </label>
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: <span className="cal-view-opt"><LayoutGrid size={15} /><span>Grid</span></span> },
            { value: "timeline", label: <span className="cal-view-opt"><ListTree size={15} /><span>Timeline</span></span> },
          ]}
        />
      </Glass>
      <p className="cal-summary faint small" aria-live="polite">
        {shown.length === list.length ? `All ${plural(list.length, "round")}` : `Showing ${shown.length} of ${list.length} rounds`}
        {results.loading && " · loading winners…"}
      </p>

      {shown.length === 0 ? (
        <Glass className="state cal-empty">
          <Search />
          <h3>No rounds match</h3>
          <p>{q ? `Nothing on the ${year} calendar matches “${q}”` : "No rounds fit this filter"}{filter !== "all" ? ` in ${filter === "sprint" ? "sprint weekends" : filter + " races"}` : ""}.</p>
          <button className="btn sm" onClick={() => { setQ(""); setFilter("all"); }}>Show all rounds</button>
        </Glass>
      ) : view === "grid" ? (
        <LayoutGroup>
          <motion.div layout className="cal-grid">
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((r, i) => (
                <motion.div
                  key={r.round}
                  layout
                  initial={{ opacity: 0, scale: 0.94, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  className="cal-cell"
                >
                  <RaceCard race={r} next={r.round === next?.round} winner={winners.get(r.round)} index={i} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      ) : (
        <Timeline races={shown} next={next} winners={winners} now={now} year={year} />
      )}

      <Source value={cal.value} label="Schedule" />
      <Source value={results.value} label="Winners" />
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function CalendarHero({ races, year, next, winners, now }: { races: Race[]; year: string; next?: Race; winners: Map<string, Winner>; now: number }) {
  const done = races.filter((r) => isDone(r, now)).length;
  const sprints = races.filter((r) => r.Sprint).length;
  const countries = new Set(races.map((r) => r.Circuit.Location.country)).size;
  const feature = next || races.at(-1)!;
  const media = circuitMedia(feature.Circuit.circuitId);
  const ics = (all: boolean) =>
    download(`f1-pulse-${year}-${all ? "all-sessions" : "races"}.ics`, buildCalendar(races, all), "text/calendar;charset=utf-8");

  return (
    <section className="cal-hero">
      <div className="cal-hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="cal-hero-scrim" />
      </div>
      <div className="cal-hero-inner">
        <div className="cal-hero-copy">
          <span className="eyebrow cal-hero-eyebrow rise"><span className={cx("dot", next && "live")} />Formula 1 World Championship</span>
          <h1 className="display cal-hero-title rise" style={{ "--i": 1 } as CSSProperties}>
            {year}
            <span>Season calendar</span>
          </h1>
          <p className="cal-hero-facts rise" style={{ "--i": 2 } as CSSProperties}>
            <span><b>{races.length}</b> Grands Prix</span>
            {sprints > 0 && <span><b>{sprints}</b> sprint weekends</span>}
            <span><b>{countries}</b> countries</span>
          </p>

          <div className="cal-progress rise" style={{ "--i": 3 } as CSSProperties}>
            <div className="cal-progress-head">
              <span><b>{done}</b> of {races.length} rounds complete</span>
              {next ? <NextChip race={next} /> : <span className="cal-chip-glass"><Check size={13} />Season complete</span>}
            </div>
            <div className="cal-strip" role="list" aria-label="Season progress by round">
              {races.map((r, i) => {
                const w = winners.get(r.round);
                const finished = isDone(r, now);
                const isNext = r.round === next?.round;
                return (
                  <Link
                    key={r.round}
                    role="listitem"
                    to={"race/" + r.round}
                    className={cx("cal-tick", finished && "done", isNext && "next", r.Sprint && "sprint")}
                    style={{ "--tint": w ? teamColor(w.team) : undefined, "--i": i } as CSSProperties}
                    title={`R${r.round} · ${r.raceName}${w ? ` — won by ${fullName(w.driver)}` : isNext ? " — next up" : ""}`}
                    aria-label={`Round ${r.round}, ${r.raceName}${w ? `, won by ${fullName(w.driver)}` : finished ? ", completed" : isNext ? ", next race" : ", upcoming"}`}
                  />
                );
              })}
            </div>
            <div className="cal-strip-scale" aria-hidden><span>R1</span><span>R{races.at(-1)?.round}</span></div>
          </div>

          <div className="cal-hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
            <button className="btn lg primary" onClick={() => ics(false)}><CalendarPlus />Race calendar</button>
            <button className="btn lg glass-btn" onClick={() => ics(true)}><CalendarPlus />Every session</button>
            <button className="btn lg glass-btn calx-alarm-btn" onClick={() => downloadWithAlarms(races, `f1-pulse-${year}-all-sessions-reminders.ics`)}
              aria-label={`Download every session with reminders ${LEAD_MIN} minutes before each start`}><Bell />Download with reminders</button>
          </div>
          <p className="cal-hero-note rise" style={{ "--i": 5 } as CSSProperties}>.ics files work with Apple Calendar, Google Calendar and Outlook. Times follow the published schedule. “Download with reminders” adds a {LEAD_MIN}-minute alert before every session — your calendar app fires it even when F1 Pulse is closed.</p>
        </div>

        {next ? <NextCard race={next} /> : <SeasonCard races={races} winners={winners} year={year} />}
      </div>
    </section>
  );
}

function NextChip({ race }: { race: Race }) {
  const now = useNow(1000);
  const c = countdown(raceStart(race), now);
  return (
    <span className="cal-chip-glass accent" role="timer" aria-label={`Next race in ${c.days} days ${c.hours} hours`}>
      <span className="cal-live" />
      {c.done ? "Race underway" : <>Next race in <b>{c.days > 0 && `${c.days}d `}{String(c.hours).padStart(2, "0")}h {String(c.minutes).padStart(2, "0")}m</b></>}
    </span>
  );
}

function NextCard({ race }: { race: Race }) {
  const { timezone } = usePrefs();
  return (
    <Link to={"race/" + race.round} className="cal-next rise" style={{ "--i": 2 } as CSSProperties} aria-label={`Next race: ${race.raceName}`}>
      <span className="cal-next-head">
        <span className="eyebrow"><span className="cal-live" />Next up · Round {race.round}</span>
        {race.Sprint && <span className="cal-chip-glass yellow"><Zap size={12} />Sprint</span>}
      </span>
      <span className="cal-next-track"><TrackMap circuitId={race.Circuit.circuitId} label={`${race.Circuit.circuitName} layout`} /></span>
      <span className="cal-next-name">
        <Flag country={race.Circuit.Location.country} large />
        <strong>{race.raceName}</strong>
      </span>
      <span className="cal-next-meta">{race.Circuit.circuitName} · {formatDateRange(weekendStartDate(race), race.date)}</span>
      <span className="cal-next-time"><Clock size={13} />Lights out {formatSession(race.date, race.time, timezone)} · {timezoneLabel(timezone)}</span>
      <span className="cal-next-cta">Race weekend <ArrowRight size={15} /></span>
    </Link>
  );
}

function SeasonCard({ races, winners, year }: { races: Race[]; winners: Map<string, Winner>; year: string }) {
  const tally = new Map<string, { w: Winner; n: number }>();
  for (const w of winners.values()) {
    const t = tally.get(w.driver.driverId);
    if (t) t.n++;
    else tally.set(w.driver.driverId, { w, n: 1 });
  }
  const top = [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 4);
  if (!top.length) return null;
  return (
    <div className="cal-next cal-season rise" style={{ "--i": 2 } as CSSProperties}>
      <span className="eyebrow"><Trophy size={13} />Most wins in {year}</span>
      <ol className="cal-season-list">
        {top.map(({ w, n }) => (
          <li key={w.driver.driverId} style={{ "--tint": teamColor(w.team) } as CSSProperties}>
            <DriverAvatar id={w.driver.driverId} name={fullName(w.driver)} year={year} team={w.team.constructorId} size={40} />
            <span><strong>{fullName(w.driver)}</strong><small>{teamShortName(w.team.name, year)}</small></span>
            <b>{n}</b>
          </li>
        ))}
      </ol>
      <span className="cal-next-meta">{plural(tally.size, "different winner")} across {plural(races.length, "round")}</span>
    </div>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */
function Timeline({ races, next, winners, now, year }: { races: Race[]; next?: Race; winners: Map<string, Winner>; now: number; year: string }) {
  const groups = useMemo(() => {
    const out: { key: string; label: string; races: Race[] }[] = [];
    for (const r of races) {
      const d = new Date(r.date + "T12:00:00Z");
      const key = r.date.slice(0, 7);
      const g = out.at(-1);
      if (g?.key === key) g.races.push(r);
      else out.push({ key, label: d.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" }), races: [r] });
    }
    return out;
  }, [races]);
  // Where does "now" sit among the visible rounds?
  const firstUpcoming = races.find((r) => !isDone(r, now));
  const markerAtEnd = !!next && !firstUpcoming;
  const markerAtStart = !!next && !!firstUpcoming && races[0] === firstUpcoming;
  const markerBefore = next && firstUpcoming && !markerAtStart ? firstUpcoming.round : null;
  // The progress line is lit from the top of the timeline down to the "now" marker.
  const litUntil = !next || markerAtEnd ? groups.length : markerBefore ? groups.findIndex((g) => g.races.some((r) => r.round === markerBefore)) : -1;
  const today = new Date(now).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const [remOpen, setRemOpen] = useState<string | null>(null);
  const nowMarker = (
    <motion.li key="now" layout className={cx("cal-now", !markerAtStart && "lit")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <span className="cal-now-dot" aria-hidden />
      <span className="cal-now-label">Today · {today}</span>
    </motion.li>
  );

  return (
    <LayoutGroup>
      <div className="cal-tl">
        {markerAtStart && <ol className="cal-tl-list">{nowMarker}</ol>}
        <AnimatePresence initial={false}>
          {groups.map((g, gi) => (
            <motion.section key={g.key} layout className="cal-tl-month" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.h3 layout="position" className={cx("cal-tl-heading", gi <= litUntil && "done")}>
                <span>{g.label}</span><small>{plural(g.races.length, "round")}</small>
              </motion.h3>
              <ol className="cal-tl-list">
                <AnimatePresence initial={false}>
                  {g.races.flatMap((r) => {
                    const items: ReactElement[] = [];
                    if (markerBefore === r.round) items.push(nowMarker);
                    items.push(
                      <motion.li
                        key={r.round}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 420, damping: 38 }}
                        className={cx("cal-tl-item", isDone(r, now) && "done")}
                      >
                        <div className="calx-item">
                          <TimelineRow race={r} next={r.round === next?.round} done={isDone(r, now)} winner={winners.get(r.round)} year={year} />
                          {!isDone(r, now) && <RowReminderToggle race={r} open={remOpen === r.round} onToggle={() => setRemOpen((o) => (o === r.round ? null : r.round))} />}
                        </div>
                      </motion.li>,
                    );
                    if (remOpen === r.round && !isDone(r, now))
                      items.push(
                        <motion.li key={r.round + "-reminders"} layout className="calx-panel-li" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          transition={{ type: "spring", stiffness: 420, damping: 38 }}>
                          <RowReminderPanel race={r} />
                        </motion.li>,
                      );
                    return items;
                  })}
                </AnimatePresence>
              </ol>
            </motion.section>
          ))}
        </AnimatePresence>
        {markerAtEnd && <ol className="cal-tl-list">{nowMarker}</ol>}
      </div>
    </LayoutGroup>
  );
}

function TimelineRow({ race, next, done, winner, year }: { race: Race; next: boolean; done: boolean; winner?: Winner; year: string }) {
  const { timezone } = usePrefs();
  const tint = winner ? teamColor(winner.team) : undefined;
  return (
    <Link to={"race/" + race.round} className={cx("cal-row", done && "done", next && "next")} style={{ "--tint": tint } as CSSProperties}>
      <span className="cal-node" aria-hidden>{done ? <Check size={12} strokeWidth={3} /> : next ? <span className="cal-live" /> : null}</span>
      <span className="cal-row-round">R{race.round}</span>
      <Flag country={race.Circuit.Location.country} large className="cal-row-flag" />
      <span className="cal-row-main">
        <strong>{race.raceName}</strong>
        <small>{race.Circuit.circuitName} · {race.Circuit.Location.locality}</small>
      </span>
      <span className="cal-row-meta">
        <span className="cal-row-r">R{race.round}</span>
        <span className="cal-row-date">{formatDateRange(weekendStartDate(race), race.date)}</span>
        {race.Sprint && <span className="chip yellow"><Zap />Sprint</span>}
        {next && <span className="chip accent">Next</span>}
      </span>
      <span className="cal-row-end">
        {winner ? (
          <span className="cal-winner" title={`Winner: ${fullName(winner.driver)}, ${winner.team.name}`}>
            <DriverAvatar id={winner.driver.driverId} name={fullName(winner.driver)} year={year} team={winner.team.constructorId} size={30} />
            <span><b>{winner.driver.familyName}</b><small>{teamShortName(winner.team.name, year)}</small></span>
          </span>
        ) : done ? (
          <span className="faint small">Results pending</span>
        ) : (
          <span className="cal-time"><Clock size={13} />{formatSession(race.date, race.time, timezone)}</span>
        )}
      </span>
      <ChevronRight size={18} className="cal-row-arrow" aria-hidden />
    </Link>
  );
}

/* ───────────────────────── Session reminders ───────────────────────── */
/** Bell beside an upcoming round; opens that weekend's session list (one round at a time). */
function RowReminderToggle({ race, open, onToggle }: { race: Race; open: boolean; onToggle: () => void }) {
  const { items } = useReminders();
  const count = items.filter((r) => r.season === race.season && r.round === race.round).length;
  return (
    <button type="button" className={cx("calx-toggle", count > 0 && "on", open && "open")} aria-expanded={open} aria-controls={`calx-rem-${race.round}`} onClick={onToggle}
      aria-label={`Session reminders for the ${race.raceName}${count ? ` (${plural(count, "reminder")} set)` : ""}`}>
      {count ? <BellRing size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
      {count > 0 && <span className="calx-count" aria-hidden>{count}</span>}
      <ChevronDown size={13} className="calx-chev" aria-hidden />
    </button>
  );
}

function RowReminderPanel({ race }: { race: Race }) {
  const { timezone } = usePrefs();
  const [message, setMessage] = useState("");
  return (
    <div id={`calx-rem-${race.round}`} className="calx-panel-inner" role="group" aria-label={`${race.raceName} session reminders`}>
      <span className="eyebrow">Remind me · {LEAD_MIN} min before</span>
      <SessionReminders race={race} onMessage={setMessage} timezoneFormat={(s) => formatSession(s.date, s.time, timezone)} />
      <ReminderNote races={[race]} filename={`f1-pulse-${race.season}-round-${race.round}-reminders.ics`} message={message} />
    </div>
  );
}
