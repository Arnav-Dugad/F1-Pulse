import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Crown, FlaskConical, Info, Minus, Scale } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { ordinal, plural, pts } from "../lib/format";
import {
  champions, fmtPct, MODERN_POINTS, normalisedChampions, rescoreSeason, useArchive, type Archive, type ArchiveBundle, type Rescored,
} from "../lib/archive";
import { Counter, Glass, Page, Section, Source, cx, useAmbient, useTitle } from "../ui/core";
import { Flag } from "../ui/media";
import { LineChart } from "../ui/charts";
import { ArchiveError, ArchiveHero, ArchiveLoading, Columns, Face } from "./_archive-ui";
import "./eras.css";

const SYSTEM_LABEL = MODERN_POINTS.join("-");

export default function Eras({ route }: { route: Route }) {
  useTitle("Across Eras");
  useAmbient("#bf5af2", "#0a84ff");
  const a = useArchive();
  if (a.loading || (!a.value && !a.error)) return <Page className="er"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="er"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  return <ErasView bundle={a.value} route={route} />;
}

function ErasView({ bundle, route }: { bundle: ArchiveBundle; route: Route }) {
  const { archive, history, envelope } = bundle;
  const champs = useMemo(() => champions(history), [history]);
  const norm = useMemo(() => normalisedChampions(archive, champs), [archive, champs]);
  const complete = norm.filter((n) => n.complete);
  const flips = complete.filter((n) => n.rescoredLeader !== n.champion);
  const top = [...complete].sort((x, y) => y.perStart - x.perStart)[0];
  return (
    <Page className="er">
      <ArchiveHero
        eyebrow="Archive · Across eras"
        icon={<Scale size={14} />}
        title="Across eras"
        accent="One points system for every season"
        lede={<>A what-if normalisation: every Grand Prix since 1950 rescored with today's {SYSTEM_LABEL} (top ten, no fastest-lap or sprint points), so champions from different eras can be compared on one scale.</>}
        photo={circuitMedia("spa").hero}
        tint="#bf5af2"
        stats={[
          { label: "Seasons rescored", value: <Counter value={norm.length} /> },
          { label: "Titles that would change", value: <Counter value={flips.length} /> },
          { label: "Best pts / start", value: top ? <Counter value={top.perStart} decimals={1} /> : "—" },
        ]}
        figure={top && <TopChampion archive={archive} season={top.season} idx={top.champion} perStart={top.perStart} />}
      />
      <p className="notice er-disclaimer reveal" role="note"><FlaskConical /><span><b>What-if normalisation, not official results.</b> Teams and drivers raced to the rules of their day — reliability, calendar length, scoring places and dropped scores all changed — so rescored tables show relative dominance, not alternative history.</span></p>

      <RescoreSeason archive={archive} history={history} route={route} />
      <Source value={envelope} label="Race results & final standings" />

      <ChampionsChart archive={archive} norm={norm} flips={flips} />
      <Source value={envelope} label="Race results & final standings" />

      <CrossEra archive={archive} route={route} />
      <Source value={envelope} label="Race results" />
    </Page>
  );
}

function TopChampion({ archive, season, idx, perStart }: { archive: Archive; season: number; idx: number; perStart: number }) {
  const d = archive.drivers[idx];
  return (
    <Link to={"driver/" + d.id} className="er-top reveal" style={{ "--tint": "#bf5af2" } as CSSProperties}>
      <span className="er-top-label"><Crown size={13} />Most dominant champion, normalised</span>
      <Face archive={archive} idx={idx} size={128} year={season} className="er-top-face" />
      <strong>{d.name}</strong>
      <span className="er-top-sub">{season} · {perStart.toFixed(1)} of a possible 25 points per start</span>
      <span className="er-top-meter" aria-hidden><span style={{ width: `${(perStart / 25) * 100}%` }} /></span>
    </Link>
  );
}

/* ───────────────────────── Rescore one season ───────────────────────── */
function RescoreSeason({ archive, history, route }: { archive: Archive; history: ArchiveBundle["history"]; route: Route }) {
  const seasons = archive.seasons;
  const q = Number(route.query.get("season"));
  const [season, setSeason] = useState(seasons.includes(q) ? q : 1988);
  const [focus, setFocus] = useState<string | null>(null);
  const r = useMemo(() => rescoreSeason(archive, season), [archive, season]);
  const complete = !!history.drivers[season];
  const official = (v: Rescored) => {
    const row = history.drivers[season]?.find((x) => x[0] === archive.drivers[v.idx].id);
    return row ? { pos: /^\d+$/.test(row[1]) ? +row[1] : null, points: row[2] } : null;
  };
  const list = r.list.filter((v) => v.points > 0 || (official(v)?.points ?? v.actual) > 0).slice(0, 15);
  const champ = r.list.find((v) => official(v)?.pos === 1);
  const flip = complete && champ && r.list[0].idx !== champ.idx;
  const top6 = r.list.slice(0, 6);
  const seen = new Set<string>();
  const series = top6.map((v) => {
    const c = teamColor(archive.teams[v.team]?.id);
    const dashed = seen.has(c);
    seen.add(c);
    return { id: String(v.idx), name: archive.drivers[v.idx].family, color: c, dashed, values: v.trace };
  });
  const races = archive.races.filter((x) => x.season === season);
  const change = (y: number) => { setSeason(y); setQuery({ season: String(y) }); };
  return (
    <Section id="rescore" title="Rescore a season" subtitle="The official table next to the same season under the modern points system."
      action={
        <label className="er-season">
          <span className="sr-only">Season</span>
          <select className="select" value={season} onChange={(e) => change(+e.target.value)}>
            {[...seasons].reverse().map((y) => <option key={y} value={y}>{y}{archive.live.includes(y) ? " (in progress)" : ""}</option>)}
          </select>
        </label>
      }>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={season} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          {flip && champ && (
            <div className="er-flip reveal" style={{ "--tint": teamColor(archive.teams[r.list[0].team]?.id) } as CSSProperties}>
              <Crown />
              <span><b>Under {SYSTEM_LABEL} scoring, {archive.drivers[r.list[0].idx].name}</b> would have beaten the official champion {archive.drivers[champ.idx].name} by {pts(r.list[0].points - champ.points)} points.</span>
            </div>
          )}
          <div className="split er-rescore">
            <Glass className="card flush reveal">
              <div className="table-wrap">
                <table className="tbl er-table">
                  <caption className="sr-only">{season} drivers rescored with the modern points system</caption>
                  <thead>
                    <tr><th>#</th><th>Driver</th><th className="r">2010+ pts</th><th className="r">Official</th><th className="r">Change</th></tr>
                  </thead>
                  <tbody>
                    {list.map((v) => {
                      const o = official(v);
                      const d = archive.drivers[v.idx];
                      const delta = o?.pos ? o.pos - v.rank : null;
                      return (
                        <tr key={v.idx}>
                          <td><span className={cx("pos", v.rank <= 3 && "p" + v.rank)}>{v.rank}</span></td>
                          <td>
                            <Link to={"driver/" + d.id} className="er-driver" style={{ "--tint": teamColor(archive.teams[v.team]?.id) } as CSSProperties}>
                              <i className="team-bar" />
                              <span><strong>{d.name}</strong><small>{archive.teams[v.team]?.name} · {plural(v.wins, "win")}</small></span>
                            </Link>
                          </td>
                          <td className="r"><b>{v.points}</b></td>
                          <td className="r">{o ? <>{pts(o.points)} <small className="faint">{o.pos ? ordinal(o.pos) : "—"}</small></> : <>{pts(v.actual)} <small className="faint">so far</small></>}</td>
                          <td className="r">
                            {delta === null ? <span className="faint">—</span> : delta === 0 ? <span className="er-delta level" aria-label="No change"><Minus size={12} /></span> : (
                              <span className={cx("er-delta", delta > 0 ? "up" : "down")} aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)}`}>{delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(delta)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Glass>
            <Glass className="card reveal" style={{ "--i": 1 } as CSSProperties}>
              <div className="card-title"><h3>Normalised title race</h3><span className="eyebrow">Cumulative 2010+ pts</span></div>
              <div className="legend er-legend">
                {series.map((s) => (
                  <button key={s.id} type="button" onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)}>
                    <i className="swatch" style={{ "--c": s.color } as CSSProperties} />{s.name}{s.dashed ? " (dashed)" : ""}
                  </button>
                ))}
              </div>
              <LineChart
                ariaLabel={`${season} cumulative points under the modern points system for the top six drivers`}
                series={series}
                labels={races.map((x) => "R" + x.round)}
                tooltipTitle={(i) => `${races[i]?.name || ""} · R${races[i]?.round}`}
                focus={focus}
                onFocus={setFocus}
                height={320}
              />
              <p className="arx-note"><Info />Official column: final points after that season's rules{complete ? "" : " (season in progress: points so far, incl. sprints)"}. Rescored: Grand Prix finishes only, every race counts.</p>
            </Glass>
          </div>
        </motion.div>
      </AnimatePresence>
    </Section>
  );
}

/* ───────────────────────── Champions across history ───────────────────────── */
function ChampionsChart({ archive, norm, flips }: { archive: Archive; norm: ReturnType<typeof normalisedChampions>; flips: ReturnType<typeof normalisedChampions> }) {
  const [table, setTable] = useState(false);
  const labels = norm.map((n) => String(n.season));
  return (
    <Section id="champions" title="Champions on one scale" subtitle="Each champion's average points per start and winning margin, rescored with the modern system.">
      <Glass className="card reveal">
        <div className="spread er-chart-head">
          <div className="legend"><span><i className="swatch" style={{ "--c": "var(--purple)" } as CSSProperties} />Champion's 2010+ points per start (max 25)</span></div>
          <button type="button" className="btn sm" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
        </div>
        {table ? (
          <div className="table-wrap er-hist-table">
            <table className="tbl">
              <thead><tr><th>Season</th><th>Champion</th><th className="r">2010+ pts</th><th className="r">Per start</th><th className="r">Margin</th><th className="r">Share of max</th></tr></thead>
              <tbody>
                {[...norm].reverse().map((n) => (
                  <tr key={n.season}>
                    <td>{n.season}</td>
                    <td>{archive.drivers[n.champion]?.name}{!n.complete && <span className="arx-badge er-inline">leader · in progress</span>}</td>
                    <td className="r">{n.points}</td>
                    <td className="r">{n.perStart.toFixed(1)}</td>
                    <td className="r">{n.margin > 0 ? "+" : ""}{n.margin}</td>
                    <td className="r">{fmtPct(n.maxShare, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <LineChart
              ariaLabel="Champion's normalised points per start for every season"
              series={[{ id: "ps", name: "Points per start", color: "var(--purple)", values: norm.map((n) => Math.round(n.perStart * 10) / 10) }]}
              labels={labels}
              yMin={0}
              yMax={25}
              area
              height={300}
              yFormat={(v) => v.toFixed(0)}
              tooltipTitle={(i) => `${norm[i].season} · ${archive.drivers[norm[i].champion]?.name}${norm[i].complete ? "" : " (leader)"}`}
            />
            <h3 className="er-sub">Normalised margin over the runner-up (points)</h3>
            <Columns
              ariaLabel="Champion's normalised points margin over the runner-up in each season; negative margins are not drawn"
              labels={labels}
              values={norm.map((n) => (n.margin > 0 ? n.margin : null))}
              colors={norm.map((n) => (n.rescoredLeader !== n.champion && n.complete ? "var(--orange)" : "var(--purple)"))}
              height={200}
              tooltip={(i) => (
                <>
                  <div className="t-title">{norm[i].season} · {archive.drivers[norm[i].champion]?.name}</div>
                  <div className="t-row"><span>Margin</span><b>{norm[i].margin > 0 ? "+" : ""}{norm[i].margin}</b></div>
                  <div className="t-row"><span>Per start</span><b>{norm[i].perStart.toFixed(1)}</b></div>
                </>
              )}
            />
          </>
        )}
        <p className="arx-note"><Info />Champions are the official title winners of completed seasons{archive.live.length ? ` (${archive.live.join(", ")}: current points leader)` : ""}. Margins are against the best other driver in the rescored table; seasons where the official champion would trail are listed below and excluded from the bars.</p>
      </Glass>
      {flips.length > 0 && (
        <div className="er-flips">
          <h3 className="er-sub">Titles that would change hands</h3>
          <div className="er-flip-grid">
            {flips.map((n, i) => {
              const r = rescoreSeason(archive, n.season);
              const lead = r.list[0], champ = r.list.find((v) => v.idx === n.champion);
              return (
                <Glass key={n.season} className="er-flip-card reveal" style={{ "--i": i % 8, "--tint": teamColor(archive.teams[lead.team]?.id) } as CSSProperties}>
                  <span className="er-flip-year">{n.season}</span>
                  <span className="er-flip-who"><Face archive={archive} idx={lead.idx} size={34} year={n.season} team={lead.team} /><span><strong>{archive.drivers[lead.idx].family}</strong><small>{lead.points} pts rescored</small></span></span>
                  <span className="faint xsmall">Official champion {archive.drivers[n.champion].name} · {champ?.points ?? 0} pts rescored</span>
                </Glass>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ───────────────────────── Cross-era duel ───────────────────────── */
type Pick = { season: number; id: string };
const parsePick = (v: string | null, fallback: Pick): Pick => {
  const [s, id] = (v || "").split(":");
  return +s && id ? { season: +s, id } : fallback;
};
function CrossEra({ archive, route }: { archive: Archive; route: Route }) {
  const [a, setA] = useState(() => parsePick(route.query.get("a"), { season: 2023, id: "max_verstappen" }));
  const [b, setB] = useState(() => parsePick(route.query.get("b"), { season: 1988, id: "senna" }));
  const [focus, setFocus] = useState<string | null>(null);
  const side = (p: Pick) => {
    const r = rescoreSeason(archive, p.season);
    const idx = archive.driverIndex.get(p.id);
    const v = r.list.find((x) => x.idx === idx) || null;
    return { r, v };
  };
  const A = useMemo(() => side(a), [archive, a]);
  const B = useMemo(() => side(b), [archive, b]);
  const update = (which: "a" | "b", p: Pick) => {
    (which === "a" ? setA : setB)(p);
    setQuery({ [which]: `${p.season}:${p.id}` });
  };
  const len = Math.max(A.r.races, B.r.races);
  const ca = A.v ? teamColor(archive.teams[A.v.team]?.id) : "var(--accent)";
  let cb = B.v ? teamColor(archive.teams[B.v.team]?.id) : "var(--blue)";
  if (cb === ca) cb = "#9aa3b2";
  const series = [
    A.v && { id: "a", name: `${archive.drivers[A.v.idx].family} ${a.season}`, color: ca, values: Array.from({ length: len }, (_, i) => (i < A.v!.trace.length ? A.v!.trace[i] : null)) },
    B.v && { id: "b", name: `${archive.drivers[B.v.idx].family} ${b.season}`, color: cb, dashed: true, values: Array.from({ length: len }, (_, i) => (i < B.v!.trace.length ? B.v!.trace[i] : null)) },
  ].filter(Boolean) as { id: string; name: string; color: string; values: (number | null)[]; dashed?: boolean }[];
  return (
    <Section id="cross-era" title="Cross-era duel" subtitle="Pick two seasons and a driver from each — both rescored with the modern system.">
      <div className="split even er-duel-pickers">
        <SidePick archive={archive} label="Driver A" pick={a} result={A} onChange={(p) => update("a", p)} tint={ca} />
        <SidePick archive={archive} label="Driver B" pick={b} result={B} onChange={(p) => update("b", p)} tint={cb} />
      </div>
      <Glass className="card reveal er-duel">
        {A.v && B.v ? (
          <>
            <div className="er-duel-stats">
              {([
                ["2010+ points", A.v.points, B.v.points, (x: number) => String(x)],
                ["Per start", A.v.points / Math.max(1, A.v.starts), B.v.points / Math.max(1, B.v.starts), (x: number) => x.toFixed(1)],
                ["Win rate", A.v.wins / Math.max(1, A.v.starts), B.v.wins / Math.max(1, B.v.starts), (x: number) => fmtPct(x, 0)],
                ["Podium rate", A.v.podiums / Math.max(1, A.v.starts), B.v.podiums / Math.max(1, B.v.starts), (x: number) => fmtPct(x, 0)],
                ["Share of max", A.v.points / (A.r.races * 25), B.v.points / (B.r.races * 25), (x: number) => fmtPct(x, 0)],
              ] as [string, number, number, (x: number) => string][]).map(([label, x, y, f]) => (
                <div key={label} className="er-duel-stat" style={{ "--a": ca, "--b": cb } as CSSProperties}>
                  <b className={cx(x > y && "lead")}>{f(x)}</b>
                  <span>{label}</span>
                  <b className={cx(y > x && "lead")}>{f(y)}</b>
                </div>
              ))}
            </div>
            <LineChart
              ariaLabel="Cumulative normalised points by round for the two chosen driver-seasons"
              series={series}
              labels={Array.from({ length: len }, (_, i) => String(i + 1))}
              tooltipTitle={(i) => `Round ${i + 1}`}
              focus={focus}
              onFocus={setFocus}
              height={300}
            />
            <p className="arx-note"><Info />X axis = round number of each season ({a.season}: {A.r.races} races, {b.season}: {B.r.races}). “Share of max” = rescored points ÷ (races × 25), so calendar length doesn't flatter longer seasons.</p>
          </>
        ) : <p className="muted">Choose a driver who started a race in each selected season.</p>}
      </Glass>
    </Section>
  );
}

function SidePick({ archive, label, pick, result, onChange, tint }: {
  archive: Archive; label: string; pick: Pick; result: { r: ReturnType<typeof rescoreSeason>; v: Rescored | null }; onChange: (p: Pick) => void; tint: string;
}) {
  const options = result.r.list.filter((v) => v.starts > 0);
  return (
    <Glass className="card er-side reveal" style={{ "--tint": tint } as CSSProperties}>
      <span className="eyebrow">{label}</span>
      <div className="er-side-fields">
        <label className="field">
          <span>Season</span>
          <select className="select" value={pick.season} onChange={(e) => {
            const season = +e.target.value;
            const r = rescoreSeason(archive, season);
            const keep = r.list.some((v) => archive.drivers[v.idx].id === pick.id);
            onChange({ season, id: keep ? pick.id : archive.drivers[r.list[0]?.idx ?? 0].id });
          }}>
            {[...archive.seasons].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Driver</span>
          <select className="select" value={pick.id} onChange={(e) => onChange({ season: pick.season, id: e.target.value })}>
            {!result.v && <option value={pick.id}>Not in {pick.season}</option>}
            {options.map((v) => <option key={v.idx} value={archive.drivers[v.idx].id}>{v.rank}. {archive.drivers[v.idx].name}</option>)}
          </select>
        </label>
      </div>
      {result.v && (
        <div className="er-side-who">
          <Face archive={archive} idx={result.v.idx} size={48} year={pick.season} team={result.v.team} />
          <span><strong>{archive.drivers[result.v.idx].name}</strong><small><Flag nationality={archive.drivers[result.v.idx].nat} />{archive.teams[result.v.team]?.name} · rescored {ordinal(result.v.rank)}</small></span>
        </div>
      )}
    </Glass>
  );
}
