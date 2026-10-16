<!-- handoff: branch=worktree-hub-link-tutorial worktree=/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial base=02252e80592e written=2026-10-16T11:22:50-07:00 -->
# Resume: Task verbs, Master parity and Master speed on HOME; WORK v149 pushed, awaiting repoint

> **WARNING: written on branch `worktree-hub-link-tutorial`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial`), not `pure-gas-main`. Every commit was pushed
> to `origin/pure-gas-main`; the main checkout is behind until `git -C /home/mike/projects/day-planner pull --ff-only`.
> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose; don't merge into it.

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`.
Stale if that commit is dated after `2026-10-16T11:22:50-07:00` **and** its parent isn't `02252e80592e`; then read
that commit's `HANDOFF.md` instead and tell the user. `git log --oneline 02252e80592e..origin/pure-gas-main` shows
anything that landed after this prompt.

## OBJECTIVE
Make Day Planner task handling match a paper planner's verbs on every list: forward, delegate with a check-back,
and the same actions on Master Tasks as on Daily. Keep the app fast (Master tab < 0.5 s) and quiet (no loud
chrome for the normal state).

## KEY DECISIONS
- **Delegated is not done**: Delegate… makes an open "[X1] Check back: <title> (<owner>)" task on the check-back day;
  the source shows Ⓓ (completed in Google) with owner/day as hidden `waitingOn`/`nagDate` meta (user picked option A).
- **Master parity**: user: "I should be able to do all the verbs / actions on master tasks I can do on daily tasks".
  Writes land on the row's real task via `taskSource()` ([`src/app.js:4452`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/src/app.js#L4452)):
  undated master → `forwardMasterTask` / `undoMasterForward`; scheduled pair → its daily copy from its day; dated row → itself.
- **Compensated two-step writes** on the server: copy first, then mark; failed mark deletes the copy
  ([`gas-app/Code.gs:2839`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/gas-app/Code.gs#L2839) `copyThenMarkSource_`).
- **Routing by row object, not id**: the same id is on Daily and Master lists (every open dated task); id-based
  `isMaster` made WORK ≤ v148 Forward/Delegate skip the copy. Fixed in `2b2d712`.
- **Quiet Live mark** (UX option 1): live = small square light + "Live"; Switch to trial lives on About; trial stays loud.
  Square, not round: the no-pills test bans circles in hub CSS.
- **Speed**: status menus build only for the open row; Master draws 20 rows (user's number) then the rest in the
  background, stays built, pre-builds 1.5 s after startup; startup loads Day + Master in parallel. Cold-start
  floor is the GAS server response (~3 s); a shell/minify effort needs server-step timing first.

## CURRENT STATE
- HEAD `02252e8` on `worktree-hub-link-tutorial`, pushed to `origin/pure-gas-main`; HOME `/dev` has it (build 495).
- WORK: v149 created by `npm run push:work`; **user must repoint `/exec` to v149**. WORK `/exec` was on v148.
- Tests 1106/1106, lint clean. Session commits: `8e35a92`, `cd942be`, `abc1c1d`, `9cbe8b8`, `2b2d712`, `9f85119`,
  `12fce63`, `4f51059`, `02252e8` (details: TODO_HISTORY "2026-10-16").
- Measured: GAS HOME data on screen ≤ 2.5-3.6 s (server 2.9-3.5 s); tabs visible 10-50 ms; local 200-row Master
  first paint 0.12 s (was 5.6 s at v148). Bench script lives only in the job tmp dir (not in the repo).
- Not yet verified live on HOME: Forward/Delegate/Undo on Daily and Master (only local preview + unit tests).

## CONSTRAINTS & PREFERENCES
- Start replies with `🔋Mike:`; terse, no recaps. Report what changed and where; the report is the review.
- After `push:work` just say "Update WORK" (no repoint steps or IDE links).
- Commit directly; push to `origin HEAD:pure-gas-main`; push HOME from inside `gas-app/`:
  `cd gas-app && npx clasp --auth ~/.clasprc.home.json push -f`.
- Browser checks only via `tools/ensure-chrome.js` + CDP (never chrome-devtools MCP / claude-in-chrome on app pages).
  The ensure-chrome profile is signed in to Google as of 2026-10-16. The app runs in `#userHtmlFrame` inside the
  `userCodeAppPanel` sandbox frame.
- Mirror every client change in both `src/app.js` + `gas-app/Script.html`, `index.html` + `gas-app/Index.html`,
  `src/styles.css` + `gas-app/Styles.html`, About/Tutorial in `gas-app/*.html` and `index.html`.
- No ASCII apostrophes/backticks in comment prose in `gas-app/*.html`; no pills/circles; fail loud in every catch.
- New `google.script.run` functions need the IIFE alias AND a top-level delegator in `Code.gs` (grep count 2).
- Red test first for bug fixes; never weaken a test to pass.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. **User repoints WORK `/exec` to v149** — [`TODO.md:7`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L7).
2. **Re-check WORK forwards made before v149** (may lack copies) — [`TODO.md:9`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L9).
3. **Live check on HOME `/dev`** of Daily/Master Forward, Delegate, Undo with a throwaway task —
   [`TODO.md:11`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L11);
   code at [`src/app.js:4903`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/src/app.js#L4903) (`delegateDailyTask`),
   [`gas-app/Code.gs:2788`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/gas-app/Code.gs#L2788) (`forwardMasterTask`).

## IMMEDIATE NEXT STEP
Ask the user whether WORK `/exec` is on v149. Then run the HOME `/dev` live check:
`node tools/ensure-chrome.js "https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev"`
and drive a throwaway Daily task through Forward to tomorrow → Undo → Delegate… (owner "Test", tomorrow) → Undo.
