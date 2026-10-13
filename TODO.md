# Active Tasks (TODO)

## Phase 30: WORK promotion & user-gated release items (Blocked on user)

Everything here needs the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a Meet
  link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [ ] **Watch the 7-day Testing expiry** (gated to 2026-10-17): does the web app or the 5-min sync trigger start failing
  auth weekly now that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6.
- [ ] **WORK Meeting Prep live render**: WORK had no Hub Config Sheet (2026-10-12). From the auto-setup build on,
  opening WORK `/exec` creates it (Triage on, trial mode) and installs the schedule. Then set `NCMMS_CORE_PILOT`
  TRUE, fill the NCMMS-Core notes Doc in Meeting Registry, and check the carry-in count equals the Doc (Tutorial T14).
- [ ] **gmail.modify rollout on WORK**: HOME is done (2026-10-12: consent, GCP Data access, rpc re-login, privacy
  page fac809b on master, Tutorial T15 passed live via gas-rpc). WORK: hub Sheet auto-created 2026-10-12 (flags OK),
  but Gmail calls fail "You do not have permission" (gmail.modify not approved by the GSA deployer), so UserEmail is
  blank and no schedule. Repoint `/exec` to **v138** (build 470), then in the WORK IDE run `Code.gs:setupHub` and
  approve: it fills UserEmail and installs the schedule. If the .gov org blocks `gmail.modify`, repoint to **v134**.
- [ ] **UAT run (Phase 30)**: work through About > **Tutorial** T01-T14 on HOME, then WORK; paste each run's
  "Copy results" into this file. Failures become TODO items.
