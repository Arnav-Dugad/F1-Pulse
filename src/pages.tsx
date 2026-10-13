import { useEffect, useMemo, useState } from "react";
import circuitPhotos from "./circuits.json";
const circuitPhoto = (id: string) =>
  (circuitPhotos as Record<string, string>)[id];
import {
  ArrowUpRight,
  ArrowRight,
  Clock,
  MapPin,
  Flag,
  Trophy,
  Heart,
  CloudSun,
  Wind,
  Droplets,
  ExternalLink,
  Check,
  Download,
  SlidersHorizontal,
  Search,
  ChartNoAxesCombined,
  Gauge,
  Play,
  RefreshCw,
} from "lucide-react";
import { usePrefs } from "./context";
import {
  allResults,
  drivers,
  races,
  standings,
  teamStandings,
  raceResult,
  request,
  useData,
  wikiTitle,
  teams,
} from "./api";
import {
  Photo,
  PageTitle,
  Section,
  Metric,
  More,
  Link,
  State,
  Source,
  Table,
  DriverIdentity,
  Logo,
  Favorite,
  ExportButton,
  exportCSV,
  formatTime,
  seconds,
  Chart,
  download,
} from "./ui";
import { name, portraitEra, driverPhoto, teamAsset, teamColor } from "./media";
import { summarize, timeSeconds } from "./math.mjs";
import type { Driver, Team, Race, Result, Circuit } from "./types";
const year = (s: string) =>
  s === "current" ? String(new Date().getFullYear()) : s;
