import { useEffect, useState } from "react";
import type {
  Envelope,
  Race,
  Standing,
  TeamStanding,
  Session,
  Driver,
  Team,
} from "./types";
import { mergeRacePage, seasonalNumbers, snapshotMatches } from "./domain.mjs";
const pending = new Map<string, Promise<Envelope<any>>>();
const memory = new Map<string, Envelope<any>>();
let slot = 0;
let openTimes: number[] = [];
/** Who is waiting on each queued URL: a signal per caller, or null for callers that can't cancel. */
const wants = new Map<string, Set<AbortSignal | null>>();
/**
 * One upstream document through the rate-limit-aware queue. Pass `signal` to give up a request that
 * is still waiting for its slot (e.g. the page was left) — it is skipped only if every caller
 * waiting on that URL has aborted.
 */
export async function request<T>(
  source: string,
  path = "",
  params: Record<string, string | number> = {},
  signal?: AbortSignal,
): Promise<Envelope<T>> {
  const q = new URLSearchParams(
    Object.entries({ ...params, ...(path ? { path } : {}) }).map(([k, v]) => [
      k,
      String(v),
    ]),
  );
  const url = `/api/${source}?${q}`;
  const old = memory.get(url);
  if (old && Date.now() - Date.parse(old.meta.fetchedAt) < 300000) return old;
  const waiting = wants.get(url) || new Set<AbortSignal | null>();
  waiting.add(signal || null);
  wants.set(url, waiting);
  if (pending.has(url)) return pending.get(url)!;
  const work = (async () => {
    // Only requests that reach Jolpica/OpenF1 one-to-one are spaced; the Worker paces everything else.
    const paced = source === "jolpica" || source === "openf1";
    const start = paced ? Math.max(
      Date.now(),
      slot,
      source === "openf1" && openTimes.length >= 28
        ? openTimes[openTimes.length - 28] + 61000
        : 0,
    ) : Date.now();
    if (paced) slot = start + 400;
    if (source === "openf1") {
      openTimes.push(start);
      openTimes = openTimes.slice(-30);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now())));
    if ([...(wants.get(url) || [])].every((w) => w?.aborted)) throw new DOMException("Request no longer needed", "AbortError");
    let saved: Envelope<T> | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(url) || "null");
    } catch {}
    let error: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
        // An edge or proxy error page is HTML, not our JSON envelope: never surface parser errors.
        const data = await r.json().catch(() => null);
        if (!r.ok || !data) {
          error = new Error(
            r.status === 429 ? "The data source is busy right now (rate limit)."
              : data?.error || (r.ok ? "The data source sent an unreadable response." : `The data source is unavailable (HTTP ${r.status}).`),
          );
          // Rate limits and transient gateway errors are worth another try.
          if ((r.status === 429 || r.status >= 500) && attempt < 2) {
            await new Promise((r) => setTimeout(r, attempt ? 7000 : 2500));
            continue;
          }
          throw error;
        }
        if (!data.meta || !("data" in data))
          throw Error("Invalid source response");
        if (source === "jolpica" || source === "season") {
          const year = /^(\d{4})\//.exec(path)?.[1] || (/^\d{4}$/.test(String(params.year)) ? String(params.year) : undefined);
          seasonalNumbers(data.data, year ? +year : undefined);
        }
        memory.set(url, data);
        try {
          if (JSON.stringify(data).length < 500000)
            sessionStorage.setItem(url, JSON.stringify(data));
        } catch {}
        return data;
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        break;
      }
    }
    if (
      saved?.meta &&
      "data" in saved &&
      Date.now() - Date.parse(saved.meta.fetchedAt) < 86400000
    )
      return {
        ...saved,
        meta: {
          ...saved.meta,
          status: "Saved response — source offline",
          snapshot: true,
        },
      };
    if (
      source === "jolpica" &&
      [
        "current.json",
        "current/driverStandings.json",
        "current/constructorStandings.json",
        "current/last/results.json",
        "current/drivers.json",
        "current/constructors.json",
      ].includes(path)
    ) {
      const r = await fetch("/data/launch-snapshot.json");
      if (r.ok) {
        const snap = await r.json();
        if (snapshotMatches(snap, path))
          return {
            data: snap.responses[path],
            meta: {
              source: "jolpica",
              url: "https://api.jolpi.ca/ergast/f1/" + path,
              fetchedAt: snap.fetchedAt,
              status: "Dated launch snapshot — source offline",
              snapshot: true,
            },
          };
      }
    }
    throw error || Error("Source unavailable");
  })();
  pending.set(url, work);
  try {
    return await work;
  } finally {
    pending.delete(url);
    wants.delete(url);
  }
}
export function useData<T>(
  loader: () => Promise<Envelope<T>>,
  deps: unknown[],
) {
  const [state, set] = useState<{
    key: string;
    value?: Envelope<T>;
    error?: string;
    loading: boolean;
  }>({ key: "", loading: true });
  const [retry, refresh] = useState(0);
  const key = JSON.stringify([...deps, retry]);
  useEffect(() => {
    let live = true;
    set({ key, loading: true });
    loader()
      .then((value) => live && set({ key, value, loading: false }))
      .catch((e) => live && set({ key, loading: false, error: e.message }));
    return () => {
      live = false;
    };
  }, [...deps, retry]);
  return {
    ...(state.key === key
      ? state
      : { loading: true, value: undefined, error: undefined }),
    reload: () => {
      memory.clear();
      refresh((x) => x + 1);
    },
  };
}
export async function races(season: string): Promise<Envelope<Race[]>> {
  const r = await request<any>("jolpica", `${season}.json`);
  return { ...r, data: r.data.MRData.RaceTable.Races };
}
export async function standings(season: string): Promise<Envelope<Standing[]>> {
  const r = await request<any>("jolpica", `${season}/driverStandings.json`);
  return {
    ...r,
    data: r.data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [],
  };
}
export async function teamStandings(
  season: string,
): Promise<Envelope<TeamStanding[]>> {
  const r = await request<any>(
    "jolpica",
    `${season}/constructorStandings.json`,
  );
  return {
    ...r,
    data:
      r.data.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ||
      [],
  };
}
export async function raceResult(
  season: string,
  round: string,
  kind = "results",
): Promise<Envelope<Race | undefined>> {
  const r = await request<any>("jolpica", `${season}/${round}/${kind}.json`);
  return { ...r, data: r.data.MRData.RaceTable.Races[0] };
}
export type SeasonBundle = { season: string; round: string; calendar: Race[]; results: Race[]; sprints: Race[] };
/**
 * Calendar plus every race and sprint result of a season in one request, assembled from all
 * Jolpica pages and edge-cached by the Worker (`/api/season`): a day for completed seasons, ten
 * minutes for the running one. Race objects keep Jolpica's shapes.
 */
