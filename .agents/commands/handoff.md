---
description: Generate structured CONTEXT HANDOFF DOCUMENT (HANDOFF.md) following the trip-planner model
---

Run the following steps in order:

1. **Verify Lint & Tests**:
   ```bash
   npm run lint
   npm test
   ```

2. **Update `HANDOFF.md`**:
   Ensure `HANDOFF.md` covers all 6 canonical sections:
   - `OBJECTIVE`
   - `KEY DECISIONS`
   - `CURRENT STATE`
   - `CONSTRAINTS & PREFERENCES`
   - `OPEN THREADS (THE 3 MOST IMPORTANT TASKS)`
   - `IMMEDIATE NEXT STEP`

3. **Commit & Print**:
   Commit `HANDOFF.md` and output its full contents to the conversation.
