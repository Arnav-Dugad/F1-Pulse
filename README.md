# F1 Pulse

An independent, free Formula 1 fan platform with real photography, published results, and transparent historical analytics. This is a complete replacement of the former frontend, with the same Cloudflare Worker name (`f1-pulse`).

## Run

```sh
npm ci
npm run dev
```

Open http://localhost:8787. This command builds the frontend and runs the same Worker request handler using a small Node static-asset adapter. For frontend hot reload, run `npm run preview` and `npm run dev:vite` in separate terminals. `npm run dev:worker` uses Wrangler's native local runtime.

## Build and deploy

```sh
npm test
npm run build
npm run deploy
```

`npm run deploy` uses your authenticated Cloudflare account. Authenticate with `npx wrangler login`, or use scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables. No secrets belong in this repository. A cleanup service worker retires the previous site’s offline shell caches without caching the replacement.

For an existing Cloudflare Workers Builds GitHub connection: keep build command `npm run build`, deploy command `npx wrangler deploy`, root directory `/`, and production branch `main`. The Worker name is unchanged, so a deployment to the correct existing account updates https://f1-pulse.arnavrival12.workers.dev/. A GitHub push alone is not proof that Cloudflare deployed it.

## Architecture

- React 19, strict TypeScript and Vite. Lazy-loaded fan, analytics and archive areas.
- An original graphite/red design system; responsive sidebar, mobile navigation, dark/light modes, locally served open-license fonts and reduced motion.
- Cloudflare Worker API adapters with source allowlists, validation, bounded telemetry windows, request deduplication, request timeouts and successful-response caching.
- Browser request deduplication, API scheduling, memory/session cache, bounded retry and dated offline fallback.
- Local official photographs and unmodified marks, with source URLs and the owner's stated permission recorded in `public/assets/sources.json`.
- No accounts, third-party tracking, mandatory keys or paid API access.

## Implemented

| Area              | Working behavior                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview          | Source-backed next event/countdown, latest classification/podium, driver/constructor standings                                                                                                     |
| Calendar          | Season selection, event search, upcoming/past filters, timezone-aware times, ICS export                                                                                                            |
| Championship      | Driver/constructor standings, filtering, sorting, leader gaps and CSV export                                                                                                                       |
| Drivers           | Real 2026 portraits, search/favorites, season profiles, race record, career race entries/wins/recorded poles/prior-season title counts                                                             |
| Teams             | Real 2026 logos/cars, profiles, season race records, race points by driver                                                                                                                         |
| Circuits          | Real circuit photos where verified, coordinates, real OSM links, season results and model weather                                                                                                  |
| Race hub          | Timetable, race/qualifying/sprint classification, grid changes, result sorting/export, measured lap chart and pit records                                                                          |
| Comparison        | Race head-to-head, podiums, wins, race points, finish/gain metrics, cumulative progression, bar/trend view, reliability, saved comparison                                                          |
| Telemetry         | Historical session/driver/lap selection; speed, throttle, brake, gear, RPM, DRS; linked crosshair/window controls; observed sectors and lap times; raw CSV export                                  |
| Lap delta         | Explicitly **estimated** distance from speed integration, overlap-only alignment, gap rejection and derived time delta                                                                             |
| Historical replay | Selected-lap window, actual reported location samples, shared absolute clock, interpolated markers, missing-sample hiding, scrubbing, speed/focus controls, position tower and race-control events |
| Archive detail    | Actual stints, pit records, session weather, race control and external radio recording links                                                                                                       |
| Strategy          | Documented one/two-stop model, editable assumptions, pit windows, time comparison and degradation sensitivity                                                                                      |
| Title scenarios   | Full-points scoring from 2010, season-specific sprint scoring, 2019–2024 fastest-lap eligibility, duplicate validation                                                                             |
| News              | BBC Sport RSS headlines and publisher links; source timestamps; search                                                                                                                             |
| Preferences       | Theme, timezone, favorite drivers/teams, motion, JSON export/import and saved comparisons                                                                                                          |
| Search            | Driver/team/race/circuit/tool discovery, fuzzy matching, season navigation, keyboard navigation and Ctrl/Cmd+K                                                                                     |

## Latest development additions

- **Your fan collection:** saved drivers and constructors together, real season standings, current photography, unsave controls and one-click comparison of favorites. Favorites without records in the selected season remain saved and are identified separately.
- **Championship rewind:** choose a published round for driver or constructor standings. Inspect rank/points changes against the preceding round, leader gaps, a points ladder and CSV exports. Frames use actual provider standings, including recorded sprint points and adjustments; they are not reconstructed from race-only points.
- **Weekend planning:** upcoming sessions on the overview, individual weekend downloads, and an option to export all published sessions for a season. ICS files preserve UTC starts, escape and fold fields, and use stable session IDs. Unpublished start times remain all-day dates.
- **Sharing and navigation:** page links pin the selected season; comparisons retain both drivers and their metric; rewind links retain the round. Previous `.html` calendar, driver, team and race URLs redirect to the new matching destinations.
- **Interaction quality:** position charts put P1 at the top, charts accept pointer and keyboard inspection, hidden mobile navigation cannot receive focus, and the open menu confines focus and background scrolling. The narrow 320px header keeps the official F1 TV link visible.
- **Data integrity:** pagination never mutates cached result arrays, duplicate chunks do not duplicate drivers, fallback snapshots must match the current season, corrupt saved preferences recover safely, retry clears the browser memory cache, and changing selections hides stale records immediately.