export const seasonBundle = (season: string) => request<SeasonBundle>("season", "", { year: season });
/** One list from the season bundle (copied, so callers can sort freely), or null to fall back. */
async function fromBundle(season: string, key: "results" | "sprints"): Promise<Envelope<Race[]> | null> {
  try {
    const r = await seasonBundle(season);
    const list = r.data?.[key];
    if (!Array.isArray(list)) return null;
    const rows = key === "results" ? "Results" : "SprintResults";
    return { data: list.map((race) => ({ ...race, [rows]: [...(race[rows] || [])] })), meta: r.meta };
  } catch {
    return null;
  }
}
export async function allResults(
  season: string,
  filter = "",
): Promise<Envelope<Race[]>> {
  if (!filter) {
    const bundled = await fromBundle(season, "results");
    if (bundled) return bundled;
  }
  let offset = 0,
    total = Infinity,
    list: Race[] = [],
    meta: Envelope<any>["meta"] | undefined;
  while (offset < total) {
    const r = await request<any>(
      "jolpica",
      `${season}/${filter ? filter + "/" : ""}results.json`,
      { limit: 100, offset },
    );
    meta = meta
      ? {
          ...r.meta,
          fetchedAt:
            Date.parse(meta.fetchedAt) < Date.parse(r.meta.fetchedAt)
              ? meta.fetchedAt
              : r.meta.fetchedAt,
          snapshot: !!(meta.snapshot || r.meta.snapshot),
          status: meta.snapshot ? meta.status : r.meta.status,
        }
      : r.meta;
    const mr = r.data.MRData;
    total = Number(mr.total);
    if (!Number.isFinite(total)) throw Error("Invalid results pagination");
    list = mergeRacePage(list, mr.RaceTable.Races);
    const limit = Number(mr.limit);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      (offset < total && !mr.RaceTable.Races.length)
    )
      throw Error("Incomplete results pagination");
    offset += limit;
    if (offset > 10000) throw Error("Too many results");
  }
  return { data: list, meta: meta! };
}
export async function sessions(year: string): Promise<Envelope<Session[]>> {
  const r = await request<Session[]>("openf1", "sessions", { year });
  return {
    ...r,
    data: r.data
      .filter((x) => Date.parse(x.date_end) < Date.now() - 1800000)
      .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start)),
  };
}
export const wikiTitle = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").at(-1) || "");
  } catch {
    return "";
  }
};
export async function drivers(season: string): Promise<Envelope<Driver[]>> {
  const r = await request<any>("jolpica", `${season}/drivers.json`);
  return { ...r, data: r.data.MRData.DriverTable.Drivers };
}
export async function teams(season: string): Promise<Envelope<Team[]>> {
  const r = await request<any>("jolpica", `${season}/constructors.json`);
  return { ...r, data: r.data.MRData.ConstructorTable.Constructors };
}

