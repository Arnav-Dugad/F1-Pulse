import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { races, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { countdown, formatSession, timezoneLabel } from "../lib/format";
import { weekendSessions } from "../domain.mjs";
import { Flag } from "./media";
import { ReminderNote, ReminderToggle, syncReminders, useReminderScheduler } from "./reminders";
import { cx, useMedia, useNow } from "./core";
import type { Race } from "../types";

/**
 * Typical session lengths, used only to decide when a session counts as "live" from its published
 * start time. They are estimates, not timing data — the pill says "Live" for that window.
 */
const LENGTH_MIN: Record<string, number> = {
  "Practice 1": 60, "Practice 2": 60, "Practice 3": 60, "Sprint qualifying": 45, Sprint: 60, Qualifying: 60, "Grand Prix": 120,
};
/** Show the countdown from this long before the first session of a weekend. */
const WINDOW_MS = 10 * 864e5;
const DISMISS_KEY = "pulse-live-pill-dismissed";

type Slot = { label: string; date: string; time?: string; start: number; end: number };

function weekend(race: Race): Slot[] {
  return weekendSessions(race).map((s) => {
    const start = Date.parse(s.date + "T" + (s.time || "12:00:00Z"));
    return { ...s, start, end: start + (LENGTH_MIN[s.label] ?? 60) * 60000 };
  });
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function shortCountdown(ms: number, now: number) {
  const c = countdown(now + ms, now);
  if (c.days >= 1) return `${c.days}d ${pad(c.hours)}h ${pad(c.minutes)}m`;
  if (c.hours >= 1) return `${c.hours}h ${pad(c.minutes)}m ${pad(c.seconds)}s`;
  return `${pad(c.minutes)}:${pad(c.seconds)}`;
}

/**
 * Dynamic-Island style capsule with the next session countdown (or "Live · Qualifying" during a
 * session's published window). Hover / tap morphs it into the weekend schedule. Hidden on that
 * event's race page and after being dismissed (until the next session).
 */
export function LivePill({ route }: { route: Route }) {
  const { timezone, season } = usePrefs();
  const res = useData(() => races("current"), []);
  const now = useNow(1000);
  const phone = useMedia("(max-width: 1023px)");
  const hoverable = useMedia("(hover: hover) and (pointer: fine)");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) || ""; } catch { return ""; } });
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef(0);
  const hoverOpenedAt = useRef(0);
  const [reminderMsg, setReminderMsg] = useState("");
  // The pill is mounted on every page, so it hosts the single reminder scheduler for this tab.
  useReminderScheduler();
  useEffect(() => { if (res.value?.data.length) syncReminders(res.value.data); }, [res.value]);
  useEffect(() => { if (!open) setReminderMsg(""); }, [open]);

  const state = useMemo(() => {
    const list = res.value?.data || [];
    for (const race of list) {
      const slots = weekend(race);
      if (!slots.length) continue;
      const last = slots[slots.length - 1];
      if (last.end < now) continue;
      const live = slots.find((s) => s.time && s.start <= now && now < s.end);
      const next = slots.find((s) => s.start > now);
      if (!live && slots[0].start - now > WINDOW_MS) return null;
      return { race, slots, live, next };
    }
    return null;
  }, [res.value, now]);

  useEffect(() => setOpen(false), [route.path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  if (!state) return null;
  const { race, slots, live, next } = state;
  const focus = live || next;
  if (!focus) return null;
  const key = `${race.season}-${race.round}-${focus.label}`;
  const onRacePage = route.parts[0] === "race" && route.parts[1] === race.round && (season === "current" || season === race.season);
  if (onRacePage || dismissed === key) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, key); } catch { /* private mode */ }
    setDismissed(key);
  };
  const place = race.Circuit.Location.country;
  const name = race.raceName.replace(/ Grand Prix$/, " GP");
  const hoverProps = hoverable
    ? {
        onPointerEnter: () => { clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => { hoverOpenedAt.current = Date.now(); setOpen(true); }, 120); },
        onPointerLeave: () => { clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setOpen(false), 260); },
      }
    : {};

  return (
    <div className={cx("live-pill-wrap", phone ? "phone" : "desk")} ref={ref}>
      <motion.div
        layout
        className={cx("live-pill glass glass-strong", open && "open", live && "is-live")}
        style={{ borderRadius: open ? 30 : 999 } as CSSProperties}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
        initial={{ opacity: 0, y: phone ? 16 : -12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        {...hoverProps}
      >
        <motion.button
          layout="position"
          type="button"
          className="lp-summary"
          aria-expanded={open}
          aria-controls="live-pill-panel"
          aria-label={live ? `Live now: ${race.raceName} ${live.label}. Show weekend schedule` : `${race.raceName} ${focus.label} starts in ${shortCountdown(focus.start - now, now)}. Show weekend schedule`}
          // A click right after hover opened the panel shouldn't immediately close it again.
          onClick={() => setOpen((o) => (o && hoverable && Date.now() - hoverOpenedAt.current < 700 ? true : !o))}
        >
          <span className={cx("lp-dot", live && "live")} aria-hidden />
          <Flag country={place} />
          {live ? (
            <span className="lp-text"><b>Live</b><span className="lp-sep">·</span>{live.label}</span>
          ) : (
            <span className="lp-text"><span className="lp-name">{focus.label}</span><b className="lp-count">{shortCountdown(focus.start - now, now)}</b></span>
          )}
        </motion.button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id="live-pill-panel"
              key="panel"
              className="lp-panel"
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)", transition: { delay: 0.08, duration: 0.25 } }}
              exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
            >
              <div className="lp-head">
                <div>
                  <span className="eyebrow">Round {race.round} · {name}</span>
                  <strong>{race.Circuit.circuitName}</strong>
                </div>
                <button type="button" className="icon-btn lp-close" onClick={dismiss} aria-label="Hide until the next session"><X size={16} /></button>
              </div>
              <ol className="lp-list">
                {slots.map((s) => {
                  const isLive = s === live;
                  const done = s.end <= now;
                  return (
                    <li key={s.label} className={cx("lp-row", isLive && "live", done && "done", s === next && !live && "next")}>
                      <span className="lp-row-label">{isLive && <span className="lp-dot live" aria-hidden />}{s.label}</span>
                      <span className="lp-row-side">
                        <span className="lp-row-time">{isLive ? "Live now" : done ? "Finished" : formatSession(s.date, s.time, timezone)}</span>
                        {!isLive && !done && <ReminderToggle race={race} session={s} onMessage={setReminderMsg} />}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <ReminderNote compact className="rmd-pill-note" races={[race]} filename={`f1-pulse-${race.season}-round-${race.round}-reminders.ics`} message={reminderMsg} />
              <div className="lp-foot">
                <span className="xsmall faint">Times in {timezoneLabel(timezone)}. "Live" uses each session's published start and typical length.</span>
                <Link to={"race/" + race.round + "?season=current"} className="btn sm primary">Weekend hub <ArrowRight /></Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
