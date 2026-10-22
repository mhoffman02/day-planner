---
name: consult-claude
description: Delegate a Tier-1 architecture, OAuth, or deep review task from Antigravity CLI (agy) to Claude Code headlessly.
tags: [claude, claude-code, delegate, cross-cli, day-planner]
version: 1.0.0
---

# /consult-claude — Delegate to Claude Code

Use when Antigravity CLI (agy) is the current driver and the task at hand is Tier-1 work:
architecture/design decisions, Google Workspace API scope changes (`gas-app/appsscript.json`, `drive.file` boundaries),
or deep adversarial security and code reviews — per the routing table in
[[cross-cli-headless-invocation]]. Do **not** use this for browser/CDP checks (those stay on
`tools/ensure-chrome.js`/`tools/e2e/*`), bulk mechanical edits/summarization (handle those
directly in AGY), or anything that needs a commit decision (delegate the edit or advice, keep the
commit in this session).

## Execution

```bash
claude --safe-mode -p "<scoped task description, with relevant file paths and constraints inlined>" --permission-mode acceptEdits --allowedTools "<scoped list: e.g. Read or Read,Edit,Bash>" --add-dir /home/mike/projects/day-planner
```

- `--permission-mode acceptEdits` (or `auto` with `--permission-prompts none`) is **mandatory**: without it headless
  Claude Code hangs forever waiting for an approval no one is present to give.
- `--safe-mode` skips CLAUDE.md/skills/plugins/hooks but keeps the OAuth login, so inline the context the task needs
  (file paths, the constraint that matters). Do not use `--bare`: it skips keychain reads and fails with
  `Not logged in · Please run /login` unless `ANTHROPIC_API_KEY` is set.
- Scope `--allowedTools` to the task (`"Read"` for inspection, `"Read,Edit,Bash"` for a scoped fix).
- Stuck or needing deep design advice: ask the Opus advisor read-only:
  `claude --safe-mode --model opus --effort medium -p "<task>" --permission-mode acceptEdits --allowedTools "Read" --add-dir <repo-root>`

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
