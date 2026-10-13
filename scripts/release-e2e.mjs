/** Release checks against real provider responses; no fabricated browser API fixtures. */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch(
  process.env.PULSE_CHROMIUM_CHANNEL
    ? { channel: process.env.PULSE_CHROMIUM_CHANNEL }
    : {},
);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const overflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
    false,
    "Page must fit the viewport",
  );
try {
  await page.goto(base + "/#/rewind?season=2025&round=5");
  await page.locator(".table-points").first().waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".source").length >= 3,
  );
  const envelope = await page.evaluate(async () =>
    (await fetch("/api/jolpica?path=2025/5/driverStandings.json")).json(),
  );
  assert.ok(
    envelope.data.MRData.StandingsTable.StandingsLists[0].DriverStandings
      .length,
  );
  assert.equal(
    await page.locator(".table-points").first().textContent(),
    envelope.data.MRData.StandingsTable.StandingsLists[0].DriverStandings[0]
      .points,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Choose championship round" })
      .inputValue(),
    "5",
  );
  await page
    .getByRole("button", { name: "Previous championship round" })
    .click();
  await page.waitForFunction(
    () => new URLSearchParams(location.hash.split("?")[1]).get("round") === "4",
  );
  await page.locator(".table-points").first().waitFor();
  await page.getByRole("button", { name: "constructors", exact: true }).click();
  await page.locator(".table-points").first().waitFor();
  assert.equal(await page.locator("tbody tr").count(), 10);
  await page.getByRole("button", { name: "Share page" }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(shared, /season=2025/);
  assert.match(shared, /round=4/);
  await page.screenshot({
    path: "artifacts/release-rewind-desktop.png",
    fullPage: true,
  });
  checks.push(
    "published round standings, stepping, constructors and season-aware clipboard sharing",
  );

  await page.goto(base + "/#/drivers?season=current");
  await page.locator(".driver-card").first().waitFor({ timeout: 60000 });
  const ids = [];
  for (const i of [0, 1]) {
    const card = page.locator(".driver-card").nth(i);
    ids.push((await card.getAttribute("href")).match(/driver\/([^?]+)/)[1]);
    await card.getByRole("button", { name: "Save favorite" }).click();
  }
  await page.goto(base + "/#/teams?season=current");
  await page.locator(".constructor-card").first().waitFor({ timeout: 60000 });
  await page
    .locator(".constructor-card")
    .first()
    .getByRole("button", { name: "Save favorite" })
    .click();
  await page.locator(".fan-pass").click();
  await page.locator(".collection-card").nth(2).waitFor({ timeout: 60000 });
  assert.equal(await page.locator(".collection-card").count(), 3);
  assert.equal(
    await page
      .locator(".collection-portrait")
      .evaluateAll((images) =>
        images.every((img) => img.complete && img.naturalWidth > 0),
      ),
    true,
  );
  await page.screenshot({
    path: "artifacts/release-fan-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Compare favorites" }).click();
  await page.locator(".comparison-score").waitFor({ timeout: 120000 });
  const chosen = await page
    .locator(".comparison-controls select")
    .evaluateAll((selects) => selects.map((s) => s.value));
  assert.deepEqual([...chosen].sort(), [...ids].sort());
  const chart = page.locator(".chart svg").first();
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await page.locator(".crosshair").first().waitFor({ state: "attached" });
  checks.push(
    "real-photo fan collection, persistent driver/team favorites, comparison links and keyboard charts",
  );

  await page.goto(base + "/#/calendar?season=2025");
  await page.locator(".race-card").first().waitFor({ timeout: 60000 });
  const exportButton = page.getByRole("button", { name: "Add to calendar" });
  const download = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click(),
  ]).then(([d]) => d);
  await download.saveAs("artifacts/release-calendar.ics");
  const raceCalendar = await readFile("artifacts/release-calendar.ics", "utf8");
  const races = (raceCalendar.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(races, await page.locator(".race-card").count());
  await page.getByRole("checkbox").check();
  const weekendDownload = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click(),
  ]).then(([d]) => d);
  await weekendDownload.saveAs("artifacts/release-weekends.ics");
  const weekendCalendar = await readFile(
    "artifacts/release-weekends.ics",
    "utf8",
  );
  assert.ok((weekendCalendar.match(/BEGIN:VEVENT/g) || []).length > races);
  checks.push(
    "real season calendar and every published session exported as valid ICS downloads",
  );

  await page.goto(base + "/driver-profile.html?driver=norris&season=2025");
  await page.waitForURL(/#\/driver\/norris\?season=2025/);
  await page.locator(".profile-copy h2").waitFor({ timeout: 60000 });
  checks.push("legacy driver URLs redirect to the matching season profile");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#/fan?season=current");
  await page.locator(".collection-card").first().waitFor({ timeout: 60000 });
  await overflow();
  assert.equal(await page.locator(".sidebar").getAttribute("inert"), "");
  await page.getByRole("button", { name: "Open navigation" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .first()
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(await page.locator("main").getAttribute("inert"), "");
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest(".sidebar,.mobile-toggle"),
      ),
      true,
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation" })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.screenshot({
    path: "artifacts/release-fan-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(base + "/#/rewind?season=2025&round=1");
  await page.locator(".table-points").first().waitFor({ timeout: 60000 });
  await overflow();
  const tvBounds = await page.locator(".tv-link").boundingBox();
  assert.equal(
    (await page.locator(".position").allTextContents()).some((rank) =>
      rank.includes("NaN"),
    ),
    false,
    "Unranked drivers must not render NaN",
  );
  assert.ok(
    tvBounds && tvBounds.x >= 0 && tvBounds.x + tvBounds.width <= 320,
    "F1 TV must remain visible at 320px",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Previous championship round" })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: "artifacts/release-rewind-mobile.png",
    fullPage: true,
  });
  checks.push(
    "390/320px layouts, hidden navigation, focus confinement and first-round boundaries",
  );

  const corrupt = await browser.newContext();
  await corrupt.addInitScript(() => {
    localStorage.setItem("pulse-v2-timezone", '{"invalid":true}');
    localStorage.setItem("pulse-v2-favorites", '{"invalid":true}');
    localStorage.setItem("pulse-v2-theme", '"unknown"');
  });
  const badPage = await corrupt.newPage();
  badPage.on("pageerror", (e) => errors.push(e.message));
  await badPage.goto(base + "/#/settings");
  await badPage.locator(".settings-panel select").first().waitFor();
  assert.equal(
    await badPage.locator(".settings-panel select").first().inputValue(),
    "dark",
  );
  assert.equal(
    await badPage.locator(".settings-panel select").nth(1).inputValue(),
    "local",
  );
  await corrupt.close();
  checks.push("corrupt saved preferences recover without runtime errors");
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/release-verification.json",
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), checks, errors },
      null,
      2,
    ),
  );
  console.log("Release interactions passed:", checks.join("; "));
} finally {
  await browser.close();
}
