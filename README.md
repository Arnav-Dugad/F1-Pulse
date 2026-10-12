# F1 Pulse

F1 Pulse is a premium, zero-subscription Formula 1 companion built with plain HTML, CSS and JavaScript. It combines live championship data, race schedules, results, driver profiles, constructor analysis and OpenF1 telemetry in a fast, responsive interface.

## Highlights

- Live race countdowns and local session times
- Driver and constructor standings with comparison tools
- Complete race calendar, circuit intelligence and results
- One-click `.ics` exports for a race weekend or the full season
- Automatic session scheduling in each visitor's local time zone
- Live position, gap, tyre, weather, telemetry and race-control visualizations
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

See [PREMIUM-ROADMAP.md](PREMIUM-ROADMAP.md) for 60 advanced feature, UI, data and animation ideas. These are proposed future additions, separate from the features implemented in this repository.

---

F1 Pulse. For fans, by fans.<br>
Arnav Dugad © 2026
