import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useData } from "../api";
import { cx, prefersReducedMotion } from "./core";

/* The same invented loop as the empty-state art: a brand mark, not a real circuit. */
const LOOP = "M10 32C10 25 15 22 22 22H44C49 22 51 19 49 15C48 12 50 8 55 8H61C67 8 70 13 68 19L64 29C62 34 57 37 51 37H19C14 37 10 35 10 32Z";
const THRESHOLD = 76;
const MAX_PULL = 130;

/** Remove cached API responses saved in sessionStorage by the request layer (keys start with /api/). */
function clearSessionCache() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("/api/")) sessionStorage.removeItem(key);
    }
  } catch { /* storage unavailable */ }
}

/**
 * Pull-to-refresh for touch devices at the top of the page. A branded track outline draws itself
 * as you pull; on release past the threshold a car laps it while the data reloads. Refreshing
 * clears the API caches (memory, via useData's reload, and sessionStorage) and calls `onRefresh`,
 * which re-mounts the current page. `window.dispatchEvent(new Event("pulse:refresh"))` triggers
 * the same soft reload from anywhere.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
  // useData's reload() clears the request layer's in-memory cache; this tiny loader exists for that.
  const flush = useData(async () => ({ data: null, meta: { source: "local", url: "", fetchedAt: new Date().toISOString(), status: "ok" } }), []);
  const flushRef = useRef(flush.reload);
  flushRef.current = flush.reload;
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "refreshing" | "done">("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const run = () => {
      if (phaseRef.current === "refreshing") return;
      setPhase("refreshing");
      setPull(THRESHOLD);
      clearSessionCache();
      flushRef.current();
      navigator.vibrate?.(8);
      const started = performance.now();
      // Let the page re-mount after the lap animation has had a moment.
      window.setTimeout(() => {
        refreshRef.current();
        window.setTimeout(() => {
          setPhase("done");
          window.setTimeout(() => { setPhase("idle"); setPull(0); }, 650);
        }, Math.max(0, 900 - (performance.now() - started)));
      }, 260);
    };
    window.addEventListener("pulse:refresh", run);
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) return () => window.removeEventListener("pulse:refresh", run);

    let startY = 0, startX = 0, tracking = false, active = false, current = 0;
    const blocked = (t: EventTarget | null) =>
      !!(t as Element | null)?.closest?.(".sheet, .dialog, .backdrop, .live-pill, .snav, input, textarea, select, [data-no-pull], [data-swipe-ignore]") ||
      document.body.style.overflow === "hidden";
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || scrollY > 0 || phaseRef.current === "refreshing" || blocked(e.target)) { tracking = false; return; }
      tracking = true; active = false; current = 0;
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
      if (!active) {
        if (dy < 8) { if (dy < -4 || Math.abs(dx) > 12) tracking = false; return; }
        if (Math.abs(dx) > dy || scrollY > 0) { tracking = false; return; }
        active = true;
        setPhase("pulling");
      }
      // Resistance grows as you pull.
      current = Math.min(MAX_PULL, dy * 0.55 - Math.max(0, dy * 0.55 - THRESHOLD) * 0.45);
      setPull(Math.max(0, current));
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!active) return;
      if (current >= THRESHOLD) run();
      else { setPhase("idle"); setPull(0); }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("pulse:refresh", run);
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(1, pull / THRESHOLD);
  const still = prefersReducedMotion();
  return (
    <div
      className={cx("ptr", phase !== "idle" && "show", phase, progress >= 1 && "armed")}
      style={{ "--pull": `${pull}px`, "--p": progress.toFixed(3) } as CSSProperties}
      role="status"
      aria-live="polite"
    >
      <span className="ptr-badge glass glass-strong">
        <svg viewBox="0 0 78 45" aria-hidden>
          <path className="ptr-base" d={LOOP} />
          <path className="ptr-draw" d={LOOP} pathLength={1} style={{ strokeDashoffset: phase === "pulling" ? 1 - progress : 0 }} />
          {phase === "refreshing" && !still && (
            <circle className="ptr-car" r="3.2">
              <animateMotion dur="1.1s" repeatCount="indefinite" rotate="auto" path={LOOP} />
            </circle>
          )}
          {phase === "done" && <path className="ptr-check" d="M30 23l6 6 12-12" pathLength={1} />}
        </svg>
      </span>
      <span className="sr-only">{phase === "refreshing" ? "Refreshing data" : phase === "done" ? "Data refreshed" : ""}</span>
    </div>
  );
}
