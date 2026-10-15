import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "motion/react";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Calculator, CircleSlash, Crown, Flag as FlagIcon, GripVertical,
  Info, Repeat2, RotateCcw, Shuffle, Sparkles, Trophy, Zap,
} from "lucide-react";
import { request, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, type Route } from "../lib/router";
import { shortRace, useCalendar } from "../lib/season";
import { circuitMedia, fullName, teamColor, teamOf, teamShortName } from "../lib/media";
import { hasStarted, plural, pts } from "../lib/format";
import { projectChampionship } from "../math.mjs";
import { Counter, Glass, Img, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, Flag } from "../ui/media";
import { Ring } from "../ui/charts";
import { RankDelta, Tween } from "./_champ";
import { ChampionshipDecider } from "./_season-decider";
import type { Envelope, Race, Standing } from "../types";
import "./scenarios.css";

/* ───────────────────────── Data ───────────────────────── */
type Official = { list: Standing[]; round: number };
/** Driver standings plus the round they were published after (same request as `standings()`, so it's cached). */
async function officialStandings(season: string): Promise<Envelope<Official>> {
  const r = await request<any>("jolpica", `${season}/driverStandings.json`);
  const sl = r.data.MRData.StandingsTable.StandingsLists[0];
  return { ...r, data: { list: sl?.DriverStandings || [], round: Number(sl?.round || 0) } };
}

type Scoring = { race: number[]; sprint: number[]; fastestLap: boolean; raceMax: number; sprintMax: number };
/** Points systems the scenario engine supports (2010 onward). */
function scoringFor(year: number): Scoring | null {
  if (year < 2010) return null;
  const race = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const sprint = year >= 2022 ? [8, 7, 6, 5, 4, 3, 2, 1] : year === 2021 ? [3, 2, 1] : [];
  const fastestLap = year >= 2019 && year <= 2024;
  return { race, sprint, fastestLap, raceMax: 25 + (fastestLap ? 1 : 0), sprintMax: sprint[0] || 0 };
}

const raceFinished = (r: Race, now: number) => hasStarted(r.date, r.time, now - 3 * 3600e3);

type Remaining = { races: Race[]; sprints: Race[]; max: number; doubleFinal: boolean };
function remainingEvents(calendar: Race[], standingsRound: number, year: number, sc: Scoring, now = Date.now()): Remaining {
  const races = calendar.filter((r) => +r.round > standingsRound || (+r.round === standingsRound && !raceFinished(r, now)));
  const sprints = sc.sprint.length ? calendar.filter((r) => r.Sprint && +r.round > standingsRound) : [];
  // 2014 awarded double points at the season finale (Abu Dhabi).
  const finale = calendar.at(-1);
  const doubleFinal = year === 2014 && !!finale && races.some((r) => r.round === finale.round);
  const max = races.length * sc.raceMax + (doubleFinal ? 25 : 0) + sprints.length * sc.sprintMax;
  return { races, sprints, max, doubleFinal };
}

type Odds = { id: string; s: Standing; points: number; max: number; alive: boolean; tieOnly: boolean; needs: number };
function contention(list: { s: Standing; points: number }[], remainingMax: number): Odds[] {
  const lead = Math.max(...list.map((x) => x.points));
  return list.map(({ s, points }) => {
    const max = points + remainingMax;
    return { id: s.Driver.driverId, s, points, max, alive: max >= lead, tieOnly: max === lead && points !== lead, needs: Math.max(0, lead - points) };
  });
}

