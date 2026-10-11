# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [x] Hover/zoom fix (`f641dc3`) is in `pure-gas-main`; branch `worktree-today-hover-zoom` deleted 2026-10-10 (safe `-d`).
  The `today-hover-zoom` worktree is locked on `feat/gmail-meeting-hub` (possibly another session); left in place.
- Live popover/zoom verify and the WORK repoint moved to Phase 30 (both need the user).

## Phase 28: Gmail / Meeting Hub — live HOME verification (In Progress)

HOME `/dev` and the gas-rpc API deployment (@312) run the Phase 29 code. Pinned prod `/exec` (@297) NOT redeployed since the scope change.

- [x] **Fast-forward `pure-gas-main`** to `feat/gmail-meeting-hub`; user runs the merge.
- [x] **Rerun `hubSpike`** yourself: PASS 2026-10-10 (`ok:true`, 4 tabs, discovery DRY_RUN 0 series) after enabling the 6
  advanced-service APIs in GCP `day-planner-507615` (linking to a standard project drops the default project's enabled APIs).
- [x] **Create the `🎯/` Gmail labels** (done 2026-10-10; 3 test threads on Task/Task-Today/Waiting) and label 2-3 test threads; confirm assumptions A1-A15 in
  [`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md).
- [x] **DRY_RUN smoke** 2026-10-10 via gas-rpc: L1 Sheets, L2 emoji label resolution, L3 Config flag edit picked up,
  L4 `processWorkflowQueue` = "Would create Task" x3, ledger counts `{}` (zero writes).
- [x] **L5** PASS 2026-10-10: 3 Tasks created, 0 errors; Phase 29 rerun DONE 6 -> 9.
- [ ] **L6** forced failure via gas-rpc: ledger `ERROR`, fix, retry -> `DONE`.
- [ ] **L7 server half** via gas-rpc: `getTriageBoard` / Meeting Prep payloads carry queue keys, item fields, carry-in count.
- [ ] **L8** `installHubTriggers` twice -> one trigger; two parallel `processWorkflowQueue` -> one skips on the lock;
  `removeHubTriggers` afterwards unless kept on purpose.
- [ ] **Re-route old MEETING ERROR rows** that have no series (they now fail `MISSING_SERIES` by design).
- Live `/dev` browser checks, prod `/exec`, consent publish, 7-day watch and WORK promotion moved to Phase 30.

## Phase 30: Deferred — WORK promotion & user-gated items

Everything here needs the user (GSA account, a browser sign-in, or a release go). Not blocking Phases 25/28.

- [ ] **Sign the CDP Chrome profile in** (`node tools/ensure-chrome.js`, profile
  `C:\Users\<you>\AppData\Local\Temp\chrome-dayplanner-debug-9222`): it was signed out on 2026-10-10 (Temp wiped?),
  so `/dev` showed "Page not found". Unblocks the two live checks below.
- [ ] **Live-verify popovers/zoom on HOME `/dev`**: notes popovers start closed, hovering note 1 never opens the last,
  first line not covered by cursor, iPad tap opens / outside tap closes; zoom slider (80-140%) persists across reloads
  and double-click resets.
- [ ] **Live `/dev` UX checks** (L7 render half) via `tools/ensure-chrome.js` + `tools/eval-console.js`/`probe-live.js`:
  Triage/Meeting Prep render; error tray (Retry, "+N more", auto-resolve); Create Appointment lands in the right slot;
  "Add Google Meet" (light + dark) and a real `meetError`; stale "offline copy" notices; task notes edit persists to
  Google; delete during an in-flight save stays deleted; typing on two days within 1.2s saves both notes.
- [ ] **Watch the 7-day Testing expiry** (gated to 2026-10-17): does the web app or the 5-min sync trigger start failing
  auth weekly now that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6.
- [ ] **Publish consent screen** (user, "once it's working"), then rerun the rpc login (skill `gas-rpc` setup step 3)
  and drop the 7-day notes from the skill doc.
- [ ] **Pinned prod `/exec` deploy at release only** (user go): prod carries `gmail.readonly`.
- [ ] **WORK promotion** (user go): `npm run push:work` cuts a version carrying the hub (latest WORK cut is v130; PLAN's
  "v128" line is superseded), then `michael.hoffman@gsa.gov` in the WORK IDE: Services (+) Gmail + Sheets, Deploy →
  Manage deployments → Edit → that version → Deploy. Admin may need to approve `gmail.readonly`.
