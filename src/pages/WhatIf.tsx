import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "motion/react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Ban, ChevronLeft, ChevronRight, CircleSlash, Crown, FlaskConical, GripVertical,
  Info, RotateCcw, Shuffle, Sparkles, Undo2,
} from "lucide-react";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor, teamShortName } from "../lib/media";
import { plural, pts } from "../lib/format";
import { isIndy500, useArchive, type Archive, type ArchiveBundle } from "../lib/archive";
import { Counter, CopyButton, Glass, Page, Section, Segmented, Source, StateView, Toggle, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, TeamLogo } from "../ui/media";
import { LineChart } from "../ui/charts";
import { ArchiveError, ArchiveHero, ArchiveLoading } from "./_archive-ui";
import { ModelBadge, PhotoFace } from "./_season";
import {
  WHATIF_SYSTEMS, decodeEdits, encodeEdits, eraTable, normaliseEntries, roundEntries, whatIfDiff, whatIfSeason, whatIfSystem,
  type Edits, type Entry, type WhatIfInput, type WhatIfResult, type WhatIfSystemId,
} from "../analytics-x.mjs";
import "./whatif.css";

/* ───────────────────────── Presets (verified against the archive) ───────────────────────── */
type Preset = { id: string; season: number; round?: string; title: string; text: string; moves?: [string, number][]; system?: WhatIfSystemId; drops?: boolean };
const PRESETS: Preset[] = [
  { id: "abu21", season: 2021, round: "22", title: "Hamilton holds on in Abu Dhabi", text: "No final-lap restart: Hamilton wins the 2021 finale ahead of Verstappen and takes an eighth title, 394.5 to 388.5.", moves: [["hamilton", 0]] },
  { id: "bra08", season: 2008, round: "18", title: "Glock keeps Hamilton behind", text: "Hamilton finishes sixth at Interlagos: level with Massa on 97 points — and Massa is champion on wins, six to five.", moves: [["hamilton", 5]] },
  { id: "aus94", season: 1994, round: "16", title: "No collision in Adelaide", text: "Damon Hill survives the clash with Schumacher and finishes second behind Mansell: 97 points to 92.", moves: [["damon_hill", 1]] },
  { id: "bra07", season: 2007, round: "17", title: "No gearbox glitch in Brazil", text: "Hamilton recovers to fifth instead of seventh — 111 points, champion by one from Räikkönen in the closest three-way finale.", moves: [["hamilton", 4]] },
  { id: "pts08", season: 2008, title: "2008 on 1991–2002 points", text: "Only the top six score (10-6-4-3-2-1). Massa beats Hamilton 83 to 80 — the same races, a different champion.", system: "1991" },
  { id: "drop88", season: 1988, title: "1988 with every result counting", text: "Without the best-eleven rule, Prost's 105 points beat Senna's 94. Senna was champion on 90 counted points to 87.", drops: false },
];

const presetEdits = (p: Preset, input: WhatIfInput, archive: Archive): string => {
  if (!p.round || !p.moves) return "";
  const round = input.rounds.find((r) => r.round === p.round);
  if (!round) return "";
  const list = roundEntries(round).map((e) => ({ ...e }));
  for (const [id, to] of p.moves) {
    const d = archive.driverIndex.get(id);
    const i = list.findIndex((e) => e.d === d);
    if (i < 0) return "";
    const [e] = list.splice(i, 1);
    list.splice(to, 0, { ...e, st: "f" });
  }
  return encodeEdits(new Map([[p.round, normaliseEntries(list)]]), input.rounds);
};

function buildInput(archive: Archive, season: number): WhatIfInput {
  return {
    season,
    rounds: archive.races.filter((r) => r.season === season && r.results.length).map((r) => ({ round: String(r.round), name: r.name, indy: isIndy500(archive, r), results: r.results, sprint: r.sprint })),
  };
}

/* ───────────────────────── Page ───────────────────────── */
export default function WhatIf({ route }: { route: Route }) {
  useTitle("What If");
  useAmbient("#ff9f0a", "#bf5af2");
  const a = useArchive();
  if (a.loading || (!a.value && !a.error)) return <Page className="wi"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="wi"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  return <WhatIfView bundle={a.value} route={route} />;
}

