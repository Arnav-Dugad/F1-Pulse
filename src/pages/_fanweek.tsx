/* Home · race-week hub: live session timeline, results as they publish, weekend weather, catch-up strip. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, BellDot, CalendarPlus, Check, Clock, CloudSun, Droplets, Flag as FlagIcon, MapPin, Radio, Sparkles, Sunrise, Sunset, Timer, Trophy, Zap } from "lucide-react";
import { raceResult, useData, weather } from "../api";
import { usePrefs } from "../app/prefs";
import { Link } from "../lib/router";
import { buildCalendar } from "../domain.mjs";
import { circuitMedia, fullName, teamColor, teamShortName } from "../lib/media";
import { download, formatClock, formatDateRange, formatWeekday, relativeTime, timezoneLabel } from "../lib/format";
import { Glass, Img, Section, Skeleton, Source, StateView, cx, useNow } from "../ui/core";
import { DriverAvatar, Flag, TeamLogo } from "../ui/media";
import { Countdown } from "../ui/countdown";
import { emptyEnv, localClock, sessionStates, sessionWindows, weekendDates, type ResultKind, type SessionWindow } from "./_fan";
import type { Envelope, Race, Result } from "../types";
import "./_fanweek.css";

const KEY: Record<ResultKind, "QualifyingResults" | "SprintResults" | "Results"> = { qualifying: "QualifyingResults", sprint: "SprintResults", results: "Results" };
const TITLE: Record<ResultKind, string> = { qualifying: "Qualifying", sprint: "Sprint", results: "Grand Prix" };

/**
 * A session's classification, requested only once the session should be over and re-checked
 * every five minutes until Jolpica publishes it (the request layer caches for five minutes).
 */
function useSessionResult(season: string, round: string, kind: ResultKind, ready: boolean) {
  const [poll, setPoll] = useState(0);
  const r = useData<Race | undefined>(() => (ready ? raceResult(season, round, kind) : Promise.resolve(emptyEnv<Race | undefined>(undefined))), [season, round, kind, ready, poll]);
  const rows = r.value?.data?.[KEY[kind]] || [];
  const kept = useRef<Envelope<Race | undefined> | undefined>(undefined);
  if (r.value) kept.current = r.value;
  useEffect(() => {
    if (!ready || rows.length) return;
    const t = setTimeout(() => setPoll((p) => p + 1), 5 * 60_000 + 3000);
    return () => clearTimeout(t);
  }, [ready, rows.length, poll]);
  const value = r.value ?? kept.current;
  return { value, rows: (value?.data?.[KEY[kind]] || []) as Result[], loading: r.loading && !kept.current, error: r.error, reload: r.reload, ready };
}

