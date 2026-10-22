# gas-rpc setup and troubleshooting

Read when a call fails with an auth/HTTP error, a token is near expiry, or the manifest gained a scope.

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
