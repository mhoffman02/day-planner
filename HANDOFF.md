# Resume: Phase 19 — `drive.readonly` scope narrowing

**Start by:** Audit `gas-app/Code.gs` for every call site using the `drive.readonly` scope (`resolveDriveFileTitle` and any others — `grep -n "DriveApp\." gas-app/Code.gs` is the starting point) and note which Drive API calls each one actually needs. This is independent agent work — no user input needed for the audit itself.

Last session (2026-09-28) closed out Phase 18 (WORK Environment Parity): WORK is repointed to Version 91 and the user confirmed it live, carrying voice typing popup UI polish (icon/button sizing, help-icon color fix, a real fix for the help-panel expand/collapse resize bug, sans-serif body font, trimmed help copy), a notes empty-state/skeleton fix (was flashing an error-like placeholder on every page load, and had an untested dark-mode rendering bug), a Monthly Calendar today-highlight (never existed before), and a full rewrite of About.html for a non-technical office-worker audience.

- What changed — `TODO_HISTORY.md`'s 2026-09-28 entry (top one)
- Rationale/gotchas — `LEARNINGS.md`'s 2026-09-28 entry (top one, same date as a prior session's entry — two separate dated blocks)
- Still open — `TODO.md`'s Phase 19 checklist (3 items)
- **Blocker**: `TODO.md` item 2 needs the user's go-ahead on the narrowing approach before `gas-app/appsscript.json` is touched — this is a deliberate cleanup, not a bug fix, so don't proceed past the audit without asking. Item 3 (port/verify/promote) is downstream of that approval.
