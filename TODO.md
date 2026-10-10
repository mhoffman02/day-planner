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

## BLOCKER: app-file writes fail on HOME since the GCP project link (2026-10-10)

L5 failed: `sheets.values.update: The caller does not have permission` on the hub Sheet. Reads work (`drive.readonly`).
The Sheet was created 2026-10-09 16:36 PDT, before HOME was linked to GCP `day-planner-507615` (2026-10-10 ~12:00), and
`drive.file` grants belong to the Cloud project that created or opened the file. The link is script-wide, so pinned
`/exec` @297 likely can't write older Daily Notes Docs either. WORK is unaffected (default project). Fix is the user's call:
- [ ] Confirm the blast radius: user edits one Daily Note on HOME `/exec` and checks the error tray.
- [x] Choose: user picked **(b) Picker re-grant** with the new project's appId (2026-10-10). Rejected: (a) unlink
  (gas-rpc stops), (c) recreate hub Sheet (doesn't fix Daily Notes), (d) broad scopes.
- [ ] **Size it with `npm run rpc -- driveWriteAccessReport --deploy`** (built, not yet run: the deploy was blocked by
  the auto-mode classifier). It lists the folder + children with `appCanWrite` and an `unwritable` id list. Drive
  metadata (`editable`, `capabilities.canEdit`) is useless here: live it reported `canEdit: true` for all 7 files,
  hub Sheet included. The probe does a no-op `Drive.Files.patch` (`modifiedDateBehavior: noChange`) per file;
  expect the hub Sheet in `unwritable` (control). If the folder is unwritable, new monthly Docs fail too.
- [ ] Picker setup (user, GCP `day-planner-507615`): enable the Google Picker API; create an API key restricted to it.
  Key goes in Script Properties, never in source (repo is public).
- [ ] Build the re-grant page: token RPC (`ScriptApp.getOAuthToken`), Picker with `setAppId('951958469609')`,
  multi-select of the `unwritable` files plus the folder. Exit: probe `unwritable` empty, then L5 with 0 errors.
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
- [ ] **Real-service steps L5-L8** from the same runbook (L5 needs user to set `DRY_RUN` FALSE).
- [ ] **Re-route old MEETING ERROR rows** that have no series (they now fail `MISSING_SERIES` by design).
- [ ] **WORK**: after HOME passes, `npm run push:work`, then the WORK-IDE steps (admin may need to approve the scope).
