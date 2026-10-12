# Active Tasks (TODO)

## Phase 30: WORK promotion & user-gated release items (Blocked on user)

Everything here needs the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a Meet
  link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [ ] **Watch the 7-day Testing expiry** (gated to 2026-10-17): does the web app or the 5-min sync trigger start failing
  auth weekly now that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6.
- [ ] **WORK Meeting Prep live render**: WORK has **no Hub Config Sheet yet** (checked 2026-10-12: GSA Drive search
  finds none; `getHubStatus` returns code defaults). After WORK is repointed to the build with About's Hub settings,
  the GSA user clicks About > Automatic Tasks > **Set up hub**, sets `GMAIL_ROUTER` + `NCMMS_CORE_PILOT` TRUE (keep
  `DRY_RUN` TRUE) and fills the NCMMS-Core notes Doc in Meeting Registry. Then check a real NCMMS series renders and
  the carry-in count equals the Doc (Tutorial T14). WORK has no hub trigger yet (separate install as the GSA user).
- [ ] **UAT run (Phase 30)**: work through About > **Tutorial** T01-T14 on HOME, then WORK; paste each run's
  "Copy results" into this file. Failures become TODO items.
