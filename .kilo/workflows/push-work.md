---
description: Promote vetted Day Planner code from HOME mastercopy to Federal GSA WORK environment
---

Run `npm run push:work` to execute pre-flight quality gates (lint + tests) and promote the codebase to the Federal GSA Apps Script project (`Day-Planner-WORK`, Script ID `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`) without modifying the primary HOME clasp configuration. After the push it pulls WORK back and compares `BUILD_NUMBER_`; a mismatch fails the run (close any open WORK IDE tab, then re-run). Report the new version number so the user can repoint.