function Page({ route }: { route: string }) {
  const [view, id] = route.split("/");
  switch (view) {
    case "calendar":
      return <Calendar />;
    case "standings":
      return <Standings />;
    case "drivers":
      return <Drivers />;
    case "driver":
      return <DriverProfile id={id} />;
    case "teams":
      return <Teams />;
    case "team":
      return <TeamProfile id={id} />;
    case "circuits":
      return <Circuits />;
    case "circuit":
      return <CircuitPage id={id} />;
    case "race":
      return <RacePage round={id} />;
    case "news":
      return <News />;
    case "settings":
      return <Settings />;
    case "overview":
      return <Overview />;
    default:
      return (
        <>
          <PageTitle
            eyebrow="OFF THE RACING LINE"
            title="Page not found"
            description="Choose a destination from the paddock navigation."
          />
          <Link className="button" to="overview">
            Back to overview
          </Link>
        </>
      );
  }
}
export default Page;
function Countdown({ race }: { race: Race }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!race.time)
    return <span className="muted">Session time not published</span>;
  const delta =
    Math.max(0, Date.parse(race.date + "T" + race.time) - now) / 1000;
  return (
    <div className="countdown">
      {[
        Math.floor(delta / 86400),
        Math.floor((delta % 86400) / 3600),
        Math.floor((delta % 3600) / 60),
        Math.floor(delta % 60),
      ].map((n, i) => (
        <div key={i}>
          <strong>{String(n).padStart(2, "0")}</strong>
          <span>{["DAYS", "HRS", "MIN", "SEC"][i]}</span>
        </div>
      ))}
    </div>
  );
}
function Overview() {
  const { season, timezone } = usePrefs();
  const cal = useData(() => races(season), [season]),
    ds = useData(() => standings(season), [season]),
    ts = useData(() => teamStandings(season), [season]),
    last = useData(() => raceResult(season, "last"), [season]);
  const schedule = cal.value?.data || [],
    next = schedule.find(
      (r) => Date.parse(r.date + "T" + (r.time || "23:59:59Z")) > Date.now(),
    );
  const event = next || schedule.at(-1);
  const leader = ds.value?.data[0],
    runner = ds.value?.data[1];
  const result = last.value?.data;
  return (
    <>
      <div className="overview-intro">
        <div>
          <div className="eyebrow">
            <span />
            THE {year(season)} PADDOCK
          </div>
          <h1>
            Welcome to your race world<span>.</span>
          </h1>
          <p>Every weekend. Every driver. Every detail that matters.</p>
        </div>
        <span className="outline-chip">
          <Flag size={14} />
          Independent fan platform
        </span>
      </div>
      <section className="hero">
        <Photo
          className="hero-photo"
          src="/assets/hero.webp"
          alt="Formula 1 cars on track at the 2026 Singapore Grand Prix"
          eager
        />
        <div className="hero-shade" />
        <div className="hero-copy">
          <div className="hero-kicker">
            <span />
            THE SPORT WE LIVE FOR
          </div>
          <h2>
            Feel every
            <br />
            <em>moment.</em>
          </h2>
          <p>
            Your all-access perspective on Formula 1.
            <br />
            From the first lights to the last lap.
          </p>
          <div className="row">
            <Link
              className="button"
              to={event ? "race/" + event.round : "calendar"}
            >
              Explore race weekend
              <ArrowUpRight size={17} />
            </Link>
            <Link className="hero-secondary" to="analytics">
              Go beyond the result
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        <div className="hero-event">
          {cal.loading ? (
            <State loading />
          ) : event ? (
            <>
              <span className="hero-kicker">
                {next ? "NEXT ON THE CALENDAR" : "SEASON FINALE"} · ROUND{" "}
                {event.round}
              </span>
              <h3>
                {event.raceName.replace("Grand Prix", "")}
                <span>Grand Prix</span>
              </h3>
              <p>
                <MapPin size={14} />
                {event.Circuit.Location.locality},{" "}
                {event.Circuit.Location.country}
              </p>
              <div className="event-time">
                <Clock size={14} />
                {formatTime(event.date, event.time, timezone)}{" "}
                {timezone === "local" ? "your time" : timezone}
              </div>
              {next ? (
                <Countdown race={event} />
              ) : (
                <Link className="text-link" to={"race/" + event.round}>
                  Explore the weekend ↗
                </Link>
              )}
            </>
          ) : (
            <State error={cal.error} onRetry={cal.reload} />
          )}
        </div>
        <span className="photo-caption">
          Trackside photography · Singapore 2026 · Formula 1
        </span>
      </section>
      <div className="overview-metrics">
        <Metric
          label="Calendar"
          value={schedule.length || "—"}
          detail={`${year(season)} Grands Prix published`}
        />
        <Metric
          label="Championship leader"
          value={leader ? leader.Driver.familyName : "—"}
          detail={
            leader
              ? `${leader.points} points · ${leader.wins} wins`
              : "Awaiting published standings"
          }
        />
        <Metric
          label="Battle at the top"
          value={
            leader && runner ? `${+leader.points - +runner.points} PTS` : "—"
          }
          detail={
            runner
              ? `Gap to ${runner.Driver.familyName}`
              : "From published standings"
          }
        />
        <Metric
          label="Latest race winner"
          value={result?.Results?.[0]?.Driver.familyName || "—"}
          detail={result?.raceName || "Results pending"}
        />
      </div>
      <div className="two-columns">
        <Section
          title="Championship pulse"
          subtitle="The drivers setting the pace."
          action={<More to="standings">Full standings</More>}
        >
          <div className="panel">
            <State
              loading={ds.loading}
              error={ds.error}
              empty={!ds.loading && !ds.error && !ds.value?.data.length}
              onRetry={ds.reload}
            />
            {ds.value?.data.slice(0, 5).map((s) => (
              <Link
                to={"driver/" + s.Driver.driverId}
                className="standing-row"
                key={s.Driver.driverId}
              >
                <span className="rank">{s.position.padStart(2, "0")}</span>
                <Photo
                  className="avatar"
                  src={driverPhoto(s.Driver, season)}
                  alt={name(s.Driver)}
                />
                <span className="standing-name">
                  <strong>{name(s.Driver)}</strong>
                  <small>
                    <i style={{ background: teamColor(s.Constructors[0]) }} />
                    {s.Constructors.map((x) => x.name).join(" / ")}
                  </small>
                </span>
                <div className="points">
                  <strong>{s.points}</strong>
                  <small>PTS</small>
                </div>
                <span
                  className="point-bar"
                  style={{
                    width: `${Math.max(2, (+s.points / +(leader?.points || 1)) * 100)}%`,
                    background: teamColor(s.Constructors[0]),
                  }}
                />
              </Link>
            ))}
            <Source value={ds.value} />
          </div>
        </Section>
        <Section
          title="The latest chequered flag"
          subtitle="Published classification. Every position earned."
          action={
            result && <More to={"race/" + result.round}>Race report</More>
          }
        >
          <div className="panel latest-panel">
            {last.loading || last.error ? (
              <State
                loading={last.loading}
                error={last.error}
                onRetry={last.reload}
              />
            ) : result ? (
              <>
                <div className="latest-title">
                  <span className="eyebrow">ROUND {result.round}</span>
                  <h3>{result.raceName}</h3>
                  <span>{formatTime(result.date)}</span>
                </div>
                <div className="podium">
                  {result.Results?.slice(0, 3).map((r) => (
                    <Link
                      to={"driver/" + r.Driver.driverId}
                      key={r.position}
                      className="podium-driver"
                      style={
                        {
                          "--team": teamColor(r.Constructor),
                        } as React.CSSProperties
                      }
                    >
                      <span className="podium-position">P{r.position}</span>
                      <Photo
                        src={driverPhoto(r.Driver, season)}
                        alt={name(r.Driver)}
                      />
                      <strong>{r.Driver.familyName}</strong>
                      <small>{r.Constructor.name}</small>
                      <span className="podium-points">+{r.points} points</span>
                    </Link>
                  ))}
                </div>
                <Source value={last.value} />
              </>
            ) : (
              <State empty />
            )}
          </div>
        </Section>
      </div>
      <Section
        title="More than a badge."
        subtitle="Discover the people, machinery, and rivalries behind the grid."
        action={<More to="teams">Meet the teams</More>}
      >
        <div className="team-preview-grid">
          {ts.value?.data.slice(0, 3).map((s) => (
            <Link
              to={"team/" + s.Constructor.constructorId}
              className="team-preview panel"
              key={s.position}
              style={
                { "--team": teamColor(s.Constructor) } as React.CSSProperties
              }
            >
              <div className="row spread">
                <span className="outline-chip">P{s.position}</span>
                <Logo team={s.Constructor} season={season} />
              </div>
              <Photo
                className="car-preview"
                src={teamAsset(s.Constructor, "cars", season)}
                alt={`${year(season)} ${s.Constructor.name} Formula 1 car`}
              />
              <div className="row spread">
                <div>
                  <h3>{s.Constructor.name}</h3>
                  <p>
                    {s.points} points · {s.wins} wins
                  </p>
                </div>
                <ArrowUpRight size={21} />
              </div>
            </Link>
          ))}
          {ts.error && <State error={ts.error} onRetry={ts.reload} />}
        </div>
      </Section>
      <Section
        title="A different kind of race intelligence."
        subtitle="Go deeper. Find your own answers."
        action={<More to="analytics">Open the studio</More>}
      >
        <div className="tool-grid">
          {[
            {
              id: "telemetry",
              Icon: Gauge,
              title: "Every input. Every advantage.",
              text: "Compare recorded speed, throttle, braking and lap traces.",
              tag: "TELEMETRY LAB",
            },
            {
              id: "replay",
              Icon: Play,
              title: "Relive the racing line.",
              text: "Follow real archived location samples through a selected lap.",
              tag: "HISTORICAL PLAYBACK",
            },
            {
              id: "strategy",
              Icon: ChartNoAxesCombined,
              title: "What if you called the shots?",
              text: "Explore pit windows and degradation with explicit assumptions.",
              tag: "STRATEGY EXPLORER",
            },
          ].map((t) => (
            <Link key={t.id} to={t.id} className="tool-card panel">
              <t.Icon size={24} />
              <span className="eyebrow">{t.tag}</span>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <ArrowUpRight className="tool-arrow" size={20} />
            </Link>
          ))}
        </div>
      </Section>
      <Source value={cal.value} />
    </>
  );
}
function Calendar() {
  const { season, timezone } = usePrefs();
  const data = useData(() => races(season), [season]);
  const [filter, setFilter] = useState("all"),
    [q, setQ] = useState("");
  const list = (data.value?.data || [])
    .filter((r) =>
      `${r.raceName} ${r.Circuit.Location.country}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .filter(
      (r) =>
        filter === "all" ||
        Date.parse(r.date + "T" + (r.time || "23:59:59Z")) > Date.now() ===
          (filter === "upcoming"),
    );
  const calendar = () => {
    const events = (data.value?.data || []).map(
      (r) =>
        `BEGIN:VEVENT\r\nUID:${r.season}-${r.round}@f1pulse\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\nDTSTART${r.time ? "" : ";VALUE=DATE"}:${r.date.replace(/-/g, "")}${r.time ? "T" + r.time.replace(/:/g, "") : ""}\r\nSUMMARY:${r.raceName}\r\nLOCATION:${r.Circuit.circuitName}\r\nURL:${r.url}\r\nEND:VEVENT`,
    );
    download(
      "f1-pulse-" + year(season) + ".ics",
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//F1 Pulse//Race Calendar//EN\r\n" +
        events.join("\r\n") +
        "\r\nEND:VCALENDAR",
      "text/calendar",
    );
  };
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} SEASON`}
        title="Around the world. Flat out."
        description="Your complete race calendar, with session times in your chosen timezone."
      >
        <button
          className="button secondary"
          onClick={calendar}
          disabled={!data.value}
        >
          <Download size={16} />
          Add to calendar
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="tabs">
          {["all", "upcoming", "completed"].map((t) => (
            <button
              key={t}
              className={filter === t ? "active" : ""}
              onClick={() => setFilter(t)}
            >
              {t === "all" ? "All races" : t}
            </button>
          ))}
        </div>
        <label className="filter-search">
          <Search size={16} />
          <input
            aria-label="Filter races"
            placeholder="Find a Grand Prix…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      <State
        loading={data.loading}
        error={data.error}
        empty={!data.loading && !data.error && !list.length}
        onRetry={data.reload}
      />
      <div className="calendar-grid">
        {list.map((r) => (
          <RaceCard key={r.round} race={r} />
        ))}
      </div>
      <Source value={data.value} />
    </>
  );
}
function RaceCard({ race: r }: { race: Race }) {
  const { timezone } = usePrefs();
  const future =
    Date.parse(r.date + "T" + (r.time || "23:59:59Z")) > Date.now();
  return (
    <Link to={"race/" + r.round} className="race-card panel">
      <div className="row spread">
        <span className="eyebrow">ROUND {r.round.padStart(2, "0")}</span>
        <span className={`status-chip ${future ? "upcoming" : ""}`}>
          {future ? "Upcoming" : "Past event"}
        </span>
      </div>
      {circuitPhoto(r.Circuit.circuitId) && (
        <Photo
          className="race-card-photo"
          src={circuitPhoto(r.Circuit.circuitId)}
          alt={`Photography of ${r.Circuit.circuitName}`}
        />
      )}
      <div className="race-country">{r.Circuit.Location.country}</div>
      <h3>{r.raceName}</h3>
      <p>{r.Circuit.circuitName}</p>
      <div className="race-card-footer">
        <span>
          <CalendarDaysIcon />
          {formatTime(r.date, r.time, timezone)}
        </span>
        <ArrowUpRight size={18} />
      </div>
    </Link>
  );
}
function CalendarDaysIcon() {
  return <Clock size={14} />;
}
function Standings() {
  const { season } = usePrefs();
  const ds = useData(() => standings(season), [season]),
    ts = useData(() => teamStandings(season), [season]);
  const [kind, setKind] = useState("drivers"),
    [q, setQ] = useState(""),
    [sort, setSort] = useState("position");
  const list = (ds.value?.data || [])
    .filter((s) =>
      `${name(s.Driver)} ${s.Constructors.map((t) => t.name)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "wins" ? +b.wins - +a.wins : +a.position - +b.position,
    );
  const value = kind === "drivers" ? ds : ts;
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} CHAMPIONSHIP`}
        title="The chase for greatness."
        description="Published championship standings. Explore any season back to 1950."
      >
        <Link to="scenario" className="button secondary">
          <Trophy size={15} />
          Explore title scenarios
        </Link>
      </PageTitle>
      <div className="toolbar">
        <div className="tabs">
          {["drivers", "constructors"].map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={kind === k ? "active" : ""}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="filter-search">
            <Search size={15} />
            <input
              aria-label="Filter standings"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Driver or team…"
            />
          </label>
          <label>
            <span className="sr-only">Sort standings</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="position">By championship position</option>
              <option value="wins">By wins</option>
            </select>
          </label>
          <ExportButton
            onClick={() =>
              exportCSV(
                `standings-${year(season)}.csv`,
                kind === "drivers"
                  ? [
                      ["Position", "Driver", "Team", "Points", "Wins"],
                      ...list.map((s) => [
                        s.position,
                        name(s.Driver),
                        s.Constructors.map((t) => t.name).join(" / "),
                        s.points,
                        s.wins,
                      ]),
                    ]
                  : [
                      ["Position", "Team", "Points", "Wins"],
                      ...(ts.value?.data || []).map((s) => [
                        s.position,
                        s.Constructor.name,
                        s.points,
                        s.wins,
                      ]),
                    ],
              )
            }
          />
        </div>
      </div>
      <div className="panel">
        <State
          loading={value.loading}
          error={value.error}
          empty={!value.loading && !value.error && !value.value?.data.length}
          onRetry={value.reload}
        />
        {kind === "drivers" ? (
          <Table
            headers={[
              "Rank",
              "Driver / constructor",
              "Points",
              "Wins",
              "Gap to leader",
              "Share of leader points",
            ]}
          >
            {list.map((s) => (
              <tr key={s.Driver.driverId}>
                <td className="position">{s.position.padStart(2, "0")}</td>
                <td>
                  <DriverIdentity
                    driver={s.Driver}
                    team={s.Constructors[0]}
                    season={season}
                  />
                </td>
                <td className="table-points">{s.points}</td>
                <td>{s.wins}</td>
                <td>
                  {+s.position === 1
                    ? "LEADER"
                    : `−${+(ds.value?.data[0]?.points || 0) - +s.points}`}
                </td>
                <td>
                  <div className="bar-track">
                    <i
                      style={{
                        width: `${(+s.points / +(ds.value?.data[0]?.points || 1)) * 100}%`,
                        background: teamColor(s.Constructors[0]),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table
            headers={[
              "Rank",
              "Constructor",
              "Nationality",
              "Points",
              "Wins",
              "Gap to leader",
            ]}
          >
            {(ts.value?.data || [])
              .filter((s) =>
                s.Constructor.name.toLowerCase().includes(q.toLowerCase()),
              )
              .sort((a, b) =>
                sort === "wins" ? +b.wins - +a.wins : +a.position - +b.position,
              )
              .map((s) => (
                <tr key={s.Constructor.constructorId}>
                  <td className="position">{s.position.padStart(2, "0")}</td>
                  <td>
                    <Link
                      to={"team/" + s.Constructor.constructorId}
                      className="row"
                    >
                      <Logo team={s.Constructor} season={season} />
                      <strong>{s.Constructor.name}</strong>
                    </Link>
                  </td>
                  <td>{s.Constructor.nationality}</td>
                  <td className="table-points">{s.points}</td>
                  <td>{s.wins}</td>
                  <td>
                    {+s.position === 1
                      ? "LEADER"
                      : `−${+(ts.value?.data[0]?.points || 0) - +s.points}`}
                  </td>
                </tr>
              ))}
          </Table>
        )}
        <Source value={value.value} />
      </div>
    </>
  );
}
function Drivers() {
  const { season, favorites, setFavorites } = usePrefs();
  const data = useData(() => drivers(season), [season]),
    ds = useData(() => standings(season), [season]);
  const [q, setQ] = useState(""),
    [saved, setSaved] = useState(false);
  const list = (data.value?.data || []).filter(
    (d) =>
      name(d).toLowerCase().includes(q.toLowerCase()) &&
      (!saved || favorites.includes("driver:" + d.driverId)),
  );
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} SEASON DRIVERS`}
        title="The humans behind the helmets."
        description="Discover your heroes. Follow their season. Build your fan collection."
      />
      <div className="toolbar">
        <label className="filter-search">
          <Search size={16} />
          <input
            aria-label="Search drivers"
            placeholder="Find a driver…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button
          className={`button secondary ${saved ? "selected" : ""}`}
          onClick={() => setSaved((x) => !x)}
        >
          <Heart size={16} />
          {saved ? "Show all drivers" : "Your favorites"}
        </button>
      </div>
      <State
        loading={data.loading}
        error={data.error}
        empty={!data.loading && !data.error && !list.length}
        onRetry={data.reload}
      />
      <div className="driver-grid">
        {list.map((d) => {
          const standing = ds.value?.data.find(
              (s) => s.Driver.driverId === d.driverId,
            ),
            team = standing?.Constructors[0];
          return (
            <Link
              to={"driver/" + d.driverId}
              className="driver-card panel"
              key={d.driverId}
              style={{ "--team": teamColor(team) } as React.CSSProperties}
            >
              <div className="driver-card-top">
                <span className="driver-number">
                  {d.permanentNumber || d.code || "F1"}
                </span>
                <Favorite
                  id={"driver:" + d.driverId}
                  favorites={favorites}
                  setFavorites={setFavorites}
                />
              </div>
              <Photo
                className="driver-card-photo"
                src={driverPhoto(d, season)}
                alt={`${name(d)}, ${portraitEra(d, season)} driver portrait`}
              />
              <div className="driver-card-info">
                <span>
                  {d.givenName}
                  {d.driverId === "tsunoda" && (
                    <small className="archive-photo-label">
                      {" "}
                      · archival photo
                    </small>
                  )}
                </span>
                <h3>{d.familyName}</h3>
                <div className="row spread">
                  <p>{team?.name || d.nationality}</p>
                  <ArrowUpRight size={18} />
                </div>
                {standing && (
                  <div className="driver-card-stats">
                    <span>P{standing.position}</span>
                    <span>{standing.points} PTS</span>
                    <span>{standing.wins} WINS</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <Source value={data.value} />
    </>
  );
}
function Teams() {
  const { season, favorites, setFavorites } = usePrefs();
  const data = useData(() => teams(season), [season]),
    stand = useData(() => teamStandings(season), [season]);
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} CONSTRUCTORS`}
        title="Icons of the grid."
        description="The teams. The cars. The pursuit of the smallest advantage."
      />
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      <div className="constructor-grid">
        {data.value?.data.map((t) => {
          const s = stand.value?.data.find(
            (s) => s.Constructor.constructorId === t.constructorId,
          );
          return (
            <Link
              key={t.constructorId}
              className="constructor-card panel"
              to={"team/" + t.constructorId}
              style={{ "--team": teamColor(t) } as React.CSSProperties}
            >
              <div className="row spread">
                <Logo team={t} season={season} />
                <Favorite
                  id={"team:" + t.constructorId}
                  favorites={favorites}
                  setFavorites={setFavorites}
                />
              </div>
              <Photo
                className="constructor-car"
                src={teamAsset(t, "cars", season)}
                alt={`${year(season)} ${t.name} car`}
              />
              <div className="row spread">
                <div>
                  <h2>{t.name}</h2>
                  <p>{t.nationality} constructor</p>
                </div>
                <ArrowUpRight />
              </div>
              {s && (
                <div className="constructor-stats">
                  <Metric label="POSITION" value={"P" + s.position} />
                  <Metric label="POINTS" value={s.points} />
                  <Metric label="WINS" value={s.wins} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
      <Source value={data.value} />
    </>
  );
}
function ResultTable({
  rows,
  kind = "results",
}: {
  rows: Result[];
  kind?: string;
}) {
  const { season } = usePrefs();
  const [q, setQ] = useState(""),
    [sort, setSort] = useState("position");
  const filtered = rows
    .filter((r) =>
      `${name(r.Driver)} ${r.Constructor.name}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "gain"
        ? +b.grid - +b.position - (+a.grid - +a.position)
        : +a.position - +b.position,
    );
  return (
    <>
      <div className="toolbar">
        <label className="filter-search">
          <Search size={14} />
          <input
            aria-label="Filter result classification"
            placeholder="Driver or team…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="row">
          {kind !== "qualifying" && (
            <select
              aria-label="Sort race result"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="position">Finishing position</option>
              <option value="gain">Positions gained</option>
            </select>
          )}
          <ExportButton
            onClick={() =>
              exportCSV("f1-classification.csv", [
                [
                  "Position",
                  "Driver",
                  "Team",
                  "Grid",
                  "Laps",
                  "Points",
                  "Status",
                  "Q1",
                  "Q2",
                  "Q3",
                ],
                ...filtered.map((r) => [
                  r.position,
                  name(r.Driver),
                  r.Constructor.name,
                  r.grid,
                  r.laps,
                  r.points,
                  r.status,
                  r.Q1,
                  r.Q2,
                  r.Q3,
                ]),
              ])
            }
          />
        </div>
      </div>
      <Table
        headers={
          kind === "qualifying"
            ? ["Pos", "Driver", "Q1", "Q2", "Q3"]
            : [
                "Pos",
                "Driver",
                "Grid",
                "Change",
                "Laps",
                "Time / status",
                "Points",
              ]
        }
      >
        {filtered.map((r) => (
          <tr key={r.Driver.driverId}>
            <td className="position">{r.position.padStart(2, "0")}</td>
            <td>
              <DriverIdentity
                driver={r.Driver}
                team={r.Constructor}
                season={season}
              />
            </td>
            {kind === "qualifying" ? (
              <>
                <td>{r.Q1 || "—"}</td>
                <td>{r.Q2 || "—"}</td>
                <td>{r.Q3 || "—"}</td>
              </>
            ) : (
              <>
                <td>{+r.grid === 0 ? "PIT" : r.grid}</td>
                <td>
                  <span
                    className={
                      +r.grid > +r.position
                        ? "positive"
                        : +r.grid < +r.position
                          ? "negative"
                          : "muted"
                    }
                  >
                    {+r.grid === 0
                      ? "—"
                      : `${+r.grid - +r.position > 0 ? "+" : ""}${+r.grid - +r.position}`}
                  </span>
                </td>
                <td>{r.laps}</td>
                <td>{r.Time?.time || r.status}</td>
                <td className="table-points">{r.points}</td>
              </>
            )}
          </tr>
        ))}
      </Table>
    </>
  );
}
function RacePage({ round }: { round: string }) {
  const { season, timezone } = usePrefs();
  const schedule = useData(() => races(season), [season]);
  const r = schedule.value?.data.find((r) => r.round === round);
  const [kind, setKind] = useState("results");
  useEffect(() => setKind("results"), [round, season]);
  const classification = useData(
    () => raceResult(season, round, kind),
    [season, round, kind],
  );
  const result = classification.value?.data;
  const rows =
    kind === "qualifying"
      ? result?.QualifyingResults
      : kind === "sprint"
        ? result?.SprintResults
        : result?.Results;
  const weekend = r
    ? ([
        ["Practice 1", r.FirstPractice],
        ["Practice 2", r.SecondPractice],
        ["Practice 3", r.ThirdPractice],
        ["Sprint qualifying", r.SprintQualifying],
        ["Sprint", r.Sprint],
        ["Qualifying", r.Qualifying],
        ["Grand Prix", { date: r.date, time: r.time }],
      ] as const)
    : [];
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} · ROUND ${round}`}
        title={r?.raceName || "Race weekend"}
        description={
          r
            ? `${r.Circuit.circuitName} · ${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`
            : "Loading the official calendar…"
        }
      >
        <More to="calendar">All races</More>
      </PageTitle>
      <State
        loading={schedule.loading}
        error={schedule.error}
        onRetry={schedule.reload}
      />
      {r && (
        <>
          <div className="race-hub-top">
            <div className="panel schedule-panel">
              <div className="section-head">
                <h2>Your weekend timetable</h2>
                <span className="outline-chip">
                  {timezone === "local" ? "Your local time" : timezone}
                </span>
              </div>
              {weekend
                .filter(([, s]) => s)
                .map(([label, s]) => (
                  <div className="session-row" key={label}>
                    <span>
                      <i />
                      {label}
                    </span>
                    <strong>{formatTime(s!.date, s!.time, timezone)}</strong>
                  </div>
                ))}
              <Source value={schedule.value} />
            </div>
            <Weather circuit={r.Circuit} />
          </div>
          <Section
            title="Every position tells a story."
            subtitle="Results become available when the provider publishes them."
            action={
              <More to={"circuit/" + r.Circuit.circuitId}>
                Explore the circuit
              </More>
            }
          >
            <div className="panel">
              <div className="tabs result-tabs">
                {["results", "qualifying", ...(r.Sprint ? ["sprint"] : [])].map(
                  (k) => (
                    <button
                      key={k}
                      className={kind === k ? "active" : ""}
                      onClick={() => setKind(k)}
                    >
                      {k === "results"
                        ? "Race classification"
                        : k === "qualifying"
                          ? "Qualifying"
                          : "Sprint"}
                    </button>
                  ),
                )}
              </div>
              <State
                loading={classification.loading}
                error={classification.error}
                empty={
                  !classification.loading &&
                  !classification.error &&
                  !rows?.length
                }
                onRetry={classification.reload}
              />
              {rows && <ResultTable rows={rows} kind={kind} />}
              <Source value={classification.value} />
            </div>
          </Section>
          {kind === "results" && rows?.length && (
            <>
              <div className="overview-metrics">
                <Metric
                  label="Race winner"
                  value={rows[0].Driver.familyName}
                  detail={rows[0].Constructor.name}
                />
                <Metric
                  label="Race distance"
                  value={`${rows[0].laps} laps`}
                  detail="Winner's completed laps"
                />
                <Metric
                  label="Biggest gain"
                  value={(() => {
                    const x = [...rows]
                      .filter((x) => +x.grid > 0)
                      .sort(
                        (a, b) =>
                          +b.grid - +b.position - (+a.grid - +a.position),
                      )[0];
                    return x
                      ? `${x.Driver.familyName} +${+x.grid - +x.position}`
                      : "—";
                  })()}
                />
                <Metric
                  label="Fastest recorded lap"
                  value={
                    rows.find((x) => x.FastestLap?.rank === "1")?.FastestLap
                      ?.Time.time || "—"
                  }
                  detail={
                    rows.find((x) => x.FastestLap?.rank === "1")?.Driver
                      .familyName
                  }
                />
              </div>
              <RaceLapAnalysis round={round} rows={rows} />
              <PitStops round={round} />
            </>
          )}
          <div className="callout panel">
            <Gauge size={28} />
            <div>
              <h3>Go beyond the classification.</h3>
              <p>
                Explore archived practice, qualifying and race sessions in the
                telemetry lab, including lap pace, stints and race control.
              </p>
            </div>
            <Link
              to={"telemetry?season=" + year(season)}
              className="button secondary"
            >
              Open telemetry lab
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
function PitStops({ round }: { round: string }) {
  const { season } = usePrefs();
  const [open, setOpen] = useState(false);
  const data = useData(async () => {
    if (!open)
      return {
        data: [],
        meta: { source: "jolpica", url: "", fetchedAt: "", status: "" },
      };
    let offset = 0,
      total = Infinity,
      rows: any[] = [],
      meta: any;
    while (offset < total) {
      const r = await request<any>(
        "jolpica",
        `${season}/${round}/pitstops.json`,
        { offset, limit: 100 },
      );
      meta = r.meta;
      total = +r.data.MRData.total;
      rows.push(...(r.data.MRData.RaceTable.Races[0]?.PitStops || []));
      offset += 100;
    }
    return { data: rows, meta };
  }, [season, round, open]);
  return (
    <Section
      title="Pit lane analysis"
      subtitle="Provider-reported duration includes pit-lane transit where measured."
    >
      <button className="button secondary" onClick={() => setOpen((x) => !x)}>
        {open ? "Hide pit stops" : "Load real pit stops"}
      </button>
      {open && (
        <div className="panel">
          <State
            loading={data.loading}
            error={data.error}
            empty={!data.loading && !data.error && !data.value?.data.length}
            onRetry={data.reload}
          />
          <Table
            headers={["Driver", "Stop", "Lap", "Time", "Reported duration"]}
          >
            {data.value?.data.map((p: any, i: number) => (
              <tr key={i}>
                <td>
                  <Link to={"driver/" + p.driverId}>
                    {p.driverId.replaceAll("_", " ")}
                  </Link>
                </td>
                <td>{p.stop}</td>
                <td>{p.lap}</td>
                <td>{p.time}</td>
                <td>{p.duration} s</td>
              </tr>
            ))}
          </Table>
          <Source value={data.value} />
        </div>
      )}
    </Section>
  );
}
function RaceLapAnalysis({ round, rows }: { round: string; rows: Result[] }) {
  const { season } = usePrefs();
  const [id, setId] = useState(rows[0].Driver.driverId),
    [open, setOpen] = useState(false);
  const data = useData(async () => {
    if (!open)
      return {
        data: [],
        meta: { source: "jolpica", url: "", fetchedAt: "", status: "" },
      };
    let offset = 0,
      total = Infinity,
      list: any[] = [],
      meta: any;
    while (offset < total) {
      const r = await request<any>(
        "jolpica",
        `${season}/${round}/drivers/${id}/laps.json`,
        { offset, limit: 100 },
      );
      meta = r.meta;
      total = +r.data.MRData.total;
      list.push(...(r.data.MRData.RaceTable.Races[0]?.Laps || []));
      offset += 100;
    }
    return { data: list, meta };
  }, [season, round, id, open]);
  return (
    <Section
      title="Lap by lap"
      subtitle="Measured race lap times, including pit laps and interruptions."
    >
      <div className="toolbar">
        <select
          aria-label="Lap analysis driver"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {rows.map((r) => (
            <option key={r.Driver.driverId} value={r.Driver.driverId}>
              {name(r.Driver)}
            </option>
          ))}
        </select>
        <button className="button secondary" onClick={() => setOpen((x) => !x)}>
          {open ? "Hide lap analysis" : "Load lap analysis"}
        </button>
      </div>
      {open && (
        <div className="panel chart-panel">
          <State
            loading={data.loading}
            error={data.error}
            empty={!data.loading && !data.error && !data.value?.data.length}
            onRetry={data.reload}
          />
          {(data.value?.data.length || 0) > 0 && (
            <Chart
              label="Measured lap time by race lap"
              xLabel="Lap"
              yLabel="seconds"
              series={[
                {
                  name: id,
                  color: "#ed4655",
                  values: data.value!.data.map((l: any) => ({
                    x: +l.number,
                    y: timeSeconds(l.Timings[0]?.time),
                  })),
                },
              ]}
            />
          )}
          <Source value={data.value} />
        </div>
      )}
    </Section>
  );
}
function WikiPhoto({
  url,
  alt,
  className = "",
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const data = useData(
    () => request<any>("wiki", "", { title: wikiTitle(url) }),
    [url],
  );
  return (
    <>
      <Photo
        src={data.value?.data.thumbnail?.source}
        alt={alt}
        className={className}
      />
      {data.value?.data.thumbnail && (
        <a
          className="image-credit"
          href={data.value.data.content_urls?.desktop?.page || url}
          target="_blank"
          rel="noreferrer"
        >
          Wikipedia media · asset credits ↗
        </a>
      )}
    </>
  );
}
function DriverProfile({ id }: { id: string }) {
  const { season, favorites, setFavorites } = usePrefs();
  const ds = useData(() => drivers(season), [season]);
  const data = useData(() => allResults(season, `drivers/${id}`), [season, id]);
  const driver =
    ds.value?.data.find((d) => d.driverId === id) ||
    data.value?.data[0]?.Results?.[0].Driver;
  const results = data.value?.data.flatMap((r) => r.Results || []) || [],
    stats = summarize(results);
  const photo = driver && driverPhoto(driver, season);
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} DRIVER INTELLIGENCE`}
        title={driver ? name(driver) : "Driver profile"}
        description="The season in perspective. Every result, every gain, every setback."
      >
        <More to="drivers">All drivers</More>
      </PageTitle>
      <State
        loading={ds.loading || data.loading}
        error={data.error}
        onRetry={data.reload}
      />
      {driver && (
        <>
          <div className="profile-hero panel">
            <div className="profile-photo">
              {photo ? (
                <Photo src={photo} alt={name(driver)} eager />
              ) : (
                <WikiPhoto url={driver.url} alt={name(driver)} />
              )}
            </div>
            <div className="profile-copy">
              <div className="row spread">
                <span className="outline-chip">{driver.nationality}</span>
                <Favorite
                  id={"driver:" + id}
                  favorites={favorites}
                  setFavorites={setFavorites}
                />
              </div>
              <span className="profile-number">
                {driver.permanentNumber || driver.code || ""}
              </span>
              <h2>
                {driver.givenName}
                <br />
                <strong>{driver.familyName}</strong>
              </h2>
              <p>
                Born{" "}
                {new Date(driver.dateOfBirth).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p>
                {Array.from(
                  new Set(results.map((r) => r.Constructor.name)),
                ).join(" · ") || "Season affiliation not yet published"}
              </p>
              <div className="row">
                <Link className="button" to="analytics">
                  Compare drivers
                  <ArrowUpRight size={16} />
                </Link>
                <a
                  className="button secondary"
                  href={driver.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Biography
                  <ExternalLink size={15} />
                </a>
              </div>
              <small>
                Portrait depicts{" "}
                {photo
                  ? portraitEra(driver, season)
                  : "the source image’s recorded era"}
                .
              </small>
            </div>
          </div>
          {stats && (
            <div className="overview-metrics six">
              <Metric label="Race entries" value={stats.starts} />
              <Metric label="Wins" value={stats.wins} />
              <Metric label="Podiums" value={stats.podiums} />
              <Metric
                label="Race points"
                value={stats.points}
                detail="Excludes sprint points"
              />
              <Metric
                label="Average classified position"
                value={stats.averageFinish.toFixed(2)}
              />
              <Metric label="Non-finish statuses" value={stats.retirements} />
            </div>
          )}
          <Section
            title="Season form"
            subtitle="Finishing positions. Lower is better."
          >
            <div className="panel chart-panel">
              <Chart
                label="Driver finishing positions by round"
                minY={1}
                xLabel="Round"
                series={[
                  {
                    name: driver.familyName,
                    color: teamColor(results[0]?.Constructor),
                    values: (data.value?.data || []).map((r) => ({
                      x: +r.round,
                      y: +r.Results![0].position,
                    })),
                  },
                ]}
              />
              <Source value={data.value} />
            </div>
          </Section>
          <Section
            title="The race record"
            subtitle="Race points can differ from championship points due to sprints and adjustments."
          >
            <div className="panel">
              <Table
                headers={[
                  "Round",
                  "Grand Prix",
                  "Grid",
                  "Finish",
                  "Points",
                  "Status",
                ]}
              >
                {data.value?.data.map((r) => {
                  const x = r.Results![0];
                  return (
                    <tr key={r.round}>
                      <td>{r.round}</td>
                      <td>
                        <Link to={"race/" + r.round}>{r.raceName}</Link>
                      </td>
                      <td>{x.grid}</td>
                      <td>P{x.position}</td>
                      <td>{x.points}</td>
                      <td>{x.status}</td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </Section>
          <Career driver={driver} />
        </>
      )}
    </>
  );
}
function Career({ driver }: { driver: Driver }) {
  const [open, setOpen] = useState(false);
  const data = useData(async () => {
    if (!open)
      return {
        data: null,
        meta: { source: "jolpica", url: "", fetchedAt: "", status: "" },
      };
    const starts = await request<any>(
      "jolpica",
      `drivers/${driver.driverId}/results.json`,
      { limit: 1 },
    );
    const wins = await request<any>(
      "jolpica",
      `drivers/${driver.driverId}/results/1.json`,
      { limit: 1 },
    );
    const poles = await request<any>(
      "jolpica",
      `drivers/${driver.driverId}/qualifying/1.json`,
      { limit: 1 },
    );
    const titles = await request<any>(
      "jolpica",
      `drivers/${driver.driverId}/driverStandings/1.json`,
      { limit: 100 },
    );
    return {
      data: {
        starts: starts.data.MRData.total,
        wins: wins.data.MRData.total,
        poles: poles.data.MRData.total,
        titles: titles.data.MRData.StandingsTable.StandingsLists.filter(
          (x: any) =>
            Number(x.season) < new Date().getFullYear() &&
            x.DriverStandings?.[0]?.position === "1",
        ).length,
      },
      meta: starts.meta,
    };
  }, [open, driver.driverId]);
  return (
    <Section
      title="The bigger picture"
      subtitle="Career totals across all seasons covered by Jolpica. Qualifying coverage varies by era."
    >
      <button className="button secondary" onClick={() => setOpen((x) => !x)}>
        {open ? "Hide career statistics" : "Load career statistics"}
      </button>
      {open && (
        <>
          <State
            loading={data.loading}
            error={data.error}
            onRetry={data.reload}
          />
          {data.value?.data && (
            <div className="overview-metrics">
              <Metric
                label="Recorded race entries"
                value={data.value.data.starts}
              />
              <Metric label="Career wins" value={data.value.data.wins} />
              <Metric label="Recorded poles" value={data.value.data.poles} />
              <Metric
                label="Prior-season titles"
                value={data.value.data.titles}
              />
            </div>
          )}
          <Source value={data.value} />
        </>
      )}
    </Section>
  );
}
function TeamProfile({ id }: { id: string }) {
  const { season } = usePrefs();
  const ts = useData(() => teams(season), [season]);
  const data = useData(
    () => allResults(season, `constructors/${id}`),
    [season, id],
  );
  const team =
    ts.value?.data.find((t) => t.constructorId === id) ||
    data.value?.data[0]?.Results?.[0].Constructor;
  const results = data.value?.data.flatMap((r) => r.Results || []) || [],
    stats = summarize(results);
  const lineup = Array.from(
    new Map(results.map((r) => [r.Driver.driverId, r.Driver])).values(),
  );
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} CONSTRUCTOR INTELLIGENCE`}
        title={team?.name || "Team profile"}
        description="The constructor's season. Team points, driver contribution, and race performance."
      />
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      {team && (
        <>
          <div
            className="team-profile-hero panel"
            style={{ "--team": teamColor(team) } as React.CSSProperties}
          >
            <div className="row spread">
              <div>
                <Logo team={team} season={season} />
                <h2>{team.name}</h2>
                <p>
                  {team.nationality} constructor · {year(season)} machinery
                </p>
              </div>
              <a
                href={team.url}
                className="button secondary"
                target="_blank"
                rel="noreferrer"
              >
                Team history
                <ExternalLink size={15} />
              </a>
            </div>
            <Photo
              className="team-profile-car"
              src={teamAsset(team, "cars", season)}
              alt={`${year(season)} ${team.name} racing car`}
            />
          </div>
          {stats && (
            <div className="overview-metrics">
              <Metric
                label="Race entries"
                value={stats.starts}
                detail="Individual car entries"
              />
              <Metric label="Wins" value={stats.wins} />
              <Metric label="Podiums" value={stats.podiums} />
              <Metric
                label="Race points"
                value={stats.points}
                detail="Excludes sprints / adjustments"
              />
            </div>
          )}
          <Section
            title="The driver contribution"
            subtitle="Race points for the selected constructor in this season."
          >
            <div className="team-preview-grid">
              {lineup.map((d) => {
                const x = summarize(
                  results.filter((r) => r.Driver.driverId === d.driverId),
                );
                return (
                  <div className="panel contribution" key={d.driverId}>
                    <DriverIdentity driver={d} team={team} season={season} />
                    <strong>
                      {x?.points} <small>RACE POINTS</small>
                    </strong>
                    <p>
                      {x?.wins} wins · {x?.podiums} podiums · {x?.starts}{" "}
                      entries
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="Season race record">
            <div className="panel">
              <Table
                headers={[
                  "Round",
                  "Race",
                  "Driver",
                  "Position",
                  "Points",
                  "Status",
                ]}
              >
                {data.value?.data.flatMap((r) =>
                  r.Results!.map((x) => (
                    <tr key={r.round + x.Driver.driverId}>
                      <td>{r.round}</td>
                      <td>
                        <Link to={"race/" + r.round}>{r.raceName}</Link>
                      </td>
                      <td>
                        <Link to={"driver/" + x.Driver.driverId}>
                          {name(x.Driver)}
                        </Link>
                      </td>
                      <td>P{x.position}</td>
                      <td>{x.points}</td>
                      <td>{x.status}</td>
                    </tr>
                  )),
                )}
              </Table>
              <Source value={data.value} />
            </div>
          </Section>
        </>
      )}
    </>
  );
}
function Circuits() {
  const { season } = usePrefs();
  const data = useData(() => races(season), [season]);
  return (
    <>
      <PageTitle
        eyebrow={`${year(season)} CIRCUIT COLLECTION`}
        title="Where legends are made."
        description="Explore the places that shape each season — and the results that made them famous."
      />
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      <div className="calendar-grid">
        {data.value?.data.map((r) => (
          <Link
            className={`panel circuit-card ${circuitPhoto(r.Circuit.circuitId) ? "has-photo" : ""}`}
            key={r.Circuit.circuitId}
            to={"circuit/" + r.Circuit.circuitId}
          >
            {circuitPhoto(r.Circuit.circuitId) && (
              <Photo
                className="circuit-card-photo"
                src={circuitPhoto(r.Circuit.circuitId)}
                alt={`Photography of ${r.Circuit.circuitName}`}
              />
            )}
            <MapPin size={21} />
            <span className="eyebrow">{r.Circuit.Location.country}</span>
            <h2>{r.Circuit.circuitName}</h2>
            <p>{r.Circuit.Location.locality}</p>
            <small>
              {(+r.Circuit.Location.lat).toFixed(3)}°,{" "}
              {(+r.Circuit.Location.long).toFixed(3)}°
            </small>
            <ArrowUpRight size={20} />
          </Link>
        ))}
      </div>
      <Source value={data.value} />
    </>
  );
}
function CircuitPage({ id }: { id: string }) {
  const { season } = usePrefs();
  const data = useData(() => races(season), [season]);
  const circuit = data.value?.data.find(
    (r) => r.Circuit.circuitId === id,
  )?.Circuit;
  const results = useData(
    () => allResults(season, `circuits/${id}`),
    [season, id],
  );
  return (
    <>
      <PageTitle
        eyebrow="CIRCUIT EXPLORER"
        title={circuit?.circuitName || "Circuit"}
        description={
          circuit
            ? `${circuit.Location.locality} · ${circuit.Location.country}`
            : "Loading circuit identity…"
        }
      />
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      {circuit && (
        <>
          <div className="two-columns">
            <div className="panel circuit-photo">
              <>
                {circuitPhoto(id) ? (
                  <Photo
                    src={circuitPhoto(id)}
                    alt={`Photograph of ${circuit.circuitName}`}
                  />
                ) : (
                  <WikiPhoto
                    url={circuit.url}
                    alt={`Photograph of ${circuit.circuitName}`}
                  />
                )}
              </>
              <div>
                <h2>{circuit.circuitName}</h2>
                <p>
                  Real source photography. Image may depict a different year.
                </p>
                <div className="row">
                  <a
                    className="button secondary"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${circuit.Location.lat}&mlon=${circuit.Location.long}#map=14/${circuit.Location.lat}/${circuit.Location.long}`}
                  >
                    Explore real map
                    <ExternalLink size={15} />
                  </a>
                  <a
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                    href={circuit.url}
                  >
                    Circuit history ↗
                  </a>
                </div>
              </div>
            </div>
            <Weather circuit={circuit} />
          </div>
          <Section
            title={`${year(season)} at this circuit`}
            subtitle="Race results from the selected season."
          >
            <div className="panel">
              <State
                loading={results.loading}
                error={results.error}
                empty={
                  !results.loading &&
                  !results.error &&
                  !results.value?.data.length
                }
                onRetry={results.reload}
              />
              {results.value?.data.map((r) => (
                <div key={r.round}>
                  <h3 className="inset-title">{r.raceName}</h3>
                  <ResultTable rows={r.Results || []} />
                </div>
              ))}
              <Source value={results.value} />
            </div>
          </Section>
          <div className="callout panel">
            <Play size={24} />
            <div>
              <h3>Discover the racing line.</h3>
              <p>
                The replay lab draws a track from measured session coordinates.
                No approximate circuit geometry.
              </p>
            </div>
            <Link to="replay" className="button secondary">
              Historical lap replay ↗
            </Link>
          </div>
        </>
      )}
    </>
  );
}
function Weather({ circuit }: { circuit: Circuit }) {
  const data = useData(
    () =>
      request<any>("weather", "", {
        latitude: circuit.Location.lat,
        longitude: circuit.Location.long,
      }),
    [circuit.circuitId],
  );
  const w = data.value?.data,
    current = w?.current;
  return (
    <div className="weather panel">
      <div className="section-head">
        <h2>Circuit weather</h2>
        <CloudSun size={24} />
      </div>
      <p className="muted">
        Current model conditions · {circuit.Location.locality}
      </p>
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      {current && (
        <>
          <div className="weather-temperature">
            {Math.round(current.temperature_2m)}
            <span>°C</span>
          </div>
          <div className="weather-details">
            <span>
              <Droplets size={17} />
              {current.relative_humidity_2m}% humidity
            </span>
            <span>
              <Wind size={17} />
              {current.wind_speed_10m} km/h
            </span>
            <span>
              <CloudSun size={17} />
              {current.precipitation} mm precipitation
            </span>
          </div>
          <p className="fine-print">
            Open-Meteo forecast model, not circuit sensors. Seven-day forecast;
            this is not a long-range race-day prediction. Timezone: {w.timezone}
            .
          </p>
          <details>
            <summary>Hourly forecast</summary>
            <Chart
              label="Model temperature for the next 48 hours"
              xLabel="Hours from forecast start"
              yLabel="°C"
              series={[
                {
                  name: "Temperature",
                  color: "#ed4655",
                  values: w.hourly.time
                    .slice(0, 48)
                    .map((_: string, i: number) => ({
                      x: i,
                      y: w.hourly.temperature_2m[i],
                    })),
                },
              ]}
            />
            <Table
              headers={[
                "Local forecast time",
                "Temperature °C",
                "Rain probability %",
              ]}
            >
              {w.hourly.time.slice(0, 48).map((t: string, i: number) => (
                <tr key={t}>
                  <td>{t.replace("T", " ")}</td>
                  <td>{w.hourly.temperature_2m[i]}</td>
                  <td>{w.hourly.precipitation_probability[i]}</td>
                </tr>
              ))}
            </Table>
          </details>
        </>
      )}
      <Source value={data.value} />
    </div>
  );
}
function News() {
  const data = useData(
    () =>
      request<
        { title: string; url: string; date: string; publisher: string }[]
      >("news"),
    [],
  );
  const [q, setQ] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="THE NEWS DESK"
        title="Stay in the conversation."
        description="Real headlines, linked directly to the publisher. Read the full story at its source."
      >
        <a
          className="button secondary"
          href="https://www.formula1.com/en/latest"
          target="_blank"
          rel="noreferrer"
        >
          Official F1 news
          <ArrowUpRight size={16} />
        </a>
      </PageTitle>
      <div className="toolbar">
        <label className="filter-search">
          <Search size={16} />
          <input
            aria-label="Search news"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Driver, team, or story…"
          />
        </label>
        <button className="button secondary" onClick={data.reload}>
          <RefreshCw size={15} />
          Refresh headlines
        </button>
      </div>
      <State loading={data.loading} error={data.error} onRetry={data.reload} />
      <div className="news-grid">
        {data.value?.data
          .filter((x) => x.title.toLowerCase().includes(q.toLowerCase()))
          .map((story, i) => (
            <a
              className="news-card panel"
              key={story.url}
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="eyebrow">{story.publisher} · FORMULA 1</span>
              <h2>{story.title}</h2>
              <div className="row spread">
                <span>{new Date(story.date).toLocaleString()}</span>
                <ArrowUpRight size={19} />
              </div>
            </a>
          ))}
      </div>
      <Source value={data.value} />
    </>
  );
}
function Settings() {
  const prefs = usePrefs();
  const [message, setMessage] = useState("");
  const [credits, setCredits] = useState<any[]>([]);
  useEffect(() => {
    fetch("/assets/sources.json")
      .then((r) => r.json())
      .then(setCredits)
      .catch(() => {});
  }, []);
  const exported = () => ({
    season: prefs.season,
    timezone: prefs.timezone,
    theme: prefs.theme,
    favorites: prefs.favorites,
    reducedMotion: prefs.reducedMotion,
  });
  return (
    <>
      <PageTitle
        eyebrow="YOUR FAN EXPERIENCE"
        title="Make the paddock yours."
        description="Preferences stay in this browser. No account, no tracking, no subscription."
      />
      <div className="settings-grid">
        <Section title="Preferences">
          <div className="panel settings-panel">
            <label>
              <span>Appearance</span>
              <select
                value={prefs.theme}
                onChange={(e) => prefs.setTheme(e.target.value)}
              >
                <option value="dark">Graphite dark</option>
                <option value="light">Paddock light</option>
              </select>
            </label>
            <label>
              <span>Session timezone</span>
              <select
                value={prefs.timezone}
                onChange={(e) => prefs.setTimezone(e.target.value)}
              >
                {[
                  ["local", "Device local time"],
                  ["UTC", "UTC"],
                  ["Asia/Kolkata", "India"],
                  ["Asia/Riyadh", "Saudi Arabia"],
                  ["Europe/London", "United Kingdom"],
                  ["America/New_York", "US Eastern"],
                  ["Australia/Melbourne", "Melbourne"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Reduce interface motion</span>
              <input
                type="checkbox"
                checked={prefs.reducedMotion}
                onChange={(e) => prefs.setReducedMotion(e.target.checked)}
              />
            </label>
            <div className="row">
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    "f1-pulse-preferences.json",
                    JSON.stringify(exported(), null, 2),
                  )
                }
              >
                Export preferences
              </button>
              <label className="button secondary">
                Import preferences
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const p = JSON.parse(await file.text());
                      if (
                        !["dark", "light"].includes(p.theme) ||
                        !Array.isArray(p.favorites) ||
                        p.favorites.length > 200 ||
                        p.favorites.some(
                          (x: unknown) =>
                            typeof x !== "string" ||
                            !/^((driver|team):[\w-]+)$/.test(x as string),
                        )
                      )
                        throw Error("Invalid preference file");
                      if (
                        p.season !== "current" &&
                        (!/^\d{4}$/.test(p.season) ||
                          +p.season < 1950 ||
                          +p.season > new Date().getFullYear())
                      )
                        throw Error("Invalid season");
                      if (p.timezone !== "local")
                        new Intl.DateTimeFormat(undefined, {
                          timeZone: p.timezone,
                        });
                      prefs.setSeason(p.season);
                      prefs.setTimezone(p.timezone);
                      prefs.setTheme(p.theme);
                      prefs.setFavorites(p.favorites);
                      prefs.setReducedMotion(!!p.reducedMotion);
                      setMessage("Preferences imported.");
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                />
              </label>
            </div>
            <p role="status">{message}</p>
          </div>
        </Section>
        <Section title="Data you can trust">
          <div className="panel settings-panel">
            <h3>Real data. Visible provenance.</h3>
            <p>
              Jolpica supplies historical schedules, classification and
              championship results. OpenF1 supplies the free historical archive
              from 2023. Open-Meteo supplies weather forecast models. BBC Sport
              supplies linked RSS headlines.
            </p>
            <p>
              Source retrieval times are shown with each dataset. Saved launch
              responses appear only after an upstream failure and are explicitly
              dated. We never replace missing measurements with invented values.
            </p>
            <p>
              Simulations are scenarios using your assumptions. Free historical
              access excludes OpenF1's paid live window.
            </p>
            <a
              className="text-link"
              href="https://openf1.org/docs/"
              target="_blank"
              rel="noreferrer"
            >
              OpenF1 documentation ↗
            </a>
            <a
              className="text-link"
              href="https://github.com/jolpica/jolpica-f1"
              target="_blank"
              rel="noreferrer"
            >
              Jolpica documentation ↗
            </a>
          </div>
        </Section>
      </div>
      <Section
        title="Photography & marks"
        subtitle="Real official 2026 imagery and unmodified logos used with the site owner's stated permission."
      >
        <div className="panel settings-panel">
          <p>
            Formula 1 photos, driver portraits, car images, team logos and the
            F1 TV mark remain the property of their respective owners. Local
            assets depict the 2026 season; historical seasons do not reuse them
            as historical photographs. Wikipedia images retain individual asset
            licenses and credit links. Photos unavailable from the source show
            an explicit empty state.
          </p>
          <p>
            This site is unofficial and does not offer broadcasts. The F1 TV
            link opens the official service.
          </p>
          <details>
            <summary>
              View the complete asset source register ({credits.length})
            </summary>
            <Table headers={["Asset", "Season", "Original source"]}>
              {credits
                .filter((x) => !x.error)
                .map((x, i) => (
                  <tr key={i}>
                    <td>{x.file}</td>
                    <td>{x.season}</td>
                    <td>
                      <a href={x.source} target="_blank" rel="noreferrer">
                        Original asset ↗
                      </a>
                    </td>
                  </tr>
                ))}
            </Table>
          </details>
        </div>
      </Section>
    </>
  );
}
