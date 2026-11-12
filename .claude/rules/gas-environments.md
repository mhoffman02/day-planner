# GAS Environments: HOME vs WORK (never mix)

- **HOME** `day-planner-home`: script `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`, consumer Gmail, `gas-app/.clasp.json`. `/dev` and `/exec`. Mastercopy and all dev/debug.
- **WORK** `day-planner-work`: script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`, GSA Workspace (`gsa.gov`), `gas-app/.clasp-work.json`. `/exec` only: no `/dev` (multi-account cookie collision).
- URLs, deployment IDs, self-test, IDE links: `.agents/skills/gas-dev/reference/environments.md`. Read before opening, probing or deploying either.

## Invariants
1. Every gas-app push updates "Day Planner v1" on both: after commit, `npm run deploy:home` (pushes @HEAD, loads `/dev` over CDP, moves "Day Planner v1" only if the app initializes; never bare `clasp deploy`); only after it passes, `npm run push:work` (creates a version labelled "Day Planner v1").
2. Never point `gas-app/.clasp.json` at WORK; HOME stays there. `push:work` targets `.clasp-work.json`.
3. Repointing WORK `/exec` to the new version needs the script owner's domain: only `michael.hoffman@gsa.gov` can (IDE: Deploy > Manage deployments > Edit > Version > Deploy). Editor `mhoffman02@gmail.com` can push code and create versions only.
4. Never route HOME through `/a/macros/gsa.gov/...` (proxy 404s consumer scripts).
5. Never request `/exec` on the `@HEAD` deployment ID; it is `/dev` only. `/exec` needs a versioned ID.
