# Active Tasks (TODO)

- [x] **1. Live Feature Smoke Verification (HOME @224)**: Done.
- [x] **2. Live WORK Production Smoke Verification (WORK @55)**: Done.

- [ ] **3. Startup Perf: Cache More Heavy Assets (ROI TBD)**:
  - GAS server spinup alone costs ~2-3s; rough total load is ~5s. Offline resilience is explicitly not wanted for this app.
  - [ ] Size how much of the ~5s is client-asset load (cacheable) vs. the ~2-3s GAS spinup floor (not cacheable) before committing to a caching effort.

- [x] **4. In-App STT Mic Affordance**: Built and deployed to HOME `@234` ([`AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA`](https://script.google.com/macros/s/AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA/exec) — HOME's deployment ID changed mid-session, see [[.agents/rules/gas-environments.md]]). Feature-detected `webkitSpeechRecognition`/`SpeechRecognition`, wired into note card lines and the event description field. No Win+H fallback claim anywhere — no browser API can verify OS dictation availability/policy.
  - **Confirmed live on WORK PC**: mic blocked by an org-managed enterprise Chrome policy (per-origin mic allowlist that already covers `docs.google.com` but not this app's origin) — not user-fixable in Edge settings.
  - [x] **Google Doc dictation fallback, v2 (link-based, not popup-based)**: auto-creates a scratch doc the moment mic access fails, and renders its URL as a real clickable `<a target="_blank">` link in the app — not a programmatic `window.open()` popup. Two real problems drove this redesign: (1) confirmed live that Google Docs sends a CSP `frame-ancestors` header scoped to its own origin, so **iframing it is impossible**, ruling out the in-app-overlay idea; (2) `window.open()` without explicit features opens as a background tab, not a new OS window, so alt-tabbing never found it — combined with popups being blocked outright on WORK, this produced "nothing visible happened."
  - [x] Verified end-to-end live on HOME `@234` against real Drive/Docs APIs (not mocked): create → pull → body-clear all confirmed. Pushed to WORK (Version 63).
  - [ ] **User re-test on WORK PC**: confirm the mic-blocked flow now shows a clickable "Open Dictation Doc" link (auto-created, no extra click needed) instead of a popup, and that pulling the dictated text back works.

- [x] **5. Lint Clean**: 0 errors, 0 warnings (was 8 no-unused-vars). Delegated to AGY, verified locally.
