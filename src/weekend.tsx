import { useEffect, useState } from "react";
import { CalendarPlus, Clock, ArrowUpRight } from "lucide-react";
import { usePrefs } from "./context";
import { buildCalendar, weekendSessions } from "./domain.mjs";
import { Section, Link, download, formatTime, Source } from "./ui";
import type { Envelope, Race } from "./types";
export default function UpcomingWeekend({
  race,
  source,
}: {
  race: Race;
  source?: Envelope<Race[]>;
}) {
  const { timezone } = usePrefs();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const sessions = weekendSessions(race);
  const nextIndex = sessions.findIndex(
    (s) => Date.parse(s.date + "T" + (s.time || "23:59:59Z")) > now,
  );
  return (
    <Section
      title="Your weekend, at a glance."
      subtitle={`${race.raceName} · Published start times in ${timezone === "local" ? "your local timezone" : timezone}.`}
      action={
        <button
          className="button secondary small"
          onClick={() =>
            download(
              `f1-pulse-${race.season}-${race.round}-weekend.ics`,
              buildCalendar([race], true),
              "text/calendar;charset=utf-8",
            )
          }
        >
          <CalendarPlus size={15} />
          Save weekend
        </button>
      }
    >
      <div className="weekend-strip panel">
        {sessions.map((session, i) => (
          <Link
            key={session.label}
            to={"race/" + race.round}
            className={`weekend-session ${i === nextIndex ? "next-session" : ""}`}
          >
            <span className="eyebrow">
              <Clock size={13} />
              {i === nextIndex ? "NEXT SESSION" : "PUBLISHED SCHEDULE"}
            </span>
            <h3>{session.label}</h3>
            <strong>{formatTime(session.date, session.time, timezone)}</strong>
            <small>
              {session.time
                ? `${formatTime(session.date, session.time, "UTC")} UTC`
                : "Start time not yet published"}
            </small>
            <ArrowUpRight className="weekend-arrow" size={16} />
          </Link>
        ))}
      </div>
      <Source value={source} />
    </Section>
  );
}
