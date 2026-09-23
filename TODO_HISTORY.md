# Task History (TODO_HISTORY)

## 2026-09-23 — Runtime Permissions, Drive moveTo Fix & Server Run Log Engine

- [x] **OAuth Scope Minimal Permission Resolution**:
  - Identified `DriveApp.getFolderById` failure throwing `Specified permissions are not sufficient (drive.readonly || drive)`.
  - Added minimal `"https://www.googleapis.com/auth/drive.readonly"` scope to [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json) without requesting broad `drive` (commit [`abcdf03`](file:///home/mike/projects/day-planner)).
- [x] **Drive `moveTo` Least-Privilege Elimination**:
  - Eliminated `DocumentApp.create()` + `docFile.moveTo(targetFolder)` pattern which required Google's broad `https://www.googleapis.com/auth/drive` scope.
  - Enabled `Drive` Advanced Service (`drive: v2`) in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json).
  - Created [`getOrCreateMonthlyNotesDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L607) helper in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) using `Drive.Files.insert({ title, mimeType, parents: [{id: targetFolder.getId()}] })` to create monthly docs directly in the destination folder under `drive.file` scope.
  - Wrapped fallback `moveTo` in `try/catch` so an unhandled exception cannot crash `syncWorkspaceChanges()` (commit [`ea39b71`](file:///home/mike/projects/day-planner)).
- [x] **In-App Server Execution Log Ring Buffer & Report**:
  - Implemented persistent 25-entry ring buffer in `UserProperties` (`RECENT_SERVER_LOGS`) via `recordServerLog(level, context, message, stack)`.
  - Upgraded [`logError()`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L93) and added [`logWarn()`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L107) to record structured events and stack traces.
  - Rendered **Recent Server Execution Logs** table on `/self-test` diagnostic page with level badges (strictly 4px radius per `no-pills.md`), timestamps, contexts, and expandable stack traces.
  - Added raw JSON endpoint `?view=logs&format=json` and Clear Logs action `?view=self-test&clear_logs=1` (commit [`ecf9850`](file:///home/mike/projects/day-planner)).
- [x] **Permanent Google Doc Run-Log Engine**:
  - Evaluated Google Sheets vs. Google Docs for run logs against least privilege. Chose Google Docs to leverage existing `documents` and `drive.file` scopes with zero new OAuth scopes required.
  - Built [`appendRunLogToDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74) and [`getRunLogDocUrl`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L173), writing timestamped Consolas monospace log entries to `Day Planner - Run Log` inside the Day Planner Drive folder.
  - Caches doc ID in `UserProperties` (`DAY_PLANNER_RUN_LOG_DOC_ID`) for single-roundtrip appends.
  - Added **📄 Open Google Doc Run Log** button on self-test diagnostic report (commit [`32084b9`](file:///home/mike/projects/day-planner)).
- [x] **Production Release Deployment ID Pinned**:
  - Pinned target production deployment ID `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) and [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) for all future `/exec` releases (commit [`1d2eb50`](file:///home/mike/projects/day-planner)).

## 2026-09-23 — Phase 5 Verification, A11y & Clasp Deployment Gate

- [x] **Local Smoke Testing & Safe Chars Check**:
  - Verified Apps Script template scriptlets across [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) with 0 single-line `//` comment truncation hazards.
  - Built automated headless Chrome CDP smoke test suite in [`tools/smoke-test.js`](file:///home/mike/projects/day-planner/tools/smoke-test.js) and configured `npm run smoke` in [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Verified all 5 active views (Daily, Month Calendar, Master Tasks, Monthly Index, Future Planning), Universal Search modal (`Ctrl+K`), and theme toggle execute with zero console/runtime exceptions (commit [`2a43cc9`](https://github.com/mhoffman02/day-planner/commit/2a43cc9)).
- [x] **WCAG Contrast & Responsive Viewport Verification**:
  - Built automated accessibility and responsive audit suite in [`tools/audit-wcag-responsive.js`](file:///home/mike/projects/day-planner/tools/audit-wcag-responsive.js) and configured `npm run audit:a11y` in [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Verified 100% of top-bar and panel headers pass WCAG 2.1 AA/AAA contrast ratios across both light parchment (`#fcfbfa`) and dark mode (`#0c1813` / `#142820`) palettes.
  - Verified zero horizontal overflow across all 5 views at 1440px, 1200px, 992px, and 768px viewports (commit [`3e9076a`](https://github.com/mhoffman02/day-planner/commit/3e9076a)).
- [x] **Phase 5 Clasp Development Deployment Gate**:
  - Pushed all 8 project files (`About.html`, `appsscript.json`, `Code.gs`, `Index.html`, `Script.html`, `SetupFolder.html`, `Styles.html`, `UnitTests.gs`) to Google Apps Script dev deployment `@HEAD` via `clasp push`.
  - Verified self-test diagnostic endpoint routing (`/dev?view=self-test`) and manual execution readiness in Apps Script IDE.

## 2026-09-23 — Header Overlap Fix & Kilo Configuration

- [x] **Navbar Text Overlap on Month View Resolved**:
  - Restored header flex pinning and min-width reservations from git history (`dc5ea69`, `34285fd`, `af66d01`, `f14e34b`, `77f1d21`) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Pinned `.header-left` and `.header-actions-compact` to `flex: 0 0 auto; min-width: 0;` (with `overflow: hidden;` on `.header-left`), re-enabling `flex: 1 1 0` centering only at `@media (min-width: 1400px)`.
  - Restored `min-width: 280px;` on `.date-nav-compact` so undated views (Master Tasks) do not cause horizontal tab jitter.
  - Sized `.today-jump-btn` to `min-width: calc(10ch + 12px); text-align: center;` and `.date-text-display` to `min-width: calc(14ch + 4px); overflow: hidden; text-overflow: ellipsis;`.
  - Replaced dynamic `x-text="currentMonthName"` on Month view `.today-jump-btn` with static `This Month` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html) to eliminate duplicate "September" adjacent to "September 2026".
  - Added responsive media queries for ≤1200px (action labels hidden) and ≤992px (brand title text hidden, icon-only tabs).
  - Verified 0 lint errors and 88/88 unit tests passing (commit [`98f2086`](https://github.com/mhoffman02/day-planner/commit/98f2086)).
- [x] **Kilo Permissions Configuration**:
  - Configured Kilo to always allow commands starting with `git show` (`git show*`, `git show *`, `git show`).
  - Added project configs [`kilo.jsonc`](file:///home/mike/projects/day-planner/kilo.jsonc) and [`.kilo/kilo.jsonc`](file:///home/mike/projects/day-planner/.kilo/kilo.jsonc) in [`ce56ea4`](https://github.com/mhoffman02/day-planner/commit/ce56ea4).
  - Updated global configs in Linux/WSL ([`~/.config/kilo/kilo.jsonc`](file:///home/mike/.config/kilo/kilo.jsonc)) and Windows ([`/mnt/c/Users/mhoff/.config/kilo/kilo.jsonc`](file:///mnt/c/Users/mhoff/.config/kilo/kilo.jsonc)).
  - Synced sister projects [`maximo-uat/.kilo/kilo.jsonc`](file:///home/mike/projects/maximo-uat/.kilo/kilo.jsonc) and [`STT-TTS/kilo.json`](file:///home/mike/projects/STT-TTS/kilo.json).

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
- [x] **Modular Note Cards & Rich Formatting**:
  - Split note cards into Topic + Summary fields with category filtering.
  - Added rich formatting toolbar (bold, italic, underline, strike, text color swatches, bullet/ordered lists).
  - Added smart-paste Drive URL title resolution (`resolveDriveLinkTitle`) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) with 2 new bridge unit tests.
  - Added link syntax parsing (`[[link:URL]]text[[/link]]`) and sanitized HTML preview rendering in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Added dark mode and theme styling in [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Verified 0 lint errors, 81/81 unit tests passing (commit [`c9c0b71`](https://github.com/mhoffman02/day-planner/commit/c9c0b71)).
- [x] **Monthly Master Tasks (Undated Backlog)**:
  - Backported undated master tasks list (`getMasterTasks`) querying Google Tasks API for undated items (`!t.due`), decoding metadata for `category`, `movedTo`, and `movedTaskId` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Added `addMasterTask` (with `master: true` metadata) and `markMasterTaskMoved` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) with 3 new unit tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
  - Updated `addDailyTask` to support `sourceMasterId` linkage and `transferMasterTask` to accept task objects.
  - Backported Master Tasks Backlog UI with add-bar (Title + Category), sortable table, inline "Moved to <date>" note, and target date picker with "Move" action in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Added controller methods (`loadMasterTasks`, `addMasterTask`, `formatMovedDate`, `moveMasterTaskToDate`, `jumpToToday`) in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Verified 0 lint errors, 84/84 unit tests passing (commit [`516d023`](https://github.com/mhoffman02/day-planner/commit/516d023)).
- [x] **Server Security & Robustness**:
  - Wrapped [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) in individual IIFEs (`(function(global) { ... })(this);`) with explicit top-level export surface assignments per `.agents/rules/gas-namespace-iife.md`.
  - Implemented `LockService.getUserLock()` concurrency locking across `getValidatedRootFolder` and `getFolderByNameOrCreate` to prevent race conditions and duplicate folder creation during concurrent requests.
  - Added folder ownership validation (`owner.getEmail() === currentUser` and `owners(me)`) in `getValidatedRootFolder` auto-search and `validateAndSaveFolderUrl` to prevent auto-adopting or connecting shared folders as private notes stores.
  - Added safe HTML escaping (`escapeHtml`) for server-returned folder names and error messages in [`gas-app/SetupFolder.html`](file:///home/mike/projects/day-planner/gas-app/SetupFolder.html) and `escapeHtml_` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Removed duplicate `testDoGetInIDE` function from [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
- [x] **Universal Search**:
  - Enhanced [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js) with local date extraction without `.toISOString()` UTC shift bugs, store array/object normalization, task notes matching, and exported [`flattenSearchResults()`](file:///home/mike/projects/day-planner/src/searchEngine.js#L50).
  - Wired `Ctrl+K` / `Cmd+K` keyboard shortcuts, input autofocus, arrow navigation (`↑`/`↓`), `Enter` jump, `Esc` dismissal, and [`selectSearchResult()`](file:///home/mike/projects/day-planner/src/app.js#L1453) in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Implemented accessible listbox results rendering with type badges (Calendar, Task, Note, Index), date displays, and snippet context in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Styled search results, selection outlines, and dark mode themes in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), flattening all legacy 50% border-radii to 4px per [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md).
  - Expanded unit test coverage in [`tests/searchEngine.test.js`](file:///home/mike/projects/day-planner/tests/searchEngine.test.js); verified 0 lint errors, 88/88 tests passing across 11 suites (commit [`8335a4d`](https://github.com/mhoffman02/day-planner/commit/8335a4d)).
- [x] **Master Task List & Status Column Fixes**:
  - Renamed view title from "Master Task List (Backlog)" to "Master Task List" in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Simplified moved status text from "Moved to Sep 22" to date-only `Sep 22`, letting the `→` arrow glyph convey the moved state.
  - Widened status column to 200px (`.th-w-200`) and wrapped glyph and date in `.master-task-status-wrap` with `inline-flex; align-items: center; gap: 8px; white-space: nowrap;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Fixed Pico CSS `input:not(...)` specificity bug where the date picker expanded to 100% width and pushed the `[ Move ]` button off-screen (commits [`95c891a`](https://github.com/mhoffman02/day-planner/commit/95c891a), [`049f6d2`](https://github.com/mhoffman02/day-planner/commit/049f6d2)).
- [x] **Future Planning Matrix Enhancements**:
  - Renamed view title to "Future Planning" in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Replaced single-click cycling status button with Franklin status popup menu matching Today view task controls, listing all 6 Franklin states (`•`, `○`, `✓`, `→`, `X`, `D/✓`).
  - Implemented responsive two-tier layout for future month cards, giving tasks horizontal breathing room.
- [x] **Centered Navbar & Flat Underline Navigation Tabs**:
  - Centered navigation items via balanced flex geometry: `.header-left` (`flex: 1 1 0; min-width: 0;`), `.header-actions-compact` (`flex: 1 1 0; min-width: 0; justify-content: flex-end;`), and `nav.view-segmented-control` (`flex: 0 0 auto; margin: 0 auto;`).
  - Replaced obsolete pill/capsule styling on navigation tabs with full-height (48px) flat tabs and `border-bottom: 3px solid #58bfa2` for the active tab in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Enforced [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) across all top-bar compact action buttons (`.today-jump-btn`, `.search-trigger-compact`, `.sync-btn-compact`, `.security-badge`), setting `border-radius: 4px` (commit [`53962c5`](https://github.com/mhoffman02/day-planner/commit/53962c5)).


