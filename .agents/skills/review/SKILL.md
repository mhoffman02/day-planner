---
name: review
description: Perform code quality, safety, and synchronization review on day-planner uncommitted changes or specific files.
tags: [review, code-review, quality, esm, day-planner]
version: 2.0.0
---

# Day Planner Code Review Skill

Performs code quality review targeting:
1. **ESM Import Specifiers**: Ensure relative imports in `src/` use explicit `.js` extensions.
2. **Dual Target Parity**: Check that changes in `src/` modules match corresponding logic in `gas-app/`.
3. **No Console Pollutants**: Ensure clean error handling without leftover debugging output.
4. **Test Pass**: Ensure `npm test` passes cleanly before committing.
