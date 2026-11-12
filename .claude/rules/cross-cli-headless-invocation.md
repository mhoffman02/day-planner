# Two CLIs: `claude` and `agy`

Both share this working copy; either drives, the other runs headlessly as a one-shot worker (never ask the human to switch terminals). Local subscription logins, no API keys. Tiers: Claude `lite`/`worker`/`deep`; agy `invoke_subagent(Model="flash_lite"|"flash"|"pro")`.

| Task | Goes to |
| :--- | :--- |
| Architecture, OAuth/scope changes (`gas-app/appsscript.json`), deep adversarial review | `claude` (from agy: `/consult-claude`) |
| Bulk mechanical edits, repo summaries, fast edit-test loops | `agy` (from claude: `/consult-agy`) |
| Browser/CDP checks | neither: `tools/ensure-chrome.js` + `tools/` CDP ([[live-google-auth-browser-tool]]) |
| Lint, ESM check, pre-commit | local scripts |

- Headless calls MUST use the unattended-permission flag (or they hang/auto-deny); read `/consult-agy` or `/consult-claude` for exact flags.
- Headless calls edit and report, never commit; the driver reviews, tests, commits.
- Log each call: `node tools/agent-bridge.js send --from <caller> --to <target> --type task "<ask>"`.
- Session start: `node tools/agent-bridge.js read`, then `ack`. Before handing over, `/handoff`. Full interactive switch: `/bridge`.
- After editing `.agents/`, run `npm run sync:agents`.
