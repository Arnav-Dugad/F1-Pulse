import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Accessibility, AlertTriangle, ArrowUpRight, CalendarDays, Check, ChevronRight, CloudSun, Database, Download, FileJson, Flag as FlagIcon,
  Globe, Heart, Image, Info, Moon, Newspaper, Palette, Radio, Shield, Sun, Trash2, Type, Upload, BookOpen,
} from "lucide-react";
import { usePrefs, type Theme } from "../app/prefs";
import { normalizePreference } from "../domain.mjs";
import { Link, type Route } from "../lib/router";
import { download, plural, timezoneLabel } from "../lib/format";
import { Glass, Page, Segmented, Skeleton, Toggle, cx, useAmbient, useNow, useTitle } from "../ui/core";
import "./settings.css";

/* ───────────────────────── Helpers ───────────────────────── */
const zone = (tz: string) => (tz === "local" ? undefined : tz);
function zoneOffset(tz: string, at: number) {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone(tz), timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}
function allZones(): string[] {
  try {
    return [...Intl.supportedValuesOf("timeZone")];
  } catch {
    return ["UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Asia/Kolkata", "Australia/Melbourne"];
  }
}

type Source = { file: string; kind: string; subject: string; source: string; bytes?: number; season?: number };
type Notice = { tone: "ok" | "error"; text: string } | null;

const INVALID = Symbol("invalid");
const FIELDS: { key: string; aliases: string[]; label: string }[] = [
  { key: "season", aliases: ["season"], label: "season" },
  { key: "timezone", aliases: ["timezone"], label: "time zone" },
  { key: "theme", aliases: ["theme"], label: "theme" },
  { key: "motion", aliases: ["motion", "reducedMotion"], label: "reduce motion" },
  { key: "favorites", aliases: ["favorites", "favourites"], label: "favourites" },
];

