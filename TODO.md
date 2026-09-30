# Active Tasks (TODO)

## Phase 24: WORK Enterprise Verification & AI Assist Refinements (Active)

- [ ] **Repoint WORK deployment to Version 122**: `michael.hoffman@gsa.gov` repoints deployment via Manage Deployments in WORK Apps Script IDE (`https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit`) to activate build 361.
- [ ] **AI Assist on WORK via Server Proxy Verification**: Browser direct access to `gemini.google.com` is blocked by the federal network's proxy. The new unified server-side proxy (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's data centers to USAi's endpoint, bypassing the client browser proxy block! Pending user verification on WORK.
- [ ] **AI Assist Context Expansion & Formatting Polish**: Support selecting specific lines or multi-card synthesis in AI Assist, and add inline markdown rendering preview for AI summaries.

