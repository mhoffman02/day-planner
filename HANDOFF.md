# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA (with service worker `sw.js` and client-side Google Identity Services OAuth) to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026). Then, systematically backport working features and bugfixes from later commits that only require GAS-hosted pages and scripts, delivering a fast, online-only digital day planner that runs seamlessly across both personal HOME and locked-down federal WORK PCs.

---

### KEY DECISIONS

- **Baseline Commit Selection**: Commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026) is the confirmed baseline — the exact last commit before `gh-pages-pwa`, `sw.js`, and PWA shells were introduced.
- **Branching Strategy**: Branch `pure-gas-main` rooted at `d294262`. The original `master` branch is preserved and tagged with `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero Service Worker**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js` service worker, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using native first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Online-Only Execution**: The app runs online; no complex offline outbox syncing is required in the sandboxed GAS iframe.
- **Google Native Auth Over Custom Gates**: No custom application-level authorization gates (such as `validateUserAccess()` or domain/email whitelists). A pure GAS app deployed with `executeAs: USER_ACCESSING` runs in the caller's native Google Workspace security sandbox, isolating Drive files and Google services under `drive.file` scope automatically.
- **Close-to-Installable PWA in Pure GAS**: Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)), mobile meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `theme-color`), and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
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

- **Repository**: Branch `pure-gas-main` at commit [`beb6ee8`](https://github.com/mhoffman02/day-planner/commit/beb6ee8).
- **Phase 1 Complete**: Baseline established at `d294262`, documentation backported, test baseline verified (30/30 passing).
- **Phase 2 Complete**: Decommissioned GitHub Pages & Service Worker artifacts:
  - Pruned untracked `gh-pwa-shell/` and removed from [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Purged stale Service Worker, GIS OAuth, and GitHub Pages references across [`.agents/rules/`](file:///home/mike/projects/day-planner/.agents/rules/), [`.agents/commands/`](file:///home/mike/projects/day-planner/.agents/commands/), and [`.agents/skills/`](file:///home/mike/projects/day-planner/.agents/skills/).
  - Synchronized `.claude/` and `.kilo/` mirrors via [`tools/sync-agent-config.js`](file:///home/mike/projects/day-planner/tools/sync-agent-config.js).
  - Fixed unclosed event dialog tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
- **Phase 3 Complete**: "Close-to-Installable PWA" Affordances in Pure G.A.S.:
  - Added standalone display meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `theme-color`) to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), root [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Restored Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)) and high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)).
  - Added Section 5 desktop window shortcut guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) and mirrored in [`index.html`](file:///home/mike/projects/day-planner/index.html).
- **Phase 4 Task 1 Complete**: Future Planning Matrix:
  - Backported [`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js) and [`tests/futureMatrixEngine.test.js`](file:///home/mike/projects/day-planner/tests/futureMatrixEngine.test.js) (25 unit tests).
  - Implemented Drive-backed persistence in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) (`future-matrix-<YYYY>.json` in root folder with 5-min caching).
  - Backported interactive month cards with Franklin status cycling, add/delete, transfer to date, and push-forward in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), mirrored in root [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Added Future Matrix mock dataset and RPC methods to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and 6 new bridge tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
- **Phase 4 Task 2 Complete**: Daily Tasks Enhancements:
  - Backported status dropdown menu (`•`, `○`, `✓`, `→`, `X`, `D/✓`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Backported star toggle and per-column sorting (Priority, Status, Title, Category) in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), and [`index.html`](file:///home/mike/projects/day-planner/index.html) with 23 passing tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js).
  - Added `updateDailyTask` with star, status, notes, and sourceMasterId sync to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) with 13 passing tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
  - Backported Notes hover popover for tasks with descriptions (`hasNotes(task)`).
  - Added CSS classes for sortable headers, star toggle, status menu, notes popover, and canceled task styles to both [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) including dark mode.
- **Test & Lint Status**: 0 lint errors/warnings (`npm run lint`), 80/80 unit tests passing across 11 suites (`npm test`).

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

1. **Modular Note Cards & Rich Formatting**:
   - Split note headers into Topic + Summary fields with rich formatting toolbar in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
   - External link syntax (`[[link:URL]]text[[/link]]`) and smart-paste Drive URL title resolution.
2. **Monthly Master Tasks**:
   - Google Tasks API or Drive JSON archive persistence.
   - "Move to Today" action with target date picker.
3. **Server Security & Robustness**:
   - IIFE wrapping for [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) with explicit exports.
   - Deduplicated Drive folder creation with `LockService.getUserLock()`.
   - Folder ownership validation for auto-adopted folders.
   - Safe HTML escaping for server-returned messages.

---

### IMMEDIATE NEXT STEP

Begin Phase 4 Task 3: Modular Note Cards & Rich Formatting:
1. Audit reference implementation in `master` for note card Topic + Summary splitting, category tag filtering, and rich text formatting toolbar.
2. Backport rich formatting controls and link syntax parsing to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
3. Mirror changes into root [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and verify with `npm run lint && npm test`.
