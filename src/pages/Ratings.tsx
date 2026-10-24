import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Crown, FlaskConical, Gem, Info, Users } from "lucide-react";
import { Link, setQuery, type Route } from "../lib/router";
import { circuitMedia, teamColor } from "../lib/media";
import { ordinal, plural } from "../lib/format";
import { ERAS, useArchive, type Archive, type ArchiveBundle } from "../lib/archive";
import { Counter, Glass, Page, Section, Segmented, Source, cx, useAmbient, useTitle } from "../ui/core";
import { ArchiveError, ArchiveHero, ArchiveLoading, DriverPick, Face } from "./_archive-ui";
import { ModelBadge, PhotoFace } from "./_season";
import { careerRatings, eraRating, RATING_BASE, type DriverRating, type RatingSeason } from "../analytics-x.mjs";
import "./ratings.css";

type Scope = "all" | "active" | string;
type Metric = "career" | "peak";
const MINS = [15, 30, 60, 120];

export default function Ratings({ route }: { route: Route }) {
  useTitle("Career Ratings");
  useAmbient("#64d2ff", "#bf5af2");
  const a = useArchive();
  if (a.loading || (!a.value && !a.error)) return <Page className="rt"><ArchiveLoading progress={a.progress} /></Page>;
  if (a.error || !a.value) return <Page className="rt"><ArchiveError error={a.error || "Archive unavailable"} onRetry={a.reload} /></Page>;
  return <RatingsView bundle={a.value} route={route} />;
}

/* Scope-aware value of a driver: career / peak overall, or within an era. */
function scoped(r: DriverRating, scope: Scope, metric: Metric, latest: number) {
  if (scope === "all" || scope === "active") {
    if (scope === "active" && r.last !== latest) return null;
    return { value: metric === "career" ? r.career : r.peak, comparisons: r.comparisons, season: metric === "peak" ? r.peakSeason : null };
  }
  const era = ERAS.find((e) => e.id === scope)!;
  const inEra = r.seasons.filter((s) => s.season >= era.from && s.season <= era.to && s.comparisons > 0);
  if (!inEra.length) return null;
  const er = eraRating(r, era.from, era.to)!;
  if (metric === "career") return { value: er.rating, comparisons: er.comparisons, season: null };
  const pool = inEra.filter((s) => s.comparisons >= 6);
  const pk = (pool.length ? pool : inEra).reduce((b, s) => (s.raw > b.raw ? s : b));
  return { value: pk.rating, comparisons: er.comparisons, season: pk.season };
}

