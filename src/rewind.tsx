import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, Trophy } from "lucide-react";
import { races, raceResult, request, useData } from "./api";
import { usePrefs } from "./context";
import { recordedRank } from "./domain.mjs";
import { name, teamColor } from "./media";
import {
  PageTitle,
  Section,
  Metric,
  Source,
  State,
  Table,
  DriverIdentity,
  Logo,
  Link,
  ExportButton,
  exportCSV,
} from "./ui";
import type { Envelope, Standing, TeamStanding, Driver, Team } from "./types";
type FrameRow = {
  id: string;
  label: string;
  position: number | null;
  points: number;
  wins: number;
  driver?: Driver;
  team?: Team;
};
async function frame(
  season: string,
  round: string,
  kind: string,
): Promise<Envelope<FrameRow[]>> {
  const data = await request<any>(
    "jolpica",
    `${season}/${round}/${kind === "drivers" ? "driverStandings" : "constructorStandings"}.json`,
  );
  const standings = data.data.MRData.StandingsTable.StandingsLists[0];
  const rows: FrameRow[] =
    kind === "drivers"
      ? (standings?.DriverStandings || []).map((s: Standing) => ({
          id: s.Driver.driverId,
          label: name(s.Driver),
          position: recordedRank(s.position),
          points: +s.points,
          wins: +s.wins,
          driver: s.Driver,
          team: s.Constructors[0],
        }))
      : (standings?.ConstructorStandings || []).map((s: TeamStanding) => ({
          id: s.Constructor.constructorId,
          label: s.Constructor.name,
          position: recordedRank(s.position),
          points: +s.points,
          wins: +s.wins,
          team: s.Constructor,
        }));
  return { ...data, data: rows };
}
export default function ChampionshipRewind() {
  const { season } = usePrefs();
  const schedule = useData(() => races(season), [season]);
  const last = useData(() => raceResult(season, "last"), [season]);
  const completed = (schedule.value?.data || []).filter(
    (r) => +r.round <= +(last.value?.data?.round || 0),
  );
  const [selection, setSelection] = useState(
    () => new URLSearchParams(location.hash.split("?")[1]).get("round") || "",
  );
  const [kind, setKind] = useState("drivers");
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const selected =
    completed.find((r) => r.round === selection) || completed.at(-1);
  const index = completed.findIndex((r) => r.round === selected?.round);
  const previous = completed[index - 1];
  const data = useData(
    async () =>
      selected
        ? frame(season, selected.round, kind)
        : {
            data: [],
            meta: { source: "jolpica", url: "", fetchedAt: "", status: "" },
          },
    [season, selected?.round, kind],
  );
  const before = useData(
    async () =>
      previous
        ? frame(season, previous.round, kind)
        : {
            data: [],
            meta: { source: "jolpica", url: "", fetchedAt: "", status: "" },
          },
    [season, previous?.round, kind],
  );
  const previousRows = new Map(
    (before.value?.data || []).map((s) => [s.id, s]),
  );
  const rows = data.value?.data || [];
  const leader = rows[0],
    runner = rows[1];
  const changeFrom = (row: FrameRow) => {
    const prior = previousRows.get(row.id);
    return prior?.position != null && row.position != null
      ? prior.position - row.position
      : null;
  };
  const deltas = rows.flatMap((row) => {
    const gain = changeFrom(row);
    return gain === null ? [] : [{ row, gain }];
  });
  const biggest = [...deltas].sort((a, b) => b.gain - a.gain)[0];
  useEffect(() => {
    if (!selected) return;
    const url = new URL(location.href);
    const q = new URLSearchParams(url.hash.split("?")[1]);
    q.set("season", season);
    q.set("round", selected.round);
    url.hash = "/rewind?" + q;
    history.replaceState(null, "", url);
  }, [selected?.round, season]);
  useEffect(() => {
    const update = () =>
      setSelection(
        new URLSearchParams(location.hash.split("?")[1]).get("round") || "",
      );
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const move = (value: string) => {
    setDraftIndex(null);
    setSelection(value);
    const q = new URLSearchParams(location.hash.split("?")[1]);
    q.set("round", value);
    history.replaceState(null, "", "#/rewind?" + q);
  };
  useEffect(() => {
    if (draftIndex === null) return;
    const timer = setTimeout(() => {
      const target = completed[draftIndex];
      if (target) move(target.round);
    }, 300);
    return () => clearTimeout(timer);
  }, [draftIndex, season, completed.length]);
  return (
    <>
      <PageTitle
        eyebrow="PUBLISHED CHAMPIONSHIP HISTORY"
        title="Every round. A different story."
        description="Rewind the actual championship standings after each Grand Prix. Includes the provider's recorded sprint points and adjustments."
      >
        <Link to="standings" className="button secondary">
          <Trophy size={16} />
          Latest standings
        </Link>
      </PageTitle>
      <State
        loading={schedule.loading || last.loading}
        error={schedule.error || last.error}
        onRetry={() => {
          schedule.reload();
          last.reload();
        }}
        empty={
          !schedule.loading &&
          !last.loading &&
          !schedule.error &&
          !last.error &&
          !completed.length
        }
      />
      {selected && (
        <>
          <div className="rewind-selector panel">
            <div className="row spread">
              <span className="eyebrow">
                <History size={15} />
                SEASON REWIND
              </span>
              <div className="tabs">
                {["drivers", "constructors"].map((k) => (
                  <button
                    key={k}
                    aria-pressed={kind === k}
                    className={kind === k ? "active" : ""}
                    onClick={() => setKind(k)}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="rewind-event">
              <span className="rewind-round">
                {selected.round.padStart(2, "0")}
              </span>
              <div>
                <span className="eyebrow">AFTER ROUND {selected.round}</span>
                <h2>{selected.raceName}</h2>
                <p>
                  {selected.Circuit.circuitName} ·{" "}
                  {new Date(selected.date + "T00:00:00Z").toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    },
                  )}
                </p>
              </div>
              <Link to={"race/" + selected.round} className="text-link">
                Explore the race ↗
              </Link>
            </div>
            <div className="rewind-controls">
              <button
                className="icon-button"
                aria-label="Previous championship round"
                disabled={index <= 0}
                onClick={() => move(completed[index - 1].round)}
              >
                <ChevronLeft size={20} />
              </button>
              <label className="rewind-range">
                <span className="sr-only">Championship round</span>
                <input
                  aria-label="Championship round"
                  type="range"
                  min={0}
                  max={completed.length - 1}
                  value={draftIndex ?? Math.max(0, index)}
                  aria-valuetext={`Round ${selected.round}: ${selected.raceName}`}
                  onChange={(e) => setDraftIndex(+e.target.value)}
                />
              </label>
              <button
                className="icon-button"
                aria-label="Next championship round"
                disabled={index >= completed.length - 1}
                onClick={() => move(completed[index + 1].round)}
              >
                <ChevronRight size={20} />
              </button>
              <label className="field">
                <span className="sr-only">Choose championship round</span>
                <select
                  aria-label="Choose championship round"
                  value={selected.round}
                  onChange={(e) => move(e.target.value)}
                >
                  {completed.map((r) => (
                    <option key={r.round} value={r.round}>
                      R{r.round} · {r.raceName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="fine-print">
              Each frame is a published standings snapshot. Movement compares
              with{" "}
              {previous
                ? `round ${previous.round}`
                : "no earlier round in this season"}
              . Select a round to load its records.
            </p>
          </div>
          <State
            loading={data.loading}
            error={data.error}
            onRetry={data.reload}
            empty={!data.loading && !data.error && !rows.length}
          />
          {!!rows.length && (
            <>
              <div className="overview-metrics">
                <Metric
                  label="Championship leader"
                  value={leader.label}
                  detail={`${leader.points} points after R${selected.round}`}
                />
                <Metric
                  label="Gap at the top"
                  value={runner ? `${leader.points - runner.points} PTS` : "—"}
                  detail={
                    runner
                      ? `Ahead of ${runner.label}`
                      : "No runner-up published"
                  }
                />
                <Metric
                  label="Largest rank gain"
                  value={biggest && biggest.gain > 0 ? biggest.row.label : "—"}
                  detail={
                    biggest && biggest.gain > 0
                      ? `Up ${biggest.gain} places from previous round`
                      : "No measured positive rank change"
                  }
                />
                <Metric
                  label="Season wins"
                  value={leader.wins}
                  detail={`Leader's recorded wins after round ${selected.round}`}
                />
              </div>
              <Section
                title="The championship at this moment"
                subtitle="Rank change and points change use the preceding round's published standings."
                action={
                  <ExportButton
                    onClick={() =>
                      exportCSV(
                        `championship-${season}-round-${selected.round}-${kind}.csv`,
                        [
                          [
                            "Round",
                            "Rank",
                            "Name",
                            "Points",
                            "Wins",
                            "Rank change",
                            "Points change",
                          ],
                          ...rows.map((s) => {
                            const prior = previousRows.get(s.id);
                            return [
                              selected.round,
                              s.position ?? undefined,
                              s.label,
                              s.points,
                              s.wins,
                              changeFrom(s) ?? undefined,
                              prior ? s.points - prior.points : undefined,
                            ];
                          }),
                        ],
                      )
                    }
                  />
                }
              >
                <div className="panel">
                  <Table
                    headers={[
                      "Rank",
                      kind === "drivers" ? "Driver" : "Constructor",
                      "Points",
                      "Change",
                      "Points change",
                      "Wins",
                      "Gap to leader",
                    ]}
                  >
                    {rows.map((s) => {
                      const prior = previousRows.get(s.id),
                        change = changeFrom(s);
                      return (
                        <tr key={s.id}>
                          <td className="position">
                            {s.position === null
                              ? "—"
                              : String(s.position).padStart(2, "0")}
                          </td>
                          <td>
                            {s.driver ? (
                              <DriverIdentity
                                driver={s.driver}
                                team={s.team}
                                season={season}
                              />
                            ) : (
                              s.team && (
                                <Link to={"team/" + s.id} className="row">
                                  <Logo team={s.team} season={season} />
                                  <strong>{s.label}</strong>
                                </Link>
                              )
                            )}
                          </td>
                          <td className="table-points">{s.points}</td>
                          <td>
                            <span
                              className={`rank-change ${change && change > 0 ? "gain" : change && change < 0 ? "loss" : ""}`}
                            >
                              {change === null
                                ? "—"
                                : change > 0
                                  ? `↑ ${change}`
                                  : change < 0
                                    ? `↓ ${Math.abs(change)}`
                                    : "—"}
                            </span>
                          </td>
                          <td>
                            {prior
                              ? `${s.points - prior.points >= 0 ? "+" : ""}${s.points - prior.points}`
                              : "—"}
                          </td>
                          <td>{s.wins}</td>
                          <td>
                            {s.position === 1
                              ? "LEADER"
                              : `−${leader.points - s.points}`}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                  <Source value={data.value} />
                  {before.loading && (
                    <p className="fine-print rewind-baseline" role="status">
                      Loading previous-round changes…
                    </p>
                  )}
                  {before.error && (
                    <div className="rewind-baseline">
                      <p className="fine-print">
                        Previous-round records are unavailable. Changes are
                        omitted.
                      </p>
                      <button className="text-link" onClick={before.reload}>
                        Retry previous round
                      </button>
                    </div>
                  )}
                  {previous && <Source value={before.value} />}
                </div>
              </Section>
              <Section
                title="The distance to the lead"
                subtitle="Published championship points, measured against the leader at this round."
              >
                <div className="panel gap-ladder">
                  {rows.slice(0, 10).map((s) => (
                    <div key={s.id} className="gap-row">
                      <span>{s.label}</span>
                      <div className="bar-track">
                        <i
                          style={{
                            width: `${leader.points ? Math.max(1, (s.points / leader.points) * 100) : 0}%`,
                            background: teamColor(s.team),
                          }}
                        />
                      </div>
                      <strong>{s.points}</strong>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
          <Source value={schedule.value} />
        </>
      )}
    </>
  );
}
