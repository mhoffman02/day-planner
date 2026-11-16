# Active Tasks (TODO)

Order (2026-10-30, user): autonomous agent work first; everything that needs the user is in the last section,
"For the session after next" (items B1, B3, B4). An agent session works the open agent bullets in "Agent work"
(A0 next, then A5 and A8) and skips any line marked as a user hand-check or decision (A6, A7, A11, A12, A14, A17 item 8 and A10 user lines).
Load-speed work (A8) came first on 2026-11-06 at the user's request.

## Agent work: next session (hand-check lines inside need the user)

### A17. Fail loud and early, not after release (2026-11-15, user order: 1-3 first session, 4-6 the one after, then 7-9, then 10)
- [ ] 8. User: open WORK `/exec` once on version 280 (repointed 2026-11-16) and say if it loads; the agent cannot, its CDP Chrome is not signed in to gsa.gov.

### A10. Attendees and hover popovers (2026-11-12; shipped in TODO_HISTORY, hand-checked on WORK 2026-11-12)
- [ ] `tools/ensure-chrome.js` Linux branch deliberately left without `--password-store=basic` (WSL2 launches Windows chrome.exe); revisit only if the keyring prompt returns after `npm run smoke`.

### A14. Quiet buttons, Future year nav (2026-11-14; shipped in TODO_HISTORY)
- [ ] User decision, default leave: priority / category / status segmented selectors keep their resting track; quieting the unselected segments risks hiding the selected one in dark mode.

### A12. Security review follow-ups (2026-11-13; fixes shipped, see TODO_HISTORY; HOME @446, WORK v245, `origin/pure-gas-main` 4dd230d)
- [ ] User decision, default keep: `drive.readonly` stays for Doc action items in Triage (read-only); drop it only if you retire that feature.
- [ ] User: delete script property `PICKER_API_KEY` on HOME once the Drive re-grant TODO is closed (only `getDriveRegrantConfig` in `gas-app/Code.gs` reads it; WORK never needed it).
- [ ] User: old scratch voice-typing Docs made by earlier builds (2026-11-13 or older) cannot be pulled (`pullDictationScratchText` refuses unissued ids); start a new one.
- [ ] User: remove the leftover `retro-sec` worktree: `node tools/prune-branches.js --apply` from the main checkout after `git merge --ff-only origin/pure-gas-main`.

### A11. Context budget follow-ups (2026-11-12; shipped part in TODO_HISTORY)
- [ ] User: remove the Play Sheet Music, monday and Postman connectors at claude.ai > Settings > Connectors.
- [ ] User: re-run `/usage` due 2026-11-19 and compare with 2026-11-12 (47% subagent hint, 36% CLAUDE.md hint, 72% worker hint). Always-loaded context went ~46 KB to ~20 KB; if "worker" still tops the hints, look at which sessions spawn it before changing tiers.

### A0. Tutorial coverage gaps (2026-11-02; stale labels already fixed). IN PROGRESS, next (2026-11-16, PLAN Phase 36)
Rules for the new exercises (proposed defaults; the user may override): number them T21 onward after T20, one per
feature in the order of the list below, same markup as T01-T08 (`data-title`, `x-data="{ id: 'T21' }"`); edit
`gas-app/Tutorial.html` and paste the same text into `index.html` (`tests/htmlIncludeMirror.test.js` checks the copy
and the ID order). Folder setup cannot be redone on a set-up account, so T21 describes it and asks only to confirm
the folder in Drive. Go-live needs the hub with DRY_RUN on: add its number to the "need the Gmail hub" note
(`gas-app/Tutorial.html` ~L123). Each card needs what `tests/htmlIncludeMirror.test.js` checks (~L37-51): `x-data` id,
`data-title`, a visible `<span class="tutorial-ex-id">`, aria-label "Note for Tnn", and `<dt>` steps Do, Look in,
Pass if, Clean up; copy T16 as the template. No `//`, backtick or ASCII apostrophe in the file.
- [ ] Agent: write T21+ (folder setup, event add/edit, Month view, global Search, task statuses Open/In
  Progress/Done/Canceled, Master Find box and filters, Go-live, Sync button, voice dictation, Quote strip, install to
  desktop or phone; Forward and Undo are already T03, T16 and T18), run `node --test tests/htmlIncludeMirror.test.js tests/docPriorityExamples.test.js`, then `npm run deploy:home`.
