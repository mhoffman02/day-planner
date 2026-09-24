# Context Handoff Document

### OBJECTIVE

Implement user-approved Phase 8 productivity UX enhancements on branch `feat/modern-normalize`: (1) a letterpress segmented priority selector `[ A | B | C ]` with single `[+]` button and sticky `Enter` key submission (Proposal B), and (2) 1-click Column Focus Mode (`open_in_full` / `close_fullscreen`) for Tasks, Appointments, and Daily Notes columns. Once verified, fast-forward merge `feat/modern-normalize` into `pure-gas-main` and deploy to HOME (`@171`) and WORK.

---

### KEY DECISIONS

- **Proposal B Segmented Priority Selector**: Rather than 3 separate submit buttons (which breaks the `Enter` key default action and causes Fitts's Law touch misclicks), decouple priority *selection* from *submission*. Replace `<select class="task-priority-select">` with compact letterpress stamp tabs `[ A | B | C ]` on the left of the input, keeping a single `[+]` submit button on the right. Active states are color-coded in authentic Franklin Covey tones (Brick Red `#dc2626` for A, Warm Ochre `#d97706` for B, Binder Teal `#2d6a5a` for C). The component remembers the last-used priority for rapid bulk task entry, and typing a title then hitting `Enter` immediately submits using the active priority.
- **Ephemeral Column Focus Mode (Zero `localStorage` Corruption)**: Expanding a column to 100% width must NEVER overwrite `localStorage['dayPlannerColumnWidths']`. Doing so would permanently erase user drag customizations if the tab is refreshed or closed while maximized. Instead, manage `maximizedColumn: 'tasks' | 'appointments' | 'notes' | null` purely in Alpine state, applying `.has-maximized-column` to the spread wrapper and `.is-maximized` to the active column. While active, the other 2 columns and both resizers are set to `display: none;`, and pressing `Escape` collapses back to the preserved `localStorage` widths.
- **Standard Panes Iconography**: Use standard Material Symbols `open_in_full` (expand) and `close_fullscreen` (restore) rather than horizontal double-arrows (`↔`), which conflict with the resizer's `col-resize` cursor.
- **Google Calendar Side-by-Side Overlapping Events**: In [commit `7baf634`](file:///home/mike/projects/day-planner), `.schedule-content` was updated to `display: flex; flex-direction: row; gap: 6px; align-items: stretch;` with `flex: 1 1 0; min-width: 0;` on `button.event-pill`. 1 event takes 100% width, 2 overlapping events take 50% each side-by-side, and 3 take 33% each with clean ellipsis truncation.
- **Active Clasp Target Invariant**: Active development target remains HOME mastercopy (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`) in [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2). WORK (`1980roEKgkC_...`) is promoted only via `npm run push:work`.

---

### CURRENT STATE

- **Repository Branch**: `feat/modern-normalize`.
- **Latest Commit**: [`7baf634`](file:///home/mike/projects/day-planner) (`feat(calendar): implement Google Calendar style side-by-side event stacking for overlapping appointments`).
- **Live Deployment State**:
  - HOME `@HEAD`: Deployed via `clasp push` with all style fixes and side-by-side layout live at [https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev).
  - HOME Prod (`day-planner-v01`): Version 170 (`@170`).
  - WORK Prod (`Day-Planner-WORK`): Version 7 (`@7`).
- **Pre-Flight Verification**: Passed cleanly before handoff generation:
  - `npm run lint`: 0 errors.
  - `npm test`: 88/88 unit tests passing across 11 suites.
  - `npm run check:gas-safe-chars`: Clean.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch.
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)). Use crisp 2px border radius for stamps and tabs.
6. **Apps Script Safe Characters**: Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.
7. **Dual-Environment Isolation**: HOME is mastercopy; WORK is strictly production `/exec` promoted via `npm run push:work` ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Implement Segmented Priority Selector (`Proposal B`)**:
   - In [`gas-app/Index.html#L160-L171`](file:///home/mike/projects/day-planner/gas-app/Index.html#L160-L171), replace `<select class="task-priority-select">` with a segmented control containing 3 stamp buttons `[ A | B | C ]` bound to `newTaskPriorityGroup`.
   - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), add `.priority-segmented-group` and `.priority-segment-btn` with letterpress styling and active color tokens (`#dc2626` for A, `#d97706` for B, `#2d6a5a` for C).
   - Ensure input text field retains `flex: 1` and `min-width: 0;`, and pressing `Enter` submits with the active priority tab.

2. **Implement Column Focus / Maximize Mode**:
   - In [`gas-app/Index.html#L153-L157`](file:///home/mike/projects/day-planner/gas-app/Index.html#L153-L157) (Tasks), [`#L251-L260`](file:///home/mike/projects/day-planner/gas-app/Index.html#L251-L260) (Appointments), and [`#L295-L338`](file:///home/mike/projects/day-planner/gas-app/Index.html#L295-L338) (Daily Notes), add maximize action button:
     `<button type="button" class="btn-icon-subtle" @click="toggleMaximizeColumn('tasks')" :title="maximizedColumn === 'tasks' ? 'Restore Columns (Esc)' : 'Maximize Tasks'"><span class="material-symbols-outlined" x-text="maximizedColumn === 'tasks' ? 'close_fullscreen' : 'open_in_full'"></span></button>`.
   - In [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), add `maximizedColumn: null`, `toggleMaximizeColumn(name)`, and global `Escape` key event listener.
   - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), add:
     ```css
     .two-page-spread.has-maximized-column .page-panel:not(.is-maximized) { display: none !important; }
     .two-page-spread.has-maximized-column .column-resizer { display: none !important; }
     .two-page-spread.has-maximized-column .page-panel.is-maximized { width: 100% !important; flex: 1 1 100% !important; }
     ```

3. **Verify, Merge to `pure-gas-main`, Release `@171`, and Promote to WORK**:
   - Run `npm run lint && npm test`.
   - Push to HOME dev endpoint with `clasp push` and verify live in Chrome.
   - Fast-forward merge `feat/modern-normalize` to `pure-gas-main`:
     ```bash
     git checkout pure-gas-main && git merge --ff-only feat/modern-normalize
     ```
   - Deploy new release version on HOME (`@171`) and promote to WORK via `npm run push:work`.

---

### IMMEDIATE NEXT STEP

Edit [`gas-app/Index.html#L160-L171`](file:///home/mike/projects/day-planner/gas-app/Index.html#L160-L171) to replace the priority `<select>` dropdown with the 3 segmented stamp buttons `[ A | B | C ]`:
```html
<div class="priority-segmented-group" role="radiogroup" aria-label="Task Priority">
  <button type="button" class="priority-segment-btn" :class="{ 'active a': newTaskPriorityGroup === 'A' }" @click="newTaskPriorityGroup = 'A'">A</button>
  <button type="button" class="priority-segment-btn" :class="{ 'active b': newTaskPriorityGroup === 'B' }" @click="newTaskPriorityGroup = 'B'">B</button>
  <button type="button" class="priority-segment-btn" :class="{ 'active c': newTaskPriorityGroup === 'C' }" @click="newTaskPriorityGroup = 'C'">C</button>
</div>
```
