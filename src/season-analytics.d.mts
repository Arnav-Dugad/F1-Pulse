import type { Driver, Race, Result, Team } from "./types";
import type { SeasonProgress } from "./progress.mjs";

export type PointsSystem = { year: number; race: number[]; sprint: number[]; fastestLap: boolean; raceMax: number; sprintMax: number; doubleFinale: boolean };
export function pointsSystem(year: number | string): PointsSystem | null;
export type Weekend = { round: string; raceName: string; circuitId: string; country: string; date: string; sprint: boolean; double: boolean; max: number };
export function weekendMax(sys: PointsSystem | null, weekend: { sprint: boolean; double: boolean }): number;
export function remainingWeekends(calendar: Race[], standingsRound: number, year: number | string, now?: number): Weekend[];
export function positionForPoints(table: number[], need: number): { pos: number | null; any: boolean } | null;

export type DeciderEntry = { id: string; name: string; points: number | string; wins?: number | string };
export type DeciderNeed = { id: string; name: string; deficit: number; margin: number; possible: boolean; guaranteed: boolean };
export type DeciderCombo = { leaderPos: number; leaderPoints: number; rivals: { id: string; name: string; atBest: number; any: boolean; scoresNothing: boolean }[] };
export type DeciderChaser = {
  id: string; name: string; points: number; deficit: number; maxPossible: number; perWeekend: number;
  canLeadThisWeekend: boolean; canTieThisWeekend: boolean; safeThisWeekend: boolean;
  eliminatedIfOutscoredBy: number; mustScoreIfLeaderMax: number; mustFinish: { pos: number | null; any: boolean } | null;
};
export type DeciderRival = { id: string; name: string; points: number; wins: number; deficit: number; alive: boolean };
export type Decider = {
  year: number; sys: PointsSystem;
  leader: { id: string; name: string; points: number; wins: number };
  rivals: DeciderRival[]; alive: DeciderRival[];
  settled: boolean; clinched: boolean; total: number; after: number[]; maxes: number[];
  earliest: (Weekend & { index: number }) | null;
  next: (Weekend & { swing: number; after: number; possible: boolean; needs: DeciderNeed[]; combos: DeciderCombo[]; leaderMaxIfWinsAll: number }) | null;
  chasers: DeciderChaser[];
};
export function decider(standings: DeciderEntry[], weekends: Weekend[], year: number | string): Decider | null;
export function clinchIndex(cum: number[][], leaderIndex: number, maxPerRound: number[]): number | null;

export function hashSeed(text: string): number;
export function rng(seed: number): () => number;

export type FormInput = { id: string; team: string; outcomes: (number | null)[] };
export function formInputs(races: Race[], opts?: { window?: number }): FormInput[];
export type SimInput = {
  drivers: (FormInput & { points: number; wins: number })[];
  others?: { id: string; points: number; wins: number }[];
  teams?: { id: string; points: number }[];
  weekends: Weekend[];
  year: number | string;
  sims?: number;
  seed?: number;
  decay?: number;
  prior?: number;
};
export type SimSummary = { id: string; title: number; mean: number; p10: number; p50: number; p90: number; current: number };
export type SimResult = {
  sims: number;
  drivers: (SimSummary & { racing: boolean })[];
  teams: SimSummary[];
  /** One entry per remaining weekend plus a final entry for "not clinched before the last race". */
  clinch: { round: string; raceName: string; probability: number }[];
};
export function createSimulation(input: SimInput): { step(count: number): boolean; result(): SimResult; readonly done: number; total: number };
export function simulateChampionship(input: SimInput): SimResult;

export type HeatCell = { points: number; race: number; sprint: number; pos: number | null; posText: string; grid: number; status: string; sprintPos?: number | null; team: string };
export type TeamHeatCell = { points: number; race: number; sprint: number; drivers: { id: string; name: string; pos: number | null; posText: string; points: number }[] };
export type PointsMatrix = {
  rounds: { round: string; raceName: string; country: string; circuitId: string; sprint: boolean }[];
  drivers: { id: string; driver: Driver; team: Team; cells: (HeatCell | null)[]; total: number }[];
  teams: { id: string; team: Team; cells: (TeamHeatCell | null)[]; total: number }[];
};
export function pointsMatrix(races: Race[], sprints?: Race[]): PointsMatrix;

