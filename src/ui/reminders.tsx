import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, BellRing, CalendarPlus } from "lucide-react";
import { buildCalendar, weekendSessions } from "../domain.mjs";
import { download } from "../lib/format";
import { cx } from "./core";
import type { Race } from "../types";
import "./reminders.css";

/**
 * Session reminders. Users pick sessions (live pill, Calendar); F1 Pulse shows a notification
 * LEAD_MIN minutes before each one — but only while a tab (or the installed app) is open: browsers
 * give ordinary web pages no way to wake up on a timer once closed. The reliable alternative is an
 * .ics export with VALARMs, which the calendar app fires itself.
 *
 * Storage: localStorage `pulse-reminders`, `{ v: 1, items, fired }`, validated on every read so a
 * corrupt or future-format value degrades to "no reminders" instead of crashing.
 */
export const LEAD_MIN = 15;
const KEY = "pulse-reminders";
const VERSION = 1;
const EVENT = "pulse-reminders-change";
const MAX_ITEMS = 200;
/** Keep a reminder around this long after its session starts (then prune it). */
const KEEP_MS = 6 * 3600e3;
/** Longest single timer; the scheduler re-arms itself so sleep / clock changes self-correct. */
const MAX_TIMER = 20 * 60e3;

export type Reminder = { id: string; season: string; round: string; label: string; race: string; start: number };
type Store = { v: typeof VERSION; items: Reminder[]; fired: string[] };
export type ReminderSession = { label: string; date: string; time?: string };
export type Permission = NotificationPermission | "unsupported";

export const reminderId = (season: string, round: string, label: string) => `${season}-${round}-${label.toLowerCase().replace(/\s+/g, "-")}`;
/** Start time in ms, or null for sessions without a published time (those can't be reminded). */
export const sessionStart = (s: ReminderSession) => (s.time ? Date.parse(s.date + "T" + s.time) : NaN);

