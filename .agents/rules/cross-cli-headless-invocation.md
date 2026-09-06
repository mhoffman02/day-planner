# Cross-CLI Headless Invocation (AGY ↔ Claude Code)

Either CLI may act as the interactive driver for a session; the other is invoked headlessly,
mid-session, as a synchronous one-shot expert/worker call — not via a human switching terminals.
This supplements [[dual-cli-blended-workflow]]'s tier table with the actual invocation mechanics.
Both binaries (`agy`, `claude`) are installed locally; a plain shell-out is sufficient plumbing.

## Invoking Claude Code headlessly (target: `claude`)

```bash
claude --bare -p "<task>" --permission-mode acceptEdits --allowedTools "<scoped list>" --add-dir <repo-root>
```

- `--permission-mode acceptEdits` (or `auto` with `--permission-prompts none`) is **mandatory**
  for any unattended call — without it, headless Claude Code hangs forever waiting for a tool-use
  approval no one is present to give.
- `--bare` skips CLAUDE.md/hooks/settings auto-load. The caller must inline enough context in the
  prompt itself (relevant file paths, the constraint that matters) rather than relying on ambient
  project config being loaded for it.
- Scope `--allowedTools` to what the task actually needs (e.g. `"Read"` for an inspection call,
  `"Read,Edit,Bash"` for a scoped fix) — don't grant blanket tool access to a one-shot call.
- **Auth caveat**: these flags are correct per `claude --help`, but a headless child process needs
  its own valid login (`~/.claude/.credentials.json` on a normal machine). A sandboxed/background-
  job session does not necessarily inherit that credential even when one exists for interactive use
  on the same machine (`Not logged in · Please run /login`) — verify with a trivial read-only call
  before relying on this from inside such a session; it's expected to work from a normal
  interactive terminal where `claude` is already logged in.

## Invoking AGY headlessly (target: `agy`)

```bash
agy -p "<task>"
```

Permission-equivalent flags for unattended AGY invocation are AGY's own side of this contract —
to be filled in by the Antigravity session against its own hooks/settings model, not hardcoded
here from the Claude Code side.

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
