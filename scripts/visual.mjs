/**
 * Visual regression: deterministic screenshots of key routes compared with baselines in tests/visual/.
 *
 *   node scripts/visual.mjs             compare against baselines (fails on a diff above tolerance)
 *   node scripts/visual.mjs --update    (re)write baselines for this platform
 *   node scripts/visual.mjs --record    refresh API fixtures from the live server, then compare/update
 *
 * Determinism: every /api/* response is served from recorded fixtures (tests/visual/fixtures/), the
 * clock is frozen at PULSE_VISUAL_TIME, motion is reduced and CSS animations are disabled, and the
 * service worker is blocked so request routing stays in the test's hands. Fonts render differently per
 * OS, so baselines are per platform: `<name>.<platform>.png`. A missing baseline is written to
 * artifacts/visual/ and reported as "new" (not a failure) so CI can publish Linux baselines.
 *
 * Env: PULSE_TEST_URL (default http://127.0.0.1:8787), PULSE_CHROMIUM_CHANNEL (e.g. chrome),
 *      PULSE_VISUAL_TOLERANCE (fraction of differing pixels, default 0.003), PULSE_VISUAL_ROUTES,
 *      PULSE_VISUAL_TIME (ISO date, default 2026-10-15T12:00:00Z).
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
const update = process.argv.includes("--update") || process.env.PULSE_VISUAL_UPDATE === "1";
const record = process.argv.includes("--record");
const tolerance = Number(process.env.PULSE_VISUAL_TOLERANCE || 0.003);
const frozen = new Date(process.env.PULSE_VISUAL_TIME || "2026-10-15T12:00:00Z");
const routes = (process.env.PULSE_VISUAL_ROUTES || ",standings,driver/leclerc,calendar").split(",");
const shots = [
  { device: "desktop", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { device: "desktop", viewport: { width: 1440, height: 900 }, theme: "light", only: [""] },
  { device: "phone", viewport: { width: 390, height: 844 }, theme: "dark", isMobile: true },
];
const BASELINES = "tests/visual";
const FIXTURES = "tests/visual/fixtures";
const OUT = "artifacts/visual";
const exists = (p) => access(p).then(() => true, () => false);
const fixtureFile = (url) => {
  const u = new URL(url);
  const params = new URLSearchParams(u.search);
  params.sort();
  const key = u.pathname + "?" + params;
  return `${FIXTURES}/${createHash("sha1").update(key).digest("hex").slice(0, 16)}.json`;
};

await mkdir(OUT, { recursive: true });
await mkdir(FIXTURES, { recursive: true });
const browser = await chromium.launch(process.env.PULSE_CHROMIUM_CHANNEL ? { channel: process.env.PULSE_CHROMIUM_CHANNEL } : {});
const report = [];
const missingFixtures = new Set();
let failures = 0;

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 1,
    isMobile: !!shot.isMobile,
    hasTouch: !!shot.isMobile,
    colorScheme: shot.theme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await context.clock.setFixedTime(frozen);
  await context.addInitScript((t) => {
    localStorage.setItem("pulse-v2-theme", JSON.stringify(t));
    localStorage.setItem("pulse-v2-timezone", JSON.stringify("Europe/London"));
  }, shot.theme);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (new URL(url).pathname === "/api/hit") return route.fulfill({ status: 204 });
    const file = fixtureFile(url);
    if (record) {
      try {
        const response = await route.fetch();
        const body = await response.text();
        if (response.ok()) await writeFile(file, JSON.stringify({ url: new URL(url).pathname + new URL(url).search, status: response.status(), body }));
        return route.fulfill({ status: response.status(), contentType: "application/json", body });
      } catch (e) {
        return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: String(e) }) });
      }
    }
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      return route.fulfill({ status: saved.status, contentType: "application/json", body: saved.body });
    } catch {
      missingFixtures.add(new URL(url).pathname + new URL(url).search);
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "No visual-test fixture for this request" }) });
    }
  });
  const page = await context.newPage();
  for (const route of routes) {
    if (shot.only && !shot.only.includes(route)) continue;
    const name = `${shot.device}-${shot.theme}-${route.replace(/[^\w]+/g, "_") || "home"}`;
    await page.goto(`${base}/#/${route}`, { waitUntil: "load" });
    await page.waitForSelector("h1", { timeout: 30000 }).catch(() => {});
    // Wait for skeletons/route spinners to resolve (poll via CDP evaluate: the CSP blocks string eval).
    for (let t = 0; t < 120 && (await page.evaluate(() => !!document.querySelector(".skeleton, .route-loading"))); t++) await page.waitForTimeout(500);
    await page.evaluate(async () => {
      document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in"));
      await document.fonts.ready;
      const visible = [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight);
      await Promise.all(visible.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
    });
    await page.waitForTimeout(800);
    // SMIL animations (e.g. cars lapping a TrackMap) ignore reduced motion: freeze them at t = 0.
    await page.evaluate(() => document.querySelectorAll("svg").forEach((s) => { s.pauseAnimations?.(); s.setCurrentTime?.(0); }));
    const actual = PNG.sync.read(await page.screenshot({ animations: "disabled", caret: "hide", scale: "css" }));
    const baselinePath = `${BASELINES}/${name}.${process.platform}.png`;
    const entry = { name, route, device: shot.device, theme: shot.theme, baseline: baselinePath };
    if (update) {
      await writeFile(baselinePath, PNG.sync.write(actual));
      report.push({ ...entry, status: "updated" });
      console.log(`↻ ${name}`);
      continue;
    }
    if (!(await exists(baselinePath))) {
      await writeFile(`${OUT}/${name}.${process.platform}.png`, PNG.sync.write(actual));
      report.push({ ...entry, status: "new" });
      console.log(`+ ${name} — no ${process.platform} baseline yet (saved to ${OUT}/)`);
      continue;
    }
    const expected = PNG.sync.read(await readFile(baselinePath));
    if (expected.width !== actual.width || expected.height !== actual.height) {
      await writeFile(`${OUT}/${name}.actual.png`, PNG.sync.write(actual));
      report.push({ ...entry, status: "failed", reason: `size ${actual.width}×${actual.height} vs ${expected.width}×${expected.height}` });
      failures++;
      console.log(`✗ ${name} — size changed`);
      continue;
    }
    const diff = new PNG({ width: actual.width, height: actual.height });
    const pixels = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: 0.12, includeAA: false });
    const ratio = pixels / (actual.width * actual.height);
    const failed = ratio > tolerance;
    if (failed || pixels) {
      await writeFile(`${OUT}/${name}.actual.png`, PNG.sync.write(actual));
      await writeFile(`${OUT}/${name}.diff.png`, PNG.sync.write(diff));
    }
    if (failed) failures++;
    report.push({ ...entry, status: failed ? "failed" : "passed", pixels, ratio });
    console.log(`${failed ? "✗" : "✓"} ${name} — ${(ratio * 100).toFixed(3)}% pixels differ`);
  }
  await context.close();
}
await browser.close();
if (missingFixtures.size)
  console.log(`\n${missingFixtures.size} API request(s) had no fixture (run with --record against a live server):\n  ` + [...missingFixtures].join("\n  "));
await writeFile(`${OUT}/report.json`, JSON.stringify({ tolerance, frozen, missingFixtures: [...missingFixtures], shots: report }, null, 2));
console.log(`\n${report.filter((r) => r.status !== "failed").length}/${report.length} screenshots OK (tolerance ${(tolerance * 100).toFixed(2)}%)`);
process.exit(failures ? 1 : 0);
