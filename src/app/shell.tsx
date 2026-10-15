import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Search, Sun, Moon, Heart, ChevronDown, Home, CalendarDays, Trophy, Users, Shield, MapPin, FlaskConical,
  Newspaper, Settings, ArrowLeftRight, Gauge, PlayCircle, GitBranch, Sparkles, X, CornerDownLeft, MoreHorizontal, ArrowUpRight,
  Library, Medal, CalendarClock, Swords, Baby, Scale, Network, BookOpen, LineChart, Target, Wind, Link2, History,
} from "lucide-react";
import { usePrefs } from "./prefs";
import { Link, useHref, type Route } from "../lib/router";
import { seasonHref, validSeason } from "../domain.mjs";
import { drivers, races, teams, useData } from "../api";
import { circuitMedia, fullName, teamShortName } from "../lib/media";
import { DriverAvatar, Flag, TeamLogo } from "../ui/media";
import { copyText, cx, Img, useMedia } from "../ui/core";

type NavItem = { id: string; label: string; icon: typeof Home; match?: string[]; description?: string };
export const primaryNav: NavItem[] = [
  { id: "", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays, match: ["race"] },
  { id: "standings", label: "Standings", icon: Trophy },
  { id: "drivers", label: "Drivers", icon: Users, match: ["driver"] },
  { id: "teams", label: "Teams", icon: Shield, match: ["team"] },
  { id: "circuits", label: "Circuits", icon: MapPin, match: ["circuit"] },
];
export const labNav: NavItem[] = [
  { id: "compare", label: "Head to Head", icon: ArrowLeftRight, description: "Two drivers, one season, every metric." },
  { id: "telemetry", label: "Telemetry", icon: Gauge, description: "Speed, throttle and brake traces, lap by lap." },
  { id: "replay", label: "Race Replay", icon: PlayCircle, description: "Watch archived laps unfold on the circuit." },
  { id: "strategy", label: "Strategy", icon: GitBranch, description: "Model one- and two-stop races." },
  { id: "scenarios", label: "Title Maths", icon: Sparkles, description: "What it takes to win the championship." },
  { id: "insights", label: "Insights", icon: LineChart, description: "Form, consistency, reliability and pace analytics." },
  { id: "predict", label: "Predict", icon: Target, description: "Call the podium before every race." },
];
export const archiveNav: NavItem[] = [
  { id: "records", label: "Record Book", icon: Medal, description: "Every all-time record since 1950." },
  { id: "on-this-day", label: "On This Day", icon: CalendarClock, description: "Races, wins and debuts on today's date." },
  { id: "rivalry", label: "Rivalries", icon: Swords, description: "Career head-to-heads, across every season." },
  { id: "rookies", label: "Rookies", icon: Baby, description: "First seasons compared across the eras." },
  { id: "eras", label: "Across Eras", icon: Scale, description: "Seasons rescored on today's points system." },
  { id: "lineage", label: "Team Lineage", icon: Network, description: "How today's teams descend from the past." },
  { id: "story", label: "Season Story", icon: BookOpen, description: "Relive any season, round by round." },
];
const moreNav: NavItem[] = [
  { id: "news", label: "News", icon: Newspaper },
  { id: "favorites", label: "Favourites", icon: Heart },
  { id: "settings", label: "Settings", icon: Settings },
];

const isActive = (item: NavItem, section: string) => section === item.id || !!item.match?.includes(section);

