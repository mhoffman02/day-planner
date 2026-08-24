# Development Plan: Google Digital Day Planner (GAS MVP)

## Project Overview
The **Google Digital Day Planner** is a high-efficiency single-page digital binder application styled in classic Day Planner aesthetic (forest/teal ruling, cream background, serif headers). It bridges Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive) featuring full 2-Way Synchronization across Google Calendar, Google Tasks, and the Digital Binder.

---

## Technical Stack & Architecture

- **Backend / GAS**: Google Apps Script (`Code.gs`) providing `doGet()` web app entry, Google Workspace API integrations (`CalendarApp`, `Tasks`, `DriveApp` for notes JSON, `DocumentApp` for meeting Agenda Docs), and time-driven 2-Way Sync triggers.
- **Frontend Binder Shell**: Single Page Application (`Index.html`, `Styles.html`, `Script.html`) styled in Day Planner & UWSDS CSS system.
- **Client Logic & State**: Alpine.js for reactive binder tabs, daily/monthly state, 2-way workspace sync, modal popups, drag/drop task ordering, search filter.
- **Local Testing & Simulation**: Node.js test harness (`node:test` / modular JS) with mock GAS services allowing full local unit testing, dev server preview, and seamless GAS bundle syncing.

---

## Modular Architecture & Test Suite Map

| Module | Location | Description | Unit Test File | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Task Engine** | `src/taskEngine.js` | `[A1]` prefix parsing, status codes (`✓`, `→`, `X`, `G/✓`, `•`), sorting/sequencing, "Move to Today" transfer logic | `tests/taskEngine.test.js` | ✅ Passed (6 tests) |
| **Calendar & Schedule** | `src/calendarEngine.js` | 7am-7pm schedule grid formatting, 30-min slot mapping, event popup payload generation (gMeet & gCal links) | `tests/calendarEngine.test.js` | ✅ Passed (4 tests) |
| **2-Way Sync Engine** | `src/syncEngine.js` | Cross-references Tasks and Calendar Events via `syncId`, syncs task completion/priority to Calendar, and reconciles time shifts | `tests/syncEngine.test.js` | ✅ Passed (5 tests) |
| **Index & Docs Parser** | `src/indexParser.js` | Daily notes `#index` / `[INDEX]` tag extractor, topic categorization, index table aggregation | `tests/indexParser.test.js` | ✅ Passed (2 tests) |
| **Universal Search** | `src/searchEngine.js` | Multi-entity indexing (Calendar, Tasks, Docs, Index), search filtering, result ranking & highlights | `tests/searchEngine.test.js` | ✅ Passed (3 tests) |
| **Navigation & State** | `src/binderStore.js` | View router (Daily 2-Page, Monthly Calendar, Master Tasks, Index, Future Matrix), date navigation state | `tests/binderStore.test.js` | ✅ Passed (5 tests) |
| **GAS API Bridge** | `src/gasBridge.js` | Mock GAS backend for local preview & standard `google.script.run` adapter | `tests/gasBridge.test.js` | ✅ Passed (4 tests) |

---

## Phase Checklist & Progress Tracker

### Phase 1: Environment Setup & Core Logic Modules
- [x] Initialize `package.json` with Node test script (`node --test`).
- [x] Create `src/taskEngine.js` for task prioritization, status transitions, and monthly master transfer.
- [x] Create `tests/taskEngine.test.js` and verify task logic tests pass.
- [x] Create `src/calendarEngine.js` for 7am-7pm appointment grid, slot alignment, and event popup metadata.
- [x] Create `tests/calendarEngine.test.js` and verify calendar logic tests pass.

### Phase 2: Index Parser & Universal Search Engine
- [x] Create `src/indexParser.js` to parse daily note lines tagged `#index` or `[INDEX]`.
- [x] Create `tests/indexParser.test.js` and verify doc indexing tests pass.
- [x] Create `src/searchEngine.js` for cross-service indexing (`Ctrl + K` target).
- [x] Create `tests/searchEngine.test.js` and verify search query tests pass.

### Phase 3: Binder Store & GAS Mock/Bridge
- [x] Create `src/binderStore.js` to manage 5 page view states, active date, tab switching, and modal controls.
- [x] Create `tests/binderStore.test.js` and verify state transitions.
- [x] Create `src/gasBridge.js` providing GAS API integration handlers + local memory store fallback for standalone preview.
- [x] Create `tests/gasBridge.test.js` and verify bridge API handlers.

