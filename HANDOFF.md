# Resume: WORK repoint pending; AI Assist/Thesaurus removal is done and live on HOME

**Start by:** Ask the user whether `michael.hoffman@gsa.gov` has repointed the WORK `/exec`
deployment to Version 123 yet, and whether the Notes Version History button worked after a hard
refresh. Both are in `TODO.md` Phase 25 and blocked on the user — there is no independent agent
work queued right now.

This session removed AI Assist and Thesaurus/Dictionary entirely (user's low-ROI call, not a
disable) across the client, GAS backend, and CSS in both the local-preview and `gas-app/` copies,
fixed a real bug where editing an existing task hid its notes, and promoted the result from HOME
to WORK. HOME is live and user-confirmed passing (`@288`, Build 365). WORK has Version 123 pushed
but not yet pointed to by the live deployment — that step requires the WORK-domain account.

- What changed — `TODO_HISTORY.md`'s "2026-09-30 (evening)" entry (full detail + commit SHAs)
- Archived phase — `PLAN-HISTORY.md`'s "Phase 24: AI Assist & Thesaurus Removed — Low ROI"
- Still open — `TODO.md` Phase 25 (2 items, both user-blocked — repoint WORK, confirm Time Machine)
- Gotcha for next session — `LEARNINGS.md`'s 2026-09-30 entry: any future `src/app.js` structural
  removal needs the identical symbol list grepped in `gas-app/Script.html` *before* calling it
  done, not caught later by live testing. This repo has two parallel copies of the whole client
  (local-preview `src/`+`index.html`, and `gas-app/` for GAS) that must be kept in lockstep by
  hand — there is no build step that enforces it.
