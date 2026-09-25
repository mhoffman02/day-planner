# Active Tasks (TODO)

- [ ] **1. Deploy Version 26 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, select deployment `Version 3` (`9csO`), edit, select **New version** (Version 26), and click **Deploy**.
- [ ] **2. Production Promotion of Phase 11 Enhancements (HOME & WORK)**:
  - Push Phase 11 commits (`1426e7f`, `81b75c3`, and `07f528d`) to HOME (`day-planner-v01` -> `@186`).
  - Promote to WORK via `npm run push:work` and cut Version 27 targeting `9csO`.
- [ ] **3. Live Workspace UAT of Phase 10 & 11 Features**:
  - Verify Master Tasks status filter toggles (`[All]`, `[•]`, `[✓]`, etc.).
  - Verify Monthly Overview full vertical expansion and on-demand day card scrolling on dense days.
  - Verify Monthly Index `Daily Page` (`Jump to Day`) in-app routing and `Source Doc` (`View Google Doc`) links.
  - Verify Google Doc notes idempotent saving without duplicate day sections.
- [ ] **4. Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).


