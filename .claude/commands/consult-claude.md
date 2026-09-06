---
name: consult-claude
description: Delegate a Tier-1 architecture, OAuth, or deep review task from Antigravity CLI (agy) to Claude Code headlessly.
tags: [claude, claude-code, delegate, cross-cli, day-planner]
version: 1.0.0
---

# /consult-claude — Delegate to Claude Code

Use when Antigravity CLI (agy) is the current driver and the task at hand is Tier-1 work:
architecture/design decisions, Google OAuth/scope changes (`googleAuth.js`, `drive.file` boundaries),
or deep adversarial security and code reviews — per the routing table in
[[cross-cli-headless-invocation]]. Do **not** use this for browser/CDP checks (those stay on
`tools/ensure-chrome.js`/`tools/e2e/*`), bulk mechanical edits/summarization (handle those
directly in AGY), or anything that needs a commit decision (delegate the edit or advice, keep the
commit in this session).

## Execution

```bash
claude --safe-mode -p "<scoped task description, with relevant file paths and constraints inlined>" --permission-mode acceptEdits --allowedTools "<scoped list: e.g. Read or Read,Edit,Bash>" --add-dir /home/mike/projects/day-planner
```

*(Note: Use `--safe-mode` instead of `--bare` when relying on Claude Code's web/OAuth login credentials, as `--bare` disables keychain credential reads).*

Then:
1. Read back `claude`'s output/diff before trusting it — same bar as reviewing any subagent's work.
2. Run this repo's normal checks (`npm test`, `npm run lint`, `node tools/check-esm-imports.js`
   as applicable) against whatever it changed, same as any other edit.
3. Log the delegation to the bridge for audit history:
   ```bash
   node tools/agent-bridge.js send --from agy --to claude --type task "<what was asked>"
   ```

Commit only after the above checks pass — this command delegates the edit or advice, not the commit
decision.
