# No Silent Failures — Fail Loud, Don't Swallow Errors

## The rule

When code detects something is wrong — a rejected write, an unexpected value, a
violated assumption — surface it loudly (throw, or return an explicit error object the
caller must check), never swallow it and continue as if nothing happened.

`gas-app/Code.gs`'s `logError(context, err)` is the project's existing pattern for this:
it logs the full error + stack via `console.error` and returns a structured
`{success: false, error, stack, context}` payload instead of returning `null`/`undefined`
or letting a bare `catch {}` drop the error. Follow that shape for new server-side error
paths — log with context, return something the caller can check, never `catch (e) {}`.

## Prohibited patterns

```javascript
// NEVER — swallowed catch, caller has no idea anything failed
try {
  await risky();
} catch (e) {
  // ignored
}

// NEVER — warning next to code that proceeds anyway
if (!isValid(value)) {
  console.warn('value looks wrong, proceeding anyway');
}
return process(value);
```

## Required pattern

```javascript
// Server-side (gas-app/Code.gs) — use the existing logError() helper
try {
  return doTheThing();
} catch (err) {
  return logError('doTheThing', err);
}
```

For `src/*.js` engines (pure functions, no GAS runtime), prefer throwing on genuinely
invalid input over returning a sentinel value the caller might not check.

## When a warn-and-continue is acceptable

Only when the correction is unambiguous and the warning is impossible to miss (not a
`console.warn` buried in scroll-heavy output), and throwing would break a legitimate
caller with no way to know about the anomaly in advance. When in doubt, throw — this is
a small solo-maintained tool, not a production service where a hard failure has an
outsized cost.
