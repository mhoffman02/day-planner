# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA (with service worker `sw.js` and client-side Google Identity Services OAuth) to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026). Then systematically backport working features, bugfixes, and UI refinements that only require GAS-hosted pages and scripts, delivering a fast, online-only digital day planner running seamlessly across personal HOME and locked-down federal WORK PCs.

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
- **No-Pills Design Policy**: Strictly enforce [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) — 4px button border radii, flat underline active tab indicator (`border-bottom: 3px solid #58bfa2`), zero stadiums/capsules.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`53962c5`](https://github.com/mhoffman02/day-planner/commit/53962c5).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Phase 1-4 Complete**:
  - Baseline established, documentation backported, PWA/SW removed, standalone meta tags added, and all 6 core features backported (Future Planning, Daily Tasks enhancements, Modular Note Cards with rich formatting, Master Tasks backlog, Server Security & IIFE, Universal Search).
- **Recent Polish & Bugfixes (Commit `53962c5` and prior)**:
  - **Master Task List**: View title renamed to "Master Task List"; moved status simplified to date-only `Sep 22` with `→` arrow glyph; status column widened to 200px (`.th-w-200`) and wrapped in inline-flex container (`.master-task-status-wrap`); fixed Pico CSS `input:not(...)` specificity bug where date picker took 100% width and pushed Move button off-screen.
  - **Future Planning**: View title renamed to "Future Planning"; status cycling replaced with 6-state Franklin popup menu (`•`, `○`, `✓`, `→`, `X`, `D/✓`); month cards restructured into responsive two-tier layout.
  - **Centered Navbar**: Balanced 1:1 flex layout (`.header-left` and `.header-actions-compact` at `flex: 1 1 0; min-width: 0;`, `nav.view-segmented-control` at `flex: 0 0 auto; margin: 0 auto;`); obsolete pill tabs replaced with 48px flat tabs and mint-teal bottom border (`border-bottom: 3px solid #58bfa2`); compact buttons flattened to 4px border radii.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
6. **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
7. **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Fix Navbar Text Overlap on Month View** ([`screen-shots/broken-navbar.png`](file:///home/mike/projects/day-planner/screen-shots/broken-navbar.png)):
   - **Problem**: In Month view, the serif date heading `.date-text-display` ("September 2026") collides and paints directly on top of the centered view navigation tabs (`nav.view-segmented-control` under "Today" / "Month").
   - **Root Cause**: In [`header.single-top-bar`](file:///home/mike/projects/day-planner/src/styles.css#L133), `.header-left` has `flex: 1 1 0; min-width: 0;` to balance against `.header-actions-compact`. On viewport widths < 1400px (e.g. 1280px or 1024px), `.header-left` shrinks below the ~420px needed for its contents (`.brand-title-compact`, `.header-vdivider`, `.date-controls-group`, and `.date-text-display`). Because `.date-text-display` has `white-space: nowrap;` without overflow containment, "September 2026" spills over the boundary rightward into the center nav container.
   - **Target Locations**:
     - [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L149-L246)
     - [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L150-L247)
     - [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L69-L81) (monthly date nav template)
   - **Proposed Solutions**:
     - Deduplicate or streamline: on Month view, `.today-jump-btn` already displays "September" (`x-text="currentMonthName"`). Showing both jump button "September" and display text "September 2026" is redundant and wastes horizontal space.
     - Add responsive rules / overflow handling (e.g., hiding or truncating `.date-text-display` at narrow widths, or setting flex constraints so text never overlaps tabs).
2. **Phase 5 Verification & Local Smoke Testing**:
   - Verify dev server: `npm start` at `http://localhost:3000`.
   - Comprehensive smoke test across all views: Daily view, Monthly Calendar, Monthly Index, Master Tasks backlog, Future Planning matrix, and Universal Search (`Ctrl+K`).
   - Audit scriptlets in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) to ensure safe chars (no single-line `//` comment truncation risk).
3. **Phase 5 Clasp Deployment Gate**:
   - Push to Google Apps Script development endpoint via `clasp push`.
   - Run `/self-test` diagnostic suite to verify live Google Workspace service integrations (Calendar, Tasks, Drive).

---

### IMMEDIATE NEXT STEP

Open [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L69-L81) and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L149-L246) to fix the Month view date controls overlap (`screen-shots/broken-navbar.png`). In the monthly date nav block, evaluate whether `.today-jump-btn` can simply say "This Month" (or only show `selectedYear` in `.date-text-display`), or add responsive containment so `.header-left` never overlaps `nav.view-segmented-control`.
