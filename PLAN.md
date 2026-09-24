# Development Plan: Google Digital Day Planner (Pure G.A.S. Web App)

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

## 3. Phased Implementation Roadmap

### Phase 1: Baseline Establishment & Branch Management
- [x] User alignment on baseline commit selection (`d294262` vs alternative) and branch naming.
- [x] Create dedicated rollback branch (e.g., `pure-gas-main`) rooted at baseline or preserve `master` tag `PWA-installable-22-Sep-2026`.
- [x] Audit working tree cleanliness and verify clasp configuration (`gas-app/.clasp.json`).

### Phase 2: Elimination of GitHub Pages & Service Worker Artifacts
- [x] Remove `sw.js` and Service Worker build/cache-version tooling (`tools/update-sw-cache-version.js`).
- [x] Remove `.nojekyll`, `gh-pwa-shell/` (if present), and GitHub Pages static hosting references.
- [x] Decommission client-side GIS OAuth (`src/googleAuth.js`, `tests/googleAuth.test.js`, OAuth client setup guides).
- [x] Replace root `index.html` with clean local development mock harness matching `gas-app/Index.html`.
- [x] Update `package.json` scripts to remove stale PWA/SW gates and focus on GAS linting and testing.

### Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.
- [x] Ensure `gas-app/Index.html` includes standalone display meta tags:
  - `<meta name="mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - `<meta name="apple-mobile-web-app-title" content="Day Planner">`
  - High-resolution apple-touch-icon PNG and favicon references.
- [x] Add in-app user guide in `gas-app/About.html` explaining how to create desktop window shortcuts ("Install Day Planner" / "Open as window") in Chrome and Edge.

### Phase 4: Feature & Bugfix Backporting
- [x] **Future Planning Matrix**:
  - Verify `src/futureMatrixEngine.js` and `gas-app/Code.gs` Drive-backed persistence.
  - Verify interactive month cards and status cycling in `gas-app/Index.html` & `gas-app/Script.html`.
- [x] **Daily Tasks Enhancements**:
  - Backport status dropdown menu with In-Progress (`•`), Forwarded (`→`), Delegated (`D/✓`), Canceled (`X`).
  - Backport star toggle and per-column sorting (Priority, Status, Title, Category).
  - Backport Notes hover popover.
- [x] **Modular Note Cards & Rich Formatting**:
  - Split heading into Topic + Summary fields.
  - Rich text formatting toolbar (bold, italic, underline, strike, color swatches, lists).
  - External link syntax (`[[link:URL]]text[[/link]]`) and smart-paste Drive URL title resolution.
- [x] **Monthly Master Tasks**:
  - Google Tasks API or Drive JSON archive persistence.
  - "Move to Today" action with target date picker.
- [x] **Server Security & Robustness**:
  - IIFE wrapping for `Code.gs` and `UnitTests.gs` with explicit exports.
  - Deduplicated Drive folder creation with `LockService.getUserLock()`.
  - Folder ownership validation for auto-adopted folders.
  - Safe HTML escaping for server-returned messages.
- [x] **Universal Search**:
  - Anchored Ctrl+K dropdown indexing Tasks, Appointments, and Notes.

### Phase 5: Verification & Clasp Deployment Gate
- [x] Run full test suite: `npm test` passing 100% with no skips (88/88 passing across 11 suites).
- [x] Run linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/` (0 errors).
- [x] Check safe chars: verify no single-line `//` comment truncation hazards in HTML scriptlets.
- [x] Verify local dev server & smoke test: `npm run smoke` tests all 5 active views, search modal, and theme toggle with 0 runtime errors.
- [x] WCAG Contrast & Responsive Viewport: `npm run audit:a11y` confirms 100% AA/AAA contrast and zero horizontal overflow down to 768px.
- [x] Deploy to GAS development endpoint via `clasp push` and verify `/self-test` diagnostic suite readiness.
- [x] Runtime Scope Resolution: Resolved `DriveApp.getFolderById` permissions by restoring minimal `drive.readonly`.
- [x] Least-Privilege Drive API: Eliminated `moveTo` broad `drive` scope requirement by creating monthly notes and run-logs directly in destination folders via `Drive.Files.insert`.
- [x] In-App Server Diagnostics: Built persistent 25-entry ring buffer, self-test log table, and permanent Google Doc run-log (`Day Planner - Run Log`).

