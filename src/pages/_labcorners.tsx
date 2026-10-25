/**
 * Automated corner analysis (Telemetry lab): braking zones detected from the speed trace on estimated
 * distance, numbered in lap order, compared per corner for both drivers. Linked to the shared crosshair.
 */
import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { CornerDownRight, Crosshair, ScanSearch, ZoomIn } from "lucide-react";
import { cornerMetrics, detectCorners, interpAt, mergeCorners, windowDelta } from "../lab.mjs";
import { Glass, Segmented, cx } from "../ui/core";
import { signed } from "./_archive";
import "./_lab.css";

type Row = { d: number; t: number; speed: number; brake: number };
type Delta = { distance: number; delta: number }[];
const EXITS = ["50", "100", "150"] as const;
type Exit = (typeof EXITS)[number];

export type CornerResult = ReturnType<typeof useCorners>[number];

function useCorners(rowsA: Row[], rowsB: Row[], delta: Delta, exit: number) {
  return useMemo(() => {
    const ok = (r: Row[]) => r.filter((x) => Number.isFinite(x.d));
    const a = ok(rowsA), b = ok(rowsB);
    if (a.length < 10 || b.length < 10) return [];
    const merged = mergeCorners(detectCorners(a), detectCorners(b));
    const end = Math.min(a.at(-1)!.d, b.at(-1)!.d);
    return merged
      .filter((c) => c.apex + exit <= end)
      .map((c, i, list) => {
        const prev = list[i - 1]?.apex ?? -Infinity, next = list[i + 1]?.apex ?? Infinity;
        const from = Number.isFinite(prev) ? prev + 40 : -Infinity;
        const to = Number.isFinite(next) ? next - 40 : Infinity;
        const ma = cornerMetrics(a, c.apex, { exit, from, to }), mb = cornerMetrics(b, c.apex, { exit, from, to });
        const brakes = [ma.brakeD, mb.brakeD].filter((v): v is number => v !== null);
        const w0 = Math.max(Number.isFinite(prev) ? prev : 0, (brakes.length ? Math.min(...brakes) : c.apex - 150) - 30, 0);
        const w1 = c.apex + exit;
        return { ...c, n: i + 1, a: ma, b: mb, w0, w1, dt: windowDelta(delta, w0, w1) };
      });
  }, [rowsA, rowsB, delta, exit]);
}

