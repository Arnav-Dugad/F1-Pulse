/**
 * Shared OpenF1 archive plumbing for the Telemetry lab and Race replay pages:
 * session / driver / lap selection (persisted to the URL), validity filters,
 * driver identity badges, the glass control bar, progress + empty states and the pace summary.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeftRight, CalendarClock, ChevronDown, History, Sparkles, Star, Timer } from "lucide-react";
import { request, sessions, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { parseRoute, setQuery } from "../lib/router";
import { circuitMedia, driverMedia, initials, isLightColor } from "../lib/media";
import { lapTime, plural } from "../lib/format";
import { median } from "../math.mjs";
import { Glass, Img, Segmented, Skeleton, Source, StateView, cx } from "../ui/core";
import { DriverAvatar, Flag } from "../ui/media";
import { LineChart } from "../ui/charts";
import type { ArchiveDriver, Envelope, Lap, Session } from "../types";
import "./archive.css";

/* ───────────────────────── Constants & helpers ───────────────────────── */

/** OpenF1's historical archive begins with the 2023 season. */
export const ARCHIVE_FIRST_YEAR = 2023;

export type Group = "race" | "quali" | "sprint" | "sq" | "practice";
export const GROUPS: { value: Group; label: string; match: (name: string) => boolean }[] = [
  { value: "race", label: "Race", match: (n) => n === "Race" },
  { value: "quali", label: "Qualifying", match: (n) => n === "Qualifying" },
  { value: "sprint", label: "Sprint", match: (n) => n === "Sprint" },
  { value: "sq", label: "Sprint quali", match: (n) => n === "Sprint Qualifying" || n === "Sprint Shootout" },
  { value: "practice", label: "Practice", match: (n) => /^Practice/i.test(n) },
];
const groupOf = (name: string): Group | undefined => GROUPS.find((g) => g.match(name))?.value;
const isGroup = (v: string | null): v is Group => !!v && GROUPS.some((g) => g.value === v);

/** A lap is usable for telemetry when it has a start time, a plausible duration (the Worker caps windows at 3 minutes) and isn't an out-lap. */
export const validLap = (l: Lap) =>
  !!l.date_start && l.lap_duration !== null && l.lap_duration > 0 && l.lap_duration <= 180 && !l.is_pit_out_lap;
export const fastestLap = (list: Lap[]) =>
  [...list].filter(validLap).sort((a, b) => a.lap_duration! - b.lap_duration!)[0] as Lap | undefined;
export const lapEnd = (l: Lap) => new Date(Date.parse(l.date_start!) + l.lap_duration! * 1000).toISOString();

export const emptyEnvelope = <T,>(data: T): Envelope<T> => ({ data, meta: { source: "openf1", url: "", fetchedAt: "", status: "" } });

export const teamHex = (d?: Pick<ArchiveDriver, "team_colour"> | null) =>
  d?.team_colour && /^#?[0-9a-f]{6}$/i.test(d.team_colour) ? "#" + d.team_colour.replace("#", "").toUpperCase() : "#8E8E99";

