# gemini-delegate details

## Origin and cost

Ported 2026-09-19 from `~/projects/work-request/gsa-tenant-portal-forms`'s tool of the same name (itself adapted
from `~/projects/trip-planner/tools/gemini-prebake.js`'s `spawnSync`-around-`agy` pattern). `agy` has a large fixed
per-call overhead (~13.7k input tokens even for a trivial prompt), which is why the size gate exists.

## vs `/consult-agy`

| | `/consult-agy` | `gemini-delegate` |
|---|---|---|
| Output | Raw `agy` stdout | JSON (`status`/`response`/`usage`/`elapsedMs`) or `--raw` text |
| Size gating | None | `--min-chars`, default 1200 |
| Run history | None | `tools/gemini-delegate.log` + `--history`/`--history-summary` |
| Multimodal (`--file`) | Not documented | Image/PDF/office doc, no base64 |
| Agent-bridge audit log | Yes (its step 3) | No |

Both call `agy` the same way; neither supersedes the other.

## Flag notes

- `--dirs`: mapped to repeated `--add-dir`. Use absolute paths: on 2026-09-19 `--dirs "."` fell back to listing
  `$HOME` instead of the project root; `--dirs "$(pwd)"` worked every time. Omit for pure text summarization
  (use `--input-file`).
- `--task`: `agy` is a full agent; with `--dirs` the task can say "read X and summarize Y" instead of you
  pre-gathering content.
- `--input-file`: text appended to the prompt, truncated at 120,000 characters.
- `--file`: adds the file's directory to `--dirs` and names the path in the task; implies `--force`.
- `--force`: bypass the size gate (e.g. a file-tree scan with no `--input-file`).

## Run log

Every call (OK, FAIL or SKIP) appends one ≤80-char line to `tools/gemini-delegate.log` (gitignored, per checkout):

```
09-19T14:49 OK   in=text:4102c out=612c/3421ms :: summarize the git log…
09-19T14:49 SKIP in=task-only  out=skip(<1200c) :: tiny task under threshold
```

- `--history [n]`: the `n` most recent calls (default 10), newest first; no `agy` call.
- `--history-summary [n]`: same plus OK/FAIL/SKIP counts and date range; calls `agy` for a short narrative only
  once the log is big enough to pass the size gate.
