/** Parse a published session date + optional UTC time. Missing times sort to the end of the day. */
export const sessionDate = (date: string, time?: string) => new Date(date + "T" + (time || "23:59:59Z"));
export const hasStarted = (date: string, time?: string, now = Date.now()) => sessionDate(date, time).getTime() <= now;

const zone = (tz: string) => (tz === "local" ? undefined : tz);

export function formatDay(date: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC", ...opts });
}
export function formatDateRange(start: string, end: string) {
  const a = new Date(start + "T12:00:00Z"), b = new Date(end + "T12:00:00Z");
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  return sameMonth
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)}`
    : `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
}
export function formatSession(date: string, time: string | undefined, timezone: string, opts: Intl.DateTimeFormatOptions = {}) {
  if (!time) return formatDay(date, { weekday: "short", ...opts }) + " · time TBC";
  return new Date(date + "T" + time).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone(timezone), ...opts,
  });
}
export function formatClock(date: string, time: string | undefined, timezone: string) {
  if (!time) return "TBC";
  return new Date(date + "T" + time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: zone(timezone) });
}
export function formatWeekday(date: string, time: string | undefined, timezone: string) {
  return new Date(date + "T" + (time || "12:00:00Z")).toLocaleDateString(undefined, { weekday: "short", timeZone: time ? zone(timezone) : "UTC" });
}
export const timezoneLabel = (tz: string) =>
  tz === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ") : tz.replace(/_/g, " ");

export function countdown(target: number, now = Date.now()) {
  const ms = Math.max(0, target - now);
  return {
    done: ms === 0,
    days: Math.floor(ms / 864e5),
    hours: Math.floor(ms / 36e5) % 24,
    minutes: Math.floor(ms / 6e4) % 60,
    seconds: Math.floor(ms / 1e3) % 60,
  };
}
export function relativeTime(iso: string, now = Date.now()) {
  const diff = (Date.parse(iso) - now) / 1000;
  if (!Number.isFinite(diff)) return "";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
  let value = diff;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}
export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const plural = (n: number, word: string, many = word + "s") => `${n} ${n === 1 ? word : many}`;
export const pts = (n: number | string) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
export function lapTime(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return m ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
export function age(dateOfBirth: string, on = new Date()) {
  const b = new Date(dateOfBirth + "T00:00:00Z");
  let a = on.getUTCFullYear() - b.getUTCFullYear();
  if (on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
/** Download text content as a file. */
export function download(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
}
