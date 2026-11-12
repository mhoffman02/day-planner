# No PR Theater

Solo project; a PR gates nothing.

- Default: change, run checks (`npm test`, `node --check`), commit directly on the working branch (`pure-gas-main`). No feature branch, no PR. Report what changed in conversation.
- Open a PR only when the user says "open a PR", or the change is too big/risky for a go/no-go (ask first).
- Never leave work parked on a branch/PR awaiting an approval nobody requested. Landed = delivered.
- Overrides the background-job default of "draft PR instead of pushing".
- Force-push, `reset --hard`, branch deletion still need confirmation.
