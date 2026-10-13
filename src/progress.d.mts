import type { Driver, Race, Team } from "./types";
export type ProgressDriver = {
  driver: Driver;
  team: Team;
  /** Cumulative points after each completed round (race + sprint). */
  cumulative: number[];
  /** Championship rank after each round, derived from cumulative points, then wins. */
  rank: number[];
  /** Grand Prix finishing position per round (null if not classified / absent). */
  finish: (number | null)[];
  wins: number;
};
export type ProgressTeam = { team: Team; cumulative: number[]; rank: number[] };
export type CountingRule = { n: number } | { k: number; a: number; b: number };
export type CountingRules = { driver?: CountingRule; constructor?: CountingRule; bestCarOnly: boolean; approximate: { drivers: boolean; constructors: boolean } };
export type ProgressAdjustment = { kind: "driver" | "constructor"; id: string; name: string; computed: number; official: number };
export type SeasonProgress = {
  rules: CountingRules;
  /** Differences from the official final table (exclusions, points penalties) — set by useSeasonProgress. */
  adjustments?: ProgressAdjustment[];
  rounds: { round: string; raceName: string; country: string; circuitId: string; date: string }[];
  drivers: ProgressDriver[];
  teams: ProgressTeam[];
};
export function buildProgress(raceResults: Race[], sprints: Race[]): SeasonProgress;
export function counted(scores: number[], rule?: CountingRule): number;
export function countingRules(season: string | number | undefined): CountingRules;
