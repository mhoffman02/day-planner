# Single Source of Truth for Cross-File Constants

- When the same conceptual value (version tag, cache name, ID, URL pattern, timeout) must be known by more than one file or runtime context: MUST define it in exactly one place and have every consumer read from there.
- MUST NOT hand-copy it as a second literal kept in sync by memory or a comment.
- Not a ban on literals used once in one obvious place (a CSS `border-radius: 6px`, a local timeout constant) — those don't need extraction. The trigger is duplication across files/contexts, not "is this a bare number."

Current examples in this repo:
- The Google OAuth client ID is defined once, in `index.html` (`window.DAY_PLANNER_GOOGLE_CLIENT_ID`); `src/googleAuth.js`/`src/app.js` read it from `window` rather than hardcoding a second copy.
- `sw.js`'s `CACHE_NAME` is not hand-authored at all — `npm run build:sw` (`tools/update-sw-cache-version.js`) derives it as a content hash of the cached assets, and `build:sw:check` (pre-commit) fails the commit if it's stale. This is the generated-artifact version of the same principle: one computed source, never a second hand-typed value.

Before hardcoding a version/ID/URL/pattern literal: MUST check whether another file or runtime context (page vs. service worker, client vs. build script) needs the same value. If yes, put it in one place and have every consumer read from there.
