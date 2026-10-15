/* Race weekend · editorial race report + podium celebration. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Flag as FlagIcon, Loader2, Newspaper, ShieldAlert, Timer, Trophy, Wrench, Zap } from "lucide-react";
import { Link } from "../lib/router";
import { fullName, teamColor, teamShortName } from "../lib/media";
import { ordinal, plural } from "../lib/format";
import { Glass, Section, Source } from "../ui/core";
import type { Envelope, Race as RaceData, Result } from "../types";
import { deployments, isClassified, reducedMotion, type AnalysisState, type LapData } from "./_raceData";
import "./_race.css";

/* ───────── Podium celebration (spring drop-in + confetti), once per session per race ───────── */
export function useCelebration(key: string) {
  const storageKey = "rw-celebrated:" + key;
  const [pending] = useState(() => {
    if (reducedMotion()) return false;
    try { return !sessionStorage.getItem(storageKey); } catch { return false; }
  });
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const fire = (el?: Element | null) => {
    if (!pending || fired.current) return;
    fired.current = true;
    try { sessionStorage.setItem(storageKey, "1"); } catch { /* storage unavailable */ }
    const r = el?.getBoundingClientRect();
    setBurst({ x: r ? r.left + r.width / 2 : innerWidth / 2, y: r ? Math.max(40, r.top + r.height * 0.35) : innerHeight / 3 });
  };
  return { pending, burst, fire, clear: () => setBurst(null) };
}

type Particle = { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; tilt: number; vt: number; c: string; round: boolean };

