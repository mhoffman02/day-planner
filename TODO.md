# Active Tasks (TODO)

## Phase 6: Live Workspace UAT & Production Release

- [ ] **4. Federal WORK Environment Access & Validation**:
  - Point Web App deployment to latest version in GSA IDE (access restricted to `MYSELF`).
  - Verify production URL [`https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) on locked-down WORK PC (`michael.hoffman@gsa.gov`).
  - Verify first-party Google Workspace authorization without enterprise proxy blocks ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

- [ ] **5. Run Log Google Doc Confirmation & Production Tagging (`git tag`)**:
  - Open `Day Planner` Google Drive folder on HOME account.
  - Verify [`Day Planner - Run Log`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74-L125) Google Doc exists and logged sync executions.
  - Once WORK environment and Run Log are validated:
    `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.
  - Verify standalone desktop shortcut ("Open as Window") from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
