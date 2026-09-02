---
name: local-review-uncommitted
description: Reviews all uncommitted working-tree changes (staged + unstaged) against day-planner project conventions.
tags: [review, uncommitted, git, safety, day-planner]
version: 2.0.0
---

# Local Review Uncommitted Skill

Inspects `git status` and `git diff` against `day-planner` standards:
1. Verify no unintended files or scratch logs are staged.
2. Parity check: run `npm run build:gas:check` first — it's a free, mechanical check
   covering 5 of the 6 shared `src/`/`gas-app/` files. Only `src/gasBridge.js` is
   hand-duplicated; if it changed, diff it against `gas-app/Script.html`'s `GASBridge`
   class only (`grep -n "class GASBridge" gas-app/Script.html` to find its bounds) —
   never read the whole file for this.
3. Validate ESM syntax and unit test coverage (`npm test`).