const rgb = (hex: string) => {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const colourDistance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
/** Team colours for the pair; teammates (or near-identical liveries) get a contrasting second colour. */
export function pairColours(a?: ArchiveDriver, b?: ArchiveDriver): [string, string] {
  const ca = teamHex(a), cb = teamHex(b);
  if (colourDistance(ca, cb) > 70) return [ca, cb];
  const alt = colourDistance(ca, "#64D2FF") > 110 ? "#64D2FF" : "#FF9F0A";
  return [ca, alt];
}

export const signed = (s: number | null | undefined, digits = 3) => {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  const v = Math.abs(s) < 0.5 * 10 ** -digits ? 0 : s;
  return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
};
export const utcClock = (ms: number, decimals = 1) => {
  const iso = new Date(ms).toISOString();
  return iso.slice(11, decimals ? 20 + decimals - 1 : 19);
};
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const displayName = (d?: ArchiveDriver) => {
  if (!d) return "";
  // OpenF1 writes surnames in capitals ("Max VERSTAPPEN"); present them in title case.
  return d.full_name.split(/\s+/).map((w) => (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
};
export const surname = (d?: ArchiveDriver) => displayName(d).split(" ").slice(-1)[0] || d?.name_acronym || "";

/** OpenF1 circuit names → Jolpica circuit ids (for photography and outlines only). */
const CIRCUITS: Record<string, string> = {
  sakhir: "bahrain", bahrain: "bahrain", jeddah: "jeddah", melbourne: "albert_park", suzuka: "suzuka", shanghai: "shanghai",
  miami: "miami", imola: "imola", "monte carlo": "monaco", monaco: "monaco", montreal: "villeneuve", catalunya: "catalunya",
  barcelona: "catalunya", spielberg: "red_bull_ring", silverstone: "silverstone", hungaroring: "hungaroring", budapest: "hungaroring",
  "spa-francorchamps": "spa", zandvoort: "zandvoort", monza: "monza", baku: "baku", singapore: "marina_bay", "marina bay": "marina_bay",
  austin: "americas", "mexico city": "rodriguez", interlagos: "interlagos", "sao paulo": "interlagos", "las vegas": "vegas",
  lusail: "losail", losail: "losail", "yas marina circuit": "yas_marina", "yas marina": "yas_marina", "yas island": "yas_marina",
  "abu dhabi": "yas_marina", madrid: "madring", madring: "madring",
};
const fold = (s?: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
export const circuitIdOf = (s?: Session) => (s ? CIRCUITS[fold(s.circuit_short_name)] || CIRCUITS[fold(s.location)] : undefined);

/** Map an OpenF1 driver to a Jolpica driver id that has 2026 photography. */
function mediaId(d: ArchiveDriver) {
  const parts = fold(d.full_name).split(/\s+/).filter(Boolean);
  const first = parts[0], last = parts.at(-1);
  for (const c of [`${first}_${last}`, last || ""]) if (c && driverMedia(c, "2026")?.head) return c;
  return undefined;
}

/* ───────────────────────── Driver badge ───────────────────────── */
export function DriverBadge({ driver, year, size = 40, colour, className }: { driver?: ArchiveDriver; year: string; size?: number; colour?: string; className?: string }) {
  if (!driver) return <span className={cx("ax-badge", className)} style={{ "--s": size + "px", "--tint": "#8E8E99" } as CSSProperties} aria-hidden />;
  const tint = colour || teamHex(driver);
  const id = year === "2026" ? mediaId(driver) : undefined;
  if (id)
    return (
      <span className={cx("ax-badge-photo", className)} style={{ "--tint": tint, "--s": size + "px" } as CSSProperties}>
        <DriverAvatar id={id} name={displayName(driver)} year={year} size={size} />
      </span>
    );
  return (
    <span className={cx("ax-badge", isLightColor(tint) && "light", className)} style={{ "--s": size + "px", "--tint": tint } as CSSProperties} role="img" aria-label={displayName(driver)}>
      <span aria-hidden>{initials(displayName(driver))}</span>
    </span>
  );
}

/* ───────────────────────── Selection hook ───────────────────────── */
export type Archive = ReturnType<typeof useArchive>;

export function useArchive(mode: "telemetry" | "replay") {
  const { year } = usePrefs();
  const archived = +year >= ARCHIVE_FIRST_YEAR;
  // Read the live hash (setQuery replaces history without notifying the router).
  const init = useMemo(() => parseRoute().query, []);
  const [group, setGroupRaw] = useState<Group>(isGroup(init.get("type")) ? (init.get("type") as Group) : "race");
  const [key, setKey] = useState(init.get("s") || "");
  const [a, setA] = useState(init.get("a") || "");
  const [b, setB] = useState(init.get("b") || "");
  const [lapA, setLapA] = useState(init.get("la") || "");
  const [lapB, setLapB] = useState(init.get("lb") || "");

  const sessionData = useData(() => (archived ? sessions(year) : Promise.resolve(emptyEnvelope<Session[]>([]))), [year, archived]);
  const all = sessionData.value?.data || [];
  const counts = useMemo(() => {
    const c: Record<Group, number> = { race: 0, quali: 0, sprint: 0, sq: 0, practice: 0 };
    for (const s of all) {
      const g = groupOf(s.session_name);
      if (g) c[g]++;
    }
    return c;
  }, [all]);
  // A shared link may name a session from another group than the default.
  useEffect(() => {
    const s = all.find((x) => String(x.session_key) === key);
    const g = s && groupOf(s.session_name);
    if (g && g !== group) setGroupRaw(g);
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => all.filter((s) => GROUPS.find((g) => g.value === group)!.match(s.session_name)), [all, group]);
  const session = list.find((s) => String(s.session_key) === key) || list[0];
  const sessionKey = session?.session_key;

  const driverData = useData(
    () => (sessionKey ? request<ArchiveDriver[]>("openf1", "drivers", { session_key: sessionKey }) : Promise.resolve(emptyEnvelope<ArchiveDriver[]>([]))),
    [sessionKey],
  );
  const drivers = useMemo(() => {
    const seen = new Map<number, ArchiveDriver>();
    for (const d of driverData.value?.data || []) if (d?.driver_number && !seen.has(d.driver_number)) seen.set(d.driver_number, d);
    return [...seen.values()].sort((x, y) => (x.team_name || "").localeCompare(y.team_name || "") || x.driver_number - y.driver_number);
  }, [driverData.value]);
  // Default to the session's top two classified drivers (fastest two in practice/qualifying).
  const resultData = useData(
    () => (sessionKey ? request<{ position: number | null; driver_number: number }[]>("openf1", "session_result", { session_key: sessionKey }).catch(() => emptyEnvelope<{ position: number | null; driver_number: number }[]>([])) : Promise.resolve(emptyEnvelope<{ position: number | null; driver_number: number }[]>([]))),
    [sessionKey],
  );
  const order = useMemo(
    () => (resultData.value?.data || []).filter((r) => r.position).sort((x, y) => x.position! - y.position!).map((r) => String(r.driver_number)),
    [resultData.value],
  );
  const has = (n: string) => drivers.some((d) => String(d.driver_number) === n);
  // Wait for the classification so the default pair doesn't flip (and re-fetch telemetry) once it arrives.
  const ranked = resultData.loading ? [] : [...order.filter(has), ...drivers.map((d) => String(d.driver_number)).filter((n) => !order.includes(n))];
  const aId = a && has(a) ? a : ranked[0] || "";
  const bId = b && has(b) && b !== aId ? b : ranked.find((n) => n !== aId) || "";
  const driverA = drivers.find((d) => String(d.driver_number) === aId);
  const driverB = drivers.find((d) => String(d.driver_number) === bId);

  const lapsAData = useData(
    () => (sessionKey && aId ? request<Lap[]>("openf1", "laps", { session_key: sessionKey, driver_number: aId }) : Promise.resolve(emptyEnvelope<Lap[]>([]))),
    [sessionKey, aId],
  );
  const lapsBData = useData(
    () => (sessionKey && bId ? request<Lap[]>("openf1", "laps", { session_key: sessionKey, driver_number: bId }) : Promise.resolve(emptyEnvelope<Lap[]>([]))),
    [sessionKey, bId],
  );
  const lapsA = useMemo(() => [...(lapsAData.value?.data || [])].filter((l) => String(l.driver_number) === aId).sort((x, y) => x.lap_number - y.lap_number), [lapsAData.value, aId]);
  const lapsB = useMemo(() => [...(lapsBData.value?.data || [])].filter((l) => String(l.driver_number) === bId).sort((x, y) => x.lap_number - y.lap_number), [lapsBData.value, bId]);
  const fastestA = fastestLap(lapsA), fastestB = fastestLap(lapsB);
  const chosenA = lapsA.find((l) => String(l.lap_number) === lapA && validLap(l)) || fastestA;
  const chosenB = lapsB.find((l) => String(l.lap_number) === lapB && validLap(l)) || fastestB;
  const colours = pairColours(driverA, driverB);

  // Persist the resolved selection so the URL reproduces exactly what is on screen.
  const lapsReady = !lapsAData.loading && !lapsBData.loading;
  useEffect(() => {
    if (!archived) return;
    setQuery({
      type: group === "race" ? null : group,
      s: session ? String(session.session_key) : key || null,
      a: drivers.length ? aId : a || null,
      b: drivers.length ? bId : b || null,
      la: lapsReady && lapsA.length ? (chosenA ? String(chosenA.lap_number) : null) : lapA || null,
      lb: mode === "replay" ? null : lapsReady && lapsB.length ? (chosenB ? String(chosenB.lap_number) : null) : lapB || null,
    });
  }, [archived, group, session?.session_key, aId, bId, chosenA?.lap_number, chosenB?.lap_number, drivers.length, lapsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    year, archived, mode,
    sessionData, all, counts, list, group, session, sessionKey,
    driverData, drivers, aId, bId, driverA, driverB, colours,
    lapsAData, lapsBData, lapsA, lapsB, chosenA, chosenB, fastestA, fastestB,
    setGroup(g: Group) { setGroupRaw(g); setKey(""); setLapA(""); setLapB(""); },
    setSession(k: string) { setKey(k); setLapA(""); setLapB(""); },
    setDriverA(v: string) { if (v === bId) { setB(aId); setLapB(lapA); } setA(v); setLapA(""); },
    setDriverB(v: string) { if (v === aId) { setA(bId); setLapA(lapB); } setB(v); setLapB(""); },
    setLapA, setLapB,
    swap() {
      setA(bId); setB(aId);
      setLapA(chosenB ? String(chosenB.lap_number) : ""); setLapB(chosenA ? String(chosenA.lap_number) : "");
    },
  };
}

/* ───────────────────────── Control bar ───────────────────────── */
export function ArchiveControls({ ax }: { ax: Archive }) {
  const replay = ax.mode === "replay";
  const options = GROUPS.map((g) => ({ value: g.value, label: <>{g.label}{ax.all.length > 0 && <small className="ax-seg-count">{ax.counts[g.value]}</small>}</> }));
  return (
    <Glass className="ax-controls reveal" strong>
      <div className="ax-controls-top">
        <div className="ax-field ax-type">
          <span className="ax-label">Session</span>
          <Segmented label="Session type" options={options} value={ax.group} onChange={ax.setGroup} />
        </div>
        <label className="ax-field ax-event">
          <span className="ax-label">Archived event</span>
          {ax.sessionData.loading ? (
            <Skeleton h={42} r={14} />
          ) : (
            <span className="ax-select-wrap">
              <select className="select" value={ax.sessionKey || ""} onChange={(e) => ax.setSession(e.target.value)} disabled={!ax.list.length} aria-label="Archived event">
                {!ax.list.length && <option value="">No archived sessions</option>}
                {ax.list.map((s) => (
                  <option key={s.session_key} value={s.session_key}>
                    {s.location} · {s.session_name} · {shortDate(s.date_start)}
                  </option>
                ))}
              </select>
            </span>
          )}
        </label>
      </div>
      <div className={cx("ax-duel", replay && "replay")}>
        <DriverPicker ax={ax} side="a" />
        <button type="button" className="ax-swap" onClick={ax.swap} disabled={!ax.driverA || !ax.driverB} aria-label="Swap Driver A and Driver B" title="Swap drivers">
          <ArrowLeftRight size={16} />
          <span className="ax-vs">vs</span>
        </button>
        <DriverPicker ax={ax} side="b" />
      </div>
    </Glass>
  );
}

function DriverPicker({ ax, side }: { ax: Archive; side: "a" | "b" }) {
  const replay = ax.mode === "replay";
  const driver = side === "a" ? ax.driverA : ax.driverB;
  const value = side === "a" ? ax.aId : ax.bId;
  const colour = ax.colours[side === "a" ? 0 : 1];
  const laps = side === "a" ? ax.lapsA : ax.lapsB;
  const lapsData = side === "a" ? ax.lapsAData : ax.lapsBData;
  const chosen = side === "a" ? ax.chosenA : ax.chosenB;
  const fastest = side === "a" ? ax.fastestA : ax.fastestB;
  const valid = laps.filter(validLap);
  const showLap = !replay || side === "a";
  const teams = useMemo(() => {
    const m = new Map<string, ArchiveDriver[]>();
    for (const d of ax.drivers) m.set(d.team_name || "Unlisted team", [...(m.get(d.team_name || "Unlisted team") || []), d]);
    return [...m.entries()];
  }, [ax.drivers]);
  return (
    <div className="ax-picker" style={{ "--tint": colour } as CSSProperties}>
      <span className="ax-side">Driver {side.toUpperCase()}</span>
      {ax.driverData.loading ? (
        <Skeleton h={58} r={18} />
      ) : (
        <label className="ax-driver">
          <DriverBadge driver={driver} year={ax.year} size={42} colour={colour} />
          <span className="ax-driver-text">
            <strong>{driver ? displayName(driver) : ax.drivers.length ? "Choose a driver" : "No drivers listed"}</strong>
            <small>{driver ? `#${driver.driver_number} · ${driver.team_name || "Team unlisted"}` : "OpenF1 entry list"}</small>
          </span>
          <ChevronDown size={16} className="ax-chev" />
          <select value={value} onChange={(e) => (side === "a" ? ax.setDriverA : ax.setDriverB)(e.target.value)} aria-label={`Driver ${side.toUpperCase()}`} disabled={!ax.drivers.length}>
            {teams.map(([team, list]) => (
              <optgroup key={team} label={team}>
                {list.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>{displayName(d)} · #{d.driver_number}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {showLap && (
        <label className="ax-lap">
          <span className="ax-lap-label">{replay ? <><Timer size={13} />Replay window</> : <><Timer size={13} />Lap</>}</span>
          {lapsData.loading || ax.driverData.loading ? (
            <Skeleton h={36} r={12} />
          ) : (
            <span className="ax-select-wrap">
              <select className="select ax-lap-select" value={chosen?.lap_number || ""} disabled={!valid.length} onChange={(e) => (side === "a" ? ax.setLapA : ax.setLapB)(e.target.value)} aria-label={`${replay ? "Replay window lap" : "Lap"} for Driver ${side.toUpperCase()}`}>
                {!valid.length && <option value="">{lapsData.error ? "Laps unavailable" : "No valid timed laps"}</option>}
                {valid.map((l) => (
                  <option key={l.lap_number} value={l.lap_number}>
                    Lap {l.lap_number} · {lapTime(l.lap_duration)}{l.lap_number === fastest?.lap_number ? "  ★ fastest" : ""}
                  </option>
                ))}
              </select>
            </span>
          )}
          {chosen && chosen.lap_number === fastest?.lap_number && <span className="ax-fastest"><Star size={11} />Fastest valid lap</span>}
        </label>
      )}
      {!showLap && (
        <p className="ax-shared xsmall">Shares Driver A's lap window on the same session clock.</p>
      )}
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
export function ArchiveHero({ eyebrow, title, sub, lede, session, graphic, children, className }: {
  eyebrow: ReactNode; title: ReactNode; sub: ReactNode; lede: ReactNode; session?: Session; graphic?: ReactNode; children?: ReactNode; className?: string;
}) {
  const circuit = circuitIdOf(session);
  const media = circuitMedia(circuit);
  return (
    <section className={cx("ax-hero", className)}>
      <div className="ax-hero-media" aria-hidden>
        <Img key={media.hero || "none"} src={media.hero} alt="" eager />
        <span className="ax-hero-grid" />
        <span className="ax-hero-scrim" />
      </div>
      <div className="ax-hero-inner">
        <div className="ax-hero-copy">
          <span className="eyebrow ax-hero-eyebrow rise">{eyebrow}</span>
          <h1 className="display ax-hero-title rise" style={{ "--i": 1 } as CSSProperties}>{title}<span>{sub}</span></h1>
          <p className="ax-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>{lede}</p>
          {session && (
            <p className="ax-hero-session rise" style={{ "--i": 3 } as CSSProperties}>
              <Flag country={session.country_name} large />
              <span>{session.location} · {session.session_name}<small>{session.circuit_short_name} · {shortDate(session.date_start)}</small></span>
            </p>
          )}
          {children}
        </div>
        {graphic && <div className="ax-hero-graphic">{graphic}</div>}
      </div>
    </section>
  );
}

/* ───────────────────────── Pre-2023 empty state ───────────────────────── */
export function ArchiveUnavailable({ year, feature }: { year: string; feature: string }) {
  const { setSeason } = usePrefs();
  const go = (s: string) => {
    setQuery({ season: s === "current" ? null : s, s: null, a: null, b: null, la: null, lb: null, type: null });
    setSeason(s);
  };
  return (
    <Glass className="ax-unavailable reveal">
      <span className="ax-unavailable-orb" aria-hidden><History size={30} /></span>
      <span className="eyebrow">OpenF1 archive · {year}</span>
      <h2 className="title-2">{feature} starts in {ARCHIVE_FIRST_YEAR}.</h2>
      <p className="muted">
        Car telemetry, positional samples and race-control logs are published by OpenF1 from the {ARCHIVE_FIRST_YEAR} season onwards.
        There is no measured data for {year} to load — switch to an archived season to continue.
      </p>
      <div className="row wrap" style={{ justifyContent: "center" }}>
        <button className="btn accent lg" onClick={() => go("2025")}><Sparkles />Open the 2025 archive</button>
        <button className="btn lg" onClick={() => go("current")}><CalendarClock />Current season</button>
      </div>
    </Glass>
  );
}

/* ───────────────────────── Loading progress ───────────────────────── */
export function LoadProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const pct = Math.max(4, Math.min(100, ((step - 0.5) / total) * 100));
  return (
    <div className="ax-progress" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <div className="ax-progress-body">
        <strong>{label}</strong>
        <span className="faint xsmall">Request {step} of {total} · OpenF1 requests are queued to respect the provider's rate limit.</span>
        <div className="ax-progress-track"><motion.span className="ax-progress-fill" animate={{ width: pct + "%" }} transition={{ type: "spring", stiffness: 120, damping: 22 }} /></div>
      </div>
    </div>
  );
}

/* ───────────────────────── Session state (loading / errors / empty) ───────────────────────── */
export function ArchiveStatus({ ax }: { ax: Archive }) {
  if (ax.sessionData.error) return <StateView error={ax.sessionData.error} onRetry={ax.sessionData.reload} />;
  if (!ax.sessionData.loading && !ax.list.length)
    return (
      <StateView empty emptyTitle={`No archived ${GROUPS.find((g) => g.value === ax.group)!.label.toLowerCase()} sessions`}
        emptyText={ax.all.length ? "Try another session type above. Sessions appear here once the provider's live window has ended." : `OpenF1 hasn't published archived sessions for ${ax.year} yet.`} />
    );
  if (ax.driverData.error) return <StateView error={ax.driverData.error} onRetry={ax.driverData.reload} />;
  if (ax.lapsAData.error || ax.lapsBData.error)
    return <StateView error={ax.lapsAData.error || ax.lapsBData.error} onRetry={() => { ax.lapsAData.reload(); ax.lapsBData.reload(); }} />;
  if (!ax.driverData.loading && ax.session && !ax.drivers.length)
    return <StateView empty emptyTitle="No entry list for this session" emptyText="OpenF1 didn't publish drivers for this session. Choose another event." />;
  return null;
}

/* ───────────────────────── Pace summary (from already-loaded laps) ───────────────────────── */
export function PaceSummary({ ax, compact }: { ax: Archive; compact?: boolean }) {
  const loading = ax.lapsAData.loading || ax.lapsBData.loading;
  const rows = [
    { d: ax.driverA, laps: ax.lapsA, colour: ax.colours[0], side: "A" },
    { d: ax.driverB, laps: ax.lapsB, colour: ax.colours[1], side: "B" },
  ].map((r) => {
    const valid = r.laps.filter(validLap);
    return { ...r, valid, median: median(valid.map((l) => l.lap_duration!)), best: fastestLap(valid) };
  });
  const maxLap = Math.max(0, ...ax.lapsA.map((l) => l.lap_number), ...ax.lapsB.map((l) => l.lap_number));
  const labels = Array.from({ length: maxLap }, (_, i) => String(i + 1));
  const series = rows.map((r) => {
    const cap = (r.median || Infinity) * 1.12;
    const values = labels.map((_, i) => {
      const l = r.valid.find((x) => x.lap_number === i + 1);
      return l && l.lap_duration! <= cap ? l.lap_duration! : null;
    });
    return { id: r.side, name: r.d?.name_acronym || "Driver " + r.side, color: r.colour, values };
  });
  const nums = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1;
  const pad = Math.max(0.3, (hi - lo) * 0.12);
  if (loading) return <Skeleton h={compact ? 220 : 420} r={28} />;
  if (!rows.some((r) => r.laps.length)) return <StateView empty emptyTitle="No laps recorded" emptyText="OpenF1 has no lap records for these drivers in this session." />;
  const medianGap = rows[0].median !== null && rows[1].median !== null ? rows[1].median - rows[0].median : null;
  return (
    <div className="ax-pace">
      <div className="ax-pace-kpis">
        {rows.map((r, i) => (
          <Glass key={r.side} className="ax-pace-kpi reveal" style={{ "--tint": r.colour, "--i": i } as CSSProperties}>
            <div className="row" style={{ "--gap": "10px" } as CSSProperties}>
              <DriverBadge driver={r.d} year={ax.year} size={34} colour={r.colour} />
              <span className="ax-pace-name"><strong>{r.d ? surname(r.d) : "Driver " + r.side}</strong><small>{plural(r.valid.length, "valid lap")} of {r.laps.length}</small></span>
            </div>
            <dl>
              <div><dt>Median pace</dt><dd>{lapTime(r.median)}</dd></div>
              <div><dt>Best lap</dt><dd>{lapTime(r.best?.lap_duration)}{r.best && <small> · L{r.best.lap_number}</small>}</dd></div>
            </dl>
          </Glass>
        ))}
        <Glass className="ax-pace-kpi gap reveal" style={{ "--i": 2 } as CSSProperties}>
          <span className="eyebrow">Median gap</span>
          <span className="ax-pace-gap">{signed(medianGap)}<small> s</small></span>
          <span className="faint xsmall">{medianGap === null ? "Not enough valid laps" : medianGap > 0 ? `${surname(rows[0].d)} quicker on median pace` : medianGap < 0 ? `${surname(rows[1].d)} quicker on median pace` : "Identical median pace"}</span>
        </Glass>
      </div>
      {!compact && nums.length > 1 && (
        <Glass className="card reveal">
          <LineChart
            ariaLabel="Valid lap times across the session for both drivers"
            series={series}
            labels={labels}
            yMin={lo - pad}
            yMax={hi + pad}
            yFormat={(v) => lapTime(v)}
            tooltipTitle={(i) => `Lap ${i + 1}`}
            height={300}
            curve={false}
          />
        </Glass>
      )}
      <p className="source">
        Valid laps exclude pit-out laps, laps without a start time and laps over three minutes; safety-car and traffic laps remain.
        {!compact && " The chart also omits laps more than 12% slower than the driver's median so the racing pace stays readable."}
      </p>
      <Source value={ax.lapsAData.value?.meta.fetchedAt ? ax.lapsAData.value : undefined} />
    </div>
  );
}
