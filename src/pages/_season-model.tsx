/* Championship Monte Carlo: chunked, seeded, cached. Clearly a model — never a prediction. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { ArrowRight, Dices, Info, Sparkles, Trophy } from "lucide-react";
import { Link } from "../lib/router";
import { shortRace } from "../lib/season";
import { fullName, teamColor, teamShortName } from "../lib/media";
import { plural, pts } from "../lib/format";
import { Glass, Segmented, Skeleton, StateView, cx } from "../ui/core";
import { DriverAvatar, Flag, TeamLogo } from "../ui/media";
import {
  createSimulation, formInputs, hashSeed, pointsSystem, remainingWeekends,
  type SimInput, type SimResult, type SimSummary, type Weekend,
} from "../season-analytics.mjs";
import { ModelBadge, pct } from "./_season";
import type { Driver, Race, Standing, Team, TeamStanding } from "../types";

const SIMS = 20000;
const cache = new Map<string, SimResult>();

/** Runs a simulation in idle-time chunks so scrolling stays smooth; results are memoised by input key. */
function useSimulation(model: { key: string; input: SimInput } | null) {
  const [state, setState] = useState<{ key: string; progress: number; result?: SimResult; error?: string }>({ key: "", progress: 0 });
  useEffect(() => {
    if (!model) return;
    const hit = cache.get(model.key);
    if (hit) { setState({ key: model.key, progress: 1, result: hit }); return; }
    let cancelled = false;
    let sim: ReturnType<typeof createSimulation>;
    try { sim = createSimulation(model.input); } catch (e) { setState({ key: model.key, progress: 0, error: String(e) }); return; }
    const idle = typeof requestIdleCallback === "function"
      ? (cb: (d: IdleDeadline) => void) => requestIdleCallback(cb, { timeout: 120 })
      : (cb: (d: IdleDeadline) => void) => window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 10 } as IdleDeadline), 16);
    const cancel = typeof cancelIdleCallback === "function" ? cancelIdleCallback : window.clearTimeout;
    let handle = 0;
    const work = (deadline: IdleDeadline) => {
      if (cancelled) return;
      let finished = false;
      do finished = sim.step(400); while (!finished && deadline.timeRemaining() > 4);
      if (finished) {
        const result = sim.result();
        cache.set(model.key, result);
        setState({ key: model.key, progress: 1, result });
      } else {
        setState({ key: model.key, progress: sim.done / sim.total });
        handle = idle(work);
      }
    };
    setState({ key: model.key, progress: 0 });
    handle = idle(work);
    return () => { cancelled = true; cancel(handle); };
  }, [model?.key]);
  return state.key === model?.key ? state : { key: "", progress: 0 };
}

type Kind = "drivers" | "constructors";

