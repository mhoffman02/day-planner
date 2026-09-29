# Active Tasks (TODO)

## Phase 23: Task Inline Editing & AI Microservice Verification

- [ ] **Today page, Tasks panel: click-to-edit task Description**
  - **Goal**: Allow users to click a task's title/description to edit it inline, matching the Daily Notes panel note-card UX (click a line to edit it in place, Enter/blur to save).
  - **Files**: [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L1600-L1750), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L3100-L3250), [`index.html`](file:///home/mike/projects/day-planner/index.html#L450-L550), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L450-L550).
  - **Implementation**:
    1. Define inline editing state (`editingTaskId`, `editingTaskTitle`) in Alpine data model.
    2. When clicking description text, swap text span with an input styled seamlessly in Franklin aesthetic (no jarring box, matching font/size).
    3. On Enter or blur, call `updateTaskTitle(task.id, newTitle)` and trigger save/sync. On Escape, cancel.
    4. Ensure lockstep across `src/` and `gas-app/`.

- [ ] **AI Microservice Verification & UI Wiring (WIP)**
  - **Goal**: Complete testing of `ai-microservice` on HOME/WORK and connect live Web App endpoint to Day Planner.
  - **Status**: Backend proxy connector and client library are in place ([`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2930)). Microservice deployed to HOME sheet (`1kW7_HpM7aoPInpcgDO7i8Rv6hNvFU8rtL1CaJIO5BXK9685TyZ3gtWUN`).
  - **Next Steps**:
    1. Await user confirmation of in-sheet tests and Web App deployment URL + API Key.
    2. Add Settings modal or folder setup entry to test connection and save URL/key to `UserProperties`.
    3. Agree with user on UI touchpoints (e.g. Note Card AI Assist action menu: summarize, extract tasks, refine tone).

## Open

- [ ] **AI Assist doesn't work on WORK** — `gemini.google.com` is blocked by the federal network's proxy ("you don't have permission to visit this site"). A Docs-popup fallback was tried and rejected (can't isolate just the AI sidebar from Google's own document chrome — cross-origin, confirmed impossible). No approach identified yet that meets the UX bar; needs user direction before attempting anything else here. Do not attempt a fix without asking first.

## Loose end (user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 116 is pushed (`npm run push:work`, prior session turn), carrying every fix live on HOME through @281/build 334 (Phase 21 cache port + pagination/grid bugs + the AI Assist noopener fix, disabled-not-hidden button state, Gemini-only). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. Note: even once repointed, the AI Assist button itself will still not work on WORK (see Open item above) — this repoint is only about picking up the other fixes.
