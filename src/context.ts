import { createContext, useContext } from "react";
export type Preferences = {
  season: string;
  timezone: string;
  theme: string;
  favorites: string[];
  reducedMotion: boolean;
  setSeason: (s: string) => void;
  setTimezone: (s: string) => void;
  setTheme: (s: string) => void;
  setFavorites: (s: string[]) => void;
  setReducedMotion: (s: boolean) => void;
};
export const Context = createContext<Preferences>(null!);
export const usePrefs = () => useContext(Context);
