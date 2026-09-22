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

- **Repository**: Branch `master` at commit [`96616df`](https://github.com/mhoffman02/day-planner/commit/96616df) (tagged `PWA-installable-22-Sep-2026`).
- **Specs & Plans**: Created [`REQUIREMENTS.md`](file:///home/mike/projects/day-planner/REQUIREMENTS.md), updated [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md), and generated implementation plan artifact.
- **Test Suite Status**: 312/312 tests passing across 40 suites (`npm test`).
- **Linter Status**: `npm run lint` passes with 0 errors.
- **Tooling Cleaned**: Removed overweight `tools/handoff.js`, deleted legacy `HANDOFF_PROMPT.md` and `CONTEXT.md`, and established [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) as the single source of truth.

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

1. **Phase 1: Create `pure-gas-main` branch at `d294262` and establish baseline**:
   - Check out [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) into new branch `pure-gas-main`.
   - Bring over [`REQUIREMENTS.md`](file:///home/mike/projects/day-planner/REQUIREMENTS.md), [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md), [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md), and updated `.agents/` config.
   - Verify clean test suite and local preview on baseline.
2. **Phase 2: Decommission GitHub Pages & Service Worker files**:
   - Delete `sw.js`, `.nojekyll`, and GIS OAuth client modules.
   - Restore root `index.html` as the local mock preview harness ([`server.js`](file:///home/mike/projects/day-planner/server.js)).
   - Remove stale SW scripts from [`package.json`](file:///home/mike/projects/day-planner/package.json).
3. **Phase 3 & 4: Systematic backport of core features & security hardening**:
   - Future Planning Matrix ([`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)).
   - Note formatting toolbar, Topic/Summary headers, and smart-paste Drive title resolution.
   - Task status dropdown, star toggles, and per-column sorting.
   - Master Tasks with "Move to Today" date picker.
   - GAS server IIFE namespace encapsulation and Drive folder creation user lock mutex.

---

### IMMEDIATE NEXT STEP

Execute Phase 1 of the implementation plan: check out baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) into the new branch `pure-gas-main`:
```bash
git checkout -b pure-gas-main d294262
```
