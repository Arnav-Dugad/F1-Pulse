/**
 * Browser verification: every route at desktop, tablet and phone widths, in both themes.
 * Fails on uncaught page errors, horizontal overflow, missing headings or broken images.
 *   PULSE_TEST_URL=http://127.0.0.1:8787 node scripts/e2e.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
const routes = (process.env.PULSE_ROUTES || [
  "", "calendar", "race/1", "race/23", "standings", "standings?view=constructors", "standings?view=story",
  "drivers", "driver/leclerc", "teams", "team/ferrari", "circuits", "circuit/monza", "compare", "telemetry",
  "replay", "strategy", "scenarios", "news", "favorites", "settings",
  "standings?season=1988", "driver/senna?season=1988", "race/5?season=1988", "team/mclaren?season=1988",
].join(",")).split(",");
const viewports = { desktop: { width: 1440, height: 960 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };

await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ ...(process.env.PULSE_CHROMIUM_CHANNEL ? { channel: process.env.PULSE_CHROMIUM_CHANNEL } : {}) });
const report = [];
let failures = 0;
for (const [device, viewport] of Object.entries(viewports)) {
  for (const theme of device === "desktop" ? ["dark", "light"] : ["dark"]) {
    const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: "reduce" });
    await context.addInitScript((t) => localStorage.setItem("pulse-v2-theme", JSON.stringify(t)), theme);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of routes) {
      errors.length = 0;
      await page.goto(`${base}/#/${route}`);
      await page.waitForSelector("h1", { timeout: 30000 }).catch(() => {});
      // Let data arrive; skeletons should resolve into content or explicit states.
      await page.waitForFunction(() => !document.querySelector(".skeleton, .route-loading"), null, { timeout: 45000 }).catch(() => {});
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
        document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in"));
        scrollTo(0, 0);
      });
      await page.waitForTimeout(600);
      const check = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        skeletons: document.querySelectorAll(".skeleton").length,
        brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src),
        alerts: [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent?.slice(0, 120)),
      }));
      const problems = [];
      if (errors.length) problems.push("page errors: " + errors.join(" | "));
      if (check.overflow > 1) problems.push(`horizontal overflow ${check.overflow}px`);
      if (!check.h1) problems.push("no h1");
      if (check.brokenImages.length) problems.push("broken images: " + check.brokenImages.join(", "));
      const name = `${device}-${theme}-${route.replace(/[^\w]+/g, "_") || "home"}`;
      if (device === "desktop" || problems.length) await page.screenshot({ path: `artifacts/${name}.png`, fullPage: false });
      report.push({ device, theme, route, ...check, problems });
      if (problems.length) failures++;
      console.log(`${problems.length ? "✗" : "✓"} ${device}/${theme} #/${route} — ${check.h1.slice(0, 50)}${problems.length ? "\n    " + problems.join("\n    ") : ""}${check.alerts.length ? "\n    alerts: " + check.alerts.join(" | ") : ""}`);
    }
    await context.close();
  }
}
await browser.close();
await writeFile("artifacts/e2e-report.json", JSON.stringify(report, null, 2));
console.log(`\n${report.length - failures}/${report.length} checks passed`);
process.exit(failures ? 1 : 0);
