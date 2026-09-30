# Active Tasks (TODO)

## Phase 23: Direct AI Gateway UI Wiring (In Progress)

- [ ] **AI Gateway Settings UI & Model Selection Wiring**
  - Add Settings / AI Config panel: test connection, inspect configured endpoint & key status, and pick active model from dropdown.
  - Wire Alpine state to bridge `testAiMicroservice()` and `setAiUserSelectedModel()`.
  - Agree on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **AI Assist on WORK via Server Proxy** — Browser direct access to `gemini.google.com` is blocked by the federal network's proxy. The new unified server-side proxy (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's data centers to USAi's endpoint, bypassing the client browser proxy block! Pending deployment verification.

## Loose end (user-blocked)

- [x] **WORK deployment repointed to Version 118**: Repointed by `michael.hoffman@gsa.gov` via Manage deployments. Carrying all Phase 21-23 features (inline task description editing, deep archive fullText search, time-machine notes restore, lexicon popover, and unified AI REST gateway connector).
