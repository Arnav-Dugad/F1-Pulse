# F1 Pulse

F1 Pulse is a premium, zero-subscription Formula 1 companion built with plain HTML, CSS and JavaScript. It combines published championship data, race schedules, results, driver profiles, constructor analysis and historical OpenF1 replay in a responsive interface. Real-time OpenF1 coverage requires provider access; this site does not promise a free live feed.

## Highlights

- Live race countdowns and local session times
- Driver and constructor standings with comparison tools
- Complete race calendar, circuit intelligence and results
- One-click `.ics` exports for a race weekend or the full season
- Automatic session scheduling in each visitor's local time zone
- Historical position, gap, tyre, weather, telemetry and race-control visualizations; live coverage depends on provider availability
- Driver biographies and team showcase pages
- Responsive mobile navigation and touch-friendly data tables
- Installable Progressive Web App with an offline shell
- Allowlisted Cloudflare Worker API cache with endpoint-specific freshness windows
- Shared and page-specific CSS bundles for faster route loading
- Resilient local data fallback when a live API is temporarily unavailable
- Keyboard navigation, reduced-motion support and accessible focus states
- Searchable page finder with Ctrl/Cmd K and native dialog focus management
- Saved compact-view and calm-motion preferences
- No paid API keys or framework subscription required

Data comes from the free [Jolpica F1](https://api.jolpi.ca/) and [OpenF1](https://openf1.org/) APIs. F1 Pulse is an independent fan project and is not affiliated with Formula 1.

## Explore tools and personalization

- **Race Replay** (`replay.html`): completed Grand Prix sessions from 2023 onward, play/pause, 1×/5×/20×/60× speed, time and lap scrubbing, driver following, synchronized comparison, close-battle detection, event filters, and before/after snapshots. Optional pit, race-control and provider exchange feeds load on demand. Retirement markers use final status and the end of the last recorded lap; they are estimates. Circuit markers interpolate lap progress along one recorded lap's coordinates; they are not recorded GPS for each car.
- **Championship Lab** (`championship.html`): race/sprint history replay, lead changes, point ceilings, conservative title guarantees, unique-position scenario editing, race countback, source ledgers, published-total reconciliation, and constructor contributions credited to the team represented at each event. Modern future scoring applies from 2025. Unresolved race countback remains a tie; qualifying fallback is explained in the glossary. Missing calendars disable title bounds. Unpublished past sessions remain in the conservative ceiling until their classification arrives.
- **Insights** (`insights.html`): deterministic race summaries, recoveries, podium runs, point changes since the previous visit, followed-driver weekend briefings, a seven-day digest, source links, chart explanations, searchable glossary and a transparent recent-form forecast with walk-forward evaluation against a previous-winner baseline. Forecasts are estimates without claimed confidence probabilities.
- **Preferences**: dark/light/system themes, driver/team/race following, a persistent comparison tray for up to four like items, saved filters with visible counts and reset controls, expandable driver cards, and a dashboard with 12 optional panels, saved order and full/half widths. The clean default shows six panels. Preferences stay on the current browser and work in memory if storage is blocked.

### Optional local AI

The Insights assistant answers supported factual questions without an AI service. For optional generated answers on your PC, install Python 3 and Ollama from their official sources, install a local model in Ollama, download `downloads/f1-pulse-local.py`, and run:

```sh
python f1-pulse-local.py
```

Leave the terminal open, then use **Open local assistant** in Insights. The companion opens `http://127.0.0.1:8788`; inspect the selected public briefing, choose an installed local model and submit a question. There is no automatic download, cloud model, paid key or call to a local port from the hosted website. The bridge uses Python's standard library, binds only to loopback, checks Host/Origin and a per-run token, and contacts only fixed Ollama endpoints at `127.0.0.1:11434`. Cloud-tagged/remote models are excluded. AI answers require source verification. The separate `npm run test:local` check requires Python 3 and uses a fake model; an installed model is required for real generation. The website build and default JavaScript tests require only Node.js.

## Deploy on Cloudflare

Install Node.js 22 or newer, then run:

```sh
npm ci
npx wrangler login
npm test
npm run deploy
```

The deployment publishes `f1-pulse` to your Cloudflare account and prints its `workers.dev` URL. No API secrets or database provisioning are required. The build copies only public website assets to `dist/`; source, tests, credentials and dependencies are excluded. `cloudflare/worker.mjs` serves the homepage and `/api/f1`, while the asset binding serves the other pages. The shared proxy keeps Jolpica/OpenF1 validation, request timeouts and endpoint freshness windows. Successful API responses are cached through Cloudflare's Cache API; errors are never cached.

`_headers` adds security headers and revalidates service-worker updates. `wrangler.jsonc` preserves existing `.html` routes and the custom 404 page. Add a custom domain from the Worker's Cloudflare dashboard if desired.

## Automatic GitHub deployments

The existing `f1-pulse` Worker is connected to [Arnav-Dugad/F1-Pulse](https://github.com/Arnav-Dugad/F1-Pulse) through Cloudflare Workers Builds. Pushes to `main` automatically run `npm test && npm run build`, then deploy with `npx wrangler deploy` from the repository root. Preview builds are enabled for other branches. Build authentication is managed by Cloudflare; no credentials belong in this repository.

Live site: [f1-pulse.arnavrival12.workers.dev](https://f1-pulse.arnavrival12.workers.dev).

## Existing Vercel deployment

1. Import this repository into Vercel.
2. Choose **Other** as the framework preset if Vercel asks.
3. Leave the build command empty and use `.` as the output directory.
4. Deploy.

The included `vercel.json` adds sensible security headers and ensures service-worker updates are never served stale. The `/api/f1` Edge Function is deployed automatically and requires no environment variables.

## Local preview

Run `npm run dev` and open `http://localhost:8787` to preview the site and Worker API together. A plain static server on another port also works, using the data providers directly. Offline/PWA behavior does not run from `file://` URLs.

See [PREMIUM-ROADMAP.md](PREMIUM-ROADMAP.md) for additional advanced feature, UI, data and animation ideas. Implemented capabilities are described above; remaining roadmap items are proposals.

## Data reliability

Fresh API responses are reused across page navigation, identical requests share one in-flight operation, and at most three provider requests run concurrently per page. OpenF1 starts are paced to three per second and thirty per minute; larger replay loads can wait for a rate slot. Driver and team form use a single paginated season-results request. Optional statistics and portraits cannot fail an otherwise usable driver dialog; a retry control appears when statistics are unavailable. Championship points include sprint totals, while race-only charts are labeled separately and finish rates exclude retirements.

The Worker keeps a dated, one-day backup of successful Jolpica responses for temporary throttling or outages. Saved responses are labeled in the UI and never cached as fresh. OpenF1 telemetry does not use stale fallbacks. Race telemetry matches the dated weekend and main race session, and polling avoids overlapping requests and pauses in hidden tabs.

Run `npm test` for static asset checks and regression coverage of cache behavior, pagination, partial outages, modal races, profile links, comparisons, telemetry matching, restricted browser storage, championship ties/scoring/history, replay timing, walk-forward forecasts, and the loopback companion HTTP boundary.

## Calendar resilience

Race pages share the current calendar request, load published results independently, and defer historical comparisons until requested. During provider throttling, `data/calendar-current.json` supplies a dated provider snapshot for the matching season. Race pages label it as a saved calendar. Refresh the snapshot with `node scripts/update-calendar.mjs`, then commit and push the updated JSON. Failed refreshes preserve the existing file; fallback calendars never replace a different season.

---

F1 Pulse. For fans, by fans.<br>
Arnav Dugad © 2026
