import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  GitBranch,
  Trophy,
  ArrowLeftRight,
  Save,
  Download,
  RotateCcw,
} from "lucide-react";
import { allResults, drivers, standings, useData } from "./api";
import { usePrefs } from "./context";
import { name, teamColor } from "./media";
import {
  PageTitle,
  State,
  Source,
  Section,
  Metric,
  Chart,
  Table,
  ExportButton,
  exportCSV,
  Link,
  seconds,
} from "./ui";
import {
  summarize,
  headToHead,
  strategyTime,
  projectChampionship,
} from "./math.mjs";
import type { Driver, Race, Result } from "./types";
export default function Analytics({ route }: { route: string }) {
  return route === "strategy" ? (
    <Strategy />
  ) : route === "scenario" ? (
    <Scenario />
  ) : (
    <Comparison />
  );
}
function DriverSelect({
  label,
  value,
  onChange,
  drivers: ds,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  drivers: Driver[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a driver</option>
        {ds.map((d) => (
          <option key={d.driverId} value={d.driverId}>
            {name(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
function Comparison() {
  const { season } = usePrefs();
  const ds = useData(() => drivers(season), [season]),
    data = useData(() => allResults(season), [season]);
  const query = new URLSearchParams(location.hash.split("?")[1]);
  const metrics = ["cumulative", "points", "position", "gain"];
  const [a, setA] = useState(query.get("a") || ""),
    [b, setB] = useState(query.get("b") || ""),
    [metric, setMetric] = useState(
      metrics.includes(query.get("metric") || "")
        ? query.get("metric")!
        : "cumulative",
    ),
    [mode, setMode] = useState("line"),
    [message, setMessage] = useState("");
  const all = data.value?.data || [],
    list = ds.value?.data || [];
  const aId =
      (list.some((d) => d.driverId === a) ? a : "") ||
      list.find((d) =>
        all.some((r) =>
          r.Results?.some((x) => x.Driver.driverId === d.driverId),
        ),
      )?.driverId ||
      "",
    bId =
      (list.some((d) => d.driverId === b) ? b : "") ||
      list.find(
        (d) =>
          d.driverId !== aId &&
          all.some((r) =>
            r.Results?.some((x) => x.Driver.driverId === d.driverId),
          ),
      )?.driverId ||
      "";
  const A = list.find((d) => d.driverId === aId),
    B = list.find((d) => d.driverId === bId);
  const results = (id: string) =>
    all.flatMap(
      (r) => r.Results?.filter((x) => x.Driver.driverId === id) || [],
    );
  const sa = summarize(results(aId)),
    sb = summarize(results(bId)),
    h2h = headToHead(all, aId, bId);
  const makeSeries = (id: string, color: string) => {
    let cumulative = 0;
    return {
      name: list.find((d) => d.driverId === id)?.familyName || id,
      color,
      values: all.map((r) => {
        const x = r.Results?.find((x) => x.Driver.driverId === id);
        if (!x) return { x: +r.round, y: null };
        cumulative += +x.points;
        return {
          x: +r.round,
          y:
            metric === "cumulative"
              ? cumulative
              : metric === "position"
                ? +x.position
                : metric === "gain"
                  ? +x.grid > 0
                    ? +x.grid - +x.position
                    : null
                  : +x.points,
        };
      }),
    };
  };
  const series = [makeSeries(aId, "#ed4655"), makeSeries(bId, "#67a8ff")];
  useEffect(() => {
    if (!aId || !bId) return;
    const q = new URLSearchParams(location.hash.split("?")[1]);
    q.set("a", aId);
    q.set("b", bId);
    q.set("metric", metric);
    q.set("season", season);
    history.replaceState(null, "", "#/analytics?" + q);
  }, [aId, bId, metric, season]);
  const save = () => {
    try {
      localStorage.setItem(
        "pulse-v2-comparison",
        JSON.stringify({ season, a: aId, b: bId, metric }),
      );
      setMessage("Comparison saved in this browser.");
    } catch {
      setMessage("Browser storage is unavailable.");
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="PERFORMANCE & HISTORICAL ANALYTICS"
        title="Two drivers. One clear picture."
        description="Compare real race outcomes in a common season. Change the season above to explore history."
      >
        <button
          className="button secondary"
          onClick={save}
          disabled={!A || !B || aId === bId}
        >
          <Save size={16} />
          Save comparison
        </button>
      </PageTitle>
      <div className="panel comparison-controls">
        <DriverSelect
          label="Driver A"
          value={aId}
          onChange={setA}
          drivers={list}
        />
        <button
          className="icon-button swap"
          aria-label="Swap comparison drivers"
          onClick={() => {
            setA(bId);
            setB(aId);
          }}
        >
          <ArrowLeftRight size={19} />
        </button>
        <DriverSelect
          label="Driver B"
          value={bId}
          onChange={setB}
          drivers={list}
        />
        <button
          className="button secondary"
          onClick={() => {
            try {
              const s = JSON.parse(
                localStorage.getItem("pulse-v2-comparison") || "null",
              );
              if (
                s &&
                s.season === season &&
                list.some((d) => d.driverId === s.a) &&
                list.some((d) => d.driverId === s.b) &&
                s.a !== s.b &&
                metrics.includes(s.metric)
              ) {
                setA(s.a);
                setB(s.b);
                setMetric(s.metric);
                setMessage("Saved comparison restored.");
              } else setMessage("No saved comparison for this season.");
            } catch {
              setMessage("Could not load saved comparison.");
            }
          }}
        >
          Load saved
        </button>
      </div>
      <p className="fine-print" role="status">
        {message}
      </p>
      <State
        loading={data.loading || ds.loading}
        error={data.error || ds.error}
        onRetry={() => {
          data.reload();
          ds.reload();
        }}
      />
      {aId === bId ? (
        <div className="empty">Choose two different drivers to compare.</div>
      ) : (
        sa &&
        sb && (
          <>
            <div className="comparison-score panel">
              <div>
                <span className="eyebrow">DRIVER A</span>
                <h2>{A && name(A)}</h2>
                <strong>{h2h.a}</strong>
              </div>
              <div>
                <span className="outline-chip">RACE HEAD-TO-HEAD</span>
                <p>{h2h.paired} shared race entries</p>
                <small>
                  Compares published finishing position, including classified
                  retirements.
                </small>
              </div>
              <div>
                <span className="eyebrow">DRIVER B</span>
                <h2>{B && name(B)}</h2>
                <strong>{h2h.b}</strong>
              </div>
            </div>
            <div className="panel">
              <Table
                headers={[
                  "Season metric",
                  A?.familyName || aId,
                  B?.familyName || bId,
                  "Definition",
                ]}
              >
                {[
                  [
                    "Race entries",
                    sa.starts,
                    sb.starts,
                    "Published race entries",
                  ],
                  ["Race wins", sa.wins, sb.wins, "Classified P1 finishes"],
                  [
                    "Podiums",
                    sa.podiums,
                    sb.podiums,
                    "Classified top-three finishes",
                  ],
                  [
                    "Race points",
                    sa.points,
                    sb.points,
                    "Excludes sprints and championship adjustments",
                  ],
                  [
                    "Average classified position",
                    sa.averageFinish.toFixed(2),
                    sb.averageFinish.toFixed(2),
                    "Includes all classified entries",
                  ],
                  [
                    "Net positions gained",
                    sa.gain,
                    sb.gain,
                    "Grid minus finish; excludes pit-lane starts",
                  ],
                  [
                    "Non-finish statuses",
                    sa.retirements,
                    sb.retirements,
                    "Status other than Finished or +N Lap(s)",
                  ],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </Table>
            </div>
          </>
        )
      )}
      <Section
        title="Your analytical perspective"
        subtitle="Race-only metrics. Championship points may include sprint points and adjustments."
        action={
          <ExportButton
            onClick={() =>
              exportCSV(`comparison-${season}.csv`, [
                ["Round", series[0].name, series[1].name],
                ...series[0].values.map((v, i) => [
                  v.x,
                  v.y ?? undefined,
                  series[1].values[i]?.y ?? undefined,
                ]),
              ])
            }
          />
        }
      >
        <div className="panel chart-panel">
          <div className="toolbar">
            <label className="field">
              <span>Metric</span>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="cumulative">Cumulative race points</option>
                <option value="points">Points by race</option>
                <option value="position">Finishing position</option>
                <option value="gain">Positions gained</option>
              </select>
            </label>
            <div className="tabs">
              <button
                className={mode === "line" ? "active" : ""}
                onClick={() => setMode("line")}
              >
                Trend
              </button>
              <button
                className={mode === "bar" ? "active" : ""}
                onClick={() => setMode("bar")}
              >
                By round
              </button>
            </div>
          </div>
          {mode === "line" ? (
            <Chart
              label={`${metric} comparison`}
              series={series}
              xLabel="Round"
              minY={metric === "position" ? 1 : undefined}
              reverseY={metric === "position"}
            />
          ) : (
            <div className="round-bars">
              {series[0].values.map((v, i) => (
                <div className="round-bar" key={v.x}>
                  <span>R{v.x}</span>
                  {series.map((s) => (
                    <div key={s.name}>
                      <span>{s.name}</span>
                      <i
                        style={{
                          width: `${(Math.abs(s.values[i]?.y || 0) / Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v.y || 0))))) * 100}%`,
                          background: s.color,
                        }}
                      />
                      <strong>{s.values[i]?.y ?? "—"}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <Source value={data.value} />
        </div>
      </Section>
      <Section
        title="Reliability across the grid"
        subtitle="Race-only finishing status; a non-finish status is not automatically a mechanical failure."
      >
        <div className="panel">
          <Table
            headers={[
              "Driver",
              "Entries",
              "Non-finish statuses",
              "Non-finish rate",
              "Average classified position",
            ]}
          >
            {list.map((d) => {
              const s = summarize(results(d.driverId));
              return s ? (
                <tr key={d.driverId}>
                  <td>
                    <Link to={"driver/" + d.driverId}>{name(d)}</Link>
                  </td>
                  <td>{s.starts}</td>
                  <td>{s.retirements}</td>
                  <td>{((s.retirements / s.starts) * 100).toFixed(1)}%</td>
                  <td>{s.averageFinish.toFixed(2)}</td>
                </tr>
              ) : null;
            })}
          </Table>
        </div>
      </Section>
    </>
  );
}
function Strategy() {
  const [laps, setLaps] = useState(60),
    [base, setBase] = useState(90),
    [deg, setDeg] = useState(0.08),
    [loss, setLoss] = useState(22),
    [pit1, setPit1] = useState(30),
    [pit2, setPit2] = useState(20),
    [pit3, setPit3] = useState(40),
    [traffic, setTraffic] = useState(0);
  let a,
    b,
    error = "";
  try {
    a = strategyTime(laps, base, [pit1], deg, loss, traffic);
    b = strategyTime(laps, base, [pit2, pit3], deg, loss, traffic);
  } catch (e) {
    error = (e as Error).message;
  }
  const fields = [
    ["Race laps", laps, setLaps, 20, 100, 1],
    ["Base lap time (s)", base, setBase, 40, 180, 0.5],
    ["Degradation per lap (s)", deg, setDeg, 0, 0.5, 0.01],
    ["Pit-lane time loss (s)", loss, setLoss, 5, 60, 1],
    ["One-stop: pit lap", pit1, setPit1, 1, laps - 1, 1],
    ["Two-stop: first pit lap", pit2, setPit2, 1, laps - 1, 1],
    ["Two-stop: second pit lap", pit3, setPit3, 1, laps - 1, 1],
    ["Total traffic penalty (s)", traffic, setTraffic, 0, 60, 1],
  ] as const;
  const reset = () => {
    setLaps(60);
    setBase(90);
    setDeg(0.08);
    setLoss(22);
    setPit1(30);
    setPit2(20);
    setPit3(40);
    setTraffic(0);
  };
  const sweep = [-0.04, -0.02, 0, 0.02, 0.04].map((delta) => {
    const d = Math.max(0, deg + delta);
    try {
      return {
        d,
        a: strategyTime(laps, base, [pit1], d, loss, traffic).time,
        b: strategyTime(laps, base, [pit2, pit3], d, loss, traffic).time,
      };
    } catch {
      return { d, a: null, b: null };
    }
  });
  return (
    <>
      <PageTitle
        eyebrow="STRATEGY EXPLORER · SIMULATION"
        title="You make the call."
        description="An honest what-if model. Every parameter is an assumption you control."
      >
        <button className="button secondary" onClick={reset}>
          <RotateCcw size={15} />
          Reset assumptions
        </button>
      </PageTitle>
      <div className="notice">
        <GitBranch size={18} />
        <p>
          This is a simplified deterministic simulation, not a race prediction.
          It does not model actual tyres, safety cars, fuel, compound changes or
          driver behavior. Both plans use the same user-defined base pace and
          degradation.
        </p>
      </div>
      <div className="strategy-layout">
        <div className="panel assumptions">
          <h2>Your assumptions</h2>
          {fields.map(([label, value, set, min, max, step]) => (
            <label className="range-field" key={label}>
              <span>
                {label}
                <strong>{Number(value).toFixed(step < 1 ? 2 : 0)}</strong>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => set(+e.target.value)}
              />
            </label>
          ))}
        </div>
        <div>
          {error ? (
            <State error={error} />
          ) : (
            a &&
            b && (
              <>
                <div className="two-columns">
                  <div className="panel strategy-result">
                    <span className="eyebrow">PLAN A · ONE STOP</span>
                    <h2>{seconds(a.time)}</h2>
                    <p>Total simulated race time</p>
                    <span
                      className={`status-chip ${a.time < b.time ? "upcoming" : ""}`}
                    >
                      {a.time < b.time
                        ? "Quicker in this model"
                        : "Alternative plan"}
                    </span>
                  </div>
                  <div className="panel strategy-result">
                    <span className="eyebrow">PLAN B · TWO STOPS</span>
                    <h2>{seconds(b.time)}</h2>
                    <p>Total simulated race time</p>
                    <span
                      className={`status-chip ${b.time < a.time ? "upcoming" : ""}`}
                    >
                      {b.time < a.time
                        ? "Quicker in this model"
                        : "Alternative plan"}
                    </span>
                  </div>
                </div>
                <Section
                  title="The strategy timeline"
                  subtitle={`Difference: ${Math.abs(a.time - b.time).toFixed(2)} seconds under your assumptions.`}
                >
                  <div className="panel stint-panel">
                    {[
                      { label: "PLAN A", v: a },
                      { label: "PLAN B", v: b },
                    ].map(({ label, v }) => (
                      <div className="stint-plan" key={label}>
                        <strong>{label}</strong>
                        <div>
                          {v.stints.map((s, i) => (
                            <span
                              key={i}
                              style={{
                                width: `${(s.laps / laps) * 100}%`,
                                background: ["#ed4655", "#598fe7", "#40b999"][
                                  i
                                ],
                              }}
                            >
                              L{s.start}–{s.end}
                              <small>{s.laps} laps</small>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section
                  title="Sensitivity to tyre degradation"
                  subtitle="A parameter sweep, not a statistical confidence interval."
                >
                  <div className="panel chart-panel">
                    <Chart
                      label="Simulated race time by degradation assumption"
                      xLabel="Degradation (s/lap)"
                      yLabel="Total seconds"
                      series={[
                        {
                          name: "One stop",
                          color: "#ed4655",
                          values: sweep.map((s) => ({ x: s.d, y: s.a })),
                        },
                        {
                          name: "Two stops",
                          color: "#67a8ff",
                          values: sweep.map((s) => ({ x: s.d, y: s.b })),
                        },
                      ]}
                    />
                  </div>
                </Section>
              </>
            )
          )}
        </div>
      </div>
      <Section title="How this model works">
        <div className="panel settings-panel">
          <p>
            Each stint starts at base pace. Lap age increases the lap time
            linearly. For a stint of n laps, time = n × base + degradation × n ×
            (n − 1) / 2. Add pit-lane loss per stop and a total traffic penalty.
            Fuel load and all tyre compounds are treated identically.
          </p>
          <p>
            There is no historical calibration in these defaults. Use measured
            lap pace and pit-lane durations from the race and archive pages to
            choose assumptions. A real stop duration is not necessarily the same
            as net pit time loss.
          </p>
          <Link className="text-link" to="telemetry">
            Inspect measured historical stints ↗
          </Link>
        </div>
      </Section>
    </>
  );
}
function Scenario() {
  const { season } = usePrefs();
  const ds = useData(() => standings(season), [season]);
  const [order, setOrder] = useState<string[]>([]),
    [kind, setKind] = useState("race"),
    [fastest, setFastest] = useState("");
  const actual = season === "current" ? new Date().getFullYear() : +season;
  const source = ds.value?.data || [];
  const chosen = Array.from(
    { length: kind === "sprint" ? (actual === 2021 ? 3 : 8) : 10 },
    (_, i) => order[i] || source[i]?.Driver.driverId || "",
  ).filter(Boolean);
  let projected: ReturnType<typeof projectChampionship> = [],
    error = "";
  try {
    if (source.length)
      projected = projectChampionship(source, chosen, actual, kind, fastest);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <>
      <PageTitle
        eyebrow="CHAMPIONSHIP SCENARIO · SIMULATION"
        title="Rewrite the next chapter."
        description="Add one hypothetical full-points event to the published standings. Your scenario, clearly separated from official results."
      >
        <button
          className="button secondary"
          onClick={() => {
            setOrder([]);
            setFastest("");
          }}
        >
          <RotateCcw size={16} />
          Reset scenario
        </button>
      </PageTitle>
      <div className="notice">
        <Trophy size={19} />
        <p>
          Supported scoring: 2010 onward, full-points races only. Sprint scoring
          starts in 2021. Ties retain current order; official championship
          countback is not recalculated. This adds an event to the selected
          standings, even when the season has ended.
        </p>
      </div>
      <State loading={ds.loading} error={ds.error} onRetry={ds.reload} />
      <div className="scenario-layout">
        <div className="panel scenario-input">
          <h2>Your hypothetical classification</h2>
          <label className="field">
            <span>Event format</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setOrder([]);
              }}
            >
              <option value="race">Full-points Grand Prix</option>
              <option value="sprint">Sprint</option>
            </select>
          </label>
          {chosen.map((id, i) => (
            <label className="scenario-row" key={i}>
              <span>P{i + 1}</span>
              <select
                aria-label={`Scenario position ${i + 1}`}
                value={id}
                onChange={(e) => {
                  const arr = [...chosen];
                  arr[i] = e.target.value;
                  setOrder(arr);
                }}
              >
                {source.map((s) => (
                  <option key={s.Driver.driverId} value={s.Driver.driverId}>
                    {name(s.Driver)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {actual >= 2019 && actual <= 2024 && kind === "race" && (
            <label className="field">
              <span>Fastest lap (top 10 eligible)</span>
              <select
                value={fastest}
                onChange={(e) => setFastest(e.target.value)}
              >
                <option value="">No bonus assigned</option>
                {source.map((s) => (
                  <option key={s.Driver.driverId} value={s.Driver.driverId}>
                    {name(s.Driver)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="fine-print">
            Race: 25–18–15–12–10–8–6–4–2–1. Sprint: 3–2–1 in 2021;
            8–7–6–5–4–3–2–1 from 2022. Fastest-lap bonus applies only in
            2019–2024 and only to top-ten finishers.
          </p>
        </div>
        <div className="panel">
          <div className="section-head inset">
            <h2>Projected standings</h2>
            <span className="outline-chip">SIMULATED</span>
          </div>
          {error ? (
            <State error={error} />
          ) : (
            <Table
              headers={[
                "Projected",
                "Driver",
                "Official points",
                "Added",
                "Scenario points",
              ]}
            >
              {projected.map((s, i) => (
                <tr key={s.Driver.driverId}>
                  <td className="position">P{i + 1}</td>
                  <td>
                    <Link to={"driver/" + s.Driver.driverId}>
                      {name(s.Driver)}
                    </Link>
                  </td>
                  <td>{s.originalPoints}</td>
                  <td className="positive">+{s.added}</td>
                  <td className="table-points">{s.projected}</td>
                </tr>
              ))}
            </Table>
          )}
          <Source value={ds.value} />
        </div>
      </div>
    </>
  );
}
