# Google Apps Script Dual Environment Isolation (HOME vs WORK)

Two separate Apps Script deployments under different Google accounts. Never mix them up, cross-deploy or conflate
them.

- **HOME** `day-planner-home`: script `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`, consumer Gmail,
  configured in `gas-app/.clasp.json`. Has `/dev` and `/exec`.
- **WORK** `day-planner-work`: script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`, GSA Workspace
  (`gsa.gov`), via `gas-app/.clasp-work.json`. `/exec` only.
- Endpoint URLs, deployment IDs, self-test and IDE links: `.agents/skills/gas-dev/reference/environments.md`. Read it
  before opening, probing or deploying either one.

## Strict Invariants

0. **Every push updates "Day Planner v1" on both** (user, 2026-10-16): after a gas-app commit, `clasp push --force` + `clasp deploy -i AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA -d "Day Planner v1"` on HOME, and `npm run push:work` on WORK (creates a version labelled "Day Planner v1"; the user repoints it in the WORK IDE, see invariant 3).

1. **Active Focus & Mastercopy**: Current active development target is **HOME** (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`), configured in `gas-app/.clasp.json`.
2. **Never Swap clasp target implicitly**: Never modify `gas-app/.clasp.json` to the WORK script ID. Keep HOME permanently configured there.
3. **Promotion Workflow (HOME -> WORK)**:
   - HOME is the MASTERCOPY (`gas-app/.clasp.json`).
   - Pushing vetted code to WORK is executed via `npm run push:work`.
   - `npm run push:work` targets `gas-app/.clasp-work.json` without modifying `.clasp.json`.
   - Google Apps Script enforces that only users in the script owner's domain (`gsa.gov`) can publish/redeploy Web App versions (`Only users in the same domain as the script owner may deploy this script`). Therefore, while code push and version creation can be done via shared editor (`mhoffman02@gmail.com`), pointing the production `/exec` deployment to the latest version must be confirmed in the Apps Script IDE under `michael.hoffman@gsa.gov` (Deploy > Manage deployments > Edit > Version > Deploy).
4. **Never Route HOME through GSA Proxy**: NEVER use `/a/macros/gsa.gov/...` for the HOME script. Enterprise proxies reject consumer Gmail scripts with HTTP 404 before execution.
5. **Never Request `/exec` on `@HEAD`**: The `@HEAD` deployment ID is for `/dev` only. `/exec` requires a versioned deployment ID.
6. **WORK Supports Production Only (`/exec`)**: Do NOT use or support `/dev` on the WORK script. Multi-account browser sessions trigger Google's session-cookie collision ("Sorry, unable to open the file at this time"). All active development and debugging occurs on HOME (`/dev` and `/exec`). WORK is strictly a Production deployment target (`/exec`).
