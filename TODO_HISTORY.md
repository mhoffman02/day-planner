# Task History (TODO_HISTORY)

## 2026-09-22 — Rollback to Pure GAS & Code Cleanup

- [x] **Phase 1: Baseline Establishment**:
  - Baseline established at commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`.
  - Preserved `master` with tag `PWA-installable-22-Sep-2026`.
  - Backported documentation and verified 30/30 baseline tests passing.
- [x] **Phase 2: Decommission GitHub Pages & Service Worker Artifacts**:
  - Pruned untracked `gh-pwa-shell/` and removed from [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Purged stale Service Worker (`sw.js`), GIS OAuth, and GitHub Pages references across `.agents/`, `.claude/`, and `.kilo/`.
  - Synchronized `.claude/` and `.kilo/` mirrors via [`tools/sync-agent-config.js`](file:///home/mike/projects/day-planner/tools/sync-agent-config.js).
  - Fixed unclosed event dialog tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
- [x] **Lint Configuration & Code Cleanup**:
  - Backported [`eslint.config.js`](file:///home/mike/projects/day-planner/eslint.config.js) tailored for pure GAS (no `sw.js`).
  - Added `"lint": "eslint src gas-app/*.gs tools server.js"` and devDependencies to [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Fixed duplicate `GASBridge` declaration in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Fixed empty catch blocks and unused variables in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), [`src/binderStore.js`](file:///home/mike/projects/day-planner/src/binderStore.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs), and [`server.js`](file:///home/mike/projects/day-planner/server.js).
  - Verified 0 lint errors, 0 warnings, and 30/30 unit tests passing (commit [`61b7792`](https://github.com/mhoffman02/day-planner/commit/61b7792)).
- [x] **Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.**:
  - Added standalone display meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `theme-color`) to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), root [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Restored Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)) and high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)).
  - Added desktop window shortcut guide ("Install Day Planner" / "Open as window") in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) and synchronized to [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Verified local dev preview via [`server.js`](file:///home/mike/projects/day-planner/server.js) (status 200) and verified 0 lint errors, 30/30 unit tests passing (commit [`494592d`](https://github.com/mhoffman02/day-planner/commit/494592d)).
- [x] **Future Planning Matrix**:
  - Backported [`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js) and [`tests/futureMatrixEngine.test.js`](file:///home/mike/projects/day-planner/tests/futureMatrixEngine.test.js) (25 unit tests).
  - Added Drive-backed persistence in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) (`getFutureMatrix`, `addFutureItem`, `updateFutureItemStatus`, `transferFutureItem`, `pushFutureItemToNextMonth`, `deleteFutureItem`) persisting to `future-matrix-<YYYY>.json` with 5-min caching.
  - Added Future Matrix mock dataset and RPC methods to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) (6 new bridge tests).
  - Backported interactive 12-month cards with add-bar, Franklin status cycling (`•` → `✓` → `→` → `X` → `G/✓`), transfer-to-date picker, push-forward, and delete to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), mirrored in [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Verified 0 lint errors, 61/61 unit tests passing (commit [`82cf35f`](https://github.com/mhoffman02/day-planner/commit/82cf35f)).
- [x] **Daily Tasks Enhancements**:
  - Backported status dropdown menu with In-Progress (`•`), Forwarded (`→`), Delegated (`D/✓`), Canceled (`X`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Backported star toggle and per-column sorting (Priority, Status, Title, Category) in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Added unit tests for column sorting, star sorting, and status validation in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) (23 passing tests).
  - Added `updateDailyTask` with star, status, notes, and sourceMasterId sync to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) with unit tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) (13 passing tests).
  - Backported Notes hover popover for tasks with descriptions (`hasNotes(task)`).
  - Added CSS classes for sortable headers, star toggle, status menu, notes popover, and canceled task styles to both [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) including dark mode.
  - Verified 0 lint errors, 80/80 unit tests passing (commit [`beb6ee8`](https://github.com/mhoffman02/day-planner/commit/beb6ee8)).
