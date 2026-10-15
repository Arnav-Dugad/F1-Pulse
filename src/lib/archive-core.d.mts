import type { Race as JolpicaRace } from "../types";

export type ArchiveFile = {
  generatedAt: string;
  source: string;
  first: number;
  last: number;
  qualifyingFrom: number;
  sprintFrom: number;
  drivers: [string, string, string, string, string, string][];
  constructors: [string, string, string][];
  circuits: [string, string, string, string, number, number][];
  statuses: string[];
  races: unknown[];
};
export type ADriver = { id: string; given: string; family: string; name: string; dob: string; nat: string; code: string };
export type ATeam = { id: string; name: string; nat: string };
export type ACircuit = { id: string; name: string; locality: string; country: string; lat: number; lon: number };
export type ARow = { d: number; c: number; grid: number; text: string; pos: number | null; pts: number; status: string; laps: number; fl: number; ms: number; order: number };
export type ASprintRow = { d: number; c: number; text: string; pos: number | null; pts: number };
export type ARace = { season: number; round: number; name: string; circuit: number; date: string; pole: number; results: ARow[]; sprint: ASprintRow[] };
export type Archive = {
  generatedAt: string;
  first: number;
  last: number;
  qualifyingFrom: number;
  drivers: ADriver[];
  teams: ATeam[];
  circuits: ACircuit[];
  races: ARace[];
  /** Seasons merged live from the API (the running season). */
  live: number[];
  seasons: number[];
  driverIndex: Map<string, number>;
  teamIndex: Map<string, number>;
  circuitIndex: Map<string, number>;
};
export type Era = { id: string; label: string; from: number; to: number };

export const MODERN_POINTS: number[];
export const ERAS: Era[];
export function eraById(id: string | null | undefined): Era;
export function isStart(row: Pick<ARow, "text" | "status">): boolean;
export function decodeArchive(file: ArchiveFile): Archive;
export function mergeSeason(archive: Archive, season: string | number, races: JolpicaRace[], poles?: Map<string, string>, sprints?: JolpicaRace[]): Archive;
export function inRange(season: number, from?: number, to?: number): boolean;
export function racesIn(archive: Archive, from?: number, to?: number): ARace[];
export function isIndy500(archive: Archive, race: ARace): boolean;
export function poleOf(race: ARace): { d: number; c: number; source: "qualifying" | "grid" | "sprint" } | null;
export function hasFastestLap(race: ARace): boolean;
export function winnersOf(race: ARace): ARow[];
export function coverage(archive: Archive): { qualifyingFrom: number | null; fastestLapFrom: number | null; first: number | null; last: number | null };
export function ageAt(dob: string, date: string): { years: number; days: number; totalDays: number } | null;

export type Tally = {
  idx: number; starts: number; wins: number; podiums: number; poles: number; fastestLaps: number; points: number;
  hatTricks: number; oneTwos: number; best: number | null; seasons: Set<number>; first: ARace | null; last: ARace | null;
};
export type Metric = "wins" | "podiums" | "poles" | "fastestLaps" | "starts" | "points" | "winPct" | "hatTricks" | "oneTwos";
export function tally(archive: Archive, from?: number, to?: number): { drivers: Tally[]; teams: Tally[]; races: number; fastestLapRaces: number };
export function leaderboard(list: Tally[], metric: Metric, opts?: { minStarts?: number; limit?: number }): (Tally & { value: number })[];

export type AgeRecord = { idx: number; race: ARace; age: { years: number; days: number; totalDays: number }; row: ARow };
export function ageRecords(archive: Archive, opts?: { kind?: "win" | "podium"; order?: "youngest" | "oldest"; from?: number; to?: number; limit?: number }): AgeRecord[];
export type Streak = { idx: number; length: number; start: ARace; end: ARace };
export function winStreaks(archive: Archive, opts?: { kind?: "driver" | "constructor"; from?: number; to?: number; limit?: number }): Streak[];
export type SeasonBest = { idx: number; season: number; wins: number; races: number; pct: number };
export function seasonBests(archive: Archive, opts?: { kind?: "driver" | "constructor"; from?: number; to?: number; limit?: number }): SeasonBest[];
export type CircuitTendency = { idx: number; races: number; gain: number; samples: number; poleRaces: number; poleWins: number; first: number; last: number; avgGain: number; conversion: number };
export function circuitTendencies(archive: Archive, opts?: { from?: number; to?: number; minRaces?: number }): CircuitTendency[];
export type Dominance = { season: number; races: number; champion: number; complete: boolean; wins: number; winShare: number; points: number; totalPoints: number; pointsShare: number; winners: number };
export function dominance(archive: Archive, champions?: Map<number, string>): Dominance[];

export function modernPoints(pos: number | null, system?: number[]): number;
export type Rescored = { idx: number; team: number; points: number; actual: number; wins: number; podiums: number; starts: number; places: number[]; trace: number[]; rank: number };
export function rescoreSeason(archive: Archive, season: number, system?: number[]): { season: number; races: number; list: Rescored[] };
export type NormalisedChampion = { season: number; races: number; complete: boolean; champion: number; rescoredLeader: number; points: number; perStart: number; margin: number; maxShare: number };
export function normalisedChampions(archive: Archive, champions?: Map<number, string>, system?: number[]): NormalisedChampion[];
export function firstRaces(archive: Archive, driverIdx: number, n?: number, normalised?: boolean): { race: ARace; pos: number | null; cumulative: number }[];

export type Career = { idx: number; first: ARace | null; last: ARace | null; starts: number; wins: number; podiums: number; seasons: number[] };
export function careers(archive: Archive): Career[];
export function onThisDay(archive: Archive, monthDay: string): {
  races: ARace[];
  debuts: (Career & { row: ARow | undefined })[];
  birthdays: { idx: number; driver: ADriver; career: Career }[];
};
export type Rookie = {
  idx: number; season: number; starts: number; points: number; wins: number; podiums: number; poles: number; best: number | null;
  team: number; teams: number[]; mates: { idx: number; races: number; ahead: number; behind: number }[]; ahead: number; behind: number;
  careerStarts: number; careerWins: number;
};
export function rookieSeasons(archive: Archive): Rookie[];

export function compareRows(a: Pick<ARow, "pos">, b: Pick<ARow, "pos">): number;
export type RivalRace = { race: ARace; a: ARow; b: ARow; ahead: "a" | "b" | null; kind: "both" | "aOut" | "bOut" | "bothOut"; sameTeam: boolean; gapMs: number | null };
export type Rivalry = {
  races: RivalRace[];
  totals: { races: number; a: number; b: number; both: { a: number; b: number }; oneOut: { a: number; b: number }; bothOut: number; sameTeam: { races: number; a: number; b: number } };
  seasons: { season: number; races: number; a: number; b: number; sameTeam: number; aPoints: number; bPoints: number }[];
  spells: { team: number; from: number; to: number; races: number; start: ARace; end: ARace }[];
  closest: (RivalRace & { places: number })[];
};
export function rivalry(archive: Archive, a: number, b: number): Rivalry;

export type LineageSpan = { constructorId: string; from: number; to?: number };
export type LineageSeason = { season: number; constructorId: string; wins: number; points: number; races: number; podiums: number };
export function lineageSeasons(archive: Archive, spans: LineageSpan[]): LineageSeason[];
export function constructorSeasons(archive: Archive, constructorId: string, from?: number, to?: number): number[];
