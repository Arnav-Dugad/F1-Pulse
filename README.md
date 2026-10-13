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
| Home | Next-race hero with live countdown and animated circuit, weekend schedule in your time zone, latest podium with official portraits, both championships, title-fight chart, season-at-a-glance, the grid, upcoming races, headlines |
| Calendar | Photo grid and month timeline of every round, filters, search, ICS export (races or every session) |
| Race weekend | Hero with circuit, countdown/timetable or winner spotlight, race/qualifying/sprint classifications, lap chart, pit stops, movers, circuit weather forecast |
| Standings | Drivers and constructors tables, animated season bar-chart race, bump chart, official round-by-round standings rewind |
| Drivers / Driver | Tilt-card grid; cinematic profiles with season stats, race strip, teammate battle, career history, Wikipedia summary |
| Teams / Team | Car parade; team profiles with line-up, race-by-race points, rivals, history |
| Circuits / Circuit | Animated outlines; official circuit maps, winners history, weather |
| Lab · Head to Head | Two-driver face-off with mirrored stat bars and charts, shareable URL |
| Lab · Telemetry | Linked speed/throttle/brake/gear/RPM/DRS traces, estimated delta, speed map (OpenF1, 2023+) |
| Lab · Race Replay | Archived lap playback on the circuit, position tower, race control, stints, radio |
| Lab · Strategy | Editable one/two-stop race model with stint timelines and sensitivity |
| Lab · Title Maths | Who can still win, and a finishing-order simulator |
| News, Favourites, Settings | BBC Sport headlines; your saved drivers and teams; theme, motion, time zone, data export/import and full credits |

Every season from 1950 works. Photography exists for the 2026 grid; other seasons use era-neutral monograms rather than reusing modern photos.

## Data and accuracy

| Source | Used for |
| --- | --- |
| [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast-compatible) | Calendars, results, qualifying, sprints, standings, laps, pit stops, careers |
| [OpenF1](https://openf1.org) | Historical telemetry, location, positions, stints, race control, radio (2023+, archive only) |
| [Open-Meteo](https://open-meteo.com) | Model weather at circuit coordinates |
| BBC Sport RSS | Headlines (titles and links only) |
| Wikipedia REST | Driver and team summaries, with attribution |

Every data section shows its source and retrieval time. Nothing is fabricated: unavailable data gets an explicit empty state, and estimates (speed-integrated distance, strategy model, title bounds) are labelled as such.

Round-by-round charts are derived from race and sprint classifications with each era's counting rules applied: dropped scores until 1990, best-car-only constructor scoring before 1979, and the Indianapolis 500 counting for drivers only. Run against the official final tables for every season since 1950, they match exactly in all but six seasons. Four of those are 1950s shared-drive cases, which the site flags as approximate. The other two are official decisions race results can't show (McLaren's 2007 exclusion, Racing Point's 2020 penalty), which are disclosed beside the charts. Tables always show official values. See [VERIFICATION.md](VERIFICATION.md).

`npm run verify:accuracy [seasons… | all]` repeats that audit against live data. It also checks that every 2026 driver maps to a portrait of the team they last raced for, and that every 2026 circuit has an outline, map and photograph. Jolpica lists a driver's constructors in no particular order (Liam Lawson 2026 is listed `[rb, red_bull]` after three stand-in rounds at Red Bull), so the current team always comes from the latest race.

Career and team histories use `public/data/history.json`, a snapshot of every completed season's final tables (Jolpica serves standings one season at a time). Regenerate it with `npm run data:history`; the running season is always fetched live.

## Media

Official Formula 1 imagery — driver portraits and number artwork, team logos, 2026 cars, circuit maps and outlines, race-hub photography — is used with the site owner's stated permission. Everything is self-hosted under `public/media/`, and every file's source URL is recorded in `public/media/sources.json`. Flags come from flagcdn.com (Flagpedia). Inter is bundled under the OFL.

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
npm run test:e2e       # every route × desktop/tablet/phone × dark/light: errors, overflow, headings, images
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
