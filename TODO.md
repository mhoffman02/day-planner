# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [ ] **Cut WORK Version 128 via `npm run push:work`**: v127 (pushed at `215c3cf`) predates the
  Sts status-menu fix (`8599a3d`) and the "GH Build N" prefix merge (`b7b0029`, Build 378). HOME
  already has both (`@294`). Agent can do this.
- [ ] **Repoint WORK `/exec` to Version 128** (supersedes the pending v127 repoint): only
  `michael.hoffman@gsa.gov` can do this, in the WORK Apps Script IDE (Deploy → Manage
  deployments → Edit → select version → Deploy). Blocked on the user.
