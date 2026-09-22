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
- [ ] **Server Security & Robustness**:
  - IIFE wrapping for `Code.gs` and `UnitTests.gs` with explicit exports.
  - Deduplicated Drive folder creation with `LockService.getUserLock()`.
  - Folder ownership validation for auto-adopted folders.
  - Safe HTML escaping for server-returned messages.
- [ ] **Universal Search**:
  - Anchored Ctrl+K dropdown indexing Tasks, Appointments, and Notes.

### Phase 5: Verification & Clasp Deployment Gate
- [ ] Run full test suite: `npm test` passing 100% with no skips.
- [ ] Run linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/`.
- [ ] Check safe chars: `npm run check:gas-html-safe-chars` passes (no `//` comment truncation risks).
- [ ] Verify local dev server: `npm start` runs at `http://localhost:3000` with functioning mock data.
- [ ] Deploy to GAS development endpoint via `clasp push` and run `/self-test` diagnostic suite.

---

## 4. Standing Verification Criteria
- [ ] Zero Service Worker (`sw.js`) or GitHub Pages dependencies in repository.
- [ ] App launches directly from Google Apps Script Web App URL on both HOME and federal WORK PCs.
- [ ] `npm test` passes cleanly with all suites green.
- [ ] UI strictly conforms to Day Planner aesthetic (cream `#fcfbfa`, teal `#2d6a5a`, serif headers, no pills).
- [ ] Clasp deployment deploys cleanly without missing scriptlet templates.