type RaceArrayKey = "Results" | "SprintResults" | "QualifyingResults" | "Laps" | "PitStops";
/**
 * Fetch every page of a Jolpica race-table endpoint and merge the per-race arrays.
 * `key` is the per-race array the endpoint paginates over.
 */
export async function paginate(path: string, key: RaceArrayKey, pageSize = 100): Promise<Envelope<Race[]>> {
  let offset = 0,
    total = Infinity,
    meta: Envelope<any>["meta"] | undefined;
  const merged = new Map<string, any>();
  while (offset < total) {
    const r = await request<any>("jolpica", path, { limit: pageSize, offset });
    meta ??= r.meta;
    if (r.meta.snapshot) meta = { ...meta, snapshot: true, status: r.meta.status };
    const mr = r.data.MRData;
    total = Number(mr.total);
    if (!Number.isFinite(total)) throw Error("Invalid results pagination");
    for (const race of mr.RaceTable.Races as any[]) {
      const id = race.season + ":" + race.round;
      const prev = merged.get(id);
      if (!prev) merged.set(id, { ...race, [key]: [...(race[key] || [])] });
      else prev[key] = [...prev[key], ...(race[key] || [])];
    }
    const limit = Number(mr.limit);
    if (!Number.isInteger(limit) || limit < 1 || !mr.RaceTable.Races.length) break;
    offset += limit;
    if (offset > 20000) throw Error("Too many results");
  }
  const data = [...merged.values()].sort((a, b) => +a.season - +b.season || +a.round - +b.round);
  if (key === "Laps")
    // A lap's timings can straddle two pages; join them by lap number.
    for (const race of data) {
      const laps = new Map<string, any>();
      for (const lap of race.Laps) {
        const prev = laps.get(lap.number);
        laps.set(lap.number, prev ? { ...prev, Timings: [...prev.Timings, ...lap.Timings] } : { ...lap, Timings: [...lap.Timings] });
      }
      race.Laps = [...laps.values()].sort((a, b) => +a.number - +b.number);
    }
  return { data, meta: meta! };
}
export const sprintResults = async (season: string): Promise<Envelope<Race[]>> =>
  (await fromBundle(season, "sprints")) || paginate(`${season}/sprint.json`, "SprintResults");
export const qualifyingResults = (season: string) => paginate(`${season}/qualifying.json`, "QualifyingResults");
export const driverCareer = (driverId: string) => paginate(`drivers/${driverId}/results.json`, "Results");
export const teamSeasonResults = (season: string, constructorId: string) => paginate(`${season}/constructors/${constructorId}/results.json`, "Results");
export const circuitWinners = (circuitId: string) => paginate(`circuits/${circuitId}/results/1.json`, "Results");
export const circuitRaces = async (circuitId: string): Promise<Envelope<Race[]>> => {
  const r = await request<any>("jolpica", `circuits/${circuitId}/races.json`, { limit: 100 });
  return { ...r, data: r.data.MRData.RaceTable.Races };
};
export const raceLaps = (season: string, round: string) => paginate(`${season}/${round}/laps.json`, "Laps");
export const pitStops = (season: string, round: string) => paginate(`${season}/${round}/pitstops.json`, "PitStops");

export type StandingsList = { season: string; round: string; DriverStandings?: Standing[]; ConstructorStandings?: TeamStanding[] };
type HistoryFile = {
  generatedAt: string;
  lastSeason: number;
  drivers: Record<string, [string, string, number, number, string[]][]>;
  constructors: Record<string, [string, string, number, number][]>;
  names: { drivers: Record<string, [string, string, string]>; constructors: Record<string, [string, string]> };
  rounds: Record<string, string>;
};
let historyFile: Promise<HistoryFile> | null = null;
/** Final tables of every completed season, snapshotted by scripts/fetch-history.mjs. */
const loadHistory = () =>
  (historyFile ??= fetch("/data/history.json").then((r) => {
    if (!r.ok) throw Error("Championship history unavailable");
    return r.json().catch(() => { throw Error("Championship history unavailable"); });
  }).catch((e) => { historyFile = null; throw e; }));

