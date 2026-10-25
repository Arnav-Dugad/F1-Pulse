/* Race weekend · qualifying lap overlay (OpenF1 laps + car data, 2023 onward). */
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Activity, ArrowRight, Gauge, Info, Layers, Timer } from "lucide-react";
import { request, sessions } from "../api";
import { Link } from "../lib/router";
import { fullName, teamColor } from "../lib/media";
import { lapTime, sessionDate } from "../lib/format";
import { distanceTrace, lapDelta } from "../math.mjs";
import { interpAt } from "../lab.mjs";
import { sectorMarks, slowestCorners } from "../race-x.mjs";
import { Glass, Skeleton, StateView, cx } from "../ui/core";
import { DriverAvatar } from "../ui/media";
import type { ArchiveDriver, CarSample, Envelope, Lap, Race as RaceData, Result, Session } from "../types";
import { codeOf, useWidth } from "./_raceData";
import "./_raceX.css";

/* ───────── helpers ───────── */
const rgb = (hex: string) => {
  const v = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
/** Team colours for the pair; team-mates (or near-identical liveries) get a contrasting second colour. */
function pairColours(a: Result, b: Result): [string, string] {
  const ca = teamColor(a.Constructor), cb = teamColor(b.Constructor);
  if (/^#[0-9a-f]{6}/i.test(ca) && /^#[0-9a-f]{6}/i.test(cb) && dist(ca, cb) > 70) return [ca, cb];
  if (!/^#[0-9a-f]{6}/i.test(ca)) return [ca, "#64D2FF"];
  return [ca, dist(ca, "#64D2FF") > 110 ? "#64D2FF" : "#FF9F0A"];
}
const validLap = (l: Lap) => !!l.date_start && l.lap_duration !== null && l.lap_duration > 0 && l.lap_duration <= 180 && !l.is_pit_out_lap;
const lapEnd = (l: Lap) => new Date(Date.parse(l.date_start!) + l.lap_duration! * 1000).toISOString();
const signed = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}`);

/** Match a Jolpica qualifier to the OpenF1 entry list: acronym, then race number, then surname. */
function matchDriver(r: Result, list: ArchiveDriver[]) {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return (
    list.find((d) => !!r.Driver.code && d.name_acronym === r.Driver.code) ||
    list.find((d) => !!r.Driver.permanentNumber && d.driver_number === +r.Driver.permanentNumber!) ||
    list.find((d) => fold(d.full_name).endsWith(fold(r.Driver.familyName)))
  );
}

type Row = CarSample & { t: number; d: number };
type Side = { r: Result; driver: ArchiveDriver; lap: Lap; rows: Row[] };
type Loaded = { session: Session; a: Side; b: Side; meta?: Envelope<unknown>["meta"] };
type Stage = { step: number; label: string };

/* ───────── data hook ───────── */
function useOverlay(race: RaceData, open: boolean, idA: string, idB: string, rows: Result[]) {
  const [state, set] = useState<{ sig: string; loading: boolean; stage?: Stage; data?: Loaded; error?: string }>({ sig: "", loading: false });
  const [retry, setRetry] = useState(0);
  const sig = [open, idA, idB, retry].join(":");
  useEffect(() => {
    if (!open || !idA || !idB || idA === idB) return;
    let live = true;
    const put = (v: Omit<typeof state, "sig">) => live && set({ sig, ...v });
    (async () => {
      try {
        put({ loading: true, stage: { step: 1, label: "Finding the qualifying session…" } });
        const list = await sessions(race.season);
        const target = sessionDate(race.date, race.time || "12:00:00Z").getTime();
        const near = (x: Session) => Math.abs(Date.parse(x.date_start) - target);
        const raceSession = list.data.filter((x) => x.session_name === "Race" && near(x) < 36 * 3600e3).sort((x, y) => near(x) - near(y))[0];
        const qTarget = race.Qualifying ? sessionDate(race.Qualifying.date, race.Qualifying.time).getTime() : target - 864e5;
        const session =
          (raceSession && list.data.find((x) => x.meeting_key === raceSession.meeting_key && x.session_name === "Qualifying")) ||
          list.data.filter((x) => x.session_name === "Qualifying" && Math.abs(Date.parse(x.date_start) - qTarget) < 36 * 3600e3)[0];
        if (!session) throw Error("OpenF1 hasn't published this qualifying session in its archive yet.");
        put({ loading: true, stage: { step: 2, label: "Loading the entry list and every qualifying lap…" } });
        const [drivers, laps] = await Promise.all([
          request<ArchiveDriver[]>("openf1", "drivers", { session_key: session.session_key }),
          request<Lap[]>("openf1", "laps", { session_key: session.session_key }),
        ]);
        const side = async (id: string, step: number): Promise<Side> => {
          const r = rows.find((x) => x.Driver.driverId === id)!;
          const driver = matchDriver(r, drivers.data || []);
          if (!driver) throw Error(`${fullName(r.Driver)} isn't in the OpenF1 entry list for this session.`);
          const best = (laps.data || []).filter((l) => l.driver_number === driver.driver_number && validLap(l)).sort((x, y) => x.lap_duration! - y.lap_duration!)[0];
          if (!best) throw Error(`OpenF1 has no valid timed lap for ${fullName(r.Driver)} in this session.`);
          put({ loading: true, stage: { step, label: `Car data · ${codeOf(r)} lap ${best.lap_number} (${lapTime(best.lap_duration)})…` } });
          const car = await request<CarSample[]>("openf1", "car_data", { session_key: session.session_key, driver_number: driver.driver_number, "date>=": best.date_start!, "date<=": lapEnd(best) });
          const samples = [...(car.data || [])].filter((s) => s && s.date && Number.isFinite(s.speed)).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
          if (samples.length < 10) throw Error(`Not enough car-data samples for ${fullName(r.Driver)}'s lap.`);
          const start = Date.parse(best.date_start!);
          return { r, driver, lap: best, rows: samples.map((s) => ({ ...s, t: (Date.parse(s.date) - start) / 1000, d: NaN })) };
        };
        const a = await side(idA, 3);
        const b = await side(idB, 4);
        put({ loading: false, data: { session, a, b, meta: laps.meta } });
      } catch (e) {
        put({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = state.sig === sig;
  return {
    loading: open && (!fresh || state.loading),
    stage: fresh ? state.stage : undefined,
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    retry: () => setRetry((x) => x + 1),
  };
}

/* ───────── component ───────── */
export function QualiOverlay({ race, rows, year }: { race: RaceData; rows: Result[]; year: string }) {
  const pole = rows.find((r) => r.position === "1") || rows[0];
  // A team-mate who set no time (crash, penalty, no-show) has no lap to overlay: fall back to the next qualifier.
  const timed = (r: Result) => !!(r.Q1 || r.Q2 || r.Q3);
  const mate = rows.find((r) => r !== pole && timed(r) && r.Constructor.constructorId === pole?.Constructor.constructorId) || rows.find((r) => r !== pole && timed(r)) || rows.find((r) => r !== pole);
  const pairMates = !!mate && mate.Constructor.constructorId === pole?.Constructor.constructorId;
  const [open, setOpen] = useState(false);
  const [idA, setA] = useState(pole?.Driver.driverId || "");
  const [idB, setB] = useState(mate?.Driver.driverId || "");
  const ov = useOverlay(race, open, idA, idB, rows);
  if (!pole || !mate || +race.season < 2023) return null;
  const rA = rows.find((r) => r.Driver.driverId === idA) || pole, rB = rows.find((r) => r.Driver.driverId === idB) || mate;
  const colours = pairColours(rA, rB);
  const isDefault = idA === pole.Driver.driverId && idB === mate.Driver.driverId;
  const pick = (side: "a" | "b", v: string) => {
    if (side === "a") { if (v === idB) setB(idA); setA(v); } else { if (v === idA) setA(idB); setB(v); }
  };

  return (
    <Glass className="card rq reveal" style={{ "--ca": colours[0], "--cb": colours[1] } as CSSProperties}>
      <div className="rq-head">
        <div>
          <h3><Activity size={16} />Lap overlay</h3>
          <p className="muted small">{isDefault && pairMates ? <>The pole lap against the pole-sitter's team-mate — measured speed along the lap, where the time went and how fast each car took the slowest corners.</> : <>Best laps of two qualifiers — measured speed along the lap, where the time went and the slowest-corner minimum speeds.</>}</p>
        </div>
        <span className="chip yellow">Distance estimated</span>
      </div>
      <div className="rq-pick" role="group" aria-label="Drivers to overlay">
        {(["a", "b"] as const).map((side, i) => {
          const r = side === "a" ? rA : rB;
          return (
            <label key={side} className="rq-picker" style={{ "--tint": colours[i] } as CSSProperties}>
              <DriverAvatar id={r.Driver.driverId} name={fullName(r.Driver)} year={year} team={r.Constructor.constructorId} size={34} />
              <span className="rq-picker-text"><small>Driver {side.toUpperCase()} · P{r.position}</small><strong>{fullName(r.Driver)}</strong></span>
              <select value={side === "a" ? idA : idB} onChange={(e) => pick(side, e.target.value)} aria-label={`Driver ${side.toUpperCase()} for the lap overlay`}>
                {rows.map((x) => <option key={x.Driver.driverId} value={x.Driver.driverId}>P{x.position} · {fullName(x.Driver)}</option>)}
              </select>
            </label>
          );
        })}
        {!isDefault && <button className="btn sm plain" onClick={() => { setA(pole.Driver.driverId); setB(mate.Driver.driverId); }}>{pairMates ? "Pole vs team-mate" : "Pole vs next qualifier"}</button>}
      </div>

      {!open ? (
        <div className="rq-cta">
          <p className="muted small"><Info size={14} />Loads on request from the OpenF1 archive: the session's laps plus one bounded car-data window per driver (about four requests).</p>
          <button className="btn primary" onClick={() => setOpen(true)}><Gauge />Load lap overlay</button>
        </div>
      ) : ov.loading ? (
        <div className="rq-loading" role="status" aria-live="polite">
          <div className="rq-progress"><div className="spinner" aria-hidden /><span><strong>{ov.stage?.label || "Preparing…"}</strong><small className="faint">Step {ov.stage?.step || 1} of 4 · OpenF1 requests are queued to respect the provider's rate limit.</small></span></div>
          <Skeleton h={300} r={20} />
        </div>
      ) : ov.error ? (
        /no valid timed lap/.test(ov.error)
          ? <StateView compact empty emptyTitle="No lap to overlay" emptyText={ov.error + " Pick another driver."} />
          : <StateView compact error={ov.error} onRetry={ov.retry} />
      ) : ov.data ? (
        <OverlayBody data={ov.data} colours={colours} />
      ) : null}
    </Glass>
  );
}

function OverlayBody({ data, colours }: { data: Loaded; colours: [string, string] }) {
  const { a, b, session } = data;
  const model = useMemo(() => {
    try {
      const ta = distanceTrace(a.rows), tb = distanceTrace(b.rows);
      const rowsA = a.rows.map((r, i) => ({ ...r, d: ta[i].distance })), rowsB = b.rows.map((r, i) => ({ ...r, d: tb[i].distance }));
      const delta = lapDelta(ta, tb, 300).filter((p) => Number.isFinite(p.delta));
      const sectors = sectorMarks(rowsA, a.lap.duration_sector_1, a.lap.duration_sector_2);
      const corners = slowestCorners(rowsA, rowsB, 5);
      return { rowsA, rowsB, delta, sectors, corners, error: "" };
    } catch (e) {
      return { rowsA: [] as Row[], rowsB: [] as Row[], delta: [], sectors: [] as number[], corners: [], error: (e as Error).message };
    }
  }, [a, b]);
  const [cursor, setCursor] = useState<number | null>(null);
  const names: [string, string] = [codeOf(a.r), codeOf(b.r)];
  const lapGap = b.lap.lap_duration! - a.lap.lap_duration!;
  const keys = ["duration_sector_1", "duration_sector_2", "duration_sector_3"] as const;
  const href = `telemetry?type=quali&s=${session.session_key}&a=${a.driver.driver_number}&b=${b.driver.driver_number}&la=${a.lap.lap_number}&lb=${b.lap.lap_number}`;

  return (
    <div className="rq-body">
      <div className="rq-kpis">
        {[a, b].map((s, i) => (
          <div key={i} className="rq-kpi" style={{ "--tint": colours[i] } as CSSProperties}>
            <span className="label"><i className="rq-dot" />{names[i]} · lap {s.lap.lap_number}</span>
            <b>{lapTime(s.lap.lap_duration)}</b>
            <small>Top {Math.round(Math.max(...s.rows.map((r) => r.speed)))} km/h</small>
          </div>
        ))}
        <div className="rq-kpi" style={{ "--tint": lapGap > 0 ? colours[0] : colours[1] } as CSSProperties}>
          <span className="label"><Timer size={13} />Lap gap · B − A</span>
          <b>{signed(lapGap)}<small> s</small></b>
          <small>{Math.abs(lapGap) < 0.0005 ? "Identical laps" : `${lapGap > 0 ? names[0] : names[1]} quicker`}</small>
        </div>
        <div className="rq-kpi rq-sectors">
          <span className="label"><Layers size={13} />Sectors · B − A</span>
          <span className="rq-sector-row">
            {keys.map((k, i) => {
              const v = a.lap[k] !== null && b.lap[k] !== null ? b.lap[k]! - a.lap[k]! : null;
              return <span key={k} style={{ color: v === null || Math.abs(v) < 0.0005 ? undefined : v > 0 ? colours[0] : colours[1] }}><small>S{i + 1}</small>{signed(v)}</span>;
            })}
          </span>
        </div>
      </div>

      {model.error ? (
        <div className="notice"><Info /><span><strong>{model.error}.</strong> One of the laps has a car-data gap over three seconds, so speed can't be integrated into an estimated distance. Open the Telemetry lab to compare the laps on time instead.</span></div>
      ) : (
        <>
          <Traces model={model} colours={colours} names={names} cursor={cursor} onCursor={setCursor} />
          {model.corners.length > 0 && (
            <div className="rq-corners">
              <span className="eyebrow">Slowest corners · minimum speed</span>
              <div className="table-wrap" tabIndex={0}>
                <table className="tbl rq-tbl">
                  <caption className="sr-only">Minimum speed of both drivers at the slowest automatically detected corners</caption>
                  <thead><tr><th scope="col">Corner</th><th scope="col" className="r">At (est.)</th><th scope="col" className="r" style={{ color: colours[0] }}>{names[0]}</th><th scope="col" className="r" style={{ color: colours[1] }}>{names[1]}</th><th scope="col" className="r">A − B</th></tr></thead>
                  <tbody>
                    {model.corners.map((c) => (
                      <tr key={c.n} className={cx(cursor !== null && Math.abs(cursor - c.apex) < 80 && "on")} onPointerEnter={() => setCursor(c.apex)} onPointerLeave={() => setCursor(null)}>
                        <td><span className="rq-pin">{c.n}</span></td>
                        <td className="r">{Math.round(c.apex).toLocaleString()} m</td>
                        <td className="r">{Math.round(c.a)} km/h</td>
                        <td className="r">{Math.round(c.b)} km/h</td>
                        <td className="r"><b style={{ color: c.diff === null || Math.abs(c.diff) < 1 ? undefined : c.diff > 0 ? colours[0] : colours[1] }}>{c.diff === null ? "—" : `${c.diff > 0 ? "+" : c.diff < 0 ? "−" : "±"}${Math.abs(Math.round(c.diff))}`}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="rq-foot">
        <p className="source">
          OpenF1 lap and car data (≈ 3–4 Hz samples), each driver's fastest valid lap in the session. Distance is <strong>estimated</strong> by integrating speed over time and isn't rescaled to the official lap length; the delta compares elapsed time at equal estimated distance, so small integration errors accumulate.
          Sector lines use {names[0]}'s measured sector times; corners come from automated braking-zone detection (a drop of 25 km/h or more with the brake applied), numbered in lap order.
        </p>
        <Link className="btn sm" to={href}>Open in Telemetry lab<ArrowRight /></Link>
      </div>
    </div>
  );
}

/* ───────── speed + delta chart ───────── */
const PAD_L = 44, PAD_R = 12;
function Traces({ model, colours, names, cursor, onCursor }: {
  model: { rowsA: Row[]; rowsB: Row[]; delta: { distance: number; delta: number }[]; sectors: number[]; corners: { n: number; apex: number; a: number; b: number }[] };
  colours: [string, string]; names: [string, string]; cursor: number | null; onCursor: (d: number | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { rowsA, rowsB, delta, sectors, corners } = model;
  const end = Math.min(rowsA.at(-1)?.d || 0, rowsB.at(-1)?.d || 0) || 1;
  const w = Math.max(1, width - PAD_L - PAD_R);
  const SH = 210, DT = SH + 34, DH = 96, H = DT + DH + 26;
  const sx = (d: number) => PAD_L + (d / end) * w;
  const vMax = Math.ceil((Math.max(...rowsA.map((r) => r.speed), ...rowsB.map((r) => r.speed)) + 5) / 50) * 50;
  const vMin = Math.max(0, Math.floor((Math.min(...rowsA.map((r) => r.speed), ...rowsB.map((r) => r.speed)) - 10) / 50) * 50);
  const sy = (v: number) => 10 + (1 - (v - vMin) / (vMax - vMin || 1)) * (SH - 10);
  const dAbs = Math.max(0.05, ...delta.map((p) => Math.abs(p.delta)));
  const dy = (v: number) => DT + DH / 2 - (v / dAbs) * (DH / 2 - 4);
  const path = (rows: Row[]) => rows.filter((r) => r.d <= end + 1).map((r, i) => `${i ? "L" : "M"}${sx(r.d).toFixed(1)},${sy(r.speed).toFixed(1)}`).join("");
  const dPath = delta.map((p, i) => `${i ? "L" : "M"}${sx(p.distance).toFixed(1)},${dy(p.delta).toFixed(1)}`).join("");
  const ticks = useMemo(() => {
    const step = end > 4000 ? 1000 : 500;
    return Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  }, [end]);
  const at = (rows: Row[], d: number) => interpAt(rows, "d", "speed", d);
  const dAt = (d: number) => interpAt(delta, "distance", "delta", d);
  const local = (e: ReactPointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(end, ((e.clientX - rect.left - PAD_L) / w) * end));
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") { if (e.key === "Escape") onCursor(null); return; }
    e.preventDefault();
    const step = end / (e.shiftKey ? 20 : 100);
    onCursor(Math.max(0, Math.min(end, (cursor ?? 0) + (e.key === "ArrowRight" ? step : -step))));
  };
  const sA = cursor !== null ? at(rowsA, cursor) : null, sB = cursor !== null ? at(rowsB, cursor) : null, dv = cursor !== null ? dAt(cursor) : null;
  const finalDelta = delta.at(-1)?.delta ?? null;

  return (
    <div className="rq-chart">
      <div className="rq-legend">
        <span><i style={{ background: colours[0] }} />{names[0]}</span>
        <span><i style={{ background: colours[1] }} />{names[1]}</span>
        <span className="rq-readout" aria-live="off">
          {cursor === null ? <span className="faint">Hover or use ← → to scrub the lap</span> : (
            <>
              <b>{Math.round(cursor).toLocaleString()} m</b>
              <span style={{ color: colours[0] }}>{sA !== null ? Math.round(sA) : "—"}</span>
              <span style={{ color: colours[1] }}>{sB !== null ? Math.round(sB) : "—"}</span>
              <span>km/h · Δ {signed(dv)} s</span>
            </>
          )}
        </span>
      </div>
      <div ref={ref} className="rq-svg-wrap" tabIndex={0} role="group" onKeyDown={onKey}
        aria-label={`Speed against estimated distance for ${names[0]} and ${names[1]}, with the estimated time delta below. Final estimated delta ${signed(finalDelta)} seconds. Use left and right arrows to move the crosshair.`}>
        {width > 0 && (
          <svg width={width} height={H} aria-hidden>
            {[vMin, (vMin + vMax) / 2, vMax].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={PAD_L + w} y1={sy(v)} y2={sy(v)} className="rq-grid" />
                <text x={PAD_L - 6} y={sy(v) + 4} textAnchor="end" className="rq-tick">{Math.round(v)}</text>
              </g>
            ))}
            <text x={PAD_L} y={8} className="rq-axis-label">SPEED km/h</text>
            {sectors.map((s, i) => (
              <g key={i}>
                <line x1={sx(s)} x2={sx(s)} y1={10} y2={DT + DH} className="rq-sector" />
                <text x={sx(s) + 4} y={22} className="rq-sector-text">S{i + 1}│S{i + 2}</text>
              </g>
            ))}
            <path d={path(rowsB)} stroke={colours[1]} className="rq-line" />
            <path d={path(rowsA)} stroke={colours[0]} className="rq-line" />
            {corners.map((c) => {
              const v = Math.min(c.a, c.b);
              return (
                <g key={c.n} className="rq-corner">
                  <circle cx={sx(c.apex)} cy={sy(v) + 14} r={8} />
                  <text x={sx(c.apex)} y={sy(v) + 17.5} textAnchor="middle">{c.n}</text>
                </g>
              );
            })}
            <rect x={PAD_L} y={DT} width={w} height={DH} rx={8} className="rq-delta-bg" />
            <line x1={PAD_L} x2={PAD_L + w} y1={dy(0)} y2={dy(0)} className="rq-zero" />
            <text x={PAD_L} y={DT - 8} className="rq-axis-label">ESTIMATED DELTA · B − A (s)</text>
            <text x={PAD_L - 6} y={DT + 12} textAnchor="end" className="rq-tick">+{dAbs.toFixed(2)}</text>
            <text x={PAD_L - 6} y={DT + DH - 4} textAnchor="end" className="rq-tick">−{dAbs.toFixed(2)}</text>
            <text x={PAD_L + 6} y={DT + 13} className="rq-delta-note" style={{ fill: colours[0] }}>{names[0]} ahead ↑</text>
            <text x={PAD_L + 6} y={DT + DH - 6} className="rq-delta-note" style={{ fill: colours[1] }}>{names[1]} ahead ↓</text>
            <path d={dPath} className="rq-delta-line" />
            {ticks.map((t) => <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" className="rq-tick">{t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)} km` : `${t} m`}</text>)}
            {cursor !== null && (
              <g className="rq-cursor">
                <line x1={sx(cursor)} x2={sx(cursor)} y1={10} y2={DT + DH} />
                {sA !== null && <circle cx={sx(cursor)} cy={sy(sA)} r={4} fill={colours[0]} />}
                {sB !== null && <circle cx={sx(cursor)} cy={sy(sB)} r={4} fill={colours[1]} />}
                {dv !== null && <circle cx={sx(cursor)} cy={dy(dv)} r={3.5} className="rq-cursor-delta" />}
              </g>
            )}
            <rect x={PAD_L} y={0} width={w} height={DT + DH} className="rq-hit"
              onPointerMove={(e) => onCursor(local(e))} onPointerDown={(e) => onCursor(local(e))}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") onCursor(null); }} />
          </svg>
        )}
      </div>
    </div>
  );
}

