# CONTEXT HANDOFF DOCUMENT

## OBJECTIVE
Deliver a high-productivity, aesthetically authentic Franklin-style Google Digital Day Planner operating 100% within Google Apps Script on both personal (HOME) and locked-down federal (WORK) Google accounts. We are currently implementing Phase 22 (Advanced Notes & Research Suite) — adding note recovery, native in-binder dictionary/thesaurus lookup, multi-year deep archive search, and architecting zero-cost AI endpoints through Google Workspace containers.

---

## KEY DECISIONS
- **Time Machine Architecture**: Implemented as pure in-binder snapshot recovery using IndexedDB `v3` (`noteRevisions` store, max 30 per date) and 2-pane preview/restore ([`7ae84ef`](file:///home/mike/projects/day-planner/.git/commit/7ae84ef)). Native Google Docs API does not return document content for past revisions via API, making local snapshots the superior zero-latency UX.
- **Lexicon Zero-Key Public APIs & Resilient Proxy**: Used Free Dictionary API and Datamuse API clientside for definitions, phonetics, audio, and synonyms/antonyms. To guarantee 100% functionality on federal networks (WORK) where clientside requests may hit proxy filters, a server-side Apps Script fallback proxy (`fetchLexicon`) via `UrlFetchApp` was built in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
- **1-Click Lexicon In-Place Replacement**: Clicking any synonym or antonym chip replaces the active word in the note card line in place, automatically saving the updated note and confirming via toast. If opened standalone, it copies to the clipboard.
- **Caret Detection (`getWordAtCaret`)**: Triggering `Alt+D` while editing a note line automatically resolves the word surrounding the cursor without requiring manual highlighting.
- **AI Assist Button Scope**: Remains Gemini-only (`gemini.google.com/app`). Federal network proxy blocks it on WORK; Docs-popup fallback was tested and permanently rejected because cross-origin constraints prevent hiding Google Docs' own toolbar/tabs chrome. Any future WORK AI assist must be discussed and agreed upon with the user *before* building.
- **Code Mirroring Rule**: Any frontend change must be kept in lockstep across `src/` (`app.js`, `styles.css`) and `gas-app/` (`Index.html`, `Script.html`, `Styles.html`). `tools/check-gas-script-html-safe-chars.js` must always pass (no unescaped `//` in strings/comments, no raw backticks in scriptlet files).

---

## CURRENT STATE
- **Git Branch**: `pure-gas-main` (clean working tree).
- **Latest Commit**: [`4fd2a54`](file:///home/mike/projects/day-planner/.git/commit/4fd2a54) — `feat(lexicon): add In-Binder Dictionary and Thesaurus popover with 1-click text replacement`.
- **Pre-flight Status**: 100% clean. 197/197 tests passing across 29 test suites. Zero ESLint warnings/errors. Character AST checks passed.
- **Recent Progress**:
  - Step 1 (Note Time Machine) complete ([`7ae84ef`](file:///home/mike/projects/day-planner/.git/commit/7ae84ef)).
  - Step 2 (In-Binder Dictionary / Synonym / Antonym Popover) complete ([`4fd2a54`](file:///home/mike/projects/day-planner/.git/commit/4fd2a54)).

---

## CONSTRAINTS & PREFERENCES
- **Ask Before Building Architectural Fixes**: Do NOT implement unilateral UX or network fallbacks without user approval (user explicitly corrected an unauthorized Docs-popup attempt earlier in the session).
- **Franklin Planner Aesthetic**: Parchment cream (`#fcfbfa`), binder teal (`#2d6a5a`), serif headings (`Playfair Display`), clean borders, no pill tags.
- **Safe Characters in GAS HTML**: When writing string literals in `gas-app/Script.html`, split double slashes (e.g. `'https:' + '/' + '/...'`) so Google's `HtmlService.createHtmlOutputFromFile().getContent()` parser does not truncate scripts.
- **GAS IIFE Architecture**: Any new backend function in `gas-app/Code.gs` reachable via `google.script.run` MUST have an internal function inside the IIFE, an alias (`global._fnInternal = fn;`), and a matching top-level delegator declaration outside the IIFE.

---

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Step 3 (Feature #2): Deep Archive Search via Drive fullText index integrated into `Ctrl + K`**
   - **Files**: [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js#L1-L150), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2730-L2800), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L370-L390), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L1890-L1920).
   - **Task**: Implement Drive full-text search across historical `Day Planner Notes - YYYY-MM` Google Docs using Drive API `q: "fullText contains '...' and title contains 'Day Planner Notes - '"`. Wire into `Ctrl + K` search modal with matching excerpts and 1-click date jump.
   - **Tests**: [`tests/searchEngine.test.js`](file:///home/mike/projects/day-planner/tests/searchEngine.test.js).

2. **Step 4: GAS Architect Design: Container-Bound Script REST API Endpoint for Gemini in Docs/Sheets**
   - **Files**: Design document / plan artifact to be generated in `<appDataDir>/brain/`.
   - **Task**: Plan and architect a GAS script container-bound in a Google Doc or Sheet that exposes a REST API endpoint (or `doPost`), relaying user prompts to `=AI(...)` in Google Sheets or Gemini in Docs and returning responses back to the caller.

3. **Today page, Tasks panel: Click-to-Edit Task Description**
   - **Files**: [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L1600-L1750), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L3100-L3250), [`index.html`](file:///home/mike/projects/day-planner/index.html#L450-L550), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L450-L550).
   - **Task**: Enable inline click-to-edit for task descriptions matching the Daily Notes panel inline editing pattern.

---

## IMMEDIATE NEXT STEP
Begin **Step 3: Deep Archive Search via Drive fullText index**:
Inspect [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) to define `searchArchiveNotes(query)` using `DriveApp.searchFiles` / `Drive.Files.list`, and wire the backend RPC to return matching dates and note snippets.
