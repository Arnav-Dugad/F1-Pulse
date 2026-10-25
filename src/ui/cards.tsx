import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronRight, Heart } from "lucide-react";
import { Link } from "../lib/router";
import { usePrefs } from "../app/prefs";
import { cx, Img, useTilt } from "./core";
import { CarImage, DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo, TrackMap } from "./media";
import { circuitMedia, driverMedia, fullName, initials, isLightColor, teamColor, teamShortName, useEraCircuitPhoto } from "../lib/media";
import { formatDateRange, hasStarted } from "../lib/format";
import type { Driver, Race, Team } from "../types";
import "../styles/cards.css";

/* ─────────── Shared-element transitions ─────────── */
/*
 * Cards and profile heroes share a view-transition name (`driver-<id>` / `team-<id>`) so the card's
 * portrait or car morphs into the profile hero. Repeated items must never carry a name
 * permanently (duplicates abort the transition), so a card only claims its name on the pointerdown
 * / click that starts the navigation, and releases it shortly after. When returning from a profile,
 * the card that launched it re-claims the name once as it mounts, so the hero morphs back.
 */
export type SharedKind = "driver" | "team";
const sharedClass: Record<SharedKind, string> = { driver: "driver-photo", team: "team-car" };

/** Inline style for a page's single primary hero portrait / car: `style={sharedTransition("driver", id)}`. */
export function sharedTransition(kind: SharedKind, id: string): CSSProperties {
  return { viewTransitionName: `${kind}-${id}`, viewTransitionClass: sharedClass[kind] };
}

let claimed: HTMLElement | null = null;
let releaseTimer = 0;
let launched = { name: "", at: 0 };

function releaseShared() {
  clearTimeout(releaseTimer);
  if (claimed) {
    claimed.style.removeProperty("view-transition-name");
    claimed.style.removeProperty("view-transition-class");
  }
  claimed = null;
}

function claimShared(el: Element | null | undefined, kind: SharedKind, id: string, hold = 1400) {
  releaseShared();
  if (!(el instanceof HTMLElement) || !("startViewTransition" in document)) return;
  const name = `${kind}-${id}`;
  // Never create a duplicate: another element (e.g. this page's hero) already owns the name.
  if (document.querySelector(`[style*="view-transition-name: ${name};"], [style*="view-transition-name:${name};"]`)) return;
  el.style.setProperty("view-transition-name", name);
  el.style.setProperty("view-transition-class", sharedClass[kind]);
  claimed = el;
  releaseTimer = window.setTimeout(releaseShared, hold);
}

/** Wire a card link so its media morphs into the profile hero. */
function useSharedLaunch(kind: SharedKind, id: string, media: string, ref: { current: HTMLElement | null }) {
  const name = `${kind}-${id}`;
  useLayoutEffect(() => {
    // Coming back from the profile this card opened: morph the hero back into the card.
    if (launched.name === name && Date.now() - launched.at < 10 * 60 * 1000) {
      launched = { name: "", at: 0 };
      claimShared(ref.current?.querySelector(media), kind, id, 900);
    }
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const launch = () => {
    launched = { name, at: Date.now() };
    claimShared(ref.current?.querySelector(media), kind, id);
  };
  return { onPointerDown: launch, onClickCapture: launch };
}

/* ─────────── Favourite toggle ─────────── */
const BURST = Array.from({ length: 10 }, (_, i) => i);
export function FavoriteButton({ id, label, className }: { id: string; label: string; className?: string }) {
  const { favorites, toggleFavorite } = usePrefs();
  const on = favorites.includes(id);
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      className={cx("fav-btn", on && "on", className)}
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!on) setBurst((b) => b + 1); toggleFavorite(id); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Heart size={17} fill={on ? "currentColor" : "none"} />
      {burst > 0 && on && (
        <span key={burst} className="fav-burst" aria-hidden>
          {BURST.map((i) => <i key={i} style={{ "--a": `${i * 36}deg`, "--d": `${16 + (i % 3) * 5}px` } as CSSProperties} />)}
        </span>
      )}
    </button>
  );
}

/* ─────────── Driver card ─────────── */
export function DriverCard({ driver, team, year, stat, statLabel, rank, index = 0, className }: {
  driver: Driver; team?: Team; year: string; stat?: ReactNode; statLabel?: string; rank?: number; index?: number; className?: string;
}) {
  const tilt = useTilt<HTMLAnchorElement>(7);
  const shared = useSharedLaunch("driver", driver.driverId, ".dc-photo, .dc-monogram", tilt.ref);
  const tint = teamColor(team?.constructorId || driverMedia(driver.driverId, year)?.team);
  const hasPhoto = !!driverMedia(driver.driverId, year)?.card;
  const name = fullName(driver);
  return (
    <Link
      to={"driver/" + driver.driverId}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      {...shared}
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
  const shared = useSharedLaunch("team", team.constructorId, ".tc-car, .tc-head .logo-badge", tilt.ref);
  const tint = teamColor(team);
  const name = teamShortName(team.name, year);
  return (
    <Link
      to={"team/" + team.constructorId}
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      {...shared}
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
  // Modern circuit photos only for modern seasons (no room for a Commons credit on a card).
  const photo = useEraCircuitPhoto(race.Circuit.circuitId, race.season, { commons: false });
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
        {photo ? <Img src={photo.src} alt="" /> : <span className="rc-placeholder" />}
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
