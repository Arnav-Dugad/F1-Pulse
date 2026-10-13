import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Droplets, ExternalLink, Flag as FlagIcon,
  History, MapPin, RotateCcw, Thermometer, Trophy, Umbrella, Wind, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { circuitRaces, circuitWinners, useData, weather, type Weather } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { useCalendar } from "../lib/season";
import { circuitMedia, fullName, loadTracks, teamColor, teamShortName } from "../lib/media";
import { formatDateRange, formatSession, plural, relativeTime, sessionDate } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag, TeamLogo, TrackMap } from "../ui/media";
import { Bar } from "../ui/charts";
import type { Circuit as CircuitT, Driver, Race, Result, Team } from "../types";
import "./circuit.css";

const finished = (r: Race, now: number) => sessionDate(r.date, r.time).getTime() + 2.5 * 3600e3 <= now;
const weekendStart = (r: Race) => r.FirstPractice?.date || r.SprintQualifying?.date || r.Qualifying?.date || r.date;
const coord = (v: string, pos: string, neg: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.abs(n).toFixed(4)}° ${n >= 0 ? pos : neg}` : "—";
};
const osm = (c: CircuitT) =>
  `https://www.openstreetmap.org/?mlat=${c.Location.lat}&mlon=${c.Location.long}#map=14/${c.Location.lat}/${c.Location.long}`;

function useHasOutline(id: string) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    loadTracks().then((t) => live && setHas(!!(t as Record<string, unknown>)[id]));
    return () => { live = false; };
  }, [id]);
  return has;
}

type Win = { race: Race; result: Result };

export default function Circuit({ route }: { route: Route }) {
  const id = route.parts[1] || "";
  const { season, year } = usePrefs();
  const history = useData(() => (id ? circuitRaces(id) : Promise.reject(new Error("No circuit"))), [id]);
  const wins = useData(() => (id ? circuitWinners(id) : Promise.reject(new Error("No circuit"))), [id]);
  const cal = useCalendar(season);
  const now = useNow(60_000);

  const seasonRaces = (cal.value?.data || []).filter((r) => r.Circuit.circuitId === id);
  const circuit = history.value?.data[0]?.Circuit || seasonRaces[0]?.Circuit;
  const winList: Win[] = useMemo(
    () => (wins.value?.data || []).flatMap((race) => (race.Results?.[0] ? [{ race, result: race.Results[0] }] : [])),
    [wins.value],
  );
  const held = (history.value?.data || []).filter((r) => finished(r, now));
  const latest = winList.at(-1)?.result;
  const prior = winList.at(-2)?.result;
  useAmbient(latest ? teamColor(latest.Constructor) : undefined, prior ? teamColor(prior.Constructor) : undefined);
  const missing = !id || (!circuit && !history.loading && !cal.loading && !history.error);
  useTitle(circuit?.circuitName || (missing ? "Circuit not found" : "Circuit"));

  if (!id) return <NotFound />;
  if (!circuit) {
    if (history.loading || cal.loading) return <CircuitSkeleton />;
    if (history.error) return <Page><StateView error={history.error} onRetry={history.reload} /></Page>;
    return <NotFound />;
  }

  const media = circuitMedia(id);
  const heroCars = [...new Set(winList.slice(-3).reverse().map((w) => teamColor(w.result.Constructor)))];

  return (
    <Page className="ckt">
      <CircuitHero
        circuit={circuit}
        hero={media.hero}
        cars={heroCars.length ? heroCars : ["#ff3b30"]}
        held={history.loading ? undefined : held}
        winners={wins.loading ? undefined : new Set(winList.map((w) => w.result.Driver.driverId)).size}
        seasonRace={seasonRaces.find((r) => !finished(r, now)) || seasonRaces.at(-1)}
      />

      <Section title={`${year} at ${circuit.circuitName}`} subtitle={seasonRaces.length ? `${plural(seasonRaces.length, "Grand Prix", "Grands Prix")} on the ${year} calendar` : undefined}>
        <div className="ckt-now">
          <div className="stack">
            {cal.loading ? (
              <Skeleton h={300} r={28} />
            ) : cal.error ? (
              <StateView error={cal.error} onRetry={cal.reload} />
            ) : seasonRaces.length ? (
              seasonRaces.map((r, i) => (
                <SeasonRace key={r.round} race={r} index={i} now={now} year={year} winsLoading={wins.loading}
                  win={winList.find((w) => w.race.season === r.season && w.race.round === r.round)?.result} />
              ))
            ) : (
              <NotOnCalendar year={year} last={held.at(-1)} loading={history.loading} />
            )}
            <Source value={cal.value} />
          </div>
          <WeatherCard circuit={circuit} />
        </div>
      </Section>

      {media.map && (
        <Section title="Circuit map" subtitle="Official Formula 1 map of the current layout — sectors, corner numbers and 2026 aero zones. Click to zoom.">
          <MapFigure src={media.map} name={circuit.circuitName} />
        </Section>
      )}

      <Section title="History" subtitle="Every world championship Grand Prix held here, from the published classification.">
        <HistoryBlock history={history} wins={wins} winList={winList} held={held} />
      </Section>
    </Page>
  );
}

