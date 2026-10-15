/* Championship decider: exact title arithmetic for the next weekend, in plain English. */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { CalendarClock, Crown, Flag as FlagIcon, Info, Swords, Target, Zap } from "lucide-react";
import { Link } from "../lib/router";
import { shortRace } from "../lib/season";
import { fullName, teamColor, teamOf, teamShortName } from "../lib/media";
import { ordinal, plural, pts } from "../lib/format";
import { Glass, cx } from "../ui/core";
import { DriverAvatar, Flag } from "../ui/media";
import { decider, remainingWeekends, type Decider, type DeciderCombo, type Weekend } from "../season-analytics.mjs";
import type { Race, Standing } from "../types";

const gp = (raceName: string) => shortRace(raceName) + " GP";

export function ChampionshipDecider({ list, calendar, standingsRound, year }: { list: Standing[]; calendar: Race[]; standingsRound: number; year: string }) {
  const weekends = useMemo(() => remainingWeekends(calendar, standingsRound, year), [calendar, standingsRound, year]);
  const d = useMemo<Decider | null>(
    () => decider(list.map((s) => ({ id: s.Driver.driverId, name: s.Driver.familyName, points: s.points, wins: s.wins })), weekends, year),
    [list, weekends, year],
  );
  if (!d) return null;
  const byId = new Map(list.map((s) => [s.Driver.driverId, s]));
  const L = d.leader.name;
  const leaderStanding = byId.get(d.leader.id)!;
  const tint = teamColor(teamOf(leaderStanding, year));
  const next = d.next;
  const out = d.rivals.length - d.alive.length;

  let headline: ReactNode;
  let detail: ReactNode = null;
  if (d.settled) {
    headline = <>{L} {weekends.length ? "has clinched" : "won"} the {year} title.</>;
    detail = weekends.length
      ? <>A lead of {pts(d.leader.points - (d.rivals[0]?.points || 0))} points is more than the {pts(d.total)} still available, so nobody can catch him.</>
      : <>Every point has been awarded.</>;
  } else if (next) {
    const live = next.needs.filter((n) => !n.guaranteed);
    const where = `at the ${gp(next.raceName)}`;
    if (next.possible) {
      // Positive margin: he must outscore that rival. Zero or negative: he can afford to lose a little to them.
      const must = live.filter((n) => n.margin >= 1);
      const soft = live.filter((n) => n.margin < 1);
      const across = next.sprint ? " across the Sprint and Grand Prix" : "";
      headline = must.length ? (
        <>
          {L} clinches {where} if he outscores {must.map((n, i) => (
            <span key={n.id}>{i ? (i === must.length - 1 ? " and " : ", ") : ""}{n.name} by <b className="sa-hl">{pts(n.margin)}+</b>{i === 0 ? " points" : ""}</span>
          ))}{across}.
        </>
      ) : (
        <>{L} clinches {where} unless {soft.map((n, i) => <span key={n.id}>{i ? (i === soft.length - 1 ? " or " : ", ") : ""}{n.name} outscores him by <b className="sa-hl">{pts(1 - n.margin)}+</b></span>)}{across}.</>
      );
      const afford = must.length && soft.length ? (
        <> He can afford to {soft.map((n, i) => <span key={n.id}>{i ? (i === soft.length - 1 ? " and " : ", ") : ""}{n.margin === 0 ? <>only match {n.name}</> : <>lose up to {pts(-n.margin)} points to {n.name}</>}</span>)}.</>
      ) : null;
      detail = next.sprint
        ? <>For example: win both races ({next.swing} points) while {(must[0] || soft[0])?.name} scores no more than {pts(Math.max(0, next.swing - ((must[0] || soft[0])?.margin || 0)))}.{afford}</>
        : <>Only {pts(next.swing)} points are on offer this weekend; {pts(next.after)} remain after it.{afford}</>;
    } else {
      const worst = [...live].sort((a, b) => b.margin - a.margin)[0];
      headline = <>{L} can't clinch {where}.</>;
      detail = (
        <>
          He'd need to outscore {worst?.name} by {pts(worst?.margin || 0)} points, but only {pts(next.swing)} are available that weekend
          {next.sprint ? " (Sprint + Grand Prix)" : ""}.{" "}
          {d.earliest && <>Earliest possible clinch: <b className="sa-hl">{gp(d.earliest.raceName)}</b> (round {d.earliest.round}) — if he takes the maximum every weekend until then and {d.alive[0]?.name} scores nothing.</>}
        </>
      );
    }
  } else headline = <>No weekends remain.</>;

  return (
    <div className="sa-dec" style={{ "--tint": tint } as CSSProperties}>
      <Glass className="card sa-dec-lead reveal">
        <div className="sa-dec-lead-top">
          <span className="eyebrow"><Target size={13} />{d.settled ? "Title decided" : next ? `What ${L} needs · Round ${next.round}` : "Title maths"}</span>
          {next && <span className="chip"><Flag country={next.country} />{gp(next.raceName)}{next.sprint && <><Zap size={12} />Sprint weekend</>}</span>}
        </div>
        <div className="sa-dec-lead-body">
          <DriverAvatar id={d.leader.id} name={fullName(leaderStanding.Driver)} year={year} team={teamOf(leaderStanding, year)?.constructorId} size={64} />
          <div>
            <p className="sa-dec-headline">{headline}</p>
            {detail && <p className="sa-dec-detail">{detail}</p>}
          </div>
        </div>
        {next?.possible && next.combos.length > 0 && <Combos combos={next.combos} leader={L} />}
        {!d.settled && <Timeline d={d} weekends={weekends} />}
      </Glass>

      {d.chasers.length > 0 && next && (
        <div className="sa-dec-chasers">
          {d.chasers.map((c, i) => {
            const s = byId.get(c.id);
            const team = s && teamOf(s, year);
            return (
              <Glass key={c.id} className="card sa-chaser reveal" style={{ "--tint": teamColor(team), "--i": i } as CSSProperties}>
                <div className="sa-chaser-head">
                  {s && <DriverAvatar id={c.id} name={fullName(s.Driver)} year={year} team={team?.constructorId} size={40} />}
                  <span><Link to={"driver/" + c.id}><b>{c.name}</b></Link><small>{team ? teamShortName(team.name, year) : ""} · P{s?.position}</small></span>
                  <span className="sa-chaser-gap">−{pts(c.deficit)}</span>
                </div>
                <ul className="sa-chaser-list">
                  <li><Swords size={14} />Must outscore {L} by more than {pts(c.deficit)} over {plural(d.maxes.length, "weekend")} — {c.perWeekend.toFixed(1)} a weekend on average (a tie goes to count-back).</li>
                  <li>
                    <FlagIcon size={14} />
                    {c.safeThisWeekend
                      ? <>Can't be eliminated at the {gp(next.raceName)}.</>
                      : <>{c.eliminatedIfOutscoredBy > 0
                          ? <>Out after the {gp(next.raceName)} if {L} outscores him by {pts(c.eliminatedIfOutscoredBy)}+.</>
                          : <>Out after the {gp(next.raceName)} unless he outscores {L} by {pts(1 - c.eliminatedIfOutscoredBy)}+.</>} If {L} wins{next.sprint ? " both races" : ""}, {c.name} must score at least <b>{pts(c.mustScoreIfLeaderMax)}</b>{c.mustFinish?.pos ? <> — {ordinal(c.mustFinish.pos)} or better</> : !next.sprint && c.mustScoreIfLeaderMax > 0 ? <> — more than second place pays, so he needs {L} to slip</> : null}.</>}
                  </li>
                  {c.canLeadThisWeekend && <li className="good"><Crown size={14} />Can take the championship lead this weekend.</li>}
                  {!c.canLeadThisWeekend && c.canTieThisWeekend && <li className="good"><Crown size={14} />Can draw level on points this weekend.</li>}
                </ul>
              </Glass>
            );
          })}
        </div>
      )}

      <p className="sa-dec-foot">
        <Info size={13} />
        Exact arithmetic from the official standings: up to {d.sys.race[0]} per Grand Prix{d.sys.fastestLap ? " + 1 for fastest lap (top ten)" : ""}{d.sys.sprint.length ? `, ${d.sys.sprint[0]} per sprint` : ""}{d.sys.doubleFinale ? ", double points at the finale" : ""}. "Clinch" means a lead bigger than every point still available — level on points goes to count-back. Ignores future penalties.{out > 0 ? ` ${plural(out, "driver")} can no longer win.` : ""}
      </p>
    </div>
  );
}

