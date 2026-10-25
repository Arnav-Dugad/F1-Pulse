import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, Crown, Info, Swords, Timer, Users } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { ordinal, plural, pts } from "../lib/format";
import {
  finalPosition, fmtDate, fmtGap, rivalry, tally, titleYears, useArchive, type Archive, type ArchiveBundle, type Rivalry as RivalryData,
} from "../lib/archive";
import { Counter, Glass, Page, Section, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { Flag, TeamLogo } from "../ui/media";
import { ArchiveError, ArchiveHero, ArchiveLoading, DriverPick, Face, lastTeam } from "./_archive-ui";
import "./rivalry.css";

/** Famous rivalries — only offered when both drivers exist in the archive. */
const FAMOUS: [string, string, string][] = [
  ["senna", "prost", "Senna – Prost"],
  ["hamilton", "max_verstappen", "Hamilton – Verstappen"],
  ["hamilton", "rosberg", "Hamilton – Rosberg"],
  ["michael_schumacher", "hakkinen", "Schumacher – Häkkinen"],
  ["lauda", "hunt", "Lauda – Hunt"],
  ["vettel", "alonso", "Vettel – Alonso"],
  ["norris", "piastri", "Norris – Piastri"],
  ["leclerc", "max_verstappen", "Leclerc – Verstappen"],
];

export default function Rivalry({ route }: { route: Route }) {
  const a = useArchive();
  const [ids, setIds] = useState<[string | null, string | null]>(() => {
    const qa = route.query.get("a"), qb = route.query.get("b");
    return qa || qb ? [qa, qb] : ["hamilton", "max_verstappen"];
  });
  const archive = a.value?.archive;
  const ai = archive && ids[0] ? archive.driverIndex.get(ids[0]) ?? null : null;
  const bi = archive && ids[1] ? archive.driverIndex.get(ids[1]) ?? null : null;
  const set = (next: [string | null, string | null]) => { setIds(next); setQuery({ a: next[0], b: next[1] }); };
  const nameA = ai !== null && archive ? archive.drivers[ai].family : "", nameB = bi !== null && archive ? archive.drivers[bi].family : "";
  useTitle(nameA && nameB ? `${nameA} vs ${nameB}` : "Rivalries");
  useAmbient(archive && ai !== null ? teamColor(lastTeam(archive, ai)) : "#e10600", archive && bi !== null ? teamColor(lastTeam(archive, bi)) : "#0a84ff");

  if (a.loading || (!a.value && !a.error)) return <Page className="rv"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value || !archive) return <Page className="rv"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  const pick = (k: 0 | 1) => (idx: number | null) => { const n: [string | null, string | null] = [...ids]; n[k] = idx === null ? null : archive.drivers[idx].id; set(n); };
  return <RivalryView bundle={a.value} ai={ai} bi={bi} onPick={pick} onSwap={() => set([ids[1], ids[0]])} onPair={(x, y) => set([x, y])} ids={ids} />;
}

