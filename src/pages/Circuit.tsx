import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Clock, Compass, Droplets, ExternalLink, Flag as FlagIcon,
  Globe, History, MapPin, RotateCcw, Sunrise, Sunset, Thermometer, Trophy, Umbrella, Wind, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { circuitRaces, circuitWinners, climate, useData, weather, type Climate, type Weather } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { useCalendar } from "../lib/season";
import { circuitMedia, fullName, loadTracks, teamColor, teamShortName, useCircuitPhotos, type Photo } from "../lib/media";
import { formatClock, formatDateRange, formatSession, formatWeekday, hasStarted, plural, relativeTime, sessionDate, timezoneLabel } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag, PhotoCredit, TeamLogo } from "../ui/media";
import { Track3D } from "../ui/track3d";
import { emptyEnv, localClock, offsetLabel, prefZone, useSeen, weekendDates, zoneOffset } from "./_fan";
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
  const photos = useCircuitPhotos(id || undefined);

  if (!id) return <NotFound />;
  if (!circuit) {
    if (history.loading || cal.loading) return <CircuitSkeleton />;
    if (history.error) return <Page><h1 className="sr-only">Circuit unavailable</h1><StateView error={history.error} onRetry={history.reload} /></Page>;
    return <NotFound />;
  }

  const media = circuitMedia(id);
  // Hero: the official race-hub photo, else the best freely licensed Commons photo of the venue.
  const heroPhoto = photos.find((p) => p.kind !== "map");
  const places = photos.filter((p) => !p.credit.official && p !== heroPhoto);
  const heroCars = [...new Set(winList.slice(-3).reverse().map((w) => teamColor(w.result.Constructor)))];

  return (
    <Page className="ckt">
      <CircuitHero
        circuit={circuit}
        hero={heroPhoto}
        cars={heroCars.length ? heroCars : ["#ff3b30"]}
        held={history.loading ? undefined : held}
        winners={wins.loading ? undefined : new Set(winList.map((w) => w.result.Driver.driverId)).size}
        seasonRace={seasonRaces.find((r) => !finished(r, now)) || seasonRaces.at(-1)}
      />

      <Section id="this-season" title={`${year} at ${circuit.circuitName}`} subtitle={seasonRaces.length ? `${plural(seasonRaces.length, "Grand Prix", "Grands Prix")} on the ${year} calendar` : undefined}>
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

      <Section id="travel-guide" title="Grand Prix travel guide" subtitle="Local time, daylight and what the weather has typically done on race weekend — all computed from open data for these coordinates.">
        <TravelGuide circuit={circuit} race={seasonRaces.find((r) => !finished(r, now)) || seasonRaces.at(-1) || held.at(-1)} />
      </Section>

      {places.length > 0 && (
        <Section id="around-the-circuit" title="Around the circuit" subtitle={`The venue and its surroundings — ${plural(places.length, "freely licensed photo")} from Wikimedia Commons. Tap to enlarge.`}>
          <Places photos={places} name={circuit.circuitName} />
        </Section>
      )}

      {media.map && (
        <Section id="circuit-map" title="Circuit map" subtitle="Official Formula 1 map of the current layout — sectors, corner numbers and 2026 aero zones. Click to zoom.">
          <MapFigure src={media.map} name={circuit.circuitName} />
        </Section>
      )}

      <Section id="history" title="History" subtitle="Every world championship Grand Prix held here, from the published classification.">
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
  circuit: CircuitT; hero?: Photo; cars: string[]; held?: Race[]; winners?: number; seasonRace?: Race;
}) {
  const hasOutline = useHasOutline(circuit.circuitId);
  const first = held?.[0];
  const { Location: loc } = circuit;
  return (
    <section className={cx("ckt-hero", hasOutline === false && "no-map")}>
      <div className="ckt-hero-media">
        <Img src={hero?.src} alt={hero?.alt || circuit.circuitName} eager />
        <span className="ckt-hero-scrim" />
      </div>
      {hero && !hero.credit.official && <PhotoCredit credit={hero.credit} overlay className="ckt-hero-credit" />}
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
            <Track3D circuitId={circuit.circuitId} cars={cars} lap={11} label={`${circuit.circuitName} layout`} note={cars.length > 1 ? "cars in recent winners' colours" : undefined} />
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
function Lightbox({ src, title, onClose, subtitle, alt, kind = "detailed circuit map", children }: {
  src: string; title: string; onClose: () => void; subtitle?: ReactNode; alt?: string; kind?: string; children?: ReactNode;
}) {
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
        aria-label={`${title} — ${kind}`}
        className="ckt-lb"
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
      >
        <div className="ckt-lb-head">
          <div className="ckt-lb-title"><strong>{title}</strong><small>{subtitle ?? "Official circuit map · Formula 1"}</small></div>
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
          <img src={src} alt={alt || `Official detailed map of ${title}`} draggable={false} style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }} />
        </div>
        {children}
        <p className="ckt-lb-hint">Scroll or pinch to zoom · drag to pan · double-click to toggle · <span className="kbd">Esc</span> to close</p>
      </motion.div>
    </>
  );
}

