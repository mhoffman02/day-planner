# Active Tasks (TODO)

Order (2026-10-30, user): autonomous agent work first, in the order listed (items A1-A3); everything that needs the
user is in the last section, "For the session after next" (items B1-B4). An agent session works only A1-A3.

## Agent work: next session (no user needed)

### A1. Phase 31: Search polish (in progress)

User asked for these in this order (2026-10-22). Shared matcher: `matchesSearchQuery` in `src/searchEngine.js` + its
mirror in `gas-app/Script.html`; both clients, red test first, then `npm run deploy:home` (live gate), then
`npm run push:work` and tell the user "Update WORK".

- [ ] **Item 1 (`/` focus)** stays in B2 (needs a user decision). Items 2 and 3 shipped (see TODO_HISTORY).

### A2. Phase 30: rpc token probe (agent only; the token may need the user)

- [x] rpc token probe: `runSelfTest` passed 7/7 (2026-10-30); the token still works past its warned expiry, so B4 rpc login is not needed yet.
- [ ] **Live check on HOME `/dev`** (agent; the ensure-chrome profile is signed in as of 2026-10-16): Daily Forward
  makes a copy; Delegate… with owner + tomorrow makes the "Check back:" task; Master undated Forward to next week
  then Undo; Master Delegate; Undo on each. Use a throwaway task, delete it after.

### A3. Solid Code ratchets: shrink the baselines (user decision 3T, 2026-10-30)

Do them as `worker` agents (Sonnet/medium), one baseline per agent, each with its checker as the exit test. Order:

- [ ] **Shrink `rpc-guard-baseline.json`** (46 unguarded RPC entry points): add
  `DPEngines.v_.guard(arguments, '<name>')...done()` (see `src/integration/v_.js`) as the first statement of each
  `_xInternal` impl, highest-traffic first; then run `node tools/check-rpc-guards.js --update`.
- [ ] **Shrink `html-baseline.json`** (a11y findings in `index.html` + `gas-app/Index.html`, mostly
  `prefer-native-element`): fix both copies, then `node tools/check-html.js --update`.
- [ ] **axe a11y in the live gate** (user picks 1T 2A 3F, 2026-10-30): add `axe-core` as a devDependency and, in
  `tools/deploy-home.js` after the `/dev` load, inject it into the GAS iframe over CDP (as `tools/eval-console.js
  --iframe` does) and run it on Today, Master Tasks, Notes and the Search modal. Ratchet the results with a
  shrink-only per-view baseline (`axe-baseline.json`, like `html-baseline.json`): a new finding fails the deploy.
  No mock-mode run. Red test first on the baseline compare logic.
- [ ] **Run `npm run test:mutation`** (Stryker, `stryker.config.json`) before the next big phase; each surviving
  mutant becomes a test.
- [ ] **Shrink `mirror-baseline.json`** (107 drifted `src/*.js` vs `gas-app/Script.html` functions: app.js 86,
  binderStore 9, taskEngine 5, hubUi 3, futureMatrixEngine 2, quotesEngine 1, searchEngine 1): reconcile each pair,
  or generate the `Script.html` engines from `src` like `Engines.gs`; then run `node tools/check-mirror.js --update`.
  Escalate to `deep` only if a pair needs a decision about which copy is right.
- [ ] **Shrink legacy `var` suppressions** in `eslint-suppressions.json` (gas-app `.gs` and html scripts): convert a
  file at a time to `const`/`let`, then `npx eslint --prune-suppressions`.

## For the session after next: needs the user (interactive / HITL)

Do not start these in an agent-only session; ask the user to be present.

### B1. Phase 32: Notes Doc view + Decisions (2026-10-30)

Shipped (2026-10-30): revision-safe day saves (conflict on Doc edits, `writeControl`), typed `## ` lines no longer
split a day, `🎯/Decision` label -> undated `Decision: <subject>` Task (manual only, no filters), `#decision`
note badge, completing a `Decision:` task adds `#decision <what>` to the last note card of today. User picks: 1A 2A
3A 4A, 5 = "a decision is a Task whose title or notes lead with `Decision:`" (no register view), 6A, 7T.

- [ ] **Live check on HOME** (@346; Retry is in the error tray). Conflict flow verified (2026-10-30, through the bridge
  on throwaway day 2026-01-15, the Doc edit simulated by a no-baseline write): the stale baseline was refused, the error
  tray said "changed in Google Docs", Retry overwrote and cleared the tray. Still open: label an email `🎯/Decision`
  and wait a tick; complete a `Decision:` task with Today open. Optional: one real typed edit in the Doc. Delete the
  leftover 2026-01-15 section ("phase32 line A / phase32 line APP") in the "Day Planner Notes - January 2026" Doc.
- [ ] **Notes portal decisions** (`docs/notes-portal-eval.md`, user to answer): 1A no iframe, run probe P1 only;
  2T read-only Docs API render as the panel Doc view; 3T "Open this day in Docs" link; 4A defer per-day tabs;
  5T fail loud when a notes Doc has more than one tab (latent data-loss path); 6T keep publish-to-web rejected.
- [ ] **Live check smart paste + day rollover** (HOME @337, `1da3fcf`): paste from Gmail, Docs and Gemini into a
  card line; leave the tab open past midnight.

### B2. Phase 31 item 1 (needs a user decision)

- [ ] **`/` focuses the Master Tasks filter box** (Gmail convention) when Master Tasks is the active view and focus
  is not already in an input. **Ask the user first:** `/` already opens universal search in both clients
  (`setupKeyboardShortcuts`: `src/app.js` ~line 924, `gas-app/Script.html` ~line 2713). Proposed default: on Master
  Tasks only, `/` focuses the filter box; Ctrl+Shift+F (anywhere) and Ctrl+K (outside text inputs) still open
  universal search.

### B3. Gap 10: cdp-step debugger (not started)

- [ ] **Gap 10: cdp-step debugger**: a step-through CDP debugging tool alongside `tools/e2e/*`; the agent proposes a
  scope to the user before building.

### B4. Phase 30: WORK promotion and user-gated release items

Most items need the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Update WORK** whenever `npm run push:work` has run (the user repoints "Day Planner v1" in the WORK IDE).
- [ ] **rpc login** (only if the section A2 probe finds the token dead): the user reruns the rpc login.
- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
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
