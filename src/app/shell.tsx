import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Search, Sun, Moon, Heart, ChevronDown, Home, CalendarDays, Trophy, Users, Shield, MapPin, FlaskConical,
  Newspaper, Settings, ArrowLeftRight, Gauge, PlayCircle, GitBranch, Sparkles, X, CornerDownLeft, MoreHorizontal, ArrowUpRight,
} from "lucide-react";
import { usePrefs } from "./prefs";
import { Link, navigate, useHref, type Route } from "../lib/router";
import { seasonHref, validSeason } from "../domain.mjs";
import { drivers, races, teams, useData } from "../api";
import { fullName, teamShortName } from "../lib/media";
import { DriverAvatar, Flag, TeamLogo } from "../ui/media";
import { cx, useMedia } from "../ui/core";

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

function LabMenu({ section }: { section: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = labNav.some((i) => i.id === section);
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
    <div className="lab" ref={ref} onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}>
      <button className={cx("nav-link", active && "active")} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
        <FlaskConical size={15} />Lab<ChevronDown size={13} className={cx("chev", open && "open")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="lab-menu glass glass-strong"
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
          >
            <span className="eyebrow">The Lab · data tools</span>
            {labNav.map((item, i) => (
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
          <LabMenu section={section} />
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────────────────────── Command palette ───────────────────────── */
type Hit = { kind: string; label: string; detail?: string; to: string; visual?: ReactNode; keywords?: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && <Palette onClose={onClose} />}
    </AnimatePresence>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { season, year, setSeason } = usePrefs();
  const href = useHref();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
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
  const hits = useMemo<Hit[]>(() => {
    const items: Hit[] = [
      ...[...primaryNav, ...labNav, ...moreNav].map((n) => ({ kind: n.id && labNav.includes(n) ? "Lab" : "Go to", label: n.label, detail: n.description, to: n.id, visual: <span className="hit-icon"><n.icon size={17} /></span> })),
      ...(ds.value?.data || []).map((d) => ({
        kind: "Driver", label: fullName(d), detail: [d.permanentNumber && "#" + d.permanentNumber, d.nationality].filter(Boolean).join(" · "), to: "driver/" + d.driverId,
        keywords: d.code, visual: <DriverAvatar id={d.driverId} name={fullName(d)} year={year} size={34} />,
      })),
      ...(ts.value?.data || []).map((t) => ({
        kind: "Team", label: teamShortName(t.name, year), detail: t.nationality, to: "team/" + t.constructorId,
        visual: <TeamLogo id={t.constructorId} name={t.name} year={year} size={34} />,
      })),
      ...(rs.value?.data || []).flatMap((r) => [
        { kind: "Race", label: r.raceName, detail: `Round ${r.round} · ${r.Circuit.Location.locality}`, to: "race/" + r.round, keywords: r.Circuit.Location.country, visual: <span className="hit-icon"><Flag country={r.Circuit.Location.country} /></span> },
        { kind: "Circuit", label: r.Circuit.circuitName, detail: r.Circuit.Location.locality + ", " + r.Circuit.Location.country, to: "circuit/" + r.Circuit.circuitId, visual: <span className="hit-icon"><MapPin size={16} /></span> },
      ]),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return items.filter((i) => i.kind === "Go to" || i.kind === "Lab").slice(0, 12);
    const score = (h: Hit) => {
      const hay = (h.label + " " + (h.keywords || "") + " " + (h.detail || "")).toLowerCase();
      if (h.label.toLowerCase().startsWith(needle)) return 4;
      if (hay.split(/\s+/).some((w) => w.startsWith(needle))) return 3;
      if (hay.includes(needle)) return 2;
      let i = 0;
      for (const ch of hay) if (ch === needle[i]) i++;
      return i === needle.length ? 1 : 0;
    };
    const scored = items.map((h) => ({ h, s: score(h) })).filter((x) => x.s);
    // Loose subsequence matches only when nothing matches directly.
    const strong = scored.filter((x) => x.s > 1);
    return (strong.length ? strong : scored).sort((a, b) => b.s - a.s).slice(0, 14).map((x) => x.h);
  }, [q, ds.value, ts.value, rs.value, year]);
  const seasonJump = /^\d{4}$/.test(q.trim()) && validSeason(q.trim()) ? q.trim() : null;
  const go = (hit?: Hit) => {
    if (seasonJump) {
      setSeason(seasonJump);
      location.hash = seasonHref("standings", seasonJump);
    } else if (hit) location.hash = href(hit.to);
    onClose();
  };
  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);
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
          if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[index]); }
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
        }}
      >
        <div className="palette-input">
          <Search size={20} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers, teams, races, circuits — or type a year" aria-label="Search" aria-controls="palette-results" aria-activedescendant={`hit-${index}`} role="combobox" aria-expanded="true" />
          <button className="icon-btn" onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={list}>
          {seasonJump ? (
            <button className="hit active" onClick={() => go()} role="option" aria-selected id="hit-0" data-index={0}>
              <span className="hit-icon"><Trophy size={17} /></span>
              <span className="hit-text"><strong>Explore the {seasonJump} season</strong><small>Standings, calendar and results</small></span>
              <CornerDownLeft size={15} className="hit-enter" />
            </button>
          ) : hits.length ? (
            hits.map((h, i) => (
              <button key={h.kind + h.to + i} id={`hit-${i}`} data-index={i} role="option" aria-selected={i === index} className={cx("hit", i === index && "active")} onPointerMove={() => setIndex(i)} onClick={() => go(h)}>
                {h.visual}
                <span className="hit-text"><strong>{h.label}</strong>{h.detail && <small>{h.detail}</small>}</span>
                <span className="hit-kind">{h.kind}</span>
                <CornerDownLeft size={15} className="hit-enter" />
              </button>
            ))
          ) : (
            <p className="palette-empty">No results for “{q}”. Try a surname, a country or a year like 1988.</p>
          )}
        </div>
        <div className="palette-foot"><span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span><span><kbd className="kbd">↵</kbd> open</span><span><kbd className="kbd">esc</kbd> close</span></div>
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