type State = { season: number; e: string; system: WhatIfSystemId; drops: boolean; round: string | null };

function WhatIfView({ bundle, route }: { bundle: ArchiveBundle; route: Route }) {
  const { archive, history, envelope } = bundle;
  const { year, setSeason } = usePrefs();
  const seasons = archive.seasons;
  const wanted = +year;
  const season = seasons.includes(wanted) ? wanted : seasons.at(-1)!;
  const input = useMemo(() => buildInput(archive, season), [archive, season]);
  const [state, setState] = useState<State>(() => ({
    season, e: route.query.get("e") || "", system: whatIfSystem(route.query.get("pts")).id, drops: route.query.get("drops") !== "0", round: route.query.get("r"),
  }));
  const mine = state.season === season;
  const edits = useMemo<Edits>(() => (mine ? decodeEdits(state.e, input.rounds) : new Map()), [mine, state.e, input]);
  const system = mine ? state.system : "actual";
  const drops = mine ? state.drops : true;
  const roundId = (mine && state.round && input.rounds.some((r) => r.round === state.round) ? state.round : input.rounds.at(-1)?.round) || "";
  const update = (patch: Partial<State>) => setState((s) => ({ ...(s.season === season ? s : { season, e: "", system: "actual", drops: true, round: null }), ...patch }));

  const base = useMemo(() => whatIfSeason(input), [input]);
  const scenario = useMemo(() => whatIfSeason(input, { edits, system, drops }), [input, edits, system, drops]);
  const diff = useMemo(() => whatIfDiff(base, scenario), [base, scenario]);
  const encoded = encodeEdits(edits, input.rounds);
  const modified = !!encoded || system !== "actual" || !drops;

  useEffect(() => {
    setQuery({ season: String(season), e: encoded || null, pts: system !== "actual" ? system : null, drops: drops ? null : "0", r: roundId || null });
  }, [season, encoded, system, drops, roundId]);

  const live = archive.live.includes(season);
  const rules = scenario.rules;
  const hasDrops = !!(rules.driver || rules.constructor);
  const champBase = base.drivers[0], champNew = scenario.drivers[0];
  const changed = modified && champBase && champNew && champBase.d !== champNew.d;
  const lastRace = archive.races.filter((r) => r.season === season).at(-1);
  const photo = circuitMedia(archive.circuits[lastRace?.circuit ?? -1]?.id).hero;
  const shareUrl = `${location.origin}${location.pathname}#/whatif?${new URLSearchParams({ season: String(season), ...(encoded ? { e: encoded } : {}), ...(system !== "actual" ? { pts: system } : {}), ...(!drops ? { drops: "0" } : {}), ...(roundId ? { r: roundId } : {}) })}`;

  const applyPreset = (p: Preset) => {
    const inp = p.season === season ? input : buildInput(archive, p.season);
    const e = presetEdits(p, inp, archive);
    setState({ season: p.season, e, system: p.system || "actual", drops: p.drops ?? true, round: p.round || inp.rounds.at(-1)?.round || null });
    if (p.season !== season) setSeason(String(p.season));
    document.getElementById("editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const activePreset = PRESETS.find((p) => p.season === season && mine && presetEdits(p, input, archive) === encoded && (p.system || "actual") === system && (p.drops ?? true) === drops && modified);

  if (!input.rounds.length) return <Page className="wi"><StateView empty emptyTitle="No completed rounds" emptyText={`${season} has no classified Grand Prix yet.`} /></Page>;

  return (
    <Page className="wi">
      <ArchiveHero
        className="wi-hero"
        eyebrow="Lab · Hypothetical sandbox"
        icon={<Shuffle size={14} />}
        title="What If"
        accent="Rewrite a result. Watch the title reflow."
        lede={<>Reorder any finishing order, retire or disqualify a driver, or switch points systems — {season}'s championship recomputes live with that season's own rules, and every change is measured against what really happened.</>}
        photo={photo}
        tint="#ff9f0a"
        stats={[
          { label: live ? "Rounds so far" : "Rounds", value: <Counter value={input.rounds.length} /> },
          { label: "Edited rounds", value: <Counter value={edits.size} /> },
          { label: "Points system", value: <span className="wi-hero-sys">{whatIfSystem(system).short}</span> },
        ]}
        figure={champNew && <ChampionCard archive={archive} season={season} row={champNew} base={champBase} changed={!!changed} modified={modified} live={live} scenario={scenario} />}
        actions={<><CopyButton text={shareUrl} label="Copy scenario link" share /><button type="button" className="btn sm glass-btn" disabled={!modified} onClick={() => update({ e: "", system: "actual", drops: true })}><RotateCcw />Reset all</button></>}
      />
      <p className="notice wi-disclaimer reveal" role="note"><FlaskConical /><span><b>Hypothetical.</b> Everything on this page is a what-if built from the published classifications — not an official result. Unedited rounds keep their recorded points; edited rounds are rescored with {season}'s points table.</span></p>

      <div className="wi-controls glass reveal">
        <label className="field wi-season">
          <span>Season</span>
          <select className="select" value={season} onChange={(e) => setSeason(String(e.target.value))}>
            {[...seasons].reverse().map((y) => <option key={y} value={y}>{y}{archive.live.includes(y) ? " (in progress)" : ""}</option>)}
          </select>
        </label>
        <div className="field wi-sys">
          <span>Points system</span>
          <Segmented label="Points system" value={system} onChange={(v) => update({ system: v })} options={WHATIF_SYSTEMS.map((s) => ({ value: s.id, label: s.short }))} />
        </div>
        {hasDrops && (
          <div className="field wi-drops">
            <span>Dropped scores</span>
            <span className="wi-toggle"><Toggle checked={drops} onChange={(v) => update({ drops: v })} label="Apply the season's dropped-score rule" /><small>{drops ? describeRule(rules.driver) : "Every result counts"}</small></span>
          </div>
        )}
      </div>
      {wanted !== season && <p className="notice wi-note"><Info />{year} isn't in the archive yet, so {season} is shown.</p>}

      <Section id="presets" title="Famous what-ifs" subtitle="Curated turning points, each checked against the archive — apply one, then keep editing.">
        <div className="wi-presets">
          {PRESETS.map((p, i) => (
            <Glass key={p.id} className={cx("card wi-preset reveal", activePreset?.id === p.id && "on")} style={{ "--i": i } as CSSProperties}>
              <span className="wi-preset-year">{p.season}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <button type="button" className="btn sm glass-btn" onClick={() => applyPreset(p)} aria-pressed={activePreset?.id === p.id}><Sparkles />{activePreset?.id === p.id ? "Applied" : "Try it"}</button>
            </Glass>
          ))}
        </div>
      </Section>

      <Section id="editor" title={<>Edit {season} <span className="chip wi-chip-o wi-hypo">Hypothetical</span></>} subtitle="Pick a round, then drag, swap, retire or disqualify drivers. The standings recompute as you go.">
        <div className="wi-split">
          <RoundEditor archive={archive} input={input} season={season} roundId={roundId} edits={edits} scenario={scenario}
            onRound={(r) => update({ round: r })}
            onChange={(round, list) => {
              const next = new Map(edits);
              if (list) next.set(round, normaliseEntries(list)); else next.delete(round);
              update({ e: encodeEdits(next, input.rounds) });
            }} />
          <Standings archive={archive} season={season} scenario={scenario} base={base} diff={diff} modified={modified} live={live} />
        </div>
      </Section>

      <Section id="progression" title="Title race" subtitle="Cumulative points after every round — the hypothetical next to the real thing.">
        <Progression archive={archive} season={season} scenario={scenario} base={base} />
        <Notes archive={archive} season={season} base={base} history={history} scenario={scenario} />
        <Source value={envelope} label="Race results" />
      </Section>
    </Page>
  );
}

const describeRule = (r?: { n: number } | { k: number; a: number; b: number }) =>
  !r ? "Every result counts" : "n" in r ? `Best ${r.n} results count` : `Best ${r.a} of first ${r.k} + best ${r.b} of the rest`;

/* ───────────────────────── Hero figure ───────────────────────── */
function ChampionCard({ archive, season, row, base, changed, modified, live, scenario }: {
  archive: Archive; season: number; row: WhatIfResult["drivers"][number]; base?: WhatIfResult["drivers"][number]; changed: boolean; modified: boolean; live: boolean; scenario: WhatIfResult;
}) {
  const d = archive.drivers[row.d];
  const team = archive.teams[row.c];
  const second = scenario.drivers[1];
  const label = live ? (modified ? "Hypothetical leader" : "Leader so far") : modified ? "Hypothetical champion" : "Champion, as raced";
  return (
    <div className={cx("wi-champ reveal", changed && "flip")} style={{ "--tint": teamColor(team?.id) } as CSSProperties}>
      <span className="wi-champ-label"><Crown size={13} />{label}</span>
      <PhotoFace id={d.id} name={d.name} year={String(season)} team={team?.id} size={124} />
      <strong>{d.name}</strong>
      <span className="wi-champ-sub">{team?.name} · {pts(row.points)} pts{second ? ` · ${row.points === second.points ? "level, on count-back" : `+${pts(row.points - second.points)}`}` : ""}</span>
      {changed && base && <span className="wi-champ-flip"><Shuffle size={12} />Title changes hands from {archive.drivers[base.d].family}</span>}
    </div>
  );
}

/* ───────────────────────── Round editor ───────────────────────── */
function RoundEditor({ archive, input, season, roundId, edits, scenario, onRound, onChange }: {
  archive: Archive; input: WhatIfInput; season: number; roundId: string; edits: Edits; scenario: WhatIfResult;
  onRound: (r: string) => void; onChange: (round: string, list: Entry[] | null) => void;
}) {
  const ri = input.rounds.findIndex((r) => r.round === roundId);
  const round = input.rounds[ri];
  const original = useMemo(() => (round ? roundEntries(round) : []), [round]);
  const list = edits.get(roundId) || original;
  const [swapA, setSwapA] = useState<number | null>(null);
  useEffect(() => setSwapA(null), [roundId]);
  if (!round) return null;
  const finishers = list.filter((e) => e.st === "f");
  const out = list.filter((e) => e.st !== "f");
  const origPos = new Map(original.filter((e) => e.st === "f").map((e, i) => [e.k, i + 1]));
  const origSt = new Map(original.map((e) => [e.k, e.st]));
  const set = (next: Entry[]) => onChange(roundId, next);
  const roundPts = (d: number) => scenario.drivers.find((x) => x.d === d)?.scores[ri] ?? 0;
  const move = (i: number, dir: number) => {
    const f = [...finishers];
    const j = i + dir;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j], f[i]];
    set([...f, ...out]);
  };
  const status = (k: number, st: Entry["st"]) => set(list.map((e) => (e.k === k ? { ...e, st: e.st === st ? "f" : st } : e)));
  const swap = (k: number) => {
    if (swapA === null) return setSwapA(k);
    if (swapA === k) return setSwapA(null);
    const ia = list.findIndex((e) => e.k === swapA), ib = list.findIndex((e) => e.k === k);
    const next = [...list];
    const A = next[ia], B = next[ib];
    next[ia] = { ...B, st: A.st };
    next[ib] = { ...A, st: B.st };
    setSwapA(null);
    set(next);
  };
  const era = eraTable(season);
  const edited = edits.has(roundId);
  const sprint = round.sprint.length > 0;
  return (
    <Glass className="card flush wi-editor reveal">
      <div className="wi-editor-head">
        <button type="button" className="icon-btn" disabled={ri <= 0} onClick={() => onRound(input.rounds[ri - 1].round)} aria-label="Previous round"><ChevronLeft /></button>
        <label className="field wi-round">
          <span className="sr-only">Round</span>
          <select className="select" value={roundId} onChange={(e) => onRound(e.target.value)}>
            {input.rounds.map((r) => <option key={r.round} value={r.round}>R{r.round} · {r.name}{edits.has(r.round) ? " •" : ""}</option>)}
          </select>
        </label>
        <button type="button" className="icon-btn" disabled={ri >= input.rounds.length - 1} onClick={() => onRound(input.rounds[ri + 1].round)} aria-label="Next round"><ChevronRight /></button>
        <button type="button" className="btn sm plain" disabled={!edited} onClick={() => onChange(roundId, null)}><Undo2 />Reset round</button>
      </div>
      {edits.size > 0 && (
        <div role="group" className="wi-edited" aria-label="Edited rounds">
          {[...edits.keys()].map((r) => <button key={r} type="button" className={cx("chip", r === roundId && "wi-chip-o")} onClick={() => onRound(r)}>R{r} edited</button>)}
        </div>
      )}
      <p className="wi-hint">{swapA !== null ? <><ArrowUpDown size={13} />Now pick the driver to swap results with {archive.drivers[list.find((e) => e.k === swapA)!.d].family}.</> : <><GripVertical size={13} />Drag the handle or use the arrows. <ArrowUpDown size={13} /> swaps two drivers' results.</>}</p>
      <Reorder.Group axis="y" values={finishers.map((e) => e.k)} onReorder={(keys: number[]) => set([...keys.map((k) => finishers.find((e) => e.k === k)!), ...out])} as="ol" className="wi-order" aria-label={`Finishing order, R${round.round} ${round.name}`}>
        {finishers.map((e, i) => (
          <OrderRow key={e.k} e={e} index={i} count={finishers.length} archive={archive} season={season} pts={roundPts(e.d)} was={origSt.get(e.k) === "f" ? origPos.get(e.k)! : null}
            swapping={swapA === e.k} onMove={move} onStatus={status} onSwap={swap} />
        ))}
      </Reorder.Group>
      {out.length > 0 && (
        <ul className="wi-out" aria-label="Did not finish or disqualified">
          {out.map((e) => {
            const d = archive.drivers[e.d], t = archive.teams[e.c];
            return (
              <li key={e.k} className={cx("wi-row", "wi-row-out", swapA === e.k && "swapping")} style={{ "--tint": teamColor(t?.id) } as CSSProperties}>
                <span className={cx("wi-row-pos", e.st)}>{e.st === "d" ? "DSQ" : "DNF"}</span>
                <DriverAvatar id={d.id} name={d.name} year={String(season)} team={t?.id} size={28} />
                <span className="wi-row-name"><b>{d.family}</b><small>{t ? teamShortName(t.name, String(season)) : ""}{origSt.get(e.k) !== e.st ? <em> · was {origSt.get(e.k) === "f" ? `P${origPos.get(e.k)}` : origSt.get(e.k) === "d" ? "DSQ" : "DNF"}</em> : null}</small></span>
                <span className="wi-row-pts">{roundPts(e.d) ? `+${pts(roundPts(e.d))}` : "0"}</span>
                <span className="wi-row-acts">
                  <button type="button" className={cx("icon-btn", swapA === e.k && "on")} onClick={() => swap(e.k)} aria-label={`Swap ${d.name}'s result`} aria-pressed={swapA === e.k}><ArrowUpDown /></button>
                  <button type="button" className="btn sm glass-btn" onClick={() => status(e.k, e.st)}>Reinstate</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="wi-foot"><Info size={13} />Grand Prix table {era.race.join("-")}{era.fastestLap === "top10" ? " + 1 for fastest lap (top ten)" : era.fastestLap === "any" ? " + 1 for fastest lap" : ""}. Points shown per driver for this round{sprint ? " include the sprint, which is never edited" : ""}. Bonus points stay with whoever earned them.</p>
    </Glass>
  );
}

function OrderRow({ e, index, count, archive, season, pts: p, was, swapping, onMove, onStatus, onSwap }: {
  e: Entry; index: number; count: number; archive: Archive; season: number; pts: number; was: number | null; swapping: boolean;
  onMove: (i: number, dir: number) => void; onStatus: (k: number, st: Entry["st"]) => void; onSwap: (k: number) => void;
}) {
  const controls = useDragControls();
  const d = archive.drivers[e.d], t = archive.teams[e.c];
  const moved = was === null ? "new" : was - (index + 1);
  return (
    <Reorder.Item
      value={e.k}
      dragListener={false}
      dragControls={controls}
      className={cx("wi-row", swapping && "swapping", p > 0 && "scores")}
      style={{ "--tint": teamColor(t?.id) } as CSSProperties}
      whileDrag={{ scale: 1.03, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.55)", zIndex: 5 }}
      transition={{ type: "spring", stiffness: 520, damping: 40 }}
    >
      <button type="button" className="wi-grip" onPointerDown={(ev) => { ev.preventDefault(); controls.start(ev); }} aria-label={`Drag ${d.name}`} tabIndex={-1}><GripVertical /></button>
      <span className="wi-row-pos">P{index + 1}</span>
      <DriverAvatar id={d.id} name={d.name} year={String(season)} team={t?.id} size={28} />
      <span className="wi-row-name">
        <b>{d.family}</b>
        <small>{t ? teamShortName(t.name, String(season)) : ""}{moved === "new" ? <em> · reinstated</em> : moved !== 0 ? <em className={moved > 0 ? "up" : "down"}> · was P{was}</em> : null}</small>
      </span>
      <span className={cx("wi-row-pts", p > 0 && "on")}>{p > 0 ? `+${pts(p)}` : "0"}</span>
      <span className="wi-row-acts">
        <button type="button" className="icon-btn" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${d.name} up to P${index}`}><ArrowUp /></button>
        <button type="button" className="icon-btn" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${d.name} down to P${index + 2}`}><ArrowDown /></button>
        <button type="button" className={cx("icon-btn", swapping && "on")} onClick={() => onSwap(e.k)} aria-label={`Swap ${d.name}'s result with another driver`} aria-pressed={swapping}><ArrowUpDown /></button>
        <button type="button" className="icon-btn" onClick={() => onStatus(e.k, "r")} aria-label={`Retire ${d.name}`} title="Did not finish"><CircleSlash /></button>
        <button type="button" className="icon-btn" onClick={() => onStatus(e.k, "d")} aria-label={`Disqualify ${d.name}`} title="Disqualify"><Ban /></button>
      </span>
    </Reorder.Item>
  );
}

/* ───────────────────────── Standings ───────────────────────── */
function Standings({ archive, season, scenario, base, diff, modified, live }: {
  archive: Archive; season: number; scenario: WhatIfResult; base: WhatIfResult; diff: ReturnType<typeof whatIfDiff>; modified: boolean; live: boolean;
}) {
  const [kind, setKind] = useState<"drivers" | "teams">("drivers");
  const [all, setAll] = useState(false);
  const hasTeams = scenario.teams.length > 0;
  const k = hasTeams ? kind : "drivers";
  const rows = diff.filter((r) => r.points > 0 || (r.before?.points ?? 0) > 0);
  const shown = all ? rows : rows.slice(0, 12);
  const baseTeams = new Map(base.teams.map((t, i) => [t.c, { rank: i + 1, points: t.points }]));
  const drv = new Map(scenario.drivers.map((x) => [x.d, x]));
  return (
    <Glass className="card flush wi-table reveal">
      <div className="wi-table-head">
        <h3 className="wi-h3">{live ? "Standings" : "Final table"} <ModelBadge>{modified ? "Hypothetical" : "As raced"}</ModelBadge></h3>
        {hasTeams && <Segmented label="Championship" value={kind} onChange={setKind} options={[{ value: "drivers", label: "Drivers" }, { value: "teams", label: "Constructors" }]} />}
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {k === "drivers" ? (
          <motion.ol key="d" className="wi-standings" layout>
            {shown.map((r) => {
              const d = archive.drivers[r.d], row = drv.get(r.d)!, t = archive.teams[row.c];
              return (
                <motion.li key={r.d} layout transition={{ type: "spring", stiffness: 420, damping: 38 }} className="wi-st-row" style={{ "--tint": teamColor(t?.id) } as CSSProperties}>
                  <span className={cx("pos", r.rank <= 3 && "p" + r.rank)}>{r.rank}</span>
                  <RankChip delta={r.rankDelta} />
                  <Link to={"driver/" + d.id} className="sa-who"><DriverAvatar id={d.id} name={d.name} year={String(season)} team={t?.id} size={30} /><span><b>{d.family}</b><small>{t ? teamShortName(t.name, String(season)) : ""} · {plural(row.wins, "win")}{row.dropped > 0 ? ` · ${pts(row.dropped)} dropped` : ""}</small></span></Link>
                  <span className="wi-st-pts"><b>{pts(r.points)}</b>{modified && r.before && <small>real {pts(r.before.points)}</small>}</span>
                  <PointsChip delta={modified ? r.pointsDelta : 0} />
                </motion.li>
              );
            })}
          </motion.ol>
        ) : (
          <motion.ol key="t" className="wi-standings" layout>
            {scenario.teams.filter((x) => x.points > 0 || (baseTeams.get(x.c)?.points ?? 0) > 0).map((x, i) => {
              const t = archive.teams[x.c], b = baseTeams.get(x.c);
              return (
                <motion.li key={x.c} layout className="wi-st-row" style={{ "--tint": teamColor(t?.id) } as CSSProperties}>
                  <span className={cx("pos", i < 3 && "p" + (i + 1))}>{i + 1}</span>
                  <RankChip delta={b ? b.rank - (i + 1) : null} />
                  <Link to={"team/" + t.id} className="sa-who"><TeamLogo id={t.id} name={t.name} year={String(season)} size={30} /><span><b>{teamShortName(t.name, String(season))}</b></span></Link>
                  <span className="wi-st-pts"><b>{pts(x.points)}</b>{modified && b && <small>real {pts(b.points)}</small>}</span>
                  <PointsChip delta={modified && b ? Math.round((x.points - b.points) * 100) / 100 : 0} />
                </motion.li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
      <div className="wi-foot spread">
        <span><Info size={13} />Ties go to count-back (most wins, then seconds, …). {scenario.rules.bestCarOnly && hasTeams ? "Constructors scored with their best car only. " : ""}Chips compare with the season as raced.</span>
        {k === "drivers" && rows.length > 12 && <button className="btn sm plain" onClick={() => setAll((x) => !x)}>{all ? "Top 12" : `All ${rows.length}`}</button>}
      </div>
    </Glass>
  );
}

function RankChip({ delta }: { delta: number | null }) {
  if (!delta) return <span className="wi-rank-chip level" aria-hidden />;
  return <span role="img" className={cx("wi-rank-chip", delta > 0 ? "up" : "down")} aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} vs real`}>{delta > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(delta)}</span>;
}
function PointsChip({ delta }: { delta: number }) {
  if (!delta) return <span className="wi-pts-chip level" aria-hidden>—</span>;
  return <span className={cx("wi-pts-chip", delta > 0 ? "up" : "down")}>{delta > 0 ? "+" : "−"}{pts(Math.abs(delta))}</span>;
}

/* ───────────────────────── Progression ───────────────────────── */
function Progression({ archive, season, scenario, base }: { archive: Archive; season: number; scenario: WhatIfResult; base: WhatIfResult }) {
  const [which, setWhich] = useState<"scenario" | "real">("scenario");
  const [focus, setFocus] = useState<string | null>(null);
  const res = which === "scenario" ? scenario : base;
  const picks = scenario.drivers.slice(0, 6).map((x) => x.d);
  const seen = new Set<string>();
  const series = picks.map((d) => {
    const row = res.drivers.find((x) => x.d === d);
    const c = teamColor(archive.teams[(row || scenario.drivers.find((x) => x.d === d)!).c]?.id);
    const dashed = seen.has(c);
    seen.add(c);
    return { id: String(d), name: archive.drivers[d].family, color: c, dashed, values: row ? row.cumulative : res.rounds.map(() => null) };
  });
  return (
    <Glass className="card reveal wi-prog">
      <div className="spread wi-prog-head">
        <div className="legend">
          {series.map((s) => (
            <button key={s.id} type="button" onPointerEnter={() => setFocus(s.id)} onPointerLeave={() => setFocus(null)} onFocus={() => setFocus(s.id)} onBlur={() => setFocus(null)}>
              <i className="swatch" style={{ "--c": s.color } as CSSProperties} />{s.name}{s.dashed ? " (dashed)" : ""}
            </button>
          ))}
        </div>
        <Segmented label="Show" value={which} onChange={setWhich} options={[{ value: "scenario", label: "Hypothetical" }, { value: "real", label: "As raced" }]} />
      </div>
      <LineChart
        ariaLabel={`${season} cumulative championship points by round, ${which === "scenario" ? "hypothetical" : "as raced"}, for the hypothetical top six`}
        series={series}
        labels={res.rounds.map((r) => "R" + r.round)}
        tooltipTitle={(i) => `${res.rounds[i]?.name} · R${res.rounds[i]?.round}${res.rounds[i]?.edited && which === "scenario" ? " (edited)" : ""}`}
        focus={focus}
        onFocus={setFocus}
        height={340}
        yFormat={(v) => pts(Math.round(v * 10) / 10)}
      />
      <div role="group" className="wi-prog-marks" aria-label="Edited rounds">
        {scenario.rounds.map((r, i) => r.edited ? <span key={r.round} className="chip wi-chip-o" style={{ "--x": scenario.rounds.length > 1 ? i / (scenario.rounds.length - 1) : 0.5 } as CSSProperties}>R{r.round} edited</span> : null)}
      </div>
    </Glass>
  );
}

/* ───────────────────────── Notes ───────────────────────── */
function Notes({ archive, season, base, history, scenario }: { archive: Archive; season: number; base: WhatIfResult; history: ArchiveBundle["history"]; scenario: WhatIfResult }) {
  const official = history.drivers[season];
  const adjustments = official
    ? base.drivers.flatMap((d) => {
        const row = official.find((r) => r[0] === archive.drivers[d.d].id);
        return row && Math.abs(row[2] - d.points) > 0.01 ? [`${archive.drivers[d.d].name}: ${pts(row[2])} official vs ${pts(d.points)} from classifications`] : [];
      })
    : [];
  const champ = official?.find((r) => r[1] === "1");
  const baseChamp = base.drivers[0] && archive.drivers[base.drivers[0].d].id;
  return (
    <div className="wi-notes">
      {adjustments.length > 0 && (
        <p className="notice" role="note"><Info /><span>The official {season} table differs from the classifications (penalties, exclusions or shared drives): {adjustments.slice(0, 4).join("; ")}{adjustments.length > 4 ? ` and ${adjustments.length - 4} more` : ""}.{champ && champ[0] !== baseChamp ? ` The official champion is ${history.names.drivers[champ[0]]?.slice(0, 2).join(" ") || champ[0]}.` : ""}</span></p>
      )}
      <ul className="wi-method">
        <li><b>As raced</b> keeps every recorded point in rounds you haven't touched — including half points for shortened races{season === 2014 ? ", the double-points finale" : ""} and sprints. An edited round is rescored with {season}'s table (and that round's multiplier); a fastest-lap point stays with its driver{eraTable(season).fastestLap === "top10" ? " while they finish in the top ten" : ""}.</li>
        <li><b>Other systems</b> rescore every Grand Prix in full with that table, without fastest-lap bonuses or shortened-race halving; only “Current” counts sprints (8-7-6-5-4-3-2-1).</li>
        <li><b>Dropped scores</b>: {scenario.rules.driver ? `${season} counted only some results (${describeRule(scenario.rules.driver).toLowerCase()}); switch the rule off to count everything.` : "this season counted every result."} Shared drives in the 1950s are scored per entry when a round is edited.</li>
      </ul>
    </div>
  );
}

