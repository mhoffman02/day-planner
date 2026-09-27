# Active Tasks (TODO)

- [x] **1. Live Feature Smoke Verification (HOME @224)**: Done.
- [x] **2. Live WORK Production Smoke Verification (WORK @55)**: Done.

- [ ] **3. Startup Perf: Cache More Heavy Assets (ROI TBD)**:
  - GAS server spinup alone costs ~2-3s; rough total load is ~5s. Offline resilience is explicitly not wanted for this app.
  - [ ] Size how much of the ~5s is client-asset load (cacheable) vs. the ~2-3s GAS spinup floor (not cacheable) before committing to a caching effort.

- [x] **4. In-App STT Mic Affordance**: Built and deployed to HOME `@229` ([`AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w`](https://script.google.com/macros/s/AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w/exec)). Feature-detected `webkitSpeechRecognition`/`SpeechRecognition`, wired into note card lines and the event description field. No Win+H fallback claim anywhere — no browser API can verify OS dictation availability/policy, so the UI only asserts what it can directly test.
  - **Confirmed live on WORK PC**: mic blocked by an org-managed enterprise Chrome policy (per-origin mic allowlist that already covers `docs.google.com` but not this app's origin) — not user-fixable in Edge settings.
  - [x] **Google Doc dictation fallback** built: "Dictate in Google Doc" opens a fresh, single-purpose Doc per session (popup window) where Docs' own Voice Typing works; "Pull from Doc" (or auto-pull on popup close) reads the text back into whichever field was active. Verified end-to-end live on HOME `@232` against real Drive/Docs APIs (not mocked). Doc body is cleared on pull (not trashed — `setTrashed` needs broader-than-`drive.file` scope, never widening for this).
  - [x] **Fixed a real bug from first live WORK test**: user reported "nothing visible happened" then retries seemed stuck. Root cause: `window.open()` returning `null` (blocked by policy) was treated identically to "popup closed by user" by the auto-pull watcher, so it fired instantly and silently consumed the empty scratch doc before dictation was possible. Fixed — now surfaces a clear error with the raw doc URL when popups are fully blocked. Deployed HOME `@232`, pushed to WORK (Version 62).
  - [ ] **User re-test on WORK PC**: confirm the full "Dictate in Google Doc" fallback flow works end-to-end there now (popup or fallback-tab opens or a clear error shows, Voice Typing works in the Doc, pull-back lands the text in the right field).

- [x] **5. Lint Clean**: 0 errors, 0 warnings (was 8 no-unused-vars). Delegated to AGY, verified locally.
