import {
  useEffect, useId, useRef, useState,
  type CSSProperties, type HTMLAttributes, type ReactNode, type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "motion/react";
import { AlertTriangle, Database, Inbox, RotateCcw } from "lucide-react";
import type { Envelope } from "../types";
import { relativeTime } from "../lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* ─────────── Page scaffolding ─────────── */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main id="main" tabIndex={-1} className={cx("page", className)}>{children}</main>;
}

export function PageHeader({ eyebrow, title, lede, actions, live }: {
  eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; actions?: ReactNode; live?: boolean;
}) {
  return (
    <header className="page-header">
      <div className="stack">
        {eyebrow && <span className="eyebrow rise"><span className={cx("dot", live && "live")} />{eyebrow}</span>}
        <h1 className="title-1 rise" style={{ "--i": 1 } as CSSProperties}>{title}</h1>
        {lede && <p className="lede rise" style={{ "--i": 2 } as CSSProperties}>{lede}</p>}
      </div>
      {actions && <div className="actions rise" style={{ "--i": 3 } as CSSProperties}>{actions}</div>}
    </header>
  );
}

export function Section({ title, subtitle, action, children, className, id }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section className={cx("section", className)} id={id}>
      {(title || action) && (
        <div className="section-head reveal">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type GlassProps = HTMLAttributes<HTMLDivElement> & { tint?: string; strong?: boolean; as?: "div" | "section" | "article" | "aside" };
export function Glass({ tint, strong, className, style, as: Tag = "div", children, ...rest }: GlassProps) {
  return (
    <Tag
      className={cx("glass", strong && "glass-strong", tint && "tinted", className)}
      style={tint ? ({ "--tint": tint, ...style } as CSSProperties) : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ─────────── Segmented control ─────────── */
export function Segmented<T extends string>({ options, value, onChange, label, size }: {
  options: readonly (T | { value: T; label: ReactNode })[]; value: T; onChange: (v: T) => void; label: string; size?: "lg";
}) {
  const id = useId();
  return (
    <div className={cx("seg", size)} role="group" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const text = typeof o === "string" ? o : o.label;
        return (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {v === value && (
              <motion.span layoutId={id} className="thumb" transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.9 }} />
            )}
            {text}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────── Toggle ─────────── */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)} />;
}

/* ─────────── Loading / error / empty ─────────── */
export function Skeleton({ h = 120, w, r, className, style }: { h?: number | string; w?: number | string; r?: number; className?: string; style?: CSSProperties }) {
  return <div className={cx("skeleton", className)} style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden />;
}

export function StateView({ loading, error, empty, onRetry, emptyTitle = "Nothing here yet", emptyText, skeleton }: {
  loading?: boolean; error?: string; empty?: boolean; onRetry?: () => void; emptyTitle?: string; emptyText?: ReactNode; skeleton?: ReactNode;
}) {
  if (loading) return <>{skeleton ?? <Skeleton h={220} r={28} />}</>;
  if (error)
    return (
      <Glass className="state" role="alert">
        <AlertTriangle />
        <h3>We couldn't reach the data source</h3>
        <p>{error}</p>
        {onRetry && <button className="btn sm" onClick={onRetry}><RotateCcw />Try again</button>}
      </Glass>
    );
  if (empty)
    return (
      <Glass className="state">
        <Inbox />
        <h3>{emptyTitle}</h3>
        {emptyText && <p>{emptyText}</p>}
      </Glass>
    );
  return null;
}

/** Data provenance footnote. Every number on the site traces back to a published source. */
export function Source({ value, label }: { value?: Envelope<unknown>; label?: string }) {
  if (!value?.meta?.fetchedAt) return null;
  const { meta } = value;
  const host = (() => { try { return new URL(meta.url).host; } catch { return meta.source; } })();
  return (
    <p className="source">
      <Database />
      <span>{label || "Source"}: <a href={meta.url} target="_blank" rel="noopener noreferrer">{host.replace("api.", "")}</a></span>
      <span>· retrieved {relativeTime(meta.fetchedAt)}</span>
      {meta.snapshot && <span className="snapshot">· {meta.status}</span>}
    </p>
  );
}

/* ─────────── Images ─────────── */
export function Img({ src, alt, className, eager, style, onError, ...rest }: {
  src?: string | null; alt: string; className?: string; eager?: boolean; style?: CSSProperties; onError?: () => void; width?: number; height?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(false);
    if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true);
  }, [src]);
  if (!src || failed) return null;
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cx("img-fade", loaded && "loaded", className)}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => { setFailed(true); onError?.(); }}
      {...rest}
    />
  );
}

/* ─────────── Animated number ─────────── */
export function Counter({ value, decimals = 0, duration = 1400, className, prefix = "", suffix = "" }: {
  value: number; decimals?: number; duration?: number; className?: string; prefix?: string; suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const format = (n: number) => prefix + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (reduce || !Number.isFinite(value)) { el.textContent = format(value); return; }
    let raf = 0, start = 0;
    const begin = from.current;
    const tick = (t: number) => {
      start ||= t;
      const p = Math.min(1, (t - start) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = format(begin + (value - begin) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { raf = requestAnimationFrame(tick); io.disconnect(); }
    });
    io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [value, decimals, duration, prefix, suffix]);
  return <span ref={ref} className={cx("num", className)}>{prefix}{(0).toFixed(decimals)}{suffix}</span>;
}

/* ─────────── 3D tilt with specular glare ─────────── */
export function useTilt<T extends HTMLElement>(max = 8) {
  const ref = useRef<T>(null);
  const handlers = {
    onPointerMove(e: ReactPointerEvent<T>) {
      if (e.pointerType !== "mouse") return;
      const el = ref.current;
      if (!el || document.documentElement.dataset.motion === "reduced") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.classList.add("active");
      el.style.setProperty("--ry", `${(x - 0.5) * max * 2}deg`);
      el.style.setProperty("--rx", `${(0.5 - y) * max * 2}deg`);
      el.style.setProperty("--glare-x", `${x * 100}%`);
      el.style.setProperty("--glare-y", `${y * 100}%`);
      el.style.setProperty("--px", `${(x - 0.5) * 2}`);
      el.style.setProperty("--py", `${(y - 0.5) * 2}`);
    },
    onPointerLeave() {
      const el = ref.current;
      if (!el) return;
      el.classList.remove("active");
      for (const p of ["--rx", "--ry", "--px", "--py"]) el.style.setProperty(p, p.startsWith("--r") ? "0deg" : "0");
    },
  };
  return { ref, ...handlers };
}

/* ─────────── Reveal-on-scroll (global observer) ─────────── */
export function useAutoReveal(dep: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    const scan = () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [dep]);
}

/* ─────────── Ambient colour ─────────── */
export function useAmbient(a?: string, b?: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (a) root.style.setProperty("--ambient-a", a);
    if (b || a) root.style.setProperty("--ambient-b", b || a!);
    return () => { root.style.removeProperty("--ambient-a"); root.style.removeProperty("--ambient-b"); };
  }, [a, b]);
}

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · F1 Pulse` : "F1 Pulse — Feel every lap."; }, [title]);
}

/** Re-render every `ms` milliseconds (countdowns, session status). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
