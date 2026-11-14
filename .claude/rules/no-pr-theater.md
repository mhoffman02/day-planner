# No PR Theater

Solo project; a PR gates nothing.

- Default: change, run checks (`npm test`, `node --check`), commit directly on the working branch (`pure-gas-main`). No feature branch, no PR. Report what changed in conversation.
- Open a PR only when the user says "open a PR", or the change is too big/risky for a go/no-go (ask first).
- Never leave work parked on a branch/PR awaiting an approval nobody requested. Landed = delivered.
- Overrides the background-job default of "draft PR instead of pushing".
- Force-push, `reset --hard`, branch deletion still need confirmation.

## One landing path (worktree sessions)

Before `npm run deploy:home` and before every push, as separate commands (worktree guard):
1. `git fetch origin`, then `git rebase origin/pure-gas-main` (a fresh worktree starts on `master`: `git switch -c <name> origin/pure-gas-main` first).
2. `npm run lint && npm test`.
3. `git push origin HEAD:pure-gas-main`. Rejected: repeat 1-3. Never force-push.

The user only runs `git pull --ff-only` in the main checkout; never hand them a cherry-pick.
**Why:** 2026-11-14 one session pushed only to GitHub, the next landed by cherry-pick on a stale local branch; both rewrote the trackers and `git pull --rebase` conflicted. Deploying from a branch behind GitHub would also ship HOME without the other session's commits. `npm run check:handoff` fails and `npm run deploy:home` refuses while GitHub is ahead (`tools/landing-branch.js`).
