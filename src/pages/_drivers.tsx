/* Shared driver-area helpers for Drivers / Driver / Compare pages. */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { paginate, request } from "../api";
import { cx } from "../ui/core";
import type { Driver, Envelope, Race, Result } from "../types";
import "./_drivers.css";

/* ─────────── Classification helpers ─────────── */
/** A finish is classified when Jolpica publishes a numeric positionText (R/D/E/W/F/N are not). */
export const isClassified = (r?: Pick<Result, "positionText"> | null) => !!r && /^\d+$/.test(r.positionText);

const statusCodes: Record<string, string> = { R: "DNF", D: "DSQ", E: "EXC", W: "DNS", F: "DNQ", N: "NC" };
const statusNames: Record<string, string> = { R: "Retired", D: "Disqualified", E: "Excluded", W: "Withdrawn / did not start", F: "Failed to qualify", N: "Not classified" };

export function finishLabel(r?: Result | null) {
  if (!r) return "—";
  return isClassified(r) ? "P" + r.positionText : statusCodes[r.positionText] || r.positionText;
}
export function finishDescription(r?: Result | null) {
  if (!r) return "Did not take part";
  return isClassified(r) ? `Finished P${r.positionText}${r.status && r.status !== "Finished" ? ` (${r.status})` : ""}` : `${statusNames[r.positionText] || "Not classified"}${r.status ? ` — ${r.status}` : ""}`;
}

export type Tone = "gold" | "silver" | "bronze" | "points" | "none" | "dnf" | "absent" | "future";
export function finishTone(r?: Result | null): Tone {
  if (!r) return "absent";
  if (!isClassified(r)) return "dnf";
  const p = +r.position;
  if (p === 1) return "gold";
  if (p === 2) return "silver";
  if (p === 3) return "bronze";
  return +r.points > 0 ? "points" : "none";
}

export type SeasonStats = {
  starts: number; classified: number; wins: number; podiums: number; dnfs: number;
  best: number | null; avg: number | null; gained: number; racePoints: number; pointsFinishes: number;
};
/** Race-only season statistics computed from published classifications. */
export function seasonStats(results: Result[]): SeasonStats {
  const cls = results.filter(isClassified);
  const positions = cls.map((r) => +r.position);
  return {
    starts: results.length,
    classified: cls.length,
    wins: positions.filter((p) => p === 1).length,
    podiums: positions.filter((p) => p <= 3).length,
    dnfs: results.length - cls.length,
    best: positions.length ? Math.min(...positions) : null,
    avg: positions.length ? positions.reduce((s, p) => s + p, 0) / positions.length : null,
    gained: cls.filter((r) => +r.grid > 0).reduce((s, r) => s + (+r.grid - +r.position), 0),
    racePoints: results.reduce((s, r) => s + Number(r.points || 0), 0),
    pointsFinishes: results.filter((r) => +r.points > 0).length,
  };
}

/** Every result of one driver in a season results list (with its race). */
export function driverRaces(races: Race[], id: string) {
  const out: { race: Race; result: Result }[] = [];
  for (const race of races) {
    const result = race.Results?.find((x) => x.Driver.driverId === id);
    if (result) out.push({ race, result });
  }
  return out;
}

/** The teammate who shared the most races (same constructor) with `id` this season. */
export function findTeammate(races: Race[], id: string) {
  const shared = new Map<string, { driver: Driver; count: number }>();
  for (const race of races) {
    const me = race.Results?.find((x) => x.Driver.driverId === id);
    if (!me) continue;
    for (const r of race.Results || []) {
      if (r.Driver.driverId === id || r.Constructor.constructorId !== me.Constructor.constructorId) continue;
      const cur = shared.get(r.Driver.driverId) || { driver: r.Driver, count: 0 };
      cur.count++;
      shared.set(r.Driver.driverId, cur);
    }
  }
  return [...shared.values()].sort((a, b) => b.count - a.count)[0]?.driver;
}

/** Head-to-head on finishing position, optionally only where both drove for the same team. */
export function finishDuel(races: Race[], a: string, b: string, sameTeam = false) {
  let aw = 0, bw = 0, paired = 0;
  for (const race of races) {
    const x = race.Results?.find((r) => r.Driver.driverId === a);
    const y = race.Results?.find((r) => r.Driver.driverId === b);
    if (!x || !y) continue;
    if (sameTeam && x.Constructor.constructorId !== y.Constructor.constructorId) continue;
    paired++;
    if (+x.position < +y.position) aw++;
    else if (+y.position < +x.position) bw++;
  }
  return { a: aw, b: bw, paired };
}

/** Qualifying head-to-head from two single-driver qualifying lists (same round, both present). */
export function qualiDuel(qa: Race[], qb: Race[], sameTeam = false) {
  const byRound = new Map(qb.map((r) => [r.round, r.QualifyingResults?.[0]]));
  let a = 0, b = 0, paired = 0;
  for (const race of qa) {
    const x = race.QualifyingResults?.[0], y = byRound.get(race.round);
    if (!x || !y || !+x.position || !+y.position) continue;
    if (sameTeam && x.Constructor.constructorId !== y.Constructor.constructorId) continue;
    paired++;
    if (+x.position < +y.position) a++;
    else if (+y.position < +x.position) b++;
  }
  return { a, b, paired };
}

