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
| Accessibility & WCAG Linter | `tools/check-accessibility.js` | WCAG 2.1 AA contrast math & ARIA semantics linter | `tests/accessibility.test.js` |

Current: `npm test` for the up-to-date count/suite total (307 tests across 38 suites).

## Verification Criteria (standing, re-check after any significant change)
- [x] `npm test` passes cleanly with no skips.
- [x] UI matches Day Planner design rules (`#fcfbfa` cream, `#2d6a5a` teal, serif headers, no
  pills — `.agents/rules/no-pills.md`).
- [x] 2-way sync correctly cross-references tasks and calendar appointments.
- [x] Views work in both local dev (`http://localhost:3000`, mock mode) and the live GitHub Pages
  deployment (`https://mhoffman02.github.io/day-planner/`, real Google sign-in).
- [x] `npm run build:sw:check` clean (sw.js cache-version not stale).
- [x] `node tools/check-accessibility.js` clean (zero WCAG contrast or ARIA violations).

## Feature Backlog
- ~~End-of-Session /handoff Skill & Targeted Staging Tooling~~ **Done (2026-09-07).**
  Adapted \`/handoff\` skill from \`maximo-uat\` into \`day-planner\`: created \`.agents/skills/handoff/SKILL.md\`
  (mirrored to \`.claude\` and \`.kilo\`), updated \`tools/handoff.js\` with tracked file writes, targeted
  staging (committing only files written by handoff), leftover uncommitted file reporting, and dropped
  session item recovery from previous \`HANDOFF_PROMPT.md\`.
- ~~Master Tasks Drive Persistence / Outbox Sync~~ **Done (2026-09-07).**
  Undated master tasks now have dedicated Drive REST archive persistence (`Day Planner/master-tasks.json`),
  live fallback on Tasks API failure, IndexedDB offline caching, inline Quick Add form, and full offline
  outbox queueing/replay (`ADD_MASTER_TASK`, `UPDATE_MASTER_TASK`, `MOVE_MASTER_TASK`, `SAVE_MASTER_TASKS_ARCHIVE`)
  with automatic tempId resolution and star/move sync.
- ~~Continuous Doc Accordion Parsing (Option 2 Mode)~~ **Done (2026-09-07).**
  Integrated reversible section parsing (`parseDailyNoteToSections` and `serializeSectionsToDailyNote`) in
  `src/indexParser.js`, preserving stable section IDs, headings, categories, collapse states, and top-level date
  headings. Added interactive H3 collapsible accordions, lined notebook paper styling, inline line-editing,
  and section additions for Option 2 mode.
- ~~Automated Accessibility Testing (WCAG 2.1 AA Contrast & ARIA Linters)~~ **Done (2026-09-07).**
  Added `tools/check-accessibility.js` and `tests/accessibility.test.js` implementing WCAG 2.1 AA color contrast
  ratio calculations across all theme tokens and semantic ARIA validation on `index.html`. Enforced automatically
  via pre-commit git hook and `npm run lint:a11y`.
- ~~Master Tasks has no offline cache.~~ **Done (2026-09-04).** `loadMasterTasks()`
  (`src/app.js`) is now offline-first: `IndexedDbStore.idbGetMasterTasks()` applies any cached
  list immediately (single fixed cache key, since `getMasterTasks()`'s `monthYearStr` param is
  inert — the backend always returns the same global undated-task list regardless of month), then
  refreshes live and re-caches via `idbSaveMasterTasks()`; `errorMessage` is only set when there's
  no cache to fall back on. New `idbGetMasterTasks`/`idbSaveMasterTasks` exports added to
  `src/indexedDbStore.js`. Tests in `tests/indexedDbStore.test.js`. Outbox-queueing for
  `addMasterTask`/`moveMasterTaskToDate` was intentionally left out of scope — see below.
- ~~`src/gasBridge.js` / `gas-app/Script.html`'s `GASBridge` reconciliation pass~~ /
  ~~`gas-app/Code.gs` has no unit test coverage~~ **Deleted 2026-09-04, reinstated 2026-09-09** —
  see below; note kept for history, no longer accurate as "resolved by deletion."
- ~~`gas-app/` reinstated for .gov Workspace access~~ **Done (2026-09-09).** Restored
  `gas-app/` (GAS-served web app) from `02dd287`, the last commit before its Sep 4 deletion, to
  run alongside the GitHub Pages PWA — the work .gov Workspace's API Controls block REST+GIS
  OAuth, but trust Apps Script's own first-party `ScriptApp` auth already. `tools/build-gas-engines.js`
  regenerates `gas-app/Script.html`'s engine block from current `src/` (taskEngine/futureMatrixEngine/
  syncEngine/indexedDbStore), so pure-logic improvements from the 46 post-removal commits are
  already current with zero manual porting; UI-only fixes in those commits don't apply since
  gas-app's hand-written `Index.html`/`Script.html`/`PicoCSS.html` diverged from the PWA's
  `index.html`/`styles.css` at removal time — treat any specific missing UI feature as its own
  small request against gas-app's real markup, not a bulk backport. Restored GAS-aware eslint/
  pre-commit gates (engine-bundle drift check, `HtmlService` unsafe-char check) and added
  home-screen meta tags (`apple-touch-icon`, `apple-mobile-web-app-capable`) to `Index.html` —
  full PWA installability isn't possible there since the sandboxed `script.google.com` iframe
  can't register a service worker. `clasp login`/`clasp push` to actually deploy is a manual
  follow-up, not yet done.
- ~~`src/gasBridge.js`'s dead `window.google.script.run`/`_runGasCall` fallback branches~~ /
  ~~`tools/e2e/smoke-test.js`'s GAS-iframe-nesting detection~~ **Done (2026-09-05).** Both
  mechanical cleanup passes landed: `gasBridge.js` dropped `_runGasCall()` and ~15 dead
  branches (mock/REST paths only now); `smoke-test.js` dropped the `userCodeAppPanel`/
  `#userHtmlFrame` iframe detection (137→82 lines, always queries `document` directly).
- ~~Dual-CLI Blended Multi-Model Workflow & Symmetric Headless Protocol~~ **Done (2026-09-06).**
  Added symmetric AGY ↔ Claude Code headless-invocation contract (`.agents/rules/cross-cli-headless-invocation.md`,
  `.agents/rules/dual-cli-blended-workflow.md`), reciprocal one-shot delegation commands
  (`/consult-agy` and `/consult-claude`), agent bridge (`tools/agent-bridge.js`), deterministic
  ESM relative import specifier checker (`tools/check-esm-imports.js`), pre-commit enforcement,
  and CLI-to-CLI Opus advisor routing without API keys.

## History
Phases 1-14 (initial build through full regression pass, security hardening, and the esbuild
engine-bundler re-land) are complete and checked off — see `git log` for the detailed commit
history rather than a duplicated changelog here.
