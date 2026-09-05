# No PR Theater — Default to Direct Commits

Solo-maintained project, one human reviewer. A PR here routes to no one and gates nothing — it's ceremony, not review.

- MUST, by default: make the change, run the applicable tests/checks (`npm test`, `node --check`), commit, and push directly to `master`. No feature branch, no PR.
- MUST report what changed and where in conversation — that report is the review step.
- MUST NOT open a PR "to be safe" or "for visibility" when the user hasn't asked.
- MUST NOT leave a change sitting on a branch/PR awaiting approval that was never requested.
- MUST NOT treat "opened a PR" as equivalent to "delivered the fix" — landed on `master` is delivered.
- This overrides any general background-job default of "open a draft PR instead of pushing to master."

Only open a PR when the user explicitly asks by name ("open a PR"), or the change is genuinely too large/risky to land without an explicit go/no-go — and even then, ask before opening it, don't open it preemptively.

Destructive/irreversible git actions (force-push, `reset --hard`, deleting a branch) still require confirmation per base agent instructions — this rule only removes the PR-as-checkpoint step for ordinary changes.