The [premium improvement roadmap](PREMIUM-ROADMAP.md) contains 60 proposed future upgrades across fan features, UI, data, analytics, visuals and animation. It distinguishes completed work from additions.

## Provenance and availability

Jolpica supplies schedules, standings, classifications, pit stops and lap records. Historical coverage starts in 1950, but individual datasets vary by era. Championship constructor data begins later. Queries use result pagination rather than silently truncating at the first page.

OpenF1 supplies historical data from 2023 onward. Its live window is paid; this app filters out active/recent sessions and validates archive eligibility in the Worker. No authentication or payment restrictions are bypassed. Telemetry requests are one driver and at most three minutes. Browser scheduling respects 3 requests/second and a conservative 28/minute rolling limit. Cloudflare caching lowers shared upstream demand; production quotas still apply.

Open-Meteo supplies current model conditions and seven-day forecasts at circuit coordinates. This is not circuit sensor data and is not a forecast for a race outside the forecast window.

A dated, genuinely fetched `launch-snapshot.json` covers basic current-season data if the source is unavailable. It is never shown as current/live data; the UI marks the saved response and its retrieval time. Refresh manually with `python scripts/snapshot.py`. No telemetry is fabricated or bundled as fake live data.

All local driver/car assets depict 2026. Historical seasons do not reuse a current portrait or team logo as an era-correct asset. An archival OpenF1 headshot covers Yuki Tsunoda where the 2026 roster source has no active-driver photo; its photograph date is unspecified and explicitly labeled. Circuit photography can predate the selected season and is labeled as source photography. Missing assets show explicit unavailable states. Wikipedia biography/photo fallback may be blocked by the provider. Official asset ownership/permission is documented separately from data-source terms. Inter and Barlow Condensed are locally hosted under their included OFL license files.

## Honest boundaries

- Replay covers a selected lap/time window and two spatially tracked drivers, with the session's reported position tower. It is **not** full-race spatial playback or a broadcast.
- Telemetry distance is integrated from speed, not official distance/GPS. An exact FastF1 distance pipeline, corner/mini-sector analysis, elevation, 3D track geometry and full-race replay are not implemented.
- Strategy defaults are user-editable assumptions, with no historical calibration or confidence intervals. Compound-specific physics, weather/safety-car traffic models and stochastic predictions are not implemented.
- The championship simulator adds one full-points event. It does not recalculate official countback, model shortened-race points, double points or pre-2010 scoring.
- Driver/constructor comparisons use race points, explicitly excluding sprints/adjustments. Career qualifying coverage varies; incomparable eras need context. Entry counts include all recorded classifications; non-finish status counts can include DNS and disqualification. Prior-season title counts exclude the current calendar year, so a midseason leader is never labeled a champion.
- The historical explorer is season-driven. A dedicated all-time record database, qualifying head-to-head, cross-season comparison and automated FastF1 processing remain future work.
- News includes linked titles, not copied full articles or unlicensed publisher imagery.
- No Lighthouse or WCAG certification is claimed. Automated and visual checks are described in `VERIFICATION.md`.

## Verification

```sh
npm test
npm run build
npm run verify:data
npx playwright install --with-deps chromium firefox webkit
npm run preview  # separate terminal
npm run test:e2e
npm run test:release
node scripts/deep-e2e.mjs
```

`verify:data` exercises actual source requests. Browser tests capture screenshots and check navigation, overflow, themes, timezone persistence, search and mobile navigation. Deep tests exercise profiles, favorites, classification, comparisons, scenario validation and real archive telemetry/replay. Environment-specific browser support is recorded explicitly in test artifacts. GitHub Actions performs unit/build/browser checks; it does not silently deploy to a different account.

`test:release` additionally checks published round standings, constructor switching, clipboard sharing, favorite comparisons, real ICS downloads, legacy links, keyboard chart controls, 390/320px layouts and corrupt-preference recovery. Set `PULSE_CHROMIUM_CHANNEL=chrome` to use an installed Chrome browser. `PULSE_TEST_URL` changes the target URL; `PULSE_PORT` changes the local verification server port. The preview server binds to localhost.

F1 Pulse is an unofficial noncommercial fan site, not affiliated with Formula 1, the FIA, any team, or F1 TV. Formula 1 and related marks belong to their owners. The F1 TV header link opens the official service.
