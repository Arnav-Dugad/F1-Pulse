import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronRight, Heart } from "lucide-react";
import { Link } from "../lib/router";
import { usePrefs } from "../app/prefs";
import { cx, Img, useTilt } from "./core";
import { CarImage, DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo, TrackMap } from "./media";
import { circuitMedia, driverMedia, fullName, initials, isLightColor, teamColor, teamShortName } from "../lib/media";
import { formatDateRange, hasStarted } from "../lib/format";
import type { Driver, Race, Team } from "../types";
import "../styles/cards.css";

/* ─────────── Favourite toggle ─────────── */
export function FavoriteButton({ id, label, className }: { id: string; label: string; className?: string }) {
  const { favorites, toggleFavorite } = usePrefs();
  const on = favorites.includes(id);
  return (
    <button
      type="button"
      className={cx("fav-btn", on && "on", className)}
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(id); }}
    >
      <Heart size={17} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

/* ─────────── Driver card ─────────── */
export function DriverCard({ driver, team, year, stat, statLabel, rank, index = 0, className }: {
  driver: Driver; team?: Team; year: string; stat?: ReactNode; statLabel?: string; rank?: number; index?: number; className?: string;
}) {
  const tilt = useTilt<HTMLAnchorElement>(7);
  const tint = teamColor(team?.constructorId || driverMedia(driver.driverId, year)?.team);
  const hasPhoto = !!driverMedia(driver.driverId, year)?.card;
  const name = fullName(driver);
  return (
    <Link
      to={"driver/" + driver.driverId}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className={cx("driver-card tilt reveal", isLightColor(tint) && "light", className)}
      style={{ "--tint": tint, "--i": index % 8 } as CSSProperties}
      aria-label={`${name}${team ? ", " + team.name : ""}`}
    >
      <span className="dc-bg" />
      <NumberArt id={driver.driverId} number={driver.permanentNumber} year={year} className="dc-number" />
      {hasPhoto ? (
        <DriverPortrait id={driver.driverId} name={name} year={year} variant="card" className="dc-photo" />
      ) : (
        <span className="dc-monogram">{initials(name)}</span>
      )}
      <span className="dc-top">
        {rank ? <span className="dc-rank">P{rank}</span> : <span />}
        <FavoriteButton id={"driver:" + driver.driverId} label={name} />
      </span>
      <span className="dc-info">
        <span className="dc-name">
          <small>{driver.givenName}</small>
          <strong>{driver.familyName}</strong>
        </span>
        <span className="dc-meta">
          <Flag nationality={driver.nationality} />
          {team && <span className="ellipsis">{teamShortName(team.name, year)}</span>}
          {stat !== undefined && <span className="dc-stat"><b>{stat}</b>{statLabel && <small>{statLabel}</small>}</span>}
        </span>
      </span>
      <span className="glare" />
    </Link>
  );
}

/* ─────────── Team card ─────────── */
export function TeamCard({ team, year, drivers = [], position, points, index = 0 }: {
  team: Team; year: string; drivers?: Driver[]; position?: string; points?: string; index?: number;
}) {
  const tilt = useTilt<HTMLAnchorElement>(4);
  const tint = teamColor(team);
  const name = teamShortName(team.name, year);
  return (
    <Link
      to={"team/" + team.constructorId}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className={cx("team-card tilt reveal", isLightColor(tint) && "light")}
      style={{ "--tint": tint, "--i": index % 6 } as CSSProperties}
    >
      <span className="tc-bg" />
      <span className="tc-head">
        <TeamLogo id={team.constructorId} name={team.name} year={year} size={46} />
        <span className="tc-title">
          {position && <small>P{position} · Constructors</small>}
          <strong>{name}</strong>
        </span>
        <FavoriteButton id={"team:" + team.constructorId} label={name} />
      </span>
      <CarImage id={team.constructorId} name={name} year={year} className="tc-car" />
      <span className="tc-foot">
        <span className="tc-drivers">
          {drivers.map((d) => (
            <span key={d.driverId} className="tc-driver">
              <DriverAvatar id={d.driverId} name={fullName(d)} year={year} team={team.constructorId} size={30} />
              <span>{d.familyName}</span>
            </span>
          ))}
        </span>
        {points !== undefined && <span className="tc-points"><b>{points}</b><small>PTS</small></span>}
      </span>
      <span className="glare" />
    </Link>
  );
}

/* ─────────── Race card ─────────── */
export function RaceCard({ race, winner, next, index = 0, compact }: {
  race: Race; winner?: { driver: Driver; team: Team }; next?: boolean; index?: number; compact?: boolean;
}) {
  const { year } = usePrefs();
  const media = circuitMedia(race.Circuit.circuitId);
  const done = hasStarted(race.date, race.time) && !!winner;
  const start = race.FirstPractice?.date || race.SprintQualifying?.date || race.Qualifying?.date || race.date;
  const tint = winner ? teamColor(winner.team) : "var(--accent)";
  return (
    <Link
      to={"race/" + race.round}
      className={cx("race-card glass reveal interactive", next && "next", done && "done", compact && "compact")}
      style={{ "--i": index % 6, "--tint": tint } as CSSProperties}
    >
      <span className="rc-media">
        {media.hero ? <Img src={media.hero} alt="" /> : <span className="rc-placeholder" />}
        <span className="rc-scrim" />
        <span className="rc-track"><TrackMap circuitId={race.Circuit.circuitId} mode="static" label={race.Circuit.circuitName} /></span>
        <span className="rc-chips">
          <span className="chip solid">R{race.round}</span>
          {next && <span className="chip accent"><span className="live-dot" />Next up</span>}
          {race.Sprint && <span className="chip yellow">Sprint</span>}
          {done && <span className="chip green"><Check />Complete</span>}
        </span>
      </span>
      <span className="rc-body">
        <span className="rc-place"><Flag country={race.Circuit.Location.country} />{race.Circuit.Location.locality}, {race.Circuit.Location.country}</span>
        <strong className="rc-name">{race.raceName}</strong>
        <span className="rc-foot">
          <span className="rc-date">{formatDateRange(start, race.date)}</span>
          {winner ? (
            <span className="rc-winner">
              <DriverAvatar id={winner.driver.driverId} name={fullName(winner.driver)} year={year} team={winner.team.constructorId} size={26} />
              {winner.driver.familyName}
            </span>
          ) : (
            <ChevronRight size={18} className="rc-arrow" />
          )}
        </span>
      </span>
    </Link>
  );
}
