# Active Tasks (TODO)

## Phase 23: Task Inline Editing & Unified AI Gateway Architecture

- [x] **Inline Task Description Editing** — Completed in commit [`abdf26a`](file:///home/mike/projects/day-planner/.git/commit/abdf26a).
- [x] **Unified AI Multi-Model REST Gateway Architecture** — Completed in commit [`83aecbf`](file:///home/mike/projects/day-planner/.git/commit/83aecbf), [`486cd8a`](file:///home/mike/projects/day-planner/.git/commit/486cd8a).
  - Target endpoints: `aiService.js` directly calls **Google Gemini Free API** (`https://generativelanguage.googleapis.com/...`) at HOME, and **USAi API** at WORK.
  - Sheets `=AI(...)` microservice officially deprecated as a dead end (requires interactive user UI focus in sheet to evaluate).
  - Unified configuration: `ScriptProperties` stores `AI_ENDPOINT_URL`, `AI_API_KEY`, and `AI_MODEL` per Apps Script project deployment (HOME vs. WORK).
  - User customization: `UserProperties.AI_MODEL_OVERRIDE` allows personal selection without overriding shared script props.
  - Multi-model format support: OpenAI / USAi chat completions format, Google Gemini native format, and `x-goog-api-key` header support.
  - Models supported: Gemini 2.5 Flash Lite/Flash/Pro, Gemini 3.7 Flash, Luna, Terra, Haiku, Sonnet, Opus.
- [ ] **AI Gateway UI Wiring (WIP)**
  - Add Settings / AI Config panel: test connection, inspect configured endpoint & key status, and pick active model from dropdown.
  - Agree on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **AI Assist on WORK via Server Proxy** — Browser direct access to `gemini.google.com` is blocked by the federal network's proxy. The new unified server-side proxy (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's data centers to USAi's endpoint, bypassing the client browser proxy block! Pending deployment verification.

## Loose end (user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 116 is pushed (`npm run push:work`, prior session turn), carrying every fix live on HOME through @281/build 334 (Phase 21 cache port + pagination/grid bugs + the AI Assist noopener fix, disabled-not-hidden button state, Gemini-only). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. Note: even once repointed, the AI Assist button itself will still not work on WORK (see Open item above) — this repoint is only about picking up the other fixes.
