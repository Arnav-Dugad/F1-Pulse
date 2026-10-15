import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowDownUp, BookOpen, Crown, Flame, Gauge, Info, MapPin, Medal, Timer, TrendingUp, Trophy } from "lucide-react";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { plural } from "../lib/format";
import {
  ageRecords, circuitTendencies, coverage, dominance, eraById, fmtDate, fmtPct, leaderboard, seasonBests, tally, titleYears, champions,
  useArchive, winStreaks, type Archive, type ArchiveBundle, type Metric, type Tally,
} from "../lib/archive";
import { Counter, Glass, Page, Section, Segmented, Source, cx, useAmbient, useTitle } from "../ui/core";
import { Flag, TeamLogo } from "../ui/media";
import { LineChart } from "../ui/charts";
import { ArchiveError, ArchiveHero, ArchiveLoading, Columns, EraSwitch, Face, RankRow, lastTeam } from "./_archive-ui";
import "./records.css";

type Kind = "driver" | "constructor";
type BoardMetric = Metric | "titles";
const DRIVER_METRICS: { value: BoardMetric; label: string }[] = [
  { value: "wins", label: "Wins" }, { value: "podiums", label: "Podiums" }, { value: "poles", label: "Poles" }, { value: "fastestLaps", label: "Fastest laps" },
  { value: "starts", label: "Starts" }, { value: "points", label: "Points" }, { value: "winPct", label: "Win %" }, { value: "titles", label: "Titles" }, { value: "hatTricks", label: "Hat-tricks" },
];
const TEAM_METRICS: { value: BoardMetric; label: string }[] = [
  ...DRIVER_METRICS.slice(0, 8), { value: "oneTwos", label: "1–2 finishes" },
];
const MIN_STARTS = { driver: 20, constructor: 50 };

export default function Records({ route }: { route: Route }) {
  useTitle("Record Book");
  const a = useArchive();
  const q = route.query;
  const [kind, setKind] = useState<Kind>(q.get("kind") === "constructor" ? "constructor" : "driver");
  const [era, setEra] = useState(eraById(q.get("era")).id);
  const [metric, setMetric] = useState<BoardMetric>(() => {
    const m = q.get("metric") as BoardMetric | null;
    return m && [...DRIVER_METRICS, ...TEAM_METRICS].some((x) => x.value === m) ? m : "wins";
  });
  const changeKind = (k: Kind) => {
    setKind(k);
    const next = k === "constructor" && metric === "hatTricks" ? "oneTwos" : k === "driver" && metric === "oneTwos" ? "hatTricks" : metric;
    setMetric(next);
    setQuery({ kind: k === "driver" ? null : k, metric: next === "wins" ? null : next });
  };
  const changeEra = (e: string) => { setEra(e); setQuery({ era: e === "all" ? null : e }); };
  const changeMetric = (m: BoardMetric) => { setMetric(m); setQuery({ metric: m === "wins" ? null : m }); };
  useAmbient("#c9a227", "#e10600");

  if (a.loading || (!a.value && !a.error)) return <Page className="rb"><ArchiveLoading progress={a.progress} rows={4} /></Page>;
  if (a.error || !a.value) return <Page className="rb"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  return <RecordBook bundle={a.value} kind={kind} era={era} metric={metric} onKind={changeKind} onEra={changeEra} onMetric={changeMetric} />;
}