function Combos({ combos, leader }: { combos: DeciderCombo[]; leader: string }) {
  return (
    <div className="sa-combos">
      <span className="sa-combos-label">Finishes that clinch it</span>
      <ul>
        {combos.slice(0, 6).map((c) => (
          <li key={c.leaderPos}>
            <b>{c.leaderPos === 1 ? `${leader} wins` : `${leader} ${ordinal(c.leaderPos)}`}</b>
            {c.rivals.every((r) => r.any) ? <span>whatever the others do</span> : c.rivals.filter((r) => !r.any).map((r) => (
              <span key={r.id}>{r.scoresNothing ? `${r.name} outside the points` : `${r.name} ${ordinal(r.atBest)} or lower`}</span>
            ))}
          </li>
        ))}
      </ul>
      <small className="faint">Grand Prix positions only{combos.length > 6 ? `; ${combos.length - 6} more combinations` : ""}.</small>
    </div>
  );
}

function Timeline({ d, weekends }: { d: Decider; weekends: Weekend[] }) {
  if (!weekends.length || !d.next) return null;
  return (
    <div className="sa-tl" role="list" aria-label="Remaining weekends and the most points available">
      {weekends.map((w, k) => {
        const isEarliest = d.earliest?.index === k;
        return (
          <div key={w.round} role="listitem" className={cx("sa-tl-node", k === 0 && "next", isEarliest && "earliest")} title={`${w.raceName}: up to ${w.max} points${w.sprint ? " (sprint weekend)" : ""}; ${d.after[k]} remain afterwards`}>
            <span className="sa-tl-dot" />
            <span className="sa-tl-max">+{w.max}{w.sprint && <Zap size={10} />}</span>
            <span className="sa-tl-name"><Flag country={w.country} />{shortRace(w.raceName)}</span>
            {isEarliest ? <span className="sa-tl-tag"><CalendarClock size={11} />Earliest clinch</span> : <span className="sa-tl-after">{d.after[k]} left</span>}
          </div>
        );
      })}
    </div>
  );
}
