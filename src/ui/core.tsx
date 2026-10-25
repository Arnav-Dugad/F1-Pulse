import {
  startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type HTMLAttributes, type ReactNode, type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, useSpring, useTransform, useVelocity } from "motion/react";
import { Database, Link2, RotateCcw, Share } from "lucide-react";
import type { Envelope } from "../types";
import { relativeTime } from "../lib/format";
import { Odometer } from "./odometer";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/** True when the visitor (OS setting or the in-app toggle) asked for reduced motion. */
export const prefersReducedMotion = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* ─────────── Page scaffolding ─────────── */
let firstPage = true;
let sectionSeq = 0;
const EAGER_SECTIONS = 2;
/**
 * Every route renders one Page. After an in-app navigation, keyboard focus would otherwise stay on
 * the link that was just removed, so the new page's <main> takes focus (screen readers announce it
 * and the next Tab starts inside the content). The first load keeps the browser's default so the
 * skip link stays the first Tab stop.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  sectionSeq = 0; // the first sections of each page render eagerly (see Section)
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (firstPage) { firstPage = false; return; }
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected && !ref.current?.contains(active) && !active.closest("main")) return;
    ref.current?.focus({ preventScroll: true });
  }, []);
  return <main ref={ref} id="main" tabIndex={-1} className={cx("page", className)}>{children}</main>;
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

/**
 * The first sections of a page render with it; the rest render right after
 * first paint inside a transition, which React time-slices — so long pages no longer block the main
 * thread for a second while every chart and table mounts at once. Everything is in the DOM moments
 * later (find-in-page and screen readers see the full page).
 */