### Phase 6: Live Workspace UAT & Production Release

> **URL anti-pattern**: NEVER use `/a/macros/gsa.gov/...` (enterprise proxy) — script is owned by
> `mhoffman02@gmail.com` (consumer). NEVER use `/exec` with the `@HEAD` ID.

| Endpoint | URL | Who Can Access |
|---|---|---|
| **HOME Dev app** (`@HEAD`) | [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) | `mhoffman02@gmail.com` only |
| **HOME Dev self-test** (`@HEAD`) | [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test) | `mhoffman02@gmail.com` only |
| **HOME Prod app** (`day-planner-v01`) | [`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec) | Anyone |
| **HOME Prod self-test** (`day-planner-v01`) | [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test) | Anyone |
| **WORK Dev app** (`@HEAD`) | [`/dev (gsa.gov)`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev) | `michael.hoffman@gsa.gov` |
| **WORK Prod app** (`Day-Planner-WORK`) | [`/exec (gsa.gov)`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) | Enterprise GSA users |

- [x] Push latest code to HOME script [`1XUrbUS55yQf_...`](https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit) (Version 169).
- [x] Run Self-Test diagnostics ([`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test)) — 100% HEALTHY / All 5 suites Pass.
- [x] Verify production digital binder workspace load in Chrome ([`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec)).
- [x] Live Workspace 2-Way Task Sync: verified task creation in Day Planner reflected in Google Tasks with clean plain-text notes.
- [x] Task/Appointment Decoupling (Option A): decoupled tasks from auto-creating 30-min calendar blocks.
- [x] Circled-D (`Ⓓ`), Priority select width, and Add button vertical centering deployed and verified.
- [x] Setup Isolated Promotion Pipeline: created [`gas-app/.clasp-work.json`](file:///home/mike/projects/day-planner/gas-app/.clasp-work.json), [`tools/promote-to-work.js`](file:///home/mike/projects/day-planner/tools/promote-to-work.js) (`npm run push:work`), and promoted Version 6 to WORK script (`1980roEKgkC_...`).
- [x] Enterprise Drive Permissions & Auto-Creation: `Drive.Files.insert` auto-creates root folder on fresh accounts; `validateAndSaveFolderUrl` supports GSA Google Workspace domain permissions; webapp access set to `MYSELF`.
- [ ] User Acceptance Testing: confirm WORK environment access (`michael.hoffman@gsa.gov`) and Google Doc run-log.
- [ ] Deploy tagged production release (`git tag v1.0-pure-gas`) after live UAT sign-off.
- [ ] Verify Chrome/Edge "Open as window" desktop shortcut workflows.

### Phase 7: CSS Architecture Decoupling (`modern-normalize` Spike)
*Goal: Decouple Day Planner from Pico CSS v2 on a dedicated branch (`feat/modern-normalize`), replacing classless tag hijacking with modern-normalize and self-contained Franklin Covey design tokens.*

- [x] Fix Tasks column star button pill issue on `pure-gas-main` (commit `c957ba2`).
- [ ] Create and checkout dedicated branch `feat/modern-normalize` without risking `pure-gas-main`.
- [ ] Replace `@import url('.../pico.min.css')` with `modern-normalize.min.css` in `src/styles.css` and `gas-app/Styles.html`.
- [ ] Provide baseline form controls (`input`, `select`, `textarea`), base link styling, and clean up the 39 `--pico-*` variable references into native design tokens.
- [ ] Verify 100% parity across light (`#fcfbfa` parchment) and dark (`[data-theme="dark"]`) themes across all 5 views without regression.
- [ ] Verify with Playwright screenshots, Chrome CDP inspection, `npm test`, and `npm run lint`.


---

## 4. Standing Verification Criteria
- [x] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [x] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [x] `npm test` passes cleanly with all suites green.
- [x] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [x] Clasp deployment deploys cleanly without missing scriptlet templates.
