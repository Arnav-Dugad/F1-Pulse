import { test } from "node:test";
import assert from "node:assert/strict";
import worker, {
  resolveUpstream,
  parseNews,
  legacyDestination,
  seasonData,
  seasonTtl,
  auditSeason,
  normalizeHitPath,
  refresh,
  WARM_PATHS,
} from "../worker/index.mjs";
test("legacy links keep driver, team and race destinations with safe seasons", async () => {
  assert.equal(
    legacyDestination(
      new URL(
        "https://pulse.test/driver-profile.html?driver=norris&season=2025",
      ),
    ),
    "https://pulse.test/#/driver/norris?season=2025",
  );
  assert.equal(
    legacyDestination(
      new URL("https://pulse.test/race-detail.html?round=5&season=2025"),
    ),
    "https://pulse.test/#/race/5?season=2025",
  );
  assert.equal(
    legacyDestination(
      new URL("https://pulse.test/team-profile.html?team=ferrari&season=9999"),
    ),
    "https://pulse.test/#/team/ferrari?season=current",
  );
  assert.equal(
    legacyDestination(new URL("https://pulse.test/assets/hero.webp")),
    null,
  );
  const response = await worker.fetch(
    new Request("https://pulse.test/schedule.html?season=2025"),
    {},
    {},
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://pulse.test/#/calendar?season=2025",
  );
});
test("proxy rejects path injection and unbounded telemetry", () => {
  for (const u of [
    "https://pulse.test/api/jolpica?path=../secret.json",
    "https://pulse.test/api/jolpica?path=https://evil.test",
    "https://pulse.test/api/openf1?path=car_data&session_key=9159",
    "https://pulse.test/api/openf1?path=location&session_key=latest",
    "https://pulse.test/api/weather?latitude=999&longitude=0",
    "https://pulse.test/api/weather?latitude=&longitude=0",
    "https://pulse.test/api/jolpica?path=current.json&limit=NaN",
    "https://pulse.test/api/jolpica?path=current.json&offset=-1",
    "https://pulse.test/api/jolpica/extra?path=current.json",
  ])
    assert.throws(() => resolveUpstream(new URL(u)));
});
test("allowlisted routes preserve filters and cap result pages", () => {
  const u = resolveUpstream(
    new URL("https://pulse.test/api/jolpica?path=1950/results.json&limit=500"),
  );
  assert.equal(u.url.origin, "https://api.jolpi.ca");
  assert.equal(u.url.searchParams.get("limit"), "100");
  const t = resolveUpstream(
    new URL(
      "https://pulse.test/api/openf1?path=car_data&session_key=9159&driver_number=55&date%3E%3D=2023-09-15T13:08:00Z&date%3C%3D=2023-09-15T13:09:00Z",
    ),
  );
  assert.equal(t.url.searchParams.get("date>"), "2023-09-15T13:08:00Z");
});
test("RSS never emits unsafe or nonpublisher URLs", () => {
  assert.equal(
    parseNews(
      "<item><title><![CDATA[Test &amp; title]]></title><link>https://www.bbc.com/sport/formula1/story</link><pubDate>Tue, 13 Oct 2026 04:00:00 GMT</pubDate></item>",
    )[0].title,
    "Test & title",
  );
  assert.equal(
    parseNews(
      "<item><title>Unsafe</title><link>javascript:alert(1)</link></item>",
    ).length,
    0,
  );
});
test("API denies mutations and exposes upstream failure honestly", async () => {
  const r = await worker.fetch(
    new Request("https://pulse.test/api/jolpica?path=current.json", {
      method: "POST",
    }),
    {},
    {},
  );
  assert.equal(r.status, 405);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  try {
    const r = await worker.fetch(
      new Request("https://pulse.test/api/jolpica?path=current.json"),
      {},
      { waitUntil() {} },
    );
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /rate limit/);
  } finally {
    globalThis.fetch = original;
  }
});
test("inflight requests deduplicate, preserve independent response bodies and recover", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return Response.json({ MRData: { RaceTable: { Races: [] } } });
  };
  try {
    const req = () =>
      worker.fetch(
        new Request("https://pulse.test/api/jolpica?path=1950.json"),
        {},
        { waitUntil() {} },
      );
    const [a, b] = await Promise.all([req(), req()]);
    assert.equal(calls, 1);
    assert.deepEqual(await a.json(), await b.json());
  } finally {
    globalThis.fetch = original;
  }
});

