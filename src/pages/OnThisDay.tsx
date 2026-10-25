import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Cake, CalendarDays, ChevronLeft, ChevronRight, Flag as FlagIcon, Info, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { ordinal, plural } from "../lib/format";
import { fmtDate, isStart, onThisDay, poleOf, useArchive, type ARace, type Archive } from "../lib/archive";
import { Counter, Glass, Page, Section, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { Flag, TeamLogo } from "../ui/media";
import { ArchiveError, ArchiveHero, ArchiveLoading, Face, lastTeam } from "./_archive-ui";
import "./onthisday.css";

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2024, i, 1)).toLocaleDateString(undefined, { month: "long", timeZone: "UTC" }));
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => { const d = new Date(); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const valid = (v: string | null): v is string => !!v && /^\d{2}-\d{2}$/.test(v) && +v.slice(0, 2) >= 1 && +v.slice(0, 2) <= 12 && +v.slice(3) >= 1 && +v.slice(3) <= DAYS_IN[+v.slice(0, 2) - 1];
/** Step a month-day by ±1 day on a leap-year calendar (so 29 Feb is reachable). */
function shift(key: string, by: number) {
  const d = new Date(Date.UTC(2024, +key.slice(0, 2) - 1, +key.slice(3) + by));
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const label = (key: string) => new Date(Date.UTC(2024, +key.slice(0, 2) - 1, +key.slice(3))).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });

