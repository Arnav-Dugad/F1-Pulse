import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronRight, GitBranch, Info, Trophy } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, isLightColor, teamColor, teamShortName } from "../lib/media";
import { ordinal, plural, pts } from "../lib/format";
import { constructorSeasons, lineageSeasons, useArchive, type Archive, type ArchiveBundle, type LineageSeason } from "../lib/archive";
import { LINEAGES, type Lineage as LineageDef } from "../lib/archive-lineage";
import { Counter, Glass, Page, Section, Segmented, Source, cx, useAmbient, useTitle } from "../ui/core";
import { TeamLogo } from "../ui/media";
import { LineChart } from "../ui/charts";
import { ArchiveError, ArchiveHero, ArchiveLoading, Columns } from "./_archive-ui";
import "./lineage.css";

type Step = { constructorId: string; name: string; from: number; to: number; source?: string; color: string };
type Line = { def: LineageDef; steps: Step[]; seasons: LineageSeason[]; titles: number[]; driverTitles: { season: number; driver: string }[]; positions: Map<number, number>; from: number; to: number };

export default function Lineage({ route }: { route: Route }) {
  useTitle("Team lineage");
  const a = useArchive();
  const lines = useMemo(() => (a.value ? buildLines(a.value) : []), [a.value]);
  const team = route.query.get("team");
  const fromTeam = team ? lines.find((l) => l.steps.some((s) => s.constructorId === team)) : undefined;
  const [selected, setSelected] = useState<string | null>(route.query.get("line"));
  const current = lines.find((l) => l.def.id === (selected ?? fromTeam?.def.id)) || lines[0];
  useAmbient(current?.steps.at(-1)?.color || "#64d2ff", current?.steps[0]?.color);

  if (a.loading || (!a.value && !a.error)) return <Page className="ln"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="ln"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  const select = (id: string) => { setSelected(id); setQuery({ line: id, team: null }); };
  return <LineageView bundle={a.value} lines={lines} current={current} onSelect={select} team={team} matched={!!fromTeam && selected === null} />;
}

function buildLines({ archive, history }: ArchiveBundle): Line[] {
  // Live-season constructor ranks from points scored so far (race + sprint).
  const liveRank = new Map<number, Map<string, number>>();
  for (const season of archive.live) {
    const totals = new Map<string, number>();
    for (const race of archive.races) if (race.season === season) for (const r of [...race.results, ...race.sprint]) {
      const id = archive.teams[r.c].id;
      totals.set(id, (totals.get(id) || 0) + r.pts);
    }
    liveRank.set(season, new Map([...totals.entries()].sort((x, y) => y[1] - x[1]).map(([id], i) => [id, i + 1])));
  }
  const out: Line[] = [];
  for (const def of LINEAGES) {
    const steps: Step[] = [];
    for (const s of def.steps) {
      const seasons = constructorSeasons(archive, s.constructorId, s.from, s.to ?? 9999);
      if (!seasons.length) continue;
      const idx = archive.teamIndex.get(s.constructorId)!;
      steps.push({ constructorId: s.constructorId, name: archive.teams[idx].name, from: seasons[0], to: seasons.at(-1)!, source: s.source, color: teamColor(s.constructorId) });
    }
    if (!steps.length) continue;
    const spans = steps.map((s) => ({ constructorId: s.constructorId, from: s.from, to: s.to }));
    const inSpan = (id: string, season: number) => spans.some((s) => s.constructorId === id && season >= s.from && season <= s.to);
    const titles: number[] = [], driverTitles: { season: number; driver: string }[] = [], positions = new Map<number, number>();
    for (const [season, rows] of Object.entries(history.constructors)) {
      const row = rows.find((r) => inSpan(r[0], +season));
      if (!row) continue;
      if (/^\d+$/.test(row[1])) positions.set(+season, +row[1]);
      if (row[1] === "1") titles.push(+season);
    }
    for (const [season, rows] of Object.entries(history.drivers)) {
      const champ = rows.find((r) => r[1] === "1");
      if (champ && champ[4].some((c) => inSpan(c, +season))) driverTitles.push({ season: +season, driver: history.names.drivers[champ[0]]?.slice(0, 2).join(" ") || champ[0] });
    }
    for (const [season, ranks] of liveRank) {
      const step = steps.find((s) => season >= s.from && season <= s.to);
      const r = step && ranks.get(step.constructorId);
      if (r) positions.set(season, r);
    }
    out.push({ def, steps, seasons: lineageSeasons(archive, spans), titles, driverTitles, positions, from: steps[0].from, to: steps.at(-1)!.to });
  }
  return out;
}

