# Plan History: Google Digital Day Planner

Archived completed phases from [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md). Refreshed each session by the [`handoff`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) skill — completed phases move here so `PLAN.md` stays a lean, forward-looking planning doc rather than a growing changelog. This file is append-only history; do not plan against it.

---

### Phase 23: Task Inline Editing & Direct AI Gateway Integration
*Goal: deliver click-to-edit task descriptions, multi-model REST AI gateway, settings modal with connection testing and active model selection, and in-binder AI Assist on note cards with 1-click task extraction to Today.*
- [x] Today page Tasks panel: click-to-edit task Description ([`abdf26a`](file:///home/mike/projects/day-planner/.git/commit/abdf26a)).
- [x] Unified Multi-Model Gateway Architecture: Single REST gateway in [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L3130). Direct Gemini API at HOME, USAi API at WORK. `ScriptProperties` and `UserProperties` isolation ([`83aecbf`](file:///home/mike/projects/day-planner/.git/commit/83aecbf), [`486cd8a`](file:///home/mike/projects/day-planner/.git/commit/486cd8a)).
- [x] AI Gateway Settings Modal & Model Selection: Header compact trigger, settings dialog modal with endpoint status, active model selection dropdown, and live connection testing with latency feedback ([`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5)).
- [x] In-Binder AI Assist Modal: 4 instant touchpoints (Summarize, Extract Tasks to Today, Polish Tone, Custom Prompt) with 1-click batch task insertion into Today ([`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5)). Server-side proxying bypasses federal client proxy blocks.
- [x] Task Notes Boundary Escape: Fixed viewport coordinates (`notesPopoverPos`) ensuring popover escapes table clipping without right-edge truncation ([`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5)).
- [x] Notes Header Lexicon Button: Added `auto_stories` button in notes header and unified icon vocabulary ([`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5)).
- [x] Dark Mode CSS Syntax Repair: Closed unclosed brace in `.modal-detail-intro` restoring 700 lines of Dark Forest theme overrides ([`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f)).

### Phase 22: Advanced Notes & Research Suite
*Goal: deliver note version history, in-binder dictionary/thesaurus lookup, multi-year deep archive search across Drive monthly docs, and architectural integration with Sheets AI microservice.*
- [x] Note Version History Time Machine: IndexedDB `v3` rolling snapshots (`noteRevisions` store, max 30) with 2-pane preview and 1-click restore syncing back to Google Docs ([`7ae84ef`](file:///home/mike/projects/day-planner/.git/commit/7ae84ef)).
- [x] In-Binder Dictionary / Synonym / Antonym Popover: Free Dictionary & Datamuse integration with GAS backend fallback proxy (`fetchLexicon`), caret-aware `Alt+D` trigger, and 1-click text replacement directly into active note card line ([`4fd2a54`](file:///home/mike/projects/day-planner/.git/commit/4fd2a54)).
- [x] Deep Archive Search via Drive fullText index: Background Drive search RPC querying multi-year `Day Planner Notes - YYYY-MM` Google Docs integrated into `Ctrl + K` ([`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2730), commit [`984d1e1`](file:///home/mike/projects/day-planner/.git/commit/984d1e1)).
- [x] AI Microservice Integration (WIP): Google Sheets `=AI(...)` formula processing via `ai-microservice` repo, Day Planner client module & GAS proxy connector ([`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2930), commit [`c01d470`](file:///home/mike/projects/day-planner/.git/commit/c01d470)), and least-privilege `currentonly` manifest pushed to HOME bound script.

### Phase 21: Full-tab IndexedDB cache port
*Goal: extend the Daily-tab-only cache (`src/dailyDataCache.js`, shipped earlier the same session) to Master Tasks, Monthly Calendar, and Future Planning — hydrate-then-revalidate + write-through-on-edit on every tab, per a user request to match a fuller multi-store design they remembered from a never-merged `master`-branch lineage (see `TODO_HISTORY.md`'s 2026-09-28 architect-review entry for the branch-divergence root cause).*
- [x] Master Tasks tab: `applyMasterTasks`/`syncMasterTasksCacheFromLiveState`/`loadMasterTasks` (hydrate from IDB, revalidate, edit-seq guard); write-through wired into `addMasterTask`/`deleteMasterTask`/`toggleTaskStar`(isMaster branch)/`setTaskStatus`(unconditional, both caches)/`moveMasterTaskToDate`.
- [x] Future Planning tab: `applyFutureMatrix`/`syncFutureMatrixCacheFromLiveState`/`loadFutureMatrix`, keyed per-year with a stale-year guard; write-through wired into all 6 mutation sites (add/toggle/select-status/transfer/push-forward/delete).
- [x] Monthly Calendar tab: new `loadMonthlyCalendarData()` (paint instantly from `getCachedRange`, then revalidate live via `getDailyDataRange` for the full visible month). Fixed a pre-existing, previously-undiscovered bug in the process — `buildMonthlyGrid()` read `this.calendarEvents` (the single currently-open day's events) instead of the whole month, so the grid only ever showed one day's real events; live-verified post-fix (12 distinct days showing real events across a test month, vs. 1 before).
- [x] Design decision: **no separate `monthOverview` IndexedDB store**, despite `TODO.md`'s literal wording — Monthly Calendar reuses the existing per-date `dailyData` store via `getCachedRange`/`getDailyDataRange`, since its data is just every day in the visible month; a dedicated store would just duplicate those rows.
- [x] Design decision: **kept the IndexedDB database name `day-planner-cache`** (bumped `DB_VERSION` to 2, adding `masterTasks`/`futureMatrix` stores) rather than renaming to `day-planner-db` as `TODO.md` literally said — avoids a version-downgrade/schema-collision risk against the stale leftover `day-planner-db` left over in browsers from the old, abandoned `master`-branch design.
- [x] Ported the old design's `onblocked` handling and retry-on-error (`dbPromise = null` on failure/blocked) into `openDb()`, mirrored into `gas-app/Script.html`'s `dpCacheOpenDb()`.
- [x] Explicitly skipped the offline mutation outbox (WORK network access still beats offline as a priority, per the 2026-09-09 gas-removal-migration reversal — unchanged).
- [x] Bonus fix found while touching `getMasterTasks`: same unpaginated-`Tasks.Tasks.list`-with-`maxResults:100` bug class as the earlier `getDailyData` fix — added the identical pageToken-loop pattern.
- [x] All changes mirrored into `gas-app/Script.html` (hand-duplicated from `src/app.js`/`src/dailyDataCache.js`). `npm test`/`npm run lint` clean (182 tests). Live-verified via CDP on HOME @274 (build 325): Master Tasks/Future Matrix load cleanly, Monthly Calendar grid shows real events across the month, no console errors. WORK version 111 pushed, pending `michael.hoffman@gsa.gov` repoint.

### Phase 20: Future Planning Items as Real Tasks
*Goal: replace the custom `future-matrix-YYYY.json` Drive-file bucket storage with real Google Tasks (dueDate = last day of the target month when no specific day is given), matching how Master/Daily Tasks are already stored. Triggered by a 2026-09-28 live bug where `DriveApp.Folder.createFile()`/`File.setContent()` demanded the broad `drive` scope even for the app's own folder.*
- [x] Reworked `addFutureItem`/`updateFutureItemStatus`/`transferFutureItem`/`pushFutureItemToNextMonth`/`deleteFutureItem` in `gas-app/Code.gs` to operate on Tasks (dueDate-keyed, flagged `[Future]` in notes) instead of the JSON bucket; `saveFutureMatrixData_`/Drive read-write removed entirely.
- [x] `getFutureMatrixData_`/`getFutureMatrix` now query Tasks (`dueMin`/`dueMax` scoped to the year) and group by `due`'s month.
- [x] No-day items default `dueDate` to the last day of the target month (`lastDayOfMonthStr_`); an optional `day` param on `addFutureItem` allows day-specific items too.
- [x] Client side (`src/futureMatrixEngine.js`, `src/app.js`, `gas-app/Script.html`, `Index.html`) needed zero changes — the RPC contract and item shape were preserved, and the local-dev mock in `gasBridge.js` was already an independent in-memory store.
- [x] Migration decision (user, 2026-09-28): start fresh, no migration — existing `future-matrix-*.json` files are simply orphaned/ignored in Drive.
- [x] Fixed a latent bug found while touching `encodeTaskMeta`/`DP_HUMAN_TAGS_RE`: bracket-only tags (`[Master]`, `[Starred]`, new `[Future]`) weren't stripped by the tag-removal regex (it required a trailing `:...`), so repeated edits would have accumulated duplicate tags in a task's notes.
- [x] Live-verified on HOME @262 via CDP probe: no-day item landed on 2026-09-30, status cycling and delete round-tripped against real Google Tasks. WORK version 99 repointed by `michael.hoffman@gsa.gov` and user-confirmed: Future items correctly surface in Today/Master Tasks views.
- [x] User requested a code review before sign-off given the rewrite's size. `/code-review high` on the rewrite commit caught a real bug — `getFutureMatrixData_` requested `maxResults: 200`, above the Tasks API's actual 100/page cap, with no pagination — fixed via a `nextPageToken` loop; also clamped the unused `addFutureItem` `day` param to a valid day-of-month. Deployed HOME @263 (build 307), re-verified live via CDP. WORK version 101 pushed, pending a fresh repoint.

### Phase 19: `drive.readonly` Scope Narrowing
*Goal: decide whether `drive.readonly` in `gas-app/appsscript.json` is worth narrowing further.*
- [x] Audited every `DriveApp`/`Drive` call site in `Code.gs`. Two call sites genuinely need read access beyond `drive.file`: `validateAndSaveFolderUrl` (user-typed folder ID at setup) and `resolveDriveFileTitle` (smart-paste title lookup on arbitrary pasted Docs/Sheets/Slides/Drive links). Everything else operates on the app's own "Day Planner" folder and is already `drive.file`-covered.
- [x] Decision: **keep `drive.readonly` as-is.** Narrowing to a Google Picker-based consent flow would genuinely shrink the OAuth surface, but costs a real UX regression (no more free-paste-a-link-and-get-the-title for smart-paste) and nontrivial new code (Picker JS + a new `ScriptApp.getOAuthToken()` RPC endpoint) for a scope that's already read-only/title-only in actual usage. Not worth it.
- [x] Fixed two docs found stale during the audit (true regardless of the decision): `gas-app/About.html` claimed Day Planner "cannot see... anything else" in Drive (false — smart-paste reads arbitrary file titles); `README.txt` only documented `drive.file`, omitting `drive.readonly`.

### Phase 18: WORK Environment Parity
*Goal: bring WORK up to the same state as HOME — themed-popup voice typing and the narrowed `drive.file`-only OAuth scope.*
- [x] WORK voice typing popup confirmed working directly (same-origin popup escape, org allowlist covers it).
- [x] WORK scope-narrowing promoted and verified: `documents` OAuth scope dropped, Docs Advanced Service live, no duplicate monthly doc on save/reload.
- [x] WORK repointed to Version 91 (HOME pinned `@258`) and user-verified live, 2026-09-28. See `TODO_HISTORY.md`'s 2026-09-28 entries for the full session detail (voice typing popup redesign/polish, daily-note save race fix, dark-mode contrast, navbar styling, notes empty-state/skeleton, Monthly Calendar today-highlight, About.html rewrite).

### Phase 17: Startup Performance Sizing
*Goal: Decide whether a client-asset caching effort is worth it, before building anything.*
- [x] Sized live via CDP against production `/exec`: GAS server spinup (`responseStart`) = 3.2-3.7s of a 4.6-5.8s total load.
- [x] Decision: **NO-GO** on a caching effort. Spinup + Google's sandbox overhead is ~65-75% of load and uncacheable; the remainder isn't separately cacheable under the current inlined-`HtmlService` architecture without a nontrivial restructure for a capped ~1.8s ceiling.

### Phase 1: Baseline Establishment & Branch Management
- [x] User alignment on baseline commit selection (`d294262` vs alternative) and branch naming.
- [x] Create dedicated rollback branch (e.g., `pure-gas-main`) rooted at baseline or preserve `master` tag `PWA-installable-22-Sep-2026`.
- [x] Audit working tree cleanliness and verify clasp configuration (`gas-app/.clasp.json`).

### Phase 2: Elimination of GitHub Pages & Service Worker Artifacts
- [x] Remove `sw.js` and Service Worker build/cache-version tooling (`tools/update-sw-cache-version.js`).
- [x] Remove `.nojekyll`, `gh-pwa-shell/` (if present), and GitHub Pages static hosting references.
- [x] Decommission client-side GIS OAuth (`src/googleAuth.js`, `tests/googleAuth.test.js`, OAuth client setup guides).
- [x] Replace root `index.html` with clean local development mock harness matching `gas-app/Index.html`.
- [x] Update `package.json` scripts to remove stale PWA/SW gates and focus on GAS linting and testing.

### Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.
- [x] Ensure `gas-app/Index.html` includes standalone display meta tags:
  - `<meta name="mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - `<meta name="apple-mobile-web-app-title" content="Day Planner">`
  - High-resolution apple-touch-icon PNG and favicon references.
- [x] Add in-app user guide in `gas-app/About.html` explaining how to create desktop window shortcuts ("Install Day Planner" / "Open as window") in Chrome and Edge.

### Phase 4: Feature & Bugfix Backporting
- [x] **Future Planning Matrix**:
  - Verify `src/futureMatrixEngine.js` and `gas-app/Code.gs` Drive-backed persistence.
  - Verify interactive month cards and status cycling in `gas-app/Index.html` & `gas-app/Script.html`.
- [x] **Daily Tasks Enhancements**:
  - Backport status dropdown menu with In-Progress (`•`), Forwarded (`→`), Delegated (`D/✓`), Canceled (`X`).
  - Backport star toggle and per-column sorting (Priority, Status, Title, Category).
  - Backport Notes hover popover.
- [x] **Modular Note Cards & Rich Formatting**:
  - Split heading into Topic + Summary fields.
  - Rich text formatting toolbar (bold, italic, underline, strike, color swatches, lists).
  - External link syntax (`[[link:URL]]text[[/link]]`) and smart-paste Drive URL title resolution.
- [x] **Monthly Master Tasks**:
  - Google Tasks API or Drive JSON archive persistence.
  - "Move to Today" action with target date picker.
- [x] **Server Security & Robustness**:
  - IIFE wrapping for `Code.gs` and `UnitTests.gs` with explicit exports.
  - Deduplicated Drive folder creation with `LockService.getUserLock()`.
  - Folder ownership validation for auto-adopted folders.
  - Safe HTML escaping for server-returned messages.
- [x] **Universal Search**:
  - Anchored Ctrl+K dropdown indexing Tasks, Appointments, and Notes.

### Phase 5: Verification & Clasp Deployment Gate
- [x] Run full test suite: `npm test` passing 100% with no skips (88/88 passing across 11 suites).
- [x] Run linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/` (0 errors).
- [x] Check safe chars: verify no single-line `//` comment truncation hazards in HTML scriptlets.
- [x] Verify local dev server & smoke test: `npm run smoke` tests all 5 active views, search modal, and theme toggle with 0 runtime errors.
- [x] WCAG Contrast & Responsive Viewport: `npm run audit:a11y` confirms 100% AA/AAA contrast and zero horizontal overflow down to 768px.
- [x] Deploy to GAS development endpoint via `clasp push` and verify `/self-test` diagnostic suite readiness.
- [x] Runtime Scope Resolution: Resolved `DriveApp.getFolderById` permissions by restoring minimal `drive.readonly`.
- [x] Least-Privilege Drive API: Eliminated `moveTo` broad `drive` scope requirement by creating monthly notes and run-logs directly in destination folders via `Drive.Files.insert`.
- [x] In-App Server Diagnostics: Built persistent 25-entry ring buffer, self-test log table, and permanent Google Doc run-log (`Day Planner - Run Log`).

### Phase 6: Live Workspace UAT & Production Release

> **URL anti-pattern**: NEVER use `/a/macros/gsa.gov/...` (enterprise proxy) — script is owned by
> `mhoffman02@gmail.com` (consumer). NEVER use `/exec` with the `@HEAD` ID.

- [x] Push latest code to HOME script `1XUrbUS55yQf_...` (Version 169).
- [x] Run Self-Test diagnostics (`/exec?view=self-test`) — 100% HEALTHY / All 5 suites Pass.
- [x] Verify production digital binder workspace load in Chrome (`/exec`).
- [x] Live Workspace 2-Way Task Sync: verified task creation in Day Planner reflected in Google Tasks with clean plain-text notes.
- [x] Task/Appointment Decoupling (Option A): decoupled tasks from auto-creating 30-min calendar blocks.
- [x] Circled-D (`Ⓓ`), Priority select width, and Add button vertical centering deployed and verified.
- [x] Setup Isolated Promotion Pipeline: created `gas-app/.clasp-work.json`, `tools/promote-to-work.js` (`npm run push:work`), and promoted Version 6 to WORK script (`1980roEKgkC_...`).
- [x] Enterprise Drive Permissions & Auto-Creation: `Drive.Files.insert` auto-creates root folder on fresh accounts; `validateAndSaveFolderUrl` supports GSA Google Workspace domain permissions; webapp access set to `MYSELF`.
- [x] User Acceptance Testing: confirm WORK environment access (`michael.hoffman@gsa.gov`) and Google Doc run-log.
- [x] Deploy tagged production release (`git tag v1.0-pure-gas`) after live UAT sign-off.
- [x] Verify Chrome/Edge "Open as window" desktop shortcut workflows.

### Phase 7: CSS Architecture Decoupling (`modern-normalize` Spike)
*Goal: Decouple Day Planner from Pico CSS v2 on a dedicated branch (`feat/modern-normalize`), replacing classless tag hijacking with modern-normalize and self-contained Franklin Covey design tokens.*

- [x] Fix Tasks column star button pill issue on `pure-gas-main` (commit `c957ba2`).
- [x] Create and checkout dedicated branch `feat/modern-normalize` without risking `pure-gas-main`.
- [x] Replace `@import url('.../pico.min.css')` with `modern-normalize.min.css` in `src/styles.css` and `gas-app/Styles.html`.
- [x] Provide baseline form controls (`input`, `select`, `textarea`), base link styling, and clean up the 39 `--pico-*` variable references into native design tokens.
- [x] Verify 100% parity across light (`#fcfbfa` parchment) and dark (`[data-theme="dark"]`) themes across all 5 views without regression.
- [x] Fix narrow Tasks column `[+]` button overflow and Appointment row collapse & overlapping pills (commit `7f8e432`).
- [x] Verify with Playwright screenshots, Chrome CDP inspection, `npm test`, and `npm run lint`.

### Phase 8: Advanced Productivity UX Ergonomics
*Goal: Implement high-efficiency task input ergonomics and 1-click focus mode for deep work in the Daily Binder view.*

- [x] Segmented Priority Selector (`Proposal B`): Replace `<select>` with letterpress stamp tabs `[ A | B | C ]` with color-coded active states and seamless `Enter` key submission (commit `de02715`).
- [x] Column Focus Mode: Add `open_in_full` / `close_fullscreen` toggle buttons to header actions of Tasks, Appointments, and Notes columns with ephemeral 100% width and `Escape` hotkey (commit `de02715`).
- [x] Merge `feat/modern-normalize` to `pure-gas-main`, deploy HOME release `@171`, and promote to WORK via `npm run push:work`.

### Phase 9: Ergonomics Polish & Thematic Color Harmonization
*Goal: Remove interaction artifacts, restore appointment click modals, localize timezones, filter undated tasks, and apply non-alert priority colors.*

- [x] Dotted Outline Removal on Star Toggle: Suppress persistent focus ring on mouse click via `:focus:not(:focus-visible) { outline: none; }` (commit `c6af794`).
- [x] Local Timezone Appointments: Format schedule slot times and event start/end using user calendar/session timezone (commit `ed3a7f7`).
- [x] Undated Task Backlog Filtering: Filter undated open tasks out of daily tasks view so they strictly remain in the Master Tasks backlog (commit `ed3a7f7`).
- [x] Panel Header Alignment, Headings, and Parchment Background Harmony: Harmonize Notes panel background to parchment cream `#fcfbfa`, pluralize headings to "Appointments" and "Notes", and vertically align dividing lines across headers (commit `3fb1ad6`).
- [x] Appointment Details Modal: Reconnect event pill click handler to open details modal with start/end time, description, Meet link, and gCal deep link (commit `dcb2b31`).
- [x] Thematic Non-Alert Priority Colors: Replace red/orange with Archival Ink Blue (`#1d5fa8`) for A, Bookbinder Plum (`#5e3f6b`) for B, and Binder Forest Green (`#2d6a5a`) for C (commit `ef8ffba`).
- [x] Deployments: HOME production deployed to `@176`; WORK production code promoted and Version 13 created targeting deployment `9csO`.

### Phase 10: Master Tasks Parity, Monthly Index Polish & Month Picker with Year Nav
*Goal: Bring Master Tasks to full feature parity with Daily Tasks, format Monthly Index highlights with rich text, ensure authentic Google Doc direct links, and implement high-efficiency multi-year month navigation.*

- [x] Master Tasks Feature Parity: letterpress segmented priority buttons, inline `#a`/`#b`/`#c` prefix detection + `Alt+A/B/C`, 5 sortable columns, Franklin glyph status dropdown with Delete, dedicated `[Delete]` button, sticky note popover, star toggle, priority badges, multi-column sorting, `updateMasterTask`/`deleteMasterTask` RPCs.
- [x] Monthly Index Polish: renamed header, rich-text Summary Highlight column, authentic `docs.google.com` direct links via `getDirectDocUrl`.
- [x] Top Navbar Month Picker Hover-Drop & Year Stepper: hover/click/double-tap dropdown, `< [Year] >` stepper, 4x3 month grid, gold/teal highlight states.
- [x] Deployments: HOME `@185`, WORK Version 26 (`9csO`).

### Phase 11: Task Filters, Calendar Grid Scaling, In-App Index Navigation & Doc Architecture
*Goal: Provide instant multi-status filtering on Master Tasks, eliminate calendar vertical dead space with day y-scroll, integrate in-app router links from Monthly Index, and lock in Google Doc Option 3 architecture.*

- [x] Master Tasks Status Filter (Option A: Franklin Glyph Stamp Toggles, commit `1426e7f`): `[All | • | ○ | ✓ | → | X | Ⓓ]` toolbar, `filterTasksByStatus` engine method, 6 unit tests.
- [x] Monthly Overview Full-Screen Expansion & Y-Scroll On-Demand (commit `1426e7f`).
- [x] Monthly Index In-App Navigation (commit `81b75c3`): `Jump to Day` column, `jumpToDailyPage(date, topic)`.
- [x] Google Doc Option 3 Architecture & Append Bug Fix (commit `07f528d`): fixed `saveDailyDocCards` unconditional append duplication.
- [x] Promote Phase 11 Enhancements to HOME (`@187`) and WORK (`@30`).

### Phase 12: Calendar Meet Links & Per-Card Category Segmented Checkboxes
*Goal: Robust Google Meet video join links across Calendar API and text fields, compact 18px category segmented button-checkboxes under the summary textbox on each note card, persistent category doc storage, and Monthly Index badge propagation.*

- [x] Calendar Google Meet Link Extraction (commit `a4eb7b0`): multi-field search, 4 unit tests, verified live.
- [x] Note Card Compact Category Segmented Button-Checkboxes (commits `254b6cb`, `1de4bba`): relocated control, 18px height, `toggleCardCategory`/`isCardCategorySelected`, `#category:` markdown serialization.
- [x] Production Deployments (HOME `@189`, WORK Version 34); tagged `v1.0-pure-gas` at `1de4bba`.

### Phase 13: Master Tasks Date Horizon Filters & Unified Clearinghouse
*Goal: Include incomplete tasks across all dates (past, today, future) on Master Tasks, provide thematic Blue Date Horizon filters (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`), deduplicate moved tasks, and add Due Date column.*

- [x] Backend RPC enhancement (`gas-app/Code.gs:1523`, `src/gasBridge.js`): retrieve undated + incomplete dated tasks.
- [x] Task deduplication via `buildMasterTasksClearinghouse` (`src/taskEngine.js:349`).
- [x] Master Tasks Header Filters: Date Horizon filter button group, 2px border radius (no pills).
- [x] Master Tasks Table: Due Date column, date badges, contextual Action buttons.
- [x] Quick-Add UX Clarification (commit `79bc761`).
- [x] Thematic Scrollbars in Dark & Light Modes (commit `89a5002`).
- [x] Master Tasks Move-to-Date Bugfix & Sticky Header (commit `dbadf81`).
- [x] Scroll-on-Demand Containers & Sticky Headers Across All Tabs (commit `a556ac6`).
- [x] Master Tasks Quick-Add Due Date & Container Fix (commit `d71ad36`).
- [x] Desktop Install Affordances & Themed Controls (commits `6bb391f`, `9123699`).
- [x] Top Bar Pinning, Notion-Style Topic Autocomplete, Link Copier Removal & Theme Favicon (commits `4009193`, `0e61981`, `afee716`, `eb69e81`, `33566a2`).
- [x] Automated tests: 137/137 passing across 17 suites.
- [x] Production Deployments (HOME `@205`, WORK `@52`).

### Phase 14: PWA Installability & Standalone Window Experience
*Goal: Complete PWA installability (without service worker) using inline manifest and SVG/PNG data icons, workspace UAT, and standalone window verification.*

- [x] PWA Installability (without service worker) (commits `373f29c`, `34bdfde`): inline manifest, standalone display mode, SVG/PNG icons, Apple touch/meta tags, `beforeinstallprompt`/`appinstalled` handlers.
- [x] Standalone physical `manifest.json` committed at root.
- [x] Workspace UAT verification (verified live by user, Chrome desktop standalone window).
- [x] Automated tests: 137/137 passing across 17 suites.
- [x] Production Deployments (HOME `@206`, WORK `@53`).

### Future Backlog (Post-Phase 14 Candidates)
- [x] ~~Daily recurring checklist / template items support~~ (Descoped per user directive).
- [x] Special Character Checkboxes (`☐` / `☒`) (commits `609788b`, `3cbd33f`).
- [x] Themed Calendar Date Pickers (commits `609788b`, `7c485fe`, `957fdb7`).
- [x] Universal Search Hotkey `Ctrl+Shift+F` (commits `3cbd33f`, `7c485fe`).
- [x] Note Link Modal Drive Title Resolution & Inline Hyperlink Rendering (commit `957fdb7`).
- [x] ~~Read-only offline cache / emergency fallback mode~~ (Descoped per user directive).

### Phase 15: CDP Diagnostic Tooling, Live Probe Skill, & Dual-Environment Alignment
*Goal: Enable robust browser-level introspection via Chrome DevTools Protocol, automated live smoke health checks, and dual deployment alignment.*

- [x] Debug Logging Rule (commit `aafbe2c`).
- [x] Live CDP Tooling: `tools/read-console.js`, `tools/eval-console.js` (commits `4a3333a`, `5520785`).
- [x] Chrome Console Skill (commit `dbbfb41`).
- [x] Live Probe Skill: `tools/probe-live.js`, `npm run probe` (commit `148dccb`).
- [x] HOME Production Alignment: locked `@224` (commit `aec1c67`).
- [x] WORK Promotion: Version 55 (`@55`) (commit `a279fe1`).
- [x] Sandboxed Apps Script Iframe CDP Support (commit `ee20a0e`).
- [x] Live HOME Health Probe Verified via `npm run probe`.

### Phase 16: In-App STT Dictation & Build Number Display
*Goal: Ship in-app speech-to-text dictation with a Google Doc fallback for enterprise-blocked mic access, and surface a build number for deploy verification.*

- [x] In-App STT Mic Affordance: feature-detected `webkitSpeechRecognition`/`SpeechRecognition`, wired into note card lines and event description field (commit `eaf519a`).
- [x] Confirmed live on WORK PC: mic blocked by org-managed enterprise Chrome policy (per-origin allowlist, not user-fixable).
- [x] Google Doc dictation fallback v1 (popup-based), then v2 redesign to a clickable in-app link after confirming Google Docs' CSP `frame-ancestors` blocks iframing and `window.open()` opens as a background tab, not a new window (commits `8e3771c` through `ab67935`).
- [x] Verified end-to-end live on HOME `@234` against real Drive/Docs APIs (create → pull → body-clear). Pushed to WORK (Version 63).
- [x] Build number display: `DAY_PLANNER_BUILD_NUMBER` (git commit count) shown in nav hover and About page (commits `0b4eb4d`, `ed54056`).
- [x] Lint clean: 0 errors, 0 warnings (delegated to AGY).

### Phase 24: AI Assist & Thesaurus Removed — Low ROI
*Goal: none — a reversal. User judgment call that the in-binder AI Assist (Summarize/Extract
Tasks/Polish/Custom Prompt) and the Thesaurus/Dictionary lookup (Alt+D, synonym/antonym chips)
weren't worth the OAuth/config surface and WORK-network complexity they added, and asked for them
removed entirely rather than disabled.*

- [x] Removed AI Assist (in-binder modal + AI Gateway settings modal) and Thesaurus/Dictionary
  end to end: UI (modals, buttons, About page docs), Alpine controller state/methods in
  `src/app.js` and its `gas-app/Script.html` mirror, `src/gasBridge.js` RPC wrappers, GAS backend
  (`Code.gs` `fetchLexicon`/`callAiMicroservice`/`testAiMicroservice`/`getEffectiveAiConfig_`/
  `setAiUserSelectedModel` plus their IIFE export aliases and top-level delegators), CSS, and the
  dead `src/lexiconService.js` / `src/aiService.js` source+test files (commit `b02f3cf`).
- [x] Caught via live CDP verification that the first pass missed mirroring the removal into
  `gas-app/Script.html` (still had a ~400-line duplicate calling now-deleted backend endpoints) —
  fixed and verified live (no console errors, UI confirmed absent) before it reached production
  (commit `1ee31b5`).
- [x] Fixed a real regression found while investigating: editing an existing task only showed the
  title in the edit field, silently hiding any notes attached via the `title | notes` pipe syntax.
  `startEditingTask` now seeds `title | notes` when notes exist; `updateTaskTitle` tracks pipe
  presence explicitly so a note can be intentionally cleared (previously impossible) (commit
  `b02f3cf`).
- [x] Investigated a "Notes Version History button does nothing" report — live-tested directly
  against the current production deployment and couldn't reproduce; button, click handler, and
  `openTimeMachine()` all worked correctly. Likely a stale-cache tab; asked user to hard-refresh
  and confirm.
- [x] Deployed to HOME (`/dev` verified first, then pinned production deployment, now `@288`,
  Build 365). User confirmed HOME tested and passed.
- [x] Promoted to WORK via `npm run push:work`: pushed code, created WORK Version 123. Final step
  (repointing the live WORK `/exec` deployment to Version 123) requires
  `michael.hoffman@gsa.gov` in the WORK Apps Script IDE — cross-domain deploy restriction, not
  completable by this session. **Pending as of this handoff.**

---

## Standing Verification Criteria (carried forward, still true)
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
