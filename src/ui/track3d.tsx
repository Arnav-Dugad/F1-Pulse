import { useId, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useTrackOutline } from "../lib/media";
import { useReduced } from "./countdown";
import { cx } from "./core";
import "./track3d.css";

const LAYERS = 7;
const SECTORS = [
  { id: "s1", label: "S1", color: "var(--t3d-s1)" },
  { id: "s2", label: "S2", color: "var(--t3d-s2)" },
  { id: "s3", label: "S3", color: "var(--t3d-s3)" },
];

/**
 * Circuit outline on a tilted ground plane: stacked layers give a soft extruded edge, the camera
 * orbits slowly and follows the pointer, coloured cars lap the circuit, and the outline is split
 * into three equal-length thirds. No sector timing-line data exists in the outline set, so the
 * split is labelled as approximate wherever it is shown.
 */
export function Track3D({ circuitId, cars = [], lap = 11, label, className, legend = true, note }: {
  circuitId?: string; cars?: string[]; lap?: number; label?: string; className?: string; legend?: boolean; note?: string;
}) {
  const outline = useTrackOutline(circuitId);
  const still = useReduced();
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const line = useMemo(() => {
    if (!outline) return "";
    const longest = [...outline.paths].sort((a, b) => b.length - a.length)[0];
    return longest.split(/(?=M)/)[0];
  }, [outline]);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || still || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--tx", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    ref.current.style.setProperty("--ty", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  };
  const onLeave = () => {
    ref.current?.style.setProperty("--tx", "0");
    ref.current?.style.setProperty("--ty", "0");
  };

  if (!outline) return <div className={cx("t3d loading", className)} aria-hidden />;
  return (
    <div className={cx("t3d", still && "still", className)} ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="t3d-viewport" role="img" aria-label={(label || "Circuit layout") + " — three-dimensional view with approximate sector split"}>
        <div className="t3d-tilt">
          <div className="t3d-orbit">
            <span className="t3d-shadow" aria-hidden />
            {Array.from({ length: LAYERS }, (_, k) => (
              <svg key={k} className="t3d-layer edge" viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden
                style={{ "--z": `${-(LAYERS - k) * 1.6}px`, "--k": (k + 1) / LAYERS } as CSSProperties}>
                {outline.paths.map((d, i) => <path key={i} d={d} />)}
              </svg>
            ))}
            <svg className="t3d-layer top" viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden>
              <defs>
                <path id={`t3d-line-${uid}`} d={line} />
              </defs>
              {outline.paths.map((d, i) => <path key={i} className="t3d-surface" d={d} />)}
              {SECTORS.map((s, i) => (
                <path key={s.id} className="t3d-sector" d={line} pathLength={1}
                  style={{ stroke: s.color, strokeDasharray: `${1 / 3 + 0.004} ${2 / 3}`, strokeDashoffset: -i / 3, "--i": i } as CSSProperties} />
              ))}
              {!still && cars.map((color, i) => (
                <g key={i} style={{ "--car": color } as CSSProperties}>
                  <circle className="t3d-car-glow" r={3.6}>
                    <animateMotion dur={`${lap}s`} begin={`${-i * (lap * 0.05)}s`} repeatCount="indefinite" calcMode="paced"><mpath href={`#t3d-line-${uid}`} /></animateMotion>
                  </circle>
                  <circle className="t3d-car" r={1.7}>
                    <animateMotion dur={`${lap}s`} begin={`${-i * (lap * 0.05)}s`} repeatCount="indefinite" calcMode="paced"><mpath href={`#t3d-line-${uid}`} /></animateMotion>
                  </circle>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
      {legend && (
        <div className="t3d-legend">
          {SECTORS.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}
          <small>Sector split approximate — equal thirds of the outline{note ? ` · ${note}` : ""}</small>
        </div>
      )}
    </div>
  );
}
