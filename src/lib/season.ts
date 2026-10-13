import { allResults, races as fetchRaces, sprintResults, standings, teamStandings, useData } from "../api";
import type { Envelope, Race } from "../types";

import { buildProgress, type ProgressAdjustment, type ProgressDriver, type ProgressTeam, type SeasonProgress } from "../progress.mjs";
export { buildProgress };
export type { ProgressAdjustment, ProgressDriver, ProgressTeam, SeasonProgress };

const shortRace = (name: string) => name.replace(/ Grand Prix.*$/, "").replace(/^Grand Prix of /, "");
export { shortRace };

export function useSeasonProgress(season: string, year: string) {
  return useData<SeasonProgress>(async () => {
    const [r, s, ds, cs] = await Promise.all([
      allResults(season),
      +year >= 2021 ? sprintResults(season) : Promise.resolve({ data: [] as Race[], meta: undefined }),
      standings(season).catch(() => null),
      teamStandings(season).catch(() => null),
    ]);
    const progress = buildProgress(r.data, s.data);
    // Reconcile with the official table: exclusions and points penalties never appear in race classifications.
    const adjustments: ProgressAdjustment[] = [];
    const lastRound = progress.rounds.at(-1)?.round;
    if (ds?.data.length && lastRound) {
      for (const o of ds.data) {
        const d = progress.drivers.find((x) => x.driver.driverId === o.Driver.driverId);
        const computed = d?.cumulative.at(-1) ?? 0;
        if (Math.abs(computed - +o.points) > 1e-6) adjustments.push({ kind: "driver", id: o.Driver.driverId, name: `${o.Driver.givenName} ${o.Driver.familyName}`, computed, official: +o.points });
      }
    }
    if (cs?.data.length) {
      for (const o of cs.data) {
        const t = progress.teams.find((x) => x.team.constructorId === o.Constructor.constructorId);
        const computed = t?.cumulative.at(-1) ?? 0;
        if (Math.abs(computed - +o.points) > 1e-6) adjustments.push({ kind: "constructor", id: o.Constructor.constructorId, name: o.Constructor.name, computed, official: +o.points });
      }
    }
    return { data: { ...progress, adjustments }, meta: r.meta } as Envelope<SeasonProgress>;
  }, [season]);
}

/** The next race (first whose Grand Prix start is in the future) and the most recent completed race. */
export function splitCalendar(list: Race[], now = Date.now()) {
  const start = (r: Race) => Date.parse(r.date + "T" + (r.time || "23:59:59Z"));
  const next = list.find((r) => start(r) + 2.5 * 3600e3 > now);
  const previous = [...list].reverse().find((r) => start(r) + 2.5 * 3600e3 <= now);
  return { next, previous };
}
export const useCalendar = (season: string) => useData(() => fetchRaces(season), [season]);
