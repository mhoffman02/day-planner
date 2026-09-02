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

Current: 173+ tests passing across 22+ suites (`npm test`).

## Verification Criteria (standing, re-check after any significant change)
- [ ] `npm test` passes cleanly with no skips.
- [ ] UI matches Day Planner design rules (`#fcfbfa` cream, `#2d6a5a` teal, serif headers, no
  pills — `.agents/rules/no-pills.md`).
- [ ] 2-way sync correctly cross-references tasks and calendar appointments.
- [ ] Views work in both local dev (`http://localhost:3000`) and the live GAS bundle.
- [ ] `npm run build:gas:check` / `build:shell:check` clean (no drift in generated files).

## Feature Backlog
- **Master Tasks has no offline cache.** `loadMasterTasks()` (`gas-app/Script.html`) calls
  `bridge.getMasterTasks()` directly on every load with no IndexedDB read/write around it, unlike
  daily tasks/notes which go through `idbGetDaily`/`idbSaveDaily` for stale-while-revalidate
  offline support. `IDB_STORE_MASTER_TASKS` exists in the schema (`src/indexedDbStore.js`,
  `gas-app/Script.html`) but nothing reads or writes it. Effect: opening the Master Tasks tab
  while offline shows an error instead of last-known data, and `addMasterTask`/
  `moveMasterTaskToDate` don't queue into the offline outbox the way daily task edits do. Added
  2026-09-02 during the master-task persistence work (see git log around that date for the
  commit that introduced the real Tasks-API-backed store this would cache).
- **`src/gasBridge.js` / `gas-app/Script.html`'s `GASBridge` reconciliation pass** (mock-data ID
  generation, `transferMasterTask` reimplementation) — still hand-duplicated per
  `.agents/rules/sync-src-and-gas-app.md`; folding into the `build:gas` esbuild step needs that
  reconciliation done first, not just wiring up the bundler.
- **`gas-app/Code.gs` has no unit test coverage** — it depends on live GAS globals (`CalendarApp`,
  `Tasks`, `DriveApp`) that would need a substantial mocking layer under `node --test`.
  `src/syncEngine.js`'s local model is the only tested version of that reconciliation logic.

## History
Phases 1-14 (initial build through full regression pass, security hardening, and the esbuild
engine-bundler re-land) are complete and checked off — see `git log` for the detailed commit
history rather than a duplicated changelog here.
