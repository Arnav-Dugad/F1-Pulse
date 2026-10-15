/**
 * Mini-sector timing (Telemetry lab): an official-timing-screen style board for the two selected laps,
 * a lap-by-lap history grid, and an approximate track-map overlay of the segment statuses.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Grid3x3 } from "lucide-react";
import { lapTime } from "../lib/format";
import { lapSegments, mapSegments, pathLengths, segmentSummary, slicePath, type SegmentLap, type SegmentStatus } from "../lab.mjs";
import { Glass, cx } from "../ui/core";
import type { ArchiveDriver, Lap } from "../types";
import { DriverBadge } from "./_archive";
import "./_lab.css";

export type SegLap = Lap & SegmentLap;

export const SEG_LABEL: Record<SegmentStatus, string> = {
  purple: "Overall best", green: "Personal best", yellow: "No improvement", pit: "Pit lane", none: "Not available", unknown: "Unlisted code",
};
export const SEG_COLOUR: Record<SegmentStatus, string> = {
  purple: "var(--purple)", green: "var(--green)", yellow: "var(--yellow)", pit: "var(--blue)", none: "var(--label-4)", unknown: "var(--label-3)",
};

export const hasSegments = (lap?: SegLap | null) => !!lap && lapSegments(lap).some((s) => s.length > 0);

/* ───────────────────────── Timing-screen board ───────────────────────── */
export function MiniSectorBoard({ rows, year }: {
  rows: { driver: ArchiveDriver; lap: SegLap; colour: string; side: string }[]; year: string;
}) {
  const usable = rows.filter((r) => hasSegments(r.lap));
  if (!usable.length)
    return (
      <Glass className="lab-empty">
        <Grid3x3 />
        <div><strong>No mini-sector data for these laps</strong><p className="muted small">OpenF1 didn't publish segment statuses for the selected laps.</p></div>
      </Glass>
    );
  return (
    <Glass className="lab-board reveal" strong>
      <div className="lab-board-head" aria-hidden>
        <span>Driver</span><span>Lap</span><span>Sector 1</span><span>Sector 2</span><span>Sector 3</span>
      </div>
      {rows.map((r, i) => {
        const segs = lapSegments(r.lap);
        const sum = segmentSummary(r.lap);
        const times = [r.lap.duration_sector_1, r.lap.duration_sector_2, r.lap.duration_sector_3];
        return (
          <div key={r.side} className="lab-board-row" style={{ "--tint": r.colour, "--i": i } as CSSProperties}>
            <span className="lab-board-who">
              <DriverBadge driver={r.driver} year={year} size={34} colour={r.colour} />
              <span><b>{r.driver.name_acronym}</b><small>Driver {r.side}</small></span>
            </span>
            <span className="lab-board-lap"><b>{lapTime(r.lap.lap_duration)}</b><small>Lap {r.lap.lap_number}</small></span>
            {segs.map((list, s) => (
              <span key={s} className="lab-board-sector">
                <span className="lab-board-sector-head"><small>S{s + 1}</small><b>{times[s] === null ? "—" : times[s]!.toFixed(3)}</b></span>
                <span className="lab-segs" role="img" aria-label={`Sector ${s + 1}: ${list.length ? list.map((x) => SEG_LABEL[x].toLowerCase()).join(", ") : "no segments"}`}>
                  {list.length ? list.map((st, k) => (
                    <i key={k} className={cx("lab-seg", st)} style={{ "--c": SEG_COLOUR[st], "--k": k + s * 8 } as CSSProperties} title={`S${s + 1} · segment ${k + 1}: ${SEG_LABEL[st]}`} />
                  )) : <em className="faint xsmall">none</em>}
                </span>
              </span>
            ))}
            <span className="lab-board-sum" aria-label={`${sum.purple} purple, ${sum.green} green, ${sum.yellow} yellow of ${sum.total} segments`}>
              <span style={{ "--c": SEG_COLOUR.purple } as CSSProperties}>{sum.purple}</span>
              <span style={{ "--c": SEG_COLOUR.green } as CSSProperties}>{sum.green}</span>
              <span style={{ "--c": SEG_COLOUR.yellow } as CSSProperties}>{sum.yellow}</span>
            </span>
          </div>
        );
      })}
      <SegLegend />
    </Glass>
  );
}

