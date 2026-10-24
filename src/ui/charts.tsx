import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "./core";

export type Series = { id: string; name: string; color: string; values: (number | null)[]; dashed?: boolean };

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

/** Monotone cubic interpolation (Fritsch–Carlson) — smooth without overshooting data. */
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : "";
  const n = points.length, dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    m[i] = (points[i + 1][1] - points[i][1]) / (dx[i] || 1);
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3;
    d += `C${x0 + h},${y0 + h * t[i]} ${x1 - h},${y1 - h * t[i + 1]} ${x1},${y1}`;
  }
  return d;
}

/** Split a series into continuous segments (null = missing entry). */
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  const out: [number, number][][] = [];
  let current: [number, number][] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (current.length) out.push(current);
      current = [];
    } else current.push([x(i), y(v)]);
  });
  if (current.length) out.push(current);
  return out;
}

export function LineChart({
  series, labels, height = 320, invert, yMin, yMax, yFormat = (v) => String(Math.round(v)), tooltipTitle,
  area, curve = true, focus, onFocus, className, ariaLabel, step,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  invert?: boolean;
  yMin?: number;
  yMax?: number;
  yFormat?: (v: number) => string;
  tooltipTitle?: (i: number) => ReactNode;
  area?: boolean;
  curve?: boolean;
  focus?: string | null;
  onFocus?: (id: string | null) => void;
  className?: string;
  ariaLabel: string;
  step?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const pad = { l: 44, r: 16, t: 14, b: 30 };
  const w = Math.max(0, width - pad.l - pad.r), h = height - pad.t - pad.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  const lo = yMin ?? Math.min(0, ...all), hi = yMax ?? Math.max(1, ...all);
  const span = hi - lo || 1;
  const x = (i: number) => pad.l + (labels.length <= 1 ? w / 2 : (i * w) / (labels.length - 1));
  const y = (v: number) => pad.t + (invert ? ((v - lo) / span) * h : h - ((v - lo) / span) * h);
  const ticks = useMemo(() => {
    if (step) {
      const list: number[] = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) list.push(v);
      return list;
    }
    const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), nice = [1, 2, 2.5, 5, 10].find((n) => n * mag >= raw)! * mag;
    const list: number[] = [];
    for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) list.push(Math.round(v * 1000) / 1000);
    return list;
  }, [lo, hi, span, step]);
  const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(w / 46))));
  const pick = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const rel = clientX - rect.left - pad.l;
    const i = Math.round((rel / (w || 1)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };
  const drawKey = series.map((s) => s.id).join("|") + labels.length;
  const visible = hover !== null ? series.filter((s) => s.values[hover] !== null && s.values[hover] !== undefined) : [];
  const sorted = [...visible].sort((a, b) => (invert ? 1 : -1) * ((a.values[hover!] as number) - (b.values[hover!] as number)));
  return (
    <div
      ref={ref}
      className={cx("chart", className)}
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => { setHover(null); setHot(null); }}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          setHover((v) => Math.max(0, Math.min(labels.length - 1, (v ?? (e.key === "ArrowRight" ? -1 : labels.length)) + (e.key === "ArrowRight" ? 1 : -1))));
        }
        if (e.key === "Escape") setHover(null);
      }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.id} id={`fill-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.55" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.l - 10} y={y(t) + 4} textAnchor="end">{yFormat(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => (i % labelEvery === 0 && (i === labels.length - 1 || labels.length - 1 - i >= labelEvery * 0.75)) || i === labels.length - 1 ? (
            <text key={i} className="axis" x={x(i)} y={height - 8} textAnchor="middle">{l}</text>
          ) : null)}
          {series.map((s) => {
            const segs = segments(s.values, x, y);
            const dim = focus && focus !== s.id;
            const lifted = (focus || hot) === s.id;
            return (
              <g
                key={s.id + drawKey}
                className={cx("series-group", lifted && "lifted")}
                style={{ color: s.color } as CSSProperties}
                onPointerEnter={() => { setHot(s.id); onFocus?.(s.id); }}
                onPointerLeave={() => { setHot((h) => (h === s.id ? null : h)); onFocus?.(null); }}
              >
                {area && segs.map((seg, k) => (
                  <path key={"a" + k} className="area" fill={`url(#fill-${s.id})`} d={(curve ? smoothPath(seg) : "M" + seg.join("L")) + `L${seg.at(-1)![0]},${pad.t + h}L${seg[0][0]},${pad.t + h}Z`} style={{ opacity: dim ? 0.04 : undefined }} />
                ))}
                {segs.map((seg, k) => (
                  <path
                    key={k}
                    className={cx("series", s.dashed ? "dashed" : "draw", dim && "dim")}
                    pathLength={1}
                    d={curve ? smoothPath(seg) : "M" + seg.join("L")}
                    stroke={s.color}
                    style={{ strokeWidth: focus === s.id ? 3.4 : undefined }}
                  />
                ))}
                {segs.map((seg, k) => seg.length > 1 ? (
                  <path key={"h" + k} className="series-hit" d={curve ? smoothPath(seg) : "M" + seg.join("L")} />
                ) : null)}
                {segs.map((seg, k) => seg.length === 1 ? <circle key={"p" + k} cx={seg[0][0]} cy={seg[0][1]} r={3} fill={s.color} /> : null)}
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line className="cursor" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />
              {visible.map((s) => <circle key={s.id} className="dot" cx={x(hover)} cy={y(s.values[hover] as number)} r={4.5} fill={s.color} />)}
            </g>
          )}
        </svg>
      )}
      {hover !== null && visible.length > 0 && (
        <div className="tooltip glass glass-strong" style={{ left: Math.min(Math.max(x(hover), 100), width - 100), top: Math.max(60, Math.min(...visible.map((s) => y(s.values[hover] as number)))) }}>
          <div className="t-title">{tooltipTitle ? tooltipTitle(hover) : labels[hover]}</div>
          {sorted.slice(0, 8).map((s) => (
            <div className="t-row" key={s.id}>
              <span><i className="swatch" style={{ "--c": s.color } as CSSProperties} />{s.name}</span>
              <b>{yFormat(s.values[hover] as number)}</b>
            </div>
          ))}
          {sorted.length > 8 && <div className="t-row faint">+{sorted.length - 8} more</div>}
        </div>
      )}
    </div>
  );
}

