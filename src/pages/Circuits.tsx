import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, MapPin, Search, X } from "lucide-react";
import { allResults, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { splitCalendar, useCalendar } from "../lib/season";
import { circuitMedia, fullName, loadTracks, teamColor } from "../lib/media";
import { formatDateRange, plural, relativeTime, sessionDate } from "../lib/format";
import { Counter, Img, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag, TrackMap } from "../ui/media";
import type { Race, Result } from "../types";
import "./circuits.css";

type Venue = { id: string; circuit: Race["Circuit"]; races: Race[]; done: boolean; next: boolean };
type Filter = "all" | "upcoming" | "completed";

/** A Grand Prix counts as run ~2.5 h after its published start (same rule as the calendar). */
const finished = (r: Race, now: number) => sessionDate(r.date, r.time).getTime() + 2.5 * 3600e3 <= now;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const weekendStart = (r: Race) => r.FirstPractice?.date || r.SprintQualifying?.date || r.Qualifying?.date || r.date;

/** True once the element has scrolled into view (sticky). */
function useInView<T extends Element>(ref: RefObject<T | null>, margin = "0px 0px -8% 0px") {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin, threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/** Whether a circuit outline exists in the outline bundle (null while the bundle loads). */
function useHasOutline(id: string) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    loadTracks().then((t) => live && setHas(!!(t as Record<string, unknown>)[id]));
    return () => { live = false; };
  }, [id]);
  return has;
}

