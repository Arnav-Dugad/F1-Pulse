# Verification record

## Development release — 13 October 2026

The replacement was extended with championship rewind, a dedicated fan collection, session calendar exports, sharing, legacy redirects, mobile focus handling and data-integrity fixes.

- Passed 19 Node tests, including immutable pagination, duplicate-result protection, unranked standings, snapshot season checks, preference validation, calendar escaping/UTF-8 line folding and legacy URL redirects.
- Passed strict TypeScript and production Vite build; the new fan/rewind screens remain separate lazy-loaded bundles.
- Passed 13 requests against real Jolpica, OpenF1, Open-Meteo and BBC sources, including actual historical telemetry and location samples.
- Passed Chrome desktop, tablet and mobile route/theme/search/persistence checks on the new source, including the new screens.
- Passed the existing deep Chrome suite: profiles/favorites, race/qualifying results, comparison/save/load, scoring validation, six telemetry channels, measured location replay, clock controls and recorded stints.
- Passed release interaction checks: actual 2025 round standings, constructor switching, season/round clipboard links, real-photo favorites, direct comparisons, keyboard crosshairs, season/session ICS downloads, legacy redirects, mobile focus confinement, 320px overflow/F1 TV visibility and corrupt-preference recovery. The 320px test found and verified fixes for the points-ladder minimum width and narrow header layout. Representative desktop and mobile screenshots were visually reviewed.
- Cloudflare `wrangler deploy --dry-run` successfully bundled the Worker and static asset binding with the legacy routing configuration. This is packaging validation, not a production deployment.

The additional release interaction suite is `npm run test:release`; reports and images are written to ignored `artifacts/`. Browser checks on this Windows environment use installed Chrome (`PULSE_CHROMIUM_CHANNEL=chrome`). No Firefox/WebKit, Lighthouse or WCAG certification is claimed for this release.

## Original replacement verification

Executed on 13 October 2026 against the replacement source and real providers.

## Passed

- Strict TypeScript checking and production Vite build.
- 11 Node unit tests covering source route validation, mutation rejection, rate-limit failure, request deduplication, result parsing, stint degradation math, championship scoring/bonus rules, shared-entry head-to-head, distance integration/delta and time-synchronized interpolation/gap handling.
- 13 real-source checks: 1950 calendar, current calendar, current standings, latest race classification, 2025 qualifying, model weather, archived 2025 sessions, drivers, laps, car samples, location samples, stints, and BBC RSS.
- Chromium desktop (1440 × 1050), tablet (820 × 1180), mobile (390 × 844): main page navigation, page overflow checks, header F1 TV destination, real image loading, theme/timezone persistence, command search and mobile menu. No uncaught browser exceptions in these runs.
- Deep Chromium interactions: driver profile/favorites; actual latest race classification/qualifying; driver comparison and chart mode/save/load; impossible scenario rejection/reset; six measured telemetry channels; sectors and lap durations; actual historical location replay; play/pause/scrub clock; real stint retrieval.
- Representative screenshots were captured and visually inspected. Fixes included search Enter focus behavior, driver image crops, official F1 TV contrast, telemetry selector widths and a CSS rule that inadvertently enlarged replay source icons.

## Environment limits

- Firefox launched but could not complete page/context creation in this sandbox. No Firefox pass is claimed.
- WebKit could not launch because system GTK/GStreamer and related libraries are absent. No WebKit pass is claimed.
- Native Wrangler local startup was blocked by a sandbox network-interface error. Browser checks used the identical Worker handler through `scripts/serve.mjs`; Cloudflare-specific runtime behavior remains subject to deployment verification.
- `wrangler whoami` confirmed no Cloudflare authentication. Direct deployment to the existing account was unavailable. A source push, successful local build, or GitHub workflow is not proof of an updated public Worker.
- No Lighthouse score, WCAG certification, exact GPS distance, full-race spatial replay, stochastic strategy prediction, or pre-2010 scoring completeness is claimed.

## Reproduce

Run `npm ci`, `npm test`, `npm run build`, and `npm run verify:data`. Start `npm run preview` separately, then run `npm run test:e2e` and `node scripts/deep-e2e.mjs`. Install Playwright browsers first with `npx playwright install --with-deps chromium firefox webkit`.

The default browser suite is Chromium. In an environment that supports all engines, set `PULSE_BROWSERS=chromium,firefox,webkit` when running it. Test JSON reports and screenshots are generated in the ignored `artifacts/` directory. Real upstream data and request windows change over time; unavailability must be reported rather than replaced with dummy fixtures.
