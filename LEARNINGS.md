# Learnings

## 2026-08-18 — Ultrareview Fixes: Real Google Meet Links, Broken Appointment Save, Bundle Hash

**Worked well:**
- Cloud ultrareview caught a real production bug: `saveNewEvent` referenced `this.gasBridge` (never assigned) instead of `this.bridge`, so every appointment created via the (+) button silently never reached the server and vanished on reload.
- Chose to properly fix the fabricated `Math.random()` Google Meet link and no-op `guestsCanModify` checkbox by wiring up the Advanced Calendar Service (`Calendar.Events.insert`/`.patch`) in `Code.gs`, rather than just dropping the feature — user had already added the Calendar service in the Apps Script IDE, and `appsscript.json` was updated to match so `clasp push --force` won't strip it.
- Manually caught a third copy of the fake `@example.com` attendee seed in `src/binderStore.js` that the ultrareview report itself missed (it only flagged `app.js` and `Script.html`) — worth a manual grep sweep after acting on automated review findings.
- Kept `src/app.js` and `gas-app/Script.html` byte-identical for the reworked `saveNewEvent` logic (diffed the two blocks directly to confirm) per the project's sync rule.
- All 66 tests stayed green throughout.

**Needs improvement:**
- The `/retro` skill's `SKILL.md` references `tools/retro.js`, but that script doesn't exist in `.claude/skills/retro/` — only the doc does. Needs the script written or the doc corrected.
- Loading `tools/build-shell-bundle.js` just to check it wasn't syntactically broken actually executed it, which writes `pwa.js` into two other git repos (`gh-pwa-shell/` and an external `../shell/`) as a side effect. Use `node --check` for a pure syntax check instead of importing build scripts that have file-write side effects.

---

## 2026-08-17 — Appointment Creator UX, 25-Min Speedy Meetings, People Autocomplete & Meeting Automations

**Worked well:**
- Fixed unclosed modal dialog tags in `gas-app/Index.html` restoring (+) appointment creator button functionality.
- Converted schedule time marks (`7:00 AM`, `7:30 AM`, etc.) and empty slots into interactive click targets with time pre-filling.
- Implemented 25-minute default meeting length ("Speedy Meetings") with focus buffers and interactive duration presets (`25 min | 50 min | 80 min`).
- Added native `<datalist>` autocomplete for People / Attendees querying past 60 days and future 15 days meetings.
- Added smart meeting automations enabled by default: Auto-Add Google Meet (with note-taking enabled), Co-Organizer editing permissions (`guestsCanModify`), and auto-created Agenda & Notes Docs linked in description & modal.
- All 66 unit tests passing across 18 test suites (`npm test`).

**Needs improvement:**
- In future enhancements, support multi-chip attendee tagging and custom recurrence rules via lightweight dialog extensions.

---

## 2026-08-16 — 3-Column Workspace Layout & Modular Day Planner Note Cards with Google Docs Menu

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

## 2026-08-17 — HTML Separation of Concerns Audit & Handoff Step Order Fix

**Worked well:**
- Standardized GAS template include pattern and eliminated inline styles/scripts
- Extracted PWA inline styles and JS to external files with DOM listeners
- Moved SW registration into src/app.js and added clean store template methods
- All 41 unit tests passed cleanly

**Needs improvement:**
- Fixed handoff.js step order so CONTEXT.md and HANDOFF_PROMPT.md are generated before git add/commit/push

---

## 2026-08-17 — UI/UX, Accessibility & Responsive Refinements

**Worked well:**
- Restored Light Mode tokens and palette parity
- Fixed modal dialog DOM nesting and ARIA semantics
- Added mobile 3-panel daily switcher and WCAG touch targets
- Upgraded dark mode placeholder contrast to >5.2:1 with focus rings
- All 42 unit tests passing

**Needs improvement:**
- Prevent future theme selector collisions between root light and dark scopes
- Add automated accessibility linter to CI/test suite

