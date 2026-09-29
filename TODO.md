# Active Tasks (TODO)

Session completed 2026-09-29 (evening, cont.): the AI Assist button shipped earlier this session had a real bug — `window.open(url, '_blank', 'noopener,...')` always returns `null` per spec once `noopener` is set, so the button auto-disabled itself on every real click (this is what the user hit testing on WORK build 328). Fixed the mechanics, and separately redesigned the feature after live user feedback: opening the day's Google Doc was a disruptive full-tab context switch, and a smaller popup didn't help — live-verified via CDP screenshot that Docs' own chrome (document-tabs list, toolbar) doesn't collapse at 480px width and overlaps the Gemini panel. Switched the button to open `gemini.google.com/app` instead (confirmed clean at the same size), copying the active note card's text to the clipboard first so the user can paste it in. This drops native Docs dictionary/spell-check integration — About page text updated to say so. See `TODO_HISTORY.md`'s 2026-09-29 (evening) entry for full detail.

No active phase queued. Next macro-task not yet identified — see Open/Loose ends below for current follow-ups.

## Open

- [ ] **Today page, Tasks panel: click-to-edit task Description** — user wants to click a task's Description to edit it inline, matching the Daily Notes panel's note-card body UX (click a line to edit it in place). Evaluate click-to-edit UX patterns before building (not yet scoped/designed).

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 115 is pushed (`npm run push:work`, this session), carrying every fix now live on HOME through @277/build 332 (Phase 21 cache port + pagination/grid bugs + the AI Assist button, now pointed at gemini.google.com instead of the Doc). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. **Wait for this v115 push specifically**: v108-v114 (already superseded) predate this session's fixes.
