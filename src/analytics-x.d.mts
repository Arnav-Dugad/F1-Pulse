import type { Driver, Race, Team } from "./types";
import type { ARow, ASprintRow } from "./lib/archive-core.mjs";
import type { CountingRule } from "./progress.mjs";

/* Qualifying pace & step changes */
export type PaceStep = { index: number; before: number; after: number; effect: number; z: number };
export type TeamPace = {
  id: string; team: Team;
  /** Gap to the session-fastest time per round (%), including outliers. */
  raw: (number | null)[];
  /** Same, with gaps above the outlier limit removed. */
  gaps: (number | null)[];
  /** `gaps` without isolated one-off spikes (used for the trend, steps and averages). */
  clean: (number | null)[];
  spikes: number[];
  who: ({ driverId: string; name: string; session: "Q1" | "Q2" | "Q3" } | null)[];
  excluded: number; mean: number | null;
  trend: (number | null)[]; levels: (number | null)[]; steps: PaceStep[];
  change: { first: number; last: number; delta: number } | null;
};
export function qualiPace(qualifying: Race[], opts?: { maxGap?: number }): { rounds: { round: string; raceName: string }[]; missing: string[]; teams: TeamPace[] };
export function despike(values: (number | null)[], opts?: { half?: number; k?: number; floor?: number }): { clean: (number | null)[]; spikes: number[] };
export function smoothSeries(values: (number | null)[], half?: number): (number | null)[];
export function noiseLevel(values: (number | null)[], floor?: number): number;
export function detectSteps(values: (number | null)[], opts?: { minSeg?: number; minEffect?: number; z?: number; maxSteps?: number }): PaceStep[];
export function stepLevels(values: (number | null)[], steps: PaceStep[]): (number | null)[];

/* Lap one */
export type LaunchEvent = { round: string; raceName: string; from: number; to: number; gain: number };
export type LaunchRow = {
  id: string; driver: Driver; team: Team; starts: number; total: number; avg: number; gained: number; lost: number; held: number; out: number; pitLane: number;
  best: LaunchEvent | null; worst: LaunchEvent | null;
  races: { round: string; raceName: string; grid: number; lap1: number | null; gain: number | null }[];
};
export function lapOneGains(races: Race[], laps: Map<string, { driverId: string; position: string }[]>): {
  drivers: LaunchRow[]; loaded: number; best: (LaunchEvent & { id: string }) | null; worst: (LaunchEvent & { id: string }) | null; moves: number;
};

/* What If */
export type WhatIfSystemId = "actual" | "current" | "2010" | "2003" | "1991";
export type WhatIfSystem = { id: WhatIfSystemId; label: string; short: string; race?: number[]; sprint?: number[] };
export const WHATIF_SYSTEMS: WhatIfSystem[];
export function whatIfSystem(id: string | null | undefined): WhatIfSystem;
export function eraTable(season: number | string): { race: number[]; sprint: number[]; fastestLap: "any" | "top10" | null };
export function roundFactor(rows: Pick<ARow, "pos" | "pts">[], table: number[]): number;
export type WhatIfRound = { round: string; name: string; indy?: boolean; results: ARow[]; sprint: Pick<ASprintRow, "d" | "c" | "pos" | "pts">[] };
export type WhatIfInput = { season: number | string; rounds: WhatIfRound[] };
export type Entry = { k: number; d: number; c: number; st: "f" | "r" | "d" };
export type Edits = Map<string, Entry[]>;
export function roundEntries(round: Pick<WhatIfRound, "results">): Entry[];
export function encodeEdits(edits: Edits, rounds: WhatIfRound[]): string;
export function decodeEdits(text: string | null | undefined, rounds: WhatIfRound[]): Edits;
export function normaliseEntries(list: Entry[]): Entry[];
export type WhatIfDriver = {
  d: number; c: number; points: number; gross: number; dropped: number; wins: number; podiums: number;
  scores: number[]; places: (number | null)[]; cumulative: number[]; rank: number[];
};
export type WhatIfResult = {
  season: number; system: WhatIfSystemId; drops: boolean;
  rules: { driver?: CountingRule; constructor?: CountingRule; bestCarOnly: boolean };
  rounds: { round: string; name: string; edited: boolean }[];
  drivers: WhatIfDriver[];
  teams: { c: number; points: number; cumulative: number[]; rank: number[] }[];
};
export function whatIfSeason(input: WhatIfInput, opts?: { edits?: Edits; system?: string; drops?: boolean }): WhatIfResult;
export type WhatIfDelta = { d: number; rank: number; points: number; before: { rank: number; points: number } | null; rankDelta: number | null; pointsDelta: number };
export function whatIfDiff(base: WhatIfResult, scenario: WhatIfResult): WhatIfDelta[];

/* Career ratings */
export const RATING_SCALE: number;
export const RATING_BASE: number;
export type RatingRace = { season: number; results: ARow[] };
export function teammateComparisons(races: RatingRace[]): {
  seasons: { d: number; season: number; comparisons: number; wins: number; losses: number; teams: Map<number, number>; points: number; teamPoints: number; starts: number }[];
  keyOf: Map<string, number>; win: number[]; lose: number[]; weight: number[];
};
export function fitRatings(cmp: ReturnType<typeof teammateComparisons>, opts?: { lambda?: number; mu?: number; iterations?: number }): { r: Float64Array; info: Float64Array };
export type RatingSeason = {
  season: number; rating: number; raw: number; comparisons: number; wins: number; losses: number; starts: number; team: number;
  share: number | null; points: number; teamPoints: number; se: number; info: number;
};
export type DriverRating = {
  d: number; seasons: RatingSeason[]; career: number; peak: number; peakSeason: number; comparisons: number; wins: number; losses: number;
  h2h: number | null; share: number | null; se: number; first: number; last: number; starts: number; confidence: "high" | "medium" | "low";
};
export function careerRatings(races: RatingRace[], opts?: { minPeak?: number; lambda?: number; mu?: number; iterations?: number }): { drivers: DriverRating[]; comparisons: number };
export function eraRating(driver: DriverRating, from: number, to: number): { rating: number; comparisons: number } | null;
