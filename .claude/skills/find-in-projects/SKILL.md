---
name: find-in-projects
description: Search across ~/projects (or specific sibling project directories) for an existing skill, tool script, or code pattern to adapt into this project, using gemini-delegate.js instead of spawning Sonnet forks. Use when the user asks to "check other projects for X", "see if we've built this before", or "find a skill/script like Y" across the ~/projects tree.
---

# find-in-projects

MUST DO: Use `gemini-delegate` for "read many files across several
directories, tell me what each one is/does, rank relevance to a topic"
searches — this shape is bulk/mechanical/low-judgment, and delegation
costs a fraction of a Sonnet fork with no fork lifecycle overhead.

## When to use this vs. a fork

MUST DO: Use this first. Fall back to a fork only if:
- the delegated search comes back empty/unhelpful and deeper
  investigation needs your own judgment, or
- the task needs you to actually *evaluate* the found code's quality/
  correctness in depth (reading git history, running it, judging fit).
  Delegation is for the *finding*, not the *evaluating* — read whatever
  it finds yourself before relying on it, per `gemini-delegate`'s own
  post-delegation checklist.

## Invocation

```bash
node tools/gemini-delegate.js \
  --task "Search these directories for anything related to <topic>. \
For each relevant file found (SKILL.md, tools/*.js scripts, rules docs, \
etc.), report: its path, a one-line description of what it does, and \
how relevant it is to <topic>. Classify each finding as one of \
PATTERN_ONLY (idea/approach worth reusing, no code involved), \
API_DESIGN (interface/shape worth mirroring), DIRECT_CODE_REFERENCE \
(specific lines worth reading closely before adapting), or \
COPY_CANDIDATE (looks copy-pasteable as-is) — this project only ever \
adapts, never blind-copies, so flag anything COPY_CANDIDATE or \
DIRECT_CODE_REFERENCE for a closer look rather than reuse-on-sight. \
Skip node_modules, .git, and build output directories." \
  --dirs ~/projects/day-planner,~/projects/trip-planner \
  --force --verbose
```

- `--dirs` takes absolute paths, not limited to this project. MUST DO:
  List the specific sibling projects likely to have relevant prior art
  rather than the bare `~/projects` root when you can — a narrower,
  named list gives `agy` a smaller, faster search and a clearer signal
  than scanning everything at once. If you don't know which projects
  might have it, run a first pass over `~/projects` (one level deep) to
  identify candidates, then a narrower second pass with `--dirs` set to
  just those.
- MUST DO: Pass `--force` — there's no `--input-file` to size-gate
  against, and multi-directory exploration is inherently bulk regardless
  of measured input length.
- MUST DO: Treat the result as a lead to verify by reading the named
  files yourself, never a fact to relay or act on unchecked — same as a
  fork's report.

## Example prior finds this would have replaced

- "Prior `handoff.js` implementations" → found in `day-planner/tools/`
  and other sibling projects, each with different architecture.
- "Claude-drives-Gemini delegation patterns" → found in
  `trip-planner/.agents/BRIDGE.md`, `consult-agy.md`,
  `cross-cli-headless-invocation.md`, and `tools/gemini-prebake.js` (the
  direct ancestor of this project's own `tools/gemini-delegate.js`).
