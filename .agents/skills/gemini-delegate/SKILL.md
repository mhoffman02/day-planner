---
name: gemini-delegate
description: Delegate bulk, low-judgment work to a cheap Gemini model via `agy`: file-tree exploration, bulk file reads, summarizing long logs or git history, reading an image/PDF/office file. Use when a task is large but shallow. Never for architecture, code edits, security or commit decisions.
---

# gemini-delegate

Wraps `tools/gemini-delegate.js`. Each `agy` call has ~13.7k tokens of fixed overhead, so delegate only genuinely
bulk work. Use `/consult-agy` instead when the bridge audit log matters; this tool gives JSON output, a size gate,
run history and `--file` vision, but logs nothing to `tools/agent-bridge.js` (log it by hand if the call turns out
to matter). Origin, the full comparison and flag notes: `references/details.md`.

## Decision rule

| Task shape | Delegate? |
|---|---|
| Summarize a long git log, commit history or diff | Yes |
| Scan a large file tree or read many files for a pattern | Yes |
| Condense noisy tool output (a long test log) | Yes |
| Read a screenshot, image, PDF or Word/Excel file (`--file`) | Yes |
| Architecture or design decisions | No |
| Any code edit, however small | No |
| Security, OAuth, or anything gating a commit/merge | No |
| Browser/CDP checks | No: `tools/ensure-chrome.js` + `tools/e2e/*` ([live-google-auth-browser-tool](../../rules/live-google-auth-browser-tool.md)) |
| Under ~1200 characters of input | No: overhead exceeds savings |

## Invocation

```bash
node tools/gemini-delegate.js --task "<description>" \
  [--dirs /abs/a,/abs/b] [--model gemini-3.7-flash-low] \
  [--input-file <path> | --file <image-or-doc-path>] \
  [--min-chars 1200] [--force] [--raw] [--verbose]
```

- `--task` (required): a clear, scoped instruction.
- `--dirs`: **absolute** paths only (`"."` is unreliable).
- `--input-file`: text to append (e.g. a captured `git log`). `--file`: image/PDF/office doc; bypasses the gate.
- `--force`: skip the size gate. `--raw`: print only the response text.
- Exit `0` OK, `1` failed (do it yourself), `2` skipped by the size gate (do it yourself).
- `--history [n]` / `--history-summary [n]`: recent calls from `tools/gemini-delegate.log`.

## After every call (MUST)

1. Read the output before trusting it; a cheap model can miss or misstate things.
2. Never let a delegated summary drive a commit or decision directly.
3. Findings from `--dirs` exploration are leads to verify, not facts to relay.
4. Run the repo checks (`npm test`, `npm run lint`, `node tools/check-esm-imports.js`) on anything it touched.
