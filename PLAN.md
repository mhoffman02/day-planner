# Development Plan: Google Digital Day Planner

## Project Overview
The **Google Digital Day Planner** is a single-page digital binder app styled in classic Day
Planner aesthetic (forest/teal ruling, cream background, serif headers), bridging Day Planner
productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive) via full 2-way
synchronization. Static client-only app: no server-side backend, hosted directly on GitHub Pages.

## Technical Stack & Architecture
- **Auth & Data**: Client-side Google Identity Services (GIS) OAuth (`src/googleAuth.js`); the
  browser calls Calendar/Tasks/Drive/Docs REST APIs directly (`src/gasBridge.js`) — no server
  sits between the browser and Google's APIs.
- **Frontend**: `index.html` + `src/app.js`, Alpine.js reactive SPA.
- **Local Testing**: Node test harness (`node --test`) against `src/*.js` with GIS/`fetch` mocked;
  `server.js` for local preview (mock-data mode, no OAuth needed).
- See `CLAUDE.md` for the full architecture writeup — not re-derived here.

## Modular Architecture & Test Suite Map
| Module | Location | Description | Test File |
| :--- | :--- | :--- | :--- |
| Task Engine | `src/taskEngine.js` | Priority prefix parsing, status cycling, master→daily transfer | `tests/taskEngine.test.js` |
| Calendar & Schedule | `src/calendarEngine.js` | 07:00-19:00 grid, event popup payloads | `tests/calendarEngine.test.js` |
| 2-Way Sync Engine | `src/syncEngine.js` | Task↔Event reconciliation via `gasTaskId` | `tests/syncEngine.test.js` |
| Index Parser | `src/indexParser.js` | `#index` tag extraction for monthly index | `tests/indexParser.test.js` |
| Universal Search | `src/searchEngine.js` | Cross-entity search (Ctrl+K) | `tests/searchEngine.test.js` |
| Navigation & State | `src/binderStore.js` | View router, local-date-safe navigation | `tests/binderStore.test.js` |
| Google Workspace REST Bridge | `src/gasBridge.js` | Mock backend + REST adapter to Calendar/Tasks/Drive/Docs | `tests/gasBridge.test.js` |
| Google Auth | `src/googleAuth.js` | Client-side Google Identity Services OAuth | `tests/googleAuth.test.js` |
| Offline Cache | `src/indexedDbStore.js` | IndexedDB store + outbox queue | `tests/indexedDbStore.test.js` |

Current: `npm test` for the up-to-date count/suite total.

## Verification Criteria (standing, re-check after any significant change)
- [x] `npm test` passes cleanly with no skips.
- [x] UI matches Day Planner design rules (`#fcfbfa` cream, `#2d6a5a` teal, serif headers, no
  pills — `.agents/rules/no-pills.md`).
- [x] 2-way sync correctly cross-references tasks and calendar appointments.
- [x] Views work in both local dev (`http://localhost:3000`, mock mode) and the live GitHub Pages
  deployment (`https://mhoffman02.github.io/day-planner/`, real Google sign-in).
- [x] `npm run build:sw:check` clean (sw.js cache-version not stale).

## Feature Backlog
- ~~Master Tasks has no offline cache.~~ **Done (2026-09-04).** `loadMasterTasks()`
  (`src/app.js`) is now offline-first: `IndexedDbStore.idbGetMasterTasks()` applies any cached
  list immediately (single fixed cache key, since `getMasterTasks()`'s `monthYearStr` param is
  inert — the backend always returns the same global undated-task list regardless of month), then
  refreshes live and re-caches via `idbSaveMasterTasks()`; `errorMessage` is only set when there's
  no cache to fall back on. New `idbGetMasterTasks`/`idbSaveMasterTasks` exports added to
  `src/indexedDbStore.js`. Tests in `tests/indexedDbStore.test.js`. Outbox-queueing for
  `addMasterTask`/`moveMasterTaskToDate` was intentionally left out of scope — see below.
- ~~`src/gasBridge.js` / `gas-app/Script.html`'s `GASBridge` reconciliation pass~~ /
  ~~`gas-app/Code.gs` has no unit test coverage~~ **Resolved by deletion (2026-09-04).**
  `gas-removal-static-client` Stage 5 deleted `gas-app/` entirely — `src/gasBridge.js`'s REST
  implementation is now the only copy of this logic, so there's nothing left to reconcile or
  duplicate test coverage for.
- Known follow-up, not yet done: `src/gasBridge.js` still carries ~15 dead
  `window.google.script.run`/`_runGasCall` fallback branches from the pre-REST era. They're
  inert (never reachable — there's no GAS runtime left to call) but not yet stripped; a
  mechanical cleanup pass, not urgent.
- Known follow-up, not yet done: `tools/e2e/smoke-test.js` still carries GAS-iframe-nesting
  detection logic (`userCodeAppPanel`/`#userHtmlFrame`) from when the only Google-authenticated
  target was a live GAS deployment. It degrades gracefully for the current plain static site
  (falls through to `document` directly) but is now dead complexity worth simplifying.

## History
Phases 1-14 (initial build through full regression pass, security hardening, and the esbuild
engine-bundler re-land) are complete and checked off — see `git log` for the detailed commit
history rather than a duplicated changelog here.
