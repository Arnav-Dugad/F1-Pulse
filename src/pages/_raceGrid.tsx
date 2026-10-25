/* Race weekend · official starting grid + qualifying deep dive. */
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Gauge, Scissors, TrendingDown, Users } from "lucide-react";
import { Link } from "../lib/router";
import { fullName, teamColor, teamShortName } from "../lib/media";
import { lapTime, plural } from "../lib/format";
import { Glass, Section, Segmented, Source, cx } from "../ui/core";
import { DriverAvatar, TeamLogo } from "../ui/media";
import type { Envelope, Race as RaceData, Result } from "../types";
import { codeOf, secs, type AnalysisState } from "./_raceData";
import { QualiOverlay } from "./_raceQuali";
import "./_race.css";

/* ───────── Starting grid ───────── */
type Slot = { pos: number; r: Result; q?: number; qTime?: number | null };

export function StartingGrid({ results, quali, analysis, year, resEnv, qualiEnv }: {
  results: Result[]; quali?: Result[]; analysis: AnalysisState; year: string; resEnv?: Envelope<unknown>; qualiEnv?: Envelope<unknown>;
}) {
  const qPos = useMemo(() => new Map((quali || []).map((r) => [r.Driver.driverId, +r.position])), [quali]);
  const of = analysis.status === "done" && analysis.data && analysis.data.grid.length ? analysis.data : null;

  const { slots, pit, source } = useMemo(() => {
    let slots: Slot[] = [];
    let source: "openf1" | "jolpica" = "jolpica";
    if (of) {
      const mapped = of.grid.map((g) => ({ g, r: of.who(g.driver_number).result })).filter((x): x is { g: typeof x.g; r: Result } => !!x.r);
      // Use the archive grid only when it maps cleanly onto the classification.
      if (mapped.length >= Math.min(of.grid.length, results.length) - 1 && mapped.length >= 10) {
        slots = mapped.map(({ g, r }) => ({ pos: g.position, r, q: qPos.get(r.Driver.driverId), qTime: g.lap_duration }));
        source = "openf1";
      }
    }
    if (!slots.length)
      slots = results.filter((r) => +r.grid > 0).sort((a, b) => +a.grid - +b.grid).map((r) => ({ pos: +r.grid, r, q: qPos.get(r.Driver.driverId) }));
    const onGrid = new Set(slots.map((s) => s.r.Driver.driverId));
    const pit = results.filter((r) => !onGrid.has(r.Driver.driverId));
    return { slots, pit, source };
  }, [of, results, qPos]);

  if (slots.length < 2) return null;
  const moved = slots.filter((s) => s.q !== undefined && s.q !== s.pos);
  const drops = slots.filter((s) => s.q !== undefined && s.pos > s.q);
  const env = source === "openf1" ? of?.env.starting_grid : resEnv;

  return (
    <Section id="rw-grid" title="Starting grid" subtitle="The official grid in its two-by-two formation, against each driver's qualifying position.">
      <div className="rw-grid-wrap">
        <Glass className="card rw-grid-card reveal">
          <div className="rw-grid-head">
            <span className="rw-grid-flag" aria-hidden />
            <span className="eyebrow">Grid · {source === "openf1" ? "OpenF1 starting grid" : "official classification grid"}</span>
          </div>
          <ol className="rw-grid" aria-label="Starting grid">
            {slots.map((s, i) => {
              const delta = s.q !== undefined ? s.pos - s.q : 0;
              return (
                <li key={s.r.Driver.driverId} className={cx("rw-slot", s.pos % 2 === 0 && "even", delta > 0 && "drop", delta < 0 && "up")} style={{ "--tint": teamColor(s.r.Constructor), "--i": i % 12 } as CSSProperties}>
                  <Link to={"driver/" + s.r.Driver.driverId} className="rw-slot-box" aria-label={`Grid P${s.pos}: ${fullName(s.r.Driver)}${s.q !== undefined ? `, qualified P${s.q}` : ""}`}>
                    <span className="rw-slot-pos">{s.pos}</span>
                    <DriverAvatar id={s.r.Driver.driverId} name={fullName(s.r.Driver)} year={year} team={s.r.Constructor.constructorId} size={30} />
                    <span className="rw-slot-name">
                      <strong>{codeOf(s.r)}</strong>
                      <small>{s.qTime ? lapTime(s.qTime) : teamShortName(s.r.Constructor.name, year)}</small>
                    </span>
                    {s.q !== undefined && delta !== 0 && (
                      <span className={cx("rw-slot-delta", delta > 0 ? "drop" : "up")} title={`Qualified P${s.q}`}>
                        {delta > 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{Math.abs(delta)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
          {pit.length > 0 && (
            <div className="rw-grid-pit">
              <span className="eyebrow">Pit lane / did not take the start</span>
              <div className="rw-grid-pit-list">
                {pit.map((r) => (
                  <Link key={r.Driver.driverId} to={"driver/" + r.Driver.driverId} className="chip team" style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}>
                    {codeOf(r)}{qPos.has(r.Driver.driverId) ? ` · Q P${qPos.get(r.Driver.driverId)}` : ""} · {r.status}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Glass>
        <div className="rw-grid-side">
          <Glass className="kpi reveal">
            <span className="label">Pole position</span>
            <span className="value">{codeOf(slots[0].r)}</span>
            <span className="detail">{fullName(slots[0].r.Driver)} · {teamShortName(slots[0].r.Constructor.name, year)}</span>
          </Glass>
          {quali?.length ? (
            <Glass className="card rw-grid-moves reveal" style={{ "--i": 1 } as CSSProperties}>
              <div className="card-title"><h3>Grid vs qualifying</h3><Users size={16} /></div>
              {moved.length ? (
                <ul className="rw-grid-move-list">
                  {moved.sort((a, b) => (b.pos - (b.q || 0)) - (a.pos - (a.q || 0))).slice(0, 8).map((s) => {
                    const d = s.pos - (s.q || 0);
                    return (
                      <li key={s.r.Driver.driverId} style={{ "--tint": teamColor(s.r.Constructor) } as CSSProperties}>
                        <span className="team-bar" />
                        <strong>{s.r.Driver.familyName}</strong>
                        <span className="faint small">Q P{s.q} → Grid P{s.pos}</span>
                        <span className={cx("rw-slot-delta", d > 0 ? "drop" : "up")}>{d > 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{Math.abs(d)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="muted small">Every driver started where they qualified.</p>}
              <p className="faint xsmall rw-grid-note">
                {drops.length ? `${plural(drops.length, "driver")} started behind their qualifying position — usually a grid penalty; drivers behind them move up as a result.` : "No driver started behind their qualifying position."}
              </p>
            </Glass>
          ) : null}
        </div>
      </div>
      <Source value={env} label={source === "openf1" ? "Grid" : "Source"} />
      {quali?.length ? <Source value={qualiEnv} label="Qualifying" /> : null}
    </Section>
  );
}

/* ───────── Qualifying deep dive ───────── */
const SESSIONS = ["Q1", "Q2", "Q3"] as const;
type Q = (typeof SESSIONS)[number];

export function QualifyingDeepDive({ rows, year, env, race }: { rows: Result[]; year: string; env?: Envelope<unknown>; race?: RaceData }) {
  const [view, setView] = useState<"driver" | "team">("driver");
  const model = useMemo(() => {
    const present = SESSIONS.filter((k) => rows.some((r) => secs(r[k]) !== null));
    const best = (r: Result) => {
      const t = present.map((k) => secs(r[k])).filter((x): x is number => x !== null);
      return t.length ? Math.min(...t) : null;
    };
    const strips = present.map((k, i) => {
      const next = present[i + 1];
      const entries = rows.map((r) => ({ r, t: secs(r[k]) })).filter((x): x is { r: Result; t: number } => x.t !== null).sort((a, b) => a.t - b.t);
      const top = entries[0]?.t ?? 0;
      const advancing = next ? entries.filter((e) => secs(e.r[next]) !== null) : entries;
      const out = next ? entries.filter((e) => secs(e.r[next]) === null) : [];
      const lastIn = advancing.length ? advancing.reduce((a, b) => (b.t > a.t ? b : a)) : null;
      const firstOut = out.length ? out.reduce((a, b) => (b.t < a.t ? b : a)) : null;
      return { k, entries, top, out: new Set(out.map((e) => e.r.Driver.driverId)), lastIn, firstOut, margin: lastIn && firstOut ? firstOut.t - lastIn.t : null };
    });
    const bests = rows.map((r) => ({ r, t: best(r) })).filter((x): x is { r: Result; t: number } => x.t !== null);
    const fastest = bests.length ? Math.min(...bests.map((b) => b.t)) : 0;
    const teams = new Map<string, { r: Result; t: number }>();
    for (const b of bests) {
      const id = b.r.Constructor.constructorId;
      const cur = teams.get(id);
      if (!cur || b.t < cur.t) teams.set(id, b);
    }
    const teamRank = [...teams.values()].sort((a, b) => a.t - b.t);
    const knocked = (r: Result) => {
      const last = [...present].reverse().find((k) => secs(r[k]) !== null);
      if (!last) return "No time";
      const idx = present.indexOf(last);
      return idx < present.length - 1 ? `Out in ${last}` : null;
    };
    return { present, strips, bests, fastest, teamRank, knocked };
  }, [rows]);

  if (!model.bests.length) return null;
  const multi = model.present.length > 1;
  const maxGap = Math.max(0.001, ...model.bests.map((b) => b.t - model.fastest));
  const teamMax = Math.max(0.001, ...model.teamRank.map((b) => b.t - model.fastest));

  return (
    <Section id="rw-qualifying" title="Qualifying deep dive" subtitle={multi ? "How the knockout unfolded — who made each cut, by how much, and the pace order behind the grid." : "Pace order from the single qualifying session."}>
      {multi && (
        <Glass className="card rw-ko reveal">
          <div className="card-title"><h3><Scissors size={16} />Knockout</h3><span className="faint xsmall">Gap to the fastest time of each session</span></div>
          <div className="rw-ko-list">
            {model.strips.map((s) => {
              const span = Math.max(0.3, ...s.entries.map((e) => e.t - s.top));
              const at = (t: number) => `${Math.min(100, ((t - s.top) / span) * 100)}%`;
              return (
                <div key={s.k} className="rw-ko-row">
                  <div className="rw-ko-label">
                    <b>{s.k}</b>
                    <small>{plural(s.entries.length, "runner")}</small>
                  </div>
                  <div className="rw-ko-strip" role="img" aria-label={`${s.k}: ${s.entries.length} drivers set a time; ${s.out.size} eliminated${s.margin !== null ? `, cut-off margin ${s.margin.toFixed(3)} seconds` : ""}`}>
                    <span className="rw-ko-axis" aria-hidden />
                    {s.lastIn && s.firstOut && (
                      <span className="rw-ko-cut" style={{ left: at((s.lastIn.t + s.firstOut.t) / 2) }}>
                        <span>Cut · {s.margin! >= 0 ? "+" : "−"}{Math.abs(s.margin!).toFixed(3)}s</span>
                      </span>
                    )}
                    {s.entries.map((e) => (
                      <span role="img"
                        key={e.r.Driver.driverId}
                        className={cx("rw-ko-dot", s.out.has(e.r.Driver.driverId) && "out")}
                        style={{ left: at(e.t), "--tint": teamColor(e.r.Constructor) } as CSSProperties}
                        data-label={`${codeOf(e.r)} · ${e.r[s.k]}${e.t > s.top ? ` · +${(e.t - s.top).toFixed(3)}` : " · fastest"}`}
                        tabIndex={0}
                        aria-label={`${fullName(e.r.Driver)} ${e.r[s.k]}${s.out.has(e.r.Driver.driverId) ? ", eliminated" : ""}`}
                      />
                    ))}
                  </div>
                  <div className="rw-ko-meta">
                    {s.firstOut && s.lastIn ? (
                      <>
                        <span><b>{codeOf(s.lastIn.r)}</b> last through</span>
                        <span className="faint"><b>{codeOf(s.firstOut.r)}</b> first out</span>
                      </>
                    ) : <span className="faint">Final session</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="faint xsmall">Filled dots advanced; hollow red dots were knocked out. The dashed line sits between the slowest driver to advance and the fastest to be eliminated; its label is that margin.</p>
        </Glass>
      )}

      <div className="rw-qd">
        <Glass className="card rw-qd-bars reveal">
          <div className="rw-qd-bar-head">
            <h3>{view === "driver" ? "Gap to the fastest lap" : "Team pace rank"}</h3>
            <Segmented label="Qualifying pace view" value={view} onChange={setView} options={[{ value: "driver", label: "Drivers" }, { value: "team", label: "Teams" }]} />
          </div>
          {view === "driver" ? (
            <ol className="rw-qd-list">
              {model.bests.map((b, i) => {
                const g = b.t - model.fastest;
                return (
                  <li key={b.r.Driver.driverId} className="rw-qd-row" style={{ "--tint": teamColor(b.r.Constructor), "--w": `${(g / maxGap) * 100}%`, "--i": i % 12 } as CSSProperties}>
                    <span className="rw-qd-pos">{b.r.position}</span>
                    <span className="rw-qd-who"><strong>{codeOf(b.r)}</strong></span>
                    <span className="rw-qd-track">{g === 0 ? <span className="chip purple rw-qd-fast">{lapTime(b.t)}</span> : <i />}</span>
                    <span className="rw-qd-val">{g === 0 ? "Fastest" : `+${g.toFixed(3)}`}</span>
                    {model.knocked(b.r) && <span className="rw-qd-ko">{model.knocked(b.r)}</span>}
                  </li>
                );
              })}
            </ol>
          ) : (
            <ol className="rw-qd-list team">
              {model.teamRank.map((b, i) => {
                const g = b.t - model.fastest;
                const pct = (g / model.fastest) * 100;
                return (
                  <li key={b.r.Constructor.constructorId} className="rw-qd-row" style={{ "--tint": teamColor(b.r.Constructor), "--w": `${(g / teamMax) * 100}%`, "--i": i } as CSSProperties}>
                    <span className="rw-qd-pos">{i + 1}</span>
                    <span className="rw-qd-who team"><TeamLogo id={b.r.Constructor.constructorId} name={b.r.Constructor.name} year={year} size={22} /><strong>{teamShortName(b.r.Constructor.name, year)}</strong></span>
                    <span className="rw-qd-track">{g === 0 ? <span className="chip purple rw-qd-fast">{lapTime(b.t)}</span> : <i />}</span>
                    <span className="rw-qd-val">{g === 0 ? "Benchmark" : <>+{pct.toFixed(2)}%<small>+{g.toFixed(3)}s</small></>}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="faint xsmall">{view === "driver" ? "Each driver's best lap in any session, against the fastest lap of qualifying (normally the pole time). Ordered by qualifying position." : "Each team's single best lap in any session; percentage gap to the fastest team."}</p>
        </Glass>

        {multi && (
          <Glass className="card rw-qd-prog reveal" style={{ "--i": 1 } as CSSProperties}>
            <div className="card-title"><h3><TrendingDown size={16} />Session progression</h3><Gauge size={16} /></div>
            <div className="table-wrap" tabIndex={0}>
              <table className="tbl rw-qd-tbl">
                <caption className="sr-only">Qualifying times per session with improvement between sessions</caption>
                <thead><tr><th scope="col">Pos</th><th scope="col">Driver</th>{model.present.map((k) => <th key={k} scope="col" className="r">{k}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.Driver.driverId}>
                      <td><span className={cx("pos", +r.position <= 3 && "p" + r.position)}>{r.position}</span></td>
                      <td><span className="rw-qd-drv" style={{ "--tint": teamColor(r.Constructor) } as CSSProperties}><span className="team-bar" /><strong>{r.Driver.familyName}</strong></span></td>
                      {model.present.map((k, i) => {
                        const t = secs(r[k]);
                        const prev = i > 0 ? secs(r[model.present[i - 1] as Q]) : null;
                        const d = t !== null && prev !== null ? t - prev : null;
                        return (
                          <td key={k} className="r">
                            {t === null ? <span className="faint">—</span> : (
                              <span className="rw-qd-cell">
                                {r[k]}
                                {d !== null && <small className={d < 0 ? "better" : "worse"}>{d < 0 ? "−" : "+"}{Math.abs(d).toFixed(3)}</small>}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint xsmall">Small figures compare each time with the same driver's previous session — green means they found time.</p>
          </Glass>
        )}
      </div>
      {race && +race.season >= 2023 && <QualiOverlay race={race} rows={rows} year={year} />}
      <Source value={env} label="Qualifying" />
    </Section>
  );
}
