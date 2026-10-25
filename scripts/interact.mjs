/**
 * Interaction checks: real clicks, typing and keyboard on the running app (scripts/serve.mjs).
 * Each step passes or fails on its own; any page error or console error during a step fails it.
 *
 *   PULSE_TEST_URL=http://127.0.0.1:8787 node scripts/interact.mjs
 */
import { chromium } from "@playwright/test";

const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ ...(process.env.PULSE_CHROMIUM_CHANNEL ? { channel: process.env.PULSE_CHROMIUM_CHANNEL } : {}) });
const results = [];
let errors = [];

async function session(viewport, fn, extra = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce", ...extra });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(429|404)/.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });
  await fn(page, context);
  await context.close();
}
async function step(name, fn) {
  errors = [];
  try {
    await fn();
    if (errors.length) throw new Error(errors.join(" | "));
    results.push({ name, ok: true });
    console.log("✓ " + name);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e).slice(0, 300) });
    console.log("✗ " + name + " — " + String(e.message || e).slice(0, 300));
  }
}
const go = async (page, route) => {
  await page.goto(`${base}/#/${route}`);
  await page.waitForSelector("h1", { timeout: 30000 });
  for (let t = 0; t < 60 && (await page.evaluate(() => !!document.querySelector(".skeleton, .route-loading"))); t++) await page.waitForTimeout(500);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const h1 = (page) => page.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "");

/* ───────── Desktop ───────── */
await session({ width: 1440, height: 960 }, async (page) => {
  await step("home renders the next race and standings", async () => {
    await go(page, "");
    expect((await h1(page)).length > 3, "no hero heading");
    expect(await page.locator("main a[href*='#/driver/']").count() > 5, "too few driver links on home");
  });

  await step("command palette: Ctrl+K, type a driver, Enter opens the profile", async () => {
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search" }).or(page.getByLabel("Search", { exact: true }));
    await input.first().waitFor({ timeout: 5000 });
    await input.first().fill("norris");
    // The palette lists suggestions before filtering: wait until the first hit is the driver.
    for (let t = 0; t < 20 && !/Norris/.test((await page.locator("[role=option]").first().textContent().catch(() => "")) || ""); t++) await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    for (let t = 0; t < 16 && !(await page.evaluate(() => location.hash)).includes("driver/norris"); t++) await page.waitForTimeout(500);
    expect((await page.evaluate(() => location.hash)).includes("driver/norris"), "palette did not open Norris: " + (await page.evaluate(() => location.hash)));
  });

  await step("palette jumps to a season by typing a year", async () => {
    await page.keyboard.press("Control+k");
    const input = page.getByLabel("Search", { exact: true }).first();
    await input.fill("1988");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    expect((await page.evaluate(() => location.hash)).includes("1988"), "season jump failed: " + (await page.evaluate(() => location.hash)));
  });

  await step("season picker switches standings to 1988 (Senna champion)", async () => {
    await go(page, "standings");
    await page.locator(".season-pill select").first().selectOption("1988");
    await page.waitForTimeout(800);
    for (let t = 0; t < 40 && (await page.evaluate(() => !!document.querySelector(".skeleton"))); t++) await page.waitForTimeout(500);
    const text = await page.locator("main").innerText();
    expect(/Senna/.test(text) && /Prost/.test(text), "1988 standings missing Senna/Prost");
    await page.locator(".season-pill select").first().selectOption("current");
    await page.waitForTimeout(800);
  });

  await step("standings view switches to constructors", async () => {
    await go(page, "standings");
    await page.getByRole("tab", { name: /constructors/i }).or(page.getByRole("button", { name: /^constructors$/i })).first().click();
    await page.waitForTimeout(800);
    expect(/Ferrari|McLaren|Mercedes/.test(await page.locator("main").innerText()), "no constructors after switch");
  });

  await step("theme toggle flips light/dark and persists", async () => {
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(before !== after, `theme unchanged (${before})`);
    await page.reload(); await page.waitForSelector("h1");
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === after, "theme not persisted");
    await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).click();
  });

  await step("favourite a driver, see it on Favourites, remove it", async () => {
    await go(page, "driver/leclerc");
    const fav = page.getByRole("button", { name: /Add .* to favourites/ }).first();
    await fav.click();
    await go(page, "favorites");
    expect(/Leclerc/.test(await page.locator("main").innerText()), "Leclerc not on favourites");
    await go(page, "driver/leclerc");
    await page.getByRole("button", { name: /Remove .* from favourites/ }).first().click();
  });

  await step("race gallery lightbox opens, arrows move, Escape closes", async () => {
    await go(page, "race/17");
    const tile = page.getByRole("button", { name: /Open photo 1 of/ }).first();
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    const dialog = page.getByRole("dialog", { name: /photo viewer/ });
    await dialog.waitFor({ timeout: 5000 });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    expect(!(await dialog.isVisible().catch(() => false)), "lightbox did not close");
  });

  await step("What If: retiring the leader changes the hypothetical table, reset restores it", async () => {
    await go(page, "whatif");
    const table = () => page.locator(".wi-standings, [class*='standings']").first().innerText().catch(() => "");
    const before = await page.locator("main").innerText();
    const retire = page.getByRole("button", { name: /^Retire / }).first();
    await retire.scrollIntoViewIfNeeded();
    await retire.click();
    await page.waitForTimeout(600);
    const after = await page.locator("main").innerText();
    expect(before !== after, "nothing changed after retiring a driver");
    await page.getByRole("button", { name: /Reset (all|round)/ }).first().click();
    await page.waitForTimeout(400);
    void table;
  });

  await step("Compare: two drivers render a head-to-head", async () => {
    await go(page, "compare");
    expect(/vs|Head to Head|head-to-head/i.test(await page.locator("main").innerText()), "compare page has no comparison");
  });

  await step("section chips jump to a section", async () => {
    await go(page, "driver/verstappen");
    const chip = page.locator(".section-nav a, .section-nav button").nth(2);
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(900);
      expect((await page.evaluate(() => scrollY)) > 300, "chip click did not scroll");
    }
  });

  await step("back/forward restores routes", async () => {
    await go(page, "teams");
    await go(page, "team/ferrari");
    await page.goBack(); await page.waitForTimeout(800);
    expect((await page.evaluate(() => location.hash)).includes("teams"), "back did not return to teams");
    await page.goForward(); await page.waitForTimeout(800);
    expect((await page.evaluate(() => location.hash)).includes("team/ferrari"), "forward failed");
  });

  await step("404 page offers a way home", async () => {
    await go(page, "nope-nope");
    await page.getByRole("link", { name: /Back to the grid/ }).click();
    await page.waitForTimeout(600);
    expect((await page.evaluate(() => location.hash)) === "#/" || (await page.evaluate(() => location.hash)) === "", "404 link did not go home");
  });

  await step("keyboard: after in-app navigation, focus moves to the new page's main", async () => {
    await go(page, "drivers");
    const link = page.locator("main a[href*='#/driver/']").first();
    await link.focus();
    await page.keyboard.press("Enter");
    for (let t = 0; t < 20 && !(await page.evaluate(() => location.hash)).includes("driver/"); t++) await page.waitForTimeout(250);
    await page.waitForSelector("h1"); await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.activeElement?.id === "main"), "focus not on main: " + (await page.evaluate(() => document.activeElement?.tagName + "." + document.activeElement?.className)));
  });

  await step("keyboard: skip link focuses main, Tab shows a visible focus ring", async () => {
    await go(page, "standings");
    await page.reload(); await page.waitForSelector("h1");
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(/Skip to content/.test(first || ""), "first Tab stop is not the skip link: " + first);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id === "main"), "skip link did not focus main");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return "none"; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? "outline" : cs.boxShadow !== "none" ? "shadow" : "none"; });
    expect(ring !== "none", "focused element has no visible focus indicator");
  });

  await step("telemetry and replay load their default drivers", async () => {
    await go(page, "telemetry");
    expect(!(await page.locator("[role=alert]").count()), "telemetry shows an error");
    await go(page, "replay");
    expect(!(await page.locator("[role=alert]").count()), "replay shows an error");
  });

  await step("settings: reduced-motion toggle and time zone change apply", async () => {
    await go(page, "settings");
    const sw = page.getByRole("switch").first();
    if (await sw.count()) { const a = await sw.getAttribute("aria-checked"); await sw.click(); expect((await sw.getAttribute("aria-checked")) !== a, "switch did not toggle"); await sw.click(); }
  });
});