/* ───────────────────────── Page ───────────────────────── */
export default function Scenarios(_: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle("Title Maths");
  const yr = +year;
  const sc = scoringFor(yr);
  const official = useData(() => officialStandings(season), [season]);
  const cal = useCalendar(season);
  const list = official.value?.data.list || [];
  const standingsRound = official.value?.data.round || 0;
  const calendar = cal.value?.data || [];
  const rem = useMemo(() => (sc && calendar.length ? remainingEvents(calendar, standingsRound, yr, sc) : null), [sc, calendar, standingsRound, yr]);
  const odds = useMemo(() => (rem && list.length ? contention(list.map((s) => ({ s, points: +s.points })), rem.max) : []), [rem, list]);
  const leaderTeam = list[0] && teamOf(list[0], year);
  useAmbient(teamColor(leaderTeam), teamColor(list[1] && teamOf(list[1], year)));

  const loading = official.loading || cal.loading;
  const error = official.error || cal.error;
  const next = rem?.races[0];

  return (
    <Page className="sc">
      {loading ? (
        <Skeleton h="min(62vh, 560px)" r={36} className="sc-hero-skel" />
      ) : error ? (
        <StateView error={error} onRetry={() => { official.reload(); cal.reload(); }} />
      ) : (
        <ScenarioHero year={year} list={list} odds={odds} rem={rem} next={next} supported={!!sc} lastRace={calendar.find((r) => +r.round === standingsRound)} />
      )}

      {!loading && !error && !sc && (
        <Section title="Title maths">
          <div className="notice"><Info /><p>Points systems before 2010 were different — fewer scoring places, other values and, in many seasons, only a driver's best results counted. This calculator and the simulator use the 2010-onward scoring, so they aren't available for {year}. The final <Link className="link" to="standings">standings</Link> are.</p></div>
        </Section>
      )}

      {!loading && !error && sc && rem && (
        <>
          {list.length > 0 && (
            <Section id="decider" title="Championship decider" subtitle="Exactly what each title contender needs — next weekend and beyond — from the official standings and the points still on offer.">
              <ChampionshipDecider list={list} calendar={calendar} standingsRound={standingsRound} year={year} />
              <Source value={official.value} />
            </Section>
          )}
          <Section
            id="contention"
            title="Who can still win?"
            subtitle={rem.max > 0 ? `A driver stays in contention while their points plus everything still available (${pts(rem.max)}) reaches the leader's current total.` : "No points remain — the championship is settled."}
          >
            {list.length ? (
              <ContentionBoard odds={odds} rem={rem} sc={sc} year={year} />
            ) : (
              <StateView empty emptyTitle="No standings yet" emptyText="The maths starts after the first Grand Prix." />
            )}
            <Source value={official.value} />
          </Section>

          {list.length > 1 && (
            <Section id="simulator" title="Simulate the next event" subtitle="Drag drivers into a finishing order and watch the table respond. Your scenario is separate from official results.">
              <Simulator list={list} year={year} sc={sc} rem={rem} next={next} />
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function ScenarioHero({ year, list, odds, rem, next, supported, lastRace }: { year: string; list: Standing[]; odds: Odds[]; rem: Remaining | null; next?: Race; supported: boolean; lastRace?: Race }) {
  const photo = circuitMedia((next || lastRace)?.Circuit.circuitId).hero;
  const leader = list[0], second = list[1];
  const alive = odds.filter((o) => o.alive);
  const lead = leader && second ? +leader.points - +second.points : 0;
  const settled = !!rem && !!leader && alive.length === 1;
  const tint = teamColor(leader && teamOf(leader, year));
  let headline: [string, string];
  if (!supported) headline = ["Title", "maths"];
  else if (!leader) headline = ["All to", "play for"];
  else if (settled) headline = [leader.Driver.familyName, rem && rem.max > 0 ? "has clinched the title" : `${year} World Champion`];
  else headline = [`${alive.length} drivers`, "can still be champion"];
  const clinchShare = rem && rem.max > 0 ? Math.min(1, lead / rem.max) : 1;

  return (
    <section className="sc-hero" style={{ "--tint": tint } as CSSProperties}>
      <div className="sc-hero-media">
        {photo && <Img src={photo} alt="" eager />}
        <span className="sc-hero-scrim" />
      </div>
      <div className="sc-hero-inner">
        <div className="sc-hero-copy">
          <span className="eyebrow sc-hero-eyebrow rise"><Calculator size={14} />Title maths · {year}</span>
          <h1 className="display sc-hero-title rise" style={{ "--i": 1 } as CSSProperties}>{headline[0]}<span>{headline[1]}</span></h1>
          {supported && rem && leader ? (
            <div className="sc-hero-stats rise" style={{ "--i": 2 } as CSSProperties}>
              <div className="sc-stat"><b><Counter value={rem.max} /></b><span>Points available</span></div>
              <div className="sc-stat"><b><Counter value={rem.races.length} /></b><span>{rem.races.length === 1 ? "Grand Prix left" : "Grands Prix left"}</span></div>
              <div className="sc-stat"><b><Counter value={rem.sprints.length} /></b><span>{rem.sprints.length === 1 ? "Sprint left" : "Sprints left"}</span></div>
              <div className="sc-stat"><b>{second ? <Counter value={lead} prefix="+" decimals={Number.isInteger(lead) ? 0 : 1} /> : "—"}</b><span>{leader.Driver.familyName}'s lead</span></div>
            </div>
          ) : (
            <p className="sc-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>Who can still win, and what would it take? The arithmetic of the championship, explained.</p>
          )}
          {next && (
            <p className="sc-hero-next rise" style={{ "--i": 3 } as CSSProperties}>
              <Flag country={next.Circuit.Location.country} />Next: {next.raceName}{next.Sprint && rem?.sprints.some((s) => s.round === next.round) ? " · Sprint weekend" : ""}
            </p>
          )}
        </div>
        {supported && rem && leader && second && (
          <div className="sc-hero-ring rise" style={{ "--i": 3 } as CSSProperties}>
            <Ring value={clinchShare} size={210} stroke={14} color={tint} label={rem.max > 0 ? `${leader.Driver.familyName}'s lead is ${Math.round(clinchShare * 100)}% of the points still available` : "Season complete"}>
              <div>
                <span className="sc-ring-num">{rem.max > 0 ? `${Math.round(clinchShare * 100)}%` : <Crown size={44} />}</span>
                <span className="sc-ring-cap">{rem.max > 0 ? <>lead vs points<br />still available</> : "Season complete"}</span>
              </div>
            </Ring>
            <p className="sc-ring-note">{rem.max > 0 ? (lead > rem.max ? "Lead exceeds everything left — title clinched." : `Clinches once the lead exceeds the points still available (${pts(rem.max)}).`) : "All points have been awarded."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Contention board ───────────────────────── */
function ContentionBoard({ odds, rem, sc, year }: { odds: Odds[]; rem: Remaining; sc: Scoring; year: string }) {
  const [all, setAll] = useState(false);
  const leadPts = Math.max(...odds.map((o) => o.points));
  const scale = Math.max(1, leadPts + rem.max);
  const aliveCount = odds.filter((o) => o.alive).length;
  const firstOut = odds.findIndex((o) => !o.alive);
  const limit = all ? odds.length : Math.max(8, firstOut === -1 ? 8 : firstOut + 3);
  const shown = odds.slice(0, limit);
  const leaderPct = (leadPts / scale) * 100;

  return (
    <Glass className="card sc-board reveal">
      <div className="sc-board-head">
        <div className="sc-legend">
          <span><i className="sc-key solid" />Current points</span>
          {rem.max > 0 && <span><i className="sc-key ghost" />Maximum still possible</span>}
          <span><i className="sc-key line" />Leader today ({pts(leadPts)})</span>
        </div>
        <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
          <span className="chip green"><Sparkles />{plural(aliveCount, "driver")} in contention</span>
          {odds.length - aliveCount > 0 && <span className="chip"><CircleSlash />{odds.length - aliveCount} eliminated</span>}
        </div>
      </div>

      <div className="sc-board-grid">
        <ol className="sc-rows">
          {shown.map((o, i) => {
            const team = teamOf(o.s, year);
            const curPct = (o.points / scale) * 100;
            const maxPct = (o.max / scale) * 100;
            const dividerBefore = i === firstOut && firstOut > 0;
            return (
              <li key={o.id} className={cx("sc-row reveal", !o.alive && "out", dividerBefore && "first-out")} style={{ "--tint": teamColor(team), "--i": Math.min(i, 10) } as CSSProperties}>
                <span className="sc-row-pos">{o.s.position}</span>
                <Link to={"driver/" + o.id} className="sc-row-who">
                  <DriverAvatar id={o.id} name={fullName(o.s.Driver)} year={year} team={team?.constructorId} size={34} />
                  <span><b>{o.s.Driver.familyName}</b><small>{team ? teamShortName(team.name, year) : ""}</small></span>
                </Link>
                <span className="sc-row-track" role="img" aria-label={`${fullName(o.s.Driver)}: ${pts(o.points)} points now, at most ${pts(o.max)}. ${o.alive ? (o.tieOnly ? "Can only tie the leader's current total." : "Still in contention.") : "Mathematically eliminated."}`}>
                  {rem.max > 0 && <span className="sc-row-ghost" style={{ left: curPct + "%", width: Math.max(0, maxPct - curPct) + "%" }} />}
                  <span className="sc-row-fill" style={{ width: Math.max(0.6, curPct) + "%" }} />
                  <i className="sc-row-mark" style={{ left: leaderPct + "%" }} />
                </span>
                <span className="sc-row-nums">
                  <b>{pts(o.points)}</b>
                  {rem.max > 0 && <small>max {pts(o.max)}</small>}
                </span>
                <span className="sc-row-state">
                  {i === 0 ? <span className="chip solid">Leader</span>
                    : o.alive ? <span className={cx("chip", o.tieOnly ? "yellow" : "green")} title={o.tieOnly ? "Best case equals the leader's current points; tie-breaks would decide" : `Needs to outscore the leader by ${pts(o.needs)} points`}>{o.tieOnly ? "Tie at best" : `−${pts(o.needs)}`}</span>
                    : <span className="chip sc-out">Out</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {odds.length > limit || all ? (
        <button className="btn sm plain sc-more" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${odds.length} drivers`}</button>
      ) : null}

      <div className="sc-explain">
        <div>
          <h3>How the bound works</h3>
          <p>Maximum = current points + {rem.races.length} {rem.races.length === 1 ? "race" : "races"} × {sc.raceMax}{sc.fastestLap ? " (25 for the win + 1 fastest lap)" : ""}{rem.sprints.length ? ` + ${rem.sprints.length} ${rem.sprints.length === 1 ? "sprint" : "sprints"} × ${sc.sprintMax}` : ""}{rem.doubleFinal ? " + 25 extra for the double-points finale" : ""} = <b>+{pts(rem.max)}</b> at most.</p>
        </div>
        <div className="notice sc-caveat"><AlertTriangle /><p>A simple mathematical bound: it assumes a driver wins everything left while the leader scores nothing, and ignores tie-breaks (count-back on wins, then second places) and any later penalties. Being "in contention" means it's arithmetically possible — not likely.</p></div>
      </div>
    </Glass>
  );
}

/* ───────────────────────── Simulator ───────────────────────── */
type Kind = "race" | "sprint";

function Simulator({ list, year, sc, rem, next }: { list: Standing[]; year: string; sc: Scoring; rem: Remaining; next?: Race }) {
  const yr = +year;
  const base = useMemo(() => list.map((s) => s.Driver.driverId), [list]);
  const [order, setOrder] = useState<string[]>(base);
  const [kind, setKind] = useState<Kind>("race");
  const [fastest, setFastest] = useState("");
  const byId = useMemo(() => new Map(list.map((s) => [s.Driver.driverId, s])), [list]);
  const sprintOk = yr >= 2021 && sc.sprint.length > 0;
  const table = kind === "sprint" ? sc.sprint : sc.race;
  const flOn = kind === "race" && sc.fastestLap;

  let projected: ReturnType<typeof projectChampionship> = [];
  let error = "";
  try {
    projected = projectChampionship(list, order, yr, kind, flOn ? fastest : "");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const currentRank = new Map(list.map((s, i) => [s.Driver.driverId, i + 1]));

  // Contention after this hypothetical event.
  const afterMax = Math.max(0, rem.max - (kind === "race" ? sc.raceMax + (rem.doubleFinal && rem.races.length === 1 ? 25 : 0) : sc.sprintMax));
  const afterOdds = projected.length ? contention(projected.map((s) => ({ s, points: s.projected })), afterMax) : [];
  const afterAlive = afterOdds.filter((o) => o.alive).length;
  const beforeAlive = contention(list.map((s) => ({ s, points: +s.points })), rem.max).filter((o) => o.alive).length;
  const nextSprint = next?.Sprint && rem.sprints.some((s) => s.round === next.round);

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const copy = [...order];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setOrder(copy);
  };
  const shuffle = () => {
    const copy = [...order];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    setOrder(copy);
  };

  return (
    <div className="sc-sim">
      <Glass className="card sc-builder reveal">
        <div className="sc-builder-head">
          <div>
            <span className="eyebrow"><FlagIcon size={13} />Your finishing order</span>
            <h3 className="title-3">{next ? `${shortRace(next.raceName)} ${kind === "sprint" ? "Sprint" : "Grand Prix"}` : `A hypothetical ${kind === "sprint" ? "sprint" : "Grand Prix"}`}</h3>
            {!next && <p className="faint small">No events remain in {year} — this adds a hypothetical one to the final table.</p>}
          </div>
          {sprintOk && (
            <Segmented label="Event format" value={kind} onChange={(k) => { setKind(k); setFastest(""); }} options={[{ value: "race", label: "Grand Prix" }, { value: "sprint", label: <><Zap size={13} style={{ display: "inline", verticalAlign: -2 }} /> Sprint</> }]} />
          )}
        </div>
        {kind === "sprint" && next && !nextSprint && <p className="sc-hint"><Info size={13} />The next round isn't a sprint weekend — treat this as any upcoming sprint.</p>}

        <div className="sc-presets" role="group" aria-label="Order presets">
          <button className="btn sm glass-btn" onClick={() => setOrder(base)}><RotateCcw />Standings order</button>
          <button className="btn sm glass-btn" onClick={() => setOrder([...base].reverse())}><Repeat2 />Reverse</button>
          <button className="btn sm glass-btn" onClick={shuffle}><Shuffle />Shuffle</button>
        </div>

        <Reorder.Group axis="y" values={order} onReorder={setOrder} as="ol" className="sc-order" aria-label="Finishing order — drag, or use the arrow buttons">
          {order.map((id, i) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <OrderItem
                key={id}
                id={id}
                s={s}
                index={i}
                count={order.length}
                points={table[i] || 0}
                cut={i === table.length - 1}
                year={year}
                onMove={move}
              />
            );
          })}
        </Reorder.Group>

        {flOn && (
          <label className="field sc-fl">
            <span>Fastest lap bonus (+1 if classified in the top ten)</span>
            <select className="select" value={fastest} onChange={(e) => setFastest(e.target.value)}>
              <option value="">No bonus point</option>
              {order.slice(0, 10).map((id) => <option key={id} value={id}>{fullName(byId.get(id)!.Driver)}</option>)}
            </select>
          </label>
        )}
        <p className="sc-scoring">
          {kind === "sprint" ? `Sprint: ${sc.sprint.join("–")}.` : `Grand Prix: ${sc.race.join("–")}${sc.fastestLap ? " + 1 for fastest lap (top ten)" : ""}.`} Positions below the dashed line score nothing.
        </p>
      </Glass>

      <div className="sc-result-col">
        <Glass className="card sc-result reveal" style={{ "--i": 1 } as CSSProperties}>
          <div className="sc-result-head">
            <div>
              <span className="eyebrow"><Trophy size={13} />Projected championship</span>
              <h3 className="title-3">If it finishes like this</h3>
            </div>
            <span className="chip purple">Simulated</span>
          </div>
          {error ? (
            <div className="notice sc-error" role="alert"><AlertTriangle /><p><b>Can't project this order.</b> {error}</p></div>
          ) : (
            <>
              <div className="sc-after">
                <span>Still in contention afterwards</span>
                <b><Tween value={afterAlive} duration={0.5} format={(n) => String(n)} /></b>
                <small>{afterAlive < beforeAlive ? `${beforeAlive - afterAlive} eliminated by this result` : afterAlive === 1 && afterMax >= 0 ? "Title decided" : "No one eliminated"}</small>
              </div>
              <ol className="sc-proj">
                <AnimatePresence initial={false}>
                  {projected.map((s, i) => {
                    const team = teamOf(s, year);
                    const was = currentRank.get(s.Driver.driverId) || 0;
                    const alive = afterOdds.find((o) => o.id === s.Driver.driverId)?.alive;
                    return (
                      <motion.li key={s.Driver.driverId} layout transition={{ type: "spring", stiffness: 380, damping: 34 }} className={cx("sc-proj-row", !alive && "out")} style={{ "--tint": teamColor(team) } as CSSProperties}>
                        <span className={cx("pos", i < 3 && "p" + (i + 1))}>{i + 1}</span>
                        <RankDelta value={was ? was - (i + 1) : null} title="Change vs the official table" />
                        <span className="sc-proj-who">
                          <i className="team-bar" />
                          <b>{s.Driver.familyName}</b>
                        </span>
                        <AnimatePresence mode="popLayout" initial={false}>
                          {s.added > 0 && (
                            <motion.span key={s.added} className="chip green sc-add" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>+{s.added}</motion.span>
                          )}
                        </AnimatePresence>
                        <span className="sc-proj-pts"><Tween value={s.projected} duration={0.45} /></span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </>
          )}
          <p className="sc-foot"><Info size={13} />Adds one event to the official standings. Ties keep the current order — count-back isn't recalculated.</p>
        </Glass>
        <Link to="standings?view=story" className="btn sm plain sc-link">See how the season got here<ArrowRight /></Link>
      </div>
    </div>
  );
}

function OrderItem({ id, s, index, count, points, cut, year, onMove }: {
  id: string; s: Standing; index: number; count: number; points: number; cut: boolean; year: string; onMove: (i: number, d: number) => void;
}) {
  const controls = useDragControls();
  const team = teamOf(s, year);
  const name = fullName(s.Driver);
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className={cx("sc-item", cut && "cut", points === 0 && "nopts")}
      style={{ "--tint": teamColor(team) } as CSSProperties}
      whileDrag={{ scale: 1.03, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.55)", zIndex: 5 }}
      transition={{ type: "spring", stiffness: 520, damping: 40 }}
    >
      <button type="button" className="sc-grip" onPointerDown={(e) => { e.preventDefault(); controls.start(e); }} aria-label={`Drag ${name}`} tabIndex={-1}>
        <GripVertical />
      </button>
      <span className="sc-item-pos">P{index + 1}</span>
      <DriverAvatar id={id} name={name} year={year} team={team?.constructorId} size={30} />
      <span className="sc-item-name"><b>{s.Driver.familyName}</b><small>{team ? teamShortName(team.name, year) : ""}</small></span>
      <span className={cx("sc-item-pts", points > 0 && "on")}>{points > 0 ? `+${points}` : "0"}</span>
      <span className="sc-item-move">
        <button type="button" className="icon-btn" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${name} up to P${index}`}><ArrowUp /></button>
        <button type="button" className="icon-btn" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${name} down to P${index + 2}`}><ArrowDown /></button>
      </span>
    </Reorder.Item>
  );
}