/** Interactive legend that toggles and highlights series. */
export function Legend({ series, hidden, onToggle, onFocus }: {
  series: Pick<Series, "id" | "name" | "color">[]; hidden?: Set<string>; onToggle?: (id: string) => void; onFocus?: (id: string | null) => void;
}) {
  return (
    <div className="legend">
      {series.map((s) => onToggle ? (
        <button key={s.id} className={cx(hidden?.has(s.id) && "off")} onClick={() => onToggle(s.id)} onPointerEnter={() => onFocus?.(s.id)} onPointerLeave={() => onFocus?.(null)} aria-pressed={!hidden?.has(s.id)}>
          <i className="swatch" style={{ "--c": s.color } as CSSProperties} />{s.name}
        </button>
      ) : (
        <span key={s.id}><i className="swatch" style={{ "--c": s.color } as CSSProperties} />{s.name}</span>
      ))}
    </div>
  );
}

/** Progress ring — e.g. season completion. */
export function Ring({ value, size = 120, stroke = 10, color = "var(--accent)", children, label }: {
  value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(t);
  }, [value]);
  return (
    <div className="ring" style={{ width: size, height: size, position: "relative" }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown)}
          style={{ transition: "stroke-dashoffset 1.8s var(--ease)", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--accent)", width = 120, height = 36, invert }: {
  values: (number | null)[]; color?: string; width?: number; height?: number; invert?: boolean;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const pts = segments(values, (i) => (i * width) / (values.length - 1), (v) => (invert ? ((v - lo) / span) * (height - 4) + 2 : height - 2 - ((v - lo) / span) * (height - 4)));
  return (
    <svg width={width} height={height} aria-hidden style={{ overflow: "visible" }}>
      {pts.map((seg, i) => <path key={i} d={smoothPath(seg)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />)}
    </svg>
  );
}

/** Horizontal bar with value label. */
export function Bar({ value, max, color, index = 0 }: { value: number; max: number; color?: string; index?: number }) {
  return (
    <div className="bar-track" style={{ "--tint": color } as CSSProperties}>
      <div className="bar-fill" style={{ width: `${max ? Math.max(0, (value / max) * 100) : 0}%`, "--i": index } as CSSProperties} />
    </div>
  );
}
