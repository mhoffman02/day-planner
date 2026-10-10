# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [ ] Hover/zoom fix (`f641dc3`) rides in on the `pure-gas-main` merge of `feat/gmail-meeting-hub`; afterward remove the
  `today-hover-zoom` worktree and `worktree-today-hover-zoom` branch.
- [ ] **Live-verify on HOME**: notes popovers start closed, hovering note 1 never opens the last,
  first line not covered by cursor, iPad tap opens / outside tap closes; zoom slider (80-140%)
  persists across reloads and double-click resets.
- [ ] **Repoint WORK `/exec` to the Version 130** (supersedes v127): only
  `michael.hoffman@gsa.gov` can do this, in the WORK Apps Script IDE (Deploy → Manage
  deployments → Edit → select version → Deploy). Blocked on the user.

## Phase 28: Gmail / Meeting Hub — live HOME verification (In Progress)

HOME `/dev` runs `781c521` (pushed 2026-10-10 10:02). Pinned prod `/exec` NOT redeployed since the scope change.

- [ ] **Fast-forward `pure-gas-main`** to `feat/gmail-meeting-hub` (`781c521`); user runs the merge.
- [ ] **Rerun `UnitTests.gs:hubSpike`** (user): expect `RESULT: PASS` now that `UserEmail` is filled.
- [ ] **Live `/dev` checks** via `tools/ensure-chrome.js` + `tools/e2e/*` only:
  error tray (Retry, "+N more", auto-resolve); Create Appointment lands in the right slot; "Add Google Meet"
  (light + dark) and a real `meetError`; stale "offline copy" notices; task notes edit persists to Google;
  delete during an in-flight save stays deleted; typing on two days within 1.2s saves both notes.
- [ ] **Decide pinned prod `/exec` deploy** (user): held because it carries `gmail.readonly`.
- [ ] **Create the `🎯/` Gmail labels** and label 2-3 test threads; confirm assumptions A1-A15 in
  [`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md).
- [ ] **DRY_RUN smoke**, then real-service steps L1-L8 from the same runbook.
- [ ] **Re-route old MEETING ERROR rows** that have no series (they now fail `MISSING_SERIES` by design).
- [ ] **WORK**: after HOME passes, `npm run push:work`, then the WORK-IDE steps (admin may need to approve the scope).
