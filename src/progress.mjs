/**
 * Historical counting rules, verified against Jolpica's official final tables for 1950–1990
 * (scripts/verify-accuracy.mjs). `n`: best n results count; `k,a,b`: best a of the first k races
 * plus best b of the rest. Absent = every result counts.
 */
const DRIVER_RULES = {
  1950: { n: 4 }, 1951: { n: 4 }, 1952: { n: 4 }, 1953: { n: 4 }, 1954: { n: 5 }, 1955: { n: 5 }, 1956: { n: 5 }, 1957: { n: 5 },
  1958: { n: 6 }, 1959: { n: 5 }, 1960: { n: 6 }, 1961: { n: 5 }, 1962: { n: 5 }, 1963: { n: 6 }, 1964: { n: 6 }, 1965: { n: 6 },
  1966: { n: 5 }, 1968: { k: 6, a: 5, b: 5 }, 1969: { k: 6, a: 5, b: 4 }, 1970: { k: 7, a: 6, b: 5 }, 1971: { k: 6, a: 5, b: 4 },
  1972: { k: 6, a: 5, b: 5 }, 1973: { k: 8, a: 7, b: 6 }, 1974: { k: 8, a: 7, b: 6 }, 1975: { k: 7, a: 6, b: 6 }, 1976: { k: 8, a: 7, b: 7 },
  1977: { k: 4, a: 3, b: 8 }, 1978: { k: 8, a: 7, b: 7 }, 1979: { k: 7, a: 4, b: 4 }, 1980: { k: 7, a: 5, b: 5 },
  1981: { n: 11 }, 1982: { n: 11 }, 1983: { n: 11 }, 1984: { n: 11 }, 1985: { n: 11 }, 1986: { n: 11 }, 1987: { n: 11 },
  1988: { n: 11 }, 1989: { n: 11 }, 1990: { n: 11 },
};
/** Constructors (1958–1978 only a team's best-placed car scored; the Indianapolis 500 never counted). */
const CONSTRUCTOR_RULES = {
  1958: { n: 6 }, 1959: { n: 5 }, 1960: { n: 6 }, 1961: { n: 5 }, 1962: { n: 5 }, 1963: { n: 6 }, 1964: { n: 6 }, 1965: { n: 6 },
  1966: { n: 5 }, 1969: { k: 3, a: 2, b: 8 }, 1973: { k: 7, a: 6, b: 6 }, 1974: { n: 12 }, 1975: { k: 6, a: 5, b: 7 },
  1976: { k: 8, a: 7, b: 7 }, 1977: { k: 7, a: 6, b: 6 },
};
/** Seasons where shared drives or provider adjustments keep the derived totals from matching exactly. */
const APPROXIMATE = { drivers: [1955, 1956], constructors: [1958, 1959] };

const sumBest = (scores, n) => [...scores].sort((a, b) => b - a).slice(0, n).reduce((s, x) => s + x, 0);
/** Points that count under a season's rule, given per-race scores in calendar order. */
export function counted(scores, rule) {
  if (!rule) return scores.reduce((s, x) => s + x, 0);
  if (rule.k) return sumBest(scores.slice(0, rule.k), rule.a) + sumBest(scores.slice(rule.k), rule.b);
  return sumBest(scores, rule.n);
}
export function countingRules(season) {
  const y = Number(season);
  return { driver: DRIVER_RULES[y], constructor: CONSTRUCTOR_RULES[y], bestCarOnly: y < 1979, approximate: { drivers: APPROXIMATE.drivers.includes(y), constructors: APPROXIMATE.constructors.includes(y) } };
}

/** Per-round cumulative championship points from published race and sprint classifications, applying each era's counting rules. */
export function buildProgress(raceResults, sprints) {
  const completed = raceResults.filter((r) => r.Results?.length).sort((a, b) => +a.round - +b.round);
  const sprintByRound = new Map(sprints.map((s) => [s.round, s.SprintResults || []]));
  const drivers = new Map();
  const teams = new Map();
  const rules = countingRules(completed[0]?.season);
  let teamRound = 0;
  completed.forEach((race, i) => {
    const gained = new Map();
    const teamGain = new Map();
    for (const r of [...(race.Results || []), ...(sprintByRound.get(race.round) || [])]) {
      const id = r.Driver.driverId;
      if (!drivers.has(id)) drivers.set(id, { driver: r.Driver, team: r.Constructor, cumulative: Array(i).fill(0), rank: [], finish: Array(i).fill(null), wins: 0 });
      gained.set(id, (gained.get(id) || 0) + Number(r.points || 0));
      const t = r.Constructor.constructorId;
      if (!teams.has(t)) teams.set(t, { team: r.Constructor, cumulative: Array(i).fill(0), rank: [] });
      const p = Number(r.points || 0);
      teamGain.set(t, rules.bestCarOnly ? Math.max(teamGain.get(t) || 0, p) : (teamGain.get(t) || 0) + p);
    }
    for (const r of race.Results || []) {
      const d = drivers.get(r.Driver.driverId);
      d.team = r.Constructor;
      d.finish[i] = /^\d+$/.test(r.positionText) ? Number(r.position) : null;
      if (Number(r.position) === 1) d.wins++;
    }
    for (const d of drivers.values()) {
      (d.scores ||= Array(i).fill(0))[i] = gained.get(d.driver.driverId) || 0;
      d.cumulative[i] = counted(d.scores, rules.driver);
      if (d.finish.length <= i) d.finish[i] = null;
    }
    // The Indianapolis 500 (1950–1960) counted for drivers only; later US GPs at Indianapolis count normally.
    const indy = race.Circuit.circuitId === "indianapolis" && Number(race.season) <= 1960;
    if (!indy) teamRound++;
    for (const t of teams.values()) {
      if (!indy) (t.scores ||= Array(teamRound - 1).fill(0))[teamRound - 1] = teamGain.get(t.team.constructorId) || 0;
      t.cumulative[i] = counted(t.scores || [], rules.constructor);
    }
    const winsSoFar = (d) => d.finish.slice(0, i + 1).filter((f) => f === 1).length;
    [...drivers.values()]
      .sort((a, b) => b.cumulative[i] - a.cumulative[i] || winsSoFar(b) - winsSoFar(a))
      .forEach((d, k) => (d.rank[i] = k + 1));
    [...teams.values()].sort((a, b) => b.cumulative[i] - a.cumulative[i]).forEach((t, k) => (t.rank[i] = k + 1));
  });
  const last = completed.length - 1;
  for (const d of drivers.values()) delete d.scores;
  for (const t of teams.values()) delete t.scores;
  return {
    rules,
    rounds: completed.map((r) => ({ round: r.round, raceName: r.raceName, country: r.Circuit.Location.country, circuitId: r.Circuit.circuitId, date: r.date })),
    drivers: [...drivers.values()].sort((a, b) => (a.rank[last] || 99) - (b.rank[last] || 99)),
    teams: [...teams.values()].sort((a, b) => (a.rank[last] || 99) - (b.rank[last] || 99)),
  };
}
