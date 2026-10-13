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
import { mergeRacePage, snapshotMatches } from "./domain.mjs";
const pending = new Map<string, Promise<Envelope<any>>>();
const memory = new Map<string, Envelope<any>>();
let slot = 0;
let openTimes: number[] = [];
export async function request<T>(
  source: string,
  path = "",
  params: Record<string, string | number> = {},
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
  if (pending.has(url)) return pending.get(url)!;
  const work = (async () => {
    const start = Math.max(
      Date.now(),
      slot,
      source === "openf1" && openTimes.length >= 28
        ? openTimes[openTimes.length - 28] + 61000
        : 0,
    );
    slot = start + 400;
    if (source === "openf1") {
      openTimes.push(start);
      openTimes = openTimes.slice(-30);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now())));
    let saved: Envelope<T> | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(url) || "null");
    } catch {}
    let error: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
        const data = await r.json();
        if (!r.ok) {
          error = new Error(data.error || `Source returned ${r.status}`);
          if (r.status === 429 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          throw error;
        }
        if (!data.meta || !("data" in data))
          throw Error("Invalid source response");
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
export async function allResults(
  season: string,
  filter = "",
): Promise<Envelope<Race[]>> {
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
