import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { seasonHref, validSeason } from "../domain.mjs";
import { usePrefs } from "../app/prefs";

export type Route = { path: string; parts: string[]; query: URLSearchParams };

/** Legacy route names from earlier versions of F1 Pulse. */
const aliases: Record<string, string> = {
  overview: "",
  analytics: "compare",
  scenario: "scenarios",
  fan: "favorites",
  rewind: "standings",
};

export function parseRoute(hash = location.hash): Route {
  const [raw, search = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] && parts[0] in aliases) parts.splice(0, 1, ...(aliases[parts[0]] ? [aliases[parts[0]]] : []));
  return { path: parts.join("/"), parts, query: new URLSearchParams(search) };
}

const reducedMotion = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  // A ?season= in the new URL is applied in the same update as the route: separate hashchange
  // listeners let React commit the new page with the old season first (and fetch its data).
  const { setSeason } = usePrefs();
  const seasonRef = useRef(setSeason);
  seasonRef.current = setSeason;
  useEffect(() => {
    let previous = parseRoute().path;
    const change = () => {
      const next = parseRoute();
      const pageChanged = next.path !== previous;
      previous = next.path;
      const apply = () => {
        const season = next.query.get("season");
        if (season && validSeason(season)) seasonRef.current(season);
        setRoute(next);
        if (pageChanged) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      };
      if (pageChanged && "startViewTransition" in document && !reducedMotion()) {
        (document as any).startViewTransition(() => flushSync(apply));
      } else apply();
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  location.hash = to.startsWith("#") ? to : "#/" + to.replace(/^\//, "");
};

/** Replace query parameters on the current route without adding history entries. */
export function setQuery(values: Record<string, string | undefined | null>) {
  const current = parseRoute();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") current.query.delete(key);
    else current.query.set(key, value);
  }
  const search = current.query.toString();
  history.replaceState(null, "", "#/" + current.path + (search ? "?" + search : ""));
}

export function useHref() {
  const { season } = usePrefs();
  return (to: string) => seasonHref(to.replace(/^\//, ""), season);
}

type LinkProps = ComponentProps<"a"> & { to: string; children?: ReactNode };
export function Link({ to, children, ...rest }: LinkProps) {
  const href = useHref();
  return (
    <a href={href(to)} {...rest}>
      {children}
    </a>
  );
}
