/**
 * Weather Impact (Lab): how drivers and teams perform in wet vs dry races.
 *  - History (1950–2025): archive results + a modelled wet/dry flag per race from ERA5 reanalysis
 *    precipitation in the race window (public/data/wet-races.json, scripts/fetch-wet-races.mjs).
 *  - Measured (2023+): OpenF1 trackside weather (rainfall flag, track temperature) per race session,
 *    with wet-session lap pace on request.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDownUp, CloudRain, CloudSun, Droplets, Gauge, Info, Loader2, Thermometer, Trophy, Umbrella, Users } from "lucide-react";
import { request, sessions } from "../api";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { plural } from "../lib/format";
import { eraById, isIndy500, isStart, useArchive, type ARace, type Archive, type ArchiveBundle } from "../lib/archive";
import {
  DEFAULT_WET_MM, WET_THRESHOLDS, sessionPace, sessionRain, teammateWetEdge, wetDryTable, wetScore,
  type WetDryRow, type WetRace, type WetRow, type WeatherSample,
} from "../race-x.mjs";
import { Counter, Glass, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { TeamLogo } from "../ui/media";
import { ArchiveError, ArchiveHero, ArchiveLoading, EraSwitch, Face, RankRow, lastTeam } from "./_archive-ui";
import type { Envelope, Lap, Session } from "../types";
import "./weather.css";

/* ───────────────────────── Modelled wet-race snapshot ───────────────────────── */
type WetFile = { generatedAt: string; source: string; sourceUrl: string; method: string; first: number; last: number; races: WetRow[] };
let wetPromise: Promise<WetFile> | null = null;
const loadWet = () =>
  (wetPromise ??= fetch("/data/wet-races.json")
    .then((r) => {
      if (!r.ok) throw Error(`Wet-race snapshot unavailable (HTTP ${r.status})`);
      return r.json() as Promise<WetFile>;
    })
    .catch((e) => { wetPromise = null; throw e; }));
function useWetFile() {
  const [state, set] = useState<{ loading: boolean; value?: WetFile; error?: string }>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadWet().then((value) => live && set({ loading: false, value })).catch((e) => live && set({ loading: false, error: String(e.message || e) }));
    return () => { live = false; };
  }, [attempt]);
  return { ...state, reload: () => { set({ loading: true }); setAttempt((x) => x + 1); } };
}

