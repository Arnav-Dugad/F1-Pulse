/* Shared fan-feature helpers: race-week timing, visit memory, time zones, local storage. */
import { useEffect, useRef, useState } from "react";
import { weekendSessions } from "../domain.mjs";
import { sessionDate } from "../lib/format";
import type { Envelope, Race } from "../types";

export const emptyEnv = <T,>(data: T): Envelope<T> => ({ data, meta: { source: "", url: "", fetchedAt: "", status: "" } });

/* ─────────── Sessions ─────────── */
export type ResultKind = "qualifying" | "sprint" | "results";
export type SessionWindow = { label: string; short: string; start: number; end: number; timed: boolean; date: string; time?: string; kind?: ResultKind };

/**
 * Typical session lengths (minutes) — used only to estimate when a session is live. Published
 * timetables give start times only; red flags and suspensions can extend a session.
 */
const LENGTH: Record<string, number> = {
  "Practice 1": 60, "Practice 2": 60, "Practice 3": 60, "Sprint qualifying": 45, Sprint: 45, Qualifying: 60, "Grand Prix": 120,
};
const SHORT: Record<string, string> = {
  "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3", "Sprint qualifying": "SQ", Sprint: "Sprint", Qualifying: "Quali", "Grand Prix": "Race",
};
const KIND: Record<string, ResultKind> = { Qualifying: "qualifying", Sprint: "sprint", "Grand Prix": "results" };

export function sessionWindows(race: Race): SessionWindow[] {
  return weekendSessions(race).map((s) => {
    const start = sessionDate(s.date, s.time).getTime();
    return { label: s.label, short: SHORT[s.label] || s.label, start, end: start + (LENGTH[s.label] || 60) * 60e3, timed: !!s.time, date: s.date, time: s.time, kind: KIND[s.label] };
  });
}

export type SessionState = "done" | "live" | "next" | "later";
export function sessionStates(list: SessionWindow[], now: number): SessionState[] {
  const nextIndex = list.findIndex((s) => s.start > now);
  return list.map((s, i) => (now >= s.end ? "done" : now >= s.start ? "live" : i === nextIndex ? "next" : "later"));
}

/**
 * Race week runs from 00:00 UTC on the Thursday before the Grand Prix (or a day before the first
 * session, whichever is earlier) until four hours after the scheduled race start.
 */
export function raceWeekWindow(race: Race): [number, number] {
  const raceStart = sessionDate(race.date, race.time).getTime();
  const day = new Date(race.date + "T00:00:00Z");
  const thursday = day.getTime() - ((day.getUTCDay() + 7 - 4) % 7) * 864e5;
  const first = sessionWindows(race)[0]?.start ?? raceStart;
  return [Math.min(thursday, first - 864e5), raceStart + 4 * 3600e3];
}
export const inRaceWeek = (race: Race, now: number) => {
  const [a, b] = raceWeekWindow(race);
  return now >= a && now < b;
};

/** Calendar dates (YYYY-MM-DD, UTC) from the first session to race day. */
export function weekendDates(race: Race): string[] {
  const first = weekendSessions(race)[0]?.date || race.date;
  const out: string[] = [];
  for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(race.date + "T00:00:00Z") && out.length < 6; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out.length ? out : [race.date];
}

/* ─────────── Visits ─────────── */
const VISIT_KEY = "pulse-v3-visits";
type Visits = { v: 1; last: number | null; current: number };
function readVisits(): Visits | null {
  try {
    const raw = JSON.parse(localStorage.getItem(VISIT_KEY) || "null");
    if (raw && raw.v === 1 && Number.isFinite(raw.current) && (raw.last === null || Number.isFinite(raw.last))) return raw as Visits;
  } catch { /* corrupt or unavailable */ }
  return null;
}
function writeVisits(v: Visits) {
  try { localStorage.setItem(VISIT_KEY, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}
/**
 * The previous visit's timestamp (null on a first visit). A visit is a session of activity: pages
 * opened less than 30 minutes apart count as the same visit, so refreshing never hides news.
 */
export function useLastVisit(): number | null {
  const [last] = useState(() => {
    const now = Date.now();
    const data = readVisits();
    const next: Visits = !data ? { v: 1, last: null, current: now } : now - data.current > 30 * 60e3 ? { v: 1, last: data.current, current: now } : { v: 1, last: data.last, current: now };
    writeVisits(next);
    return next.last;
  });
  useEffect(() => {
    const touch = () => writeVisits({ v: 1, last, current: Date.now() });
    const t = setInterval(touch, 60_000);
    window.addEventListener("pagehide", touch);
    return () => { clearInterval(t); window.removeEventListener("pagehide", touch); touch(); };
  }, [last]);
  return last;
}

/* ─────────── Time zones ─────────── */
/** UTC offset in minutes for an IANA zone (undefined = the browser's zone) at a moment. */
export function zoneOffset(tz: string | undefined, at = Date.now()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return Math.round((asUTC - Math.floor(at / 1000) * 1000) / 60000);
  } catch {
    return -new Date(at).getTimezoneOffset();
  }
}
export const offsetLabel = (mins: number) => {
  const sign = mins < 0 ? "−" : "+";
  const a = Math.abs(mins);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ":" + String(a % 60).padStart(2, "0") : ""}`;
};
export const prefZone = (tz: string) => (tz === "local" ? undefined : tz);
/** Open-Meteo local timestamps ("2026-10-23T07:38") → "07:38" without re-zoning. */
export const localClock = (stamp?: string) => (stamp && /T\d{2}:\d{2}/.test(stamp) ? stamp.slice(11, 16) : "—");

/* ─────────── Visibility ─────────── */
/** Becomes true once the element scrolls near the viewport — for lazy, request-heavy sections. */
export function useSeen<T extends HTMLElement>(margin = "200px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}
