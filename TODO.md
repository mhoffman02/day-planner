# Active Tasks (TODO)

- [ ] **1. Deploy Version 26 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, select deployment `Version 3` (`9csO`), edit, select **New version** (Version 26), and click **Deploy**.
- [x] **2. Google Doc Option 3 Architecture & Idempotent Replace Plumbing**:
  - Fixed `saveDailyDocCards` and `getOrCreateDailyDocContent` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1030-L1150) to implement idempotent day section replacement in reverse index order, eliminating duplicate day appends.
  - Added unit test suite in [`tests/gasDocIdempotency.test.js`](file:///home/mike/projects/day-planner/tests/gasDocIdempotency.test.js).
- [x] **3. Reconcile Specification & UI Copy Terminology**:
  - Reconciled [`REQUIREMENTS.md`](file:///home/mike/projects/day-planner/REQUIREMENTS.md#L59) and [`PRD.md`](file:///home/mike/projects/day-planner/PRD.md#L36) so "2-Page Daily Spread", "Daily 3-Column View", and "Today" / "Daily Page" nomenclature are explicitly aligned.
- [ ] **4. Production Promotion of Phase 11 Enhancements (HOME & WORK)**:
  - Push Phase 11 commits (`1426e7f` and `81b75c3`) to HOME (`day-planner-v01` -> `@186`).
  - Promote to WORK via `npm run push:work` and cut Version 27 targeting `9csO`.
- [ ] **5. Live Workspace UAT of Phase 10 & 11 Features**:
  - Verify Master Tasks status filter toggles (`[All]`, `[•]`, `[✓]`, etc.).
  - Verify Monthly Overview full vertical expansion and on-demand day card scrolling on dense days.
  - Verify Monthly Index `Daily Page` (`Jump to Day`) in-app routing and `Source Doc` (`View Google Doc`) links.
- [ ] **6. Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

