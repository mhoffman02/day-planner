# Active Tasks (TODO)

- [ ] **1. Live Production Smoke & Feature Verification (HOME @224)**:
  - [ ] **CDP Live Health Probe**: Run `npm run probe` against active Chrome tab ([`AKfycbzVTow...`](https://script.google.com/macros/s/AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w/exec)) to verify 0 console errors and clean DOM structure.
  - [ ] **Live Interactive Checks**: Verify Drive filename auto-lookup in note card link modal, ballot box toggle (`☐` / `☒`), and themed calendar popovers across Today, Month, Index, and Master Tasks.

- [ ] **2. Live WORK Production Smoke Verification (WORK @55)**:
  - [ ] **GSA Workspace Access**: Open WORK deployment [`9csO`](https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec) under `michael.hoffman@gsa.gov` and confirm Version 55 features load without permission errors.

- [ ] **3. Offline Sync Queue Resilience & Performance Audit**:
  - [ ] **Sync Error Handling**: Audit and reinforce transient offline network failure retry logic in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
