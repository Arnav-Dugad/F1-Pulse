# F1 Pulse

**Feel every lap.** An independent, beautifully designed Formula 1 companion — live-season standings, race weekends, driver and team profiles with official photography, historical telemetry, replays and title maths.

Live: https://f1-pulse.arnavrival12.workers.dev/

Version 3 is a ground-up rebuild: new design system, new components, new pages, new media library and new animations. Only the Worker API layer and the tested data rules (`src/domain.mjs`, `src/math.mjs`) carry over.

## Design

- **Liquid glass.** Frosted, saturated translucent surfaces with specular rim lighting over a slowly drifting ambient backdrop that takes on the colours of whatever you're looking at — the championship leader on Home, the team on a driver or team page, the winner on a race page.
- **Typography.** SF Pro on Apple devices (Inter elsewhere), tight-tracked display sizes, tabular numerals everywhere numbers line up.
- **Motion.** Spring physics (via `motion`) for navigation pills, segmented controls, sheets, palettes and reordering; View Transitions between pages; self-drawing circuit outlines with cars lapping them; rolling countdown digits; 3D-tilt cards with parallax race numbers and pointer-tracked glare; scroll-revealed sections; counters that tick up. Everything honours *Reduce motion* (system or in-app).
- **Navigation.** A floating "island" capsule on desktop with a Lab menu; an iOS-style floating tab bar plus a draggable sheet on phones; a ⌘K / `/` command palette that searches drivers, teams, races, circuits and jumps to any season by typing a year.
- **Themes.** Dark and light, both first-class, applied before first paint.

## Pages

