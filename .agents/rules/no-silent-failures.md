# No Silent Failures — Fail Loud

- When code detects something wrong (a rejected write, an unexpected value, a violated assumption): MUST surface it — throw, or return an explicit error object the caller must check.
- MUST NOT swallow it and continue as if nothing happened.

Prohibited:
```javascript
try {
  await risky();
} catch (e) {
  // ignored
}

if (!isValid(value)) {
  console.warn('value looks wrong, proceeding anyway');
}
return process(value);
```

Required — `src/*.js` has no server runtime, so throw with context rather than returning a sentinel a caller might not check:
```javascript
throw new Error(`Drive file update failed (${res.status} ${res.statusText}): ${fileId}`);
```

Warn-and-continue is acceptable only when the correction is unambiguous and the warning is impossible to miss — not a `console.warn` buried in scroll-heavy output. When in doubt, throw.
