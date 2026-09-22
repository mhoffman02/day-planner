# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA (with service worker `sw.js` and client-side Google Identity Services OAuth) to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026). Then, systematically backport working features and bugfixes from later commits that only require GAS-hosted pages and scripts, delivering a fast, online-only digital day planner that runs seamlessly across both personal HOME and locked-down federal WORK PCs.

---

### KEY DECISIONS

- **Baseline Commit Selection**: Commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026) is the confirmed baseline — the exact last commit before `gh-pages-pwa`, `sw.js`, and PWA shells were introduced.
- **Branching Strategy**: Create a new branch `pure-gas-main` rooted at `d294262`. The original `master` branch is preserved and tagged with `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero Service Worker**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js` service worker, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using native first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Online-Only Execution**: The app runs online; no complex offline outbox syncing is required in the sandboxed GAS iframe.
- **Close-to-Installable PWA in Pure GAS**: Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), mobile meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-touch-icon`, `theme-color`), and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
- **Lightweight Handoff Model**: Adopted the clean, prompt-driven `trip-planner` single-doc handoff model ([`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md)) across the repository, eliminating tool bloat from `tools/handoff.js`.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`6810c97`](https://github.com/mhoffman02/day-planner/commit/6810c97).
- **Phase 1 Complete**: Baseline established at `d294262`, documentation backported, test baseline verified (30/30 passing).
- **Phase 2 Complete**: Decommissioned GitHub Pages & Service Worker artifacts:
  - Pruned untracked `gh-pwa-shell/` and removed from [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Purged stale Service Worker, GIS OAuth, and GitHub Pages references across [`.agents/rules/`](file:///home/mike/projects/day-planner/.agents/rules/), [`.agents/commands/`](file:///home/mike/projects/day-planner/.agents/commands/), and [`.agents/skills/`](file:///home/mike/projects/day-planner/.agents/skills/).
  - Synchronized `.claude/` and `.kilo/` mirrors via [`tools/sync-agent-config.js`](file:///home/mike/projects/day-planner/tools/sync-agent-config.js).
  - Fixed unclosed event dialog tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
- **Test Suite Status**: 30/30 baseline tests passing across 7 suites (`npm test`).
- **User Instructions**: Ingested interaction preferences into [`CLAUDE.md`](file:///home/mike/projects/day-planner/CLAUDE.md): salutation `"🔋Mike:"` and mandatory `"handoff"` skill run at end of each session.

---

### CONSTRAINTS & PREFERENCES

- **Direct Communication**: Address user as "Mike," lead with direct answers, no pleasantries or filler.
- **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
- **No PR Theater**: Direct commits on working branch ([`.agents/rules/no-pr-theater.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pr-theater.md)).
- **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly no pills ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
- **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
- **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **do this first: run linter and fix code**:
   - Run linter across codebase and resolve any style/syntax errors.
2. **Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.**:
   - Ensure [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) includes standalone display meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color`).
   - Add desktop window shortcut guide ("Install Day Planner" / "Open as window") in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
3. **Phase 4: Feature & Bugfix Backporting**:
   - Future Planning Matrix ([`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)).
   - Daily Tasks status dropdown, star toggles, per-column sorting, and Notes hover popover.
   - Note formatting toolbar, Topic/Summary headers, and Drive URL resolution.
   - Monthly Master Tasks with target date picker.
   - Server security (IIFE namespace wrapping, user lock Drive mutex, safe HTML escaping).

---

### IMMEDIATE NEXT STEP

do this first: run linter and fix code
