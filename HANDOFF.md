<!-- handoff: branch=worktree-solid-code-pilot worktree=/home/mike/projects/day-planner/.claude/worktrees/solid-code-pilot base=f8c486938a0e written=2026-11-04T11:17:35-08:00 -->
# Resume: solid-code gates piloted on a worktree branch; css-baseline shrink next

> **WARNING: written on branch `worktree-solid-code-pilot`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/solid-code-pilot`), not `pure-gas-main`. The user merged up to `bab8001`; `f8c4869` (gitleaks hook) and this handoff are not merged yet. Merge (fast-forward):
> `git -C /home/mike/projects/day-planner pull --ff-only && git -C /home/mike/projects/day-planner merge --ff-only worktree-solid-code-pilot`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-04T11:17:35-08:00` **and** its parent isn't `f8c486938a0e`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline f8c486938a0e..worktree-solid-code-pilot`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** ask the user to run the merge command above (user-gated). Then agent work in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) A5: shrink `css-baseline.json` (`--z-*` tokens first, then px font to rem, `outline-none`, then colors), and replace the suppressed shell-string `exec`/`execSync` sites in `tools/` with `execFile` (red test first). A0 Tutorial walk (T09, T10, T14, T16, T18, T20 not walked; T10/T14/T20 need Hub flags) remains the other agent item. User-gated, ask at the same time: (1) `npm run push:work` for the `--target-min` change, default: with the next gas-app change; (2) the Phase 32 hand-checks (TODO.md B1: WYSIWYG link modal, multi-line paste, Backspace on list line, dictation; repoint WORK).

This session piloted the `solid-code` gates in day-planner: Node safety bans, complexity 15, gitleaks and `npm ci`/audit in CI, a `--target-min` token (HOME @382, WORK not pushed), the `check-css.js` ratchet (`css-baseline.json`), and an edit-time PostToolUse hook (`tools/edit-gate.js`, `pickChecks`). Late addition: gitleaks 8.30.1 is installed in `~/.local/bin` and `.githooks/pre-commit` scans staged changes and blocks if the binary is missing. The skill itself (`~/.claude/skills/solid-code/`) was split into a core file plus per-stack files for js, py, web and css.

- What changed: TODO.md A5, PLAN.md Phase 33, TODO_HISTORY 2026-11-04, LEARNINGS 2026-11-04.
- Still open: TODO.md A0, A5; the "For the session after next" section (B1, B3, B4) needs the user present.
- rpc token check, due 2026-11-11: run `npm run rpc -- getHubStatus`; if it still works, drop the 7-day notes in the gas-rpc skill; `tools/gas-rpc.js` has no age warning to remove (TODO.md B4).
- Trap: the PostToolUse hook in `.claude/settings.json` loads at session start; a new session sees it, this one did not. Worktree Bash refuses compound commands and `git -C`; run plain commands. In `gas-app/*.html` never put `//` in strings. `sudo` has no terminal here; install tools to `~/.local/bin`.