export function Section({ title, subtitle, action, children, className, id }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  // Mount order, not measurement: reading layout in every section's effect forced a layout per commit.
  const [shown, setShown] = useState(() => sectionSeq++ < EAGER_SECTIONS);
  useEffect(() => { if (!shown) startTransition(() => setShown(true)); }, [shown]);
  return (
    <section className={cx("section", className, !shown && "section-pending")} id={id}>
      {(title || action) && (
        <div className="section-head reveal">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {shown ? children : <div className="section-placeholder" aria-hidden />}
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
const thumbSpring = { stiffness: 520, damping: 40, mass: 0.9 };
/**
 * Liquid segmented control: a single glass thumb springs between options and stretches along its
 * direction of travel (squashing slightly vertically) in proportion to its velocity.
 */
export function Segmented<T extends string>({ options, value, onChange, label, size }: {
  options: readonly (T | { value: T; label: ReactNode })[]; value: T; onChange: (v: T) => void; label: string; size?: "lg";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [ready, setReady] = useState(false);
  const x = useSpring(0, thumbSpring);
  const w = useSpring(0, thumbSpring);
  const vx = useVelocity(x);
  const scaleX = useTransform(vx, (v) => 1 + Math.min(Math.abs(v) / 2400, 0.3));
  const scaleY = useTransform(vx, (v) => 1 - Math.min(Math.abs(v) / 5000, 0.16));
  const keys = options.map((o) => (typeof o === "string" ? o : o.value)).join("|");

  const measure = useCallback((instant: boolean) => {
    const btn = wrap.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!btn) return false;
    const left = btn.offsetLeft, width = btn.offsetWidth;
    if (instant || !placed.current || prefersReducedMotion()) { x.jump(left); w.jump(width); }
    else { x.set(left); w.set(width); }
    placed.current = true;
    return true;
  }, [x, w]);

  useLayoutEffect(() => {
    setReady(measure(false));
  }, [value, keys, measure]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let first = true;
    // Re-place without animation when fonts load or the control resizes.
    const ro = new ResizeObserver(() => { if (first) { first = false; return; } measure(true); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrap} className={cx("seg", size)} role="group" aria-label={label}>
      <motion.span className="thumb" aria-hidden style={{ x, width: w, scaleX, scaleY, opacity: ready ? 1 : 0 }} />
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const text = typeof o === "string" ? o : o.label;
        return (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
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

/* A generic, invented circuit silhouette for illustrations — not any real track. */
const ART_TRACK = "M34 80C34 62 46 54 64 54H118C131 54 136 46 132 37C128 28 135 19 148 19H164C181 19 189 32 183 47L172 74C166 88 153 95 137 95H54C41 95 34 90 34 80Z";

/** Animated track-outline illustration used by empty and error states. */
export function StateArt({ variant = "empty", className }: { variant?: "empty" | "error"; className?: string }) {
  const [still] = useState(prefersReducedMotion);
  return (
    <svg className={cx("state-art", variant, className)} viewBox="0 0 220 116" aria-hidden>
      <path className="sa-shadow" d={ART_TRACK} />
      <path className="sa-track" d={ART_TRACK} pathLength={1} />
      <path className="sa-kerb" d={ART_TRACK} pathLength={1} />
      <g className="sa-start" transform="translate(88 49)">
        <rect width="3" height="3" /><rect x="3" y="3" width="3" height="3" /><rect y="6" width="3" height="3" /><rect x="3" y="9" width="3" height="3" />
      </g>
      {variant === "error" ? (
        <g className="sa-flag" transform="translate(150 50)">
          <path className="sa-pole" d="M0 0V34" />
          <path className="sa-cloth" d="M1 1C7 -2 12 4 19 1V14C12 17 7 11 1 14Z" />
        </g>
      ) : (
        !still && (
          <circle className="sa-car" r="3.6">
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto" path={ART_TRACK} begin="1.4s" />
          </circle>
        )
      )}
    </svg>
  );
}

/**
 * Loading / error / empty switch. Backwards compatible: the original props still work; `action`
 * adds a slot (e.g. a link) under the copy, `errorTitle` overrides the error headline and `compact`
 * renders a shorter card for tight spaces.
 */
export function StateView({ loading, error, empty, onRetry, emptyTitle = "Nothing here yet", emptyText, skeleton, action, errorTitle, compact, illustration = true }: {
  loading?: boolean; error?: string; empty?: boolean; onRetry?: () => void; emptyTitle?: string; emptyText?: ReactNode; skeleton?: ReactNode;
  action?: ReactNode; errorTitle?: string; compact?: boolean; illustration?: boolean;
}) {
  if (loading) return <>{skeleton ?? <Skeleton h={220} r={28} />}</>;
  if (error)
    return (
      <Glass className={cx("state state-error", compact && "compact")} role="alert">
        {illustration && <StateArt variant="error" />}
        <span className="state-kicker">Red flag</span>
        <h3>{errorTitle || "We couldn't reach the data source"}</h3>
        <p>{error}</p>
        <p className="state-hint">Timing feeds occasionally take an unscheduled pit stop. Nothing is lost — try again in a moment.</p>
        {(onRetry || action) && (
          <div className="state-actions">
            {onRetry && <button className="btn sm primary" onClick={onRetry}><RotateCcw />Try again</button>}
            {action}
          </div>
        )}
      </Glass>
    );
  if (empty)
    return (
      <Glass className={cx("state state-empty", compact && "compact")}>
        {illustration && <StateArt />}
        <h3>{emptyTitle}</h3>
        {emptyText && <p>{emptyText}</p>}
        {action && <div className="state-actions">{action}</div>}
      </Glass>
    );
  return null;
}

/* ─────────── Copy / share with a check-morph confirmation ─────────── */
/** `[on, fire]` — `on` flips true for `ms` after each `fire()`; handy for "Copied" confirmations. */
export function useFlash(ms = 1800) {
  const [on, set] = useState(false);
  const timer = useRef(0);
  const fire = useCallback(() => {
    set(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(false), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [on, fire] as const;
}

/** An icon that morphs into a drawn check mark while `done` is true. */
export function CheckMorph({ done, children, size = 16 }: { done: boolean; children: ReactNode; size?: number }) {
  return (
    <span className={cx("check-morph", done && "done")} style={{ "--s": size + "px" } as CSSProperties} aria-hidden>
      <span className="cm-icon">{children}</span>
      <svg className="cm-check" viewBox="0 0 24 24"><path d="M5 12.5l4.4 4.4L19 7.2" pathLength={1} /></svg>
    </span>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.("copy") ?? false;
    area.remove();
    return ok;
  }
}

/**
 * Copy (or natively share, when `share` is set and supported) a link, confirming with a check morph.
 * Defaults to the current page URL.
 */
export function CopyButton({ text, label = "Copy link", doneLabel = "Copied", share, title, className, icon }: {
  text?: string; label?: string; doneLabel?: string; share?: boolean; title?: string; className?: string; icon?: ReactNode;
}) {
  const [done, flash] = useFlash();
  const run = async () => {
    const value = text ?? location.href;
    if (share && typeof navigator.share === "function") {
      try { await navigator.share({ title: title || document.title, url: value }); flash(); } catch { /* dismissed */ }
      return;
    }
    if (await copyText(value)) flash();
  };
  return (
    <button type="button" className={cx("btn sm glass-btn copy-btn", done && "done", className)} onClick={run} aria-live="polite">
      <CheckMorph done={done}>{icon ?? (share ? <Share /> : <Link2 />)}</CheckMorph>
      <span>{done ? doneLabel : label}</span>
    </button>
  );
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
// Generated by `npm run media:images` (scripts/images.py): which AVIF / 800 w siblings exist, intrinsic
// size and a blur-up LQIP, so the browser is only offered files that exist.
import imageVariantsFile from "../data/image-variants.json";
type ImageVariant = { w?: number; h?: number; avif?: number; sizes?: number[]; lqip?: string };
const imageVariants = imageVariantsFile as Record<string, ImageVariant>;
const sibling = (src: string, width: number | null, ext?: string) =>
  src.replace(/(\.[a-z0-9]+)$/i, (m) => (width ? `-${width}` : "") + (ext || m));

/**
 * Lazy, fading image. Local photos with generated variants render as `<picture>` (AVIF first, and
 * `srcset` 800 w / full for heroes and gallery shots) with a blurred LQIP placeholder; the
 * `<picture>` uses `display: contents`, so layout is as for a bare img (only `parent > img` selectors change).
 * `eager` images are fetched with high priority (use it for the LCP hero only).
 */
export function Img({ src, alt, className, eager, style, onError, sizes, ...rest }: {
  src?: string | null; alt: string; className?: string; eager?: boolean; style?: CSSProperties; onError?: () => void; width?: number; height?: number;
  /** `sizes` for responsive variants (default: 100vw when eager, half the viewport on wide screens otherwise). */
  sizes?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(false);
    if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true);
  }, [src]);
  if (!src || failed) return null;
  const v: ImageVariant | undefined = imageVariants[src];
  const widths = v?.w && v.sizes?.length ? v.sizes.filter((w) => w < v.w!) : [];
  const set = (ext?: string) => [...widths.map((w) => `${sibling(src, w, ext)} ${w}w`), `${ext ? sibling(src, null, ext) : src} ${v!.w}w`].join(", ");
  const responsive = widths.length > 0;
  const sizesAttr = responsive ? sizes || (eager ? "100vw" : "(max-width: 640px) 100vw, 50vw") : undefined;
  const placeholder = v?.lqip && !loaded ? v.lqip : undefined;
  const img = (
    <img
      ref={ref}
      src={src}
      srcSet={responsive ? set() : undefined}
      sizes={sizesAttr}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      draggable={false}
      // With an LQIP the blurred preview shows immediately instead of fading in from transparent.
      className={cx(v?.lqip ? "img-lqip" : "img-fade", loaded && "loaded", className)}
      style={placeholder ? { backgroundImage: `url("${placeholder}")`, backgroundSize: "cover", backgroundPosition: style?.objectPosition || "center", ...style } : style}
      onLoad={() => setLoaded(true)}
      onError={() => { setFailed(true); onError?.(); }}
      {...rest}
    />
  );
  if (!v?.avif) return img;
  return (
    <picture style={{ display: "contents" }}>
      <source type="image/avif" srcSet={responsive ? set(".avif") : sibling(src, null, ".avif")} sizes={sizesAttr} />
      {img}
    </picture>
  );
}

/* ─────────── Animated number ─────────── */
/** KPI number that rolls odometer-style into view and whenever its value changes. */
export function Counter({ value, decimals = 0, duration = 1400, className, prefix = "", suffix = "" }: {
  value: number; decimals?: number; duration?: number; className?: string; prefix?: string; suffix?: string;
}) {
  return <Odometer value={value} decimals={decimals} duration={duration} prefix={prefix} suffix={suffix} className={cx("num", className)} />;
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
/**
 * Page-load choreography. Every batch of `.reveal` elements entering the viewport together is
 * staggered in document order (hero `.rise` copy → stats → cards). On page load the batch waits a
 * beat for the hero; nothing is ever held back more than ~600 ms. Once revealed, `.settled` hands
 * transitions back to the element's own hover/tilt styles.
 */
export function useAutoReveal(dep: unknown) {
  useEffect(() => {
    const start = performance.now();
    const timers = new Map<number, HTMLElement>();
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        if (!shown.length) return;
        shown.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        const opening = performance.now() - start < 450;
        const base = opening ? 180 : 0;
        const cap = opening ? 600 : 360;
        const step = Math.max(22, Math.min(64, (cap - base) / shown.length));
        shown.forEach((el, i) => {
          const delay = Math.round(Math.min(cap, base + i * step));
          el.style.setProperty("--reveal-delay", delay + "ms");
          el.classList.add("in");
          io.unobserve(el);
          const t = window.setTimeout(() => { el.classList.add("settled"); timers.delete(t); }, delay + 1100);
          timers.set(t, el);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    let queued = 0;
    const scan = () => { queued = 0; document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el)); };
    scan();
    const mo = new MutationObserver(() => { queued ||= requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); cancelAnimationFrame(queued); timers.forEach((el, t) => { clearTimeout(t); el.classList.add("settled"); }); };
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
