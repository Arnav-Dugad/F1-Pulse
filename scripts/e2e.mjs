import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
await mkdir("artifacts", { recursive: true });
const report = [];
const selected = (process.env.PULSE_BROWSERS || "chromium").split(",");
for (const [name, engine] of Object.entries({
  chromium,
  firefox,
  webkit,
}).filter(([name]) => selected.includes(name))) {
  let browser;
  try {
    browser = await engine.launch({ headless: true, timeout: 20000 });
  } catch (e) {
    report.push({ browser: name, blocked: e.message });
    console.log(name, "unavailable:", e.message.split("\n")[0]);
    continue;
  }
  try {
    for (const [device, viewport] of [
      ["desktop", { width: 1440, height: 1050 }],
      ["tablet", { width: 820, height: 1180 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await page
        .getByRole("heading", { name: "Welcome to your race world." })
        .waitFor();
      await page.locator(".standing-row").first().waitFor({ timeout: 45000 });
      assert.equal(
        await page.locator(".tv-link").getAttribute("href"),
        "https://f1tv.formula1.com/",
      );
      assert.equal(
        await page
          .locator(".hero-photo")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
        true,
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/${name}-${device}-overview.png`,
        fullPage: true,
      });
      for (const route of [
        "calendar",
        "standings",
        "drivers",
        "teams",
        "circuits",
        "strategy",
        "scenario",
        "news",
        "settings",
      ]) {
        await page.goto(base + "/#/" + route);
        await page.locator(".page-title h1").waitFor();
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 2,
        );
        assert.equal(
          overflow,
          false,
          `${name} ${device} ${route}: page overflow`,
        );
        if (["drivers", "standings", "strategy"].includes(route))
          await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `artifacts/${name}-${device}-${route}.png`,
          fullPage: true,
        });
      }
      await page.goto(base + "/#/settings");
      await page
        .locator(".settings-panel select")
        .first()
        .selectOption("light");
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "light",
      );
      await page
        .locator(".settings-panel select")
        .nth(1)
        .selectOption("Asia/Kolkata");
      await page.reload();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "light",
      );
      await page.locator(".settings-panel select").first().selectOption("dark");
      await page.getByRole("button", { name: "Search the grid" }).click();
      await page.getByRole("dialog").waitFor();
      await page.locator(".command-input").fill("calendar");
      await page.keyboard.press("Enter");
      await page.waitForURL(/calendar/);
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      if (device === "mobile") {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.locator(".sidebar.open").waitFor();
        await page
          .locator(".sidebar")
          .getByRole("link", { name: "Drivers", exact: true })
          .click();
        await page.waitForURL(/drivers/);
      }
      assert.deepEqual(errors, [], `${name} ${device}: runtime errors`);
      report.push({ browser: name, device, passed: true });
      console.log(
        name,
        device,
        "navigation, layout, persistence and search passed",
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(
  "artifacts/browser-verification.json",
  JSON.stringify({ verifiedAt: new Date().toISOString(), report }, null, 2),
);
assert.ok(
  report.some((r) => r.passed),
  "No browser verification completed",
);