const envOf = (url: string, fetchedAt: string, status: string, source = "open-meteo"): Envelope<null> => ({ data: null, meta: { source, url, fetchedAt, status } });
const fmt1 = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d));
const signedPts = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`);
const fmtDate = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ───────────────────────── Page ───────────────────────── */
export default function Weather({ route }: { route: Route }) {
  useTitle("Weather impact");
  useAmbient("#0a84ff", "#64d2ff");
  const a = useArchive();
  const w = useWetFile();
  if (a.loading || w.loading || (!a.value && !a.error)) return <Page className="wi"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="wi"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  if (w.error || !w.value) return <Page className="wi"><ArchiveError error={w.error || "Wet-race snapshot unavailable"} onRetry={w.reload} /></Page>;
  return <WeatherView bundle={a.value} wet={w.value} route={route} />;
}

type RaceRow = { race: ARace; row: WetRow; score: number; wet: boolean };
type Rank = "edge" | "uplift" | "wetpts";
type Sort = "uplift" | "wetpts" | "drypts" | "wetfin" | "dryfin" | "wet" | "gain" | "edge";

function WeatherView({ bundle, wet, route }: { bundle: ArchiveBundle; wet: WetFile; route: Route }) {
  const { archive, envelope } = bundle;
  const q = route.query;
  const [mm, setMm] = useState(() => (WET_THRESHOLDS.map(String).includes(q.get("mm") || "") ? q.get("mm")! : String(DEFAULT_WET_MM)));
  const [era, setEra] = useState(eraById(q.get("era")).id);
  const [season, setSeason] = useState(q.get("year") || "all");
  const threshold = +mm;
  const range = season !== "all" ? { from: +season, to: +season } : eraById(era);
  const single = season !== "all";
  const [minWetPref, setMinWet] = useState<string | null>(null);
  const minWet = minWetPref ? +minWetPref : single ? 1 : era === "all" ? 5 : 3;
  const minDry = single ? 3 : 10;
  useEffect(() => { setQuery({ mm: mm === String(DEFAULT_WET_MM) ? null : mm, era: era === "all" ? null : era, year: season === "all" ? null : season }); }, [mm, era, season]);

  const byKey = useMemo(() => new Map(wet.races.map((r) => [r[0] + ":" + r[1], r])), [wet]);
  const all: RaceRow[] = useMemo(() => archive.races
    .filter((race) => !isIndy500(archive, race))
    .map((race) => {
      const row = byKey.get(race.season + ":" + race.round);
      return row ? { race, row, score: wetScore(row), wet: wetScore(row) >= threshold } : null;
    })
    .filter((x): x is RaceRow => !!x), [archive, byKey, threshold]);
  const rows = useMemo(() => all.filter((r) => r.race.season >= range.from && r.race.season <= range.to), [all, range.from, range.to]);
  const wetRows = rows.filter((r) => r.wet);
  const list: WetRace[] = useMemo(() => rows.map((r) => ({
    wet: r.wet,
    results: r.race.results.map((x) => ({ d: x.d, c: x.c, pos: x.pos, grid: x.grid, start: isStart(x) })),
  })), [rows]);
  const drivers = useMemo(() => wetDryTable(list, { by: "driver", minWet, minDry }), [list, minWet, minDry]);
  const teams = useMemo(() => wetDryTable(list, { by: "team", minWet: Math.max(1, Math.min(minWet, 3)), minDry }), [list, minWet, minDry]);
  const edges = useMemo(() => teammateWetEdge(list), [list]);
  const seasons = useMemo(() => [...new Set(all.map((r) => r.race.season))].sort((x, y) => y - x), [all]);
  const wettestAll = [...all].sort((x, y) => y.score - x.score)[0];

  // Wet share per decade (all time), for the hero figure.
  const decades = useMemo(() => {
    const m = new Map<number, { n: number; wet: number }>();
    for (const r of all) {
      const d = Math.floor(r.race.season / 10) * 10;
      const e = m.get(d) || m.set(d, { n: 0, wet: 0 }).get(d)!;
      e.n++;
      if (r.wet) e.wet++;
    }
    return [...m.entries()].sort((x, y) => x[0] - y[0]).map(([d, e]) => ({ d, ...e, share: e.n ? e.wet / e.n : 0 }));
  }, [all]);

  const wetEnv = envOf(wet.sourceUrl, wet.generatedAt, `Modelled snapshot ${wet.first}–${wet.last}`);
  const rangeLabel = single ? season : range.from === 1950 && range.to >= 9999 ? `${wet.first}–${wet.last}` : `${range.from}–${Math.min(range.to, wet.last)}`;

  return (
    <Page className="wi">
      <ArchiveHero
        eyebrow="Lab · Weather impact"
        icon={<CloudRain size={14} />}
        title="Rain masters"
        accent="Who rises when it pours"
        lede="Every Grand Prix since 1950 tagged wet or dry from modelled race-day rainfall at the circuit, then each driver and team compared on both — plus OpenF1's trackside rain sensors from 2023."
        photo={circuitMedia("spa").hero}
        tint="#0a84ff"
        stats={[
          { label: `Wet races · ≥ ${mm} mm`, value: <Counter value={all.filter((r) => r.wet).length} /> },
          { label: "Races modelled", value: <Counter value={all.length} /> },
          { label: "Wet share", value: <>{((all.filter((r) => r.wet).length / Math.max(1, all.length)) * 100).toFixed(0)}%</> },
        ]}
        figure={<RainGauge decades={decades} mm={mm} wettest={wettestAll} archive={archive} />}
      />

      <div className="arx-controls wi-controls reveal">
        <div className="wi-control">
          <span className="wi-label"><Droplets size={13} />Wet when modelled rain ≥</span>
          <Segmented label="Wet-race threshold" value={mm} onChange={setMm} options={WET_THRESHOLDS.map((t) => ({ value: String(t), label: `${t} mm` }))} />
        </div>
        <div className="wi-control">
          <span className="wi-label">Seasons</span>
          <div className="wi-range">
            <EraSwitch value={era} onChange={(e) => { setEra(e); setSeason("all"); }} />
            <select className="select wi-season" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Single season">
              <option value="all">Every season in range</option>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>
      <p className="wi-label-note faint xsmall"><Info size={12} />Wet = modelled precipitation ≥ {mm} mm during the race window (plus half of the two hours before lights out) at the circuit, from ERA5 reanalysis — <strong>not an official wet classification</strong>. {rangeLabel}: {plural(wetRows.length, "wet race")} of {rows.length}.</p>

      <Masters rows={drivers} edges={edges} archive={archive} minWet={minWet} />
      <DriverTable rows={drivers} edges={edges} archive={archive} minWet={minWet} minDry={minDry} onMinWet={setMinWet} env={envelope} wetEnv={wetEnv} />
      <TeamTable rows={teams} archive={archive} minDry={minDry} />
      <Wettest rows={rows} archive={archive} threshold={threshold} rangeLabel={rangeLabel} wetEnv={wetEnv} />
      <Measured archive={archive} byKey={byKey} threshold={threshold} />

      <Section id="wi-method" title="Method & sources">
        <Glass className="card wi-method reveal">
          <ul>
            <li><b>Modelled wet flag.</b> Hourly ERA5 reanalysis precipitation (Open-Meteo historical API, ≈ 31 km grid) at the circuit coordinates, summed over the race window — lights out to lights out + the winner's race time (2 h when unknown) — plus half of the two hours before the start. Official start times exist for {wet.races.filter((r) => r[6]).length} of {wet.races.length} races (2005 onward); earlier races assume a 14:00 local start.</li>
            <li><b>Limits.</b> Reanalysis smooths showers: short local downpours can be missed and a nearby shower can tag a dry race. It's a model, not race-control's wet declaration. The Indianapolis 500 (1950–60) is excluded.</li>
            <li><b>Points per start</b> use the 2010+ scale (25-18-15-12-10-8-6-4-2-1) for every era so seasons compare. <b>Uplift</b> = wet − dry points per start. <b>Team-mate edge</b> = share of head-to-heads won against the team-mate in the wet minus the share in the dry (both cars started; classified ahead or still running when the other wasn't) — it controls for the car.</li>
            <li><b>Measured (2023+).</b> OpenF1 trackside weather samples (about one a minute) per race session; a race counts as measured-wet when at least 10% of samples report rainfall. Wet-session pace is each driver's median lap excluding lap 1, pit laps and laps over 130% of the session's fastest.</li>
          </ul>
          <div className="wi-sources">
            <Source value={wetEnv} label="Modelled rainfall" />
            <Source value={envelope} label="Race results" />
          </div>
        </Glass>
      </Section>
    </Page>
  );
}

/* ───────────────────────── Hero figure: wet share by decade ───────────────────────── */
function RainGauge({ decades, mm, wettest, archive }: { decades: { d: number; n: number; wet: number; share: number }[]; mm: string; wettest?: RaceRow; archive: Archive }) {
  const max = Math.max(0.05, ...decades.map((d) => d.share));
  const winner = wettest?.race.results.find((r) => r.pos === 1);
  return (
    <Glass className="wi-gauge" strong>
      <span className="eyebrow"><Umbrella size={13} />Wet share by decade · ≥ {mm} mm</span>
      <div className="wi-gauge-bars" role="img" aria-label={decades.map((d) => `${d.d}s: ${d.wet} of ${d.n} races wet`).join(", ")}>
        {decades.map((d, i) => (
          <span key={d.d} className="wi-gauge-col" style={{ "--h": `${(d.share / max) * 100}%`, "--i": i } as CSSProperties} title={`${d.d}s · ${d.wet} of ${d.n} races`}>
            <b>{Math.round(d.share * 100)}%</b>
            <i />
            <small>{String(d.d).slice(2)}s</small>
          </span>
        ))}
      </div>
      {wettest && (
        <Link to={`race/${wettest.race.round}?season=${wettest.race.season}`} className="wi-gauge-top">
          <CloudRain size={15} />
          <span><small>Wettest in the model</small><strong>{wettest.race.season} {wettest.race.name}</strong></span>
          <b>{fmt1(wettest.score)}<small> mm</small></b>
          {winner && <span className="faint xsmall">won by {archive.drivers[winner.d]?.family}</span>}
        </Link>
      )}
    </Glass>
  );
}

/* ───────────────────────── Rain masters leaderboard ───────────────────────── */
function Masters({ rows, edges, archive, minWet }: { rows: WetDryRow[]; edges: ReturnType<typeof teammateWetEdge>; archive: Archive; minWet: number }) {
  const [rank, setRank] = useState<Rank>("edge");
  const scored = rows.map((r) => {
    const e = edges.get(r.id);
    const value = rank === "edge" ? (e && e.wet.n >= Math.max(1, minWet) && e.delta !== null ? e.delta : null) : rank === "uplift" ? r.uplift : r.wet.ptsPerStart;
    return { r, e, value };
  }).filter((x): x is { r: WetDryRow; e: ReturnType<typeof edges.get>; value: number } => x.value !== null).sort((x, y) => y.value - x.value).slice(0, 10);
  const max = Math.max(0.0001, ...scored.map((s) => s.value));
  return (
    <Section id="wi-masters" title="Rain masters" subtitle={`The drivers who rise most in the wet · minimum ${plural(minWet, "wet start")}.`}
      action={<Segmented label="Rank by" value={rank} onChange={setRank} options={[{ value: "edge", label: "Team-mate edge" }, { value: "uplift", label: "Points uplift" }, { value: "wetpts", label: "Wet points" }]} />}>
      {scored.length ? (
        <Glass className="card wi-masters reveal">
          <div className="wi-masters-list">
            {scored.map((s, i) => {
              const d = archive.drivers[s.r.id];
              const sub = rank === "edge"
                ? `Beat team-mate ${s.e!.wet.won}/${s.e!.wet.n} wet · ${s.e!.dry.won}/${s.e!.dry.n} dry`
                : `${s.r.wet.starts} wet starts · ${s.r.wet.wins} wins · ${fmt1(s.r.wet.ptsPerStart)} vs ${fmt1(s.r.dry.ptsPerStart)} pts/start dry`;
              return (
                <RankRow key={s.r.id} rank={i + 1} index={i} to={"driver/" + d.id} tint={teamColor(lastTeam(archive, s.r.id))}
                  media={<Face archive={archive} idx={s.r.id} size={36} />} name={d.name} sub={sub}
                  value={rank === "edge" ? Math.round(s.value * 1000) / 10 : Math.round(s.value * 10) / 10} max={rank === "edge" ? max * 100 : max}
                  unit={rank === "edge" ? "pp" : "pts/start"} />
              );
            })}
          </div>
          <p className="faint xsmall">
            {rank === "edge" ? "Percentage points: share of team-mate head-to-heads won in wet races minus the share in dry races. Controls for the car; needs both cars to start." :
              rank === "uplift" ? "Points per start in wet races minus dry races (2010+ scale for every era). Rain shuffles the order, so midfield drivers in quick cars tend to gain most." :
                "Points per start in wet races (2010+ scale). Rewards the best cars as much as the best drivers."}
          </p>
        </Glass>
      ) : <StateView empty emptyTitle="Not enough wet races" emptyText="No driver meets the minimum number of wet starts in this range. Lower the threshold or widen the seasons." />}
    </Section>
  );
}

/* ───────────────────────── Driver wet vs dry table ───────────────────────── */
function DriverTable({ rows, edges, archive, minWet, minDry, onMinWet, env, wetEnv }: {
  rows: WetDryRow[]; edges: ReturnType<typeof teammateWetEdge>; archive: Archive; minWet: number; minDry: number; onMinWet: (v: string) => void; env: Envelope<null>; wetEnv: Envelope<null>;
}) {
  const [sort, setSort] = useState<Sort>("uplift");
  const [desc, setDesc] = useState(true);
  const [shown, setShown] = useState(25);
  const val = (r: WetDryRow): number => {
    const e = edges.get(r.id);
    switch (sort) {
      case "uplift": return r.uplift;
      case "wetpts": return r.wet.ptsPerStart ?? -1;
      case "drypts": return r.dry.ptsPerStart ?? -1;
      case "wetfin": return -(r.wet.avgFinish ?? 99);
      case "dryfin": return -(r.dry.avgFinish ?? 99);
      case "wet": return r.wet.starts;
      case "gain": return (r.wet.avgGained ?? -99) - (r.dry.avgGained ?? 0);
      case "edge": return e?.delta ?? -9;
    }
  };
  const sorted = [...rows].sort((x, y) => (desc ? -1 : 1) * (val(x) - val(y)));
  const head = (key: Sort, label: string, title?: string) => (
    <th className="r" scope="col" title={title} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(true)))}>{label}<ArrowDownUp size={12} /></button>
    </th>
  );
  return (
    <Section id="wi-drivers" title="Wet vs dry, driver by driver" subtitle={`Average finish and points per start in each condition · at least ${plural(minWet, "wet start")} and ${minDry} dry.`}
      action={<Segmented label="Minimum wet starts" value={String(minWet)} onChange={onMinWet} options={["1", "3", "5", "10"].map((v) => ({ value: v, label: `${v}+ wet` }))} />}>
      {rows.length ? (
        <Glass className="card flush wi-table reveal">
          <div className="table-wrap" tabIndex={0}>
            <table className="tbl">
              <caption className="sr-only">Driver performance in modelled wet and dry races</caption>
              <thead>
                <tr>
                  <th scope="col">Driver</th>
                  {head("wet", "Wet starts")}
                  {head("wetfin", "Avg finish wet", "Average classified finishing position in wet races")}
                  {head("dryfin", "dry")}
                  {head("wetpts", "Pts/start wet", "Points per start, 2010+ scale")}
                  {head("drypts", "dry")}
                  {head("uplift", "Uplift", "Wet minus dry points per start")}
                  {head("gain", "Places gained", "Average places gained from the grid, wet vs dry (classified finishers)")}
                  {head("edge", "Team-mate H2H", "Head-to-heads won against the team-mate, wet vs dry")}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, shown).map((r) => {
                  const d = archive.drivers[r.id];
                  const e = edges.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td><Link to={"driver/" + d.id} className="wi-driver"><Face archive={archive} idx={r.id} size={30} /><span>{d.name}</span></Link></td>
                      <td className="r">{r.wet.starts}<small className="faint"> /{r.wet.starts + r.dry.starts}</small></td>
                      <td className="r">{fmt1(r.wet.avgFinish)}</td>
                      <td className="r faint">{fmt1(r.dry.avgFinish)}</td>
                      <td className="r"><b>{fmt1(r.wet.ptsPerStart)}</b></td>
                      <td className="r faint">{fmt1(r.dry.ptsPerStart)}</td>
                      <td className="r"><span className={cx("wi-delta", r.uplift > 0.05 ? "up" : r.uplift < -0.05 ? "down" : "")}>{signedPts(r.uplift)}</span></td>
                      <td className="r">{signedPts(r.wet.avgGained)}<small className="faint"> / {signedPts(r.dry.avgGained)}</small></td>
                      <td className="r">{e && e.wet.n ? <>{e.wet.won}/{e.wet.n}<small className="faint"> · {e.dry.won}/{e.dry.n}</small></> : <span className="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > shown && <div className="wi-more"><button className="btn sm" onClick={() => setShown((s) => s + 25)}>Show more · {sorted.length - shown} left</button></div>}
        </Glass>
      ) : <StateView empty emptyTitle="No drivers meet the minimums" emptyText="Lower the minimum wet starts or widen the season range." />}
      <Source value={env} label="Race results" />
      <Source value={wetEnv} label="Modelled rainfall" />
    </Section>
  );
}

/* ───────────────────────── Teams ───────────────────────── */
function TeamTable({ rows, archive, minDry }: { rows: WetDryRow[]; archive: Archive; minDry: number }) {
  const top = [...rows].sort((x, y) => y.uplift - x.uplift);
  const shown = top.length > 14 ? [...top.slice(0, 7), ...top.slice(-7)] : top;
  const max = Math.max(0.5, ...shown.map((r) => Math.abs(r.uplift)));
  const lastSeason = (idx: number) => {
    for (let i = archive.races.length - 1; i >= 0; i--) if (archive.races[i].results.some((r) => r.c === idx)) return String(archive.races[i].season);
    return "2026";
  };
  return (
    <Section id="wi-teams" title="Team wet performance" subtitle={`Each team's best-placed car per race: points per start in the wet against the dry · at least ${minDry} dry starts.${top.length > 14 ? " The seven biggest risers and fallers." : ""}`}>
      {shown.length ? (
        <Glass className="card wi-teams reveal">
          <ol className="wi-team-list">
            {shown.map((r, i) => {
              const t = archive.teams[r.id];
              const tint = teamColor(t?.id);
              return (
                <li key={r.id} className="wi-team" style={{ "--tint": tint, "--w": `${(Math.abs(r.uplift) / max) * 50}%`, "--i": i } as CSSProperties}>
                  <Link to={"team/" + t.id} className="wi-team-name"><TeamLogo id={t.id} name={t.name} year={lastSeason(r.id)} size={24} /><span>{t.name}</span></Link>
                  <span className={cx("wi-team-bar", r.uplift >= 0 ? "up" : "down")} aria-hidden><i /></span>
                  <span className="wi-team-val"><b className={cx("wi-delta", r.uplift > 0.05 ? "up" : r.uplift < -0.05 ? "down" : "")}>{signedPts(r.uplift)}</b><small>{fmt1(r.wet.ptsPerStart)} wet · {fmt1(r.dry.ptsPerStart)} dry · {r.wet.starts} wet races{r.wet.wins ? ` · ${r.wet.wins} wet wins` : ""}</small></span>
                </li>
              );
            })}
          </ol>
          <p className="faint xsmall">Points per start on the 2010+ scale. Bars grow right when the team scores more in the wet than in the dry.</p>
        </Glass>
      ) : <StateView empty emptyTitle="No teams meet the minimums" emptyText="Widen the season range to compare teams." />}
    </Section>
  );
}

