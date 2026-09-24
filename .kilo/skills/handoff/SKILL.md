---
name: handoff
description: Generate a structured CONTEXT HANDOFF DOCUMENT (HANDOFF.md) so a fresh instance of the assistant can continue seamlessly without conversational memory. Invoked via "/handoff" or directly.
tags: [handoff, context, continuity, transition, day-planner]
version: 3.1.0
---

# Context Handoff Skill (`/handoff`)

You are about to be replaced by a fresh instance of yourself that will have NONE of this conversation’s memory. Write or update [**`HANDOFF.md`**](file:///home/mike/projects/day-planner/HANDOFF.md) at the repository root so the new instance can continue seamlessly.

### Execution Procedure

Execute these steps in strict sequence:

1. **Pre-Flight Verification (MUST RUN FIRST IN CURRENT SESSION)**:
   Run `npm run lint && npm test` to confirm zero regressions in the current session BEFORE touching any handoff artifacts. Fix any regressions immediately.
   ```bash
   npm run lint && npm test
   ```

2. **Archive Completed Tasks to `TODO_HISTORY.md`**:
   Move completed items from [**`TODO.md`**](file:///home/mike/projects/day-planner/TODO.md) into [**`TODO_HISTORY.md`**](file:///home/mike/projects/day-planner/TODO_HISTORY.md) with date and commit references, then purge completed items from [**`TODO.md`**](file:///home/mike/projects/day-planner/TODO.md).

3. **Sync Roadmap in `PLAN.md`**:
   Update [**`PLAN.md`**](file:///home/mike/projects/day-planner/PLAN.md) to check off completed items (`- [x]`) and align current phase status.

4. **Queue Next Planned Items in `TODO.md`**:
   Move the next actionable milestone/items from [**`PLAN.md`**](file:///home/mike/projects/day-planner/PLAN.md) into [**`TODO.md`**](file:///home/mike/projects/day-planner/TODO.md).

5. **Update `HANDOFF.md`**:
   Write or update [**`HANDOFF.md`**](file:///home/mike/projects/day-planner/HANDOFF.md) covering all 6 canonical sections:
   - **`OBJECTIVE`** — what we’re trying to do, in 2 to 3 sentences
   - **`KEY DECISIONS`** — what we locked in and why, so it doesn’t get relitigated
   - **`CURRENT STATE`** — exactly where we are, git commit/branch, and what was just done
   - **`CONSTRAINTS & PREFERENCES`** — user style, tone, format, do’s and don’ts, anything corrected
   - **`OPEN THREADS (THE 3 MOST IMPORTANT TASKS)`** — the top 3 ranked next tasks matching [**`TODO.md`**](file:///home/mike/projects/day-planner/TODO.md) with exact file links and line numbers
   - **`IMMEDIATE NEXT STEP`** — the first concrete command or code edit the new instance should execute (do NOT instruct running tests/lint as step 1; pre-flight verification in step 1 already confirmed zero regressions in the current session)

6. **Commit & Print**:
   - Commit all updated documents:
     ```bash
     git add HANDOFF.md PLAN.md TODO.md TODO_HISTORY.md
     git commit -m "docs(handoff): session transition and task queue"
     ```
   - Print the full content of [**`HANDOFF.md`**](file:///home/mike/projects/day-planner/HANDOFF.md) in the chat response.

7. **Copy to Clipboard & Notify**:
   - Copy `HANDOFF.md` to the system clipboard and print confirmation:
     ```bash
     (clip.exe < HANDOFF.md 2>/dev/null || /mnt/c/Windows/system32/clip.exe < HANDOFF.md 2>/dev/null || wl-copy < HANDOFF.md 2>/dev/null || xclip -selection clipboard < HANDOFF.md 2>/dev/null || xsel --clipboard --input < HANDOFF.md 2>/dev/null || pbcopy < HANDOFF.md 2>/dev/null)
     echo "📋 Copied to clipboard."
     ```

Be specific, quote actual user preferences, use clickable `file://` markdown links, and write it so a stranger could pick up the work cold.
