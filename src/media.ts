import assets from "./assets.json";
import type { Driver, Team } from "./types";
const driverKeys: Record<string, string> = {
  russell: "georus01",
  antonelli: "andant01",
  leclerc: "chalec01",
  hamilton: "lewham01",
  norris: "lannor01",
  piastri: "oscpia01",
  max_verstappen: "maxver01",
  hadjar: "isahad01",
  lawson: "lialaw01",
  lindblad: "arvlin01",
  arvid_lindblad: "arvlin01",
  gasly: "piegas01",
  colapinto: "fracol01",
  ocon: "estoco01",
  bearman: "olibea01",
  hulkenberg: "nichul01",
  bortoleto: "gabbor01",
  sainz: "carsai01",
  albon: "alealb01",
  alonso: "feralo01",
  stroll: "lanstr01",
  perez: "serper01",
  bottas: "valbot01",
  tsunoda: "yuktsu01",
};
const teamKeys: Record<string, string> = {
  red_bull: "redbullracing",
  rb: "racingbulls",
  racing_bulls: "racingbulls",
  aston_martin: "astonmartin",
  haas: "haasf1team",
};
export const name = (d: Driver) => `${d.givenName} ${d.familyName}`;
export const driverPhoto = (d: Driver, season: string) =>
  season === "2026" ||
  (season === "current" && new Date().getFullYear() === 2026)
    ? (assets.drivers as Record<string, string>)[driverKeys[d.driverId]]
    : undefined;
export const teamAsset = (
  t: Team,
  category: "logos" | "cars",
  season: string,
) =>
  season === "2026" ||
  (season === "current" && new Date().getFullYear() === 2026)
    ? (assets[category] as Record<string, string>)[
        teamKeys[t.constructorId] || t.constructorId
      ]
    : undefined;
const colors: Record<string, string> = {
  mercedes: "#30d6b0",
  ferrari: "#ef3746",
  mclaren: "#ff9b39",
  red_bull: "#6988ff",
  rb: "#89adff",
  racing_bulls: "#89adff",
  alpine: "#57b6e8",
  haas: "#b5b8c6",
  audi: "#f55868",
  williams: "#519bff",
  aston_martin: "#5ebda7",
  cadillac: "#c1b9a8",
};
export const teamColor = (t?: Team) =>
  colors[t?.constructorId || ""] || "#969fb0";

export const portraitEra = (d: Driver, season: string) =>
  d.driverId === "tsunoda"
    ? "archival photograph (date unspecified)"
    : season === "current"
      ? String(new Date().getFullYear())
      : season;