/* ───────────────────────── Wettest races ───────────────────────── */
function Wettest({ rows, archive, threshold, rangeLabel, wetEnv }: { rows: RaceRow[]; archive: Archive; threshold: number; rangeLabel: string; wetEnv: Envelope<null> }) {
  const [n, setN] = useState(15);
  const list = [...rows].sort((x, y) => y.score - x.score).filter((r) => r.score > 0).slice(0, n);
  const max = Math.max(0.1, ...list.map((r) => r.score));
  return (
    <Section id="wi-wettest" title="The wettest races" subtitle={`${rangeLabel} · ranked by modelled rain in the race window. Dashed bars fall under the ${threshold} mm wet line.`}>
      {list.length ? (
        <Glass className="card flush wi-wettest reveal">
          <ol className="wi-race-list">
            {list.map((r, i) => {
              const w = r.race.results.find((x) => x.pos === 1);
              const c = archive.circuits[r.race.circuit];
              return (
                <li key={r.race.season + ":" + r.race.round} className={cx("wi-race", !r.wet && "dry")} style={{ "--w": `${(r.score / max) * 100}%`, "--tint": teamColor(w ? archive.teams[w.c]?.id : undefined) } as CSSProperties}>
                  <span className="wi-race-rank">{i + 1}</span>
                  <span className="wi-race-main">
                    <Link to={`race/${r.race.round}?season=${r.race.season}`} className="wi-race-name">{r.race.season} {r.race.name}</Link>
                    <small>{c?.name} · {fmtDate(r.race.date)}{r.row[6] ? "" : " · start time assumed"}{r.row[7] !== null ? ` · ${r.row[7]}°C` : ""}</small>
                    <span className="wi-race-bar"><i /></span>
                  </span>
                  {w && (
                    <Link to={"driver/" + archive.drivers[w.d].id} className="wi-race-winner">
                      <Face archive={archive} idx={w.d} size={30} year={r.race.season} team={w.c} />
                      <span><small><Trophy size={11} />Winner</small><strong>{archive.drivers[w.d].family}</strong></span>
                    </Link>
                  )}
                  <span className="wi-race-mm"><b>{fmt1(r.score)}</b><small>mm · peak {fmt1(r.row[5])}/h</small></span>
                </li>
              );
            })}
          </ol>
          {rows.filter((r) => r.score > 0).length > n && <div className="wi-more"><button className="btn sm" onClick={() => setN((x) => x + 15)}>Show more</button></div>}
        </Glass>
      ) : <StateView empty emptyTitle="No modelled rain" emptyText="The reanalysis shows no rain during any race in this range." />}
      <Source value={wetEnv} label="Modelled rainfall" />
    </Section>
  );
}

