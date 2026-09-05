# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                # Run full suite: node --test tests/*.test.js
node --test tests/taskEngine.test.js   # Run a single test file
npm start               # Local preview server -> http://localhost:3000 (serves index.html, /src, /images)
npm run build:sw        # Regenerate sw.js's CACHE_NAME hash from current cached asset contents
npm run build:sw:check  # Fail if that hash is stale relative to the cached assets (pre-commit gate)
```

There is no build step for `src/*.js` — it's plain ES modules, served as-is by GitHub Pages,
`server.js` (local dev), and run directly by Node's test runner. The one generated artifact is
`sw.js`'s `CACHE_NAME`, a content hash kept in sync by `npm run build:sw` (see `sw.js`'s header
comment).

Live-browser smoke testing (local dev, or the live GitHub Pages deployment, when the flow needs a
real Google sign-in):
```bash
node tools/ensure-chrome.js [url]      # once per session: launch/attach a real Chrome with a CDP debug port
node tools/e2e/smoke-test.js [url]     # confirms the app mounted, reports console errors, saves a screenshot
```
See "E2E / live-browser driver" below.

## Architecture

**Static client-only app — one runtime, no server-side backend.** `src/*.js` is the canonical
implementation (pure functions, unit-tested via `tests/*.test.js`) and it's also exactly what
ships: no build/transpile step, no server-side duplicate to keep in sync. It runs in two modes,
both using the same code:

1. **Local Dev** — `server.js` serves `index.html` + `src/` directly at `http://localhost:3000`.
   No `window.DAY_PLANNER_GOOGLE_CLIENT_ID` is required here; `src/gasBridge.js` falls back to a
   local in-memory mock data store so the whole app is usable offline with fake data.
2. **Production** — a plain static site on GitHub Pages
   (`https://mhoffman02.github.io/day-planner/`). `index.html` sets
   `window.DAY_PLANNER_GOOGLE_CLIENT_ID` to a real OAuth Web client ID (Google Cloud Console; see
   `docs/google-cloud-oauth-setup-guide.md`). `src/googleAuth.js` drives Google Identity Services
   (GIS) sign-in and hands `src/gasBridge.js` a live access token, which it uses to call Google's
   Calendar/Tasks/Drive/Docs REST APIs directly from the browser — no server of any kind sits
   between the browser and Google's APIs.

`npm test` exercises `src/` directly with GIS/`fetch` mocked — there is no second copy of this
logic anywhere else to drift out of sync with.

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
- `gasBridge.js` — REST bridge to Google's Calendar/Tasks/Drive/Docs APIs (real mode) with a
  local mock-data fallback (mock mode / signed out). See "Data storage model" below.
- `googleAuth.js` — client-side Google Identity Services (GIS) OAuth: sign-in/out, access-token
  management, in-memory + `sessionStorage`-backed token cache.
- `indexedDbStore.js` / `shellLoader.js` — client-side offline cache and PWA shell bootstrap.
- `app.js` — Alpine.js app wiring, wired to both local dev and production.

### Data storage model

- **Tasks**: Google Tasks API.
- **Appointments**: Google Calendar API, 07:00–19:00 grid, Meet links.
- **Daily Notes**: partitioned monthly JSON (`Day Planner/notes-YYYY-MM.json`) in Google Drive
  (`drive.file` scope only — never the broad `drive` scope, to keep access sandboxed to
  app-created files). Not per-day Google Docs.
- **Meeting Agenda Docs**: when creating a calendar event with `autoAgendaDoc` enabled,
  `src/gasBridge.js`'s `addCalendarEventRest` auto-generates a structured Google Doc (objectives,
  attendees, Meet link, action items) via the Docs REST API — this is the only current use of
  Google Docs; it's unrelated to daily notes.
- **Notes hyperlinks**: `[[link:URL]]text[[/link]]` markup (Ctrl+K or the toolbar Link button).
  Pasting a bare Google Docs/Sheets/Slides/Forms/Drive URL into a note line ("smart paste")
  auto-resolves its title via `resolveLinkTitleRest()` in `src/gasBridge.js`, which needs the
  separate `drive.readonly` scope (see Key gotchas) since it reads files the app didn't create —
  unlike every other Drive access in this app, which stays under `drive.file`.
- **Client cache**: browser IndexedDB with an offline outbox queue, stale-while-revalidate.

### E2E / live-browser driver (`tools/ensure-chrome.js`, `tools/e2e/`)

A dependency-free Chrome DevTools Protocol driver for smoke-testing a change in a real browser —
local dev (`http://localhost:3000`, mock mode) or the live GitHub Pages deployment with a real
Google sign-in. `tools/ensure-chrome.js` launches (or reuses) a plain, non-headless `chrome.exe`
with a CDP debug port and a persistent profile — deliberately **not** Puppeteer/Playwright's
`launch()`, since that sets `--enable-automation` / `navigator.webdriver`, which is what trips
Google's sign-in "this browser may not be secure" block. Log into Google manually once in the
window it opens; the profile persists across runs. `tools/e2e/cdp-client.js` then attaches over
the raw CDP WebSocket (`connectCdp()`: navigate/evaluate/screenshot/getConsoleErrors/close), and
`tools/e2e/smoke-test.js` is the ready-made check built on it — loads a URL, confirms the app
mounted, reports console errors, saves a screenshot. This tooling — not a one-off script — is the
reusable path for any future live-browser check against this app. See
`.agents/rules/live-google-auth-browser-tool.md`.

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
Gemini CLI does not natively read `CLAUDE.md`). The tracked cross-machine hook
(`.githooks/pre-commit`) is wired up automatically by the `prepare` npm script (runs on
`npm install`, including a fresh clone or worktree) — no manual `git config core.hooksPath`
step needed anymore. `core.hooksPath` lives in the shared, non-worktree-specific `.git/config`,
so setting it once from any worktree activates it for the whole repo, all worktrees included.

## Key gotchas (see README.txt §5 for the full list)

- OAuth scope for Daily Notes/app-created files must stay `drive.file`, never the broad `drive`
  scope (`src/googleAuth.js`'s `GOOGLE_AUTH_SCOPES`). The one deliberate exception is
  `drive.readonly`, added solely so `resolveLinkTitleRest()` can read the title of a pasted
  Docs/Sheets/Slides/Forms/Drive link the app didn't create (Notes "smart paste") — don't widen
  that further to `drive`.
- Date arithmetic must avoid `.toISOString()` on local dates — use local y/m/d math (see `binderStore.js`).
- `target="_blank"` links must carry `rel="noopener noreferrer"`.
- Use `slice()`, not the deprecated `String.prototype.substr()`.
