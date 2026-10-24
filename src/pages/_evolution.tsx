/* Car evolution for the Team and Teams pages: one constructor lineage, season by season. */
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { LINEAGES, type Lineage } from "../lib/archive-lineage";
import { Link } from "../lib/router";
import { MEDIA_SEASON, isLightColor, teamColor, teamMedia, useTeamPhoto } from "../lib/media";
import { Img, cx } from "../ui/core";
import { TeamLogo } from "../ui/media";
import { CreditLine } from "./_drivers";
import "./_evolution.css";

/** Seasons with official car imagery (media.json `seasons` 2019–2025 + the current season). */
export const EVO_FIRST = 2019;
export const EVO_LAST = +MEDIA_SEASON;
export const EVO_YEARS = Array.from({ length: EVO_LAST - EVO_FIRST + 1 }, (_, i) => String(EVO_FIRST + i));

/** Display names for the constructor ids used in the 2019+ lineages (Jolpica ids). */
const NAMES: Record<string, string> = {
  toro_rosso: "Toro Rosso", alphatauri: "AlphaTauri", racing_point: "Racing Point", aston_martin: "Aston Martin", alfa: "Alfa Romeo",
  sauber: "Sauber", audi: "Audi", renault: "Renault", alpine: "Alpine", red_bull: "Red Bull", mercedes: "Mercedes", ferrari: "Ferrari",
  mclaren: "McLaren", williams: "Williams", haas: "Haas", cadillac: "Cadillac", force_india: "Force India", lotus_f1: "Lotus",
  benetton: "Benetton", toleman: "Toleman", tyrrell: "Tyrrell", bar: "BAR", honda: "Honda", brawn: "Brawn GP", stewart: "Stewart",
  jaguar: "Jaguar", minardi: "Minardi", jordan: "Jordan", mf1: "MF1", spyker_mf1: "Spyker MF1", spyker: "Spyker", bmw_sauber: "BMW Sauber",
};
export function evoName(constructorId: string, year: string) {
  if (constructorId === "rb") return +year >= 2025 ? "Racing Bulls" : "RB";
  if (constructorId === "sauber" && +year >= 2024) return "Kick Sauber";
  return NAMES[constructorId] || constructorId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const inSpan = (s: Lineage["steps"][number], y: number) => y >= s.from && y <= (s.to ?? 9999);
/**
 * The lineage a team page belongs to. Constructor ids are matched together with the season,
 * because some ids were reused by unrelated teams (e.g. Alfa Romeo 1950–51 vs the Sauber-run
 * Alfa Romeo 2019–23) — an unrelated old namesake gets no modern evolution.
 */
export function findLineage(constructorId: string, year: number): Lineage | null {
  for (const l of LINEAGES) if (l.steps.some((s) => s.constructorId === constructorId && inSpan(s, year))) return l;
  // A modern id viewed in a season it didn't race (e.g. "rb" in 2019): use its 2019+ span.
  if (year >= EVO_FIRST)
    for (const l of LINEAGES) if (l.steps.some((s) => s.constructorId === constructorId && (s.to ?? 9999) >= EVO_FIRST)) return l;
  return null;
}

export type EvoCar = { year: string; constructorId: string; name: string; car: string };
/** Every 2019+ season of the lineage that has official car imagery, oldest first. */
export function evolutionCars(constructorId: string, year: number): EvoCar[] {
  const lineage = findLineage(constructorId, year);
  const out: EvoCar[] = [];
  for (const y of EVO_YEARS) {
    const cid = lineage ? lineage.steps.filter((s) => inSpan(s, +y)).at(-1)?.constructorId : year >= EVO_FIRST ? constructorId : undefined;
    const car = cid ? teamMedia(cid, y)?.car : undefined;
    if (cid && car) out.push({ year: y, constructorId: cid, name: evoName(cid, y), car });
  }
  return out;
}
/** Earlier names of the lineage (before official imagery), newest last — candidates for archive photos. */
function heritage(constructorId: string, year: number) {
  const lineage = findLineage(constructorId, year);
  const steps = (lineage?.steps || []).filter((s) => s.to !== undefined && s.to < EVO_FIRST).slice(-5);
  const list = steps.map((s) => ({ constructorId: s.constructorId, year: String(s.to), span: s.from === s.to ? String(s.from) : `${s.from}–${s.to}` }));
  if (year < EVO_FIRST && !list.some((h) => h.constructorId === constructorId && +h.year === year))
    list.push({ constructorId, year: String(year), span: String(year) });
  return list.sort((a, b) => +a.year - +b.year);
}

/* ───────────────────────── Team page section body ───────────────────────── */
export function TeamEvolution({ id, year, name }: { id: string; year: string; name: string }) {
  const cars = useMemo(() => evolutionCars(id, +year), [id, year]);
  const older = useMemo(() => heritage(id, +year), [id, year]);
  if (!cars.length) return null;
  return (
    <div className="evo">
      <ol className="evo-strip" aria-label={`${name} cars by season`}>
        {older.map((h) => <HeritageCard key={h.constructorId + h.year} {...h} />)}
        {cars.map((c, i) => (
          <li key={c.year} className={cx("evo-card", c.year === year && "current", isLightColor(teamColor(c.constructorId)) && "light")} style={{ "--tint": teamColor(c.constructorId), "--i": i } as CSSProperties}>
            <Link to={`team/${c.constructorId}?season=${c.year}`} className="evo-card-link" aria-label={`${c.year} ${c.name} — open that season`}>
              <span className="evo-card-year">{c.year}</span>
              <span className="evo-card-car"><Img src={c.car} alt={`${c.name} ${c.year} car, side view`} /></span>
              <span className="evo-card-name"><TeamLogo id={c.constructorId} name={c.name} year={c.year} size={22} />{c.name}</span>
            </Link>
          </li>
        ))}
      </ol>
      {cars.length > 1 && <CompareSlider cars={cars} />}
      <p className="source">Official season car imagery {cars[0].year}–{cars.at(-1)!.year}{older.length ? "; earlier seasons use freely licensed archive photos where one exists" : ""}. Names follow the constructor entered that season.</p>
    </div>
  );
}

/** Archive photo for a season before official imagery — renders nothing until one exists. */
function HeritageCard({ constructorId, year, span }: { constructorId: string; year: string; span: string }) {
  const photo = useTeamPhoto(constructorId, year);
  if (!photo) return null;
  const name = evoName(constructorId, year);
  return (
    <li className="evo-card heritage" style={{ "--tint": teamColor(constructorId) } as CSSProperties}>
      <Link to={`team/${constructorId}?season=${year}`} className="evo-card-link" aria-label={`${name}, ${span} — open the ${year} season`}>
        <span className="evo-card-year">{span}</span>
        <span className="evo-card-photo"><Img src={photo.src} alt={photo.alt || `${name} car, ${year}`} /></span>
        <span className="evo-card-name">{name}</span>
      </Link>
      <CreditLine credit={photo.credit} className="evo-card-credit" />
    </li>
  );
}

/* ───────────────────────── Before / after slider ───────────────────────── */
function CompareSlider({ cars }: { cars: EvoCar[] }) {
  const uid = useId();
  const [a, setA] = useState(cars[0].year);
  const [b, setB] = useState(cars.at(-1)!.year);
  const [pos, setPos] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const carA = cars.find((c) => c.year === a) || cars[0];
  const carB = cars.find((c) => c.year === b) || cars.at(-1)!;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const fromX = (x: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (r && r.width) setPos(clamp(((x - r.left) / r.width) * 100));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromX(e.clientX);
    handle.current?.focus({ preventScroll: true });
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const map: Record<string, number> = { ArrowLeft: pos - step, ArrowDown: pos - step, ArrowRight: pos + step, ArrowUp: pos + step, PageDown: pos - 10, PageUp: pos + 10, Home: 0, End: 100 };
    if (e.key in map) { e.preventDefault(); setPos(clamp(map[e.key])); }
  };
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="evo-pick">
      <span>{label}</span>
      <select className="input evo-select" value={value} onChange={(e) => set(e.target.value)}>
        {cars.map((c) => <option key={c.year} value={c.year}>{c.year} · {c.name}</option>)}
      </select>
    </label>
  );
  return (
    <div className="evo-compare">
      <div className="evo-compare-head">
        <strong className="evo-compare-title" id={uid}>Compare two seasons</strong>
        <div className="evo-picks">
          {select(a, setA, "Left")}
          {select(b, setB, "Right")}
        </div>
      </div>
      <div ref={stage} className="evo-stage" style={{ "--pos": pos + "%" } as CSSProperties}
        onPointerDown={down}
        onPointerMove={(e) => { if (drag.current === e.pointerId) fromX(e.clientX); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}>
        <div className="evo-layer under" style={{ "--tint": teamColor(carB.constructorId) } as CSSProperties}>
          <Img src={carB.car} alt={`${carB.name} ${carB.year} car`} />
        </div>
        <div className="evo-layer over" style={{ "--tint": teamColor(carA.constructorId) } as CSSProperties} aria-hidden={pos < 1}>
          <Img src={carA.car} alt={`${carA.name} ${carA.year} car`} />
        </div>
        <span className="evo-tag l" aria-hidden>{carA.year}<small>{carA.name}</small></span>
        <span className="evo-tag r" aria-hidden>{carB.year}<small>{carB.name}</small></span>
        <div ref={handle} className="evo-handle" role="slider" tabIndex={0} aria-labelledby={uid} aria-orientation="horizontal"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)}% showing the ${carA.year} car, ${100 - Math.round(pos)}% the ${carB.year} car`}
          onKeyDown={key}>
          <span className="evo-handle-knob" aria-hidden><ChevronsLeftRight size={18} /></span>
        </div>
      </div>
      <p className="evo-hint faint xsmall">Drag the divider, or focus it and use the arrow keys (Shift for bigger steps). Images are to the scale of each official render, not to each other.</p>
    </div>
  );
}

/* ───────────────────────── Teams page: every team's strip ───────────────────────── */
export function EvolutionTable({ teams, year }: { teams: { constructorId: string; name: string }[]; year: string }) {
  const rows = useMemo(() => teams.map((t) => ({ team: t, cars: new Map(evolutionCars(t.constructorId, +year).map((c) => [c.year, c])) })).filter((r) => r.cars.size > 0), [teams, year]);
  const missing = teams.length - rows.length;
  if (!rows.length)
    return <p className="notice">None of the {year} constructors has a successor with official car imagery ({EVO_FIRST}–{EVO_LAST}).</p>;
  return (
    <div className="evo-table glass">
      <div className="evo-table-scroll" tabIndex={0} role="region" aria-label={`Car evolution ${EVO_FIRST}–${EVO_LAST}, scrollable`}>
        <table className="evo-tbl">
          <thead>
            <tr><th scope="col" className="evo-tbl-team">Team</th>{EVO_YEARS.map((y) => <th key={y} scope="col">{y}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ team, cars }) => {
              let prev = "";
              return (
                <tr key={team.constructorId} style={{ "--tint": teamColor(team.constructorId) } as CSSProperties}>
                  <th scope="row" className="evo-tbl-team">
                    <Link to={`team/${team.constructorId}?season=${year}`} className="evo-tbl-name">
                      <TeamLogo id={team.constructorId} name={team.name} year={year} size={28} />
                      <span>{team.name}</span>
                    </Link>
                  </th>
                  {EVO_YEARS.map((y) => {
                    const c = cars.get(y);
                    const renamed = !!c && !!prev && prev !== c.name;
                    if (c) prev = c.name;
                    return (
                      <td key={y}>
                        {c ? (
                          <Link to={`team/${c.constructorId}?season=${y}`} className={cx("evo-tbl-car", renamed && "renamed")} style={{ "--tint": teamColor(c.constructorId) } as CSSProperties}
                            aria-label={`${c.name} ${y}`} title={`${c.name} · ${y}`}>
                            <Img src={c.car} alt="" />
                            {(renamed || y === EVO_YEARS[0] || !cars.get(String(+y - 1))) && <small>{c.name}</small>}
                          </Link>
                        ) : <span className="evo-tbl-none"><span aria-hidden>—</span><span className="sr-only">No entry with car imagery</span></span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="source evo-table-foot">Each row follows the team's constructor lineage back through earlier names (e.g. Racing Bulls ← AlphaTauri ← Toro Rosso). Official car imagery {EVO_FIRST}–{EVO_LAST}; a name appears where it changes.{missing > 0 ? ` ${missing} ${missing === 1 ? "team has" : "teams have"} no ${EVO_FIRST}+ successor and ${missing === 1 ? "is" : "are"} not shown.` : ""}</p>
    </div>
  );
}
