# Active Tasks (TODO)

## Phase 23: Direct AI Gateway UI Wiring (In Progress)

- [ ] **AI Gateway Settings UI & Model Selection Wiring**
  - Add Settings / AI Config panel: test connection, inspect configured endpoint & key status, and pick active model from dropdown.
  - Wire Alpine state to bridge `testAiMicroservice()` and `setAiUserSelectedModel()`.
  - Agree on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **Repoint WORK deployment to Version 120**: `michael.hoffman@gsa.gov` repoints deployment via Manage Deployments in WORK Apps Script IDE (`https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit`) to carry build 358 (inline task notes delimiter, fixed-position status menu clipping fix, Time Machine, and updated About guide).
- [ ] **AI Assist on WORK via Server Proxy Verification** — Browser direct access to `gemini.google.com` is blocked by the federal network's proxy. The new unified server-side proxy (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's data centers to USAi's endpoint, bypassing the client browser proxy block! Pending user verification on WORK.
