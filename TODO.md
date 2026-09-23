# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Live Workspace UAT on Web App Endpoint (`day-planner-v01`)**:
  > ⚠️ NEVER use `/a/macros/gsa.gov/` — consumer script, enterprise proxy returns 404 before `doGet()` runs.
  - Production self-test (anyone): [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test)
  - Dev self-test (HOME account only): [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test)
  - Confirm all 5 test suites pass (100% HEALTHY) and verify the Recent Server Execution Logs table.
  - Verify Day Planner folder auto-creation and 2-way sync with live Google Calendar and Google Tasks.
  - Verify Google Doc run-log (`Day Planner - Run Log`) created inside Day Planner folder.
  - Test on federal locked-down WORK environment (without Chrome extensions/dev tools).


- [ ] **Production Release Deployment (`clasp deploy`)**:
  - After live UAT sign-off, redeploy production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` via `clasp deploy -i AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q -d "day-planner-v01 update"`.
  - Tag git repository with release version tag (e.g. `v1.0-pure-gas`).

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
