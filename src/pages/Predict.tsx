import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Award, BadgeCheck, Check, Crown, Download, Flame, Gauge, Info, Lock, Medal, RotateCcw, Sparkles, Star, Target, Timer, Trophy, X, Zap,
} from "lucide-react";
import { allResults, drivers as fetchDrivers, qualifyingResults, races as fetchRaces, standings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { shortRace } from "../lib/season";
import { circuitMedia, fullName, isLightColor, teamColor, teamShortName } from "../lib/media";
import { formatClock, formatDateRange, formatWeekday, plural, relativeTime, sessionDate, timezoneLabel } from "../lib/format";
import { Counter, Glass, Img, Page, Section, Skeleton, Source, StateView, cx, useAmbient, useNow, useTitle } from "../ui/core";
import { DriverAvatar, Flag } from "../ui/media";
import { Countdown } from "../ui/countdown";
import { emptyEnv } from "./_fan";
import type { Driver, Race, Team } from "../types";
import "./predict.css";

/* ───────────────────────── Storage (versioned, corruption-safe) ───────────────────────── */
type Slot = "p1" | "p2" | "p3" | "pole" | "fl";
type Pick = Partial<Record<Slot, string>> & { savedAt: number };
type Store = { v: 1; seasons: Record<string, Record<string, Pick>> };
const STORE_KEY = "pulse-predict";
const SLOTS: Slot[] = ["p1", "p2", "p3", "pole", "fl"];
const PODIUM: Slot[] = ["p1", "p2", "p3"];
const SLOT_LABEL: Record<Slot, string> = { p1: "Winner", p2: "Second", p3: "Third", pole: "Pole position", fl: "Fastest lap" };
const SLOT_SHORT: Record<Slot, string> = { p1: "P1", p2: "P2", p3: "P3", pole: "POLE", fl: "FL" };
const validId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v);

function sanitize(raw: unknown): Store {
  const out: Store = { v: 1, seasons: {} };
  if (!raw || typeof raw !== "object" || (raw as Store).v !== 1 || typeof (raw as Store).seasons !== "object") return out;
  for (const [season, rounds] of Object.entries((raw as Store).seasons || {})) {
    if (!/^\d{4}$/.test(season) || !rounds || typeof rounds !== "object") continue;
    for (const [round, pick] of Object.entries(rounds)) {
      if (!/^\d{1,2}$/.test(round) || !pick || typeof pick !== "object") continue;
      const clean: Pick = { savedAt: Number.isFinite((pick as Pick).savedAt) ? (pick as Pick).savedAt : 0 };
      for (const s of SLOTS) if (validId((pick as Pick)[s])) clean[s] = (pick as Pick)[s];
      if (SLOTS.some((s) => clean[s])) (out.seasons[season] ||= {})[round] = clean;
    }
  }
  return out;
}
function loadStore(): Store {
  try {
    const text = localStorage.getItem(STORE_KEY);
    if (!text) return { v: 1, seasons: {} };
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch {
      // Keep the unreadable copy so nothing is silently lost, then start fresh.
      try { localStorage.setItem(STORE_KEY + "-corrupt", text); } catch { /* ignore */ }
      return { v: 1, seasons: {} };
    }
    return sanitize(parsed);
  } catch {
    return { v: 1, seasons: {} };
  }
}
function useStore() {
  const [store, setStore] = useState<Store>(loadStore);
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === STORE_KEY) setStore(loadStore()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const write = (next: Store) => {
    setStore(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* quota or private mode */ }
  };
  const setPick = (season: string, round: string, pick: Pick | null) => {
    const seasons = { ...store.seasons, [season]: { ...(store.seasons[season] || {}) } };
    if (pick && SLOTS.some((s) => pick[s])) seasons[season][round] = pick;
    else delete seasons[season][round];
    write({ v: 1, seasons });
  };
  return { store, setPick };
}

/* ───────────────────────── Scoring ───────────────────────── */
const RULES = [
  { pts: 10, label: "Exact podium position", detail: "Your P1, P2 or P3 finishes exactly there." },
  { pts: 5, label: "On the podium, wrong step", detail: "Your pick finishes in the top three, just not where you said." },
  { pts: 3, label: "Pole position", detail: "Fastest in qualifying (qualifying classification P1)." },
  { pts: 3, label: "Fastest lap", detail: "Ranked 1 for fastest lap in the race classification." },
];
type Outcome = { slot: Slot; pick?: string; actual?: string; pts: number; status: "exact" | "podium" | "miss" | "pending" | "na" | "empty" };
type Scored = { round: string; race: Race; pick: Pick; outcomes: Outcome[]; total: number; complete: boolean; podiumExact: number };