/* ───────────────────────── Not found / skeleton ───────────────────────── */
function NotFound() {
  return (
    <Page className="ckt">
      <Glass className="state ckt-missing">
        <MapPin />
        <h3>This circuit isn't on the map</h3>
        <p>We couldn't find a championship venue with that identifier in the results archive.</p>
        <Link className="btn primary" to="circuits"><ArrowLeft />All circuits</Link>
      </Glass>
    </Page>
  );
}

function CircuitSkeleton() {
  return (
    <Page className="ckt">
      <Skeleton h="min(78vh, 720px)" r={36} />
      <div className="ckt-now" style={{ marginTop: 56 }}>
        <Skeleton h={320} r={28} />
        <Skeleton h={320} r={28} />
      </div>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function CircuitHero({ circuit, hero, cars, held, winners, seasonRace }: {
  circuit: CircuitT; hero?: string; cars: string[]; held?: Race[]; winners?: number; seasonRace?: Race;
}) {
  const hasOutline = useHasOutline(circuit.circuitId);
  const first = held?.[0];
  const { Location: loc } = circuit;
  return (
    <section className={cx("ckt-hero", hasOutline === false && "no-map")}>
      <div className="ckt-hero-media">
        <Img src={hero} alt={`${circuit.circuitName}`} eager />
        <span className="ckt-hero-scrim" />
      </div>
      <div className="ckt-hero-inner">
        <div className="ckt-hero-copy">
          <span className="eyebrow ckt-hero-eyebrow rise"><Link to="circuits" className="ckt-crumb"><ChevronLeft size={14} />Circuits</Link><span aria-hidden>·</span>{loc.country}</span>
          <h1 className="ckt-hero-title rise" style={{ "--i": 1 } as CSSProperties}>{circuit.circuitName}</h1>
          <p className="ckt-hero-place rise" style={{ "--i": 2 } as CSSProperties}>
            <Flag country={loc.country} large />
            <span>{loc.locality}, {loc.country}</span>
            <a className="ckt-coords" href={osm(circuit)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${circuit.circuitName} on OpenStreetMap (opens in a new tab)`}>
              <MapPin size={13} />{coord(loc.lat, "N", "S")}, {coord(loc.long, "E", "W")}<ExternalLink size={12} />
            </a>
          </p>
          <div className="ckt-hero-stats rise" style={{ "--i": 3 } as CSSProperties}>
            <span className="ckt-hero-stat"><b>{first ? first.season : held ? "—" : "…"}</b><small>First Grand Prix</small></span>
            <span className="ckt-hero-stat"><b>{held ? <Counter value={held.length} /> : "…"}</b><small>{held?.length === 1 ? "Race held" : "Races held"}</small></span>
            <span className="ckt-hero-stat"><b>{winners !== undefined ? <Counter value={winners} /> : "…"}</b><small>Different winners</small></span>
          </div>
          <div className="ckt-hero-actions rise" style={{ "--i": 4 } as CSSProperties}>
            {seasonRace && <Link className="btn lg primary" to={"race/" + seasonRace.round}>{seasonRace.season} race weekend<ArrowRight /></Link>}
            <a className="btn lg glass-btn" href={circuit.url} target="_blank" rel="noopener noreferrer"><BookOpen />Wikipedia<ExternalLink /></a>
          </div>
        </div>
        {hasOutline !== false && (
          <div className="ckt-hero-track rise" style={{ "--i": 2 } as CSSProperties}>
            <TrackMap circuitId={circuit.circuitId} mode="draw" cars={cars} lap={10} label={`${circuit.circuitName} layout`} />
            <span className="ckt-hero-track-label">Layout outline · {cars.length > 1 ? "recent winners' colours" : "lap animation"}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── This season ───────────────────────── */
function SeasonRace({ race, win, winsLoading, index, now, year }: { race: Race; win?: Result; winsLoading: boolean; index: number; now: number; year: string }) {
  const { timezone } = usePrefs();
  const done = finished(race, now);
  const start = sessionDate(race.date, race.time).getTime();
  const tint = win ? teamColor(win.Constructor) : "var(--accent)";
  return (
    <Link to={"race/" + race.round} className={cx("ckt-race glass interactive reveal", win && "won")} style={{ "--tint": tint, "--i": index } as CSSProperties}>
      <span className="ckt-race-glow" aria-hidden />
      <span className="ckt-race-top">
        <span className="chip solid">Round {race.round}</span>
        {race.Sprint && <span className="chip yellow">Sprint weekend</span>}
        {done ? <span className="chip green"><Check />Complete</span> : <span className="chip accent"><span className="live-dot" />{relativeTime(new Date(start).toISOString(), now)}</span>}
      </span>
      <span className="ckt-race-name">{race.raceName}</span>
      <span className="ckt-race-date">{formatDateRange(weekendStart(race), race.date)} · Lights out {formatSession(race.date, race.time, timezone)}</span>
      {win ? (
        <span className="ckt-race-winner">
          <DriverAvatar id={win.Driver.driverId} name={fullName(win.Driver)} year={year} team={win.Constructor.constructorId} size={58} />
          <span className="ckt-race-wtext">
            <small><Trophy size={12} />Winner</small>
            <b>{fullName(win.Driver)}</b>
            <span>{teamShortName(win.Constructor.name, race.season)} · {win.Time?.time || win.status}</span>
          </span>
          <TeamLogo id={win.Constructor.constructorId} name={win.Constructor.name} year={race.season} size={40} />
        </span>
      ) : done ? (
        winsLoading ? <Skeleton h={64} r={20} /> : <span className="ckt-race-pending">The classification hasn't been published by the data source yet.</span>
      ) : null}
      <span className="ckt-race-cta">{done ? "Full classification" : "Race weekend"}<ArrowRight size={15} /></span>
    </Link>
  );
}

function NotOnCalendar({ year, last, loading }: { year: string; last?: Race; loading: boolean }) {
  return (
    <Glass className="card ckt-absent reveal">
      <span className="ckt-absent-icon"><FlagIcon /></span>
      <h3 className="title-3">Not on the {year} calendar</h3>
      {loading ? <Skeleton h={18} w="60%" /> : last ? (
        <p className="muted">The most recent Grand Prix here was the <strong>{last.season} {last.raceName}</strong>.</p>
      ) : (
        <p className="muted">No championship Grand Prix has been held at this venue yet.</p>
      )}
      {last && <Link className="btn sm" to={`race/${last.round}?season=${last.season}`}>Open {last.season} race<ArrowRight /></Link>}
    </Glass>
  );
}

/* ───────────────────────── Weather ───────────────────────── */
type Day = { key: string; label: string; min: number; max: number; rain: number | null };
function dailyForecast(w?: Weather): Day[] {
  const h = w?.hourly;
  if (!h?.time?.length) return [];
  const map = new Map<string, { temps: number[]; rain: number[] }>();
  h.time.forEach((t, i) => {
    const key = t.slice(0, 10);
    const d = map.get(key) || { temps: [], rain: [] };
    const temp = h.temperature_2m?.[i];
    const rain = h.precipitation_probability?.[i];
    if (Number.isFinite(temp)) d.temps.push(temp);
    if (Number.isFinite(rain)) d.rain.push(rain);
    map.set(key, d);
  });
  const today = w?.current?.time?.slice(0, 10);
  return [...map.entries()]
    .filter(([, d]) => d.temps.length)
    .slice(0, 7)
    .map(([key, d]) => ({
      key,
      label: key === today ? "Today" : new Date(key + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
      min: Math.min(...d.temps),
      max: Math.max(...d.temps),
      rain: d.rain.length ? Math.max(...d.rain) : null,
    }));
}

function WeatherCard({ circuit }: { circuit: CircuitT }) {
  const { lat, long } = circuit.Location;
  const w = useData(() => weather(lat, long), [lat, long]);
  const data = w.value?.data;
  const cur = data?.current;
  const days = dailyForecast(data);
  const lo = days.length ? Math.min(...days.map((d) => d.min)) : 0;
  const hi = days.length ? Math.max(...days.map((d) => d.max)) : 1;
  const span = hi - lo || 1;
  const localTime = cur?.time ? new Date(cur.time + ":00Z").toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "";
  return (
    <Glass className="card ckt-wx reveal" style={{ "--i": 1 } as CSSProperties}>
      <div className="card-title">
        <h3>Weather at the circuit</h3>
        <span className="chip blue">Model data</span>
      </div>
      {w.loading ? (
        <div className="stack"><Skeleton h={86} r={20} /><Skeleton h={190} r={20} /></div>
      ) : w.error ? (
        <StateView error={w.error} onRetry={w.reload} />
      ) : !cur && !days.length ? (
        <StateView empty emptyTitle="No forecast available" emptyText="The weather model returned no data for these coordinates." />
      ) : (
        <>
          {cur && (
            <div className="ckt-wx-now">
              <span className="ckt-wx-temp"><Counter value={cur.temperature_2m} decimals={Number.isInteger(cur.temperature_2m) ? 0 : 1} /><sup>°C</sup></span>
              <div className="ckt-wx-facts">
                <span><Droplets />{cur.relative_humidity_2m}% <small>humidity</small></span>
                <span><Wind />{cur.wind_speed_10m} km/h <small>wind</small></span>
                <span><Umbrella />{cur.precipitation} mm <small>precip.</small></span>
              </div>
            </div>
          )}
          {localTime && <p className="ckt-wx-time"><Thermometer size={13} />Model time {localTime} at the circuit{data?.timezone ? ` (${data.timezone.replace(/_/g, " ")})` : ""}</p>}
          {days.length > 0 && (
            <ol className="ckt-wx-days" aria-label="Seven-day model forecast">
              {days.map((d, i) => (
                <li key={d.key} className="ckt-wx-day" style={{ "--i": i } as CSSProperties}>
                  <span className="ckt-wx-dname">{d.label}</span>
                  <span className={cx("ckt-wx-rain", (d.rain ?? 0) >= 40 && "wet")}>{d.rain !== null ? <><Droplets size={12} />{Math.round(d.rain)}%</> : "—"}</span>
                  <span className="ckt-wx-min">{Math.round(d.min)}°</span>
                  <span className="ckt-wx-range" aria-label={`Low ${Math.round(d.min)}°, high ${Math.round(d.max)}°`}>
                    <i style={{ left: `${((d.min - lo) / span) * 100}%`, width: `${Math.max(4, ((d.max - d.min) / span) * 100)}%` }} />
                    {i === 0 && cur && d.label === "Today" && <b style={{ left: `${Math.min(100, Math.max(0, ((cur.temperature_2m - lo) / span) * 100))}%` }} />}
                  </span>
                  <span className="ckt-wx-max">{Math.round(d.max)}°</span>
                </li>
              ))}
            </ol>
          )}
          <p className="source ckt-wx-note">Open-Meteo forecast model at {Number(lat).toFixed(3)}, {Number(long).toFixed(3)} — modelled conditions, not trackside sensors. Daily highs, lows and peak rain chance are derived from the hourly model run.</p>
        </>
      )}
      <Source value={w.value} label="Weather" />
    </Glass>
  );
}

/* ───────────────────────── Circuit map + lightbox ───────────────────────── */
function MapFigure({ src, name }: { src: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ckt-map glass reveal" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Open the detailed ${name} map in a zoomable viewer`}>
        <span className="ckt-map-paper"><Img src={src} alt={`Official detailed map of ${name}`} /></span>
        <span className="ckt-map-hint"><ZoomIn size={15} />Tap to explore</span>
      </button>
      {createPortal(
        <AnimatePresence>{open && <Lightbox key="lb" src={src} title={name} onClose={() => setOpen(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}

const MIN = 1, MAX = 5;
function Lightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const clamp = (s: number, x: number, y: number) => {
    const r = stage.current?.getBoundingClientRect();
    const mx = r ? ((s - 1) * r.width) / 2 : 0, my = r ? ((s - 1) * r.height) / 2 : 0;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  /** Zoom by `factor` keeping the point (cx, cy) — relative to the stage centre — fixed. */
  const zoomAt = (factor: number, cx = 0, cy = 0) => {
    const v = viewRef.current;
    const s = Math.max(MIN, Math.min(MAX, v.s * factor));
    const k = s / v.s;
    setView(clamp(s, cx - (cx - v.x) * k, cy - (cy - v.y) * k));
  };
  const local = (clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { cx: clientX - r.left - r.width / 2, cy: clientY - r.top - r.height / 2 };
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(1.4);
      else if (e.key === "-") zoomAt(1 / 1.4);
      else if (e.key === "0") setView({ s: 1, x: 0, y: 0 });
    };
    document.addEventListener("keydown", key);
    const el = stage.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = local(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), cx, cy);
    };
    el?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", key);
      el?.removeEventListener("wheel", wheel);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: viewRef.current.s };
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const { cx, cy } = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt((pinch.current.s * (d / pinch.current.d)) / viewRef.current.s, cx, cy);
    } else if (pointers.current.size === 1 && viewRef.current.s > 1) {
      const v = viewRef.current;
      setView(clamp(v.s, v.x + e.clientX - prev.x, v.y + e.clientY - prev.y));
    }
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  return (
    <>
      <motion.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — detailed circuit map`}
        className="ckt-lb"
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
      >
        <div className="ckt-lb-head">
          <div className="ckt-lb-title"><strong>{title}</strong><small>Official circuit map · Formula 1</small></div>
          <div className="ckt-lb-tools" role="toolbar" aria-label="Zoom controls">
            <button type="button" className="icon-btn" onClick={() => zoomAt(1 / 1.4)} disabled={view.s <= MIN} aria-label="Zoom out"><ZoomOut /></button>
            <span className="ckt-lb-zoom" aria-live="polite">{Math.round(view.s * 100)}%</span>
            <button type="button" className="icon-btn" onClick={() => zoomAt(1.4)} disabled={view.s >= MAX} aria-label="Zoom in"><ZoomIn /></button>
            <button type="button" className="icon-btn" onClick={() => setView({ s: 1, x: 0, y: 0 })} disabled={view.s === 1} aria-label="Reset zoom"><RotateCcw /></button>
            <button type="button" className="icon-btn ckt-lb-close" ref={closeRef} onClick={onClose} aria-label="Close map"><X /></button>
          </div>
        </div>
        <div
          ref={stage}
          className={cx("ckt-lb-stage", view.s > 1 && "zoomed")}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDoubleClick={(e) => {
            const { cx, cy } = local(e.clientX, e.clientY);
            if (viewRef.current.s > 1) setView({ s: 1, x: 0, y: 0 });
            else zoomAt(2.5, cx, cy);
          }}
        >
          <img src={src} alt={`Official detailed map of ${title}`} draggable={false} style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }} />
        </div>
        <p className="ckt-lb-hint">Scroll or pinch to zoom · drag to pan · double-click to toggle · <span className="kbd">Esc</span> to close</p>
      </motion.div>
    </>
  );
}

/* ───────────────────────── History ───────────────────────── */
type Tally = { id: string; name: string; count: number; seasons: string[]; last: string; teamId?: string; driver?: Driver; team?: Team };

function tally(list: Win[], key: "driver" | "team"): Tally[] {
  const m = new Map<string, Tally>();
  for (const { race, result } of list) {
    const id = key === "driver" ? result.Driver.driverId : result.Constructor.constructorId;
    const t = m.get(id) || {
      id, count: 0, seasons: [], last: race.season,
      name: key === "driver" ? fullName(result.Driver) : result.Constructor.name,
      driver: key === "driver" ? result.Driver : undefined,
    };
    t.count++;
    t.seasons.push(race.season);
    t.last = race.season;
    t.teamId = result.Constructor.constructorId;
    t.team = result.Constructor;
    m.set(id, t);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || +b.last - +a.last);
}

const yearsLabel = (s: string[]) => {
  const u = [...new Set(s)];
  return u.length > 6 ? `${u.slice(0, 2).join(", ")} … ${u.slice(-2).join(", ")}` : u.join(", ");
};

function HistoryBlock({ history, wins, winList, held }: {
  history: ReturnType<typeof useData<Race[]>>; wins: ReturnType<typeof useData<Race[]>>; winList: Win[]; held: Race[];
}) {
  const drivers = useMemo(() => tally(winList, "driver"), [winList]);
  const teams = useMemo(() => tally(winList, "team"), [winList]);
  const names = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of held) m.set(r.raceName, (m.get(r.raceName) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [held]);

  if (wins.loading || history.loading)
    return (
      <div className="stack">
        <div className="kpis">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={108} r={22} />)}</div>
        <div className="split even"><Skeleton h={420} r={28} /><Skeleton h={420} r={28} /></div>
        <Skeleton h={480} r={28} />
      </div>
    );
  if (wins.error) return <StateView error={wins.error} onRetry={wins.reload} />;
  if (!winList.length)
    return <StateView empty emptyTitle="No race history yet" emptyText="No championship Grand Prix has been classified at this circuit so far. Winners appear here after the first race." />;

  const first = held[0] || winList[0].race;
  const top = drivers[0];
  return (
    <div className="stack ckt-history">
      <div className="kpis">
        <Glass className="kpi reveal">
          <span className="label"><History size={13} /> First Grand Prix</span>
          <span className="value">{first.season}</span>
          <span className="detail">{first.raceName}</span>
        </Glass>
        <Glass className="kpi reveal" style={{ "--i": 1 } as CSSProperties}>
          <span className="label"><FlagIcon size={13} /> Grands Prix held</span>
          <span className="value"><Counter value={held.length || winList.length} /></span>
          <span className="detail">{held.length ? `${held[0].season}–${held.at(-1)!.season}` : "World championship rounds"}</span>
        </Glass>
        <Glass className="kpi reveal" style={{ "--i": 2 } as CSSProperties}>
          <span className="label"><Trophy size={13} /> Most wins</span>
          <span className="value"><Counter value={top.count} /></span>
          <span className="detail">{drivers.filter((d) => d.count === top.count).map((d) => d.driver?.familyName || d.name).join(", ")}</span>
        </Glass>
        <Glass className="kpi reveal" style={{ "--i": 3 } as CSSProperties}>
          <span className="label"><Trophy size={13} /> Winning constructors</span>
          <span className="value"><Counter value={teams.length} /></span>
          <span className="detail">{plural(drivers.length, "different driver")}</span>
        </Glass>
      </div>

      {names.length > 1 && (
        <div className="ckt-names reveal">
          <span className="eyebrow">Held as</span>
          {names.map(([n, c]) => <span key={n} className="chip">{n}<b>×{c}</b></span>)}
        </div>
      )}

      <div className="split even">
        <Leaders title="Most successful drivers" rows={drivers} kind="driver" />
        <Leaders title="Most successful constructors" rows={teams} kind="team" index={1} />
      </div>

      <WinnersTable list={winList} />
      <Source value={wins.value} />
    </div>
  );
}

function Leaders({ title, rows, kind, index = 0 }: { title: string; rows: Tally[]; kind: "driver" | "team"; index?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  const max = rows[0]?.count || 1;
  return (
    <Glass className="card ckt-leaders reveal" style={{ "--i": index } as CSSProperties}>
      <div className="card-title"><h3>{title}</h3><span className="eyebrow">Wins</span></div>
      <motion.div layout className="list">
        {shown.map((r, i) => {
          const tint = teamColor(r.teamId);
          return (
            <motion.div layout key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Link to={(kind === "driver" ? "driver/" : "team/") + r.id} className="list-row ckt-leader" style={{ "--tint": tint } as CSSProperties}>
                <span className={cx("pos", i < 3 && "p" + (i + 1))}>{i + 1}</span>
                {kind === "driver" ? (
                  <DriverAvatar id={r.id} name={r.name} year={r.last} team={r.teamId} size={38} />
                ) : (
                  <TeamLogo id={r.id} name={r.name} year={r.last} size={38} />
                )}
                <span className="ckt-leader-main">
                  <strong>{kind === "team" ? teamShortName(r.name, r.last) : r.name}</strong>
                  <small>{yearsLabel(r.seasons)}</small>
                  <Bar value={r.count} max={max} color={tint} index={i} />
                </span>
                <span className="ckt-leader-count">{r.count}</span>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
      {rows.length > 8 && (
        <button type="button" className="btn sm plain ckt-more" onClick={() => setAll((x) => !x)} aria-expanded={all}>
          {all ? "Show top 8" : `Show all ${rows.length}`}
        </button>
      )}
    </Glass>
  );
}

const PAGE = 12;
function WinnersTable({ list }: { list: Win[] }) {
  const rows = useMemo(() => [...list].reverse(), [list]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const [page, setPage] = useState(0);
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const range = slice.length ? `${slice.at(-1)!.race.season}–${slice[0].race.season}` : "";
  return (
    <Glass className="card flush ckt-winners reveal">
      <div className="ckt-winners-head">
        <div>
          <h3>Winners</h3>
          <p className="muted small">{plural(rows.length, "race")} · newest first</p>
        </div>
        {pages > 1 && (
          <div className="ckt-pager" role="group" aria-label="Winners pages">
            <button type="button" className="icon-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Newer winners"><ChevronLeft /></button>
            <span className="ckt-pager-label" aria-live="polite"><b>{range}</b><small>Page {page + 1} of {pages}</small></span>
            <button type="button" className="icon-btn" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Older winners"><ChevronRight /></button>
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="tbl ckt-tbl">
          <thead>
            <tr><th>Season</th><th>Driver</th><th>Constructor</th><th>Grand Prix</th><th className="r">Time / status</th></tr>
          </thead>
          <AnimatePresence mode="wait" initial={false}>
            <motion.tbody key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {slice.map(({ race, result }) => (
                <tr key={race.season + race.round} style={{ "--tint": teamColor(result.Constructor) } as CSSProperties}>
                  <td><Link to={`race/${race.round}?season=${race.season}`} className="ckt-season">{race.season}</Link></td>
                  <td>
                    <Link to={"driver/" + result.Driver.driverId} className="ckt-cell">
                      <DriverAvatar id={result.Driver.driverId} name={fullName(result.Driver)} year={race.season} team={result.Constructor.constructorId} size={28} />
                      <Flag nationality={result.Driver.nationality} />
                      <strong>{fullName(result.Driver)}</strong>
                    </Link>
                  </td>
                  <td>
                    <Link to={"team/" + result.Constructor.constructorId} className="ckt-cell">
                      <i className="team-bar" />
                      {teamShortName(result.Constructor.name, race.season)}
                    </Link>
                  </td>
                  <td className="muted">{race.raceName}</td>
                  <td className="r tabular">{result.Time?.time || result.status}</td>
                </tr>
              ))}
            </motion.tbody>
          </AnimatePresence>
        </table>
      </div>
    </Glass>
  );
}
