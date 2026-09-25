# Active Tasks (TODO)

- [ ] **1. Master Tasks Option A: Unified Clearinghouse & Thematic Blue Date Horizon Filters**:
  - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L578) and [`index.html`](file:///home/mike/projects/day-planner/index.html), rename status filter label from `"Filter:"` to `"Status filter"`.
  - Add Date Horizon filter button group directly beside the status stamps: `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]` (using `"Future"`, NOT `"Future due"`).
  - Style Date Horizon filter buttons in thematic archival blue (`var(--ink-blue, #1d5fa8)`, blue active state, crisp 2px border radius, strictly no pills) to make them visually distinct from the forest teal Status filter in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Update [`getMasterTasks`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1384) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) to retrieve all tasks with `!t.due` PLUS any dated task (`t.due`) that is not complete (`status !== '✓' && status !== 'X' && t.status !== 'completed'`).
  - Collapse moved master tasks (`[MovedTo: date, id]` / `[SourceMaster: id]`) to prevent twin duplicate rows.
  - Add `Due Date` column in Master Tasks table (sortable by date), displaying date stamps (`Sep 28, 2026`, `Overdue`, `Undated`), and contextual Action buttons (`Jump to Day` vs `Move to Date`).
  - Add automated unit tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) and [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
- [ ] **2. Deploy Version 34 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), edit (pencil icon), select **New version** (Version 34), and click **Deploy**.
- [ ] **3. Live Workspace UAT of Phase 12 & 13 Features**:
  - Verify compact 18px category segmented buttons on note cards.
  - Verify Master Tasks Date Horizon filter (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`).
  - Verify Master Tasks status filter title `"Status filter"`.
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
