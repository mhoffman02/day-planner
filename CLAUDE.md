# CLAUDE.md

This file provides core guidance to Claude Code (`claude.ai/code`) and AI agents working in this repository.

---

## 1. User Rules & Interaction Preferences

1. **Conciseness & Directness**: Default to short, direct answers. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `🔋Mike:`.
3. **Session Handoff**: Run the [`handoff`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) skill at the end of every session.
4. **Session Startup & Handoff Ingestion**: At the start of each new session:
   - Check the age and timestamp of [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) (or git commit timestamp of the latest handoff).
   - If it is **less than 10 minutes old**: Automatically read [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) and immediately execute the next queued tasks.
   - If it is **older than 10 minutes old**: Report to the user exactly how old the handoff is (e.g. minutes, hours, or days), explain potential staleness (e.g. code drift, uncommitted changes, or work performed since the handoff was written), and explicitly ask: *"Should we read and execute this handoff?"* before proceeding.
5. **No PR Theater**: Commit directly on the working branch (`pure-gas-main`). Do not simulate pull requests, reviews, or branch dances ([`.agents/rules/no-pr-theater.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pr-theater.md)).
6. **Design System & Aesthetics**: Follow the classic Day Planner binder aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers. Strictly **no pills** or bubbly tag capsules; use crisp tabular layouts, borders, and typography ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
7. **Clickable Links**: All file paths and code symbols referenced in responses and documentation MUST use clickable markdown links with the `file://` scheme (e.g. [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)).

---

## 2. Core Development Commands

```bash
npm test                  # Run full unit test suite (node --test tests/*.test.js)
node --test <test-file>   # Run a single test file (e.g. tests/taskEngine.test.js)
npm run lint              # Run ESLint across src/, gas-app/*.gs, tools/, server.js
npm start                 # Launch local standalone dev server at http://localhost:3000
npm run sync:agents       # Mirror .agents/{rules,commands,skills} into .claude/ and .kilo/
npm run sync:agents:check # Verify mirrors match .agents/ source (pre-commit gate)
```

---

## 3. Architecture & Deployment Model

The **Google Digital Day Planner** is a single-page digital binder application bridging Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive, Docs) via full 2-way synchronization.

- **Pure Google Apps Script (GAS) Web App**: 100% natively hosted on Google Apps Script (`script.google.com`) and deployed via `clasp`.
- **Zero Service Worker & Zero GIS OAuth**: No `sw.js`, no GitHub Pages hosting, and no client-side Google Identity Services (GIS) token management. Authentication is first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Dual Execution Environments**:
  1. **Local Preview Mode**: [`server.js`](file:///home/mike/projects/day-planner/server.js) serves root [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/`](file:///home/mike/projects/day-planner/src/), [`icons/`](file:///home/mike/projects/day-planner/icons/), and [`manifest.json`](file:///home/mike/projects/day-planner/manifest.json) at `http://localhost:3000`. [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) supplies simulated mock data.
  2. **Production GAS Web App**: [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) evaluates [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) with embedded components, calling native Google Apps Script services (`CalendarApp`, `Tasks`, `DriveApp`, `DocumentApp`).
- **Standalone PWA Affordances**: Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)), standalone mobile meta tags, and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

---

## 4. Codebase Structure & Core Engines

### Client Engines ([`src/`](file:///home/mike/projects/day-planner/src/))

- [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js): `[A1]`–`[C9]` priority parsing, status cycling (`✓`, `→`, `X`, `D/✓`, `•`), multi-column sorting, star toggles, and master task transfer.
- [`src/calendarEngine.js`](file:///home/mike/projects/day-planner/src/calendarEngine.js): 07:00–19:00 half-hour appointment schedule grid, event modal payloads with Google Meet links, and monthly calendar matrices.
- [`src/syncEngine.js`](file:///home/mike/projects/day-planner/src/syncEngine.js): Bidirectional, idempotent Task ↔ Calendar reconciliation tagging events with `gasTaskId`.
- [`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js): 12-month forward-look planning matrix, quarter aggregation, rolling horizon projections, and multi-quarter milestone tracking.
- [`src/indexParser.js`](file:///home/mike/projects/day-planner/src/indexParser.js): Extraction of `#index [Topic] Summary` entries from daily notes for chronological decision indexing.
- [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js): Cross-service universal search (Ctrl + K) indexing tasks, calendar appointments, and notes.
- [`src/binderStore.js`](file:///home/mike/projects/day-planner/src/binderStore.js): View router and local date navigation store.
- [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js): Communication layer abstracting `google.script.run` RPC in production and rich mock datasets in local dev.
- [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js): Alpine.js binder reactive controller and state orchestration.
- [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css): Complete Day Planner CSS design system (mirrored in [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html)).

### Google Apps Script Backend ([`gas-app/`](file:///home/mike/projects/day-planner/gas-app/))

- [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs): Server entry (`doGet`), folder setup handler, Google Workspace RPC endpoints, and background 5-minute sync triggers.
- [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html): 5-view digital binder shell markup.
- [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html): Client-side Alpine.js initialization and GAS bridge binding.
- [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html): Standalone styling scriptlet included via `<?!= include('Styles'); ?>`.
- [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html): Built-in user guide, privacy setup, and desktop window installation instructions.
- [`gas-app/SetupFolder.html`](file:///home/mike/projects/day-planner/gas-app/SetupFolder.html): First-run onboarding to bind the user's dedicated `Day Planner` Drive folder.
- [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs): Server-side self-test diagnostics executable via `POST /self-test`.
- [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json): Manifest declaring minimal OAuth scopes (`drive.file`, `calendar`, `tasks`, `documents`, `script.scriptapp`).

---

## 5. Agent Configuration & Cross-CLI Protocol

- **Single Source of Truth**: Hand-edit configs strictly inside [`.agents/`](file:///home/mike/projects/day-planner/.agents/) (`rules/`, `commands/`, `skills/`). Never edit [`.claude/`](file:///home/mike/projects/day-planner/.claude/) or [`.kilo/`](file:///home/mike/projects/day-planner/.kilo/) directly.
- **Mirror Sync**: Run `npm run sync:agents` to regenerate tracked real-file mirrors. Pre-commit hooks enforce `npm run sync:agents:check`.
- **Dual-CLI Headless Protocol** ([`.agents/rules/cross-cli-headless-invocation.md`](file:///home/mike/projects/day-planner/.agents/rules/cross-cli-headless-invocation.md)):
  - From Claude to Antigravity: `agy -p "<task>" --dangerously-skip-permissions` (via `/consult-agy`).
  - From Antigravity to Claude: `claude --safe-mode -p "<task>" --permission-mode acceptEdits --allowedTools "<tools>" --add-dir <root>` (via `/consult-claude`).
  - Rely on local user subscription logins without external API keys.

---

## 6. Critical Technical Constraints & Gotchas

1. **Date Arithmetic**: Always use pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`). Never call `.toISOString()` on local date variables to prevent timezone and UTC day-shift bugs.
2. **Drive OAuth Scopes**: Keep Drive permissions sandboxed to `drive.file`. Never request broad `drive`.
3. **Link Attributes**: External links must carry `target="_blank"` and `rel="noopener noreferrer"`.
4. **String Methods**: Use `slice()`, never deprecated `String.prototype.substr()`.
5. **Pre-Flight Gates**: Before committing or performing a session handoff, ensure `npm run lint && npm test` runs and passes with zero errors and zero warnings.
