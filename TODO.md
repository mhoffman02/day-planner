# Active Tasks (TODO)
 
- [ ] **1. Deploy Version 41 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), edit (pencil icon), select **New version** (Version 41), and click **Deploy**.
- [ ] **2. Live Workspace UAT of Phase 12 & 13 Features**:
  - Verify scroll-on-demand containers and sticky headers across all tabs:
    - **Index Tab**: `.monthly-index-table-container` with sticky column headers and scroll-on-demand rows.
    - **Future Tab**: `.future-matrix-container` with fixed year navigation header and scrollable 12-month card grid.
    - **About Tab**: `.about-view-container` with contained vertical document scrolling.
    - **Daily Tab**: `.daily-tasks-table-container` with sticky column headers and scroll-on-demand tasks, matching the schedule and note card container heights.
    - **Master Tasks**: `.master-tasks-table-container` with sticky header and scrollable tasks.
  - Verify Master Tasks Move to Date action (`markMasterTaskMoved` bugfix: `encodeTaskStatusNotes`).
  - Verify subtle, tasteful thematic scrollbar styling in both Dark and Light modes (8px slim, 2px border radius, themed tracks and thumbs).
  - Verify Master Tasks Quick-Add bar (`New Task:` framing, priority tooltip, spinner on add, auto-switch to `All Dates` on submit, row flash highlight).
  - Verify compact 18px category segmented buttons on note cards.
  - Verify Master Tasks Date Horizon filter (`[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]`).
  - Verify Master Tasks status filter title `"Status filter"`.
  - Verify Master Tasks sortable `Due Date` column and contextual actions (`Jump to Day` vs `Move to Date`).
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

