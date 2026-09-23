# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Verify Web App on HOME Script (`@HEAD`)**:
  - Push code to HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`.
  - Test HOME Dev Web App endpoint: [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) (signed in with HOME account `mhoffman02@gmail.com`).
  - Confirm page renders properly.

- [ ] **Live Workspace UAT on Web App Endpoint**:
  > ⚠️ NEVER use `/a/macros/gsa.gov/` — consumer script, enterprise proxy returns 404 before `doGet()` runs.
  - Verify Day Planner folder auto-creation and 2-way sync with live Google Calendar and Google Tasks.
  - Verify Google Doc run-log (`Day Planner - Run Log`) created inside Day Planner folder.
  - Test on federal locked-down WORK environment (without Chrome extensions/dev tools).

- [ ] **Production Release Deployment (`clasp deploy`)**:
  - Deploy/redeploy tagged production version via `clasp deploy` on HOME script once authenticated.
  - Tag git repository with release version tag (e.g. `v1.0-pure-gas`).

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
