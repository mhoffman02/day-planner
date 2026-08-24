# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run full suite: node --test tests/*.test.js (66 tests / 18 suites)
node --test tests/taskEngine.test.js   # Run a single test file
npm start             # Local preview server -> http://localhost:3000 (serves index.html, /src, /images)
```

Deploying to the live Google Apps Script backend:
```bash
cd gas-app
clasp push --force
clasp deploy -i AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4 --description "Release notes here"
```
**Always pass `-i <deploymentId>`** — omitting it mints a brand-new deployment (and a new
`/exec` URL) instead of updating the pinned `day-planner-v01` deployment that
`gh-pwa-shell`'s allowlist and built-in launch button are wired to. See
`.agents/rules/gas-deploy-pinned.md`.

There is no build/lint step — `src/*.js` are plain ES modules run directly by Node's test runner and by the browser.

## Architecture

**Two runtime environments, one core logic layer.** `src/*.js` is the canonical implementation
(pure functions, unit-tested via `tests/*.test.js`). It runs in two places:

1. **Local Dev** — `server.js` serves `index.html` + `src/` directly; `src/gasBridge.js` detects
   it's not in Apps Script and falls back to a local mock data store.
2. **Production / GAS** — `gas-app/Script.html` contains a **hand-duplicated inline copy** of the
   same logic (`taskEngine`, `gasBridge`, etc.), because `HtmlService` cannot `import` ES modules.
   `gasBridge` there calls `google.script.run` instead of the mock store.

**There is no build step syncing the two.** `npm test` only ever exercises `src/`. Any change to
shared logic in `src/taskEngine.js`, `src/gasBridge.js`, or another `src/*.js` engine whose
behavior is duplicated in `gas-app/Script.html` must be hand-ported into `gas-app/Script.html` in
the same change — see `.claude/rules/sync-src-and-gas-app.md` for the required workflow. Server-side
equivalents (`gasTaskId` tagging/sync) live in `gas-app/Code.gs` and must stay consistent with
`src/syncEngine.js`.

### Core engines (`src/`)

- `taskEngine.js` — `[A1]`–`[C9]` priority prefix parsing/formatting, status cycling (`✓`, `→`,
  `X`, `G/✓`, `•`), master-task-to-daily-task transfer.
- `calendarEngine.js` — 07:00–19:00 time grid, event popup modal payload generation.
- `syncEngine.js` — 2-way Task ↔ Calendar reconciliation logic (idempotent; tags events with
  `gasTaskId` to link them to tasks).
- `indexParser.js` — extracts `#index [Topic] Summary` lines from daily notes for the monthly index.
- `searchEngine.js` — cross-service universal search (Ctrl+K).
- `binderStore.js` — SPA view router / date navigation store. Uses pure local y/m/d arithmetic
  (`new Date(y, m - 1, d + delta)`), never `.toISOString()`, to avoid UTC day-shift bugs.
- `gasBridge.js` — the dual-execution adapter described above.
- `indexedDbStore.js` / `shellLoader.js` — client-side offline cache and PWA shell bootstrap (see
  Shell architecture below).
- `app.js` — Alpine.js app wiring for local/browser preview.

### Data storage model

- **Tasks**: Google Tasks API.
- **Appointments**: Google Calendar (`CalendarApp`), 07:00–19:00 grid, Meet links.
- **Daily Notes**: partitioned monthly JSON (`Day Planner/notes-YYYY-MM.json`) in Google Drive
  (`drive.file` scope only — never the broad `drive` scope, to keep access sandboxed to
  app-created files). Not per-day Google Docs.
- **Meeting Agenda Docs**: when creating a calendar event with `autoAgendaDoc` enabled, `Code.gs`
  auto-generates a structured Google Doc (objectives, attendees, Meet link, action items) via
  `DocumentApp` — this is the only current use of Google Docs; it's unrelated to daily notes.
- **Client cache**: browser IndexedDB with an offline outbox queue, stale-while-revalidate.

### `gas-app/` (clasp project, deploys to Apps Script)

- `Code.gs` — server entry point (`doGet`), 2-way sync background trigger
  (`setup2WaySyncTrigger()`, runs every 5 min), and the bundle-export endpoint used by the PWA shell.
- `Script.html` — Alpine.js reactive components/handlers (the inline-duplicated `src/` logic lives here).
- `Index.html` / `Styles.html` / `About.html` — SPA shell, parchment/teal design system, static about card.
- `UnitTests.gs` — self-test diagnostics, reachable at `<deployment>/dev/self-test`, checking Drive
  folder access, Tasks API, CalendarApp tagging, Docs creation, and sync trigger health.

### Universal PWA Shell (`gh-pwa-shell/`)

A **separate git repository** (nested `.git`) for `mhoffman02.github.io/shell`, a generic public
loader that mounts private GAS app bundles into a `<div id="app-root">` via IndexedDB. Day Planner
never gets its own GitHub Pages site — this shell is the only public host, keeping proprietary UI
and logic inside the private GAS backend. Full design rationale, the `getCompiledAppBundle()`
backend contract, and the `BUILTIN_BUNDLES` CORS workaround (direct cross-origin fetch to a GAS
`doGet` endpoint fails — see `shell-gas-pattern.md` §9) are documented in `shell-gas-pattern.md`.
`tools/build-shell-bundle.js` and `tools/sync-gas-vendor.js` support this pipeline.

## Shared agent config (`.agents/`)

`.agents/{rules,commands,skills}` is the single hand-edited source of truth for guidance
shared across Claude Code, Kilo Code, and Gemini CLI. Never edit `.claude/rules/`,
`.claude/commands/`, `.claude/skills/`, or `.kilo/{skills,workflows}` directly — they are
generated real-file mirrors (not symlinks — symlinks silently degrade to plain-text stub
files on Windows checkouts without Developer Mode, which both breaks the tool locally and
corrupts the tracked blob for every other clone on that machine's next commit). After
editing anything under `.agents/`, run `npm run sync:agents` to regenerate the mirrors;
`npm run sync:agents:check` (wired into the pre-commit hook) fails the commit if they've
drifted. Kilo Code's rules specifically need no mirror at all — `kilo.jsonc`'s
`instructions` array points straight at `.agents/rules/*.md`. Gemini CLI has no
rules-directory concept; it gets the same content via `GEMINI.md`'s `@CLAUDE.md` import
(Gemini's own supported `@path` memory-import mechanism, not Claude-file auto-discovery —
Gemini CLI does not natively read `CLAUDE.md`). To activate the tracked cross-machine hook
(`.githooks/pre-commit`) on a new clone, run once: `git config core.hooksPath .githooks`.

## Key gotchas (see README.txt §5 for the full list)

- OAuth scope must stay `drive.file`, not `drive` (`gas-app/appsscript.json`).
- Date arithmetic must avoid `.toISOString()` on local dates — use local y/m/d math (see `binderStore.js`).
- `target="_blank"` links must carry `rel="noopener noreferrer"`.
- Use `slice()`, not the deprecated `String.prototype.substr()`.
