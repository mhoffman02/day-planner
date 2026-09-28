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

---

## 3. Active & Upcoming Phases

### Phase 20: Future Planning Items as Real Tasks
*Goal: replace the custom `future-matrix-YYYY.json` Drive-file bucket storage with real Google Tasks (dueDate = last day of the target month when no specific day is given), matching how Master/Daily Tasks are already stored. Triggered by a 2026-09-28 live bug where `DriveApp.Folder.createFile()`/`File.setContent()` demanded the broad `drive` scope even for the app's own folder — patched for now via the Advanced Drive Service (`Drive.Files.insert`/`update`), but moving off Drive-file storage entirely removes the whole class of bug and reuses proven-working Tasks-API infrastructure.*

- [ ] Rework `addFutureItem`/`updateFutureItemStatus`/`transferFutureItemToDay`/`rollForwardPendingItems`/`deleteFutureItem` in `gas-app/Code.gs` to operate on Tasks (dueDate-keyed) instead of the JSON bucket.
- [ ] Rework `getFutureMatrixData_`/`getFutureMatrix` to query Tasks and group by `dueDate`'s month, replacing the Drive JSON read.
- [ ] When a new item has no specific day, default `dueDate` to the last day of the target month.
- [ ] Update `src/futureMatrixEngine.js` and its 20+ tests in `tests/futureMatrixEngine.test.js` for the new data shape (grid grouping becomes a view-layer computation over tasks, not the source of truth).
- [ ] Update `src/app.js`/`gas-app/Script.html` bindings and the Future Planning view in `Index.html`/root `index.html` as needed.
- [ ] Decide and implement a migration path for any existing `future-matrix-*.json` files already in users' Drive folders — a one-time import, or the items silently vanish from the UI.
- [ ] Verify live (HOME, then WORK) that creating an item with no day-of-month lands on the last day of that month, and that existing Franklin status cycling / transfer-to-day / roll-forward still work.

---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
