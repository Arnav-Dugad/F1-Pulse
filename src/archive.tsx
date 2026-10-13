import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gauge,
  Play,
  Pause,
  Download,
  Radio,
  Flag,
  GitBranch,
  ArrowUpRight,
} from "lucide-react";
import { sessions, request, useData } from "./api";
import { usePrefs } from "./context";
import {
  PageTitle,
  Section,
  State,
  Source,
  Metric,
  Table,
  Chart,
  seconds,
  ExportButton,
  exportCSV,
} from "./ui";
import type {
  Session,
  ArchiveDriver,
  Lap,
  CarSample,
  LocationSample,
  Envelope,
} from "./types";
import { distanceTrace, lapDelta, median, sampleAt } from "./math.mjs";
const validLap = (l: Lap) =>
  !!l.date_start &&
  l.lap_duration !== null &&
  l.lap_duration > 0 &&
  l.lap_duration <= 180 &&
  !l.is_pit_out_lap;
const fastest = (list: Lap[]) =>
  [...list]
    .filter(validLap)
    .sort((a, b) => a.lap_duration! - b.lap_duration!)[0];
export default function Archive({ route }: { route: string }) {
  const replay = route === "replay";
  const { season } = usePrefs();
  const year = season === "current" ? String(new Date().getFullYear()) : season;
  const [format, setFormat] = useState("Race"),
    [key, setKey] = useState(""),
    [a, setA] = useState(""),
    [b, setB] = useState(""),
    [lapA, setLapA] = useState(""),
    [lapB, setLapB] = useState("");
  const data = useData(() => sessions(year), [year]);
  const list = data.value?.data.filter((s) => s.session_name === format) || [],
    selected = list.find((s) => String(s.session_key) === key) || list[0];
  const sessionKey = selected?.session_key;
  const ds = useData(
    async () =>
      sessionKey
        ? request<ArchiveDriver[]>("openf1", "drivers", {
            session_key: sessionKey,
          })
        : {
            data: [],
            meta: { source: "openf1", url: "", fetchedAt: "", status: "" },
          },
    [sessionKey],
  );
  const driverList = ds.value?.data || [];
  const aId =
      a && driverList.some((d) => String(d.driver_number) === a)
        ? a
        : String(driverList[0]?.driver_number || ""),
    bId =
      b && driverList.some((d) => String(d.driver_number) === b)
        ? b
        : String(driverList[1]?.driver_number || "");
  const laps = useData(async () => {
    if (!sessionKey || !aId || !bId)
      return {
        data: [] as Lap[],
        meta: { source: "openf1", url: "", fetchedAt: "", status: "" },
      };
    const x = await request<Lap[]>("openf1", "laps", {
      session_key: sessionKey,
      driver_number: aId,
    });
    if (aId === bId) return x;
    const y = await request<Lap[]>("openf1", "laps", {
      session_key: sessionKey,
      driver_number: bId,
    });
    return { ...x, data: [...x.data, ...y.data] };
  }, [sessionKey, aId, bId]);
  const la =
      laps.value?.data.filter((l) => String(l.driver_number) === aId) || [],
    lb = laps.value?.data.filter((l) => String(l.driver_number) === bId) || [];
  const chosenA =
      la.find((l) => String(l.lap_number) === lapA && validLap(l)) ||
      fastest(la),
    chosenB =
      lb.find((l) => String(l.lap_number) === lapB && validLap(l)) ||
      fastest(lb);
  const driverA = driverList.find((d) => String(d.driver_number) === aId),
    driverB = driverList.find((d) => String(d.driver_number) === bId);
  const [loaded, setLoaded] = useState<{
      a: CarSample[] | LocationSample[];
      b: CarSample[] | LocationSample[];
      meta: Envelope<any>["meta"];
      signature: string;
      position?: any[];
      control?: any[];
    } | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const signature = [
    replay,
    sessionKey,
    aId,
    bId,
    chosenA?.lap_number,
    chosenB?.lap_number,
  ].join(":");
  const fresh = loaded?.signature === signature;
  useEffect(() => {
    setLapA("");
    setLapB("");
    setA("");
    setB("");
    setKey("");
  }, [year]);
  const load = async () => {
    if (!chosenA || !chosenB || !sessionKey) return;
    setLoading(true);
    setError("");
    try {
      const fetchSamples = async (id: string, l: Lap) => {
        const reference = replay ? chosenA : l;
        return request<any[]>("openf1", replay ? "location" : "car_data", {
          session_key: sessionKey,
          driver_number: id,
          "date>=": reference.date_start!,
          "date<=": new Date(
            Date.parse(reference.date_start!) + reference.lap_duration! * 1000,
          ).toISOString(),
        });
      };
      const x = await fetchSamples(aId, chosenA),
        y = await fetchSamples(bId, chosenB);
      if (x.data.length < 2 || y.data.length < 2)
        throw Error(
          "There are not enough measured samples for this selection. Choose another lap or session.",
        );
      const additional: Record<string, any> = {};
      if (replay) {
        const p = await request<any[]>("openf1", "position", {
          session_key: sessionKey,
        });
        additional.position = p.data;
        const c = await request<any[]>("openf1", "race_control", {
          session_key: sessionKey,
          "date>=": chosenA.date_start!,
          "date<=": new Date(
            Date.parse(chosenA.date_start!) + chosenA.lap_duration! * 1000,
          ).toISOString(),
        });
        additional.control = c.data;
      }
      setLoaded({
        a: x.data.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
        b: y.data.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
        meta: x.meta,
        signature,
        ...additional,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  if (+year < 2023)
    return (
      <>
        <PageTitle
          eyebrow="FREE HISTORICAL ARCHIVE"
          title={
            replay ? "Relive the racing line." : "Every input. Every advantage."
          }
          description="OpenF1's historical telemetry begins in 2023. Choose 2023 or a later season in the header."
        />
        <State empty />
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow={`OPENF1 HISTORICAL ARCHIVE · ${year}`}
        title={
          replay ? "Relive the racing line." : "Every input. Every advantage."
        }
        description={
          replay
            ? "Synchronized lap playback from actual archived location samples. Selected drivers share the same real session clock."
            : "Compare two measured laps. Speed-derived distance alignment is explicitly estimated; raw telemetry remains observed."
        }
      />
      <div className="notice">
        <Gauge size={18} />
        <p>
          Archive access only. Sessions appear after the provider's live window
          ends.{" "}
          {replay
            ? "This is a selected-lap replay, not a full-race broadcast. Markers disappear across missing samples."
            : "Lap windows are bounded to three minutes per driver. Missing telemetry and data gaps are reported explicitly."}
        </p>
      </div>
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      <div className="panel archive-controls">
        <label className="field">
          <span>Session type</span>
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setKey("");
            }}
          >
            {[
              "Race",
              "Qualifying",
              "Sprint",
              "Sprint Qualifying",
              "Practice 1",
              "Practice 2",
              "Practice 3",
            ].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Archived event</span>
          <select
            aria-label="Archived event"
            value={sessionKey || ""}
            onChange={(e) => {
              setKey(e.target.value);
              setLapA("");
              setLapB("");
              setA("");
              setB("");
            }}
          >
            {list.map((s) => (
              <option key={s.session_key} value={s.session_key}>
                {s.location} · {s.session_name} · {s.date_start.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        {[
          {
            label: "Driver A",
            value: aId,
            set: setA,
            lap: chosenA,
            lapSet: setLapA,
            list: la,
          },
          {
            label: "Driver B",
            value: bId,
            set: setB,
            lap: chosenB,
            lapSet: setLapB,
            list: lb,
          },
        ].map((x) => (
          <div className="archive-driver-controls" key={x.label}>
            <label className="field">
              <span>{x.label}</span>
              <select
                value={x.value}
                onChange={(e) => {
                  x.set(e.target.value);
                  x.lapSet("");
                }}
              >
                {driverList.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.full_name} · {d.driver_number}
                  </option>
                ))}
              </select>
            </label>
            {(!replay || x.label === "Driver A") && (
              <label className="field">
                <span>
                  {replay ? "Replay window reference lap" : "Measured lap"}
                </span>
                <select
                  value={x.lap?.lap_number || ""}
                  onChange={(e) => x.lapSet(e.target.value)}
                >
                  {x.list.filter(validLap).map((l) => (
                    <option value={l.lap_number} key={l.lap_number}>
                      Lap {l.lap_number} · {seconds(l.lap_duration)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ))}
        <button
          className="button"
          onClick={load}
          disabled={loading || !chosenA || !chosenB || aId === bId}
        >
          {loading
            ? "Loading measurements…"
            : replay
              ? "Load historical replay"
              : "Load lap comparison"}
          <ArrowUpRight size={16} />
        </button>
      </div>
      <State
        loading={ds.loading || laps.loading}
        error={ds.error || laps.error || error}
        onRetry={error ? load : laps.reload}
      />
      {!data.loading && !list.length && <State empty />}
      {aId === bId && aId && (
        <p className="notice">Choose two different drivers.</p>
      )}
      {selected && chosenA && chosenB && (
        <>
          <div className="overview-metrics">
            <Metric
              label={driverA?.full_name || "Driver A"}
              value={seconds(chosenA.lap_duration)}
              detail={`Lap ${chosenA.lap_number} · measured duration`}
            />
            <Metric
              label={
                replay
                  ? "Second spatial focus"
                  : driverB?.full_name || "Driver B"
              }
              value={
                replay ? driverB?.full_name : seconds(chosenB.lap_duration)
              }
              detail={
                replay
                  ? "Both drivers share the reference lap’s UTC window"
                  : `Lap ${chosenB.lap_number} · measured duration`
              }
            />
            <Metric
              label={
                replay
                  ? "Playback window duration"
                  : "Observed lap-time difference"
              }
              value={`${(replay ? chosenA.lap_duration! : Math.abs(chosenA.lap_duration! - chosenB.lap_duration!)).toFixed(3)} s`}
              detail={
                replay
                  ? "Reference lap window, shared absolute timestamps"
                  : "Raw lap durations; not distance delta"
              }
            />
            <Metric
              label="Session"
              value={selected.session_name}
              detail={selected.circuit_short_name}
            />
          </div>
          {!replay && (
            <div className="panel">
              <Table
                headers={[
                  "Driver",
                  "Lap",
                  "Sector 1",
                  "Sector 2",
                  "Sector 3",
                  "Lap duration",
                ]}
              >
                {[
                  [driverA, chosenA],
                  [driverB, chosenB],
                ].map(([d, l]: any) => (
                  <tr key={d?.driver_number}>
                    <td>{d?.full_name}</td>
                    <td>{l.lap_number}</td>
                    <td>{seconds(l.duration_sector_1)}</td>
                    <td>{seconds(l.duration_sector_2)}</td>
                    <td>{seconds(l.duration_sector_3)}</td>
                    <td>{seconds(l.lap_duration)}</td>
                  </tr>
                ))}
              </Table>
              <Source value={laps.value} />
            </div>
          )}
        </>
      )}
      {fresh &&
        loaded &&
        driverA &&
        driverB &&
        (replay ? (
          <Replay
            data={loaded as any}
            driverA={driverA}
            driverB={driverB}
            drivers={driverList}
          />
        ) : (
          <Telemetry
            a={loaded.a as CarSample[]}
            b={loaded.b as CarSample[]}
            driverA={driverA}
            driverB={driverB}
            meta={loaded.meta}
          />
        ))}
      {loaded && !fresh && (
        <p className="notice">
          The selection changed. Load the new selection to display matching
          measurements.
        </p>
      )}
      {sessionKey && (
        <ArchiveDetails
          key={sessionKey}
          session={selected!}
          drivers={driverList}
          laps={laps.value?.data || []}
        />
      )}
      <Source value={data.value} />
    </>
  );
}
function Telemetry({
  a,
  b,
  driverA,
  driverB,
  meta,
}: {
  a: CarSample[];
  b: CarSample[];
  driverA: ArchiveDriver;
  driverB: ArchiveDriver;
  meta: Envelope<any>["meta"];
}) {
  const [zoom, setZoom] = useState([0, 100]),
    [cursor, setCursor] = useState<number | null>(null);
  let ta: ReturnType<typeof distanceTrace> = [],
    tb: ReturnType<typeof distanceTrace> = [],
    error = "";
  try {
    ta = distanceTrace(a);
    tb = distanceTrace(b);
  } catch (e) {
    error = (e as Error).message;
  }
  const max = Math.min(ta.at(-1)?.distance || 0, tb.at(-1)?.distance || 0);
  const filtered = (t: typeof ta) =>
    t.filter(
      (v) =>
        v.distance >= (max * zoom[0]) / 100 &&
        v.distance <= (max * zoom[1]) / 100,
    );
  const delta = lapDelta(ta, tb).filter(
    (v) =>
      v.distance >= (max * zoom[0]) / 100 &&
      v.distance <= (max * zoom[1]) / 100,
  );
  const channels = [
    ["speed", "Speed", "km/h"],
    ["throttle", "Throttle", "%"],
    ["brake", "Brake", "%"],
    ["n_gear", "Gear", "gear"],
    ["rpm", "Engine speed", "RPM"],
    ["drs", "DRS state", "raw code"],
  ] as const;
  return (
    <Section
      title="The recorded inputs"
      subtitle="Distance is estimated by trapezoidal integration of observed speed. A positive delta means Driver B takes longer to reach that estimated distance."
      action={
        <ExportButton
          onClick={() =>
            exportCSV("telemetry-observed.csv", [
              [
                "Driver",
                "UTC timestamp",
                "Speed km/h",
                "Throttle %",
                "Brake %",
                "Gear",
                "RPM",
                "DRS raw code",
              ],
              ...[
                ...a.map((x) => ({ id: driverA.full_name, ...x })),
                ...b.map((x) => ({ id: driverB.full_name, ...x })),
              ].map((x) => [
                x.id,
                x.date,
                x.speed,
                x.throttle,
                x.brake,
                x.n_gear,
                x.rpm,
                x.drs,
              ]),
            ])
          }
        />
      }
    >
      <div className="panel telemetry-panel">
        <State error={error} />
        {!error && (
          <>
            <div className="toolbar">
              <label className="range-field">
                <span>Window start: {zoom[0]}%</span>
                <input
                  aria-label="Telemetry window start"
                  type="range"
                  min="0"
                  max={zoom[1] - 5}
                  value={zoom[0]}
                  onChange={(e) => setZoom([+e.target.value, zoom[1]])}
                />
              </label>
              <label className="range-field">
                <span>Window end: {zoom[1]}%</span>
                <input
                  aria-label="Telemetry window end"
                  type="range"
                  min={zoom[0] + 5}
                  max="100"
                  value={zoom[1]}
                  onChange={(e) => setZoom([zoom[0], +e.target.value])}
                />
              </label>
            </div>
            <div className="overview-metrics">
              <Metric
                label={`${driverA.name_acronym} maximum speed`}
                value={`${Math.max(...a.map((x) => x.speed))} km/h`}
                detail="Maximum of received samples"
              />
              <Metric
                label={`${driverB.name_acronym} maximum speed`}
                value={`${Math.max(...b.map((x) => x.speed))} km/h`}
              />
              <Metric
                label="Observed samples"
                value={`${a.length} / ${b.length}`}
              />
              <Metric
                label="Common estimated distance"
                value={`${Math.round(max)} m`}
              />
            </div>
            {channels.map(([field, label, unit]) => (
              <div className="telemetry-channel" key={field}>
                <h3>
                  {label}
                  <small>{unit}</small>
                </h3>
                <Chart
                  hoverX={cursor}
                  onHover={setCursor}
                  label={`${label} lap comparison`}
                  xLabel="Estimated distance (m)"
                  yLabel={unit}
                  series={[
                    {
                      name: driverA.name_acronym,
                      color: "#ed4655",
                      values: filtered(ta).map((x) => ({
                        x: x.distance,
                        y: x[field],
                      })),
                    },
                    {
                      name: driverB.name_acronym,
                      color: "#67a8ff",
                      values: filtered(tb).map((x) => ({
                        x: x.distance,
                        y: x[field],
                      })),
                    },
                  ]}
                />
              </div>
            ))}
            <h3>Estimated distance-aligned time delta</h3>
            <Chart
              hoverX={cursor}
              onHover={setCursor}
              label="Estimated distance-aligned lap time delta"
              xLabel="Estimated distance (m)"
              yLabel="Seconds · B minus A"
              series={[
                {
                  name: "Estimated B − A",
                  color: "#54d2aa",
                  values: delta.map((v) => ({ x: v.distance, y: v.delta })),
                },
              ]}
            />
            <p className="fine-print">
              Telemetry sampling is finite and asynchronous. Integration
              estimates traveled distance, not GPS or official lap distance. No
              rescaling to equal lap length. The comparison uses only
              overlapping estimated distances. DRS codes are displayed as
              received; their interpretation varies by regulations and season.
              Sector times and lap duration above are directly observed.
            </p>
          </>
        )}
        <Source value={{ data: null, meta }} />
      </div>
    </Section>
  );
}
function Replay({
  data,
  driverA,
  driverB,
  drivers,
}: {
  data: {
    a: LocationSample[];
    b: LocationSample[];
    meta: Envelope<any>["meta"];
    position: any[];
    control: any[];
  };
  driverA: ArchiveDriver;
  driverB: ArchiveDriver;
  drivers: ArchiveDriver[];
}) {
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [elapsed, setElapsed] = useState(0),
    [focus, setFocus] = useState("both");
  const start = Math.min(
      Date.parse(data.a[0].date),
      Date.parse(data.b[0].date),
    ),
    end = Math.max(
      Date.parse(data.a.at(-1)!.date),
      Date.parse(data.b.at(-1)!.date),
    ),
    duration = (end - start) / 1000;
  const clock = useRef(0);
  useEffect(() => {
    setElapsed(0);
    setPlaying(false);
  }, [data]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = (now: number) => {
      const dt = clock.current ? (now - clock.current) / 1000 : 0;
      clock.current = now;
      setElapsed((old) => {
        const next = Math.min(duration, old + dt * speed);
        if (next >= duration) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clock.current = 0;
    };
  }, [playing, speed, duration]);
  const samples = [...data.a, ...data.b];
  const minX = Math.min(...samples.map((x) => x.x)),
    maxX = Math.max(...samples.map((x) => x.x)),
    minY = Math.min(...samples.map((x) => x.y)),
    maxY = Math.max(...samples.map((x) => x.y));
  const factor = Math.min(640 / (maxX - minX || 1), 440 / (maxY - minY || 1));
  const X = (x: number) => 80 + (x - minX) * factor,
    Y = (y: number) => 510 - (y - minY) * factor;
  const instant = start + elapsed * 1000;
  const positions = drivers
    .map((d) => ({
      ...d,
      p: data.position
        .filter(
          (p) =>
            p.driver_number === d.driver_number &&
            Date.parse(p.date) <= instant,
        )
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]?.position,
    }))
    .filter((d) => d.p)
    .sort((a, b) => a.p - b.p);
  return (
    <Section
      title="The historical session clock"
      subtitle="Local session coordinates. The path is drawn from Driver A's measured lap, without invented geometry."
    >
      <div className="replay-grid">
        <div className="panel replay-map">
          <div className="row spread">
            <span className="status-chip">HISTORICAL PLAYBACK</span>
            <select
              aria-label="Replay driver focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            >
              <option value="both">Both drivers</option>
              <option value="a">Focus {driverA.name_acronym}</option>
              <option value="b">Focus {driverB.name_acronym}</option>
            </select>
          </div>
          <svg
            viewBox="0 0 800 570"
            role="img"
            aria-label="Historical measured racing path with synchronized driver markers"
          >
            <path
              className="track-outline"
              d={data.a
                .map(
                  (p, i) =>
                    `${i === 0 || Date.parse(p.date) - Date.parse(data.a[i - 1]?.date || p.date) > 3000 ? "M" : "L"}${X(p.x)},${Y(p.y)}`,
                )
                .join(" ")}
            />
            {[
              { id: "a", samples: data.a, color: "#ed4655", driver: driverA },
              { id: "b", samples: data.b, color: "#67a8ff", driver: driverB },
            ]
              .filter((s) => focus === "both" || focus === s.id)
              .map((s) => {
                const p = sampleAt(s.samples, instant);
                return p ? (
                  <g key={s.id}>
                    <circle
                      cx={X(p.x)}
                      cy={Y(p.y)}
                      r="10"
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <text x={X(p.x) + 16} y={Y(p.y) + 5} fill={s.color}>
                      {s.driver.name_acronym}
                    </text>
                  </g>
                ) : null;
              })}
          </svg>
          <div className="replay-controls">
            <button
              className="button"
              aria-label={playing ? "Pause replay" : "Play replay"}
              onClick={() => {
                if (elapsed >= duration) setElapsed(0);
                setPlaying((x) => !x);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <input
              type="range"
              aria-label="Replay timeline"
              min="0"
              max={duration}
              step="0.05"
              value={elapsed}
              onChange={(e) => {
                setElapsed(+e.target.value);
                setPlaying(false);
              }}
            />
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            >
              {[1, 2, 4, 8, 16].map((x) => (
                <option value={x} key={x}>
                  {x}×
                </option>
              ))}
            </select>
          </div>
          <div className="row spread replay-clock">
            <strong>
              {elapsed.toFixed(1)} / {duration.toFixed(1)} s
            </strong>
            <span>
              {new Date(instant).toISOString().replace("T", " ").slice(0, 23)}{" "}
              UTC
            </span>
          </div>
          <Source value={{ data: null, meta: data.meta }} />
        </div>
        <div className="panel timing-tower">
          <h3>Position tower</h3>
          <p>Last reported position at the replay timestamp.</p>
          {positions.map((d) => (
            <div
              className={`timing-row ${[driverA.driver_number, driverB.driver_number].includes(d.driver_number) ? "selected" : ""}`}
              key={d.driver_number}
            >
              <strong>{d.p}</strong>
              <i style={{ background: "#" + d.team_colour }} />
              <span>
                {d.name_acronym}
                <small>{d.team_name}</small>
              </span>
            </div>
          ))}
          {!positions.length && <State empty />}
        </div>
      </div>
      <div className="panel settings-panel">
        <h3>Race control in this window</h3>
        {data.control
          .filter((x) => Date.parse(x.date) <= instant)
          .map((e, i) => (
            <p key={i}>
              <strong>{e.date.slice(11, 19)} UTC</strong> · {e.message}
            </p>
          ))}
        {!data.control.filter((x) => Date.parse(x.date) <= instant).length && (
          <p>
            No published race-control events at this point in the selected
            window.
          </p>
        )}
      </div>
    </Section>
  );
}
function ArchiveDetails({
  session,
  drivers,
  laps,
}: {
  session: Session;
  drivers: ArchiveDriver[];
  laps: Lap[];
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("stints");
  const data = useData(
    async () =>
      open
        ? request<any[]>("openf1", tab, { session_key: session.session_key })
        : {
            data: [],
            meta: { source: "openf1", url: "", fetchedAt: "", status: "" },
          },
    [open, tab, session.session_key],
  );
  const driverName = (n: number) =>
    drivers.find((d) => d.driver_number === n)?.full_name || String(n);
  const compounds: Record<string, string> = {
    SOFT: "#e54b59",
    MEDIUM: "#ecc64b",
    HARD: "#dce1e8",
    INTERMEDIATE: "#49bb8d",
    WET: "#67a8ff",
    UNKNOWN: "#8c94a4",
  };
  return (
    <>
      <Section
        title="Race pace from recorded laps"
        subtitle="Median valid lap duration for your two selected drivers; excludes pit-out laps, not all traffic or safety-car laps."
      >
        <div className="panel">
          <Table
            headers={[
              "Driver",
              "Valid laps",
              "Median measured pace",
              "Best measured lap",
            ]}
          >
            {Array.from(new Set(laps.map((x) => x.driver_number))).map((n) => {
              const ls = laps.filter(
                (x) => x.driver_number === n && validLap(x),
              );
              return (
                <tr key={n}>
                  <td>{driverName(n)}</td>
                  <td>{ls.length}</td>
                  <td>{seconds(median(ls.map((x) => x.lap_duration!)))}</td>
                  <td>{seconds(fastest(ls)?.lap_duration)}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      </Section>
      <Section
        title="Inside the archived session"
        subtitle="Recorded stints, pit events, weather, race-control messages and radio links."
      >
        <button className="button secondary" onClick={() => setOpen((x) => !x)}>
          {open ? "Close archive details" : "Load session detail"}
        </button>
        {open && (
          <div className="panel archive-detail-panel">
            <div className="tabs">
              {["stints", "pit", "race_control", "weather", "team_radio"].map(
                (t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t.replaceAll("_", " ")}
                  </button>
                ),
              )}
            </div>
            <State
              loading={data.loading}
              error={data.error}
              empty={!data.loading && !data.error && !data.value?.data.length}
              onRetry={data.reload}
            />
            {tab === "stints" ? (
              <div className="stints-list">
                {data.value?.data.map((s, i) => (
                  <div className="real-stint" key={i}>
                    <strong>{driverName(s.driver_number)}</strong>
                    <span
                      style={{
                        borderColor: compounds[s.compound] || compounds.UNKNOWN,
                      }}
                    >
                      {s.compound || "Unreported"} · L{s.lap_start}–{s.lap_end}{" "}
                      · tyre age {s.tyre_age_at_start ?? "—"} at start
                    </span>
                  </div>
                ))}
              </div>
            ) : tab === "team_radio" ? (
              <div className="radio-list">
                {data.value?.data.map((s, i) => (
                  <div key={i}>
                    <Radio size={18} />
                    <strong>{driverName(s.driver_number)}</strong>
                    <span>{s.date?.slice(11, 19)} UTC</span>
                    {/^https:\/\//.test(s.recording_url || "") ? (
                      <a
                        href={s.recording_url}
                        className="text-link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open archive recording ↗
                      </a>
                    ) : (
                      <span>Recording unavailable</span>
                    )}
                  </div>
                ))}
              </div>
            ) : tab === "race_control" ? (
              <Table headers={["UTC time", "Category", "Flag", "Message"]}>
                {data.value?.data.map((s, i) => (
                  <tr key={i}>
                    <td>{s.date?.slice(11, 19)}</td>
                    <td>{s.category}</td>
                    <td>{s.flag || "—"}</td>
                    <td>{s.message}</td>
                  </tr>
                ))}
              </Table>
            ) : tab === "pit" ? (
              <Table
                headers={["Driver", "Lap", "UTC time", "Reported duration (s)"]}
              >
                {data.value?.data.map((s, i) => (
                  <tr key={i}>
                    <td>{driverName(s.driver_number)}</td>
                    <td>{s.lap_number}</td>
                    <td>{s.date?.slice(11, 19)}</td>
                    <td>{s.pit_duration ?? s.stop_duration ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table
                headers={[
                  "UTC time",
                  "Air °C",
                  "Track °C",
                  "Humidity %",
                  "Wind m/s",
                  "Rainfall status",
                ]}
              >
                {data.value?.data
                  .filter((_, i) => i % 5 === 0)
                  .map((s, i) => (
                    <tr key={i}>
                      <td>{s.date?.slice(11, 19)}</td>
                      <td>{s.air_temperature}</td>
                      <td>{s.track_temperature}</td>
                      <td>{s.humidity}</td>
                      <td>{s.wind_speed}</td>
                      <td>{s.rainfall}</td>
                    </tr>
                  ))}
              </Table>
            )}
            <Source value={data.value} />
          </div>
        )}
      </Section>
    </>
  );
}