- [ ] Agent: walk each new exercise live on HOME over CDP and note pass/fail here.
- [ ] Add exercises for features the Tutorial skips: one-time folder setup, event add/edit, Month view and Search,
  task statuses (Open/In Progress/Done/Canceled, Forward to date), Master Find box and filters, Go-live and Undo
  flow, Sync button, voice dictation, Quote strip, install to desktop or phone. T03 and T07 were walked live on HOME
  (2026-11-02) and pass. T11, T12, T13, T15, T17, T19 walked live on HOME (2026-11-03) and pass (T11 Tutorial text fixed). Not walked: T09, T10 (needs DRY_RUN on), T14 (needs NCMMS_CORE_PILOT on), T16, T18, T20 (reads about 1,200 emails).

### A3. Solid Code ratchets: remaining shrinks (2026-11-01; shipped items in TODO_HISTORY)

Phase 33. Done 2026-11-01 (shipped items in TODO_HISTORY): rpc-guard 46 -> 0, html 21 -> 12 per page, axe 0 (`axe-baseline.json` is `{}`), mirror 107 -> 72, `var` suppressions 858 -> 0, mutation survivors: searchEngine 360 -> 20, taskEngine 74 -> 24, futureMatrixEngine 22 -> 10, calendarEngine 134 -> 6 (all left equivalent; shipped items in TODO_HISTORY).

No agent work remains here; the two items below are user decisions to leave baselined:

- Left baselined: **html 12 per page** (user 2026-11-01: leave): role=radio priority buttons, listboxes, progressbar, event-pill button, dictation label; each changes markup/CSS/Alpine.
- Left baselined: **mirror 72** (user 2026-11-01, 3A: the GAS copy wins; leave baselined, no more mirror work unless a drifted function is edited): ~30 `dp*` helper-name diffs, 4 URL builders using `'https:'+'/'+'/'`, diverged logic (addDailyTask, addMasterTask, parseDailyNoteToCards, toggleDictation popup size), binderStore shape, 25 `styles.css` entries unexamined.

### A5. Solid Code pilot follow-ups (2026-11-04; shipped items in TODO_HISTORY)

Pilot branch `worktree-solid-code-pilot` (user merges, see HANDOFF) added the Node safety bans, complexity 15,
`check-css.js` (baseline `css-baseline.json`: magic-color 0, important 123),
`tools/edit-gate.js` PostToolUse hook, and the skill split (`~/.claude/skills/solid-code/{js,py,web,css}.md`).

- [ ] **Low priority, later: semantic color names (2026-11-04).** Rename the hex-named `--c-<hex>` tokens in
  `src/styles.css` + `gas-app/Styles.html` to semantic names. First rank-rate 3-5 widely used palettes/design systems
  (candidates: Material 3 color roles, Tailwind, Radix Colors, IBM Carbon, GitHub Primer), then map each of our
  colors to its best match in the top-ranked system and rename accordingly. Keep the binder look (parchment cream,
  forest teal); a mapping that shifts rendered colors is a design decision, so propose, don't apply silently.

### A6. Triage UX (2026-11-04, medium priority; shipped items in TODO_HISTORY)

- [ ] **Hand-check on HOME (user): THREAD show-more and the action-row colors** (HOME @397, WORK v211 pushed, repoint pending; the row is icon-only except Task Today/Task Later, seen on WORK 2026-11-04, user: "look pretty good"). THREAD: click a Thread
  cell, expect 3 lines of body preview; set Hub Config `PreviewLines` to 5 and refresh, expect 5; 9 fails with
  `SETUP_ERROR`. Colors: teal = Task Today/Later, Note, Waiting; muted = Send to Meeting, Read Later, Dismiss,
  Archive, Open Gmail; red = Delete. Check light and dark.
- [ ] **Optional (user decides, default skip): Sheets data-validation dropdown (3,4,5) on the Hub Config `PreviewLines`
  cell.** It only constrains the cell; the server check in `getPreviewLines` (`gas-app/Config.gs`) stays.

