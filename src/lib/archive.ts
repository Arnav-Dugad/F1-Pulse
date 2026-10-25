/**
 * The race archive: every World Championship result from the static snapshot
 * (public/data/archive.json, scripts/fetch-archive.mjs) merged with the live running season.
 * Loaded once per page session (cached promise) with download progress for skeleton states.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { allResults, request, sprintResults } from "../api";
import { decodeArchive, mergeSeason, type Archive, type ArchiveFile } from "./archive-core.mjs";
import type { Envelope } from "../types";

export * from "./archive-core.mjs";

export type HistoryFile = {
  generatedAt: string;
  lastSeason: number;
  drivers: Record<string, [string, string, number, number, string[]][]>;
  constructors: Record<string, [string, string, number, number][]>;
  names: { drivers: Record<string, [string, string, string]>; constructors: Record<string, [string, string]> };
  rounds: Record<string, string>;
};
export type ArchiveBundle = {
  archive: Archive;
  history: HistoryFile;
  /** Provenance for <Source>: the snapshot plus the live season when it merged. */
  envelope: Envelope<null>;
  /** Set when the live season could not be merged (the snapshot still works). */
  liveError?: string;
};
export type ArchiveProgress = { phase: "download" | "history" | "live" | "index" | "ready"; loaded: number; total: number | null };

const JOLPICA = "https://api.jolpi.ca/ergast/f1/";
let progress: ArchiveProgress = { phase: "download", loaded: 0, total: null };
const listeners = new Set<() => void>();
const setProgress = (p: ArchiveProgress) => {
  progress = p;
  listeners.forEach((l) => l());
};

async function download(url: string): Promise<ArchiveFile> {
  const r = await fetch(url);
  if (!r.ok) throw Error(`Archive unavailable (HTTP ${r.status})`);
  const header = Number(r.headers.get("content-length")) || null;
  // A compressed transfer reports the compressed length while the stream yields decoded bytes.
  const total = header && !r.headers.get("content-encoding") ? header : null;
  if (!r.body) return r.json();
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0, lastTick = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (performance.now() - lastTick > 60) {
      lastTick = performance.now();
      setProgress({ phase: "download", loaded, total: total && total >= loaded ? total : null });
    }
  }
  setProgress({ phase: "index", loaded, total: loaded });
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

let historyPromise: Promise<HistoryFile> | null = null;
/** Final championship tables 1950–(last completed season), snapshotted by scripts/fetch-history.mjs. */
export const loadHistory = () =>
  (historyPromise ??= fetch("/data/history.json")
    .then((r) => {
      if (!r.ok) throw Error("Championship history unavailable");
      return r.json().catch(() => { throw Error("Championship history unavailable"); }) as Promise<HistoryFile>;
    })
    .catch((e) => { historyPromise = null; throw e; }));

/** Merge every season newer than the snapshot from the live API (results, qualifying P1, sprints). */
async function mergeLive(archive: Archive) {
  let merged = archive;
  let meta: Envelope<unknown>["meta"] | undefined;
  for (let y = archive.last + 1; y <= new Date().getFullYear(); y++) {
    const season = String(y);
    const results = await allResults(season);
    if (!results.data.some((r) => r.Results?.length)) continue;
    const poles = new Map<string, string>();
    try {
      const q = await request<any>("jolpica", `${season}/qualifying/1.json`, { limit: 100 });
      for (const race of q.data.MRData.RaceTable.Races) {
        const p1 = race.QualifyingResults?.[0]?.Driver?.driverId;
        if (p1) poles.set(String(race.round), p1);
      }
    } catch {
      /* grid P1 is used where qualifying is unavailable */
    }
    const sprints = await sprintResults(season).then((s) => s.data).catch(() => []);
    merged = mergeSeason(merged, season, results.data, poles, sprints);
    meta = results.meta;
  }
  return { merged, meta };
}

let bundle: Promise<ArchiveBundle> | null = null;
export function loadArchive(): Promise<ArchiveBundle> {
  return (bundle ??= (async () => {
    setProgress({ phase: "download", loaded: 0, total: null });
    const [file, history] = await Promise.all([download("/data/archive.json"), loadHistory()]);
    setProgress({ phase: "index", loaded: 1, total: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const base = decodeArchive(file);
    setProgress({ phase: "live", loaded: 1, total: 1 });
    let archive = base, liveError: string | undefined, liveMeta: Envelope<unknown>["meta"] | undefined;
    try {
      const live = await mergeLive(base);
      archive = live.merged;
      liveMeta = live.meta;
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
    }
    setProgress({ phase: "ready", loaded: 1, total: 1 });
    const span = `${base.first}–${base.last}`;
    const liveSeasons = archive.live.join(", ");
    const envelope: Envelope<null> = {
      data: null,
      meta: {
        source: "jolpica",
        url: JOLPICA,
        fetchedAt: liveMeta?.fetchedAt || file.generatedAt,
        status: liveMeta?.snapshot ? liveMeta.status : liveSeasons ? `Results snapshot ${span} + live ${liveSeasons}` : `Results snapshot ${span}`,
        snapshot: !!liveMeta?.snapshot,
      },
    };
    return { archive, history, envelope, liveError };
  })().catch((e) => {
    bundle = null;
    throw e;
  }));
}

/** The archive bundle plus a live loading-progress readout for skeletons. */
export function useArchive() {
  const [state, set] = useState<{ loading: boolean; value?: ArchiveBundle; error?: string }>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  const p = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => progress,
  );
  useEffect(() => {
    let live = true;
    set((s) => (s.value ? s : { loading: true }));
    loadArchive()
      .then((value) => live && set({ loading: false, value }))
      .catch((e) => live && set({ loading: false, error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, [attempt]);
  return { ...state, progress: p, reload: () => { bundle = null; setAttempt((x) => x + 1); } };
}

/* ───────────────────────── Championship history helpers ───────────────────────── */

/** season → champion id, completed seasons only (from the final-standings snapshot). */
export function champions(history: HistoryFile, kind: "drivers" | "constructors" = "drivers"): Map<number, string> {
  const out = new Map<number, string>();
  const table: Record<string, [string, string, ...unknown[]][]> = kind === "drivers" ? history.drivers : history.constructors;
  for (const [season, rows] of Object.entries(table)) {
    const top = rows.find((r) => r[1] === "1");
    if (top) out.set(+season, top[0]);
  }
  return out;
}
/** id → championship years (completed seasons). */
export function titleYears(history: HistoryFile, kind: "drivers" | "constructors" = "drivers"): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [season, id] of champions(history, kind)) (out.get(id) || out.set(id, []).get(id)!).push(season);
  return out;
}
/** Final position (1-based) of an id in a completed season, or null. */
export function finalPosition(history: HistoryFile, season: number, id: string, kind: "drivers" | "constructors" = "drivers"): number | null {
  const rows: [string, string, ...unknown[]][] | undefined = (kind === "drivers" ? history.drivers : history.constructors)[season];
  const row = rows?.find((r) => r[0] === id);
  return row && /^\d+$/.test(row[1]) ? +row[1] : null;
}

/* ───────────────────────── Formatting ───────────────────────── */

export const fmtAge = (a: { years: number; days: number } | null | undefined) => (a ? `${a.years}y ${a.days}d` : "—");
export const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(date + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
export function fmtGap(ms: number | null) {
  if (ms === null) return "";
  if (ms < 60000) return `+${(ms / 1000).toFixed(3)}s`;
  const m = Math.floor(ms / 60000);
  return `+${m}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