export function CornerAnalysis({ rowsA, rowsB, delta, colours, names, cursor, onCursor, onZoom }: {
  rowsA: Row[]; rowsB: Row[]; delta: Delta; colours: [string, string]; names: [string, string];
  cursor: number | null; onCursor: (d: number | null) => void; onZoom: (w: [number, number]) => void;
}) {
  const [exitPref, setExit] = useState<Exit>("100");
  const exit = +exitPref;
  const corners = useCorners(rowsA, rowsB, delta, exit);
  const active = cursor === null ? -1 : corners.findIndex((c) => cursor >= c.w0 - 120 && cursor <= c.w1 + 60);
  if (!corners.length)
    return (
      <Glass className="lab-empty">
        <ScanSearch />
        <div><strong>No braking zones detected</strong><p className="muted small">The automated detector needs a speed drop of at least 25 km/h with the brake applied. These traces don't show one with enough samples.</p></div>
      </Glass>
    );
  const known = corners.filter((c) => c.dt !== null);
  const total = known.reduce((s, c) => s + c.dt!, 0);
  const aWins = known.filter((c) => c.dt! > 0.0005).length, bWins = known.filter((c) => c.dt! < -0.0005).length;
  const lapGap = delta.filter((p) => Number.isFinite(p.delta)).at(-1)?.delta ?? null;
  const maxAbs = Math.max(0.02, ...known.map((c) => Math.abs(c.dt!)));
  const fmtD = (v: number | null) => (v === null ? "—" : `${Math.round(v).toLocaleString()} m`);
  const fmtV = (v: number | null) => (v === null ? "—" : `${Math.round(v)}`);
  return (
    <div className="lab-corners">
      <div className="lab-corner-kpis">
        <Glass className="lab-kpi reveal"><span className="eyebrow">Braking zones</span><b>{corners.length}</b><small>detected automatically</small></Glass>
        <Glass className="lab-kpi reveal" style={{ "--i": 1, "--tint": colours[0] } as CSSProperties}><span className="eyebrow">{names[0]} quicker</span><b>{aWins}</b><small>of {known.length} corner windows</small></Glass>
        <Glass className="lab-kpi reveal" style={{ "--i": 2, "--tint": colours[1] } as CSSProperties}><span className="eyebrow">{names[1]} quicker</span><b>{bWins}</b><small>of {known.length} corner windows</small></Glass>
        <Glass className="lab-kpi reveal" style={{ "--i": 3 } as CSSProperties}>
          <span className="eyebrow">Net in corners · B − A</span>
          <b style={{ color: Math.abs(total) < 0.0005 ? undefined : total > 0 ? colours[0] : colours[1] }}>{signed(total)}<small> s</small></b>
          <small>{lapGap !== null ? <>whole-lap estimate {signed(lapGap)} s · straights {signed(lapGap - total)} s</> : "estimated"}</small>
        </Glass>
      </div>

      <Glass className="card flush lab-corner-table reveal">
        <div className="lab-table-head">
          <span className="small muted"><Crosshair size={14} />Hover a row to move the crosshair · select it to zoom the traces</span>
          <span className="lab-exit">
            <span className="xsmall faint">Exit speed at apex +</span>
            <Segmented<Exit> label="Exit speed distance after the apex" value={exitPref} onChange={setExit} options={EXITS.map((e) => ({ value: e, label: `${e} m` }))} />
          </span>
        </div>
        <div className="table-wrap" tabIndex={0}>
          <table className="tbl lab-tbl">
            <thead>
              <tr>
                <th>Corner</th>
                <th className="r">Apex <small>est.</small></th>
                <th className="r" colSpan={2}>Brake point <small>est. distance</small></th>
                <th className="r">Brake Δ</th>
                <th className="r" colSpan={2}>Min speed <small>km/h</small></th>
                <th className="r" colSpan={2}>Exit <small>km/h</small></th>
                <th className="lab-th-time">Time in window <small>B − A</small></th>
              </tr>
              <tr className="lab-subhead">
                <th /><th />
                <th className="r" style={{ color: colours[0] }}>{names[0]}</th><th className="r" style={{ color: colours[1] }}>{names[1]}</th><th />
                <th className="r" style={{ color: colours[0] }}>{names[0]}</th><th className="r" style={{ color: colours[1] }}>{names[1]}</th>
                <th className="r" style={{ color: colours[0] }}>{names[0]}</th><th className="r" style={{ color: colours[1] }}>{names[1]}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {corners.map((c, i) => {
                const bd = c.a.brakeD !== null && c.b.brakeD !== null ? c.b.brakeD - c.a.brakeD : null;
                const better = (x: number | null, y: number | null) => (x === null || y === null || Math.abs(x - y) < 1 ? 0 : x > y ? 1 : -1);
                const minW = better(c.a.minSpeed, c.b.minSpeed), exW = better(c.a.exitSpeed, c.b.exitSpeed);
                return (
                  <tr key={c.n} className={cx("lab-corner-row", active === i && "on")} tabIndex={0}
                    onPointerEnter={() => onCursor(c.apex)} onFocus={() => onCursor(c.apex)}
                    onClick={() => onZoom([Math.max(0, c.w0 - 150), c.w1 + 150])}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onZoom([Math.max(0, c.w0 - 150), c.w1 + 150]); } }}
                    aria-label={`Corner ${c.n}: select to zoom the traces`}>
                    <td><span className="lab-cno">C{c.n}</span>{c.seenBy !== "both" && <small className="faint" title={`Detected only on ${c.seenBy === "a" ? names[0] : names[1]}'s trace`}> · {c.seenBy === "a" ? names[0] : names[1]} only</small>}</td>
                    <td className="r">{fmtD(c.apex)}</td>
                    <td className="r">{fmtD(c.a.brakeD)}</td>
                    <td className="r">{fmtD(c.b.brakeD)}</td>
                    <td className="r lab-muted-num">{bd === null ? "—" : Math.abs(bd) < 5 ? "≈ same" : `${names[1]} ${Math.abs(Math.round(bd))} m ${bd > 0 ? "later" : "earlier"}`}</td>
                    <td className={cx("r", minW > 0 && "lab-win")} style={{ "--c": colours[0] } as CSSProperties}>{fmtV(c.a.minSpeed)}</td>
                    <td className={cx("r", minW < 0 && "lab-win")} style={{ "--c": colours[1] } as CSSProperties}>{fmtV(c.b.minSpeed)}</td>
                    <td className={cx("r", exW > 0 && "lab-win")} style={{ "--c": colours[0] } as CSSProperties}>{fmtV(c.a.exitSpeed)}</td>
                    <td className={cx("r", exW < 0 && "lab-win")} style={{ "--c": colours[1] } as CSSProperties}>{fmtV(c.b.exitSpeed)}</td>
                    <td>
                      <span className="lab-dt">
                        <i style={{ "--w": c.dt === null ? 0 : Math.min(1, Math.abs(c.dt) / maxAbs), "--c": c.dt !== null && c.dt > 0 ? colours[0] : colours[1], "--dir": c.dt !== null && c.dt > 0 ? -1 : 1 } as CSSProperties} />
                        <b>{signed(c.dt)}</b>
                        <button type="button" className="icon-btn lab-zoom" aria-label={`Zoom traces to corner ${c.n}`} onClick={(e) => { e.stopPropagation(); onZoom([Math.max(0, c.w0 - 150), c.w1 + 150]); }}><ZoomIn /></button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Glass>

      <div className="lab-multiples">
        {corners.map((c, i) => (
          <CornerMultiple key={c.n} c={c} rowsA={rowsA} rowsB={rowsB} exit={exit} colours={colours} names={names} cursor={cursor} onCursor={onCursor} active={active === i} i={i} />
        ))}
      </div>
      <p className="source">
        <strong>Automated detection on estimated distance.</strong> A braking zone is a local speed minimum (lowest point within ±150 m) at least 25 km/h below the preceding peak with the brake applied in between,
        found on either driver's trace and matched within 150 m. Corners are numbered in lap order — they are not official turn numbers, and a chicane may count once. Brake point = start of the last continuous
        brake application before the minimum (sample resolution ≈ {Math.round(estimateSpacing(rowsA))} m at speed). Time in window is the change in the estimated delta from just before the earlier brake point to apex + {exit} m:
        positive means {names[1]} lost time. Small integration errors accumulate, so treat values under ~0.02 s as noise.
      </p>
    </div>
  );
}

function estimateSpacing(rows: Row[]) {
  const steps: number[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].speed > 250) steps.push(rows[i].d - rows[i - 1].d);
  return steps.length ? steps.reduce((s, v) => s + v, 0) / steps.length : 20;
}

