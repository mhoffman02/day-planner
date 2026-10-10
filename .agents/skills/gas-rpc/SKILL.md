---
name: gas-rpc
description: Run any top-level HOME Apps Script function (runSelfTest, hubSpike, ...) headlessly via the Apps Script Execution API (scripts.run) and read its JSON result + exit code directly. Use whenever you need to run server-side GAS tests or a GAS function yourself instead of asking the user to click Run in the IDE or open ?view=self-test.
---

# gas-rpc — headless server-side test runner (Tier D)

```bash
npm run rpc -- runSelfTest --deploy     # push @HEAD, repoint API deployment, run; exit 1 on any FAIL
npm run rpc -- runSelfTest              # run against whatever version the API deployment points at
node tools/gas-rpc.js hubSpike          # any top-level function in gas-app/*.gs
node tools/gas-rpc.js someFn '"2026-10-10"' '{"dryRun":true}'   # args are JSON
node tools/gas-rpc.js runSelfTest --raw # full scripts.run response
```

- stdout = the function's return value as JSON. stderr = error object (`kind: http|script|client`; script errors carry `errorType` and the GAS stack).
- Exit: `0` ok, `1` script threw (e.g. `FUNCTION_NOT_FOUND`) or result reports failures (`passedCount !== totalTests`, `overallStatus` FAIL, or an array item with `status: 'FAIL'`), `2` usage/auth/HTTP.
- **Run the code you just changed with `--deploy`.** Verified live 2026-10-10: `scripts.run` answers only on the API-executable deployment ID (`API_DEPLOYMENT_ID` in `tools/gas-rpc.js`) with `devMode: false`. The script ID and `devMode: true` both 404. So a run executes the deployment's pinned version; `--deploy` does `clasp push --force` + `clasp update-deployment <API id>` first, which creates a new version each time. Don't use `--deploy` in a loop when nothing changed.
- `--deploy` is fine without asking: it touches only the API deployment, never the pinned web-app `/exec` deployment users open. It refuses unless `gas-app/.clasp.json` is the HOME script.
- HOME only. WORK (GSA) cannot link a standard GCP project, so it can never use this.

## Callable functions

Only names Apps Script's static scan sees as **top-level** functions — the same rule as `google.script.run` (see [[gas-namespace-iife]]). A function that exists only as `global.x = x` inside an IIFE returns `FUNCTION_NOT_FOUND`. Add a top-level delegator for it first. Return values must be plain JSON (no GAS objects).

## Hub Sheet reads/writes: do them yourself, never ask the user

The user wants a fully automatic flow. Never ask them to edit the hub Config Sheet when an RPC covers it:

```bash
npm run rpc -- getHubStatus                     # read flags, dryRun, last run, ledger counts
npm run rpc -- hubSetFeature DRY_RUN false      # write one flag (any DPEngines.DEFAULT_FEATURES key; value is a JSON boolean)
npm run rpc -- processWorkflowQueue             # run the queue (honors DRY_RUN)
npm run rpc -- getTriageBoard                   # read the triage board
```

`hubSetFeature` writes the Config tab and returns the fresh flags. Restore a flag you flipped for a test when the
test ends. For a value with no RPC yet (registry cells, non-flag Config keys), add a typed top-level RPC (TDD +
delegator), not a generic range-write endpoint (user decision 2026-10-10: typed endpoints only).

## Setup (done 2026-10-10; redo only if auth breaks)

1. HOME script linked to GCP project **Day Planner** (`day-planner-507615`, number `951958469609`); Apps Script API enabled there. Consent screen stays in **Testing** by owner choice (not ready to publish/share), so the refresh token dies every **7 days**. The tool tracks first use of each token (`~/.config/day-planner/gas-rpc-state.json`, fingerprint only) and warns on stderr from day 6; on expiry it exits 2 with `invalid_grant … 7-day`. When you see either, **remind the user** and redo step 3 (one browser approval).
2. Desktop OAuth client JSON at `~/.config/day-planner/clasp-run-client.json` (never in the repo).
3. `cd gas-app && npx clasp --user rpc login --creds ~/.config/day-planner/clasp-run-client.json --use-project-scopes --redirect-port 8765`. It prints a URL for the user to approve. The token lands in `~/.clasprc.json` slot `rpc`, apart from the `default` push login.
4. `gas-app/appsscript.json` carries `"executionApi": {"access": "MYSELF"}`.

clasp credentials: `~/.clasprc.json` `default` and `rpc` = mhoffman02@gmail.com (HOME push/deploy and RPC); `~/.clasprc.work.json` = GSA (used only by `npm run push:work`). Deploying HOME as the GSA account fails with "Only users in the same domain as the script owner may deploy".

## Troubleshooting

| Symptom | Cause |
| :--- | :--- |
| 404 `NOT_FOUND` | API deployment deleted, or its version predates `executionApi`; check `clasp list-deployments`, update `API_DEPLOYMENT_ID` |
| 403 `PERMISSION_DENIED` | Script not linked to the OAuth client's GCP project, or Apps Script API off there |
| 401 / `invalid_grant` | 7-day Testing expiry (or revoked); remind the user, redo setup step 3 |
| `FUNCTION_NOT_FOUND` | Missing top-level delegator, or not deployed (`--deploy`) |
| New scope in manifest | Redo setup step 3 so the token carries it |