export function stdDev(v: number[]): number;
export type ConsistencyRow = {
  id: string; driver: Driver; team: Team; starts: number; finishes: number; dnfs: number; dnfRate: number;
  meanPos: number | null; sdPos: number; meanPts: number; sdPts: number; index: number | null; qualified: boolean;
};
export function consistency(races: Race[], opts?: { minShare?: number }): ConsistencyRow[];

export type CauseKey = "engine" | "gearbox" | "hydraulics" | "collision" | "spun" | "brakes" | "suspension" | "electrical" | "mechanical" | "unspecified" | "disqualified" | "dns";
export const CAUSES: { key: CauseKey; label: string }[];
export function statusCause(status?: string, positionText?: string): CauseKey | "finished" | "dnq";
type Counts = Record<CauseKey, number>;
export type Reliability = {
  teams: { id: string; team: Team; counts: Counts; total: number; starts: number }[];
  drivers: { id: string; driver: Driver; team: Team; counts: Counts; total: number; starts: number }[];
  totals: Counts;
  statuses: Record<CauseKey, [string, number][]>;
};
export function reliability(races: Race[]): Reliability;

export function rollingAverage(values: (number | null)[], window?: number): (number | null)[];
export function formTrend(values: (number | null)[], window?: number, threshold?: number): { last: number | null; prev: number | null; delta: number; dir: "up" | "down" | "flat" };

export const PIT_LANE_FROM: number;
export type GainRow = { id: string; driver: Driver; team: Team; races: number; total: number; avg: number; pitLane: number; best: { gain: number; round: string; raceName: string; from: number; to: number } | null };
export function positionsGained(races: Race[]): GainRow[];

export function commonSessionGap(a: Pick<Result, "Q1" | "Q2" | "Q3">, b: Pick<Result, "Q1" | "Q2" | "Q3">): { session: "Q1" | "Q2" | "Q3"; a: number; b: number; gap: number } | null;
export type TeammatePair = {
  team: Team; a: Driver; b: Driver;
  quali: { a: number; b: number }; race: { a: number; b: number };
  meanGap: number | null; medianGap: number | null; excluded: number; rounds: number; raced: number;
  sessions: { round: string; raceName: string; session: string; a: number; b: number; gap: number }[];
};
export function teammateGaps(qualifying: Race[], races: Race[], opts?: { outlier?: number }): { id: string; team: Team; pairs: TeammatePair[] }[];

export function pitSeconds(d?: string): number | null;
export type PitRound = { round: string; raceName: string; stops: NonNullable<Race["PitStops"]>; teams: Map<string, Team> };
export type PitRow = { id: string; team: Team; stops: number; median: number; excluded: number; fastest: { seconds: number; driverId: string; round: string; raceName: string; lap: string } | null };
export function pitLeague(rounds: PitRound[], opts?: { max?: number }): PitRow[];

export type StoryFact =
  | { kind: "maiden-win"; id: string; name: string }
  | { kind: "first-season-win"; id: string; name: string; career: number }
  | { kind: "season-win"; id: string; name: string; count: number }
  | { kind: "from-grid"; id: string; name: string; grid: number }
  | { kind: "maiden-podium" | "podium-check"; id: string; name: string; position: number }
  | { kind: "lead-change"; id: string; name: string }
  | { kind: "mover"; id: string; name: string; gain: number; to: number }
  | { kind: "clinch"; id: string; name: string; remaining: number };
export type StoryChapter = SeasonProgress["rounds"][number] & {
  index: number;
  race?: Race;
  winner: Result | null;
  podium: Result[];
  sprintWinner: Result | null;
  facts: StoryFact[];
  top: { id: string; driver: Driver; points: number; rank: number; delta: number | null; gained: number }[];
};
export function storyChapters(progress: SeasonProgress, races: Race[], sprints?: Race[], opts?: { winsBefore?: Record<string, number>; priorSeasons?: Set<string>; clinch?: number | null }): StoryChapter[];