export default function OnThisDay({ route }: { route: Route }) {
  const initial = route.query.get("d");
  const [day, setDay] = useState(valid(initial) ? initial : todayKey());
  const change = (k: string) => { setDay(k); setQuery({ d: k === todayKey() ? null : k }); };
  useTitle(`On This Day · ${label(day)}`);
  const a = useArchive();
  const data = useMemo(() => (a.value ? onThisDay(a.value.archive, day) : null), [a.value, day]);
  const latest = data?.races.at(-1);
  const winnerTeam = latest?.results.find((r) => r.pos === 1)?.c;
  useAmbient(a.value && winnerTeam !== undefined ? teamColor(a.value.archive.teams[winnerTeam]?.id) : "#ff9f0a");

  if (a.loading || (!a.value && !a.error)) return <Page className="otd"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value || !data) return <Page className="otd"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  const { archive, envelope } = a.value;
  const races = [...data.races].reverse();
  const photoRace = races.find((r) => circuitMedia(archive.circuits[r.circuit]?.id).hero);
  const photo = circuitMedia(photoRace ? archive.circuits[photoRace.circuit].id : "suzuka").hero;
  const isToday = day === todayKey();

  return (
    <Page className="otd">
      <ArchiveHero
        eyebrow={isToday ? "Archive · On this day" : "Archive · On this date"}
        icon={<CalendarDays size={14} />}
        title={label(day)}
        accent={isToday ? "in Formula 1 history" : "through the years"}
        lede={races.length ? `${plural(races.length, "World Championship Grand Prix", "World Championship Grands Prix")} held on this date since ${races.at(-1)!.season}.` : "No World Championship Grand Prix has been held on this date — but there are birthdays and more below."}
        photo={photo}
        tint={latest && winnerTeam !== undefined ? teamColor(archive.teams[winnerTeam]?.id) : "#ff9f0a"}
        stats={[
          { label: "Grands Prix", value: <Counter value={races.length} /> },
          { label: "Debuts", value: <Counter value={data.debuts.length} /> },
          { label: "Birthdays", value: <Counter value={data.birthdays.length} /> },
        ]}
        actions={<DayPicker day={day} onChange={change} />}
        figure={latest && <LatestCard archive={archive} race={latest} />}
      />

      <Section id="races" title="Races on this date" subtitle={races.length ? "Newest first — winner, podium and pole for each Grand Prix." : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={day} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            {races.length ? (
              <ol className="otd-timeline">
                {races.map((r, i) => <RaceItem key={r.season + "-" + r.round} archive={archive} race={r} index={i} />)}
              </ol>
            ) : (
              <StateView empty emptyTitle="No Grand Prix on this date" emptyText="Use the arrows to step to a neighbouring day — race weekends cluster on Sundays from March to December." />
            )}
          </motion.div>
        </AnimatePresence>
        <Source value={envelope} label="Race results" />
      </Section>

      <Section id="debuts" title="Debuts" subtitle="Drivers whose first World Championship start came on this date.">
        {data.debuts.length ? (
          <div className="otd-grid">
            {[...data.debuts].sort((x, y) => (y.first!.season - x.first!.season)).map((c, i) => {
              const d = archive.drivers[c.idx];
              const row = c.row;
              return (
                <Link key={c.idx} to={"driver/" + d.id} className="otd-person glass interactive reveal" style={{ "--i": i % 8, "--tint": teamColor(row ? archive.teams[row.c]?.id : undefined) } as CSSProperties}>
                  <Face archive={archive} idx={c.idx} size={56} year={c.first!.season} team={row?.c} />
                  <span className="otd-person-main">
                    <strong>{d.name}</strong>
                    <small><Flag nationality={d.nat} />{c.first!.season} {c.first!.name.replace(/ Grand Prix$/, " GP")}</small>
                    <small>{row ? `${archive.teams[row.c]?.name} · ${row.pos ? ordinal(row.pos) : row.status}` : ""}</small>
                  </span>
                  <span className="otd-person-stat"><b>{c.starts}</b><small>career starts</small></span>
                </Link>
              );
            })}
          </div>
        ) : <p className="muted otd-empty"><Sparkles size={15} />No driver made their World Championship debut on this date.</p>}
      </Section>

      <Section id="birthdays" title="Birthdays" subtitle="Grand Prix starters born on this date.">
        {data.birthdays.length ? (
          <div className="otd-grid">
            {[...data.birthdays].sort((x, y) => y.career.starts - x.career.starts).map((b, i) => (
              <Link key={b.idx} to={"driver/" + b.driver.id} className="otd-person glass interactive reveal" style={{ "--i": i % 8, "--tint": teamColor(lastTeam(archive, b.idx)) } as CSSProperties}>
                <Face archive={archive} idx={b.idx} size={56} />
                <span className="otd-person-main">
                  <strong>{b.driver.name}</strong>
                  <small><Flag nationality={b.driver.nat} /><Cake size={12} />Born {b.driver.dob.slice(0, 4)}</small>
                  <small>{b.career.first?.season === b.career.last?.season ? b.career.first?.season : `${b.career.first?.season}–${b.career.last?.season}`} · {plural(b.career.starts, "start")}</small>
                </span>
                <span className="otd-person-stat">{b.career.wins ? <><b>{b.career.wins}</b><small>{b.career.wins === 1 ? "win" : "wins"}</small></> : b.career.podiums ? <><b>{b.career.podiums}</b><small>podiums</small></> : null}</span>
              </Link>
            ))}
          </div>
        ) : <p className="muted otd-empty"><Cake size={15} />No Grand Prix starter in the archive was born on this date.</p>}
        <p className="arx-note"><Info />Dates of birth as recorded by Jolpica. Photos appear for seasons with official media; other drivers show monograms.</p>
        <Source value={envelope} label="Drivers" />
      </Section>
    </Page>
  );
}

