# Active Tasks (TODO)

## Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.

- [ ] Add standalone display meta tags to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html):
  - `<meta name="mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - `<meta name="apple-mobile-web-app-title" content="Day Planner">`
  - `<meta name="theme-color" content="#2d6a5a">`
  - High-resolution apple-touch-icon and favicon references.
- [ ] Add desktop window shortcut guide ("Install Day Planner" / "Open as window") in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
- [ ] Run `npm run lint && npm test` to verify zero regressions.
