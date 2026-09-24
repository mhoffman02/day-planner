# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Live Workspace 2-Way Sync Verification**:
  - Create a test daily task and verify bidirectional reflection in Google Tasks.
  - Create/edit an appointment and verify reflection in Google Calendar.
  - Verify `Day Planner - Run Log` Google Doc auto-creation and log appending in `Day Planner` Drive folder.

- [ ] **Federal WORK Environment Access & Validation**:
  - Open production URL [`https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec) on locked-down WORK PC (`michael.hoffman@gsa.gov`).
  - Verify first-party Google Workspace authorization and permissions.

- [ ] **Production Release Tagging (`git tag`)**:
  - Tag git release: `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
