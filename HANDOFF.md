# CONTEXT HANDOFF DOCUMENT

## OBJECTIVE
Deliver a high-productivity, aesthetically authentic Franklin-style Google Digital Day Planner operating 100% within Google Apps Script on both personal (HOME) and locked-down federal (WORK) Google accounts. We are transitioning from Phase 22 (Advanced Notes & Research Suite) to Phase 23 (Task Inline Editing & AI Microservice UI Integration), adding inline task editing and bridging Day Planner to the Sheets AI microservice.

---

## KEY DECISIONS
- **Deep Archive Search (Drive fullText index)**: Implemented background search RPC `searchArchiveNotes(query)` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2730) using Drive API `fullText contains '...' and title contains 'Day Planner Notes - '` across monthly notes docs. Wired into `Ctrl + K` search modal with 350ms debouncing, animated gold indicator, and 1-click date jump ([`984d1e1`](file:///home/mike/projects/day-planner/.git/commit/984d1e1)).
- **AI Microservice Architecture (`ai-microservice`)**: REST service backed by Google Sheets `=AI(...)` formula processing via a hidden `_scratch` sheet serialized by `LockService.getDocumentLock()` and audited in `prompt_response`. Since ContentService always returns HTTP 200, errors are detected via response envelope (`SERVICE_BUSY`, `AI_FORMULA_ERROR`, `AI_TIMEOUT`, `UNAUTHORIZED`).
- **Least-Privilege Manifest**: Manifest in `ai-microservice/appsscript.json` declares restricted `oauthScopes` (`https://www.googleapis.com/auth/spreadsheets.currentonly` and `https://www.googleapis.com/auth/script.container.ui`) and `@OnlyCurrentDoc` annotations, ensuring the microservice cannot read or modify any other files in Google Drive.
- **Microservice Dual-Environment Support**: Script IDs are preserved in `.clasp-home.json` (`1kW7_HpM7aoPInpcgDO7i8Rv6hNvFU8rtL1CaJIO5BXK9685TyZ3gtWUN`) and `.clasp-work.json` (`1bUSnfyFpFYnlQV5WO7nwB0LXnVamXHee_0JCi-p0TRuecDJJ8bhvfyor`).
- **AI Service UI Integration is WIP**: Client module [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js) and GAS backend proxy in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2930) are built and unit-tested (13 tests). Live UI wiring is paused as WIP until the user completes testing and deploys the microservice.
- **Code Mirroring Rule**: Any frontend change must be kept in lockstep across `src/` (`app.js`, `styles.css`) and `gas-app/` (`Index.html`, `Script.html`, `Styles.html`). `tools/check-gas-script-html-safe-chars.js` must always pass (no unescaped `//` in strings/comments, no raw backticks in scriptlet files).

---

## CURRENT STATE
- **Git Branch**: `pure-gas-main` (clean working tree).
- **Latest Day-Planner Commit**: [`c01d470`](file:///home/mike/projects/day-planner/.git/commit/c01d470) — `feat(ai): integrate Sheets AI microservice client and backend proxy connector`.
- **Pre-flight Status**: 100% clean. 214/214 tests passing across 35 test suites. Zero ESLint warnings/errors. Character AST checks passed.
- **AI Microservice Status**: Cloned in `~/projects/ai-microservice`, latest commit [`0b8d287`](file:///home/mike/projects/ai-microservice/unit-tests.gs#L190) pulled and passing 20/20 unit tests, least-privilege `currentonly` manifest pushed via `clasp push -f` to HOME bound script `1kW7_HpM7aoPInpcgDO7i8Rv6hNvFU8rtL1CaJIO5BXK9685TyZ3gtWUN`.

---

## CONSTRAINTS & PREFERENCES
- **Ask Before Building Architectural Fixes**: Do NOT implement unilateral UX or network fallbacks without user approval (especially regarding WORK vs HOME accounts).
- **Franklin Planner Aesthetic**: Parchment cream (`#fcfbfa`), binder teal (`#2d6a5a`), serif headings (`Playfair Display`), clean borders, no pill tags.
- **Safe Characters in GAS HTML**: When writing string literals in `gas-app/Script.html`, split double slashes (e.g. `'https:' + '/' + '/...'`) so Google's `HtmlService.createHtmlOutputFromFile().getContent()` parser does not truncate scripts.
- **GAS IIFE Architecture**: Any new backend function in `gas-app/Code.gs` reachable via `google.script.run` MUST have an internal function inside the IIFE, an alias (`global._fnInternal = fn;`), and a matching top-level delegator declaration outside the IIFE.

---

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Today page, Tasks panel: Click-to-Edit Task Description**
   - **Files**: [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L1600-L1750), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L3100-L3250), [`index.html`](file:///home/mike/projects/day-planner/index.html#L450-L550), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L450-L550).
   - **Task**: Allow users to click a task's title/description to edit it inline, matching the Daily Notes panel note-card UX (click a line to edit it in place, Enter/blur to save).

2. **AI Microservice End-to-End Verification & Settings UI Wiring (WIP)**
   - **Files**: [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2930-L2985), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
   - **Task**: Once user completes testing in HOME sheet (`1kW7_HpM7aoPInpcgDO7i8Rv6hNvFU8rtL1CaJIO5BXK9685TyZ3gtWUN`) and provides Web App URL + API Key, add settings entry to persist URL/key in `UserProperties` and test live prompt/response round-trip.

3. **WORK deployment repoint needed (user-blocked)**
   - **Task**: WORK version 116 is pushed (`npm run push:work`), awaiting repoint by `michael.hoffman@gsa.gov` via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit).

---

## IMMEDIATE NEXT STEP
Begin **Today page, Tasks panel: Click-to-Edit Task Description**:
Inspect task row markup in [`index.html`](file:///home/mike/projects/day-planner/index.html#L480-L520) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L480-L520) and Alpine task methods in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L1620-L1680) to wire `editingTaskId` and inline title edit/save on click.
