# Verification — F1 Pulse 3.0

Checked on 13 October 2026, after round 17 (Singapore) of the 2026 season.

## Data accuracy (`npm run verify:accuracy`)

The site's points-progression code (`src/progress.mjs`, which powers the title-fight chart, bar-chart race, bump chart and team/driver/compare charts) was run against the official final standings for **every season from 1950 to 2025**, plus the live 2026 table.

| Seasons | Result |
| --- | --- |
| 2026 (17 rounds) | Exact for all 23 drivers and 11 constructors; win counts match |
| 1991–2025 | Exact, except two official decisions that race results cannot show (both disclosed on the site — see below) |
| 1950–1990 | Exact in 37 of 41 seasons once each era's counting rules are applied; the other four differ by fractions caused by shared drives and are flagged as approximate. The champion is correct in every season |

Counting rules implemented and verified against the official tables:

- **Dropped scores** (1950–1990): best *n* results, or best *a* of the first *k* races plus best *b* of the rest. Example: 1988, where Prost scored 105 points but only 87 counted, and Senna is correctly the champion on 90.
- **Constructors before 1979**: only the best-placed car scored.
- **Indianapolis 500 (1950–1960)**: counted for drivers only. The later US Grands Prix at Indianapolis (2000–2007) count normally. An audit failure on 2007 caught this distinction.

Known official adjustments, disclosed beside the charts:

- **2007**: McLaren excluded from the constructors' championship (218 points from classifications, 0 official).
- **2020**: Racing Point docked 15 points (210 points from classifications, 195 official).

Tables and standings always show the official provider values; only the round-by-round charts are derived.

**Media mapping (2026).** Every driver in the standings maps to an official portrait in the kit of the team they last raced for. Every constructor has a logo, a white logo and side and front car images. All 23 circuits have an outline, an official map and a photograph.

A real data trap the audit caught: Jolpica lists a driver's constructors in no particular order. Liam Lawson 2026 drove for Racing Bulls, stood in at Red Bull for rounds 12–14 and then returned, but is listed as `[rb, red_bull]`. Current teams therefore always come from the latest race, and stints are shown, for example "Also Red Bull, rounds 12–14".

**Spot checks against public records.** These all match:

- Singapore 2026: Verstappen won from pole, Leclerc set the fastest lap, consistent with BBC Sport's headlines.
- Monza history: Hamilton and Schumacher have 5 wins each, Ferrari 20, and 76 Grands Prix have been held there.
- 1988 Canadian GP: won by Senna.

## Unit tests (`npm test`)

25 passing: data rules, ICS export, maths, Worker validation and caching, points progression, counting rules and Indianapolis handling.

## Browser checks (`npm run test:e2e`)

25 routes × desktop (dark and light) + tablet + phone = 100 page checks. These cover every page, including historical 1988 driver, team, race and standings pages.

Each page is checked for:

- uncaught errors
- horizontal overflow
- a missing `<h1>`
- broken images

The full log is in `artifacts/e2e-log.txt` and the screenshots are in `artifacts/`.

**Visual review.** Every page was reviewed by hand at 1440 px (dark), and key pages at 390 px and in light mode. Defects found and fixed during review:

- The floating nav's blur was disabled because a `view-transition-name` on its parent made that parent a backdrop root.
- Dashed chart series were invisible.
- Podium portraits were mis-sized.
- Driver-card crops cut off heads.
- The F1 logo was invisible in light mode.
- A long race time was truncated.
- Head to Head surnames broke mid-word on phones.
- Practice-only reserves were counted as part of the grid.
- Telemetry and Replay defaulted to the lowest driver numbers instead of the top two finishers.
- Career history relied on a Jolpica endpoint that requires a season; it is now a verified 1950–2025 snapshot plus live current-season data.
- After a deploy, an open tab whose page chunk no longer exists now reloads itself once to pick up the new build.

## Not claimed

- No Lighthouse or formal WCAG certification.
- OpenF1 telemetry is archive-only (2023+); live timing is not used.
- Strategy and title-maths outputs are labelled models, not predictions.