function RivalryView({ bundle, ai, bi, onPick, onSwap, onPair, ids }: {
  bundle: ArchiveBundle; ai: number | null; bi: number | null; ids: [string | null, string | null];
  onPick: (k: 0 | 1) => (idx: number | null) => void; onSwap: () => void; onPair: (a: string, b: string) => void;
}) {
  const { archive, history, envelope } = bundle;
  const data = useMemo(() => (ai !== null && bi !== null && ai !== bi ? rivalry(archive, ai, bi) : null), [archive, ai, bi]);
  const pairs = FAMOUS.filter(([x, y]) => archive.driverIndex.has(x) && archive.driverIndex.has(y));
  const ca = ai !== null ? teamColor(lastTeam(archive, ai)) : "#e10600";
  let cb = bi !== null ? teamColor(lastTeam(archive, bi)) : "#0a84ff";
  if (cb === ca) cb = "#9aa3b2";
  const A = ai !== null ? archive.drivers[ai] : null, B = bi !== null ? archive.drivers[bi] : null;
  const photo = data?.races.length ? circuitMedia(archive.circuits[data.races.at(-1)!.race.circuit]?.id).hero || circuitMedia("interlagos").hero : circuitMedia("interlagos").hero;
  const missing = ids.filter((id, k) => id && (k === 0 ? ai : bi) === null);

  return (
    <Page className="rv">
      <ArchiveHero
        className="rv-hero"
        eyebrow="Archive · Rivalries"
        icon={<Swords size={14} />}
        title={A && B ? <span className="rv-title"><b style={{ color: "#fff" }}>{A.family}</b><i>vs</i><b>{B.family}</b></span> : "Head to head"}
        accent={A && B ? (data?.races.length ? `${plural(data.races.length, "race")} on track together` : "Never started the same race") : "Pick any two drivers since 1950"}
        photo={photo}
        tint={ca}
        stats={data && data.races.length ? [
          { label: `${A!.family} ahead`, value: <Counter value={data.totals.a} /> },
          { label: `${B!.family} ahead`, value: <Counter value={data.totals.b} /> },
          { label: "As team-mates", value: <Counter value={data.totals.sameTeam.races} /> },
        ] : undefined}
        figure={A && B && <VersusFigure archive={archive} ai={ai!} bi={bi!} ca={ca} cb={cb} data={data} />}
      />

      <Glass className="rv-controls reveal">
        <DriverPick archive={archive} value={ai} onChange={onPick(0)} label="Driver A" exclude={bi} />
        <button type="button" className="icon-btn rv-swap" onClick={onSwap} aria-label="Swap drivers"><ArrowLeftRight /></button>
        <DriverPick archive={archive} value={bi} onChange={onPick(1)} label="Driver B" exclude={ai} />
        {pairs.length > 0 && (
          <div className="rv-famous">
            <span className="eyebrow">Famous rivalries</span>
            <div className="arx-chips">
              {pairs.map(([x, y, label]) => {
                const on = ids[0] === x && ids[1] === y;
                return (
                  <button key={x + y} type="button" className="arx-chip" aria-pressed={on} onClick={() => onPair(x, y)}>
                    <span className="arx-chip-faces"><Face archive={archive} idx={archive.driverIndex.get(x)!} size={26} /><Face archive={archive} idx={archive.driverIndex.get(y)!} size={26} /></span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Glass>
      {missing.length > 0 && <p className="notice rv-missing"><Info /><span>No driver with id “{missing.join("”, “")}” in the archive — pick another above.</span></p>}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${ai}-${bi}`} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          {!A || !B ? (
            <Section><StateView empty emptyTitle="Choose two drivers" emptyText="Search for any two Grand Prix starters, or tap a famous rivalry." /></Section>
          ) : !data || !data.races.length ? (
            <>
              <Section><StateView empty emptyTitle={`${A.family} and ${B.family} never raced each other`} emptyText="They never both started the same World Championship Grand Prix. Their careers are compared below." /></Section>
              <CareerCompare archive={archive} history={history} ai={ai!} bi={bi!} ca={ca} cb={cb} />
            </>
          ) : (
            <>
              <HeadToHead archive={archive} data={data} ai={ai!} bi={bi!} ca={ca} cb={cb} />
              <Source value={envelope} label="Race results" />
              <CareerCompare archive={archive} history={history} ai={ai!} bi={bi!} ca={ca} cb={cb} />
              <Seasons archive={archive} history={history} data={data} ai={ai!} bi={bi!} ca={ca} cb={cb} />
              <TitleFights archive={archive} history={history} ai={ai!} bi={bi!} ca={ca} cb={cb} />
              <Closest archive={archive} data={data} ai={ai!} bi={bi!} />
              <Source value={envelope} label="Race results & final standings" />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}

/* ───────────────────────── Hero figure ───────────────────────── */
function VersusFigure({ archive, ai, bi, ca, cb, data }: { archive: Archive; ai: number; bi: number; ca: string; cb: string; data: RivalryData | null }) {
  const t = data?.totals;
  const share = t && t.a + t.b ? t.a / (t.a + t.b) : 0.5;
  return (
    <div className="rv-vs" style={{ "--a": ca, "--b": cb } as CSSProperties}>
      <div className="rv-vs-faces">
        <Link to={"driver/" + archive.drivers[ai].id} className="rv-vs-face a"><Face archive={archive} idx={ai} size={128} /></Link>
        <span className="rv-vs-mark">VS</span>
        <Link to={"driver/" + archive.drivers[bi].id} className="rv-vs-face b"><Face archive={archive} idx={bi} size={128} /></Link>
      </div>
      {t && t.races > 0 && (
        <>
          <div role="img" className="rv-vs-score" aria-label={`${archive.drivers[ai].family} finished ahead ${t.a} times, ${archive.drivers[bi].family} ${t.b} times`}>
            <span>{t.a}</span><small>–</small><span>{t.b}</span>
          </div>
          <div className="rv-vs-bar" aria-hidden><span style={{ width: `${share * 100}%` }} /></div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Head-to-head breakdown ───────────────────────── */
function Split({ label, a, b, ca, cb, note }: { label: string; a: number; b: number; ca: string; cb: string; note?: ReactNode }) {
  const total = a + b;
  return (
    <div className="rv-split">
      <div className="spread"><span className="rv-split-label">{label}</span>{note && <span className="faint xsmall">{note}</span>}</div>
      <div className="rv-split-row">
        <b>{a}</b>
        <div className="rv-split-bar" style={{ "--a": ca, "--b": cb } as CSSProperties} role="img" aria-label={`${label}: ${a} to ${b}`}>
          <span className="sa" style={{ flexGrow: total ? a : 1 }} />
          <span className="sb" style={{ flexGrow: total ? b : 1 }} />
        </div>
        <b>{b}</b>
      </div>
    </div>
  );
}

function HeadToHead({ archive, data, ai, bi, ca, cb }: { archive: Archive; data: RivalryData; ai: number; bi: number; ca: string; cb: string }) {
  const t = data.totals;
  const A = archive.drivers[ai], B = archive.drivers[bi];
  const leader = t.a === t.b ? null : t.a > t.b ? A : B;
  return (
    <Section id="head-to-head" title="Head-to-head" subtitle="Every Grand Prix both drivers started — who finished ahead.">
      <div className="split rv-h2h">
        <Glass className="card reveal">
          <div className="rv-names"><span style={{ color: ca }}>{A.name}</span><span style={{ color: cb }}>{B.name}</span></div>
          <Split label="Finished ahead" a={t.a} b={t.b} ca={ca} cb={cb} note={plural(t.races, "race")} />
          <Split label="Both classified" a={t.both.a} b={t.both.b} ca={ca} cb={cb} />
          <Split label="Other driver retired" a={t.oneOut.a} b={t.oneOut.b} ca={ca} cb={cb} />
          {t.sameTeam.races > 0 && <Split label="As team-mates" a={t.sameTeam.a} b={t.sameTeam.b} ca={ca} cb={cb} note={plural(t.sameTeam.races, "race")} />}
          <p className="arx-note"><Info />Both classified: the better finishing position. If only one was classified, they count as ahead. {t.bothOut ? `In ${plural(t.bothOut, "race")} neither was classified — not counted.` : "Races where neither was classified are not counted."}</p>
        </Glass>
        <Glass className="card rv-verdict reveal" style={{ "--i": 1, "--tint": leader === A ? ca : leader === B ? cb : "var(--label-3)" } as CSSProperties}>
          <span className="eyebrow"><Crown size={13} />On-track verdict</span>
          <strong className="title-2">{leader ? `${leader.family} leads` : "Dead level"}</strong>
          <span className="rv-verdict-big">{Math.max(t.a, t.b)}<small>–{Math.min(t.a, t.b)}</small></span>
          <span className="muted small">across {plural(t.races, "shared race")}, {data.races[0].race.season}–{data.races.at(-1)!.race.season}</span>
          {data.spells.length > 0 && (
            <div className="rv-spells">
              <span className="eyebrow"><Users size={13} />Team-mates</span>
              {data.spells.map((s) => (
                <span key={s.team + "-" + s.from} className="rv-spell" style={{ "--tint": teamColor(archive.teams[s.team]?.id) } as CSSProperties}>
                  <TeamLogo id={archive.teams[s.team]?.id} name={archive.teams[s.team]?.name || ""} year={String(s.to)} size={24} />
                  <span><strong>{archive.teams[s.team]?.name}</strong><small>{s.from === s.to ? s.from : `${s.from}–${s.to}`} · {plural(s.races, "race")}</small></span>
                </span>
              ))}
            </div>
          )}
        </Glass>
      </div>
    </Section>
  );
}

/* ───────────────────────── Career comparison ───────────────────────── */
function CareerCompare({ archive, history, ai, bi, ca, cb }: { archive: Archive; history: ArchiveBundle["history"]; ai: number; bi: number; ca: string; cb: string }) {
  const t = useMemo(() => tally(archive), [archive]);
  const titles = useMemo(() => titleYears(history), [history]);
  const x = t.drivers.find((d) => d.idx === ai), y = t.drivers.find((d) => d.idx === bi);
  if (!x || !y) return null;
  const rows: [string, number, number][] = [
    ["Titles", titles.get(archive.drivers[ai].id)?.length || 0, titles.get(archive.drivers[bi].id)?.length || 0],
    ["Wins", x.wins, y.wins],
    ["Podiums", x.podiums, y.podiums],
    ["Poles", x.poles, y.poles],
    ["Starts", x.starts, y.starts],
    ["Win rate %", Math.round((x.wins / Math.max(1, x.starts)) * 1000) / 10, Math.round((y.wins / Math.max(1, y.starts)) * 1000) / 10],
  ];
  return (
    <Section id="careers" title="Careers side by side" subtitle="Full World Championship careers, including races without the other driver.">
      <Glass className="card rv-careers reveal">
        <div className="rv-names"><span style={{ color: ca }}>{archive.drivers[ai].name}<small>{x.first?.season}–{x.last?.season}</small></span><span style={{ color: cb }}>{archive.drivers[bi].name}<small>{y.first?.season}–{y.last?.season}</small></span></div>
        {rows.map(([label, a, b]) => {
          const max = Math.max(a, b, 1);
          return (
            <div key={label} className="rv-career-row" style={{ "--a": ca, "--b": cb } as CSSProperties}>
              <b className={cx(a > b && "lead")}>{a.toLocaleString()}</b>
              <span className="rv-career-bar a"><span style={{ width: `${(a / max) * 100}%` }} /></span>
              <span className="rv-career-label">{label}</span>
              <span className="rv-career-bar b"><span style={{ width: `${(b / max) * 100}%` }} /></span>
              <b className={cx(b > a && "lead")}>{b.toLocaleString()}</b>
            </div>
          );
        })}
        <p className="arx-note"><Info />Titles from completed seasons' final standings. Poles: qualifying P1 from 1994, grid P1 before.</p>
      </Glass>
    </Section>
  );
}

/* ───────────────────────── Season by season ───────────────────────── */
function Seasons({ archive, history, data, ai, bi, ca, cb }: { archive: Archive; history: ArchiveBundle["history"]; data: RivalryData; ai: number; bi: number; ca: string; cb: string }) {
  const A = archive.drivers[ai], B = archive.drivers[bi];
  return (
    <Section id="seasons" title="Season by season" subtitle="Who finished ahead in each season's shared races. Team-mate seasons are highlighted.">
      <Glass className="card rv-seasons reveal">
        <div className="rv-season rv-season-head" aria-hidden>
          <span>Season</span><span style={{ color: ca }}>{A.family}</span><span />
          <span style={{ color: cb }}>{B.family}</span><span className="r">Final</span>
        </div>
        {[...data.seasons].reverse().map((s, i) => {
          const pa = finalPosition(history, s.season, A.id), pb = finalPosition(history, s.season, B.id);
          const total = s.a + s.b;
          return (
            <div key={s.season} className={cx("rv-season reveal", s.sameTeam > 0 && "mates")} style={{ "--i": i % 10, "--a": ca, "--b": cb } as CSSProperties}>
              <span className="rv-season-year">{s.season}{s.sameTeam > 0 && <small>team-mates</small>}</span>
              <b>{s.a}</b>
              <span className="rv-split-bar" role="img" aria-label={`${s.season}: ${A.family} ahead ${s.a}, ${B.family} ahead ${s.b} of ${s.races} races`}>
                <span className="sa" style={{ flexGrow: total ? s.a : 1 }} /><span className="sb" style={{ flexGrow: total ? s.b : 1 }} />
              </span>
              <b>{s.b}</b>
              <span className="rv-season-final r">{pa || pb ? <>{pa ? ordinal(pa) : "—"} <i>/</i> {pb ? ordinal(pb) : "—"}</> : archive.live.includes(s.season) ? <small className="faint">in progress</small> : "—"}</span>
            </div>
          );
        })}
        <p className="arx-note"><Info />“Final” = championship positions in that season's final standings (completed seasons). Points in shared races: {A.family} {pts(data.seasons.reduce((x, s) => x + s.aPoints, 0))}, {B.family} {pts(data.seasons.reduce((x, s) => x + s.bPoints, 0))} (as awarded at the time, Grand Prix only).</p>
      </Glass>
    </Section>
  );
}

/* ───────────────────────── Title fights ───────────────────────── */
function TitleFights({ archive, history, ai, bi, ca, cb }: { archive: Archive; history: ArchiveBundle["history"]; ai: number; bi: number; ca: string; cb: string }) {
  const A = archive.drivers[ai], B = archive.drivers[bi];
  const fights = useMemo(() => {
    const out: { season: number; winner: "a" | "b"; pa: number; pb: number; ptsA: number; ptsB: number; complete: boolean }[] = [];
    for (const [season, rows] of Object.entries(history.drivers)) {
      const ra = rows.find((r) => r[0] === A.id), rb = rows.find((r) => r[0] === B.id);
      if (!ra || !rb) continue;
      const pa = +ra[1], pb = +rb[1];
      if (!((pa === 1 && pb === 2) || (pa === 2 && pb === 1))) continue;
      out.push({ season: +season, winner: pa === 1 ? "a" : "b", pa, pb, ptsA: ra[2], ptsB: rb[2], complete: true });
    }
    // The running season: points so far (race + sprint) from the merged live results.
    for (const season of archive.live) {
      const totals = new Map<number, number>();
      for (const race of archive.races) if (race.season === season) for (const r of [...race.results, ...race.sprint]) totals.set(r.d, (totals.get(r.d) || 0) + r.pts);
      const order = [...totals.entries()].sort((x, y) => y[1] - x[1]).map(([d]) => d);
      const pa = order.indexOf(ai) + 1, pb = order.indexOf(bi) + 1;
      if ((pa === 1 && pb === 2) || (pa === 2 && pb === 1)) out.push({ season, winner: pa === 1 ? "a" : "b", pa, pb, ptsA: totals.get(ai) || 0, ptsB: totals.get(bi) || 0, complete: false });
    }
    return out.sort((x, y) => y.season - x.season);
  }, [archive, history, A.id, B.id, ai, bi]);
  return (
    <Section id="title-fights" title="Title fights" subtitle="Seasons where they finished first and second in the drivers' championship.">
      {fights.length ? (
        <div className="rv-fights">
          {fights.map((f, i) => {
            const champ = f.winner === "a" ? A : B;
            const margin = Math.abs(f.ptsA - f.ptsB);
            return (
              <Glass key={f.season} className="card rv-fight reveal" style={{ "--i": i, "--tint": f.winner === "a" ? ca : cb } as CSSProperties}>
                <span className="rv-fight-year">{f.season}</span>
                <span className="eyebrow"><Crown size={13} />{f.complete ? "Champion" : "Leading · in progress"}</span>
                <strong className="title-3">{champ.name}</strong>
                <span className="muted small">{A.family} {pts(f.ptsA)} – {pts(f.ptsB)} {B.family} · margin {pts(margin)}</span>
              </Glass>
            );
          })}
        </div>
      ) : <p className="muted rv-empty"><Crown size={15} />They never finished first and second in a championship.</p>}
      <p className="arx-note"><Info />Completed seasons use official final points (after any dropped scores); the running season uses points scored so far.</p>
    </Section>
  );
}

/* ───────────────────────── Closest finishes ───────────────────────── */
function Closest({ archive, data, ai, bi }: { archive: Archive; data: RivalryData; ai: number; bi: number }) {
  if (!data.closest.length) return null;
  return (
    <Section id="closest" title="Closest finishes" subtitle="Smallest gaps when both were classified — timed gaps where both finished on the lead lap, otherwise adjacent positions.">
      <div className="rv-closest">
        {data.closest.map((x, i) => {
          const aheadIdx = x.ahead === "a" ? ai : bi;
          const behindIdx = x.ahead === "a" ? bi : ai;
          const row = x.ahead === "a" ? x.a : x.b, other = x.ahead === "a" ? x.b : x.a;
          return (
            <Link key={x.race.season + "-" + x.race.round} to={`race/${x.race.round}?season=${x.race.season}`} className="rv-close glass interactive reveal" style={{ "--i": i % 6, "--tint": teamColor(archive.teams[row.c]?.id) } as CSSProperties}>
              <span className="rv-close-gap">{x.gapMs !== null ? fmtGap(x.gapMs) : `${x.places} ${x.places === 1 ? "place" : "places"}`}</span>
              <span className="rv-close-main">
                <strong>{x.race.season} {x.race.name.replace(/ Grand Prix$/, " GP")}</strong>
                <small><Flag country={archive.circuits[x.race.circuit]?.country} />{fmtDate(x.race.date)}</small>
              </span>
              <span className="rv-close-who">
                <Face archive={archive} idx={aheadIdx} size={30} year={x.race.season} team={row.c} />
                <span><b>{archive.drivers[aheadIdx].family}</b> P{row.pos} <i>ahead of</i> {archive.drivers[behindIdx].family} P{other.pos}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <p className="arx-note"><Timer />Gaps are differences in total race time from the published classification (lapped finishers have no time).</p>
    </Section>
  );
}
