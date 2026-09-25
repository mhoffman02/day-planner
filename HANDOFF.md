# Context Handoff Document

### OBJECTIVE

Deliver Phase 11 enhancements — Master Tasks Franklin glyph status filter toggles, Monthly Overview full-screen vertical responsiveness with on-demand day card scrolling, and Monthly Index "Daily Page" in-app jump routing. Lock in Google Doc Notes Option 3 architecture (durable markdown storage with native H2/H3 headings for Docs outline/printing; SPA as primary presentation layer) and execute remaining tasks in priority order across WORK and HOME deployments.

---

### KEY DECISIONS

- **Master Tasks Status Filter Toggles ([commit `1426e7f`](file:///home/mike/projects/day-planner))**:
  - Implemented Option A Franklin Glyph Stamp Toggles (`[All]`, `[•]`, `[○]`, `[✓]`, `[→]`, `[X]`, `[Ⓓ]`) directly above the Master Tasks table in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Selected Option A per user review: preserves the tactile letterpress Franklin aesthetic with crisp 2px border radius stamps, avoids hidden dropdown controls, and supports instant 1-click filtering or multi-status toggling.
  - Implemented `filterTasksByStatus(tasks, activeStatuses)` in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js) with 6 comprehensive unit tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) (including normalization between `Ⓓ` and `D/✓` delegation glyphs).
  - Added empty filter state message ("No master tasks match the selected status filter") with an inline "Reset filter" button.

- **Monthly Overview Calendar Responsiveness & Scrolling ([commit `1426e7f`](file:///home/mike/projects/day-planner))**:
  - Eliminated ~2 inches of dead bottom screen space by converting `.monthly-calendar-container` to flex column expansion (`flex: 1 1 0; min-height: 0;`) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Replaced hardcoded row tracks with dynamic row-fraction sizing: `:style="{ gridTemplateRows: 'repeat(' + (monthlyGrid.length / 7) + ', minmax(0, 1fr))' }"`.
  - Added explicit sticky weekday header row (`Sun` - `Sat`) above the calendar grid.
  - Enabled on-demand vertical scrolling (`overflow-y: auto`) on individual day cards with slender, unobtrusive scrollbars (`.month-day-cell::-webkit-scrollbar`).
  - Added `flex: 0 0 auto !important; min-height: 20px;` to `.month-event-item` to guarantee events on dense days (e.g. Sept 25, 2026 with 8 items) remain crisp, uncompressed, and fully readable.

- **Monthly Index In-App Navigation & Doc Links ([commit `81b75c3`](file:///home/mike/projects/day-planner))**:
  - Added 5th column `Daily Page` with `Jump to Day` (`.btn-jump-day`) letterpress button in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Clicking `Jump to Day` invokes `jumpToDailyPage(date, topic)`, which updates the selected date, switches the active view to `'today'`, searches for the note/decision card matching the topic/summary, highlights the card, and smoothly scrolls it into view.
  - Renamed `DIRECT DOC LINK` to `Source Doc` with text `View Google Doc ↗` to clarify that it opens the raw external document.

- **Google Doc Notes Architecture (Option 3 Selected)**:
  - Documented UX and technical architecture consultation in [`docs/CONSULT-monthly-index-and-doc-formatting.md`](file:///home/mike/projects/day-planner/docs/CONSULT-monthly-index-and-doc-formatting.md).
  - **Option 3 Wins (Best ROI)**: Treat the Google Doc as durable, machine-readable storage with native H2/H3 headings for document outline navigation and clean printouts, while treating the Day Planner SPA as the rich, styled presentation layer.
  - **Option 2 (2 Tabs) Rejected**: High regression risk. In Google Apps Script DocumentApp, `getBody()` binds to the active tab. If a user is viewing the `#view` tab, document-bound sidebar search (`gas-app/Code.gs:1875+`) searches the wrong tab.
  - **Prerequisite Plumbing Fix Identified**: `saveDailyDocCards` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1081-L1113) unconditionally calls `body.appendPageBreak()` and appends headings/cards, duplicating days on every save. An idempotent day section replacement must be implemented before formatting polish.

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`.
- **Latest Commits**:
  - [`81b75c3`](file:///home/mike/projects/day-planner): `feat(monthly-index): add Daily Page jump navigation column and record UX/Doc consultation`.
  - [`1426e7f`](file:///home/mike/projects/day-planner): `feat(tasks-calendar): status stamp filter toggles & monthly overview full-screen expansion with day y-scroll`.
- **Production Git Tag**: [`v1.0-pure-gas`](file:///home/mike/projects/day-planner) at commit [`81b75c3`](file:///home/mike/projects/day-planner).
- **Live Deployment State**:
  - HOME Prod (`day-planner-v01`): Version 185 (`@185`) live.
  - WORK Prod (`9csO`): Code promoted and Version 26 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`. Target deployment `Version 3` (`9csO`) awaits manual activation.
- **Pre-Flight Verification**: Passed cleanly:
  - `npm run lint`: 0 errors.
  - `npm test`: 115/115 unit tests passing across 14 suites.
  - `npm run check:gas-safe-chars`: Clean.
  - `CHROME_PORT=9230 npm run smoke`: All 8 suites passed cleanly with 0 console errors.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, archival ink blue `#1d5fa8`, plum `#5e3f6b`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)). Use crisp 2px border radius for stamps and tabs.
6. **Apps Script Safe Characters**: Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.
7. **Dual-Environment Isolation**: HOME is mastercopy; WORK is strictly production `/exec` promoted via `npm run push:work` ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Deploy Version 26 on WORK Deployment `Version 3` (`9csO`)**:
   - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, select deployment `Version 3` (`9csO`), edit, select **New version** (Version 26), and click **Deploy** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)).
2. **Google Doc Option 3 Architecture & Idempotent Replace Plumbing**:
   - In [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1081-L1113), fix `saveDailyDocCards` which currently unconditionally calls `body.appendPageBreak()` and appends headings/cards, duplicating days on every save.
   - Implement idempotent day replacement: locate existing day HEADING2, walk forward to the next HEADING2, and delete existing day elements in reverse index order before inserting updated cards.
   - Maintain Option 3: keep Google Doc as durable markdown-compatible storage with native H2/H3 for Google Docs outline/printouts, avoiding complex dual-tab synchronization hazards.
3. **Reconcile Specification & UI Copy Terminology**:
   - Reconcile [`REQUIREMENTS.md`](file:///home/mike/projects/day-planner/REQUIREMENTS.md#L88) ("2-Page Daily Spread") and app nav ("Daily 3-Column View" / "Today") so documentation and UI nomenclature are unified.

*(Subsequent Tasks)*:
- **4. Production Promotion of Phase 11 Enhancements (HOME & WORK)**: Push commits [`1426e7f`](file:///home/mike/projects/day-planner) and [`81b75c3`](file:///home/mike/projects/day-planner) to HOME (`@186`) and WORK (`@27` on `9csO`).
- **5. Live Workspace UAT of Phase 10 & 11 Features**: Verify Master Tasks status filter, Monthly Overview vertical expansion/scroll, and Monthly Index Daily Page routing in live GAS web apps.
- **6. Standalone Desktop Shortcut ("Open as Window")**: Verify Chrome desktop app shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

---

### IMMEDIATE NEXT STEP

Open [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), click **Edit** (pencil icon), select **New version** (Version 26), and click **Deploy**.
