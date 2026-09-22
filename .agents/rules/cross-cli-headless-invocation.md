# Cross-CLI Headless Invocation (AGY ↔ Claude Code)

Either CLI may act as the interactive driver for a session; the other is invoked headlessly,
mid-session, as a synchronous one-shot expert/worker call — not via a human switching terminals.
This supplements [[dual-cli-blended-workflow]]'s tier table with the actual invocation mechanics.
Both binaries (`agy`, `claude`) are installed locally; a plain shell-out is sufficient plumbing.
**Neither CLI uses API keys** (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY` are NOT used) — this is a pure
CLI-to-CLI protocol relying on each tool's local authenticated subscription login.

## Invoking Claude Code headlessly (target: `claude`)

```bash
claude --safe-mode -p "<task>" --permission-mode acceptEdits --allowedTools "<scoped list>" --add-dir <repo-root>
```

- If stuck or needing deep architectural guidance from AGY, invoke the Opus advisor directly with:
  `claude --safe-mode --model opus --effort medium -p "<task>" --permission-mode acceptEdits --allowedTools "Read" --add-dir <repo-root>`
- `--permission-mode acceptEdits` (or `auto` with `--permission-prompts none`) is **mandatory**
  for any unattended call — without it, headless Claude Code hangs forever waiting for a tool-use
  approval no one is present to give.
- `--safe-mode` skips CLAUDE.md/skills/plugins/hooks while preserving OAuth credentials and tool
  execution. The caller must inline enough context in the prompt itself (relevant file paths, the
  constraint that matters).
- Scope `--allowedTools` to what the task actually needs (e.g. `"Read"` for an inspection call,
  `"Read,Edit,Bash"` for a scoped fix) — don't grant blanket tool access to a one-shot call.
- **Auth caveat (`--bare` vs `--safe-mode`)**: `--bare` skips keychain reads per `claude --help`.
  When using OAuth subscription login (`claudeAiOauth`), `--bare` fails with
  `Not logged in · Please run /login` unless `ANTHROPIC_API_KEY` is explicitly set in the environment.
  Using `--safe-mode` preserves OAuth credentials from `~/.claude/.credentials.json` while still
  disabling hooks and extraneous customization.

## Invoking AGY headlessly (target: `agy`)

```bash
agy -p "<task>" --dangerously-skip-permissions
```

- `--dangerously-skip-permissions` is **mandatory** for unattended calls — without it, headless AGY
  auto-denies tool calls that require permission confirmation, exiting with:
  `jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied`.
- `--mode accept-edits` can be specified if the delegation is strictly limited to file modifications,
  but `--dangerously-skip-permissions` is required for command execution (tests, git queries, lint).
- `-p` (or `--print`) runs non-interactively and prints the agent's response to stdout.
- `--model <model>` can optionally select the model tier (e.g. flash for rapid Tier 2/3 worker loops).
- `--add-dir <repo-root>` adds the repo root when invoking from an outside working directory.

## Routing table

Reuses the Tier 1/2/3 vocabulary from [[dual-cli-blended-workflow]]:

| Task shape | Invoke |
| :--- | :--- |
| Architecture/design decisions, OAuth/scope changes, deep adversarial review | `claude` |
| Bulk mechanical edits, whole-repo summarization/ingestion, rapid test-loop chores | `agy` |
| Browser/CDP live checks (any day-planner page, mock mode included) | **Neither** — stays on `tools/ensure-chrome.js` + `tools/e2e/*` per [[live-google-auth-browser-tool]]; delegating this to the other CLI's own automation path risks retripping Google's automation-detection block |

## Safety gate

A headless cross-CLI call may edit files and report back, but it does not auto-commit. The
invoking session's own normal review/test/commit flow still gates before anything lands on
`master`.

## Audit trail

Every cross-CLI invocation should also log a bridge message so `.agents/BRIDGE.md` stays a
readable history, even though the actual work now happens synchronously via subprocess rather
than by one side polling for the other to notice:

```bash
node tools/agent-bridge.js send --from <caller> --to <target> --type task "<what was asked>"
```
