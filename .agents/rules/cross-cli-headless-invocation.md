# Two CLIs: Which One Does What

`claude` (Claude Pro: Sonnet/Opus) and `agy` (Gemini Flash driver, Flash-Lite and Pro subagents) share this
working copy. Either may drive; the other is called headlessly as a one-shot worker, never by asking the human to
switch terminals. Both use local subscription logins; no API keys. In-harness tiers: Claude `lite`/`worker`/`deep`
agents; agy `invoke_subagent(Model="flash_lite" | "flash" | "pro")` (`pro` is agy's fallback for Tier-1 work).

| Task shape | Goes to |
| :--- | :--- |
| Architecture, OAuth/scope changes (`gas-app/appsscript.json`, `drive.file`), deep adversarial review | `claude` (from agy: `/consult-claude`) |
| Bulk mechanical edits, whole-repo summaries, rapid edit-test loops | `agy` (from claude: `/consult-agy`) |
| Browser/CDP checks, mock mode included | **Neither**: run `tools/ensure-chrome.js` + `tools/e2e/*` in the driving CLI ([[live-google-auth-browser-tool]]) |
| Lint, ESM import check, pre-commit | Local scripts, zero tokens |

- MUST run a headless call with its unattended-permission flag, or it hangs or auto-denies. The exact commands and
  flags live in `/consult-agy` and `/consult-claude`; read the command before calling.
- A headless call may edit and report; it never commits. The driving session reviews, tests and commits.
- Log each call: `node tools/agent-bridge.js send --from <caller> --to <target> --type task "<what was asked>"` (keeps `.agents/BRIDGE.md` a readable history).
- Session start: `node tools/agent-bridge.js read` (then `ack`). Before handing the terminal to the other CLI, run
  `/handoff`. A full interactive switch (user keeps driving in the other CLI) uses `/bridge`.
- Configs live in `.agents/`; run `npm run sync:agents` after editing so both CLIs stay in step.