function SeasonPicker({ compact }: { compact?: boolean }) {
  const { season, setSeason } = usePrefs();
  const now = new Date().getFullYear();
  return (
    <label className={cx("season-pill", compact && "compact")}>
      <span className="sr-only">Season</span>
      <select
        value={season}
        onChange={(e) => {
          const value = e.target.value;
          setSeason(value);
          const [path, search = ""] = location.hash.replace(/^#\/?/, "").split("?");
          const q = new URLSearchParams(search);
          q.set("season", value);
          location.hash = "#/" + path + "?" + q;
        }}
      >
        <option value="current">{now}</option>
        {Array.from({ length: now - 1950 }, (_, i) => String(now - 1 - i)).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}

function NavMenu({ section, items, label, icon: Icon, eyebrow, id }: { section: string; items: NavItem[]; label: string; icon: typeof Home; eyebrow: string; id: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.some((i) => i.id === section);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => setOpen(false), [section]);
  return (
    <div className={cx("lab", `menu-${id}`)} ref={ref} onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}>
      <button className={cx("nav-link", active && "active")} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
        <Icon size={15} />{label}<ChevronDown size={13} className={cx("chev", open && "open")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={cx("lab-menu glass glass-strong", items.length > 5 && "wide")}
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
          >
            <span className="eyebrow">{eyebrow}</span>
            {items.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                <Link to={item.id} className={cx("lab-item", section === item.id && "active")}>
                  <span className="lab-icon"><item.icon size={18} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopNav({ section, onSearch }: { section: string; onSearch: () => void }) {
  const { theme, setTheme, favorites } = usePrefs();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 24);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cx("topnav", scrolled && "scrolled")}>
      <nav className="nav-capsule glass glass-strong" aria-label="Primary">
        <Link to="" className="brand" aria-label="F1 Pulse home">
          <span className="f1-mark" aria-hidden />
          <span className="brand-word">Pulse</span>
        </Link>
        <div className="nav-links">
          {primaryNav.map((item) => (
            <Link key={item.id} to={item.id} className={cx("nav-link", isActive(item, section) && "active")} aria-current={isActive(item, section) ? "page" : undefined}>
              {isActive(item, section) && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
              {item.label}
            </Link>
          ))}
          <NavMenu id="lab" section={section} items={labNav} label="Lab" icon={FlaskConical} eyebrow="The Lab · data tools" />
          <NavMenu id="archive" section={section} items={archiveNav} label="Archive" icon={Library} eyebrow="The Archive · 1950 to today" />
          <Link to="news" className={cx("nav-link", section === "news" && "active")}>
            {section === "news" && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            News
          </Link>
        </div>
        <div className="nav-tools">
          <button className="search-trigger" onClick={onSearch} aria-label="Search (Ctrl K)">
            <Search size={16} /><span>Search</span><kbd className="kbd">⌘K</kbd>
          </button>
          <SeasonPicker />
          <Link to="favorites" className={cx("icon-btn", section === "favorites" && "active")} aria-label={`Favourites (${favorites.length})`}>
            <Heart size={18} fill={favorites.length ? "currentColor" : "none"} />
            {favorites.length > 0 && <span className="badge-count">{favorites.length}</span>}
          </Link>
          <button className="icon-btn theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} style={{ display: "grid" }}>
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </motion.span>
            </AnimatePresence>
          </button>
          <Link to="settings" className={cx("icon-btn settings-btn", section === "settings" && "active")} aria-label="Settings"><Settings size={18} /></Link>
        </div>
      </nav>
    </header>
  );
}

/** iOS-style floating tab bar for phones. */
export function TabBar({ section }: { section: string }) {
  const [more, setMore] = useState(false);
  const tabs = primaryNav.slice(0, 4);
  const inMore = !tabs.some((t) => isActive(t, section));
  useEffect(() => setMore(false), [section]);
  useEffect(() => {
    if (!more) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = old; document.removeEventListener("keydown", esc); };
  }, [more]);
  return (
    <>
      <nav className="tabbar glass glass-strong" aria-label="Primary">
        {tabs.map((t) => (
          <Link key={t.id} to={t.id} className={cx("tab", isActive(t, section) && "active")} aria-current={isActive(t, section) ? "page" : undefined}>
            {isActive(t, section) && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", stiffness: 450, damping: 34 }} />}
            <t.icon size={21} strokeWidth={isActive(t, section) ? 2.4 : 1.9} />
            <span>{t.label}</span>
          </Link>
        ))}
        <button className={cx("tab", (inMore || more) && "active")} onClick={() => setMore((m) => !m)} aria-expanded={more} aria-label="More sections">
          {inMore && !more && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", stiffness: 450, damping: 34 }} />}
          <MoreHorizontal size={21} />
          <span>More</span>
        </button>
      </nav>
      <AnimatePresence>
        {more && (
          <>
            <motion.button className="backdrop" aria-label="Close menu" onClick={() => setMore(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="sheet glass glass-strong"
              role="dialog"
              aria-modal="true"
              aria-label="More sections"
              initial={{ y: "105%" }}
              animate={{ y: 0 }}
              exit={{ y: "105%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) setMore(false); }}
            >
              <span className="grabber" aria-hidden />
              <div className="sheet-head">
                <strong>Explore</strong>
                <SeasonPicker compact />
              </div>
              <div className="sheet-grid">
                {[...primaryNav.slice(4), ...moreNav].map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
                    <Link to={item.id} className={cx("sheet-tile", isActive(item, section) && "active")}>
                      <item.icon size={22} />{item.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
              <span className="eyebrow" style={{ margin: "18px 4px 8px" }}>The Lab</span>
              <div className="sheet-list">
                {labNav.map((item) => (
                  <Link key={item.id} to={item.id} className={cx("lab-item", section === item.id && "active")}>
                    <span className="lab-icon"><item.icon size={18} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </Link>
                ))}
              </div>
              <span className="eyebrow" style={{ margin: "18px 4px 8px" }}>The Archive</span>
              <div className="sheet-list">
                {archiveNav.map((item) => (
                  <Link key={item.id} to={item.id} className={cx("lab-item", section === item.id && "active")}>
                    <span className="lab-icon archive"><item.icon size={18} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────────────────────── Command palette ───────────────────────── */
type Group = "Actions" | "Recent" | "Drivers" | "Teams" | "Races" | "Circuits" | "Pages" | "Lab" | "Archive";
const GROUP_ORDER: Group[] = ["Actions", "Recent", "Drivers", "Teams", "Races", "Circuits", "Pages", "Lab", "Archive"];
const GROUP_CAP: Partial<Record<Group, number>> = { Recent: 6, Drivers: 6, Teams: 5, Races: 5, Circuits: 4, Pages: 6, Lab: 7, Archive: 7 };
type RecentKind = "driver" | "team" | "race" | "circuit" | "page";
type RecentEntry = { to: string; kind: RecentKind; label?: string; detail?: string; circuit?: string; country?: string; at: number };
type Hit = {
  key: string; group: Group; label: string; detail?: string; to?: string; run?: () => void;
  visual?: ReactNode; keywords?: string; kind?: string; recent?: Omit<RecentEntry, "at">;
};

const RECENT_KEY = "pulse-palette-recent";
function readRecent(): RecentEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.to === "string" && e.to && typeof e.kind === "string").slice(0, 8) : [];
  } catch { return []; }
}
function pushRecent(entry: Omit<RecentEntry, "at">) {
  if (!entry.to) return;
  try {
    const list = readRecent();
    const old = list.find((e) => e.to === entry.to);
    const fresh = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
    const merged = { ...old, ...fresh, at: Date.now() } as RecentEntry;
    localStorage.setItem(RECENT_KEY, JSON.stringify([merged, ...list.filter((e) => e.to !== entry.to)].slice(0, 8)));
  } catch { /* storage unavailable */ }
}
const prettyId = (id: string) => id.split(/[_-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const allNav = () => [...primaryNav, ...labNav, ...archiveNav, ...moreNav];

/** Remember profile / race / circuit visits so they show up as "Recent" in the palette. */
function useVisitLog(route: Route | null) {
  useEffect(() => {
    if (!route) return;
    const [kind, id] = route.parts;
    if (!id) return;
    if (kind === "driver" || kind === "team" || kind === "circuit") pushRecent({ to: `${kind}/${id}`, kind });
    else if (kind === "race") {
      const season = route.query.get("season");
      pushRecent({ to: `race/${id}${season && season !== "current" ? `?season=${season}` : ""}`, kind: "race" });
    }
  }, [route?.path]); // eslint-disable-line react-hooks/exhaustive-deps
}

function CircuitThumb({ id, country, size = 34 }: { id?: string; country?: string; size?: number }) {
  const hero = id ? circuitMedia(id).hero : undefined;
  return (
    <span className="hit-photo" style={{ width: size, height: size }}>
      {hero ? <Img src={hero} alt="" /> : <MapPin size={16} />}
      {country && <Flag country={country} className="hit-flag" />}
    </span>
  );
}

export function CommandPalette({ open, onClose, route }: { open: boolean; onClose: () => void; route?: Route }) {
  useVisitLog(route ?? null);
  return (
    <AnimatePresence>
      {open && <Palette onClose={onClose} />}
    </AnimatePresence>
  );
}

function score(h: Hit, needle: string) {
  const label = h.label.toLowerCase();
  const hay = (h.label + " " + (h.keywords || "") + " " + (h.detail || "")).toLowerCase();
  if (label.startsWith(needle)) return 4;
  if (hay.split(/\s+/).some((w) => w.startsWith(needle))) return 3;
  if (hay.includes(needle)) return 2;
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { season, year, setSeason, theme, setTheme, reducedMotion, setReducedMotion } = usePrefs();
  const href = useHref();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [recent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ds = useData(() => drivers(season), [season]);
  const ts = useData(() => teams(season), [season]);
  const rs = useData(() => races(season), [season]);
  const narrow = useMedia("(max-width: 720px)");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; previous?.focus?.(); };
  }, []);

  const groups = useMemo(() => {
    const driverList = ds.value?.data || [];
    const teamList = ts.value?.data || [];
    const raceList = rs.value?.data || [];
    const navVisual = (n: NavItem) => <span className={cx("hit-icon", archiveNav.includes(n) && "archive", labNav.includes(n) && "lab")}><n.icon size={17} /></span>;
    const pages: Hit[] = allNav().map((n) => ({
      key: "nav:" + n.id, group: labNav.includes(n) ? "Lab" : archiveNav.includes(n) ? "Archive" : "Pages",
      label: n.label, detail: n.description, to: n.id, visual: navVisual(n), kind: "Page", recent: { to: n.id, kind: "page", label: n.label },
    }));
    const driverHits: Hit[] = driverList.map((d) => ({
      key: "d:" + d.driverId, group: "Drivers", label: fullName(d), kind: "Driver",
      detail: [d.permanentNumber && "#" + d.permanentNumber, d.nationality].filter(Boolean).join(" · "), to: "driver/" + d.driverId,
      keywords: d.code, visual: <DriverAvatar id={d.driverId} name={fullName(d)} year={year} size={34} />,
      recent: { to: "driver/" + d.driverId, kind: "driver", label: fullName(d), detail: d.nationality },
    }));
    const teamHits: Hit[] = teamList.map((t) => ({
      key: "t:" + t.constructorId, group: "Teams", label: teamShortName(t.name, year), detail: t.nationality, to: "team/" + t.constructorId, kind: "Team",
      keywords: t.name, visual: <TeamLogo id={t.constructorId} name={t.name} year={year} size={34} />,
      recent: { to: "team/" + t.constructorId, kind: "team", label: teamShortName(t.name, year), detail: t.nationality },
    }));
    const raceHits: Hit[] = raceList.map((r) => ({
      key: "r:" + r.round, group: "Races", label: r.raceName, kind: "Race", detail: `${r.season} · Round ${r.round} · ${r.Circuit.Location.locality}`,
      to: "race/" + r.round, keywords: r.Circuit.Location.country,
      visual: <CircuitThumb id={r.Circuit.circuitId} country={r.Circuit.Location.country} />,
      recent: { to: `race/${r.round}${season === "current" ? "" : `?season=${r.season}`}`, kind: "race", label: r.raceName, detail: `${r.season} · Round ${r.round}`, circuit: r.Circuit.circuitId, country: r.Circuit.Location.country },
    }));
    const circuitHits: Hit[] = raceList.map((r) => ({
      key: "c:" + r.Circuit.circuitId, group: "Circuits", label: r.Circuit.circuitName, kind: "Circuit",
      detail: r.Circuit.Location.locality + ", " + r.Circuit.Location.country, to: "circuit/" + r.Circuit.circuitId,
      keywords: r.Circuit.Location.country, visual: <CircuitThumb id={r.Circuit.circuitId} />,
      recent: { to: "circuit/" + r.Circuit.circuitId, kind: "circuit", label: r.Circuit.circuitName, detail: r.Circuit.Location.country, circuit: r.Circuit.circuitId },
    }));

    const actions: Hit[] = [
      {
        key: "a:theme", group: "Actions", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode", kind: "Action",
        detail: "Toggle theme", keywords: "toggle theme dark light mode appearance colour color",
        visual: <span className="hit-icon action">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</span>,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        key: "a:motion", group: "Actions", label: reducedMotion ? "Allow full motion" : "Reduce motion", kind: "Action",
        detail: reducedMotion ? "Animations are currently reduced" : "Calmer transitions, no parallax", keywords: "reduce motion animation accessibility a11y calm",
        visual: <span className="hit-icon action"><Wind size={17} /></span>,
        run: () => setReducedMotion(!reducedMotion),
      },
      {
        key: "a:copy", group: "Actions", label: "Copy link to this page", kind: "Action", detail: "Share exactly what you're looking at",
        keywords: "copy share link url", visual: <span className="hit-icon action"><Link2 size={17} /></span>,
        run: () => { void copyText(location.href); },
      },
    ];

    const needle = q.trim().toLowerCase();
    const out: Hit[] = [];
    if (!needle) {
      out.push(...actions.slice(0, 2));
      const lookup = new Map([...driverHits, ...teamHits, ...raceHits, ...circuitHits].map((h) => [h.recent!.to, h] as const));
      for (const e of recent) {
        const known = lookup.get(e.to);
        const id = e.to.split("?")[0].split("/")[1] || "";
        const nav = e.kind === "page" ? allNav().find((x) => x.id === e.to) : undefined;
        if (e.kind === "page" && !nav) continue;
        const label = known?.label || e.label || nav?.label || (e.kind === "race" ? `Round ${id}` : prettyId(id));
        const visual =
          e.kind === "driver" ? <DriverAvatar id={id} name={label} year={year} size={34} /> :
          e.kind === "team" ? <TeamLogo id={id} name={label} year={year} size={34} /> :
          nav ? navVisual(nav) :
          <CircuitThumb id={e.circuit || (e.kind === "circuit" ? id : undefined)} country={e.country} />;
        const { at: _at, ...entry } = e;
        out.push({ key: "recent:" + e.to, group: "Recent", label, detail: known?.detail || e.detail || prettyId(e.kind), to: e.to, visual, kind: prettyId(e.kind), recent: entry });
      }
      out.push(...pages.filter((p) => p.group !== "Pages" || primaryNav.some((x) => "nav:" + x.id === p.key)));
    } else {
      // "leclerc vs hamilton" → head-to-head
      const versus = needle.match(/^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+)$/);
      if (versus) {
        const find = (term: string) => {
          const t = term.trim();
          const ranked = driverList
            .map((d) => {
              const fam = d.familyName.toLowerCase(), full = fullName(d).toLowerCase();
              const s = d.code?.toLowerCase() === t || fam === t ? 4 : fam.startsWith(t) ? 3 : full.includes(t) ? 2 : d.driverId.includes(t.replace(/\s+/g, "_")) ? 1 : 0;
              return { d, s };
            })
            .filter((x) => x.s)
            .sort((a, b) => b.s - a.s);
          return ranked[0]?.d;
        };
        const a = find(versus[1]), b = find(versus[2]);
        if (a && b && a.driverId !== b.driverId)
          out.push({
            key: "a:vs", group: "Actions", label: `Compare ${a.familyName} vs ${b.familyName}`, kind: "Head to Head", detail: `${year} season · every metric, side by side`,
            to: `compare?a=${a.driverId}&b=${b.driverId}`,
            visual: <span className="hit-duo"><DriverAvatar id={a.driverId} name={fullName(a)} year={year} size={28} /><DriverAvatar id={b.driverId} name={fullName(b)} year={year} size={28} /></span>,
          });
        else
          out.push({ key: "a:vs-open", group: "Actions", label: "Open Head to Head", kind: "Lab", detail: `No ${year} driver matched “${!a ? versus[1] : versus[2]}” — pick both drivers there`, to: "compare", visual: <span className="hit-icon lab"><ArrowLeftRight size={17} /></span> });
      }
      // "1988", "go to 1988", "season 1988"
      const yearMatch = needle.match(/^(?:go\s*to\s+|season\s+|open\s+|jump\s*to\s+)?(\d{4})$/);
      if (yearMatch && validSeason(yearMatch[1])) {
        const y = yearMatch[1];
        const jump = (page: string) => () => { setSeason(y); location.hash = seasonHref(page, y); };
        out.push(
          { key: "y:standings", group: "Actions", label: `Go to ${y}`, detail: "Standings, champions and the title fight", kind: "Season", run: jump("standings"), visual: <span className="hit-icon action"><Trophy size={17} /></span> },
          { key: "y:calendar", group: "Actions", label: `${y} calendar & results`, detail: "Every round of the season", kind: "Season", run: jump("calendar"), visual: <span className="hit-icon action"><CalendarDays size={17} /></span> },
          { key: "y:story", group: "Actions", label: `${y} season story`, detail: "Relive it round by round", kind: "Archive", run: jump("story"), visual: <span className="hit-icon archive"><BookOpen size={17} /></span> },
        );
      }
      const pool = [...actions, ...driverHits, ...teamHits, ...raceHits, ...circuitHits, ...pages];
      const scored = pool.map((h) => ({ h, s: score(h, needle) })).filter((x) => x.s);
      // Loose subsequence matches only when nothing matches directly.
      const strong = scored.filter((x) => x.s > 1);
      out.push(...(strong.length ? strong : scored).sort((a, b) => b.s - a.s).map((x) => x.h));
    }
    // Group in a fixed order, de-duplicated and capped per group.
    const seen = new Set<string>();
    return GROUP_ORDER.map((g) => {
      const items = out.filter((h) => h.group === g && !seen.has(h.key)).slice(0, GROUP_CAP[g] ?? 8);
      items.forEach((h) => seen.add(h.key));
      return { group: g, items };
    }).filter((g) => g.items.length);
  }, [q, ds.value, ts.value, rs.value, year, season, theme, reducedMotion, recent, setTheme, setReducedMotion, setSeason]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const go = (hit?: Hit) => {
    if (!hit) return;
    if (hit.recent) pushRecent(hit.recent);
    if (hit.run) hit.run();
    else if (hit.to) location.hash = href(hit.to);
    onClose();
  };
  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const loading = ds.loading || ts.loading || rs.loading;
  let n = -1;
  return (
    <>
      <motion.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <motion.div
        className="dialog palette glass glass-strong"
        role="dialog"
        aria-modal="true"
        aria-label="Search F1 Pulse"
        initial={narrow ? { opacity: 0, y: 30 } : { opacity: 0, scale: 0.94, y: -10, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        exit={narrow ? { opacity: 0, y: 30 } : { opacity: 0, scale: 0.96, y: -6, filter: "blur(8px)" }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, flat.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter") { e.preventDefault(); go(flat[index]); }
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
        }}
      >
        <div className="palette-input">
          <Search size={20} />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search, or try “leclerc vs hamilton”, “1988”, “dark mode”"
            aria-label="Search" aria-controls="palette-results" aria-activedescendant={flat.length ? `hit-${index}` : undefined}
            role="combobox" aria-expanded="true" aria-autocomplete="list"
          />
          {loading && <span className="spinner palette-spin" aria-hidden />}
          <button className="icon-btn" onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" aria-label="Results" ref={list}>
          {flat.length ? (
            groups.map((g) => (
              <div key={g.group} role="group" aria-labelledby={`hit-group-${g.group}`} className="hit-group">
                <div className="hit-group-head" id={`hit-group-${g.group}`}>
                  {g.group === "Recent" && <History size={12} />}{g.group}
                </div>
                {g.items.map((h) => {
                  const i = ++n;
                  return (
                    <button
                      key={h.key} id={`hit-${i}`} data-index={i} role="option" aria-selected={i === index}
                      className={cx("hit", i === index && "active", h.run && "is-action")}
                      onPointerMove={() => i !== index && setIndex(i)} onClick={() => go(h)}
                    >
                      {h.visual}
                      <span className="hit-text"><strong>{h.label}</strong>{h.detail && <small>{h.detail}</small>}</span>
                      {h.kind && <span className="hit-kind">{h.kind}</span>}
                      <CornerDownLeft size={15} className="hit-enter" />
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="palette-empty">No results for “{q}”. Try a surname, a country, “norris vs piastri” or a year like 1988.</p>
          )}
        </div>
        <div className="palette-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> open</span>
          <span><kbd className="kbd">esc</kbd> close</span>
          <span className="palette-foot-tip">Type <b>x vs y</b> to compare</span>
        </div>
      </motion.div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner glass">
        <div className="footer-brand">
          <span className="f1-mark lg" aria-hidden />
          <strong>Pulse</strong>
          <p>An independent, non-commercial fan site. Real results, real photography, zero noise.</p>
        </div>
        <div className="footer-links">
          <div><span className="eyebrow">Explore</span>{primaryNav.slice(1).map((n) => <Link key={n.id} to={n.id}>{n.label}</Link>)}</div>
          <div><span className="eyebrow">The Lab</span>{labNav.map((n) => <Link key={n.id} to={n.id}>{n.label}</Link>)}</div>
          <div><span className="eyebrow">The Archive</span>{archiveNav.map((n) => <Link key={n.id} to={n.id}>{n.label}</Link>)}</div>
          <div>
            <span className="eyebrow">More</span>
            <Link to="news">News</Link>
            <Link to="settings">Settings & credits</Link>
            <a href="https://f1tv.formula1.com/" target="_blank" rel="noopener noreferrer">Watch on F1 TV <ArrowUpRight size={12} /></a>
          </div>
        </div>
        <p className="footer-legal">
          F1 Pulse is unofficial and is not associated in any way with the Formula 1 companies. F1, FORMULA ONE, FORMULA 1 and related marks are trade marks of Formula One Licensing B.V.; team names, logos and photography belong to their respective owners and are used with permission. Data: Jolpica (Ergast), OpenF1, Open-Meteo, BBC Sport.
        </p>
      </div>
    </footer>
  );
}

export function Ambient() {
  return <div className="ambient" aria-hidden><i /><b /></div>;
}

export function sectionOf(route: Route) {
  return route.parts[0] || "";
}
