import media from "../data/media.json";
import { useEffect, useState } from "react";
import type { Driver, Team } from "../types";

/**
 * Official imagery: the full modern set (portraits, number art, logos, cars) for 2024–2026, and
 * official driver photos, cars and logos for 2019–2023 (`seasons` in media.json). Seasons without
 * imagery get era-neutral treatments — a modern photo is never shown for an older season.
 */
export const MEDIA_SEASON = "2026";
export const isMediaSeason = (year: string) => year === MEDIA_SEASON || !!(media as MediaFile).seasons?.[year];

/** `front`/`card` are transparent full-length cut-outs (2024+); `photo` is a framed studio portrait (2019–2023). */
export type DriverMedia = { team: string; front: string | null; card: string | null; number: string | null; head?: string; photo?: string };
export type TeamMedia = { slug?: string; colour?: string; accessible?: string; logo: string; logoWhite?: string; car?: string; carFront?: string; carLeft?: string; drivers?: string[] };
export type GalleryImage = { src: string; caption?: string; credit?: string };
type MediaFile = {
  drivers: Record<string, DriverMedia>;
  teams: Record<string, TeamMedia>;
  circuits: Record<string, { hero?: string; map?: string }>;
  seasons?: Record<string, { drivers: Record<string, DriverMedia>; teams: Record<string, TeamMedia> }>;
  galleries?: { drivers?: Record<string, GalleryImage[]>; teams?: Record<string, GalleryImage[]>; races?: Record<string, GalleryImage[]> };
  /** Official helmet artwork: driverId -> season -> file. */
  helmets?: Record<string, Record<string, string>>;
};
const file = media as MediaFile;

const driverAliases: Record<string, string> = { lindblad: "arvid_lindblad" };
const teamAliases: Record<string, string> = { racing_bulls: "rb", haas_f1_team: "haas" };

export function driverMedia(driverId: string | undefined, year: string): DriverMedia | null {
  if (!driverId) return null;
  const id = driverAliases[driverId] || driverId;
  if (year === MEDIA_SEASON) return file.drivers[id] || null;
  return file.seasons?.[year]?.drivers[id] || null;
}
export function teamMedia(constructorId: string | undefined, year: string): TeamMedia | null {
  if (!constructorId) return null;
  const id = teamAliases[constructorId] || constructorId;
  if (year === MEDIA_SEASON) return file.teams[id] || null;
  return file.seasons?.[year]?.teams[constructorId] || file.seasons?.[year]?.teams[id] || null;
}
/** Trackside action photography for a driver or team (current season). */
export const driverGallery = (driverId?: string): GalleryImage[] =>
  (driverId && file.galleries?.drivers?.[driverAliases[driverId] || driverId]) || [];
export const teamGallery = (constructorId?: string): GalleryImage[] =>
  (constructorId && file.galleries?.teams?.[teamAliases[constructorId] || constructorId]) || [];

