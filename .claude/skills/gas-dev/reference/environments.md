# HOME and WORK endpoints

The rules for these live in `.agents/rules/gas-environments.md`. This file holds the IDs and URLs.

## HOME (`day-planner-home`)
- **Script ID**: `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`
- **Owner Account**: `mhoffman02@gmail.com` (Consumer Gmail)
- **Active clasp Target**: `gas-app/.clasp.json` `"scriptId": "1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W"`
- **Dev Endpoint (`@HEAD`)**: `https://script.google.com/u/1/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev` (or `/u/0/` if primary)
- **Dev Self-Test**: `https://script.google.com/u/1/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test`
- **Production Endpoint (deployment "Day Planner v1")**: `https://script.google.com/macros/s/AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA/exec`
- **Active Deployment ID**: `AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA` (@327 on 2026-10-16, deployment named "Day Planner v1"; the prior `...FS4w`-ending deployment was archived/removed 2026-09-27 outside this session, discovered when it started 404ing)
- **Production Self-Test**: `https://script.google.com/macros/s/AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA/exec?view=self-test`
- **Script IDE**: `https://script.google.com/u/1/home/projects/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit` (or `/settings`)

## WORK (`day-planner-work`)
- **Script ID**: `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`
- **Owner Account**: `michael.hoffman@gsa.gov` (Enterprise GSA Workspace)
- **Dev Endpoint (`@HEAD`)**: `https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev` (not supported, see rule 6)
- **Production Endpoint**: `https://script.google.com/a/macros/gsa.gov/s/AKfycbzDYvr-YAgJ9pwHHcC7O5jj_gThdr1kc13qy_B_MB0-ohY7SjfAm3osXcXtBOZ428Sh/exec`
- **Active Deployment ID**: `AKfycbzDYvr-YAgJ9pwHHcC7O5jj_gThdr1kc13qy_B_MB0-ohY7SjfAm3osXcXtBOZ428Sh` (deployment named "Day Planner v1"; deployment the user set up 2026-10-12; the earlier `BhslA`-ending deployment now 404s)
- **Script IDE**: `https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit`
