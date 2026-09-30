# Active Tasks (TODO)

## Phase 23: Task Inline Editing & Unified AI Gateway Architecture

- [x] **Inline Task Description Editing** — Completed in commit [`abdf26a`](file:///home/mike/projects/day-planner/.git/commit/abdf26a).
- [x] **Unified AI Multi-Model REST Gateway Architecture** — Completed in commit [`83aecbf`](file:///home/mike/projects/day-planner/.git/commit/83aecbf).
  - Unified configuration: `ScriptProperties` stores `AI_ENDPOINT_URL`, `AI_API_KEY`, and `AI_MODEL` per Apps Script project deployment (HOME vs. WORK).
  - User customization: `UserProperties.AI_MODEL_OVERRIDE` allows personal selection without overriding shared script props.
  - Multi-model format support: OpenAI / USAi chat completions format, Google Gemini native format, and `ai-lite` format.
  - Models supported: Gemini 2.5 Flash Lite/Flash/Pro, Gemini 3.7 Flash, Luna, Terra, Haiku, Sonnet, Opus.
- [ ] **AI Gateway UI Wiring (WIP)**
  - Add Settings / AI Config panel: test connection, inspect configured endpoint & key status, and pick active model from dropdown.
  - Agree on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **AI Assist doesn't work on WORK** — `gemini.google.com` is blocked by the federal network's proxy ("you don't have permission to visit this site"). A Docs-popup fallback was tried and rejected (can't isolate just the AI sidebar from Google's own document chrome — cross-origin, confirmed impossible). No approach identified yet that meets the UX bar; needs user direction before attempting anything else here. Do not attempt a fix without asking first.

## Loose end (user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 116 is pushed (`npm run push:work`, prior session turn), carrying every fix live on HOME through @281/build 334 (Phase 21 cache port + pagination/grid bugs + the AI Assist noopener fix, disabled-not-hidden button state, Gemini-only). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. Note: even once repointed, the AI Assist button itself will still not work on WORK (see Open item above) — this repoint is only about picking up the other fixes.