/* ─────────── Season endpoint ─────────── */
const row = (driverId, constructorId, points, position) => ({
  position: String(position),
  points: String(points),
  Driver: { driverId },
  Constructor: { constructorId },
});
const race = (round, extra = {}) => ({ season: "2025", round: String(round), raceName: "GP " + round, ...extra });
/** A fake Jolpica that serves results two rows per page so pagination is exercised. */
function fakeJolpica(log = []) {
  const results = [
    [1, row("norris", "mclaren", 25, 1)],
    [1, row("piastri", "mclaren", 18, 2)],
    [1, row("verstappen", "red_bull", 15, 3)],
    [2, row("verstappen", "red_bull", 25, 1)],
    [2, row("norris", "mclaren", 18, 2)],
  ];
  const sprints = [[2, row("norris", "mclaren", 8, 1)]];
  const page = (rows, key, offset) => {
    const races = [];
    for (const [round, r] of rows.slice(offset, offset + 2)) {
      const last = races.at(-1);
      if (last?.round === String(round)) last[key].push(r);
      else races.push(race(round, { [key]: [r] }));
    }
    return { MRData: { total: String(rows.length), limit: "2", offset: String(offset), RaceTable: { Races: races } } };
  };
  const standings = (key, list) => Response.json({ MRData: { StandingsTable: { StandingsLists: [{ season: "2025", round: "2", [key]: list }] } } });
  return async (input) => {
    const url = new URL(String(input));
    log.push(url.pathname + url.search);
    const offset = Number(url.searchParams.get("offset") || 0);
    const path = url.pathname.replace("/ergast/f1/", "");
    if (/^(\d{4}|current)\.json$/.test(path)) {
      const season = path.startsWith("1") ? path.slice(0, 4) : "2025";
      const races = [race(1), race(2), race(3)].map((r) => ({ ...r, season }));
      return Response.json({ MRData: { total: "3", limit: "100", RaceTable: { season, Races: races } } });
    }
    if (path.endsWith("/results.json")) return Response.json(page(results, "Results", offset));
    if (path.endsWith("/sprint.json")) return Response.json(page(sprints, "SprintResults", offset));
    if (path.endsWith("driverStandings.json"))
      return standings("DriverStandings", [
        { points: "51", Driver: { driverId: "norris" } },
        { points: "40", Driver: { driverId: "verstappen" } },
        { points: "18", Driver: { driverId: "piastri" } },
      ]);
    if (path.endsWith("constructorStandings.json"))
      return standings("ConstructorStandings", [
        { points: "69", Constructor: { constructorId: "mclaren" } },
        { points: "40", Constructor: { constructorId: "red_bull" } },
      ]);
    return new Response("not found", { status: 404 });
  };
}
async function withFetch(fake, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}
const fakeKV = () => {
  const store = new Map();
  return {
    store,
    async get(k, type) {
      const v = store.get(k);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
};

test("season endpoint validates its single year parameter", async () => {
  for (const q of ["year=1949", "year=9999", "year=abc", "", "year=2025&path=x"]) {
    const r = await worker.fetch(new Request("https://pulse.test/api/season?" + q), {}, { waitUntil() {} });
    assert.equal(r.status, 400, q);
  }
});

test("season data merges every results page with sprints and the calendar", async () => {
  const log = [];
  const body = await withFetch(fakeJolpica(log), () => seasonData("2025", { gap: 0 }));
  assert.equal(body.data.season, "2025");
  assert.equal(body.data.calendar.length, 3);
  assert.deepEqual(
    body.data.results.map((r) => [r.round, r.Results.map((x) => x.Driver.driverId)]),
    [
      ["1", ["norris", "piastri", "verstappen"]],
      ["2", ["verstappen", "norris"]],
    ],
  );
  assert.equal(body.data.round, "2");
  assert.equal(body.data.sprints[0].SprintResults[0].points, "8");
  assert.equal(body.meta.requests, 1 + 3 + 1);
  assert.ok(log.every((l) => /limit=100/.test(l)));
  // No sprint request before sprints existed.
  log.length = 0;
  await withFetch(fakeJolpica(log), () => seasonData("1988", { gap: 0 }));
  assert.ok(!log.some((l) => l.includes("sprint")));
});

test("season endpoint caches completed seasons for a day and the current one for ten minutes", async () => {
  assert.equal(seasonTtl("2025", new Date("2026-10-15")), 86400);
  assert.equal(seasonTtl("2026", new Date("2026-10-15")), 600);
  assert.equal(seasonTtl("current", new Date("2026-10-15")), 600);
  const r = await withFetch(fakeJolpica(), () =>
    worker.fetch(new Request("https://pulse.test/api/season?year=2024"), {}, { waitUntil() {} }),
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Cache-Control"), /max-age=86400/);
  const body = await r.json();
  assert.ok(Array.isArray(body.data.results) && body.meta.fetchedAt);
});

test("season endpoint reports upstream failure and falls back to the saved current season", async () => {
  const failing = async () => new Response("down", { status: 503 });
  const r = await withFetch(failing, () =>
    worker.fetch(new Request("https://pulse.test/api/season?year=2023"), {}, { waitUntil() {} }),
  );
  assert.equal(r.status, 502);
  const kv = fakeKV();
  kv.store.set(
    "season:current",
    JSON.stringify({ data: { season: "2026", results: [] }, meta: { source: "jolpica", url: "x", fetchedAt: "2026-10-15T00:00:00Z" } }),
  );
  const saved = await withFetch(failing, () =>
    worker.fetch(new Request("https://pulse.test/api/season?year=current"), { PULSE_KV: kv }, { waitUntil() {} }),
  );
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).meta.snapshot, true);
});

test("completed seasons are kept in KV and served from it without asking Jolpica again", async () => {
  const kv = fakeKV();
  let calls = 0;
  const fake = fakeJolpica();
  const counting = (input) => (calls++, fake(input));
  const get = () => worker.fetch(new Request("https://pulse.test/api/season?year=2022"), { PULSE_KV: kv }, { waitUntil() {} });
  const first = await withFetch(counting, get);
  assert.equal(first.status, 200);
  assert.ok(kv.store.has("season:2022"));
  const before = calls;
  const second = await withFetch(counting, get);
  assert.equal(calls, before);
  assert.deepEqual((await second.json()).data, (await first.json()).data);
  // A visitor's request for the running season never writes KV (only the scheduled refresh does).
  await withFetch(fakeJolpica(), () =>
    worker.fetch(new Request("https://pulse.test/api/season?year=current"), { PULSE_KV: kv }, { waitUntil() {} }),
  );
  assert.ok(!kv.store.has("season:current"));
});

/* ─────────── Accuracy self-check ─────────── */
test("audit re-adds race and sprint points and flags mismatches", () => {
  const season = {
    season: "2025",
    round: "2",
    results: [
      race(1, { Results: [row("norris", "mclaren", 25, 1), row("verstappen", "red_bull", 18, 2)] }),
      race(3, { Results: [row("norris", "mclaren", 25, 1)] }),
    ],
    sprints: [race(1, { SprintResults: [row("norris", "mclaren", 8, 1)] })],
  };
  const ok = auditSeason(
    season,
    { round: "2", DriverStandings: [{ points: "33", Driver: { driverId: "norris" } }, { points: "18", Driver: { driverId: "verstappen" } }] },
    { round: "2", ConstructorStandings: [{ points: "33", Constructor: { constructorId: "mclaren" } }, { points: "18", Constructor: { constructorId: "red_bull" } }] },
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.drivers.checked, 2);
  const bad = auditSeason(season, { round: "2", DriverStandings: [{ points: "30", Driver: { driverId: "norris" } }] }, null);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.drivers.mismatches, [
    { id: "norris", computed: 33, official: 30 },
    { id: "verstappen", computed: 18, official: null },
  ]);
});

