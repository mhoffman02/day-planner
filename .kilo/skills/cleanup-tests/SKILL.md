---
name: cleanup-tests
description: Detect and kill orphaned test runner, node server, or browser processes for day-planner.
tags: [cleanup, tests, processes, kill, node]
version: 2.0.0
---

# Cleanup Tests Skill

Detects and terminates orphaned processes associated with `day-planner` test runs and local dev servers.

## Quick Execution

```bash
# Kill orphaned node server or test processes on port 3000/3001 or matching test patterns
pkill -f "node server.js" || true
pkill -f "node --test" || true
pkill -f "vitest" || true
```

## Diagnostics
Check active node processes:
```bash
ps aux | grep node
```
