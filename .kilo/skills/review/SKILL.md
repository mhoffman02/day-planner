---
name: review
description: Perform code quality, safety, and synchronization review on day-planner uncommitted changes or specific files.
tags: [review, code-review, quality, esm, day-planner]
version: 2.1.0
---

# Day Planner Code Review Skill

Default scope: uncommitted changes (`git diff`/`git status`) or specific files named in the
request. Only sweep the full codebase when explicitly asked for a full-tree pass.

## 2-Stage Review Execution

### Stage 1: Mechanical Hygiene & Lint (Tier 3 / Local)
Run locally before any LLM semantic audit:
1. **ESM Import Specifiers**: Ensure relative imports in `src/`, `tests/`, and `tools/` use explicit `.js` extensions:
   ```bash
   node tools/check-esm-imports.js
   ```
2. **Lint & JSDoc**: Run ESLint and verify `@file` headers:
   ```bash
   npm run lint
   ```
3. **Unit Tests**: Ensure all unit tests pass:
   ```bash
   npm test
   ```

### Stage 2: Semantic & Security Audit (Tier 1)
Targeting:
- **Google OAuth / Storage Scoping**: Verify `drive.file` restriction is intact; no widening to full `drive`.
- **Date Arithmetic Safety**: Check that no local dates use `.toISOString()` (prevents UTC day-shift bugs).
- **DOM Injection & External Links**: Check that all dynamic HTML is escaped and `target="_blank"` carries `rel="noopener noreferrer"`.
- **Harness Routing**:
  - In **Antigravity CLI**: Dispatch `invoke_subagent(Model="pro", Role="Security Reviewer", Prompt="...")` for a first pass. For a deep pre-merge audit, run `/consult-claude` to delegate it to Claude Code headlessly in this same session (per [[cross-cli-headless-invocation]]). Only fall back to posting a review request to the bridge (`node tools/agent-bridge.js send --from agy --to claude --type review "..."`) and prompting the user to switch to **Claude Code CLI** if a full interactive handoff is what's actually wanted.
  - In **Claude Code CLI**: Run with Claude Pro (Sonnet 5/Opus 5).