### Phase 4: 2-Way Synchronization Engine Integration
- [x] Create `src/syncEngine.js` implementing bi-directional task <-> event linkage, status sync (`[✓]`), and reconciliation.
- [x] Create `tests/syncEngine.test.js` and verify sync logic tests pass.
- [x] Update `gas-app/Code.gs` with server-side `syncWorkspaceChanges()` handler and `setup2WaySyncTrigger()` for 10-minute automated background syncing.

### Phase 5: UI Design System & Single Page App (SPA) Binder
- [x] Create `gas-app/Styles.html` implementing classic Day Planner aesthetic (Parchment `#fcfbfa`, Day Planner Teal `#2d6a5a`, Serif typography, tab binder layout).
- [x] Create `gas-app/Script.html` containing Alpine.js app initialization, 2-Way Sync action triggers, and search modal handlers.
- [x] Create `gas-app/Index.html` housing the 5 core views:
  1. Prioritized Daily Planner (2-Page Spread: Tasks/Tracker left, 7am-7pm Schedule + Daily Notes right).
  2. Full-Screen Monthly Overview Calendar (7x5 grid with event pills & direct day click).
  3. Monthly Master Task List Page (Categorized Work, Personal, Financial, Projects + "Move to Today").
  4. Monthly Index Page (Searchable registry with topic, summary highlight, direct link).
  5. Future Planning Matrix (12-month forward look).

### Phase 6: Local Dev Server & Full Test Suite Verification
- [x] Create local server runner (`server.js`) to serve the full digital binder web interface locally at `http://localhost:3000`.
- [x] Run full test suite (`npm test`) to ensure 100% test passing across all feature modules (29/29 passing).
- [x] Verify UI responsiveness, modal popups, `Ctrl + K` search, task status transitions, 2-way sync button, and calendar navigation.

### Phase 7: Code Review, Security & Modernization Refactoring
- [x] Fix date navigation timezone bug in `src/binderStore.js` using local year/month/day date math.
- [x] Refactor `src/gasBridge.js` to leverage `taskEngine.js` for sequence generation and task transfer.
- [x] Modernize JS engine modules by replacing deprecated `String.prototype.substr()` calls with standard `slice()`.
- [x] Enhance accessibility with dynamic `:aria-label` bindings on task status cycling controls in `gas-app/Index.html`.
- [x] Secure external links with `rel="noopener noreferrer"` across `Index.html`, `About.html`, and `SetupFolder.html`.
- [x] Fix year interpolation in Future Planning Matrix month card titles (`gas-app/Index.html`).
- [x] Normalize HTTP URL parsing in `server.js` using `URL` pathname extraction.

### Phase 8: 3-Column Layout, Modular Note Cards & Google Docs Custom Menu
- [x] Refactor Daily View layout in `gas-app/Index.html` to a 3-column workspace on PC Large screens (Tasks = Col 1, Appointment = Col 2, Notes = Col 3).
- [x] Implement multi-line text auto-fit (1-3 lines) and vertical scrolling (>4 lines) for Tasks and Appointment pills.
- [x] Build Modular Modular Topic Cards with expand/collapse twisties (`▼`/`▶`), editable H3 headings, category tags, Google Chat formatting toolbar, and card search/filter dropdown menu.
- [x] Implement 12 Monthly Google Docs sync architecture (`Day Planner Notes - August 2026`) with print-friendly formatting (page breaks per day, styled headers, bullet lists).
- [x] Add custom `Planner 📖` menu to Google Docs (`onOpen`) with cross-month universal search sidebar and `#index` decision registry.

### Phase 10: Offline-First PWA, Local Vendor Bundling & Modular GAS Architecture
- [x] Create PWA Web App Manifest (`manifest.json`), SVG App Icon (`icons/icon.svg`), and Service Worker (`sw.js`) with `day-planner-v3` caching.
- [x] Bundle local Alpine JS (`src/vendor/alpine.min.js`) and Pico CSS v2 (`src/vendor/pico.min.css`) to eliminate external CDN dependencies.
- [x] Create GitHub Pages PWA Launcher shell in `gh-pages-pwa/` (`index.html`, `manifest.json`, `sw.js`).
- [x] Author comprehensive AppSheet native & PWA shell integration guide (`APPSHEET_PWA_GUIDE.md`).
- [x] Implement modular GAS architecture (`gas-app/PicoCSS.html`, `gas-app/AlpineJS.html`, `gas-app/Styles.html`, `gas-app/Script.html`, `gas-app/Index.html`).
- [x] Expand unit test coverage to 41 tests across 10 suites (`tests/pwa.test.js`).
- [x] Capture semantic headless Chrome screenshots (`desktop_daily.png`, `desktop_monthly.png`, `desktop_tasks.png`, `mobile_daily.png`) and enforce project screenshot naming rule (`.agents/rules/screenshot-naming.md`).
- [x] Push modular codebase to Google Apps Script (`clasp push`) and deploy live Web App for testing.

