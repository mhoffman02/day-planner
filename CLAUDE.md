# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                # Run full suite: node --test tests/*.test.js (173 tests / 22 suites)
node --test tests/taskEngine.test.js   # Run a single test file
npm start               # Local preview server -> http://localhost:3000 (serves index.html, /src, /images)
npm run build:gas       # Regenerate gas-app/Script.html's generated engine block from src/ (esbuild)
npm run build:gas:check # Fail if that block is stale relative to src/ (pre-commit gate)
npm run build:shell       # Regenerate gh-pwa-shell/bundles.json from current gas-app/ (offline shell snapshot)
npm run build:shell:check # Fail if that snapshot is stale relative to gas-app/ (pre-commit gate)
npm run check:gas-html-safe-chars # Fail if gas-app/Script.html has a `//`/backtick/apostrophe HtmlService truncates on (pre-commit gate)
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

There is no lint-blocking build step for `src/*.js` itself — it's plain ES modules run directly
by Node's test runner and by the browser. There *is* a small build step (esbuild, see
`npm run build:gas` above) that compiles a subset of `src/*.js` into `gas-app/Script.html`; see
Architecture below and `.agents/rules/sync-src-and-gas-app.md`.

Live-browser smoke testing (local dev, or a real GAS `/dev`/`/exec` deployment):
```bash
node tools/ensure-chrome.js [url]      # once per session: launch/attach a real Chrome with a CDP debug port
node tools/e2e/smoke-test.js [url]     # confirms the app mounted, reports console errors, saves a screenshot
```
See "E2E / live-browser driver" below.

## Architecture

**Two runtime environments, one core logic layer.** `src/*.js` is the canonical implementation
(pure functions, unit-tested via `tests/*.test.js`). It runs in two places:

1. **Local Dev** — `server.js` serves `index.html` + `src/` directly; `src/gasBridge.js` detects
   it's not in Apps Script and falls back to a local mock data store.
2. **Production / GAS** — `gas-app/Script.html` contains this logic inline, because `HtmlService`
   cannot `import` ES modules. `src/taskEngine.js`, `src/futureMatrixEngine.js`,
   `src/syncEngine.js`, `src/indexedDbStore.js`, and `src/binderStore.js#getLocalDateStr` are
   compiled in by `npm run build:gas` (esbuild) into a generated block — do not hand-edit inside
   its `// === GENERATED begin/end ===` markers. `src/gasBridge.js` (`GASBridge` etc.) is still a
   **hand-duplicated inline copy** — its `Script.html` copy has diverged in behavior from `src/`
   (different mock-id generation, a reimplemented `transferMasterTask`), so folding it into the
   build requires reconciling that divergence first. `gasBridge` there calls `google.script.run`
   instead of the mock store.

`npm test` only ever exercises `src/`, never the GAS-side file directly. For the five
build-covered files, `npm run build:gas:check` (pre-commit gate) catches staleness — see
`.agents/rules/sync-src-and-gas-app.md`. For `gasBridge.js`, any change to shared logic must still
be hand-ported into `gas-app/Script.html`'s `GASBridge` class in the same change. Server-side
equivalents (`gasTaskId` tagging/sync) live in `gas-app/Code.gs` and must stay consistent with
`src/syncEngine.js`.

### Core engines (`src/`)

- `taskEngine.js` — `[A1]`–`[C9]` priority prefix parsing/formatting, status cycling (`✓`, `→`,
  `X`, `D/✓`, `•`), master-task-to-daily-task transfer.
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
- **Notes hyperlinks**: `[[link:URL]]text[[/link]]` markup (Ctrl+K or the toolbar Link button).
  Pasting a bare Google Docs/Sheets/Slides/Forms/Drive URL into a note line ("smart paste")
  auto-resolves its title via `resolveDriveFileTitle()` in `Code.gs`, which needs the separate
  `drive.readonly` scope (see Key gotchas) since it reads files the app didn't create — unlike
  every other Drive access in this app, which stays under `drive.file`.
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
`npm run build:shell`/`build:shell:check` keep `gh-pwa-shell/bundles.json` (the offline-first
snapshot the shell mounts by default) from silently drifting out of sync with `gas-app/`'s
UI — see `.agents/rules/sync-gas-app-and-shell-bundle.md`.

### E2E / live-browser driver (`tools/ensure-chrome.js`, `tools/e2e/`)

A dependency-free Chrome DevTools Protocol driver for smoke-testing a change in a real browser —
local dev (`http://localhost:3000`) or a live GAS `/dev`/`/exec` URL. `tools/ensure-chrome.js`
launches (or reuses) a plain, non-headless `chrome.exe` with a CDP debug port and a persistent
profile — deliberately **not** Puppeteer/Playwright's `launch()`, since that sets
`--enable-automation` / `navigator.webdriver`, which is what trips Google's sign-in
"this browser may not be secure" block. Log into Google manually once in the window it opens; the
profile persists across runs. `tools/e2e/cdp-client.js` then attaches over the raw CDP WebSocket
(`connectCdp()`: navigate/evaluate/screenshot/getConsoleErrors/close), and
`tools/e2e/smoke-test.js` is the ready-made check built on it — loads a URL, confirms the app
mounted, reports console errors, saves a screenshot.

A live GAS page is nested two frames deep — `script.google.com` embeds a
`*.googleusercontent.com` `userCodeAppPanel` document (its own CDP `iframe`-type target), which in
turn embeds `#userHtmlFrame`, a same-origin child iframe that does **not** get its own CDP target
and holds the actual `HtmlService` markup. `smoke-test.js` reaches it via
`document.getElementById('userHtmlFrame').contentDocument` from the outer iframe target's
execution context, retrying since first paint on a live GAS run is slower (multi-second) than a
plain page load. This tooling — not a one-off script — is the reusable path for any future
live-browser check against this app.

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

- OAuth scope for Daily Notes/app-created files must stay `drive.file`, never the broad `drive`
  scope (`gas-app/appsscript.json`). The one deliberate exception is `drive.readonly`, added
  solely so `resolveDriveFileTitle()` can read the title of a pasted Docs/Sheets/Slides/Forms/
  Drive link the app didn't create (Notes "smart paste") — don't widen that further to `drive`.
- Date arithmetic must avoid `.toISOString()` on local dates — use local y/m/d math (see `binderStore.js`).
- `target="_blank"` links must carry `rel="noopener noreferrer"`.
- Use `slice()`, not the deprecated `String.prototype.substr()`.
