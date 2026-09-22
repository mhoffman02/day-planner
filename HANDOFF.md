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
- **Session Startup Check**: New sessions run only `git log -n 1 --oneline && git status -s`. If HEAD matches the handoff commit and the tree is clean, proceed immediately with **zero file reads** of `TODO.md`, `PLAN.md`, or `HANDOFF.md`.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`516d023`](https://github.com/mhoffman02/day-planner/commit/516d023).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 84/84 unit tests passing across 11 suites (`npm test`).
- **Phase 1 Complete**: Baseline established, documentation backported, test baseline verified.
- **Phase 2 Complete**: GitHub Pages and Service Worker artifacts removed, clean local preview server ([`server.js`](file:///home/mike/projects/day-planner/server.js)).
- **Phase 3 Complete**: Standalone display meta tags, manifest, high-res icons, desktop window guide.
- **Phase 4 Completed Tasks**:
  - **Task 1 (Future Planning Matrix)**: 12-month forward look, quarter milestones, Drive-backed persistence in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), interactive month cards ([`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js)).
  - **Task 2 (Daily Tasks Enhancements)**: Multi-column sorting, star toggle, Franklin status dropdown (`•`, `○`, `✓`, `→`, `X`, `D/✓`), notes hover popover ([`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js)).
  - **Task 3 (Modular Note Cards & Rich Formatting)**: Topic + Summary split, rich text formatting toolbar (bold, italic, underline, strike, colors, lists), smart-paste Drive URL title resolution (`resolveDriveLinkTitle`), link syntax parsing (`[[link:URL]]text[[/link]]`).
  - **Task 4 (Monthly Master Tasks / Backlog)**: Undated task list (`getMasterTasks`) querying Google Tasks API (`!t.due`), metadata decoding, add bar (`addMasterTask`), target date picker with inline move action (`moveMasterTaskToDate`), and `markMasterTaskMoved` sync.

---

### CONSTRAINTS & PREFERENCES

- **Direct Communication**: Address user as "Mike," lead with direct answers, no pleasantries or filler.
- **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
- **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
- **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
- **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
- **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Server Security & Robustness (Immediate Next Task)**:
   - IIFE wrapping for [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) with explicit exports to `this` / `global` scope (protecting helper functions while keeping `doGet`, `getDailyData`, etc. callable).
   - Deduplicated Drive folder creation using `LockService.getUserLock()`.
   - Folder ownership validation for auto-adopted folders.
   - Safe HTML escaping for server-returned error messages.
2. **Universal Search**:
   - Anchored Ctrl+K dropdown indexing Tasks, Appointments, and Notes across both daily and monthly records.
3. **Phase 5 Verification & Clasp Deployment Gate**:
   - Full test and lint verification followed by `clasp push` deployment to GAS dev endpoint and `/self-test` execution.

---

### IMMEDIATE NEXT STEP

Execute Phase 4 Task 5: Server Security & Robustness:
1. Audit `master:gas-app/Code.gs` and `master:gas-app/UnitTests.gs` for IIFE boundary patterns, `global` export table, and lock handling.
2. Wrap [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) in IIFEs with explicit top-level export assignments.
3. Implement `LockService.getUserLock()` concurrency lock in `getFolderByNameOrCreate` and add folder ownership check.
4. Verify with `npm run lint && npm test`.
