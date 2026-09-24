# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Federal WORK Environment Access & Validation**:
  - Test WORK Dev Web App: [`https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev).
  - Point Web App deployment to Version 5 in GSA IDE.
  - Verify production URL [`https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) on locked-down WORK PC (`michael.hoffman@gsa.gov`).
  - Verify first-party Google Workspace authorization without enterprise proxy blocks ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

- [ ] **Run Log Google Doc Confirmation**:
  - Open `Day Planner` Google Drive folder on HOME account.
  - Verify [`Day Planner - Run Log`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74-L125) Google Doc exists and logged sync executions.

- [ ] **Production Release Tagging (`git tag`)**:
  - Once WORK environment and Run Log are validated:
    `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.

- [ ] **Desktop Shortcut Verification ("Open as Window")**:
  - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
  - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.
