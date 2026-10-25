/* Race weekend · race-day weather from historical reanalysis (completed races). */
import { useState, type CSSProperties } from "react";
import { Cloud, CloudRain, Droplets, Flag as FlagIcon, Info, Thermometer, Wind } from "lucide-react";
import { climate, useData } from "../api";
import { sessionDate } from "../lib/format";
import { Glass, Section, Skeleton, Source, StateView, cx } from "../ui/core";
import type { Race as RaceData, Result } from "../types";
import { useWidth } from "./_raceData";
import "./_race.css";

const shift = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * 864e5).toISOString().slice(0, 10);

type Metric = { key: "temperature_2m" | "precipitation" | "wind_speed_10m" | "relative_humidity_2m"; label: string; unit: string; icon: typeof Thermometer; color: string; bars?: boolean; digits: number };
const METRICS: Metric[] = [
  { key: "temperature_2m", label: "Air temperature", unit: "°C", icon: Thermometer, color: "var(--orange)", digits: 1 },
  { key: "precipitation", label: "Precipitation", unit: "mm", icon: CloudRain, color: "var(--blue)", bars: true, digits: 1 },
  { key: "wind_speed_10m", label: "Wind at 10 m", unit: "km/h", icon: Wind, color: "var(--green)", digits: 0 },
  { key: "relative_humidity_2m", label: "Relative humidity", unit: "%", icon: Droplets, color: "var(--purple)", digits: 0 },
];

