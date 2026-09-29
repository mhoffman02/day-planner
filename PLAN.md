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

### Phase 22: Advanced Notes & Research Suite (In Progress)
- [x] **Note Version History Time Machine**: IndexedDB `v3` rolling snapshots (`noteRevisions` store, max 30) with 2-pane preview and 1-click restore syncing back to Google Docs ([`7ae84ef`](file:///home/mike/projects/day-planner/.git/commit/7ae84ef)).
- [x] **In-Binder Dictionary / Synonym / Antonym Popover**: Free Dictionary & Datamuse integration with GAS backend fallback proxy (`fetchLexicon`), caret-aware `Alt+D` trigger, and 1-click text replacement directly into active note card line ([`4fd2a54`](file:///home/mike/projects/day-planner/.git/commit/4fd2a54)).
- [ ] **Deep Archive Search via Drive fullText index**: Background Drive search RPC querying multi-year `Day Planner Notes - YYYY-MM` Google Docs integrated into `Ctrl + K` ([`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js)).
- [ ] **GAS Architect REST Endpoint Design**: Container-bound REST API endpoint script in Docs/Sheets routing to Gemini via `=AI(...)`.

---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
