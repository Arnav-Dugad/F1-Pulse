import { useMemo, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, ArrowRight, CalendarClock, Heart, Plus, Trophy, Users, X } from "lucide-react";
import { allResults, standings, teamStandings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { splitCalendar, useCalendar } from "../lib/season";
import { circuitMedia, fullName, teamColor, teamOf, teamShortName } from "../lib/media";
import { countdown, formatClock, formatWeekday, ordinal, plural, pts, sessionDate, timezoneLabel } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag, TeamLogo } from "../ui/media";
import { DriverCard, TeamCard } from "../ui/cards";
import type { Race, Standing, TeamStanding } from "../types";
import "./favorites.css";

const pretty = (key: string) =>
  (key.split(":")[1] || key).split(/[_-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function Favorites(_: { route: Route }) {
  useTitle("Favourites");
  const { season, year, favorites, toggleFavorite, timezone } = usePrefs();
  const ds = useData(() => standings(season), [season]);
  const cs = useData(() => teamStandings(season), [season]);
  const res = useData(() => allResults(season), [season]);
  const cal = useCalendar(season);
  const now = useNow(60_000);

  /** Latest team per driver, from the most recent classified race (Constructors arrays are not chronological). */
  const latestTeam = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of res.value?.data || []) for (const x of r.Results || []) m.set(x.Driver.driverId, x.Constructor.constructorId);
    return m;
  }, [res.value]);

  const allDrivers = ds.value?.data || [];
  const allTeams = cs.value?.data || [];
  const favDrivers = allDrivers.filter((s) => favorites.includes("driver:" + s.Driver.driverId));
  const favTeams = allTeams.filter((s) => favorites.includes("team:" + s.Constructor.constructorId));
  const ready = !ds.loading && !cs.loading;
  const present = new Set([...favDrivers.map((s) => "driver:" + s.Driver.driverId), ...favTeams.map((s) => "team:" + s.Constructor.constructorId)]);
  const missing = ready && !ds.error && !cs.error ? favorites.filter((f) => !present.has(f)) : [];

  const tints = [
    ...favDrivers.map((s) => teamColor(teamOf(s, year, latestTeam))),
    ...favTeams.map((s) => teamColor(s.Constructor)),
  ];
  useAmbient(tints[0], tints[1]);

  const { next } = splitCalendar(cal.value?.data || [], now);
  const suggestions = allDrivers.filter((s) => !favorites.includes("driver:" + s.Driver.driverId)).slice(0, 6);

  return (
    <Page className="fav">
      <FavHero
        year={year}
        favDrivers={favDrivers}
        favTeams={favTeams}
        latestTeam={latestTeam}
        next={next}
        timezone={timezone}
        count={favorites.length}
        loading={!ready}
        tint={tints[0]}
      />

      {!favorites.length ? (
        <Section title="Start with a driver" subtitle={`Tap a heart to follow someone from the ${year} championship. Saved in this browser only.`}>
          <Suggestions list={suggestions} loading={ds.loading} error={ds.error} onRetry={ds.reload} year={year} latestTeam={latestTeam} onToggle={toggleFavorite} favorites={favorites} />
          <div className="fav-empty-links reveal">
            <Link className="btn" to="drivers"><Users />Browse all drivers</Link>
            <Link className="btn" to="teams"><Trophy />Explore teams</Link>
          </div>
        </Section>
      ) : (
        <>
          {(ds.error || cs.error) && (
            <StateView error={ds.error || cs.error} onRetry={() => { ds.reload(); cs.reload(); }} />
          )}

          {(ds.loading || favDrivers.length > 0) && (
            <Section
              title="Your drivers"
              subtitle={`${year} championship position and points`}
              action={favDrivers.length >= 2 ? (
                <Link className="btn sm" to={`compare?a=${favDrivers[0].Driver.driverId}&b=${favDrivers[1].Driver.driverId}`}>
                  <ArrowLeftRight />Compare {favDrivers[0].Driver.familyName} vs {favDrivers[1].Driver.familyName}
                </Link>
              ) : undefined}
            >
              {ds.loading ? (
                <div className="fav-drivers">{Array.from({ length: Math.min(4, favorites.length) }, (_, i) => <Skeleton key={i} h={340} r={28} />)}</div>
              ) : (
                <motion.div layout className="fav-drivers">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {favDrivers.map((s, i) => (
                      <motion.div key={s.Driver.driverId} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 360, damping: 32 }}>
                        <DriverCard driver={s.Driver} team={teamOf(s, year, latestTeam)} year={year} rank={+s.position || undefined} stat={pts(s.points)} statLabel="PTS" index={i} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
              <Source value={ds.value} />
            </Section>
          )}

          {favDrivers.length > 0 && (
            <Section title="Recent form" subtitle="Last five Grand Prix classifications this season.">
              <Form drivers={favDrivers} races={res.value?.data} loading={res.loading} error={res.error} onRetry={res.reload} year={year} latestTeam={latestTeam} />
              <Source value={res.value} />
            </Section>
          )}

          {(cs.loading || favTeams.length > 0) && (
            <Section title="Your teams" subtitle={`${year} constructors' championship`}>
              {cs.loading ? (
                <div className="fav-teams"><Skeleton h={290} r={28} /><Skeleton h={290} r={28} /></div>
              ) : (
                <motion.div layout className="fav-teams">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {favTeams.map((t, i) => (
                      <motion.div key={t.Constructor.constructorId} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ type: "spring", stiffness: 360, damping: 32 }}>
                        <TeamCard
                          team={t.Constructor}
                          year={year}
                          position={t.position}
                          points={pts(t.points)}
                          index={i}
                          drivers={allDrivers.filter((s) => teamOf(s, year, latestTeam)?.constructorId === t.Constructor.constructorId).map((s) => s.Driver)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
              <Source value={cs.value} />
            </Section>
          )}

          {missing.length > 0 && (
            <Section title={`Not in ${year}`} subtitle={`No published ${year} standing for these favourites${+year < 1958 ? " (the constructors' championship began in 1958)" : ""}. They stay saved for other seasons.`}>
              <Glass className="card fav-missing reveal">
                <AnimatePresence initial={false}>
                  {missing.map((key) => {
                    const kind = key.startsWith("team:") ? "team" : "driver";
                    const name = pretty(key);
                    return (
                      <motion.div key={key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="fav-miss-row">
                        <span className="fav-miss-icon">{kind === "team" ? <Trophy size={16} /> : <Heart size={16} />}</span>
                        <Link to={`${kind}/${key.split(":")[1]}`} className="fav-miss-name">
                          <strong>{name}</strong>
                          <small>{kind === "team" ? "Team" : "Driver"} · open profile</small>
                        </Link>
                        <button type="button" className="icon-btn" onClick={() => toggleFavorite(key)} aria-label={`Remove ${name} from favourites`}><X /></button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </Glass>
            </Section>
          )}

          {suggestions.length > 0 && (
            <Section title="Add to your paddock" subtitle={`The top of the ${year} order you're not following yet.`}>
              <Suggestions list={suggestions} loading={false} year={year} latestTeam={latestTeam} onToggle={toggleFavorite} favorites={favorites} />
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function FavHero({ year, favDrivers, favTeams, latestTeam, next, timezone, count, loading, tint }: {
  year: string; favDrivers: Standing[]; favTeams: TeamStanding[]; latestTeam: Map<string, string>; next?: Race;
  timezone: string; count: number; loading: boolean; tint?: string;
}) {
  const now = useNow(1000);
  const media = circuitMedia(next?.Circuit.circuitId);
  const following = favDrivers.length + favTeams.length > 0;
  const wins = favDrivers.reduce((a, s) => a + Number(s.wins || 0), 0);
  const best = favDrivers.length ? Math.min(...favDrivers.map((s) => +s.position || 99)) : null;
  const subject = favDrivers.length
    ? favDrivers.length === 1 ? `${favDrivers[0].Driver.familyName} races` : "Your drivers race"
    : favTeams.length === 1 ? `${teamShortName(favTeams[0].Constructor.name, year)} races` : "Your teams race";
  const target = next ? sessionDate(next.date, next.time).getTime() : 0;
  const c = countdown(target, now);
  const when = c.days >= 1 ? `in ${plural(c.days, "day")}` : c.hours >= 1 ? `in ${plural(c.hours, "hour")}` : `in ${plural(c.minutes, "minute")}`;
  return (
    <section className="fav-hero" style={{ "--tint": tint || "#ff375f" } as CSSProperties}>
      <div className="fav-hero-media" aria-hidden>
        <Img src={media.hero} alt="" eager />
        <span className="fav-hero-scrim" />
      </div>
      <div className="fav-hero-inner">
        <div className="fav-hero-copy">
          <span className="eyebrow fav-eyebrow rise"><Heart size={14} fill="currentColor" />Favourites · {year}</span>
          <h1 className="display fav-title rise" style={{ "--i": 1 } as CSSProperties}>
            {count ? "Your paddock" : "Build your paddock"}
            <span>{count ? `${plural(count, "favourite")}, one place.` : "Follow the people you cheer for."}</span>
          </h1>
          {following && (
            <div className="fav-faces rise" style={{ "--i": 2 } as CSSProperties}>
              {favDrivers.slice(0, 6).map((s) => (
                <span key={s.Driver.driverId} title={fullName(s.Driver)}>
                  <DriverAvatar id={s.Driver.driverId} name={fullName(s.Driver)} year={year} team={teamOf(s, year, latestTeam)?.constructorId} size={46} />
                </span>
              ))}
              {favTeams.slice(0, 4).map((t) => (
                <span key={t.Constructor.constructorId} title={t.Constructor.name}>
                  <TeamLogo id={t.Constructor.constructorId} name={t.Constructor.name} year={year} size={46} />
                </span>
              ))}
            </div>
          )}
          {!count && (
            <p className="fav-lede rise" style={{ "--i": 2 } as CSSProperties}>
              Tap the heart on any driver or team. Their standing, form and next race gather here — no account, stored only in this browser.
            </p>
          )}
          {following && (
            <div className="fav-stats rise" style={{ "--i": 3 } as CSSProperties}>
              <span className="fav-stat"><b><Counter value={favDrivers.length} /></b><small>{favDrivers.length === 1 ? "driver" : "drivers"}</small></span>
              <span className="fav-stat"><b><Counter value={favTeams.length} /></b><small>{favTeams.length === 1 ? "team" : "teams"}</small></span>
              {favDrivers.length > 0 && <span className="fav-stat"><b><Counter value={wins} /></b><small>{year} wins</small></span>}
              {best !== null && best < 99 && <span className="fav-stat"><b>{ordinal(best)}</b><small>best position</small></span>}
            </div>
          )}
        </div>

        {next && following && !loading && (
          <Link to={"race/" + next.round} className="fav-next rise" style={{ "--i": 2 } as CSSProperties}>
            <span className="eyebrow fav-next-eyebrow"><CalendarClock size={14} />Personal countdown</span>
            <strong className="fav-next-line">{c.done ? "Race day" : `${subject} ${when}`} at <span>{next.Circuit.circuitName}</span></strong>
            <span className="fav-next-place"><Flag country={next.Circuit.Location.country} />{next.raceName} · Round {next.round}</span>
            {!c.done && (
              <span className="fav-cd" role="timer" aria-label={`${c.days} days ${c.hours} hours ${c.minutes} minutes`}>
                {([[c.days, "days"], [c.hours, "hrs"], [c.minutes, "min"], [c.seconds, "sec"]] as [number, string][]).map(([v, l]) => (
                  <span key={l} className="fav-cd-unit"><b>{String(v).padStart(2, "0")}</b><small>{l}</small></span>
                ))}
              </span>
            )}
            <span className="fav-next-time">Lights out {formatWeekday(next.date, next.time, timezone)} {formatClock(next.date, next.time, timezone)} · {timezoneLabel(timezone)}<ArrowRight size={14} /></span>
          </Link>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Suggestions ───────────────────────── */
function Suggestions({ list, loading, error, onRetry, year, latestTeam, onToggle, favorites }: {
  list: Standing[]; loading: boolean; error?: string; onRetry?: () => void; year: string; latestTeam: Map<string, string>;
  onToggle: (k: string) => void; favorites: string[];
}) {
  if (loading || error || !list.length)
    return <StateView loading={loading} error={error} onRetry={onRetry} empty emptyTitle="No standings to suggest from" emptyText={`The ${year} championship has no published standings yet.`}
      skeleton={<div className="fav-suggest">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={84} r={22} />)}</div>} />;
  return (
    <div className="fav-suggest">
      {list.map((s, i) => {
        const key = "driver:" + s.Driver.driverId;
        const on = favorites.includes(key);
        const team = teamOf(s, year, latestTeam);
        const name = fullName(s.Driver);
        return (
          <button
            key={s.Driver.driverId}
            type="button"
            className={cx("fav-pick glass reveal", on && "on")}
            style={{ "--i": i, "--tint": teamColor(team) } as CSSProperties}
            aria-pressed={on}
            aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
            onClick={() => onToggle(key)}
          >
            <span className="fav-pick-pos">P{s.position}</span>
            <DriverAvatar id={s.Driver.driverId} name={name} year={year} team={team?.constructorId} size={48} />
            <span className="fav-pick-text">
              <strong>{s.Driver.familyName}</strong>
              <small>{team ? teamShortName(team.name, year) : ""} · {pts(s.points)} pts</small>
            </span>
            <span className="fav-pick-heart" aria-hidden>{on ? <Heart size={17} fill="currentColor" /> : <Plus size={17} />}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Form ───────────────────────── */
function Form({ drivers, races, loading, error, onRetry, year, latestTeam }: {
  drivers: Standing[]; races?: Race[]; loading: boolean; error?: string; onRetry: () => void; year: string; latestTeam: Map<string, string>;
}) {
  if (loading) return <Skeleton h={76 * Math.min(drivers.length, 4) + 30} r={28} />;
  if (error) return <StateView error={error} onRetry={onRetry} />;
  const done = (races || []).filter((r) => r.Results?.length);
  if (!done.length) return <StateView empty emptyTitle="No races classified yet" emptyText="Form appears after the first Grand Prix of the season." />;
  const last = done.slice(-5);
  return (
    <Glass className="card fav-form reveal">
      <div className="fav-form-head" aria-hidden>
        <span />
        <span className="fav-form-rounds">{last.map((r) => <span key={r.round}>R{r.round}</span>)}</span>
        <span className="fav-form-pts">Pts</span>
      </div>
      <div className="list">
        {drivers.map((s) => {
          const team = teamOf(s, year, latestTeam);
          return (
            <Link key={s.Driver.driverId} to={"driver/" + s.Driver.driverId} className="list-row fav-form-row" style={{ "--tint": teamColor(team) } as CSSProperties}>
              <span className="fav-form-who">
                <i className="team-bar" />
                <DriverAvatar id={s.Driver.driverId} name={fullName(s.Driver)} year={year} team={team?.constructorId} size={38} />
                <span><strong>{s.Driver.familyName}</strong><small>P{s.position} · {plural(+s.wins, "win")}</small></span>
              </span>
              <span className="fav-form-rounds">
                {last.map((r) => {
                  const x = r.Results?.find((y) => y.Driver.driverId === s.Driver.driverId);
                  const classified = x && /^\d+$/.test(x.positionText);
                  const p = classified ? +x!.position : null;
                  const label = !x ? "—" : classified ? String(p) : x.positionText === "R" ? "DNF" : x.positionText;
                  return (
                    <span key={r.round} className={cx("fav-res", p === 1 && "p1", p === 2 && "p2", p === 3 && "p3", p !== null && p <= 10 && "pts", x && !classified && "out")}
                      title={`${r.raceName}: ${x ? (classified ? "P" + p : x.status) : "did not take part"}`}>
                      {label}
                    </span>
                  );
                })}
              </span>
              <span className="fav-form-pts"><b>{pts(s.points)}</b></span>
            </Link>
          );
        })}
      </div>
      <p className="source">Race classification only (sprints excluded). DNF = retired; other codes as published (D disqualified, W withdrawn, N not classified).</p>
    </Glass>
  );
}
