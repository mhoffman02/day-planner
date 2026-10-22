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
npm run rpc -- hubSetTasksListId '"@default"'   # write Config TasksListId; returns previous (bogus id = forced L6 failure)
npm run rpc -- processWorkflowQueue             # run the queue (honors DRY_RUN)
npm run rpc -- getTriageBoard                   # read the triage board
```

`hubSetFeature` writes the Config tab and returns the fresh flags. Restore a flag you flipped for a test when the
test ends. For a value with no RPC yet (registry cells, non-flag Config keys), add a typed top-level RPC (TDD +
delegator), not a generic range-write endpoint (user decision 2026-10-10: typed endpoints only).

## Auth and errors

The rpc token dies every 7 days (consent screen stays in Testing). From day 6 the tool warns on stderr; on expiry it
exits 2 with `invalid_grant … 7-day`. Either way, **remind the user** to rerun the rpc login. To check the token
without side effects, run a read-only function **without** `--deploy` (e.g. `npm run rpc -- getHubStatus`).
Login command, GCP project, clasp credential slots, and a symptom → cause table (404, 403, 401,
`FUNCTION_NOT_FOUND`, new manifest scope): `references/setup.md`.
