# Active Tasks (TODO)

- [ ] **1. WORK dictation popup test**: same-origin popup mic path (built and confirmed on HOME this session) needs testing on WORK (Chrome) — if WORK's org mic allowlist covers this app's `googleusercontent.com` sandbox origin the popup dictation will work directly; if not, it should gracefully fall back to the "Open Dictation Doc" link exactly as before. Don't assume either outcome — test it directly. Note: Google Docs' own Voice Typing works in Chrome but not Edge on WORK, so the doc-link fallback needs Chrome specifically there.

- [ ] **2. WORK scope-narrowing promotion**: the broad `documents` OAuth scope was dropped and ported to the Docs Advanced Service under `drive.file` on HOME this session (verified live, deployed to pinned prod `@240`). Code is pushed to WORK as Version 66 but not live yet. Needs, in order:
  1. Add "Google Docs API" as a Service via the WORK Apps Script IDE's Services (+) button (a manifest entry via `clasp push` alone does NOT enable the underlying Cloud API).
  2. User revokes/re-consents under `michael.hoffman@gsa.gov` so the test reflects the real narrowed grant, not a stale cached one.
  3. `michael.hoffman@gsa.gov` repoints the live deployment (ends `...BhslA`) to Version 66 in the IDE.
  4. Re-run a save/reload check on WORK to confirm notes persist correctly with no duplicate monthly doc.
  - **Important**: don't leave the Apps Script IDE editor tab open in a browser while pushing via `clasp` for this — an open stale tab's autosave silently overwrote both the scope narrowing and a self-test probe once already this session.

- [ ] **3. `drive.readonly` scope** ("See and download all your Google Drive files") still remains in the manifest, used for resolving pasted Drive link titles — a separate, smaller narrowing question if the user wants it gone too. Not addressed this session.