/* ───────────────────────── Measured (OpenF1, 2023+) ───────────────────────── */
type MeasuredRace = { session: Session; race?: ARace; rain: ReturnType<typeof sessionRain>; modelled: number | null; failed: boolean };
type PaceRow = { code: string; idx: number | null; team: number | null; median: number; gapPct: number; gained: number | null };

function Measured({ archive, byKey, threshold }: { archive: Archive; byKey: Map<string, WetRow>; threshold: number }) {
  const current = new Date().getUTCFullYear();
  const years = Array.from({ length: current - 2022 }, (_, i) => String(current - i));
  const [year, setYear] = useState(years.includes("2025") ? "2025" : years[0]);
  const [state, set] = useState<{ year: string; loading: boolean; done: number; total: number; list?: MeasuredRace[]; error?: string; meta?: Envelope<unknown>["meta"] }>({ year: "", loading: false, done: 0, total: 0 });
  const [pace, setPace] = useState<{ key: string; loading: boolean; done: number; total: number; data?: Map<number, PaceRow[]>; error?: string }>({ key: "", loading: false, done: 0, total: 0 });
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const load = async () => {
    set({ year, loading: true, done: 0, total: 1 });
    try {
      const s = await sessions(year);
      const races = s.data.filter((x) => x.session_name === "Race").sort((x, y) => Date.parse(x.date_start) - Date.parse(y.date_start));
      if (!races.length) throw Error(`OpenF1 has no archived race sessions for ${year} yet.`);
      const out: MeasuredRace[] = [];
      let meta: Envelope<unknown>["meta"] | undefined;
      for (let i = 0; i < races.length; i++) {
        if (!live.current) return;
        set((st) => ({ ...st, done: i + 1, total: races.length }));
        const w = await request<WeatherSample[]>("openf1", "weather", { session_key: races[i].session_key }).catch(() => null);
        meta ??= w?.meta;
        const day = races[i].date_start.slice(0, 10);
        const race = archive.races.find((r) => r.season === +year && Math.abs(Date.parse(r.date) - Date.parse(day)) <= 864e5);
        const row = race ? byKey.get(race.season + ":" + race.round) : undefined;
        out.push({ session: races[i], race, rain: sessionRain(w?.data || []), modelled: row ? wetScore(row) : null, failed: !w });
      }
      if (live.current) set({ year, loading: false, done: races.length, total: races.length, list: out, meta });
    } catch (e) {
      if (live.current) set({ year, loading: false, done: 0, total: 0, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const fresh = state.year === year;
  const list = fresh ? state.list : undefined;
  const wetSessions = (list || []).filter((m) => m.rain.wet);

  const loadPace = async () => {
    const key = year;
    setPace({ key, loading: true, done: 0, total: wetSessions.length * 3 });
    try {
      const data = new Map<number, PaceRow[]>();
      let done = 0;
      for (const m of wetSessions) {
        const sk = m.session.session_key;
        const drivers = await request<{ driver_number: number; name_acronym: string; full_name: string }[]>("openf1", "drivers", { session_key: sk });
        setPace((p) => ({ ...p, done: ++done }));
        const laps = await request<Lap[]>("openf1", "laps", { session_key: sk });
        setPace((p) => ({ ...p, done: ++done }));
        const pits = await request<{ driver_number: number; lap_number: number }[]>("openf1", "pit", { session_key: sk });
        setPace((p) => ({ ...p, done: ++done }));
        const rows = sessionPace(laps.data || [], pits.data || []);
        data.set(sk, rows.map((r) => {
          const d = (drivers.data || []).find((x) => x.driver_number === r.driver);
          const res = m.race?.results.find((x) => {
            const ad = archive.drivers[x.d];
            return !!d && (ad.code === d.name_acronym || d.full_name.toLowerCase().endsWith(ad.family.toLowerCase()));
          });
          return { code: d?.name_acronym || "#" + r.driver, idx: res?.d ?? null, team: res?.c ?? null, median: r.median, gapPct: r.gapPct, gained: res && res.pos !== null && res.grid > 0 ? res.grid - res.pos : null };
        }));
      }
      if (live.current) setPace({ key, loading: false, done, total: done, data });
    } catch (e) {
      if (live.current) setPace({ key, loading: false, done: 0, total: 0, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const paceFresh = pace.key === year;

  const hottest = (list || []).filter((m) => m.rain.track.max !== null).sort((x, y) => y.rain.track.max! - x.rain.track.max!)[0];
  const agreement = (list || []).filter((m) => m.modelled !== null && !m.failed && m.rain.samples > 0);
  const failed = (list || []).filter((m) => m.failed).length;
  const agree = agreement.filter((m) => m.rain.wet === m.modelled! >= threshold).length;

  return (
    <Section id="wi-measured" title="Measured at the track · 2023 onward" subtitle="OpenF1 publishes the trackside weather station feed — rainfall flag, track and air temperature — for every session. Here it checks the model and measures pace in the wet."
      action={<select className="select wi-season" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Season for measured weather">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}>
      {!fresh || (!state.loading && !list && !state.error) ? (
        <Glass className="wi-cta reveal">
          <span className="wi-cta-icon"><CloudSun /></span>
          <div>
            <h3>Load the {year} weather station data</h3>
            <p className="muted small">One OpenF1 request per race (about two dozen, queued to respect the provider's limit — roughly a minute).</p>
          </div>
          <button className="btn primary" onClick={load}><Gauge />Load measured weather</button>
        </Glass>
      ) : state.loading ? (
        <Glass className="card wi-loading" role="status" aria-live="polite">
          <div className="wi-progress"><Loader2 className="wi-spin" /><span><strong>Race {state.done} of {state.total}</strong><small className="faint">OpenF1 weather samples · queued requests</small></span></div>
          <div className="wi-progress-track"><i style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} /></div>
          <Skeleton h={260} r={20} />
        </Glass>
      ) : state.error ? (
        <StateView error={state.error} onRetry={load} />
      ) : list ? (
        <>
          <div className="wi-kpis">
            <Glass className="kpi reveal"><span className="label"><CloudRain size={13} />Measured-wet races</span><span className="value">{wetSessions.length}</span><span className="detail">of {list.length} · rain in ≥ 10% of samples</span></Glass>
            <Glass className="kpi reveal" style={{ "--i": 1 } as CSSProperties}><span className="label"><Thermometer size={13} />Hottest track</span><span className="value">{hottest ? `${fmt1(hottest.rain.track.max, 0)}°C` : "—"}</span><span className="detail">{hottest ? hottest.race?.name || hottest.session.location : "No track temperatures published"}</span></Glass>
            <Glass className="kpi reveal" style={{ "--i": 2 } as CSSProperties}><span className="label"><Info size={13} />Model agreement</span><span className="value">{agreement.length ? `${agree}/${agreement.length}` : "—"}</span><span className="detail">{agreement.length ? `races where ERA5 (≥ ${threshold} mm) and the track sensor agree` : "No modelled data for this season yet"}</span></Glass>
          </div>
          <Glass className="card flush wi-measured reveal">
            <ol className="wi-m-list">
              {list.map((m) => {
                const modelWet = m.modelled !== null ? m.modelled >= threshold : null;
                return (
                  <li key={m.session.session_key} className={cx("wi-m-row", m.rain.wet && "wet")} style={{ "--w": `${Math.min(100, m.rain.share * 100)}%` } as CSSProperties}>
                    <span className="wi-m-name">
                      {m.race ? <Link to={`race/${m.race.round}?season=${m.race.season}`}>{m.race.name.replace(/ Grand Prix$/, " GP")}</Link> : <span>{m.session.location}</span>}
                      <small>{fmtDate(m.session.date_start.slice(0, 10))}</small>
                    </span>
                    <span className="wi-m-rain" title={`${m.rain.rainSamples} of ${m.rain.samples} samples with rainfall`}>
                      <span className="wi-m-bar"><i /></span>
                      <small>{m.failed ? "Couldn't load — retry below" : m.rain.samples ? `${Math.round(m.rain.share * 100)}% of samples wet` : "No weather samples published"}</small>
                    </span>
                    <span className="wi-m-temp"><Thermometer size={13} />{m.rain.track.min !== null ? `${fmt1(m.rain.track.min, 0)}–${fmt1(m.rain.track.max, 0)}°C` : "—"}</span>
                    <span className="wi-m-model">
                      {modelWet === null ? <span className="faint xsmall">Not modelled</span> : (
                        <span className={cx("wi-agree", modelWet === m.rain.wet ? "ok" : "no")} title={`Modelled ${fmt1(m.modelled)} mm`}>
                          Model {modelWet ? "wet" : "dry"} · {fmt1(m.modelled)} mm
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Glass>
          {wetSessions.length > 0 && (
            <div className="wi-pace">
              <div className="wi-pace-head">
                <h3><Users size={16} />Pace in the wet races</h3>
                {!paceFresh || (!pace.loading && !pace.data && !pace.error) ? (
                  <button className="btn sm primary" onClick={loadPace}><Gauge />Load lap pace · {plural(wetSessions.length, "race")}</button>
                ) : pace.loading ? <span className="small muted"><Loader2 className="wi-spin" size={14} />Request {pace.done} of {pace.total}</span> : null}
              </div>
              {paceFresh && pace.error && <StateView compact error={pace.error} onRetry={loadPace} />}
              {paceFresh && pace.data && (
                <div className="wi-pace-grid">
                  {wetSessions.map((m) => {
                    const rows = pace.data!.get(m.session.session_key) || [];
                    return (
                      <Glass key={m.session.session_key} className="card wi-pace-card reveal">
                        <span className="eyebrow"><CloudRain size={13} />{m.race?.name || m.session.location}</span>
                        {rows.length ? (
                          <ol className="wi-pace-list">
                            {rows.slice(0, 10).map((r, i) => (
                              <li key={r.code} style={{ "--tint": teamColor(r.team !== null ? archive.teams[r.team]?.id : undefined) } as CSSProperties}>
                                <span className="wi-pace-pos">{i + 1}</span>
                                {r.idx !== null ? <Face archive={archive} idx={r.idx} size={24} year={m.race?.season} team={r.team ?? undefined} /> : <i className="wi-pace-sw" />}
                                <strong>{r.code}</strong>
                                <span className="wi-pace-gap">{i === 0 ? "Benchmark" : `+${r.gapPct.toFixed(2)}%`}</span>
                                <span className={cx("wi-delta", r.gained !== null && r.gained > 0 ? "up" : r.gained !== null && r.gained < 0 ? "down" : "")} title="Places gained from the grid">{r.gained === null ? "—" : signedPts(r.gained, 0)}</span>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="muted small">Not enough clean laps to rank pace.</p>}
                      </Glass>
                    );
                  })}
                </div>
              )}
              <p className="faint xsmall">Median clean lap against the best median in the race (lap 1, pit laps and laps over 130% of the fastest excluded) — mixes wet and dry phases of the race. Right-hand figure: places gained from the grid.</p>
            </div>
          )}
          {failed > 0 && <div className="notice wi-failed"><Info /><span>{plural(failed, "race")} couldn't be loaded from OpenF1 (rate limit or outage). <button className="btn sm" onClick={load}>Retry</button></span></div>}
          <Source value={state.meta ? { data: null, meta: state.meta } : undefined} label="Trackside weather" />
        </>
      ) : null}
    </Section>
  );
}
