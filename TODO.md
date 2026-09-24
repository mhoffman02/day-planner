# Active Tasks (TODO)

## Phase 7: CSS Architecture Decoupling (`modern-normalize` Spike)

- [ ] **1. Create and Checkout Isolated Branch (`feat/modern-normalize`)**:
  - Run `git checkout -b feat/modern-normalize` from current commit `c957ba2` on `pure-gas-main`.
  - Keep `pure-gas-main` fully pristine and untouched.

- [ ] **2. Replace Pico CSS with `modern-normalize` & Baseline Styles**:
  - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L1) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L2), replace `@import url('https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css');` with `modern-normalize` CDN link (`https://cdn.jsdelivr.net/npm/modern-normalize@3.0.1/modern-normalize.min.css`).
  - Add standard unopinionated base styles for `input`, `select`, `textarea`, and `a` (border, padding, border-radius, focus rings) so form controls remain polished.
  - Refactor all 39 references from `--pico-*` variables to native Franklin Covey design tokens (`--binder-teal`, `--bg-parchment`, etc.).

- [ ] **3. Light & Dark Mode Parity & Regression Verification**:
  - Verify seamless light mode (`#fcfbfa` parchment) and dark mode (`[data-theme="dark"]`) rendering across all 5 views (Daily, Calendar, Master Tasks, Index, Future Matrix).
  - Verify modal backdrop, Universal Search (`Ctrl+K`), notes popovers, and status dropdown menus.
  - Run `npm run lint` and `npm test` to confirm zero regressions.

## Phase 6: Live Workspace UAT & Production Release

- [ ] **Federal WORK Environment Access & Validation**:
  - Test WORK Dev Web App: [`https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev).
  - Point Web App deployment to Version 6 in GSA IDE (access restricted to `MYSELF`).
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