export function ChampionshipModel({ year, list, teams, races, calendar, standingsRound, latest, hasTeams, initial = "drivers" }: {
  year: string; list: Standing[]; teams: TeamStanding[]; races: Race[]; calendar: Race[]; standingsRound: number;
  latest: Map<string, string>; hasTeams: boolean; initial?: Kind;
}) {
  const [kind, setKind] = useState<Kind>(initial === "constructors" && hasTeams && teams.length ? "constructors" : "drivers");
  const sys = pointsSystem(year);
  const weekends = useMemo<Weekend[]>(() => (sys && calendar.length && standingsRound ? remainingWeekends(calendar, standingsRound, year) : []), [sys, calendar, standingsRound, year]);
  const model = useMemo(() => {
    if (!sys || !weekends.length || !list.length || !races.length) return null;
    const form = formInputs(races);
    if (!form.length) return null;
    const official = new Map(list.map((s) => [s.Driver.driverId, s]));
    const racing = new Set(form.map((f) => f.id));
    const drivers = form.map((f) => ({ ...f, points: +(official.get(f.id)?.points || 0), wins: +(official.get(f.id)?.wins || 0) }));
    const others = list.filter((s) => !racing.has(s.Driver.driverId)).map((s) => ({ id: s.Driver.driverId, points: +s.points, wins: +s.wins }));
    const teamRows = teams.map((t) => ({ id: t.Constructor.constructorId, points: +t.points }));
    const signature = list.map((s) => s.Driver.driverId + s.points).join(",") + "|" + teamRows.map((t) => t.id + t.points).join(",") + "|" + weekends.map((w) => w.round + (w.sprint ? "s" : "")).join(",");
    const key = `${year}:${standingsRound}:${hashSeed(signature)}`;
    return { key, input: { drivers, others, teams: teamRows, weekends, year, sims: SIMS, seed: hashSeed(key) } satisfies SimInput };
  }, [sys, weekends, list, teams, races, year, standingsRound]);
  const sim = useSimulation(model);

  if (!sys)
    return <StateView empty emptyTitle="Model unavailable for this era" emptyText="Before 1991 only a driver's best results counted, so a points simulation would mislead. Final standings are above." />;
  if (!weekends.length)
    return <StateView empty emptyTitle="Season complete" emptyText="Every point has been awarded — there's nothing left to simulate. The champion is in the table above." />;
  if (!model) return <StateView empty emptyTitle="Not enough data yet" emptyText="The model needs at least one classified Grand Prix this season." />;
  if (sim.error) return <StateView error={sim.error} />;

  const people = new Map<string, { driver?: Driver; team?: Team }>();
  for (const s of list) {
    const tid = latest.get(s.Driver.driverId);
    people.set(s.Driver.driverId, { driver: s.Driver, team: s.Constructors.find((c) => c.constructorId === tid) || s.Constructors.at(-1) });
  }
  const teamById = new Map(teams.map((t) => [t.Constructor.constructorId, t.Constructor]));
  const res = sim.result;

  return (
    <Glass className="card sa-model reveal">
      <div className="sa-model-head">
        <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
          <ModelBadge />
          <span className="chip"><Dices size={13} />{SIMS.toLocaleString()} simulated finishes</span>
          <span className="chip">{plural(weekends.length, "weekend")} · {plural(weekends.filter((w) => w.sprint).length, "sprint")} left</span>
        </div>
        {hasTeams && teams.length > 0 && <Segmented label="Championship" value={kind} onChange={setKind} options={[{ value: "drivers", label: "Drivers" }, { value: "constructors", label: "Constructors" }]} />}
      </div>

      {!res ? (
        <div className="sa-model-run" role="status" aria-live="polite">
          <div className="sa-model-run-label"><Sparkles size={14} />Simulating the remaining {plural(weekends.length, "weekend")}… {Math.round(sim.progress * 100)}%</div>
          <div className="bar-track"><div className="sa-model-run-fill" style={{ width: sim.progress * 100 + "%" }} /></div>
          <Skeleton h={300} r={22} />
        </div>
      ) : (
        <ModelBody res={res} kind={kind} year={year} people={people} teamById={teamById} weekends={weekends} />
      )}

      <div className="sa-model-foot">
        <Info size={13} />
        <p>
          <b>How it works.</b> Each simulated weekend, every driver on the current grid draws a Grand Prix result from their last eight starts, weighted towards the most recent (×0.8 per race back), blended with a small chance of any result. Draws are ranked into a classification and scored with the {year} points system{sys.sprint.length ? `; the ${weekends.filter((w) => w.sprint).length} remaining sprint ${weekends.filter((w) => w.sprint).length === 1 ? "weekend draws" : "weekends draw"} again and score ${sys.sprint.join("-")}` : ""}{sys.fastestLap ? "; the fastest-lap point goes to a random top-ten finisher" : ""}. Ties on points go to the driver with more wins. It ignores car upgrades, grid penalties, weather and team orders — it's a model, not a prediction. The seed is fixed, so the numbers only change when results do.
        </p>
      </div>
    </Glass>
  );
}