export function SegLegend({ compact }: { compact?: boolean }) {
  const keys: SegmentStatus[] = compact ? ["purple", "green", "yellow", "pit"] : ["purple", "green", "yellow", "pit", "none"];
  return (
    <div className="lab-seg-legend">
      {keys.map((k) => <span key={k}><i className={cx("lab-seg", k)} style={{ "--c": SEG_COLOUR[k] } as CSSProperties} />{SEG_LABEL[k]}</span>)}
    </div>
  );
}

/* ───────────────────────── Lap-by-lap history ───────────────────────── */
export function MiniSectorHistory({ sides, chosen, onPick }: {
  sides: { driver: ArchiveDriver; laps: SegLap[]; colour: string; side: "A" | "B" }[];
  chosen: (number | undefined)[];
  onPick: (side: "A" | "B", lap: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState<"A" | "B">("A");
  const cur = sides.find((s) => s.side === which) || sides[0];
  const laps = (cur?.laps || []).filter(hasSegments);
  const width = Math.max(0, ...laps.map((l) => lapSegments(l).reduce((n, s) => n + s.length, 0)));
  return (
    <div className="lab-history">
      <button type="button" className="btn sm lab-history-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Grid3x3 />Every lap, segment by segment<ChevronDown className={cx("lab-chev", open && "open")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="lab-history-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
            <div className="lab-history-inner">
              <div className="lab-history-tabs" role="group" aria-label="Driver">
                {sides.map((s) => (
                  <button key={s.side} type="button" aria-pressed={which === s.side} className={cx("lab-pill", which === s.side && "on")} style={{ "--tint": s.colour } as CSSProperties} onClick={() => setWhich(s.side)}>
                    <i />{s.driver.name_acronym}
                  </button>
                ))}
                <span className="faint xsmall">Select a row to compare that lap · {laps.length} laps with segment data</span>
              </div>
              <div className="lab-history-grid" style={{ "--n": width } as CSSProperties}>
                {laps.map((l) => {
                  const segs = lapSegments(l);
                  const on = chosen[which === "A" ? 0 : 1] === l.lap_number;
                  const selectable = !!l.date_start && l.lap_duration !== null && l.lap_duration > 0 && l.lap_duration <= 180 && !l.is_pit_out_lap;
                  return (
                    <button key={l.lap_number} type="button" className={cx("lab-history-row", on && "on")} disabled={!selectable}
                      onClick={() => onPick(which, l.lap_number)} aria-pressed={on} style={{ "--tint": cur.colour } as CSSProperties}
                      aria-label={`Lap ${l.lap_number}, ${lapTime(l.lap_duration)}${selectable ? "" : " (not selectable for telemetry)"}`}>
                      <span className="lab-history-lap">L{l.lap_number}</span>
                      <span className="lab-history-segs">
                        {segs.map((list, s) => (
                          <span key={s} className="lab-history-sector">
                            {list.map((st, k) => <i key={k} style={{ "--c": SEG_COLOUR[st] } as CSSProperties} className={cx("lab-hseg", st)} />)}
                          </span>
                        ))}
                      </span>
                      <span className="lab-history-time">{lapTime(l.lap_duration)}</span>
                    </button>
                  );
                })}
              </div>
              <SegLegend compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────── Track overlay geometry ───────────────────────── */
/**
 * Segment polylines for a lap on a location trace. `pts` are the reference lap's location samples
 * (t = seconds from the reference lap start). Sector bounds come from the reference lap's measured sector
 * times; segment counts and statuses come from `lap` (which may be the other driver's lap — the
 * sector lines are the same physical places).
 */
export function useSegmentOverlay(pts: { t: number; x: number; y: number }[] | undefined, ref: SegLap, lap: SegLap | undefined) {
  return useMemo(() => {
    if (!pts || pts.length < 4 || !lap || !hasSegments(lap)) return null;
    const dur = ref.lap_duration || Infinity;
    const trace = pts.filter((p) => p.t >= 0 && p.t <= dur + 0.5);
    if (trace.length < 4) return null;
    const segs = lapSegments(lap);
    const placed = mapSegments(trace, [ref.duration_sector_1, ref.duration_sector_2, ref.duration_sector_3], segs.map((s) => s.length));
    const cum = pathLengths(trace);
    const out = placed.map((p) => {
      const line = slicePath(trace, cum, p.f0, p.f1);
      return { status: segs[p.sector - 1][p.index], d: line.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(""), sector: p.sector, index: p.index };
    });
    const sum = segmentSummary(lap);
    return { segs: out, sum };
  }, [pts, ref, lap]);
}