---

## 2026-08-17 — Theme Regressions Resolution, Golden Desk Background & Edge Layout Fixes

**Worked well:**
- Automated headless CDP tool captured light and dark screenshots for regression diagnosis
- Restored warm golden desk canvas (#dfc495) and fixed Edge header right-edge clipping
- Elevated Dark Forest theme visual hierarchy with high-contrast cards and emerald accents
- Synchronized GAS manifest documents scope

**Needs improvement:**
- Maintain OAuth scope audit checklist during GAS manifest modifications

---

## 2026-08-17 — Vanilla CSS Refactor & Dual Theme Stability

**Worked well:**
- Replacing Pico.css with a 30-line Modern Vanilla CSS reset eliminated 100% of framework specificity clashes
- Pure semantic token architecture allows concurrent high-contrast Light and Dark mode rendering
- Adding Cache-Control no-store headers to server.js and cache-busting version queries prevents stale browser renders
- 100% unit test coverage (42/42) across 10 test suites maintained throughout refactoring

**Needs improvement:**
- PWA Service Worker cache persistence on localhost caused confusion when testing local style updates without hard refresh
- Service Worker cache names should automatically bump during development builds to prevent stale caching

---

## 2026-08-17 — Bidirectional Tasks and Appointments 2-Way Sync Engine

**Worked well:**
- Robust getCleanTitle prevents title prefix accumulation
- Comprehensive test coverage across UI updates, G-Suite API updates, and multi-entity cross-check
- 57/57 unit tests passing cleanly
- clasp push deployed to remote GAS web app

**Needs improvement:**
- Document OAuth 2.0 client configuration path for live G-Suite sync in local standalone mode

---

## 2026-08-17 — 3-Tier Headless Architecture, Scope Hardening & Drive JSON Datastore

**Worked well:**
- Least-privilege scope hardening eliminated broad drive/documents consent prompts
- Partitioned monthly JSON doc store provides sub-2ms reads with native Drive revision history
- Client IndexedDB layer enables 0ms startup and offline mutation queuing
- Comprehensive GSA Enterprise GitHub migration and Private Pages documentation

**Needs improvement:**
- Initial addition of DocumentApp created OAuth consent mismatch requiring manual re-authorization
- Apps Script iframe sandboxing prevents native Service Worker registration necessitating headless mono-architecture

---

## 2026-08-17 — PWA Shell Loader Architecture & GAS Privacy Bundling

**Worked well:**
- Implemented minimal ~80-line public PWA shell on GitHub Pages while keeping 100% of business logic and binder templates private in Google Apps Script
- Enabled true 100% offline cold-start (Airplane Mode) with IndexedDB bundle caching and Service Worker
- Built dynamic bundle compiler in GAS with CORS and hash-based hot-updates
- Created accessible 10-second auto-dismiss Toast notification system with 1-click Drive folder auto-provisioning
- All 64 unit tests passing across 18 test suites

**Needs improvement:**
- Ensure initial GAS Web App URL entry screen is user-friendly and well-guided on first cold boot
- Expand automated integration tests simulating browser service worker cache eviction under storage pressure

---

## 2026-08-17 — GAS CORS/Auth Failure Investigation & BUILTIN_BUNDLES Solution

**Problem:**
All three cross-origin loading strategies fail when a GitHub Pages shell tries to pull the Day Planner bundle from a private Google Apps Script Web App:

| Strategy | Failure Reason |
|----------|----------------|
| `<iframe>` embed | Chromium Tracking Prevention blocks 3rd-party Google auth cookies → infinite redirect loop |
| `fetch()` from GAS | GAS issues HTTP 302→accounts.google.com before CORS headers are set → `ERR_FAILED` |
| JSONP `<script>` | GAS returns HTTP 401 before JSONP callback can execute |

**Root cause**: Google's edge gateway issues a 302 auth redirect *before* `doGet()` runs, so no `ContentService` CORS headers are ever sent. This is a platform-level constraint, not a configuration issue.

**Solution — BUILTIN_BUNDLES (commit `3686a8b` in `mhoffman02/shell`):**
- Pre-compiled Day Planner bundle embedded directly in `pwa.js` as `BUILTIN_BUNDLES['day-planner']`
- On cold start with empty IndexedDB, `initPWA()` now reads from `BUILTIN_BUNDLES`, persists to IndexedDB, and `mountBundle()` instantly — zero network requests needed
- If a GAS URL is later configured, background SWR fetches run silently and update the cache for next launch
- Service worker bumped to v5; `vendor/alpine.min.js` bundled locally to eliminate all CDN dependencies

**Critical bug fixed**: `BUILTIN_BUNDLES` was defined but never wired into `initPWA()`. The missing block was dropped during a merge conflict resolution. The fix adds the fallback check as **Step A** in the router flow, before any network fetch is attempted.

**Do NOT retry these approaches:**
- Cross-origin `fetch()` from GitHub Pages to GAS `/exec`
- `<iframe>` embedding GAS URL in any external-origin page
- JSONP transport via dynamic `<script src="gasUrl">`

**If live 2-way GAS sync is required in future:** implement OAuth 2.0 PKCE client flow (user authenticates in a popup, token stored in IndexedDB) or deploy the app as a fully standalone GAS Web App served directly from `script.google.com`.

---

## 2026-08-17 — PWA Shell Offline Hydration, Alpine DOM Mount Timing & Bundle Syntax Fixes

**Worked well:**
- Embedding pre-compiled BUILTIN_BUNDLES enables 0ms zero-network cold start on GitHub Pages
- Injecting bundle.script synchronously into head before innerHTML resolved all Alpine x-data evaluation race conditions
- Dual-registration pattern in Script.html ensures seamless compatibility across both PWA shell and standalone GAS environments
- Clean local rebuild of BUILTIN_BUNDLES eliminated regex dollar sign syntax corruptions
- All 64 unit tests pass cleanly across 18 test suites

**Needs improvement:**
- Avoid using regex string replacement with unescaped capture group tokens when bundling JS literals containing dollar amounts
- Always consider Alpine MutationObserver synchronous evaluation order when dynamically mounting reactive HTML bundles

---

## 2026-08-30 — Fold indexedDbStore.js into GAS build

**Worked well:**
- Staged reconciliation (inventory diff, then shape decision, then build wiring) avoided a big-bang rewrite
- Static shape test (gasAppIndexedDbShape.test.js) caught real drift risk instead of just trusting build:gas:check
- Kept .agents/ source of truth and CLAUDE.md docs updated in the same commit as the code change

**Needs improvement:**
- Test regexes assumed hand-written const/single-quote style and broke twice against esbuild's var/double-quote/member-expression output -- should have inspected esbuild's actual output style before writing the regex

---

## 2026-08-31 — Live GAS verification (Event.getTag/setTag) + browser automation tool choice

**Worked well:**
- Layered verification (same-instance read, server refetch, raw Advanced-API inspection of shared vs private) caught real signal, not just a smoke check
- Self-test's own bug (missing @google.com suffix strip before Calendar.Events.get) was self-caught and fixed via reasoning about CalendarApp vs Advanced API ID formats, not user-reported
- Reused the project's existing tools/ensure-chrome.js + tools/e2e/cdp-client.js CDP driver once redirected to it, and it worked immediately against an already-authenticated persistent Chrome profile

**Needs improvement:**
- Defaulted to generic mcp__chrome-devtools__* MCP tools for a live Google-authenticated check, which tripped Google's automation-detection sign-in block — the project already has a purpose-built non-Puppeteer CDP driver (tools/ensure-chrome.js) specifically to avoid this, built in an earlier session; should check for existing project e2e tooling before reaching for generic browser-automation MCP tools whenever the target requires live Google sign-in

---