export function circuitMedia(circuitId?: string): { hero?: string; map?: string } {
  return (circuitId && file.circuits[circuitId]) || {};
}
type Outline = { viewBox: string; paths: string[] };
let tracks: Record<string, Outline> | null = null;
let loading: Promise<Record<string, Outline>> | null = null;
/** Circuit outlines (~100 KB gzipped) load once, on first use. */
export const loadTracks = () =>
  (loading ??= fetch("/data/tracks.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => (tracks = d))
    .catch(() => (tracks = {})));
export function useTrackOutline(circuitId?: string): Outline | null {
  const [, ready] = useState(0);
  useEffect(() => {
    if (!tracks) loadTracks().then(() => ready((x) => x + 1));
  }, []);
  return (circuitId && tracks?.[circuitId]) || null;
}

/** Brand colours: official 2026 values, then well-known historical liveries. */
const historical: Record<string, string> = {
  sauber: "#52E252", kick_sauber: "#52E252", alfa: "#B12039", alphatauri: "#5E8FAA", toro_rosso: "#469BFF",
  renault: "#FFF500", force_india: "#F596C8", racing_point: "#F596C8", lotus_f1: "#B6A16B", lotus: "#FFB800",
  team_lotus: "#1C4E2F", brawn: "#B8FD6E", toyota: "#E0D7C5", bmw_sauber: "#6CD3FF", honda: "#F0F0F0",
  jaguar: "#0A6E3C", minardi: "#191919", jordan: "#F5D30E", benetton: "#4CB848", tyrrell: "#3953A3",
  brabham: "#2E5A2F", cooper: "#00573A", maserati: "#A0001E", vanwall: "#004225", brm: "#0E4D2E",
  matra: "#3166C1", ligier: "#3A82D9", arrows: "#F2751E", stewart: "#FFFFFF", super_aguri: "#E30613",
  spyker: "#FF7A00", hrt: "#B2945E", caterham: "#0A8547", marussia: "#6E0000", manor: "#ED1C24",
  virgin: "#C51D23", alphatauri_honda: "#5E8FAA", prost: "#1F3F9A", march: "#CC0000", wolf: "#1C2B4B",
};
const official: Record<string, string> = Object.fromEntries(
  Object.entries(file.teams).map(([id, t]) => [id, t.colour || ""]),
);
export function teamColor(team?: Pick<Team, "constructorId"> | string): string {
  const id = typeof team === "string" ? team : team?.constructorId || "";
  const key = teamAliases[id] || id;
  return official[key] || historical[key] || "#8E8E99";
}
/** Light liveries need dark ink on solid team-colour surfaces. */
export function isLightColor(hex: string) {
  const v = parseInt(hex.replace("#", ""), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 168;
}

/**
 * The team a driver currently represents. Jolpica's `Constructors` array on a standing is NOT
 * chronological (e.g. Lawson 2026: Racing Bulls, three rounds at Red Bull, back to Racing Bulls
 * is listed as [rb, red_bull]). Prefer a known latest-race constructor map when available,
 * then the official 2026 roster, then the last listed constructor.
 */
export function teamOf<T extends Pick<Team, "constructorId">>(
  standing: { Driver: Pick<Driver, "driverId">; Constructors: T[] },
  year: string,
  latest?: Map<string, string>,
): T | undefined {
  const list = standing.Constructors || [];
  if (list.length <= 1) return list[0];
  const known = latest?.get(standing.Driver.driverId) || driverMedia(standing.Driver.driverId, year)?.team;
  return list.find((c) => c.constructorId === known) || list.at(-1);
}

export const fullName =(d: Pick<Driver, "givenName" | "familyName">) => `${d.givenName} ${d.familyName}`;
export const initials = (s: string) =>
  s.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
/** Display name: drops the " F1 Team" suffix; RB has raced as Racing Bulls since 2025. */
export const teamShortName = (name: string, year = "2026") => {
  const short = name.replace(/ F1 Team$/, "");
  return short === "RB" && +year >= 2025 ? "Racing Bulls" : short;
};

/* ───────────────────────── Historical & extended photography (round 3) ─────────────────────────
 * Official season media (2019–2026) comes first; everything else uses freely licensed photos from
 * Wikimedia Commons (`/data/wikimedia.json`, ~1 file per driver / constructor and up to 6 per circuit,
 * fetched by scripts/fetch-wikimedia.py). The JSON is NOT bundled: it loads once, on first use.
 * Every Commons photo carries a `credit` that must be shown next to it — use `<PhotoCredit>` from
 * src/ui/media.tsx.
 */
/** Attribution for freely licensed photos (Wikimedia Commons) or official F1 media. */
export type PhotoCredit = { artist?: string; license?: string; licenseUrl?: string; source: string; date?: string; title?: string; official?: boolean };
/**
 * `kind`: "photo" (framed photograph; the default when absent), "cutout" (transparent official render —
 * a driver portrait or car side view, use object-fit: contain), "logo" (official team logo) or "map"
 * (official circuit map). `head` is a 256 px square headshot when one exists.
 */
export type Photo = { src: string; head?: string; width?: number; height?: number; alt?: string; credit: PhotoCredit; kind?: "photo" | "cutout" | "logo" | "map";
  /** In-period race photos only represent nearby seasons (see scripts/fetch-wikimedia.py `season_windows`). */
  seasons?: [number, number] };
type WikiFile = { drivers: Record<string, Photo>; constructors: Record<string, Photo>; circuits: Record<string, Photo[]> };

const EMPTY_WIKI: WikiFile = { drivers: {}, constructors: {}, circuits: {} };
let wiki: WikiFile | null = null;
let wikiLoading: Promise<WikiFile> | null = null;
/** `/data/wikimedia.json` (Commons photos + credits), fetched once and shared by every hook. */
export const loadWikimedia = (): Promise<WikiFile> =>
  (wikiLoading ??= fetch("/data/wikimedia.json")
    .then((r) => (r.ok ? r.json() : EMPTY_WIKI))
    .then((d: Partial<WikiFile>) => (wiki = { drivers: d.drivers || {}, constructors: d.constructors || {}, circuits: d.circuits || {} }))
    .catch(() => (wiki = EMPTY_WIKI)));

/** The Commons index once loaded (null before). Pass `enabled = false` to skip loading when not needed. */
export function useWikimedia(enabled = true): WikiFile | null {
  const [, ready] = useState(0);
  useEffect(() => {
    if (enabled && !wiki) {
      let live = true;
      loadWikimedia().then(() => live && ready((x) => x + 1));
      return () => { live = false; };
    }
  }, [enabled]);
  return wiki;
}

const OFFICIAL = (year: string): PhotoCredit => ({ artist: "Formula 1", source: "https://www.formula1.com/", date: year, official: true });
const officialSeasons = () => [MEDIA_SEASON, ...Object.keys(file.seasons || {}).sort().reverse()];

/** Official portrait for that season (or, without a season, the most recent one), as a Photo. */
export function officialDriverPhoto(driverId: string | undefined, year?: string): Photo | null {
  if (!driverId) return null;
  for (const y of year ? [year] : officialSeasons()) {
    const m = driverMedia(driverId, y);
    const src = m?.photo || m?.front || m?.card || m?.head;
    if (m && src) return { src, head: m.head, kind: m.photo ? "photo" : m.front || m.card ? "cutout" : "photo", credit: OFFICIAL(y) };
  }
  return null;
}
/** Official car (else logo) for that season (or the most recent one), as a Photo. */
export function officialTeamPhoto(constructorId: string | undefined, year?: string): Photo | null {
  if (!constructorId) return null;
  for (const y of year ? [year] : officialSeasons()) {
    const m = teamMedia(constructorId, y);
    if (m?.car) return { src: m.car, kind: "cutout", credit: OFFICIAL(y) };
    if (m?.logo) return { src: m.logo, kind: "logo", credit: OFFICIAL(y) };
  }
  return null;
}
/** Commons photo for a driver from a loaded index (`useWikimedia()`), or null. */
export const commonsDriverPhoto = (w: WikiFile | null, driverId?: string): Photo | null =>
  (driverId && w && (w.drivers[driverId] || w.drivers[driverAliases[driverId] || ""])) || null;
export function commonsTeamPhoto(w: WikiFile | null, constructorId?: string, year?: string): Photo | null {
  const photo = (constructorId && w && (w.constructors[constructorId] || w.constructors[teamAliases[constructorId] || ""])) || null;
  if (photo?.seasons && year && (+year < photo.seasons[0] || +year > photo.seasons[1])) return null;
  return photo;
}

/**
 * Best available photo of any driver in history: the official portrait for `year` (or, without a year,
 * the latest official one), else the Wikimedia Commons photo — whose `credit.date` is the year it was
 * taken, so label it ("Photo: 1967"). Returns null while loading and when nothing exists.
 *   const photo = useDriverPhoto("clark", "1965");
 *   photo && <figure><Img src={photo.src} alt={photo.alt || name} /><PhotoCredit credit={photo.credit} /></figure>
 */
export function useDriverPhoto(driverId: string | undefined, year?: string): Photo | null {
  const official = officialDriverPhoto(driverId, year);
  const w = useWikimedia(!!driverId && !official);
  return official || commonsDriverPhoto(w, driverId);
}
/** Best available photo for any constructor: official car / logo for that season first, then Commons. */
export function useTeamPhoto(constructorId: string | undefined, year?: string): Photo | null {
  const official = officialTeamPhoto(constructorId, year);
  const w = useWikimedia(!!constructorId && !official);
  return official || commonsTeamPhoto(w, constructorId, year);
}
/**
 * Photos of a circuit and its surroundings ("places"), most representative first: the official F1
 * race-hub photo and detailed map (`kind: "map"`) where present, then Commons photos.
 */
export function useCircuitPhotos(circuitId: string | undefined): Photo[] {
  const w = useWikimedia(!!circuitId);
  if (!circuitId) return [];
  const m = circuitMedia(circuitId);
  const out: Photo[] = [];
  if (m.hero) out.push({ src: m.hero, kind: "photo", credit: OFFICIAL(MEDIA_SEASON) });
  if (m.map) out.push({ src: m.map, kind: "map", credit: OFFICIAL(MEDIA_SEASON) });
  return out.concat(w?.circuits[circuitId] || []);
}
/** Trackside photography for one race weekend (official F1 media), e.g. ("2026", "17"). */
export function raceGallery(season: string, round: string): GalleryImage[] {
  return file.galleries?.races?.[`${season}-${Number(round)}`] || [];
}
/** Official helmet artwork by season, newest first. */
export function driverHelmets(driverId: string | undefined): { year: string; src: string }[] {
  if (!driverId) return [];
  const byYear = file.helmets?.[driverId] || file.helmets?.[driverAliases[driverId] || ""] || {};
  return Object.entries(byYear).map(([year, src]) => ({ year, src })).sort((a, b) => +b.year - +a.year);
}
