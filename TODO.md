# Active Tasks (TODO)

## Phase 30: WORK promotion & user-gated release items (Blocked on user)

Everything here needs the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a Meet
  link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [ ] **Watch the 7-day Testing expiry** (gated to 2026-10-17): does the web app or the 5-min sync trigger start failing
  auth weekly now that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6.
- [ ] **WORK Meeting Prep live render**: WORK hub Sheet now exists (Triage on, trial mode). Set `NCMMS_CORE_PILOT`
  TRUE, fill the NCMMS-Core notes Doc in Meeting Registry, and check the carry-in count equals the Doc (Tutorial T14).
- [ ] **WORK trial mode off**: WORK has `DRY_RUN` TRUE. After the next promote, use Triage > **Review and go live**
  when ready for real actions (or set FALSE in the hub Sheet).
- [ ] **Live check: trial mode controls on HOME /dev**: banner, Go live dialog, Undo snackbar, Switch to trial; then
  open two tabs, Go live in tab A, then Archive in tab B is refused with "Refresh before acting".
- [ ] **Approval banner after consent redirect**: on WORK the page reloaded after approving and still showed the
  banner; "Check again" cleared it. Optional: re-check automatically when the tab regains focus.
- [ ] **UAT run (Phase 30)**: work through About > **Tutorial** T01-T15 on HOME, then WORK; paste each run's
  "Copy results" into this file. Failures become TODO items.