function RecordBook({ bundle, kind, era, metric, onKind, onEra, onMetric }: {
  bundle: ArchiveBundle; kind: Kind; era: string; metric: BoardMetric; onKind: (k: Kind) => void; onEra: (e: string) => void; onMetric: (m: BoardMetric) => void;
}) {
  const { archive, history, envelope } = bundle;
  const range = eraById(era);
  const cov = useMemo(() => coverage(archive), [archive]);
  const all = useMemo(() => tally(archive), [archive]);
  const t = useMemo(() => tally(archive, range.from, range.to), [archive, range.from, range.to]);
  const winners = all.drivers.filter((d) => d.wins > 0).length;
  const firstSeason = archive.races[0]?.season, lastSeason = archive.races.at(-1)?.season;
  const top = leaderboard(all.drivers, "wins", { limit: 1 })[0];

  return (
    <Page className="rb">
      <ArchiveHero
        eyebrow="Archive · Record Book"
        icon={<BookOpen size={14} />}
        title="The Record Book"
        accent={`${firstSeason}–${lastSeason}, every Grand Prix`}
        lede="All-time leaderboards built from every World Championship race classification — filter by era, switch between drivers and constructors."
        photo={circuitMedia("monza").hero}
        tint="#b8860b"
        stats={[
          { label: "Grands Prix", value: <Counter value={all.races} /> },
          { label: "Drivers started", value: <Counter value={all.drivers.filter((d) => d.starts > 0).length} /> },
          { label: "Different winners", value: <Counter value={winners} /> },
          { label: "Seasons", value: <Counter value={archive.seasons.length} /> },
        ]}
        figure={top && <HeroLeader archive={archive} t={top} />}
      />

      <div className="arx-controls rb-controls reveal">
        <Segmented size="lg" label="Drivers or constructors" value={kind} onChange={onKind} options={[{ value: "driver", label: "Drivers" }, { value: "constructor", label: "Constructors" }]} />
        <EraSwitch value={era} onChange={onEra} />
      </div>
      <p className="faint small rb-scope">
        {range.id === "all" ? "All seasons" : `Seasons ${range.label}`} · {plural(t.races, "Grand Prix", "Grands Prix")}
        {archive.live.length ? ` · includes ${archive.live.join(", ")} to date` : ""}
      </p>

      <Leaderboards archive={archive} history={bundle.history} t={t} kind={kind} metric={metric} onMetric={onMetric} range={range} cov={cov} />
      <Source value={envelope} label="Race results" />

      <AgeSection archive={archive} range={range} />
      <StreakSection archive={archive} kind={kind} range={range} />
      <Source value={envelope} label="Race results" />

      <CircuitSection archive={archive} range={range} cov={cov} />
      <Source value={envelope} label="Race results" />

      <DominanceSection archive={archive} history={history} range={range} />
      <Source value={envelope} label="Race results & final standings" />
    </Page>
  );
}

/* ───────────────────────── Hero figure ───────────────────────── */
function HeroLeader({ archive, t }: { archive: Archive; t: Tally }) {
  const d = archive.drivers[t.idx];
  return (
    <Link to={"driver/" + d.id} className="rb-leader glass reveal" style={{ "--tint": teamColor(lastTeam(archive, t.idx)) } as CSSProperties}>
      <span className="rb-leader-crown"><Crown size={16} />Most Grand Prix wins</span>
      <Face archive={archive} idx={t.idx} size={148} className="rb-leader-face" />
      <strong className="rb-leader-name">{d.name}</strong>
      <span className="rb-leader-value"><Counter value={t.wins} /><small>wins · {t.starts} starts</small></span>
      <span className="rb-leader-sub"><Flag nationality={d.nat} />{t.first?.season}–{t.last?.season}</span>
    </Link>
  );
}

/* ───────────────────────── Leaderboards ───────────────────────── */
type Range = ReturnType<typeof eraById>;
type Cov = ReturnType<typeof coverage>;
type Entry = { idx: number; value: number; sub: string; id: string; name: string; year: string; unit?: string };

