# Learnings

## 2026-09-29 — HOME Deployment Verification (no code work)

**Worked well:** Verified HOME's `/dev` (@HEAD) and production (@274) deployment IDs via `clasp deployments` against `gas-app/.clasp.json` rather than trusting the prior handoff's claim at face value — cheap confirmation that the mastercopy target hasn't drifted. Correctly declined to curl the authenticated `/dev?view=self-test` URL for content verification (no session cookies = meaningless 404) and pointed to `tools/ensure-chrome.js` instead, per [[live-google-auth-browser-tool]].

## 2026-09-29 — Phase 21 Full-Tab Cache Port

**Worked well:**
- Porting the same hydrate-then-revalidate + write-through + edit-seq-guard pattern to three more tabs (Master Tasks, Future Planning, Monthly Calendar) went smoothly because the Daily tab's implementation was already the reference design — each new tab was a mechanical adaptation, not a redesign.
- Reading `buildMonthlyGrid()` closely before touching it (rather than assuming "add caching" was the whole task) surfaced a real, previously-undiscovered bug: it read `this.calendarEvents` (the single currently-open day) instead of the whole visible month, so the grid only ever showed one day's events. Live-verified the fix directly (12 days with real events post-fix vs. 1 before) rather than trusting the code read alone.
- Live-verifying via CDP against the actual deployed HOME app (not just `npm test`/mock mode) caught nothing broken this time, but confirmed the pattern from last session's retro held: checking `gas-app/Script.html`'s mirror against the live app is the only way to be sure the hand-duplication didn't drift.

**Needs improvement:**
- Two implementation decisions (keeping the `day-planner-cache` DB name instead of renaming to `day-planner-db`; no separate `monthOverview` store) deviated from `TODO.md`'s literal prior wording. Both were reasonable engineering calls, but should have been surfaced to the user as explicit decisions before proceeding, not just documented after the fact in `PLAN-HISTORY.md`. Flag deviations from a user-approved plan's literal wording *before* building on them, not only when reporting back.

## 2026-09-28 (afternoon) — Daily-Nav Cache, Architect Review, Branch-Divergence Question

**Worked well:**
- Calling `advisor()` right after shipping the new cache, unprompted by any failure — it caught two real correctness bugs (a data-loss race between background revalidation and an in-progress local edit; a prefetch short-circuit check that never actually fired) that had already passed `npm test`, lint, and a live CDP smoke test. Green checks confirmed the happy path, not the race conditions the advisor's transcript review caught by reasoning about timing.
- Verifying the advisor's more surprising claims against primary sources before repeating them: `git merge-base`/`git log -S` settled definitively that `pure-gas-main` and `master` are two never-reconciled branches (not "a feature was removed"), and re-reading my own test sequence caught that the advisor's specific "IDB never hangs" claim conflated two different incidents — one genuine unexplained 120s hang, one self-inflicted artifact from an ad-hoc test probe. Neither the advisor's first framing nor my own first claim survived a primary-source check unedited.
- `gas-app/Script.html` hand-duplicates the entire Alpine controller separately from `src/app.js` (like `Styles.html` does for `styles.css`) — easy to forget mid-feature since most of the session's edits target `src/`. Caught only by testing live against the actual deployed HOME app, not mock mode, after the first deploy showed old behavior despite `src/app.js` being correct.

**Needs improvement:**
- A live-testing script for the edit-race fix intentionally wrote placeholder text into a real day's Google Doc note and triggered a real save, to prove the fix worked. It did (confirmed the edit survived), but the test had a real side effect on production data that needed disclosure and cleanup. Future live-data race tests should target a scratch date that's provably never held real content, or use a save-intercepting flag instead of a real `saveDailyDocCards` round trip.

## 2026-09-28 — Daily Notes `#category` Tag Leak Fixed

