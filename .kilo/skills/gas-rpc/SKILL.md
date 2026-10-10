---
name: gas-rpc
description: Run any top-level HOME Apps Script function (runSelfTest, hubSpike, ...) headlessly via the Apps Script Execution API (scripts.run) and read its JSON result + exit code directly. Use whenever you need to run server-side GAS tests or a GAS function yourself instead of asking the user to click Run in the IDE or open ?view=self-test.
---

# gas-rpc — headless server-side test runner (Tier D)

```bash
npm run rpc -- runSelfTest              # full live self-test; exit 1 if any check fails
node tools/gas-rpc.js hubSpike          # any top-level function in gas-app/*.gs
node tools/gas-rpc.js someFn '"2026-10-10"' '{"dryRun":true}'   # args are JSON
node tools/gas-rpc.js runSelfTest --raw # full scripts.run response
```

- stdout = the function's return value as JSON. stderr = error object (`kind: http|script|client`, script errors carry the GAS stack).
- Exit: `0` ok, `1` script threw or result reports failures (`passedCount !== totalTests`, `overallStatus` FAIL, or an array item with `status: 'FAIL'`), `2` usage/auth/HTTP.
- `devMode: true` by default → runs **latest `clasp push`ed code (@HEAD)**, no deployment needed. Push first, then run. `--prod` runs the versioned API-executable deployment instead.
- HOME only. The script ID comes from `gas-app/.clasp.json`; there is deliberately no override. WORK (GSA) cannot link a standard GCP project, so it can never use this.

## Callable functions

Only names Apps Script's static scan sees as **top-level** functions — the same rule as `google.script.run` (see [[gas-namespace-iife]]). A function that exists only as `global.x = x` inside an IIFE returns "Script function not found". Add a top-level delegator for it first. Return values must be plain JSON (no GAS objects).

## One-time setup (already done once; redo only if auth breaks)

1. HOME script linked to GCP project **Day Planner** (`day-planner-507615`, number `951958469609`) in IDE → Project Settings. Apps Script API enabled there; consent screen **In production**. In "Testing" mode refresh tokens expire every 7 days.
2. Desktop OAuth client JSON at `~/.config/day-planner/clasp-run-client.json` (never in the repo).
3. `npx clasp login --user rpc --creds ~/.config/day-planner/clasp-run-client.json --use-project-scopes`. That stores `tokens.rpc` in `~/.clasprc.json`, apart from the `default` push login. The tool prefers `rpc`; override with `GAS_RPC_CLASP_USER` / `GAS_RPC_CLASPRC`.
4. `gas-app/appsscript.json` carries `"executionApi": {"access": "MYSELF"}`.

## Troubleshooting

| Symptom | Cause |
| :--- | :--- |
| 403 `PERMISSION_DENIED` | Script not linked to the OAuth client's GCP project, Apps Script API off in that project, or `executionApi` missing in the pushed manifest |
| 404 | Wrong scriptId or manifest without `executionApi` not yet pushed |
| 401 / `invalid_grant` | Token revoked/expired; redo setup step 3 (check the consent screen is In production) |
| `Script function not found` | Missing top-level delegator (see above) or not pushed |
| New scope in manifest | Re-run step 3 so the token carries it; `--use-project-scopes` reads the manifest |