export function RaceWeekHub({ race, total, season, last }: { race: Race; total: number; season: string; last: number | null }) {
  const { timezone } = usePrefs();
  const now = useNow(15_000);
  const sessions = sessionWindows(race);
  const states = sessionStates(sessions, now);
  const media = circuitMedia(race.Circuit.circuitId);
  const nextIdx = states.indexOf("next");
  const liveIdx = states.indexOf("live");
  const next = nextIdx >= 0 ? sessions[nextIdx] : undefined;
  const live = liveIdx >= 0 ? sessions[liveIdx] : undefined;
  const start = sessions[0]?.date || race.date;

  const end = (label: string) => sessions.find((s) => s.label === label);
  const quali = end("Qualifying"), sprint = end("Sprint"), gp = end("Grand Prix");
  const results = {
    qualifying: useSessionResult(season, race.round, "qualifying", !!quali && now >= quali.end),
    sprint: useSessionResult(season, race.round, "sprint", !!sprint && now >= sprint.end),
    results: useSessionResult(season, race.round, "results", !!gp && now >= gp.end),
  };

  return (
    <>
      <section className="hero fw-hero">
        <div className="hero-media">
          <Img src={media.hero} alt="" eager />
          <span className="hero-scrim" />
        </div>
        <div className="hero-inner fw-inner">
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow rise"><span className="dot live" />Race week · Round {race.round} of {total}</span>
            <h1 className="display hero-title rise" style={{ "--i": 1 } as CSSProperties}>
              {race.raceName.replace(/ Grand Prix$/, "")}
              <span>Grand Prix</span>
            </h1>
            <p className="hero-place rise" style={{ "--i": 2 } as CSSProperties}>
              <Flag country={race.Circuit.Location.country} large />
              <span>{race.Circuit.circuitName}<small>{race.Circuit.Location.locality} · {formatDateRange(start, race.date)}</small></span>
            </p>
            <div className="fw-now rise" style={{ "--i": 3 } as CSSProperties}>
              {live && (
                <span className="fw-live-chip"><Radio size={14} /><b>{live.label}</b> is on now<small>· estimated {Math.max(1, Math.round((live.end - now) / 60e3))} min left</small></span>
              )}
              {next ? (
                <>
                  <span className="fw-next-label">{live ? "Then" : "Next up"} · <b>{next.label}</b></span>
                  <Countdown target={next.start} label={next.label === "Grand Prix" ? "Lights out" : next.label} doneText={`${next.label} — under way`} />
                  <p className="hero-start"><Clock size={14} />{formatWeekday(next.date, next.time, timezone)} {formatClock(next.date, next.time, timezone)} · {timezoneLabel(timezone)}</p>
                </>
              ) : !live ? (
                <span className="fw-live-chip done"><FlagIcon size={14} /><b>Chequered flag</b><small>· the weekend's sessions are complete</small></span>
              ) : null}
            </div>
            <div className="hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
              <Link className="btn lg primary" to={"race/" + race.round}>Race weekend<ArrowRight /></Link>
              <button className="btn lg glass-btn" onClick={() => download(`f1-pulse-${race.season}-r${race.round}.ics`, buildCalendar([race], true), "text/calendar;charset=utf-8")}>
                <CalendarPlus />Add to calendar
              </button>
            </div>
          </div>
          <Timeline sessions={sessions} states={states} now={now} results={results} />
        </div>
      </section>

      <SinceLastVisit last={last} now={now} sessions={sessions} results={results} />

      <Section id="race-week" title="This weekend" subtitle="Classifications appear here as soon as the data source publishes them."
        action={<Link className="btn sm" to={"circuit/" + race.Circuit.circuitId}>Circuit guide<ArrowRight /></Link>}>
        <div className="fw-grid">
          {(["qualifying", "sprint", "results"] as ResultKind[]).map((k, i) => {
            const s = k === "qualifying" ? quali : k === "sprint" ? sprint : gp;
            if (!s) return null;
            return <ResultCard key={k} kind={k} session={s} state={states[sessions.indexOf(s)]} res={results[k]} round={race.round} index={i} season={race.season} />;
          })}
          <WeekendWeather race={race} />
        </div>
      </Section>
    </>
  );
}

/* ─────────── Session timeline ─────────── */
type ResultMap = Record<ResultKind, ReturnType<typeof useSessionResult>>;
function Timeline({ sessions, states, now, results }: { sessions: SessionWindow[]; states: string[]; now: number; results: ResultMap }) {
  const { timezone } = usePrefs();
  return (
    <div className="fw-tl rise" style={{ "--i": 2 } as CSSProperties}>
      <div className="fw-tl-head">
        <span><Timer size={14} />Weekend timeline</span>
        <small>{timezoneLabel(timezone)}</small>
      </div>
      <ol className="fw-tl-list">
        {sessions.map((s, i) => {
          const st = states[i];
          const published = s.kind ? results[s.kind].rows.length > 0 : false;
          const progress = st === "live" ? Math.min(1, (now - s.start) / (s.end - s.start)) : 0;
          return (
            <li key={s.label} className={cx("fw-tl-item", st, s.label === "Grand Prix" && "gp")} style={{ "--p": progress } as CSSProperties}>
              <span className="fw-tl-mark" aria-hidden>{st === "done" ? <Check size={13} /> : st === "live" ? <span className="fw-pulse" /> : <span className="fw-ring" />}</span>
              <span className="fw-tl-main">
                <strong>{s.label}</strong>
                <small>{formatWeekday(s.date, s.time, timezone)} · {formatClock(s.date, s.time, timezone)}</small>
              </span>
              <span className="fw-tl-state">
                {st === "done" ? (s.kind ? (published ? <em className="ok">Results in</em> : <em>Awaiting results</em>) : <em>Done</em>)
                  : st === "live" ? <em className="live">Live</em>
                  : st === "next" ? <em className="next">{relativeTime(new Date(s.start).toISOString(), now)}</em>
                  : <em className="later">{relativeTime(new Date(s.start).toISOString(), now)}</em>}
              </span>
              {st === "live" && <span className="fw-tl-bar" aria-label={`About ${Math.round(progress * 100)}% through the session's usual length`}><i /></span>}
            </li>
          );
        })}
      </ol>
      <p className="fw-tl-note">Live status estimated from published start times and typical session lengths.</p>
    </div>
  );
}