export default function Circuits({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle("Circuits");
  const cal = useCalendar(season);
  const results = useData(() => allResults(season), [season]);
  const now = useNow(60_000);
  const [q, setQ] = useState(route.query.get("q") || "");
  const [filter, setFilter] = useState<Filter>(() => {
    const f = route.query.get("show");
    return f === "upcoming" || f === "completed" ? f : "all";
  });
  useEffect(() => setQuery({ q: q.trim() || null, show: filter === "all" ? null : filter }), [q, filter]);

  const list = cal.value?.data || [];
  const { next } = splitCalendar(list, now);

  const venues = useMemo(() => {
    const map = new Map<string, Venue>();
    for (const r of list) {
      const id = r.Circuit.circuitId;
      const v = map.get(id) || { id, circuit: r.Circuit, races: [], done: false, next: false };
      v.races.push(r);
      map.set(id, v);
    }
    return [...map.values()].map((v) => ({
      ...v,
      done: v.races.every((r) => finished(r, now)),
      next: !!next && v.races.some((r) => r.round === next.round),
    }));
  }, [list, now, next]);

  const winners = useMemo(() => {
    const m = new Map<string, Result>();
    for (const r of results.value?.data || []) {
      const w = r.Results?.find((x) => x.position === "1");
      if (w) m.set(r.round, w);
    }
    return m;
  }, [results.value]);

  const latestWinner = [...winners.entries()].sort((a, b) => +b[0] - +a[0])[0]?.[1];
  useAmbient(latestWinner ? teamColor(latestWinner.Constructor) : undefined);

  const counts = { all: venues.length, upcoming: venues.filter((v) => !v.done).length, completed: venues.filter((v) => v.done).length };
  const needle = fold(q.trim());
  const shown = venues.filter((v) => {
    if (filter === "upcoming" && v.done) return false;
    if (filter === "completed" && !v.done) return false;
    if (!needle) return true;
    const hay = fold([v.circuit.circuitName, v.circuit.Location.locality, v.circuit.Location.country, ...v.races.map((r) => r.raceName)].join(" "));
    return needle.split(/\s+/).every((w) => hay.includes(w));
  });

  return (
    <Page className="cir">
      {cal.loading ? (
        <Skeleton h="min(70vh, 620px)" r={36} />
      ) : cal.error ? (
        <StateView error={cal.error} onRetry={cal.reload} />
      ) : (
        <CircuitsHero venues={venues} next={next} year={year} now={now} carColor={latestWinner ? teamColor(latestWinner.Constructor) : undefined} />
      )}

      <Section
        title={`The ${year} venues`}
        subtitle={venues.length ? `${plural(venues.length, "circuit")} · hover or focus a card to send a car around the lap` : undefined}
      >
        <div className="cir-toolbar reveal">
          <label className="search-input cir-search">
            <Search />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search circuit, city or country" aria-label="Search circuits" />
            {q && <button type="button" className="cir-clear" onClick={() => setQ("")} aria-label="Clear search"><X size={15} /></button>}
          </label>
          <Segmented<Filter>
            label="Filter circuits by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: <>All <span className="cir-count">{counts.all}</span></> },
              { value: "upcoming", label: <>Upcoming <span className="cir-count">{counts.upcoming}</span></> },
              { value: "completed", label: <>Completed <span className="cir-count">{counts.completed}</span></> },
            ]}
          />
        </div>

        {cal.loading ? (
          <div className="cir-grid">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={430} r={28} />)}
          </div>
        ) : cal.error ? null : !venues.length ? (
          <StateView empty emptyTitle={`No ${year} calendar published`} emptyText="The schedule for this season hasn't been released by the data source yet." />
        ) : !shown.length ? (
          <StateView empty emptyTitle="No circuits match" emptyText={q ? <>Nothing on the {year} calendar matches “{q}”.</> : `No ${filter} circuits this season.`} />
        ) : (
          <motion.div layout className="cir-grid">
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((v, i) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  className="cir-cell"
                >
                  <CircuitCard venue={v} winner={winners.get(v.races.at(-1)!.round)} index={i} year={year} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        <Source value={cal.value} />
      </Section>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function CircuitsHero({ venues, next, year, now, carColor }: { venues: Venue[]; next?: Race; year: string; now: number; carColor?: string }) {
  const feature = (next && venues.find((v) => v.races.some((r) => r.round === next.round))) || venues.at(-1);
  const featureRace = next && feature?.next ? next : feature?.races.at(-1);
  const media = circuitMedia(feature?.id);
  const countries = new Set(venues.map((v) => v.circuit.Location.country)).size;
  const done = venues.filter((v) => v.done).length;
  const stats: [number, string][] = [
    [venues.length, venues.length === 1 ? "venue" : "venues"],
    [countries, countries === 1 ? "country" : "countries"],
    [done, "completed"],
    [venues.length - done, "to go"],
  ];
  return (
    <section className="cir-hero">
      <div className="cir-hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="cir-hero-scrim" />
      </div>
      <div className="cir-hero-inner">
        <div className="cir-hero-copy">
          <span className="eyebrow cir-hero-eyebrow rise"><MapPin size={14} />{year} season · Circuit guide</span>
          <h1 className="display cir-hero-title rise" style={{ "--i": 1 } as CSSProperties}>
            Every corner
            <span>of the {year} calendar</span>
          </h1>
          <p className="cir-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>
            From street-lined harbours to high-speed cathedrals — explore each venue's layout, its winners through the decades and the weather at the track right now.
          </p>
          {venues.length > 0 && (
            <div className="cir-hero-stats rise" style={{ "--i": 3 } as CSSProperties}>
              {stats.map(([n, label]) => (
                <span key={label} className="cir-hero-stat">
                  <b><Counter value={n} /></b>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          )}
        </div>
        {feature && featureRace && (
          <Link to={"circuit/" + feature.id} className="cir-hero-track rise" style={{ "--i": 2 } as CSSProperties} aria-label={`${feature.circuit.circuitName} circuit guide`}>
            <span className="cir-hero-track-head">
              <span className="eyebrow">{feature.next ? <><span className="dot live" />Next stop</> : "Season finale"}</span>
              <strong>{feature.circuit.circuitName}</strong>
              <small>
                <Flag country={feature.circuit.Location.country} />
                {feature.circuit.Location.locality} · {feature.next ? relativeTime(sessionDate(featureRace.date, featureRace.time).toISOString(), now) : formatDateRange(weekendStart(featureRace), featureRace.date)}
              </small>
            </span>
            <span className="cir-hero-map">
              <TrackMap circuitId={feature.id} cars={[carColor || "#ff3b30", "#ffffff"]} label={`${feature.circuit.circuitName} layout`} />
            </span>
            <span className="cir-hero-cta">Circuit guide <ArrowRight size={14} /></span>
          </Link>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Card ───────────────────────── */
function CircuitCard({ venue, winner, index, year }: { venue: Venue; winner?: Result; index: number; year: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const seen = useInView(ref);
  const hasOutline = useHasOutline(venue.id);
  const [hot, setHot] = useState(false);
  const media = circuitMedia(venue.id);
  const first = venue.races[0];
  const last = venue.races.at(-1)!;
  const carColor = winner ? teamColor(winner.Constructor) : "#ff3b30";
  const { circuit } = venue;
  const sprint = venue.races.some((r) => r.Sprint);
  return (
    <Link
      ref={ref}
      to={"circuit/" + venue.id}
      className={cx("cir-card glass interactive reveal", venue.next && "next", venue.done && "done", hot && "hot")}
      style={{ "--i": index % 6, "--tint": carColor } as CSSProperties}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      aria-label={`${circuit.circuitName}, ${circuit.Location.locality}, ${circuit.Location.country} — ${venue.races.map((r) => r.raceName + ", round " + r.round).join("; ")}`}
    >
      <span className="cir-media">
        {media.hero ? <Img src={media.hero} alt="" /> : <span className="cir-placeholder" />}
        <span className="cir-scrim" />
        <span className="cir-track" aria-hidden>
          {seen && hasOutline !== false && <TrackMap circuitId={venue.id} cars={hot ? [carColor] : []} lap={7} label={`${circuit.circuitName} layout`} />}
          {hasOutline === false && <span className="cir-no-outline"><MapPin size={34} /><small>Layout outline unavailable</small></span>}
        </span>
        <span className="cir-chips">
          <span className="chip solid">{venue.races.length > 1 ? venue.races.map((r) => "R" + r.round).join(" · ") : "R" + first.round}</span>
          {venue.next && <span className="chip accent"><span className="live-dot" />Next up</span>}
          {sprint && <span className="chip yellow">Sprint</span>}
          {venue.done && <span className="chip green"><Check />Raced</span>}
        </span>
      </span>
      <span className="cir-body">
        <span className="cir-place"><Flag country={circuit.Location.country} />{circuit.Location.locality}, {circuit.Location.country}</span>
        <strong className="cir-name">{circuit.circuitName}</strong>
        <span className="cir-race">{venue.races.map((r) => r.raceName).filter((n, i, a) => a.indexOf(n) === i).join(" · ")}</span>
        <span className="cir-foot">
          <span className="cir-date">{formatDateRange(weekendStart(first), last.date)}</span>
          {winner ? (
            <span className="cir-winner" title={`Winner: ${fullName(winner.Driver)}`}>
              <DriverAvatar id={winner.Driver.driverId} name={fullName(winner.Driver)} year={year} team={winner.Constructor.constructorId} size={24} />
              {winner.Driver.familyName}
            </span>
          ) : (
            <ArrowRight size={17} className="cir-arrow" />
          )}
        </span>
      </span>
    </Link>
  );
}
