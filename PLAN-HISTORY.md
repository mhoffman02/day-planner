# Plan History: Google Digital Day Planner

Archived completed phases from [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md). Refreshed each session by the [`handoff`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) skill — completed phases move here so `PLAN.md` stays a lean, forward-looking planning doc rather than a growing changelog. This file is append-only history; do not plan against it.

---

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

---

## Standing Verification Criteria (carried forward, still true)
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
