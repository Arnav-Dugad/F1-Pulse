import React, { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { PrefsProvider, usePrefs } from "./app/prefs";
import { Ambient, CommandPalette, Footer, TabBar, TopNav, sectionOf } from "./app/shell";
import { useRoute, type Route } from "./lib/router";
import { Page, useAutoReveal } from "./ui/core";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";

type PageModule = { default: ComponentType<{ route: Route }> };
/**
 * After a deploy, an open tab may request page chunks that no longer exist. Reload once to pick up
 * the new build instead of showing an error.
 */
function page(load: () => Promise<unknown>) {
  return lazy(() =>
    (load() as Promise<PageModule>).then(
      (m) => { sessionStorage.removeItem("pulse-chunk-reload"); return m; },
      (error) => {
        if (!sessionStorage.getItem("pulse-chunk-reload")) {
          sessionStorage.setItem("pulse-chunk-reload", "1");
          location.reload();
          return new Promise<PageModule>(() => {});
        }
        throw error;
      },
    ),
  );
}
const pages: Record<string, React.LazyExoticComponent<ComponentType<{ route: Route }>>> = {
  "": page(() => import("./pages/Home")),
  calendar: page(() => import("./pages/Calendar")),
  race: page(() => import("./pages/Race")),
  standings: page(() => import("./pages/Standings")),
  drivers: page(() => import("./pages/Drivers")),
  driver: page(() => import("./pages/Driver")),
  teams: page(() => import("./pages/Teams")),
  team: page(() => import("./pages/Team")),
  circuits: page(() => import("./pages/Circuits")),
  circuit: page(() => import("./pages/Circuit")),
  compare: page(() => import("./pages/Compare")),
  telemetry: page(() => import("./pages/Telemetry")),
  replay: page(() => import("./pages/Replay")),
  strategy: page(() => import("./pages/Strategy")),
  scenarios: page(() => import("./pages/Scenarios")),
  news: page(() => import("./pages/News")),
  favorites: page(() => import("./pages/Favorites")),
  settings: page(() => import("./pages/Settings")),
};

function NotFound() {
  return (
    <Page>
      <div className="state glass" style={{ marginTop: 40 }}>
        <span className="display gradient-text">404</span>
        <h3>This corner isn't on the map.</h3>
        <p>The page you followed doesn't exist — it may have moved in the redesign.</p>
        <a className="btn primary" href="#/">Back to the grid</a>
      </div>
    </Page>
  );
}

function RouteFallback() {
  return <div className="route-loading" aria-busy="true" aria-label="Loading"><div className="spinner" /></div>;
}

function App() {
  const route = useRoute();
  const { reducedMotion, season } = usePrefs();
  const [search, setSearch] = useState(false);
  const section = sectionOf(route);
  const Current = pages[section];
  useAutoReveal(route.path + season);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
      else if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement).tagName)) { e.preventDefault(); setSearch(true); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => setSearch(false), [route.path]);
  // Retire any service worker or offline cache left behind by the original site.
  useEffect(() => {
    navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    window.caches?.keys().then((keys) => keys.filter((k) => k.startsWith("f1-pulse-shell-")).forEach((k) => caches.delete(k))).catch(() => {});
  }, []);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <Ambient />
      <TopNav section={section} onSearch={() => setSearch(true)} />
      <Boundary key={route.path}>
        <Suspense fallback={<RouteFallback />}>
          {Current ? <Current key={route.path + "|" + season} route={route} /> : <NotFound />}
        </Suspense>
      </Boundary>
      <Footer />
      <TabBar section={section} />
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </MotionConfig>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="state glass" role="alert">
          <h3>Something went wrong on this page.</h3>
          <p>{this.state.error.message}</p>
          <button className="btn primary" onClick={() => location.reload()}>Reload F1 Pulse</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </Boundary>
  </React.StrictMode>,
);
