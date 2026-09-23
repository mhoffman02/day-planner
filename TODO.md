# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Live Workspace UAT on Web App Dev Endpoint**:
  - Open dev web app endpoint (`/dev`: `https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev`) in personal Google account (HOME).
  - Open `/self-test` diagnostic endpoint (`https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test`) to confirm live Google Drive, Tasks, and Calendar service bindings.
  - Verify Day Planner folder auto-creation and 2-way sync with live Google Calendar and Google Tasks.
  - Test on federal locked-down WORK environment (without Chrome extensions/dev tools).

- [ ] **Production Release Deployment (`clasp deploy`)**:
  - After live UAT sign-off, redeploy production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` via `clasp deploy -i AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q -d "day-planner-v01 update"`.
  - Tag git repository with release version tag (e.g. `v1.0-pure-gas`).

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