function RatingsView({ bundle, route }: { bundle: ArchiveBundle; route: Route }) {
  const { archive, envelope } = bundle;
  const model = useMemo(() => careerRatings(archive.races), [archive]);
  const latest = archive.seasons.at(-1)!;
  const byIdx = useMemo(() => new Map(model.drivers.map((d) => [d.d, d])), [model]);
  const [scope, setScope] = useState<Scope>(() => route.query.get("scope") || "all");
  const [metric, setMetric] = useState<Metric>(() => (route.query.get("metric") === "peak" ? "peak" : "career"));
  const [min, setMin] = useState(() => (MINS.includes(Number(route.query.get("min"))) ? Number(route.query.get("min")) : 30));
  const [sel, setSel] = useState<number | null>(() => {
    const q = archive.driverIndex.get(route.query.get("driver") || "");
    return q !== undefined && byIdx.has(q) ? q : model.drivers.find((d) => d.comparisons >= 30)?.d ?? null;
  });
  const [all, setAll] = useState(false);
  useEffect(() => {
    setQuery({ scope: scope === "all" ? null : scope, metric: metric === "career" ? null : metric, min: min === 30 ? null : String(min), driver: sel !== null ? archive.drivers[sel]?.id : null });
  }, [scope, metric, min, sel, archive]);

  const board = useMemo(() => model.drivers
    .map((r) => ({ r, s: scoped(r, scope, metric, latest) }))
    .filter((x): x is { r: DriverRating; s: NonNullable<ReturnType<typeof scoped>> } => !!x.s && x.s.comparisons >= (scope === "all" || scope === "active" ? min : Math.min(min, 30)))
    .sort((a, b) => b.s.value - a.s.value), [model, scope, metric, min, latest]);
  const shown = all ? board : board.slice(0, 25);
  const top = model.drivers.filter((d) => d.comparisons >= 30)[0];
  const hiConf = model.drivers.filter((d) => d.confidence === "high").length;
  const pick = (idx: number) => { setSel(idx); document.getElementById("driver")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <Page className="rt">
      <ArchiveHero
        className="rt-hero"
        eyebrow="Archive · Career ratings"
        icon={<Gem size={14} />}
        title="Career Ratings"
        accent="Same car, every era — a model"
        lede={<>Every driver since 1950 rated only against the teammates who drove the same car in the same race, then linked across eras through the drivers they shared garages with. Points systems, reliability and car advantage never enter the maths.</>}
        photo={circuitMedia("monza").hero}
        tint="#64d2ff"
        stats={[
          { label: "Drivers rated", value: <Counter value={model.drivers.length} /> },
          { label: "Teammate duels", value: <Counter value={model.comparisons} /> },
          { label: "High-confidence", value: <Counter value={hiConf} /> },
        ]}
        figure={top && <TopCard archive={archive} r={top} />}
      />
      <p className="notice rt-disclaimer reveal" role="note"><FlaskConical /><span><b>This is a statistical model, not a verdict.</b> Ratings measure how drivers finished against their teammates, nothing else. Read every number with its ± range — thin or one-sided teammate records produce wide, uncertain ratings.</span></p>

      <Section id="leaderboard" title={<>Leaderboard <ModelBadge>Model</ModelBadge></>} subtitle="Career = comparison-weighted average of season ratings; peak = best season with at least six teammate duels.">
        <Glass className="card flush reveal rt-board">
          <div className="rt-tools">
            <label className="field">
              <span>Scope</span>
              <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All time</option>
                <option value="active">Active ({latest})</option>
                {ERAS.filter((e) => e.id !== "all").map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </label>
            <div className="field"><span>Rating</span><Segmented label="Rating" value={metric} onChange={setMetric} options={[{ value: "career", label: "Career" }, { value: "peak", label: "Peak season" }]} /></div>
            <label className="field">
              <span>Min. duels</span>
              <select className="select" value={min} onChange={(e) => setMin(+e.target.value)}>
                {MINS.map((m) => <option key={m} value={m}>{m}+</option>)}
              </select>
            </label>
          </div>
          {board.length ? (
            <ol className="rt-list">
              {shown.map(({ r, s }, i) => {
                const d = archive.drivers[r.d];
                const ps = r.seasons.find((x) => x.season === (s.season ?? r.peakSeason));
                return (
                  <li key={r.d}>
                    <button type="button" className={cx("rt-row", sel === r.d && "on")} onClick={() => pick(r.d)} style={{ "--tint": teamColor(archive.teams[ps?.team ?? -1]?.id) } as CSSProperties} aria-label={`${d.name}: ${s.value} ± ${r.se}`}>
                      <span className={cx("pos", i < 3 && "p" + (i + 1))}>{i + 1}</span>
                      <Face archive={archive} idx={r.d} size={34} year={s.season ?? r.peakSeason} team={ps?.team} />
                      <span className="rt-row-name"><b>{d.name}</b><small>{r.first}–{r.last}{s.season ? ` · peak ${s.season}` : ""} · {plural(Math.round(s.comparisons), "duel")}</small></span>
                      <Whisker value={s.value} se={metric === "peak" && ps ? ps.se : r.se} />
                      <span className="rt-row-val"><b>{s.value}</b><small>±{metric === "peak" && ps ? ps.se : r.se}</small></span>
                      <span className={cx("rt-conf", r.confidence)} title={`${r.comparisons} teammate comparisons`}>{r.confidence}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted rt-empty">No driver in this scope has {min}+ teammate duels — lower the minimum.</p>}
          <div className="rt-foot">
            <span><Info size={13} />Bars show the rating with its 95% interval on a 1200–1900 scale; 1500 = an average driver. Confidence: high ≥120 duels, medium ≥40.{scope !== "all" && scope !== "active" ? " Era ratings use only seasons inside the era (minimum duels capped at 30)." : ""}</span>
            {board.length > 25 && <button className="btn sm plain" onClick={() => setAll((x) => !x)}>{all ? "Top 25" : `All ${board.length}`}</button>}
          </div>
        </Glass>
        <Source value={envelope} label="Race results" />
      </Section>

      <Section id="driver" title="Driver detail" subtitle="Season-by-season rating with its uncertainty band, and the teammate record behind it.">
        <div className="rt-pick"><DriverPick archive={archive} value={sel} onChange={(v) => v !== null && setSel(v)} label="Find a driver" /></div>
        {sel !== null && byIdx.get(sel) ? <DriverDetail archive={archive} r={byIdx.get(sel)!} byIdx={byIdx} rank={model.drivers.filter((d) => d.comparisons >= 30).findIndex((d) => d.d === sel)} /> : <p className="muted">This driver never finished a race alongside a classified teammate, so there is nothing to rate.</p>}
      </Section>

      <Section id="eras" title="Best of each era" subtitle="Top three by rating inside each era (at least 30 duels in it, or 15 for the shorter current era).">
        <div className="rt-eras">
          {ERAS.filter((e) => e.id !== "all").map((e, i) => {
            const list = model.drivers.map((r) => ({ r, er: eraRating(r, e.from, e.to) })).filter((x) => x.er && x.er.comparisons >= (e.to > 2030 ? 15 : 30)).sort((a, b) => b.er!.rating - a.er!.rating).slice(0, 3);
            return (
              <Glass key={e.id} className="card rt-era reveal" style={{ "--i": i } as CSSProperties}>
                <span className="eyebrow">{e.label}</span>
                <ol>
                  {list.map(({ r, er }, k) => (
                    <li key={r.d}><button type="button" onClick={() => pick(r.d)}><span className={cx("pos", "p" + (k + 1))}>{k + 1}</span><Face archive={archive} idx={r.d} size={30} year={Math.min(e.to, r.last)} /><span className="rt-row-name"><b>{archive.drivers[r.d].family}</b><small>{plural(Math.round(er!.comparisons), "duel")}</small></span><b className="rt-era-val">{er!.rating}</b></button></li>
                  ))}
                  {!list.length && <li className="muted small">Not enough teammate duels yet.</li>}
                </ol>
              </Glass>
            );
          })}
        </div>
      </Section>

      <Section id="method" title="How the model works" subtitle="Documented in full so you can disagree with it precisely.">
        <Glass className="card rt-method reveal">
          <ol>
            <li><b>Teammate duels.</b> In every Grand Prix, each pair of cars from the same constructor that both started and were classified is one duel: whoever finished ahead wins it. Retirements and disqualifications are skipped (they say more about the car than the driver). With k classified cars a duel weighs 1/(k − 1), so a driver never contributes more than one comparison per race — important in the 1950s, when one constructor could field five cars, including privateers.</li>
            <li><b>Bradley–Terry with drifting form.</b> Each driver gets one rating per season. The probability that A beats B is 1 / (1 + e<sup>−(r<sub>A</sub> − r<sub>B</sub>)</sup>). Ratings are fitted by maximising the likelihood of every duel minus two penalties: λ = 4 · (r<sub>season</sub> − r<sub>previous season</sub>)² / gap, so form evolves smoothly, and μ = 0.6 · r², which pulls thin records towards the average.</li>
            <li><b>One scale for every era.</b> Ratings only ever compare drivers in identical machinery, so points systems, car performance and reliability cancel out. Different garages and decades are linked by drivers who changed teams — a chain of shared cars from Fangio to today. Results are shown on an Elo-style scale: 1500 is average and +100 means winning about 64% of duels against a 1500 driver.</li>
            <li><b>Career, peak and confidence.</b> Career is the comparison-weighted mean of season ratings; peak is the best season with at least six duels. The ± range is a 95% interval from the curvature of the likelihood; confidence is high from 120 duels, medium from 40.</li>
          </ol>
          <h3 className="rt-h3">Caveats</h3>
          <ul>
            <li>A driver is judged by their teammates: a great driver beside another great driver rates lower than they deserve, and chains through few drivers can drift across decades.</li>
            <li>Finishing order includes team orders, strategy splits and unequal equipment within a team (number-one status was common for decades).</li>
            <li>Only classified finishes count, so frequent retirements shrink a record; qualifying, which isolates pace better, is not used because it is missing before 1994.</li>
            <li>Shared drives and same-constructor privateers in the early years make some 1950s duels imperfect.</li>
          </ul>
        </Glass>
        <Source value={envelope} label="Race results" />
      </Section>
    </Page>
  );
}

/* ───────────────────────── Pieces ───────────────────────── */
const LO = 1200, HI = 1900;
const pctOf = (v: number) => Math.max(0, Math.min(100, ((v - LO) / (HI - LO)) * 100));
function Whisker({ value, se }: { value: number; se: number }) {
  return (
    <span className="rt-whisker" aria-hidden>
      <i className="rt-whisker-mid" style={{ left: pctOf(RATING_BASE) + "%" }} />
      <i className="rt-whisker-ci" style={{ left: pctOf(value - se) + "%", width: pctOf(value + se) - pctOf(value - se) + "%" }} />
      <i className="rt-whisker-dot" style={{ left: pctOf(value) + "%" }} />
    </span>
  );
}

function TopCard({ archive, r }: { archive: Archive; r: DriverRating }) {
  const d = archive.drivers[r.d];
  const ps = r.seasons.find((s) => s.season === r.peakSeason);
  const team = archive.teams[ps?.team ?? -1];
  return (
    <div className="rt-top reveal" style={{ "--tint": teamColor(team?.id) } as CSSProperties}>
      <span className="rt-top-label"><Crown size={13} />Highest career rating</span>
      <PhotoFace id={d.id} name={d.name} year={String(r.peakSeason)} team={team?.id} size={124} />
      <strong>{d.name}</strong>
      <span className="rt-top-num">{r.career}<small>± {r.se}</small></span>
      <span className="rt-top-sub">{plural(Math.round(r.comparisons), "teammate duel")} · peak {r.peak} in {r.peakSeason}</span>
    </div>
  );
}

function DriverDetail({ archive, r, rank, byIdx }: { archive: Archive; r: DriverRating; rank: number; byIdx: Map<number, DriverRating> }) {
  const d = archive.drivers[r.d];
  const ps = r.seasons.find((s) => s.season === r.peakSeason);
  const team = archive.teams[ps?.team ?? -1];
  const mates = useMemo(() => teammates(archive, r, byIdx), [archive, r, byIdx]);
  return (
    <div className="rt-detail">
      <Glass className="card rt-id reveal" style={{ "--tint": teamColor(team?.id) } as CSSProperties}>
        <PhotoFace id={d.id} name={d.name} year={String(r.peakSeason)} team={team?.id} size={112} />
        <div className="rt-id-copy">
          <h3 className="title-2">{d.given} <b>{d.family}</b></h3>
          <p className="muted small">{r.first}–{r.last} · {plural(r.starts, "start")}{rank >= 0 ? ` · ${ordinal(rank + 1)} all-time (30+ duels)` : ""}</p>
          <Link to={"driver/" + d.id} className="btn sm glass-btn"><Users />Driver profile</Link>
        </div>
        <div className="rt-id-stats">
          <span><b>{r.career}</b>career ± {r.se}</span>
          <span><b>{r.peak}</b>peak · {r.peakSeason}</span>
          <span><b>{r.h2h === null ? "—" : Math.round(r.h2h * 100) + "%"}</b>duels won ({Math.round(r.wins)}–{Math.round(r.losses)})</span>
          <span><b>{r.share === null ? "—" : Math.round(r.share * 100) + "%"}</b>of team points</span>
          <span className={cx("rt-conf", r.confidence)}>{r.confidence} confidence</span>
        </div>
      </Glass>
      <Glass className="card reveal rt-curve-card">
        <div className="card-title"><h3>Rating by season</h3><ModelBadge>Model</ModelBadge></div>
        <RatingCurve archive={archive} r={r} />
        <p className="rt-note"><Info size={13} />Line = season rating; shaded band = 95% interval; dot size = number of teammate duels that season. Seasons without a classified teammate duel borrow strength from neighbouring years.</p>
      </Glass>
      {mates.length > 0 && (
        <Glass className="card flush reveal rt-mates">
          <div className="table-wrap">
            <table className="tbl">
              <caption className="sr-only">Head-to-head record against each teammate</caption>
              <thead><tr><th scope="col">Teammate</th><th scope="col" className="r">Seasons</th><th scope="col" className="r">Ahead</th><th scope="col" className="r">Behind</th><th scope="col" className="r">Their rating</th></tr></thead>
              <tbody>
                {mates.slice(0, 12).map((m) => (
                  <tr key={m.idx}>
                    <td><span className="sa-who"><Face archive={archive} idx={m.idx} size={26} year={m.last} /><span><b>{archive.drivers[m.idx].name}</b></span></span></td>
                    <td className="r faint">{m.first === m.last ? m.first : `${m.first}–${m.last}`}</td>
                    <td className="r"><b className={cx(m.ahead > m.behind && "rt-up")}>{m.ahead}</b></td>
                    <td className="r"><b className={cx(m.behind > m.ahead && "rt-down")}>{m.behind}</b></td>
                    <td className="r">{m.rating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rt-note pad"><Info size={13} />Classified finishes where both started for the same constructor.</p>
        </Glass>
      )}
    </div>
  );
}

/** Head-to-heads against every teammate (both classified, same constructor, same race). */
function teammates(archive: Archive, r: DriverRating, byIdx: Map<number, DriverRating>) {
  const out = new Map<number, { idx: number; ahead: number; behind: number; first: number; last: number; rating: number | null }>();
  for (const race of archive.races) {
    if (race.season < r.first || race.season > r.last) continue;
    const me = race.results.find((x) => x.d === r.d && x.pos !== null);
    if (!me) continue;
    for (const m of race.results) {
      if (m.d === r.d || m.c !== me.c || m.pos === null || m.pos === me.pos) continue;
      const e = out.get(m.d) || { idx: m.d, ahead: 0, behind: 0, first: race.season, last: race.season, rating: byIdx.get(m.d)?.career ?? null };
      if (me.pos! < m.pos) e.ahead++; else e.behind++;
      e.last = race.season;
      out.set(m.d, e);
    }
  }
  return [...out.values()].sort((a, b) => b.ahead + b.behind - (a.ahead + a.behind));
}

function RatingCurve({ archive, r }: { archive: Archive; r: DriverRating }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const list = r.seasons;
  const H = 280, pad = { l: 46, r: 14, t: 16, b: 28 };
  const w = Math.max(0, width - pad.l - pad.r), h = H - pad.t - pad.b;
  const lo = Math.min(1300, ...list.map((s) => s.rating - s.se)), hi = Math.max(1700, ...list.map((s) => s.rating + s.se));
  const y0 = Math.floor(lo / 100) * 100, y1 = Math.ceil(hi / 100) * 100;
  const first = list[0].season, last = list.at(-1)!.season;
  const span = Math.max(1, last - first);
  const x = (season: number) => pad.l + (last === first ? w / 2 : ((season - first) / span) * w);
  const y = (v: number) => pad.t + h - ((v - y0) / (y1 - y0)) * h;
  const ticks: number[] = [];
  for (let v = y0; v <= y1; v += 100) ticks.push(v);
  const line = list.map((s, i) => `${i ? "L" : "M"}${x(s.season).toFixed(1)},${y(s.rating).toFixed(1)}`).join("");
  const band = list.map((s, i) => `${i ? "L" : "M"}${x(s.season).toFixed(1)},${y(s.rating + s.se).toFixed(1)}`).join("") + [...list].reverse().map((s) => `L${x(s.season).toFixed(1)},${y(s.rating - s.se).toFixed(1)}`).join("") + "Z";
  const maxC = Math.max(1, ...list.map((s) => s.comparisons));
  const every = Math.max(1, Math.ceil(list.length / Math.max(2, Math.floor(w / 46))));
  const hs: RatingSeason | undefined = hover !== null ? list[hover] : undefined;
  const team = (s: RatingSeason) => archive.teams[s.team];
  const pick = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const season = first + ((clientX - rect.left - pad.l) / (w || 1)) * span;
    let best = 0;
    list.forEach((s, i) => { if (Math.abs(s.season - season) < Math.abs(list[best].season - season)) best = i; });
    setHover(best);
  };
  return (
    <div ref={ref} className="chart rt-curve" style={{ height: H }} tabIndex={0} role="img"
      aria-label={`${archive.drivers[r.d].name}'s rating by season, from ${list[0].rating} in ${first} to ${list.at(-1)!.rating} in ${last}; peak ${r.peak} in ${r.peakSeason}`}
      onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setHover((v) => Math.max(0, Math.min(list.length - 1, (v ?? (e.key === "ArrowRight" ? -1 : list.length)) + (e.key === "ArrowRight" ? 1 : -1)))); }
        if (e.key === "Escape") setHover(null);
      }}>
      {width > 0 && (
        <svg width={width} height={H} aria-hidden>
          {ticks.map((v) => (
            <g key={v}>
              <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} />
              <text className="axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          <line className="rt-avg" x1={pad.l} x2={pad.l + w} y1={y(RATING_BASE)} y2={y(RATING_BASE)} />
          <text className="axis rt-avg-label" x={pad.l + w} y={y(RATING_BASE) - 5} textAnchor="end">average</text>
          {list.map((s, i) => (i % every === 0 || i === list.length - 1 ? <text key={s.season} className="axis" x={x(s.season)} y={H - 8} textAnchor="middle">{s.season}</text> : null))}
          <path d={band} className="rt-band" />
          <path d={line} className="rt-line" />
          {list.map((s, i) => (
            <circle key={s.season} cx={x(s.season)} cy={y(s.rating)} r={s.comparisons > 0 ? 3.5 + 5 * Math.sqrt(s.comparisons / maxC) : 3} className={cx("rt-dot", s.comparisons === 0 && "hollow", hover === i && "on")} style={{ "--tint": teamColor(team(s)?.id) } as CSSProperties} />
          ))}
          {hover !== null && <line className="cursor" x1={x(list[hover].season)} x2={x(list[hover].season)} y1={pad.t} y2={pad.t + h} />}
        </svg>
      )}
      {hs && (
        <div className="tooltip glass glass-strong" style={{ left: Math.min(Math.max(x(hs.season), 110), width - 110), top: Math.max(60, y(hs.rating + hs.se)) }}>
          <div className="t-title">{hs.season} · {team(hs)?.name || "—"}</div>
          <div className="t-row"><span>Rating</span><b>{hs.rating} ± {hs.se}</b></div>
          <div className="t-row"><span>Duels won</span><b>{Math.round(hs.wins * 10) / 10} – {Math.round(hs.losses * 10) / 10}</b></div>
          <div className="t-row"><span>Team points share</span><b>{hs.share === null ? "—" : Math.round(hs.share * 100) + "%"}</b></div>
          <div className="t-row"><span>Starts</span><b>{hs.starts}</b></div>
        </div>
      )}
    </div>
  );
}

