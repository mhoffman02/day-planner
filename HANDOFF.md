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
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST run and pass BEFORE initiating any handoff actions. The session handoff strictly executes:
  1. Pre-flight verification (`npm run lint && npm test`).
  2. Move completed items from [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) to [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) and purge them from [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md).
  3. Sync roadmap status in [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md).
  4. Move next active phase items from [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) into [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md).
  5. Update [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md).
  6. Direct commit of all documentation files and print [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md).
  7. Copy `HANDOFF.md` to clipboard, then console print `'Handoff copied.'`.
- **Strict Lint Gate**: Flat ESLint config ([`eslint.config.js`](file:///home/mike/projects/day-planner/eslint.config.js)) configured to cover `src/`, `gas-app/*.gs`, `tools/`, `server.js`, and `tests/`.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`56af556`](https://github.com/mhoffman02/day-planner/commit/56af556).
- **Phase 1 Complete**: Baseline established at `d294262`, documentation backported, test baseline verified (30/30 passing).
- **Phase 2 Complete**: Decommissioned GitHub Pages & Service Worker artifacts:
  - Pruned untracked `gh-pwa-shell/` and removed from [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Purged stale Service Worker, GIS OAuth, and GitHub Pages references across [`.agents/rules/`](file:///home/mike/projects/day-planner/.agents/rules/), [`.agents/commands/`](file:///home/mike/projects/day-planner/.agents/commands/), and [`.agents/skills/`](file:///home/mike/projects/day-planner/.agents/skills/).
  - Synchronized `.claude/` and `.kilo/` mirrors via [`tools/sync-agent-config.js`](file:///home/mike/projects/day-planner/tools/sync-agent-config.js).
  - Fixed unclosed event dialog tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
- **Linter & Code Cleanup Complete**:
  - Backported [`eslint.config.js`](file:///home/mike/projects/day-planner/eslint.config.js) tailored for pure GAS (no `sw.js`) and added `"lint": "eslint src gas-app/*.gs tools server.js"` to [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Fixed syntax error in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) by deduplicating [`GASBridge`](file:///home/mike/projects/day-planner/src/gasBridge.js#L12).
  - Fixed empty catch blocks and unused error variables in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Resolved unused variables in [`src/binderStore.js`](file:///home/mike/projects/day-planner/src/binderStore.js#L95-L101), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L30), and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs#L24).
  - Fixed unnecessary regex escape in [`server.js`](file:///home/mike/projects/day-planner/server.js#L36).
  - Cleaned unreachable catch in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L568-L578).
- **Handoff & Task Management Protocol Established**:
  - Created [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) and [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md).
  - Updated [`.agents/skills/handoff/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) and [`.agents/commands/handoff.md`](file:///home/mike/projects/day-planner/.agents/commands/handoff.md) to enforce pre-flight test/lint and sequential task sync.
- **Test & Lint Status**: 0 lint errors/warnings (`npm run lint`), 30/30 baseline tests passing across 7 suites (`npm test`).

---

### CONSTRAINTS & PREFERENCES

- **Direct Communication**: Address user as "Mike," lead with direct answers, no pleasantries or filler.
- **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
- **No PR Theater**: Direct commits on working branch ([`.agents/rules/no-pr-theater.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pr-theater.md)).
- **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly no pills ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
- **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
- **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.
- **Handoff Execution Order**:
  1. `npm run lint && npm test` FIRST.
  2. Move completed items from `TODO.md` to `TODO_HISTORY.md` and remove from `TODO.md`.
  3. Update `PLAN.md` roadmap.
  4. Move next planned items from `PLAN.md` to `TODO.md`.
  5. Update `HANDOFF.md`.
  6. Direct commit of all documentation files.
  7. Copy `HANDOFF.md` to clipboard, then console print `'Handoff copied.'`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.**:
   - Ensure [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html) include standalone display meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color`).
   - Add desktop window shortcut guide ("Install Day Planner" / "Open as window") in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
2. **Phase 4: Feature & Bugfix Backporting**:
   - Future Planning Matrix ([`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)).
   - Daily Tasks status dropdown, star toggles, per-column sorting, and Notes hover popover.
   - Note formatting toolbar, Topic/Summary headers, and Drive URL resolution.
   - Monthly Master Tasks with target date picker.
   - Server security (IIFE namespace wrapping, user lock Drive mutex, safe HTML escaping).
3. **Phase 5: Automated Verification & Live Smoke Test**:
   - Verify GAS templates build/render cleanly via local preview server ([`server.js`](file:///home/mike/projects/day-planner/server.js)).
   - Execute test suites against backported features.

---

### IMMEDIATE NEXT STEP

Phase 3: Configure "Close-to-Installable PWA" Affordances:
1. Verify and update meta tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
2. Add desktop standalone / "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
3. Run `npm run lint && npm test` to ensure zero regressions.
