# Verification — F1 Pulse 3.3

Checked on 25 October 2026, after round 17 (Singapore) of the 2026 season. 3.3 is a testing and polish release; notes from earlier versions (3.2 on 24 October, 3.1 on 15 October, 3.0 on 13 October) follow.

## 3.3 testing and polish

**New test tooling**

- `npm run test:qa`: a deep sweep of 56 routes × 7 viewports and themes (385 page checks). It checks console errors, failed requests, element-level overflow, clipped and truncated text, text under 10 px, phone tap targets, stretched images, missing alt text, heading order, duplicate ids, and axe-core WCAG 2.1 A/AA violations in both themes.
- `npm run test:interact`: 20 real-interaction checks — command palette, season switching, standings views, theme persistence, favourites, gallery lightbox and keyboard, What If editing, compare, section chips, back/forward, 404 recovery, focus management, the skip link, telemetry/replay defaults, settings, and the phone tab bar, sheet, reminders and swipe.
- Visual review of every route at 1440 px and 390 px, both themes, with skims at 1024, 820 and 320 px.

**Results**

| Check | Before | After |
| --- | --- | --- |
| axe colour-contrast failures (page checks) | 140 | 0 |
| ARIA misuse (`aria-label` on generic elements) | 68 | 0 |
| Keyboard-unreachable scroll regions | 12 | 0 |
| Heading-order skips | 28 | 0 |
| Duplicate ids (SVG gradients) | 28 | 0 |
| Element overflow | 1 | 0 |
| Interaction checks | 17/19 | 20/20 |
| Browser checks (`test:e2e`) | 152/152 | 152/152 |
| Unit tests | 111 | 116 |

**Defects found and fixed**

- **Reliability.**
  - The Cache API is a no-op on `*.workers.dev`, so production had no edge cache: every reader rebuilt the season (about 5 s) and proxied straight to Jolpica, which caused rate-limit errors. Fixes:
    - an isolate memory cache with stale-if-error;
    - the current season served from KV (saved every 15 minutes) — about 5 s → 0.9 s;
    - client pacing only for upstream-bound requests.
  - A rate-limited OpenF1 session check was reported as "not in the free archive". It is now a retryable 429, and confirmed sessions are remembered.
  - Non-JSON error pages no longer surface as "Unexpected token '<'".
- **Correctness.**
  - Historical seasons showed today's car numbers (Verstappen "#3" in 2021). Past seasons now use the number raced.
  - Partial failures showed confident zeros (career totals, team season figures). They now show a retryable error.
  - URL `?season=` was applied after the page mounted, which fetched the wrong season first. Links to another view of the current page (`?view=constructors`) were ignored.
  - "−0" gaps now read "Level". Rank changes for unclassified drivers are hidden. The σ/Σ mix-up and the "12–12 Jun" dates are fixed.
  - Historical pages showed modern photos: 2026 grandstands on 1950 pages, a 60-year-old Prost on a 1988 line-up, a 2025 Sauber on a 2010–18 card. Photos are now era-checked.
- **Accessibility.**
  - Secondary text contrast was raised in both themes.
  - Focus moves to the new page after navigation.
  - The 404 page and not-found states have an `<h1>`.
  - Labelled graphics have roles. Scroll regions are focusable. Touch targets are enlarged.
  - Reduced motion no longer leaves staggered elements invisible for their delay.
- **Layout.**
  - Phone tables keep points and gaps visible. Long surnames scale instead of breaking.
  - Fixed: the invisible gold "World titles" number, the empty typical-conditions chart, clipped legends and intros, orphaned grid cells, and footnotes split into columns.
- **Performance.**
  - Layout thrash from the parallax and section-nav code was removed (about 1.7 s → 0.2 s of forced layout during load on a throttled phone).
  - Below-the-fold sections render in a time-sliced transition.
  - Inter was subset (352 → 126 KB). Track outlines load per circuit (about 5 KB instead of 100 KB).
  - Mobile Lighthouse (production, simulated slow 4G):
    - blocking time on the race page: 1.5 s → 0.7 s;
    - home LCP: 5.1 s → 3.7–4.6 s;
    - accessibility, best practices and SEO: 96–100.

## 3.2 additions

**Tests**

- **Unit tests:** 111 pass. New since 3.1:
  - upgrade-step detection, start-performance and teammate-rating maths (`tests/analytics-x.test.mjs`)
  - quali-lap distance integration, corner detection and undercut/overcut classification (`tests/race-x.test.mjs`)
  - calendar alarms (VALARM) in the ICS export
- **Browser checks:** 152/152 pass locally (desktop dark and light, tablet, phone). They run across 38 routes, including the new What If, Weather Impact and Career Ratings pages and race 17 with its lap overlay and strategy explorer.
- **Visual regression:** the 9 baselines were re-recorded for the new photography and layout, then replay at 0.000% difference.
- **Data accuracy:** `npm run verify:accuracy` passes. The 2025, 2007 and 1988 audits match the official tables apart from the disclosed McLaren 2007 exclusion.

**Historical photography.** `node scripts/verify-media.mjs` checks every Wikimedia Commons file:

- it exists and is recorded in `sources.json`
- its licence is free, its artist is named and its source is the Commons file page
- its year is plausible
- no file is orphaned

