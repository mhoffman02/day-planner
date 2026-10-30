# Active Tasks (TODO)

## Phase 32: Notes Doc view + Decisions (2026-10-30)

Shipped (2026-10-30): revision-safe day saves (conflict on Doc edits, `writeControl`), typed `## ` lines no longer
split a day, `🎯/Decision` label -> undated `Decision: <subject>` Task (manual only, no filters), `#decision`
note badge, completing a `Decision:` task adds `#decision <what>` to the last note card of today. User picks: 1A 2A
3A 4A, 5 = "a decision is a Task whose title or notes lead with `Decision:`" (no register view), 6A, 7T.

- [ ] **Live check on HOME** (@346; Retry is in the error tray): edit a day in the notes Doc, then type in the app: a save error says
  "changed in Google Docs", Retry overwrites; label an email `🎯/Decision` and wait a tick; complete a `Decision:` task with Today open.
- [ ] **Notes portal decisions** (`docs/notes-portal-eval.md`, user to answer): 1A no iframe, run probe P1 only;
  2T read-only Docs API render as the panel Doc view; 3T "Open this day in Docs" link; 4A defer per-day tabs;
  5T fail loud when a notes Doc has more than one tab (latent data-loss path); 6T keep publish-to-web rejected.
- [ ] **Live check smart paste + day rollover** (HOME @337, `1da3fcf`): paste from Gmail, Docs and Gemini into a
  card line; leave the tab open past midnight.

## Solid Code ratchets: shrink the baselines (2026-10-30, user decision 3T)

- [ ] **Shrink `rpc-guard-baseline.json`** (46 unguarded RPC entry points): add
  `DPEngines.v_.guard(arguments, '<name>')...done()` (see `src/integration/v_.js`) as the first statement of each
  `_xInternal` impl, highest-traffic first; then run `node tools/check-rpc-guards.js --update`.
- [ ] **Shrink `mirror-baseline.json`** (107 drifted `src/*.js` vs `gas-app/Script.html` functions: app.js 86,
  binderStore 9, taskEngine 5, hubUi 3, futureMatrixEngine 2, quotesEngine 1, searchEngine 1): reconcile each pair,
  or generate the `Script.html` engines from `src` like `Engines.gs`; then run `node tools/check-mirror.js --update`.
- [ ] **Shrink `html-baseline.json`** (a11y findings in `index.html` + `gas-app/Index.html`, mostly
  `prefer-native-element`): fix both copies, then `node tools/check-html.js --update`.
- [ ] **Run `npm run test:mutation`** (Stryker, `stryker.config.json`) before the next big phase; each surviving
  mutant becomes a test.
- [ ] **Gap 10: cdp-step debugger** (not started): a step-through CDP debugging tool alongside `tools/e2e/*`; scope
  to be proposed to the user before building.
- [ ] **Shrink legacy `var` suppressions** in `eslint-suppressions.json` (gas-app `.gs` and html scripts): convert a
  file at a time to `const`/`let`, then `npx eslint --prune-suppressions`.

## Phase 31: Search polish (in progress)

User asked for these three next (2026-10-22), in this order. Shared matcher: `matchesSearchQuery` in
`src/searchEngine.js` + its mirror in `gas-app/Script.html`; Master filter state in both clients.

- [ ] **`/` focuses the Master Tasks filter box** (Gmail convention) when Master Tasks is the active view and focus
  is not already in an input. **Ask the user first:** `/` already opens universal search in both clients
  (`setupKeyboardShortcuts`: `src/app.js` ~line 924, `gas-app/Script.html` ~line 2713). Proposed default: on Master
  Tasks only, `/` focuses the filter box; Ctrl+Shift+F (anywhere) and Ctrl+K (outside text inputs) still open
  universal search.
- [ ] **Status and due date in universal search task results**: the snippet shows the status glyph and a due date
  (or "Undated") so similar titles can be told apart before clicking.
- [ ] **Dedupe task results** when the same task id comes back from both `dailyTasks` and `masterTasks`: one result
  per id. Keep the first copy (Daily is searched first); its `targetView` still comes from the task's own fields
  (`!dueDate || master`), never from which list it came from or id membership (see memory on Master/Daily same ids).

## Phase 30: WORK promotion & user-gated release items

Most items need the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
- [ ] **Live check on HOME `/dev`** (agent; the ensure-chrome profile is signed in as of 2026-10-16): Daily Forward
  makes a copy; Delegate… with owner + tomorrow makes the "Check back:" task; Master undated Forward to next week
  then Undo; Master Delegate; Undo on each. Use a throwaway task, delete it after.
- [ ] **OVERDUE (was due 2026-10-17): 7-day Testing expiry** (agent probes first): run `npm run rpc -- runSelfTest`
  (no `--deploy`, which pushes and repoints); if the token is dead, the user reruns the rpc login. Then check the web app and the 5-min sync trigger.
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
