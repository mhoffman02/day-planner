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

1. **Active Focus**: Current active development target is **HOME** (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`).
2. **Never Swap clasp target implicitly**: Never change `gas-app/.clasp.json` to the WORK script ID unless explicitly requested by the user.
3. **Never Route HOME through GSA Proxy**: NEVER use `/a/macros/gsa.gov/...` for the HOME script. Enterprise proxies reject consumer Gmail scripts with HTTP 404 before execution.
4. **Never Request `/exec` on `@HEAD`**: The `@HEAD` deployment ID is for `/dev` only. `/exec` requires a versioned deployment ID.
5. **Clasp Authentication Guard**: Check `~/.clasprc.json` before deploying. If authenticated as `michael.hoffman@gsa.gov`, deploying to HOME requires either sharing the HOME project as Editor with `michael.hoffman@gsa.gov` or re-authenticating clasp via `clasp login` as `mhoffman02@gmail.com`.
