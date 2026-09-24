# Google Apps Script Dual Environment Isolation (HOME vs WORK)

Day Planner has two separate Google Apps Script deployments running under different Google Workspace accounts. They must NEVER be mixed up, cross-deployed, or conflated.

---

## 1. Environment Reference

### HOME Environment (`day-planner-home`)
- **Script ID**: `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`
- **Owner Account**: `mhoffman02@gmail.com` (Consumer Gmail)
- **Active clasp Target**: `gas-app/.clasp.json` `"scriptId": "1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W"`
- **Dev Endpoint (`@HEAD`)**: `https://script.google.com/u/1/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev` (or `/u/0/` if primary)
- **Dev Self-Test**: `https://script.google.com/u/1/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test`
- **Production Endpoint (`day-planner-v01`)**: `https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec`
- **Production Self-Test**: `https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test`
- **Script IDE**: `https://script.google.com/u/1/home/projects/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit` (or `/settings`)

### WORK Environment (`day-planner-work`)
- **Script ID**: `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`
- **Owner Account**: `michael.hoffman@gsa.gov` (Enterprise GSA Workspace)
- **Dev Endpoint (`@HEAD`)**: `https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev`
- **Production Endpoint**: `https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`
- **Script IDE**: `https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit`

---

## 2. Strict Invariants

1. **Active Focus & Mastercopy**: Current active development target is **HOME** (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`), configured in `gas-app/.clasp.json`.
2. **Never Swap clasp target implicitly**: Never modify `gas-app/.clasp.json` to the WORK script ID. Keep HOME permanently configured there.
3. **Promotion Workflow (HOME -> WORK)**:
   - HOME is the MASTERCOPY (`gas-app/.clasp.json`).
   - Pushing vetted code to WORK is executed via `npm run push:work`.
   - `npm run push:work` targets `gas-app/.clasp-work.json` without modifying `.clasp.json`.
   - Google Apps Script enforces that only users in the script owner's domain (`gsa.gov`) can publish/redeploy Web App versions (`Only users in the same domain as the script owner may deploy this script`). Therefore, while code push and version creation can be done via shared editor (`mhoffman02@gmail.com`), pointing the production `/exec` deployment to the latest version must be confirmed in the Apps Script IDE under `michael.hoffman@gsa.gov` (Deploy > Manage deployments > Edit > Version > Deploy).
4. **Never Route HOME through GSA Proxy**: NEVER use `/a/macros/gsa.gov/...` for the HOME script. Enterprise proxies reject consumer Gmail scripts with HTTP 404 before execution.
5. **Never Request `/exec` on `@HEAD`**: The `@HEAD` deployment ID is for `/dev` only. `/exec` requires a versioned deployment ID.
