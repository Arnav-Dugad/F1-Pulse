import React, { useEffect, useState, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  LayoutDashboard,
  CalendarDays,
  Trophy,
  Users,
  Flag,
  MapPin,
  ChartNoAxesCombined,
  Gauge,
  Play,
  GitBranch,
  Newspaper,
  Settings,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  ArrowUpRight,
  Heart,
  Command,
  ChevronRight,
} from "lucide-react";
import { Context } from "./context";
import { Link, Photo, State } from "./ui";
import { races, drivers, teams, useData } from "./api";
import type { Driver } from "./types";
import { name } from "./media";
import "./style.css";
const Core = lazy(() => import("./pages"));
const Analytics = lazy(() => import("./analytics"));
const Archive = lazy(() => import("./archive"));
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["calendar", "Race calendar", CalendarDays],
  ["standings", "Championship", Trophy],
  ["drivers", "Drivers", Users],
  ["teams", "Teams", Flag],
  ["circuits", "Circuits", MapPin],
] as const;
const tools = [
  ["analytics", "Comparison studio", ChartNoAxesCombined],
  ["telemetry", "Telemetry lab", Gauge],
  ["replay", "Historical replay", Play],
  ["strategy", "Strategy explorer", GitBranch],
  ["scenario", "Title scenarios", Trophy],
  ["news", "News desk", Newspaper],
] as const;
function stored<T>(key: string, defaultValue: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem("pulse-v2-" + key) || "null") ??
      defaultValue
    );
  } catch {
    return defaultValue;
  }
}
function useStored<T>(key: string, initial: T) {
  const [value, set] = useState<T>(() => stored(key, initial));
  useEffect(() => {
    try {
      localStorage.setItem("pulse-v2-" + key, JSON.stringify(value));
    } catch {}
  }, [value, key]);
  return [value, set] as const;
}
function App() {
  const [season, setSeason] = useStored("season", "current"),
    [timezone, setTimezone] = useStored("timezone", "local"),
    [theme, setTheme] = useStored("theme", "dark"),
    [favorites, setFavorites] = useStored<string[]>("favorites", []),
    [reducedMotion, setReducedMotion] = useStored("motion", false);
  const [route, setRoute] = useState(
    location.hash.slice(2).split("?")[0] || "overview",
  );
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(2).split("?")[0] || "overview");
      const q = new URLSearchParams(location.hash.split("?")[1] || "");
      const querySeason = q.get("season");
      if (
        querySeason === "current" ||
        (querySeason &&
          /^\d{4}$/.test(querySeason) &&
          +querySeason >= 1950 &&
          +querySeason <= new Date().getFullYear())
      )
        setSeason(querySeason);
      setMobile(false);
      window.scrollTo(0, 0);
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const retireLegacyShell = async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((r) => r.scope === location.origin + "/")
            .map((r) => r.unregister()),
        );
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("f1-pulse-shell-"))
            .map((k) => caches.delete(k)),
        );
      }
    };
    retireLegacyShell().catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.motion = reducedMotion
      ? "reduced"
      : "full";
  }, [theme, reducedMotion]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((x) => !x);
      }
      if (e.key === "Escape") {
        setSearch(false);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const prefs = {
    season,
    setSeason,
    timezone,
    setTimezone,
    theme,
    setTheme,
    favorites,
    setFavorites,
    reducedMotion,
    setReducedMotion,
  };
  const current = route.split("/")[0];
  const isAnalytics = ["analytics", "strategy", "scenario"].includes(current);
  const isArchive = ["telemetry", "replay"].includes(current);
  return (
    <Context.Provider value={prefs}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
          window.scrollTo(0, 0);
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <button
          className="icon-button mobile-toggle"
          aria-label="Open navigation"
          onClick={() => setMobile((x) => !x)}
        >
          {mobile ? <X /> : <Menu />}
        </button>
        <Link to="overview" className="brand">
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            F1<span className="brand-light"> PULSE</span>
            <small>FEEL EVERY MOMENT</small>
          </span>
        </Link>
        <div className="header-divider" />
        <span className="header-tagline">Your paddock. Your perspective.</span>
        <div className="header-actions">
          <button
            className="search-button"
            aria-label="Search the grid"
            onClick={() => setSearch(true)}
          >
            <Search size={17} />
            <span>Search the grid</span>
            <kbd>⌘ K</kbd>
          </button>
          <label className="season-select">
            <span className="sr-only">Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="current">{new Date().getFullYear()} season</option>
              {Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) =>
                String(new Date().getFullYear() - i),
              ).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button theme-toggle"
            aria-label="Toggle color theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a
            className="tv-link"
            href="https://f1tv.formula1.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Watch on official F1 TV (opens in new tab)"
          >
            <Photo src="/assets/f1-tv.svg" alt="F1 TV" eager />
            <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      {mobile && (
        <button
          className="sidebar-shade"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="nav-group">
          <span className="nav-label">THE PADDOCK</span>
          {nav.map(([id, label, Icon]) => (
            <Link
              key={id}
              to={id}
              className={`nav-item ${current === id || (id === "calendar" && current === "race") || (id === "drivers" && current === "driver") || (id === "teams" && current === "team") || (id === "circuits" && current === "circuit") ? "active" : ""}`}
            >
              <Icon size={18} />
              {label}
              <ChevronRight size={13} />
            </Link>
          ))}
        </div>
        <div className="nav-group">
          <span className="nav-label">GO DEEPER</span>
          {tools.map(([id, label, Icon]) => (
            <Link
              key={id}
              to={id}
              className={`nav-item ${current === id ? "active" : ""}`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </div>
        <div className="sidebar-bottom">
          <Link className="fan-pass" to="drivers">
            <Heart size={19} />
            <div>
              Your fan collection
              <small>{favorites.length} saved favorites</small>
            </div>
            <ArrowUpRight size={15} />
          </Link>
          <Link
            to="settings"
            className={`nav-item ${current === "settings" ? "active" : ""}`}
          >
            <Settings size={17} />
            Preferences & sources
          </Link>
          <p>
            Independent. Always free.
            <br />
            <span>Made for the love of racing.</span>
          </p>
        </div>
      </aside>
      <main id="main-content" className="main" tabIndex={-1}>
        <Suspense fallback={<State loading />}>
          {isArchive ? (
            <Archive route={route} />
          ) : isAnalytics ? (
            <Analytics route={route} />
          ) : (
            <Core route={route} />
          )}
        </Suspense>
        <footer>
          <div>
            <Activity size={18} />
            <strong>F1 PULSE</strong>
            <span>Built for the fans.</span>
          </div>
          <p>
            Unofficial, independent fan website. Not affiliated with Formula 1,
            the FIA, or any team. F1 and related marks belong to their
            respective owners.
          </p>
          <Link to="settings">
            Data & imagery credits <ArrowUpRight size={13} />
          </Link>
        </footer>
      </main>
      {search && (
        <SearchDialog
          season={season}
          close={() => setSearch(false)}
          changeSeason={setSeason}
        />
      )}
    </Context.Provider>
  );
}
function SearchDialog({
  season,
  close,
  changeSeason,
}: {
  season: string;
  close: () => void;
  changeSeason: (s: string) => void;
}) {
  const [q, setQ] = useState(""),
    [index, setIndex] = useState(0);
  const ds = useData(() => drivers(season), [season]),
    rs = useData(() => races(season), [season]),
    ts = useData(() => teams(season), [season]);
  const items = [
    ...nav.map(([url, label]) => ({ label, url, kind: "Page" })),
    ...tools.map(([url, label]) => ({ label, url, kind: "Tool" })),
    ...(ds.value?.data || []).map((d: Driver) => ({
      label: name(d),
      url: "driver/" + d.driverId,
      kind: "Driver",
    })),
    ...(ts.value?.data || []).map((t) => ({
      label: t.name,
      url: "team/" + t.constructorId,
      kind: "Team",
    })),
    ...(rs.value?.data || []).flatMap((r) => [
      { label: r.raceName, url: "race/" + r.round, kind: "Race" },
      {
        label: r.Circuit.circuitName,
        url: "circuit/" + r.Circuit.circuitId,
        kind: "Circuit",
      },
    ]),
  ];
  const scored = items
    .map((x) => ({
      ...x,
      score: x.label.toLowerCase().includes(q.toLowerCase())
        ? 3
        : q
              .toLowerCase()
              .split("")
              .every((c, i, a) => x.label.toLowerCase().includes(c))
          ? 1
          : 0,
    }))
    .filter((x) => x.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const select = (i: number) => {
    if (/^\d{4}$/.test(q) && +q >= 1950 && +q <= new Date().getFullYear()) {
      changeSeason(q);
      location.hash = "/standings";
      close();
      return;
    }
    const item = scored[i];
    if (item) {
      location.hash = "/" + item.url;
      try {
        localStorage.setItem("pulse-v2-last-search", q);
      } catch {}
      close();
    }
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    document.querySelector<HTMLInputElement>(".command-input")?.focus();
    return () => prev?.focus();
  }, []);
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search Formula 1"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, scored.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            select(index);
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>("input,button"),
            );
            const i = buttons.indexOf(document.activeElement as HTMLElement);
            buttons[
              (i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
            ]?.focus();
          }
        }}
      >
        <div className="command-top">
          <Search size={21} />
          <input
            className="command-input"
            aria-label="Search drivers, teams, races or season"
            placeholder="Drivers, races, teams, or a season…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="command-results">
          {/^\d{4}$/.test(q) ? (
            <button onClick={() => select(0)}>
              Explore the {q} season <ArrowUpRight size={18} />
            </button>
          ) : (
            scored.map((x, i) => (
              <button
                className={i === index ? "highlighted" : ""}
                key={x.url + i}
                onClick={() => select(i)}
              >
                <span>
                  <small>{x.kind}</small>
                  {x.label}
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          )}
          {!scored.length && (
            <p className="empty">No matches. Try a driver surname or season.</p>
          )}
        </div>
        <div className="command-foot">
          <Command size={14} />↑ ↓ to navigate · Enter to open · Esc to close
        </div>
      </div>
    </div>
  );
}
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>This page could not be displayed.</h1>
        <button className="button" onClick={() => location.reload()}>
          Reload F1 Pulse
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
