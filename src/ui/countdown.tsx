import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePrefs } from "../app/prefs";
import { useNow, cx } from "./core";
import "./countdown.css";

/** True when the visitor asked for less motion (site setting or OS preference). */
export function useReduced() {
  const { reducedMotion } = usePrefs();
  const os = useReducedMotion();
  return reducedMotion || !!os;
}

function Digit({ value, still }: { value: string; still: boolean }) {
  if (still) return <span className="cdx-digit"><span>{value}</span></span>;
  return (
    <span className="cdx-digit">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={value} initial={{ y: "-70%", opacity: 0, filter: "blur(4px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: "70%", opacity: 0, filter: "blur(4px)" }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export type CountdownProps = {
  /** Session start, epoch milliseconds. */
  target: number;
  /** What happens at zero — e.g. "Lights out", "Qualifying". */
  label?: string;
  /** Text shown once the target has passed. Defaults to "<label> — underway or complete". */
  doneText?: string;
  /** "hero" = white glass on photography (default); "surface" = theme tokens for cards. */
  tone?: "hero" | "surface";
  /** Show the F1 start-light sequence in the final 60 seconds (default true). */
  startLights?: boolean;
  className?: string;
  onZero?: () => void;
};

/**
 * Rolling-digit countdown. In the final minute it becomes the Formula 1 start gantry: five red
 * lights illuminate one per second over the last five seconds, then all go out at zero with a
 * brief flash. Reduced motion: digits switch without rolling and the flash is skipped.
 */
export function Countdown({ target, label = "Lights out", doneText, tone = "hero", startLights = true, className, onZero }: CountdownProps) {
  const [rate, setRate] = useState(1000);
  const now = useNow(rate);
  const still = useReduced();
  const remaining = target - now;
  const final = startLights && remaining > 0 && remaining <= 60_000;
  const [flash, setFlash] = useState(false);
  const prev = useRef(remaining);

  useEffect(() => {
    // Tick faster near zero so each light lands on its second.
    const want = remaining > 0 && remaining <= 62_000 ? 200 : 1000;
    if (want !== rate) setRate(want);
  }, [remaining, rate]);

  useEffect(() => {
    const was = prev.current;
    prev.current = remaining;
    if (was > 0 && remaining <= 0) {
      onZero?.();
      if (startLights && !still && was < 5_000) setFlash(true);
    }
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  if (!Number.isFinite(target)) return null;

  if (remaining <= 0)
    return (
      <div className={cx("cdx", `cdx-${tone}`, "done", flash && "flash", className)}>
        {flash && <span className="cdx-flash" aria-hidden />}
        {flash ? (
          <Gantry lit={0} out still={still} />
        ) : (
          <span className="chip accent cdx-done"><span className="live-dot" />{doneText || `${label} — underway or complete`}</span>
        )}
        {flash && <span className="sr-only" role="status">{label}</span>}
      </div>
    );

  if (final) {
    const secs = Math.ceil(remaining / 1000);
    // Light k (1–5) comes on at T−(6−k) seconds: T−5 … T−1.
    const lit = Math.max(0, Math.min(5, 6 - secs));
    return (
      <div className={cx("cdx", `cdx-${tone}`, "final", className)} role="timer" aria-label={`${label} in ${secs} seconds${lit ? `, ${lit} of 5 start lights on` : ""}`}>
        <Gantry lit={lit} still={still} />
        <div className="cdx-final-read" aria-hidden>
          <span className="cdx-final-label">{label}</span>
          <span className="cdx-final-secs">{secs <= 5 ? "" : "0:"}{secs <= 5 ? secs : pad(secs)}</span>
        </div>
      </div>
    );
  }

  const ms = Math.max(0, remaining);
  const parts = { days: Math.floor(ms / 864e5), hours: Math.floor(ms / 36e5) % 24, minutes: Math.floor(ms / 6e4) % 60, seconds: Math.floor(ms / 1e3) % 60 };
  const units: [number, string][] = [[parts.days, "days"], [parts.hours, "hrs"], [parts.minutes, "min"], [parts.seconds, "sec"]];
  return (
    <div className={cx("cdx", `cdx-${tone}`, className)} role="timer" aria-label={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until ${label.toLowerCase()}`}>
      {units.map(([v, unit]) => (
        <div className="cdx-unit" key={unit}>
          <span className="cdx-value" aria-hidden>{pad(v).split("").map((d, i) => <Digit key={i} value={d} still={still} />)}</span>
          <span className="cdx-label">{unit}</span>
        </div>
      ))}
    </div>
  );
}

/** The five-column start gantry; each column carries a pair of lamps like the real rig. */
function Gantry({ lit, out, still }: { lit: number; out?: boolean; still: boolean }) {
  return (
    <div className={cx("cdx-gantry", out && "out", still && "still")} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cx("cdx-pod", !out && i < lit && "on")} style={{ "--i": i } as CSSProperties}>
          <i /><i />
        </span>
      ))}
    </div>
  );
}
