import { useEffect, useRef, useState, type CSSProperties } from "react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const prefersReduced = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export type OdometerProps = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Roll duration in ms. */
  duration?: number;
  className?: string;
  /** Custom formatter; defaults to locale grouping with `decimals` fraction digits. */
  format?: (n: number) => string;
  /** Start every digit at 0 and roll in the first time the number scrolls into view (default true). */
  rollIn?: boolean;
};

/**
 * Rolling-digit number. Each digit is a vertical strip of 0–9 that springs to its new place
 * whenever the value changes — like a mechanical odometer. Non-digit characters (separators,
 * signs, units) render as static glyphs. The accessible text is the plain formatted value.
 */
export function Odometer({ value, decimals = 0, prefix = "", suffix = "", duration = 1400, className, format, rollIn = true }: OdometerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(!rollIn);
  const text = Number.isFinite(value)
    ? format
      ? format(value)
      : value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "—";

  useEffect(() => {
    if (armed) return;
    const el = ref.current;
    if (!el || prefersReduced() || typeof IntersectionObserver === "undefined") { setArmed(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        // Let the zeroed strips paint once so the roll-in is visible.
        requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const chars = [...text];
  const digitCount = chars.filter((c) => c >= "0" && c <= "9").length;
  let seen = 0;
  return (
    <span ref={ref} className={["odometer", className].filter(Boolean).join(" ")} style={{ "--odo-dur": `${duration}ms` } as CSSProperties}>
      <span className="sr-only">{prefix}{text}{suffix}</span>
      <span className="odo-track" aria-hidden>
        {prefix && <span className="odo-static">{prefix}</span>}
        {chars.map((c, i) => {
          // Key digits by their place from the right so existing places keep their element (and roll)
          // when the number grows or shrinks a digit.
          const place = chars.length - i;
          if (c < "0" || c > "9") return <span key={"s" + place + c} className="odo-static">{c}</span>;
          const order = seen++;
          const d = armed ? Number(c) : 0;
          return (
            <span key={"d" + place} className="odo-digit" style={{ "--d": d, "--odo-delay": `${(digitCount - order - 1) * 45}ms` } as CSSProperties}>
              <span className="odo-ghost">0</span>
              <span className="odo-strip">
                {DIGITS.map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          );
        })}
        {suffix && <span className="odo-static">{suffix}</span>}
      </span>
    </span>
  );
}