function ModelBody({ res, kind, year, people, teamById, weekends }: {
  res: SimResult; kind: Kind; year: string; people: Map<string, { driver?: Driver; team?: Team }>; teamById: Map<string, Team>; weekends: Weekend[];
}) {
  const rows: SimSummary[] = kind === "drivers" ? res.drivers : res.teams;
  const contenders = rows.filter((r) => r.title > 0).slice(0, 8);
  const bars = contenders.length ? contenders : rows.slice(0, 3);
  const spread = [...rows].sort((a, b) => b.mean - a.mean).slice(0, 8);
  const lo = Math.min(...spread.map((r) => r.current)), hi = Math.max(...spread.map((r) => r.p90));
  const x = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;
  const ident = (id: string) => {
    if (kind === "drivers") {
      const p = people.get(id);
      return { name: p?.driver?.familyName || id, full: p?.driver ? fullName(p.driver) : id, color: teamColor(p?.team), node: <DriverAvatar id={id} name={p?.driver ? fullName(p.driver) : id} year={year} team={p?.team?.constructorId} size={34} />, sub: p?.team ? teamShortName(p.team.name, year) : "" };
    }
    const t = teamById.get(id);
    return { name: t ? teamShortName(t.name, year) : id, full: t?.name || id, color: teamColor(id), node: <TeamLogo id={id} name={t?.name || id} year={year} size={34} />, sub: t?.nationality || "" };
  };
  const decided = res.clinch.slice(0, -1);
  const tie = res.clinch.at(-1)?.probability || 0;
  const peak = Math.max(...decided.map((c) => c.probability), tie, 0.0001);

  return (
    <div className="sa-model-grid">
      <section className="sa-model-block" aria-labelledby="sa-odds">
        <h3 id="sa-odds" className="sa-model-title"><Trophy size={15} />Title probability</h3>
        <ol className="sa-odds">
          {bars.map((r, i) => {
            const who = ident(r.id);
            return (
              <li key={r.id} className="sa-odds-row" style={{ "--tint": who.color } as CSSProperties}>
                <span className="sa-odds-who">{who.node}<span><b>{who.name}</b><small>{who.sub}</small></span></span>
                <span className="sa-odds-track" role="img" aria-label={`${who.full}: ${pct(r.title)} of simulations`}>
                  <motion.i initial={{ width: 0 }} whileInView={{ width: Math.max(0.8, r.title * 100) + "%" }} viewport={{ once: true }} transition={{ duration: 1.1, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }} />
                </span>
                <b className="sa-odds-pct">{pct(r.title)}</b>
              </li>
            );
          })}
        </ol>
        {rows.length > bars.length && <p className="faint xsmall">Everyone else won the title in none of the {res.sims.toLocaleString()} simulations.</p>}
      </section>

      <section className="sa-model-block" aria-labelledby="sa-final">
        <h3 id="sa-final" className="sa-model-title">Expected final points <small>80% of simulations fall inside the bar</small></h3>
        <ul className="sa-range">
          {spread.map((r) => {
            const who = ident(r.id);
            return (
              <li key={r.id} style={{ "--tint": who.color } as CSSProperties} title={`${who.full}: now ${pts(r.current)}, expected ${Math.round(r.mean)} (80%: ${Math.round(r.p10)}–${Math.round(r.p90)})`}>
                <span className="sa-range-name">{who.name}</span>
                <span className="sa-range-track">
                  <i className="sa-range-now" style={{ left: x(r.current) + "%" }} />
                  <i className="sa-range-band" style={{ left: x(r.p10) + "%", width: Math.max(0.6, x(r.p90) - x(r.p10)) + "%" }} />
                  <i className="sa-range-mean" style={{ left: x(r.mean) + "%" }} />
                </span>
                <span className="sa-range-val"><b>{Math.round(r.mean)}</b><small>{Math.round(r.p10)}–{Math.round(r.p90)}</small></span>
              </li>
            );
          })}
        </ul>
        <p className="sa-range-key faint xsmall"><span><i className="sa-key-now" />Points today</span><span><i className="sa-key-band" />80% interval</span><span><i className="sa-key-mean" />Mean</span></p>
      </section>

      {kind === "drivers" && (
        <section className="sa-model-block span" aria-labelledby="sa-clinch">
          <h3 id="sa-clinch" className="sa-model-title">When the title is settled <small>share of simulations in which the champion was mathematically certain after each weekend</small></h3>
          <div className="sa-clinch">
            {decided.map((c, k) => (
              <div key={c.round} className={cx("sa-clinch-col", c.probability === peak && c.probability > 0 && "peak")}>
                <span className="sa-clinch-pct">{c.probability > 0 ? pct(c.probability) : "—"}</span>
                <span className="sa-clinch-bar"><i style={{ height: (c.probability / peak) * 100 + "%" }} /></span>
                <Flag country={weekends[k]?.country} />
                <span className="sa-clinch-name">{shortRace(c.raceName)}</span>
              </div>
            ))}
          </div>
          {tie > 0 && <p className="faint xsmall">{pct(tie)} of simulations finished level on points, decided on count-back.</p>}
          <Link to="scenarios" className="btn sm glass-btn sa-model-link">Exact clinch scenarios for the next race<ArrowRight /></Link>
        </section>
      )}
    </div>
  );
}
