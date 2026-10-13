import type { Race } from "./types";
export function recordedRank(value: unknown): number | null;
export function validSeason(value: unknown, currentYear?: number): boolean;
export function validTimezone(value: unknown): boolean;
export function normalizePreference<T>(
  key: string,
  value: unknown,
  fallback: T,
): T;
export function seasonHref(to: string, season: string): string;
export function mergeRacePage(list: Race[], page: Race[]): Race[];
export function snapshotMatches(
  snapshot: unknown,
  path: string,
  year?: number,
): boolean;
export function weekendSessions(
  race: Race,
): Array<{ label: string; date: string; time?: string }>;
export function buildCalendar(
  races: Race[],
  allSessions?: boolean,
  now?: Date,
): string;