test("scheduled refresh warms current-season endpoints, audits and stores a status report", async () => {
  const kv = fakeKV();
  const report = await withFetch(fakeJolpica(), () =>
    refresh({ PULSE_KV: kv, PULSE_ORIGIN: "https://pulse.test" }, { waitUntil() {} }, { gap: 0 }),
  );
  assert.deepEqual(
    report.warmed.map((w) => [w.path, w.status]),
    WARM_PATHS.map((p) => [p, 200]),
  );
  assert.equal(report.audit.ok, true, JSON.stringify(report.audit));
  assert.equal(report.ok, true);
  assert.ok(kv.store.has("status:last") && kv.store.has("season:current"));
  const status = await worker.fetch(
    new Request("https://pulse.test/api/status"),
    { PULSE_KV: kv, CF_VERSION_METADATA: { id: "abc", tag: "", timestamp: "2026-10-15" } },
    {},
  );
  const body = await status.json();
  assert.equal(body.build.id, "abc");
  assert.equal(body.storage, "kv");
  assert.equal(body.report.checkedAt, report.checkedAt);
  // Works without KV too (in-memory report from this isolate).
  const bare = await (await worker.fetch(new Request("https://pulse.test/api/status"), {}, {})).json();
  assert.equal(bare.storage, "memory");
  assert.ok(bare.report);
  let scheduled;
  await worker.scheduled({ cron: "0 */3 * * *" }, { PULSE_ORIGIN: "https://pulse.test", PULSE_WARM_GAP_MS: 0 }, {
    waitUntil: (p) => (scheduled = p),
  });
  assert.ok(scheduled instanceof Promise);
  await withFetch(fakeJolpica(), () => scheduled.catch(() => {}));
});

