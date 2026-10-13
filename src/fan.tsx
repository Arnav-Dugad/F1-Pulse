import { Heart, ArrowUpRight, ArrowLeftRight, Users, Flag } from "lucide-react";
import { standings, teamStandings, useData } from "./api";
import { usePrefs } from "./context";
import { name, driverPhoto, portraitEra, teamAsset, teamColor } from "./media";
import {
  PageTitle,
  Section,
  Photo,
  Link,
  Favorite,
  Logo,
  State,
  Source,
  Metric,
} from "./ui";

export default function FanCollection() {
  const { season, favorites, setFavorites } = usePrefs();
  const ds = useData(() => standings(season), [season]);
  const ts = useData(() => teamStandings(season), [season]);
  const drivers = (ds.value?.data || []).filter((s) =>
    favorites.includes("driver:" + s.Driver.driverId),
  );
  const teams = (ts.value?.data || []).filter((s) =>
    favorites.includes("team:" + s.Constructor.constructorId),
  );
  const present = new Set([
    ...drivers.map((s) => "driver:" + s.Driver.driverId),
    ...teams.map((s) => "team:" + s.Constructor.constructorId),
  ]);
  const outsideSeason = favorites.filter((id) => !present.has(id));
  const year = season === "current" ? new Date().getFullYear() : season;
  return (
    <>
      <PageTitle
        eyebrow="YOUR PERSONAL PADDOCK"
        title="The grid you care about."
        description="Your favorite drivers and teams, together in one place. Saved in this browser, across every season."
      >
        <Link to="drivers" className="button secondary">
          <Heart size={16} />
          Discover drivers
        </Link>
      </PageTitle>
      <div className="fan-summary panel">
        <div className="fan-emblem">
          <Heart size={28} />
        </div>
        <div>
          <span className="eyebrow">YOUR {year} COLLECTION</span>
          <h2>A little closer to your heroes.</h2>
          <p>
            Save a heart on any driver or team to follow their championship
            here.
          </p>
        </div>
        <span className="outline-chip">{favorites.length} saved</span>
      </div>
      {!favorites.length && (
        <div className="collection-empty panel">
          <Heart size={38} />
          <h2>Your paddock starts with a favorite.</h2>
          <p>
            Build a collection of the drivers and teams you follow. Their
            published positions, points and wins appear here.
          </p>
          <div className="row">
            <Link to="drivers" className="button">
              <Users size={16} />
              Meet the drivers
            </Link>
            <Link to="teams" className="button secondary">
              <Flag size={16} />
              Explore teams
            </Link>
          </div>
        </div>
      )}
      {!!favorites.length && (
        <>
          <State
            loading={ds.loading || ts.loading}
            error={ds.error || ts.error}
            onRetry={() => {
              ds.reload();
              ts.reload();
            }}
          />
          {!!drivers.length && (
            <Section
              title="Your drivers"
              subtitle="Published championship standings for the selected season."
              action={
                drivers.length >= 2 ? (
                  <Link
                    to={`analytics?a=${drivers[0].Driver.driverId}&b=${drivers[1].Driver.driverId}`}
                    className="button secondary small"
                  >
                    <ArrowLeftRight size={15} />
                    Compare favorites
                  </Link>
                ) : undefined
              }
            >
              <div className="collection-grid">
                {drivers.map((s) => (
                  <article
                    className="collection-card panel"
                    key={s.Driver.driverId}
                    style={
                      {
                        "--team": teamColor(s.Constructors[0]),
                      } as React.CSSProperties
                    }
                  >
                    <div className="row spread">
                      <span className="outline-chip">P{s.position}</span>
                      <Favorite
                        id={"driver:" + s.Driver.driverId}
                        favorites={favorites}
                        setFavorites={setFavorites}
                      />
                    </div>
                    <Link
                      to={"driver/" + s.Driver.driverId}
                      className="collection-portrait-link"
                    >
                      <Photo
                        className="collection-portrait"
                        src={driverPhoto(s.Driver, season)}
                        alt={`${name(s.Driver)}, ${portraitEra(s.Driver, season)} portrait`}
                      />
                    </Link>
                    <Link
                      to={"driver/" + s.Driver.driverId}
                      className="collection-name"
                    >
                      <h2>{name(s.Driver)}</h2>
                      <ArrowUpRight size={18} />
                    </Link>
                    <p>{s.Constructors.map((t) => t.name).join(" / ")}</p>
                    <div className="collection-stats">
                      <Metric label="POINTS" value={s.points} />
                      <Metric label="WINS" value={s.wins} />
                    </div>
                  </article>
                ))}
              </div>
              <Source value={ds.value} />
            </Section>
          )}
          {!!teams.length && (
            <Section
              title="Your teams"
              subtitle="The machinery and people behind your favorites."
            >
              <div className="collection-grid">
                {teams.map((s) => (
                  <article
                    className="collection-card panel"
                    key={s.Constructor.constructorId}
                    style={
                      {
                        "--team": teamColor(s.Constructor),
                      } as React.CSSProperties
                    }
                  >
                    <div className="row spread">
                      <Logo team={s.Constructor} season={season} />
                      <Favorite
                        id={"team:" + s.Constructor.constructorId}
                        favorites={favorites}
                        setFavorites={setFavorites}
                      />
                    </div>
                    <Link to={"team/" + s.Constructor.constructorId}>
                      <Photo
                        className="collection-car"
                        src={teamAsset(s.Constructor, "cars", season)}
                        alt={`${year} ${s.Constructor.name} car`}
                      />
                    </Link>
                    <Link
                      to={"team/" + s.Constructor.constructorId}
                      className="collection-name"
                    >
                      <h2>{s.Constructor.name}</h2>
                      <ArrowUpRight size={18} />
                    </Link>
                    <div className="collection-stats">
                      <Metric label="POSITION" value={"P" + s.position} />
                      <Metric label="POINTS" value={s.points} />
                    </div>
                  </article>
                ))}
              </div>
              <Source value={ts.value} />
            </Section>
          )}
          {!ds.loading &&
            !ts.loading &&
            !ds.error &&
            !ts.error &&
            !!outsideSeason.length && (
              <Section
                title="Saved beyond this season"
                subtitle="These favorites have no published standings in the selected season. They remain in your collection."
              >
                <div className="panel saved-outside">
                  {outsideSeason.map((id) => (
                    <div className="row spread" key={id}>
                      <Link to={id.replace(":", "/")}>
                        <span className="eyebrow">{id.split(":")[0]}</span>
                        <strong>{id.split(":")[1].replace(/_/g, " ")}</strong>
                      </Link>
                      <Favorite
                        id={id}
                        favorites={favorites}
                        setFavorites={setFavorites}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}
        </>
      )}
    </>
  );
}
