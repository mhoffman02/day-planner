# Active Tasks (TODO)

- [ ] **1. Deploy Version 28 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, click **Deploy** > **Manage deployments**, select deployment `Version 3` (`9csO`), edit (pencil icon), select **Version 28**, and click **Deploy**.
- [x] **2. Production Promotion of Phase 11 Enhancements (HOME & WORK)**:
  - Pushed Phase 11 commits to HOME (`day-planner-v01` -> `@186` live).
  - Promoted to WORK via `npm run push:work` and cut Version 28 targeting `9csO`.
- [ ] **3. Live Workspace UAT of Phase 10 & 11 Features**:
  - Verify Master Tasks status filter toggles (`[All]`, `[•]`, `[✓]`, etc.).
  - Verify Monthly Overview full vertical expansion and on-demand day card scrolling on dense days.
  - Verify Monthly Index `Daily Page` (`Jump to Day`) in-app routing and `Source Doc` (`View Google Doc`) links.
  - Verify Google Doc notes idempotent saving without duplicate day sections.
- [ ] **4. Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).


