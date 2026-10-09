# Fail Loud: Every Catch Rethrows or Logs Its Stack

User's words: "Code like a professional, defensive SWE. Force fails. TDD. Fail loud. NEVER fail silent!
console.error error.stack and save error.msg for end-users only."

- MUST NOT write a bare `catch {}`. Always bind the error: `catch (err)`.
- Every catch MUST either rethrow (`throw` directly in the catch body) or `console.error` a context string
  plus `err.stack` (directly in the catch body; a log inside a nested callback does not count).
  Approved stack loggers: `logError(context, err)` (Code.gs), `failFrom_(err)` (HubController.gs),
  `logSafe_`/`DPQueue.logSafe(context, err)` (QueueProcessor.gs; logs sanitized message + stack frames).
- `console.warn` / `logWarn` is not enough inside a catch. Use `console.error`.
- The context string says what failed and what fallback happens next.
- End users see `err.message` (or a friendly message) only. Never put the stack in UI text.
- A catch must never fail OPEN: do not assume success, ownership or authorization when the check
  itself threw. Fail closed and tell the user (see `driveFolderAccess_` in `gas-app/Code.gs`).
- TDD: a bug fix starts with a red test (see [[test-before-fix]]); see also [[no-silent-failures]].

Enforced by `node tools/check-catch-logging.js` (`npm run check:catches`), which runs inside
`npm run lint` and therefore in the `.githooks/pre-commit` hook. It scans `gas-app/*.gs`, `<script>`
blocks in `gas-app/*.html`, and `src/**/*.js` (Engines.gs is checked at its `src/integration` source).

**Why:** silent catches hid two real bugs on 2026-10-09: the hub never got the user email, and the Drive
folder-owner check bound any "Day Planner" folder because `Session.getActiveUser()` always threw.