function scoreRound(pick: Pick, result?: Race, quali?: Race, qualiKnown = false): { outcomes: Outcome[]; total: number; complete: boolean } {
  const rows = result?.Results || [];
  const top = ["1", "2", "3"].map((p) => rows.find((r) => r.position === p)?.Driver.driverId);
  const podiumSet = new Set(top.filter(Boolean));
  const outcomes: Outcome[] = [];
  PODIUM.forEach((slot, i) => {
    const p = pick[slot];
    if (!p) return outcomes.push({ slot, pts: 0, status: "empty", actual: top[i] });
    if (!rows.length) return outcomes.push({ slot, pick: p, pts: 0, status: "pending" });
    if (top[i] === p) return outcomes.push({ slot, pick: p, actual: top[i], pts: 10, status: "exact" });
    if (podiumSet.has(p)) return outcomes.push({ slot, pick: p, actual: top[i], pts: 5, status: "podium" });
    outcomes.push({ slot, pick: p, actual: top[i], pts: 0, status: "miss" });
  });
  const poleId = quali?.QualifyingResults?.find((r) => r.position === "1")?.Driver.driverId;
  if (!pick.pole) outcomes.push({ slot: "pole", pts: 0, status: "empty", actual: poleId });
  else if (!poleId) outcomes.push({ slot: "pole", pick: pick.pole, pts: 0, status: qualiKnown && rows.length ? "na" : "pending" });
  else outcomes.push({ slot: "pole", pick: pick.pole, actual: poleId, pts: poleId === pick.pole ? 3 : 0, status: poleId === pick.pole ? "exact" : "miss" });
  const flId = rows.find((r) => r.FastestLap?.rank === "1")?.Driver.driverId;
  if (!pick.fl) outcomes.push({ slot: "fl", pts: 0, status: "empty", actual: flId });
  else if (!rows.length) outcomes.push({ slot: "fl", pick: pick.fl, pts: 0, status: "pending" });
  else if (!flId) outcomes.push({ slot: "fl", pick: pick.fl, pts: 0, status: "na" });
  else outcomes.push({ slot: "fl", pick: pick.fl, actual: flId, pts: flId === pick.fl ? 3 : 0, status: flId === pick.fl ? "exact" : "miss" });
  return { outcomes, total: outcomes.reduce((s, o) => s + o.pts, 0), complete: rows.length > 0 && !outcomes.some((o) => o.status === "pending") };
}

/* ───────────────────────── Badges ───────────────────────── */
type Badge = { id: string; name: string; detail: string; icon: typeof Award; earned: boolean; note?: string };
function badgesFor(scored: Scored[], anyPick: boolean, total: number, streakBest: number): Badge[] {
  const done = scored.filter((s) => s.race.Results?.length);
  const exactWins = done.filter((s) => s.outcomes.find((o) => o.slot === "p1")?.status === "exact");
  const perfect = done.find((s) => s.podiumExact === 3);
  const pole = done.find((s) => s.outcomes.find((o) => o.slot === "pole")?.status === "exact");
  const fl = done.find((s) => s.outcomes.find((o) => o.slot === "fl")?.status === "exact");
  const haul = done.find((s) => s.total >= 25);
  const r = (s?: Scored) => (s ? `Round ${s.round} · ${shortRace(s.race.raceName)}` : undefined);
  return [
    { id: "first", name: "First call", detail: "Save your first prediction.", icon: Sparkles, earned: anyPick },
    { id: "bullseye", name: "Bullseye", detail: "Call the race winner exactly.", icon: Target, earned: exactWins.length > 0, note: r(exactWins[0]) },
    { id: "hattrick", name: "Hat-trick", detail: "Call the winner exactly three times.", icon: Crown, earned: exactWins.length >= 3, note: exactWins.length ? `${exactWins.length} of 3` : undefined },
    { id: "perfect", name: "Perfect podium", detail: "All three podium steps exactly right.", icon: Trophy, earned: !!perfect, note: r(perfect) },
    { id: "haul", name: "Big haul", detail: "Score 25 or more points in one round.", icon: Flame, earned: !!haul, note: r(haul) },
    { id: "pole", name: "Pole hunter", detail: "Call pole position.", icon: Timer, earned: !!pole, note: r(pole) },
    { id: "purple", name: "Purple patch", detail: "Call the fastest lap.", icon: Zap, earned: !!fl, note: r(fl) },
    { id: "regular", name: "Regular", detail: "Predict five completed rounds in a row.", icon: Medal, earned: streakBest >= 5, note: streakBest ? `Best run: ${streakBest}` : undefined },
    { id: "century", name: "Century", detail: "Reach 100 points in a season.", icon: Star, earned: total >= 100, note: `${total} of 100` },
  ];
}

