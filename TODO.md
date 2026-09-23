# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [x] **Verify Web App on HOME Script (`@HEAD`)**:
  - Pushed latest codebase to HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`.
  - Tested HOME Dev Web App endpoint [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) in Chrome (signed into `mhoffman02@gmail.com`). Confirmed full digital binder UI loads cleanly.

- [x] **Production Release Deployment (`clasp deploy`)**:
  - Updated production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` to Version 162 (`@162`).
  - Fixed Apps Script `HtmlService` silent truncation bug by eliminating literal `//` in URL strings (split as `'https:' + '/' + '/...'`) and sanitizing comment apostrophes per commit `087b7ef`. Restored `tools/check-gas-script-html-safe-chars.js` guard.

- [ ] **Live Workspace UAT on Web App Endpoint**:
  > ⚠️ NEVER use `/a/macros/gsa.gov/` — consumer script, enterprise proxy returns 404 before `doGet()` runs.
  - [x] Run Self-Test diagnostics: [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test) — **100% HEALTHY / All Pass** (Drive, Tasks, Calendar, Docs, Sync Trigger).
  - [ ] Verify daily binder workspace (tasks, appointments, notes) loads cleanly in production [`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec).
  - [ ] Verify 2-way sync with live Google Calendar and Google Tasks.
  - [ ] Verify Google Doc run-log (`Day Planner - Run Log`) created inside Day Planner folder.
  - [ ] Test on federal locked-down WORK environment.

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
