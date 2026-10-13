import { useId, useMemo, useState, type CSSProperties } from "react";
import { Img, cx } from "./core";
import {
  driverMedia, initials, isLightColor, teamColor, teamMedia, useTrackOutline,
} from "../lib/media";
import { countryFlag, nationalityFlag } from "../lib/countries";

/* ─────────── Driver headshot (circle) ─────────── */
export function DriverAvatar({ id, name, year, team, size = 44, className, square }: {
  id?: string; name: string; year: string; team?: string; size?: number; className?: string; square?: boolean;
}) {
  const m = driverMedia(id, year);
  const src = m?.head;
  const tint = teamColor(team || m?.team);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cx("avatar", square && "sq", className)}
      style={{ "--s": size + "px", "--tint": tint } as CSSProperties}
      role="img"
      aria-label={name}
    >
      {src && !failed ? (
        <Img src={src} alt="" onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "none", top: 0 }} />
      ) : (
        <span className="initials" aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

/* ─────────── Full-length portrait ─────────── */
export function DriverPortrait({ id, name, year, variant = "front", className, eager, style }: {
  id?: string; name: string; year: string; variant?: "front" | "card"; className?: string; eager?: boolean; style?: CSSProperties;
}) {
  const m = driverMedia(id, year);
  const src = m?.[variant];
  if (!src) return null;
  return <Img src={src} alt={`${name}, ${year} portrait`} className={className} eager={eager} style={style} />;
}

/* ─────────── Race number artwork ─────────── */
export function NumberArt({ id, number, year, className, style }: {
  id?: string; number?: string; year: string; className?: string; style?: CSSProperties;
}) {
  const m = driverMedia(id, year);
  if (m?.number) return <Img src={m.number} alt={number ? `Number ${number}` : ""} className={cx("number-art", className)} style={style} />;
  if (!number) return null;
  return <span className={cx("number-art number-text", className)} style={style} aria-label={`Number ${number}`}>{number}</span>;
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
      <Img src={variant === "white" ? m.logoWhite : m.logo} alt={`${name} logo`} className={className} style={{ width: size, height: size, objectFit: "contain" }} />
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
      {m ? <Img src={light ? m.logo : m.logoWhite} alt="" /> : <span className="initials" aria-hidden>{initials(name)}</span>}
    </span>
  );
}

export function CarImage({ id, name, year, view = "side", className, eager, style }: {
  id?: string; name: string; year: string; view?: "side" | "front"; className?: string; eager?: boolean; style?: CSSProperties;
}) {
  const m = teamMedia(id, year);
  if (!m) return null;
  return <Img src={view === "front" ? m.carFront : m.car} alt={`${name} ${year} car`} className={className} eager={eager} style={style} />;
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
