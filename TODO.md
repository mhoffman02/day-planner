# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [ ] **Merge `worktree-today-hover-zoom` (`f641dc3`) into `pure-gas-main`** from the main checkout
  (`git merge worktree-today-hover-zoom`). Fixes notes-popover bugs + adds Tasks zoom slider.
  Then remove the worktree + branch.
- [ ] **Live-verify on HOME**: notes popovers start closed, hovering note 1 never opens the last,
  first line not covered by cursor, iPad tap opens / outside tap closes; zoom slider (80-140%)
  persists across reloads and double-click resets.
- [ ] **Repoint WORK `/exec` to the Version 130** (supersedes v127): only
  `michael.hoffman@gsa.gov` can do this, in the WORK Apps Script IDE (Deploy → Manage
  deployments → Edit → select version → Deploy). Blocked on the user.

## Phase 28: Gmail / Meeting Hub (user-only gate steps)

- [ ] **Approve the first push containing `gmail.readonly`** (any `clasp push` of `feat/gmail-hub-integration`
  carries the scope and the Gmail/Sheets Advanced Services). Nothing has been pushed.
- [ ] **IDE Services (+) on HOME**: add Gmail and Sheets; enable both APIs in the linked Cloud project; re-consent
  as `mhoffman02@gmail.com` (runbook: `docs/hub-setup-and-gate.md` section 4).
- [ ] **Run the live Sheets-under-`drive.file` spike** on HOME and report pass/fail (fallback options in the same doc).
- [ ] **Create the `🎯/` Gmail labels** and label 2-3 test threads; confirm assumptions A1-A15 in the doc.
- [ ] **WORK**: after HOME passes, `npm run push:work`, then the WORK-IDE steps (admin may need to approve the scope).