/* ───────────────────────── Store ───────────────────────── */
const EMPTY: Store = { v: VERSION, items: [], fired: [] };
const isReminder = (x: unknown): x is Reminder => {
  const r = x as Reminder;
  return !!r && typeof r === "object" && typeof r.id === "string" && r.id.length < 80 && typeof r.season === "string" && typeof r.round === "string"
    && typeof r.label === "string" && typeof r.race === "string" && typeof r.start === "number" && Number.isFinite(r.start);
};
function parse(raw: string | null, now = Date.now()): Store {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION || !Array.isArray(data.items)) return EMPTY;
    const seen = new Set<string>();
    const items = (data.items as unknown[])
      .filter(isReminder)
      .filter((r) => r.start > now - KEEP_MS && !seen.has(r.id) && seen.add(r.id))
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_ITEMS);
    const fired = Array.isArray(data.fired) ? (data.fired as unknown[]).filter((f): f is string => typeof f === "string" && seen.has(f)) : [];
    return { v: VERSION, items, fired };
  } catch {
    return EMPTY;
  }
}
let cacheRaw: string | null | undefined;
let cache: Store = EMPTY;
function read(): Store {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (raw !== cacheRaw) { cacheRaw = raw; cache = parse(raw); }
  return cache;
}
function write(next: Store) {
  const raw = JSON.stringify(next);
  try { localStorage.setItem(KEY, raw); } catch { /* storage full or blocked: keep in memory for this tab */ }
  cacheRaw = raw;
  cache = parse(raw);
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

/* ───────────────────────── Permission ───────────────────────── */
export function notificationPermission(): Permission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}
function usePermission() {
  const [p, setP] = useState<Permission>(notificationPermission);
  useEffect(() => {
    // The user can change it in site settings at any time; re-check when they come back.
    const check = () => setP(notificationPermission());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, []);
  return [p, setP] as const;
}

export type ToggleResult = "added" | "removed" | "denied" | "unsupported" | "past";
/** Add or remove a reminder. Asks for notification permission only here, i.e. on an explicit click. */
export async function toggleReminder(race: Pick<Race, "season" | "round" | "raceName">, session: ReminderSession): Promise<ToggleResult> {
  const id = reminderId(race.season, race.round, session.label);
  const store = read();
  if (store.items.some((r) => r.id === id)) {
    write({ ...store, items: store.items.filter((r) => r.id !== id), fired: store.fired.filter((f) => f !== id) });
    return "removed";
  }
  const start = sessionStart(session);
  if (!Number.isFinite(start) || start <= Date.now()) return "past";
  let permission = notificationPermission();
  if (permission === "unsupported") return "unsupported";
  if (permission === "default") {
    try { permission = await Notification.requestPermission(); } catch { permission = "denied"; }
  }
  if (permission !== "granted") return "denied";
  const fresh = read();
  write({ ...fresh, items: [...fresh.items.filter((r) => r.id !== id), { id, season: race.season, round: race.round, label: session.label, race: race.raceName, start }] });
  return "added";
}

/** Keep stored start times in step with the latest published schedule (sessions do get moved). */
export function syncReminders(races: Race[]) {
  const store = read();
  if (!store.items.length) return;
  const starts = new Map<string, number>();
  for (const race of races) for (const s of weekendSessions(race)) {
    const t = sessionStart(s);
    if (Number.isFinite(t)) starts.set(reminderId(race.season, race.round, s.label), t);
  }
  let changed = false;
  const fired = new Set(store.fired);
  const items = store.items.map((r) => {
    const t = starts.get(r.id);
    if (t === undefined || t === r.start) return r;
    changed = true;
    fired.delete(r.id);
    return { ...r, start: t };
  });
  if (changed) write({ ...store, items, fired: [...fired] });
}

export function useReminders() {
  const store = useSyncExternalStore(subscribe, read, () => EMPTY);
  const [permission, setPermission] = usePermission();
  return {
    items: store.items,
    permission,
    has: (race: Pick<Race, "season" | "round">, label: string) => store.items.some((r) => r.id === reminderId(race.season, race.round, label)),
    toggle: async (race: Pick<Race, "season" | "round" | "raceName">, session: ReminderSession) => {
      const result = await toggleReminder(race, session);
      setPermission(notificationPermission());
      return result;
    },
  };
}

/* ───────────────────────── Scheduler ───────────────────────── */
async function show(r: Reminder, now: number) {
  const mins = Math.max(1, Math.round((r.start - now) / 60e3));
  const title = `${r.label} in ${mins} min`;
  const when = new Date(r.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const options: NotificationOptions & { renotify?: boolean } = {
    body: `${r.race}${r.label === "Grand Prix" ? "" : " — " + r.label} starts at ${when}.`,
    tag: "pulse-" + r.id,
    icon: "/icons/icon-192.png",
    badge: "/icons/maskable-192.png",
    data: { url: `/#/race/${r.round}?season=${r.season}` },
  };
  try {
    // Service-worker notifications also work in the installed app and on Android, where the
    // Notification constructor throws.
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) { await reg.showNotification(title, options); return; }
  } catch { /* fall through */ }
  try {
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); location.hash = `#/race/${r.round}?season=${r.season}`; n.close(); };
  } catch { /* notifications unavailable */ }
}

/** Mark due reminders as fired (exclusively across tabs where Web Locks exist) and return them. */
async function claimDue(now: number): Promise<Reminder[]> {
  const claim = () => {
    const store = read();
    const due = store.items.filter((r) => !store.fired.includes(r.id) && r.start - LEAD_MIN * 60e3 <= now && r.start > now);
    if (due.length) write({ ...store, fired: [...store.fired, ...due.map((r) => r.id)] });
    return due;
  };
  const locks = (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<Reminder[]> | Reminder[]) => Promise<Reminder[]> } }).locks;
  if (locks?.request) {
    try { return await locks.request("pulse-reminders", claim); } catch { /* fall back */ }
  }
  return claim();
}

/**
 * One scheduler per open tab: a single setTimeout aimed at the next reminder, re-armed whenever the
 * reminders change (any tab), the tab becomes visible or regains focus. Duplicate tabs are handled
 * by the cross-tab claim above and by the notification `tag`.
 */
export function useReminderScheduler() {
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    const arm = async () => {
      clearTimeout(timer);
      if (stopped) return;
      const now = Date.now();
      if (notificationPermission() === "granted") for (const r of await claimDue(now)) show(r, now);
      if (stopped) return;
      const store = read();
      const pending = store.items.filter((r) => !store.fired.includes(r.id) && r.start > Date.now());
      if (!pending.length) return;
      const next = Math.min(...pending.map((r) => r.start - LEAD_MIN * 60e3));
      // A re-entrant arm() (triggered by our own store write) may have set a timer meanwhile.
      clearTimeout(timer);
      timer = window.setTimeout(arm, Math.max(1000, Math.min(MAX_TIMER, next - Date.now())));
    };
    const onVisible = () => { if (document.visibilityState === "visible") arm(); };
    const unsubscribe = subscribe(arm);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", arm);
    arm();
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", arm);
    };
  }, []);
}