/* ───────────────────────── Small multiple ───────────────────────── */
function CornerMultiple({ c, rowsA, rowsB, exit, colours, names, cursor, onCursor, active, i }: {
  c: CornerResult; rowsA: Row[]; rowsB: Row[]; exit: number; colours: [string, string]; names: [string, string];
  cursor: number | null; onCursor: (d: number | null) => void; active: boolean; i: number;
}) {
  const W = 240, H = 120, padT = 10, padB = 18;
  const x0 = Math.max(0, c.w0 - 120), x1 = c.apex + exit + 120;
  const pick = (rows: Row[]) => rows.filter((r) => r.d >= x0 - 30 && r.d <= x1 + 30);
  const pa = pick(rowsA), pb = pick(rowsB);
  const all = [...pa, ...pb].map((r) => r.speed);
  const lo = all.length ? Math.max(0, Math.floor((Math.min(...all) - 15) / 20) * 20) : 0;
  const hi = all.length ? Math.ceil((Math.max(...all) + 5) / 20) * 20 : 350;
  const sx = (d: number) => ((d - x0) / (x1 - x0 || 1)) * W;
  const sy = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const path = (rows: Row[]) => rows.map((r, k) => `${k ? "L" : "M"}${sx(r.d).toFixed(1)},${sy(r.speed).toFixed(1)}`).join("");
  const showCursor = cursor !== null && cursor >= x0 && cursor <= x1;
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onCursor(x0 + ((e.clientX - rect.left) / rect.width) * (x1 - x0));
  };
  const va = showCursor ? interpAt(pa, "d", "speed", cursor!) : null, vb = showCursor ? interpAt(pb, "d", "speed", cursor!) : null;
  return (
    <motion.div className={cx("glass lab-mult reveal", active && "on")} style={{ "--i": Math.min(i, 8) } as CSSProperties} layout="position">
      <div className="lab-mult-head">
        <span className="lab-cno">C{c.n}</span>
        <span className="faint xsmall">{Math.round(c.apex).toLocaleString()} m</span>
        <b className="lab-mult-dt" style={{ color: c.dt === null || Math.abs(c.dt) < 0.0005 ? undefined : c.dt > 0 ? colours[0] : colours[1] }}>{signed(c.dt)} s</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lab-mult-svg" role="img" preserveAspectRatio="none"
        aria-label={`Corner ${c.n} speed traces: ${names[0]} minimum ${c.a.minSpeed ?? "unknown"} km/h, ${names[1]} minimum ${c.b.minSpeed ?? "unknown"} km/h`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={(e) => e.pointerType === "mouse" && onCursor(null)}>
        <rect x={sx(c.w0)} y={0} width={Math.max(0, sx(c.w1) - sx(c.w0))} height={H - padB} className="lab-mult-win" />
        <line x1={sx(c.apex)} x2={sx(c.apex)} y1={0} y2={H - padB} className="lab-mult-apex" />
        <line x1={sx(c.apex + exit)} x2={sx(c.apex + exit)} y1={0} y2={H - padB} className="lab-mult-exit" />
        <path d={path(pb)} stroke={colours[1]} className="lab-mult-line" vectorEffect="non-scaling-stroke" />
        <path d={path(pa)} stroke={colours[0]} className="lab-mult-line" vectorEffect="non-scaling-stroke" />
        {[c.a.brakeD, c.b.brakeD].map((b, k) => b !== null && b >= x0 && b <= x1 ? (
          <path key={k} d={`M${sx(b)},${H - padB + 2}l-4,7h8z`} fill={colours[k]} />
        ) : null)}
        {showCursor && (
          <g className="lab-mult-cursor">
            <line x1={sx(cursor!)} x2={sx(cursor!)} y1={0} y2={H - padB} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <div className="lab-mult-foot">
        {showCursor ? (
          <>
            <span style={{ color: colours[0] }}>{names[0]} {va === null ? "—" : Math.round(va)}</span>
            <span style={{ color: colours[1] }}>{names[1]} {vb === null ? "—" : Math.round(vb)}</span>
            <span className="faint">km/h</span>
          </>
        ) : (
          <>
            <span><CornerDownRight size={11} />min {c.a.minSpeed === null ? "—" : Math.round(c.a.minSpeed)} / {c.b.minSpeed === null ? "—" : Math.round(c.b.minSpeed)}</span>
            <span className="faint">▲ brake points</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