### Phase 11: Least-Privilege Scopes, Drive JSON Storage, Offline PWA & GSA Enterprise Transfer
- [x] **11.1 Scope Hardening**: Strip broad `auth/drive` and `auth/documents` from `gas-app/appsscript.json`, keeping only `drive.file`, `tasks`, `calendar`, `script.scriptapp`.
- [x] **11.2 Monthly Drive JSON Engine**: In `gas-app/Code.gs`, replace `DocumentApp` operations with lightweight `Day Planner/notes-YYYY-MM.json` read/write handlers under `drive.file`.
- [x] **11.3 Client IndexedDB Storage & SWR Engine**: Create `src/indexedDbStore.js` for instant 0ms offline startup, optimistic note edits, and outbox queue (`tests/indexedDbStore.test.js`).
- [x] **11.4 Automated 5-Minute Auto-Sync**: Implement client periodic polling interval, tab visibility resume, and manual sync button integration.
- [x] **11.5 GSA Enterprise GitHub Repository Transfer**: Document and script the workflow to clone/push this repository to the user's `gsa.gov` GitHub Enterprise account (`docs/gsa-github-transfer.md`, `scripts/transfer-to-gsa.sh`).
- [x] **11.6 Full Test Suite Verification & Clasp Push**: Update test suite to verify JSON storage contracts (61/61 passing across 17 suites) and deploy via `clasp push`.

### Phase 12: Appointment Creator UX, Speedy Meetings, People Autocomplete & Meeting Automations
- [x] **12.1 Dialog Hierarchy & (+) Button Fix**: Resolved unclosed modal dialog tags in `gas-app/Index.html` restoring appointment creation button functionality.
- [x] **12.2 Interactive Time Gutter & Row Click**: Made schedule time stamps (`7:00 AM`, etc.) and empty slots clickable to prefill appointment creation times.
- [x] **12.3 Speedy Meetings & Duration Presets**: Implemented 25-minute default meeting length with interactive duration buttons (`25 min | 50 min | 80 min`) and dynamic end-time calculation.
- [x] **12.4 People / Attendees Field with Autocomplete**: Built `<datalist>` email autocomplete querying recent meeting attendees across -60 days to +15 days.
- [x] **12.5 Auto-Add Google Meet**: Implemented automatic Google Meet video link generation with note-taking enabled by default.
- [x] **12.6 Guest Edit Permissions**: Added auto-enabled co-organizer event editing (`guestsCanModify`) on Google Calendar.
- [x] **12.7 Auto-Create Agenda Docs**: Implemented structured Agenda & Notes Google Doc generation and linked buttons in event details modal.
- [x] **12.8 Full Test Suite Expansion**: Expanded unit test coverage across `binderStore.test.js`, `calendarEngine.test.js`, and `gasBridge.test.js` (66/66 passing across 18 suites).

---

### Phase 13: gh-pwa-shell Security Hardening, Agent-Config Migration & Handoff
- [x] **13.1 Close `?gasUrl=` RCE hole**: Add `isValidGasUrl()` allowlist validator and an
  explicit-consent gate (existing "Connect Application" modal) for any never-before-trusted
  `gasUrl`; fix latent `mountBundle()` inline-script/Alpine-timing race; viewport pinch-zoom,
  font preconnect, install-bar keydown, maskable icon UX fixes (`gh-pwa-shell/pwa.js`,
  `index.html`, `manifest.json`). Merged to gh-pwa-shell `main` (`40bfffb`), pushed.
- [x] **13.2 Agent-config real-file mirrors**: Replace `.agents/{rules,commands,skills}`
  symlinks (which silently degrade to stub files on Windows without Developer Mode) with
  generated real-file mirrors + `npm run sync:agents:check` pre-commit drift gate; native
  config for Kilo (`kilo.jsonc`) and Gemini (`GEMINI.md` → `@CLAUDE.md`). Merged to `master`
  (`6ce4f85`), pushed.
