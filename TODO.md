# Active Tasks (TODO)

## Phase 30: WORK promotion & user-gated release items (Blocked on user)

Everything here needs the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a Meet
  link). The app has no event-delete RPC, so it was left for you.
- [ ] **Watch the 7-day Testing expiry** (gated to 2026-10-17): does the web app or the 5-min sync trigger start failing
  auth weekly now that the script is linked to a Testing-mode GCP project? gas-rpc warns on day 6.
- [ ] **Publish consent screen** (user, "once it's working"), then rerun the rpc login (skill `gas-rpc` setup step 3)
  and drop the 7-day notes from the skill doc.
- [ ] **Pinned prod `/exec` deploy at release only** (user go): prod carries `gmail.readonly`.
- [ ] **WORK promotion** (user go): `npm run push:work` cuts a version carrying the hub (latest WORK cut is v130; PLAN's
  old "v128" line is superseded), then `michael.hoffman@gsa.gov` in the WORK IDE: Services (+) Gmail + Sheets, Deploy →
  Manage deployments → Edit → that version → Deploy. Admin may need to approve `gmail.readonly`.
- [ ] **WORK Meeting Prep live render** (after promotion): needs a real NCMMS series. On HOME, Prep with the pilot on
  fails loud "no upcoming occurrence of NCMMS_CORE" (no such calendar there). Check carry-in count equals the Doc.
- [ ] **Hub trigger**: removed after the L8 check; run `installHubTriggers` when you want the 5-minute queue live.
