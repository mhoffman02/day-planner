---
name: gemini-delegate
description: Delegate a bulk, mechanical, low-judgment subtask (file-tree exploration, bulk file reads, summarizing long/noisy output, git-log or commit-history digests, or reading a screenshot/image/PDF/office document) to a cheap/fast Gemini model via the `agy` CLI instead of doing it inline or spawning a full-cost Claude subagent. Use when a task is large-but-shallow — many files or a long log to summarize, or a non-text file to read — nothing requiring architecture judgment, code edits, or security/commit decisions.
---

# gemini-delegate

Wraps `tools/gemini-delegate.js`, ported 2026-09-19 from
`~/projects/work-request/gsa-tenant-portal-forms`'s tool of the same name
(itself a generalized adaptation of `~/projects/trip-planner/tools/
gemini-prebake.js`'s `spawnSync`-around-`agy` pattern). `agy` has a real
but large fixed per-call overhead (~13.7k input tokens even for a trivial
prompt, confirmed in the source project), so this is a cost/speed win only
for genuinely bulk tasks, not a free lunch to reach for by default.

## How this relates to `/consult-agy`

This project already has `/consult-agy` (`.agents/commands/consult-agy.md`)
for the same underlying idea — a one-shot `agy -p "..."
--dangerously-skip-permissions` call. The two are NOT redundant, they trade
off differently:

| | `/consult-agy` | `gemini-delegate` (this skill) |
|---|---|---|
| Output | Raw `agy` stdout, read/interpreted by you | Structured JSON (`status`/`response`/`usage`/`elapsedMs`) or `--raw` text |
| Size gating | None — you decide per-call | Built-in (`--min-chars`, default 1200 — mirrors the fixed-overhead math above) |
| Run history | None | `tools/gemini-delegate.log` + `--history`/`--history-summary` |
| Multimodal (`--file`) | Not documented | Yes — image/PDF/office-doc, no base64 needed |
| Agent-bridge audit log | **Yes** — step 3 of `/consult-agy` logs to `tools/agent-bridge.js` | **No** — this tool doesn't call `agent-bridge.js` |

**Use `/consult-agy` when the audit trail matters** (its step 3 records
the delegation via `node tools/agent-bridge.js send --from claude --to agy
--type task "..."`, which this repo's cross-CLI bridge history depends on).
**Use `gemini-delegate` when you want the structured output, run-history
tracking, or `--file` vision support**, and the bridge log isn't needed for
that particular call — e.g. exploratory bulk reads that don't represent a
handoff decision. If a delegated task via this skill turns out to be
bridge-worthy after the fact, log it manually with the same
`agent-bridge.js send` call `/consult-agy` uses.

Both ultimately call `agy` the same way; neither supersedes the other.

## Decision rule

| Task shape | Delegate here? |
|---|---|
| Summarizing a long git log / commit history / diff | **Yes** |
| Scanning a large file tree or reading many files to extract a pattern | **Yes** |
| Condensing noisy tool output (e.g. a long test run's log) before reasoning over it | **Yes** |
| Reading a screenshot, image, PDF, or Word/Excel document (`--file`) | **Yes** |
| Architecture or design decisions | **No** — stays with you |
| Any code edit, however small | **No** — stays with you |
| Security review, OAuth judgment, or anything gating a commit/merge decision | **No** — stays with you |
| Browser/CDP checks | **No** — those stay on `tools/ensure-chrome.js`/`tools/e2e/*` (see `.claude/rules/live-google-auth-browser-tool.md`) |
| A task under ~1200 characters of input | **No** — the fixed per-call overhead exceeds the savings; handle it yourself |

## Invocation

```bash
node tools/gemini-delegate.js --task "<description>" \
  [--dirs a,b,c] [--model gemini-3.7-flash-low] \
  [--input-file <path> | --file <image-or-doc-path>] \
  [--min-chars 1200] [--force] [--raw] [--verbose]
```

- `--task` (required) — what to do, as a clear, scoped instruction. `agy`
  is a full agentic CLI (not just text-in/text-out) — with `--dirs`, it can
  read files and explore directories itself, the same way a subagent
  would, so the task description can say "read X and summarize Y" rather
  than requiring you to pre-gather the content.
- `--dirs` — comma-separated paths to grant read access to (mapped to
  repeated `--add-dir`). Omit for a pure text-summarization task where you
  already have the content in hand (pipe it via `--input-file` instead).
  **Use absolute paths** — confirmed live 2026-09-19 that `--dirs "."`
  does NOT reliably scope `agy` to the caller's cwd (it fell back to
  listing `$HOME` instead of this project's root in one test); an
  absolute path (`--dirs "$(pwd)"` or `--dirs "$HOME/projects/day-planner"`)
  worked correctly every time.
- `--input-file` — path to a **text** file whose content gets appended to
  the prompt (e.g. a `git log` dump you've already captured). Truncated at
  120,000 characters.
- `--file` — path to an **image, PDF, or office document** (screenshot,
  scanned PDF, Word/Excel file) for `agy` to read itself, multimodally —
  no base64-encoding needed, this script just adds the file's directory to
  `--dirs` and names the exact path in the task. Always bypasses the size
  gate below (there's no text length to gate a "look at this file" task on).
- `--min-chars` (default 1200) — the size gate from the decision rule
  above. Below this, the script exits `2` (not an error) without calling
  `agy` at all — the caller should just do the task itself. Ignored when
  `--file` is given.
- `--force` — bypass the size gate (use when you already know the task is
  worth delegating regardless of measured input length, e.g. a file-tree
  scan with no `--input-file`). Implied automatically by `--file`.
- `--raw` — print only the `.response` text instead of the full JSON
  envelope (`status`/`response`/`usage`/`elapsedMs`).
- Exit codes: `0` success, `1` failure (agy not found, call failed,
  malformed response — treat as "do it yourself"), `2` size-gate skip.

## Run log & invocation history

Every CLI call (success, failure, or size-gate skip) appends one
≤80-char line to `tools/gemini-delegate.log` — timestamp, status,
input, output, and the task description, e.g.:

```
09-19T14:49 OK   in=text:4102c out=612c/3421ms :: summarize the git log…
09-19T14:49 SKIP in=task-only  out=skip(<1200c) :: tiny task under threshold
```

Not committed (gitignored — add `tools/gemini-delegate.log` to
`.gitignore` if it isn't already) — it's a local, per-checkout usage
record, not project state.

- `--history [n]` — list the `n` most recent invocations (default 10),
  newest first. Plain JS reading the log file back; no `agy` call.
- `--history-summary [n]` — same list, plus JS-computed counts
  (OK/FAIL/SKIP) and a date range. Only calls `agy` for a short pattern
  narrative once the log has accumulated enough content to be worth
  summarizing (same size gate as a normal delegation).

## Mandatory after every delegated call

Same checklist `/consult-agy` already holds this project to:

1. **Read the output before trusting it** — same bar as reviewing any
   subagent's work. A cheap model's summary can miss or misstate things.
2. **Never let a delegated summary directly drive a commit or decision**
   — you still own that judgment, always.
3. If the delegated task involved exploring files (`--dirs` given), treat
   its findings as a lead to verify, not a fact to relay unchecked.
4. Run this repo's normal checks (`npm test`, `npm run lint`,
   `node tools/check-esm-imports.js` as applicable) against anything a
   delegated task touched, same as `/consult-agy`'s step 2.
