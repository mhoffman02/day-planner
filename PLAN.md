# Development Plan: Google Digital Day Planner (Pure G.A.S. Web App)

## 1. Project Overview & Architectural Pivot
The **Google Digital Day Planner** is a single-page digital binder app styled in classic Day Planner aesthetic (parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, no pills), bridging Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive) via full 2-way synchronization.

**Architecture**: 100% Pure Google Apps Script (GAS) Web App hosted natively on `script.google.com`. Deployed via `clasp`. No GitHub Pages hosting, no client-side GIS OAuth, no Service Worker (`sw.js`). Operates as an online-only web app running identically across personal (HOME) and locked-down federal (WORK) Google Workspace accounts.

---

## 2. Technical Stack & Modular Map

| Component | Location | Description | Verification / Test |
| :--- | :--- | :--- | :--- |
| **GAS Backend** | `gas-app/Code.gs` | Web app entry (`doGet`), Google Workspace RPC endpoints, 2-Way Sync | `gas-app/UnitTests.gs` (POST self-test) |
| **GAS UI Shell** | `gas-app/Index.html` | 5-view digital binder markup, desktop window tags | Live browser inspection |
| **GAS Client Script** | `gas-app/Script.html` | Alpine.js reactive app, `google.script.run` RPC bridge | `node tools/build-gas-engines.js --check` |
| **GAS CSS System** | `gas-app/Styles.html` | Day Planner design system, light/dark themes, responsive layout | `node tools/check-accessibility.js` |
| **Local Dev Preview** | `server.js` | Local HTTP preview server (`http://localhost:3000`) | Manual smoke test |
| **Task Engine** | `src/taskEngine.js` | Priority parsing (`[A1]`), status cycling, sequence calculation | `tests/taskEngine.test.js` |
| **Calendar Engine** | `src/calendarEngine.js` | 07:00-19:00 grid, event popup payloads | `tests/calendarEngine.test.js` |
| **Sync Engine** | `src/syncEngine.js` | 2-way Task ↔ Calendar reconciliation | `tests/syncEngine.test.js` |
| **Index Parser** | `src/indexParser.js` | `#index` tag extraction for monthly index | `tests/indexParser.test.js` |
| **Search Engine** | `src/searchEngine.js` | Cross-entity search (Ctrl + K) | `tests/searchEngine.test.js` |
| **Binder Store** | `src/binderStore.js` | View router, local date math navigation | `tests/binderStore.test.js` |
| **Future Matrix Engine** | `src/futureMatrixEngine.js` | 12-month forward-look month keys & item helpers | `tests/futureMatrixEngine.test.js` |

---

## 3. Phased Implementation Roadmap

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

