---
description: Record a retrospective entry in LEARNINGS.md
---

Generate a retrospective and append it to `LEARNINGS.md`.

**Do NOT run `node tools/retro.js` without flags** — it will fail without content. Synthesize
the session's content yourself first, then pass it via CLI flags.

## Step 1 — Synthesize content from this session

Review recent commits (`git log --oneline -8`) and what was accomplished this session, then compose:

- **label**: 3-6 word title for this session's theme
- **worked-well**: what went smoothly (1-4 items, pipe-separated)
- **needs-improvement**: what was painful or broke (0-3 items, pipe-separated)

## Step 2 — Run with flags populated

```bash
node tools/retro.js \
  --label "Your synthesized title here" \
  --worked-well "first thing that worked|second thing" \
  --needs-improvement "first pain point|second pain point"
```

Items within a flag are `|`-separated. `--needs-improvement` may be omitted if nothing
qualifies. The script appends a dated entry to `LEARNINGS.md` and commits it. Add
`--dry-run` to preview without committing.
