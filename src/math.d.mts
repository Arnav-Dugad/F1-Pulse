import type {
  Result,
  Race,
  Standing,
  CarSample,
  LocationSample,
} from "./types";
export function timeSeconds(v?: string): number | null;
export function summarize(
  r: Result[],
): {
  starts: number;
  wins: number;
  podiums: number;
  points: number;
  averageFinish: number;
  gain: number;
  retirements: number;
} | null;
export function headToHead(
  r: Race[],
  a: string,
  b: string,
): { a: number; b: number; ties: number; paired: number };
export function strategyTime(
  laps: number,
  base: number,
  stops: number[],
  degradation: number,
  pitLoss: number,
  traffic?: number,
): { time: number; stints: { start: number; end: number; laps: number }[] };
export function projectChampionship(
  s: Standing[],
  order: string[],
  season: number,
  kind?: string,
  fastestId?: string,
): Array<
  Standing & { originalPoints: number; added: number; projected: number }
>;
export type Trace = CarSample & { distance: number; elapsed: number };
export function distanceTrace(s: CarSample[]): Trace[];
export function lapDelta(
  a: Trace[],
  b: Trace[],
  steps?: number,
): Array<{ distance: number; delta: number }>;
export function median(v: number[]): number | null;
export function sampleAt(s: LocationSample[], t: number): LocationSample | null;
