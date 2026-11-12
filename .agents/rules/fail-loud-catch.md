# Fail Loud: Every Catch Rethrows or Logs Its Stack

User: "Code like a professional, defensive SWE. Force fails. TDD. Fail loud. NEVER fail silent! console.error error.stack and save error.msg for end-users only."

- No bare `catch {}`; bind `catch (err)`.
- Every catch directly rethrows, or `console.error`s a context string + `err.stack` (a log in a nested callback does not count). Approved loggers: `logError(context, err)` (Code.gs), `failFrom_(err)` (HubController.gs), `logSafe_`/`DPQueue.logSafe` (QueueProcessor.gs). `console.warn`/`logWarn` is not enough.
- Context string: what failed + what fallback runs next.
- Users see `err.message` only, never the stack.
- Never fail open: if an auth/ownership check throws, fail closed and tell the user (see `driveFolderAccess_`, `gas-app/Code.gs`).
- Detected a rejected write, bad value or broken assumption: throw (or return an error object the caller must check). Never warn and continue.
- Bug fix starts red: [[test-before-fix]].

Enforced: `npm run check:catches` (in `npm run lint` and pre-commit).
**Why:** silent catches hid two bugs (2026-10-09): hub never got the user email; Drive folder-owner check bound any "Day Planner" folder.
