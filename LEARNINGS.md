# Learnings

## 2026-09-28 — Voice Typing Popup: Live WORK Iteration, GAS HtmlService Quirks, Reverted Regression

**Worked well:**
- Tight live-test loop on the actual WORK (federal, network-restricted) machine surfaced real bugs a HOME-only test pass wouldn't have caught: silent misattribution on same-line no-focus click, phrase duplication in the ASR handler, and a mic-access regression from a `blob:` URL popup-navigation experiment.
- Diagnosing dark-mode contrast and navbar-button drift down to a single shared root cause each time (one CSS variable, one set of duplicate overrides) rather than patching every affected component individually kept the fixes small and durable.
- Renaming the feature to "Voice typing" and mirroring Google Docs' own minimal popup chrome (per the new [[feedback_google_material_design_alignment]] memory) landed cleanly once the no-pills/circular-button tension was resolved by asking instead of guessing.

**Needs improvement:**
- The `blob:` URL popup-navigation change was pushed to WORK without first confirming mic access still worked there — it broke `SpeechRecognition`/`getUserMedia` entirely and had to be reverted. A same-origin-context change touching Permissions Policy behavior should get a live WORK mic check before promotion, not just a lint/test pass.
- Forgot to re-run `npm run stamp-build` across an entire session of deploys (stale "Build 253" for ~30+ commits) before the pre-commit auto-stamp hook was added — the hook removes this failure mode going forward.

---

## 2026-08-16 — 3-Column Workspace Layout & Modular Franklin Note Cards with Google Docs Menu

**Worked well:**
- Interactive clarification questions guided optimal UX design
- Modular Topic Cards in Column 3 with expand/collapse twisties & Google Chat toolbar
- 3-column responsive layout for PC Large screen with auto-height and vertical scroll
- 12 monthly Google Docs sync architecture with print-friendly formatting
- Custom Planner menu and cross-month search sidebar in Google Docs

**Needs improvement:**
- Future enhancement: complete continuous doc accordion parsing for Option 2 mode

---

## 2026-08-16 — Header Consolidation, Resizable 3-Column Layout & Dual-Mode Appointment Modal

**Worked well:**
- G.A.S. idiomatic doGet() methods (setTitle, setFaviconUrl, addMetaTag) implemented and verified
- Left-Right resizable 3-column layout added with drag splitters, percentage math, double-click reset, and localStorage persistence
- 3 header rows consolidated into 1 ultra-compact top bar (~50px height), reclaiming ~130px of vertical space (~70% reduction in header height)
- Added round (+) button to Appointment column with dual-mode modal (inline quick add + native pre-filled gCal popup window)
- All 30 unit tests passing cleanly and changes deployed via clasp push

**Needs improvement:**
- Ensure mobile breakpoints cleanly hide drag handles to prevent accidental touch resize triggers on phone screens

---

## 2026-09-22 — Phase 2: Decommission GitHub Pages & Service Worker files

**Worked well:**
- Pruned untracked gh-pwa-shell and cleaned .gitignore
- Decommissioned stale GIS OAuth and SW references across .agents/ rules
- Synced .claude/ and .kilo/ mirrors cleanly via sync-agent-config.js
- Fixed unclosed event dialog tags in Index.html and gas-app/Index.html
- 30/30 baseline tests pass

**Needs improvement:**
- Run linter and fix code as immediate next step before Phase 3

---

## 2026-09-27 — STT Dictation Fallback, Build Number, PLAN/TODO Tracker Split

**Worked well:**
- Live-tested assumptions before building: confirmed Google Docs' CSP `frame-ancestors` blocks iframing and that `window.open()` opens a background tab, not a new window — caught before shipping a second broken popup-based dictation flow, not after.
- Split `PLAN.md` into a lean roadmap + `PLAN-HISTORY.md` archive (mirroring the existing `TODO.md`/`TODO_HISTORY.md` pattern), and wired the archiving into both the handoff skill (session end) and CLAUDE.md's session-startup rule (self-heal if a prior session skipped `/handoff`).
- Caught 24 unpushed commits sitting on `pure-gas-main` from a prior session that never pushed; reviewed the diffstat for anything sensitive before pushing.

**Needs improvement:**
- A session ended (commit `75411ab`) without running `/handoff`, which is exactly the staleness this skill exists to prevent — the new self-heal rule in CLAUDE.md should catch this going forward, but confirm it actually fires next time a session starts cold.

## 2026-09-28 — Dictation Popup Workaround & `documents` OAuth Scope Removal

**Worked well:**
- Live CDP probing settled two architecture questions with real evidence instead of guesses: confirmed the app's own iframe blocks mic access via Permissions Policy (not fixable), then confirmed a same-origin popup escapes that restriction before writing any UI code.
- User's own suggestion ("follow Google Docs' Voice Typing popup UI") turned out to be the right fix once probed — worth taking a user's UX instinct seriously and testing it rather than defaulting to the existing fallback design.
- For the `documents` OAuth scope removal, added a real regression test (self-test Test 7) against the actual `saveDailyDocCards`/`getOrCreateDailyDocContent` before trusting the refactor — this caught a genuine paragraph-style-inheritance bug live that would have silently corrupted saved notes (a bulleted line dropped on read after a day-section replace). The existing `tests/gasDocIdempotency.test.js` node suite never touches `Code.gs` at all, so it gave zero coverage for this change.
- Spiked the risky, uncertain part first (a reversible write-probe proving `drive.file` covers Docs API writes) before committing to porting ten functions off `DocumentApp`.
- When the user asked for a UX change ("flow dictated text into fields") and separately flagged a possible bug (gDocs-style mid-phrase correction), reading the actual message-handling code (`src/app.js:1827-1848`) before touching anything showed both were already built and correct — full-replace-on-each-interim-message, not append. Saved a redundant reimplementation.

**Needs improvement:**
- The Apps Script IDE editor tab silently clobbered `clasp push`ed changes via its own autosave, twice in one session (once restoring the broad scope the manifest had just dropped, once wiping a just-pushed self-test probe) — cost real back-and-forth diagnosing what looked like a scope problem before realizing it was a stale-tab problem. Always confirm the IDE tab is closed before pushing scope/manifest changes via clasp, not just after something looks wrong.
- Initially framed the WORK mic block as fully superseded by the iframe-Permissions-Policy finding, when the advisor caught that WORK's separate org mic allowlist was still a real, independent constraint — worth re-reading own conclusions for overcorrection before writing them into TODO.md.
