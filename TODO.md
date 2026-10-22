# Active Tasks (TODO)

## Phase 31: Search polish (in progress)

User asked for these three next (2026-10-22), in this order. Shared matcher: `matchesSearchQuery` in
`src/searchEngine.js` + its mirror in `gas-app/Script.html`; Master filter state in both clients.

- [ ] **`/` focuses the Master Tasks filter box** (Gmail convention) when Master Tasks is the active view and focus
  is not already in an input. First grep every keydown handler for the universal-search hotkey and any `/` use.
- [ ] **Status and due date in universal search task results**: the snippet shows the status glyph and a due date
  (or "Undated") so similar titles can be told apart before clicking.
- [ ] **Dedupe task results** when the same task id comes back from both `dailyTasks` and `masterTasks`: one result
  per id. Dedupe only; never route by id membership (see memory on Master/Daily same ids).

## Phase 30: WORK promotion & user-gated release items

Most items need the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
- [ ] **Live check on HOME `/dev`** (agent; the ensure-chrome profile is signed in as of 2026-10-16): Daily Forward
  makes a copy; Delegate… with owner + tomorrow makes the "Check back:" task; Master undated Forward to next week
  then Undo; Master Delegate; Undo on each. Use a throwaway task, delete it after.
- [ ] **Watch the 7-day Testing expiry** (2026-10-17): rerun the rpc login, check the web app and the 5-min sync
  trigger still authorize.
- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a
  Meet link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [ ] **WORK Meeting Prep live render**: WORK hub Sheet exists (Triage on, trial mode). Set `NCMMS_CORE_PILOT`
  TRUE, fill the NCMMS-Core notes Doc in Meeting Registry, and check the carry-in count equals the Doc (Tutorial T14).
- [ ] **WORK trial mode off**: if WORK still has `DRY_RUN` TRUE, use Triage > **Review and go live** when ready.
- [ ] **Live check: trial mode controls on HOME /dev**: banner, Go live dialog, Undo snackbar, quiet Live mark, and
  Switch to trial (now on About); then two tabs: Go live in tab A, Archive in tab B is refused with "Refresh before acting".
- [ ] **Approval banner after consent redirect**: on WORK the page reloaded after approving and still showed the
  banner; "Check again" cleared it. Optional: re-check automatically when the tab regains focus.
- [ ] **WORK: Filter Suggestions review (2026-10-16)**: WORK's background run read 1,234 emails. WORK is on v165
  (verified 2026-10-22, includes v160's 200 emails/min); paste the Filter Suggestions tab here for the numbered review.
- [ ] **WORK v152 approval loop (2026-10-16)**: approved, Check again, banner stayed. Fixed so the optional
  `gmail.settings.basic` scope no longer gates the app; confirm on WORK. If the banner still shows, the console line
  `loadHubStatus: ... missing scopes:` names the scope; if the filter scope is the only one missing, the GSA org
  likely blocks it (About shows "Approve filter access").
- [ ] **UAT run (Phase 30)**: work through About > **Tutorial** T01-T20 on HOME, then WORK; paste each run's
  "Copy results" into this file. Failures become TODO items.
- [ ] **Optional speed follow-ups** (ranked list from 2026-10-16): time each server step on HOME (folder check, page
  assembly, `Tasks.list`) before deciding on minify-at-push or a shell + cached bundle; `completedMin` on
  `getMasterTasks` only with the user's OK (hides old done undated items).