/* ───────────────────────── Calendar export ───────────────────────── */
export function downloadWithAlarms(races: Race[], filename: string) {
  download(filename, buildCalendar(races, true, new Date(), { alarmMinutes: LEAD_MIN }), "text/calendar;charset=utf-8");
}

/* ───────────────────────── UI ───────────────────────── */
const MESSAGES: Record<Exclude<ToggleResult, "added" | "removed">, string> = {
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, or download the calendar with alerts instead.",
  unsupported: "This browser can't show notifications from websites (on iPhone, add F1 Pulse to your Home Screen first). The calendar download with alerts works everywhere.",
  past: "That session has already started.",
};

/** Bell toggle for one session. Renders a disabled bell for sessions without a published time. */
export function ReminderToggle({ race, session, className, onMessage, withLabel }: {
  race: Pick<Race, "season" | "round" | "raceName">; session: ReminderSession; className?: string; onMessage?: (m: string) => void; withLabel?: boolean;
}) {
  const { has, toggle, permission } = useReminders();
  const [busy, setBusy] = useState(false);
  const on = has(race, session.label);
  const start = sessionStart(session);
  const timed = Number.isFinite(start);
  if (timed && start <= Date.now() && !on) return null;
  const name = session.label === "Grand Prix" ? `the ${race.raceName}` : session.label;
  const label = !timed ? `${session.label}: start time not published yet` : on ? `Cancel the reminder for ${name}` : `Remind me ${LEAD_MIN} minutes before ${name}`;
  const Icon = on ? BellRing : permission === "denied" ? BellOff : Bell;
  return (
    <button
      type="button"
      className={cx("rmd-bell", on && "on", withLabel && "labelled", className)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={!timed || busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        const result = await toggle(race, session);
        setBusy(false);
        if (result === "added") onMessage?.(`Reminder set — ${LEAD_MIN} minutes before ${name}, while F1 Pulse is open.`);
        else if (result === "removed") onMessage?.(`Reminder for ${name} removed.`);
        else onMessage?.(MESSAGES[result]);
      }}
    >
      <Icon size={15} aria-hidden />
      {withLabel && <span>{on ? "Reminder on" : "Remind me"}</span>}
    </button>
  );
}

/** Honest explanation + the reliable alternative (calendar alerts). */
export function ReminderNote({ races, filename, message, compact, className }: {
  races: Race[]; filename: string; message?: string; compact?: boolean; className?: string;
}) {
  return (
    <div className={cx("rmd-note", compact && "compact", className)}>
      <p className="rmd-status" role="status" aria-live="polite">{message}</p>
      {compact ? (
        <p className="rmd-honest">
          Bells alert you {LEAD_MIN} min before a session <b>only while F1 Pulse is open</b> — browsers can't notify once the site is closed. For dependable alerts, use your calendar:
        </p>
      ) : (
        <p className="rmd-honest">
          Bell reminders notify you {LEAD_MIN} min before a session <b>only while F1 Pulse is open</b> in a tab or as an installed app — browsers can't alert you once the site is closed.
          For alerts you can count on, add the schedule to your calendar with built-in {LEAD_MIN}-minute alerts (Apple Calendar and Outlook keep them; Google Calendar may apply your default notifications instead).
        </p>
      )}
      <button type="button" className="btn sm glass-btn rmd-ics" onClick={() => downloadWithAlarms(races, filename)}>
        <CalendarPlus />Download with reminders
      </button>
    </div>
  );
}

/** Session list with a bell per session (used for one race weekend). */
export function SessionReminders({ race, timezoneFormat, onMessage }: {
  race: Race; timezoneFormat: (s: ReminderSession) => string; onMessage?: (m: string) => void;
}) {
  const now = Date.now();
  return (
    <ul className="rmd-sessions" aria-label={`${race.raceName} sessions`}>
      {weekendSessions(race).map((s) => {
        const start = sessionStart(s);
        const past = Number.isFinite(start) && start <= now;
        return (
          <li key={s.label} className={cx("rmd-session", past && "past")}>
            <span className="rmd-session-label">{s.label}</span>
            <span className="rmd-session-time">{past ? "Started" : timezoneFormat(s)}</span>
            {!past && <ReminderToggle race={race} session={s} onMessage={onMessage} />}
          </li>
        );
      })}
    </ul>
  );
}
