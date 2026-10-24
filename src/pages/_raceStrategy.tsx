/* Race weekend · pit-stop strategy explorer (undercut / overcut outcomes, pit loss, stop timeline). 2023 onward. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, Crown, GitCompareArrows, Info, Loader2, Timer, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { request, useData } from "../api";
import { Link } from "../lib/router";
import { teamShortName } from "../lib/media";
import { plural } from "../lib/format";
import { BATTLE_RULES, battleSummary, pitBattles, pitLoss, stopsByDriver, type Battle, type PitRow } from "../race-x.mjs";
import { Glass, Section, Segmented, Skeleton, Source, StateView, cx } from "../ui/core";
import { DriverAvatar, TeamLogo } from "../ui/media";
import type { Race as RaceData, Result } from "../types";
import { RCStrip } from "./_raceAnalysis";
import { neutralWindows, none, type Analysis, type AnalysisState, type Who } from "./_raceData";
import "./_raceX.css";

const OUTCOME: Record<Battle["outcome"], { label: string; cls: string }> = {
  "undercut-worked": { label: "Undercut worked", cls: "good" },
  "undercut-failed": { label: "Undercut failed", cls: "bad" },
  "overcut-worked": { label: "Overcut worked", cls: "good" },
  "overcut-failed": { label: "Overcut failed", cls: "bad" },
  neutralised: { label: "SC / VSC stop", cls: "neutral" },
};
const COMPOUND: Record<string, string> = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "inter", WET: "wet" };
const WINDOWS = ["2", "3", "5"] as const;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const gapText = (v: number) => `${Math.abs(v).toFixed(1)} s ${v > 0 ? "behind" : "ahead"}`;

export function StrategyExplorer({ race, results, analysis, year }: { race: RaceData; results: Result[]; analysis: AnalysisState; year: string }) {
  const eligible = +race.season >= 2023;
  const [want, setWant] = useState(false);
  const a = analysis.status === "done" ? analysis.data : undefined;
  useEffect(() => { if (want && analysis.status === "idle") analysis.start(); }, [want, analysis.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const sk = a?.session.session_key;
  const pit = useData(() => (want && sk ? request<PitRow[]>("openf1", "pit", { session_key: sk }) : none([] as PitRow[])), [want, sk]);
  if (!eligible) return null;

  const loadingAnalysis = want && (analysis.status === "idle" || analysis.status === "loading");
  return (
    <Section id="rw-strategy" title="Strategy explorer" subtitle="Every stop judged against the car it was racing: who gained by pitting first, who by staying out, and what a stop costs here.">
      {!want ? (
        <Glass className="rw-cta reveal">
          <span className="rw-cta-icon"><GitCompareArrows /></span>
          <div className="rw-cta-copy">
            <h3>Undercut or overcut?</h3>
            <p className="muted">Pairs every pit stop with the cars running within a few seconds of it, then checks the order once both have stopped. Uses the OpenF1 session archive (lap times, race control, tyres and pit lane — about ten requests, shared with the other OpenF1 sections).</p>
          </div>
          <div className="rw-cta-acts">
            <button className="btn primary lg" onClick={() => setWant(true)}><GitCompareArrows />Analyse strategy</button>
          </div>
        </Glass>
      ) : loadingAnalysis || (a && pit.loading) ? (
        <Glass className="card rsx-loading" role="status" aria-live="polite">
          <div className="rsx-progress"><Loader2 className="rw-spin" /><span><strong>{analysis.status === "loading" ? `Loading the OpenF1 session · ${analysis.current || "…"}` : "Loading pit-lane times…"}</strong><small className="faint">{analysis.status === "loading" ? `${analysis.done} of ${analysis.total} requests` : "One more request"} · queued to respect the provider's rate limit.</small></span></div>
          <Skeleton h={360} r={20} />
        </Glass>
      ) : analysis.status === "error" ? (
        <StateView error={analysis.error} onRetry={analysis.retry} />
      ) : analysis.status === "missing" ? (
        <StateView empty emptyTitle="Not in the OpenF1 archive yet" emptyText="OpenF1 hasn't published this race session; the strategy explorer needs its lap timing." />
      ) : pit.error ? (
        <StateView error={pit.error} onRetry={pit.reload} />
      ) : a ? (
        <Explorer a={a} pits={pit.value?.data || []} results={results} year={year} env={pit.value} />
      ) : null}
    </Section>
  );
}

function Explorer({ a, pits, results, year, env }: { a: Analysis; pits: PitRow[]; results: Result[]; year: string; env?: { data: unknown; meta: { source: string; url: string; fetchedAt: string; status: string } } }) {
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(String(BATTLE_RULES.window) as "3");
  const totalLaps = Math.max(+results[0]?.laps || 0, ...a.laps.map((l) => l.lap_number), 1);
  const neutral = useMemo(() => (!a.failed.includes("race_control") ? neutralWindows(a.control, totalLaps) : []), [a, totalLaps]);
  const battles = useMemo(() => pitBattles({ laps: a.laps, pits, neutral, window: +win }), [a.laps, pits, neutral, win]);
  const summary = battleSummary(battles);
  const loss = useMemo(() => pitLoss({ laps: a.laps, pits, neutral }), [a.laps, pits, neutral]);
  const stops = useMemo(() => stopsByDriver(pits), [pits]);
  const best = battles.filter((b) => !b.neutralised && b.worked && b.gain > 0).sort((x, y) => y.gain - x.gain).slice(0, 3);
  const [showAll, setShowAll] = useState(false);

  if (!pits.length) return <StateView empty emptyTitle="No pit stops in the archive" emptyText="OpenF1 has no pit-lane records for this race." />;
  if (!a.laps.length) return <StateView empty emptyTitle="No lap timing" emptyText="OpenF1 has no lap records for this race, which the explorer needs to measure gaps." />;
  const listed = showAll ? battles : battles.slice(0, 12);

  return (
    <>
      <div className="rsx-bar reveal">
        <Segmented label="Running within" value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w, label: `Within ${w} s` }))} />
        <span className="faint xsmall">Gap on the road at the end of the lap before the first car's stop.</span>
      </div>
      <div className="rsx-kpis">
        <Glass className="kpi rsx-kpi reveal">
          <span className="label"><TrendingUp size={13} />Undercuts</span>
          <span className="value">{summary.undercut.worked}<small>/{summary.undercut.tries}</small></span>
          <span className="detail">{summary.undercut.tries ? `${pct(summary.undercut.worked, summary.undercut.tries)} worked` : "No attempts in range"}</span>
        </Glass>
        <Glass className="kpi rsx-kpi reveal" style={{ "--i": 1 } as CSSProperties}>
          <span className="label"><TrendingDown size={13} />Overcuts</span>
          <span className="value">{summary.overcut.worked}<small>/{summary.overcut.tries}</small></span>
          <span className="detail">{summary.overcut.tries ? `${pct(summary.overcut.worked, summary.overcut.tries)} worked` : "No attempts in range"}</span>
        </Glass>
        <Glass className="kpi rsx-kpi reveal" style={{ "--i": 2 } as CSSProperties}>
          <span className="label"><Timer size={13} />Pit-lane time</span>
          <span className="value">{loss.lane !== null ? `${loss.lane.toFixed(1)}s` : "—"}</span>
          <span className="detail">Median entry → exit · {plural(loss.lanes, "green stop")}</span>
        </Glass>
        <Glass className="kpi rsx-kpi reveal" style={{ "--i": 3 } as CSSProperties}>
          <span className="label"><Wrench size={13} />Pit-stop loss</span>
          <span className="value">{loss.loss !== null ? `≈${loss.loss.toFixed(1)}s` : "—"}</span>
          <span className="detail">{loss.greenLap !== null ? `vs a ${loss.greenLap.toFixed(1)} s median green lap · ${plural(loss.n, "stop")}` : "Not enough green laps"}</span>
        </Glass>
      </div>

      {best.length > 0 && (
        <div className="rsx-best">
          <h3 className="rsx-h"><Crown size={16} />Best strategy calls</h3>
          <div className="rsx-best-list">
            {best.map((b, i) => <BestCall key={i} b={b} who={a.who} year={year} rank={i + 1} />)}
          </div>
        </div>
      )}

      <Glass className="card flush rsx-table reveal">
        <div className="rsx-table-head">
          <h3 className="rsx-h"><GitCompareArrows size={16} />Every pit battle</h3>
          <span className="faint xsmall">{plural(summary.green, "green-flag battle")}{summary.neutralised ? ` · ${summary.neutralised} under SC / VSC` : ""}</span>
        </div>
        {battles.length ? (
          <>
            <div className="table-wrap">
              <table className="tbl rsx-tbl">
                <caption className="sr-only">Pit-stop battles: the car that stopped first, its rival, gaps before and after both stops, and the outcome</caption>
                <thead>
                  <tr><th scope="col">Stops</th><th scope="col">First to stop → rival</th><th scope="col">Before</th><th scope="col">After both stops</th><th scope="col">Outcome</th><th scope="col" className="r" title="Seconds gained on the rival by the car that made the call">Gain</th></tr>
                </thead>
                <tbody>
                  {listed.map((b, i) => {
                    const f = a.who(b.first), s = a.who(b.second);
                    const o = OUTCOME[b.outcome];
                    return (
                      <tr key={i} className={cx(b.neutralised && "rsx-dim")}>
                        <td className="rsx-laps"><b>L{b.firstLap}</b><small>then L{b.secondLap}</small></td>
                        <td><span className="rsx-pair"><Chip w={f} year={year} /><ArrowRight size={13} className="faint" /><Chip w={s} year={year} /></span></td>
                        <td className="rsx-gap"><b>P{b.posBefore[0] ?? "?"}</b> · {gapText(b.before)}</td>
                        <td className="rsx-gap"><b>P{b.posAfter[0] ?? "?"}</b> · {gapText(b.after)}</td>
                        <td><span className={cx("rsx-outcome", o.cls)}>{o.label}</span></td>
                        <td className="r"><b className={cx("rsx-gain", b.gain > 0 ? "up" : "down")}>{b.gain > 0 ? "+" : "−"}{Math.abs(b.gain).toFixed(1)}s</b><small className="rsx-by">{a.who(b.caller).code}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {battles.length > 12 && <div className="rsx-more"><button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${battles.length}`}</button></div>}
          </>
        ) : (
          <p className="muted small rsx-none">No pair of cars was within {win} s of each other when the first of them stopped (and both stopped within {BATTLE_RULES.maxLapsApart} laps). Try a wider window.</p>
        )}
      </Glass>

      <StopTimeline a={a} stops={stops} totalLaps={totalLaps} neutral={neutral} year={year} />

      <div className="notice rsx-rules">
        <Info />
        <div>
          <strong>How battles are judged (heuristic)</strong>
          <ul>
            <li>Two cars count as racing when they are within <b>{win} s</b> on the road (line-crossing times from OpenF1 laps) at the end of the lap before the first of them pits.</li>
            <li>The rival must make its next stop <b>1–{BATTLE_RULES.maxLapsApart} laps</b> later; same-lap stops aren't undercuts. The order is checked at the end of the rival's out-lap.</li>
            <li>First to stop and behind → <b>undercut</b> (worked if ahead after). First to stop but ahead → the car behind stayed out, an <b>overcut</b> (worked if it is ahead after). Gain is seconds won on the rival by the car that made the call.</li>
            <li>Stops with an in- or out-lap under a safety car, VSC or red flag are shown dimmed and not counted. Pit-stop loss = in-lap + out-lap − 2 × the driver's median green lap (laps beyond 107% of it excluded), median over green stops. Pit-lane times above 45 s (repairs, penalties, red flags) are left out of the pit-lane median.</li>
          </ul>
        </div>
      </div>
      <Source value={env} label="Pit lane" />
      <Source value={a.env.laps} label="Lap timing" />
    </>
  );
}

function Chip({ w, year }: { w: Who; year: string }) {
  const body = (
    <>
      <DriverAvatar id={w.id} name={w.name} year={year} team={w.result?.Constructor.constructorId} size={24} />
      <b>{w.code}</b>
    </>
  );
  return w.result ? (
    <Link to={"driver/" + w.id} className="rsx-chip" style={{ "--tint": w.color } as CSSProperties}>{body}</Link>
  ) : <span className="rsx-chip" style={{ "--tint": w.color } as CSSProperties}>{body}</span>;
}

function BestCall({ b, who, year, rank }: { b: Battle; who: (n: number) => Who; year: string; rank: number }) {
  const caller = who(b.caller), rival = who(b.caller === b.first ? b.second : b.first);
  const callerIdx = b.caller === b.first ? 0 : 1;
  return (
    <Glass className="rsx-call reveal" style={{ "--tint": caller.color, "--i": rank - 1 } as CSSProperties}>
      <span className="rsx-call-rank">{rank}</span>
      <div className="rsx-call-who">
        <DriverAvatar id={caller.id} name={caller.name} year={year} team={caller.result?.Constructor.constructorId} size={42} />
        <span><small>{b.kind === "undercut" ? "Undercut" : "Overcut"} · lap {b.kind === "undercut" ? b.firstLap : b.secondLap}</small><strong>{caller.name}</strong></span>
      </div>
      <p className="small muted">
        {b.kind === "undercut" ? <>Pitted first, {b.lapsApart} lap{b.lapsApart > 1 ? "s" : ""} before {rival.code}</> : <>Stayed out {b.lapsApart} lap{b.lapsApart > 1 ? "s" : ""} longer than {rival.code}</>} — from P{b.posBefore[callerIdx] ?? "?"} to P{b.posAfter[callerIdx] ?? "?"}.
      </p>
      <b className="rsx-call-gain">+{b.gain.toFixed(1)}<small>s on {rival.code}</small></b>
    </Glass>
  );
}

function StopTimeline({ a, stops, totalLaps, neutral, year }: { a: Analysis; stops: ReturnType<typeof stopsByDriver>; totalLaps: number; neutral: ReturnType<typeof neutralWindows>; year: string }) {
  const teams = useMemo(() => {
    const m = new Map<string, { key: string; name: string; logo?: string; color: string; order: number; drivers: { w: Who; stops: { lap: number; compound: string | null; lane: number | null }[] }[] }>();
    const nums = new Set([...stops.keys(), ...a.drivers.map((d) => d.driver_number)]);
    for (const n of nums) {
      const w = a.who(n);
      const list = stops.get(n) || [];
      const key = w.result?.Constructor.constructorId || a.drivers.find((d) => d.driver_number === n)?.team_name || "other";
      const name = w.result ? teamShortName(w.result.Constructor.name, year) : key;
      const entry = m.get(key) || m.set(key, { key, name, logo: w.result?.Constructor.constructorId, color: w.color, order: 99, drivers: [] }).get(key)!;
      if (w.result && /^\d+$/.test(w.result.position)) entry.order = Math.min(entry.order, +w.result.position);
      const st = a.stints.filter((s) => s.driver_number === n);
      entry.drivers.push({ w, stops: list.map((s) => ({ lap: s.lap, lane: s.lane, compound: st.find((x) => x.lap_start === s.lap + 1)?.compound || null })) });
    }
    return [...m.values()].filter((t) => t.drivers.some((d) => d.stops.length)).sort((x, y) => x.order - y.order);
  }, [a, stops, year]);
  const step = totalLaps > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(totalLaps / step) }, (_, i) => (i + 1) * step).filter((t) => t < totalLaps);
  return (
    <Glass className="card rsx-tl reveal">
      <div className="rsx-table-head">
        <h3 className="rsx-h"><Timer size={16} />Stop laps by team</h3>
        <span className="rsx-tl-key faint xsmall">
          {Object.entries(COMPOUND).map(([k, cls]) => <span key={k}><i className={cx("rsx-tyre", cls)} />{k[0] + k.slice(1).toLowerCase()}</span>)}
          <span><i className="rsx-tyre ring" />Second driver</span>
        </span>
      </div>
      <div className="rsx-tl-grid">
        <span />
        <div className="rsx-tl-axis" aria-hidden>
          <span style={{ left: 0 }}>L1</span>
          {ticks.map((t) => <span key={t} style={{ left: `${(t / totalLaps) * 100}%` }}>L{t}</span>)}
          <span style={{ left: "100%" }}>L{totalLaps}</span>
        </div>
        {neutral.length > 0 && (<><span className="faint xsmall rsx-tl-rc">Neutralised</span><RCStrip windows={neutral} totalLaps={totalLaps} className="compact" /></>)}
        {teams.map((t) => (
          <div key={t.key} className="rsx-tl-row" style={{ "--tint": t.color } as CSSProperties}>
            <span className="rsx-tl-team">
              {t.logo ? <TeamLogo id={t.logo} name={t.name} year={year} size={22} /> : <i className="rsx-tl-sw" />}
              <span>{t.name}</span>
            </span>
            <div className="rsx-tl-lane">
              {t.drivers.map((d, di) => d.stops.map((s) => (
                <span key={d.w.n + ":" + s.lap} className={cx("rsx-tl-stop", COMPOUND[(s.compound || "").toUpperCase()] || "unknown", di > 0 && "ring")}
                  style={{ left: `${(s.lap / totalLaps) * 100}%`, top: di > 0 ? "70%" : "30%" }}
                  title={`${d.w.code} · stop on lap ${s.lap}${s.lane !== null ? ` · ${s.lane.toFixed(1)} s pit lane` : ""}${s.compound ? ` · onto ${s.compound.toLowerCase()}` : ""}`}
                  role="img" aria-label={`${d.w.name} pitted on lap ${s.lap}${s.compound ? `, fitted ${s.compound.toLowerCase()} tyres` : ""}`}>
                  <b>{d.w.code}</b>
                </span>
              )))}
            </div>
          </div>
        ))}
      </div>
      <p className="faint xsmall">Each marker is a stop on its in-lap, coloured by the tyre fitted (OpenF1 stints). Teams are ordered by their best finisher.</p>
    </Glass>
  );
}