export function RaceDayWeather({ race, results }: { race: RaceData; results: Result[] }) {
  const { lat, long } = race.Circuit.Location;
  const wx = useData(() => climate(lat, long, shift(race.date, -1), shift(race.date, 1), "hourly"), [race.Circuit.circuitId, race.date]);
  const [hover, setHover] = useState<number | null>(null);
  const data = wx.value?.data;
  const offset = data?.utc_offset_seconds;
  const start = sessionDate(race.date, race.time || "12:00:00Z").getTime();
  const localStart = offset !== undefined ? new Date(start + offset * 1000) : null;
  const dayKey = localStart ? localStart.toISOString().slice(0, 10) : race.date;
  const startHour = race.time && localStart ? localStart.getUTCHours() + localStart.getUTCMinutes() / 60 : null;
  const durMs = +(results[0]?.Time?.millis || 0);
  const endHour = startHour !== null && durMs ? startHour + durMs / 3600e3 : null;

  const h = data?.hourly;
  const idx = (h?.time || []).map((t, i) => [t, i] as const).filter(([t]) => t.startsWith(dayKey)).map(([, i]) => i);
  const series = Object.fromEntries(METRICS.map((m) => [m.key, idx.map((i) => (h?.[m.key]?.[i] ?? null) as number | null)])) as Record<Metric["key"], (number | null)[]>;
  const cloud = idx.map((i) => h?.cloud_cover?.[i] ?? null);
  const hasData = idx.length > 0 && series.temperature_2m.some((v) => v !== null);
  const startIdx = startHour !== null ? Math.min(idx.length - 1, Math.floor(startHour)) : null;
  const at = (k: Metric["key"]) => (startIdx !== null ? series[k][startIdx] : null);
  const rainInRace = startHour !== null && endHour !== null
    ? // Each hourly value is the total for the preceding hour.
      series.precipitation.reduce<number>((s, v, i) => (v !== null && i > startHour && i - 1 < endHour ? s + v : s), 0)
    : null;
  const dayLabel = new Date(dayKey + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtH = (x: number) => `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.round((x % 1) * 60)).padStart(2, "0")}`;

  return (
    <Section id="rw-weather" title="Race-day weather" subtitle="How the day unfolded at the circuit, hour by hour, with the race window marked.">
      {wx.loading ? <Skeleton h={420} r={28} /> : wx.error ? <StateView error={wx.error} onRetry={wx.reload} /> : !hasData ? (
        <StateView empty emptyTitle="No reanalysis for this day yet" emptyText="Historical weather reanalysis is published with a delay of several days — check back soon." />
      ) : (
        <Glass className="card rw-hwx reveal">
          <div className="rw-hwx-head">
            <div>
              <span className="eyebrow"><Cloud size={13} />{dayLabel}</span>
              <p className="muted small">{race.Circuit.Location.locality} · circuit local time{data?.timezone ? ` (${data.timezone.replace(/_/g, " ")})` : ""}</p>
            </div>
            <span className="chip blue">Modelled · ERA5 reanalysis</span>
          </div>
          {startIdx !== null ? (
            <div className="rw-hwx-kpis">
              <div className="rw-hwx-kpi"><span className="label"><FlagIcon size={13} />Lights out</span><b>{fmtH(startHour!)}</b><small>{endHour !== null ? `Chequered flag ≈ ${fmtH(endHour % 24)}` : "Local time"}</small></div>
              <div className="rw-hwx-kpi"><span className="label"><Thermometer size={13} />Air at start</span><b>{at("temperature_2m")?.toFixed(1) ?? "—"}°C</b><small>{cloud[startIdx] !== null ? `${cloud[startIdx]}% cloud cover` : " "}</small></div>
              <div className="rw-hwx-kpi"><span className="label"><CloudRain size={13} />Rain in race window</span><b>{rainInRace !== null ? `${rainInRace.toFixed(1)} mm` : "—"}</b><small>{rainInRace ? "Modelled total" : "Dry in the model"}</small></div>
              <div className="rw-hwx-kpi"><span className="label"><Wind size={13} />Wind · humidity</span><b>{at("wind_speed_10m")?.toFixed(0) ?? "—"} km/h</b><small>{at("relative_humidity_2m") ?? "—"}% humidity</small></div>
            </div>
          ) : (
            <div className="notice"><Info /><span>The start time of this race isn't recorded in the archive, so the whole day is shown without a race marker.</span></div>
          )}
          <div className="rw-hwx-grid">
            {METRICS.map((m) => (
              <Mini key={m.key} metric={m} values={series[m.key]} startHour={startHour} endHour={endHour} hover={hover} onHover={setHover} times={idx.map((i) => h!.time[i].slice(11, 16))} />
            ))}
          </div>
          <p className="source"><Info /> Modelled historical weather (ERA5 reanalysis via Open-Meteo) at the circuit coordinates, not trackside measurements. Hourly values{startHour !== null ? "; the shaded band is the race from lights out to the winner's finishing time" : ""}.</p>
          <Source value={wx.value} label="Reanalysis" />
        </Glass>
      )}
    </Section>
  );
}

function Mini({ metric, values, startHour, endHour, hover, onHover, times }: {
  metric: Metric; values: (number | null)[]; startHour: number | null; endHour: number | null; hover: number | null; onHover: (i: number | null) => void; times: string[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 120, pad = { l: 34, r: 8, t: 10, b: 20 };
  const w = Math.max(0, width - pad.l - pad.r), h = H - pad.t - pad.b;
  const n = values.length;
  const nums = values.filter((v): v is number => v !== null);
  const lo = metric.bars ? 0 : Math.floor(Math.min(...nums) - 1), hi = metric.bars ? Math.max(1, ...nums) : Math.ceil(Math.max(...nums) + 1);
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * w);
  const xh = (hour: number) => pad.l + (Math.min(hour, n - 1) / Math.max(1, n - 1)) * w;
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo || 1)) * h;
  const pts = values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join("L");
  const Icon = metric.icon;
  const peak = nums.length ? Math.max(...nums) : null;
  const pick = (cx: number) => {
    const r = ref.current!.getBoundingClientRect();
    onHover(Math.max(0, Math.min(n - 1, Math.round(((cx - r.left - pad.l) / (w || 1)) * (n - 1)))));
  };
  const hv = hover !== null ? values[hover] : null;
  return (
    <div className="rw-mini" style={{ "--c": metric.color } as CSSProperties}>
      <div className="rw-mini-head">
        <span><Icon size={14} />{metric.label}</span>
        <b>{hover !== null ? `${times[hover]} · ${hv === null ? "—" : hv.toFixed(metric.digits)} ${metric.unit}` : peak !== null ? `Peak ${peak.toFixed(metric.digits)} ${metric.unit}` : ""}</b>
      </div>
      <div
        ref={ref}
        className={cx("chart rw-mini-chart")}
        style={{ height: H }}
        tabIndex={0}
        role="img"
        aria-label={`${metric.label} by hour on race day${peak !== null ? `, peaking at ${peak.toFixed(metric.digits)} ${metric.unit}` : ""}`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => onHover(null)}
        onBlur={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); onHover(Math.max(0, Math.min(n - 1, (hover ?? (e.key === "ArrowRight" ? -1 : n)) + (e.key === "ArrowRight" ? 1 : -1)))); }
        }}
      >
        {!nums.length && <p className="faint xsmall rw-mini-empty">No modelled values for this day.</p>}
        {width > 0 && n > 1 && nums.length > 0 && (
          <svg width={width} height={H} aria-hidden>
            {startHour !== null && (
              <rect className="rw-mini-race" x={xh(startHour)} y={pad.t} width={Math.max(2, xh(endHour ?? startHour + 0.05) - xh(startHour))} height={h} />
            )}
            {[lo, (lo + hi) / 2, hi].map((t, k) => (
              <g key={k}>
                <line className="gridline" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
                <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{metric.bars ? t.toFixed(t < 2 ? 1 : 0) : Math.round(t)}</text>
              </g>
            ))}
            {[0, 6, 12, 18, 23].filter((i) => i < n).map((i, k, all) => <text key={i} className="axis" x={x(i)} y={H - 4} textAnchor={k === 0 ? "start" : k === all.length - 1 ? "end" : "middle"}>{times[i]}</text>)}
            {metric.bars
              ? values.map((v, i) => (v !== null && v > 0 ? <rect key={i} x={x(i) - Math.max(2, w / n / 2 - 1.5)} y={y(v)} width={Math.max(3, w / n - 3)} height={Math.max(1, pad.t + h - y(v))} rx={2} className="rw-mini-bar" /> : null))
              : <path d={"M" + pts} className="rw-mini-line" />}
            {startHour !== null && <line className="rw-mini-start" x1={xh(startHour)} x2={xh(startHour)} y1={pad.t - 4} y2={pad.t + h} />}
            {hover !== null && (
              <g>
                <line className="cursor" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />
                {hv !== null && <circle className="dot" cx={x(hover)} cy={y(hv)} r={4} style={{ fill: metric.color }} />}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