/** Lightweight canvas confetti: ~1.9 s of ballistic paper with drag and flutter, then it removes itself. */
export function Confetti({ colors, origin, onDone }: { colors: string[]; origin: { x: number; y: number }; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) { done.current(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.scale(dpr, dpr);
    const palette = [...colors, "#FFD60A", "#FFFFFF"];
    const N = Math.round(Math.min(170, Math.max(70, W / 7)));
    const parts: Particle[] = Array.from({ length: N }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      const a = -Math.PI / 2 + side * (0.15 + Math.random() * 0.75);
      const v = 8 + Math.random() * 10;
      return {
        x: origin.x + side * Math.random() * 40, y: origin.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 6 + Math.random() * 7, h: 3 + Math.random() * 5, r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.45,
        tilt: Math.random() * Math.PI * 2, vt: 0.08 + Math.random() * 0.14, c: palette[i % palette.length], round: Math.random() < 0.18,
      };
    });
    const DUR = 1900, FADE = 450;
    let raf = 0, t0 = 0, prev = 0;
    const tick = (t: number) => {
      t0 ||= t;
      const dt = Math.min(2.5, prev ? (t - prev) / 16.67 : 1);
      prev = t;
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = el > DUR - FADE ? Math.max(0, (DUR - el) / FADE) : 1;
      const drag = Math.pow(0.982, dt);
      for (const p of parts) {
        p.vy += 0.36 * dt;
        p.vx *= drag; p.vy *= drag;
        p.x += p.vx * dt + Math.sin(p.tilt) * 0.6;
        p.y += p.vy * dt;
        p.r += p.vr * dt; p.tilt += p.vt * dt;
        if (p.y > H + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.h, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (el < DUR) raf = requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, W, H); done.current(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The burst is fire-and-forget: it never restarts on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(<canvas ref={ref} className="rw-confetti" aria-hidden />, document.body);
}

/* ───────── Race report ───────── */
const gapText = (r?: Result) => {
  if (!r) return null;
  const t = r.Time?.time;
  if (t && t.startsWith("+")) return `${t.slice(1)}s`;
  if (/^\+\d+ Laps?$/.test(r.status)) return r.status.replace("+", "").toLowerCase();
  return null;
};
const name = (r: Result) => fullName(r.Driver);

type Callout = { icon: ReactNode; label: string; value: ReactNode; detail?: ReactNode; tone?: string; action?: ReactNode };

export function RaceReport({ race, results, quali, laps, analysis, env, year }: {
  race: RaceData; results: Result[]; quali?: Result[]; laps: LapData; analysis: AnalysisState; env?: Envelope<unknown>; year: string;
}) {
  const w = results[0], p2 = results[1], p3 = results[2];
  if (!w) return null;
  const team = teamShortName(w.Constructor.name, year);
  const grid = +w.grid;
  const margin = gapText(p2);
  const poleSitter = results.find((r) => r.grid === "1");
  const qualiPole = quali?.find((r) => r.position === "1");
  const gains = results.filter((r) => isClassified(r) && +r.grid > 0).map((r) => ({ r, g: +r.grid - +r.position })).sort((a, b) => b.g - a.g || +a.r.position - +b.r.position);
  const climber = gains[0] && gains[0].g > 0 ? gains[0] : null;
  const fastest = results.find((r) => r.FastestLap?.rank === "1");
  const retired = results.filter((r) => r.positionText === "R");
  const dsq = results.filter((r) => r.positionText === "D");
  const starters = results.filter((r) => r.status !== "Did not start" && r.positionText !== "W" && r.positionText !== "F").length;
  const classifiedCount = results.filter(isClassified).length;

  // Laps led — only once the lap-by-lap archive has been loaded on this page.
  const led = new Map<string, number>();
  for (const lap of laps.laps) for (const t of lap.Timings) if (t.position === "1") led.set(t.driverId, (led.get(t.driverId) || 0) + 1);
  const ledList = [...led.entries()].sort((a, b) => b[1] - a[1]);
  const winnerLed = led.get(w.Driver.driverId) || 0;
  const totalLaps = laps.laps.length;

  const dep = analysis.status === "done" && analysis.data && !analysis.data.failed.includes("race_control") ? deployments(analysis.data.control) : null;

  // Template sentences, each filled strictly from the published data.
  const sentences: ReactNode[] = [];
  const start = grid === 1 ? "from pole position" : grid > 1 ? `from ${ordinal(grid)} on the grid` : "from the pit lane";
  sentences.push(
    <>
      <b>{name(w)}</b> won the {race.raceName} for {team} {start}
      {p2 ? <>, {margin ? <>{margin} ahead of </> : <>ahead of </>}<b>{name(p2)}</b></> : null}
      {p3 ? <>, with <b>{name(p3)}</b> completing the podium</> : null}.
    </>,
  );
  if (grid !== 1 && poleSitter && poleSitter.Driver.driverId !== w.Driver.driverId)
    sentences.push(<>Pole-sitter {name(poleSitter)} {isClassified(poleSitter) ? <>finished {ordinal(+poleSitter.position)}</> : <>did not finish ({poleSitter.status.toLowerCase()})</>}.</>);
  if (qualiPole && poleSitter && qualiPole.Driver.driverId !== poleSitter.Driver.driverId)
    sentences.push(<>{name(qualiPole)} set the fastest qualifying time but did not start from pole.</>);
  if (climber)
    sentences.push(<>{name(climber.r)} was the biggest climber, gaining {plural(climber.g, "place")} from {ordinal(+climber.r.grid)} to {ordinal(+climber.r.position)}.</>);
  if (fastest?.FastestLap)
    sentences.push(<>{fastest.Driver.driverId === w.Driver.driverId ? "The winner also" : name(fastest)} set the fastest lap, a {fastest.FastestLap.Time.time}{fastest.FastestLap.lap ? ` on lap ${fastest.FastestLap.lap}` : ""}.</>);
  sentences.push(
    retired.length
      ? <>{plural(retired.length, "driver")} retired and {classifiedCount} of {results.length} {results.length === 1 ? "entrant was" : "entrants were"} classified{dsq.length ? `; ${plural(dsq.length, "driver")} disqualified` : ""}.</>
      : <>No driver retired — {classifiedCount} of {results.length} {results.length === 1 ? "entrant was" : "entrants were"} classified{dsq.length ? `, with ${plural(dsq.length, "disqualification")}` : ""}.</>,
  );
  if (totalLaps && ledList.length)
    sentences.push(ledList.length === 1
      ? <>{name(w)} led all {totalLaps} recorded laps.</>
      : <>{plural(ledList.length, "driver")} led at least one lap; {w.Driver.familyName} led {winnerLed} of {totalLaps}.</>);
  if (dep)
    sentences.push(dep.sc + dep.vsc + dep.red === 0
      ? <>Race control did not deploy the safety car or virtual safety car.</>
      : <>Race control deployed the safety car {plural(dep.sc, "time")} and the virtual safety car {plural(dep.vsc, "time")}{dep.red ? `, and showed the red flag ${plural(dep.red, "time")}` : ""}.</>);

  const callouts: Callout[] = [
    { icon: <Timer />, label: "Winning margin", value: margin || (p2 ? "—" : "Sole finisher"), detail: p2 ? `to ${p2.Driver.familyName}` : undefined },
    { icon: <Trophy />, label: "Winner started", value: grid === 1 ? "Pole" : grid > 1 ? `P${grid}` : "Pit lane", detail: grid === 1 ? "Pole to win" : grid > 1 ? `Not from pole · ${plural(grid - 1, "place")} gained` : undefined, tone: grid === 1 ? "gold" : undefined },
    { icon: <ArrowUp />, label: "Biggest climber", value: climber ? `+${climber.g}` : "—", detail: climber ? `${climber.r.Driver.familyName} · P${climber.r.grid} → P${climber.r.position}` : "No driver gained places", tone: climber ? "green" : undefined },
  ];
  if (fastest?.FastestLap) callouts.push({ icon: <Zap />, label: "Fastest lap", value: fastest.FastestLap.Time.time, detail: `${fastest.Driver.familyName}${fastest.FastestLap.lap ? ` · lap ${fastest.FastestLap.lap}` : ""}`, tone: "purple" });
  callouts.push({ icon: <Wrench />, label: "Retirements", value: retired.length, detail: `${starters} started · ${classifiedCount} classified` });
  callouts.push({
    icon: <FlagIcon />, label: "Laps led", value: totalLaps ? `${winnerLed}/${totalLaps}` : "—",
    detail: totalLaps ? `${w.Driver.familyName} · ${plural(ledList.length, "leader")}` : "From the lap-by-lap archive",
    action: !totalLaps ? (
      <button className="btn sm plain rw-rep-load" onClick={laps.load} disabled={laps.loading}>{laps.loading ? <><Loader2 className="rw-spin" />Loading…</> : "Load lap data"}</button>
    ) : undefined,
  });
  if (+race.season >= 2023)
    callouts.push({
      icon: <ShieldAlert />, label: "Safety car · VSC", value: dep ? `${dep.sc} · ${dep.vsc}` : "—", tone: dep && dep.sc + dep.vsc ? "yellow" : undefined,
      detail: dep ? (dep.red ? `${plural(dep.red, "red flag")}` : "Race-control messages") : analysis.status === "loading" ? `Loading ${analysis.done} of ${analysis.total}…` : analysis.status === "missing" || analysis.status === "error" ? "Not in the OpenF1 archive" : "From race control",
      action: analysis.status === "idle" ? <button className="btn sm plain rw-rep-load" onClick={analysis.start}>Load race control</button> : undefined,
    });

  return (
    <Section id="rw-report" title="Race report" subtitle="A summary written only from the published classification, lap and race-control data.">
      <Glass className="rw-rep reveal" style={{ "--tint": teamColor(w.Constructor) } as CSSProperties}>
        <span className="rw-rep-glow" aria-hidden />
        <div className="rw-rep-copy">
          <span className="eyebrow"><Newspaper size={14} />{race.season} · Round {race.round} · {race.Circuit.Location.locality}</span>
          <h3 className="rw-rep-head">
            <Link to={"driver/" + w.Driver.driverId}>{w.Driver.familyName}</Link> wins the {race.raceName}
            {grid === 1 ? <span> from pole</span> : grid > 1 ? <span> from P{grid}</span> : <span> from the pit lane</span>}
          </h3>
          <div className="rw-rep-text">
            {sentences.map((s, i) => <p key={i} className={i === 0 ? "lead" : undefined}>{s}</p>)}
          </div>
        </div>
        <div className="rw-rep-stats">
          {callouts.map((c, i) => (
            <div key={c.label} className={"rw-rep-stat reveal" + (c.tone ? " " + c.tone : "")} style={{ "--i": i } as CSSProperties}>
              <span className="label">{c.icon}{c.label}</span>
              <b>{c.value}</b>
              {c.detail && <small>{c.detail}</small>}
              {c.action}
            </div>
          ))}
        </div>
      </Glass>
      <p className="source">Every sentence is a template filled with values from the official classification{totalLaps ? ", the lap-by-lap archive" : ""}{dep ? " and OpenF1 race-control messages" : ""}. Laps led counts the leader at the end of each lap.</p>
      <Source value={env} />
    </Section>
  );
}
