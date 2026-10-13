import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const root = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
const checks = [];
try {
  await page.goto(root + "/#/drivers");
  await page.locator(".driver-card").first().waitFor({ timeout: 60000 });
  const first = page.locator(".driver-card").first();
  await first.getByRole("button", { name: "Save favorite" }).click();
  assert.equal(
    await first
      .getByRole("button", { name: "Unsave favorite" })
      .getAttribute("aria-pressed"),
    "true",
  );
  await first.click();
  await page.locator(".profile-copy h2").waitFor();
  await page.locator(".profile-hero img").waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/profile-desktop.png",
    fullPage: true,
  });
  checks.push("driver profile and favorites");
  const snap = JSON.parse(
    await readFile("public/data/launch-snapshot.json", "utf8"),
  );
  const round =
    snap.responses["current/last/results.json"].MRData.RaceTable.Races[0].round;
  await page.goto(root + "/#/race/" + round);
  await page.locator(".table-points").first().waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Qualifying", exact: true }).click();
  await page
    .locator("th")
    .filter({ hasText: "Q3" })
    .waitFor({ timeout: 30000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/race-desktop.png", fullPage: true });
  checks.push("race classification and qualifying");
  await page.goto(root + "/#/analytics");
  await page.locator(".comparison-score").waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "By round", exact: true }).click();
  await page.locator(".round-bar").first().waitFor();
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await page.getByRole("button", { name: "Load saved", exact: true }).click();
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  checks.push("comparison, chart mode and saved selection");
  await page.goto(root + "/#/scenario");
  const selects = page.locator(".scenario-row select");
  await selects.first().waitFor();
  const duplicate = await selects.nth(1).inputValue();
  await selects.first().selectOption(duplicate);
  await page.getByText("Each driver can appear only once").waitFor();
  await page.getByRole("button", { name: "Reset scenario" }).click();
  assert.equal(
    await page.getByText("Each driver can appear only once").count(),
    0,
  );
  checks.push("scenario duplicate validation");
  await page.goto(root + "/#/telemetry");
  await page.locator(".season-select select").selectOption("2025");
  await page
    .getByRole("button", { name: "Load lap comparison" })
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Load lap comparison" })
    .click({ timeout: 90000 });
  await page.locator(".telemetry-channel").first().waitFor({ timeout: 120000 });
  assert.equal(await page.locator(".telemetry-channel").count(), 6);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/telemetry-desktop.png",
    fullPage: true,
  });
  checks.push("real historical telemetry and sectors");
  await page.goto(root + "/#/replay");
  await page.getByRole("button", { name: "Load historical replay" }).waitFor();
  await page
    .getByRole("button", { name: "Load historical replay" })
    .click({ timeout: 90000 });
  await page.locator(".track-outline").waitFor({ timeout: 120000 });
  const timeline = page.getByRole("slider", { name: "Replay timeline" });
  await page.getByRole("button", { name: "Play replay" }).click();
  await page.waitForTimeout(500);
  assert.ok(Number(await timeline.inputValue()) > 0);
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/replay-desktop.png",
    fullPage: true,
  });
  checks.push("measured location replay, clock and playback");
  await page.getByRole("button", { name: "Load session detail" }).click();
  await page.locator(".real-stint").first().waitFor({ timeout: 90000 });
  checks.push("recorded stint data");
  assert.deepEqual(errors, []);
  console.log("Deep interactions passed:", checks.join(", "));
  await writeFile(
    "artifacts/deep-browser-verification.json",
    JSON.stringify({ verifiedAt: new Date().toISOString(), checks }, null, 2),
  );
} finally {
  await browser.close();
}
