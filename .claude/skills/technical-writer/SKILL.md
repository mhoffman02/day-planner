---
name: technical-writer
description: Write and edit day-planner's own docs (ADRs in docs/adr, LEARNINGS.md, PLAN.md, TODO.md, PRD.md, REQUIREMENTS.md, docs/*.md) and audit them against code for drift. Use when a change needs its record written, a doc is out of date, a tracker needs syncing, or the user states a rule to remember. Not for HANDOFF.md (handoff skill).
---

# technical-writer (day-planner)

**Load the global skill first and follow it:** `~/.claude/skills/technical-writer/SKILL.md` (generic rules, drift audit, done-when). This file only adds the doc map and overrides for this repo; where they differ, this file wins.

## Doc map

| Doc | Rule |
| :--- | :--- |
| `docs/adr/NNNN-*.md` + `docs/adr/README.md` | One file per hard-to-reverse decision. Nygard format: **Status**, **Context**, **Decision**, **Consequences**. Add the row to the README table. A reversal is a new ADR marked `Supersedes NNNN`; the old status becomes `Superseded by NNNN`. Never edit history away |
| `LEARNINGS.md` | Retro log. Append dated entries (the `retro` skill writes them) |
| `PLAN.md` | Overview, stack table, standing criteria and the current or next phase only. Move a fully checked phase to `PLAN-HISTORY.md` |
| `TODO.md` | Open items only. Move completed items to `TODO_HISTORY.md` under a dated entry with commit refs |
| `PRD.md`, `REQUIREMENTS.md` | Product intent and testable requirements. Never renumber ids |
| `README.txt`, `docs/*.md` | Entry points and design notes. Update in the same change that moves the thing they describe |
| `CLAUDE.md` | Repo-specific rules only. Loaded every turn, so never restate `~/.claude/CLAUDE.md` or `.agents/rules/*` |
| `.agents/{rules,commands,skills}` | Hand-edit here only, then `npm run sync:agents` (never edit `.claude/` or `.kilo/`) |
| `HANDOFF.md` | Only through the `handoff` skill |

## Overrides

- **Dates in `TODO.md`, `PLAN.md`, `HANDOFF.md`** follow `.agents/rules/tracker-dates.md`: a deadline is `due YYYY-MM-DD`; any other date is `(YYYY-MM-DD)` with no "by/on/until/expires" before it. Dates are local (`date +%F`).
- **Links:** file paths and code symbols in docs and replies use clickable `file://` markdown links (CLAUDE.md rule 7).
- **Gate:** after touching a tooling-checked doc, `npm run lint && npm test` pass with zero errors and warnings; `npm run check:handoff` for tracker edits.
