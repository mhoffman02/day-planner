---
description: Generate structured CONTEXT HANDOFF DOCUMENT (HANDOFF.md) following pre-flight test/lint and task sync protocol
---

Run the following steps in strict order:

1. **Pre-Flight Verification (FIRST IN CURRENT SESSION)**:
   Run `npm run lint && npm test` to confirm zero regressions in the current session.
   ```bash
   npm run lint && npm test
   ```

2. **Archive Completed Tasks**:
   Move completed items from `TODO.md` to `TODO_HISTORY.md` and purge completed items from `TODO.md`.

3. **Archive Completed Phases**:
   Move any fully-checked phase out of `PLAN.md` into `PLAN-HISTORY.md` (create it if it doesn't exist yet), so `PLAN.md` stays a lean, forward-looking planning doc rather than a growing changelog.

4. **Sync Roadmap**:
   Update `PLAN.md` with checked-off items for whatever phase is still in progress.

5. **Queue Next Work**:
   Move next active items from `PLAN.md` into `TODO.md`.

6. **Update `HANDOFF.md`**:
   Ensure `HANDOFF.md` covers all 6 canonical sections:
   - `OBJECTIVE`
   - `KEY DECISIONS`
   - `CURRENT STATE`
   - `CONSTRAINTS & PREFERENCES`
   - `OPEN THREADS (THE 3 MOST IMPORTANT TASKS)`
   - `IMMEDIATE NEXT STEP` (actionable next command/edit, omitting redundant test/lint preflight)

7. **Commit & Print**:
   Commit `HANDOFF.md`, `PLAN.md`, `PLAN-HISTORY.md`, `TODO.md`, and `TODO_HISTORY.md`, and output full contents of `HANDOFF.md` to the conversation.

8. **Copy to Clipboard & Notify**:
   ```bash
   clip.exe < HANDOFF.md 2>/dev/null || xclip -selection clipboard < HANDOFF.md 2>/dev/null || pbcopy < HANDOFF.md 2>/dev/null
   echo "Handoff copied."
   ```
