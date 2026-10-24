/* 1 · Qualifying lap overlay */
export function sectorMarks(rows: { t: number; d: number }[], s1: number | null | undefined, s2: number | null | undefined): number[];
export type SlowCorner = { n: number; apex: number; a: number; b: number; diff: number | null };
export function slowestCorners(
  rowsA: { d: number; speed: number; brake: number }[],
  rowsB: { d: number; speed: number; brake: number }[],
  limit?: number,
): SlowCorner[];

/* 2 · Pit-stop strategy explorer */
export type LapRow = { driver_number: number; lap_number: number; date_start: string | null; lap_duration: number | null; is_pit_out_lap?: boolean | null };
export type PitRow = { driver_number: number; lap_number: number; date?: string | null; lane_duration?: number | null; pit_duration?: number | null; stop_duration?: number | null };
export type LapWindow = { start: number; end: number };
export function crossingTimes(laps: LapRow[]): Map<number, Map<number, number>>;
export function orderAt(cross: Map<number, Map<number, number>>, lap: number): Map<number, number>;
export type Stop = { lap: number; lane: number | null; stop: number | null; date: string | null };
export function stopsByDriver(pits: PitRow[]): Map<number, Stop[]>;
export function neutralLap(windows: LapWindow[] | undefined, lap: number): boolean;
export const BATTLE_RULES: { window: number; maxLapsApart: number };
export type Outcome = "undercut-worked" | "undercut-failed" | "overcut-worked" | "overcut-failed" | "neutralised";
export type Battle = {
  first: number;
  second: number;
  firstLap: number;
  secondLap: number;
  lapsApart: number;
  before: number;
  after: number;
  swing: number;
  posBefore: [number | null, number | null];
  posAfter: [number | null, number | null];
  lane: [number | null, number | null];
  kind: "undercut" | "overcut";
  worked: boolean;
  neutralised: boolean;
  outcome: Outcome;
  caller: number;
  gain: number;
};
export function pitBattles(input: { laps: LapRow[]; pits: PitRow[]; neutral?: LapWindow[]; window?: number; maxLapsApart?: number }): Battle[];
export function battleSummary(battles: Battle[]): {
  total: number;
  green: number;
  neutralised: number;
  undercut: { tries: number; worked: number };
  overcut: { tries: number; worked: number };
};
export function pitLoss(input: { laps: LapRow[]; pits: PitRow[]; neutral?: LapWindow[] }): {
  lane: number | null;
  loss: number | null;
  greenLap: number | null;
  n: number;
  lanes: number;
  perStop: { driver: number; lap: number; loss: number; lane: number | null }[];
};

/* 3 · Wet vs dry */
export const WET_THRESHOLDS: number[];
export const DEFAULT_WET_MM: number;
/** [season, round, raceMm, preMm, dayMm, peakMm, timed, airC] */
export type WetRow = [number, number, number, number, number, number, number, number | null];
export function wetScore(row: WetRow | undefined | null): number;
export function modernPts(pos: number | null | undefined): number;
export type WetResult = { d: number; c: number; pos: number | null; grid: number; start: boolean };
export type WetRace = { wet: boolean; results: WetResult[] };
export type WetAgg = {
  starts: number; finishes: number; posSum: number; pts: number; wins: number; podiums: number; gained: number; gainedN: number;
  avgFinish: number | null; ptsPerStart: number | null; finishRate: number | null; avgGained: number | null;
};
export type WetDryRow = { id: number; wet: WetAgg; dry: WetAgg; uplift: number; finishDelta: number | null };
export function wetDryTable(races: WetRace[], opts?: { by?: "driver" | "team"; minWet?: number; minDry?: number }): WetDryRow[];
export function teammateWetEdge(races: WetRace[]): Map<number, { wet: { won: number; n: number }; dry: { won: number; n: number }; delta: number | null }>;
export type WeatherSample = { date: string; rainfall?: number | null; track_temperature?: number | null; air_temperature?: number | null };
export function sessionRain(samples: WeatherSample[], minShare?: number): {
  samples: number;
  rainSamples: number;
  share: number;
  wet: boolean;
  track: { median: number | null; min: number | null; max: number | null };
  air: number | null;
};
export function sessionPace(laps: LapRow[], pits?: PitRow[], minLaps?: number): { driver: number; laps: number; median: number; gapPct: number }[];
