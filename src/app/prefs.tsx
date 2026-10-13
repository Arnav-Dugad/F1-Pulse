import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { normalizePreference, validSeason } from "../domain.mjs";

export type Theme = "dark" | "light";
export type Preferences = {
  season: string;
  year: string;
  timezone: string;
  theme: Theme;
  favorites: string[];
  reducedMotion: boolean;
  setSeason: (s: string) => void;
  setTimezone: (s: string) => void;
  setTheme: (s: Theme) => void;
  setFavorites: (s: string[]) => void;
  toggleFavorite: (key: string) => void;
  setReducedMotion: (s: boolean) => void;
};

const Context = createContext<Preferences>(null!);
export const usePrefs = () => useContext(Context);

function read<T>(key: string, fallback: T): T {
  try {
    return normalizePreference(key, JSON.parse(localStorage.getItem("pulse-v2-" + key) || "null"), fallback);
  } catch {
    return fallback;
  }
}

function useStored<T>(key: string, initial: () => T) {
  const [value, set] = useState<T>(initial);
  useEffect(() => {
    try {
      localStorage.setItem("pulse-v2-" + key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, set] as const;
}

const querySeason = () => {
  const s = new URLSearchParams(location.hash.split("?")[1] || "").get("season");
  return s && validSeason(s) ? s : null;
};

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useStored("season", () => querySeason() || read("season", "current"));
  const [timezone, setTimezone] = useStored("timezone", () => read("timezone", "local"));
  const [theme, setTheme] = useStored<Theme>("theme", () =>
    read("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
  );
  const [favorites, setFavorites] = useStored<string[]>("favorites", () => read("favorites", []));
  const [reducedMotion, setReducedMotion] = useStored("motion", () => read("motion", false));

  useEffect(() => {
    const sync = () => {
      const s = querySeason();
      if (s) setSeason(s);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = reducedMotion ? "reduced" : "";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#040406" : "#eef0f5");
  }, [theme, reducedMotion]);

  const year = season === "current" ? String(new Date().getFullYear()) : season;
  const toggleFavorite = (key: string) =>
    setFavorites((list) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]));
  return (
    <Context.Provider
      value={{ season, year, timezone, theme, favorites, reducedMotion, setSeason, setTimezone, setTheme, setFavorites, toggleFavorite, setReducedMotion }}
    >
      {children}
    </Context.Provider>
  );
}
