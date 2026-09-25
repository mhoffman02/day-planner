# Context Handoff Document

### OBJECTIVE

Execute Master Tasks Option A: Unified Commitment Clearinghouse with Thematic Blue Date Horizon Filters (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`). Display all incomplete tasks across all dates (past, today, future) on Master Tasks, deduplicate moved tasks, update the status filter title to "Status filter", and style the Date Horizon filter buttons in thematic archival blue visually distinct from the forest teal status filter.

---

### KEY DECISIONS

- **Master Tasks Option A: Unified Clearinghouse & Thematic Blue Date Horizon Filters ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L3-L10))**:
  - **Philosophy**: Incomplete tasks scheduled for past or future dates previously vanished from Master Tasks because [`gas-app/Code.gs:1396`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1396) strictly filtered out all tasks with `t.due`. Master Tasks now becomes the unified clearinghouse: undated backlog tasks plus any incomplete dated task (`status !== '✓' && status !== 'X'`).
  - **Title Update**: Status filter toolbar header label updated from `"Filter:"` to `"Status filter"` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L578) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - **Date Horizon Filters**: Buttons labeled `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]` (specifically `"Future"`, NOT `"Future due"`).
  - **Visual Distinction**: Date Horizon filter buttons styled in thematic archival blue (`var(--ink-blue, #1d5fa8)`, inverted blue active fill, 2px border radius, strictly no pills) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) to distinguish them from the forest teal status filters.
  - **Deduplication**: When a master task is moved to a daily list (`[MovedTo: date, id]` / `[SourceMaster: id]`), merge them into a single logical record displaying the target scheduled date and live status.
  - **Table Due Date Column**: Add sortable `Due Date` column in Master Tasks table with date stamps (`Sep 28, 2026`, `Overdue`, `Undated`), plus contextual Action buttons (`Jump to Day` for scheduled vs `Move to Date` for undated).

- **Note Card Compact 18px Category Segmented Button-Checkboxes ([commits `254b6cb` & `1de4bba`](file:///home/mike/projects/day-planner))**:
  - Relocated the category control from a single bar at the top of the column into `.card-summary-col` directly underneath the `"Set a Topic to index this card"` summary textbox (`.card-heading-input`) inside each note card in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Reduced control height from 26px to **18px** (~33% reduction), font size to `0.68rem`, padding to `0 6px`, checkmark icon to `11px`, and preserved crisp 2px border radius (strictly no pills) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Implemented `toggleCardCategory(card, cat)` and `isCardCategorySelected(card, cat)` for per-card multi-select toggle behavior in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Serialized categories per card under `###` heading in markdown as `#category: <cats>`, parsed losslessly in `parseDailyNoteToCards()` and [`src/indexParser.js`](file:///home/mike/projects/day-planner/src/indexParser.js).
  - Wired `buildIndexRecords()` to pull each card's categories directly for Monthly Index rendering under `Topic / Category`.
  - Added unit test in [`tests/indexParser.test.js`](file:///home/mike/projects/day-planner/tests/indexParser.test.js).

- **Live Workspace UAT Verifications**:
  - Appointment popup "Join with Google Meet" button verified working.
  - Monthly Index Topic indexing verified working.

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`.
- **Latest Commits**:
  - [`1de4bba`](file:///home/mike/projects/day-planner): `docs(todo): record Version 34 on WORK and UAT status for per-card categories`.
  - [`254b6cb`](file:///home/mike/projects/day-planner): `fix(notes): compact 18px category segmented button-checkboxes placed under summary textbox in note cards`.
  - [`831b6b4`](file:///home/mike/projects/day-planner): `docs(handoff): session transition and task queue`.
  - [`a4eb7b0`](file:///home/mike/projects/day-planner): `feat(notes-calendar): google meet link extraction & category segmented multi-pick toggles`.
- **Production Git Tag**: [`v1.0-pure-gas`](file:///home/mike/projects/day-planner) at commit [`1de4bba`](file:///home/mike/projects/day-planner).
- **Live Deployment State**:
  - HOME Prod (`day-planner-v01`): Version 189 (`@189`) live on `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - WORK Prod (`9csO`): Code promoted and Version 34 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`. Target deployment `Version 3` (`9csO`) awaits manual activation to Version 34.
- **Pre-Flight Verification**: Passed cleanly:
  - `npm run lint`: 0 errors.
  - `npm test`: 124/124 unit tests passing across 15 suites.
  - `npm run check:gas-safe-chars`: Clean.

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

1. **Master Tasks Option A: Unified Clearinghouse & Thematic Blue Date Horizon Filters**:
   - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L578) and [`index.html`](file:///home/mike/projects/day-planner/index.html), rename status filter label from `"Filter:"` to `"Status filter"`.
   - Add Date Horizon filter button group directly beside the status stamps: `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]` (using `"Future"`, NOT `"Future due"`).
   - Style Date Horizon filter buttons in thematic archival blue (`var(--ink-blue, #1d5fa8)`, blue active state, crisp 2px border radius, strictly no pills) to make them visually distinct from the forest teal Status filter in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
   - Update [`getMasterTasks`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1384) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) to retrieve all tasks with `!t.due` PLUS any dated task (`t.due`) that is not complete (`status !== '✓' && status !== 'X' && t.status !== 'completed'`).
   - Collapse moved master tasks (`[MovedTo: date, id]` / `[SourceMaster: id]`) to prevent twin duplicate rows.
   - Add `Due Date` column in Master Tasks table (sortable by date), displaying date stamps (`Sep 28, 2026`, `Overdue`, `Undated`), and contextual Action buttons (`Jump to Day` vs `Move to Date`).
   - Add automated unit tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) and [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L3-L10)).
2. **Deploy Version 34 on WORK Deployment `Version 3` (`9csO`)**:
   - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), edit (pencil icon), select **New version** (Version 34), and click **Deploy** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L11-L12)).
3. **Live Workspace UAT of Phase 12 & 13 Features**:
   - Verify compact 18px category segmented buttons on note cards.
   - Verify Master Tasks Date Horizon filter (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`).
   - Verify Master Tasks status filter title `"Status filter"`.
   - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L13-L17)).

---

### IMMEDIATE NEXT STEP

In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L578) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L578), rename `"Filter:"` to `"Status filter"`, add the Date Horizon filter button group `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`, and style the group in thematic archival blue (`var(--ink-blue, #1d5fa8)`) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
