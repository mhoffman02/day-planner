<!-- handoff: branch=worktree-hub-link-tutorial worktree=/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial base=8f75e4a70e0a written=2026-10-16T14:52:39-07:00 -->
# Resume: Gmail 🎯 labels + filter recommender shipped (HOME @332); WORK v160 pushed, awaiting repoint

> **WARNING: written on branch `worktree-hub-link-tutorial`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial`), not `pure-gas-main`. Every commit was pushed
> to `origin/pure-gas-main`; the main checkout is behind until `git -C /home/mike/projects/day-planner pull --ff-only`.
> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose; don't merge into it.

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`.
Stale if that commit is dated after `2026-10-16T14:52:39-07:00` **and** its parent isn't `8f75e4a70e0a`; then read
that commit's `HANDOFF.md` instead and tell the user. `git log --oneline 8f75e4a70e0a..origin/pure-gas-main` shows
anything that landed after this prompt.

**Start by:** asking the user whether WORK `/exec` is on v160, and for the pasted Filter Suggestions tab. Then run the
HOME `/dev` live check of Forward/Delegate/Undo ([`TODO.md:9`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L9)).

## OBJECTIVE
Let the hub act on mail automatically: create the eight 🎯/ Gmail labels, learn from mail the user already labeled,
and suggest Gmail filters that apply those labels, all without tripping Gmail's per-minute quota on WORK.

## KEY DECISIONS
- **Background learner**, not one call: a 1-minute trigger (`hubFilterLearnTick`) steps list → read → learn →
  measure; state in UserProperties `DP_FILTER_LEARN_V1`, header features in the 6 h user cache, bodies never stored.
- **Pace**: each tick ≤ 4,000 units (200 emails) or 50 s, 50 ms between calls; 2,000 units/min left for Triage
  (user chose option A, `8f75e4a`). A quota error ends the tick; the next one resumes.
- **No incremental learning across runs** (user agreed "keep it simple"): long-lived header storage is a GSA
  retention change, labels go stale, saving ~6 min of a background job. Recency already built in (28 days, newest first).
- **Filters are add-label only** (never archive/skip-inbox/delete); `gmail.settings.basic` is optional and never
  holds the approval banner.
- **Every push** updates "Day Planner v1": `npx clasp -P gas-app push --force`,
  `npx clasp -P gas-app deploy -i AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA -d "Day Planner v1"`,
  `npm run push:work`, then tell the user "Update WORK".

## CURRENT STATE
- HEAD `8f75e4a` on `worktree-hub-link-tutorial`, pushed to `origin/pure-gas-main`. HOME "Day Planner v1" @332.
- WORK: v160 created (v159 is identical); **user must repoint `/exec` to v160**.
- Tests 1157/1157, lint clean. Session commits since last handoff: `a4dc944` … `8f75e4a` (TODO_HISTORY "2026-10-16 (later)").
- HOME live: Suggest filters read 1,053 emails, no limit error, 0 suggestions (only ~11 labeled test threads). WORK
  read 1,234 emails (~44/day). Learner code: [`gas-app/HubController.gs:1144`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/gas-app/HubController.gs#L1144) (`learnTick_`),
  [`gas-app/HubController.gs:1196`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/gas-app/HubController.gs#L1196) (`hubSuggestFilters`).
- A Chat-created task landed on Saturday once; Google stored due 10-17; recreating it landed on today. Not a planner bug.

## CONSTRAINTS & PREFERENCES
- Start replies with `🔋Mike:`; terse, no recaps. After `push:work` just say "Update WORK".
- Commit directly; push `origin HEAD:pure-gas-main`. Worktree guard: no compound/xargs/heredoc-pipe git commands.
- Browser checks only via `tools/ensure-chrome.js` + CDP (profile signed in as of 2026-10-16).
- Mirror client changes in `src/app.js` + `gas-app/Script.html`, `index.html` + `gas-app/Index.html`, styles, About/Tutorial.
- No ASCII apostrophes/backticks in `gas-app/*.html` comment prose; no pills/circles; fail loud in every catch.
- New `google.script.run` functions need the IIFE alias AND a top-level delegator in `Code.gs`.
- Red test first for bug fixes; never weaken a test to pass.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. **User: Update WORK to v160 and paste the Filter Suggestions tab** for the numbered review —
   [`TODO.md:25`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L25).
2. **7-day Testing expiry 2026-10-17**: rerun the rpc login; check the web app and sync trigger still authorize —
   [`TODO.md:12`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L12).
3. **Agent: HOME `/dev` live check** of Daily/Master Forward, Delegate, Undo with a throwaway task —
   [`TODO.md:9`](file:///home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial/TODO.md#L9).

## IMMEDIATE NEXT STEP
Ask the user for the WORK Filter Suggestions tab. Meanwhile run
`node tools/ensure-chrome.js "https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev"`
and drive a throwaway Daily task through Forward to tomorrow → Undo → Delegate… (owner "Test", tomorrow) → Undo.
