# No PR Theater — Solo Project, Default to Direct Commits

## The rule

This is a solo-maintained project (see `README.txt` § Overview) with exactly one
human reviewer: the user. **Do not open a pull request as the default way of
"finishing" a change.** There is no one else to review it, no CI gate that only
runs on PRs, and no second pair of eyes a PR would route the diff to — so a PR
here is pure ceremony, not a review step.

Default behavior for any agent (interactive or background) working in this repo:

1. Make the change on the relevant branch.
2. Run the applicable tests/checks (`npm test`, `node --check`, etc.).
3. Commit, and **push directly to `master`** — do not create a feature branch or
   PR just to hold the change.
4. Report what changed and where. That report *is* the review step — the user
   reads the summary/diff in conversation, not a GitHub PR page.

Only open a PR when the user explicitly asks for one by name ("open a PR",
"put this up for review"), or when a change is genuinely too large/risky to land
without an explicit go/no-go from the user first (and even then, ask in
conversation before opening it — don't open it "just in case"). A background job's
general convention of "open a draft PR instead of pushing to master" is
**overridden by this rule for this repo**: push to master directly once the
task's own instructions authorize committing, exactly as an interactive session
would.

Do not:
- Open a PR "to be safe" or "for visibility" when the user hasn't asked.
- Leave a change sitting on a branch/PR waiting for approval that was never
  requested — that just adds a manual merge step the user has to come back and
  do themselves.
- Treat "opened a PR" as equivalent to "delivered the fix." Landed on `master`
  is delivered; a PR is a detour.

## Why

Every PR opened without being asked for is a step the user has to notice, open,
read, and merge (or ask *why* it wasn't just pushed) — pure overhead in a
project with no other collaborators. `[[concise-communication]]` already
establishes that process overhead costs more here than the underlying change is
worth; this rule is the workflow-level version of the same principle: ship the
change, don't stage it for a review that will never happen.

## How to apply

- Before finishing any task that changes tracked files: check whether the
  change landed on `master` yet. If it's sitting on a branch or in an open PR
  and the user never asked for a PR, that's incomplete — push it to `master`
  (after tests pass) instead of stopping at the PR.
- Destructive/irreversible actions (force-push, `git reset --hard`, deleting a
  branch) still require the confirmation this project's other rules and the
  base agent instructions already call for. This rule only removes the
  PR-as-default-checkpoint step for ordinary changes — it does not loosen any
  of those safety rules.
