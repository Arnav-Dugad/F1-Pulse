/* Season analytics UI shared by Standings, Scenarios, Insights and Story. Pure logic lives in src/season-analytics.mjs. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Award, Info, Minus } from "lucide-react";
import { request, sprintResults, useData } from "../api";
import { Link } from "../lib/router";
import { shortRace } from "../lib/season";
import { fullName, teamColor, teamShortName, useDriverPhoto, type PhotoCredit } from "../lib/media";
import { plural, pts } from "../lib/format";
import { Glass, Img, Segmented, Skeleton, StateView, cx } from "../ui/core";
import { DriverAvatar, Flag, PhotoCredit as SharedCredit, TeamLogo } from "../ui/media";
import { consistency, pointsMatrix, type ConsistencyRow, type HeatCell, type PointsMatrix, type TeamHeatCell } from "../season-analytics.mjs";
import { emptyEnvelope } from "./_champ";
import type { SeasonProgress } from "../lib/season";
import type { Envelope, Race } from "../types";
import "./_season.css";

/* ───────────────────────── Small shared helpers ───────────────────────── */

/** True once the element has come within `margin` of the viewport (stays true). */
export function useInView<T extends Element>(margin = "300px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);
  return [ref, seen];
}

/** Renders `children` only after the placeholder scrolls near the viewport. */
export function Lazy({ children, height = 360 }: { children: () => ReactNode; height?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref} className="sa-lazy">{seen ? children() : <Skeleton h={height} r={28} />}</div>;
}

/** Sprint classifications for seasons that had them (2021+); same request the progression uses. */
export function useSprints(season: string, year: string) {
  return useData(() => (+year >= 2021 ? sprintResults(season) : Promise.resolve(emptyEnvelope<Race[]>([]))), [season]);
}

/** The round the official standings were published after (same cached request as `standings()`). */
export function useOfficialRound(season: string) {
  return useData(async () => {
    const r = await request<any>("jolpica", `${season}/driverStandings.json`);
    return { ...r, data: Number(r.data.MRData.StandingsTable.StandingsLists[0]?.round || 0) };
  }, [season]);
}

export const pct = (p: number) => (p <= 0 ? "0%" : p >= 1 ? ">99.9%" : p < 0.001 ? "<0.1%" : p > 0.999 ? ">99.9%" : p < 0.1 ? (p * 100).toFixed(1) + "%" : Math.round(p * 100) + "%");

export function Trend({ dir, delta, unit = "pts" }: { dir: "up" | "down" | "flat"; delta: number; unit?: string }) {
  const label = dir === "flat" ? "Steady form" : `${dir === "up" ? "Up" : "Down"} ${Math.abs(delta).toFixed(1)} ${unit} per race`;
  return (
    <span role="img" className={cx("sa-trend", dir)} title={label} aria-label={label}>
      {dir === "up" ? <ArrowUpRight size={14} /> : dir === "down" ? <ArrowDownRight size={14} /> : <Minus size={14} />}
    </span>
  );
}

/** A "this is a model" badge. */
export function ModelBadge({ children = "Model, not prediction" }: { children?: ReactNode }) {
  return <span className="chip purple sa-model-chip"><Info size={12} />{children}</span>;
}

/* ───────────────────────── Historical driver photos ───────────────────────── */

/** Attribution line for a photo (artist + licence linked). Required for every Wikimedia image. */
export function PhotoCreditLine({ credit, className }: { credit: PhotoCredit; className?: string }) {
  return <SharedCredit credit={credit} className={cx("sa-credit", className)} />;
}

/**
 * A driver's face for any season in history: the media hook's photo (official season media first,
 * then Wikimedia Commons) with its credit, falling back to the team-tinted monogram avatar.
 */
export function PhotoFace({ id, name, year, team, size = 96, credit = true, className }: {
  id: string; name: string; year: string; team?: string; size?: number; credit?: boolean; className?: string;
}) {
  const photo = useDriverPhoto(id, year);
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return <DriverAvatar id={id} name={name} year={year} team={team} size={size} className={className} />;
  return (
    <figure className={cx("sa-photo", className)} style={{ "--s": size + "px", "--tint": teamColor(team) } as CSSProperties}>
      <span className="sa-photo-img"><Img src={photo.head || photo.src} alt={photo.alt || name} onError={() => setFailed(true)} /></span>
      {credit && <figcaption><PhotoCreditLine credit={photo.credit} /></figcaption>}
    </figure>
  );
}

/* ───────────────────────── Championship history (static snapshot) ───────────────────────── */

