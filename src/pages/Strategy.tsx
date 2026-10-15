import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, FlaskConical, Flag as FlagIcon, GitBranch, Info, Minus, Plus, RotateCcw, Scale, Sparkles, Timer, X } from "lucide-react";
import { circuitWinners, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { splitCalendar, useCalendar } from "../lib/season";
import { circuitMedia } from "../lib/media";
import { strategyTime } from "../math.mjs";
import { Glass, Img, Page, Section, Source, cx, useAmbient, useTitle } from "../ui/core";
import { Flag } from "../ui/media";
import { LineChart } from "../ui/charts";
import { emptyEnvelope } from "./_champ";
import { DegradationLab, type FitValues } from "./_labdeg";
import type { Race } from "../types";
import "./strategy.css";

/* ───────────────────────── Model ───────────────────────── */
type Assumptions = { laps: number; base: number; deg: number; loss: number; traffic: number };
type Plan = { id: string; stops: number[] };
type Outcome = { ok: true; time: number; stints: { start: number; end: number; laps: number }[]; cumulative: number[] } | { ok: false; error: string };

const DEFAULTS: Assumptions = { laps: 58, base: 90, deg: 0.08, loss: 22, traffic: 0 };
const LIMITS = {
  laps: { min: 10, max: 90, step: 1 },
  base: { min: 60, max: 130, step: 0.1 },
  deg: { min: 0, max: 0.5, step: 0.005 },
  loss: { min: 5, max: 45, step: 0.5 },
  traffic: { min: 0, max: 60, step: 0.5 },
} as const;
const IDS = ["A", "B", "C"] as const;
const MAX_STOPS = 4;
/** Validated categorical slots (blue, orange, aqua) — light and dark steps. */
const COLORS = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };

const evenStops = (laps: number, n: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 1) * laps) / (n + 1)));
const defaultPlans = (laps: number): Plan[] => [{ id: "A", stops: evenStops(laps, 1) }, { id: "B", stops: evenStops(laps, 2) }];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lap-by-lap cumulative time under the same assumptions `strategyTime` uses (traffic spread evenly). */
function cumulativeTimes(a: Assumptions, stops: number[]) {
  const set = new Set(stops);
  const out: number[] = [];
  let cum = 0, age = 0;
  for (let lap = 1; lap <= a.laps; lap++) {
    cum += a.base + a.deg * age + a.traffic / a.laps;
    age++;
    if (set.has(lap)) { cum += a.loss; age = 0; }
    out.push(cum);
  }
  return out;
}
function run(a: Assumptions, stops: number[]): Outcome {
  try {
    const r = strategyTime(a.laps, a.base, stops, a.deg, a.loss, a.traffic);
    return { ok: true, ...r, cumulative: cumulativeTimes(a, stops) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const raceClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${sec.toFixed(3).padStart(6, "0")}`;
};
const signed = (v: number, d = 3) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}s`;

/* ───────────────────────── URL state ───────────────────────── */
function readQuery(q: URLSearchParams): { a: Assumptions; plans: Plan[] | null; fromUrl: boolean } {
  const num = (k: string, key: keyof Assumptions) => {
    const v = Number(q.get(k));
    const L = LIMITS[key];
    return q.has(k) && Number.isFinite(v) ? clamp(key === "laps" ? Math.round(v) : v, L.min, L.max) : DEFAULTS[key];
  };
  const a: Assumptions = { laps: num("l", "laps"), base: num("b", "base"), deg: num("d", "deg"), loss: num("p", "loss"), traffic: num("t", "traffic") };
  let plans: Plan[] | null = null;
  const raw = q.get("s");
  if (raw) {
    const parsed = raw.split("|").slice(0, 3).map((part, i) => ({
      id: IDS[i],
      stops: [...new Set(part.split("-").map(Number).filter((x) => Number.isInteger(x) && x > 0 && x < a.laps))].sort((x, y) => x - y).slice(0, MAX_STOPS),
    }));
    if (parsed.length >= 2 && parsed.every((p) => p.stops.length)) plans = parsed;
  }
  return { a, plans, fromUrl: q.has("l") };
}

/* ───────────────────────── Page ───────────────────────── */
export default function Strategy({ route }: { route: Route }) {
  const { season, theme } = usePrefs();
  useTitle("Strategy Lab");
  const initial = useMemo(() => readQuery(route.query), []);
  const [a, setA] = useState<Assumptions>(initial.a);
  const [plans, setPlans] = useState<Plan[]>(initial.plans || defaultPlans(initial.a.laps));
  const touched = useRef(initial.fromUrl || !!initial.plans);
  const [fromFit, setFromFit] = useState<string | null>(null);
  const assumeRef = useRef<HTMLDivElement>(null);
  const palette = COLORS[theme === "light" ? "light" : "dark"];
  const color = (id: string) => palette[IDS.indexOf(id as (typeof IDS)[number])] || palette[0];

  // Next race → most recent edition's winning distance, as an editable lap-count suggestion.
  const cal = useCalendar(season);
  const { next } = splitCalendar(cal.value?.data || []);
  const circuitId = next?.Circuit.circuitId;
  const editions = useData(() => (circuitId ? circuitWinners(circuitId) : Promise.resolve(emptyEnvelope<Race[]>([]))), [circuitId]);
  const lastEdition = [...(editions.value?.data || [])].reverse().find((r) => Number(r.Results?.[0]?.laps) > 0);
  const suggested = lastEdition ? Number(lastEdition.Results![0].laps) : null;
  useAmbient(palette[0], palette[1]);

  const applyLaps = (laps: number) => {
    const l = clamp(Math.round(laps), LIMITS.laps.min, LIMITS.laps.max);
    setA((x) => ({ ...x, laps: l }));
    setPlans((ps) => ps.map((p) => ({ ...p, stops: p.stops.some((s) => s >= l) ? evenStops(l, p.stops.length) : p.stops })));
  };
  useEffect(() => {
    if (suggested && !touched.current) {
      const l = clamp(suggested, LIMITS.laps.min, LIMITS.laps.max);
      setA((x) => ({ ...x, laps: l }));
      setPlans(defaultPlans(l));
    }
  }, [suggested]);

  useEffect(() => {
    setQuery({ l: String(a.laps), b: String(a.base), d: String(a.deg), p: String(a.loss), t: a.traffic ? String(a.traffic) : null, s: plans.map((p) => p.stops.join("-")).join("|") });
  }, [a, plans]);

  const set = (key: keyof Assumptions, v: number) => {
    touched.current = true;
    if (key === "base" || key === "deg") setFromFit((f) => (f && !f.endsWith(" (edited)") ? f + " (edited)" : f));
    if (key === "laps") applyLaps(v);
    else setA((x) => ({ ...x, [key]: v }));
  };
  const updatePlan = (id: string, stops: number[]) => { touched.current = true; setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, stops } : p))); };
  const addPlan = () => {
    touched.current = true;
    setPlans((ps) => (ps.length >= 3 ? ps : [...ps, { id: IDS.find((x) => !ps.some((p) => p.id === x))!, stops: evenStops(a.laps, 3) }].sort((x, y) => x.id.localeCompare(y.id))));
  };
  const removePlan = (id: string) => { touched.current = true; setPlans((ps) => (ps.length <= 2 ? ps : ps.filter((p) => p.id !== id))); };
  const applyFit = (v: FitValues) => {
    touched.current = true;
    applyLaps(v.laps);
    setA((x) => ({ ...x, base: clamp(v.base, LIMITS.base.min, LIMITS.base.max), deg: clamp(v.deg, LIMITS.deg.min, LIMITS.deg.max) }));
    setFromFit(v.label);
    const el = assumeRef.current;
    if (el) {
      const reduce = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }
  };
  const reset = () => {
    setFromFit(null);
    const l = suggested ? clamp(suggested, LIMITS.laps.min, LIMITS.laps.max) : DEFAULTS.laps;
    setA({ ...DEFAULTS, laps: l });
    setPlans(defaultPlans(l));
    touched.current = false;
  };

  const outcomes = useMemo(() => plans.map((p) => ({ plan: p, out: run(a, p.stops) })), [a, plans]);
  const valid = outcomes.filter((o): o is { plan: Plan; out: Extract<Outcome, { ok: true }> } => o.out.ok);
  const best = valid.length ? valid.reduce((x, y) => (y.out.time < x.out.time ? y : x)) : null;
  const second = best ? valid.filter((v) => v !== best).sort((x, y) => x.out.time - y.out.time)[0] : null;

  return (
    <Page className="sg">
      <StrategyHero next={next} best={best} second={second} color={color} a={a} />

      <div className="notice sg-disclaimer reveal">
        <AlertTriangle />
        <p><b>A simplified, deterministic model — not a race prediction.</b> Every number below comes from the assumptions you set. It ignores tyre compounds and warm-up, fuel burn, safety cars, weather, track position and overtaking difficulty. Defaults are <b>editable assumptions, not historical calibration</b> — you can optionally <button type="button" className="link" onClick={() => document.getElementById("empirical-fit")?.scrollIntoView({ behavior: "smooth" })}>fit them from a real race</button>.</p>
      </div>

      <div className="sg-layout">
        <aside className="sg-side">
          <Glass className="card sg-assume reveal">
            <div className="card-title" ref={assumeRef}>
              <h3>Assumptions</h3>
              <button className="btn sm plain" onClick={reset}><RotateCcw />Reset</button>
            </div>
            <AnimatePresence initial={false}>
              {fromFit && (
                <motion.div className="lab-fit-chip" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
                  <FlaskConical size={14} />
                  <span><b>Base, degradation and laps from an empirical fit</b><small>{fromFit} · one race, estimated</small></span>
                  <button className="icon-btn" onClick={() => setFromFit(null)} aria-label="Dismiss fit note"><X /></button>
                </motion.div>
              )}
            </AnimatePresence>
            <Knob label="Race laps" value={a.laps} onChange={(v) => set("laps", v)} {...LIMITS.laps} format={(v) => String(v)}
              hint={suggested && lastEdition ? (
                <>
                  {a.laps === suggested ? "Matches" : "Suggested:"} {suggested} laps — the {lastEdition.season} {lastEdition.raceName} winner's distance.
                  {a.laps !== suggested && <button className="link" onClick={() => set("laps", suggested)}>Use</button>}
                </>
              ) : "Editable assumption."} />
            <Knob label="Base lap time" unit="s" value={a.base} onChange={(v) => set("base", v)} {...LIMITS.base} format={(v) => v.toFixed(1)} hint="Fresh-tyre pace, identical for every plan." />
            <Knob label="Degradation" unit="s / lap" value={a.deg} onChange={(v) => set("deg", v)} {...LIMITS.deg} format={(v) => v.toFixed(3)} hint="Time lost per lap of tyre age (linear)." />
            <Knob label="Pit-lane loss" unit="s" value={a.loss} onChange={(v) => set("loss", v)} {...LIMITS.loss} format={(v) => v.toFixed(1)} hint="Net time lost per stop versus staying out." />
            <Knob label="Traffic penalty" unit="s total" value={a.traffic} onChange={(v) => set("traffic", v)} {...LIMITS.traffic} format={(v) => v.toFixed(1)} hint="Added equally to every plan — moves totals, never the gaps." />
            {editions.value?.meta.fetchedAt && <Source value={editions.value} label="Lap suggestion" />}
          </Glass>
        </aside>

        <div className="sg-main">
          <div className="sg-plans">
            <AnimatePresence initial={false}>
              {outcomes.map(({ plan, out }, i) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  out={out}
                  index={i}
                  laps={a.laps}
                  color={color(plan.id)}
                  best={best?.plan.id === plan.id}
                  delta={best && out.ok ? out.time - best.out.time : null}
                  canRemove={plans.length > 2}
                  onChange={(stops) => updatePlan(plan.id, stops)}
                  onRemove={() => removePlan(plan.id)}
                />
              ))}
            </AnimatePresence>
            {plans.length < 3 && (
              <button className="sg-add glass reveal" onClick={addPlan}>
                <span><Plus /></span>
                <b>Add plan {IDS.find((x) => !plans.some((p) => p.id === x))}</b>
                <small>Compare up to three strategies</small>
              </button>
            )}
          </div>

          <Section id="stint-timeline" title="Stint timeline" subtitle="Each bar is one stint; the shading deepens as the tyres age. Pins mark pit stops.">
            <Timeline outcomes={outcomes} laps={a.laps} deg={a.deg} color={color} />
          </Section>
        </div>
      </div>

      <Section id="empirical-fit" title="Calibrate from a real race" subtitle={<>Fit tyre degradation from an archived race's measured laps, then feed the result into the model above. <span className="chip yellow">Empirical fit · one race</span></>}>
        <DegradationLab season={season} onUse={applyFit} />
      </Section>

      <Section id="virtual-gap" title="The virtual gap, lap by lap" subtitle={best ? `Cumulative time relative to Plan ${best.plan.id}, the quickest overall. Above zero = behind on the road clock (track position is not modelled).` : undefined}>
        <GapChart valid={valid} best={best} laps={a.laps} color={color} />
      </Section>

      <Section id="sensitivity" title="How sensitive is the verdict?" subtitle="The quickest plan as degradation and pit-lane loss change around your values. A parameter sweep, not a confidence interval.">
        <Heatmap a={a} plans={plans} color={color} />
      </Section>

      <Section id="how-it-works" title="How this model works">
        <Glass className="card sg-how reveal">
          <div className="sg-formula">
            <span className="eyebrow"><Scale size={13} />Per stint of n laps</span>
            <p className="sg-eq">time = n × base + degradation × n × (n − 1) ⁄ 2</p>
            <p className="muted small">Race time = Σ stints + stops × pit-lane loss + traffic penalty.</p>
          </div>
          <div className="sg-how-text">
            <p>Each stint starts at base pace and every lap of tyre age adds the degradation value. All compounds behave identically and fuel effect is ignored, so with these assumptions equal-length stints are always the most efficient way to use a given number of stops — the real trade-off is pit-lane loss versus degradation.</p>
            <p>The defaults are not calibrated against historical races; the optional empirical fit above estimates base pace and degradation from one archived race's clean laps. For measured pace and pit-stop data, explore a <Link className="link" to="calendar">race weekend</Link> or the <Link className="link" to="telemetry">telemetry lab</Link>. A stationary stop time is not the same as net pit-lane loss.</p>
          </div>
        </Glass>
      </Section>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
type Valid = { plan: Plan; out: Extract<Outcome, { ok: true }> };
function StrategyHero({ next, best, second, color, a }: { next?: Race; best: Valid | null; second: Valid | null | undefined; color: (id: string) => string; a: Assumptions }) {
  const photo = circuitMedia(next?.Circuit.circuitId).hero;
  const margin = best && second ? second.out.time - best.out.time : null;
  return (
    <section className="sg-hero">
      <div className="sg-hero-media">
        {photo && <Img src={photo} alt="" eager />}
        <span className="sg-hero-scrim" />
      </div>
      <div className="sg-hero-inner">
        <div className="sg-hero-copy">
          <span className="eyebrow sg-hero-eyebrow rise"><GitBranch size={14} />Strategy lab · simulation</span>
          <h1 className="display sg-hero-title rise" style={{ "--i": 1 } as CSSProperties}>You make<span>the call.</span></h1>
          <p className="sg-hero-lede rise" style={{ "--i": 2 } as CSSProperties}>One stop or two? Set the pace, the tyre wear and the cost of a pit stop, then watch the plans race each other.</p>
          {next && (
            <p className="sg-hero-next rise" style={{ "--i": 3 } as CSSProperties}><Flag country={next.Circuit.Location.country} />Thinking ahead to the {next.raceName}</p>
          )}
        </div>
        <div className="sg-verdict rise" style={{ "--i": 3, "--tint": best ? color(best.plan.id) : "var(--label-3)" } as CSSProperties} aria-live="polite">
          <span className="sg-verdict-label"><Sparkles size={14} />Verdict under your assumptions</span>
          {best ? (
            <>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b key={best.plan.id} className="sg-verdict-plan" initial={{ y: 16, opacity: 0, filter: "blur(4px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: -16, opacity: 0, filter: "blur(4px)" }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                  Plan {best.plan.id}
                </motion.b>
              </AnimatePresence>
              <span className="sg-verdict-sub">{best.plan.stops.length === 1 ? "One stop" : `${best.plan.stops.length} stops`} · laps {best.plan.stops.join(", ")}</span>
              <span className="sg-verdict-margin">{margin === null ? "—" : margin < 0.0005 ? "Dead heat" : `${margin.toFixed(3)}s quicker`}</span>
              <span className="sg-verdict-total"><Timer size={13} />{raceClock(best.out.time)} over {a.laps} laps</span>
            </>
          ) : (
            <span className="sg-verdict-sub">Fix the highlighted plans to see a verdict.</span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Controls ───────────────────────── */
function Knob({ label, unit, value, min, max, step, onChange, format, hint }: {
  label: string; unit?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(v)) onChange(clamp(v, min, max));
    setDraft(null);
  };
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="sg-knob">
      <div className="sg-knob-head">
        <label htmlFor={"k-" + id}>{label}</label>
        <span className="sg-knob-num">
          <input
            className="sg-num"
            inputMode="decimal"
            aria-label={`${label}${unit ? " in " + unit : ""}`}
            value={draft ?? format(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setDraft(null);
            }}
          />
          {unit && <small>{unit}</small>}
        </span>
      </div>
      <input id={"k-" + id} className="sg-range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ "--p": pct + "%" } as CSSProperties} />
      {hint && <p className="sg-knob-hint">{hint}</p>}
    </div>
  );
}

function PlanCard({ plan, out, index, laps, color, best, delta, canRemove, onChange, onRemove }: {
  plan: Plan; out: Outcome; index: number; laps: number; color: string; best: boolean; delta: number | null; canRemove: boolean; onChange: (stops: number[]) => void; onRemove: () => void;
}) {
  const setStop = (i: number, v: number) => onChange(plan.stops.map((s, k) => (k === i ? v : s)));
  const sorted = [...plan.stops].sort((x, y) => x - y);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={cx("glass sg-plan", best && "best", !out.ok && "bad")}
      style={{ "--tint": color, "--i": index } as CSSProperties}
    >
      <div className="sg-plan-head">
        <span className="sg-plan-badge">{plan.id}</span>
        <div className="sg-plan-title">
          <b>Plan {plan.id}</b>
          <small>{plan.stops.length === 1 ? "One stop" : `${plan.stops.length} stops`} · {plan.stops.length + 1} stints</small>
        </div>
        {best && <span className="chip green sg-best"><Sparkles />Quickest</span>}
        {canRemove && <button className="icon-btn sg-remove" onClick={onRemove} aria-label={`Remove plan ${plan.id}`}><X /></button>}
      </div>

      {out.ok ? (
        <div className="sg-plan-result">
          <span className="sg-plan-time">{raceClock(out.time)}</span>
          <span className={cx("sg-plan-delta", best ? "zero" : "behind")}>{best ? "Reference" : delta !== null ? signed(delta) : "—"}</span>
          <span className="sg-plan-avg">avg {(out.time / laps).toFixed(3)}s / lap</span>
        </div>
      ) : (
        <div className="notice sg-plan-error" role="alert"><AlertTriangle /><p>{out.error}. Each stop must be a different lap between 1 and {laps - 1}.</p></div>
      )}

      <div className="sg-stops">
        {plan.stops.map((s, i) => {
          const dup = plan.stops.indexOf(s) !== i;
          return (
            <div key={i} className={cx("sg-stop", (dup || s >= laps || s < 1) && "invalid")}>
              <span className="sg-stop-label">Stop {sorted.indexOf(s) + 1 || i + 1}</span>
              <input className="sg-range small" type="range" min={1} max={laps - 1} step={1} value={Math.min(s, laps - 1)} onChange={(e) => setStop(i, +e.target.value)} aria-label={`Plan ${plan.id} stop ${i + 1} lap`} style={{ "--p": ((Math.min(s, laps - 1) - 1) / Math.max(1, laps - 2)) * 100 + "%" } as CSSProperties} />
              <input className="sg-num sg-stop-num" inputMode="numeric" value={s} aria-label={`Plan ${plan.id} stop ${i + 1} lap number`} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) setStop(i, clamp(v, 1, laps - 1)); }} />
              <button className="icon-btn sg-stop-del" disabled={plan.stops.length <= 1} onClick={() => onChange(plan.stops.filter((_, k) => k !== i))} aria-label={`Remove stop ${i + 1} from plan ${plan.id}`}><Minus /></button>
            </div>
          );
        })}
      </div>
      <div className="sg-plan-actions">
        <button className="btn sm glass-btn" disabled={plan.stops.length >= MAX_STOPS || plan.stops.length >= laps - 1} onClick={() => onChange(evenStops(laps, plan.stops.length + 1))}><Plus />Add stop</button>
        <button className="btn sm plain" onClick={() => onChange(evenStops(laps, plan.stops.length))} title="Equal stints — the most efficient split in this model"><Scale />Even split</button>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */
function Timeline({ outcomes, laps, deg, color }: { outcomes: { plan: Plan; out: Outcome }[]; laps: number; deg: number; color: (id: string) => string }) {
  const ticks = useMemo(() => {
    const every = laps > 60 ? 10 : laps > 30 ? 10 : 5;
    const list: number[] = [];
    for (let l = every; l < laps; l += every) list.push(l);
    return list;
  }, [laps]);
  return (
    <Glass className="card sg-timeline reveal">
      <div className="sg-tl-rows">
        {outcomes.map(({ plan, out }) => (
          <div key={plan.id} className="sg-tl-row" style={{ "--tint": color(plan.id) } as CSSProperties}>
            <span className="sg-tl-name"><i className="sg-plan-badge sm">{plan.id}</i><span>{plan.stops.length === 1 ? "1 stop" : `${plan.stops.length} stops`}</span></span>
            <div className="sg-tl-track" role="img" aria-label={out.ok ? `Plan ${plan.id}: ${out.stints.map((s) => `laps ${s.start} to ${s.end}`).join(", ")}` : `Plan ${plan.id} is invalid`}>
              {out.ok ? (
                <>
                  {out.stints.map((s, i) => (
                    <span
                      key={i}
                      className="sg-stint"
                      style={{ flexGrow: s.laps } as CSSProperties}
                      title={`Stint ${i + 1}: laps ${s.start}–${s.end} (${s.laps} laps) · final lap +${(deg * (s.laps - 1)).toFixed(2)}s vs fresh`}
                    >
                      <span className="sg-stint-text"><b>{s.laps}</b><small> laps</small></span>
                      <span className="sg-stint-wear">+{(deg * (s.laps - 1)).toFixed(1)}s</span>
                    </span>
                  ))}
                  {out.stints.slice(0, -1).map((s) => (
                    <motion.span key={"pit" + s.end} className="sg-pin" initial={false} animate={{ left: `${(s.end / laps) * 100}%` }} transition={{ type: "spring", stiffness: 300, damping: 32 }}>
                      <span>L{s.end}</span>
                    </motion.span>
                  ))}
                </>
              ) : (
                <span className="sg-tl-bad"><AlertTriangle size={14} />Invalid stops</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="sg-tl-axis" aria-hidden>
        <span style={{ left: 0 }}>L1</span>
        {ticks.map((t) => <span key={t} style={{ left: `${(t / laps) * 100}%` }}>{t}</span>)}
        <span style={{ left: "100%" }}><FlagIcon size={11} />{laps}</span>
      </div>
    </Glass>
  );
}

/* ───────────────────────── Gap chart ───────────────────────── */
function GapChart({ valid, best, laps, color }: { valid: Valid[]; best: Valid | null; laps: number; color: (id: string) => string }) {
  const [focus, setFocus] = useState<string | null>(null);
  if (!best || valid.length < 2)
    return <Glass className="card sg-empty reveal"><Info /><p>Two valid plans are needed to draw the gap.</p></Glass>;
  const series = valid.map((v) => ({
    id: v.plan.id,
    name: `Plan ${v.plan.id}`,
    color: color(v.plan.id),
    values: v.out.cumulative.map((c, i) => Math.round((c - best.out.cumulative[i]) * 1000) / 1000),
    dashed: v.plan.id === best.plan.id,
  }));
  const extremes = valid.filter((v) => v !== best).map((v) => {
    const d = v.out.cumulative.map((c, i) => c - best.out.cumulative[i]);
    const ahead = Math.min(...d);
    return { id: v.plan.id, ahead, lapAhead: d.indexOf(ahead) + 1, final: d.at(-1)! };
  });
  return (
    <Glass className="card reveal">
      <div className="sg-gap-legend">
        {series.map((s) => (
          <button key={s.id} className={cx("sg-gap-chip", focus && focus !== s.id && "dim")} style={{ "--tint": s.color } as CSSProperties} onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)}>
            <i className={cx("sg-gap-swatch", s.dashed && "dashed")} />{s.name}{s.id === best.plan.id && <small>reference</small>}
          </button>
        ))}
      </div>
      <LineChart
        ariaLabel={`Cumulative time gap of each plan relative to plan ${best.plan.id} over ${laps} laps`}
        series={series}
        labels={Array.from({ length: laps }, (_, i) => "L" + (i + 1))}
        tooltipTitle={(i) => `End of lap ${i + 1}`}
        yFormat={(v) => (Math.abs(v) < 0.05 ? "0s" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)}s`)}
        curve={false}
        focus={focus}
        onFocus={setFocus}
        height={340}
      />
      <div className="sg-gap-notes">
        {extremes.map((e) => (
          <p key={e.id}>
            <i className="sg-plan-badge sm" style={{ "--tint": color(e.id) } as CSSProperties}>{e.id}</i>
            {e.ahead < -0.0005 ? <>Up to <b>{Math.abs(e.ahead).toFixed(2)}s</b> ahead on lap {e.lapAhead}, </> : <>Never ahead, </>}
            finishes <b>{e.final.toFixed(3)}s</b> behind Plan {best.plan.id}.
          </p>
        ))}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Sensitivity heatmap ───────────────────────── */
function Heatmap({ a, plans, color }: { a: Assumptions; plans: Plan[]; color: (id: string) => string }) {
  const degs = a.deg > 0
    ? [0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => ({ v: Math.min(LIMITS.deg.max, a.deg * m), label: m === 1 ? "yours" : `×${m}` }))
    : [0, 0.02, 0.04, 0.06, 0.08, 0.1].map((v, i) => ({ v, label: i === 0 ? "yours" : "" }));
  const losses = [-6, -3, 0, 3, 6].map((d) => ({ v: Math.max(0, a.loss + d), d }));
  const grid = degs.map((dg) =>
    losses.map((ls) => {
      const times = plans
        .map((p) => ({ id: p.id, out: run({ ...a, deg: dg.v, loss: ls.v }, p.stops) }))
        .filter((x): x is { id: string; out: Extract<Outcome, { ok: true }> } => x.out.ok)
        .sort((x, y) => x.out.time - y.out.time);
      return { win: times[0]?.id, margin: times[1] ? times[1].out.time - times[0].out.time : null };
    }),
  );
  const maxMargin = Math.max(1, ...grid.flat().map((c) => c.margin ?? 0));
  return (
    <Glass className="card flush sg-heat reveal">
      <div className="table-wrap">
        <table className="sg-heat-tbl">
          <caption className="sr-only">Quickest plan for each combination of degradation (rows) and pit-lane loss (columns)</caption>
          <thead>
            <tr>
              <th scope="col" className="sg-heat-corner">Degradation ↓ · Pit loss →</th>
              {losses.map((l) => <th key={l.d} scope="col" className={cx(l.d === 0 && "cur")}>{l.v.toFixed(1)}s{l.d === 0 && <small>yours</small>}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <th scope="row" className={cx(degs[r].label === "yours" && "cur")}>{degs[r].v.toFixed(3)}<small>{degs[r].label}</small></th>
                {row.map((c, k) => {
                  const strength = c.margin === null ? 0 : 0.18 + 0.62 * Math.min(1, c.margin / maxMargin);
                  const current = degs[r].label === "yours" && losses[k].d === 0;
                  return (
                    <td key={k} className={cx("sg-cell", current && "cur")} style={{ "--tint": c.win ? color(c.win) : "transparent", "--a": `${Math.round(strength * 100)}%` } as CSSProperties} title={c.win ? `Plan ${c.win} quickest${c.margin !== null ? ` by ${c.margin.toFixed(2)}s` : ""}` : "No valid plan"}>
                      <b>{c.win ? `Plan ${c.win}` : "—"}</b>
                      {c.margin !== null && <small>{c.margin < 0.005 ? "tie" : `by ${c.margin.toFixed(c.margin >= 10 ? 1 : 2)}s`}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sg-heat-foot">
        <div className="sg-heat-key">
          {plans.map((p) => <span key={p.id}><i style={{ background: color(p.id) }} />Plan {p.id}</span>)}
          <span className="faint">Deeper colour = bigger winning margin</span>
        </div>
        <span className="faint small">Outlined cell = your current assumptions.</span>
      </div>
    </Glass>
  );
}

