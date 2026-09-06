---
name: consult-agy
description: Delegate a Tier-2/3 ROI task from Claude Code to Antigravity CLI (agy) headlessly.
tags: [agy, antigravity, delegate, cross-cli, day-planner]
version: 1.0.0
---

# /consult-agy — Delegate to Antigravity CLI

Use when Claude Code is the current driver and the task at hand is bulk mechanical work,
whole-repo summarization/ingestion, or a rapid edit-test loop that Gemini Flash/Flash-Lite can
handle safely and cheaply — per the routing table in
[[cross-cli-headless-invocation]]. Do **not** use this for browser/CDP checks (those stay on
`tools/ensure-chrome.js`/`tools/e2e/*`), architecture/OAuth/security judgment calls (handle those
directly in Claude Code), or anything that needs a commit decision (delegate the edit, keep the
commit in this session).

## Execution

```bash
agy -p "<scoped task description, with relevant file paths inlined>"
```

Then:
1. Read back `agy`'s output/diff before trusting it — same bar as reviewing any subagent's work.
2. Run this repo's normal checks (`npm test`, `npm run lint`, `node tools/check-esm-imports.js`
   as applicable) against whatever it changed, same as any other edit.
3. Log the delegation to the bridge for audit history:
   ```bash
   node tools/agent-bridge.js send --from claude --to agy --type task "<what was asked>"
   ```

Commit only after the above checks pass — this command delegates the edit, not the commit
decision.
