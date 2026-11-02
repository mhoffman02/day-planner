---
description: Report (and optionally clean up) merged git worktrees/branches left over from finished sessions
---

Run:
```bash
node tools/prune-branches.js
```

This is **report-only** — it never deletes anything by default. It runs `git fetch
--prune`, checks whether local `pure-gas-main` is behind `origin/pure-gas-main`, and lists every
worktree/branch whose tip is already merged into `origin/pure-gas-main` (safe-to-remove leftovers
from finished background-job sessions) versus ones with real unmerged work (left alone).

- If local `pure-gas-main` is behind, tell the user and offer to run `git pull --ff-only` —
  don't run it unasked.
- If it reports `N candidate(s) for removal`, show the list to the user and ask
  before applying. Only after they confirm, run:
  ```bash
  node tools/prune-branches.js --apply
  ```
  This deletes only via `git worktree remove` (no `--force`) and `git branch -d` (not
  `-D`), which independently refuse anything dirty — but their own "is this merged" check
  is against the branch's upstream, or the invoking worktree's current HEAD if no upstream
  is set, which isn't guaranteed to be `origin/pure-gas-main`. The script's own `merge-base
  --is-ancestor` check against `origin/pure-gas-main` (shown in the report) is the actual gate;
  git's refusal is a second opinion, not the same check restated, so a "skipped" line here
  is expected/harmless, not an error to chase. A `LOCKED` line means merged but locked; `git worktree unlock` it first (it may be a live session).
- Never touches the current worktree or `pure-gas-main`/`master`/`main` (master is a diverged branch, never the base), and never runs `--apply` without
  the user's go-ahead — this can be destructive to in-progress work in another worktree if
  the merge classification is ever wrong, so don't treat the report as authorization.
