/* Small helpers shared by the championship pages (Standings, Scenarios). */
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { pts } from "../lib/format";
import { cx } from "../ui/core";
import type { Envelope } from "../types";
import "./_champ.css";

export const reducedMotionNow = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** An envelope with no provenance — used when a request is intentionally skipped. */
export function emptyEnvelope<T>(data: T): Envelope<T> {
  return { data, meta: { source: "", url: "", fetchedAt: "", status: "" } };
}

/** A number that tweens from whatever it currently shows to the new value. */
export function Tween({ value, duration = 0.6, format = pts, className }: {
  value: number; duration?: number; format?: (n: number) => string; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (reducedMotionNow() || from === value || duration <= 0) {
      shown.current = value;
      el.textContent = format(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { shown.current = v; el.textContent = format(Math.round(v)); },
      onComplete: () => { shown.current = value; el.textContent = format(value); },
    });
    return () => controls.stop();
  }, [value, duration, format]);
  return <span ref={ref} className={cx("num", className)}>{format(value)}</span>;
}

/** Up / down / level indicator for a change in championship position. */
export function RankDelta({ value, title }: { value: number | null | undefined; title?: string }) {
  if (value === null || value === undefined)
    return <span className="rank-delta none" title={title || "No earlier round to compare"}>—</span>;
  if (value === 0)
    return <span className="rank-delta level" title={title || "No change"} aria-label="No change"><Minus size={12} /></span>;
  const up = value > 0;
  return (
    <span className={cx("rank-delta", up ? "up" : "down")} title={title} aria-label={`${up ? "Up" : "Down"} ${Math.abs(value)} place${Math.abs(value) === 1 ? "" : "s"}`}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(value)}
    </span>
  );
}
