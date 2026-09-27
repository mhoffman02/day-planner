# Active Tasks (TODO)

- [x] **1. Live Feature Smoke Verification (HOME @224)**: Done.
- [x] **2. Live WORK Production Smoke Verification (WORK @55)**: Done.

- [ ] **3. Startup Perf: Cache More Heavy Assets (ROI TBD)**:
  - GAS server spinup alone costs ~2-3s; rough total load is ~5s. Offline resilience is explicitly not wanted for this app.
  - [ ] Size how much of the ~5s is client-asset load (cacheable) vs. the ~2-3s GAS spinup floor (not cacheable) before committing to a caching effort.

- [x] **4. In-App STT Mic Affordance**: Built and deployed to HOME `@225` ([`AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w`](https://script.google.com/macros/s/AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w/exec)). Feature-detected `webkitSpeechRecognition`/`SpeechRecognition`, wired into note card lines and the event description field. No Win+H fallback claim anywhere — no browser API can verify OS dictation availability/policy, so the UI only asserts what it can directly test.
  - [x] Code pushed to WORK script; user redeployed "Day Planner" deployment to Version 59 in the IDE (archived the old `9csO`/"Untitled" deployment — new active deployment ID recorded in `.agents/rules/gas-environments.md`).
  - [ ] **User test on WORK PC**: confirm whether the browser's speech API network call reaches Google's speech service through the gsa.gov firewall, or surfaces the "network blocked" error hint.

- [x] **5. Lint Clean**: 0 errors, 0 warnings (was 8 no-unused-vars). Delegated to AGY, verified locally.