| Endpoint | URL | Who Can Access |
|---|---|---|
| **HOME Dev app** (`@HEAD`) | [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) | `mhoffman02@gmail.com` only |
| **HOME Dev self-test** (`@HEAD`) | [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test) | `mhoffman02@gmail.com` only |
| **HOME Prod app** (`day-planner-v01`) | [`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec) | Anyone |
| **HOME Prod self-test** (`day-planner-v01`) | [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test) | Anyone |
| **WORK Dev app** (`@HEAD`) | [`/dev (gsa.gov)`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev) | `michael.hoffman@gsa.gov` |
| **WORK Prod app** (`Day-Planner-WORK`) | [`/exec (gsa.gov)`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) | Enterprise GSA users |

- [x] Push latest code to HOME script [`1XUrbUS55yQf_...`](https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit) (Version 169).
- [x] Run Self-Test diagnostics ([`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test)) — 100% HEALTHY / All 5 suites Pass.
- [x] Verify production digital binder workspace load in Chrome ([`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec)).
- [x] Live Workspace 2-Way Task Sync: verified task creation in Day Planner reflected in Google Tasks with clean plain-text notes.
- [x] Task/Appointment Decoupling (Option A): decoupled tasks from auto-creating 30-min calendar blocks.
- [x] Circled-D (`Ⓓ`), Priority select width, and Add button vertical centering deployed and verified.
- [x] Setup Isolated Promotion Pipeline: created [`gas-app/.clasp-work.json`](file:///home/mike/projects/day-planner/gas-app/.clasp-work.json), [`tools/promote-to-work.js`](file:///home/mike/projects/day-planner/tools/promote-to-work.js) (`npm run push:work`), and promoted Version 6 to WORK script (`1980roEKgkC_...`).
- [x] Enterprise Drive Permissions & Auto-Creation: `Drive.Files.insert` auto-creates root folder on fresh accounts; `validateAndSaveFolderUrl` supports GSA Google Workspace domain permissions; webapp access set to `MYSELF`.
- [ ] User Acceptance Testing: confirm WORK environment access (`michael.hoffman@gsa.gov`) and Google Doc run-log.
- [ ] Deploy tagged production release (`git tag v1.0-pure-gas`) after live UAT sign-off.
- [ ] Verify Chrome/Edge "Open as window" desktop shortcut workflows.

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

- [x] Master Tasks Feature Parity:
  - Letterpress segmented priority buttons (`[ A | B | C ]`) with hover titles, access keys, and rounded outer corners.
  - Inline `#a`, `#b`, `#c` title prefix detection and `Alt+A/B/C` keyboard shortcuts.
  - 5 sortable table columns: Priority (`Pri`), Status (`Sts`), Task Description, Category, Action.
  - Franklin glyph status dropdown popup menu with Delete item on each master task row.
  - Dedicated `[Delete]` button (`.btn-delete-row` with trashcan icon) next to `[Move]`.
  - Sticky note indicator icon with popover hover/click displaying notes without clipping (`notesPopoverDropUp`).
  - Star toggle (`★`/`☆`), priority column badges (`.priority-badge`), and multi-column sorting (`sortTasksByColumn`).
  - Backend RPC endpoints `updateMasterTask(taskId, updates)` and `deleteMasterTask(taskId)` with status mirroring to linked daily tasks.
- [x] Monthly Index Polish:
  - Renamed Monthly Index header to "Monthly Index and Decisions".
  - Formatted "Summary Highlight" column using rich text formatting (`renderCardLine`).
  - Extracted authentic Google Doc URLs (`https://docs.google.com/document/d/...`) from `getDailyData` and enforced valid `https://docs.google.com/document/...` via `getDirectDocUrl(url)`, eliminating broken script proxy URLs.
- [x] Top Navbar Month Picker Hover-Drop & Year Stepper:
  - Hover-drop (and click/double-tap) month picker dropdown on `< This Month >` in navbar.
  - Header year nav `< [Year] >` stepper and 4x3 month grid allowing 2-click jumps to any month across years.
  - Current calendar month highlighted with gold accent border, selected month with solid binder green fill.
- [x] Deployments:
  - HOME production deployed to Version 185 (`@185`).
  - WORK production code promoted and Version 26 created targeting deployment `9csO`.

### Phase 11: Task Filters, Calendar Grid Scaling, In-App Index Navigation & Doc Architecture
*Goal: Provide instant multi-status filtering on Master Tasks, eliminate calendar vertical dead space with day y-scroll, integrate in-app router links from Monthly Index, and lock in Google Doc Option 3 architecture.*

- [x] Master Tasks Status Filter (Option A: Franklin Glyph Stamp Toggles, commit `1426e7f`):
  - Compact flat 2px radius stamp toolbar `[All | • | ○ | ✓ | → | X | Ⓓ]` with active teal ink fills.
  - Multi-status combinations and 1-click toggle between All and Open-only (`•`).
  - `filterTasksByStatus` engine method with normalization between `Ⓓ` and `D/✓` and 6 unit tests.
- [x] Monthly Overview Full-Screen Expansion & Y-Scroll On-Demand (commit `1426e7f`):
  - Vertical expansion via `flex: 1 1 0; min-height: 0;` and dynamic CSS grid row track sizing.
  - Weekday header bar `[Sun - Sat]`.
  - Non-compressing event pills (`flex: 0 0 auto !important; min-height: 20px;`) with day card `overflow-y: auto`.
- [x] Monthly Index In-App Navigation (commit `81b75c3`):
  - Added 5th column `Daily Page` with `Jump to Day` button (`.btn-jump-day`).
  - Renamed `Direct Doc Link` to `Source Doc` (`View Google Doc`).
  - Implemented `jumpToDailyPage(date, topic)` with auto-expansion of topic cards.
- [x] Google Doc Option 3 Architecture & Append Bug Fix (commit `07f528d`):
  - Fixed `saveDailyDocCards` (`Code.gs:1081-1150`) unconditional append duplication bug with idempotent section replacement in reverse index order.
  - Reconciled specification and UI copy terminology across `REQUIREMENTS.md` and `PRD.md`.
  - Retained native H2/H3 for Google Docs native outline and printouts while keeping Day Planner SPA as primary presentation layer.
- [x] Promote Phase 11 Enhancements to HOME (`@187`) and WORK (`@30`).

### Phase 12: Calendar Meet Links & Per-Card Category Segmented Checkboxes
*Goal: Robust Google Meet video join links across Calendar API and text fields, compact 18px category segmented button-checkboxes under the summary textbox on each note card, persistent category doc storage, and Monthly Index badge propagation.*

- [x] Calendar Google Meet Link Extraction (commit `a4eb7b0`):
  - Enabled `Calendar` v3 advanced service in `appsscript.json`.
  - Multi-field search across `hangoutLink`, `getHangoutLink()`, `conferenceData.entryPoints`, and regex matching across `title`, `description`, `location`.
  - 4 automated unit tests added to `tests/calendarEngine.test.js`.
  - Verified live in UAT by user.
- [x] Note Card Compact Category Segmented Button-Checkboxes (commits `254b6cb` & `1de4bba`):
  - Relocated category control from top of column into `.card-summary-col` directly underneath `"Set a Topic to index this card"` summary textbox (`.card-heading-input`) on each note card in `Index.html` and `gas-app/Index.html`.
  - Reduced height from 26px to **18px** (~33% reduction), font to `0.68rem`, padding to `0 6px`, checkmark to `11px` in `src/styles.css` and `gas-app/Styles.html`.
  - Added `toggleCardCategory(card, cat)` and `isCardCategorySelected(card, cat)` for per-card multi-select toggle behavior.
  - Serialized categories per card under `###` heading in markdown as `#category: <cats>`, parsed losslessly in `parseDailyNoteToCards()` and `src/indexParser.js`.
  - Wired `buildIndexRecords()` to pull each card's categories directly for Monthly Index rendering under `Topic / Category`.
  - Unit tests added to `tests/indexParser.test.js`.
- [x] Production Deployments (HOME @189, WORK @34):
  - HOME live at `@189` (`AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`).
  - WORK promoted and Version 34 created targeting deployment `Version 3` (`9csO`).
  - Tagged `v1.0-pure-gas` at commit `1de4bba`.

### Phase 13: Master Tasks Date Horizon Filters & Unified Clearinghouse
*Goal: Include incomplete tasks across all dates (past, today, future) on Master Tasks, provide thematic Blue Date Horizon filters (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`), deduplicate moved tasks, and add Due Date column.*

- [x] Backend RPC enhancement ([`gas-app/Code.gs:1523`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1523), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js)): Retrieve undated tasks plus incomplete dated tasks (`!t.due || (!isComplete(t) && t.due)`).
- [x] Task deduplication: Merge moved master tasks (`[MovedTo: date, id]`) with their scheduled daily counterparts (`[SourceMaster: id]`) via [`buildMasterTasksClearinghouse`](file:///home/mike/projects/day-planner/src/taskEngine.js#L349).
- [x] Master Tasks Header Filters: Revert "Status filter" back to "Filter:". Add visually distinct thematic blue Date Horizon filter button group `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]` with crisp 2px border radius (strictly no pills).
- [x] Master Tasks Table: Add `Due Date` column (sortable by date), date badge display (`Sep 28, 2026`, `Overdue`, `Undated`), and contextual Action buttons (`Jump to Day` vs date picker + `Move to Date`).
- [x] Quick-Add UX Clarification (commit `79bc761`): Explicit `New Task:` framing, priority tooltip, submit spinner, auto-switch to `All Dates` visibility guarantee, and 2s row teal flash highlight.
- [x] Thematic Scrollbars in Dark & Light Modes (commit `89a5002`): Slim 8px scrollbar, 2px border radius, themed tracks and thumbs, and browser `color-scheme` synchronization.
- [x] Master Tasks Move-to-Date Bugfix & Sticky Header (commit `dbadf81`): Fixed `encodeTaskStatusNotes` typo in `markMasterTaskMoved` and added `.master-tasks-table-container` with sticky `thead th`.
- [x] Scroll-on-Demand Containers & Sticky Headers Across All Tabs (commit `a556ac6`): Applied scroll-on-demand containers and sticky headers across Index, Future, About, Daily, and Master Tasks tabs.
- [x] Master Tasks Quick-Add Due Date & Container Fix (commit `d71ad36`): Fixed `figure.table-container` CSS override with `overflow-y: auto !important`, added due date picker to quick-add bar, and enlarged note card category buttons to 20px.
- [x] Desktop Install Affordances & Themed Controls (commits `6bb391f` & `9123699`): Themed date pickers in light/dark modes, dynamic category autocomplete datalist, dark mode secondary outline buttons, interactive About install button, and Install Guide modal.
- [x] Automated tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) and [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) (136/136 tests passing across 17 suites).
- [x] Production Deployments (commits `d71ad36`, `6bb391f`, `9123699`, HOME `@197`, WORK `@46`).

### Phase 14: Advanced Productivity & Usability Enhancements
*Goal: Ongoing workspace polish, recurring tasks / daily template checklists, rich text / markdown checklist support in topic cards, and offline cached read-only fallback mode.*

- [ ] Workspace UAT verification of Phase 13 fixes across desktop and mobile browsers.
- [ ] Daily recurring checklist / template items support.
- [ ] Rich text / markdown checkbox rendering in note card bodies.
- [ ] Read-only offline cache / emergency fallback mode.



---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