/* ───────────────────────── Around the circuit (Commons photos) ───────────────────────── */
function Places({ photos, name }: { photos: Photo[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = photos[open ?? -1];
  return (
    <>
      <ul className={cx("ckt-places", `n${Math.min(photos.length, 6)}`)} aria-label={`Photos around ${name}`}>
        {photos.map((p, i) => (
          <li key={p.src} className="ckt-place reveal" style={{ "--i": i } as CSSProperties}>
            <button type="button" className="ckt-place-tile" onClick={() => setOpen(i)} aria-haspopup="dialog"
              aria-label={`Enlarge photo ${i + 1} of ${photos.length}${p.alt ? `: ${p.alt}` : ""}`}>
              <Img src={p.src} alt={p.alt || `${name} — photo ${i + 1}`} />
              <span className="ckt-place-zoom" aria-hidden><ZoomIn size={14} /></span>
            </button>
            <div className="ckt-place-cap">
              {p.credit.title && <p className="ckt-place-desc">{p.credit.title}</p>}
              <PhotoCredit credit={p.credit} />
            </div>
          </li>
        ))}
      </ul>
      {createPortal(
        <AnimatePresence>
          {shown && (
            <Lightbox key="place-lb" src={shown.src} title={name} kind="photo viewer" alt={shown.alt || name} onClose={() => setOpen(null)}
              subtitle={<>Photo {open! + 1} of {photos.length} · Wikimedia Commons</>}>
              <div className="ckt-lb-credit">
                {shown.credit.title && <span>{shown.credit.title}</span>}
                <PhotoCredit credit={shown.credit} />
              </div>
            </Lightbox>
          )}
        </AnimatePresence>,
        document.body,
      )}
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

/* ───────────────────────── Grand Prix travel guide ───────────────────────── */
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const shiftYear = (d: string, by: number) => `${+d.slice(0, 4) + by}${d.slice(4)}`;
const minutesOf = (stamp?: string) => (stamp && /T\d{2}:\d{2}/.test(stamp) ? +stamp.slice(11, 13) * 60 + +stamp.slice(14, 16) : null);
const dayName = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMonth = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

function TravelGuide({ circuit, race }: { circuit: CircuitT; race?: Race }) {
  const { lat, long } = circuit.Location;
  const w = useData(() => weather(lat, long), [lat, long]);
  const tz = w.value?.data.timezone;
  return (
    <div className="ckt-guide">
      <ClocksCard circuit={circuit} race={race} tz={tz} loading={w.loading} error={w.error} onRetry={w.reload} />
      {race && <SunCard circuit={circuit} race={race} forecast={w.value?.data} forecastLoading={w.loading} />}
      {race && <TypicalCard circuit={circuit} race={race} />}
      <OrientCard circuit={circuit} tz={tz} />
      <Source value={w.value} label="Time zone & forecast" />
    </div>
  );
}

function ClocksCard({ circuit, race, tz, loading, error, onRetry }: { circuit: CircuitT; race?: Race; tz?: string; loading: boolean; error?: string; onRetry: () => void }) {
  const { timezone } = usePrefs();
  const now = useNow(1000);
  const mine = prefZone(timezone);
  const clock = (zone?: string) => new Date(now).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: zone });
  const day = (zone?: string) => new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", timeZone: zone });
  const diff = tz ? zoneOffset(tz, now) - zoneOffset(mine, now) : 0;
  const abs = Math.abs(diff);
  const diffText = !tz ? "" : diff === 0 ? "Same time as you" : `${Math.floor(abs / 60) ? `${Math.floor(abs / 60)} h` : ""}${abs % 60 ? ` ${abs % 60} min` : ""} ${diff > 0 ? "ahead of" : "behind"} you`.trim();
  const upcoming = race && race.time && !hasStarted(race.date, race.time, now);
  return (
    <Glass className="card ckt-clocks reveal">
      <div className="card-title"><h3>Local time</h3><span className="eyebrow"><Clock size={13} />Live</span></div>
      {loading ? <Skeleton h={150} r={20} /> : error || !tz ? (
        <StateView error={error || "The circuit's time zone couldn't be determined."} onRetry={onRetry} />
      ) : (
        <>
          <div className="ckt-clock-pair">
            <div className="ckt-clock">
              <small><MapPin size={12} />{circuit.Location.locality}</small>
              <b>{clock(tz)}</b>
              <span>{day(tz)} · {offsetLabel(zoneOffset(tz, now))}</span>
            </div>
            <span className="ckt-clock-diff" aria-label={diffText}><ArrowLeftRight size={14} />{diffText}</span>
            <div className="ckt-clock you">
              <small><Globe size={12} />You · {timezoneLabel(timezone)}</small>
              <b>{clock(mine)}</b>
              <span>{day(mine)} · {offsetLabel(zoneOffset(mine, now))}</span>
            </div>
          </div>
          {upcoming && race && (
            <p className="ckt-clock-race"><FlagIcon size={14} />Lights out <b>{formatWeekday(race.date, race.time, tz)} {formatClock(race.date, race.time, tz)}</b> local · <b>{formatWeekday(race.date, race.time, timezone)} {formatClock(race.date, race.time, timezone)}</b> for you</p>
          )}
          <p className="source">Circuit time zone {tz.replace(/_/g, " ")}, resolved by Open-Meteo from the coordinates.</p>
        </>
      )}
    </Glass>
  );
}

type SunDay = { date: string; sunrise?: string; sunset?: string };
function SunCard({ circuit, race, forecast, forecastLoading }: { circuit: CircuitT; race: Race; forecast?: Weather; forecastLoading: boolean }) {
  const { lat, long } = circuit.Location;
  const dates = weekendDates(race);
  const today = isoDay(Date.now());
  const fDays = forecast?.daily?.time || [];
  const inForecast = dates.filter((d) => fDays.includes(d)).length > 0;
  const past = dates.at(-1)! < isoDay(Date.now() - 7 * 864e5);
  // Source: forecast when the weekend is within range; otherwise the ERA5 archive — the actual dates if
  // they're far enough in the past, or the same calendar dates one year earlier.
  const mode: "forecast" | "actual" | "lastyear" = inForecast ? "forecast" : past ? "actual" : "lastyear";
  const archiveDates = mode === "actual" ? dates : dates.map((d) => shiftYear(d, -1));
  const arch = useData(() => (forecastLoading || mode === "forecast" ? Promise.resolve(emptyEnv<Climate>({})) : climate(lat, long, archiveDates[0], archiveDates.at(-1)!, "daily")),
    [lat, long, mode, archiveDates[0], archiveDates.at(-1), forecastLoading]);
  const days: SunDay[] = mode === "forecast"
    ? dates.map((d) => { const i = fDays.indexOf(d); return { date: d, sunrise: forecast?.daily?.sunrise[i], sunset: forecast?.daily?.sunset[i] }; }).filter((d) => d.sunrise)
    : archiveDates.map((d) => { const a = arch.value?.data.daily; const i = a?.time.indexOf(d) ?? -1; return { date: d, sunrise: i >= 0 ? a?.sunrise[i] : undefined, sunset: i >= 0 ? a?.sunset[i] : undefined }; }).filter((d) => d.sunrise);
  const label = mode === "forecast" ? "Forecast" : mode === "actual" ? `Archive · ${race.season}` : `Same dates, ${+race.season - 1}`;
  return (
    <Glass className="card ckt-sun reveal" style={{ "--i": 1 } as CSSProperties}>
      <div className="card-title"><h3>Race-weekend daylight</h3><span className="chip blue">{label}</span></div>
      {forecastLoading || arch.loading ? <Skeleton h={160} r={20} /> : arch.error ? <StateView error={arch.error} onRetry={arch.reload} /> : !days.length ? (
        <StateView empty emptyTitle="No sunrise data" emptyText="The model didn't return sunrise and sunset for these dates." />
      ) : (
        <ul className="ckt-sun-list">
          {days.map((d) => {
            const a = minutesOf(d.sunrise), b = minutesOf(d.sunset);
            const len = a !== null && b !== null ? b - a : null;
            return (
              <li key={d.date}>
                <span className="ckt-sun-day">{dayName(d.date)}</span>
                <span className="ckt-sun-arc" aria-hidden>
                  <i style={{ left: `${((a ?? 0) / 1440) * 100}%`, width: `${((len ?? 0) / 1440) * 100}%` }} />
                </span>
                <span className="ckt-sun-times"><Sunrise size={13} />{localClock(d.sunrise)}<Sunset size={13} />{localClock(d.sunset)}</span>
                <span className="ckt-sun-len">{len !== null ? `${Math.floor(len / 60)} h ${String(len % 60).padStart(2, "0")}` : "—"}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="source">
        {mode === "forecast" ? "Open-Meteo forecast" : "Open-Meteo historical archive"} at the circuit coordinates, in circuit local time.
        {mode === "lastyear" && ` The ${race.season} weekend is beyond the seven-day forecast, so these are the same calendar dates in ${+race.season - 1}.`}
        {dates.includes(today) && " Includes today."}
      </p>
      {mode !== "forecast" && <Source value={arch.value} label="Archive" />}
    </Glass>
  );
}

function TypicalCard({ circuit, race }: { circuit: CircuitT; race: Race }) {
  const { lat, long } = circuit.Location;
  const [ref, seen] = useSeen<HTMLDivElement>();
  const Y = +race.season;
  const first = Y - 10, last = Y - 1;
  const md = weekendDates(race).map((d) => d.slice(5));
  const c = useData(() => (seen ? climate(lat, long, `${first}-01-01`, `${last}-12-31`, "daily") : Promise.resolve(emptyEnv<Climate>({}))), [lat, long, first, last, seen]);
  const stats = useMemo(() => {
    const d = c.value?.data.daily;
    if (!d?.time?.length) return null;
    const years = new Map<number, { max: number[]; min: number[]; rain: number[] }>();
    d.time.forEach((t, i) => {
      if (!md.includes(t.slice(5))) return;
      const y = +t.slice(0, 4);
      const e = years.get(y) || { max: [], min: [], rain: [] };
      if (Number.isFinite(d.temperature_2m_max[i])) e.max.push(d.temperature_2m_max[i]);
      if (Number.isFinite(d.temperature_2m_min[i])) e.min.push(d.temperature_2m_min[i]);
      if (Number.isFinite(d.precipitation_sum[i])) e.rain.push(d.precipitation_sum[i]);
      years.set(y, e);
    });
    const all = [...years.values()];
    const flat = (k: "max" | "min" | "rain") => all.flatMap((e) => e[k]);
    const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
    const rainDays = flat("rain").filter((v) => v >= 1).length;
    return {
      max: mean(flat("max")), min: mean(flat("min")), days: flat("rain").length, rainDays, rainShare: flat("rain").length ? rainDays / flat("rain").length : 0,
      years: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, e]) => ({ y, max: mean(e.max), min: mean(e.min), rain: e.rain.reduce((s, v) => s + v, 0), wet: e.rain.filter((v) => v >= 1).length })),
    };
  }, [c.value, md.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const window = `${dayMonth(weekendDates(race)[0])} – ${dayMonth(race.date)}`;
  const lo = stats ? Math.min(...stats.years.map((y) => y.min)) : 0, hi = stats ? Math.max(...stats.years.map((y) => y.max)) : 1;
  return (
    <Glass className="card ckt-typical reveal" style={{ "--i": 2 } as CSSProperties}>
      <div ref={ref} className="card-title"><h3>Typical race-weekend conditions</h3><span className="chip purple">ERA5 · modelled</span></div>
      <p className="muted small ckt-typical-lede">{window} in each of the ten years {first}–{last}, at the circuit coordinates.</p>
      {!seen || c.loading ? <Skeleton h={220} r={20} /> : c.error ? <StateView error={c.error} onRetry={c.reload} /> : !stats || !stats.days ? (
        <StateView empty emptyTitle="No historical data" emptyText="The reanalysis archive returned no days for this window." />
      ) : (
        <>
          <div className="ckt-typical-kpis">
            <span><small><Thermometer size={12} />Avg high</small><b>{stats.max.toFixed(1)}°</b></span>
            <span><small><Thermometer size={12} />Avg low</small><b>{stats.min.toFixed(1)}°</b></span>
            <span><small><Umbrella size={12} />Rain days</small><b>{Math.round(stats.rainShare * 100)}%</b><em>{stats.rainDays} of {stats.days} days</em></span>
          </div>
          <ol className="ckt-typical-years" aria-label="Weekend temperature range and rainfall by year">
            {stats.years.map((y, i) => (
              <li key={y.y} style={{ "--i": i } as CSSProperties} title={`${y.y}: high ${y.max.toFixed(1)}°, low ${y.min.toFixed(1)}°, ${y.rain.toFixed(1)} mm rain`}>
                <span className="ckt-ty-year">{String(y.y).slice(2)}′</span>
                <span className="ckt-ty-range"><i style={{ bottom: `${((y.min - lo) / (hi - lo || 1)) * 100}%`, height: `${Math.max(4, ((y.max - y.min) / (hi - lo || 1)) * 100)}%` }} /></span>
                <span className={cx("ckt-ty-rain", y.wet > 0 && "wet")}>{y.wet > 0 ? <Droplets size={11} /> : "·"}</span>
              </li>
            ))}
          </ol>
          <p className="source">Modelled historical weather (ERA5 reanalysis), not trackside measurements. Daily highs and lows averaged across the window; a rain day has at least 1 mm of modelled precipitation. Bars show each year's low-to-high range; droplets mark years with a rain day.</p>
        </>
      )}
      {seen && <Source value={c.value} label="Climate" />}
    </Glass>
  );
}

function OrientCard({ circuit, tz }: { circuit: CircuitT; tz?: string }) {
  const { Location: loc } = circuit;
  const dms = (v: string, pos: string, neg: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    const a = Math.abs(n), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60);
    return `${d}° ${m}′ ${s}″ ${n >= 0 ? pos : neg}`;
  };
  return (
    <Glass className="card ckt-orient reveal" style={{ "--i": 3 } as CSSProperties}>
      <div className="card-title"><h3>Getting oriented</h3><span className="eyebrow"><Compass size={13} />From the data</span></div>
      <dl className="ckt-orient-list">
        <div><dt>Venue</dt><dd>{circuit.circuitName}</dd></div>
        <div><dt>Location</dt><dd><Flag country={loc.country} />{loc.locality}, {loc.country}</dd></div>
        <div><dt>Coordinates</dt><dd className="tabular">{Number(loc.lat).toFixed(4)}, {Number(loc.long).toFixed(4)}<small>{dms(loc.lat, "N", "S")} · {dms(loc.long, "E", "W")}</small></dd></div>
        {tz && <div><dt>Time zone</dt><dd>{tz.replace(/_/g, " ")}</dd></div>}
      </dl>
      <div className="ckt-orient-links">
        <a className="btn sm" href={osm(circuit)} target="_blank" rel="noopener noreferrer"><MapPin />OpenStreetMap<ExternalLink /></a>
        <a className="btn sm" href={circuit.url} target="_blank" rel="noopener noreferrer"><BookOpen />Wikipedia<ExternalLink /></a>
      </div>
      <p className="source">Venue details and coordinates from the Jolpica circuit record. Map data © OpenStreetMap contributors.</p>
    </Glass>
  );
}
