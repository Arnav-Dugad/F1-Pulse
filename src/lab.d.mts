export type SegmentStatus = "yellow" | "green" | "purple" | "pit" | "none" | "unknown";
export const SEGMENT_CODES: Record<number, SegmentStatus>;
export function medianOf(values: number[]): number | null;
export function mad(values: number[]): number | null;
export function interpAt<T extends Record<string, any>>(rows: T[], key: keyof T & string, field: keyof T & string, x: number): number | null;

export type SegmentLap = {
  segments_sector_1?: (number | null)[] | null;
  segments_sector_2?: (number | null)[] | null;
  segments_sector_3?: (number | null)[] | null;
};
export function segmentStatus(code: number | null | undefined): SegmentStatus;
export function lapSegments(lap: SegmentLap | null | undefined): SegmentStatus[][];
export function segmentSummary(lap: SegmentLap | null | undefined): Record<SegmentStatus | "total", number>;
export function pathLengths(points: { x: number; y: number }[]): number[];
export function mapSegments(
  points: { t: number; x: number; y: number }[],
  sectors: (number | null)[] | null,
  counts: number[],
): { sector: number; index: number; f0: number; f1: number }[];
export function slicePath(points: { x: number; y: number }[], cum: number[], f0: number, f1: number): { x: number; y: number }[];

export type CornerRow = { d: number; speed: number; brake: number };
export type Corner = { apex: number; minSpeed: number; peak: number; peakD: number; brakeD: number };
export function detectCorners(
  rows: CornerRow[],
  opts?: { minDrop?: number; mergeDist?: number; lookback?: number; smooth?: number },
): Corner[];
export function mergeCorners(a: Corner[], b: Corner[], dist?: number): { n: number; apex: number; seenBy: "both" | "a" | "b" }[];
export function cornerMetrics(
  rows: CornerRow[],
  apex: number,
  opts?: { search?: number; exit?: number; from?: number; to?: number; approach?: number },
): { minSpeed: number | null; minD: number | null; brakeD: number | null; exitSpeed: number | null };
export function windowDelta(delta: { distance: number; delta: number }[], d0: number, d1: number): number | null;

export type ControlLike = { date: string; category?: string | null; flag?: string | null; message?: string | null; scope?: string | null };
export type Neutral = { start: number; end: number; kind: "SC" | "VSC" | "RED" };
export function neutralWindows(control: ControlLike[]): Neutral[];
export type Exclusion = "no-time" | "lap1" | "pit-out" | "pit-in" | "pit-lane" | "neutralised" | "restart" | "no-stint" | "outlier";
export const EXCLUSIONS: Record<Exclusion, string>;
export type LapLike = SegmentLap & {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  date_start: string | null;
  is_pit_out_lap?: boolean | null;
};
export type StintLike = { driver_number: number; stint_number?: number | null; compound?: string | null; lap_start?: number | null; lap_end?: number | null; tyre_age_at_start?: number | null };
export type ClassifiedLap = {
  driver: number;
  lap: number;
  time: number | null;
  start: number | null;
  stint: number | null;
  compound: string | null;
  age: number | null;
  reason: Exclusion | null;
};
export function classifyLaps(laps: LapLike[], stints: StintLike[], windows: Neutral[], threshold?: number): ClassifiedLap[];
export function polyfit(xs: number[], ys: number[], degree?: 1 | 2): { coef: number[]; r2: number; rmse: number; n: number } | null;
export function evalPoly(coef: number[], x: number): number;
export type StintFit = {
  driver: number;
  stint: number;
  compound: string;
  n: number;
  coef: number[];
  r2: number;
  rmse: number;
  slope: number;
  base: number;
  ages: [number, number];
  laps: [number, number];
};
export function fitStints(classified: ClassifiedLap[], degree?: 1 | 2, opts?: { minLaps?: number; fuel?: number }): StintFit[];
export type CompoundRow = {
  compound: string;
  stints: number;
  laps: number;
  slope: { median: number | null; mad: number | null };
  base: { median: number | null; mad: number | null };
  r2: number | null;
};
export function compoundSummary(fits: StintFit[]): CompoundRow[];

export function chunkWindows(start: number, end: number, size?: number): [number, number][];
export function fetchEstimate(n: number, opts?: { spacing?: number; perMinute?: number; latency?: number; used?: number }): number;
export function trackAt(ts: ArrayLike<number>, xs: ArrayLike<number>, ys: ArrayLike<number>, t: number, maxGap?: number): [number, number] | null;
export function mergeSamples<T extends { t: number }>(existing: T[], incoming: T[]): T[];