export default function Settings(_: { route: Route }) {
  useTitle("Settings");
  useAmbient("#5e5ce6", "#30d158");
  const prefs = usePrefs();
  const { theme, setTheme, reducedMotion, setReducedMotion, timezone, setTimezone, season, setSeason, favorites, setFavorites, year } = prefs;
  const now = useNow(1000);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const zones = useMemo(() => {
    const groups = new Map<string, string[]>();
    const list = allZones();
    for (const extra of ["UTC", timezone]) if (extra !== "local" && !list.includes(extra)) list.push(extra);
    for (const z of list) {
      const region = z.includes("/") ? z.split("/")[0] : "Other";
      groups.set(region, [...(groups.get(region) || []), z]);
    }
    return [...groups.entries()];
  }, [timezone]);
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: thisYear - 1949 }, (_, i) => String(thisYear - i)), [thisYear]);

  const sources = useSources();

  const exportPrefs = () => {
    const data = { app: "F1 Pulse", version: 2, exportedAt: new Date().toISOString(), season, timezone, theme, motion: reducedMotion, favorites };
    download("f1-pulse-preferences.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    setNotice({ tone: "ok", text: "Preferences exported as f1-pulse-preferences.json." });
  };

  const importPrefs = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 200_000) throw Error("That file is too large to be an F1 Pulse preferences file.");
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); } catch { throw Error("That file isn't valid JSON."); }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Expected a JSON object of preferences.");
      const obj = raw as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      const bad: string[] = [];
      let skipped = 0;
      for (const f of FIELDS) {
        const alias = f.aliases.find((a) => a in obj);
        if (!alias) continue;
        const value = normalizePreference<unknown>(f.key, obj[alias], INVALID);
        if (value === INVALID) bad.push(f.label);
        else {
          next[f.key] = value;
          if (f.key === "favorites" && Array.isArray(obj[alias])) skipped = (obj[alias] as unknown[]).length - (value as string[]).length;
        }
      }
      if (bad.length) throw Error(`Not imported — invalid ${bad.join(", ")}.`);
      if (!Object.keys(next).length) throw Error("No F1 Pulse preferences were found in that file.");
      if ("season" in next) setSeason(next.season as string);
      if ("timezone" in next) setTimezone(next.timezone as string);
      if ("theme" in next) setTheme(next.theme as Theme);
      if ("motion" in next) setReducedMotion(next.motion as boolean);
      if ("favorites" in next) setFavorites(next.favorites as string[]);
      const applied = FIELDS.filter((f) => f.key in next).map((f) => f.label);
      setNotice({ tone: "ok", text: `Imported ${applied.join(", ")}.${skipped > 0 ? ` ${plural(skipped, "invalid or duplicate favourite")} skipped.` : ""}` });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const drivers = favorites.filter((f) => f.startsWith("driver:")).length;
  const teams = favorites.length - drivers;
  const clockTime = new Date(now).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: zone(timezone) });
  const clockDate = new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: zone(timezone) });

  return (
    <Page className="set">
      <section className="set-hero glass">
        <span className="set-hero-glow" aria-hidden />
        <div className="set-hero-copy">
          <span className="eyebrow rise"><span className="dot" />Preferences</span>
          <h1 className="display set-title rise" style={{ "--i": 1 } as CSSProperties}>Settings<span>Make the paddock yours.</span></h1>
          <p className="lede rise" style={{ "--i": 2 } as CSSProperties}>Appearance, time zone, season and favourites — stored only in this browser. No account needed.</p>
          <div className="set-summary rise" style={{ "--i": 3 } as CSSProperties}>
            <span className="chip">{theme === "dark" ? <Moon /> : <Sun />}{theme === "dark" ? "Dark" : "Light"}</span>
            <span className="chip"><Globe />{timezoneLabel(timezone)}</span>
            <span className="chip"><CalendarDays />{season === "current" ? `Current (${year})` : season}</span>
            <span className="chip"><Heart />{plural(favorites.length, "favourite")}</span>
          </div>
        </div>
        <div className="set-clock rise" style={{ "--i": 2 } as CSSProperties} aria-live="off">
          <span className="eyebrow">{timezone === "local" ? "Local time" : "Your race time zone"}</span>
          <span className="set-clock-time tabular">{clockTime}</span>
          <span className="set-clock-date">{clockDate}</span>
          <span className="set-clock-zone">{timezoneLabel(timezone)} · {zoneOffset(timezone, now)}</span>
        </div>
      </section>

      <div className="set-columns">
        <div className="set-col">
          <Group title="Appearance">
            <Row icon={<Palette />} color="#5e5ce6" label="Theme" detail="Dark graphite or light paddock">
              <Segmented<Theme> label="Theme" value={theme} onChange={setTheme}
                options={[{ value: "dark", label: <span className="set-seg"><Moon size={14} />Dark</span> }, { value: "light", label: <span className="set-seg"><Sun size={14} />Light</span> }]} />
            </Row>
            <Row icon={<Accessibility />} color="#0a84ff" label="Reduce motion" detail="Calms animations, parallax and counters. Your system setting is respected too.">
              <Toggle checked={reducedMotion} onChange={setReducedMotion} label="Reduce motion" />
            </Row>
          </Group>

          <Group title="Time zone" footer="Every session time on F1 Pulse — schedules, countdowns, results — is shown in this zone.">
            <Row icon={<Globe />} color="#30b0c7" label="Show times in" stacked>
              <select className="select set-select" value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-label="Time zone">
                <option value="local">Local — {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}</option>
                {zones.map(([region, list]) => (
                  <optgroup key={region} label={region}>
                    {list.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                  </optgroup>
                ))}
              </select>
            </Row>
            <Row icon={<Radio />} color="#ff9f0a" label="Preview" detail={`${clockDate} · ${zoneOffset(timezone, now)}`}>
              <span className="set-preview tabular">{clockTime}</span>
            </Row>
          </Group>

          <Group title="Season" footer="Results, standings and history are available for every world championship season since 1950.">
            <Row icon={<CalendarDays />} color="#ff3b30" label="Season to explore" stacked>
              <select className="select set-select" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
                <option value="current">Current season ({thisYear})</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Row>
          </Group>

          <Group title="Favourites" footer="Export a JSON backup to move your favourites and settings to another browser. Imports are validated before anything changes.">
            <Row icon={<Heart />} color="#ff375f" label="Saved" detail={favorites.length ? `${plural(drivers, "driver")} · ${plural(teams, "team")}` : "Tap a heart on any driver or team"}>
              <Link to="favorites" className="set-link">{favorites.length}<ChevronRight size={16} /></Link>
            </Row>
            <Row icon={<Download />} color="#34c759" label="Export preferences" detail="Download f1-pulse-preferences.json">
              <button type="button" className="btn sm" onClick={exportPrefs}><FileJson />Export</button>
            </Row>
            <Row icon={<Upload />} color="#0a84ff" label="Import preferences" detail="Restore from an exported JSON file">
              <label className="btn sm set-file">
                <Upload />Choose file
                <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importPrefs(e.target.files?.[0])} />
              </label>
            </Row>
            <Row icon={<Trash2 />} color="#8e8e93" label="Clear favourites" detail={favorites.length ? "Removes every saved driver and team" : "Nothing to clear"}>
              <button type="button" className="btn sm set-danger" disabled={!favorites.length || confirming} onClick={() => setConfirming(true)} aria-expanded={confirming}>Clear…</button>
            </Row>
            <AnimatePresence initial={false}>
              {confirming && (
                <motion.div className="set-confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
                  <div className="set-confirm-inner" role="alertdialog" aria-label="Confirm clearing favourites">
                    <AlertTriangle />
                    <p>Remove all {plural(favorites.length, "favourite")}? This can't be undone unless you exported a backup.</p>
                    <div className="row">
                      <button type="button" className="btn sm" onClick={() => setConfirming(false)} autoFocus>Cancel</button>
                      <button type="button" className="btn sm set-danger solid" onClick={() => { setFavorites([]); setConfirming(false); setNotice({ tone: "ok", text: "All favourites cleared." }); }}>Remove all</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Group>
          <AnimatePresence>
            {notice && (
              <motion.p key={notice.text} className={cx("set-notice", notice.tone)} role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {notice.tone === "ok" ? <Check /> : <AlertTriangle />}{notice.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="set-col">
          <Group title="Data sources" footer="Each dataset on the site shows where it came from and when it was retrieved. Missing measurements are never filled with invented values.">
            <SourceRow icon={<Database />} color="#ff3b30" name="Jolpica F1 API" detail="Ergast-compatible schedules, results, qualifying, sprints and standings, 1950 to today" href="https://github.com/jolpica/jolpica-f1" />
            <SourceRow icon={<Radio />} color="#5e5ce6" name="OpenF1" detail="Historical timing, laps, positions and telemetry from 2023 — archive only, not live" href="https://openf1.org/" />
            <SourceRow icon={<CloudSun />} color="#30b0c7" name="Open-Meteo" detail="Weather model forecasts at circuit coordinates — not trackside sensors" href="https://open-meteo.com/" />
            <SourceRow icon={<Newspaper />} color="#bb1919" name="BBC Sport RSS" detail="Formula 1 headlines, linked to the publisher" href="https://www.bbc.co.uk/sport/formula1" />
            <SourceRow icon={<BookOpen />} color="#8e8e93" name="Wikipedia" detail="Short encyclopaedia summaries, with links to the full article" href="https://www.wikipedia.org/" />
          </Group>

          <Group title="Imagery & fonts">
            <div className="set-credits">
              <p>
                Official Formula 1 media — driver portraits, number artwork, team logos, cars, circuit maps and outlines, and race hub photography — is used with the site owner's stated permission. Every file is listed with its original source in a provenance register.
              </p>
              {sources.loading ? (
                <Skeleton h={150} r={16} />
              ) : sources.error ? (
                <p className="set-muted"><AlertTriangle size={14} />The provenance register couldn't be loaded right now.</p>
              ) : (
                <>
                  <ul className="set-kinds">
                    {sources.kinds.map(([kind, n]) => (
                      <li key={kind}><span>{kind[0].toUpperCase() + kind.slice(1)}</span><b className="tabular">{n}</b></li>
                    ))}
                  </ul>
                  <p className="set-muted">{plural(sources.total, "file")}{sources.bytes ? ` · ${(sources.bytes / 1048576).toFixed(1)} MB` : ""} in the register.</p>
                </>
              )}
              <a className="link" href="/media/sources.json" target="_blank" rel="noopener noreferrer"><FileJson />Open the provenance register (sources.json)<ArrowUpRight /></a>
            </div>
            <SourceRow icon={<FlagIcon />} color="#34c759" name="Flags" detail="Country flags from flagcdn / Flagpedia" href="https://flagpedia.net/" />
            <SourceRow icon={<Type />} color="#636366" name="Inter typeface" detail="By Rasmus Andersson, SIL Open Font License" href="/assets/Inter-OFL.txt" />
          </Group>

          <Group title="About">
            <div className="set-about">
              <div className="set-about-brand">
                <span className="f1-mark lg" aria-hidden />
                <strong>Pulse</strong>
              </div>
              <p>
                F1 Pulse is an independent, non-commercial fan site for following the Formula 1 world championship: calendars and countdowns, results and standings, every season since 1950, circuit guides, and a lab of historical analysis tools.
              </p>
              <ul className="set-facts">
                <li><Shield />Preferences and favourites are stored in this browser's local storage.</li>
                <li><Image />Driver and team photography is shown for the 2026 season only; earlier seasons use neutral monograms.</li>
                <li><Info />Estimates and simulations are always labelled as such.</li>
              </ul>
            </div>
          </Group>

          <div className="set-disclaimer reveal">
            <AlertTriangle />
            <p>
              <strong>Unofficial.</strong> F1 Pulse is not affiliated with, endorsed by or associated with Formula 1, the Formula One group of companies, the FIA or any team. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula One Licensing B.V. Team names, logos and imagery belong to their respective owners.
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}

/* ───────────────────────── Grouped list primitives ───────────────────────── */
function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="set-group reveal" aria-label={title}>
      <h2 className="set-group-title">{title}</h2>
      <Glass className="set-list">{children}</Glass>
      {footer && <p className="set-footer">{footer}</p>}
    </section>
  );
}

function Row({ icon, color, label, detail, children, stacked }: { icon: ReactNode; color: string; label: string; detail?: ReactNode; children?: ReactNode; stacked?: boolean }) {
  return (
    <div className={cx("set-row", stacked && "stacked")}>
      <span className="set-icon" style={{ "--c": color } as CSSProperties} aria-hidden>{icon}</span>
      <span className="set-text">
        <span className="set-label">{label}</span>
        {detail && <span className="set-detail">{detail}</span>}
      </span>
      {children && <span className="set-control">{children}</span>}
    </div>
  );
}

function SourceRow({ icon, color, name, detail, href }: { icon: ReactNode; color: string; name: string; detail: string; href: string }) {
  return (
    <a className="set-row set-row-link" href={href} target="_blank" rel="noopener noreferrer">
      <span className="set-icon" style={{ "--c": color } as CSSProperties} aria-hidden>{icon}</span>
      <span className="set-text">
        <span className="set-label">{name}</span>
        <span className="set-detail">{detail}</span>
      </span>
      <ArrowUpRight size={16} className="set-chev" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function useSources() {
  const [state, setState] = useState<{ loading: boolean; error: boolean; items: Source[] }>({ loading: true, error: false, items: [] });
  useEffect(() => {
    let live = true;
    fetch("/media/sources.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setState({ loading: false, error: !Array.isArray(d), items: Array.isArray(d) ? d : [] }))
      .catch(() => live && setState({ loading: false, error: true, items: [] }));
    return () => { live = false; };
  }, []);
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of state.items) if (s && typeof s.kind === "string") m.set(s.kind, (m.get(s.kind) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [state.items]);
  const bytes = state.items.reduce((a, s) => a + (Number(s?.bytes) || 0), 0);
  return { ...state, kinds, total: state.items.length, bytes };
}