- [ ] **Unreproduced (user, HOME 2026-11-06): Task Today/Later button not disabled on an already-tasked item.** Code locks on success (`triageTaskDone`); ask which item/state, or retest on @421 with a fresh item.
- [ ] **Hand-check on HOME @421 (adds: toast now up-left of the click, 300 ms fade; last-run polls every 5 min). Original @417 (user, 2026-11-06, `1c29a29`):** (1) Task Today / Task Later: spinner at the click, then the pair locks and reads "Tasked today" or "Tasked later" with a check, no toast on success, a toast on failure; reload keeps it locked; (2) FYI toasts (Undo, Note, Read Later) show top right, left of Live and Refresh, not over the rows. Archive already removes its row at the click; if one stayed, send the item. Not done: speeding up the Task call itself (server work, measure first).

### A8. Load speed: hub cache in IndexedDB (2026-11-06; QW1-QW3, QW5, Option 1 and Clear saved data shipped, see TODO_HISTORY)

On HOME @416 (`90ccb30`). On WORK as version 222 (code `c716b0c`..`aff529a`, pushed 2026-11-06; QW2, QW5 and the Clear button are NOT in it, run `npm run push:work` again after the check).
- [ ] **Check on WORK (user), version 222 after "Update WORK":** reload twice; the second load paints the saved Triage board right away, marked stale, and the refresh replaces it. In the app iframe console `indexedDB.databases()` lists `day-planner-hub`. Any `[hubCache]` console error: send it. The code has no off switch; if IndexedDB is blocked it loads as before.
- [ ] **Hand-check on HOME @416 (user):** (1) a profile with no saved flags (clear site data, reload): no jump in the nav when Triage and Meeting Prep appear; (2) About > Saved on this device > Clear saved data, then reload: the board is not painted from storage; (3) Doc rows stay cached 30 min, Refresh reads Drive.
- [ ] **QW4 dropped (2026-11-06):** measured on HOME, `getHubStatus` about 3 s against about 1.2-2 s for a trivial RPC, so a flags-only split saves about 1 s and nothing waits on it any more (saved flags paint the tabs, the board starts without it). Reopen only if a first-visit WORK trace shows otherwise.

### A7. Triage Doc action items (2026-11-05; shipped items in TODO_HISTORY)

- [ ] **Optional (default skip): `getDocActionItems` reads the full ledger twice per load** (`gas-app/HubController.gs`); fold into one read if Sheets quota errors recur. Residual risk: ledger `MAX_ROWS` 5000 and `ARCHIVE_AFTER_DAYS` 90 in `gas-app/LedgerRepository.gs`.
- [ ] **Live check on WORK (user), after "Update WORK" (user decision 2026-11-06: skip the HOME check, HOME has too few items to stress it):** bulk remove Doc items older than 365 days finishes in one call with no Quota error. WORK lacks this fix until `npm run push:work` runs again.
- [ ] **Live check on WORK (user), HOME @406, WORK pushed, repoint pending (Update WORK):** (1) click X on a Doc row, wait
  about 10 s, it stays gone; (2) wait through a Triage refresh, Doc rows stay on screen while the Doc load runs;
  (3) the 240 s budget against 169+ Docs and the "N older file(s) not read" line. If a row still returns, check
  `docRowsCacheClear_` logs, that `dismissDocItem` returns `ok` on WORK, and `DRY_RUN`.
- [ ] **Not yet traced: "129 items, only showing most recent 50" with 0 rows shown (user, WORK 2026-11-05).** The reload
  wipe fix (c8e03d1) explains rows vanishing; if the note still shows with 0 rows after the repoint, trace `limitDocRows`
  and the hidden-count text.