type HistoryFile = { lastSeason: number; drivers: Record<string, [string, string, number, number, string[]][]> };
let history: Promise<HistoryFile> | null = null;
/** `/data/history.json` (final standings 1950–last completed season), loaded once. */
export const loadHistory = (): Promise<HistoryFile> =>
  (history ??= fetch("/data/history.json").then((r) => {
    if (!r.ok) throw Error("Championship history unavailable");
    return r.json();
  }).catch((e) => { history = null; throw e; }));

/** Career wins before `year` and the set of drivers with an earlier season, from final standings. */
export async function careerBefore(year: number) {
  const h = await loadHistory();
  const winsBefore: Record<string, number> = {};
  const prior = new Set<string>();
  for (const [season, rows] of Object.entries(h.drivers) as [string, HistoryFile["drivers"][string]][]) {
    if (+season >= year) continue;
    for (const [id, , , wins] of rows) {
      prior.add(id);
      winsBefore[id] = (winsBefore[id] || 0) + Number(wins || 0);
    }
  }
  return { winsBefore, prior, complete: year - 1 <= h.lastSeason };
}

/* ───────────────────────── Points heatmap ───────────────────────── */

type HeatKind = "drivers" | "constructors";
type Hover = { row: number; col: number; x: number; y: number } | null;

