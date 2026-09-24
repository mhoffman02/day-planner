# Active Tasks (TODO)

## Phase 8: Advanced Productivity UX Ergonomics

- [ ] **1. Segmented Priority Selector (`Proposal B`)**:
  - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L160-L171), replace `<select class="task-priority-select">` with compact segmented stamp tabs `[ A | B | C ]` bound to `newTaskPriorityGroup`.
  - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), style tabs with Franklin letterpress stamp aesthetic (sharp 2px corners, **strictly no pills**).
  - Color-code active states: Priority A Brick Red (`#dc2626`), Priority B Warm Ochre (`#d97706`), Priority C Binder Teal (`#2d6a5a`).
  - Keep choices permanently visible; preserve `Enter` key submission from input using active priority.

- [ ] **2. Column Maximize / Focus Mode (`open_in_full` / `close_fullscreen`)**:
  - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), add maximize button to header actions of Tasks, Appointments, and Daily Notes columns.
  - In [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), track `maximizedColumn` ('tasks' | 'appointments' | 'notes' | null) as ephemeral Alpine state.
  - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), set `.has-maximized-column .col:not(.is-maximized)` and `.column-resizer` to `display: none;`, expanding the active column to `width: 100% !important` without touching `localStorage` saved widths.
  - Bind `Escape` key listener to collapse back to regular persisted widths.

- [ ] **3. Branch Merge (`feat/modern-normalize` -> `pure-gas-main`), Release `@171`, and Promotion**:
  - Verify all 5 views and new UX ergonomics via Playwright and clasp push to HOME dev endpoint.
  - Fast-forward merge `feat/modern-normalize` into `pure-gas-main`:
    ```bash
    git checkout pure-gas-main && git merge --ff-only feat/modern-normalize
    ```
  - Create new pinned release version on HOME (`@171`) and promote to WORK via `npm run push:work`.

## Phase 6: Live Workspace UAT & Production Release

- [ ] **4. Federal WORK Environment Access & Validation**:
  - Point Web App deployment to latest version in GSA IDE (access restricted to `MYSELF`).
  - Verify production URL [`https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) on locked-down WORK PC (`michael.hoffman@gsa.gov`).
  - Verify first-party Google Workspace authorization without enterprise proxy blocks ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

- [ ] **5. Run Log Google Doc Confirmation & Production Tagging (`git tag`)**:
  - Open `Day Planner` Google Drive folder on HOME account.
  - Verify [`Day Planner - Run Log`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74-L125) Google Doc exists and logged sync executions.
  - Once WORK environment and Run Log are validated:
    `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.
  - Verify standalone desktop shortcut ("Open as Window") from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