/* ─────────── Since your last visit ─────────── */
function SinceLastVisit({ last, now, sessions, results }: { last: number | null; now: number; sessions: SessionWindow[]; results: ResultMap }) {
  if (last === null)
    return (
      <Glass className="fw-since reveal">
        <span className="fw-since-icon"><Sparkles size={16} /></span>
        <div className="fw-since-body">
          <strong>Welcome to race week</strong>
          <span className="muted small">From your next visit, this strip lists the sessions and results that landed while you were away.</span>
        </div>
      </Glass>
    );
  const items: { key: string; icon: "flag" | "trophy" | "live"; text: string; at: number }[] = [];
  for (const s of sessions) {
    if (s.end > last && s.end <= now) {
      const published = s.kind && results[s.kind].rows.length > 0;
      items.push({ key: s.label, icon: published ? "trophy" : "flag", text: published ? `${s.label} — classification published` : `${s.label} finished${s.kind ? " · results pending" : ""}`, at: s.end });
    } else if (s.start > last && s.start <= now && s.end > now) {
      items.push({ key: s.label, icon: "live", text: `${s.label} started`, at: s.start });
    }
  }
  items.sort((a, b) => b.at - a.at);
  return (
    <Glass className="fw-since reveal">
      <span className="fw-since-icon"><BellDot size={16} /></span>
      <div className="fw-since-body">
        <strong>Since your last visit <span className="faint">· {relativeTime(new Date(last).toISOString(), now)}</span></strong>
        {items.length ? (
          <ul className="fw-since-list">
            {items.map((it) => (
              <li key={it.key} className={it.icon}>
                {it.icon === "trophy" ? <Trophy size={13} /> : it.icon === "live" ? <Radio size={13} /> : <FlagIcon size={13} />}
                {it.text}
                <small>{relativeTime(new Date(it.at).toISOString(), now)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted small">You're all caught up — no sessions have finished since then.</span>
        )}
      </div>
    </Glass>
  );
}

/* ─────────── Result cards ─────────── */
function ResultCard({ kind, session, state, res, round, index, season }: {
  kind: ResultKind; session: SessionWindow; state: string; res: ReturnType<typeof useSessionResult>; round: string; index: number; season: string;
}) {
  const { timezone } = usePrefs();
  const rows = res.rows;
  const time = (r: Result) => (kind === "qualifying" ? r.Q3 || r.Q2 || r.Q1 || "—" : r.Time?.time || r.status);
  return (
    <Glass className={cx("card fw-res reveal", rows.length > 0 && "has-rows")} style={{ "--i": index } as CSSProperties}>
      <div className="fw-res-head">
        <span className="eyebrow">{kind === "results" ? <FlagIcon size={13} /> : kind === "sprint" ? <Zap size={13} /> : <Timer size={13} />}{TITLE[kind]}</span>
        {rows.length > 0 ? <span className="chip green"><Check />Published</span> : state === "done" ? <span className="chip yellow">Awaiting data</span> : state === "live" ? <span className="chip accent"><span className="live-dot" />Live</span> : <span className="chip">{formatWeekday(session.date, session.time, timezone)} {formatClock(session.date, session.time, timezone)}</span>}
      </div>
      {!res.ready ? (
        <div className="fw-res-wait">
          <Clock />
          <p>{state === "live" ? `${TITLE[kind]} is running. ` : ""}The classification appears here as soon as it's published after the session.</p>
        </div>
      ) : res.loading ? (
        <div className="stack"><Skeleton h={58} r={18} /><Skeleton h={58} r={18} /><Skeleton h={58} r={18} /></div>
      ) : res.error && !rows.length ? (
        <StateView error={res.error} onRetry={res.reload} />
      ) : !rows.length ? (
        <div className="fw-res-wait">
          <Clock />
          <p>Not published yet — official classifications usually follow within an hour or two. We check again every five minutes.</p>
        </div>
      ) : (
        <>
          <ol className="fw-res-top">
            {rows.slice(0, 3).map((r) => (
              <li key={r.Driver.driverId} style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
                <Link to={"driver/" + r.Driver.driverId} className="fw-res-row top">
                  <span className={cx("pos", "p" + r.position)}>{r.position}</span>
                  <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={season} team={r.Constructor.constructorId} size={40} />
                  <span className="fw-res-name"><strong>{r.Driver.familyName}</strong><small><TeamLogo id={r.Constructor.constructorId} name={r.Constructor.name} year={season} size={16} variant="color" />{teamShortName(r.Constructor.name, season)}</small></span>
                  <span className="fw-res-time">{time(r)}</span>
                </Link>
              </li>
            ))}
          </ol>
          {rows.length > 3 && (
            <ol className="fw-res-rest" start={4}>
              {rows.slice(3, 10).map((r) => (
                <li key={r.Driver.driverId} style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
                  <span className="fw-res-p">{r.position}</span>
                  <i className="fw-res-bar" />
                  <span className="fw-res-n">{r.Driver.code || r.Driver.familyName}</span>
                  <span className="fw-res-t">{time(r)}</span>
                </li>
              ))}
            </ol>
          )}
          <Link className="btn sm fw-res-cta" to={"race/" + round}>Full classification<ArrowRight /></Link>
        </>
      )}
      <Source value={rows.length ? res.value : undefined} />
    </Glass>
  );
}

/* ─────────── Weekend weather ─────────── */
function WeekendWeather({ race }: { race: Race }) {
  const { lat, long } = race.Circuit.Location;
  const w = useData(() => weather(lat, long), [lat, long]);
  const d = w.value?.data;
  const dates = weekendDates(race);
  const days = (d?.daily?.time || []).map((t, i) => ({ t, i })).filter(({ t }) => dates.includes(t));
  return (
    <Glass className="card fw-wx reveal" style={{ "--i": 3 } as CSSProperties}>
      <div className="fw-res-head">
        <span className="eyebrow"><CloudSun size={13} />Weekend weather</span>
        <span className="chip blue">Forecast model</span>
      </div>
      {w.loading ? (
        <div className="stack"><Skeleton h={70} r={18} /><Skeleton h={150} r={18} /></div>
      ) : w.error ? (
        <StateView error={w.error} onRetry={w.reload} />
      ) : !d ? (
        <StateView empty emptyTitle="No forecast" />
      ) : (
        <>
          {d.current && (
            <div className="fw-wx-now">
              <span className="fw-wx-temp">{Math.round(d.current.temperature_2m)}<sup>°C</sup></span>
              <span className="muted small">Now at the circuit<br />{d.current.relative_humidity_2m}% humidity · {Math.round(d.current.wind_speed_10m)} km/h wind</span>
            </div>
          )}
          {days.length ? (
            <ul className="fw-wx-days">
              {days.map(({ t, i }) => {
                const daily = d.daily!;
                const rain = daily.precipitation_probability_max?.[i];
                return (
                  <li key={t}>
                    <span className="fw-wx-day">{new Date(t + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</span>
                    <span className="fw-wx-t"><b>{Math.round(daily.temperature_2m_max[i])}°</b><small>{Math.round(daily.temperature_2m_min[i])}°</small></span>
                    <span className={cx("fw-wx-rain", (rain ?? 0) >= 40 && "wet")}><Droplets size={12} />{rain != null && Number.isFinite(rain) ? `${Math.round(rain)}%` : "—"}</span>
                    <span className="fw-wx-sun"><Sunrise size={12} />{localClock(daily.sunrise[i])}<Sunset size={12} />{localClock(daily.sunset[i])}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small">The seven-day forecast doesn't reach the weekend's sessions yet.</p>
          )}
          <p className="source"><MapPin size={12} />Open-Meteo model at the circuit coordinates — not trackside sensors. Sunrise and sunset in circuit local time{d.timezone ? ` (${d.timezone.replace(/_/g, " ")})` : ""}.</p>
        </>
      )}
      <Source value={w.value} label="Weather" />
    </Glass>
  );
}
