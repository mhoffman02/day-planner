# Active Tasks (TODO)

## Phase 5: Verification & Local Smoke Testing

- [ ] **Local Smoke Testing & Safe Chars Check**:
  - Full test suite: `npm test` passing 100% with no skips (currently 88/88).
  - Linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/`.
  - Check safe chars: verify no single-line `//` comment truncation risks inside scriptlets in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Verify local dev server: run `npm start` at `http://localhost:3000` and manually smoke-test all 5 active views (Daily, Month Calendar, Master Tasks, Monthly Index, Future Planning) and Universal Search (`Ctrl+K`).

- [ ] **Phase 5 Clasp Deployment Gate**:
  - Deploy to GAS development endpoint via `clasp push`.
  - Run live `/self-test` diagnostic suite to verify Google Workspace service integrations (Calendar, Tasks, Drive).

- [ ] **WCAG Contrast & Responsive Verification**:
  - Audit top-bar and panel headers across light parchment (`#fcfbfa`) and dark mode (`#0c1813` / `#142820`) palettes.
  - Verify responsive breakpoint scaling down to 768px (mobile viewport) without horizontal overflow.
