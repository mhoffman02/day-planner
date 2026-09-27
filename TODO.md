# Active Tasks (TODO)

- [x] **1. Live Feature Smoke Verification (HOME @224)**: Done.
- [x] **2. Live WORK Production Smoke Verification (WORK @55)**: Done.

- [x] **3. Startup Perf: Cache More Heavy Assets — sized, NO-GO**:
  - Measured live via CDP against production `/exec` (3 fresh reloads): `responseStart` (GAS server spinup, pure server-side, zero client control) = 3.2-3.7s. `loadEventEnd` (full page) = 4.6-5.8s.
  - Breakdown of the delta after `responseStart`: ~1.8s is `userCodeAppPanel` — the actual app payload (`Index.html` + inlined `Styles.html`/`Script.html`, ~380KB combined source) — plus ~0.3-0.6s of Google's own warden/sandbox iframe handshake (uncontrollable).
  - **Verdict: NO-GO.** GAS spinup + Google's sandbox overhead is ~65-75% of total load and structurally uncacheable no matter what we do client-side. The remaining ~1.8s isn't separately cacheable today either — `Styles.html`/`Script.html` are inlined via `<?!= include(...) ?>` directly into each fresh `doGet` response, not served as standalone files a browser could cache across loads; enabling real caching would mean restructuring how those are served (separate cacheable routes with headers GAS's `HtmlService`/`ContentService` doesn't cleanly expose), a nontrivial architecture change for a capped ~1.8s ceiling. Not worth it given offline resilience is explicitly out of scope.

- [x] **4. In-App STT Mic Affordance**: Built and deployed to HOME `@234` ([`AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA`](https://script.google.com/macros/s/AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA/exec) — HOME's deployment ID changed mid-session, see [[.agents/rules/gas-environments.md]]). Feature-detected `webkitSpeechRecognition`/`SpeechRecognition`, wired into note card lines and the event description field. No Win+H fallback claim anywhere — no browser API can verify OS dictation availability/policy.
  - **Confirmed live on WORK PC**: mic blocked by an org-managed enterprise Chrome policy (per-origin mic allowlist that already covers `docs.google.com` but not this app's origin) — not user-fixable in Edge settings.
  - [x] **Google Doc dictation fallback, v2 (link-based, not popup-based)**: auto-creates a scratch doc the moment mic access fails, and renders its URL as a real clickable `<a target="_blank">` link in the app — not a programmatic `window.open()` popup. Two real problems drove this redesign: (1) confirmed live that Google Docs sends a CSP `frame-ancestors` header scoped to its own origin, so **iframing it is impossible**, ruling out the in-app-overlay idea; (2) `window.open()` without explicit features opens as a background tab, not a new OS window, so alt-tabbing never found it — combined with popups being blocked outright on WORK, this produced "nothing visible happened."
  - [x] Verified end-to-end live on HOME `@234` against real Drive/Docs APIs (not mocked): create → pull → body-clear all confirmed. Pushed to WORK (Version 63).
  - [ ] **User re-test on WORK PC**: confirm the mic-blocked flow now shows a clickable "Open Dictation Doc" link (auto-created, no extra click needed) instead of a popup, and that pulling the dictated text back works.

- [x] **5. Lint Clean**: 0 errors, 0 warnings (was 8 no-unused-vars). Delegated to AGY, verified locally.
