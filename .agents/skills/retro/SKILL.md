---
name: retro
description: Record a dated retrospective entry in LEARNINGS.md for day-planner.
tags: [retro, learnings, docs, retrospective, day-planner]
version: 2.0.0
---

# Retro Skill — Record Learnings & Retrospectives

Appends a structured, dated retrospective entry to `LEARNINGS.md`.

## Execution

```bash
node tools/retro.js --label "<Title>" --worked-well "Item 1 | Item 2" --needs-improvement "Item A | Item B"
```

Options:
- `--label`: Short descriptive topic
- `--worked-well`: Pipe-separated list of positive outcomes
- `--needs-improvement`: Pipe-separated list of areas to improve
- `--dry-run`: Preview without writing file
