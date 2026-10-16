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

### Phase 30: WORK promotion & user-gated release items (Blocked on user)
Phases 25 and 28 are archived in `PLAN-HISTORY.md` (HOME live checks all passed 2026-10-10). What is left needs the user:
the GSA account, a release go, or a consent-screen decision. Checklist in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md).
- [x] **Pinned prod `/exec`** redeployed @319 (2026-10-10), self-test 12/12 PASS.
- [x] **WORK promotion**: v132 live 2026-10-12 on `/exec` `AKfycbzDYvr…` (user added Gmail + Sheets Services and deployed).
- [x] **HOME hub trigger** installed 2026-10-12 (`hubDispatch` every 5 min, `DRY_RUN` off).
- [x] **About page rewrite** 2026-10-12: sticky jump nav, Tag Reference, Automatic Tasks (`af8ef0f`, `6930454`).
- [ ] **WORK Meeting Prep render**: user sets `GMAIL_ROUTER` + `NCMMS_CORE_PILOT` TRUE in WORK Hub Config, then agent checks.
- [x] **WORK catch-up**: WORK v145 (build 483) live 2026-10-13: About rewrite, trial-mode controls, Triage preview,
  speed, Gmail-quota throttle + historyId row cache, Inbox only (TODO_HISTORY 2026-10-13).
- [x] **Consent screen**: stay in Testing (decided 2026-10-10); rpc token dies every 7 days, next 2026-10-17.
- [ ] **7-day Testing expiry watch**: rerun the rpc login on 2026-10-17 and check the web app and sync trigger still authorize.
- Out of scope: Gemini discovery/actions (Phase 6 build), USAi (Phase 7).
- [x] **Task verbs + Master parity + speed** (2026-10-16): Forward menu, Delegate with check-back, Master Tasks get
  every Daily verb, Daily forward routing fix, quiet Live mark, Master tab speed (TODO_HISTORY 2026-10-16).
- [ ] **WORK v149**: pushed 2026-10-16; user repoints `/exec`.
- **Next agent work:** HOME `/dev` live check of Forward/Delegate on Daily and Master (TODO.md); then pick the next phase with the user.

---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
