# Active Tasks (TODO)

- [ ] **1. Deploy Version 26 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) under `michael.hoffman@gsa.gov`, select deployment `Version 3` (`9csO`), edit, select **New version** (Version 26), and click **Deploy**.
- [ ] **2. Google Doc Option 3 Architecture & Idempotent Replace Plumbing**:
  - In [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1081-L1113), fix `saveDailyDocCards` which currently unconditionally calls `body.appendPageBreak()` and appends headings/cards, duplicating days on every save.
  - Implement idempotent day replacement: locate existing day HEADING2, walk forward to the next HEADING2, and delete existing day elements in reverse index order before inserting updated cards.
  - Maintain Option 3: keep Google Doc as durable markdown-compatible storage with native H2/H3 for Google Docs outline/printouts, avoiding complex dual-tab synchronization hazards.
- [ ] **3. Reconcile Specification & UI Copy Terminology**:
  - Reconcile `REQUIREMENTS.md:88` ("2-Page Daily Spread") and app nav ("Daily 3-Column View" / "Today") so documentation and UI nomenclature are unified.
- [ ] **4. Production Promotion of Phase 11 Enhancements (HOME & WORK)**:
  - Push Phase 11 commits (`1426e7f` and `81b75c3`) to HOME (`day-planner-v01` -> `@186`).
  - Promote to WORK via `npm run push:work` and cut Version 27 targeting `9csO`.
- [ ] **5. Live Workspace UAT of Phase 10 & 11 Features**:
  - Verify Master Tasks status filter toggles (`[All]`, `[•]`, `[✓]`, etc.).
  - Verify Monthly Overview full vertical expansion and on-demand day card scrolling on dense days.
  - Verify Monthly Index `Daily Page` (`Jump to Day`) in-app routing and `Source Doc` (`View Google Doc`) links.
- [ ] **6. Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

