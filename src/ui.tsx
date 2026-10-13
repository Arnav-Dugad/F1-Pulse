import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Download,
  Info,
  Heart,
  ImageOff,
  Share2,
  Check,
} from "lucide-react";
import type { Envelope, Driver, Team } from "./types";
import { name, driverPhoto, teamAsset, teamColor } from "./media";
import { usePrefs } from "./context";
import { seasonHref } from "./domain.mjs";
export function Photo({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`photo-unavailable ${className}`}
      role="img"
      aria-label={`Photo unavailable: ${alt}`}
    >
      <ImageOff size={20} />
      <span>Photo unavailable</span>
    </div>
  );
}
export function Source({ value }: { value?: Envelope<any> }) {
  return value ? (
    <details className="source">
      <summary>
        <Info size={12} />
        {value.meta.snapshot ? "Saved data" : "Source data"} ·{" "}
        {value.meta.source}
      </summary>
      <div>
        {value.meta.status}
        <br />
        Retrieved {new Date(value.meta.fetchedAt).toLocaleString()}
        <br />
        <a href={value.meta.url} target="_blank" rel="noreferrer">
          View source ↗
        </a>
      </div>
    </details>
  ) : null;
}
export function State({
  loading,
  error,
  empty = false,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  onRetry?: () => void;
}) {
  return loading ? (
    <div
      className="skeleton-group"
      role="status"
      aria-label="Loading real source data"
    >
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  ) : error ? (
    <div className="empty">
      <Info />
      <h3>Data is temporarily unavailable</h3>
      <p>{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="button secondary">
          <RefreshCw size={15} />
          Try again
        </button>
      )}
    </div>
  ) : empty ? (
    <div className="empty">
      <h3>No published data yet</h3>
      <p>
        The source has no records for this selection. Try another season or
        session.
      </p>
    </div>
  ) : null;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · F1 Pulse`;
  }, [title]);
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">
        {children}
        <ShareButton />
      </div>
    </div>
  );
}
export function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Link({
  to,
  children,
  className = "",
  style,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { season } = usePrefs();
  const route = to.split("?")[0];
  const current = location.hash.slice(2).split("?")[0] || "overview";
  return (
    <a
      className={className}
      style={style}
      href={seasonHref(to, season)}
      aria-current={current === route ? "page" : undefined}
    >
      {children}
    </a>
  );
}
export function ShareButton() {
  const { season } = usePrefs();
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  const share = async () => {
    const url = new URL(location.href);
    const route = location.hash.slice(2).split("?")[0] || "overview";
    const query = new URLSearchParams(location.hash.split("?")[1] || "");
    query.set(
      "season",
      season === "current" ? String(new Date().getFullYear()) : season,
    );
    url.hash = seasonHref(route + "?" + query, season);
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Link copied");
      setManual("");
    } catch {
      setManual(url.toString());
      setMessage("Select and copy the link below");
    }
  };
  return (
    <div className="share-control">
      <button className="button secondary small" onClick={share}>
        {message === "Link copied" ? <Check size={15} /> : <Share2 size={15} />}
        {message === "Link copied" ? "Copied" : "Share page"}
      </button>
      <span className="sr-only" role="status">
        {message}
      </span>
      {manual && (
        <input
          className="share-fallback"
          aria-label="Page link to copy"
          readOnly
          value={manual}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  );
}
export function More({
  to,
  children = "Explore",
}: {
  to: string;
  children?: ReactNode;
}) {
  return (
    <Link to={to} className="text-link">
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function DriverIdentity({
  driver,
  team,
  season,
}: {
  driver: Driver;
  team?: Team;
  season: string;
}) {
  return (
    <div className="identity">
      <Photo
        className="avatar"
        src={driverPhoto(driver, season)}
        alt={name(driver)}
      />
      <div>
        <Link to={"driver/" + driver.driverId}>{name(driver)}</Link>
        {team && (
          <small>
            <i style={{ background: teamColor(team) }} />
            {team.name}
          </small>
        )}
      </div>
    </div>
  );
}
export function Logo({ team, season }: { team: Team; season: string }) {
  const src = teamAsset(team, "logos", season);
  return src ? (
    <Photo src={src} alt={`${team.name} logo`} className="team-logo" />
  ) : (
    <span className="team-label">{team.name}</span>
  );
}
export function Favorite({
  id,
  favorites,
  setFavorites,
}: {
  id: string;
  favorites: string[];
  setFavorites: (x: string[]) => void;
}) {
  const selected = favorites.includes(id);
  return (
    <button
      className={`icon-button favorite ${selected ? "selected" : ""}`}
      aria-label={`${selected ? "Unsave" : "Save"} favorite`}
      aria-pressed={selected}
      onClick={(e) => {
        e.preventDefault();
        setFavorites(
          selected ? favorites.filter((x) => x !== id) : [...favorites, id],
        );
      }}
    >
      <Heart size={17} fill={selected ? "currentColor" : "none"} />
    </button>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function exportCSV(
  file: string,
  rows: (string | number | undefined)[][],
) {
  const csv = rows
    .map((row) =>
      row
        .map(
          (cell) =>
            '"' +
            String(cell ?? "")
              .replace(/"/g, '""')
              .replace(/^[=+@-]/, "'$&") +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  download(file, csv, "text/csv");
}
export function download(
  file: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button secondary small" onClick={onClick}>
      <Download size={14} />
      Export CSV
    </button>
  );
}
export function formatTime(date: string, time?: string, tz = "local") {
  const d = new Date(`${date}T${time || "00:00:00Z"}`);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: time ? "2-digit" : undefined,
    minute: time ? "2-digit" : undefined,
    ...(!time ? { timeZone: "UTC" } : tz !== "local" ? { timeZone: tz } : {}),
  });
}
export function seconds(s: number | null | undefined) {
  if (s == null || !Number.isFinite(s)) return "—";
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}
export type Series = {
  name: string;
  color: string;
  values: { x: number; y: number | null }[];
};
export function Chart({
  series,
  label,
  xLabel = "Round",
  yLabel = "",
  minY,
  maxY,
  hoverX,
  onHover,
  reverseY = false,
}: {
  series: Series[];
  label: string;
  xLabel?: string;
  yLabel?: string;
  minY?: number;
  maxY?: number;
  hoverX?: number | null;
  onHover?: (x: number | null) => void;
  reverseY?: boolean;
}) {
  const [localHover, setLocalHover] = useState<number | null>(null);
  const hover = hoverX === undefined ? localHover : hoverX;
  const setHover = onHover || setLocalHover;
  const all = series.flatMap((s) =>
    s.values.filter((v) => v.y !== null && Number.isFinite(v.y)),
  );
  if (!all.length) return <State empty />;
  const xmax = Math.max(...all.map((x) => x.x)),
    xmin = Math.min(...all.map((x) => x.x));
  const ymin = minY ?? Math.min(...all.map((x) => x.y!)),
    ymax = maxY ?? Math.max(...all.map((x) => x.y!));
  const X = (x: number) => 50 + ((x - xmin) / (xmax - xmin || 1)) * 820,
    Y = (y: number) =>
      reverseY
        ? 40 + ((y - ymin) / (ymax - ymin || 1)) * 200
        : 240 - ((y - ymin) / (ymax - ymin || 1)) * 200;
  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {hover !== null && (
          <strong>
            {xLabel} {hover.toFixed(1)}{" "}
            {series
              .map((s) => {
                const v = s.values.reduce(
                  (best, v) =>
                    Math.abs(v.x - hover) < Math.abs(best.x - hover) ? v : best,
                  s.values[0],
                );
                return `${s.name}: ${v?.y?.toFixed(2) ?? "—"}`;
              })
              .join(" · ")}
          </strong>
        )}
      </div>
      <svg
        viewBox="0 0 900 285"
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = (xmax - xmin) / 100 || 1;
          if (
            ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "ArrowLeft")
            setHover(Math.max(xmin, (hover ?? xmax) - step));
          if (e.key === "ArrowRight")
            setHover(Math.min(xmax, (hover ?? xmin) + step));
          if (e.key === "Home") setHover(xmin);
          if (e.key === "End") setHover(xmax);
          if (e.key === "Escape") setHover(null);
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            xmin +
              Math.max(
                0,
                Math.min(
                  1,
                  (((e.clientX - r.left) / r.width) * 900 - 50) / 820,
                ),
              ) *
                (xmax - xmin),
          );
        }}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1="50" x2="870" y1={40 + i * 50} y2={40 + i * 50} />
            <text x="42" y={44 + i * 50} textAnchor="end">
              {(reverseY
                ? ymin + ((ymax - ymin) * i) / 4
                : ymax - ((ymax - ymin) * i) / 4
              ).toFixed(ymax < 10 ? 2 : 0)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            d={s.values
              .map((v, i) =>
                v.y == null
                  ? ""
                  : `${i === 0 || s.values[i - 1]?.y == null ? "M" : "L"}${X(v.x)},${Y(v.y)}`,
              )
              .join(" ")}
          />
        ))}
        {hover !== null && (
          <line
            className="crosshair"
            x1={X(hover)}
            x2={X(hover)}
            y1="40"
            y2="240"
          />
        )}
        <text x="50" y="262">
          {xmin.toFixed(0)}
        </text>
        <text x="870" y="262" textAnchor="end">
          {xmax.toFixed(0)}
        </text>
        <text x="450" y="280" textAnchor="middle">
          {xLabel} {yLabel && `· ${yLabel}`}
        </text>
      </svg>
      <p className="chart-help">
        Hover or touch to inspect. Use arrow keys when the chart is focused.
      </p>
      <details>
        <summary>View chart data</summary>
        <Table headers={[xLabel, ...series.map((s) => s.name)]}>
          {series[0].values
            .filter(
              (_, i) =>
                i % Math.max(1, Math.floor(series[0].values.length / 100)) ===
                0,
            )
            .map((v, i) => (
              <tr key={i}>
                <td>{v.x.toFixed(2)}</td>
                {series.map((s) => (
                  <td key={s.name}>
                    {s.values.find((p) => p.x === v.x)?.y?.toFixed(3) ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
        </Table>
      </details>
    </div>
  );
}
export const arrow = <ChevronRight size={17} />;
