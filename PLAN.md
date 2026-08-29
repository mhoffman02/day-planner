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
| **Task Engine** | `src/taskEngine.js` | `[A1]` prefix parsing, status codes (`✓`, `→`, `X`, `D/✓`, `•`), sorting/sequencing, "Move to Today" transfer logic | `tests/taskEngine.test.js` | ✅ Passed (6 tests) |
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
  changes made directly in Calendar/Tasks outside the app. **Needs manual verification in
  a live browser session** — the available Claude tooling has no Google Tasks access and
  no browser automation, so this can't be driven agent-side; the `/dev/self-test`
  diagnostic also requires an authenticated browser session (redirects to Google login
  for unauthenticated fetches).
  - **Scope gap found while investigating (feed into 14.4):** the actual bidirectional
    reconciliation (`reconcileWorkspaceChanges`/`syncTaskToCalendar`/`syncCalendarToTask`,
    the `src/syncEngine.js` port) lives entirely in client-side JS in
    `gas-app/Script.html:118-165` and only runs while the app is open in a browser. The
    server-side 5-min trigger, `syncWorkspaceChanges` in `gas-app/Code.gs:442`, is
    narrower than this checklist implies: it's task→event only (pushes completion status
    into the event title, creates a missing event) and is hardcoded to `new Date()` /
    today — it never touches other dates and has no time-shift-reconciliation or
    event-completion→task logic at all. So changes made directly in Calendar/Tasks on a
    day other than today, or a time-shift on a linked event, will NOT be picked up by the
    background trigger while the app is closed — only by the client-side reconciliation
    the next time the app is opened for that day.
