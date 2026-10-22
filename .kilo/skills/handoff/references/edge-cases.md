# handoff — edge cases

Read the section SKILL.md points you to, only when that case applies.

## Frozen, renamed or competing tracker docs (Step 0)

1. Glob the project root and one level into an obvious docs directory for
   `*.md`, matching case-insensitively `*PLAN*`, `*TODO*`, `*ROADMAP*`,
   `*DECISION*`, `*LEARN*`, `*RETRO*`, `*HANDOFF*`, `*RESUME*`, including
   `FROZEN-`/`ARCHIVED-` prefixes. A renamed file is still a candidate.
2. A `CLAUDE.md`/`README.md` pointer to a tracker doc is a candidate too, not
   a bypass: the doc it names may since have been frozen.
3. Check each candidate's first ~10 lines for a frozen marker ("❄️ FROZEN",
   "ARCHIVED" or similar).
   - Frozen **with** a named replacement → use the replacement; never touch
     the frozen copy again.
   - Frozen **with no** replacement → stop the whole handoff and ask the user
     which doc is canonical. Don't create a second one.
4. More than one directory could hold the canonical docs (a pivot's old/new
   repo, a monorepo, a sibling worktree)? Run step 3 on each. More than one
   live → ask the user. Never default to the current directory.

## No tracker doc at all (Step 3)

The session was more than a one-line fix → create `TODO.md`, plus `PLAN.md`
once there's more than one independent macro-track. Don't ask first. Use
`[ ]`/`[🔵]`/`[✔️]`/`[❌]` unless the doc already picked another convention.

## Cross-doc summaries and pivots (Step 3)

- A doc's entry summarizes another doc's list and points there? Re-check the
  two still agree after your edits.
- A pivot produced a sibling repo → add a pointer in the old repo's docs and
  confirm both agree (same IDs/URLs, same "what's next").

## Current-sprint flush (Step 3)

Only when the session-log doc's own header says it is current-sprint-only.
Unclear → don't flush. This is the only sub-step that deletes content.

- Routine closed item → drop it; a one-line status note on the plan doc's
  macro-task is enough, git log holds the rest. Moving the detail into the
  plan doc just relocates the bloat.
- Durable (a decision, gotcha or tradeoff) → promote it to the decisions doc
  first, then drop it.
- Never flush detail no commit captured: commit first (Step 2).
- Then sweep for pointers the flush broke (other tracker docs, `README.md`s,
  a sibling repo). Delegate the sweep (Step 3.0's routing order) with the
  exact removed headings, asking for file + line + quoted context. The
  delegate MUST NOT edit; you decide each fix.

## Clipboard (Step 5.3)

Try in order, silently skipping any not on PATH: `pbcopy`, `clip.exe` (WSL),
`wl-copy`, `xclip -selection clipboard`, `xsel --clipboard --input`. None
found → one line in the reply: "no clipboard tool found, printing below only".

## Several projects touched (Step 5.3)

Write a resume prompt in each one. Print only the active one (the one whose
docs hold the next work) unless the user asks, or two are equally live.

## Variants (only when the user names one)

- **Read-only:** show the resume prompt; write and commit nothing.
- **Preflight:** clean tree? Still run forward-flow. Report "nothing to hand
  off" only if forward-flow has nothing to update either.