export function PointsHeatmap({ results, sprints, year, hasTeams, progress, initial = "drivers" }: {
  results?: Envelope<Race[]>; sprints?: Envelope<Race[]>; year: string; hasTeams: boolean; progress?: SeasonProgress; initial?: HeatKind;
}) {
  const [kind, setKind] = useState<HeatKind>(initial === "constructors" && hasTeams ? "constructors" : "drivers");
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const box = useRef<HTMLDivElement>(null);
  const m = useMemo<PointsMatrix | null>(() => (results ? pointsMatrix(results.data, sprints?.data || []) : null), [results, sprints]);
  if (!m) return <Skeleton h={420} r={28} />;
  if (!m.rounds.length) return <StateView empty emptyTitle="No rounds yet" emptyText="The heatmap fills in once the first Grand Prix is classified." />;
  const rows = kind === "drivers" ? m.drivers : m.teams;
  const limit = kind === "drivers" ? 24 : 14;
  const shown = all ? rows : rows.slice(0, limit);
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c?.points || 0)));
  const onCell = (row: number, col: number, el: HTMLElement) => {
    const b = box.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!b) return;
    setHover({ row, col, x: r.left - b.left + r.width / 2, y: r.top - b.top });
  };
  const hRow = hover ? shown[hover.row] : null;
  const hCell = hover && hRow ? hRow.cells[hover.col] : null;
  const hRound = hover ? m.rounds[hover.col] : null;
  const anySprint = m.rounds.some((r) => r.sprint);
  const dropRule = progress?.rules.driver && kind === "drivers";

  return (
    <Glass className="card flush sa-heat reveal">
      <div className="sa-heat-head">
        {hasTeams ? <Segmented label="Heatmap rows" value={kind} onChange={(k) => { setKind(k); setHover(null); }} options={[{ value: "drivers", label: "Drivers" }, { value: "constructors", label: "Constructors" }]} /> : <span className="faint small">Drivers · constructors' championship from 1958</span>}
        <div className="sa-heat-legend" aria-hidden>
          <span>0</span>
          <i className="sa-heat-ramp" />
          <span>{pts(max)} pts</span>
          {anySprint && <span className="sa-heat-key"><i className="sa-dot" />Sprint points</span>}
        </div>
      </div>
      <div className="sa-heat-rel" ref={box} onPointerLeave={() => setHover(null)}>
      <div className="sa-heat-scroll" onScroll={() => setHover(null)}>
        <table className="sa-heat-tbl" aria-label={`Points scored per round by ${kind}, race and sprint combined`}>
          <thead>
            <tr>
              <th scope="col" className="sa-heat-name">{kind === "drivers" ? "Driver" : "Constructor"}</th>
              {m.rounds.map((r) => (
                <th key={r.round} scope="col" className="sa-heat-round" title={r.raceName}>
                  <Flag country={r.country} />
                  <span>{r.round}</span>
                </th>
              ))}
              <th scope="col" className="sa-heat-total">Pts</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, ri) => {
              const isDriver = "driver" in row;
              const tint = teamColor(row.team);
              const name = isDriver ? row.driver.familyName : teamShortName(row.team.name, year);
              return (
                <tr key={row.id} style={{ "--tint": tint } as CSSProperties}>
                  <th scope="row" className="sa-heat-name">
                    <Link to={(isDriver ? "driver/" : "team/") + row.id} className="sa-heat-who">
                      <i className="team-bar" />
                      {isDriver ? <DriverAvatar id={row.id} name={fullName(row.driver)} year={year} team={row.team.constructorId} size={24} /> : <TeamLogo id={row.id} name={row.team.name} year={year} size={24} />}
                      <span>{name}</span>
                    </Link>
                  </th>
                  {row.cells.map((c, ci) => {
                    const v = c?.points || 0;
                    const ratio = v / max;
                    const label = c ? cellLabel(c, isDriver) : "";
                    const roundName = m.rounds[ci].raceName;
                    return (
                      <td
                        key={ci}
                        className={cx("sa-cell", !c && "none", ratio > 0.52 && "hot", v === 0 && c && "zero", hover?.row === ri && hover.col === ci && "on")}
                        style={{ "--v": Math.round(ratio * 100) + "%" } as CSSProperties}
                        tabIndex={c ? 0 : -1}
                        aria-label={c ? `${name}, ${roundName}: ${pts(v)} points${isDriver && (c as HeatCell).posText ? `, finished ${(c as HeatCell).pos ?? (c as HeatCell).posText}` : ""}` : `${name} did not take part in ${roundName}`}
                        onPointerEnter={(e) => c && onCell(ri, ci, e.currentTarget)}
                        onFocus={(e) => c && onCell(ri, ci, e.currentTarget)}
                        onClick={(e) => c && onCell(ri, ci, e.currentTarget)}
                        onBlur={() => setHover(null)}
                      >
                        {label}
                        {c && c.sprint > 0 && <i className="sa-dot" aria-hidden />}
                      </td>
                    );
                  })}
                  <td className="sa-heat-total"><b>{pts(row.total)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        {hover && hCell && hRow && hRound && (
          <div className="tooltip glass glass-strong sa-heat-tip" style={{ left: Math.min(Math.max(110, hover.x), (box.current?.clientWidth || 9999) - 110), top: hover.y }}>
            <div className="t-title">R{hRound.round} · {shortRace(hRound.raceName)}</div>
            {"driver" in hRow ? <DriverTip c={hCell as HeatCell} /> : <TeamTip c={hCell as TeamHeatCell} />}
          </div>
        )}
      </div>
      <div className="sa-heat-foot">
        <p><Info size={13} />Points scored at each round (Grand Prix + sprint) as classified{kind === "constructors" ? ", summed across the team's cars" : ""}. Cells show the Grand Prix finish{kind === "drivers" ? " — R retired, D disqualified, W withdrew" : ""}. {dropRule ? "Dropped-score rules of the era are not applied per round." : ""}{kind === "constructors" && progress?.rules.bestCarOnly ? " Before 1979 only a team's best car scored for the championship; this shows every car." : ""}</p>
        {rows.length > limit && <button className="btn sm plain" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
      </div>
    </Glass>
  );
}

function cellLabel(c: HeatCell | TeamHeatCell, isDriver: boolean) {
  if (!isDriver) return c.points ? pts(c.points) : "";
  const d = c as HeatCell;
  if (d.pos) return String(d.pos);
  if (d.posText === "—") return "S";
  return d.posText === "R" || d.posText === "N" ? "R" : d.posText;
}

function DriverTip({ c }: { c: HeatCell }) {
  return (
    <>
      <div className="t-row"><span>Grand Prix</span><b>{c.pos ? `P${c.pos}` : c.posText === "—" ? "—" : c.status}</b></div>
      {c.grid > 0 && <div className="t-row"><span>Grid</span><b>P{c.grid}</b></div>}
      <div className="t-row"><span>Race points</span><b>{pts(c.race)}</b></div>
      {c.sprintPos !== undefined && <div className="t-row"><span>Sprint</span><b>{c.sprintPos ? `P${c.sprintPos}` : "DNF"} · {pts(c.sprint)}</b></div>}
      <div className="t-row"><span>Total</span><b>{pts(c.points)}</b></div>
    </>
  );
}
function TeamTip({ c }: { c: TeamHeatCell }) {
  return (
    <>
      {c.drivers.map((d) => <div className="t-row" key={d.id}><span>{d.name}</span><b>{d.pos ? `P${d.pos}` : d.posText} · {pts(d.points)}</b></div>)}
      {c.sprint > 0 && <div className="t-row"><span>of which sprint</span><b>{pts(c.sprint)}</b></div>}
      <div className="t-row"><span>Team total</span><b>{pts(c.points)}</b></div>
    </>
  );
}

/* ───────────────────────── Consistency ───────────────────────── */

export function ConsistencyBoard({ races, year }: { races: Race[]; year: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => consistency(races), [races]);
  const qualified = rows.filter((r) => r.qualified);
  if (!qualified.length) return <StateView empty emptyTitle="Not enough races yet" emptyText="Consistency needs at least two classified finishes per driver." />;
  const shown = showAll ? rows : qualified.slice(0, 12);
  const best = qualified[0];
  const min = Math.ceil(races.filter((r) => r.Results?.length).length * 0.5);
  return (
    <div className="sa-cons">
      <ConsistentHero row={best} year={year} />
      <Glass className="card flush reveal">
        <div className="table-wrap" tabIndex={0}>
          <table className="tbl sa-cons-tbl">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Driver</th>
                <th scope="col" className="r">Index</th>
                <th scope="col" className="r" title="Standard deviation of classified finishing positions"><span className="sa-sigma">σ</span> finish</th>
                <th scope="col" className="r sa-hide-sm">Avg finish</th>
                <th scope="col" className="r sa-hide-sm" title="Standard deviation of Grand Prix points"><span className="sa-sigma">σ</span> points</th>
                <th scope="col" className="r">Non-finish</th>
                <th scope="col" className="r sa-hide-sm">Starts</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} className={cx(!r.qualified && "sa-faded")} style={{ "--tint": teamColor(r.team) } as CSSProperties}>
                  <td className="faint">{r.qualified ? i + 1 : "—"}</td>
                  <td>
                    <Link to={"driver/" + r.id} className="sa-who">
                      <DriverAvatar id={r.id} name={fullName(r.driver)} year={year} team={r.team.constructorId} size={30} />
                      <span><b>{r.driver.familyName}</b><small>{teamShortName(r.team.name, year)}</small></span>
                    </Link>
                  </td>
                  <td className="r">
                    <span className="sa-index">
                      <span className="sa-index-bar"><i style={{ width: (r.index ?? 0) + "%" }} /></span>
                      <b>{r.index ?? "—"}</b>
                    </span>
                  </td>
                  <td className="r">{r.finishes >= 2 ? r.sdPos.toFixed(2) : "—"}</td>
                  <td className="r sa-hide-sm">{r.meanPos === null ? "—" : r.meanPos.toFixed(1)}</td>
                  <td className="r sa-hide-sm">{r.sdPts.toFixed(1)}</td>
                  <td className="r">{r.dnfs ? <span className="chip sa-dnf">{Math.round(r.dnfRate * 100)}%</span> : <span className="faint">0%</span>}</td>
                  <td className="r sa-hide-sm">{r.starts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sa-heat-foot">
          <p><Info size={13} />Index = 100 × (1 − σ finish ÷ 8, floored at 0) × (1 − non-finish rate). σ finish is the spread of classified Grand Prix positions — a driver who always finishes 9th is as consistent as one who always wins. Ranked drivers started at least {plural(min, "race")}; non-finishes include retirements and disqualifications.</p>
          {rows.length > 12 && <button className="btn sm plain" onClick={() => setShowAll((s) => !s)}>{showAll ? "Ranked drivers only" : `All ${rows.length} drivers`}</button>}
        </div>
      </Glass>
    </div>
  );
}

function ConsistentHero({ row, year }: { row: ConsistencyRow; year: string }) {
  return (
    <Glass className="card sa-mrc reveal" style={{ "--tint": teamColor(row.team) } as CSSProperties}>
      <span className="eyebrow"><Award size={13} />Mr Consistent</span>
      <div className="sa-mrc-body">
        <DriverAvatar id={row.id} name={fullName(row.driver)} year={year} team={row.team.constructorId} size={72} />
        <div>
          <h3 className="title-2">{row.driver.givenName} <b>{row.driver.familyName}</b></h3>
          <p className="muted small">{teamShortName(row.team.name, year)}</p>
        </div>
        <div className="sa-mrc-score"><b>{row.index}</b><small>index</small></div>
      </div>
      <div className="sa-mrc-stats">
        <span><b>{row.sdPos.toFixed(2)}</b>σ finishing position</span>
        <span><b>{row.meanPos?.toFixed(1) ?? "—"}</b>average finish</span>
        <span><b>{row.dnfs}</b>{row.dnfs === 1 ? "non-finish" : "non-finishes"} in {row.starts}</span>
      </div>
      <Link to={"driver/" + row.id} className="btn sm glass-btn">Driver profile<ArrowRight /></Link>
    </Glass>
  );
}