function LineageView({ bundle, lines, current, onSelect, team, matched }: { bundle: ArchiveBundle; lines: Line[]; current?: Line; onSelect: (id: string) => void; team: string | null; matched: boolean }) {
  const { archive, envelope } = bundle;
  const detail = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(matched);
  useEffect(() => {
    if (!matched || !detail.current) return;
    const t = setTimeout(() => detail.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 350);
    const u = setTimeout(() => setFlash(false), 2600);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [matched]);
  const identities = new Set(lines.flatMap((l) => l.steps.map((s) => s.constructorId))).size;
  const renamed = lines.filter((l) => l.steps.length > 1).length;
  const teamName = team ? archive.teams[archive.teamIndex.get(team) ?? -1]?.name || team : null;
  return (
    <Page className="ln">
      <ArchiveHero
        eyebrow="Archive · Team lineage"
        icon={<GitBranch size={14} />}
        title="Team lineage"
        accent="Same factory, many names"
        lede="How today's teams grew out of yesterday's: ownership changes and entry transfers traced through the constructors that actually raced."
        photo={circuitMedia("silverstone").hero}
        tint={current?.steps.at(-1)?.color || "#64d2ff"}
        stats={[
          { label: "Lineages", value: <Counter value={lines.length} /> },
          { label: "Constructor names", value: <Counter value={identities} /> },
          { label: "Changed hands", value: <Counter value={renamed} /> },
        ]}
        figure={current && <HeroChain line={current} />}
      />
      {team && !matched && !lines.some((l) => l.steps.some((s) => s.constructorId === team)) && (
        <p className="notice ln-miss reveal"><Info /><span>{teamName} isn't part of a curated lineage yet — showing {current?.def.name} instead.</span></p>
      )}

      <Section id="family-tree" title="The family tree" subtitle="Each bar is a constructor name, as listed by Jolpica, from its first to last World Championship season. Select a lineage for its story.">
        <Glass className="card ln-tree reveal">
          <Tree lines={lines} current={current} onSelect={onSelect} />
        </Glass>
        <Source value={envelope} label="Race results" />
      </Section>

      {current && (
        <div ref={detail} className={cx("ln-detail-wrap", flash && "flash")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current.def.id} initial={{ opacity: 0, y: 16, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <Detail archive={archive} line={current} highlight={team} />
            </motion.div>
          </AnimatePresence>
          <Source value={envelope} label="Race results & final standings" />
        </div>
      )}
    </Page>
  );
}

function HeroChain({ line }: { line: Line }) {
  return (
    <div className="ln-chain" aria-label={`${line.def.name} lineage: ${line.steps.map((s) => s.name).join(", then ")}`}>
      {line.steps.map((s, i) => (
        <div key={s.constructorId + s.from} className="ln-chain-step" style={{ "--tint": s.color, "--i": i } as CSSProperties}>
          <TeamLogo id={s.constructorId} name={s.name} year={String(s.to)} size={44} />
          <span><strong>{teamShortName(s.name, String(s.to))}</strong><small>{s.from === s.to ? s.from : `${s.from}–${s.to}`}</small></span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Timeline tree ───────────────────────── */
function Tree({ lines, current, onSelect }: { lines: Line[]; current?: Line; onSelect: (id: string) => void }) {
  const first = 1950, last = Math.max(new Date().getFullYear(), ...lines.map((l) => l.to));
  const span = last - first + 1;
  const left = (y: number) => ((y - first) / span) * 100;
  const decades: number[] = [];
  for (let y = 1950; y <= last; y += 10) decades.push(y);
  return (
    <div className="ln-tree-scroll">
      <div className="ln-tree-inner">
        <div className="ln-axis" aria-hidden>
          <span />
          <div className="ln-axis-track">{decades.map((y) => <span key={y} style={{ left: `${left(y)}%` }}>{y}</span>)}</div>
        </div>
        <ul className="ln-rows">
          {lines.map((l, row) => (
            <li key={l.def.id} className={cx("ln-row", current?.def.id === l.def.id && "on")}>
              <button type="button" className="ln-row-label" aria-pressed={current?.def.id === l.def.id} onClick={() => onSelect(l.def.id)}>
                <strong>{l.def.name}</strong><small>{l.from}–{l.to >= last ? "now" : l.to}</small>
              </button>
              <div className="ln-track">
                {decades.map((y) => <i key={y} className="ln-grid" style={{ left: `${left(y)}%` }} aria-hidden />)}
                {l.steps.map((s, i) => {
                  const light = isLightColor(s.color);
                  return (
                    <button
                      key={s.constructorId + s.from}
                      type="button"
                      className={cx("ln-seg", light && "light")}
                      style={{ left: `${left(s.from)}%`, width: `${((s.to - s.from + 1) / span) * 100}%`, "--tint": s.color, "--d": `${row * 70 + i * 120}ms` } as CSSProperties}
                      onClick={() => onSelect(l.def.id)}
                      aria-label={`${s.name}, ${s.from}–${s.to}`}
                      title={`${s.name} · ${s.from}–${s.to}`}
                    >
                      <span>{teamShortName(s.name, String(s.to))}</span>
                    </button>
                  );
                })}
                {l.steps.slice(1).map((s, i) => (
                  <i key={"k" + i} className="ln-knot" style={{ left: `${left(s.from)}%`, "--d": `${row * 70 + (i + 1) * 120 + 400}ms` } as CSSProperties} aria-hidden />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───────────────────────── Detail ───────────────────────── */
type ChartMode = "wins" | "position" | "points";
function Detail({ archive, line, highlight }: { archive: Archive; line: Line; highlight: string | null }) {
  const [mode, setMode] = useState<ChartMode>("wins");
  const years: number[] = [];
  for (let y = line.from; y <= line.to; y++) years.push(y);
  const by = new Map(line.seasons.map((s) => [s.season, s]));
  const stepOf = (y: number) => line.steps.find((s) => y >= s.from && y <= s.to);
  const wins = line.seasons.reduce((s, x) => s + x.wins, 0);
  const podiums = line.seasons.reduce((s, x) => s + x.podiums, 0);
  const best = [...line.positions.values()].sort((a, b) => a - b)[0];
  const latest = line.steps.at(-1)!;
  const posValues = years.map((y) => line.positions.get(y) ?? null);
  return (
    <Section id="lineage-detail" title={`${line.def.name}`} subtitle={`${line.def.base} · ${plural(line.steps.length, "name")} since ${line.from}`}
      action={<Link className="btn sm" to={"team/" + latest.constructorId}>{teamShortName(latest.name)} profile<ArrowRight /></Link>}>
      <div className="ln-kpis">
        <Glass className="card kpi reveal"><span className="label">Seasons raced</span><span className="value"><Counter value={new Set(line.seasons.map((s) => s.season)).size} /></span><span className="detail">{line.from}–{line.to}</span></Glass>
        <Glass className="card kpi reveal" style={{ "--i": 1 } as CSSProperties}><span className="label">Grand Prix wins</span><span className="value"><Counter value={wins} /></span><span className="detail">{plural(podiums, "podium")} by its cars</span></Glass>
        <Glass className="card kpi reveal" style={{ "--i": 2 } as CSSProperties}><span className="label">Constructors' titles</span><span className="value"><Counter value={line.titles.length} /></span><span className="detail">{line.titles.length ? line.titles.join(", ") : best ? `best finish ${ordinal(best)}` : "—"}</span></Glass>
        <Glass className="card kpi reveal" style={{ "--i": 3 } as CSSProperties}><span className="label">Drivers' titles</span><span className="value"><Counter value={line.driverTitles.length} /></span><span className="detail">{line.driverTitles.length ? line.driverTitles.slice(-3).map((d) => `${d.driver.split(" ").at(-1)} ${d.season}`).join(", ") + (line.driverTitles.length > 3 ? "…" : "") : "—"}</span></Glass>
      </div>

      <div className="split ln-detail">
        <Glass className="card reveal ln-steps">
          <div className="card-title"><h3>How it evolved</h3><span className="eyebrow">Public record</span></div>
          <ol>
            {line.steps.map((s, i) => (
              <li key={s.constructorId + s.from} className={cx("ln-step", highlight === s.constructorId && "hl")} style={{ "--tint": s.color, "--i": i } as CSSProperties}>
                <span className="ln-step-rail" aria-hidden><i /></span>
                <div className="ln-step-body">
                  {s.source && <p className="ln-step-source"><ChevronRight size={13} />{s.source}</p>}
                  <Link to={"team/" + s.constructorId} className="ln-step-team">
                    <TeamLogo id={s.constructorId} name={s.name} year={String(s.to)} size={38} />
                    <span><strong>{s.name}</strong><small>{s.from === s.to ? s.from : `${s.from}–${s.to}`} · {plural(line.seasons.filter((x) => x.constructorId === s.constructorId && x.season >= s.from && x.season <= s.to).reduce((a, x) => a + x.wins, 0), "win")}</small></span>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
          {line.def.note && <p className="arx-note"><Info />{line.def.note}</p>}
        </Glass>
        <Glass className="card reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="spread ln-chart-head">
            <h3 className="title-3">Through the years</h3>
            <Segmented label="Chart" value={mode} onChange={setMode} options={[{ value: "wins", label: "Wins" }, { value: "position", label: "Position" }, { value: "points", label: "Points" }]} />
          </div>
          <div className="legend ln-legend">
            {line.steps.filter((s, i, list) => list.findIndex((x) => x.constructorId === s.constructorId) === i).map((s) => (
              <span key={s.constructorId}><i className="swatch" style={{ "--c": s.color } as CSSProperties} />{teamShortName(s.name, String(s.to))}</span>
            ))}
          </div>
          {mode === "position" ? (
            posValues.some((v) => v !== null) ? (
              <LineChart
                ariaLabel={`${line.def.name} constructors' championship position by season`}
                series={[{ id: "pos", name: "Championship position", color: latest.color, values: posValues }]}
                labels={years.map(String)}
                invert
                yMin={1}
                curve={false}
                height={300}
                tooltipTitle={(i) => `${years[i]} · ${stepOf(years[i])?.name || ""}`}
                yFormat={(v) => "P" + Math.round(v)}
              />
            ) : <p className="muted small">The constructors' championship began in 1958.</p>
          ) : (
            <Columns
              ariaLabel={`${line.def.name} ${mode === "wins" ? "Grand Prix wins" : "points scored"} per season`}
              labels={years.map(String)}
              values={years.map((y) => (mode === "wins" ? by.get(y)?.wins ?? null : by.get(y)?.points ?? null))}
              colors={years.map((y) => stepOf(y)?.color || "var(--accent)")}
              height={300}
              yFormat={(v) => pts(v)}
              tooltip={(i) => {
                const s = by.get(years[i]);
                return (
                  <>
                    <div className="t-title">{years[i]} · {stepOf(years[i])?.name}</div>
                    <div className="t-row"><span>Wins</span><b>{s?.wins ?? 0}</b></div>
                    <div className="t-row"><span>Points</span><b>{pts(s?.points ?? 0)}</b></div>
                    <div className="t-row"><span>Position</span><b>{line.positions.get(years[i]) ? ordinal(line.positions.get(years[i])!) : "—"}</b></div>
                  </>
                );
              }}
            />
          )}
          <p className="arx-note"><Trophy />
            {mode === "points"
              ? "Points as awarded at the time, all of the team's cars incl. sprints — scoring systems changed many times, so compare within an era."
              : mode === "position" ? `Final constructors' championship positions${archive.live.length ? `; ${archive.live.join(", ")} is the order so far` : ""}.`
              : "Races won by the team's cars each season."}
          </p>
        </Glass>
      </div>
    </Section>
  );
}
