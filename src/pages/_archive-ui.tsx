/**
 * Shared building blocks for the Archive pages (Record Book, On This Day, Rivalries, Rookies,
 * Across Eras, Team Lineage): the glass hero, archive loading/progress state, driver faces with
 * era-correct media, a searchable driver picker, the era switch and an accessible column chart.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { Archive as ArchiveIcon, Search, X } from "lucide-react";
import { driverMedia, initials, teamColor } from "../lib/media";
import { Link } from "../lib/router";
import { careers, ERAS, type Archive, type ArchiveProgress } from "../lib/archive";
import { Glass, Img, Segmented, Skeleton, StateView, cx } from "../ui/core";
import { DriverAvatar } from "../ui/media";
import "./_archive-ui.css";

/* ───────────────────────── Hero ───────────────────────── */
export type HeroStat = { label: string; value: ReactNode };
export function ArchiveHero({ eyebrow, icon, title, accent, lede, photo, tint = "#e10600", stats, figure, actions, className }: {
  eyebrow: ReactNode; icon?: ReactNode; title: ReactNode; accent?: ReactNode; lede?: ReactNode; photo?: string; tint?: string;
  stats?: HeroStat[]; figure?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <section className={cx("arx-hero", className)} style={{ "--tint": tint } as CSSProperties}>
      <div className="arx-hero-media" aria-hidden>
        {photo && <Img src={photo} alt="" eager />}
        <span className="arx-hero-grain" />
        <span className="arx-hero-scrim" />
      </div>
      <div className="arx-hero-inner">
        <div className="arx-hero-copy">
          <span className="eyebrow arx-hero-eyebrow rise">{icon || <ArchiveIcon size={14} />}{eyebrow}</span>
          <h1 className="display arx-hero-title rise" style={{ "--i": 1 } as CSSProperties}>
            {title}
            {accent && <span>{accent}</span>}
          </h1>
          {lede && <p className="arx-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>{lede}</p>}
          {stats && stats.length > 0 && (
            <div className="arx-hero-stats rise" style={{ "--i": 3 } as CSSProperties}>
              {stats.map((s) => (
                <div className="arx-hero-stat" key={s.label}>
                  <span className="arx-hero-stat-value">{s.value}</span>
                  <span className="arx-hero-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {actions && <div className="arx-hero-actions rise" style={{ "--i": 4 } as CSSProperties}>{actions}</div>}
        </div>
        {figure && <div className="arx-hero-figure">{figure}</div>}
      </div>
    </section>
  );
}

/* ───────────────────────── Loading / error ───────────────────────── */
const PHASES: Record<ArchiveProgress["phase"], string> = {
  download: "Downloading every Grand Prix since 1950",
  history: "Loading championship tables",
  index: "Indexing races, drivers and teams",
  live: "Merging the current season live",
  ready: "Ready",
};
export function ArchiveLoading({ progress, rows = 3 }: { progress: ArchiveProgress; rows?: number }) {
  const pct = progress.phase === "download" ? (progress.total ? progress.loaded / progress.total : null) : progress.phase === "ready" ? 1 : 0.92;
  const kb = Math.round(progress.loaded / 1024);
  return (
    <div className="arx-loading" aria-busy="true">
      <div className="arx-loading-hero">
        <Skeleton h="min(62vh, 560px)" r={36} />
        <Glass strong className="arx-progress" role="status" aria-live="polite">
          <span className="eyebrow"><span className="dot live" />Archive</span>
          <strong>{PHASES[progress.phase]}</strong>
          <div className="arx-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(pct * 100)} aria-label="Archive loading progress">
            <span className={cx("arx-progress-fill", pct === null && "indeterminate")} style={{ width: pct === null ? undefined : `${Math.max(4, pct * 100)}%` }} />
          </div>
          <span className="faint xsmall">
            {progress.phase === "download"
              ? progress.total ? `${kb.toLocaleString()} of ${Math.round(progress.total / 1024).toLocaleString()} KB` : kb ? `${kb.toLocaleString()} KB received` : "Connecting…"
              : progress.phase === "live" ? "A few requests for this season's results, poles and sprints" : "Almost there"}
          </span>
        </Glass>
      </div>
      <div className="arx-loading-rows">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={i ? 260 : 64} r={28} />)}
      </div>
    </div>
  );
}
export function ArchiveError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="arx-error"><StateView error={error} onRetry={onRetry} /></div>;
}

/* ───────────────────────── Faces ───────────────────────── */
/** The newest season of a driver's career that has official media (never a photo from a season they didn't race). */
export function mediaYear(archive: Archive, idx: number): string {
  const c = careers(archive)[idx];
  const id = archive.drivers[idx]?.id;
  for (const y of [...(c?.seasons || [])].reverse()) if (driverMedia(id, String(y))?.head) return String(y);
  return String(c?.seasons.at(-1) || "");
}
export function Face({ archive, idx, size = 40, year, team, className }: { archive: Archive; idx: number; size?: number; year?: string | number; team?: number; className?: string }) {
  const d = archive.drivers[idx];
  if (!d) return null;
  const y = year !== undefined && driverMedia(d.id, String(year))?.head ? String(year) : mediaYear(archive, idx);
  const teamId = team !== undefined && team >= 0 ? archive.teams[team]?.id : lastTeam(archive, idx);
  return <DriverAvatar id={d.id} name={d.name} year={y} team={teamId} size={size} className={className} />;
}
/** Constructor of a driver's most recent start. */
export function lastTeam(archive: Archive, idx: number): string | undefined {
  const last = careers(archive)[idx]?.last;
  const row = last?.results.find((r) => r.d === idx);
  return row ? archive.teams[row.c]?.id : undefined;
}
/** Big hero monogram for drivers without a portrait. */
export function Monogram({ name, tint, sub, className }: { name: string; tint: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("arx-monogram", className)} style={{ "--tint": tint } as CSSProperties} aria-hidden>
      <span className="arx-monogram-ring" />
      <span className="arx-monogram-text">{initials(name)}</span>
      {sub && <span className="arx-monogram-sub">{sub}</span>}
    </div>
  );
}
export const teamTint = (archive: Archive, idx: number | undefined) => teamColor(idx !== undefined && idx >= 0 ? archive.teams[idx]?.id : undefined);

/* ───────────────────────── Era switch ───────────────────────── */
export function EraSwitch({ value, onChange, label = "Era" }: { value: string; onChange: (id: string) => void; label?: string }) {
  return <Segmented label={label} value={value} onChange={onChange} options={ERAS.map((e) => ({ value: e.id, label: e.label }))} />;
}

/* ───────────────────────── Driver picker (combobox) ───────────────────────── */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function DriverPick({ archive, value, onChange, label, exclude, placeholder = "Search any driver since 1950" }: {
  archive: Archive; value: number | null; onChange: (idx: number | null) => void; label: string; exclude?: number | null; placeholder?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const cs = careers(archive);
  const options = useMemo(() => {
    const q = fold(query.trim());
    const list = archive.drivers
      .map((d, idx) => ({ d, idx, starts: cs[idx]?.starts || 0 }))
      .filter((x) => x.starts > 0 && x.idx !== exclude && (!q || fold(x.d.name).includes(q) || fold(x.d.family).startsWith(q) || x.d.code.toLowerCase() === q));
    return list.sort((a, b) => b.starts - a.starts).slice(0, 8);
  }, [query, archive, exclude, cs]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const pick = (idx: number) => { onChange(idx); setQuery(""); setOpen(false); };
  const current = value !== null ? archive.drivers[value] : undefined;
  return (
    <div className="arx-pick" ref={box}>
      <label className="field">
        <span>{label}</span>
        <div className="search-input">
          <Search />
          <input
            className="input"
            role="combobox"
            aria-expanded={open}
            aria-controls={id + "-list"}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${id}-${options[active].idx}` : undefined}
            placeholder={current ? current.name : placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); pick(options[active].idx); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
        </div>
      </label>
      {current && !query && (
        <button type="button" className="arx-pick-current" onClick={() => onChange(null)} aria-label={`Clear ${current.name}`}>
          <Face archive={archive} idx={value!} size={26} />
          <span>{current.name}</span>
          <X size={14} />
        </button>
      )}
      {open && options.length > 0 && (
        <motion.ul
          id={id + "-list"}
          role="listbox"
          aria-label={label}
          className="arx-pick-list glass glass-strong"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        >
          {options.map((o, i) => (
            <li
              key={o.idx}
              id={`${id}-${o.idx}`}
              role="option"
              aria-selected={i === active}
              className={cx(i === active && "active")}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => { e.preventDefault(); pick(o.idx); }}
            >
              <Face archive={archive} idx={o.idx} size={30} />
              <span><strong>{o.d.name}</strong><small>{cs[o.idx].first?.season}–{cs[o.idx].last?.season} · {o.starts} starts</small></span>
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

/* ───────────────────────── Column chart ───────────────────────── */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
/** Vertical bars on one axis with hover / keyboard tooltip. `colors` follow the entity, not the rank. */
export function Columns({ labels, values, colors, height = 240, yFormat = (v) => String(Math.round(v)), tooltip, ariaLabel, yMax, highlight }: {
  labels: string[]; values: (number | null)[]; colors: string | string[]; height?: number; yFormat?: (v: number) => string;
  tooltip?: (i: number) => ReactNode; ariaLabel: string; yMax?: number; highlight?: number | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 40, r: 8, t: 12, b: 26 };
  const w = Math.max(0, width - pad.l - pad.r), h = height - pad.t - pad.b;
  const max = yMax ?? Math.max(1, ...values.map((v) => v || 0));
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), step = [1, 2, 2.5, 5, 10].find((n) => n * mag >= raw)! * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const top = Math.max(max, ticks.at(-1) || 1);
  const slot = labels.length ? w / labels.length : 0;
  const bw = Math.max(1, Math.min(28, slot - (slot > 6 ? 2 : 0.5)));
  const y = (v: number) => pad.t + h - (v / top) * h;
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(w / 44))));
  const color = (i: number) => (Array.isArray(colors) ? colors[i] || "var(--accent)" : colors);
  const pick = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - pad.l) / (slot || 1));
    setHover(i >= 0 && i < labels.length ? i : null);
  };
  return (
    <div
      ref={ref}
      className="chart arx-columns"
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const dir = e.key === "ArrowRight" ? 1 : -1;
          setHover((v) => Math.max(0, Math.min(labels.length - 1, (v ?? (dir > 0 ? -1 : labels.length)) + dir)));
        }
        if (e.key === "Escape") setHover(null);
      }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{yFormat(t)}</text>
            </g>
          ))}
          {values.map((v, i) => {
            if (v === null || v <= 0) return null;
            const x = pad.l + i * slot + (slot - bw) / 2;
            const hh = Math.max(1.5, (v / top) * h);
            const r = Math.min(4, bw / 2);
            const dim = (hover !== null && hover !== i) || (highlight !== undefined && highlight !== null && highlight !== i);
            return (
              <path
                key={i}
                className={cx("arx-col", dim && "dim")}
                style={{ "--i": i, fill: color(i) } as CSSProperties}
                d={`M${x},${pad.t + h}V${pad.t + h - hh + r}Q${x},${pad.t + h - hh} ${x + r},${pad.t + h - hh}H${x + bw - r}Q${x + bw},${pad.t + h - hh} ${x + bw},${pad.t + h - hh + r}V${pad.t + h}Z`}
              />
            );
          })}
          {labels.map((l, i) => (i % every === 0 ? <text key={i} className="axis" x={pad.l + i * slot + slot / 2} y={height - 7} textAnchor="middle">{l}</text> : null))}
        </svg>
      )}
      {hover !== null && (
        <div className="tooltip glass glass-strong" style={{ left: Math.min(Math.max(pad.l + hover * slot + slot / 2, 100), width - 100), top: Math.max(56, y(values[hover] || 0)) }}>
          {tooltip ? tooltip(hover) : <><div className="t-title">{labels[hover]}</div><div className="t-row"><b>{values[hover] === null ? "—" : yFormat(values[hover]!)}</b></div></>}
        </div>
      )}
    </div>
  );
}

/** A compact ranked row: position, face/badge, name + bar, value. */
export function RankRow({ rank, media, name, sub, value, unit, max, tint, index = 0, to }: {
  rank: number; media: ReactNode; name: ReactNode; sub?: ReactNode; value: number; unit?: ReactNode; max: number; tint: string; index?: number; to?: string;
}) {
  const body = (
    <>
      <span className={cx("pos", rank <= 3 && "p" + rank)}>{rank}</span>
      {media}
      <span className="arx-rank-main">
        <span className="arx-rank-name"><strong>{name}</strong>{sub && <small>{sub}</small>}</span>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${max ? Math.max(1.5, (value / max) * 100) : 0}%`, "--i": index } as CSSProperties} /></span>
      </span>
      <span className="arx-rank-value"><b>{unit === "%" ? `${(value * 100).toFixed(1)}%` : value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b>{unit && unit !== "%" && <small>{unit}</small>}</span>
    </>
  );
  const style = { "--tint": tint } as CSSProperties;
  return to ? <Link className="list-row arx-rank" to={to} style={style}>{body}</Link> : <div className="list-row arx-rank" style={style}>{body}</div>;
}
