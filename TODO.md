# Active Tasks (TODO)

## Phase 22: Advanced Notes & Research Suite (In Progress)

- [ ] **Step 3 (Feature #2): Deep Archive Search via Drive fullText index integrated into `Ctrl + K`**
  - **Goal**: Enable cross-month / multi-year searching of note cards without loading every monthly Google Doc upfront into memory.
  - **Mechanism**: Google Drive maintains an automatic full-text search index of all `Day Planner Notes - YYYY-MM` Google Docs.
  - **Implementation**:
    1. In [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), wire Drive search RPC (`DriveApp.searchFiles` or `Drive.Files.list` with `q: "fullText contains '...' and title contains 'Day Planner Notes - '"`) returning matching dates and card excerpts.
    2. Integrate into [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js) and `searchModal` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
    3. Display deep archive matches under an "Archive Notes" section with 1-click jump to that date in Daily view.
    4. Unit tests in [`tests/searchEngine.test.js`](file:///home/mike/projects/day-planner/tests/searchEngine.test.js).

- [ ] **Step 4: GAS Architect Design: Container-Bound Script REST API Endpoint for Gemini in Docs/Sheets**
  - **Goal**: Design and plan a container-bound Apps Script in Google Docs or Google Sheets presenting a REST API endpoint for prompts and responses.
  - **Mechanism**: Exploit Google Sheets' `=AI(...)` function or Docs Gemini integration via background script relay, returning responses back to caller.
  - **Deliverable**: Comprehensive Architecture & Plan artifact evaluating quotas, container binding, execution auth, and relay latency.

## Open

- [ ] **AI Assist doesn't work on WORK** — `gemini.google.com` is blocked by the federal network's proxy ("you don't have permission to visit this site"). A Docs-popup fallback was tried and rejected (can't isolate just the AI sidebar from Google's own document chrome — cross-origin, confirmed impossible). No approach identified yet that meets the UX bar; needs user direction before attempting anything else here. Do not attempt a fix without asking first.
- [ ] **Today page, Tasks panel: click-to-edit task Description** — user wants to click a task's Description to edit it inline, matching the Daily Notes panel's note-card body UX (click a line to edit it in place). Evaluate click-to-edit UX patterns before building (not yet scoped/designed).

## Loose end (user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 116 is pushed (`npm run push:work`, prior session turn), carrying every fix live on HOME through @281/build 334 (Phase 21 cache port + pagination/grid bugs + the AI Assist noopener fix, disabled-not-hidden button state, Gemini-only). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. Note: even once repointed, the AI Assist button itself will still not work on WORK (see Open item above) — this repoint is only about picking up the other fixes.
