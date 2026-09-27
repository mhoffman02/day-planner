# Active Tasks (TODO)

- [ ] **1. Live Feature Smoke Verification (HOME @224)**:
  - [ ] **Note Cards Drive Link Modal**: Test inserting a Google Doc/Sheet link into a note card and verify title auto-lookup with tab-off and fallback title generation.
  - [ ] **Ballot Box & Calendar Popovers**: Test checklist toggle (`☐` / `☒`) in note cards and verify themed popovers open cleanly across Today, Month, Index, and Master Tasks Due Date.

- [ ] **2. Live WORK Production Smoke Verification (WORK @55)**:
  - [ ] **GSA Workspace Access**: Open WORK deployment [`9csO`](https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec) under `michael.hoffman@gsa.gov` and confirm Version 55 features load without permission errors.

- [ ] **3. Offline Sync Queue Resilience & Performance Audit**:
  - [ ] **Sync Error Handling**: Audit and reinforce transient offline network failure retry logic in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
