# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [ ] **Repoint WORK `/exec` to Version 127**: only `michael.hoffman@gsa.gov` can do
  this, in the WORK Apps Script IDE (Deploy → Manage deployments → Edit → select version →
  Deploy). Blocked on the user.
- [ ] **"GH Build N" prefix (Phase 27) not in WORK v127**: it sat unmerged on a worktree branch
  and was merged into `pure-gas-main` on 2026-10-01 after v127 was cut. Run `npm run push:work`
  for a new WORK version (then repoint) once v127 is confirmed.