function DayPicker({ day, onChange }: { day: string; onChange: (k: string) => void }) {
  const m = +day.slice(0, 2), d = +day.slice(3);
  return (
    <div className="otd-picker" role="group" aria-label="Choose a date">
      <a href={`#/on-this-day?d=${shift(day, -1)}`} className="icon-btn otd-arrow" aria-label="Previous day" data-swipe="prev" onClick={(e) => { e.preventDefault(); onChange(shift(day, -1)); }}><ChevronLeft /></a>
      <label className="sr-only" htmlFor="otd-day">Day</label>
      <select id="otd-day" className="select otd-select" value={d} onChange={(e) => onChange(`${pad(m)}-${pad(+e.target.value)}`)}>
        {Array.from({ length: DAYS_IN[m - 1] }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select>
      <label className="sr-only" htmlFor="otd-month">Month</label>
      <select id="otd-month" className="select otd-select" value={m} onChange={(e) => { const nm = +e.target.value; onChange(`${pad(nm)}-${pad(Math.min(d, DAYS_IN[nm - 1]))}`); }}>
        {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
      </select>
      <a href={`#/on-this-day?d=${shift(day, 1)}`} className="icon-btn otd-arrow" aria-label="Next day" data-swipe="next" onClick={(e) => { e.preventDefault(); onChange(shift(day, 1)); }}><ChevronRight /></a>
      {day !== todayKey() && <button type="button" className="btn sm glass-btn" onClick={() => onChange(todayKey())}><RotateCcw />Today</button>}
    </div>
  );
}

function LatestCard({ archive, race }: { archive: Archive; race: ARace }) {
  const w = race.results.find((r) => r.pos === 1);
  if (!w) return null;
  const d = archive.drivers[w.d];
  return (
    <Link to={`race/${race.round}?season=${race.season}`} className="otd-latest reveal" style={{ "--tint": teamColor(archive.teams[w.c]?.id) } as CSSProperties}>
      <span className="otd-latest-year">{race.season}</span>
      <Face archive={archive} idx={w.d} size={132} year={race.season} team={w.c} className="otd-latest-face" />
      <span className="otd-latest-label"><Trophy size={13} />Most recent winner on this date</span>
      <strong>{d.name}</strong>
      <span className="otd-latest-sub">{race.name} · {archive.teams[w.c]?.name}</span>
    </Link>
  );
}

function RaceItem({ archive, race, index }: { archive: Archive; race: ARace; index: number }) {
  const c = archive.circuits[race.circuit];
  const podium = race.results.filter((r) => r.pos !== null && r.pos <= 3).sort((x, y) => x.pos! - y.pos!);
  const winners = podium.filter((r) => r.pos === 1);
  const pole = poleOf(race);
  const tint = teamColor(archive.teams[winners[0]?.c ?? -1]?.id);
  return (
    <li className="otd-item reveal" style={{ "--i": index % 6, "--tint": tint } as CSSProperties}>
      <span className="otd-dot" aria-hidden />
      <Glass className="otd-card">
        <div className="otd-card-head">
          <span className="otd-year">{race.season}</span>
          <div className="otd-race">
            <Link to={`race/${race.round}?season=${race.season}`} className="otd-race-name">{race.name}</Link>
            <span className="faint small"><Flag country={c?.country} />{c?.name} · Round {race.round} · {fmtDate(race.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
        </div>
        <div className="otd-podium">
          {podium.map((r) => {
            const d = archive.drivers[r.d];
            return (
              <Link key={r.d} to={"driver/" + d.id} className={cx("otd-step", r.pos === 1 && "win")}>
                <span className={cx("pos", "p" + r.pos)}>{r.pos}</span>
                <Face archive={archive} idx={r.d} size={r.pos === 1 ? 44 : 34} year={race.season} team={r.c} />
                <span className="otd-step-main"><strong>{d.name}</strong><small><TeamLogo id={archive.teams[r.c]?.id} name={archive.teams[r.c]?.name || ""} year={String(race.season)} size={20} />{archive.teams[r.c]?.name}</small></span>
              </Link>
            );
          })}
        </div>
        <div className="otd-meta">
          {pole && <span className="chip"><FlagIcon />{pole.source === "grid" ? "Grid P1" : "Pole"} · {archive.drivers[pole.d]?.family}</span>}
          {winners[0] && winners[0].grid > 1 && <span className="chip green">Won from P{winners[0].grid}</span>}
          {winners.length > 1 && <span className="chip yellow">Shared drive</span>}
          <span className="chip">{plural(race.results.filter(isStart).length, "starter")}</span>
        </div>
      </Glass>
    </li>
  );
}