- [ ] **Later: migrate Drive v2 to v3** (separate TDD change, `DriveV3` Advanced Service is already used for comments).
- [ ] **Optional (user decides, default skip): trim the other raw UTC stamps** (email `item.date`, meeting `start` and
  `cutoffISO`, `c.start`) to local time like the last-run label (`formatLocalDateTime` in `src/hubUi.js`).

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
  SHIPPED 2026-11-03 (HOME @370, WORK pushed): 5T multi-tab guard (`docBodyContent`), 2T read-only Google Doc view (Notes header toggle),
  3T Open this day in Docs link. P1 probe on HOME: `/edit` is blocked by frame-ancestors, `/mobilebasic` frames and renders the private Doc
  read-only (whole month, no day targeting); read-write via a mobile view is not possible. WORK is untested for framing (third-party cookies,
  account index), so any `/mobilebasic` panel must stay optional. Open: decide whether to add an optional `/mobilebasic` pane (agent recommends F).
  USER REQUIREMENT (2026-11-03): notes edit and view both look like rich text, storage is secondary. SHIPPED 2026-11-03 (HOME @374/@375, WORK pushed, user repoints): per-line WYSIWYG
  editor (`src/lineEditor.js`; the active line is contenteditable, the Doc keeps the same markup) and the Doc view renders markup as rich text (`docBlockMarkup`).
  Part-line color (selection recolor, HOME @376, WORK v203) verified by the user on WORK 2026-11-03. Live-verified on HOME: bold on a selection, Enter inside bold. Hand-check of link modal, multi-line paste, Backspace at the start of a list line and dictation insert done (user, 2026-11-05).
  Inline Doc view retired (2026-11-03): the Notes header icon is now a real link, Open Notes in Docs (HOME @378, WORK pushed, v204 verified by the user; the light `getDayDocLink` RPC from 190e44e awaits the WORK repoint and a hand-check that the icon still opens the day heading).
- [ ] **Live check day rollover** (HOME @337, `1da3fcf`): leave the tab open past midnight. Smart paste verified on WORK
  (2026-11-02, user): Gmail, Docs and Gemini all pass; headings paste as bold by design (user 1A, no heading size).

### B3. Gap 10: cdp-step debugger (not started)

- [ ] **Gap 10: cdp-step debugger** (user approved asking for scope, 2026-11-01). Proposed scope, awaiting a yes: `tools/cdp-step.js`,
  attaches to the app iframe target like `tools/eval-console.js`; `--break <function>` pauses on the next call
  (`Debugger.setBreakpointOnFunctionCall`); JSON-line commands on stdin (`over`, `into`, `out`, `locals`, `eval <js>`,
  `resume`) so an agent can drive it; prints the frame location + locals each step. Out of scope: GAS server code, source
  maps, multi-tab. Red test first on the command parser; live part is manual.

### B4. Phase 30: WORK promotion and user-gated release items

Most items need the user (GSA account, a release go, or a decision). HOME live checks are done (TODO_HISTORY 2026-10-10).

- [ ] **Update WORK** whenever `npm run push:work` has run (the user repoints "Day Planner v1" in the WORK IDE).
- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a
  Meet link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
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
  WORK run 2026-11-02 (user, v191, in progress): T01 FAIL, the Tutorial example put `#a` at the end but the parser only
  honors a leading tag (`extractInlinePriority`); docs fixed to `#a DP-T01 Call vendor` (re-test T01).
- [ ] **Optional speed follow-ups** (ranked list from 2026-10-16): time each server step on HOME (folder check, page
  assembly, `Tasks.list`) before deciding on minify-at-push or a shell + cached bundle; `completedMin` on
  `getMasterTasks` only with the user's OK (hides old done undated items).

### B5. Franklin-inspired features (2026-11-15; from a study of the Franklin digital Original daily planner)
Queued by the user (2026-11-15). Each one adds new UI, so design it with the user present (quiet library, no pills, binder look).
- [ ] **Values, goals and tasks chain**: ON HOLD. Another session is designing this (Goals tab design canvas, grill answers pending). Do not start it here.
- [ ] **Daily planning ritual**: on the first open of each day, show a dismissible panel in the "Smart reload" toast style: yesterday's open items to forward or drop, today's calendar, and a prompt to pick A1-A3. Hidden on later opens that day.
- [ ] **Weekly review panel**: a panel, not a 7-column week grid. It lists open A items, delegated (Ⓓ) items due back, and goals touched this week (goals once the item above ships).
- [ ] **Print stylesheet**: `@media print` CSS that prints the Daily view as one Franklin-style page (tasks + schedule two-column, notes below). Hide the app chrome. CSS only.
- Skipped (user, 2026-11-15): handwriting or stylus input.