| Page | What it does |
| --- | --- |
| Home | Next-race hero with a lights-out countdown (five red lights in the final seconds) and animated circuit; turns into a live race-week hub from Thursday (session timeline, results as they publish, weather, "since your last visit"); latest podium, both championships, title-fight chart, the grid, headlines |
| Calendar | Photo grid and month timeline of every round, filters, search, ICS export |
| Race weekend | Data-only race report, official starting grid, qualifying deep dive, classifications, movers, lap chart, gap-to-leader and head-to-head worm charts, race-pace box plots, pit lane, tyre story, overtakes, race-control timeline, in-page team radio, race-day historical weather, podium celebration |
| Standings | Tables, Monte Carlo title odds (labelled model), points heatmap, consistency ranking, scroll-driven season bar race, bump chart, official round rewind |
| Drivers / Driver | Tilt-card grid; cinematic profiles with number-art reveal, season stats, race strip, form curve, teammate battle, career timeline ribbon, championship history, trackside gallery, Wikipedia summary |
| Teams / Team | Car parade; team profiles with line-up, race-by-race points, rivals, history, lineage link, gallery |
| Circuits / Circuit | 3D circuit hero, official maps, Grand Prix travel guide (local time, daylight, ten-year typical conditions), winners history, weather |
| Lab | Head to Head; Telemetry (linked traces, mini-sector timing map, automated corner analysis); Race Replay (duel or full field with motion trails, follow-the-race); Strategy (model plus tyre degradation fitted from a real race); Title Maths (championship decider and simulator); Insights (teammate gap index, reliability, form curves, pit-stop league, positions gained); Predict (local prediction game with badges and share card) |
| Archive | Record Book, On This Day, Rivalries, Rookies, Across Eras (rescored on today's points), Team Lineage, Season Story (round-by-round story mode for any season) |
| News, Favourites, Settings | BBC Sport headlines; saved drivers and teams; theme, motion, time zone, data export/import and full credits |

Also everywhere: a Dynamic-Island-style live session pill, ⌘K palette with actions ("norris vs piastri", "go to 1988"), section jump chips, swipe between rounds/drivers, pull-to-refresh, shared-element morphs from cards to profiles, and an installable offline-capable app (PWA).

Every season from 1950 works. Photography exists for the 2026 grid; other seasons use era-neutral monograms rather than reusing modern photos.

## Data and accuracy

| Source | Used for |
| --- | --- |
| [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast-compatible) | Calendars, results, qualifying, sprints, standings, laps, pit stops, careers |
| [OpenF1](https://openf1.org) | Historical telemetry, location, positions, stints, race control, radio (2023+, archive only) |
| [Open-Meteo](https://open-meteo.com) | Model weather at circuit coordinates |
| [Open-Meteo archive](https://open-meteo.com/en/docs/historical-weather-api) | ERA5 reanalysis for race-day weather and typical conditions (modelled, labelled) |
| BBC Sport RSS | Headlines (titles and links only) |
| Wikipedia REST | Driver and team summaries, with attribution |

Every data section shows its source and retrieval time. Nothing is fabricated: unavailable data gets an explicit empty state, and estimates (speed-integrated distance, strategy model, title bounds) are labelled as such.

Round-by-round charts are derived from race and sprint classifications with each era's counting rules applied: dropped scores until 1990, best-car-only constructor scoring before 1979, and the Indianapolis 500 counting for drivers only. Run against the official final tables for every season since 1950, they match exactly in all but six seasons. Four of those are 1950s shared-drive cases, which the site flags as approximate. The other two are official decisions race results can't show (McLaren's 2007 exclusion, Racing Point's 2020 penalty), which are disclosed beside the charts. Tables always show official values. See [VERIFICATION.md](VERIFICATION.md).

`npm run verify:accuracy [seasons… | all]` repeats that audit against live data. It also checks that every 2026 driver maps to a portrait of the team they last raced for, and that every 2026 circuit has an outline, map and photograph. Jolpica lists a driver's constructors in no particular order (Liam Lawson 2026 is listed `[rb, red_bull]` after three stand-in rounds at Red Bull), so the current team always comes from the latest race.

The Archive section runs on `public/data/archive.json` (every result 1950–2025, about 217 KB gzipped; `npm run data:archive`) plus the live season. Career and team histories use `public/data/history.json`, a snapshot of every completed season's final tables (Jolpica serves standings one season at a time). Regenerate it with `npm run data:history`; the running season is always fetched live.

## Media

Official Formula 1 imagery — 2024–2026 driver portraits, headshots and number artwork, 2019–2023 studio portraits, team logos and cars for 2019–2026, 2026 trackside galleries for every driver and team, circuit maps and outlines, race-hub photography — is used with the site owner's stated permission. Everything is self-hosted under `public/media/`, and every file's source URL is recorded in `public/media/sources.json`. Flags come from flagcdn.com (Flagpedia). Inter is bundled under the OFL.

Refresh media with `npm run media:fetch` (Python 3 + Pillow): it downloads to `public/media/`, writes `src/data/media.json` and `public/data/tracks.json`, crops headshots and records provenance. Processing never re-encodes a photo twice.

## Run

```sh
npm ci
npm run dev            # builds, then serves the app + Worker API at http://127.0.0.1:8787
```

For hot reload run `npm run preview` and `npm run dev:vite` in two terminals. `PULSE_PORT` changes the port.

## Verify

```sh
npm test               # unit tests: data rules, maths, Worker, points progression
npm run build          # strict TypeScript + production bundle
npm run verify:accuracy
npx playwright install chromium
npm run preview &      # then:
npm run test:e2e       # every route × desktop/tablet/phone × dark/light: errors, CSP, overflow, headings, images
npm run test:visual    # pixel comparison against tests/visual baselines (recorded API fixtures)
npm run lighthouse     # Lighthouse CI budgets (desktop)
node scripts/verify-media.mjs  # every season's photo maps to the driver's latest team
```

## Deploy

```sh
npm run deploy         # build + wrangler deploy (Worker name: f1-pulse)
```

Uses your authenticated Cloudflare account (`npx wrangler login`, or `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`). No secrets live in this repository.

## Architecture

- React 19, strict TypeScript, Vite; pages are lazy-loaded chunks; `motion` and React are split into vendor chunks.
- `src/app` — preferences and shell (nav, tab bar, sheet, command palette, footer). `src/ui` — design-system components, media, charts, cards. `src/lib` — router, media lookup, formatting, season maths. `src/pages` — one file (and stylesheet) per page.
- `worker/index.mjs` — read-only API proxy with source allowlists, validation, bounded telemetry windows, request de-duplication, timeouts and edge caching. Legacy `.html` URLs redirect to their new destinations.
- Browser request queue (rate-limit aware), memory/session caching, dated offline snapshot for core current-season data.

F1 Pulse is unofficial and is not associated in any way with the Formula 1 companies. F1, FORMULA ONE, FORMULA 1 and related marks are trade marks of Formula One Licensing B.V.