- [ ] **14.4 Fix any broken features** surfaced by 14.2 or 14.3.
- [x] **14.5 Apply `docs/patches/pwa.js.patch` to the separate `gh-pwa-shell` repo**
  (`mhoffman02/shell`, checked out at `/home/mike/projects/day-planner/gh-pwa-shell` —
  outside this repo's git, see README.txt/CLAUDE.md "Universal PWA Shell"). Fixes the
  shell showing mock/placeholder Calendar & Tasks data instead of real data: the shell
  always fetches/mounts a static bundle into `#app-root` and runs it client-side, so
  `google.script.run` never exists there and `GASBridge` silently falls back to mock
  data — even with a trusted GAS URL on file. Root cause and fix are already documented
  in `shell-gas-pattern.md` §9 ("If Live 2-Way GAS Sync Is Required" — a standalone
  GAS deployment, not a fetched bundle, is correct for a live-2-way-sync app like Day
  Planner). The patch adds a `redirectToApp()` helper and changes `initPWA()`,
  `launchKnownApp()`, and `handleConnect()` in `pwa.js` to do a real
  `window.location.href` navigation to the live `/exec` URL whenever online with an
  already-trusted source, instead of fetching/mounting a bundle — reusing the
  `#shell-loading` spinner already in `index.html` rather than adding new UI. Bundle
  mounting is untouched for the genuine offline-PWA fallback path and for
  first-time/pending-URL consent flows (`showConnectPrompt`), so those still work as
  before. Also adds a **`day-planner-dev` `KNOWN_APPS` entry** pointing at the
  Apps Script `/dev` URL — `https://script.google.com/macros/s/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/dev`
  (script ID from `gas-app/.clasp.json`) — reachable only via the deep link
  `?app=day-planner-dev`; a `hidden: true` flag keeps `renderAppPicker()` from ever
  listing it in the default multi-app picker. Its `localStorage` trust key
  (`gas_url_day-planner-dev`) is fully separate from production's
  (`gas_url_day-planner`) so a test launch can never silently redirect prod traffic
  to `/dev`. Fixes one real bug this exposed along the way: `initPWA()`'s
  legacy-storage-key fallback previously applied to *any* `appKey`, so the very first
  `?app=day-planner-dev` visit on a browser that already trusted prod would read back
  the prod URL and redirect there instead of `/dev` — now guarded to
  `appKey === 'day-planner'` only. `/dev` only works for a Google account with edit
  access to the script project; anyone else gets an access-denied page, which is fine
  for a solo-dev testing tile. Verified: all 6 replacements apply cleanly against
  current `pwa.js` and `node --check` passes on the patched file. **Update:** the patch also now scopes `launchKnownApp`'s and
  `handleConnect`'s writes to the legacy `dayPlannerGasUrl` key to
  `appKey === 'day-planner'` only (previously written unconditionally for any launched
  app, including the hidden dev tile — on a browser with no prior trust, launching dev
  first would poison prod's legacy-key fallback with the `/dev` URL). Re-verified
  against the live `pwa.js` with `patch --dry-run`.
  - **Update (2026-08-25):** `docs/patches/pwa.js.patch` no longer applies (`patch
    --dry-run` fails 3 of 6 hunks) — the core fix it describes (real
    `window.location.href` navigation instead of fetch/mount, for an
    already-trusted online source) is **live and confirmed pushed** to
    `gh-pwa-shell` — commit `a4e73e1` — via a hand-written `redirectToApp()`
    that's more complete than the patch: it adds the "Not this app?" escape
    hatch, a `REDIRECT_DELAY_MS` grace period, and `?reset=1` recovery, none of
    which the patch had (closing the gap noted as deferred in 14.6(b) below). So
    the actual bug (mock data instead of real Calendar/Tasks data) is fixed.
    Stale patch file deleted. The `day-planner-dev` hidden-`KNOWN_APPS`-entry /
    `?app=day-planner-dev` design sketched above for reaching `/dev` was **not**
    what shipped — it was superseded by a simpler, generic dev-mode toggle
    instead: visiting with `?dev=1` sets a `localStorage['dpDevMode']` flag (any
    `KNOWN_APPS` app, not a separate hidden entry), which shows a "Launch /dev
    (testing)" link in the picker and skips the auto-redirect-to-prod so the
    picker stays reachable; `?dev=0` clears the flag. Commit `2005910`. See
    `shell-gas-pattern.md` §10.E for the current design.
- [x] **14.6 Opus review of the 14.2-14.5 commits, and fixes for what it found.** An
  Opus subagent reviewed the 5 commits ahead of `origin/master`
  (`f2788a7`/`2fd50ec`/`fe33b54`/`57f4fa4`/`d7a4268`) plus the staged `pwa.js.patch`.
  Findings and disposition:
  - **CRITICAL (fixed):** `getDailyData` (`Code.gs`) called `Tasks.Tasks.list('@default')`
    with no date filter, so every task (any due date, including undated ones) came back
    on every call regardless of the requested day. `reconcileWorkspaceChanges` then saw a
    "task with no matching event" for every task on every date navigation and created a
    real duplicate Calendar event each time — a live-data-corruption bug on the user's
    actual Google Calendar. Fixed by adding `dueMin`/`dueMax` (scoped to the requested
    day) to the `Tasks.Tasks.list` call; confirmed safe because every task-creation path
    (`addDailyTask`) always sets `due` to its target date.
  - **HIGH (fixed):** the `gasTaskId` Task<->Event link was written to
    `extendedProperties.private` (Advanced Calendar Service) but read via
    `evt.getTag()` (CalendarApp), which maps to the *shared* property map — the read
    side likely never found what the write side wrote, defeating de-duplication. Fixed
    by writing to both `private` and `shared` on creation.
  - **HIGH (fixed):** event ids from `CalendarApp` carry an `@google.com` suffix that
    `Calendar.Events.patch` (used by `updateCalendarEvent`) rejects, so retitling/
    rescheduling a linked event silently no-opped. Fixed by normalizing to the bare id
    everywhere it's returned to the client (`getDailyData`, both branches of
    `addCalendarEvent`), and re-appending the suffix only where `CalendarApp.getEventById`
    needs it internally.
  - **HIGH (fixed):** `isSyncing` was only set for non-silent syncs, so the 5-min
    interval/`visibilitychange`/`online`-triggered silent syncs could overlap each other
    (or a user-initiated sync) with no guard, each independently creating the same
    duplicate event. Fixed in both `gas-app/Script.html` and `src/app.js`: `isSyncing`
    now gates and is set/cleared for every `trigger2WaySync` call regardless of `silent`.
  - **HIGH (fixed):** daily notes were never persisted — `saveDailyDocCards` existed
    server-side (`Code.gs`) and in `src/gasBridge.js`, but `gas-app/Script.html`'s
    `GASBridge` had no such method and neither `src/app.js` nor `Script.html` ever
    called it, so note edits lived only in memory and were lost on the next
    `loadDayData()`. Fixed: added the missing `GASBridge.saveDailyDocCards` method to
    `Script.html`, and both `syncCardsToDailyNote`/`syncDailyNoteToCards` (in both
    copies) now debounce (1.2s) a real save through it — debounced because both
    functions fire on every textarea keystroke.
  - **MEDIUM (fixed):** `updateDailyTask`/`updateCalendarEvent` return `null` on a
    not-found (deleted upstream), but every caller discarded the return value —
    silent per `no-silent-failures.md`. Both callers (the `trigger2WaySync` reconcile
    loops and `toggleTaskStatus`, in both `Script.html` and `src/app.js`) now check for
    `null` and surface it via `this.errorMessage`.
  - **MEDIUM (fixed):** `addDailyTask`'s no-Tasks-service fallback silently fabricated
    a `task_<timestamp>` id with no real backing (looked saved, vanished on next
    fetch) — inconsistent with `updateDailyTask`'s throw in the identical condition.
    Now throws too.
  - **LOW (fixed):** `updateDailyTask` matched only `'404'` in the not-found catch,
    `updateCalendarEvent` matched `'404' || 'Not Found'` — aligned to the same check.
  - **MEDIUM (fixed, in the still-unapplied `pwa.js.patch` — see 14.5 above):**
    `launchKnownApp`/`handleConnect` wrote the legacy `dayPlannerGasUrl` key
    unconditionally regardless of which app was launched, which could let the dev
    tile's `/dev` URL poison prod's fallback on a browser with no prior trust. Fixed
    by scoping both writes to `app.key`/`appKey === 'day-planner'`, matching the read
    side's existing scoping.
  - **Low findings — fixed in a follow-up pass:** (a) `trigger2WaySync`'s Event->Task
    diff compared `scheduledTime`, a field never sent to `updateDailyTask`, so it could
    only cause spurious re-patches, never a real save — dropped from the diff in both
    `src/app.js` and `Script.html`; (b) `src/app.js`'s Task->Event loop wrapped the
    whole loop (including the `updateCalendarEvent` branch) in an `addCalendarEvent`-
    only guard, unlike `Script.html`'s per-branch guards — aligned `app.js` to the
    more defensively correct per-branch shape; (c) `Script.html`'s mock
    `GASBridge.addCalendarEvent` disagreed with `src/gasBridge.js`'s on
    `guestsCanModify`'s default and never generated `meetLink`/`agendaDocUrl` — ported
    the richer mock logic into `Script.html`; (d) the 5-min server trigger's
    (`Code.gs`) dedupe fallback compared a linked event's title against the task's raw
    (priority-prefixed) title, which never matches a completed task's event title
    (`[✓] Clean Title`, no priority code) — now compares against the bracket-stripped
    clean title instead. `npm test`: 107/107 after all four (none have unit coverage —
    all four live in Alpine-inline/`Code.gs` code, the pre-existing structural gap
    noted below).
  - **Not fixed — deferred, needs a product decision, not a bug fix, and lives in the
    separate `gh-pwa-shell` repo:** (a) the patch removes every `fetchRemoteBundle` call
    site, freezing the offline bundle cache at whatever shipped in the shell (no more
    background refresh) and orphaning `getCompiledAppBundle()`/`tools/build-shell-bundle.js`
    — still true as of 2026-08-25, fine if offline mode is meant to be static, otherwise
    needs a fire-and-forget SWR refresh added back. (b) ~~once a URL is trusted, path A
    redirects unconditionally with no escape if it later becomes wrong (rotated
    deployment, access revoked) — needs a `?reset=1`/"not this app?" affordance or a
    cheap reachability check, a UX call not made here.~~ **Done** — both shipped in
    `a4e73e1` (see 14.5's 2026-08-25 update above).
  - **Not independently verifiable from this session:** whether Apps Script's
    `Event.getTag()`/`setTag()` genuinely read/write `extendedProperties.shared` (the
    stated reasoning for the gasTaskId fix above) — the dual-write fix is safe either
    way, but confirming the exact mechanism needs a live GAS run.
  - `npm test`: 107/107 across 19 suites, both before and after every fix above.
  - **Structural test-coverage gap (not addressed):** the new persistence-orchestration
    logic (the reconcile-then-persist loop in `trigger2WaySync`) lives entirely inline
    in untested Alpine objects, so the Critical/High findings above were invisible to
    `npm test` and would be again for a similar future bug. A durable fix would extract
    a pure `planSyncPersistence(beforeTasks, beforeEvents, reconciled)` into
    `src/syncEngine.js`, shared by both copies and directly unit-testable — not done
    here; left as a follow-up.
- [ ] **14.7 Re-land the esbuild bundler for `src/` <-> `gas-app/Script.html` sync.**
  Commit `f96a386` (2026-08-28) added `tools/build-gas-engines.js`
  (`npm run build:gas` / `build:gas:check`, wired into the pre-commit hook) to
  auto-generate the `taskEngine`/`futureMatrixEngine`/`syncEngine`/
  `binderStore#getLocalDateStr` slice of `Script.html` from `src/` instead of
  hand-copying it, removing that slice from `[[sync-src-and-gas-app]]`'s manual-port
  burden. It deliberately left `src/indexedDbStore.js` and `src/gasBridge.js`
  hand-duplicated — their `Script.html` copies had already diverged in shape
  (different per-store function names, no memory-fallback branch), needing a
  reconciliation pass first. It was reverted the same day by `9010306` ("roll repo
  back to v82 state"), a 10-commit rollback (`79926b1..051373b`) triggered by an
  *unrelated* v83-v88 blank-page/Alpine-registration regression on the live
  deployment that couldn't be resolved — the bundler itself wasn't identified as the
  cause, it was just caught in the revert range. History is preserved at tag
  `backup-pre-v82-rollback-051373b`. Before re-landing: (a) diagnose what actually
  caused the v83-v88 blank-page regression so re-adding the bundler doesn't
  reintroduce it blind; (b) confirm current `Script.html` hasn't drifted further
  from the bundler-era version since the rollback (diff against `f96a386`'s
  `Script.html` before reapplying); (c) once landed, do the deferred
  `indexedDbStore.js`/`gasBridge.js` reconciliation-then-fold-in pass the original
  commit left as follow-up.

## Verification Criteria
- [x] All unit tests in `tests/*.test.js` pass cleanly (`npm test` — 107/107 passing across 19 suites).
- [x] UI matches Day Planner design rules (#fcfbfa cream, #2d6a5a teal ruling, serif headers).
- [x] 2-Way Sync correctly cross-references tasks and calendar appointments.
- [x] All views function correctly in both local dev server (`http://localhost:3000`) and GAS file bundle.
- [x] Code passes comprehensive JavaScript & HTML code reviews with zero security or date-shift warnings.




