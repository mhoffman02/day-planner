# Development Plan: Google Digital Day Planner (GAS)

## Project Overview
The **Google Digital Day Planner** is a single-page digital binder app styled in classic Day
Planner aesthetic (forest/teal ruling, cream background, serif headers), bridging Day Planner
productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive) via full 2-way
synchronization.

## Technical Stack & Architecture
- **Backend / GAS**: Google Apps Script (`gas-app/Code.gs`) — `doGet()` entry, Workspace API
  integrations (`CalendarApp`, `Tasks` Advanced Service, `DriveApp` for notes JSON, `DocumentApp`
  for meeting agenda docs), time-driven 2-way sync trigger.
- **Frontend Binder Shell**: `gas-app/{Index,Styles,Script}.html`, Alpine.js reactive SPA.
- **Local Testing**: Node test harness (`node --test`) against `src/*.js` with mock GAS services;
  `server.js` for local preview.
- See `CLAUDE.md` for the full architecture writeup (two-runtime split, generated vs.
  hand-duplicated `gas-app/` sync, data storage model) — not re-derived here.

## Modular Architecture & Test Suite Map
| Module | Location | Description | Test File |
| :--- | :--- | :--- | :--- |
| Task Engine | `src/taskEngine.js` | Priority prefix parsing, status cycling, master→daily transfer | `tests/taskEngine.test.js` |
| Calendar & Schedule | `src/calendarEngine.js` | 07:00-19:00 grid, event popup payloads | `tests/calendarEngine.test.js` |
| 2-Way Sync Engine | `src/syncEngine.js` | Task↔Event reconciliation via `gasTaskId` | `tests/syncEngine.test.js` |
| Index Parser | `src/indexParser.js` | `#index` tag extraction for monthly index | `tests/indexParser.test.js` |
| Universal Search | `src/searchEngine.js` | Cross-entity search (Ctrl+K) | `tests/searchEngine.test.js` |
| Navigation & State | `src/binderStore.js` | View router, local-date-safe navigation | `tests/binderStore.test.js` |
| GAS API Bridge | `src/gasBridge.js` | Mock backend + `google.script.run` adapter | `tests/gasBridge.test.js` |
| Offline Cache | `src/indexedDbStore.js` | IndexedDB store + outbox queue | `tests/indexedDbStore.test.js` |

Current: 230 tests passing across 23 suites (`npm test`).

## Verification Criteria (standing, re-check after any significant change)
- [x] `npm test` passes cleanly with no skips.
- [x] UI matches Day Planner design rules (`#fcfbfa` cream, `#2d6a5a` teal, serif headers, no
  pills — `.agents/rules/no-pills.md`).
- [x] 2-way sync correctly cross-references tasks and calendar appointments.
- [x] Views work in both local dev (`http://localhost:3000`) and the live GAS bundle.
- [x] `npm run build:gas:check` / `build:shell:check` clean (no drift in generated files).

## Feature Backlog
- ~~Master Tasks has no offline cache.~~ **Done (2026-09-04).** `loadMasterTasks()`
  (`src/app.js`) is now offline-first: `IndexedDbStore.idbGetMasterTasks()` applies any cached
  list immediately (single fixed cache key, since `getMasterTasks()`'s `monthYearStr` param is
  inert — the backend always returns the same global undated-task list regardless of month), then
  refreshes live and re-caches via `idbSaveMasterTasks()`; `errorMessage` is only set when there's
  no cache to fall back on. New `idbGetMasterTasks`/`idbSaveMasterTasks` exports added to
  `src/indexedDbStore.js` and wired into `gas-app/Script.html`'s generated engine block via
  `tools/gas-build/engines-entry.js` (`npm run build:gas`). Tests in `tests/indexedDbStore.test.js`.
  Outbox-queueing for `addMasterTask`/`moveMasterTaskToDate` was intentionally left out of scope —
  see below.
- ~~`src/gasBridge.js` / `gas-app/Script.html`'s `GASBridge` reconciliation pass~~ **Marked
  obsolete (2026-09-04), not implemented.** This branch's own migration plan
  (`gas-removal-static-client`, Stage 5) deletes `gas-app/` entirely once the static-client
  rewrite cuts over — `src/gasBridge.js` is already a full REST implementation talking directly
  to Google APIs, superseding the old `google.script.run` bridge this item was written against.
  Hand-porting reconciliation work into code slated for deletion isn't worth doing; the
  live/mock-mode divergence in `gas-app/Script.html`'s `GASBridge` (and its `addMasterTask`/
  `moveMasterTaskToDate` outbox gap, above) go away with the rest of `gas-app/` at cutover instead.
- ~~`gas-app/Code.gs` has no unit test coverage~~ **Marked obsolete (2026-09-04), not
  implemented.** Same reasoning: `Code.gs` is deleted at Stage 5 cutover, so building a GAS-globals
  mocking harness for it is effort spent on code with no future. `src/syncEngine.js`'s already-
  tested local model is the logic that survives the migration.

## History
Phases 1-14 (initial build through full regression pass, security hardening, and the esbuild
engine-bundler re-land) are complete and checked off — see `git log` for the detailed commit
history rather than a duplicated changelog here.
