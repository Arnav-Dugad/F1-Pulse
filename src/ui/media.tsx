import { useId, useMemo, useState, type CSSProperties } from "react";
import { Img, cx } from "./core";
import {
  commonsDriverPhoto, commonsTeamPhoto, driverMedia, initials, isLightColor, teamColor, teamMedia, useTrackOutline, useWikimedia,
  type PhotoCredit as Credit,
} from "../lib/media";
import "./media.css";
import { countryFlag, nationalityFlag } from "../lib/countries";

/* ─────────── Photo credit ─────────── */
const httpUrl = (s?: string) => (s && /^https?:\/\//.test(s) ? s : undefined);
/** One-line text credit, e.g. for `title` tooltips: "Photo (1967): Artist · CC BY-SA 4.0 (Wikimedia Commons)". */
export function creditText(credit: Credit): string {
  if (credit.official) return "Photo: Formula 1";
  return `Photo${credit.date ? ` (${credit.date})` : ""}: ${credit.artist || "Unknown author"}${credit.license ? " · " + credit.license : ""} (Wikimedia Commons)`;
}
/**
 * Attribution for a photo — required next to every Wikimedia Commons image:
 * "Photo (1967): Artist · CC BY-SA 4.0", artist linked to the Commons file page and licence to its
 * deed. Official media reads "Photo: Formula 1". `overlay` styles it for placement over an image.
 */
export function PhotoCredit({ credit, className, overlay, showDate = true }: { credit: Credit; className?: string; overlay?: boolean; showDate?: boolean }) {
  if (credit.official) return <small className={cx("photo-credit", overlay && "overlay", className)}>Photo: Formula 1</small>;
  const source = httpUrl(credit.source);
  const licence = httpUrl(credit.licenseUrl);
  const who = credit.artist || "Unknown author";
  return (
    <small className={cx("photo-credit", overlay && "overlay", className)}>
      <span className="photo-credit-label">Photo{showDate && credit.date ? ` (${credit.date})` : ""}:</span>{" "}
      {source ? <a href={source} target="_blank" rel="noopener noreferrer" title="Wikimedia Commons file page">{who}</a> : <span>{who}</span>}
      {credit.license && (
        <>
          <span aria-hidden> · </span>
          {licence ? <a href={licence} target="_blank" rel="noopener noreferrer license">{credit.license}</a> : <span>{credit.license}</span>}
        </>
      )}
    </small>
  );
}

/* ─────────── Driver headshot (circle) ─────────── */
/** Official season headshot; otherwise a Wikimedia Commons headshot (credit in the tooltip); otherwise initials. */
export function DriverAvatar({ id, name, year, team, size = 44, className, square }: {
  id?: string; name: string; year: string; team?: string; size?: number; className?: string; square?: boolean;
}) {
  const m = driverMedia(id, year);
  const w = useWikimedia(!!id && !m?.head);
  const commons = m?.head ? null : commonsDriverPhoto(w, id);
  const src = m?.head || commons?.head;
  const tint = teamColor(team || m?.team);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={cx("avatar", square && "sq", commons?.head && "commons", className)}
      style={{ "--s": size + "px", "--tint": tint } as CSSProperties}
      role="img"
      aria-label={name}
      title={commons?.head ? `${name} — ${creditText(commons.credit)}` : undefined}
    >
      {src && failed !== src ? (
        <Img src={src} alt="" onError={() => setFailed(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "none", top: 0 }} />
      ) : (
        <span className="initials" aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

/* ─────────── Full-length portrait ─────────── */
/**
 * Official transparent portrait for the season. With `fallback`, seasons without one show the driver's
 * Wikimedia Commons photo instead, framed, with its credit underneath (`.portrait-archive`).
 */
export function DriverPortrait({ id, name, year, variant = "front", className, eager, style, fallback }: {
  id?: string; name: string; year: string; variant?: "front" | "card"; className?: string; eager?: boolean; style?: CSSProperties; fallback?: boolean;
}) {
  const m = driverMedia(id, year);
  const src = m?.[variant];
  const w = useWikimedia(!!fallback && !!id && !src);
  if (src) return <Img src={src} alt={`${name}, ${year} portrait`} className={className} eager={eager} style={style} />;
  const commons = fallback ? commonsDriverPhoto(w, id) : null;
  if (!commons) return null;
  return (
    <figure className={cx("portrait-archive", className)} style={style}>
      <Img src={commons.src} alt={commons.alt || name} eager={eager} />
      <PhotoCredit credit={commons.credit} overlay />
    </figure>
  );
}

/* ─────────── Race number artwork ─────────── */
export function NumberArt({ id, number, year, className, style, eager }: {
  id?: string; number?: string; year: string; className?: string; style?: CSSProperties; eager?: boolean;
}) {
  const m = driverMedia(id, year);
  if (m?.number) return <Img src={m.number} alt={number ? `Number ${number}` : ""} className={cx("number-art", className)} style={style} eager={eager} />;
  if (!number) return null;
  return <span role="img" className={cx("number-art number-text", className)} style={style} aria-label={`Number ${number}`}>{number}</span>;
}

/* ─────────── Team logo ─────────── */
export function TeamLogo({ id, name, year, size = 40, variant = "badge", className }: {
  id?: string; name: string; year: string; size?: number; variant?: "badge" | "color" | "white"; className?: string;
}) {
  const m = teamMedia(id, year);
  const tint = teamColor(id);
  const light = isLightColor(tint);
  if (variant !== "badge")
    return m ? (
      <Img src={variant === "white" ? m.logoWhite || m.logo : m.logo} alt={`${name} logo`} className={className} style={{ width: size, height: size, objectFit: "contain" }} />
    ) : (
      <span className={cx("logo-badge", light && "light-tint", className)} style={{ "--s": size + "px", "--tint": tint } as CSSProperties}>
        <span className="initials">{initials(name)}</span>
      </span>
    );
  return (
    <span
      className={cx("logo-badge", light && "light-tint", className)}
      style={{ "--s": size + "px", "--tint": tint } as CSSProperties}
      role="img"
      aria-label={`${name} logo`}
    >
      {m ? <Img src={light || !m.logoWhite ? m.logo : m.logoWhite} alt="" /> : <span className="initials" aria-hidden>{initials(name)}</span>}
    </span>
  );
}

/**
 * Official car render for the season. With `fallback`, seasons without one show the constructor's
 * Wikimedia Commons photo (framed, credited) instead.
 */
export function CarImage({ id, name, year, view = "side", className, eager, style, fallback }: {
  id?: string; name: string; year: string; view?: "side" | "front"; className?: string; eager?: boolean; style?: CSSProperties; fallback?: boolean;
}) {
  const m = teamMedia(id, year);
  const src = view === "front" ? m?.carFront : m?.car;
  const w = useWikimedia(!!fallback && !!id && !src);
  if (src) return <Img src={src} alt={`${name} ${year} car`} className={className} eager={eager} style={style} />;
  const commons = fallback ? commonsTeamPhoto(w, id, year) : null;
  if (!commons) return null;
  return (
    <figure className={cx("car-archive", className)} style={style}>
      <Img src={commons.src} alt={commons.alt || `${name} car`} eager={eager} />
      <PhotoCredit credit={commons.credit} overlay />
    </figure>
  );
}

/* ─────────── Flags ─────────── */
export function Flag({ nationality, country, large, className }: { nationality?: string; country?: string; large?: boolean; className?: string }) {
  const code = nationality ? nationalityFlag(nationality) : countryFlag(country);
  if (!code) return null;
  return <img className={cx("flag", large && "lg", className)} src={`/media/flags/${code}.webp`} alt={nationality || country || ""} loading="lazy" width={large ? 34 : 22} height={large ? 23 : 15} />;
}

/* ─────────── Animated circuit outline ─────────── */
export function TrackMap({ circuitId, mode = "draw", cars = [], lap = 9, className, style, label }: {
  circuitId?: string;
  mode?: "draw" | "static";
  /** Colours of animated "cars" that lap the circuit. */
  cars?: string[];
  lap?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const outline = useTrackOutline(circuitId);
  const uid = useId().replace(/:/g, "");
  const racingLine = useMemo(() => {
    if (!outline) return "";
    const longest = [...outline.paths].sort((a, b) => b.length - a.length)[0];
    const sub = longest.split(/(?=M)/)[0];
    return sub;
  }, [outline]);
  if (!outline) return null;
  return (
    <svg className={cx("track", mode, className)} viewBox={outline.viewBox} style={style} role="img" aria-label={label || "Circuit layout"} preserveAspectRatio="xMidYMid meet">
      {mode === "draw" && <path className="glow" d={racingLine} pathLength={1} />}
      {outline.paths.map((d, i) => (
        <path key={i} className="outline" d={d} pathLength={1} />
      ))}
      <path id={`line-${uid}`} d={racingLine} fill="none" stroke="none" />
      {cars.map((color, i) => (
        <g key={i} style={{ "--track-glow": color } as CSSProperties}>
          <circle className="car" r={1.9} opacity={0}>
            <animate attributeName="opacity" from="0" to="1" begin={`${2.4 + i * 0.25}s`} dur="0.4s" fill="freeze" />
            <animateMotion dur={`${lap}s`} begin={`${-i * (lap * 0.045)}s`} repeatCount="indefinite" rotate="auto" calcMode="paced">
              <mpath href={`#line-${uid}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </svg>
  );
}
