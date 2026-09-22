---
name: handoff
description: Generate a structured CONTEXT HANDOFF DOCUMENT (HANDOFF.md) so a fresh instance of the assistant can continue seamlessly without conversational memory. Invoked via "/handoff" or directly.
tags: [handoff, context, continuity, transition, day-planner]
version: 3.0.0
---

# Context Handoff Skill (`/handoff`)

You are about to be replaced by a fresh instance of yourself that will have NONE of this conversation’s memory. Write or update [**`HANDOFF.md`**](file:///home/mike/projects/day-planner/HANDOFF.md) at the repository root so the new instance can continue seamlessly.

### Procedure

1. **Lint & Tests**:
   Run `npm run lint` and `npm test` to ensure clean repo state. Fix any regressions before concluding the handoff.
   ```bash
   npm run lint
   npm test
   ```

2. **Update `HANDOFF.md`**:
   Write or update `HANDOFF.md` with these 6 required sections:
   - **`OBJECTIVE`** — what we’re trying to do, in 2 to 3 sentences
   - **`KEY DECISIONS`** — what we locked in and why, so it doesn’t get relitigated
   - **`CURRENT STATE`** — exactly where we are, git commit/branch, and what was just done
   - **`CONSTRAINTS & PREFERENCES`** — user style, tone, format, do’s and don’ts, anything corrected
   - **`OPEN THREADS (THE 3 MOST IMPORTANT TASKS)`** — the top 3 ranked next tasks with exact file links and line numbers
   - **`IMMEDIATE NEXT STEP`** — the first concrete command or code edit the new instance should execute

3. **Commit & Print**:
   - Commit `HANDOFF.md` (and any related doc updates) with a truthful message like `docs(handoff): session summary and next steps`.
   - Print the full content of `HANDOFF.md` in the chat response so the user can easily copy or verify it.

Be specific, quote actual user preferences, use clickable `file://` markdown links, and write it so a stranger could pick up the work cold.
