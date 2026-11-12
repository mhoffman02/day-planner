# CLAUDE.md

Core guidance for Claude Code and AI agents in this repo.

## 1. User Rules

1. **Terse.** Short, direct answers; no pleasantries or wrap-up. Lead with the answer. Push back when the premise is flawed.
2. **Salutation:** start every reply with `🔋Mike:`.
3. **Handoff:** run the `handoff` skill at session end; archive fully-checked `PLAN.md` phases to `PLAN-HISTORY.md` and done `TODO.md` items to `TODO_HISTORY.md` so both stay lean.
4. **Session start:** check `HANDOFF.md` age (or its latest git commit time).
   - Under 10 min: read it and run the queued tasks.
   - Over 10 min: report its age, warn of staleness (code drift, uncommitted or later work), ask "Should we read and execute this handoff?".
   - Either way, if a prior session skipped `/handoff`, archive finished `PLAN.md`/`TODO.md` items first.
5. **No PR theater:** commit directly on `pure-gas-main` (`.agents/rules/no-pr-theater.md`).
6. **Design:** Day Planner binder look: parchment `#fcfbfa`, forest teal `#2d6a5a`, serif headers. No pills or bubbly capsules; crisp tables, borders, type (`.agents/rules/no-pills.md`).
7. **Links:** every file path and code symbol in replies and docs is a clickable `file://` markdown link, e.g. [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).

## 2. Commands

```bash
npm test                  # node --test tests/*.test.js
node --test <file>        # one test file
npm run lint              # ESLint: src/, gas-app/*.gs, tools/, server.js
npm start                 # local mock preview, http://localhost:3000
npm run sync:agents       # mirror .agents/{rules,commands,skills} into .claude/ and .kilo/
npm run sync:agents:check # verify mirrors (pre-commit gate)
```

## 3-4. Architecture and Agent Config

Pure GAS web app (HOME mastercopy, WORK production); local mock preview via `server.js`. Hand-edit agent config only in `.agents/`, then `npm run sync:agents`; never edit `.claude/` or `.kilo/`. Details, dual-CLI protocol, file map: [`docs/architecture-and-agent-config.md`](file:///home/mike/projects/day-planner/docs/architecture-and-agent-config.md) (read before architecture, deploy or agent-config work).

## 5. Technical Gotchas

1. **Dates:** local arithmetic only (`new Date(y, m - 1, d + delta)`); never `.toISOString()` on local dates (UTC day-shift).
2. **Drive scopes:** writes stay on `drive.file`; `drive.readonly` is read-only (Doc action items in Triage via `DriveV3`). Never request broad `drive`.
3. **Links:** external links carry `target="_blank" rel="noopener noreferrer"`.
4. **Strings:** `slice()`, never `substr()`.
5. **Pre-flight:** before commit or handoff, `npm run lint && npm test` with zero errors and zero warnings.
6. **Docs:** all Google Docs read/write via the Docs Advanced Service (`Docs.Documents.get/batchUpdate/create`, accepts `drive.file`); `DocumentApp` needs the broad `documents` scope, dropped 2026-09-27.
