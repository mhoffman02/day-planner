# Active Tasks (TODO)

## Immediate UI Fix (Top Priority)

- [ ] **Fix Navbar Text Overlap on Month View** (`screen-shots/broken-navbar.png`):
  - Investigate and resolve text collision between `.header-left` date display (`.date-text-display` showing "September 2026") and centered navigation tabs (`nav.view-segmented-control` tabs "Today" / "Month") in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L149) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L150).
  - **Root Cause**: In [`header.single-top-bar`](file:///home/mike/projects/day-planner/src/styles.css#L133), `.header-left` is set to `flex: 1 1 0; min-width: 0;` to balance against `.header-actions-compact`. When the window width is < 1400px (e.g. 1280px or 1024px), `.header-left` shrinks smaller than its children (`.brand-title-compact` + `.header-vdivider` + `.date-controls-group` buttons + `.date-text-display`). Because `.date-text-display` has `white-space: nowrap` and no containment or overflow clipping, "September 2026" spills rightward across the gap and paints directly over the navigation items.
  - **Target Fixes to Evaluate**:
    1. Streamline or remove redundant month name from jump button or date display in month view (`.today-jump-btn` already displays "September" via `x-text="currentMonthName"` while `.date-text-display` displays "September 2026").
    2. Add responsive layout rules / media queries to hide or abbreviate `.date-text-display` when space is constrained.
    3. Ensure proper flex sizing / min-width handling so `.header-left` and navigation tabs never collide or overlap.

## Phase 5: Verification & Clasp Deployment Gate

- [ ] **Phase 5 Verification & Local Smoke Testing**:
  - Full test suite: `npm test` passing 100% with no skips (currently 88/88).
  - Linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/`.
  - Check safe chars: verify no `//` comment truncation risks in HTML scriptlets.
  - Verify local dev server: `npm start` runs at `http://localhost:3000`.
- [ ] **Phase 5 Clasp Deployment Gate**:
  - Deploy to GAS development endpoint via `clasp push`.
  - Run `/self-test` diagnostic suite to verify live Google Workspace service integrations.
