# CLAUDE.md

This file provides core guidance to Claude Code (`claude.ai/code`) and AI agents working in this repository.

---

## 1. User Rules & Interaction Preferences

1. **Conciseness & Directness**: Default to short, direct answers. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `🔋Mike:`.
3. **Session Handoff**: Run the [`handoff`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) skill at the end of every session — this includes archiving any fully-checked [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) phase into [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md) and any completed [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) item into [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md), so both stay lean planning docs rather than changelogs.
4. **Session Startup & Handoff Ingestion**: At the start of each new session:
   - Check the age and timestamp of [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) (or git commit timestamp of the latest handoff).
   - If it is **less than 10 minutes old**: Automatically read [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) and immediately execute the next queued tasks.
   - If it is **older than 10 minutes old**: Report to the user exactly how old the handoff is (e.g. minutes, hours, or days), explain potential staleness (e.g. code drift, uncommitted changes, or work performed since the handoff was written), and explicitly ask: *"Should we read and execute this handoff?"* before proceeding.
   - Self-heal regardless of handoff age: if a prior session ended without running `/handoff` (e.g. skipped, crashed), [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) or [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) may still be carrying fully-completed phases/items. Check for that and archive them to [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md) / [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) before starting new work, same as the handoff skill would.
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

## 4. Agent Configuration & Cross-CLI Protocol

- **Single Source of Truth**: Hand-edit configs strictly inside [`.agents/`](file:///home/mike/projects/day-planner/.agents/) (`rules/`, `commands/`, `skills/`). Never edit [`.claude/`](file:///home/mike/projects/day-planner/.claude/) or [`.kilo/`](file:///home/mike/projects/day-planner/.kilo/) directly.
- **Mirror Sync**: Run `npm run sync:agents` to regenerate tracked real-file mirrors. Pre-commit hooks enforce `npm run sync:agents:check`.
- **Dual-CLI Headless Protocol** ([`.agents/rules/cross-cli-headless-invocation.md`](file:///home/mike/projects/day-planner/.agents/rules/cross-cli-headless-invocation.md)):
  - From Claude to Antigravity: `agy -p "<task>" --dangerously-skip-permissions` (via `/consult-agy`).
  - From Antigravity to Claude: `claude --safe-mode -p "<task>" --permission-mode acceptEdits --allowedTools "<tools>" --add-dir <root>` (via `/consult-claude`).
  - Rely on local user subscription logins without external API keys.

---

## 5. Critical Technical Constraints & Gotchas

1. **Date Arithmetic**: Always use pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`). Never call `.toISOString()` on local date variables to prevent timezone and UTC day-shift bugs.
2. **Drive OAuth Scopes**: Keep Drive permissions sandboxed to `drive.file`. Never request broad `drive`.
3. **Link Attributes**: External links must carry `target="_blank"` and `rel="noopener noreferrer"`.
4. **String Methods**: Use `slice()`, never deprecated `String.prototype.substr()`.
5. **Pre-Flight Gates**: Before committing or performing a session handoff, ensure `npm run lint && npm test` runs and passes with zero errors and zero warnings.
6. **Docs via Advanced Service, not `DocumentApp`**: the broad `documents` scope was dropped 2026-09-27. All Google Docs read/write goes through the Docs Advanced Service (`Docs.Documents.get/batchUpdate/create`), which accepts `drive.file`; `DocumentApp` only accepts `documents`.