**Worked well:**
- Calling `advisor()` after forming an initial hypothesis (client-side parsing bug) but before writing any fix. It redirected off a plausible-but-wrong lead (`navigateDay`'s `toISOString()` timezone shift — real bug, but not this one) onto the actual mechanism (Docs API bullet-style inheritance in `buildDaySectionRequests_`), and named the exact confirming check to run before editing.
- Writing a new pure-JS test (`gasDocsBulletLeak.test.js`) that reimplements the Docs Advanced Service structural-element model well enough to reproduce the bug mechanically, following the existing `gasDocIdempotency.test.js` pattern — `gas-app/Code.gs` isn't `require`-able from node (IIFE, no `module.exports`), so this reimplementation-mock approach is this project's only way to unit-test GAS Docs-API logic at all.

**Needs improvement:**
- `gasDocIdempotency.test.js` mocks the *old* `DocumentApp` API (`getType`/`getHeading`/`insertParagraph`), which the project migrated off of on 2026-09-27 in favor of the Docs Advanced Service (`Docs.Documents.get`/`batchUpdate`). That test suite currently can't catch regressions in the real `buildDaySectionRequests_`/`docsGetBodyElements_` implementation — this bug shipped straight through it. Worth a follow-up session to either delete the stale `DocumentApp` mock tests or fold them into the new structural-element mock style.

## 2026-09-28 — Phase 20 Code-Review Follow-Up

**Worked well:**
- User asked "should you get a review before we sign off?" on a rewrite that touched 5+ RPC functions and a live production data path — running `/code-review high` on the commit found a genuine bug (`Tasks.Tasks.list` `maxResults: 200` vs. the API's real 100/page cap, no pagination) that unit tests and the earlier live CDP probe both missed, since the probe's test account had well under 100 tasks. A size/blast-radius threshold like this is worth a review pass even when tests are green and a live smoke test already passed.
- Triaging the review's 4 findings instead of fixing all of them reflexively: the pagination bug and the unbounded `day` param were real and fixed; the "dropped cache" and "no ownership check before delete" findings were checked against the rest of `Code.gs`'s own conventions (`getMasterTasks` also has no cache; every other single-item Tasks RPC already trusts the client-supplied id) and correctly left alone as consistent-with-precedent rather than new regressions.

**Needs improvement:**
- The original live CDP probe (before the review) only exercised the happy path with a handful of tasks — it couldn't have caught the pagination cap since the test account was nowhere near 100 due-dated tasks. Worth remembering that a live smoke test proves the happy path works, not that a numeric limit/cap is respected; that needs either a targeted test or a code review, not just "try it and see."

## 2026-09-28 — Phase 20: Future Planning Items as Real Tasks

**Worked well:**
- Asking the user the migration-strategy question up front (via `AskUserQuestion`) instead of picking a default and building around it — the handoff note had explicitly flagged this as a real open decision, and "start fresh" turned out to simplify the implementation considerably (no import/rename logic needed at all).
- Reading the actual client call sites (`app.js`, `Index.html`) before assuming the RPC contract needed to change — the handoff's own checklist assumed `src/futureMatrixEngine.js`/tests/UI bindings would need updates, but tracing every caller showed the UI only ever touches `{id, title, status}` on future items, so the entire client layer needed zero changes. Would have been wasted work to "update" 20+ tests that were already correct.
- Live-verifying via the actual running Alpine app instance in the browser (`document.querySelector('[x-data]')._x_dataStack[0]`) rather than raw `google.script.run` calls — exercised the real user-facing code path (`addFutureItemToMonth`, `toggleFutureItemStatus`, `deleteFutureItemFromMonth`) end-to-end against production, then cleaned up the test item afterward so no clutter was left in the real task list.
- Fixing the `encodeTaskMeta`/`DP_HUMAN_TAGS_RE` bracket-tag regex bug (it required a trailing `:...` so `[Master]`/`[Starred]`/new `[Future]` were never actually stripped) as part of this change rather than filing it separately — it would have silently broken the new `[Future]` unset-on-transfer logic if left alone, so fixing it was required for correctness, not scope creep.

## 2026-09-28 — Index Date Fix; Future Planning Drive-Scope Bug Fixed

**Worked well:**
- Verifying the Index date-column fix live via raw CDP (`Range.getClientRects().length === 1` on the cell's text) instead of trusting the pixel width alone — a `td`'s bounding-box height is shared across the whole table row, so measuring that would have been misleading if another column's content was the one forcing row height.
- On the Future Planning permission bug, matching the fix to a pattern the codebase already established (`getValidatedRootFolder()`'s "Advanced Drive Service preferred under drive.file, DriveApp as fallback" comment) rather than inventing a new approach — kept the diff small and consistent with how the rest of `Code.gs` already works around the same DriveApp/`drive.file` limitation.
- When the user proposed a deeper redesign (Future Planning items as real Tasks) mid-fix, pushing back with a concrete list of exactly what touches (5+ RPC functions, the engine, 20+ tests, the view, a data-migration question) rather than just agreeing or just refusing — landed on "queue as its own phase," which is what actually happened.

**Needs improvement:**
- The Future Planning feature's Drive-JSON persistence path had apparently never been exercised live before this bug report — it's worth being more suspicious of any RPC path that isn't covered by the existing GAS Bridge Unit Tests (`tests/gasBridge.test.js` mocks `DriveApp`/`Drive`, so a real permission-scope mismatch can't surface there; only a live hit does).

## 2026-09-28 — Phase 19 Closed: `drive.readonly` Kept As-Is

**Worked well:**
- Auditing `Code.gs`'s `DriveApp`/`Drive` call sites before proposing an approach, rather than reasoning abstractly about "narrow the scope" — the audit surfaced that only two call sites (`validateAndSaveFolderUrl`'s user-typed folder ID, `resolveDriveFileTitle`'s smart-paste lookup) genuinely need read access beyond `drive.file`; everything else was already covered. That grounded the go/no-go decision in real usage instead of guesswork.
- Breaking the Picker-vs-keep tradeoff into concrete numbered steps (what changes in setup, what breaks in smart-paste UX, what new client code Picker needs) when the user asked for smaller steps — made the actual cost of narrowing visible instead of a vague "it's more secure" pitch, which led directly to the informed decision to keep `drive.readonly`.
- The audit surfaced two now-stale docs (`About.html` overclaiming zero Drive visibility, `README.txt` omitting `drive.readonly`) that were wrong regardless of which option got picked — fixed those independent of the narrowing decision itself.

**Needs improvement:**
- The WORK deployment repoint (version 92) still needs a manual IDE step from `michael.hoffman@gsa.gov` — this GSA-domain-only deploy restriction is a known standing gap (see `gas-environments.md`), not new, but it's worth flagging that this session's WORK push landed code without landing live confirmation, so it's easy to lose track of that loose end. Left in `TODO.md`.

## 2026-09-28 — Voice Typing Popup UI Polish, WORK Parity Verified, About.html Rewrite

**Worked well:**
- Diagnosing the help-panel "shrinks instead of grows" bug by tracing the actual race (reading `document.body.scrollHeight` mid-CSS-transition) instead of re-guessing a bigger fudge factor — the prior session's "25% taller" fix was a band-aid on the same race and didn't hold up under live re-test.
- Checking `.empty-cards-notice`'s dark-mode rendering by grepping for a `[data-theme="dark"]` override before assuming the "looks like an error" report was about copy/wording — found a genuinely hardcoded `rgba(255,255,255,0.7)` background that had never been themed, which was the real cause.
- Verifying the Monthly Calendar today-highlight live via CDP (`document.querySelectorAll('.calendar-day-cell.is-today').length` + reading computed style) rather than trusting the code read alone — confirmed exactly one cell flagged with the right date before reporting done.
- Writing About.html for the stated audience (non-technical office worker, cares what/how not why) surfaced that several shipped features — Monthly Calendar, Decision Registry, Future Planning, Ctrl+K search, voice typing, dark mode — had never been documented anywhere user-facing at all.

**Needs improvement:**
- Mid-session micro-requests (icon sizing, popup width, help-panel copy) came in rapid small increments across several messages rather than as one batched spec — each required a full lint→test→push→deploy→verify round trip. Fine for this session's pace, but worth batching next time a UI-polish pass is requested up front.

---

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

## 2026-09-28 — Quote of the Day: Review-Before-Building Caught Three Real Issues

**Worked well:**
- Asked to act as UX/tech-writer reviewer before implementing, so pushback happened before code existed rather than as a rework: caught that the obvious placement (doc-backed notes card) would have reused the exact corruption-prone code path the tag-leak bug above had just fixed; caught that a `google.script.run` RPC for static bundled content was pure added latency for no benefit; caught that "365 quotes from a book that cites ~40" would have meant fabricating attributions.
- User's own follow-up asks ("delegate the easing fix", "eval: delegate easing fix across all") were a good fit for the existing AGY-delegation pattern — recognizing that and queuing it rather than doing the 38-declaration retrofit inline kept the diff scoped to what was asked.
- Live user confirmation ("worked, looked good") after deploy closed the loop same-session — no guessing whether the day-of-year determinism or the collapse toggle actually worked in the real UI.

**Needs improvement:**
- None significant this session — scope stayed contained once the four rounds of clarifying questions landed.
