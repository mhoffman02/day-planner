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

## 3. Architecture & 4. Agent Config

Pure GAS web app (HOME mastercopy, WORK production); local mock preview via `server.js`; edit configs only in `.agents/`, then `npm run sync:agents`. Details, dual-CLI protocol and file map: [`docs/architecture-and-agent-config.md`](file:///home/mike/projects/day-planner/docs/architecture-and-agent-config.md) (read before architecture, deploy or agent-config work).

---

## 5. Critical Technical Constraints & Gotchas

1. **Date Arithmetic**: Always use pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`). Never call `.toISOString()` on local date variables to prevent timezone and UTC day-shift bugs.
2. **Drive OAuth Scopes**: Keep Drive writes sandboxed to `drive.file`; the manifest also carries read-only `drive.readonly` (Doc action items in Triage read comments through the `DriveV3` Advanced Service, never write). Never request broad `drive`.
3. **Link Attributes**: External links must carry `target="_blank"` and `rel="noopener noreferrer"`.
4. **String Methods**: Use `slice()`, never deprecated `String.prototype.substr()`.
5. **Pre-Flight Gates**: Before committing or performing a session handoff, ensure `npm run lint && npm test` runs and passes with zero errors and zero warnings.
6. **Docs via Advanced Service, not `DocumentApp`**: the broad `documents` scope was dropped 2026-09-27. All Google Docs read/write goes through the Docs Advanced Service (`Docs.Documents.get/batchUpdate/create`), which accepts `drive.file`; `DocumentApp` only accepts `documents`.
