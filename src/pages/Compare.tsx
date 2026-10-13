import { ProgressNote } from "../ui/progress-note";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, Check, ChevronDown, Download, Flag as FlagIcon, Gauge, Link2, Medal, Search, Timer, TrendingUp, Trophy, Zap } from "lucide-react";
import { allResults, drivers, standings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { shortRace, useSeasonProgress } from "../lib/season";
import { driverMedia, fullName, initials, teamColor, teamShortName } from "../lib/media";
import { download, plural, pts, toCSV } from "../lib/format";
import { Glass, Page, Section, Segmented, Skeleton, Source, StateView, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo } from "../ui/media";
import { LineChart } from "../ui/charts";
import {
  driverQualifying, driverRaces, emptyEnvelope, finishDescription, finishDuel, finishLabel, finishTone, isClassified,
  pairColors, poleCount, qualiDuel, seasonStats, TugRow, useParallax,
} from "./_drivers";
import type { Driver, Race, Team } from "../types";
import "./compare.css";

type Metric = "cumulative" | "position" | "delta" | "gain";
const METRICS: { value: Metric; label: string }[] = [
  { value: "cumulative", label: "Points" },
  { value: "position", label: "Finishes" },
  { value: "delta", label: "Per round" },
  { value: "gain", label: "Places gained" },
];
type Option = { driver: Driver; team?: Team; position?: number; points: number; wins: number };
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function Compare({ route }: { route: Route }) {
  const { season, year } = usePrefs();
  useTitle("Head to head");
  const ds = useData(() => standings(season), [season]);
  const dl = useData(() => drivers(season), [season]);
  const res = useData(() => allResults(season), [season]);
  const progress = useSeasonProgress(season, year);
  const initialMetric = route.query.get("metric") as Metric | null;
  const [a, setA] = useState(route.query.get("a") || "");
  const [b, setB] = useState(route.query.get("b") || "");
  const [metric, setMetricState] = useState<Metric>(METRICS.some((m) => m.value === initialMetric) ? initialMetric! : "cumulative");
  const [toast, setToast] = useState<string | null>(null);

  // Team from each driver's most recent race (exact even after mid-season moves).
  const lastTeam = useMemo(() => {
    const m = new Map<string, Team>();
    for (const race of res.value?.data || []) for (const r of race.Results || []) m.set(r.Driver.driverId, r.Constructor);
    return m;
  }, [res.value]);

  const options = useMemo(() => {
    const list: Option[] = (ds.value?.data || []).map((s) => ({
      driver: s.Driver, team: lastTeam.get(s.Driver.driverId) || (s.Constructors.length === 1 ? s.Constructors[0] : undefined),
      position: +s.position || undefined, points: +s.points || 0, wins: +s.wins || 0,
    }));
    const seen = new Set(list.map((o) => o.driver.driverId));
    for (const d of dl.value?.data || []) if (!seen.has(d.driverId)) list.push({ driver: d, team: lastTeam.get(d.driverId), points: 0, wins: 0 });
    return list;
  }, [ds.value, dl.value, lastTeam]);

  const has = (id: string) => options.some((o) => o.driver.driverId === id);
  const aId = has(a) ? a : options[0]?.driver.driverId || "";
  const bId = has(b) && b !== aId ? b : options.find((o) => o.driver.driverId !== aId)?.driver.driverId || "";
  const A = options.find((o) => o.driver.driverId === aId);
  const B = options.find((o) => o.driver.driverId === bId);

  useEffect(() => {
    if (aId && bId && (aId !== a || bId !== b)) setQuery({ a: aId, b: bId });
  }, [aId, bId, a, b]);

  const choose = (side: "a" | "b", id: string) => {
    const other = side === "a" ? bId : aId;
    let na = side === "a" ? id : aId, nb = side === "b" ? id : bId;
    if (id === other) [na, nb] = side === "a" ? [id, aId] : [bId, id]; // picking the opponent swaps sides
    setA(na); setB(nb); setQuery({ a: na, b: nb });
  };
  const swap = () => { setA(bId); setB(aId); setQuery({ a: bId, b: aId }); };
  const setMetric = (m: Metric) => { setMetricState(m); setQuery({ metric: m === "cumulative" ? null : m }); };

  const qa = useData(() => (aId ? driverQualifying(season, aId) : Promise.resolve(emptyEnvelope<Race[]>([]))), [season, aId]);
  const qb = useData(() => (bId ? driverQualifying(season, bId) : Promise.resolve(emptyEnvelope<Race[]>([]))), [season, bId]);

  const [ca, cb] = pairColors(teamColor(A?.team), teamColor(B?.team));
  useAmbient(ca, cb);

  const share = async () => {
    setQuery({ a: aId, b: bId, metric: metric === "cumulative" ? null : metric });
    try {
      await navigator.clipboard.writeText(location.href);
      setToast("Link copied — paste it anywhere to share this duel");
    } catch {
      setToast("Couldn't access the clipboard — copy the address bar instead");
    }
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const loading = ds.loading || dl.loading;
  const races = res.value?.data || [];

  return (
    <Page className="cmp">
      {loading ? (
        <Skeleton h="min(70vh, 640px)" r={36} />
      ) : ds.error && dl.error ? (
        <StateView error={ds.error} onRetry={() => { ds.reload(); dl.reload(); }} />
      ) : options.length < 2 || !A || !B ? (
        <>
          <header className="cmp-empty-head"><span className="eyebrow">Head to head · {year}</span><h1 className="title-1">Two drivers. One verdict.</h1></header>
          <StateView empty emptyTitle={`Not enough drivers published for ${year}`} emptyText="Comparisons unlock once at least two drivers have a classified result this season." />
        </>
      ) : (
        <>
          <FaceOff A={A} B={B} ca={ca} cb={cb} year={year} duel={res.value ? finishDuel(races, aId, bId) : null} />

          <Glass className="cmp-bar" role="group" aria-label="Choose drivers">
            <DriverPicker side="a" label="Driver A" value={aId} options={options} onChange={(id) => choose("a", id)} year={year} color={ca} />
            <button type="button" className="cmp-swap" onClick={swap} aria-label="Swap drivers"><ArrowLeftRight /></button>
            <DriverPicker side="b" label="Driver B" value={bId} options={options} onChange={(id) => choose("b", id)} year={year} color={cb} />
            <div className="cmp-bar-actions">
              <button type="button" className="btn glass-btn" onClick={share}><Link2 />Share</button>
            </div>
          </Glass>

          {res.loading ? (
            <Section><Skeleton h={560} r={28} /></Section>
          ) : res.error ? (
            <Section><StateView error={res.error} onRetry={res.reload} /></Section>
          ) : !races.some((r) => r.Results?.length) ? (
            <Section><StateView empty emptyTitle="No races completed yet" emptyText={`The ${year} head-to-head fills in after the first Grand Prix.`} /></Section>
          ) : (
            <>
              <StatsDuel A={A} B={B} ca={ca} cb={cb} races={races} qa={qa.value?.data} qb={qb.value?.data} qLoading={qa.loading || qb.loading} source={res.value} year={year} />
              <ChartsDuel A={A} B={B} ca={ca} cb={cb} races={races} progress={progress} metric={metric} setMetric={setMetric} season={year} />
              <RoundGrid A={A} B={B} ca={ca} cb={cb} races={races} />
              <GridReliability races={races} options={options} aId={aId} bId={bId} ca={ca} cb={cb} source={res.value} />
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div className="cmp-toast glass glass-strong" role="status" aria-live="polite"
            initial={{ opacity: 0, y: 24, scale: 0.96, x: "-50%" }} animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }} exit={{ opacity: 0, y: 16, scale: 0.98, x: "-50%" }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}>
            <span className="cmp-toast-icon"><Check size={15} /></span>{toast}
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}

/* ───────────────────────── Face-off hero ───────────────────────── */
function FaceOff({ A, B, ca, cb, year, duel }: { A: Option; B: Option; ca: string; cb: string; year: string; duel: { a: number; b: number; paired: number } | null }) {
  const ref = useParallax<HTMLElement>();
  return (
    <section ref={ref} className="cmp-hero" style={{ "--a": ca, "--b": cb } as CSSProperties}>
      <div className="cmp-hero-bg" aria-hidden><span className="cmp-half a" /><span className="cmp-half b" /><span className="cmp-seam" /></div>
      <h1 className="eyebrow cmp-eyebrow rise">Head to head · {year}<span className="sr-only">: {fullName(A.driver)} vs {fullName(B.driver)}</span></h1>
      <Fighter o={A} side="a" year={year} />
      <Fighter o={B} side="b" year={year} />
      <div className="cmp-vs rise" style={{ "--i": 2 } as CSSProperties}>
        <span className="cmp-vs-badge"><span>VS</span></span>
        {duel && duel.paired > 0 && (
          <span className="cmp-vs-score" aria-label={`Race finishes ahead: ${A.driver.familyName} ${duel.a}, ${B.driver.familyName} ${duel.b}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={"a" + duel.a + A.driver.driverId} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }}>{duel.a}</motion.b>
            </AnimatePresence>
            <i>–</i>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={"b" + duel.b + B.driver.driverId} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }}>{duel.b}</motion.b>
            </AnimatePresence>
            <small>Race finishes ahead</small>
          </span>
        )}
      </div>
    </section>
  );
}

function Fighter({ o, side, year }: { o: Option; side: "a" | "b"; year: string }) {
  const name = fullName(o.driver);
  const photo = !!driverMedia(o.driver.driverId, year)?.front;
  return (
    <div className={cx("cmp-fighter", side)}>
      <div className="cmp-figure" aria-hidden={!photo}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={o.driver.driverId} className="cmp-figure-inner"
            initial={{ opacity: 0, x: side === "a" ? -60 : 60, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: side === "a" ? -40 : 40, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}>
            {photo ? (
              <>
                <NumberArt id={o.driver.driverId} number={o.driver.permanentNumber} year={year} className="cmp-number" />
                <DriverPortrait id={o.driver.driverId} name={name} year={year} variant="front" eager className="cmp-photo" />
              </>
            ) : (
              <div className="cmp-mono">
                <span className="cmp-mono-num">{o.driver.permanentNumber || o.driver.code || ""}</span>
                <span className="cmp-mono-plate">{initials(name)}</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <Link to={"driver/" + o.driver.driverId} className="cmp-nameplate rise" style={{ "--i": 1 } as CSSProperties}>
        <span className="cmp-given"><Flag nationality={o.driver.nationality} />{o.driver.givenName}</span>
        <strong className="cmp-family">{o.driver.familyName}</strong>
        <span className="cmp-meta">
          {o.team && <><TeamLogo id={o.team.constructorId} name={o.team.name} year={year} size={22} variant="white" /><span>{teamShortName(o.team.name, year)}</span></>}
          {o.position && <span className="cmp-meta-pos">P{o.position} · {pts(o.points)} pts</span>}
        </span>
      </Link>
    </div>
  );
}

/* ───────────────────────── Driver picker (combobox) ───────────────────────── */
function DriverPicker({ side, label, value, options, onChange, year, color }: {
  side: "a" | "b"; label: string; value: string; options: Option[]; onChange: (id: string) => void; year: string; color: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const uid = useId().replace(/:/g, "");
  const current = options.find((o) => o.driver.driverId === value);
  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return options;
    return options.filter((o) => fold([fullName(o.driver), o.driver.code, o.driver.permanentNumber, o.team?.name].filter(Boolean).join(" ")).includes(needle));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, filtered.findIndex((o) => o.driver.driverId === value)));
    requestAnimationFrame(() => input.current?.focus());
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = (focus = true) => { setOpen(false); setQ(""); if (focus) trigger.current?.focus(); };
  const pick = (id: string) => { onChange(id); close(); };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(filtered.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const o = filtered[active]; if (o) pick(o.driver.driverId); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div className={cx("cmp-picker", side, open && "open")} ref={root} style={{ "--c": color } as CSSProperties}>
      <button ref={trigger} type="button" className="cmp-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current ? fullName(current.driver) : "none"}. Change driver`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); } }}>
        {current && <DriverAvatar id={current.driver.driverId} name={fullName(current.driver)} year={year} team={current.team?.constructorId} size={42} />}
        <span className="cmp-trigger-text">
          <small>{label}</small>
          <strong>{current ? fullName(current.driver) : "Choose a driver"}</strong>
        </span>
        <ChevronDown className="cmp-chev" size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="cmp-pop glass glass-strong" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ type: "spring", stiffness: 500, damping: 36 }}>
            <label className="cmp-pop-search">
              <Search size={16} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search drivers…"
                role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list" aria-label={`Search ${label}`}
                aria-activedescendant={filtered[active] ? `${uid}-${filtered[active].driver.driverId}` : undefined} />
            </label>
            <ul className="cmp-pop-list" role="listbox" id={`${uid}-list`} aria-label={label} ref={list}>
              {filtered.length ? filtered.map((o, i) => {
                const selected = o.driver.driverId === value;
                return (
                  <li key={o.driver.driverId} id={`${uid}-${o.driver.driverId}`} role="option" aria-selected={selected} data-index={i}
                    className={cx("cmp-opt", i === active && "active", selected && "selected")} style={{ "--tint": teamColor(o.team) } as CSSProperties}
                    onPointerEnter={() => setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o.driver.driverId)}>
                    <span className="cmp-opt-pos">{o.position ?? "–"}</span>
                    <DriverAvatar id={o.driver.driverId} name={fullName(o.driver)} year={year} team={o.team?.constructorId} size={32} />
                    <span className="cmp-opt-text"><strong>{fullName(o.driver)}</strong><small>{o.team ? teamShortName(o.team.name, year) : o.driver.nationality}</small></span>
                    <span className="cmp-opt-pts">{pts(o.points)}</span>
                    {selected && <Check size={16} className="cmp-opt-check" />}
                  </li>
                );
              }) : <li className="cmp-opt-empty" role="presentation">No drivers match “{q}”</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────── Stats duel ───────────────────────── */
function StatsDuel({ A, B, ca, cb, races, qa, qb, qLoading, source, year }: {
  A: Option; B: Option; ca: string; cb: string; races: Race[]; qa?: Race[]; qb?: Race[]; qLoading: boolean; source?: Parameters<typeof Source>[0]["value"]; year: string;
}) {
  const a = A.driver.driverId, b = B.driver.driverId;
  const duel = finishDuel(races, a, b);
  const q = qa && qb ? qualiDuel(qa, qb) : null;
  const sa = seasonStats(driverRaces(races, a).map((e) => e.result));
  const sb = seasonStats(driverRaces(races, b).map((e) => e.result));
  const hasStandings = A.position !== undefined || B.position !== undefined;
  const qDetail = qLoading ? "Loading qualifying…" : q?.paired ? `${plural(q.paired, "shared session")}` : "No qualifying data";
  const rows = [
    { label: "Race finishes ahead", detail: `${plural(duel.paired, "shared race")}`, a: duel.a, b: duel.b, icon: <FlagIcon /> },
    { label: "Qualifying ahead", detail: qDetail, a: q?.paired ? q.a : null, b: q?.paired ? q.b : null, icon: <Timer /> },
    { label: "Championship points", detail: hasStandings ? "Official standings" : "Grand Prix points", a: hasStandings ? A.points : sa.racePoints, b: hasStandings ? B.points : sb.racePoints, format: pts, icon: <Trophy /> },
    { label: "Wins", detail: "Grand Prix victories", a: sa.wins, b: sb.wins, icon: <Medal /> },
    { label: "Podiums", detail: "Top-three finishes", a: sa.podiums, b: sb.podiums, icon: <Medal /> },
    { label: "Poles", detail: qLoading ? "Loading qualifying…" : "Qualifying P1", a: qa && !qLoading ? poleCount(qa) : null, b: qb && !qLoading ? poleCount(qb) : null, icon: <Zap /> },
    { label: "Best finish", detail: "Lower is better", a: sa.best, b: sb.best, lower: true, format: (n: number) => "P" + n, icon: <TrendingUp /> },
    { label: "Average finish", detail: "Classified finishes", a: sa.avg, b: sb.avg, lower: true, format: (n: number) => "P" + n.toFixed(1), icon: <Gauge /> },
    { label: "Places gained", detail: "Grid to flag, net", a: sa.gained, b: sb.gained, format: (n: number) => (n > 0 ? "+" : "") + n, icon: <TrendingUp /> },
    { label: "DNFs", detail: "Fewer is better", a: sa.dnfs, b: sb.dnfs, lower: true, icon: <Zap /> },
  ];
  const tally = rows.reduce((t, r) => {
    if (r.a === null || r.b === null || r.a === r.b) return t;
    const aWins = r.lower ? r.a < r.b : r.a > r.b;
    return { a: t.a + (aWins ? 1 : 0), b: t.b + (aWins ? 0 : 1) };
  }, { a: 0, b: 0 });
  return (
    <Section title="The tale of the tape" subtitle={`${year} season. Each bar leans toward the stronger driver.`}>
      <Glass className="card cmp-tape reveal" style={{ "--a": ca, "--b": cb } as CSSProperties}>
        <div className="cmp-tape-head">
          <span className="cmp-tape-name a"><i />{A.driver.familyName}<b>{tally.a}</b></span>
          <span className="cmp-tape-mid">categories won</span>
          <span className="cmp-tape-name b"><b>{tally.b}</b>{B.driver.familyName}<i /></span>
        </div>
        {rows.map((r, i) => (
          <TugRow key={r.label} label={r.label} detail={r.detail} a={r.a} b={r.b} lower={r.lower} format={r.format} colorA={ca} colorB={cb} index={i} icon={r.icon} />
        ))}
      </Glass>
      <Source value={source} />
    </Section>
  );
}

/* ───────────────────────── Charts ───────────────────────── */
function ChartsDuel({ A, B, ca, cb, races, progress, metric, setMetric, season }: {
  A: Option; B: Option; ca: string; cb: string; races: Race[]; progress: ReturnType<typeof useSeasonProgress>; metric: Metric; setMetric: (m: Metric) => void; season: string;
}) {
  const p = progress.value?.data;
  const pa = p?.drivers.find((d) => d.driver.driverId === A.driver.driverId);
  const pb = p?.drivers.find((d) => d.driver.driverId === B.driver.driverId);
  const labels = (p?.rounds || []).map((r) => "R" + r.round);
  const title = (i: number) => p ? `Round ${p.rounds[i].round} · ${shortRace(p.rounds[i].raceName)}` : "";
  const perRound = (cum?: number[]) => (p?.rounds || []).map((_, i) => (cum ? (cum[i] ?? 0) - (i ? cum[i - 1] ?? 0 : 0) : 0));
  const gains = (id: string) => (p?.rounds || []).map((round) => {
    const r = races.find((x) => x.round === round.round)?.Results?.find((x) => x.Driver.driverId === id);
    return r && isClassified(r) && +r.grid > 0 ? +r.grid - +r.position : null;
  });
  const exportCSV = () => {
    if (!p) return;
    const ra = perRound(pa?.cumulative), rb = perRound(pb?.cumulative);
    download(`f1-pulse-${season}-${A.driver.driverId}-vs-${B.driver.driverId}.csv`, toCSV([
      ["Round", "Grand Prix", `${A.driver.familyName} finish`, `${B.driver.familyName} finish`, `${A.driver.familyName} points`, `${B.driver.familyName} points`, `${A.driver.familyName} cumulative`, `${B.driver.familyName} cumulative`],
      ...p.rounds.map((r, i) => [r.round, r.raceName, pa?.finish[i] ?? "", pb?.finish[i] ?? "", ra[i], rb[i], pa?.cumulative[i] ?? "", pb?.cumulative[i] ?? ""]),
    ]), "text/csv;charset=utf-8");
  };
  const mk = (va: (number | null)[], vb: (number | null)[]) => [
    { id: "a-" + A.driver.driverId, name: A.driver.familyName, color: ca, values: va },
    { id: "b-" + B.driver.driverId, name: B.driver.familyName, color: cb, values: vb, dashed: ca === cb },
  ];
  return (
    <Section title="Season story" subtitle="Race and sprint points by round. Hover or use arrow keys to scrub."
      action={<button className="btn sm" onClick={exportCSV} disabled={!p}><Download />Export CSV</button>}>
      <Glass className="card cmp-charts reveal" style={{ "--a": ca, "--b": cb } as CSSProperties}>
        <div className="cmp-charts-head">
          <Segmented label="Chart metric" options={METRICS} value={metric} onChange={setMetric} />
          <span className="cmp-key"><span><i style={{ background: ca }} />{A.driver.familyName}</span><span><i style={{ background: cb }} />{B.driver.familyName}</span></span>
        </div>
        {progress.loading ? <Skeleton h={340} r={22} /> : progress.error ? <StateView error={progress.error} onRetry={progress.reload} /> : !p?.rounds.length ? (
          <StateView empty emptyTitle="No rounds completed" />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={metric} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {metric === "cumulative" && (
                <>
                  <LineChart ariaLabel={`Cumulative points, ${A.driver.familyName} versus ${B.driver.familyName}`} series={mk(pa?.cumulative || [], pb?.cumulative || [])} labels={labels} area tooltipTitle={title} height={340} />
                  <p className="source">Summed from race and sprint classifications; later penalties may differ from the official table.</p>
                </>
              )}
              {metric === "position" && (
                <>
                  <LineChart ariaLabel={`Grand Prix finishing positions, ${A.driver.familyName} versus ${B.driver.familyName}`} series={mk(pa?.finish || [], pb?.finish || [])} labels={labels}
                    invert yMin={1} yMax={Math.max(20, ...[...(pa?.finish || []), ...(pb?.finish || [])].filter((v): v is number => v !== null))} step={5} yFormat={(v) => "P" + Math.round(v)} curve={false} tooltipTitle={title} height={340} />
                  <p className="source">Gaps mark rounds without a classified finish.</p>
                </>
              )}
              {metric === "delta" && <DeltaBars A={A} B={B} ca={ca} cb={cb} ra={perRound(pa?.cumulative)} rb={perRound(pb?.cumulative)} rounds={p.rounds} />}
              {metric === "gain" && (
                <>
                  <LineChart ariaLabel={`Places gained from grid to finish, ${A.driver.familyName} versus ${B.driver.familyName}`} series={mk(gains(A.driver.driverId), gains(B.driver.driverId))} labels={labels}
                    yFormat={(v) => (v > 0 ? "+" : "") + Math.round(v)} curve={false} tooltipTitle={title} height={340} />
                  <p className="source">Grid position minus finishing position, classified finishes only; pit-lane starts excluded.</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
        <ProgressNote progress={progress.value?.data} kind="driver" />
        <Source value={progress.value} />
      </Glass>
    </Section>
  );
}

function DeltaBars({ A, B, ca, cb, ra, rb, rounds }: { A: Option; B: Option; ca: string; cb: string; ra: number[]; rb: number[]; rounds: { round: string; raceName: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const deltas = ra.map((v, i) => v - (rb[i] || 0));
  const max = Math.max(1, ...deltas.map(Math.abs));
  const aRounds = deltas.filter((d) => d > 0).length, bRounds = deltas.filter((d) => d < 0).length;
  const h = hover ?? deltas.length - 1;
  return (
    <div className="cmp-delta" style={{ "--a": ca, "--b": cb } as CSSProperties}>
      <div className="cmp-delta-readout" aria-live="polite">
        <span className="faint">Round {rounds[h]?.round} · {shortRace(rounds[h]?.raceName || "")}</span>
        <strong>
          {deltas[h] === 0 ? "Level on points" : `${deltas[h] > 0 ? A.driver.familyName : B.driver.familyName} +${pts(Math.abs(deltas[h]))}`}
        </strong>
        <span className="small muted">{A.driver.familyName} {pts(ra[h] || 0)} · {B.driver.familyName} {pts(rb[h] || 0)}</span>
      </div>
      <div className="cmp-delta-plot" role="img" aria-label={`${A.driver.familyName} outscored ${B.driver.familyName} in ${aRounds} rounds; ${B.driver.familyName} outscored ${A.driver.familyName} in ${bRounds}.`}
        onPointerLeave={() => setHover(null)}>
        {deltas.map((d, i) => (
          <button key={i} type="button" className={cx("cmp-delta-col", hover === i && "on")} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            aria-label={`Round ${rounds[i].round}: ${A.driver.familyName} ${pts(ra[i])}, ${B.driver.familyName} ${pts(rb[i])}`}>
            <span className="cmp-delta-half up">{d > 0 && <motion.i initial={{ height: 0 }} animate={{ height: `${(d / max) * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 20, delay: i * 0.02 }} />}</span>
            <span className="cmp-delta-half down">{d < 0 && <motion.i initial={{ height: 0 }} animate={{ height: `${(-d / max) * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 20, delay: i * 0.02 }} />}</span>
            <small>{rounds[i].round}</small>
          </button>
        ))}
      </div>
      <p className="source">Bars rise when {A.driver.familyName} outscored {B.driver.familyName} in a round and fall when {B.driver.familyName} did · {A.driver.familyName} ahead in {plural(aRounds, "round")}, {B.driver.familyName} in {plural(bRounds, "round")}.</p>
    </div>
  );
}

/* ───────────────────────── Round-by-round grid ───────────────────────── */
function RoundGrid({ A, B, ca, cb, races }: { A: Option; B: Option; ca: string; cb: string; races: Race[] }) {
  const done = races.filter((r) => r.Results?.length);
  return (
    <Section title="Round by round" subtitle="Who finished ahead, every Grand Prix.">
      <Glass className="card cmp-rounds reveal" style={{ "--a": ca, "--b": cb } as CSSProperties}>
        <div className="cmp-rounds-names" aria-hidden><span className="a">{A.driver.code || A.driver.familyName.slice(0, 3).toUpperCase()}</span><span className="b">{B.driver.code || B.driver.familyName.slice(0, 3).toUpperCase()}</span></div>
        <ol className="cmp-rounds-list">
          {done.map((race) => {
            const x = race.Results?.find((r) => r.Driver.driverId === A.driver.driverId);
            const y = race.Results?.find((r) => r.Driver.driverId === B.driver.driverId);
            const win = x && y ? (+x.position < +y.position ? "a" : +y.position < +x.position ? "b" : null) : null;
            return (
              <li key={race.round}>
                <Link to={"race/" + race.round} className={cx("cmp-round", win && "w-" + win)} aria-label={`Round ${race.round}, ${race.raceName}: ${A.driver.familyName} ${finishDescription(x)}; ${B.driver.familyName} ${finishDescription(y)}`}>
                  <span className="cmp-round-top"><Flag country={race.Circuit.Location.country} />R{race.round}</span>
                  <span className={cx("fin-chip", finishTone(x), win === "a" && "lead")}>{finishLabel(x)}</span>
                  <span className={cx("fin-chip", finishTone(y), win === "b" && "lead")}>{finishLabel(y)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Glass>
    </Section>
  );
}

/* ───────────────────────── Grid reliability ───────────────────────── */
function GridReliability({ races, options, aId, bId, ca, cb, source }: { races: Race[]; options: Option[]; aId: string; bId: string; ca: string; cb: string; source?: Parameters<typeof Source>[0]["value"] }) {
  const rows = options
    .map((o) => ({ o, s: seasonStats(driverRaces(races, o.driver.driverId).map((e) => e.result)) }))
    .filter((r) => r.s.starts > 0)
    .sort((x, y) => x.s.dnfs / x.s.starts - y.s.dnfs / y.s.starts || (x.s.avg ?? 99) - (y.s.avg ?? 99));
  return (
    <Section title="Across the grid" subtitle="Finishing record for every driver this season. A non-classification isn't automatically a mechanical failure.">
      <Glass className="card flush reveal">
        <div className="table-wrap cmp-grid-wrap">
          <table className="tbl cmp-grid-tbl">
            <thead><tr><th>Driver</th><th className="r">Starts</th><th className="r">Classified</th><th className="r">DNFs</th><th>Finish rate</th><th className="r">Avg finish</th></tr></thead>
            <tbody>
              {rows.map(({ o, s }) => {
                const rate = s.starts ? s.classified / s.starts : 0;
                const mark = o.driver.driverId === aId ? ca : o.driver.driverId === bId ? cb : undefined;
                return (
                  <tr key={o.driver.driverId} className={cx(mark && "cmp-grid-sel")} style={mark ? ({ "--m": mark } as CSSProperties) : undefined}>
                    <td><Link to={"driver/" + o.driver.driverId} className="cmp-grid-driver"><span className="team-bar" style={{ "--tint": teamColor(o.team) } as CSSProperties} />{fullName(o.driver)}</Link></td>
                    <td className="r">{s.starts}</td>
                    <td className="r">{s.classified}</td>
                    <td className="r">{s.dnfs}</td>
                    <td><span className="cmp-rate"><span className="bar-track"><span className="bar-fill" style={{ width: `${rate * 100}%`, "--tint": teamColor(o.team) } as CSSProperties} /></span><b>{Math.round(rate * 100)}%</b></span></td>
                    <td className="r">{s.avg === null ? "—" : "P" + s.avg.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Glass>
      <Source value={source} />
    </Section>
  );
}