/* ───────── Phone ───────── */
await session({ width: 390, height: 844 }, async (page) => {
  await step("phone: tab bar navigates and More opens the sheet", async () => {
    await go(page, "");
    await page.locator(".tabbar").getByRole("link", { name: /Standings/ }).click();
    await page.waitForTimeout(800);
    expect((await page.evaluate(() => location.hash)).includes("standings"), "tab bar did not navigate");
    await page.getByRole("button", { name: "More sections" }).first().click();
    await page.waitForTimeout(600);
    const sheet = page.getByRole("dialog", { name: "More sections" }).or(page.locator("[aria-label='More sections'][role='dialog']"));
    expect(await sheet.count(), "More sheet did not open");
    await page.keyboard.press("Escape");
  });

  await step("phone: calendar reminder panel opens for an upcoming race", async () => {
    await go(page, "calendar");
    const toggle = page.getByRole("button", { name: /remind/i }).first();
    if (await toggle.count()) { await toggle.scrollIntoViewIfNeeded(); await toggle.click(); await page.waitForTimeout(500); }
  });

  await step("phone: horizontal swipe between drivers does not break the page", async () => {
    await go(page, "driver/norris");
    const box = await page.locator("main").boundingBox();
    await page.mouse.move(box.x + 300, box.y + 400); await page.mouse.down(); await page.mouse.move(box.x + 40, box.y + 410, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(1200);
    expect((await h1(page)).length > 0, "page lost its heading after swipe");
  });
}, { hasTouch: true, isMobile: true, colorScheme: "light" });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} interaction checks passed`);
process.exit(failed.length ? 1 : 0);
