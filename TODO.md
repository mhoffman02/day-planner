# Active Tasks (TODO)

## Phase 23: Direct AI Gateway UI Wiring (In Progress)

- [ ] **AI Gateway Settings UI & Model Selection Wiring**
  - Add Settings / AI Config panel: test connection, inspect configured endpoint & key status, and pick active model from dropdown.
  - Wire Alpine state to bridge `testAiMicroservice()` and `setAiUserSelectedModel()`.
  - Agree on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **AI Assist on WORK via Server Proxy** — Browser direct access to `gemini.google.com` is blocked by the federal network's proxy. The new unified server-side proxy (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's data centers to USAi's endpoint, bypassing the client browser proxy block! Pending deployment verification.

## Loose end (user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 116 is pushed (`npm run push:work`, prior session turn), carrying every fix live on HOME through @281/build 334 (Phase 21 cache port + pagination/grid bugs + the AI Assist noopener fix, disabled-not-hidden button state, Gemini-only). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. Note: even once repointed, the AI Assist button itself will still not work on WORK (see Open item above) — this repoint is only about picking up the other fixes.
