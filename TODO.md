# Active Tasks (TODO)

## Phase 25: WORK Repoint & Post-Removal Verification (Active)

- [ ] **(Next) Promote Build 374 (Version History fix) to WORK**: run `npm run push:work` to create a
  new WORK version (v126+). WORK Version 125 predates commit `ecdc1d5`, so it still has the
  auto-closing Version History modal.
- [ ] **Repoint WORK `/exec` to the new version** (not 125): only `michael.hoffman@gsa.gov` can do
  this, in the WORK Apps Script IDE (Deploy → Manage deployments → Edit → select version →
  Deploy). Blocked on the user.