/* ─────────── Analytics beacon ─────────── */
test("page-view beacon stores only the route path and country, honouring DNT/GPC", async () => {
  assert.equal(normalizeHitPath("#/driver/Leclerc?season=2025"), "/driver/leclerc");
  assert.equal(normalizeHitPath("/"), "/");
  assert.equal(normalizeHitPath("<script>"), null);
  assert.equal(normalizeHitPath(42), null);
  const points = [];
  const env = { PULSE_ANALYTICS: { writeDataPoint: (p) => points.push(p) } };
  const post = (body, headers = {}) => {
    const req = new Request("https://pulse.test/api/hit", { method: "POST", body, headers });
    Object.defineProperty(req, "cf", { value: { country: "GB" } });
    return worker.fetch(req, env, {});
  };
  assert.equal((await post(JSON.stringify({ path: "standings?view=story" }))).status, 204);
  assert.deepEqual(points, [{ blobs: ["/standings", "GB"], doubles: [1], indexes: ["/standings"] }]);
  assert.equal((await post(JSON.stringify({ path: "x" }), { DNT: "1" })).status, 204);
  assert.equal((await post(JSON.stringify({ path: "x" }), { "Sec-GPC": "1" })).status, 204);
  assert.equal(points.length, 1);
  assert.equal((await post("../../etc")).status, 400);
  assert.equal((await post("calendar", { Origin: "https://evil.test" })).status, 403);
  assert.equal((await worker.fetch(new Request("https://pulse.test/api/hit"), env, {})).status, 405);
  // Without the binding the beacon is a harmless no-op.
  const bare = await worker.fetch(new Request("https://pulse.test/api/hit", { method: "POST", body: "calendar" }), {}, {});
  assert.equal(bare.status, 204);
});
