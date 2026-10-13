import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { resolveUpstream, parseNews } from "../worker/index.mjs";
test("proxy rejects path injection and unbounded telemetry", () => {
  for (const u of [
    "https://pulse.test/api/jolpica?path=../secret.json",
    "https://pulse.test/api/jolpica?path=https://evil.test",
    "https://pulse.test/api/openf1?path=car_data&session_key=9159",
    "https://pulse.test/api/openf1?path=location&session_key=latest",
    "https://pulse.test/api/weather?latitude=999&longitude=0",
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
