# Active Tasks (TODO)

Order (2026-10-30, user): autonomous agent work first (item A3); everything that needs the user is in the last section,
"For the session after next" (items B1, B3, B4). An agent session works only A3.

## Agent work: next session (no user needed)

### A3. Solid Code ratchets: remaining shrinks (2026-11-01; shipped items in TODO_HISTORY)

Phase 33. Done 2026-11-01 (shipped items in TODO_HISTORY): rpc-guard 46 -> 0, html 21 -> 12 per page, axe 0 (`axe-baseline.json` is `{}`), mirror 107 -> 72, `var` suppressions 858 -> 0, mutation survivors: searchEngine 360 -> 20, taskEngine 74 -> 24, futureMatrixEngine 22 -> 10, calendarEngine 134 -> 6 (all left equivalent; shipped items in TODO_HISTORY).

No agent work remains here; the two items below are user decisions to leave baselined:

- Left baselined: **html 12 per page** (user 2026-11-01: leave): role=radio priority buttons, listboxes, progressbar, event-pill button, dictation label; each changes markup/CSS/Alpine.
- Left baselined: **mirror 72** (user 2026-11-01, 3A: the GAS copy wins; leave baselined, no more mirror work unless a drifted function is edited): ~30 `dp*` helper-name diffs, 4 URL builders using `'https:'+'/'+'/'`, diverged logic (addDailyTask, addMasterTask, parseDailyNoteToCards, toggleDictation popup size), binderStore shape, 25 `styles.css` entries unexamined.

## For the session after next: needs the user (interactive / HITL)

Do not start these in an agent-only session; ask the user to be present.

### B1. Phase 32: Notes Doc view + Decisions (2026-10-30)

Shipped (2026-10-30): revision-safe day saves (conflict on Doc edits, `writeControl`), typed `## ` lines no longer
split a day, `🎯/Decision` label -> undated `Decision: <subject>` Task (manual only, no filters), `#decision`
note badge, completing a `Decision:` task adds `#decision <what>` to the last note card of today. User picks: 1A 2A
3A 4A, 5 = "a decision is a Task whose title or notes lead with `Decision:`" (no register view), 6A, 7T.

- [ ] **Live check on HOME** (@346; Retry is in the error tray). Conflict flow verified (2026-10-30, through the bridge
  on throwaway day 2026-01-15, the Doc edit simulated by a no-baseline write): the stale baseline was refused, the error
  tray said "changed in Google Docs", Retry overwrote and cleared the tray. Verified live on HOME (2026-11-01, user): a labeled `🎯/Decision` email became a `Decision:` task; completing it added the note card line (now a filled blue tag + blue left rule, HOME @355). Still open: confirm a SCHEDULED tick (no forced dispatch) creates the task. Optional: one real typed edit in the Doc. Delete the
  leftover 2026-01-15 section ("phase32 line A / phase32 line APP") in the "Day Planner Notes - January 2026" Doc.
- [ ] **Notes portal decisions** (`docs/notes-portal-eval.md`; user accepted all defaults 2026-11-01, so agent work: P1 probe, Docs API read-only render, "Open this day in Docs" link, fail loud on multi-tab Docs): 1A no iframe, run probe P1 only;
  2T read-only Docs API render as the panel Doc view; 3T "Open this day in Docs" link; 4A defer per-day tabs;
  5T fail loud when a notes Doc has more than one tab (latent data-loss path); 6T keep publish-to-web rejected.
- [ ] **Live check day rollover** (HOME @337, `1da3fcf`): leave the tab open past midnight. Smart paste verified on WORK
  (2026-11-02, user): Gmail, Docs and Gemini all pass; headings paste as bold by design (user 1A, no heading size).

### B3. Gap 10: cdp-step debugger (not started)