- [x] **13.3 Fix `tests/pwa.test.js` live-server dependency** — 5 tests (`should serve /`,
  `/manifest.json`, `/sw.js`, icon route, 404 route) call `http.get()` against
  `localhost:3000` with no timeout and no server startup of their own; when `npm start`
  isn't already running they fail (`ECONNREFUSED`) or, in some environments, hang
  indefinitely — this is what stalls `npm test` inside the pre-commit hook. Fixed:
  `server.js` now exports `createServer()` and only auto-listens as the main module;
  `pwa.test.js` spins up its own ephemeral server (port 0) in `before()`/`after()`.
  Merged to `master` (`5c0e9c2`), pushed.
- [x] **13.4 Manually verify the merged gh-pwa-shell security fixes in a real browser** —
  no automated test harness exists for this sub-repo. Confirmed via Playwright against a
  real Chrome instance: untrusted `?gasUrl=` shows the pre-filled consent modal without
  auto-fetching; invalid host is dropped silently; Launch on a valid URL
  fetches/mounts/persists and is silent on reload; install-bar Enter/Space triggers
  install; pinch-zoom works on mobile viewport.
- [x] **13.5 De-duplicate stale gh-pwa-shell files tracked in the day-planner outer repo** —
  7 files (`gh-pwa-shell/{index.html,pwa.js,manifest.json,styles.css,sw.js,icons/icon.svg}`)
  are tracked directly in day-planner's own git history from before gh-pwa-shell became a
  separate nested repo (last touched `05f5eeb`), now stale/diverged and showing as
  perpetually "modified" in `git status` every time the real nested repo changes. Fixed:
  `git rm --cached` those paths + added `gh-pwa-shell/` to `.gitignore`, matching what
  `CLAUDE.md` already documents (nested separate repo). Merged to `master` (`9943b49`),
  pushed.
- [x] **13.6 Delete merged feature branches** — `worktree-gh-pwa-shell-security-fixes`
  (gh-pwa-shell) and `test/agent-config-symlink-migration` (day-planner), both fully
  merged, deleted locally and on origin.

### Phase 14: Full Feature Regression Pass & 2-Way Sync Verification
- [x] **14.1 Develop missing unit test coverage**: audited each module in the
  Modular Architecture & Test Suite Map above against its current `src/*.js` behavior and
  added 41 new edge-case tests (66 -> 107) across all 7 core engines: falsy/malformed
  input handling, null-return branches (`updateDailyTask`/`updateCalendarEvent`/
  `transferMasterTask` on unknown ids), `autoGoogleMeet`/`autoAgendaDoc`/
  `guestsCanModify` disabled paths, attendee-string parsing, invalid view/date no-ops in
  `BinderStore`, `formatEventModalPayload` defaults, monthly-grid padding, index-tag
  default-topic and empty-input branches, blank-query/missing-store-field search
  behavior, `syncEngine`'s `getCleanTitle` stacked-prefix stripping and the
  unlinked-event-to-task fallback-by-title match, and IndexedDB fallback-store
  delete/miss paths. **Not covered**: server-side `gas-app/Code.gs` sync/trigger logic
  still has no direct unit tests — it depends on live GAS globals (`CalendarApp`, `Tasks`,
  `DriveApp`) that would need a substantial mocking layer to exercise under
  `node --test`; `src/syncEngine.js`'s local model remains the only tested version of
  that logic. Left as a known gap rather than building that mock harness speculatively.
- [x] **14.2 Run full unit test suite** (`npm test`) and confirm all suites pass with no
  skips — 107/107 passing across 19 suites.
- [ ] **14.3 Verify 2-way sync end-to-end against live Google Calendar & Tasks** — no
  automated harness exercises the real APIs, only `src/syncEngine.js`'s mocked model.
  Confirm against the live GAS backend: creating/editing a priority-tagged task creates a
  linked calendar event and vice versa; completing a task syncs status to its linked
  event; time-shifting a linked calendar event reconciles back to the task; the
  `setup2WaySyncTrigger()` background job (runs every 5 min, `gas-app/Code.gs`) picks up
  changes made directly in Calendar/Tasks outside the app.
- [ ] **14.4 Fix any broken features** surfaced by 14.2 or 14.3.

## Verification Criteria
- [x] All unit tests in `tests/*.test.js` pass cleanly (`npm test` — 107/107 passing across 19 suites).
- [x] UI matches Day Planner design rules (#fcfbfa cream, #2d6a5a teal ruling, serif headers).
- [x] 2-Way Sync correctly cross-references tasks and calendar appointments.
- [x] All views function correctly in both local dev server (`http://localhost:3000`) and GAS file bundle.
- [x] Code passes comprehensive JavaScript & HTML code reviews with zero security or date-shift warnings.




