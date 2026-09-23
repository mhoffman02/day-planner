# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA (with service worker `sw.js` and client-side Google Identity Services OAuth) to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026). Then systematically backport working features and bugfixes that only require GAS-hosted pages and scripts, delivering a fast, online-only digital day planner running seamlessly across personal HOME and locked-down federal WORK PCs.

---

### KEY DECISIONS

- **Baseline & Branch**: Rooted at baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`. Master tagged `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero SW**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js`, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Online-Only Sandbox**: No complex offline outbox syncing needed in sandboxed GAS iframe.
- **Native Auth Over Custom Gates**: No application-level whitelist/access gates. Pure GAS deployed with `executeAs: USER_ACCESSING` isolates Drive files and Google services under `drive.file` automatically.
- **Close-to-Installable PWA**: Standalone meta tags, manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), high-res icons, and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
- **GAS IIFE Isolation**: Both [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) are strictly wrapped in `(function(global) { ... })(this);` with explicit global export blocks ([`.agents/rules/gas-namespace-iife.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-namespace-iife.md)).
- **Concurrency & Ownership Guards**: `LockService.getUserLock()` prevents race conditions in Drive folder creation/discovery; folder ownership validation blocks auto-adopting or connecting non-owned folders.
- **Session Startup Check**: New sessions run only `git log -n 1 --oneline && git status -s`. If HEAD matches the handoff commit and the tree is clean, proceed immediately with **zero file reads** of `TODO.md`, `PLAN.md`, or `HANDOFF.md`.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`8335a4d`](https://github.com/mhoffman02/day-planner/commit/8335a4d).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Phase 1 Complete**: Baseline established, documentation backported, test baseline verified.
- **Phase 2 Complete**: GitHub Pages and Service Worker artifacts removed, clean local preview server ([`server.js`](file:///home/mike/projects/day-planner/server.js)).
- **Phase 3 Complete**: Standalone display meta tags, manifest, high-res icons, desktop window guide.
- **Phase 4 Complete (All 6 Tasks Backported)**:
  - **Task 1 (Future Planning Matrix)**: 12-month forward look, quarter milestones, Drive-backed persistence in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), interactive month cards ([`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js)).
  - **Task 2 (Daily Tasks Enhancements)**: Multi-column sorting, star toggle, Franklin status dropdown (`•`, `○`, `✓`, `→`, `X`, `D/✓`), notes hover popover ([`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js)).
  - **Task 3 (Modular Note Cards & Rich Formatting)**: Topic + Summary split, rich text formatting toolbar (bold, italic, underline, strike, colors, lists), smart-paste Drive URL title resolution (`resolveDriveLinkTitle`), link syntax parsing (`[[link:URL]]text[[/link]]`).
  - **Task 4 (Monthly Master Tasks / Backlog)**: Undated task list (`getMasterTasks`) querying Google Tasks API (`!t.due`), metadata decoding, add bar (`addMasterTask`), target date picker with inline move action (`moveMasterTaskToDate`), and `markMasterTaskMoved` sync.
  - **Task 5 (Server Security & Robustness)**: IIFE encapsulation with explicit export surface in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs); `LockService.getUserLock()` concurrency locking; folder ownership validation; safe HTML escaping in [`gas-app/SetupFolder.html`](file:///home/mike/projects/day-planner/gas-app/SetupFolder.html).
  - **Task 6 (Universal Search)**: Multi-entity search across Tasks, Calendar appointments, Daily Notes, and Monthly Index in [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js); `Ctrl+K` modal, keyboard navigation (`↑`/`↓`/`Enter`/`Esc`), instant jump to date/record, and accessible results listbox in [`index.html`](file:///home/mike/projects/day-planner/index.html), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html). Legacy 50% border-radii flattened to 4px per [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md).

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `🔋Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
6. **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
7. **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Phase 5 Verification & Local Smoke Testing (Immediate Next Task)**:
   - Run linter and full unit test suite: `npm run lint && npm test`.
   - Start local dev server via `npm start` at `http://localhost:3000`.
   - Perform end-to-end smoke test across all views: Daily view, Monthly Calendar, Monthly Index, Master Tasks backlog, Future Planning matrix, and Universal Search (`Ctrl+K`).
2. **Safe Characters & HTML Scriptlet Audit**:
   - Verify all Apps Script HTML template scriptlets (`<?!= ... ?>`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) avoid risky single-line `//` comment truncation.
3. **Phase 5 Clasp Deployment Gate**:
   - Deploy code to Google Apps Script development deployment via `clasp push`.
   - Run `/self-test` diagnostic suite to verify live Google Workspace service integrations (Calendar, Tasks, Drive).

---

### IMMEDIATE NEXT STEP

Execute Phase 5 Verification & Local Smoke Testing:

1. Run `npm start` to launch local standalone server on `http://localhost:3000`.
2. Test `Ctrl+K` search navigation, master tasks move, and note cards formatting in browser.