function Leaderboards({ archive, history, t, kind, metric, onMetric, range, cov }: {
  archive: Archive; history: ArchiveBundle["history"]; t: ReturnType<typeof tally>; kind: Kind; metric: BoardMetric; onMetric: (m: BoardMetric) => void; range: Range; cov: Cov;
}) {
  const metrics = kind === "driver" ? DRIVER_METRICS : TEAM_METRICS;
  const m = metrics.some((x) => x.value === metric) ? metric : "wins";
  const entries: Entry[] = useMemo(() => {
    const name = (idx: number) => (kind === "driver" ? archive.drivers[idx]?.name : archive.teams[idx]?.name) || "";
    const id = (idx: number) => (kind === "driver" ? archive.drivers[idx]?.id : archive.teams[idx]?.id) || "";
    if (m === "titles") {
      const years = titleYears(history, kind === "driver" ? "drivers" : "constructors");
      return [...years.entries()]
        .map(([cid, ys]) => ({ cid, ys: ys.filter((y) => y >= range.from && y <= range.to) }))
        .filter((x) => x.ys.length)
        .sort((a, b) => b.ys.length - a.ys.length || a.ys[0] - b.ys[0])
        .slice(0, 20)
        .map(({ cid, ys }) => {
          const idx = (kind === "driver" ? archive.driverIndex : archive.teamIndex).get(cid) ?? -1;
          return { idx, value: ys.length, id: cid, name: idx >= 0 ? name(idx) : cid, year: String(ys.at(-1)), sub: ys.length > 5 ? `${ys[0]}–${ys.at(-1)}` : ys.join(", ") };
        });
    }
    const list = kind === "driver" ? t.drivers : t.teams;
    return leaderboard(list, m, { minStarts: MIN_STARTS[kind], limit: 20 }).map((x) => ({
      idx: x.idx, value: x.value, id: id(x.idx), name: name(x.idx), year: String(x.last?.season || ""),
      sub: m === "winPct" ? `${x.wins} from ${x.starts}` : `${x.first?.season ?? ""}–${x.last?.season ?? ""} · ${x.starts} starts`,
    }));
  }, [archive, history, t, kind, m, range.from, range.to]);
  const max = entries[0]?.value || 1;
  const unit = m === "winPct" ? "%" : undefined;
  const note = metricNote(m, kind, cov, range);
  return (
    <Section id="leaderboards" title="All-time leaderboards" subtitle={kind === "driver" ? "Drivers ranked by career totals in the selected era." : "Constructors ranked by totals in the selected era."}>
      <div className="rb-metrics reveal"><Segmented label="Record" value={m} onChange={onMetric} options={metrics} /></div>
      <div className="split rb-board">
        <Glass className="card rb-list reveal">
          {entries.length ? (
            <LayoutGroup>
              <ol className="list" aria-label={`${metrics.find((x) => x.value === m)?.label} leaderboard`}>
                <AnimatePresence initial={false}>
                  {entries.map((e, i) => (
                    <motion.li key={kind + e.id} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
                      <RankRow
                        rank={i + 1}
                        media={kind === "driver" ? (e.idx >= 0 ? <Face archive={archive} idx={e.idx} size={36} /> : null) : <TeamLogo id={e.id} name={e.name} year={e.year} size={36} />}
                        name={e.name}
                        sub={e.sub}
                        value={e.value}
                        unit={unit}
                        max={max}
                        tint={kind === "driver" ? teamColor(e.idx >= 0 ? lastTeam(archive, e.idx) : undefined) : teamColor(e.id)}
                        index={i}
                        to={(kind === "driver" ? "driver/" : "team/") + e.id}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            </LayoutGroup>
          ) : (
            <div className="state"><Info /><h3>No records in this era</h3><p>{m === "fastestLaps" || m === "hatTricks" ? `Fastest-lap data starts in ${cov.fastestLapFrom}.` : "Try a wider era."}</p></div>
          )}
        </Glass>
        <div className="stack rb-side">
          {entries[0] && (
            <Glass className="card rb-spot reveal" style={{ "--tint": kind === "driver" ? teamColor(lastTeam(archive, entries[0].idx)) : teamColor(entries[0].id) } as CSSProperties}>
              <span className="eyebrow"><Trophy size={13} />Record holder</span>
              <strong className="title-2">{entries[0].name}</strong>
              <span className="rb-spot-value">{unit ? fmtPct(entries[0].value) : entries[0].value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="muted small">{metrics.find((x) => x.value === m)?.label} · {range.id === "all" ? "all time" : range.label}</span>
              {entries[1] && <span className="faint small">Next: {entries[1].name} ({unit ? fmtPct(entries[1].value) : entries[1].value.toLocaleString(undefined, { maximumFractionDigits: 1 })})</span>}
            </Glass>
          )}
          <p className="notice rb-note reveal" role="note"><Info /><span>{note}</span></p>
        </div>
      </div>
    </Section>
  );
}

function metricNote(m: BoardMetric, kind: Kind, cov: Cov, range: Range) {
  const indy = range.from <= 1960 && kind === "driver" ? " The Indianapolis 500 (1950–60) was a championship round and counts here." : "";
  switch (m) {
    case "poles":
      return `Pole = qualifying P1 from ${cov.qualifyingFrom ?? 1994} (Jolpica's qualifying coverage starts in 1994). Earlier races use the driver who started from grid P1 — normally, but not always, the pole sitter. 2021 sprint weekends credit the sprint winner, as official records do; a few penalty cases (e.g. a qualifying exclusion) can still differ from official pole tallies by one.`;
    case "fastestLaps":
      return `Fastest-lap ranks are only published from ${cov.fastestLapFrom ?? "2004"}, so these totals cover ${cov.fastestLapFrom ?? "2004"} onward — earlier fastest laps are missing from the data.`;
    case "hatTricks":
      return `Pole, win and fastest lap in the same race. Needs fastest-lap data, so it covers ${cov.fastestLapFrom ?? "2004"} onward. ("Grand slams" also require leading every lap, which this data can't show.)`;
    case "points":
      return `Points as awarded at the time, race plus sprint. Scoring changed repeatedly (8 for a win in 1950, 9 from 1961, 10 from 1991, 25 since 2010), so modern careers dominate — see Across Eras for a normalised view.${kind === "constructor" ? " Constructor figures add up all of a team's cars, which differs from official tables before 1979 (best car only)." : ""}`;
    case "winPct":
      return `Wins ÷ starts, minimum ${MIN_STARTS[kind]} starts in the selected era.${indy}`;
    case "titles":
      return `Completed seasons only, from the final championship tables${kind === "constructor" ? "; the constructors' championship began in 1958" : ""}. The running season is not counted until it ends.`;
    case "starts":
      return `Races started — withdrawals and non-qualifiers excluded.${kind === "constructor" ? " A constructor start is a race with at least one of its cars on the grid." : ""}${indy}`;
    case "oneTwos":
      return "Races where the constructor's cars finished first and second.";
    default:
      return `Classified finishes from every race classification.${kind === "constructor" ? " Shared 1950s drives credit every listed driver; a team win is counted once per race." : " Shared 1950s drives credit every listed driver, as official statistics do."}${indy}`;
  }
}

/* ───────────────────────── Ages ───────────────────────── */
function AgeSection({ archive, range }: { archive: Archive; range: Range }) {
  const lists = useMemo(() => ([
    { key: "yw", title: "Youngest winners", icon: <Medal size={13} />, list: ageRecords(archive, { kind: "win", order: "youngest", from: range.from, to: range.to, limit: 5 }) },
    { key: "ow", title: "Oldest winners", icon: <Timer size={13} />, list: ageRecords(archive, { kind: "win", order: "oldest", from: range.from, to: range.to, limit: 5 }) },
    { key: "yp", title: "Youngest on the podium", icon: <Medal size={13} />, list: ageRecords(archive, { kind: "podium", order: "youngest", from: range.from, to: range.to, limit: 5 }) },
    { key: "op", title: "Oldest on the podium", icon: <Timer size={13} />, list: ageRecords(archive, { kind: "podium", order: "oldest", from: range.from, to: range.to, limit: 5 }) },
  ]), [archive, range.from, range.to]);
  return (
    <Section id="ages" title="Youngest & oldest" subtitle="Age on race day, from each driver's date of birth — one entry per driver.">
      <div className="rb-ages">
        {lists.map((l, k) => (
          <Glass key={l.key} className="card rb-age reveal" style={{ "--i": k } as CSSProperties}>
            <div className="card-title"><h3>{l.title}</h3><span className="eyebrow">{l.icon}Age</span></div>
            {l.list.length ? (
              <ol className="list">
                {l.list.map((r, i) => {
                  const d = archive.drivers[r.idx];
                  return (
                    <li key={r.idx}>
                      <Link to={"driver/" + d.id} className="list-row rb-age-row">
                        <span className={cx("pos", i < 3 && "p" + (i + 1))}>{i + 1}</span>
                        <Face archive={archive} idx={r.idx} size={34} year={r.race.season} team={r.row.c} />
                        <span className="rb-age-main"><strong>{d.name}</strong><small>{r.race.name.replace(/ Grand Prix$/, " GP")} · {fmtDate(r.race.date)}</small></span>
                        <span className="rb-age-value">{r.age.years}<small>y {r.age.days}d</small></span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="muted small">No results in this era.</p>}
          </Glass>
        ))}
      </div>
      <p className="arx-note"><Info />Ages in years and days, from Jolpica's recorded dates of birth to the race date.</p>
    </Section>
  );
}

/* ───────────────────────── Streaks & season bests ───────────────────────── */
function StreakSection({ archive, kind, range }: { archive: Archive; kind: Kind; range: Range }) {
  const streaks = useMemo(() => winStreaks(archive, { kind, from: range.from, to: range.to, limit: 8 }), [archive, kind, range.from, range.to]);
  const bests = useMemo(() => seasonBests(archive, { kind, from: range.from, to: range.to, limit: 8 }), [archive, kind, range.from, range.to]);
  const nameOf = (idx: number) => (kind === "driver" ? archive.drivers[idx]?.name : archive.teams[idx]?.name) || "";
  const idOf = (idx: number) => (kind === "driver" ? archive.drivers[idx]?.id : archive.teams[idx]?.id) || "";
  const media = (idx: number, season: number) => (kind === "driver" ? <Face archive={archive} idx={idx} size={34} year={season} /> : <TeamLogo id={idOf(idx)} name={nameOf(idx)} year={String(season)} size={34} />);
  const maxS = streaks[0]?.length || 1, maxB = bests[0]?.wins || 1;
  return (
    <Section id="streaks" title="Streaks & seasons" subtitle={kind === "driver" ? "Consecutive wins count a driver's consecutive starts; a race they didn't enter doesn't break the run." : "Consecutive championship races won by the constructor (the 1950–60 Indianapolis 500 is skipped — no constructors raced it)."}>
      <div className="split even">
        <Glass className="card reveal">
          <div className="card-title"><h3>Longest winning streaks</h3><span className="eyebrow"><Flame size={13} />Races</span></div>
          {streaks.length ? (
            <ol className="list">
              {streaks.map((s, i) => (
                <li key={s.idx + ":" + s.start.season + ":" + s.start.round}>
                  <RankRow
                    rank={i + 1} media={media(s.idx, s.end.season)} name={nameOf(s.idx)} value={s.length} max={maxS} index={i}
                    sub={`${s.start.name.replace(/ Grand Prix$/, "")} ${s.start.season} → ${s.end.name.replace(/ Grand Prix$/, "")} ${s.end.season}`}
                    tint={kind === "driver" ? teamColor(archive.teams[s.end.results.find((r) => r.d === s.idx)?.c ?? -1]?.id) : teamColor(idOf(s.idx))}
                    to={(kind === "driver" ? "driver/" : "team/") + idOf(s.idx)}
                  />
                </li>
              ))}
            </ol>
          ) : <p className="muted small">No winning streaks of two or more in this era.</p>}
        </Glass>
        <Glass className="card reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="card-title"><h3>Most wins in a season</h3><span className="eyebrow"><Trophy size={13} />Wins</span></div>
          <ol className="list">
            {bests.map((b, i) => (
              <li key={b.idx + ":" + b.season}>
                <RankRow
                  rank={i + 1} media={media(b.idx, b.season)} name={<>{nameOf(b.idx)} <span className="rb-year">{b.season}</span></>} value={b.wins} max={maxB} index={i}
                  sub={`${b.wins} of ${b.races} · ${fmtPct(b.pct, 0)}${archive.live.includes(b.season) ? " · in progress" : ""}`}
                  tint={kind === "driver" ? teamColor(lastTeamInSeason(archive, b.idx, b.season)) : teamColor(idOf(b.idx))}
                  to={(kind === "driver" ? "driver/" : "team/") + idOf(b.idx)}
                />
              </li>
            ))}
          </ol>
        </Glass>
      </div>
    </Section>
  );
}
function lastTeamInSeason(archive: Archive, idx: number, season: number) {
  for (let i = archive.races.length - 1; i >= 0; i--) {
    const r = archive.races[i];
    if (r.season !== season) continue;
    const row = r.results.find((x) => x.d === idx);
    if (row) return archive.teams[row.c]?.id;
  }
  return undefined;
}

/* ───────────────────────── Circuits ───────────────────────── */
type CircuitSort = "races" | "avgGain" | "conversion";
function CircuitSection({ archive, range, cov }: { archive: Archive; range: Range; cov: Cov }) {
  const [sort, setSort] = useState<CircuitSort>("races");
  const [desc, setDesc] = useState(true);
  const list = useMemo(() => circuitTendencies(archive, { from: range.from, to: range.to, minRaces: 3 }), [archive, range.from, range.to]);
  const sorted = [...list].sort((a, b) => (desc ? -1 : 1) * (a[sort] - b[sort]) || b.races - a.races);
  const passing = [...list].sort((a, b) => b.avgGain - a.avgGain)[0];
  const pole = [...list].filter((c) => c.poleRaces >= 5).sort((a, b) => b.conversion - a.conversion)[0];
  const chaos = [...list].filter((c) => c.poleRaces >= 5).sort((a, b) => a.conversion - b.conversion)[0];
  const head = (key: CircuitSort, label: string) => (
    <th className="r" aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(true)))}>{label}<ArrowDownUp size={12} /></button>
    </th>
  );
  const maxGain = Math.max(0.1, ...list.map((c) => Math.abs(c.avgGain)));
  return (
    <Section id="circuits" title="Circuit tendencies" subtitle="Where grid position matters most — circuits with at least three Grands Prix in the selected era.">
      {list.length ? (
        <>
          <div className="rb-circuit-cards">
            {passing && <CircuitHighlight archive={archive} idx={passing.idx} icon={<TrendingUp size={13} />} label="Most places gained" value={`+${passing.avgGain.toFixed(2)}`} sub={`avg per classified finisher · ${passing.races} races`} />}
            {pole && <CircuitHighlight archive={archive} idx={pole.idx} icon={<Gauge size={13} />} label="Pole is king" value={fmtPct(pole.conversion, 0)} sub={`${pole.poleWins} of ${pole.poleRaces} poles converted`} i={1} />}
            {chaos && <CircuitHighlight archive={archive} idx={chaos.idx} icon={<MapPin size={13} />} label="Least kind to pole" value={fmtPct(chaos.conversion, 0)} sub={`${chaos.poleWins} of ${chaos.poleRaces} poles converted`} i={2} />}
          </div>
          <Glass className="card flush reveal rb-circuits">
            <div className="table-wrap">
              <table className="tbl">
                <caption className="sr-only">Average places gained and pole-to-win conversion by circuit</caption>
                <thead>
                  <tr>
                    <th>Circuit</th>
                    {head("races", "Races")}
                    {head("avgGain", "Avg places gained")}
                    {head("conversion", "Pole → win")}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const ci = archive.circuits[c.idx];
                    return (
                      <tr key={c.idx}>
                        <td>
                          <Link to={"circuit/" + ci.id} className="rb-circuit-name"><Flag country={ci.country} /><span><strong>{ci.name}</strong><small>{ci.locality} · {c.first === c.last ? c.first : `${c.first}–${c.last}`}</small></span></Link>
                        </td>
                        <td className="r">{c.races}</td>
                        <td className="r">
                          <span className="rb-gain"><span className="rb-gain-bar" style={{ "--w": `${(Math.abs(c.avgGain) / maxGain) * 100}%` } as CSSProperties} data-neg={c.avgGain < 0 || undefined} />{c.avgGain >= 0 ? "+" : ""}{c.avgGain.toFixed(2)}</span>
                        </td>
                        <td className="r">{c.poleRaces ? <>{fmtPct(c.conversion, 0)} <small className="faint">{c.poleWins}/{c.poleRaces}</small></> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Glass>
          <p className="arx-note"><Info />Places gained = starting grid minus finishing position, averaged over classified finishers with a grid slot. Retirements ahead lift everyone's gains, so compare circuits rather than reading the absolute number. Pole = qualifying P1 from {cov.qualifyingFrom ?? 1994}, grid P1 before.</p>
        </>
      ) : <div className="state glass"><Info /><h3>Not enough races</h3><p>No circuit hosted three Grands Prix in this era.</p></div>}
    </Section>
  );
}
function CircuitHighlight({ archive, idx, icon, label, value, sub, i = 0 }: { archive: Archive; idx: number; icon: ReactNode; label: string; value: string; sub: string; i?: number }) {
  const c = archive.circuits[idx];
  const photo = circuitMedia(c.id).hero;
  return (
    <Link to={"circuit/" + c.id} className="rb-ch glass interactive reveal" style={{ "--i": i } as CSSProperties}>
      {photo && <span className="rb-ch-photo" style={{ backgroundImage: `url(${photo})` }} aria-hidden />}
      <span className="eyebrow">{icon}{label}</span>
      <strong className="rb-ch-value">{value}</strong>
      <span className="rb-ch-name"><Flag country={c.country} />{c.name}</span>
      <span className="faint xsmall">{sub}</span>
    </Link>
  );
}

/* ───────────────────────── Dominance ───────────────────────── */
function DominanceSection({ archive, history, range }: { archive: Archive; history: ArchiveBundle["history"]; range: Range }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const rows = useMemo(() => dominance(archive, champions(history)).filter((r) => r.season >= range.from && r.season <= range.to), [archive, history, range.from, range.to]);
  if (!rows.length) return null;
  const labels = rows.map((r) => String(r.season));
  const peak = [...rows].filter((r) => r.complete).sort((a, b) => b.winShare - a.winShare)[0];
  const open = [...rows].sort((a, b) => b.winners - a.winners)[0];
  const series = [
    { id: "wins", name: "Champion's share of wins", color: "var(--accent)", values: rows.map((r) => Math.round(r.winShare * 1000) / 10) },
    { id: "points", name: "Champion's share of points", color: "var(--blue)", values: rows.map((r) => Math.round(r.pointsShare * 1000) / 10), dashed: true },
  ];
  return (
    <Section id="dominance" title="Dominance index" subtitle="How much of each season the champion took — and how many different drivers won.">
      <div className="rb-dom-kpis">
        {peak && (
          <Glass className="card kpi reveal">
            <span className="label">Most dominant champion</span>
            <span className="value">{fmtPct(peak.winShare, 0)}</span>
            <span className="detail">{archive.drivers[peak.champion]?.name} · {peak.wins} of {peak.races} wins in {peak.season}</span>
          </Glass>
        )}
        {open && (
          <Glass className="card kpi reveal" style={{ "--i": 1 } as CSSProperties}>
            <span className="label">Most open season</span>
            <span className="value">{open.winners}</span>
            <span className="detail">different winners in {open.season} ({open.races} races)</span>
          </Glass>
        )}
        <Glass className="card kpi reveal" style={{ "--i": 2 } as CSSProperties}>
          <span className="label">Average champion win share</span>
          <span className="value">{fmtPct(rows.filter((r) => r.complete).reduce((s, r) => s + r.winShare, 0) / Math.max(1, rows.filter((r) => r.complete).length), 0)}</span>
          <span className="detail">{range.id === "all" ? "across all completed seasons" : `completed seasons ${range.label}`}</span>
        </Glass>
      </div>
      <Glass className="card reveal">
        <div className="spread rb-dom-head">
          <div className="legend">
            {series.map((s) => (
              <button key={s.id} type="button" onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)}>
                <i className={cx("swatch", s.dashed && "rb-swatch-dash")} style={{ "--c": s.color } as CSSProperties} />{s.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn sm" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
        </div>
        {table ? (
          <div className="table-wrap rb-dom-table">
            <table className="tbl">
              <thead><tr><th>Season</th><th>Champion</th><th className="r">Wins</th><th className="r">Win share</th><th className="r">Points share</th><th className="r">Winners</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.season}>
                    <td>{r.season}{!r.complete && <span className="arx-badge rb-inline">Leader · in progress</span>}</td>
                    <td>{archive.drivers[r.champion]?.name}</td>
                    <td className="r">{r.wins}/{r.races}</td>
                    <td className="r">{fmtPct(r.winShare, 0)}</td>
                    <td className="r">{fmtPct(r.pointsShare, 1)}</td>
                    <td className="r">{r.winners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <LineChart
              ariaLabel="Champion's share of race wins and of all points scored, per season"
              series={series}
              labels={labels}
              yMin={0}
              yMax={100}
              yFormat={(v) => `${Math.round(v)}%`}
              focus={focus}
              onFocus={setFocus}
              curve={false}
              height={320}
              tooltipTitle={(i) => `${rows[i].season} · ${archive.drivers[rows[i].champion]?.name}${rows[i].complete ? "" : " (leader)"}`}
            />
            <h3 className="rb-dom-sub">Different race winners per season</h3>
            <Columns
              ariaLabel="Number of different Grand Prix winners in each season"
              labels={labels}
              values={rows.map((r) => r.winners)}
              colors="var(--purple)"
              height={180}
              tooltip={(i) => (
                <>
                  <div className="t-title">{rows[i].season}</div>
                  <div className="t-row"><span>Different winners</span><b>{rows[i].winners}</b></div>
                  <div className="t-row"><span>Races</span><b>{rows[i].races}</b></div>
                </>
              )}
            />
          </>
        )}
        <p className="arx-note"><Info />Champions come from the final standings of completed seasons{archive.live.length ? `; ${archive.live.join(", ")} shows the current points leader` : ""}. Points share = the champion's points ÷ all points scored that season (race + sprint, before any dropped-score rules), so seasons with fewer scoring places read higher.</p>
      </Glass>
    </Section>
  );
}
