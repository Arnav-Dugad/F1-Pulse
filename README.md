# F1 Pulse

F1 Pulse is a premium, zero-subscription Formula 1 command centre built with plain HTML, CSS and JavaScript. It combines live championship data, race schedules, results, driver profiles, constructor analysis and OpenF1 telemetry in a fast, responsive interface.

## Highlights

- Live race countdowns and local session times
- Driver and constructor standings with comparison tools
- Complete race calendar, circuit intelligence and results
- Driver biographies and team showcase pages
- Responsive mobile navigation and touch-friendly data tables
- Installable Progressive Web App with an offline shell
- Resilient local data fallback when a live API is temporarily unavailable
- Keyboard navigation, reduced-motion support and accessible focus states
- No paid API keys, framework subscription or backend required

Data comes from the free [Jolpica F1](https://api.jolpi.ca/) and [OpenF1](https://openf1.org/) APIs. F1 Pulse is an independent fan project and is not affiliated with Formula 1.

## Deploy on Vercel

1. Import this repository into Vercel.
2. Choose **Other** as the framework preset if Vercel asks.
3. Leave the build command empty and use `.` as the output directory.
4. Deploy.

The included `vercel.json` adds sensible security headers and ensures service-worker updates are never served stale.

## Local preview

Serve the repository root with any static file server, then open `index.html`. A server is recommended because offline/PWA behavior does not run from `file://` URLs.

---

F1 Pulse. For fans, by fans.<br>
Arnav Dugad © 2026