| Group | With a free photo |
| --- | --- |
| World champions | 35/35 |
| Race winners | 113/115 (Peter Collins has no usable free photo; Ocon's lead file has no licence metadata, and he has official media) |
| Drivers 1950–2025 | 587/817 (420 with a face-centred headshot) |
| Constructors | 108/203 |
| Circuits | 66/77 (293 photos of circuits and their surroundings) |

Driver, constructor and circuit picks were reviewed on contact sheets. The automatic checks:

- reject pages that aren't about a racing driver
- drop non-lead photos taken more than 20 years after a career
- don't show scan dates on black-and-white prints as the photo year

**Defects found and fixed during 3.2 QA:**

- **Wrong cars on 36 constructors.** Team variants shared one photo, so every Lotus-Climax, Lotus-BRM and Lotus-Ford page showed a 1984 JPS Lotus, the 1960s McLaren entries a 2025 Norris photo, and the Cooper entries a Cooper-Jaguar sports car. These were dropped. A team photo dated inside the team's racing years now only appears for seasons within eight years of it, so McLaren 1988 shows no 2025 car. Museum and historic-event shots of a period car still appear for any season.
- **Credit text from Commons metadata.** Strings like "Unknown authorUnknown author", "No machine-readable author provided. X assumed" and the German Federal Archive's standard disclaimer (shown in place of a description) are cleaned at fetch time.
- **Credits in the wrong place.** A leftover global `.photo-credit` rule positioned every inline credit absolutely, in white text: invisible in light mode and stranded beside section headings.
- **Lap overlay on Singapore.** It defaulted to the pole-sitter's team-mate even though he set no time (P22) and then reported a connection error. It now falls back to the next qualifier with a time, and a missing lap shows an empty state.
- **Upgrade tracker axis.** The axis printed "R16R17" on phones.
- **Weather Impact on phones.** Driver and team names were truncated to "Jean…" and "M…".
- **Montoya's name.** Jolpica stores Juan Pablo Montoya's surname as "Pablo Montoya"; it is normalised in the archive.
- **Phone layout fixes:**
  - race radio players
  - the car-evolution stage
  - Insights pairs
  - Weather controls
  - race-pace ticks
  - strategy labels, which overlapped and are now a sorted chip list
  - the telemetry readout
  - circuit hero stats
  - the last row of the trackside gallery

**Bundle.** Commons photos are already-compressed WebP, so they skip the AVIF pipeline. That keeps the bundled image manifest at 121 KB and leaves about 40 MB of variant files out of the deploy. Commons metadata (93 KB gzipped) loads lazily.

## 3.1 additions

**Tests**

- **Unit tests:** 78 pass. They cover the archive maths, season analytics (Monte Carlo seeding, decider and clinch arithmetic, heatmap, consistency), Lab logic (mini-sector codes, corner detection, degradation fits, safety-car windows), Worker routes and the counting rules.
- **Browser checks:** 136/136 pass locally across all 34 routes. The checks include CSP errors, overflow, headings and broken images.
- **Visual regression:** all 9 baselines replay at 0.000% difference.

**Media.** `node scripts/verify-media.mjs` checks that every referenced file exists and is recorded in `sources.json`. It also checks that every 2019–2025 photo shows the kit of the team that driver last raced for that season.

| Season | Headshot coverage |
| --- | --- |
| 2019, 2020, 2024, 2025 | 100% |
| 2021 | 95% |
| 2022 | 91% |
| 2023 | 95% |

Kubica 2021, Hülkenberg and de Vries 2022 (stand-ins) and Lawson 2023 have no official studio portrait, so they keep monograms.

**Records spot-checked against public figures:**

- Schumacher 91 wins, Vettel 53, Prost 51, Senna 41
- Hamilton 106 including his 2026 win
- Alonso 425 starts
- Verstappen's 10-race streak and 19 wins in 2023
- Youngest winner Verstappen at 18 years 228 days

Pole counts come from qualifying classifications, which include two exclusions that the official tallies don't (Hamilton 105 vs 104, Schumacher 69 vs 68). The page footnotes this.

**Defects found and fixed during 3.1 QA:**

- **Safety car counted as zero.** 2026 race-control messages abbreviate to "VSC DEPLOYED", so Singapore's two Virtual Safety Cars were missed. The race report, race-pace filter and degradation fit all recognise the short form now, with a regression test.
- **Missing overtake names.** The code had OpenF1's overtake field names reversed, so every pass showed "#undefined". Driver codes now show.
- **Class-name collisions:**
  - The countdown used a `hero` class, which gave it an 80vh minimum height.
  - Race-control rows used `flag`, which squeezed them to the 22 px country-flag width.
  - Two feature areas both used the `.ax-` prefix, so the Archive section moved to `.arx-`.
- **Image wrapper side-effects.** The AVIF `<picture>` wrapper broke `parent > img` selectors and parallax measurement.
- **Layout fixes:**
  - The race-report glow had been laid out as a grid item.
  - Rivalries overflowed horizontally on phones.
  - The navigation was crowded below 1360 px; the phone tab bar now takes over below 1024 px.
  - The title model showed "100%" for a title that isn't mathematically settled; it now shows ">99.9%".
  - Title Maths showed a negative "outscores by" margin.

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
