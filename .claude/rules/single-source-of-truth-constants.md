# Single Source of Truth for Cross-File Constants

- When the same conceptual value (version tag, cache name, ID, URL pattern, timeout) must be known by more than one file or runtime context: MUST define it in exactly one place and have every consumer read from there.
- MUST NOT hand-copy it as a second literal kept in sync by memory or a comment.
- Not a ban on literals used once in one obvious place (a CSS `border-radius: 6px`, a local timeout constant) — those don't need extraction. The trigger is duplication across files/contexts, not "is this a bare number."

Current examples in this repo:
- Google Workspace scopes and settings are defined once in `gas-app/appsscript.json`; server code relies directly on Apps Script runtime services (`CalendarApp`, `Tasks`, `DriveApp`).
- Core business logic constants (priority groups, task statuses, hour grid boundaries) are defined once in `src/taskEngine.js` and `src/calendarEngine.js` and shared by the UI and test suites.

Before hardcoding a version/ID/URL/pattern literal: MUST check whether another file or runtime context (client vs. server, UI vs. engine) needs the same value. If yes, put it in one place and have every consumer read from there.
