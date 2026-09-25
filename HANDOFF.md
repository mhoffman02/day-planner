# Context Handoff Document

### OBJECTIVE

Validate production promotion of task status menu and note popover bottom-clipping fixes, runtime environment documentation, golden navbar active tab styling, and Phase 9 ergonomic polish (dynamic dropup detection for status menu and note popovers preventing bottom clipping, viewport height bounds with internal scroll, JSDoc architecture headers for index.html vs gas-app/Index.html, golden #d4a017 active navbar indicator, task status dropdown "Delete" item with trashcan icon, "Delegated" label update, priority button hover tooltips, keyboard shortcuts, inline #a/#b/#c priority prefix detection, rounded outer corners on Priority A & C buttons, sanitized HTML vs plain-text description formatting, gCal direct event links, thematic non-alert priority colors, and local Pacific time) across HOME (`@182`) and WORK (`@21` on deployment `9csO`). Confirm live Workspace UAT and maintain pure GAS release tag `v1.0-pure-gas`.

---

### KEY DECISIONS

- **Task Status Menu & Note Popover Dropup Positioning (Zero Bottom Clipping)**: Fixed bottom clipping on the last 1-3 task rows without requiring manual scrolling:
  - Added `notesPopoverDropUp` state and dynamic dropup detection (`(spaceBelow < 180 && spaceAbove > spaceBelow) || spaceBelow < 100`) to `openNotesPopover` and `toggleNotesPopover` across [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Expanded Status Menu dropup threshold (`(spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160`) to accommodate the full 265px height with the Delete action button.
  - Bound `.dropup` (`bottom: calc(100% + 4px); top: auto;`) and `.dropdown-down` (`top: 100%; bottom: auto;`) classes across [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Added viewport limits (`max-height: min(240px, 40vh)` on `.notes-popover` and `max-height: min(320px, 80vh)` on `.status-menu`) with `overflow-y: auto` and `word-break: break-word`.
  - Guarded static CSS fallback to `tbody tr:nth-child(n+4):nth-last-child(-n+3)` so short tables (1-3 rows) never force top rows upward into negative header space ([commit `cffc7a6`](file:///home/mike/projects/day-planner)).
- **Runtime Environment Documentation**: Added comprehensive JSDoc header comments to [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) explicitly documenting the two runtime environments:
  1. `index.html` (Local Dev / Mock Server): Root entry point for local browser development and testing (`npm start`, `server.js`). Loads standard ES modules and external assets directly via `src/app.js` and `src/styles.css`.
  2. `gas-app/Index.html` (Google Apps Script Production): Apps Script web app template deployed to Google Workspace via clasp. Bundles `gas-app/Styles.html` and `gas-app/Script.html` via template includes (`<?!= include("Styles"); ?>` and `<?!= include("Script"); ?>`) into a single pure-GAS payload served at `/exec` ([commit `75cdeeb`](file:///home/mike/projects/day-planner)).
- **Golden Active Navbar Tab Indicator**: Replaced minty accent (`#58bfa2`) with authentic Franklin gold-foil stamp color (`#d4a017`) on the active navbar tab indicator (`.segment-btn.active`) across [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html). Verified WCAG AA contrast (6.12:1 on `#142e23`) in [`tools/audit-wcag-responsive.js`](file:///home/mike/projects/day-planner/tools/audit-wcag-responsive.js) ([commit `75cdeeb`](file:///home/mike/projects/day-planner)).
- **Task Status Dropdown "Delete" Item & Trashcan Icon**: Added a separated "Delete" action button featuring a Google Material Symbols trashcan icon (`<span class="material-symbols-outlined icon-14">delete</span>`) at the bottom of the Daily Tasks status dropdown menu in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html). Wired to `deleteDailyTask(task)` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), invoking `Tasks.Tasks.remove('@default', taskId)` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and removing the task from local collection and mock store with automatic 2-way sync ([commit `2d94772`](file:///home/mike/projects/day-planner)).
- **"Delegated" Status Menu Label**: Shortened the status dropdown label from `"Delegated (Done)"` to `"Delegated"` across [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), retaining the authentic Franklin symbol `Ⓓ` while simplifying user reading flow.
- **Task Priority Button Hover Titles & Keyboard Shortcuts**: Added hover tooltips (`title="A: Top priority (Alt+A or #a)"`, `title="B: Medium priority (Alt+B or #b)"`, `title="C: Normal priority (Alt+C or #c)"`) and `accesskey="a/b/c"`. Wired global and field keyboard shortcuts for `Alt+A/B/C` and `Ctrl+Shift+A/B/C` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) that switch active priority and focus the task input field without conflicting with browser standard Select-All (`Ctrl+A`) or Copy (`Ctrl+C`) ([commit `21a551d`](file:///home/mike/projects/day-planner)).
- **Inline `#a`, `#b`, `#c` Task Priority Parsing**: Implemented `extractInlinePriority` in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html). Typing or pasting `#a`, `#b`, or `#c` (with colon, dash, or whitespace separator) activates the corresponding priority button and strips the prefix, while preserving regular hashtag words (e.g., `#accounting`). Updated placeholder to `Add task title (e.g. Call vendor / #a Call vendor)...` across [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
- **Status Popup Menu Clipping & Dropup**: Fixed bottom clipping by setting `overflow: visible` on `figure.table-container` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html). Added dynamic dropup space detection in `openStatusMenu` / `toggleStatusMenu` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and elevated z-index on active task rows to prevent any overlap or clipping ([commit `81d518d`](file:///home/mike/projects/day-planner)).
- **Rounded Outer Priority Buttons Corners**: Styled `.priority-segmented-group` with `border-radius: 6px` and added explicit outer corner radii to Priority "A" (NW, SW: `border-top-left-radius: 5px; border-bottom-left-radius: 5px;`) and Priority "C" (NE, SE: `border-top-right-radius: 5px; border-bottom-right-radius: 5px;`) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), keeping inner shared borders flush and rectilinear.
- **Appointment Modal HTML vs Plain-Text Rendering**: Descriptions matching `/<[a-z][\s\S]*?>/i` are sanitized (stripping scripts, styles, on-event handlers, and unsafe protocols; setting `target="_blank" rel="noopener noreferrer"` on links) and rendered via `x-html`. Plain-text descriptions are escaped and wrapped in `<pre>` to preserve line breaks ([commit `6f25dc2`](file:///home/mike/projects/day-planner)). Bound via `formatEventDescriptionHtml` in [`src/calendarEngine.js`](file:///home/mike/projects/day-planner/src/calendarEngine.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
- **Google Calendar Direct Event Link Resolution**: Fixed Google Calendar 500 error by returning authentic `htmlLink` from `getDailyData` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) via `Calendar.Events` or hand-building `https://calendar.google.com/calendar/event?eid=` using `Utilities.base64EncodeWebSafe(bareId + ' ' + defaultCalId)`. Eliminated broken `/calendar/r/eventedit/${cleanId}` paths, falling back safely to the calendar day view when no event link is available.
- **Thematic Non-Alert Priority Colors**: Replaced red and orange priority colors with an authentic, non-alert palette: Priority A Archival Ink Blue (`#1d5fa8`), Priority B Bookbinder Plum (`#5e3f6b`), Priority C Binder Forest Green (`#2d6a5a`) ([commit `ef8ffba`](file:///home/mike/projects/day-planner)). Bound to `--priority-a/b/c` tokens across [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`.
- **Latest Commit**: [`cffc7a6`](file:///home/mike/projects/day-planner) (`fix(tasks): prevent status popup menu and note popover clipping via dynamic dropup and max-height constraints`).
- **Production Git Tag**: [`v1.0-pure-gas`](file:///home/mike/projects/day-planner) updated to commit [`cffc7a6`](file:///home/mike/projects/day-planner) and pushed to GitHub origin.
- **Live Deployment State**:
  - HOME Prod (`day-planner-v01`): Version 182 (`@182`) live at [https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec).
  - WORK Prod (`9csO`): Code promoted and Version 21 created on script `1980roEKgkC_...`. Target endpoint is [https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec](https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec).
- **Pre-Flight Verification**: Passed cleanly:
  - `npm run lint`: 0 errors.
  - `npm test`: 99/99 unit tests passing across 12 suites.
  - `npm run check:gas-safe-chars`: Clean.
  - `CHROME_PORT=9224 npm run smoke`: All 8 suites passed cleanly.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
2. **Salutation**: Start every reply with `🔋Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch.
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, archival ink blue `#1d5fa8`, plum `#5e3f6b`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)). Use crisp 2px border radius for stamps and tabs.
6. **Apps Script Safe Characters**: Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.
7. **Dual-Environment Isolation**: HOME is mastercopy; WORK is strictly production `/exec` promoted via `npm run push:work` ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Activate Version 21 on WORK Deployment `Version 3` (`9csO`)**:
   - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit), select deployment `Version 3` (`9csO`), click **Edit** (pencil), select **New version** (or Version 21), and click **Deploy** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)).
2. **Live Workspace UAT of Phase 9 & Ergonomic Fixes**:
   - Verify Status popup menu opens without clipping on all tasks (including bottom rows) and drops up cleanly without scrolling.
   - Verify Note hover popover opens upward on bottom rows without clipping and shows full note content.
   - Verify active navbar tab shows golden (`#d4a017`) underline indicator instead of minty accent.
   - Verify Status dropdown menu shows "Delegated" (without "(Done)") and "Delete" item with trashcan icon.
   - Verify clicking "Delete" removes the task entirely from the list and Google Tasks backend.
   - Verify Priority buttons show hover text and `Alt+A`, `Alt+B`, `Alt+C` hotkeys switch priority and focus task input.
   - Verify typing `#a Call vendor` sets priority to A and creates the task with clean title `Call vendor`.
   - Verify Priority buttons show rounded outer corners on A (NW/SW) and C (NE/SE).
   - Verify HTML event descriptions render with active new-tab links, plain-text descriptions format cleanly with preserved whitespace, and [Open in gCal] opens the specific event without 500 error on HOME (`@182`) and WORK (`@21`) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)).
3. **Standalone Desktop Shortcut ("Open as Window")**:
   - Verify Chrome "Install Day Planner" / "Open as window" desktop workflow from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)).

---

### IMMEDIATE NEXT STEP

Open [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), click **Edit** (pencil), select **New version** (Version 21), and click **Deploy**.