/**
 * One final (or, for the running season, latest) championship standing per season for a driver
 * or constructor. Jolpica only serves standings season by season, so completed seasons come from
 * a static snapshot and only newer seasons are requested live.
 */
export async function standingsHistory(kind: "drivers" | "constructors", id: string): Promise<Envelope<StandingsList[]>> {
  const h = await loadHistory();
  const team = (cid: string): Team => ({ constructorId: cid, name: h.names.constructors[cid]?.[0] || cid, nationality: h.names.constructors[cid]?.[1] || "", url: "" });
  const lists: StandingsList[] = [];
  const table: Record<string, (string | number | string[])[][]> = kind === "drivers" ? h.drivers : h.constructors;
  for (const [season, rows] of Object.entries(table)) {
    const row = rows.find((r) => r[0] === id) as [string, string, number, number, string[]?] | undefined;
    if (!row) continue;
    const [, positionText, points, wins] = row;
    const position = /^\d+$/.test(positionText) ? positionText : "";
    if (kind === "drivers") {
      const [given, family, nationality] = h.names.drivers[id] || ["", id, ""];
      lists.push({ season, round: h.rounds[season], DriverStandings: [{
        position, points: String(points), wins: String(wins),
        Driver: { driverId: id, givenName: given, familyName: family, nationality, dateOfBirth: "", url: "" },
        Constructors: (row[4] || []).map(team),
      }] });
    } else {
      lists.push({ season, round: h.rounds[season], ConstructorStandings: [{ position, points: String(points), wins: String(wins), Constructor: team(id) }] });
    }
  }
  let meta: Envelope<unknown>["meta"] = { source: "jolpica", url: "https://api.jolpi.ca/ergast/f1/", fetchedAt: h.generatedAt, status: `Final standings snapshot 1950–${h.lastSeason}` };
  for (let y = h.lastSeason + 1; y <= new Date().getFullYear(); y++) {
    const path = kind === "drivers" ? `${y}/drivers/${id}/driverStandings.json` : `${y}/constructors/${id}/constructorStandings.json`;
    const r = await request<any>("jolpica", path);
    const list = r.data.MRData.StandingsTable.StandingsLists[0];
    if (list) lists.push(list);
    meta = r.meta;
  }
  return { data: lists.sort((a, b) => +a.season - +b.season), meta };
}
/** Official standings after a given round. */
export async function roundStandings(season: string, round: string, kind: "driver" | "constructor" = "driver"): Promise<Envelope<StandingsList | undefined>> {
  const r = await request<any>("jolpica", `${season}/${round}/${kind}Standings.json`);
  return { ...r, data: r.data.MRData.StandingsTable.StandingsLists[0] };
}
export type Weather = {
  current?: { time: string; temperature_2m: number; relative_humidity_2m: number; precipitation: number; wind_speed_10m: number };
  hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: number[] };
  daily?: { time: string[]; sunrise: string[]; sunset: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
  timezone?: string;
  utc_offset_seconds?: number;
};
export const weather = (lat: string | number, lon: string | number) => request<Weather>("weather", "", { latitude: lat, longitude: lon });
export type Climate = {
  timezone?: string;
  utc_offset_seconds?: number;
  hourly?: { time: string[]; temperature_2m: number[]; precipitation: number[]; wind_speed_10m: number[]; relative_humidity_2m: number[]; cloud_cover: number[] };
  daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; sunrise: string[]; sunset: string[] };
};
/**
 * Historical weather (Open-Meteo ERA5 reanalysis) at circuit coordinates — modelled, not trackside.
 * `hourly` for ≤ 7 days (e.g. a race day), `daily` summaries for up to 12 years.
 */
export const climate = (lat: string | number, lon: string | number, start: string, end: string, mode: "daily" | "hourly" = "daily") =>
  request<Climate>("climate", "", { latitude: lat, longitude: lon, start_date: start, end_date: end, mode });
export type NewsItem = { title: string; url: string; date: string; publisher: string };
export const news = () => request<NewsItem[]>("news");
export type WikiSummary = { title: string; extract: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page: string } } };
export const wiki = (title: string) => request<WikiSummary>("wiki", "", { title });
