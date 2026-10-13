import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Newspaper, RefreshCw, Rss, Search, X } from "lucide-react";
import { news, useData, type NewsItem } from "../api";
import { usePrefs } from "../app/prefs";
import { setQuery, type Route } from "../lib/router";
import { splitCalendar, useCalendar } from "../lib/season";
import { circuitMedia } from "../lib/media";
import { plural, relativeTime } from "../lib/format";
import { Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import "./news.css";

type Story = NewsItem & { time: number | null };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const zone = (tz: string) => (tz === "local" ? undefined : tz);

/** Calendar-day key of a timestamp in the viewer's chosen time zone. */
function dayKey(t: number, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone(tz) }).format(t);
}
function dayLabel(key: string, now: number, tz: string) {
  if (key === dayKey(now, tz)) return "Today";
  if (key === dayKey(now - 864e5, tz)) return "Yesterday";
  const d = new Date(key + "T12:00:00Z");
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
const clock = (t: number, tz: string) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: zone(tz) });

/** Wrap search matches in <mark>. */
function highlight(text: string, words: string[]): ReactNode {
  if (!words.length) return text;
  const folded = fold(text);
  const marks: [number, number][] = [];
  for (const w of words) {
    let i = folded.indexOf(w);
    while (w && i !== -1) { marks.push([i, i + w.length]); i = folded.indexOf(w, i + w.length); }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach(([s, e], k) => {
    if (s < at) return;
    out.push(text.slice(at, s), <mark key={k}>{text.slice(s, e)}</mark>);
    at = e;
  });
  out.push(text.slice(at));
  return out;
}

function External({ publisher }: { publisher: string }) {
  return <span className="sr-only"> (opens {publisher} in a new tab)</span>;
}

export default function News({ route }: { route: Route }) {
  useTitle("News");
  const { season, timezone } = usePrefs();
  const n = useData(() => news(), []);
  const cal = useCalendar(season);
  const now = useNow(60_000);
  const [q, setQ] = useState(route.query.get("q") || "");
  useEffect(() => setQuery({ q: q.trim() || null }), [q]);
  useAmbient("#bb1919", "#3a3a48");

  const stories: Story[] = useMemo(() => {
    const list = (n.value?.data || []).map((s) => {
      const t = Date.parse(s.date);
      return { ...s, time: Number.isFinite(t) ? t : null };
    });
    return list.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity));
  }, [n.value]);

  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  const filtered = words.length ? stories.filter((s) => { const f = fold(s.title + " " + s.publisher); return words.every((w) => f.includes(w)); }) : stories;
  const searching = words.length > 0;
  const featured = !searching ? stories[0] : undefined;
  const leading = !searching ? stories.slice(1, 4) : [];
  const rest = searching ? filtered : stories.slice(4);

  const groups = useMemo(() => {
    const m = new Map<string, Story[]>();
    for (const s of rest) {
      const key = s.time !== null ? dayKey(s.time, timezone) : "undated";
      m.set(key, [...(m.get(key) || []), s]);
    }
    return [...m.entries()];
  }, [rest, timezone]);

  const { previous, next } = splitCalendar(cal.value?.data || [], now);
  const backdrop = circuitMedia((previous || next)?.Circuit.circuitId).hero;
  const publishers = [...new Set(stories.map((s) => s.publisher))];
  const newest = stories.find((s) => s.time !== null);

  return (
    <Page className="nws">
      <section className="nws-hero">
        <div className="nws-hero-media" aria-hidden>
          <Img src={backdrop} alt="" eager />
          <span className="nws-hero-scrim" />
        </div>
        <div className="nws-hero-inner">
          <span className="eyebrow nws-eyebrow rise"><span className="dot live" />The news desk</span>
          <h1 className="display nws-title rise" style={{ "--i": 1 } as CSSProperties}>
            The paddock,
            <span>right now.</span>
          </h1>
          <p className="nws-lede rise" style={{ "--i": 2 } as CSSProperties}>
            The latest Formula 1 headlines from {publishers.length ? publishers.join(", ") : "BBC Sport"}. Every story opens on the publisher's site — we show the headline, never a rewrite.
          </p>
          <div className="nws-hero-meta rise" style={{ "--i": 3 } as CSSProperties}>
            <span className="nws-pill"><Newspaper size={14} />{n.loading ? "Loading headlines…" : plural(stories.length, "headline")}</span>
            {newest?.time != null && <span className="nws-pill"><Rss size={14} />Latest {relativeTime(new Date(newest.time).toISOString(), now)}</span>}
            <button type="button" className="nws-pill nws-refresh" onClick={n.reload} disabled={n.loading} aria-label="Refresh headlines">
              <RefreshCw size={14} className={cx(n.loading && "spin")} />Refresh
            </button>
          </div>
        </div>
      </section>

      <div className="nws-toolbar reveal">
        <label className="search-input nws-search">
          <Search />
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines — a driver, team or Grand Prix" aria-label="Search headlines" />
          {q && <button type="button" className="nws-clear" onClick={() => setQ("")} aria-label="Clear search"><X size={15} /></button>}
        </label>
        {searching && !n.loading && <span className="nws-found" aria-live="polite">{plural(filtered.length, "match", "matches")}</span>}
      </div>

      {n.loading ? (
        <div className="stack">
          <div className="nws-lead"><Skeleton h={380} r={32} /><div className="stack"><Skeleton h={116} r={22} /><Skeleton h={116} r={22} /><Skeleton h={116} r={22} /></div></div>
          <Skeleton h={28} w={180} r={10} style={{ marginTop: 32 }} />
          <div className="nws-grid">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={150} r={22} />)}</div>
        </div>
      ) : n.error ? (
        <StateView error={n.error} onRetry={n.reload} />
      ) : !stories.length ? (
        <StateView empty emptyTitle="No headlines right now" emptyText="The BBC Sport Formula 1 feed returned no stories. Try refreshing in a few minutes." />
      ) : (
        <>
          {featured && (
            <div className="nws-lead">
              <Featured story={featured} now={now} timezone={timezone} />
              {leading.length > 0 && (
                <div className="nws-leading">
                  <span className="eyebrow">Also leading</span>
                  {leading.map((s, i) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="nws-lead-item glass interactive reveal" style={{ "--i": i + 1 } as CSSProperties}>
                      <span className="nws-rank">{String(i + 2).padStart(2, "0")}</span>
                      <span className="nws-lead-text">
                        <strong>{s.title}</strong>
                        <small>{s.publisher}{s.time !== null && <> · {relativeTime(new Date(s.time).toISOString(), now)}</>}</small>
                      </span>
                      <ArrowUpRight size={16} className="nws-arrow" />
                      <External publisher={s.publisher} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {searching && !filtered.length ? (
            <StateView empty emptyTitle="No headlines match" emptyText={<>Nothing in the current feed mentions “{q.trim()}”. The feed carries the most recent stories only.</>} />
          ) : groups.length > 0 && (
            <Section title={searching ? "Results" : "More headlines"} subtitle={searching ? undefined : "Grouped by day in your time zone."} className="nws-more">
              <AnimatePresence mode="popLayout" initial={false}>
                {groups.map(([key, items]) => (
                  <motion.div key={key} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }} className="nws-day">
                    <h3 className="nws-day-head">
                      <span>{key === "undated" ? "Undated" : dayLabel(key, now, timezone)}</span>
                      <small>{plural(items.length, "story", "stories")}</small>
                    </h3>
                    <div className="nws-grid">
                      {items.map((s, i) => (
                        <Fragment key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="nws-card glass interactive reveal" style={{ "--i": i % 6 } as CSSProperties}>
                            <span className="nws-card-meta">
                              {s.time !== null && <time dateTime={new Date(s.time).toISOString()}>{clock(s.time, timezone)}</time>}
                              <span>{s.publisher}</span>
                            </span>
                            <strong className="nws-card-title">{highlight(s.title, words)}</strong>
                            <span className="nws-card-foot">
                              <span>{s.time !== null ? relativeTime(new Date(s.time).toISOString(), now) : "Date not published"}</span>
                              <ArrowUpRight size={16} className="nws-arrow" />
                            </span>
                            <External publisher={s.publisher} />
                          </a>
                        </Fragment>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </Section>
          )}
        </>
      )}

      <Glass className="nws-credit reveal">
        <Rss />
        <p>
          Headlines and links come from the public <a className="link" href="https://www.bbc.co.uk/sport/formula1" target="_blank" rel="noopener noreferrer">BBC Sport Formula 1</a> RSS feed. Story text, images and copyright remain with the publisher; F1 Pulse shows only the headline, publication time and a link.
        </p>
      </Glass>
      <Source value={n.value} label="Headlines" />
    </Page>
  );
}

function Featured({ story, now, timezone }: { story: Story; now: number; timezone: string }) {
  return (
    <a href={story.url} target="_blank" rel="noopener noreferrer" className="nws-feature reveal">
      <span className="nws-feature-bg" aria-hidden />
      <span className="nws-feature-top">
        <span className="chip accent"><span className="live-dot" />Top story</span>
        <span className="nws-feature-meta">
          {story.publisher}
          {story.time !== null && <> · <time dateTime={new Date(story.time).toISOString()}>{relativeTime(new Date(story.time).toISOString(), now)}</time></>}
        </span>
      </span>
      <strong className="nws-feature-title">{story.title}</strong>
      <span className="nws-feature-foot">
        <span className="nws-feature-cta">Read on {story.publisher}<ArrowUpRight size={17} /></span>
        {story.time !== null && <span className="faint small">{new Date(story.time).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone(timezone) })}</span>}
      </span>
      <External publisher={story.publisher} />
    </a>
  );
}