- [ ] **Gap 10: cdp-step debugger** (user approved asking for scope, 2026-11-01). Proposed scope, awaiting a yes: `tools/cdp-step.js`,
  attaches to the app iframe target like `tools/eval-console.js`; `--break <function>` pauses on the next call
  (`Debugger.setBreakpointOnFunctionCall`); JSON-line commands on stdin (`over`, `into`, `out`, `locals`, `eval <js>`,
  `resume`) so an agent can drive it; prints the frame location + locals each step. Out of scope: GAS server code, source
  maps, multi-tab. Red test first on the command parser; live part is manual. Note: rules mention `tools/e2e/*` but that directory does not exist (fix those rule refs).

### B4. Phase 30: WORK promotion and user-gated release items

Most items need the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Update WORK** whenever `npm run push:work` has run (the user repoints "Day Planner v1" in the WORK IDE).
- [ ] **rpc login** (only if an `npm run rpc` `runSelfTest` probe finds the token dead): the user reruns the rpc login.
- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a
  Meet link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [ ] **WORK Meeting Prep live render**: WORK hub Sheet exists (Triage on, trial mode). Set `NCMMS_CORE_PILOT`
  TRUE and run Tutorial T14 (carry-ins are ledger rows on Meeting Prep; no notes Doc id is needed).
- [ ] **T14 FAIL on WORK (2026-11-02, user):** count stayed 0; Integration Ledger row 51 error "Notes Doc is inaccessible:
  batchUpdate failed" (permission; the weekly Doc was not made by the app, so `drive.file` refuses the write). Requirement
  change proposed by the user: do not write the user's weekly agenda Doc; show a 1-2 line carry-in summary plus an email
  link on the Meeting Prep page. Decided 2026-11-02: carry-ins are Integration Ledger rows (TargetType CARRY_IN) listed on Meeting Prep as collapsible items plus a copy-ready bullet list; no Doc write. Fix built, awaiting WORK re-test with a new DP-T14b email.
  Meeting Prep Refresh runs the queue (processWorkflowQueue) first; user chose option 2 on 2026-11-02. In trial mode it writes no ledger rows.
- [ ] **Gemini meeting notes (user, 2026-11-02): important for Core Team and other meetings.** Not built: PLAN.md
  puts Gemini discovery/actions out of scope (Phase 6 build); only the registry column `GeminiExpected` exists. Decide
  scope with the user: how Gemini notes should reach Meeting Prep carry-ins.
- [ ] **WORK trial mode off**: if WORK still has `DRY_RUN` TRUE, use Triage > **Review and go live** when ready.
- [ ] **Live check: trial mode controls on HOME /dev**: banner, Go live dialog, Undo snackbar, quiet Live mark, and
  Switch to trial (now on About); then two tabs: Go live in tab A, Archive in tab B is refused with "Refresh before acting".
- [ ] **Approval banner after consent redirect**: on WORK the page reloaded after approving and still showed the
  banner; "Check again" cleared it. Optional: re-check automatically when the tab regains focus.
- [ ] **WORK: Filter Suggestions review (2026-10-16)**: WORK's background run read 1,234 emails. WORK is on v165
  (verified 2026-10-22, includes v160's 200 emails/min); run About > **Suggest filters** and paste the Filter
  Suggestions tab here for the numbered review.
- [ ] **WORK v152 approval loop (2026-10-16)**: approved, Check again, banner stayed. Fixed so the optional
  `gmail.settings.basic` scope no longer gates the app; confirm on WORK. If the banner still shows, the console line
  `loadHubStatus: ... missing scopes:` names the scope; if the filter scope is the only one missing, the GSA org
  likely blocks it (About shows "Approve filter access").
- [ ] **UAT run (Phase 30)**: work through About > **Tutorial** T01-T20 on HOME, then WORK; paste each run's
  "Copy results" into this file. Failures become TODO items.
- [ ] **Optional speed follow-ups** (ranked list from 2026-10-16): time each server step on HOME (folder check, page
  assembly, `Tasks.list`) before deciding on minify-at-push or a shell + cached bundle; `completedMin` on
  `getMasterTasks` only with the user's OK (hides old done undated items).
