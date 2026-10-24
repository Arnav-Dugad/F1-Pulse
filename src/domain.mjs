/** Shared deterministic rules for data integrity, preferences and calendar export. */
export function validSeason(value, currentYear = new Date().getFullYear()) {
  return (
    value === "current" ||
    (typeof value === "string" &&
      /^\d{4}$/.test(value) &&
      +value >= 1950 &&
      +value <= currentYear)
  );
}
export function recordedRank(value) {
  const rank = Number(value);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}
export function validTimezone(value) {
  if (value === "local") return true;
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function normalizePreference(key, value, fallback) {
  if (key === "season") return validSeason(value) ? value : fallback;
  if (key === "timezone") return validTimezone(value) ? value : fallback;
  if (key === "theme")
    return ["dark", "light"].includes(value) ? value : fallback;
  if (key === "motion") return typeof value === "boolean" ? value : fallback;
  if (key === "favorites")
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (x) => typeof x === "string" && /^(driver|team):[\w-]+$/.test(x),
            ),
          ),
        ].slice(0, 200)
      : fallback;
  return fallback;
}
export function seasonHref(to, season) {
  const [route, query = ""] = to.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("season")) params.set("season", season);
  return "#/" + route + "?" + params;
}
export function mergeRacePage(list, page) {
  const merged = new Map(
    list.map((r) => [
      r.season + ":" + r.round,
      { ...r, Results: [...(r.Results || [])] },
    ]),
  );
  for (const race of page) {
    const key = race.season + ":" + race.round;
    const previous = merged.get(key);
    const results = new Map(
      (previous?.Results || []).map((r) => [r.Driver.driverId, r]),
    );
    for (const result of race.Results || [])
      results.set(result.Driver.driverId, result);
    merged.set(key, { ...race, Results: [...results.values()] });
  }
  return [...merged.values()].sort((a, b) => +a.round - +b.round);
}
export function snapshotMatches(
  snapshot,
  path,
  year = new Date().getFullYear(),
) {
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.fetchedAt)))
    return false;
  const response = snapshot.responses?.[path]?.MRData;
  const table =
    response?.RaceTable ||
    response?.StandingsTable ||
    response?.DriverTable ||
    response?.ConstructorTable;
  return String(table?.season) === String(year);
}
export function weekendSessions(race) {
  return [
    ["Practice 1", race.FirstPractice],
    ["Practice 2", race.SecondPractice],
    ["Practice 3", race.ThirdPractice],
    ["Sprint qualifying", race.SprintQualifying],
    ["Sprint", race.Sprint],
    ["Qualifying", race.Qualifying],
    ["Grand Prix", { date: race.date, time: race.time }],
  ]
    .filter(([, s]) => s?.date)
    .map(([label, s]) => ({ label, date: s.date, time: s.time }))
    .sort(
      (a, b) =>
        Date.parse(a.date + "T" + (a.time || "23:59:59Z")) -
        Date.parse(b.date + "T" + (b.time || "23:59:59Z")),
    );
}
const escapeICS = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function foldICS(line) {
  // RFC 5545 limits lines to 75 octets, not 75 characters.
  const encoder = new TextEncoder();
  let result = "",
    chunk = "",
    bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result += chunk + "\r\n";
      chunk = " ";
      bytes = 1;
    }
    chunk += char;
    bytes += size;
  }
  return result + chunk;
}
/**
 * A valid VALARM lead time in whole minutes (1 minute – 7 days), or null. Anything else means
 * "no alarm", so a bad option never produces a malformed calendar.
 */
export function alarmLeadMinutes(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 10080 ? n : null;
}
/**
 * RFC 5545 iCalendar export. `options.alarmMinutes` adds a DISPLAY alarm (VALARM) that many
 * minutes before each timed session; date-only sessions (no published time) get no alarm because
 * their real start is unknown. Without the option the output is unchanged.
 */
export function buildCalendar(races, allSessions = false, now = new Date(), options = {}) {
  const alarm = alarmLeadMinutes(options?.alarmMinutes);
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//F1 Pulse//Race Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const race of races)
    for (const session of allSessions
      ? weekendSessions(race)
      : [{ label: "Grand Prix", date: race.date, time: race.time }]) {
      const key = session.label.toLowerCase().replace(/\s+/g, "-");
      const date = new Date(session.date + "T" + (session.time || "00:00:00Z"));
      if (!Number.isFinite(date.getTime())) continue;
      const start = session.time
        ? date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
        : session.date.replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${race.season}-${race.round}-${key}@f1pulse`,
        `DTSTAMP:${stamp}`,
        `DTSTART${session.time ? "" : ";VALUE=DATE"}:${start}`,
        `SUMMARY:${escapeICS(race.raceName + (session.label === "Grand Prix" ? "" : " — " + session.label))}`,
        `LOCATION:${escapeICS(race.Circuit.circuitName)}`,
        `DESCRIPTION:${escapeICS("Published schedule. Times may change; check F1 Pulse before the event.")}`,
      );
      if (alarm && session.time)
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeICS(`${race.raceName}${session.label === "Grand Prix" ? "" : " — " + session.label} starts in ${alarm} minute${alarm === 1 ? "" : "s"}`)}`,
          `TRIGGER;RELATED=START:-PT${alarm}M`,
          "END:VALARM",
        );
      lines.push("END:VEVENT");
    }
  lines.push("END:VCALENDAR");
  return lines.map(foldICS).join("\r\n") + "\r\n";
}
