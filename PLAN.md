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

### Phase 25: WORK Repoint & Post-Removal Verification (In Progress)
Phase 24 (AI Assist/Thesaurus removal), Phase 26 (`var`->`const`/`let`), and Phase 27 ("GH Build N"
prefix) are archived in `PLAN-HISTORY.md`. HOME is at `@294`, Build 378 — includes the Version
History fix, the Sts status-menu fix, and the GH prefix (merged 2026-10-01 from a worktree branch
that had been deployed but never merged). WORK v127 predates the last two, so the remaining work
is: cut v128, then one manual repoint.
- [ ] **Cut WORK Version 128** via `npm run push:work`.
- [ ] **Repoint WORK `/exec` to Version 128**: `michael.hoffman@gsa.gov` must do this in the WORK
  Apps Script IDE (`https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit`
  → Deploy → Manage deployments → Edit → select Version 128 → Deploy). Cross-domain
  restriction — cannot be done from HOME's `mhoffman02@gmail.com` session.

### Phase 28: Gmail / Calendar / Tasks / Meeting-Notes Hub (In Progress - live HOME verification)
Spec [`docs/specs/gmail-meeting-hub.md`](docs/specs/gmail-meeting-hub.md); architecture, setup/gate runbook and acceptance
matrix in `docs/hub-*.md`. Branch `feat/gmail-meeting-hub` (`781c521`, ahead of `pure-gas-main`). Gmail is read-only; all flags OFF, `DRY_RUN` ON.
784 tests pass; fail-loud catch gate in lint + pre-commit; save/load paths fail closed (error tray, per-item save queue).
- [x] Wave 0: contracts, `build-gas-engines` tool, vm stubs, `GmailApp` lint ban, spec saved.
- [x] Wave 1: pure engines (classifier, selector, triage score, ledger, registry, notes planner, Gemini parser, routing).
- [x] Wave 2: `.gs` repositories, queue, RPC controller, triggers; Triage + Meeting Prep UI and mocks.
- [x] Wave 3: registry persistence (`DPConfig.updateRegistryRow`), contract parity tests, acceptance matrix, docs.
- [x] **PUSH GATE**: approved and pushed to HOME `/dev` 2026-10-09; Gmail + Sheets in IDE Services; re-consented.
- [x] Hardening: fail-loud catches, fail-closed saves, error tray, `createCalendarEvent` + Meet, calendar-TZ day windows.
- [x] Test tier D: agent runs HOME GAS functions headlessly, `npm run rpc -- <fn> --deploy` (skill `gas-rpc`), live 7/7.
- [ ] **Live HOME verification** (in progress): Sheets spike PASSED; remaining: `hubSpike` rerun, `/dev` UX checks,
  emoji label resolution, DRY_RUN smoke, real-service steps L1-L8 (checklist in `TODO.md`).
- [ ] **Pinned prod `/exec`**: redeploy only on user go (carries `gmail.readonly`).
- [ ] **WORK promotion**: `npm run push:work` after HOME passes; admin approval of the new scope may block it.
- Out of scope: Gemini discovery/actions (Phase 6 build), USAi (Phase 7).

### Phase 29: Hub Sheet batched range store (In Progress; user go 2026-10-10)
Goal: one Sheets REST call to read and roughly one per item to write, in place of today's 4 reads per run plus 2 writes per
item. The Advanced Service `Sheets.Spreadsheets.Values.batchGet/batchUpdate` *is* the Sheets REST v4 API; no UrlFetchApp.
Pattern borrowed from sheetfu's Table (read once, queue edits, one commit). The GAS "Sheets-as-DB" libraries
(Tamotsu, GAS-DB, ServiceSQL) were rejected: they sit on SpreadsheetApp (needs the broad `spreadsheets` scope), and a
script library adds load time plus code the catch lint can't see. User decisions 2026-10-10: Advanced Service only, hub
Sheet only, claims stay write-through, typed RPCs only (no generic range endpoint).
- [x] **Prerequisite: app-file writes work under the linked GCP project**: re-granted via `?view=regrant` 2026-10-10.
- [x] Step 0 (done 2026-10-10): run outcome fix done (`de3c983`, `a9f2813`); run `counts` now
  carry `sheetsReads`/`sheetsWrites` (`4199eeb`). Empty-run floor on HOME 2026-10-10: 3 reads, 0 writes (0 items).
  L5 baseline 2026-10-10 (`8e2cd43`, 3 fresh items, 3 Tasks created): **4 reads, 6 writes** = floor 3 reads + 1 read
  when items exist, 2 writes per item. Target after batching: 1 read, ~4 writes for the same run.
- [x] (`8e2cd43`) Pure range logic in `src/integration/sheetRanges.js` (A1/col letters, tab quoting with `'` escaping, ValueRange
  assembly from queued writes, ~50-range flush cap), node-tested, built into Engines.gs. One shared helper replaces
  the copies in `Config.gs` and `LedgerRepository.gs` (the ledger's copy doesn't escape `'` in tab names).
- [x] (`464ed69`; live HOME empty run 2026-10-10: 3 reads -> **1**, 0 writes; 3-item live number measured with write
  combining against the 4/6 baseline) One snapshot per locked run: a single `Values.batchGet` of Config `A2:B200` + Registry `A1:M500` + Ledger
  `A2:..5001`. `getConfig`, `getFeatures({fresh})`, `getRegistry` and `beginSession` read from it. Lives only for that
  locked execution; archive compaction stays in the read step. Keep `valueRenderOption` at the default FORMATTED_VALUE
  (UNFORMATTED would change how hand-typed Config cells parse).
- [ ] Write combining: send each item's completion in the same `Values.batchUpdate` as the next item's claim
  (`[complete N, claim N+1]`), so every claim is still durable before its side effect. Safe because a stale PENDING row
  retries after 15 min and Task creation is idempotent (op key in `dp-meta`, `findExistingByOpKey`). `endSession`'s
  `finally` flushes anything still queued, logs the stack, and never masks the original error.
- [ ] `updateRegistryRows([...])`: discovery makes one `batchUpdate` from the snapshot, in place of a read plus a write per series.
- [ ] Exit criteria (unit): a fake `Sheets` call counter. A 3-item run makes 1 `batchGet` and at most 4 writes (today
  about 4 reads and 6 writes); DRY_RUN makes 0 writes; every claim is written before its side effect. Full `npm test` +
  lint pass.
- [ ] Exit criteria (live): `npm run rpc -- processWorkflowQueue` counters before and after, via gas-rpc.
- Known risks: a hand sort or delete in the Ledger tab during a run misdirects writes, because row numbers are cached
  (same as today, slightly wider window). Cells near the 40k-character limit are covered by the flush cap.
- Module rules: IIFE wrap, literal-only top-level values, export as used by other .gs files, no top-level delegator.

---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
