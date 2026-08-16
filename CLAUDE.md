# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Franklin-Google Digital Day Planner: a single-page digital binder app that bridges the
Franklin Covey daily-planner methodology (A1-C9 prioritized tasks, status codes, daily
notes, monthly index) with Google Workspace (Calendar, Tasks, Docs, Drive). Ships as a
Google Apps Script (GAS) Standalone Web App. Full details/vision: `PRD.md`. Feature/test
progress tracker: `PLAN.md`. Deep operational notes and gotchas: `README.txt` (read this
before making backend or sync changes).

## Commands

- `npm test` — runs the full unit test suite (`node --test tests/*.test.js`). No build step.
- `node --test tests/taskEngine.test.js` — run a single test file.
- `node server.js` — local preview server at http://localhost:3000, serves `gas-app/Index.html`
  with includes stitched in (see Local Dev Server below).
- Deploy to the live GAS project (from `gas-app/`): `clasp push --force` then
  `clasp deploy --description "..."`.

## Architecture: two runtime environments, one core logic layer

The app runs in two places that must stay behaviorally consistent:

1. **Production (GAS)**: `gas-app/Code.gs` is the server (`doGet()` entry point), calling
   `CalendarApp`, `Tasks`/`TasksApp`, `DocumentApp`, `DriveApp`, `SpreadsheetApp`. The client
   is `gas-app/Index.html` + `gas-app/Styles.html` + `gas-app/Script.html`, an Alpine.js SPA.
2. **Local dev/test (Node)**: `src/*.js` are ES modules with pure, framework-free logic,
   covered by `tests/*.test.js` (`node:test`). `server.js` serves the same `gas-app/` HTML
   files locally for browser preview, with a mock data bridge instead of real GAS calls.

### The duplication gotcha (important)

Apps Script's `HtmlService` cannot `import` ES modules, so the core logic in `src/*.js`
(task parsing/status/sorting in `taskEngine.js`, the `GASBridge` mock/adapter class, etc.)
is **hand-duplicated inline** inside `gas-app/Script.html` (see the top of that file —
`parseTaskTitle`, `formatTaskTitle`, `getNextStatus`, the `GASBridge` class). `server.js`
instead injects the real `src/gasBridge.js` at request time by string-replacing an include
directive, so local preview always uses the canonical module.

**When you change logic in `src/taskEngine.js`, `src/gasBridge.js`, or similar shared
engines, you must manually port the equivalent change into `gas-app/Script.html`** (and,
for server-side equivalents like the sync/tag logic, into `gas-app/Code.gs`). There is no
automated sync between them — `npm test` only exercises `src/`, not the GAS-side copies.

### `src/` module map

| Module | Responsibility |
| --- | --- |
| `taskEngine.js` | `[A1]`-style priority prefix parsing/formatting, status cycling (`•`→`✓`→`→`→`X`→`G/✓`), task sorting, sequence assignment, master→daily task transfer |
| `calendarEngine.js` | 07:00–19:00 schedule grid generation, mapping events onto grid slots, event popup modal payload, monthly calendar grid |
| `syncEngine.js` | 2-way Task↔Calendar Event linkage/reconciliation (mirrors the `gasTaskId` tag scheme used server-side in `Code.gs`) |
| `indexParser.js` | Extracts `#index [Topic] Summary` lines from daily notes and aggregates them into the monthly index |
| `searchEngine.js` | Universal search (`Ctrl+K`) across tasks, calendar events, notes, and index entries |
| `binderStore.js` | SPA view/router state: active binder tab (5 views) and date navigation |
| `gasBridge.js` | `GASBridge` class — routes calls through `google.script.run` in production, or an in-memory mock store when `useMock`/no `window.google.script.run` (local preview & tests) |

### GAS backend (`gas-app/`)

- `Code.gs`: `doGet()` routes between the main binder UI, the Drive-folder setup flow
  (`renderSetupFolderPage`), and the `/self-test` diagnostics endpoint based on `e.pathInfo`
  / query params. `include(filename)` inlines the other HTML files as GAS templates
  (`<?!= include('Script'); ?>` etc. — see `server.js` for the Node-side equivalent).
  Also owns `syncWorkspaceChanges()` and the time-driven trigger (`ensure2WaySyncTriggerInstalled`,
  every 5 min) that reconciles Tasks/Calendar via a custom `gasTaskId` tag
  (`evt.setTag('gasTaskId', task.id)` / `evt.getTag(...)`).
- `UnitTests.gs`: server-side self-test suite exercising Drive/Tasks/Calendar/Docs access and
  sync-trigger health, rendered as an HTML report at the `/self-test` path.
- `appsscript.json`: manifest. OAuth scopes intentionally use
  `https://www.googleapis.com/auth/drive.file` (not the broad `drive` scope) — this restricts
  Drive access to files/folders the app itself creates or opens (`/Day Planner/YYYY/MM/`).
  Do not widen this scope without a specific reason.
- `.clasp.json` targets the live Apps Script project; `clasp_ref/` (gitignored) is scratch
  space for clasp, not source.

### Local dev server (`server.js`)

Plain `node:http` server with no framework. On `GET /`, it reads `gas-app/Index.html` and
does textual replacement of the same `<?!= include('X'); ?>` directives GAS would evaluate
server-side, substituting `Styles.html`, `About.html`, and `Script.html` (with the real
`src/gasBridge.js` injected ahead of `Script.html`'s own code, exposed as `window.GASBridge`).
There's no live-reload — restart `node server.js` after editing `gas-app/` files.
