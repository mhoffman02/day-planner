---
name: local-review-uncommitted
description: Reviews all uncommitted working-tree changes (staged + unstaged) against day-planner project conventions.
tags: [review, uncommitted, git, safety, day-planner]
version: 2.0.0
---

# Local Review Uncommitted Skill

Inspects `git status` and `git diff` against `day-planner` standards:
1. Verify no unintended files or scratch logs are staged.
2. Check `src/` modules vs `gas-app/` implementation parity.
3. Validate ESM syntax and unit test coverage.
