# Development Plan: Google Digital Day Planner (Pure G.A.S. Web App)

Completed phases live in [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md) — this file stays lean and forward-looking. Active/near-term work items live in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md); completed TODO items archive to [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md). The [`handoff`](file:///home/mike/projects/day-planner/.agents/skills/handoff/SKILL.md) skill performs this archiving at the end of every session.

## 1. Project Overview & Architectural Pivot
The **Google Digital Day Planner** is a single-page digital binder app styled in classic Day Planner aesthetic (parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, no pills), bridging Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive) via full 2-way synchronization.

**Architecture**: 100% Pure Google Apps Script (GAS) Web App hosted natively on `script.google.com`. Deployed via `clasp`. No GitHub Pages hosting, no client-side GIS OAuth, no Service Worker (`sw.js`). Operates as an online-only web app running identically across personal (HOME) and locked-down federal (WORK) Google Workspace accounts.

---

## 2. Technical Stack & Modular Map

| Component | Location | Description | Verification / Test |
| :--- | :--- | :--- | :--- |
| **GAS Backend** | `gas-app/Code.gs` | Web app entry (`doGet`), Google Workspace RPC endpoints, 2-Way Sync | `gas-app/UnitTests.gs` (POST self-test) |
| **GAS UI Shell** | `gas-app/Index.html` | 5-view digital binder markup, desktop window tags | Live browser inspection |
| **GAS Client Script** | `gas-app/Script.html` | Alpine.js reactive app, `google.script.run` RPC bridge | `node tools/build-gas-engines.js --check` |
| **GAS CSS System** | `gas-app/Styles.html` | Day Planner design system, light/dark themes, responsive layout | `node tools/check-accessibility.js` |
| **Local Dev Preview** | `server.js` | Local HTTP preview server (`http://localhost:3000`) | Manual smoke test |
| **Task Engine** | `src/taskEngine.js` | Priority parsing (`[A1]`), status cycling, sequence calculation | `tests/taskEngine.test.js` |
| **Calendar Engine** | `src/calendarEngine.js` | 07:00-19:00 grid, event popup payloads | `tests/calendarEngine.test.js` |
| **Sync Engine** | `src/syncEngine.js` | 2-way Task ↔ Calendar reconciliation | `tests/syncEngine.test.js` |
| **Index Parser** | `src/indexParser.js` | `#index` tag extraction for monthly index | `tests/indexParser.test.js` |
| **Search Engine** | `src/searchEngine.js` | Cross-entity search (Ctrl + K) | `tests/searchEngine.test.js` |
| **Binder Store** | `src/binderStore.js` | View router, local date math navigation | `tests/binderStore.test.js` |
| **Future Matrix Engine** | `src/futureMatrixEngine.js` | 12-month forward-look month keys & item helpers | `tests/futureMatrixEngine.test.js` |
| **Lexicon Service** | `src/lexiconService.js` | In-binder dictionary & thesaurus engine with GAS fallback proxy | `tests/lexiconService.test.js` |

---

## 3. Active & Upcoming Phases

### Phase 23: Task Inline Editing & Direct AI Gateway Integration (In Progress)
- [x] **Today page Tasks panel: click-to-edit task Description**: Enable inline editing on task titles/descriptions matching Daily Notes note-card line editing pattern ([`abdf26a`](file:///home/mike/projects/day-planner/.git/commit/abdf26a)).
- [x] **Unified Multi-Model Gateway Architecture**: Single REST gateway in [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L3130). Direct Gemini-free API at HOME (`https://generativelanguage.googleapis.com/...`), and USAi API at WORK. Sheets `=AI(...)` microservice deprecated as dead end (requires interactive user UI focus in sheet). Configuration isolated in environment `ScriptProperties` (`AI_ENDPOINT_URL`, `AI_API_KEY`, `AI_MODEL`) with per-user override in `UserProperties.AI_MODEL_OVERRIDE` ([`83aecbf`](file:///home/mike/projects/day-planner/.git/commit/83aecbf), [`486cd8a`](file:///home/mike/projects/day-planner/.git/commit/486cd8a)).
- [ ] **AI Gateway UI Wiring (WIP)**: Add Settings modal UI / AI Config panel to display endpoint connection status, show active model, and provide model picker dropdown. Wire AI assist actions into note cards and task refinement.

---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