/** One driver's qualifying classification for a season — a single small request instead of the whole grid. */
export const driverQualifying = (season: string, id: string) =>
  paginate(`${season}/drivers/${id}/qualifying.json`, "QualifyingResults");
export const poleCount = (q: Race[]) => q.filter((r) => r.QualifyingResults?.[0]?.position === "1").length;

/** Driver biography record (works for any driver in the archive, not only this season's grid). */
export async function driverInfo(id: string): Promise<Envelope<Driver | undefined>> {
  const r = await request<any>("jolpica", `drivers/${id}.json`);
  return { ...r, data: r.data.MRData.DriverTable.Drivers[0] };
}

/** A resolved, empty envelope for conditionally skipped requests (Source renders nothing for it). */
export const emptyEnvelope = <T,>(data: T): Envelope<T> => ({ data, meta: { source: "", url: "", fetchedAt: "", status: "" } });

/** Group a driver's season entries into team stints, e.g. Red Bull → rounds 12–14. */
export function teamStints(entries: { race: Race; result: Result }[]) {
  const map = new Map<string, { team: Result["Constructor"]; rounds: number[] }>();
  for (const { race, result } of entries) {
    const id = result.Constructor.constructorId;
    if (!map.has(id)) map.set(id, { team: result.Constructor, rounds: [] });
    map.get(id)!.rounds.push(+race.round);
  }
  return [...map.values()];
}
export function roundRanges(rounds: number[]) {
  const sorted = [...rounds].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`);
  }
  return `${sorted.length === 1 ? "round" : "rounds"} ${parts.join(", ")}`;
}

/* ─────────── Colour helpers ─────────── */
const parse = (hex: string) => {
  const v = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (c: number[]) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
export function mix(hex: string, other: string, t: number) {
  const a = parse(hex), b = parse(other);
  return toHex(a.map((x, i) => x + (b[i] - x) * t));
}
/** Keep two series distinguishable when the drivers share (or nearly share) a team colour. */
export function pairColors(a: string, b: string): [string, string] {
  const [r1, g1, b1] = parse(a), [r2, g2, b2] = parse(b);
  const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  if (dist > 70) return [a, b];
  const light = 0.299 * r2 + 0.587 * g2 + 0.114 * b2 > 150;
  return [a, light ? mix(b, "#000000", 0.45) : mix(b, "#ffffff", 0.5)];
}

/* ─────────── Mirrored tug-of-war bar ─────────── */
export function TugRow({ label, detail, a, b, format = (n) => String(n), lower, colorA, colorB, index = 0, icon }: {
  label: string; detail?: string; a: number | null; b: number | null; format?: (n: number) => string; lower?: boolean;
  colorA: string; colorB: string; index?: number; icon?: ReactNode;
}) {
  const both = a !== null && b !== null;
  let share = 0.5;
  if (both) {
    const denom = Math.abs(a) + Math.abs(b);
    share = denom ? 0.5 + (a - b) / (2 * denom) : 0.5;
    if (lower) share = 1 - share;
  }
  const winner = !both || a === b ? null : (lower ? a < b : a > b) ? "a" : "b";
  return (
    <div className={cx("tug reveal", winner && "has-winner")} style={{ "--a": colorA, "--b": colorB, "--i": index } as CSSProperties}>
      <span className={cx("tug-val a", winner === "a" && "win", winner === "b" && "lose")}>{a === null ? "—" : format(a)}</span>
      <span className="tug-label">
        <strong>{icon}{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <span className={cx("tug-val b", winner === "b" && "win", winner === "a" && "lose")}>{b === null ? "—" : format(b)}</span>
      <div className="tug-bar" role="img" aria-label={`${label}: ${a === null ? "no data" : format(a)} versus ${b === null ? "no data" : format(b)}${winner ? "" : ", level"}`}>
        {both ? (
          <>
            <motion.i className="tug-fill a" initial={{ width: "50%" }} animate={{ width: `${share * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22, delay: index * 0.04 }} />
            <motion.i className="tug-fill b" initial={{ width: "50%" }} animate={{ width: `${(1 - share) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22, delay: index * 0.04 }} />
          </>
        ) : <i className="tug-fill empty" />}
        <span className="tug-mid" />
      </div>
    </div>
  );
}

/* ─────────── Pointer + scroll parallax (sets --px, --py, --sy on the element) ─────────── */
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = () => document.documentElement.dataset.motion === "reduced" || (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (reduced()) return;
        const top = el.getBoundingClientRect().top;
        el.style.setProperty("--sy", String(Math.max(-200, Math.min(800, -top))));
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reduced()) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--px", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
      el.style.setProperty("--py", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
    };
    const onLeave = () => { el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0"); };
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return ref;
}
