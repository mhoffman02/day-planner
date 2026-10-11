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

## Drive grants after the GCP project link (2026-10-10): fixed

Re-granted via `?view=regrant` (Google Picker, appId 951958469609). Probe `unwritable: []`; L5 `processWorkflowQueue`
3 processed, 0 errors. Left:
- [ ] Probe only checks one level deep: files under the `2026` subfolder are unchecked. Edit a Daily Note on HOME
  `/exec` and check the error tray; if it fails, open `?view=regrant` and pick that subfolder's files.
- [ ] `processWorkflowQueue` returns `ok:true` with `counts.errors: 3` and `errors: []`, so gas-rpc exits 0 on a fully
  failed run. Fix red-test-first (Phase 29 step 0).

## Phase 28: Gmail / Meeting Hub — live HOME verification (In Progress)

HOME `/dev` and the gas-rpc API deployment (@301) run `59e4119`. Pinned prod `/exec` (@297) NOT redeployed since the scope change.

- [x] **Fast-forward `pure-gas-main`** to `feat/gmail-meeting-hub`; user runs the merge.
- [x] **Rerun `hubSpike`** yourself: PASS 2026-10-10 (`ok:true`, 4 tabs, discovery DRY_RUN 0 series) after enabling the 6
  advanced-service APIs in GCP `day-planner-507615` (linking to a standard project drops the default project's enabled APIs).
- [ ] **Watch the 7-day Testing expiry**: does the web app or the 5-min sync trigger start failing auth weekly now
  that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6 (rpc login dies 2026-10-17).
- [ ] **Publish consent screen** (user, "once it's working"), then rerun the rpc login (skill `gas-rpc` setup step 3)
  and drop the 7-day notes from the skill doc.
- [ ] **Live `/dev` checks** via `tools/ensure-chrome.js` + `tools/e2e/*` only:
  error tray (Retry, "+N more", auto-resolve); Create Appointment lands in the right slot; "Add Google Meet"
  (light + dark) and a real `meetError`; stale "offline copy" notices; task notes edit persists to Google;
  delete during an in-flight save stays deleted; typing on two days within 1.2s saves both notes.
- [ ] **Decide pinned prod `/exec` deploy** (user): held because it carries `gmail.readonly`.
- [x] **Create the `🎯/` Gmail labels** (done 2026-10-10; 3 test threads on Task/Task-Today/Waiting) and label 2-3 test threads; confirm assumptions A1-A15 in
  [`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md).
- [x] **DRY_RUN smoke** 2026-10-10 via gas-rpc: L1 Sheets, L2 emoji label resolution, L3 Config flag edit picked up,
  L4 `processWorkflowQueue` = "Would create Task" x3, ledger counts `{}` (zero writes).
- [ ] **Real-service steps L5-L8** (L5 PASS 2026-10-10: 3 Tasks created, 0 errors) from the same runbook (L5 needs user to set `DRY_RUN` FALSE).
- [ ] **Re-route old MEETING ERROR rows** that have no series (they now fail `MISSING_SERIES` by design).
- [ ] **WORK**: after HOME passes, `npm run push:work`, then the WORK-IDE steps (admin may need to approve the scope).
