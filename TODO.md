# Active Tasks (TODO)

Session completed 2026-09-29 (evening): shipped the AI Assist button — a note-card toolbar button that opens the day's real Google Doc for Google's own Gemini/dictionary/spell-check tools, gated by a manual `localStorage`-backed toggle (About page) with auto-disable-on-failure, since client-side Gemini-availability detection is impossible (cross-origin). Live-verified on HOME @275/build 328: Gemini, Dictionary, and spell-check all confirmed working in a real Doc on this account (WORK not checked). Also corrected a stale/contradictory memory entry about how the dictation popup works (it runs Web Speech itself, never opens a real Doc) that had caused a mid-session misdiagnosis. See `TODO_HISTORY.md`'s 2026-09-29 (evening) entry for full detail.

No active phase queued. Next macro-task not yet identified — see the loose ends below for current follow-ups.

## Open

- [ ] **Verify Gemini-in-Docs on WORK**: confirmed working on HOME (consumer Gmail); WORK is a federal .gov Workspace and has a history of stricter org-level API Controls (see `project_gov_workspace_account_blocked` memory) — don't assume parity. Test "Ask Gemini" in a plain Google Doc on the WORK PC once v112 is live there.

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 112 is pushed (`npm run push:work`, this session), carrying every fix now live on HOME through @275/build 328 (full Phase 21 cache port + the two pagination/grid bugs + the new AI Assist button). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. **Wait for this v112 push specifically**: v108-v111 (already superseded) predate this session's work.
