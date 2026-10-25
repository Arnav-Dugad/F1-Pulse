/**
 * Deep QA sweep: every route × several viewports and both themes. Beyond scripts/e2e.mjs it reports
 * console errors, failed requests, element-level overflow, clipped text, tiny text, small tap targets
 * (phones), stretched images, missing alt text, heading order, duplicate ids and axe-core WCAG A/AA
 * violations. Writes artifacts/qa/report.json plus screenshots in artifacts/qa/shots/.
 *
 *   PULSE_TEST_URL=http://127.0.0.1:8787 node scripts/qa.mjs [--shots] [--routes=a,b] [--views=desktop-dark,phone-light]
 *
 * Long sweeps: run scripts/serve.mjs with PULSE_API_PROXY=<deployed origin> so upstream rate limits hold.
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.env.PULSE_TEST_URL || "http://127.0.0.1:8787";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shots = process.argv.includes("--shots");

const ROUTES = [
  "", "calendar", "race/1", "race/17", "race/18", "race/23", "standings", "standings?view=constructors", "standings?view=story",
  "drivers", "driver/verstappen", "driver/leclerc", "driver/lindblad", "teams", "team/ferrari", "team/cadillac", "team/audi",
  "circuits", "circuit/monza", "circuit/americas", "circuit/reims", "compare", "telemetry", "replay", "strategy", "scenarios",
  "news", "favorites", "settings", "insights", "predict", "records", "on-this-day", "rivalry", "rookies", "eras", "lineage",
  "story", "whatif", "weather", "ratings",
  "standings?season=1988", "driver/senna?season=1988", "race/5?season=1988", "team/mclaren?season=1988",
  "standings?season=1950", "race/2?season=1950", "driver/fangio?season=1955", "team/lotus-climax?season=1963",
  "circuit/indianapolis", "standings?season=2021", "race/22?season=2021", "driver/hamilton?season=2021",
  "this-page-does-not-exist", "driver/nobody",
];
const VIEWS = {
  "desktop-dark": { viewport: { width: 1440, height: 960 }, theme: "dark", axe: true },
  "desktop-light": { viewport: { width: 1440, height: 960 }, theme: "light", axe: true },
  "laptop-dark": { viewport: { width: 1024, height: 768 }, theme: "dark" },
  "tablet-light": { viewport: { width: 820, height: 1180 }, theme: "light" },
  "phone-dark": { viewport: { width: 390, height: 844 }, theme: "dark", phone: true },
  "phone-light": { viewport: { width: 390, height: 844 }, theme: "light", phone: true, axe: true },
  "small-dark": { viewport: { width: 320, height: 640 }, theme: "dark", phone: true },
};
const routes = arg("routes") ? arg("routes").split(",").map((r) => (r === "home" ? "" : r)) : ROUTES;
const views = arg("views") ? arg("views").split(",") : Object.keys(VIEWS);

/** Runs in the page: layout and content checks. */
function audit(phone) {
  const W = document.documentElement.clientWidth;
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05; };
  const clippedByAncestor = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const cs = getComputedStyle(q); if (/hidden|auto|scroll|clip/.test(cs.overflowX) || cs.position === "fixed") return true; } return false; };
  const sel = (e) => { let s = e.tagName.toLowerCase(); if (e.id) s += "#" + e.id; const c = [...e.classList].slice(0, 3).join("."); if (c) s += "." + c; return s; };
  const path = (e) => { const out = []; for (let q = e; q && q !== document.body && out.length < 4; q = q.parentElement) out.unshift(sel(q)); return out.join(" > "); };
  const text = (e) => (e.innerText || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const main = document.querySelector("main") || document.body;
  const all = [...main.querySelectorAll("*")];

  const overflowing = all.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 1 || r.left < -1) && !clippedByAncestor(e); });
  const overflow = overflowing.filter((e) => !overflowing.some((o) => o !== e && o.contains(e))).slice(0, 8).map((e) => ({ el: path(e), right: Math.round(e.getBoundingClientRect().right), left: Math.round(e.getBoundingClientRect().left) }));

  const hasOwnText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const clipped = [], truncated = [];
  for (const e of all) {
    if (!visible(e) || !hasOwnText(e) || e.closest(".sr-only")) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(cs.overflowX)) {
      if (cs.textOverflow === "ellipsis") { if (text(e).length < 28) truncated.push({ el: path(e), text: text(e) }); }
      else if (!/scroll|auto/.test(cs.overflowX)) clipped.push({ el: path(e), text: text(e) });
    }
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
    if (!clamp && e.scrollHeight > e.clientHeight + 3 && /hidden|clip/.test(cs.overflowY) && cs.display !== "inline" && e.clientHeight > 0 && e.clientHeight < 60) clipped.push({ el: path(e), text: text(e), vertical: true });
  }

  const tiny = [];
  for (const e of all) {
    if (!hasOwnText(e) || !visible(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 10 && !e.closest("svg")) tiny.push({ el: path(e), text: text(e), fs });
  }

  const targets = [];
  if (phone) {
    for (const e of document.querySelectorAll("a[href], button, [role=button], input, select, [role=tab], [role=switch]")) {
      if (!visible(e) || e.closest("p, .prose, figcaption, small, .photo-credit, .source")) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) targets.push({ el: path(e), w: Math.round(r.width), h: Math.round(r.height), text: text(e) || e.getAttribute("aria-label") || "" });
    }
  }

  const stretched = [], noAlt = [];
  for (const img of document.images) {
    if (!visible(img)) continue;
    if (!img.hasAttribute("alt")) noAlt.push(img.currentSrc.slice(-60));
    const cs = getComputedStyle(img);
    if (img.naturalWidth && cs.objectFit === "fill") {
      const r = img.getBoundingClientRect();
      const a = r.width / r.height, n = img.naturalWidth / img.naturalHeight;
      if (Math.abs(a - n) / n > 0.06 && r.width > 24) stretched.push({ src: img.currentSrc.slice(-50), rendered: a.toFixed(2), natural: n.toFixed(2) });
    }
  }

  const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible).map((h) => +h.tagName[1]);
  const skips = [];
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}→h${levels[i]}`);
  const ids = {};
  for (const e of document.querySelectorAll("[id]")) ids[e.id] = (ids[e.id] || 0) + 1;

  return {
    h1: document.querySelectorAll("h1").length,
    title: document.title,
    overflow, clipped: clipped.slice(0, 12), truncated: truncated.slice(0, 12), tiny: tiny.slice(0, 10), targets: targets.slice(0, 15),
    stretched: stretched.slice(0, 8), noAlt: noAlt.slice(0, 8), headingSkips: [...new Set(skips)],
    duplicateIds: Object.entries(ids).filter(([, n]) => n > 1).map(([id]) => id).slice(0, 8),
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(-60)),
    emptyStates: [...document.querySelectorAll('[role="alert"], .state h3')].map((e) => text(e)).slice(0, 5),
  };
}

await mkdir("artifacts/qa/shots", { recursive: true });
const browser = await chromium.launch({ ...(process.env.PULSE_CHROMIUM_CHANNEL ? { channel: process.env.PULSE_CHROMIUM_CHANNEL } : {}) });
const report = [];

async function runView(viewName) {
  const v = VIEWS[viewName];
  const context = await browser.newContext({ viewport: v.viewport, colorScheme: v.theme, reducedMotion: "reduce", serviceWorkers: "block", hasTouch: !!v.phone, isMobile: !!v.phone });
  await context.addInitScript((t) => localStorage.setItem("pulse-v2-theme", JSON.stringify(t)), v.theme);
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(`${r.status()} ${r.url().replace(base, "")}`); });
  page.on("requestfailed", (r) => { const f = r.failure()?.errorText || ""; if (!/ABORTED/i.test(f)) failed.push(`failed ${r.url().slice(0, 100)} ${f}`); });
  for (const route of routes) {
    errors.length = 0; failed.length = 0;
    const started = Date.now();
    await page.goto(`${base}/#/${route}`);
    await page.waitForSelector("h1", { timeout: 30000 }).catch(() => {});
    for (let t = 0; t < 90 && (await page.evaluate(() => !!document.querySelector(".skeleton, .route-loading"))); t++) await page.waitForTimeout(500);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
      document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in"));
      scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const result = await page.evaluate(audit, !!v.phone);
    result.docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (v.axe) {
      // Evaluated over CDP: the site's CSP (rightly) blocks injected <script> tags.
      await page.evaluate(axeSource).catch(() => {});
      result.axe = await page.evaluate(async () => {
        if (!window.axe) return [{ id: "axe-not-loaded" }];
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] }, resultTypes: ["violations"] });
        return r.violations.map((x) => ({ id: x.id, impact: x.impact, count: x.nodes.length, targets: x.nodes.slice(0, 4).map((n) => n.target.join(" ") + (n.any?.[0]?.message ? " — " + n.any[0].message.slice(0, 110) : "")) }));
      }).catch((e) => [{ id: "axe-error", targets: [String(e).slice(0, 120)] }]);
    }
    result.errors = [...new Set(errors)];
    result.failed = [...new Set(failed)];
    result.ms = Date.now() - started;
    if (shots) await page.screenshot({ path: `artifacts/qa/shots/${viewName}-${route.replace(/[^\w]+/g, "_") || "home"}.jpg`, fullPage: true, type: "jpeg", quality: 50 }).catch(() => {});
    report.push({ view: viewName, route, ...result });
    const n = ["overflow", "clipped", "targets", "stretched", "noAlt", "brokenImages", "errors", "failed"].reduce((s, k) => s + (result[k]?.length || 0), 0) + (result.axe?.length || 0);
    console.log(`${n ? "•" : "✓"} ${viewName} #/${route} (${(result.ms / 1000).toFixed(1)}s)${n ? ` — ${n} finding(s)` : ""}`);
  }
  await context.close();
}

// A few views in parallel; each view walks the routes in order so the Worker cache warms up.
const queue = [...views];
await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await runView(queue.shift()); }));
await browser.close();
await writeFile("artifacts/qa/report.json", JSON.stringify(report, null, 1));
console.log(`\n${report.length} page checks written to artifacts/qa/report.json`);
