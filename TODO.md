# Active Tasks (TODO)

Order (2026-10-30, user): autonomous agent work first (item A3); everything that needs the user is in the last section,
"For the session after next" (items B1, B3, B4). An agent session works only A3.

## Agent work: next session (no user needed)

### A0. Tutorial coverage gaps (2026-11-02; stale labels already fixed)
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
`check-css.js` (baseline `css-baseline.json`: magic-color 126, important 535),
`tools/edit-gate.js` PostToolUse hook, and the skill split (`~/.claude/skills/solid-code/{js,py,web,css}.md`).

- [ ] **Agent: shrink `css-baseline.json`** by moving literals into `:root` tokens (`--z-*` @383, `px-font` @384, `outline-none` @385, done 2026-11-04; colors 782 to 126 @387; remaining 126 are single-use literals). Edit `src/styles.css`, re-mirror `gas-app/Styles.html`
  (copy by hand; `node tools/check-mirror.js` verifies), then `node tools/check-css.js --update`. `!important` 535 is the long tail.
- [x] shell-string `exec`/`execSync` in `tools/` now `execFileSync` argv (2026-11-04).
- [x] gitleaks 8.30.1 installed in `~/.local/bin` (checksum verified) and `.githooks/pre-commit` scans staged changes, blocks if missing (2026-11-04).
- [ ] **User decision:** `npm run push:work` for the pilot's gas-app changes (Styles `--target-min`); default: next
  gas-app change, then "Update WORK".
- [ ] **Low priority, later: semantic color names (2026-11-04).** Rename the hex-named `--c-<hex>` tokens in
  `src/styles.css` + `gas-app/Styles.html` to semantic names. First rank-rate 3-5 widely used palettes/design systems
  (candidates: Material 3 color roles, Tailwind, Radix Colors, IBM Carbon, GitHub Primer), then map each of our
  colors to its best match in the top-ranked system and rename accordingly. Keep the binder look (parchment cream,
  forest teal); a mapping that shifts rendered colors is a design decision, so propose, don't apply silently.

### A6. Triage action feedback (2026-11-04, medium priority)

- [x] **Triage page actions are silent; the user double/triple taps to be sure they registered.** Give every Triage
  action a brief, non-annoying acknowledgement (toast, inline flash or similar) that the action took effect. Offer
  3-4 ranked UX options first ([[feedback_quiet_normal_state_ui]]); reuse the existing toast pattern if one fits.
  Red test first for any new `src/*.js` behavior; gas-app change is done only after `npm run deploy:home` passes.
- [ ] **Triage: fix the 3 bugs the coverage worker found (2026-11-04).** Red test first for each. (1) `src/dailyDataCache.js`
  40-113: a synchronous throw from `indexedDB.open()` sets `dbPromise = null` inside the executor, then line 40 overwrites it,
  so the retry reset never happens (test: `tests/dailyDataCacheIdbThrow.test.js` records it). (2) `src/gasBridge.js`
  `getWebAppUrl` resolves `''` on server failure with no log: fail loud ([[no-silent-failures]]). (3) `deleteDailyTask`
  sends only `taskId`; looks intentional, confirm and document.
- [ ] **deploy-home.js: fail early and clearly at the 200-version limit, warn near 180** (hit 2026-11-04, user deleted old
  versions in the IDE).
- [ ] **Triage: restyle the action row (user 2026-11-04: option A, labels on Task Today + Archive).** Hybrid row:
  labeled Task Today and Archive, 28 px flat icon-only buttons for the rest, two groups split by a hairline (Create:
  Task Later, Note, Waiting, Meeting; Clear: Read Later, Dismiss, Delete). Keep every action 1-click, no pills. Also
  weigh color grouping and action hints (user ask): tint by group via tokens (create = binder teal, defer/clear =
  muted ink, destructive = danger red kept apart from Dismiss); color never the only cue (icon + `title` +
  `aria-label` carry meaning); keep contrast passing axe in light and dark; reuse existing `--c-*`/semantic tokens, no
  new magic colors (css-baseline only goes down). Propose the color mapping before applying.
- [x] **Triage: every action button needs hover text** (`title`, plus `aria-label` where the label is icon-only or
  1-2 words; user 2026-11-04). Include the new Note button. Say what the action does and where the item goes.
- [x] **Triage: add an "Add to Notes Today" action** (user 2026-11-04). Propose a 1-2 word button label (candidates:
  "Note", "To Notes", "Journal"; default "Note") and confirm it fits the existing action row. Appends the item to
  today's Notes. Check what the Phase 32 Notes Doc view and `appendToDailyNote`-style RPCs already offer before adding
  a new one; same acknowledgement as the item above.
- [ ] **Triage: THREAD show-more expands to 3-5 lines, not 2** (user 2026-11-04). Default 3, configurable somewhere out
  of the way (user suggests the Hub sheet Config tab; check how Hub Config flags are read and cached before choosing,
  clamp to 3-5, fail loud on a bad value per [[no-silent-failures]]). Collapsed state stays about 1 line.

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
  Part-line color (selection recolor, HOME @376, WORK v203) verified by the user on WORK 2026-11-03. Live-verified on HOME: bold on a selection, Enter inside bold. Still to try by hand: link modal, multi-line paste, Backspace at the start of a list line, dictation insert.
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
- [ ] **rpc token check, due 2026-11-11**: consent screen is In production (2026-11-03) and the existing token (fingerprint 4d06a094, first seen 2026-10-12) already outlived 7 days, so no re-login is needed. Run `npm run rpc -- getHubStatus` on or after 2026-11-11; if it still works, drop the 7-day notes in the gas-rpc skill (`tools/gas-rpc.js` has no age warning, only the `invalid_grant` hint at ~L117, which stays).
- [ ] **Re-check WORK forwards made before v149**: Forward/Delegate on a Daily row set the glyph without making a
  copy (fixed in `2b2d712`). Tasks forwarded on WORK ≤ v148 may be missing from their later day; re-add any.
- [ ] **Delete the test appointment** "Day Planner e2e test - safe to delete" (HOME calendar, 2026-10-30 14:00, has a
  Meet link). The app has no event-delete RPC, so it was left for you.
- [ ] **Other test data you may want to clear**: the "Hub L6 forced-failure test" email and the Task it created in
  `@default`; default "Daily Notes" sections for 10-30 and 10-31 in the October notes Doc.
- [x] **WORK Meeting Prep live render**: verified 2026-11-02 (user, WORK v189): T14b passed, carry-in listed after Refresh.
  Verified 2026-11-03 (user, WORK v195, `bf1024e`): a Core meeting past its prep cutoff still shows, "(passed 41 mins ago)".
  Open follow-up: the status line under the header stretched to half the screen (fixed with `.hub-mail-note`, awaiting
  the next WORK push).
- [x] **T14 FAIL on WORK (2026-11-02, user), resolved by the ledger redesign; T14b passed on v189:** count stayed 0; Integration Ledger row 51 error "Notes Doc is inaccessible:
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
  WORK run 2026-11-02 (user, v191, in progress): T01 FAIL, the Tutorial example put `#a` at the end but the parser only
  honors a leading tag (`extractInlinePriority`); docs fixed to `#a DP-T01 Call vendor` (re-test T01).
- [ ] **Optional speed follow-ups** (ranked list from 2026-10-16): time each server step on HOME (folder check, page
  assembly, `Tasks.list`) before deciding on minify-at-push or a shell + cached bundle; `completedMin` on
  `getMasterTasks` only with the user's OK (hides old done undated items).
