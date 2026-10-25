import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, Heart, Search, Swords, Trophy, Users, X } from "lucide-react";
import { allResults, drivers, standings, useData } from "../api";
import { usePrefs } from "../app/prefs";
import { Link, setQuery, type Route } from "../lib/router";
import { driverMedia, fullName, teamColor, teamOf, teamShortName } from "../lib/media";
import { plural, pts } from "../lib/format";
import { Counter, Glass, Page, Section, Segmented, Skeleton, Source, StateView, Toggle, cx, useAmbient, useTitle } from "../ui/core";
import { DriverAvatar, DriverPortrait, Flag, NumberArt, TeamLogo } from "../ui/media";
import { DriverCard } from "../ui/cards";
import { useParallax } from "./_drivers";
import type { Driver, Race, Team } from "../types";
import "./drivers.css";

type Sort = "championship" | "name" | "number" | "team";
type Entry = { driver: Driver; team?: Team; position?: number; points: number; wins: number };
const SORTS: { value: Sort; label: string }[] = [
  { value: "championship", label: "Championship" },
  { value: "name", label: "Name" },
  { value: "number", label: "Number" },
  { value: "team", label: "Team" },
];
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const spring = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 } as const;

export default function Drivers({ route }: { route: Route }) {
  const { season, year, favorites } = usePrefs();
  useTitle("Drivers");
  const ds = useData(() => standings(season), [season]);
  const dl = useData(() => drivers(season), [season]);
  const initialSort = route.query.get("sort") as Sort | null;
  const [q, setQ] = useState(route.query.get("q") || "");
  const [sort, setSortState] = useState<Sort>(SORTS.some((s) => s.value === initialSort) ? initialSort! : "championship");
  const [group, setGroupState] = useState(route.query.get("view") === "teams");
  const [favOnly, setFavOnlyState] = useState(route.query.get("fav") === "1");
  const setSort = (v: Sort) => { setSortState(v); setQuery({ sort: v === "championship" ? null : v }); };
  const setGroup = (v: boolean) => { setGroupState(v); setQuery({ view: v ? "teams" : null }); };
  const setFavOnly = (v: boolean) => { setFavOnlyState(v); setQuery({ fav: v ? "1" : null }); };
  const search = (v: string) => { setQ(v); setQuery({ q: v.trim() || null }); };

  // Jolpica's Constructors list isn't chronological: when anyone changed team mid-season,
  // resolve current teams from the most recent race classification (one small request).
  const multiTeam = !!ds.value?.data.some((s) => s.Constructors.length > 1);
  const last = useData(() => (multiTeam ? allResults(season, "last") : Promise.resolve({ data: [] as Race[], meta: { source: "", url: "", fetchedAt: "", status: "" } })), [season, multiTeam]);
  const latest = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of last.value?.data.at(-1)?.Results || []) m.set(r.Driver.driverId, r.Constructor.constructorId);
    return m;
  }, [last.value]);

  const entries = useMemo(() => {
    const list: Entry[] = (ds.value?.data || []).map((s) => ({
      driver: s.Driver, team: teamOf(s, year, latest), position: +s.position || undefined, points: +s.points || 0, wins: +s.wins || 0,
    }));
    // Before any standings exist (or if they fail) the season's entry list stands in.
    if (!list.length) return (dl.value?.data || []).map((d): Entry => ({ driver: d, points: 0, wins: 0 }));
    return list;
  }, [ds.value, dl.value, latest, year]);
  /** Drivers in the season's entry data without a championship classification (e.g. practice-only outings). */
  const extras = useMemo(() => {
    if (!ds.value?.data.length) return [];
    const seen = new Set(ds.value.data.map((s) => s.Driver.driverId));
    return (dl.value?.data || []).filter((d) => !seen.has(d.driverId));
  }, [ds.value, dl.value]);

  const ranked = useMemo(() => entries.filter((e) => e.position).sort((a, b) => a.position! - b.position!), [entries]);
  useAmbient(teamColor(ranked[0]?.team), teamColor(ranked[1]?.team));

  const teamPoints = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.team) m.set(e.team.constructorId, (m.get(e.team.constructorId) || 0) + e.points);
    return m;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = fold(q.trim());
    const filtered = entries.filter((e) => {
      if (favOnly && !favorites.includes("driver:" + e.driver.driverId)) return false;
      if (!needle) return true;
      const hay = fold([fullName(e.driver), e.driver.code, e.driver.permanentNumber, e.driver.nationality, e.team?.name, e.team && teamShortName(e.team.name, year)].filter(Boolean).join(" "));
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const byPos = (a: Entry, b: Entry) => (a.position ?? 999) - (b.position ?? 999) || a.driver.familyName.localeCompare(b.driver.familyName);
    const cmp: Record<Sort, (a: Entry, b: Entry) => number> = {
      championship: byPos,
      name: (a, b) => a.driver.familyName.localeCompare(b.driver.familyName) || a.driver.givenName.localeCompare(b.driver.givenName),
      number: (a, b) => (+(a.driver.permanentNumber || 0) || 999) - (+(b.driver.permanentNumber || 0) || 999) || byPos(a, b),
      team: (a, b) =>
        (b.team ? teamPoints.get(b.team.constructorId) || 0 : -1) - (a.team ? teamPoints.get(a.team.constructorId) || 0 : -1) ||
        (a.team?.name || "~").localeCompare(b.team?.name || "~") || byPos(a, b),
    };
    return [...filtered].sort(cmp[sort]);
  }, [entries, q, favOnly, favorites, sort, teamPoints, year]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; team?: Team; entries: Entry[]; points: number }>();
    for (const e of visible) {
      const id = e.team?.constructorId || "_none";
      if (!m.has(id)) m.set(id, { id, team: e.team, entries: [], points: e.team ? teamPoints.get(id) || 0 : 0 });
      m.get(id)!.entries.push(e);
    }
    const list = [...m.values()];
    if (sort !== "team") list.forEach((g) => g.entries.sort((a, b) => (a.position ?? 999) - (b.position ?? 999)));
    return list.sort((a, b) => (a.id === "_none" ? 1 : b.id === "_none" ? -1 : sort === "name" ? (a.team?.name || "").localeCompare(b.team?.name || "") : b.points - a.points));
  }, [visible, teamPoints, sort]);

  const loading = ds.loading || dl.loading;
  const error = ds.error && dl.error ? ds.error : undefined;

  return (
    <Page className="drs">
      <GridHero entries={entries} ranked={ranked} year={year} loading={loading} />

      <Section className="drs-section">
        <Glass className="drs-toolbar" role="search">
          <label className="search-input drs-search">
            <Search />
            <input className="input" type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Name, team or number" aria-label="Search drivers" />
            {q && <button type="button" className="drs-clear" onClick={() => search("")} aria-label="Clear search"><X size={15} /></button>}
          </label>
          <Segmented label="Sort drivers by" options={SORTS} value={sort} onChange={setSort} />
          <div className="drs-switches">
            <label className="drs-switch"><Users size={15} /><span>By team</span><Toggle checked={group} onChange={setGroup} label="Group drivers by team" /></label>
            <label className="drs-switch"><Heart size={15} /><span>Favourites</span><Toggle checked={favOnly} onChange={setFavOnly} label="Show favourite drivers only" /></label>
          </div>
        </Glass>

        <p className="drs-count" role="status" aria-live="polite">
          {loading ? "Loading the grid…" : `${plural(visible.length, "driver")}${q || favOnly ? ` of ${entries.length}` : ""}${group ? ` · ${plural(groups.length, "team")}` : ""}`}
        </p>

        {ds.error && !dl.error && <p className="notice">Championship standings are unavailable right now, so ranks and points are hidden. {ds.error}</p>}

        {loading ? (
          <div className="drs-grid" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} r={28} style={{ aspectRatio: "3 / 4.1", height: "auto" }} />)}
          </div>
        ) : error ? (
          <StateView error={error} onRetry={() => { ds.reload(); dl.reload(); }} />
        ) : !entries.length ? (
          <StateView empty emptyTitle={`No drivers published for ${year} yet`} emptyText="The entry list appears here once the season's first classification is published." />
        ) : !visible.length ? (
          <Glass className="state drs-empty">
            {favOnly ? <Heart /> : <Search />}
            <h3>{favOnly && !q ? "No favourite drivers yet" : "No drivers match"}</h3>
            <p>{favOnly && !q ? "Tap the heart on any driver card to build your collection — it follows you across every season." : `Nothing on the ${year} grid matches “${q}”.`}</p>
            <div className="row">
              {q && <button className="btn sm" onClick={() => search("")}>Clear search</button>}
              {favOnly && <button className="btn sm" onClick={() => setFavOnly(false)}>Show all drivers</button>}
            </div>
          </Glass>
        ) : (
          <LayoutGroup>
            <AnimatePresence mode="wait" initial={false}>
              {group ? (
                <motion.div key="teams" className="drs-teams" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {groups.map((g, gi) => <TeamGroup key={g.id} group={g} year={year} index={gi} />)}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div key="grid" className="drs-grid" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {visible.map((e, i) => (
                      <motion.div key={e.driver.driverId} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>
                        <DriverCard driver={e.driver} team={e.team} year={year} rank={e.position} stat={ds.value ? pts(e.points) : undefined} statLabel="PTS" index={i} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </LayoutGroup>
        )}
        <Source value={ds.value || dl.value} />
      </Section>

      {extras.length > 0 && !favOnly && !q && (
        <Section title="Also entered" subtitle={`In the ${year} entry data without a championship classification — typically practice or reserve outings.`}>
          <Glass className="drs-extras reveal">
            {extras.map((d) => (
              <Link key={d.driverId} to={"driver/" + d.driverId} className="drs-extra">
                <DriverAvatar id={d.driverId} name={fullName(d)} year={year} size={34} />
                <span><strong>{fullName(d)}</strong><small>{[d.permanentNumber && "#" + d.permanentNumber, d.nationality].filter(Boolean).join(" · ")}</small></span>
              </Link>
            ))}
          </Glass>
        </Section>
      )}

      {ranked.length >= 2 && (
        <Section>
          <Link to={`compare?a=${ranked[0].driver.driverId}&b=${ranked[1].driver.driverId}`} className="drs-cta glass interactive reveal" style={{ "--c1": teamColor(ranked[0].team), "--c2": teamColor(ranked[1].team) } as CSSProperties}>
            <span className="drs-cta-icon"><Swords size={22} /></span>
            <span className="drs-cta-copy">
              <span className="eyebrow">Head to head</span>
              <strong>{ranked[0].driver.familyName} vs {ranked[1].driver.familyName} — or any two drivers you like.</strong>
              <small>Race finishes, qualifying duels, points and form, side by side.</small>
            </span>
            <ArrowRight className="drs-cta-arrow" />
          </Link>
        </Section>
      )}
    </Page>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function GridHero({ entries, ranked, year, loading }: { entries: Entry[]; ranked: Entry[]; year: string; loading: boolean }) {
  const ref = useParallax<HTMLElement>();
  const teams = new Set(entries.map((e) => e.team?.constructorId).filter(Boolean)).size;
  const winners = entries.filter((e) => e.wins > 0).length;
  const top = ranked.slice(0, 5);
  const withPhotos = top.filter((e) => driverMedia(e.driver.driverId, year)?.front);
  const collage = withPhotos.length >= 3;
  const c = (i: number, fallback: string) => (top[i] ? teamColor(top[i].team) : fallback);
  const leader = ranked[0];
  return (
    <section ref={ref} className={cx("drs-hero", collage ? "has-collage" : "is-type")} style={{ "--c1": c(0, "#e8002d"), "--c2": c(1, "#3671c6"), "--c3": c(2, "#ff8000") } as CSSProperties}>
      <div className="drs-hero-bg" aria-hidden>
        <span className="drs-hero-year">{year}</span>
      </div>
      <div className="drs-hero-copy">
        <span className="eyebrow drs-eyebrow rise"><span className="dot" />{year} World Championship</span>
        <h1 className="display drs-title rise" style={{ "--i": 1 } as CSSProperties}>
          The grid
          <span>{loading ? "Assembling the field…" : entries.length ? `${plural(entries.length, "driver")}, ${plural(teams, "team")}.` : "Awaiting the entry list."}</span>
        </h1>
        {!loading && entries.length > 0 && (
          <dl className="drs-stats rise" style={{ "--i": 2 } as CSSProperties}>
            <div><dt>Drivers</dt><dd><Counter value={entries.length} /></dd></div>
            <div><dt>Teams</dt><dd><Counter value={teams} /></dd></div>
            <div><dt>Race winners</dt><dd><Counter value={winners} /></dd></div>
            {leader && (
              <div className="drs-stat-leader">
                <dt><Trophy size={12} />Leader</dt>
                <dd><Link to={"driver/" + leader.driver.driverId}>{leader.driver.familyName}</Link><small>{pts(leader.points)} pts</small></dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {loading ? (
        <div className="drs-hero-art"><Skeleton h="80%" w="70%" r={30} style={{ margin: "auto", opacity: 0.4 }} /></div>
      ) : collage ? (
        <Collage top={top} year={year} />
      ) : ranked.length ? (
        <TypeStack top={ranked.slice(0, 3)} year={year} />
      ) : null}
    </section>
  );
}

const SLOT_ORDER = [3, 1, 0, 2, 4];
function Collage({ top, year }: { top: Entry[]; year: string }) {
  const order = SLOT_ORDER.filter((i) => top[i]).map((i) => top[i]);
  const mid = (order.length - 1) / 2;
  return (
    <div className="drs-hero-art drs-collage">
      {order.map((e, k) => {
        const slot = k - mid;
        const depth = Math.abs(slot);
        const name = fullName(e.driver);
        return (
          <Link
            key={e.driver.driverId}
            to={"driver/" + e.driver.driverId}
            className={cx("drs-fig", depth === 0 && "lead", depth >= 2 && "far")}
            style={{ "--slot": slot, "--depth": depth, "--tint": teamColor(e.team), "--d": k, zIndex: 10 - depth } as CSSProperties}
            aria-label={`P${e.position} ${name}, ${pts(e.points)} points`}
          >
            <span className="drs-fig-glow" />
            <NumberArt id={e.driver.driverId} number={e.driver.permanentNumber} year={year} className="drs-fig-num" />
            <DriverPortrait id={e.driver.driverId} name={name} year={year} variant="front" eager={depth === 0} className="drs-fig-photo" />
            <span className="drs-tag">
              <b>P{e.position}</b>
              <span>{e.driver.familyName}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function TypeStack({ top, year }: { top: Entry[]; year: string }) {
  return (
    <ol className="drs-hero-art drs-typestack">
      {top.map((e, i) => (
        <li key={e.driver.driverId} className="rise" style={{ "--i": i + 2, "--tint": teamColor(e.team) } as CSSProperties}>
          <Link to={"driver/" + e.driver.driverId} className="drs-type-row">
            <span className="drs-type-pos">{i + 1}</span>
            <span className="drs-type-name">
              <small><Flag nationality={e.driver.nationality} />{e.driver.givenName}{e.team ? ` · ${teamShortName(e.team.name, year)}` : ""}</small>
              <strong>{e.driver.familyName}</strong>
            </span>
            <span className="drs-type-pts"><b>{pts(e.points)}</b><small>pts</small></span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Team group ───────────────────────── */
function TeamGroup({ group, year, index }: { group: { id: string; team?: Team; entries: Entry[]; points: number }; year: string; index: number }) {
  const { team } = group;
  const tint = team ? teamColor(team) : "#8e8e99";
  return (
    <motion.section layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}
      className="drs-team glass" style={{ "--tint": tint, "--i": index % 6 } as CSSProperties} aria-label={team ? teamShortName(team.name, year) : "Team not published"}>
      <header className="drs-team-head">
        {team ? <TeamLogo id={team.constructorId} name={team.name} year={year} size={44} /> : <span className="drs-team-blank" aria-hidden><Users size={18} /></span>}
        <div className="drs-team-title">
          {team ? <Link to={"team/" + team.constructorId}><h3>{teamShortName(team.name, year)}</h3></Link> : <h3>Team not yet published</h3>}
          <small>{plural(group.entries.length, "driver")}{team ? ` · ${pts(group.points)} pts combined` : ""}</small>
        </div>
        {team && <Link to={"team/" + team.constructorId} className="icon-btn" aria-label={`${teamShortName(team.name, year)} team page`}><ArrowRight /></Link>}
      </header>
      <div className="drs-team-cards">
        <AnimatePresence mode="popLayout" initial={false}>
          {group.entries.map((e, i) => (
            <motion.div key={e.driver.driverId} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>
              <DriverCard driver={e.driver} team={e.team} year={year} rank={e.position} stat={pts(e.points)} statLabel="PTS" index={i} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