/* ───────────────────────── Page ───────────────────────── */
export default function Predict({ route }: { route: Route }) {
  const { timezone } = usePrefs();
  const now = useNow(30_000);
  // The game always runs on the live season, whatever season the rest of the site is browsing.
  const year = String(new Date().getFullYear());
  const cal = useData(() => fetchRaces(year), [year]);
  const res = useData(() => allResults(year), [year]);
  const ds = useData(() => standings(year), [year]);
  const { store, setPick } = useStore();
  const mine = store.seasons[year] || {};
  useTitle("Predict");

  const racesList = cal.value?.data || [];
  const lockAt = (r: Race) => sessionDate(r.date, r.time).getTime();
  const open = racesList.filter((r) => lockAt(r) > now);
  const [requested, setRequested] = useState(() => route.query.get("round"));
  useEffect(() => setRequested(route.query.get("round")), [route.query]);
  const target = open.find((r) => r.round === requested) || racesList.find((r) => r.round === requested && mine[r.round]) || open[0];

  const resultsByRound = useMemo(() => new Map((res.value?.data || []).map((r) => [r.round, r])), [res.value]);
  const needQuali = Object.entries(mine).some(([round, p]) => p.pole && resultsByRound.get(round)?.Results?.length);
  const quali = useData(() => (needQuali ? qualifyingResults(year) : Promise.resolve(emptyEnv<Race[]>([]))), [year, needQuali]);
  const qualiByRound = useMemo(() => new Map((quali.value?.data || []).map((r) => [r.round, r])), [quali.value]);

  // Current grid: the drivers of the most recent classified race (with that race's team), in championship order.
  const lastRace = [...(res.value?.data || [])].reverse().find((r) => r.Results?.length);
  const needRoster = !res.loading && !lastRace;
  const roster = useData(() => (needRoster ? fetchDrivers(year) : Promise.resolve(emptyEnv<Driver[]>([]))), [year, needRoster]);
  const grid = useMemo(() => {
    const order = new Map((ds.value?.data || []).map((s, i) => [s.Driver.driverId, i]));
    const list: { driver: Driver; team?: Team }[] = lastRace?.Results?.map((r) => ({ driver: r.Driver, team: r.Constructor })) || (roster.value?.data || []).map((d) => ({ driver: d }));
    return list.sort((a, b) => (order.get(a.driver.driverId) ?? 99) - (order.get(b.driver.driverId) ?? 99) || a.driver.familyName.localeCompare(b.driver.familyName));
  }, [lastRace, roster.value, ds.value]);
  const byId = useMemo(() => {
    const m = new Map<string, { driver: Driver; team?: Team }>();
    for (const r of res.value?.data || []) for (const x of r.Results || []) m.set(x.Driver.driverId, { driver: x.Driver, team: x.Constructor });
    for (const g of grid) m.set(g.driver.driverId, g);
    return m;
  }, [res.value, grid]);

  const scored: Scored[] = useMemo(() => racesList
    .filter((r) => mine[r.round] && lockAt(r) <= now)
    .map((race) => {
      const result = resultsByRound.get(race.round);
      const s = scoreRound(mine[race.round], result, qualiByRound.get(race.round), !!quali.value?.data.length);
      return { round: race.round, race: result ? { ...race, Results: result.Results } : race, pick: mine[race.round], ...s, podiumExact: s.outcomes.filter((o) => PODIUM.includes(o.slot) && o.status === "exact").length };
    }), [racesList, mine, resultsByRound, qualiByRound, quali.value, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedRounds = racesList.filter((r) => resultsByRound.get(r.round)?.Results?.length);
  const stats = useMemo(() => {
    const done = scored.filter((s) => s.race.Results?.length);
    const total = done.reduce((s, x) => s + x.total, 0);
    let run = 0, best = 0, current = 0, scoreRun = 0, scoreBest = 0;
    for (const r of completedRounds) {
      const s = done.find((x) => x.round === r.round);
      run = s ? run + 1 : 0;
      best = Math.max(best, run);
      scoreRun = s && s.total > 0 ? scoreRun + 1 : 0;
      scoreBest = Math.max(scoreBest, scoreRun);
    }
    current = run;
    const bestRound = done.reduce<Scored | null>((m, x) => (!m || x.total > m.total ? x : m), null);
    return { done, total, avg: done.length ? total / done.length : 0, current, best, scoreBest, bestRound };
  }, [scored, completedRounds]);
  const badges = badgesFor(scored, Object.keys(mine).length > 0, stats.total, stats.best);

  const tint = target ? teamColor(byId.get(mine[target.round]?.p1 || "")?.team) : undefined;
  useAmbient(tint && tint !== "#8E8E99" ? tint : "#e10600");

  const loading = cal.loading || (res.loading && !res.value);
  if (loading)
    return (
      <Page className="pr">
        <Skeleton h="min(56vh, 520px)" r={36} />
        <div className="pr-board-skel"><Skeleton h={420} r={28} /><Skeleton h={420} r={28} /></div>
      </Page>
    );
  if (cal.error) return <Page className="pr"><h1 className="sr-only">Predict unavailable</h1><StateView error={cal.error} onRetry={cal.reload} /></Page>;

  return (
    <Page className="pr">
      <PredictHero race={target} total={racesList.length} year={year} timezone={timezone} pick={target ? mine[target.round] : undefined} byId={byId} />

      {target ? (
        <Section id="your-picks" title="Your picks" subtitle={`Pick the podium for the ${target.raceName}${open.length > 1 ? " — or switch to a later round" : ""}. Saved on this device only.`}>
          {open.length > 1 && (
            <div className="pr-rounds reveal" role="group" aria-label="Choose a round to predict">
              {open.slice(0, 6).map((r) => (
                <button key={r.round} type="button" className={cx("pr-round", r.round === target.round && "on")} aria-pressed={r.round === target.round} onClick={() => { setRequested(r.round); setQuery({ round: r.round === open[0].round ? null : r.round }); }}>
                  <Flag country={r.Circuit.Location.country} />
                  <span><b>R{r.round}</b><small>{shortRace(r.raceName)}</small></span>
                  {mine[r.round] && <Check size={13} className="pr-round-done" aria-label="Prediction saved" />}
                </button>
              ))}
            </div>
          )}
          {grid.length ? (
            <Board key={target.round} race={target} year={year} grid={grid} byId={byId} pick={mine[target.round]} locked={lockAt(target) <= now}
              onChange={(p) => setPick(year, target.round, p)} />
          ) : (
            <StateView loading={res.loading || roster.loading} error={res.error || roster.error} onRetry={() => { res.reload(); roster.reload(); }} empty emptyTitle="No entry list yet" emptyText="The driver list appears once the data source publishes this season's entries." />
          )}
          <Source value={res.value?.data.length ? res.value : roster.value} label="Entry list" />
        </Section>
      ) : (
        <Section title="Your picks">
          <Glass className="state">
            <Lock />
            <h3>No races left to predict in {year}</h3>
            <p>Every Grand Prix on the {year} calendar has started. Your scorecard below covers the whole season.</p>
          </Glass>
        </Section>
      )}

      <Section id="scorecard" title="Season scorecard" subtitle={`Your ${year} predictions, scored against the published classifications.`}
        action={stats.done.length > 0 ? <ShareButton year={year} stats={stats} badges={badges} byId={byId} /> : undefined}>
        <Scorecard stats={stats} predicted={Object.keys(mine).length} completed={completedRounds.length} />
        <Badges badges={badges} />
        <History scored={scored} byId={byId} year={year} loadingQuali={quali.loading} />
        <Source value={res.value} label="Results" />
      </Section>

      <Section id="rules" title="How scoring works">
        <Rules />
      </Section>
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function PredictHero({ race, total, year, timezone, pick, byId }: {
  race?: Race; total: number; year: string; timezone: string; pick?: Pick; byId: Map<string, { driver: Driver; team?: Team }>;
}) {
  const media = circuitMedia(race?.Circuit.circuitId);
  const filled = pick ? PODIUM.filter((s) => pick[s]).length : 0;
  return (
    <section className="pr-hero">
      <div className="pr-hero-media">
        <Img src={media.hero} alt="" eager />
        <span className="pr-hero-scrim" />
      </div>
      <div className="pr-hero-inner">
        <div className="pr-hero-copy">
          <span className="eyebrow pr-hero-eyebrow rise"><Target size={14} />Prediction game · {year}</span>
          <h1 className="display pr-hero-title rise" style={{ "--i": 1 } as CSSProperties}>Call the<span>podium.</span></h1>
          {race ? (
            <>
              <p className="pr-hero-place rise" style={{ "--i": 2 } as CSSProperties}>
                <Flag country={race.Circuit.Location.country} large />
                <span>{race.raceName}<small>Round {race.round} of {total} · {formatDateRange(race.FirstPractice?.date || race.date, race.date)}</small></span>
              </p>
              <div className="rise" style={{ "--i": 3 } as CSSProperties}>
                <span className="pr-lock-label"><Lock size={13} />Picks lock at lights out</span>
                <Countdown target={sessionDate(race.date, race.time).getTime()} label="Predictions lock" doneText="Predictions locked — race under way" />
                <p className="pr-hero-start">{formatWeekday(race.date, race.time, timezone)} {formatClock(race.date, race.time, timezone)} · {timezoneLabel(timezone)}</p>
              </div>
            </>
          ) : (
            <p className="pr-hero-place rise" style={{ "--i": 2 } as CSSProperties}><span>The {year} season is complete<small>Your final scorecard is below.</small></span></p>
          )}
        </div>
        {race && (
          <div role="group" className="pr-hero-podium rise" style={{ "--i": 2 } as CSSProperties} aria-label={`Your podium: ${filled} of 3 picked`}>
            {(["p2", "p1", "p3"] as Slot[]).map((s) => {
              const d = pick?.[s] ? byId.get(pick[s]!) : undefined;
              return (
                <span key={s} className={cx("pr-hp-step", s)} style={{ "--tint": teamColor(d?.team) } as CSSProperties}>
                  <span className="pr-hp-face">
                    {d ? <DriverAvatar id={d.driver.driverId} name={fullName(d.driver)} year={year} team={d.team?.constructorId} size={s === "p1" ? 84 : 66} /> : <span className="pr-hp-empty">?</span>}
                  </span>
                  <span className="pr-hp-block"><b>{s.slice(1)}</b><small>{d ? d.driver.familyName : "Your pick"}</small></span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Pick board ───────────────────────── */
function Board({ race, year, grid, byId, pick, locked, onChange }: {
  race: Race; year: string; grid: { driver: Driver; team?: Team }[]; byId: Map<string, { driver: Driver; team?: Team }>; pick?: Pick; locked: boolean; onChange: (p: Pick | null) => void;
}) {
  const current: Pick = pick || { savedAt: 0 };
  const firstEmpty = SLOTS.find((s) => !current[s]) || "p1";
  const [active, setActive] = useState<Slot>(firstEmpty);
  const filled = SLOTS.filter((s) => current[s]).length;
  const podiumDone = PODIUM.every((s) => current[s]);

  const assign = (id: string) => {
    if (locked) return;
    const next: Pick = { ...current, savedAt: Date.now() };
    if (next[active] === id) delete next[active];
    else {
      if (PODIUM.includes(active)) {
        // A driver can only stand on one step: swap with the step they're already on.
        const other = PODIUM.find((s) => s !== active && next[s] === id);
        if (other) { if (next[active]) next[other] = next[active]; else delete next[other]; }
      }
      next[active] = id;
      const order = SLOTS.slice(SLOTS.indexOf(active) + 1).concat(SLOTS.slice(0, SLOTS.indexOf(active)));
      const empty = order.find((s) => !next[s]);
      if (empty) setActive(empty);
    }
    onChange(next);
  };
  const clearSlot = (s: Slot) => {
    if (locked) return;
    const next: Pick = { ...current, savedAt: Date.now() };
    delete next[s];
    onChange(next);
    setActive(s);
  };
  const slotsOf = (id: string) => SLOTS.filter((s) => current[s] === id);

  return (
    <div className={cx("pr-board", locked && "locked")}>
      <Glass className="card pr-slots reveal">
        <div className="card-title">
          <h3>{locked ? "Locked in" : "Your podium"}</h3>
          {locked ? <span className="chip"><Lock size={12} />Locked at lights out</span> : current.savedAt ? <span className="chip green"><Check />Saved {relativeTime(new Date(current.savedAt).toISOString())}</span> : <span className="chip">Not saved yet</span>}
        </div>
        <LayoutGroup>
          <div className="pr-slot-list" role="radiogroup" aria-label="Prediction slots — choose one, then pick a driver">
            {SLOTS.map((s) => {
              const d = current[s] ? byId.get(current[s]!) : undefined;
              const on = active === s && !locked;
              return (
                <div key={s} className={cx("pr-slot", s, on && "on", d && "filled", !PODIUM.includes(s) && "bonus")} style={{ "--tint": teamColor(d?.team) } as CSSProperties}>
                  <button type="button" role="radio" aria-checked={on} disabled={locked} className="pr-slot-btn" onClick={() => setActive(s)}
                    aria-label={`${SLOT_LABEL[s]}: ${d ? fullName(d.driver) : "empty"}${locked ? "" : ". Select, then choose a driver."}`}>
                    {on && <motion.span layoutId="pr-slot-thumb" className="pr-slot-thumb" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                    <span className="pr-slot-tag">{SLOT_SHORT[s]}</span>
                    <span className="pr-slot-face">
                      {d ? <DriverAvatar id={d.driver.driverId} name={fullName(d.driver)} year={year} team={d.team?.constructorId} size={44} /> : <span className="pr-slot-empty" />}
                    </span>
                    <span className="pr-slot-text">
                      <small>{SLOT_LABEL[s]}{!PODIUM.includes(s) && " · optional"}</small>
                      <strong>{d ? fullName(d.driver) : on ? "Choose a driver ↓" : "Empty"}</strong>
                    </span>
                  </button>
                  {d && !locked && <button type="button" className="icon-btn pr-slot-clear" onClick={() => clearSlot(s)} aria-label={`Clear ${SLOT_LABEL[s]}`}><X size={15} /></button>}
                </div>
              );
            })}
          </div>
        </LayoutGroup>
        <div className="pr-slots-foot">
          <span className="muted small">{locked ? (filled ? `${plural(filled, "pick")} locked for the ${race.raceName}.` : `No prediction was made for the ${race.raceName}.`) : podiumDone ? "Podium set — add pole and fastest lap for bonus points." : `${3 - PODIUM.filter((s) => current[s]).length} podium ${3 - PODIUM.filter((s) => current[s]).length === 1 ? "step" : "steps"} to fill.`}</span>
          {!locked && filled > 0 && <button type="button" className="btn sm plain" onClick={() => { onChange(null); setActive("p1"); }}><RotateCcw />Clear all</button>}
        </div>
      </Glass>

      <Glass className="card pr-picker reveal" style={{ "--i": 1 } as CSSProperties}>
        <div className="card-title">
          <h3>{locked ? "The grid" : <>Pick for <span className="pr-picker-slot">{SLOT_LABEL[active]}</span></>}</h3>
          <span className="eyebrow">{plural(grid.length, "driver")}</span>
        </div>
        <ul className="pr-grid" aria-label="Drivers">
          {grid.map(({ driver, team }, i) => {
            const tags = slotsOf(driver.driverId);
            const tint = teamColor(team);
            const here = current[active] === driver.driverId;
            return (
              <li key={driver.driverId} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
                <button type="button" className={cx("pr-driver", tags.length > 0 && "picked", here && "here", isLightColor(tint) && "light")} style={{ "--tint": tint } as CSSProperties}
                  disabled={locked} aria-pressed={here} onClick={() => assign(driver.driverId)}
                  aria-label={`${fullName(driver)}${team ? `, ${teamShortName(team.name, year)}` : ""}${tags.length ? ` — picked for ${tags.map((t) => SLOT_LABEL[t]).join(", ")}` : ""}`}>
                  <span className="pr-driver-ring"><DriverAvatar id={driver.driverId} name={fullName(driver)} year={year} team={team?.constructorId} size={56} /></span>
                  <span className="pr-driver-name"><small>{driver.givenName}</small><strong>{driver.familyName}</strong></span>
                  <span className="pr-driver-team">{team ? teamShortName(team.name, year) : driver.code || ""}</span>
                  <AnimatePresence>
                    {tags.length > 0 && (
                      <motion.span className="pr-driver-tags" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 520, damping: 26 }}>
                        {tags.map((t) => <i key={t} className={t}>{SLOT_SHORT[t]}</i>)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="source">Entry list from the most recent Grand Prix classification{grid[0]?.team ? "" : " (season entry list)"} — stand-ins appear once they've raced.</p>
      </Glass>
    </div>
  );
}

/* ───────────────────────── Scorecard ───────────────────────── */
type Stats = { done: Scored[]; total: number; avg: number; current: number; best: number; scoreBest: number; bestRound: Scored | null };
function Scorecard({ stats, predicted, completed }: { stats: Stats; predicted: number; completed: number }) {
  const tiles = [
    { icon: <Trophy size={14} />, label: "Season points", value: stats.total, detail: stats.done.length ? `from ${plural(stats.done.length, "scored round")}` : "Scores appear after your first predicted race", feature: true },
    { icon: <Gauge size={14} />, label: "Average", value: stats.avg, decimals: 1, detail: "Points per scored round (max 36)" },
    { icon: <Crown size={14} />, label: "Best round", value: stats.bestRound?.total ?? 0, detail: stats.bestRound ? `R${stats.bestRound.round} · ${shortRace(stats.bestRound.race.raceName)}` : "—" },
    { icon: <Flame size={14} />, label: "Current streak", value: stats.current, detail: `Consecutive completed rounds predicted · best ${stats.best}` },
    { icon: <BadgeCheck size={14} />, label: "Scoring streak", value: stats.scoreBest, detail: "Longest run of rounds scoring points" },
    { icon: <Target size={14} />, label: "Rounds predicted", value: predicted, detail: `${completed} rounds completed this season` },
  ];
  return (
    <div className="pr-kpis">
      {tiles.map((t, i) => (
        <Glass key={t.label} className={cx("kpi pr-kpi reveal", t.feature && "feature")} style={{ "--i": i } as CSSProperties}>
          <span className="label">{t.icon}{t.label}</span>
          <span className="value"><Counter value={t.value} decimals={t.decimals || 0} /></span>
          <span className="detail">{t.detail}</span>
        </Glass>
      ))}
    </div>
  );
}

function Badges({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <Glass className="card pr-badges reveal">
      <div className="card-title"><h3>Badges</h3><span className="eyebrow">{earned} of {badges.length} earned</span></div>
      <ul className="pr-badge-list">
        {badges.map((b, i) => {
          const Icon = b.icon;
          return (
            <li key={b.id} className={cx("pr-badge", b.earned && "earned")} style={{ "--i": i } as CSSProperties}>
              <span className="pr-badge-icon" aria-hidden><Icon size={20} /></span>
              <span className="pr-badge-text">
                <strong>{b.name}{b.earned ? <span className="sr-only"> — earned</span> : <span className="sr-only"> — not yet earned</span>}</strong>
                <small>{b.detail}</small>
                {b.note && <em>{b.note}</em>}
              </span>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}

function History({ scored, byId, year, loadingQuali }: { scored: Scored[]; byId: Map<string, { driver: Driver; team?: Team }>; year: string; loadingQuali: boolean }) {
  if (!scored.length)
    return <StateView empty emptyTitle="No locked predictions yet" emptyText="Once a race starts, your picks lock and show up here — scored as soon as the classification is published." />;
  const name = (id?: string) => (id ? byId.get(id)?.driver.familyName || id : "—");
  return (
    <Glass className="card flush reveal pr-history">
      <div className="table-wrap" tabIndex={0}>
        <table className="tbl pr-tbl">
          <thead>
            <tr><th>Round</th>{SLOTS.map((s) => <th key={s} className="c">{SLOT_SHORT[s]}</th>)}<th className="r">Points</th></tr>
          </thead>
          <tbody>
            {[...scored].reverse().map((s) => (
              <tr key={s.round}>
                <td><Link to={`race/${s.round}?season=${year}`} className="pr-tbl-race"><Flag country={s.race.Circuit.Location.country} /><span><b>R{s.round}</b> {shortRace(s.race.raceName)}</span></Link></td>
                {s.outcomes.map((o) => (
                  <td key={o.slot} className="c">
                    {o.status === "empty" ? <span className="faint">—</span> : (
                      <span className={cx("pr-out", o.status)} title={o.actual ? `Actual: ${name(o.actual)}` : o.status === "na" ? "Not published by the data source" : "Awaiting result"}>
                        {name(o.pick)}{o.pts > 0 && <b>+{o.pts}</b>}
                      </span>
                    )}
                  </td>
                ))}
                <td className="r">{s.complete ? <b className="pr-tbl-total">{s.total}</b> : s.race.Results?.length ? <span className="faint">{s.total}{loadingQuali ? "…" : ""}</span> : <span className="chip yellow">Awaiting</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="source pr-legend"><i className="pr-out exact" />Exact <i className="pr-out podium" />On podium <i className="pr-out miss" />Miss <i className="pr-out na" />Not published · hover a pick to see the actual result.</p>
    </Glass>
  );
}

function Rules() {
  return (
    <div className="pr-rules">
      {RULES.map((r, i) => (
        <Glass key={r.label} className="card pr-rule reveal" style={{ "--i": i } as CSSProperties}>
          <span className="pr-rule-pts">+{r.pts}</span>
          <strong>{r.label}</strong>
          <span className="muted small">{r.detail}</span>
        </Glass>
      ))}
      <p className="notice pr-rules-note reveal"><Info />Maximum 36 points per Grand Prix. Picks lock at the scheduled race start and are scored only from the published Jolpica classification — later penalties are reflected when the source updates. Everything stays in this browser; there are no accounts and no other players.</p>
    </div>
  );
}

/* ───────────────────────── Share image ───────────────────────── */
function ShareButton({ year, stats, badges, byId }: { year: string; stats: Stats; badges: Badge[]; byId: Map<string, { driver: Driver; team?: Team }> }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const blob = await drawShare(year, stats, badges, byId);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `f1-pulse-predictions-${year}.png` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" className="btn sm primary" onClick={make} disabled={busy}><Download />{busy ? "Drawing…" : "Share image"}</button>;
}

async function drawShare(year: string, stats: Stats, badges: Badge[], byId: Map<string, { driver: Driver; team?: Team }>): Promise<Blob | null> {
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext("2d");
  if (!g) return null;
  g.scale(2, 2);
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "system-ui, sans-serif";
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a0506"); bg.addColorStop(0.55, "#09090c"); bg.addColorStop(1, "#050507");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, H * 0.1, 10, W * 0.85, H * 0.1, 520);
  glow.addColorStop(0, "rgba(225,6,0,0.55)"); glow.addColorStop(1, "rgba(225,6,0,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 2;
  for (let x = -H; x < W; x += 22) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.6, 0); g.stroke(); }

  g.fillStyle = "rgba(255,255,255,0.7)"; g.font = `700 18px ${font}`;
  g.fillText(`F1 PULSE  ·  PREDICTION GAME  ·  ${year}`, 64, 78);
  g.fillStyle = "#fff"; g.font = `800 64px ${font}`;
  g.fillText("My season so far", 64, 150);
  g.font = `900 168px ${font}`;
  g.fillText(String(stats.total), 60, 330);
  const w = g.measureText(String(stats.total)).width;
  g.font = `600 30px ${font}`; g.fillStyle = "rgba(255,255,255,0.65)";
  g.fillText("points", 70 + w, 330);

  const tiles: [string, string][] = [
    [String(stats.done.length), "rounds scored"],
    [stats.avg.toFixed(1), "avg per round"],
    [String(stats.bestRound?.total ?? 0), "best round"],
    [String(stats.best), "best streak"],
  ];
  tiles.forEach(([v, l], i) => {
    const x = 64 + i * 140, y = 380;
    g.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(g, x, y, 126, 92, 18); g.fill();
    g.fillStyle = "#fff"; g.font = `800 36px ${font}`; g.fillText(v, x + 16, y + 48);
    g.fillStyle = "rgba(255,255,255,0.6)"; g.font = `600 14px ${font}`; g.fillText(l, x + 16, y + 74);
  });

  // Most recent scored round.
  const last = [...stats.done].reverse()[0];
  if (last) {
    const x0 = 680, y0 = 120;
    g.fillStyle = "rgba(255,255,255,0.07)"; roundRect(g, x0, y0, 456, 352, 28); g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)"; g.font = `700 15px ${font}`;
    g.fillText(`LATEST · ROUND ${last.round} · ${shortRace(last.race.raceName).toUpperCase()}`, x0 + 28, y0 + 42);
    last.outcomes.forEach((o, i) => {
      const y = y0 + 84 + i * 52;
      const d = o.pick ? byId.get(o.pick) : undefined;
      g.fillStyle = teamColor(d?.team);
      g.beginPath(); g.arc(x0 + 44, y - 6, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.font = `800 12px ${font}`; g.textAlign = "center";
      g.fillText(SLOT_SHORT[o.slot], x0 + 44, y - 2); g.textAlign = "left";
      g.font = `700 22px ${font}`; g.fillStyle = o.pick ? "#fff" : "rgba(255,255,255,0.35)";
      g.fillText(d ? d.driver.familyName : o.pick || "No pick", x0 + 74, y);
      g.textAlign = "right"; g.font = `800 22px ${font}`;
      g.fillStyle = o.pts > 0 ? "#30d158" : "rgba(255,255,255,0.35)";
      g.fillText(o.pts > 0 ? `+${o.pts}` : o.status === "pending" ? "…" : "0", x0 + 428, y);
      g.textAlign = "left";
    });
    g.fillStyle = "rgba(255,255,255,0.85)"; g.font = `800 20px ${font}`;
    g.fillText(`Round total: ${last.total} pts`, x0 + 28, y0 + 330);
  }

  const earned = badges.filter((b) => b.earned).map((b) => b.name);
  g.fillStyle = "rgba(255,255,255,0.6)"; g.font = `700 15px ${font}`;
  g.fillText(earned.length ? "BADGES" : "", 64, 520);
  let bx = 64;
  g.font = `700 16px ${font}`;
  for (const name of earned.slice(0, 6)) {
    const tw = g.measureText(name).width + 28;
    if (bx + tw > W - 64) break;
    g.fillStyle = "rgba(255,214,10,0.16)"; roundRect(g, bx, 534, tw, 34, 17); g.fill();
    g.fillStyle = "#ffd60a"; g.fillText(name, bx + 14, 557);
    bx += tw + 10;
  }
  g.fillStyle = "rgba(255,255,255,0.4)"; g.font = `500 13px ${font}`;
  g.fillText("Scored on this device against published Jolpica classifications · 10 exact · 5 podium · 3 pole · 3 fastest lap", 64, 604);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
