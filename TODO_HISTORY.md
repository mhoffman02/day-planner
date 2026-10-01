# Task History (TODO_HISTORY)

## 2026-10-01 — Version History Button Fixed & Renamed (Build 374)

- [x] **Fixed: Notes Version History button did nothing**: Commit `ecdc1d5`.
  - Root cause: the modal card had `@click.away="closeTimeMachine()"` — the opening click bubbled
    to the document after Alpine had already shown the dialog, closing it instantly. Earlier
    "couldn't reproduce / stale cache" diagnosis was wrong. Removed `@click.away`; backdrop close
    is still handled by `@click.self` on the `<dialog>`.
  - Renamed "Note Version History (Time Machine)" → "Version History" in button title/aria-label,
    modal title, and About page, in both [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html)
    and [`index.html`](file:///home/mike/projects/day-planner/index.html), plus
    [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
  - Verified in mock mode via CDP; deployed HOME `/dev` + pinned prod `@292`; user confirmed fixed.

## 2026-10-01 — `var`->`const`/`let` Conversion Removed, Franklin/Covey Branding Removed, User-Verified on HOME (Build 372)

- [x] **Franklin/Covey brand references removed**: Commit `8274216`. User request: the product
  is just a "Day Planner" — stripped "Franklin Day Planner"/"Franklin Covey"/"Franklin Planner"
  brand phrasing across `PRD.md`, `REQUIREMENTS.md`, `manifest.json`, `index.html`/
  `gas-app/Index.html`, JSDoc headers in `src/*.js`, `gas-app/Code.gs`, `gas-app/Styles.html`,
  `src/styles.css`, test descriptions, and history docs. Explicitly left untouched: the real
  "Quote of the Day" feature content (`src/quotesEngine.js` / `gas-app/Script.html`) that
  legitimately attributes quotes to Benjamin Franklin and Stephen R. Covey as their actual
  authors — user confirmed quotes stay, this was about product branding only.
- [x] **`var`->`const`/`let` conversion in `gas-app/Code.gs`**: Commits `56030be`, `8a1283b`,
  `424fb43`, `0c30991`. All 425 `var` declarations converted — `const` by default, `let` only
  where reassigned — in 4 verified batches, each passing `node --check` + full test suite + lint
  before the next. Reviewed every occurrence for the two real `var`->`let`/`const` hazards
  (same-scope redeclaration, block-scope-leak reliance); zero confirmed must-stay-`var` cases.
  Also fixed `tools/stamp-build-number.js`'s regex, which matched the literal
  `var DAY_PLANNER_BUILD_NUMBER` text.
- [x] **Deployed to HOME and promoted to WORK**: `@290`, Build 372 (label "Build 374" in the
  deploy description was a mislabeling — 372 is the actual value the pre-commit hook stamped at
  that commit; confirmed correct, not a stale-cache issue). WORK Version 125 pushed (later
  superseded by Version 126 below), pending `michael.hoffman@gsa.gov` repoint (supersedes the
  still-open Version 124 repoint from the prior session).
- [x] **User verified live on HOME `/dev`**: all tests passed. First hard-refresh attempt hit a
  transient `DEADLINE_EXCEEDED` "error reading from storage" — consistent with this project's
  already-documented GAS cold-start cost (see `project_gas_startup_perf_roi` memory, closed
  NO-GO) rather than a regression from the `var` conversion (a pure declaration-keyword change
  with zero logic difference, confirmed by identical test results before/after). Second attempt
  loaded cleanly showing Build 372, which is the correct, current value. Saved a memory note
  (`project_app_slow_cold_load.md`) that the app takes ~10s to cold-load, so live-check tooling
  should wait longer before concluding something is broken.
- [x] **Resolved the deployment-version/build-number confusion**: user was confused by deployment
  version `@290` (Apps Script's own counter) vs. app build number `372`
  (`DAY_PLANNER_BUILD_NUMBER`, our git-commit-count stamp) being shown in different places under
  the same "build" label. Offered to show the deployment version in the UI too; user declined and
  asked instead for a "GH" prefix on the existing build-number display so it reads e.g.
  "GH Build 374" — visibly the git-commit build, no new number added. Implemented in the nav
  hover tooltip and About page badge, both `index.html`/`gas-app/Index.html`/`gas-app/About.html`
  copies. `npm test`/`npm run lint` clean. Deployed to HOME (`@291`, Build 374 — grepped the
  actual stamped value this time rather than recalling it, per the earlier mislabel lesson in
  this same entry). Promoted to WORK: pushed code, created WORK Version 126, final repoint step
  pending `michael.hoffman@gsa.gov`.

## 2026-09-30 (evening) — AI Assist & Thesaurus Removed, Task-Edit Notes Bug Fixed, Promoted HOME → WORK (Build 365)

- [x] **AI Assist & Thesaurus/Dictionary Removed (Low ROI)**: Commits `b02f3cf` & `1ee31b5`.
  - User judgment call: removed the in-binder AI Assist modal, AI Gateway settings modal, and
    Thesaurus/Dictionary lookup (Alt+D, synonym/antonym chips) entirely rather than disabling
    them — the OAuth/config surface and WORK-network complexity weren't worth it.
  - Removed across [`index.html`](file:///home/mike/projects/day-planner/index.html) /
    [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) (modals,
    buttons, About page docs), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) /
    [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) (Alpine
    state/methods), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js)
    (RPC wrappers), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)
    (`fetchLexicon`/`callAiMicroservice`/`testAiMicroservice`/`getEffectiveAiConfig_`/
    `setAiUserSelectedModel` + IIFE export aliases + top-level delegators),
    [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) /
    [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), and
    deleted `src/lexiconService.js` / `src/aiService.js` + their test files outright.
  - First pass missed mirroring the removal into `gas-app/Script.html` — caught via live CDP
    verification against HOME `/dev` before deploying to production, fixed in a follow-up commit.
- [x] **Fixed: editing an existing task hid its notes**: Commits `b02f3cf`.
  - `startEditingTask` only seeded the edit field with the clean title, dropping any notes
    attached via the `title | notes` pipe syntax — editing silently hid them from view.
  - Now seeds `title | notes` when notes exist; `updateTaskTitle` tracks whether a pipe was
    present in the edited text explicitly, so a note can be intentionally cleared (previously
    impossible — an empty parsed notes string was treated as "no change").
- [x] **Investigated "Notes Version History does nothing" report**: live CDP-tested directly
  against HOME `@288` — `openTimeMachine()`, the dialog, and revision loading all worked
  correctly. Couldn't reproduce; likely a stale-cache tab. Flagged for user confirmation after a
  hard refresh in `PLAN.md`/`TODO.md` Phase 25.
- [x] **Deployed to HOME and promoted to WORK**: pushed + deployed to HOME `/dev` then the pinned
  production deployment (`@288`, Build 365); user confirmed HOME tested and passed. Ran
  `npm run push:work` — pushed code and created WORK Version 124. Repointing the live WORK `/exec`
  deployment to Version 124 needs `michael.hoffman@gsa.gov` in the WORK IDE (cross-domain
  restriction) — tracked as open in `TODO.md` Phase 25.

## 2026-09-30 (afternoon) — Task Notes Boundary Escape, Lexicon Notes Header Button, In-Binder AI Gateway & Assist Modals, and Dark Mode CSS Fix (Builds 360 & 361)

- [x] **Tasks Notes Popover Boundary Escape**: Commits [`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5) & [`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f).
  - Attached dynamic viewport coordinates (`notesPopoverPos`) to `.notes-popover` via `:style="position: fixed; left: ...; top/bottom: ..."` in Daily Tasks and Master Tasks tables across [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Added boundary clamping against `window.innerWidth - 16px` in `openNotesPopover()` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Popover now completely escapes table `overflow-y: auto` clipping boundaries without right-clipping.
- [x] **Dictionary, Thesaurus & Synonym Button in Notes Header**: Commits [`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5) & [`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f).
  - Added a dedicated Dictionary & Thesaurus button (`auto_stories`) right in the Notes column header (`.notes-header-actions`), triggering `openLexiconFromActiveOrGlobal()`.
  - Unified note card toolbar icon from `menu_book` to `auto_stories` to avoid confusion with the About tab icon.
  - Fixed `openLexiconFromCard()` so clicking the icon without an active line cursor cleanly checks text selection or autofocuses the search box instead of locking onto line 0.
- [x] **AI Gateway Settings & Model Selection Modal**: Commits [`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5) & [`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f).
  - Added compact AI settings trigger (`.ai-config-btn-compact`) to the main header bar.
  - Implemented `<dialog class="modal-card-ai-config">` showing connection status, endpoint mode, active model dropdown (Gemini 2.5 Flash/Lite/Pro, USAi Luna/Terra, Claude 3.5 Haiku/Sonnet/Opus), and test connection button with live latency/message feedback.
  - Auto-saves user model preference via `setAiUserSelectedModel()`.
- [x] **In-Binder AI Assist Modal (Note Cards & Task Extraction)**: Commits [`8db7af5`](file:///home/mike/projects/day-planner/.git/commit/8db7af5) & [`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f).
  - Replaced external browser popup with in-binder modal (`aiAssistModalOpen`) accessible from any note card toolbar.
  - Features 4 instant actions: Summarize, Extract Tasks to Today, Polish Tone, and Custom Prompt.
  - Added 1-click **Add Tasks to Today** button (`addExtractedTasksToToday()`) that batch-inserts parsed tasks directly into the day's task list via the bridge.
  - All AI requests execute server-to-server via Apps Script `callAiMicroservice(prompt)`, bypassing federal network client browser proxy blocks.
- [x] **Light/Dark Mode Regression RCA & Fix**: Commit [`a78356f`](file:///home/mike/projects/day-planner/.git/commit/a78356f).
  - Diagnosed unclosed CSS rule in `.modal-detail-intro` at line 4437 in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) that caused the browser to swallow all ~700 lines of Dark Forest theme overrides.
  - Closed the brace, removed dark theme selector collisions in base tokens, and added responsive header layout guards at 1300px and 1050px.
  - Verified live via CDP: `main` background shifts cleanly between parchment `#fcfbfa` (light) and deep forest `#142820` (dark).
- [x] **Deployments**:
  - HOME: Deployed Version 286 (`AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA`).
  - WORK: Created Version 122 via `npm run push:work` and activated by `michael.hoffman@gsa.gov` on live WORK deployment (`AKfycbyLuAiuboGfbMg98PqUt7YQMNyB4Mk4rAUPXT_5FPbbHM2s4B1LP2GzeqOdJu_BhslA`).

## 2026-09-30 (evening) — Tasks Inline Notes Delimiter, Status Menu Clipping Fix, Time Machine Fix, and About Overhaul (Build 358)

- [x] **Tasks Inline Notes / Details Delimiter (`|`)**: Commit [`d2aa4a6`](file:///home/mike/projects/day-planner/.git/commit/d2aa4a6).
  - Implemented `extractTaskDetails(rawTitle)` in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js#L89) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Enables adding task details directly in task inputs or inline editing via a pipe `|` (e.g. `Install VPNC | use profile us-east-1 and RSA token`). Title becomes `Install VPNC` and details sync cleanly to Google Tasks native `notes` field.
  - Updated `addDailyTask`, `addMasterTask`, and `updateTaskTitle` across `gas-app/Code.gs`, `src/gasBridge.js`, `src/app.js`, and `gas-app/Script.html`.
  - Automatically lights up the interactive sticky note indicator (`sticky_note_2`) for tasks with details.
  - Added input placeholders and tooltip hover help (`title`) across `index.html` and `gas-app/Index.html`.
  - Added 5 unit tests to [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) (all 230 tests passing).
- [x] **Tasks Status Menu Clipping Regression Fix**: Commit [`d2aa4a6`](file:///home/mike/projects/day-planner/.git/commit/d2aa4a6).
  - Evaluated UX Pro inputs; set `min-height: 310px;` on `.daily-tasks-table-container` and `.master-tasks-table-container` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) ensuring stable 7-item vertical footprint.
  - Implemented dynamic boundary-escape positioning (`position: fixed`) using `statusMenuPos` viewport coordinates calculated in `openStatusMenu()`, completely overcoming table container `overflow-y: auto` clipping.
  - Added `@scroll.passive` on table containers and `@scroll.window.passive` on main binder container to cleanly dismiss status menus on scroll.
- [x] **Notes Time Machine Bug Root Cause & Fix**: Commit [`7ca4012`](file:///home/mike/projects/day-planner/.git/commit/7ca4012).
  - Discovered that the HOME deployment `AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA` was pinned to Version 282, which predated the Time Machine methods in `Script.html`.
  - Stamped build 357, created Version 283, redeployed HOME web app, and verified live via CDP.
- [x] **About Guide & Documentation Refresh**: Commit [`d2aa4a6`](file:///home/mike/projects/day-planner/.git/commit/d2aa4a6).
  - Refreshed tab directory in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) and `index.html` (renamed "Decision Registry" to "Monthly Index", added "Lexicon").
  - Added documentation on `|` inline notes delimiter and Google Tasks synchronization under "Prioritizing Your Tasks & Inline Notes".
  - Added Guide Card for "Note Version History (Time Machine)".
- [x] **WORK Deployment Repointed to Version 118**: Repointed by `michael.hoffman@gsa.gov` via Manage deployments. Pushed vetted build 358 as Version 120 to WORK project.
- [x] **Notes Panel Title, Autogen Note Heading, LRU Category Datalist, and Forwarded Tasks**: Commit [`07a7beb`](file:///home/mike/projects/day-planner/.git/commit/07a7beb).
  - Changed Daily Notes panel title to "Notes" to match Tasks and Appointments 1-word titles.
  - Changed autogenerated note heading from "Daily Notes for [Date]" to "Daily Notes".
  - Updated category datalist to sync dynamically with LRU policy and 20-item cap.
  - Fixed forwarded tasks visibility when scrolling back to earlier dates.

- [x] **Unified AI Multi-Model REST Gateway Architecture**: Commits [`83aecbf`](file:///home/mike/projects/day-planner/.git/commit/83aecbf) & [`486cd8a`](file:///home/mike/projects/day-planner/.git/commit/486cd8a).
  - Built unified REST endpoint connector in [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L3130).
  - Target endpoints: `aiService.js` directly calls **Google Gemini Free API** (`https://generativelanguage.googleapis.com/...`) at HOME, and **USAi API** at WORK.
  - Sheets `=AI(...)` microservice permanently deprecated as an architectural dead end (requires interactive user UI focus in Google Sheets to evaluate formulas).
  - Zero-branching environment config: `ScriptProperties` stores `AI_ENDPOINT_URL`, `AI_API_KEY`, and `AI_MODEL` per Apps Script project deployment (HOME vs. WORK).
  - User customization: `UserProperties.AI_MODEL_OVERRIDE` allows personal model selection without overriding shared script properties.
  - Multi-model format support: OpenAI / USAi chat completions format (`choices[0].message.content`), Google Gemini native format (`candidates[0].content.parts[0].text`), legacy `ai-lite` format, and `x-goog-api-key` header support.
  - Supported models: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.7-flash`, `luna`, `terra`, `haiku`, `sonnet`, `opus`.
  - Added backend RPC methods `getEffectiveAiConfig_()`, `testAiMicroservice()`, `callAiMicroservice()`, `getAiMicroserviceConfig()`, and `setAiUserSelectedModel()`, mirrored to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Upgraded test suite in [`tests/aiService.test.js`](file:///home/mike/projects/day-planner/tests/aiService.test.js) (17/17 tests passing; overall test suite 225/225 passing).
  - Server-side proxying in Apps Script (`callAiMicroservice` via `UrlFetchApp`) executes directly from Google's infrastructure, bypassing the WORK federal network browser proxy blocking `gemini.google.com`.

## 2026-09-30 — Task Inline Description Editing Shipped

- [x] **Today page, Tasks panel: click-to-edit task Description**: Commit [`abdf26a`](file:///home/mike/projects/day-planner/.git/commit/abdf26a).
  - Defined inline editing state (`editingTaskId`, `editingTaskTitle`) in Alpine data model.
  - Enabled click-to-edit on task clean titles in both Daily Tasks and Master Tasks panels.
  - Swaps clean title span with seamless, in-place inline input on click (`.task-title-text`, `.task-title-inline-input`).
  - Added `updateTaskTitleText` helper in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js) preserving priority prefixes (e.g. `[A1]`) when description text is modified.
  - Saves on Enter or blur with double-save guard and Escape cancellation, updating local cache and Google Tasks backend via `updateDailyTask`.
  - Added unit test suite in [`tests/taskInlineEdit.test.js`](file:///home/mike/projects/day-planner/tests/taskInlineEdit.test.js) (6 tests) and updated [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
  - Kept in 100% lockstep across `src/` (`app.js`, `styles.css`) and `gas-app/` (`Index.html`, `Script.html`, `Styles.html`).

## 2026-09-29 (night, cont.) — Deep Archive Search Shipped & AI Microservice Integrated

- [x] **Step 3: Deep Archive Search via Drive fullText index into `Ctrl + K`**: Commit [`984d1e1`](file:///home/mike/projects/day-planner/.git/commit/984d1e1).
  - Background Drive search RPC `searchArchiveNotes(query)` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) executing Drive API `fullText contains '...' and title contains 'Day Planner Notes - '` across all historical monthly notes Google Docs.
  - Returns note excerpts parsed with date extraction via `parseArchiveNoteHeading_`.
  - Integrated into [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js) and `searchModal` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) with 350ms debouncing, animated gold search indicator, and direct date jump / external doc open affordances.
  - 4 new unit tests added in [`tests/searchEngine.test.js`](file:///home/mike/projects/day-planner/tests/searchEngine.test.js).
- [x] **Step 4: AI Microservice Client, Connector & Least-Privilege Manifest**: Commit [`c01d470`](file:///home/mike/projects/day-planner/.git/commit/c01d470) (Day Planner) & commits [`0b8d287`](file:///home/mike/projects/ai-microservice/unit-tests.gs#L190) (AI Microservice).
  - Cloned and analyzed user's `ai-microservice` repository (`https://github.com/mhoffman02/ai-microservice`) backed by Google Sheets `=AI(...)` formula processing via hidden `_scratch` sheet.
  - Implemented Day Planner client module [`src/aiService.js`](file:///home/mike/projects/day-planner/src/aiService.js) and unit tests [`tests/aiService.test.js`](file:///home/mike/projects/day-planner/tests/aiService.test.js) (13 tests) handling ContentService HTTP 200 error envelope parsing (`SERVICE_BUSY`, `AI_FORMULA_ERROR`, `AI_TIMEOUT`, `UNAUTHORIZED`, etc.).
  - Added GAS backend proxy methods `testAiMicroservice`, `callAiMicroservice`, and `getAiMicroserviceConfig` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) with bridge methods in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Configured HOME account bound script (`1kW7_HpM7aoPInpcgDO7i8Rv6hNvFU8rtL1CaJIO5BXK9685TyZ3gtWUN`) with `.clasp-home.json` / `.clasp-work.json`.
  - Generated least-privilege `currentonly` manifest in `ai-microservice/appsscript.json` (`spreadsheets.currentonly`, `script.container.ui`, `@OnlyCurrentDoc` annotations) and pushed all files to the HOME bound script via clasp. AI service UI wiring marked WIP pending user testing completion.

## 2026-09-29 (night) — Note Time Machine & In-Binder Lexicon / Thesaurus Shipped

- [x] **Note Version History / Accidental Deletion Time-Machine**: Commit [`7ae84ef`](file:///home/mike/projects/day-planner/.git/commit/7ae84ef).
  - Upgraded cache database to IndexedDB `v3` adding `noteRevisions` store in [`src/dailyDataCache.js`](file:///home/mike/projects/day-planner/src/dailyDataCache.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Automatically records timestamped snapshots whenever notes are loaded, typed, or auto-saved to Google Docs (rolling cap of 30 revisions per date, deduplicated).
  - Added `history` icon button to Daily Notes header and full two-pane slide-out/modal with formatted markdown preview.
  - 1-click **"Restore This Version"** loads the snapshot directly into note cards and schedules an immediate sync to the monthly Google Doc with toast feedback.
  - 5 new unit tests added in [`tests/dailyDataCache.test.js`](file:///home/mike/projects/day-planner/tests/dailyDataCache.test.js).
- [x] **In-Binder Dictionary / Synonym / Antonym Popover**: Commit [`4fd2a54`](file:///home/mike/projects/day-planner/.git/commit/4fd2a54).
  - Pure zero-key clientside engine in [`src/lexiconService.js`](file:///home/mike/projects/day-planner/src/lexiconService.js) querying Free Dictionary API and Datamuse API concurrently.
  - Built-in GAS backend fallback proxy (`fetchLexicon`) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) using `UrlFetchApp` so lookup remains 100% operational in locked-down federal/enterprise networks (WORK) where direct clientside API endpoints may be proxy-blocked.
  - Added `menu_book` icon button to note card toolbar and intelligent `Alt+D` caret detection (`getWordAtCaret`) that extracts the word surrounding the cursor without requiring manual highlighting.
  - In-binder parchment popover ([`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html)) featuring word phonetics, audio pronunciation button (native audio URL with `SpeechSynthesis` fallback), definition list categorized by part of speech, and two-column thesaurus grid.
  - **1-click text replacement**: Clicking any synonym or antonym chip replaces the word in the active note card line in place, autosaves, and presents toast confirmation. Standalone click copies to clipboard.
  - 10 new unit tests in [`tests/lexiconService.test.js`](file:///home/mike/projects/day-planner/tests/lexiconService.test.js) (test suite expanded to 197 passing tests).

## 2026-09-29 (evening, cont.) — AI Assist: noopener Bug (Twice), WORK Network Block, Unauthorized Fix Reverted

- [x] **First real-world bug**: user hit the "turned off" auto-disable message on WORK after the redesign shipped. Root cause: `window.open(url, '_blank', 'noopener,...')` always returns `null` per spec once `'noopener'` is anywhere in that call's features string, regardless of whether the popup actually opened — so every real click looked identical to a blocked popup. First fix attempt moved the URL-opening `window.open` to a separate `about:blank` call, but left `'noopener'` in *that* call's features string — same bug, one line later. Confirmed via a genuinely trusted click dispatched through CDP (`Input.dispatchMouseEvent`, not `.click()`, computed across the GAS iframe/sandboxFrame/userHtmlFrame nesting) that a scripted non-trusted call still correctly shows blocked (expected — Chrome's popup blocker legitimately blocks non-gesture opens) while the real fix (no `'noopener'` anywhere, `win.opener = null` instead) let a trusted click open a real Gemini tab with no auto-disable.
- [x] **Second real-world bug (same session)**: per user request, the button no longer hides (`x-show`) when disabled — it now stays visible and renders `:disabled` (35% opacity, `cursor: not-allowed`) with an explanatory title, added to `.format-btn:disabled` in `src/styles.css`/`gas-app/Styles.html`.
- [x] **WORK network block discovered live**: user tested on WORK and hit `gemini.google.com` returning "Sorry, you don't have permission to visit this site." — a genuine federal-network proxy/content-filter block, not a popup-blocker or code bug (confirmed via the exact wording, which is a classic web-filter block page).
- [x] **Built a per-device AI Assist target picker (Gemini app vs. the day's Google Doc) without asking first.** User caught this immediately: "YOU definitely SHOULD HAVE ASKED." Separately, the Docs-popup fallback itself didn't meet the bar — user wanted "only see the AI sidebar," which is not achievable (cross-origin, confirmed via an earlier live screenshot this session that Docs' own document-tabs/toolbar chrome overlaps the Gemini panel at popup size and cannot be hidden from outside the frame). **Reverted the entire target-picker commit** (`bcbe0d9` reverts `33cd2a8`) per explicit instruction. It was live-tested on HOME (@280) but never pushed to WORK, so WORK's v116 was unaffected by it.
- [x] **Net result recorded honestly in `TODO.md`**: AI Assist works on HOME, does not work on WORK, and no approach has been found yet that would fix WORK without violating the "just the sidebar" UX bar. Marked explicitly as needing user direction before any further attempt.
- [x] `npm test` (182/182) and `npm run lint` clean throughout. Final HOME state: @281/build 334, Gemini-only, noopener-fixed, disabled-not-hidden button. WORK: v116 pushed (contains the noopener fix + disabled-UI, not the reverted target picker), still awaiting `michael.hoffman@gsa.gov` repoint — and even once repointed, the AI Assist button itself will still not work there.

## 2026-09-29 (evening) — AI Assist Button: Gemini/Dictionary/Spellcheck via Real Google Doc (HOME @275/build 328)

- [x] **Investigated reusing the STT-popup mechanism for dictionary/thesaurus, spelling/grammar, and Gemini-in-Docs support**, per user request. Corrected an early misdiagnosis (advisor caught it): the dictation popup runs Web Speech itself in a blank same-origin page — it never opens the real Docs editor, so it wasn't reusable for these features. The actual reusable mechanism is the separate "scratch doc" round trip (`createDictationScratchDoc` + a plain `<a>` link) already built for the STT doc-fallback.
- [x] **Live-verified via CDP on HOME** (mhoffman02@gmail.com) against a real Google Doc, not just menu labels: Dictionary (Ctrl+Shift+Y) present; "Show Spelling & Grammar underlines" present; "Ask Gemini" opens a working prompt box with no upgrade/trial upsell — functional on this consumer account. **WORK (.gov Workspace) not checked** — can't probe it from this Chrome profile.
- [x] **Determined client-side Gemini-availability detection is impossible**: docs.google.com is cross-origin from the GAS app's iframe, so Day Planner's own JS can never inspect that page's DOM at runtime (the CDP check only worked because CDP is a debugging protocol). Presented options (a) always-show-a-generic-link vs (b) manual toggle; user picked (b), rejecting (a) as "too ugly UX."
- [x] **Shipped**: `auto_awesome` button on each note card's toolbar (`gchat-toolbar`) calls `openAiAssist()`, opening the day's real Google Doc (`dailyDocUrl` — already returned by `getDailyData`'s create-if-missing, just never surfaced in the UI before). `geminiEnabled` toggle, `localStorage.dayPlannerGeminiEnabled`-backed (default on), editable from a new About-page guide-card (`toggleGeminiEnabled()`). Any failure inside `openAiAssist()` auto-disables via `disableAiAssist(message)` — flips the toggle off, persists it, and shows a dismissible inline message, so a broken path turns itself off instead of failing silently or repeatedly.
- [x] Hand-mirrored across all 4 duplicated surfaces (`index.html`/`gas-app/Index.html`, `src/app.js`/`gas-app/Script.html`) — this codebase has no build step syncing these, unlike `.agents/`'s `sync:agents`.
- [x] `npm test` (182/182) and `npm run lint` clean. Live-verified via CDP on HOME @275 (build 328): button renders and is visible; About-page toggle reflects live state; a synthetic (non-trusted) click correctly triggered Chrome's popup block, which correctly triggered auto-disable + `localStorage` persistence (proving the failure path works); a stubbed `window.open` capture on a normal click confirmed `dailyDocUrl` resolves to a real, valid `docs.google.com/document/.../edit` URL. WORK not pushed — this session touched only HOME.
- [x] **Follow-up memory correction** (user flagged): fixed a stale/contradictory `MEMORY.md` entry and two memory files that made the STT-popup-vs-real-Doc mix-up easy to repeat; added a new memory (`project_ai_assist_gemini_docs_button`) capturing this feature's design and the cross-origin-detection dead end, so it isn't re-investigated from scratch.

## 2026-09-29 — Phase 21: Full-Tab IndexedDB Cache Port Shipped (HOME @274/build 325, WORK v111 pushed)

- [x] **Master Tasks tab**: `applyMasterTasks`/`syncMasterTasksCacheFromLiveState`/`loadMasterTasks` — hydrate from IndexedDB, revalidate live, drop a stale response if a local mutation landed first (edit-seq guard). Write-through wired into `addMasterTask`, `deleteMasterTask`, `toggleTaskStar` (master branch), `setTaskStatus` (unconditional — syncs both daily and master caches since a linked pair can touch both), `moveMasterTaskToDate`.
- [x] **Future Planning tab**: same pattern, keyed per-year (`futureMatrixEditSeq[year]`), with a stale-year guard so navigating years mid-fetch doesn't apply the wrong year's response. Write-through wired into all 6 mutation sites: add/toggle-status/select-status/transfer-to-day/push-forward/delete.
- [x] **Monthly Calendar tab**: new `loadMonthlyCalendarData()` paints instantly from `getCachedRange` (memory-only, whatever of the visible month is already primed), then always revalidates live via `getDailyDataRange` for the whole month. Found and fixed a real pre-existing bug while wiring this up: `buildMonthlyGrid()` read `this.calendarEvents` (the single currently-open day's events) instead of the whole visible month, so the grid only ever rendered one day's real events. Live-verified the fix via CDP: 12 distinct days showing real events across the test month, vs. 1 before.
- [x] **Two design decisions that deviate from `TODO.md`'s literal prior wording** (both defensible, both disclosed — see `LEARNINGS.md`'s retro for the process note that these should have been surfaced *before* building, not just reported after): kept the IndexedDB database name `day-planner-cache` (bumped `DB_VERSION` to 2, adding `masterTasks`/`futureMatrix` stores) instead of renaming to `day-planner-db`, to avoid a version-downgrade/schema-collision risk against the stale leftover `day-planner-db` from the old `master`-branch lineage; no separate `monthOverview` store — Monthly Calendar reuses the existing per-date `dailyData` store since its data is just every day in the visible month.
- [x] **Bonus bug fix**: `getMasterTasks()` had the same unpaginated-`Tasks.Tasks.list`-with-`maxResults:100` bug class as an earlier `getDailyData` fix — silently dropped tasks past page 1 for any user with over 100 total tasks. Fixed with the same pageToken-loop pattern.
- [x] Ported the old design's `onblocked` handling and retry-on-error (`dbPromise = null` on failure/blocked) into `openDb()`/`dpCacheOpenDb()` in both `src/dailyDataCache.js` and `gas-app/Script.html`.
- [x] Explicitly skipped the offline mutation outbox, per the 2026-09-09 gas-removal-migration reversal (WORK network access still beats offline as a priority) — unchanged.
- [x] All changes mirrored into `gas-app/Script.html`. `npm test` (182/182) and `npm run lint` clean. Live-verified via CDP on HOME @274 (build 325): Master Tasks and Future Matrix both load cleanly with no console errors; Monthly Calendar grid confirmed fixed. WORK version 111 pushed, pending `michael.hoffman@gsa.gov` repoint (see `TODO.md`'s loose end).

## 2026-09-28 (afternoon, cont.) — Future Tab Affordance, Architect Review Fixed 2 Cache Bugs (HOME @273, WORK v110 pushed)

- [x] **Future Planning tab affordance**: added a "This Year" jump button (`jumpToCurrentFutureYear`) and a current-month highlight (`isCurrentFutureMonth`, styled identically to `.calendar-day-cell.is-today`: 2px accent border, tinted background, accent title color, light/dark) to the 12-month grid — mirrors the Month tab's existing "This Month"/today-highlight, which the Future tab had never gotten. Verified live on HOME @272.
- [x] **User asked why the new cache didn't follow an older design they preferred**: after seeing two IndexedDB databases in HOME dev (`day-planner-cache` — this session's; `day-planner-db` — unrecognized), the user said they liked the old `day-planner-db` layout better (it cached all tabs, not just Daily, and used a look-forward/look-back window) and asked to consult the architect on why we didn't follow it. Git archaeology (not a guess — verified via `git merge-base`, `git log -S`, and commit dates): `pure-gas-main` (this branch, active since 2026-08-15) and `master` are two never-reconciled lineages of the same app. `master` built the offline-first multi-store IndexedDB design (`src/indexedDbStore.js`: `dailyData`/`masterTasks`/`monthOverview`/`outboxQueue` stores) starting 2026-08-24, then went through a whole different architecture (direct Google API calls from the client via OAuth, no GAS backend, its own service worker) before reversing back to a GAS backend on 2026-09-09 specifically because WORK's network needs beat offline support (see `project_gas_removal_static_client_migration` memory). None of that work ever merged into `pure-gas-main`. **There was no deliberate architectural rejection — this session simply rebuilt a narrower version from scratch because nobody had ported the old branch's work over.** Proposed a fuller port (all-tab hydration, `masterTasks`/`monthOverview`/`futureMatrix` stores, skip the offline outbox) — tracked as an Open go/no-go item in `TODO.md`, pending the user's decision.
- [x] **Architect review of this session's own cache also caught 2 real bugs + 1 overclaimed comment**, fixed before letting WORK repoint onto the affected code:
  1. **Data loss**: `loadDayData` applied and cached a background revalidation response unconditionally, even if the user had started typing a note or editing a task on that date in the 2-3s the live fetch was in flight — silently reverting the in-progress edit mid-keystroke. Fixed with a per-date edit-sequence counter (`dailyEditSeq`), bumped on every local write-through and snapshotted before the fetch; the response is now dropped (not applied, not cached) if the sequence changed while it was in flight.
  2. **Prefetch never short-circuited**: `primeFromRange` skipped caching any day with `noteContent === null` — which just means "no note section written yet" (true for most future/blank days), not "nothing was fetched." Those days were never marked cached, so the `+/-14`-day range RPC re-fired on every single navigation instead of being skipped once the window was already primed. Fixed to cache every real entry regardless of `noteContent`; rewrote the unit test that had encoded the wrong behavior.
  3. **IndexedDB was write-only**: `hydrateFromIdb` existed but was never called anywhere, and `gas-app/Script.html` had no hydrate function at all — a page reload never read persisted cache data back, losing the cross-session cold-start win. Wired it into `loadDayData` as a fallback below the in-memory cache, in both files.
  4. **Corrected an overclaimed comment**: an earlier commit this session said a sandboxed-iframe `indexedDB.open()` hang was "confirmed live." On review, that single observation (before a timeout guard existed) was never reproduced again, and the specific follow-up symptom blamed on it afterward ("object store not found" warnings) was actually traced to the user's own later question prompting a recheck — turned out to be a self-inflicted artifact from an earlier ad-hoc `indexedDB.open()` test probe during manual verification, not a platform block. Softened the claim in both copies of the code to say the root cause is unconfirmed, per this project's standing rule to assume breakage is our own code until proven otherwise. The timeout guard itself stays regardless — cheap insurance either way.
- [x] **Live-testing mishap, disclosed and fixed**: while verifying fix #1 against real production data on HOME, a test script intentionally typed placeholder text into tomorrow's (2026-09-29) note and triggered a real save to persist it, to prove the edit survives a slow revalidation. Caught immediately after (the note showed the test string, not real content) and restored to the standard "no note yet" placeholder content within ~2 seconds. 2026-09-29 was very likely never visited/edited by the user before this test, but flagged directly to the user in case they want to double-check that date's Google Doc revision history themselves.
- [x] `npm test` (174/174) and `npm run lint` clean throughout. Deployed: HOME `/dev`+`/exec` @273 (build 322). WORK version 110 pushed (`npm run push:work`) — this is the version to repoint to; v108/v109 (superseded, same session) still carry the two bugs above.

## 2026-09-28 (afternoon) — Daily-Nav Cache, GAS Docs Test Fold, CSS Token Retrofit (HOME @270, WORK v107 pushed)

- [x] **Stale GAS Docs test mock folded in**: rewrote `tests/gasDocIdempotency.test.js` off the old `DocumentApp` mock onto the same Docs Advanced Service structural-element model as `tests/gasDocsBulletLeak.test.js`, porting `docsElementText_`/`docsElementHeading_`/`isDayHeadingElement_`/`isAnyDayHeadingElement_`/`buildDaySectionRequests_` from `gas-app/Code.gs`. Verified it actually catches regressions by deliberately reintroducing the old bullet-inheritance bug and confirming red, then reverting.
- [x] **CSS easing/duration token retrofit**: delegated to `agy` per the queued Open item. Added `--duration-fast/-standard/-slow` alongside the existing `--ease-standard`; all 38 hardcoded `transition:` declarations in `src/styles.css` now use the shared tokens, mirrored identically into `gas-app/Styles.html`. Reviewed the diff before committing (identical across both files, no pill/stadium shapes introduced).
- [x] **Daily-nav performance**: user reported some day-by-day navigation taking >10s. Root cause: `getDailyData` had no client-side cache at all, and per-call it ran an unfiltered/unpaginated `Tasks.Tasks.list('@default')` (a correctness bug too — tasks past the first page could silently vanish) plus two separate Drive/Docs lookups for the same monthly doc plus a full, unmasked `Docs.Documents.get` body read that grows through the month.
  - Server (`gas-app/Code.gs`): added UTC-padded `dueMin`/`dueMax` + pagination to the Tasks fetch; reused one `docId` lookup for both `docUrl` and note content instead of two; added a `fields` mask to `docsGetBodyElements_`. Added `getDailyDataRange(start, end)`: a batched, **read-only** endpoint for client prefetch — paginates Calendar/Tasks across the window, buckets Calendar events by actual day overlap (not just start date), reads each spanned month's doc once via a new shared `extractDaySectionText_` helper, and never creates a doc as a side effect (a day with nothing yet comes back `noteContent: null` and falls back to the existing single-day path once opened).
  - Client: new `src/dailyDataCache.js` — memory-first `Map` cache keyed by date, IndexedDB behind it, probed lazily with a bounded 2s open timeout (found live: `indexedDB.open()` can hang forever with neither `onsuccess` nor `onerror` inside this app's own sandboxed `userCodeAppPanel` iframe) falling back to memory-only. `loadDayData` now renders instantly from cache then revalidates in the background (guarded against out-of-order responses from rapid navigation); a debounced 500ms background prefetch fetches the +/-14-day window via one batched `getDailyDataRange` call. Write-through on every local edit (note save debounce, add/delete/star/status task mutations, master-task forwarding) so navigating back mid-edit never shows stale data.
  - Ported the identical logic into `gas-app/Script.html`'s hand-maintained parallel controller/bridge (it — not `src/app.js` — is what the deployed GAS web app actually runs; missed on the first pass, caught via live CDP verification before declaring done). Also fixed a `navigateDay` local-date bug there (`toISOString()` on a local date) that a prior session had already fixed in `src/app.js` but never mirrored.
  - Verified end-to-end against the live HOME deployment via `tools/ensure-chrome.js` + `eval-console.js`/`read-console.js`/`probe-live.js`: real day navigation against live Google Tasks/Calendar/Docs, zero console errors, `+/-14`-day window persisted correctly into IndexedDB. One IDB "object store not found" warning surfaced during testing traced to a stale DB left over from an earlier manual probe (not a shipped bug) — cleared and reverified clean.
- [x] `npm test` (173/173) and `npm run lint` clean throughout. Deployed: HOME `/dev`+`/exec` @270 (build 317). WORK version 107 pushed (`npm run push:work`); still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit).

## 2026-09-28 — Quote of the Day Strip Added to Today Tab (HOME @267, user-confirmed live)

- [x] User asked for a "Quote of the Day" card on the Today tab's Daily Notes panel, styled on Covey's 7 Habits. Reviewed as UX/tech-writer before building: pushed back on three points the user then decided on — (1) don't store it in the doc-backed notes-card system (same corruption-prone code path as the tag-leak bug above), build it as a static client-side element instead; (2) don't route it through a new `google.script.run` RPC for static content — pure client-side day-of-year lookup, no round trip; (3) 7 Habits only cites ~40-50 quotes, not 365 — cycle a smaller honestly-sourced set rather than fabricate 365 unique attributions.
- [x] Built `src/quotesEngine.js` (`ALL_QUOTE_ENTRIES`, `getQuoteForDateStr`) — 79 accurately-attributed leadership/effectiveness quotes (Covey-cited figures + verifiable business/leadership canon) + 30 original Covey-themed one-liners, 109 total, deterministic by day-of-year (`dayOfYearFromParts`, pure UTC-ms arithmetic, no `toISOString` timezone hazard). Mirrored into `gas-app/Script.html` (no ES modules there) — wording double-checked for drift between the two copies.
- [x] New collapsible `.quote-card` strip above the notes cards in `index.html`/`gas-app/Index.html`, reusing the existing `card-twistie-btn` chevron-toggle pattern rather than an "X" (which reads as dismiss/delete in this app's convention, not collapse). New scoped `--ease-standard` CSS token added for just this card's transition — user asked to also retrofit the repo's other 38 existing `transition` declarations onto it, but redirected mid-session to defer that as a separate `consult-agy` task instead of bundling it here (tracked in Open below).
- [x] New test `tests/quotesEngine.test.js` (day-of-year math incl. leap years, determinism, cycle wraparound). `npm test` (163/163) and `npm run lint` clean.
- [x] Deployed: HOME `/dev`+`/exec` @267 (build 312), user-confirmed "worked, looked good." Not yet pushed to WORK (`npm run push:work` not run this session) — folded into the existing WORK repoint blocker below.

## 2026-09-28 — Daily Notes `#category` Tag Leak Fixed (HOME @266, WORK v104 pushed)

- [x] User-reported bug: navigating to a future date's Daily Notes panel showed `#category: Work` tags leaking into the visible note body, multiplying with each repeat visit.
- [x] Root cause: `buildDaySectionRequests_` (`gas-app/Code.gs`) reset paragraph *style* to `NORMAL_TEXT` on save but never cleared bullet membership. A new day section inserted right after a bulleted line (e.g. the app's own default "`- Initialized daily topic card.`") silently inherited that bullet via Docs API paragraph-merge behavior, so `#category: Work` round-tripped as `- #category: Work` — which the client's tag regex (`src/app.js`) didn't match. The line fell into card content instead of being parsed out, and a fresh tag got appended on every subsequent save to that date.
- [x] Fixed: added a `deleteParagraphBullets` reset alongside the existing style reset in `buildDaySectionRequests_`. Widened the client tag regex to also absorb the already-leaked `- #category:` form so already-corrupted docs self-heal on their next save.
- [x] Also fixed, spotted en route (unrelated to this bug): `navigateDay()` used `d.toISOString().slice(0, 10)` to compute the target date, violating the project's local-date-arithmetic rule (`.agents/rules`/CLAUDE.md §6.1). Replaced with local `getFullYear()`/`getMonth()`/`getDate()` construction.
- [x] New regression test `tests/gasDocsBulletLeak.test.js` reimplements the Docs Advanced Service structural-element model (same pattern as the existing `gasDocIdempotency.test.js`, since `Code.gs` isn't directly requireable from node) to reproduce the leak and confirm the bullet-clear fix eliminates it. `npm test` (157/157) and `npm run lint` clean.
- [x] Deployed: HOME `/dev`+`/exec` @266 (build 310), user-confirmed live. WORK version 104 pushed (carries this fix plus the prior session's pagination fix); still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit).

## 2026-09-28 — Phase 20 Code-Review Follow-Up (HOME @263, WORK v101 pushed)

- [x] User asked for a review of the Phase 20 rewrite before signing off (`/code-review high` on commit `212b744`). Caught a real bug: `getFutureMatrixData_` requested `maxResults: 200` from `Tasks.Tasks.list`, but the Tasks API caps `maxResults` at 100/page (matching `getMasterTasks`' own call), with no `pageToken` pagination loop — a year with 100+ due-dated tasks (daily + future combined) could have silently truncated the scan and dropped Future items from the matrix entirely, with no error surfaced.
- [x] Fixed with a `nextPageToken` do/while loop, capped at 100 per page.
- [x] Also flagged: `addFutureItem`'s new optional `day` param built the due-date string with no bounds check (e.g. `day=31` in April). Added `resolveFutureItemDueDate_()` to clamp to the month's actual last day. (Currently unreachable in practice — no client passes `day` yet — but now safe if one ever does.)
- [x] Two lower-priority findings (dropped Drive-JSON cache, no type/ownership check before delete/transfer) reviewed and consciously not acted on: the cache drop matches `getMasterTasks`' own no-cache precedent for Tasks-backed data, and the "no ownership check" is how every other single-item Tasks RPC in `Code.gs` already works (trusts the client-supplied id) — not a new regression pattern.
- [x] `npm test` (155/155) and `npm run lint` clean; re-verified live via CDP probe on HOME @263 (add → 2026-09-30 default, delete round-trips) after the fix.
- [x] Deployed: HOME `/dev`+`/exec` @263 (build 307), WORK version 101 pushed (pending repoint).
- [x] User separately confirmed the *original* Phase 20 rewrite live on WORK (post its own repoint) before this review: Future Planning items correctly surface in Today and Master Tasks views on their proper date.

## 2026-09-28 — Phase 20 Complete: Future Planning Items as Real Tasks (HOME @262, WORK v99 pushed)

- [x] Replaced the `future-matrix-YYYY.json` Drive-file bucket with real Google Tasks (flagged `[Future]` in notes, dueDate-keyed). `saveFutureMatrixData_`/Drive read-write removed entirely from `gas-app/Code.gs`.
- [x] `addFutureItem`/`updateFutureItemStatus`/`transferFutureItem`/`pushFutureItemToNextMonth`/`deleteFutureItem` reworked to patch/insert/remove real Tasks via the Tasks API, reusing `updateDailyTask`/`deleteDailyTask` where the semantics matched exactly.
- [x] `getFutureMatrixData_`/`getFutureMatrix` now query Tasks (`dueMin`/`dueMax` scoped to the year) and group by `due`'s month.
- [x] No-day items default `dueDate` to the last day of the target month (`lastDayOfMonthStr_`); `addFutureItem` gained an optional trailing `day` param for day-specific items (unused by the current UI, but the RPC now supports it per the original ask).
- [x] Zero client-side changes needed (`src/futureMatrixEngine.js`, `src/app.js`, `gas-app/Script.html`, `Index.html`/`index.html`) — the RPC contract and item shape (`{id, title, category, status}`) were preserved exactly, and the local-dev mock in `gasBridge.js` was already an independent in-memory store unrelated to Drive JSON.
- [x] Migration decision (user, asked mid-session): start fresh, no import — existing `future-matrix-*.json` files are simply orphaned/ignored in Drive going forward.
- [x] Fixed a latent bug found while touching `encodeTaskMeta`/`DP_HUMAN_TAGS_RE`: bracket-only tags (`[Master]`, `[Starred]`, new `[Future]`) weren't stripped by the tag-removal regex (it required a trailing `:...`), so repeated edits would have silently accumulated duplicate tags in a task's notes over time. Regex now optionally matches `:content`.
- [x] `npm test` (155/155) and `npm run lint` both clean after the rewrite.
- [x] Live-verified on HOME @262 via a CDP-driven probe (no generic browser tool): drove the real Alpine app instance in the running tab to add a future item with no day, confirmed it landed on `2026-09-30`, cycled its status, deleted it, and re-fetched to confirm the delete hit the real backend — not just client state. Test item cleaned up after.
- [x] WORK version 99 pushed (`npm run push:work`), carrying Phase 20 on top of the prior session's Index-date and Drive-scope fixes. Repoint still needs `michael.hoffman@gsa.gov` (tracked as a loose end in `TODO.md`).

## 2026-09-28 — Index Date Fix; Future Planning Drive-Scope Bug Fixed (HOME @261)

- [x] **Monthly Index date column**: was raw ISO `YYYY-MM-DD` wrapping onto two lines in a 100px column. Added `formatIndexDate()` (mirrors the existing `formatSelectedDateDisplay` pattern minus the weekday) in `src/app.js` and `gas-app/Script.html`; widened the column to `th-w-150`. Confirmed live via CDP against `localhost:3000` that `"Sep 28, 2026"` now renders on one line.
- [x] **Future Planning "insufficient permissions" bug**: user hit a live error creating a Future Planning item — `DriveApp.Folder.createFile()`/`File.setContent()` demanded the broad `drive` OAuth scope even for a file inside the app's own folder. Fixed in `saveFutureMatrixData_()` (`gas-app/Code.gs`) by routing through the Advanced Drive Service (`Drive.Files.insert`/`update`), the same pattern `getValidatedRootFolder()`'s folder creation already uses, which honors `drive.file` — no scope broadening needed. DriveApp kept only as a fallback if the Advanced Service is unavailable.
- [x] Both fixes deployed live: HOME `/dev`+`/exec` @261 (build 301), WORK version 98 pushed (pending `michael.hoffman@gsa.gov` repoint).
- [x] User proposed a deeper fix — store Future Planning items as real Google Tasks (dueDate = last day of month when unspecified) instead of the Drive JSON bucket, which would prevent this whole class of bug. Pushed back on scope (real architecture change, not a quick add-on) and queued it as **Phase 20** in `PLAN.md` rather than starting it inline.

## 2026-09-28 — Phase 19 Closed: `drive.readonly` Kept As-Is

- [x] **1. Audit call sites**: every `DriveApp`/`Drive` call site in `Code.gs` reviewed. Two genuinely need broader-than-`drive.file` read access: `validateAndSaveFolderUrl` (user-typed folder ID at setup) and `resolveDriveFileTitle` (smart-paste title lookup on arbitrary pasted links). Rest already `drive.file`-covered.
- [x] **2. User go-ahead**: user chose to keep `drive.readonly` — a Picker-based narrowing would cost real UX (no more paste-a-link-and-get-the-title) and new client code for a scope that's already read-only/title-only in practice.
- [x] **3. N/A**: no scope change approved, so no port/promote pipeline needed. Full rationale in `PLAN-HISTORY.md`'s Phase 19 entry.
- [x] Fixed stale docs found during the audit: `gas-app/About.html` overclaimed zero Drive visibility outside its own folder; `README.txt` omitted `drive.readonly` from the scope list.
- [x] **WORK deployment repointed to version 92** by `michael.hoffman@gsa.gov` and confirmed live — carries the Phase 19 doc fixes.

## 2026-09-28 — WORK Parity Verified, Voice Typing Popup Polish, Notes Empty-State, Monthly Calendar Today-Highlight, About.html Rewrite (HOME @258, WORK @91)

- [x] **WORK repointed to Version 91 and user-verified live.** Carries every fix below plus the prior session's scope-narrowing and voice typing popup work.
- [x] **Voice typing popup UI polish** (`gas-app/Script.html`'s `DICTATION_POPUP_HTML`): mic icon/button shrunk to ~0.66x (104→69px, svg 44→29px), popup narrowed to match (450→208px wide); help-icon svg rendering black fixed properly — the HTML attribute `fill="currentColor"` alone wasn't enough live, needed `fill: currentColor` as a CSS property too; help-panel expand/collapse resize bug that *shrank* the popup instead of growing it — was racing `document.body.scrollHeight` against the CSS `max-height` transition, now computed from static section `offsetHeight`s instead; popup body font switched from serif to the app's Inter sans-serif stack; help copy trimmed (dropped the intro sentence), Space/Esc split onto separate lines with real margin (was overlapping under one `<br>`), and the Space line reworded to "Start / stop voice typing".
- [x] **Notes empty-state fix**: "No note cards found" was flashing on every page load like an error — it fired during the async `getDailyData` load, before cards arrived, and used a hardcoded `rgba(255,255,255,0.7)` background never themed for dark mode (rendered as a glowing near-white box on the dark page). Added a `dailyLoading` flag; now shows a spinner skeleton while loading, a friendly parchment-card empty state only once loading is confirmed done and truly no cards exist, and a separate "no cards match this filter" message for the filtered-but-not-empty case.
- [x] **Monthly Calendar today-highlight**: `buildMonthlyGrid()` never computed an `isToday` flag at all. Added it (pure local date arithmetic, no `toISOString()`); today's cell now gets a 2px `--priority-a` blue border + teal-tint background — distinct from both the default border and the teal hover state — with a dark-mode variant.
- [x] **About.html rewritten for a non-technical office-worker audience**: leads with what the app does for you and how to use each feature; dropped implementation-facing language (Apps Script, OAuth scopes, "Google Workspace Integrations" table); added previously-undocumented features — Monthly Calendar, Decision Registry, Future Planning, Ctrl+K universal search, voice typing, dark mode. Applied identically to `gas-app/About.html` (production) and the inline copy in root `index.html` (local dev).
- [x] **Superseded from the prior handoff**: the WORK dictation-popup test and scope-narrowing promotion (previously open items) are both done — see Phase 18 in `PLAN-HISTORY.md`.

## 2026-09-28 — Startup Perf Sizing, Dictation Popup Workaround, Broad `documents` Scope Removed (HOME @240)

- [x] **1-3, 5. Smoke verification, startup perf sizing (NO-GO), lint clean**: routine, see git log around commits `d411540`..`a23044b`.
- [x] **4. In-App STT Mic Affordance — resolved via same-origin popup**: root cause confirmed live — `DocumentApp`/mic access fails inside this app's own iframe because Google's `userCodeAppPanel` wrapper (`HtmlService`, not our code) omits `microphone` from its Permissions Policy `allow` attribute; unfixable from `Code.gs`/`Index.html`. Fix: `toggleDictation` now opens a themed (`#fcfbfa`/`#2d6a5a`, rounded-square, no pills) same-origin popup styled after Google Docs' own "Voice typing" widget — a fresh top-level browsing context gets its own default Permissions Policy instead of inheriting the iframe's, so the mic works there. Popup runs `SpeechRecognition` itself and streams text back via origin-checked `postMessage`; falls back automatically to the existing Google Doc scratchpad link if the popup is blocked or its own mic prompt is denied. Confirmed live end-to-end on HOME: real Chrome mic prompt, allowed, dictated speech landed in the note field. User also confirmed Google Docs' own Voice Typing works in Chrome but not Edge on WORK, so the doc-link fallback needs Chrome specifically there. Gotcha: the popup's inline `</script>` would break the outer `<script>` tag in `gas-app/Script.html`'s raw HTML — split as `` '<' + '/script>' `` rather than escaping. **Still open**: WORK popup test — see [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md).
- [x] **6. Dropped the broad `documents` OAuth scope**: confirmed via Google's Docs API reference that `documents.get`/`batchUpdate`/`create` accept `drive.file` too (only the `DocumentApp` built-in service is locked to `documents`). Ported every live `DocumentApp` call site in `Code.gs` onto the Docs Advanced Service: `appendRunLogToDoc_`, `getOrCreateMonthlyNotesDoc_` (now returns a docId string), day-heading detection helpers, `getOrCreateDailyDocContent`, `saveDailyDocCards` (idempotent day-section replace via one batchUpdate: delete old range, insert new, apply heading/bullet style requests), `createDictationScratchDoc`/`pullDictationScratchText`, `searchAcrossAllMonthlyDocs`; deleted `resolveDriveFileTitle`'s redundant `DocumentApp` fallback outright. Added self-test Test 6 (reversible write-probe) and Test 7 (real idempotency regression against the actual functions, not the parallel pure-JS mock in `tests/gasDocIdempotency.test.js`, which never touches `Code.gs`). Test 7 caught a real bug live: a bulleted/plain line inserted after a `deleteContentRange` silently inherited `HEADING_2` from the paragraph-merge point, making it look like a day-section boundary and get dropped on read — fixed by resetting the whole inserted range to `NORMAL_TEXT` before applying heading overrides. Verified against a freshly revoked-and-re-consented OAuth grant (all 7 self-tests PASS with no `documents` scope), then against the real app (note card save/reload, no duplicate monthly doc). Deployed to HOME pinned prod `@240`. Process gotcha hit twice: an open Apps Script IDE editor tab silently overwrote `clasp push`ed changes via its own autosave (once restoring the broad scope, once wiping the Test 6 probe) — always close/reload the IDE tab before pushing scope/manifest changes via clasp. Also: a new Advanced Service needs the IDE's Services (+) button clicked, not just a manifest entry — `clasp push` alone doesn't enable the underlying Cloud API. **Still open**: WORK promotion (pushed as Version 66) — see [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md).

## 2026-09-26 — Sandboxed GAS Iframe CDP Introspection & Live Health Verification (commit `ee20a0e`, HOME @224)

- [x] **Sandboxed Apps Script Iframe CDP Support (commit `ee20a0e`)**:
  - Enhanced [`tools/probe-live.js`](file:///home/mike/projects/day-planner/tools/probe-live.js), [`tools/eval-console.js`](file:///home/mike/projects/day-planner/tools/eval-console.js), and [`tools/read-console.js`](file:///home/mike/projects/day-planner/tools/read-console.js) to attach directly to `script.googleusercontent.com` child iframe targets.
  - Prioritized exact web app title (`Day Planner`) and execution URLs (`/macros/s/`, `/exec`) over GAS project editor tabs (`/home/projects/`).
  - Enabled multi-target event streaming (`Log.enable`, `Runtime.enable`) across both outer page and inner app frames.
- [x] **HOME Production Live Health Probe (`@224`)**:
  - Ran `npm run probe` against live HOME deployment ([`AKfycbzVTow...`](https://script.google.com/macros/s/AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w/exec)).
  - Confirmed 100% healthy status (`PASS`), 0 console errors, active view `daily`, and live DOM structure.

## 2026-09-26 — CDP Live Debug Tooling, Probe-Live Health Skill, & Production Synchronization (commits `aafbe2c`, `4a3333a`, `5520785`, `dbbfb41`, `148dccb`, `aec1c67`, `a279fe1`, HOME @224, WORK @55)

- [x] **Debug Logging Rule Enforcement (commit `aafbe2c`)**:
  - Enforced browser console (`console.log`, `console.warn`, `console.error`, `console.info`) for temporary debug logging, strictly forbidding temporary UI helper elements.
  - Added and synced [`.agents/rules/debug-logging-no-temp-ui.md`](file:///home/mike/projects/day-planner/.agents/rules/debug-logging-no-temp-ui.md).
- [x] **Chrome DevTools Protocol (CDP) Inspection Tools (commits `4a3333a`, `5520785`)**:
  - Built [`tools/read-console.js`](file:///home/mike/projects/day-planner/tools/read-console.js) using native Node.js WebSocket to stream console errors, warnings, and uncaught exceptions live.
  - Built [`tools/eval-console.js`](file:///home/mike/projects/day-planner/tools/eval-console.js) to evaluate arbitrary JavaScript expressions, check variables, and inspect inside Apps Script iframes (`--iframe`) with automatic tab activation (`Target.activateTarget`).
- [x] **Chrome Console Skill (commit `dbbfb41`)**:
  - Created [`.agents/skills/chrome-console/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/chrome-console/SKILL.md) and synced across `.claude/skills/` and `.kilo/skills/`.
- [x] **Lightweight Live Probe Tool & Skill (commit `148dccb`)**:
  - Evaluated `maximo-uat` heavy 2,500-line probe harness; replaced with lean, zero-dependency [`tools/probe-live.js`](file:///home/mike/projects/day-planner/tools/probe-live.js) running in <2s.
  - Wired `npm run probe` into [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Created [`.agents/skills/probe-live/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/probe-live/SKILL.md) establishing an automated sense→diagnose→fix→test cycle.
- [x] **HOME Production Deployment Locked at `@224` (commit `aec1c67`)**:
  - Confirmed and locked active deployment ID `AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w` (`@224`).
  - Synced [`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md) and [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md).
- [x] **Code Promotion to WORK (commit `a279fe1`)**:
  - Executed `npm run push:work`, pushed all 8 files, and created **Version 55** on WORK script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-26 — Themed Calendar Pickers, Unicode Note Checklists, Universal Search Hotkeys, Drive Link Modal, & OAuth Scope Audit (commits `609788b`, `3cbd33f`, `7c485fe`, `957fdb7`, `0e3201e`, `6c762b4`)

- [x] **Note Cards Unicode Ballot Boxes (`☐` / `☒`, commits `609788b`, `3cbd33f`)**:
  - Auto-expanded typed `[ ]` into open ballot box `☐` (U+2610) and `[x]` / `[X]` into box with X `☒` (U+2612).
  - Wired mouseup/click toggle between `☐` and `☒` without inserting accidental newlines.
  - Supported `Enter` key auto-continuation with autofocus on newly generated checkbox lines.
  - Formatted bold without wrapping checkbox glyph and supported format clearing with `format_clear`.
  - Added unit test suite in [`tests/noteCardChecklist.test.js`](file:///home/mike/projects/day-planner/tests/noteCardChecklist.test.js).
- [x] **Themed Calendar Date Pickers & Popovers (commits `609788b`, `7c485fe`, `957fdb7`)**:
  - Implemented custom themed calendar popovers for Today, Month, Index tabs and Master Tasks quick-add Due Date.
  - Expanded interactive hit target to entire button widget (mouseup and click listeners).
  - Fixed top bar overflow clipping (`.header-left { overflow: visible; }`, `z-index: 2000`) so dropdowns render over content.
  - Themed dark/light mode parchment styling with gold accent on today and solid green fill on selected dates.
- [x] **Universal Search Hotkeys & Hyperlink Shortcut Disambiguation (commits `3cbd33f`, `7c485fe`)**:
  - Added `Ctrl+Shift+F` as an alternative universal search shortcut alongside `Ctrl+Shift+K`.
  - Preserved standard `Ctrl+K` for note card hyperlink creation dialog without search modal collision.
- [x] **Note Card Drive Link Modal & Universal Hyperlink Rendering (commits `957fdb7`, `6c762b4`)**:
  - Added tab-off Drive file title auto-lookup with fallback placeholder titles.
  - Fixed Drive v2 `Drive.Files.get` call (`supportsAllDrives: true`).
  - Upgraded `renderInline()` to render markdown links `[text](url)`, autolinks `<url>`, bracket links `[[link:url]]text[[/link]]`, and raw URLs into clickable `<a>` tags with autofocus exit.
  - Added unit test suite in [`tests/noteCardLink.test.js`](file:///home/mike/projects/day-planner/tests/noteCardLink.test.js).
- [x] **OAuth Scope Audit & Deployment Target Diagnosis (commits `957fdb7`, `6c762b4`)**:
  - Reverted unintended broad `https://www.googleapis.com/auth/drive` scope from [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json), enforcing least-privilege `drive.file` and `drive.readonly`.
  - Dispatched Claude Sonnet 5 to review the `DocumentApp.openById` permission invalidation and deployment target discrepancy (`AKfycbxvzu...` vs `AKfycbyTg...`).

## 2026-09-26 — PWA Installability, Maskable Icons & Standalone Window Verification (commits `373f29c`, `34bdfde`, HOME @206, WORK @53)

- [x] **Inline Web App Manifest & Dynamic Blob Fallback (commit `373f29c`)**:
  - Embedded inline JSON manifest via `data:application/manifest+json,...` `<link rel="manifest" id="manifest-link">` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Encoded with 0 literal `//` to avoid Apps Script lexer truncation hazards.
  - Dynamically updates at runtime via a `Blob` URL so `start_url` matches the active execution URL.
  - Standalone physical [`manifest.json`](file:///home/mike/projects/day-planner/manifest.json) committed at root.
- [x] **Maskable & High-Resolution Icons (commit `373f29c`)**:
  - Embedded vector SVG icon via data URI.
  - Generated pixel-perfect standard and maskable 192×192 and 512×512 PNG icons in [`icons/`](file:///home/mike/projects/day-planner/icons/) ([`icon-192.png`](file:///home/mike/projects/day-planner/icons/icon-192.png), [`icon-512.png`](file:///home/mike/projects/day-planner/icons/icon-512.png), [`icon-maskable-192.png`](file:///home/mike/projects/day-planner/icons/icon-maskable-192.png), [`icon-maskable-512.png`](file:///home/mike/projects/day-planner/icons/icon-maskable-512.png)).
  - Provided both embedded data URIs and reliable GitHub raw fallback URLs.
- [x] **PWA Meta Tags & Install Handlers (commit `373f29c`)**:
  - Configured `application-name`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `theme-color` (light `#2d6a5a`, dark `#1b4339`), `apple-touch-icon`, and `mask-icon`.
  - Wired `beforeinstallprompt` and `appinstalled` listeners in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
- [x] **Live Workspace UAT Verified**:
  - Verified menu install into standalone borderless window with OS frame.
  - Fixed top bar, dark mode datepicker contrast, theme-green folio favicon, and Notion-style topic LRU autocomplete verified live.
- [x] **Production Deployments (HOME @206, WORK @53)**:
  - HOME live at `@206` (`AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`).
  - WORK promoted and Version 53 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Remove Copy App Link Button & Accurate Chrome Desktop Shortcut Guide (commit `33566a2`, HOME @205, WORK @52)

- [x] **Copy App Link Button Removal (commit `33566a2`)**:
  - Removed "Copy app link" button and its dead state/methods (`copiedAppUrl`, `copyAppUrl()`) from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Removed trailing quote issue and dead injected `window.__DAY_PLANNER_WEB_APP_URL__` script block.
- [x] **Accurate Chrome Desktop Shortcut Instructions (commit `33566a2`)**:
  - Updated both About tab guide and Install modal dialog to specify exact Chrome steps: `Chrome Menu (⋮) → Save and share (or More tools) → Create shortcut... → Check "Open as window" → Click Create`.
- [x] **Production Deployments (HOME @205, WORK @52)**:
  - HOME live at `@205`.
  - WORK promoted and Version 52 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Top Bar Pinning, High-Contrast Dark Datepickers, Notion-Style LRU Topic Popover, Direct App Link Copier, Install Trigger Fix, & Green/Mint Folio Favicon (commits `4009193`, `0e61981`, `afee716`, `eb69e81`, HOME @203, WORK @49)

- [x] **Fixed Top App Bar (commit `4009193`)**:
  - Pinned `header.single-top-bar` with `position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 1000;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L228) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Added `padding-top: 56px` to `body` and raised modal `z-index: 10000;` so dialogs render above the fixed top bar without bouncing or scrolling away.
- [x] **High-Contrast Dark Mode Calendar Picker Icon (commit `4009193`)**:
  - Inverted calendar indicator icon in dark mode using `filter: brightness(0) invert(1) !important; opacity: 1 !important;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L2877) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L3012), ensuring sharp visibility against dark backgrounds.
- [x] **Notion-Style LRU Topic Autocomplete Dropdown (commit `4009193`)**:
  - Implemented persistent 10-item LRU cache stored in `localStorage` (`dayPlannerTopicLRU`) in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L688) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L1458).
  - Rendered popover dropdown on focus/typing with keyboard navigation (`↑`, `↓`, `Enter`, `Esc`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L439) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L433).
  - Added dedicated "×" delete action on each row to remove items from the LRU cache.
- [x] **Direct App Link Copier RPC Fix (commit `4009193`)**:
  - Replaced sandboxed iframe OAuth URL (`...userCodeAppPanel?createOAuthDialog=true`) by pre-injecting `window.__DAY_PLANNER_WEB_APP_URL__` using `ScriptApp.getService().getUrl()` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L30), and adding `getWebAppUrl()` RPC in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L2248) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js#L669).
- [x] **Install Modal Trigger Self-Close Bugfix (commit `4009193`)**:
  - Added `@click.stop` to trigger buttons in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html#L11) and removed `@click.away` from [`modal-card-install`](file:///home/mike/projects/day-planner/gas-app/Index.html#L1139) to prevent immediate self-closing on document bubble phase.
- [x] **Theme-Green Open Folio Favicon with Minty Outline & Crash Fix (commits `afee716` & `eb69e81`)**:
  - Resolved Google Apps Script `HtmlOutput.setFaviconUrl()` runtime exception (`The favicon icon image type is not supported`) caused by SVG/data URIs by strictly using PNG format.
  - Wrapped every `.setFaviconUrl()` call in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L292) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs#L301) in `try / catch` blocks to safeguard against favicon loading errors.
  - Designed theme-green open folio icon: deep forest green fill (`#163b2f`), binder teal turning leaf (`#2d6a5a`), and bright minty outline (`#6ee7b7`) for high contrast on light tabs (~10:1 ratio) and dark/teal tabs (~9:1 ratio).
  - Generated production PNGs at [`icons/favicon.png`](file:///home/mike/projects/day-planner/icons/favicon.png) (96×96 Retina), [`icons/favicon-32x32.png`](file:///home/mike/projects/day-planner/icons/favicon-32x32.png), and [`icons/favicon-16x16.png`](file:///home/mike/projects/day-planner/icons/favicon-16x16.png), pushed to GitHub `origin/pure-gas-main`, and verified live HTTP 200 via `raw.githubusercontent.com`.
- [x] **Production Deployments (HOME @203, WORK @49)**:
  - HOME live at `@203` (`AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`).
  - WORK promoted via `npm run push:work` and Version 49 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Master Tasks UX Fixes, Quick-Add Due Date, Themed Date Pickers, Category Autocomplete, Install Affordance & Modal Guide (commits `d71ad36`, `6bb391f`, `9123699`, HOME @197, WORK @46)

- [x] **Master Tasks Scroll Container & Thematic Scrollbar Bugfix (commit `d71ad36`)**:
  - Removed `overflow: visible` override from [`figure.table-container`](file:///home/mike/projects/day-planner/src/styles.css#L945) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Strengthened `.master-tasks-table-container` with `overflow-y: auto !important` so custom thematic scrollbars reliably render whenever rows exceed viewport space.
- [x] **Status Filter Label Restoration (commit `d71ad36`)**:
  - Reverted toolbar label back from `"Status filter"` to `"Filter:"` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L585) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L583).
- [x] **Master Tasks Quick-Add Due Date (commit `d71ad36`)**:
  - Added `<input type="date" x-model="newMasterTaskDueDate">` between Task Title and Category in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L649) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L647).
  - Updated [`addMasterTask`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1557) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js), and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) to persist the due date to Google Tasks.
- [x] **Note Card Category Button Geometry Polish (commit `d71ad36`)**:
  - Increased button height from 18px to 20px and updated padding to `0 6px 2px 6px` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L1764) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L1764) to provide +2px bottom spacing for font descenders.
- [x] **About Tab Desktop Install Affordance & Modal Guide (commits `d71ad36` & `9123699`)**:
  - Replaced static `v3.0` text with an interactive Install button (`<button class="btn-install-header">`) with tooltip `Version 3.0 — Click to install Day Planner as a desktop app` in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
  - Added Section 5 action buttons (`Install Day Planner` and `Copy Direct App Link` with instant feedback) in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
  - Added Dialog 4 `<dialog class="modal-card-install">` step-by-step install guide modal in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L1090) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L1252).
  - Removed unrequested `(v1.0-pure-gas)` label from install button tooltip (commit `9123699`).
- [x] **Themed Date Pickers in Light & Dark Modes (commit `6bb391f`)**:
  - Added CSS theming for `.master-task-date-input`, `.master-task-due-date-input`, and `.future-item-date-input` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Set `color-scheme: light / dark` and styled `::-webkit-calendar-picker-indicator` with teal fill in light mode and mint fill in dark mode.
- [x] **Dynamic Category Autocomplete `<datalist>` (commit `6bb391f`)**:
  - Implemented dynamic `<datalist id="category-suggestions">` fed by `availableCategories` computed property in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L865) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Connected `list="category-suggestions"` to category inputs on Master Tasks and Daily Tasks quick-add bars.
- [x] **Dark Mode Outline Secondary Buttons (commit `6bb391f`)**:
  - Restyled `.btn-secondary`, `.install-actions-bar .btn-secondary`, and `.modal-card-install .btn-secondary` in dark mode to clean outline buttons (`background: transparent`, `border-color: #3b8773`, text `#79d6bd`).
- [x] **Master Tasks Move to Date Verification**:
  - Verified working by user in live workspace (`markMasterTaskMoved` calling `encodeTaskStatusNotes`).
- [x] **Production Deployments (HOME @197, WORK @46)**:
  - HOME live at `@197` (`AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`).
  - WORK promoted via `npm run push:work` and Version 46 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Scroll-on-Demand Containers Across All Tabs, Master Tasks Sticky Header & Move Fix, Thematic Scrollbars & Quick-Add UX (commits `a556ac6`, `dbadf81`, `89a5002`, `79bc761`, HOME @194, WORK @41)

- [x] **Scroll-on-Demand Containers & Sticky Headers Across All Tabs (commit `a556ac6`)**:
  - **Index Tab (`monthly-index`)**: Added `.monthly-index-table-container` with `max-height: calc(100vh - 220px); min-height: 280px; overflow-y: auto; overflow-x: auto;` and sticky `thead th` (`position: sticky; top: 0; z-index: 5`) with `min-width: 680px`. The page header stays pinned while decisions scroll.
  - **Future Tab (`future-matrix`)**: Wrapped month cards in `.future-matrix-container` with `max-height: calc(100vh - 200px); min-height: 280px; overflow-y: auto;`. The year navigation `< 2026 >` header stays pinned at the top while the 12 month cards scroll underneath.
  - **About Tab (`about`)**: Added `.about-view-container` with `max-height: calc(100vh - 80px); min-height: 280px; overflow-y: auto; padding: 10px 16px 24px;` providing smooth document scrolling within the app frame.
  - **Daily Tab (`daily`)**: Added `.daily-tasks-table-container` with `max-height: calc(100vh - 240px); min-height: 200px; overflow-y: auto; overflow-x: auto;` and sticky `thead th`. Aligned `section.schedule-list` to `max-height: calc(100vh - 240px); min-height: 280px;` so Tasks, Schedule, and Note Cards all share the exact same responsive viewport height.
  - **Master Tasks (`master-tasks`)**: Retained `.master-tasks-table-container` with `max-height: calc(100vh - 280px); min-height: 280px; overflow-y: auto;` and sticky `thead th`.
- [x] **Master Tasks Sticky Header & Move-to-Date Bugfix (commit `dbadf81`)**:
  - Fixed typo calling nonexistent `encodeTaskStatus(notes, '→')` instead of `encodeTaskStatusNotes('→', notes)` in [`gas-app/Code.gs:1634`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1634), resolving `ReferenceError: encodeTaskStatus is not defined`.
  - Wrapped table in `.master-tasks-table-container` with sticky `thead th` (`position: sticky; top: 0; z-index: 5`) and bottom shadow line separator.
- [x] **Thematic Scrollbars in Dark & Light Modes (commit `89a5002`)**:
  - Slim 8px scrollbar, standard `scrollbar-color` and `scrollbar-width: thin`, WebKit fallbacks with crisp 2px border radius (strictly no pills).
  - Browser `color-scheme: light / dark` synced to theme attribute and `<meta name="color-scheme" content="light dark">`.
  - Light mode: slate-teal thumb `rgba(45, 106, 90, 0.28)`. Dark mode: forest jade thumb `rgba(78, 163, 140, 0.35)`.
- [x] **Master Tasks Quick-Add UX Clarification (commit `79bc761`)**:
  - Explicit `New Task:` section label with `add_task` icon.
  - Tooltips for priority buttons, submit spinner during save, auto-switch to `All Dates` visibility guarantee, and 2s row teal flash highlight.
- [x] **Production Deployments (HOME @194, WORK @41)**:
  - HOME live at `@194` (`AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`).
  - WORK promoted via `npm run push:work` and Version 41 created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Master Tasks Option A: Unified Clearinghouse & Thematic Blue Date Horizon Filters (commit `d685fb4`, HOME @190, WORK @35)

- [x] **Master Tasks Option A: Unified Commitment Clearinghouse & Blue Date Horizon Filters (commit `d685fb4`)**:
  - Renamed status filter toolbar header label from `"Filter:"` to `"Status filter"` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L583) and [`index.html`](file:///home/mike/projects/day-planner/index.html#L583).
  - Added Date Horizon filter button group directly beside the status stamps: `[All Dates]`, `[Future]`, `[Overdue / Today]`, `[Undated]` (specifically `"Future"`, NOT `"Future due"`).
  - Styled Date Horizon filter buttons in thematic archival blue (`var(--ink-blue, #1d5fa8)`, inverted blue active fill, 2px border radius, strictly no pills) with dark-mode support in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L2210) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L2211).
  - Updated [`getMasterTasks`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1523) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js#L207) to retrieve all tasks with `!t.due` PLUS any dated task (`t.due`) that is not complete (`status !== '✓' && status !== 'X' && !isCompleted`).
  - Implemented [`buildMasterTasksClearinghouse`](file:///home/mike/projects/day-planner/src/taskEngine.js#L349) to deduplicate and collapse moved master tasks (`[MovedTo: date, id]` / `[SourceMaster: id]`) into a single logical record displaying the target scheduled date and live status.
  - Added sortable `Due Date` column in Master Tasks table with date stamps (`Sep 28, 2026`, `Overdue`, `Undated`), plus contextual Action buttons (`Jump to Day` for scheduled vs date picker + `Move to Date` for undated).
  - Implemented [`filterTasksByDateHorizon`](file:///home/mike/projects/day-planner/src/taskEngine.js#L322) and wired it to `filteredMasterTasks` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L130) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L905).
  - Added unit test suites for `filterTasksByDateHorizon`, `buildMasterTasksClearinghouse`, and `dueDate` column sorting in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js#L357) and clearinghouse / deduplication tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js#L20).
- [x] **Production Deployments (HOME @190, WORK @35)**:
  - Pushed all 8 files via clasp to HOME, created **Version 190**, and updated production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - Promoted code to WORK via `npm run push:work`, pushed all 8 files, and created **Version 35** on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Note Card Compact Category Segmented Button-Checkboxes & Meet Link Verification (commits `254b6cb` & `1de4bba`, HOME @189, WORK @34)

- [x] **Note Card Compact 18px Category Segmented Button-Checkboxes (commit `254b6cb`)**:
  - Relocated category control from a single bar at the top of the column into `.card-summary-col` directly underneath the `"Set a Topic to index this card"` summary textbox (`.card-heading-input`) inside each note card in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Reduced control height from 26px to **18px** (~33% reduction), font size to `0.68rem`, padding to `0 6px`, checkmark icon to `11px`, and preserved crisp 2px border radius (strictly no pills) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Added `toggleCardCategory(card, cat)` and `isCardCategorySelected(card, cat)` for per-card multi-select toggle behavior in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Serialized categories per card under `###` heading in markdown as `#category: <cats>`, parsed losslessly in `parseDailyNoteToCards()` and [`src/indexParser.js`](file:///home/mike/projects/day-planner/src/indexParser.js).
  - Wired `buildIndexRecords()` to pull each card's categories directly for Monthly Index rendering under `Topic / Category`.
  - Added unit test in [`tests/indexParser.test.js`](file:///home/mike/projects/day-planner/tests/indexParser.test.js).
- [x] **Live Workspace UAT Verification**:
  - Google Meet link in Appointments popup verified by user.
  - Monthly Index Topic indexing verified by user.
- [x] **Production Deployments (HOME @189, WORK @34)**:
  - Deployed HOME Version 189 (`@189`) to deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - Promoted to WORK via `npm run push:work` and cut **Version 34** on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.
  - Tagged `v1.0-pure-gas` at commit `1de4bba`.

## 2026-09-25 — Google Meet Link Extraction & Notes Category Segmented Multi-Pick Toggles (commit `a4eb7b0`, HOME @188, WORK @32)

- [x] **Google Meet Link Extraction in Appointment Modals (commit `a4eb7b0`)**:
  - Enabled `Calendar` v3 advanced service in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json) so `conferenceData` is fetched directly from Google Calendar API.
  - Implemented `extractMeetLinkFromEvent_` helper in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and enhanced `extractMeetLink` in [`src/calendarEngine.js`](file:///home/mike/projects/day-planner/src/calendarEngine.js), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Robustly extracts Meet URLs from `hangoutLink`, `getHangoutLink()`, `conferenceData.entryPoints`, and regex matching across `summary`, `title`, `description`, and `location` with or without `https://` prefix, query parameters, or formatting.
  - Added 4 automated unit tests in [`tests/calendarEngine.test.js`](file:///home/mike/projects/day-planner/tests/calendarEngine.test.js).
- [x] **Notes Category Segmented Multi-Pick Toggles (commit `a4eb7b0`)**:
  - Replaced per-card `<select>` dropdown with a tactile segmented button bar `[ Work | Personal | Meeting | Decision | Project ]` located directly below "Daily Notes for [Date]" heading in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Implemented multi-select checkbox toggle behavior (`.category-segment-btn`) with 2px border radius, forest teal active state, checkmark icon, and strictly no pills.
  - Eliminated horizontal header crowding on note cards.
- [x] **Category Persistence & Monthly Index Propagation (commit `a4eb7b0`)**:
  - Serialized active categories as `#category: <values>` at top of daily notes in [`syncCardsToDailyNote`](file:///home/mike/projects/day-planner/gas-app/Script.html), persisting reliably and idempotently to Google Docs without duplicating.
  - Parsed `#category:` in [`parseDailyNoteToCards`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/indexParser.js`](file:///home/mike/projects/day-planner/src/indexParser.js).
  - Propagated categories to Monthly Index table `Topic / Category` column, rendering bold topic titles alongside archival teal letterpress stamps (`.index-category-stamp`).
  - Added unit test in [`tests/indexParser.test.js`](file:///home/mike/projects/day-planner/tests/indexParser.test.js).
- [x] **Production Deployments (HOME @188, WORK @32)**:
  - Deployed HOME version 188 (`@188`) to `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - Promoted to WORK via `npm run push:work` and cut Version 32 on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.

## 2026-09-25 — Google Doc Option 3 Idempotent Replace Plumbing & Nomenclature Reconciliation (commit `07f528d`)

- [x] **Google Doc Option 3 Architecture & Idempotent Replace Plumbing (commit `07f528d`)**:
  - Fixed `saveDailyDocCards` and `getOrCreateDailyDocContent` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1030-L1150) to implement idempotent day section replacement in reverse index order, eliminating duplicate day appends on repeated saves.
  - Implemented `isDayHeadingElement_` and `isAnyDayHeadingElement_` helpers supporting native HEADING2 and day formatted string detection with safe multi-element extraction.
  - Added unit test suite with 3 comprehensive tests in [`tests/gasDocIdempotency.test.js`](file:///home/mike/projects/day-planner/tests/gasDocIdempotency.test.js).
- [x] **Reconcile Specification & UI Copy Terminology (commit `07f528d`)**:
  - Reconciled [`REQUIREMENTS.md`](file:///home/mike/projects/day-planner/REQUIREMENTS.md#L59) and [`PRD.md`](file:///home/mike/projects/day-planner/PRD.md#L36) so "2-Page Daily Spread", "Daily 3-Column View", and "Today" / "Daily Page" nomenclature are explicitly aligned.

## 2026-09-25 — Master Tasks Status Filter Toggles, Monthly Overview Full Expansion & Y-Scroll, Daily Page Jump Navigation (commits `1426e7f` & `81b75c3`)

- [x] **Master Tasks Status Filter Toggles (Option A: Status Glyph Stamp Toggles, commit `1426e7f`)**:
  - Implemented compact, flat stamp toolbar directly in Master Tasks header: `[All] [ • Open ] [ ○ In Progress ] [ ✓ Done ] [ → Forward ] [ X Canceled ] [ Ⓓ Delegated ]`.
  - Adhered strictly to flat 2px radius stamp aesthetic (zero pills), inverted forest teal fill (`#2d6a5a`) when active, parchment hairlines when inactive.
  - Implemented `filterTasksByStatus` in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) with normalization between `Ⓓ` and `D/✓`.
  - Added unit test suite with 6 tests in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js).
  - Added 1-click toggle between All and Open-only (`•`), plus empty-state messaging with 1-click reset link.
- [x] **Monthly Overview Full-Screen Expansion & Y-Scroll On-Demand (commit `1426e7f`)**:
  - Eliminated 2 wasted screen inches at bottom by upgrading [`.monthly-calendar-container`](file:///home/mike/projects/day-planner/src/styles.css) to `flex: 1 1 0; min-height: 0;` and binding dynamic grid row sizing `:style="{ gridTemplateRows: 'repeat(' + (monthlyGrid.length / 7) + ', minmax(0, 1fr))' }"`.
  - Added weekday column header row `[Sun | Mon | Tue | Wed | Thu | Fri | Sat]`.
  - Wrapped day cell events in [`.calendar-day-events`](file:///home/mike/projects/day-planner/src/styles.css) with `overflow-y: auto`, slim scrollbars, and unconstrained event height (`flex: 0 0 auto !important; min-height: 20px;`) preventing squishing on dense days (e.g. Sept 25, 2026).
  - Seeded 8 realistic mock appointments for `2026-09-25` in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js).
- [x] **Monthly Index 5th Column "Daily Page" & "Source Doc" Alignment (commit `81b75c3`)**:
  - Added in-app router navigation column `Daily Page` with verb-based cell button `Jump to Day` (`.btn-jump-day` with `arrow_forward` icon).
  - Renamed neighboring column header from `Direct Doc Link` to `Source Doc` (`View Google Doc`) for clear in-app vs. external distinction.
  - Implemented `jumpToDailyPage(date, topic)` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) to navigate to the 3-column daily workspace and auto-expand matching topic cards.
  - Added full UX & Tech Writer advisory report to [`docs/CONSULT-monthly-index-and-doc-formatting.md`](file:///home/mike/projects/day-planner/docs/CONSULT-monthly-index-and-doc-formatting.md).

## 2026-09-25 — Master Tasks Parity, Monthly Index Polish, Month Picker with Year Nav, and Deployment (commit `95e45b5`, HOME @185, WORK @26)

- [x] **Master Tasks Feature Parity with Daily Tasks (commit `95e45b5`)**:
  - Added letterpress segmented priority buttons (`A` | `B` | `C`) with hover titles, access keys, and rounded outer corners on A (NW/SW) and C (NE/SE) in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Added inline `#a`, `#b`, `#c` prefix detection in input title to dynamically set priority.
  - Added keyboard shortcuts: `Alt+A/B/C` and `Ctrl+Shift+A/B/C` switch priority and focus the master task input when on the `master-tasks` view.
  - Implemented 5 sortable table columns: Priority (`Pri`), Status (`Sts`), Task Description, Category, Action.
  - Added status glyph dropdown popup menu with Delete item on each master task row.
  - Added dedicated `[Delete]` button (`.btn-delete-row` with trashcan icon) directly to the right of `[Move]` button on each master task row.
  - Added sticky note indicator icon with popover hover/click displaying notes without clipping (`notesPopoverDropUp`).
  - Added star toggle (`★`/`☆`), priority column badges (`.priority-badge`), and multi-column sorting (`sortTasksByColumn`).
  - Implemented backend RPC and bridge methods `updateMasterTask(taskId, updates)` and `deleteMasterTask(taskId)` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js), and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Added status mirroring from master tasks to moved daily tasks via `meta.movedTaskId`.
- [x] **Monthly Index Polish & Authentic Direct Doc Links (commit `95e45b5`)**:
  - Renamed Monthly Index header to "Monthly Index and Decisions" across [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Formatted "Summary Highlight" column with rich text formatting using `x-html="renderCardLine(idx.summary, false)"`.
  - Fixed "DIRECT DOC LINK": extracted authentic Google Doc URLs (`https://docs.google.com/document/d/...`) from `getDailyData` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and enforced valid `https://docs.google.com/document/...` via `getDirectDocUrl(url)`, eliminating broken `https://<id>.script.googleusercontent.com/...` URLs.
- [x] **Top Navbar Month Picker Hover-Drop & Year Stepper (commit `95e45b5`)**:
  - Added hover-drop (and click/double-tap) month picker dropdown to `< This Month >` in the top navbar across [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Built Year Nav header with `< [Year] >` stepper and 4x3 month grid directly in the dropdown, allowing 2-click jumps to any month in previous or future years without 12 single-month clicks.
  - Highlighted current calendar month with gold accent border and active selected month with solid binder green fill.
- [x] **Deployments (HOME @185, WORK @26)**:
  - HOME prod deployed at Version 185 (`@185`) to `AKfycbx1pgqPIlEXqPwH9JvPnz0vKX5iP5zlfY4ArvUTDSVzIc0_A2wkMUp5-iouKVAp_46PRg`.
  - WORK prod code pushed and Version 26 created targeting deployment `9csO` (`AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO`).

## 2026-09-25 — Appointment Modal Expansion, Task Status Dropdown & Visual Polish (commits `cffc7a6` through `6deca7e`, HOME @184, WORK @25)

- [x] **Fix Tasks Status Popup Menu & Note Popover Bottom Clipping (commit `cffc7a6` & `bd803ee`)**:
  - Implemented dynamic dropup detection for both the Status Menu and Note Popover across [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), preventing bottom clipping on rows near the end of the list without requiring user scrolling.
  - Set `overflow: visible` and removed `max-height` from `.task-title-cell` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
- [x] **Add Runtime Environment JSDoc Headers & Golden Active Navbar Accent (commit `75cdeeb`)**:
  - Added comprehensive JSDoc headers to [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) detailing the two runtime environments (Local Dev vs Google Apps Script Production bundle).
  - Replaced the minty accent (`#58bfa2`) with authentic gold-foil stamp color (`#d4a017`) on the active navbar tab indicator (`.segment-btn.active`).
- [x] **Add Task Status Dropdown Delete Item & Update Delegated Label (commit `2d94772`)**:
  - Added "Delete" item with trashcan icon and separator to the Daily Tasks Status dropdown menu.
  - Implemented `deleteDailyTask` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Changed Tasks Status menu label from "Delegated (Done)" to "Delegated".
- [x] **Add Priority Button Hover Titles, Keyboard Shortcuts & Inline Prefix Parsing (commit `21a551d`)**:
  - Added button hover titles (`title="A: Top priority (Alt+A or #a)"`, etc.) and `accesskey="a/b/c"`.
  - Added global and field keyboard shortcuts for `Alt+A/B/C` and `Ctrl+Shift+A/B/C`.
  - Added inline priority prefix detection: typing or pasting `#a`, `#b`, `#c` sets priority.
- [x] **Fix Appointment Modal HTML/Plain-text Description & gCal Link (commit `6f25dc2`)**:
  - Sanitized and rendered HTML descriptions; escaped plain-text descriptions in `<pre>`.
  - Resolved authentic event `htmlLink` via `Calendar.Events` or hand-built `base64url`.
- [x] **Expand Appointment Modal by 33% & Support Google Meet Links (commit `6deca7e`)**:
  - Expanded modal dimensions by ~33%: max-width 735px, min-height 460px.
  - Added close button in header.
  - Enhanced Google Meet link extraction across Google Calendar API v3 and CalendarApp fallback; added dedicated video meeting link row.

- [x] **Dotted Outline Removal on Star Toggle (commit `c6af794`)**:
  - Removed persistent dashed border around task star toggle on click using `:focus:not(:focus-visible) { outline: none; }` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
- [x] **Local Timezone Appointments & Undated Task Backlog Filtering (commit `ed3a7f7`)**:
  - Fixed appointment times appearing in GMT by formatting events with user/session timezone in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/calendarEngine.js`](file:///home/mike/projects/day-planner/src/calendarEngine.js).
  - Filtered open tasks without due dates out of daily tasks view so they strictly remain in the Master Tasks backlog.
- [x] **Panel Header Alignment, Headings, and Parchment Background Harmony (commit `3fb1ad6`)**:
  - Harmonized Daily Notes panel background to parchment cream `#fcfbfa` matching Tasks and Appointments.
  - Renamed headers to plural "Appointments" and "Notes".
  - Vertically aligned horizontal divider lines across all 3 column headers.
- [x] **Appointment Click Event Modal & Google Calendar Deep Link (commit `dcb2b31`)**:
  - Wired appointment pills in the daily schedule to open an Event Details modal showing start/end time, summary, description, Google Meet link, and a direct link to open the event in Google Calendar in a new tab.
- [x] **Thematic Non-Alert Priority Colors (commit `ef8ffba`)**:
  - Replaced red and orange priority colors with authentic, non-alert thematic palette: Priority A Archival Ink Blue (`#1d5fa8`), Priority B Bookbinder Plum (`#5e3f6b`), Priority C Forest Green (`#2d6a5a`).
  - Applied across `.priority-badge` and segmented priority selector `[ A | B | C ]` for light and dark themes in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Decoupled note delete buttons from priority token to avoid color collisions.
- [x] **Deployments (HOME @176, WORK @13)**:
  - HOME prod deployed at Version 176 (`@176`) to `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - WORK prod code pushed and Version 13 created targeting deployment `9csO` (`AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO`).

## 2026-09-25 — Phase 6: Production Release v1.0-pure-gas & Live Workspace UAT (tag `v1.0-pure-gas`, commit `e789ca8`)

- [x] **Repository Housekeeping & CDP Tooling Tracking (commit `e789ca8`)**:
  - Added `screen-shots/` and root `/*.png` (except [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)) to [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Tracked canonical test tools [`tools/ensure-chrome.js`](file:///home/mike/projects/day-planner/tools/ensure-chrome.js), [`scripts/ensure-chrome.sh`](file:///home/mike/projects/day-planner/scripts/ensure-chrome.sh), and [`tools/open-dev-playwright.js`](file:///home/mike/projects/day-planner/tools/open-dev-playwright.js).
- [x] **Production Git Release Tagging**:
  - Tagged `pure-gas-main` at release commit as `v1.0-pure-gas` and pushed to remote origin.
- [x] **Live Workspace UAT & Run Log Verification**:
  - WORK Prod Web App validated at Version 8 on GSA Google Workspace.
  - HOME Prod Web App (`@171`) and self-test suite verified.
  - Google Drive `Day Planner - Run Log` sync execution logging confirmed.


- [x] **Proposal B Letterpress Segmented Priority Selector (commit `de02715`)**:
  - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html), replaced `<select class="task-priority-select">` with compact letterpress stamp tabs `[ A | B | C ]` bound to `newTaskPriorityGroup`.
  - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), added `.priority-segmented-group` and `.priority-segment-btn` with Day Planner design tokens (sharp 2px border radius, strictly no pills).
  - Implemented authentic color-coded active states: Priority A Brick Red (`#dc2626`), Priority B Warm Ochre (`#d97706`), Priority C Binder Teal (`#2d6a5a`) with inset letterpress stamp shadow.
  - Retained sticky priority memory for rapid bulk entry; typing a task title and pressing `Enter` submits immediately with the active priority tab.
  - Supported dark theme (`[data-theme="dark"]`) with tailored borders and backgrounds.

- [x] **1-Click Column Focus / Maximize Mode (commit `de02715`)**:
  - In [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html), added maximize button with Material Symbols `open_in_full` / `close_fullscreen` to Tasks, Appointments, and Daily Notes headers.
  - In [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), added ephemeral state `maximizedColumn: 'tasks' | 'appointments' | 'notes' | null`, `toggleMaximizeColumn(name)` action, and global `Escape` key shortcut listener.
  - In [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), applied `.two-page-spread.has-maximized-column .page-panel:not(.is-maximized) { display: none !important; }` and `.page-panel.is-maximized { width: 100% !important; flex: 1 1 100% !important; }`. Zero `localStorage` corruption occurs, preserving user column drag widths permanently.

- [x] **Pure GAS Main Fast-Forward Merge, HOME Release @171, and WORK Promotion**:
  - Fast-forward merged `feat/modern-normalize` cleanly into `pure-gas-main`.
  - Deployed new release version on HOME (`@171`) via `clasp version` and `clasp deploy`.
  - Promoted full vetted codebase to WORK (`1980roEKgkC_...`) via `npm run push:work` and created Version 8 on WORK.
  - Verified 100% browser behavior and accessibility across views, themes, and shortcuts with Playwright test suite.

## 2026-09-24 — CSS Architecture Decoupling (`modern-normalize`), Narrow Tasks Add Button Overflow & Appointment Collapse Fixes (commits `544d690` and `7f8e432`)

- [x] **Decouple from Pico CSS to `modern-normalize@3.0.1` (commit `544d690`)**:
  - Branched off `pure-gas-main` onto isolated feature branch `feat/modern-normalize`.
  - Replaced `@picocss/pico@2` with `modern-normalize@3.0.1` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L1) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L2), removing aggressive element hijacking (`button`, `[role="button"]`, `<article>`).
  - Replaced all 39 occurrences of `--pico-*` CSS variables with native Day Planner tokens (`--binder-teal`, `--bg-parchment`, font stacks).
  - Authored unopinionated base styles for form controls (`input`, `select`, `textarea`, `a`, `button`) with dual-theme focus states.
  - Added desktop header flex-wrap safeguard (`min-width: max-content` on `.header-left`) preventing month header truncation at 1440px.
  - Verified 0 console errors and 0 page errors across all 5 views + About + Search Modal in both Light and Dark themes via Playwright.
- [x] **Fix Tasks Column `[+]` Button Overflow in Narrow Viewports (commit `7f8e432`)**:
  - Diagnosed: when the Tasks column is narrow (<340px), `.task-priority-select` (`min-width: 130px`) plus `<input>` default sizing (`min-width: auto`, ~160px) caused the container to overflow, pushing the green `[+]` add button out of the column and floating over the column divider.
  - Fixed in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L625-L665) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L625-L665):
    - Changed `form.task-quick-add-bar` to `display: flex; flex-wrap: wrap; width: 100%; max-width: 100%; box-sizing: border-box;`.
    - Set `.task-priority-select` to `min-width: 0; flex: 0 0 auto; padding: 6px 20px 6px 8px;`.
    - Set `.task-input-field` to `flex: 1 1 140px; min-width: 120px; box-sizing: border-box;`.
    - Added `overflow-x: clip; min-width: 0;` to `article.page-panel` so child controls never bleed outside column bounds.
- [x] **Fix Appointment Items Row Collapse, Overlapping Pills & Readability (commit `7f8e432`)**:
  - Diagnosed: in `section.schedule-list` (flex column with `max-height: 420px`), `.schedule-row` had default `flex-shrink: 1` and `min-height: 32px`, forcing all rows to collapse to 32px. When multiple events occurred in the same slot (or all-day events at 7:00 AM), content expanded to 150px+ and bled over lower rows. Furthermore, `.schedule-content` lacked column flex layout, causing `inline-flex` event pills to collide and cover each other.
  - Fixed in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L940-L1015) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L940-L1015):
    - Set `.schedule-row` to `flex: 0 0 auto; align-items: stretch; min-height: 36px;` so rows expand dynamically to fit all events without collapsing or bleeding.
    - Set `time.schedule-time` to `align-self: stretch; min-width: 85px; flex-shrink: 0;` ensuring time labels stretch seamlessly to row height.
    - Set `.schedule-content` to `display: flex; flex-direction: column; gap: 6px; min-width: 0;`.
    - Set `button.event-pill, div.event-pill` to `display: flex; width: 100%; max-width: 100%; box-sizing: border-box; padding: 6px 10px;`.
    - Set `.event-pill-text` to `overflow: hidden; text-overflow: ellipsis; word-break: break-word;` eliminating clipping while preserving multiline readability.
  - Pushed to HOME script (`1XUrbUS55yQf_...`) at `@HEAD` via `clasp push`.

- [x] **Tasks Column Star Toggle Pill Removal (commit `c957ba2`)**:
  - Diagnosed oversized 51×45px dark green button pill wrapping the star toggle in the Daily Tasks column: Pico CSS applies full button styling (`padding: 12px 16px`, solid background, border, border-radius) to any element matching `[role="button"]` or `<button>`.
  - Reset `.star-toggle` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L709-L747) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L710-L748) with `background: transparent !important`, `border: none !important`, `padding: 0 !important`, `box-shadow: none !important`, and `width/height: auto !important`.
  - Converted `<span role="button">` to semantic `<button type="button" class="star-toggle">` in [`index.html`](file:///home/mike/projects/day-planner/index.html#L216) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L216) for native keyboard accessibility (Enter and Space) and WCAG compliance.
  - Added `.star-toggle` to shared interactive resets and configured dark mode color/hover overrides. Verified via Playwright screenshot inspection.
- [x] **CSS Framework Architectural Evaluation**:
  - Evaluated Pico CSS vs DaisyUI vs Water.css vs Sakura vs Pure.css vs `modern-normalize` vs MVP.css.
  - Determined that classless libraries (Pico, Water, Sakura, MVP.css) fight Day Planner's 2,830 lines of bespoke CSS.
  - Determined that `modern-normalize` is the optimal architectural foundation because Day Planner already defines 95%+ of its own styling, and light/dark theme support requires zero extra effort since `[data-theme="dark"]` is already completely authored in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Selected strategy: create an isolated branch (`feat/modern-normalize`) to build and verify the `modern-normalize` implementation without risking `pure-gas-main`.

## 2026-09-24 — Enterprise Drive Permissions, Auto-Creation & WORK Version 5 Promotion

- [x] **Drive Auto-Creation & Enterprise Permission Fix (@168 / WORK @5)**:
  - Fixed "Invalid Folder URL or Access Denied" occurring in GSA Google Workspace domain by refactoring [`getValidatedRootFolder`](file:///home/mike/projects/day-planner/gas-app/Code.gs) to automatically create `Day Planner` root folder using Advanced Google Drive Service (`Drive.Files.insert`) under `drive.file` scope (commit [`7d43286`](file:///home/mike/projects/day-planner)). Zero manual folder creation or URL pasting required on fresh workspace accounts.
  - Refactored [`validateAndSaveFolderUrl`](file:///home/mike/projects/day-planner/gas-app/Code.gs) to support Google Workspace enterprise domains where `folder.getOwner()` returns `null` or hides email addresses, checking `Drive.Files.get` write capabilities (`editable` / `writer` / `owner`) instead of assuming consumer Gmail ownership structures.
  - Deployed to HOME at Version 168 (`@168`).
  - Pushed to WORK script (`1980roEKgkC_...`), purged stale `Basic test` stub from `@HEAD`, and created immutable **Version 5** (`@5`).

## 2026-09-24 — Dual-Environment Isolation, Promotion Pipeline & WORK Version 2 Promotion

- [x] **Setup Isolated Promotion Pipeline (HOME -> WORK)**:
  - Disambiguated and confirmed active projects: `Day Planner HOME` (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`) and `Day-Planner-WORK` (`1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`).
  - Created [`gas-app/.clasp-work.json`](file:///home/mike/projects/day-planner/gas-app/.clasp-work.json) targeting WORK, leaving [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json) permanently locked to HOME mastercopy (commit [`255f1fe`](file:///home/mike/projects/day-planner)).
  - Built [`tools/promote-to-work.js`](file:///home/mike/projects/day-planner/tools/promote-to-work.js) (`npm run push:work`) with pre-flight linting, character checks, and 88 unit tests.
  - Authorized WORK access by sharing `Day-Planner-WORK` as Editor with `mhoffman02@gmail.com`.
  - Promoted full vetted codebase (8 files) to WORK and created immutable **Version 2**.
  - Documented strict invariants in [`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md) and [`.claude/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.claude/rules/gas-environments.md) (commit [`bf391ab`](file:///home/mike/projects/day-planner)).
  - Wired into persistent memory ([`promote_to_work_pipeline.md`](file:///home/mike/.claude/projects/-home-mike-projects-day-planner/memory/promote_to_work_pipeline.md), [`MEMORY.md`](file:///home/mike/.claude/projects/-home-mike-projects-day-planner/memory/MEMORY.md)), and added slash command `/push-work` across `.agents/commands/`, `.claude/commands/`, and `.kilo/workflows/` (commit [`05d7102`](file:///home/mike/projects/day-planner)).

## 2026-09-24 — Circled-D Status Glyph, Priority Dropdown, Vertically Centered Add Button, Plain-Text Metadata, Option A Calendar Decoupling & Manifest Cleanup (@163–@166)

- [x] **Circled-D Status Glyph (`Ⓓ`) (@163)**:
  - Replaced `D/✓` with **`Ⓓ`** (`U+24B9`, Circled Capital D) in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) (commit [`11773e5`](file:///home/mike/projects/day-planner)).
  - Fits cleanly in 28×28px `.status-btn` with zero text overflow. Fully backward-compatible with legacy `D/✓` tasks.
- [x] **Priority Dropdown Width & Padding (@163)**:
  - Expanded `.task-priority-select` in [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) to `min-width: 130px; padding: 6px 28px 6px 10px;`.
  - Eliminates text clipping of "Priority A/B/C" ahead of dropdown chevron.
- [x] **Add Task `[+]` Button Vertical Centering (@163)**:
  - Added `align-items: center;` to `form.task-quick-add-bar` and `align-self: center;` to `.btn-add-task-round` in [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
- [x] **Clean Plain-Text Google Tasks Metadata (@163)**:
  - Refactored [`encodeTaskMeta`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`encodeTaskStatusNotes`](file:///home/mike/projects/day-planner/gas-app/Code.gs) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Newly created tasks with default category `General` and no notes now write 100% blank notes (`""`), eliminating `<!--dp-meta:{"category":"General"}-->`.
  - Non-default metadata uses human-readable bracket tags (e.g. `[Category: Work]`, `[Status: Ⓓ]`). Backwards-compatible with legacy `<!--dp-...-->`.
- [x] **Decouple Tasks from Calendar Appointments (Option A) (@164)**:
  - User selected Option A (separate & clean).
  - Modified [`syncWorkspaceChanges()`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`trigger2WaySync()`](file:///home/mike/projects/day-planner/gas-app/Script.html) so tasks never auto-create 30-minute blocks on Google Calendar (commit [`907bd9e`](file:///home/mike/projects/day-planner)).
- [x] **PWA Manifest & Relative Icon Cleanup (@166)**:
  - Removed dead `<link rel="manifest" href="manifest.json">` and icon tags from [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) (commit [`bc6fc9c`](file:///home/mike/projects/day-planner)).
  - Eliminates Chrome DevTools console `Syntax error: <!doctype html>` caused by Chrome requesting `manifest.json` from Google Apps Script.
  - Verified live in Chrome CDP: 0 console syntax errors, full 3-column binder UI rendered.

- [x] **Top-Level RPC Delegator Export (@160)**:
  - Added top-level function declarations outside the IIFE in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) for all 18 `google.script.run` RPC methods (commit [`838ac23`](file:///home/mike/projects/day-planner)).
  - Deployed Version 160 (`@160`).
- [x] **Production Self-Test Diagnostics Verification**:
  - Tested Production diagnostic suite at [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test). Confirmed 100% HEALTHY / All 5 suites Pass (Drive, Tasks, Calendar, Docs, Sync Trigger).
- [x] **Alpine.js Sandboxed-Iframe Load Order Fix (@161)**:
  - Discovered and resolved Alpine race condition (per historical commit [`b86e451`](file:///home/mike/projects/day-planner)): moved Alpine CDN script tag (`alpinejs@3.14.8/dist/cdn.min.js`) synchronously to the bottom of `<body>` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) after `include('Script')`, removing the deferred tag from [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) so `plannerApp` registers before Alpine scans the DOM (commit [`d1d0c73`](file:///home/mike/projects/day-planner)).
  - Added `_runRpc` readiness polling in `GASBridge` in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) to wait up to 3s for `window.google.script.run[method]` stubs to be synthesized by Apps Script.
- [x] **HtmlService String Truncation Resolution (@162)**:
  - Diagnosed `SyntaxError: Failed to execute 'write' on 'Document': Invalid or unexpected token` at `insertLineLink` on line 1381 of [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html): Google Apps Script's `HtmlService.createHtmlOutputFromFile().getContent()` has an interpreter bug that silently truncates lines at literal `//` inside strings (e.g. `'https://...'`) and at apostrophes in comments (per historical commit [`087b7ef`](file:///home/mike/projects/day-planner)).
  - Restored [`tools/check-gas-script-html-safe-chars.js`](file:///home/mike/projects/day-planner/tools/check-gas-script-html-safe-chars.js) using `acorn` tokenization to detect truncation triggers.
  - Fixed all 9 triggers across [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), splitting URL literals into `'https:' + '/' + '/...'` and sanitizing comments (commit [`28286f5`](file:///home/mike/projects/day-planner)).
  - Deployed Version 162 (`@162`) to pinned production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - User tested and verified in Chrome: Daily binder workspace (tasks, schedule, notes) loads cleanly and completely.
- [x] **Linter & Pre-Commit Hook Integration**:
  - Added [`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md) and synced to [`.claude/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.claude/rules/gas-html-safe-chars.md).
  - Added `"check:gas-safe-chars"` to [`package.json`](file:///home/mike/projects/day-planner/package.json) and chained into `npm run lint`.
  - Created executable [`.githooks/pre-commit`](file:///home/mike/projects/day-planner/.githooks/pre-commit) to prevent committing or pushing files with literal `//` in strings or unsanitized comments (commit [`c4a292a`](file:///home/mike/projects/day-planner)).

## 2026-09-23 — Minimal doGet Baseline Testing, Domain Diagnosis & HOME Script Migration

- [x] **Minimal `doGet()` Baseline Test Endpoint**:
  - Implemented top-level minimal `doGet(e)` returning `<h1>Basic test</h1><p>Pass</p>` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L23-L25) to isolate Apps Script web-app serving issues from application render complexity.
  - Preserved original complete implementation as [`doGet_original(e)`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L309-L373) inside the IIFE and updated delegator export `global._doGetInternal = doGet_original`.
  - Preserved top-level wrapper as [`doGet_original_wrapper(e)`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1839-L1841).
- [x] **Deployment Domain & Access Root Cause Analysis**:
  - Identified root cause of Prod URL render failure: frozen Version 151 deployment contained deprecated `addMetaTag('mobile-web-app-capable', ...)` calls that Google Apps Script `HtmlOutput` rejects with `The meta tag you specified is not allowed in this context`.
  - Diagnosed `Only users in the same domain as the script owner may deploy this script` error: `~/.clasprc.json` was logged into `michael.hoffman@gsa.gov` (`gsa.gov`) while script owner is `mhoffman02@gmail.com` (`gmail.com`).
  - Clarified that Google restricts `/dev` strictly to project editors/owners; non-owner work accounts receive "Page not found".
- [x] **HOME vs WORK Script Disambiguation**:
  - Disambiguated HOME script (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`, owned by `mhoffman02@gmail.com`) from WORK script (`1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`, owned by `michael.hoffman@gsa.gov`).
  - Re-targeted [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) to HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`.
  - Re-authenticated clasp to `mhoffman02@gmail.com` via `clasp login`.
- [x] **Full doGet Restoration & Production Release (@159)**:
  - Verified baseline connectivity on HOME dev `@HEAD` (`Basic test Pass`).
  - Restored full `doGet` delegator in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1824-L1832) to route all requests through `_doGetInternal`.
  - Deployed to pinned production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` at Version 159 (`@159`).
  - Resolves `getDailyData is not a function` error previously seen on Prod by exporting top-level delegators for Google Apps Script AST parser.

## 2026-09-23 — Runtime Permissions, Drive moveTo Fix & Server Run Log Engine

- [x] **OAuth Scope Minimal Permission Resolution**:
  - Identified `DriveApp.getFolderById` failure throwing `Specified permissions are not sufficient (drive.readonly || drive)`.
  - Added minimal `"https://www.googleapis.com/auth/drive.readonly"` scope to [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json) without requesting broad `drive` (commit [`abcdf03`](file:///home/mike/projects/day-planner)).
- [x] **Drive `moveTo` Least-Privilege Elimination**:
  - Eliminated `DocumentApp.create()` + `docFile.moveTo(targetFolder)` pattern which required Google's broad `https://www.googleapis.com/auth/drive` scope.
  - Enabled `Drive` Advanced Service (`drive: v2`) in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json).
  - Created [`getOrCreateMonthlyNotesDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L607) helper in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) using `Drive.Files.insert({ title, mimeType, parents: [{id: targetFolder.getId()}] })` to create monthly docs directly in the destination folder under `drive.file` scope.
  - Wrapped fallback `moveTo` in `try/catch` so an unhandled exception cannot crash `syncWorkspaceChanges()` (commit [`ea39b71`](file:///home/mike/projects/day-planner)).
- [x] **In-App Server Execution Log Ring Buffer & Report**:
  - Implemented persistent 25-entry ring buffer in `UserProperties` (`RECENT_SERVER_LOGS`) via `recordServerLog(level, context, message, stack)`.
  - Upgraded [`logError()`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L93) and added [`logWarn()`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L107) to record structured events and stack traces.
  - Rendered **Recent Server Execution Logs** table on `/self-test` diagnostic page with level badges (strictly 4px radius per `no-pills.md`), timestamps, contexts, and expandable stack traces.
  - Added raw JSON endpoint `?view=logs&format=json` and Clear Logs action `?view=self-test&clear_logs=1` (commit [`ecf9850`](file:///home/mike/projects/day-planner)).
- [x] **Permanent Google Doc Run-Log Engine**:
  - Evaluated Google Sheets vs. Google Docs for run logs against least privilege. Chose Google Docs to leverage existing `documents` and `drive.file` scopes with zero new OAuth scopes required.
  - Built [`appendRunLogToDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74) and [`getRunLogDocUrl`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L173), writing timestamped Consolas monospace log entries to `Day Planner - Run Log` inside the Day Planner Drive folder.
  - Caches doc ID in `UserProperties` (`DAY_PLANNER_RUN_LOG_DOC_ID`) for single-roundtrip appends.
  - Added **📄 Open Google Doc Run Log** button on self-test diagnostic report (commit [`32084b9`](file:///home/mike/projects/day-planner)).
- [x] **Production Release Deployment ID Pinned**:
  - Pinned target production deployment ID `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) and [`HANDOFF.md`](file:///home/mike/projects/day-planner/HANDOFF.md) for all future `/exec` releases (commit [`1d2eb50`](file:///home/mike/projects/day-planner)).

## 2026-09-23 — Phase 5 Verification, A11y & Clasp Deployment Gate

- [x] **Local Smoke Testing & Safe Chars Check**:
  - Verified Apps Script template scriptlets across [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) with 0 single-line `//` comment truncation hazards.
  - Built automated headless Chrome CDP smoke test suite in [`tools/smoke-test.js`](file:///home/mike/projects/day-planner/tools/smoke-test.js) and configured `npm run smoke` in [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Verified all 5 active views (Daily, Month Calendar, Master Tasks, Monthly Index, Future Planning), Universal Search modal (`Ctrl+K`), and theme toggle execute with zero console/runtime exceptions (commit [`2a43cc9`](https://github.com/mhoffman02/day-planner/commit/2a43cc9)).
- [x] **WCAG Contrast & Responsive Viewport Verification**:
  - Built automated accessibility and responsive audit suite in [`tools/audit-wcag-responsive.js`](file:///home/mike/projects/day-planner/tools/audit-wcag-responsive.js) and configured `npm run audit:a11y` in [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Verified 100% of top-bar and panel headers pass WCAG 2.1 AA/AAA contrast ratios across both light parchment (`#fcfbfa`) and dark mode (`#0c1813` / `#142820`) palettes.
  - Verified zero horizontal overflow across all 5 views at 1440px, 1200px, 992px, and 768px viewports (commit [`3e9076a`](https://github.com/mhoffman02/day-planner/commit/3e9076a)).
- [x] **Phase 5 Clasp Development Deployment Gate**:
  - Pushed all 8 project files (`About.html`, `appsscript.json`, `Code.gs`, `Index.html`, `Script.html`, `SetupFolder.html`, `Styles.html`, `UnitTests.gs`) to Google Apps Script dev deployment `@HEAD` via `clasp push`.
  - Verified self-test diagnostic endpoint routing (`/dev?view=self-test`) and manual execution readiness in Apps Script IDE.

## 2026-09-23 — Header Overlap Fix & Kilo Configuration

- [x] **Navbar Text Overlap on Month View Resolved**:
  - Restored header flex pinning and min-width reservations from git history (`dc5ea69`, `34285fd`, `af66d01`, `f14e34b`, `77f1d21`) in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Pinned `.header-left` and `.header-actions-compact` to `flex: 0 0 auto; min-width: 0;` (with `overflow: hidden;` on `.header-left`), re-enabling `flex: 1 1 0` centering only at `@media (min-width: 1400px)`.
  - Restored `min-width: 280px;` on `.date-nav-compact` so undated views (Master Tasks) do not cause horizontal tab jitter.
  - Sized `.today-jump-btn` to `min-width: calc(10ch + 12px); text-align: center;` and `.date-text-display` to `min-width: calc(14ch + 4px); overflow: hidden; text-overflow: ellipsis;`.
  - Replaced dynamic `x-text="currentMonthName"` on Month view `.today-jump-btn` with static `This Month` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html) to eliminate duplicate "September" adjacent to "September 2026".
  - Added responsive media queries for ≤1200px (action labels hidden) and ≤992px (brand title text hidden, icon-only tabs).
  - Verified 0 lint errors and 88/88 unit tests passing (commit [`98f2086`](https://github.com/mhoffman02/day-planner/commit/98f2086)).
- [x] **Kilo Permissions Configuration**:
  - Configured Kilo to always allow commands starting with `git show` (`git show*`, `git show *`, `git show`).
  - Added project configs [`kilo.jsonc`](file:///home/mike/projects/day-planner/kilo.jsonc) and [`.kilo/kilo.jsonc`](file:///home/mike/projects/day-planner/.kilo/kilo.jsonc) in [`ce56ea4`](https://github.com/mhoffman02/day-planner/commit/ce56ea4).
  - Updated global configs in Linux/WSL ([`~/.config/kilo/kilo.jsonc`](file:///home/mike/.config/kilo/kilo.jsonc)) and Windows ([`/mnt/c/Users/mhoff/.config/kilo/kilo.jsonc`](file:///mnt/c/Users/mhoff/.config/kilo/kilo.jsonc)).
  - Synced sister projects [`maximo-uat/.kilo/kilo.jsonc`](file:///home/mike/projects/maximo-uat/.kilo/kilo.jsonc) and [`STT-TTS/kilo.json`](file:///home/mike/projects/STT-TTS/kilo.json).

## 2026-09-22 — Rollback to Pure GAS & Code Cleanup

- [x] **Phase 1: Baseline Establishment**:
  - Baseline established at commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`.
  - Preserved `master` with tag `PWA-installable-22-Sep-2026`.
  - Backported documentation and verified 30/30 baseline tests passing.
- [x] **Phase 2: Decommission GitHub Pages & Service Worker Artifacts**:
  - Pruned untracked `gh-pwa-shell/` and removed from [`.gitignore`](file:///home/mike/projects/day-planner/.gitignore).
  - Purged stale Service Worker (`sw.js`), GIS OAuth, and GitHub Pages references across `.agents/`, `.claude/`, and `.kilo/`.
  - Synchronized `.claude/` and `.kilo/` mirrors via [`tools/sync-agent-config.js`](file:///home/mike/projects/day-planner/tools/sync-agent-config.js).
  - Fixed unclosed event dialog tags in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and root [`index.html`](file:///home/mike/projects/day-planner/index.html).
- [x] **Lint Configuration & Code Cleanup**:
  - Backported [`eslint.config.js`](file:///home/mike/projects/day-planner/eslint.config.js) tailored for pure GAS (no `sw.js`).
  - Added `"lint": "eslint src gas-app/*.gs tools server.js"` and devDependencies to [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Fixed duplicate `GASBridge` declaration in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Fixed empty catch blocks and unused variables in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), [`src/binderStore.js`](file:///home/mike/projects/day-planner/src/binderStore.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs), and [`server.js`](file:///home/mike/projects/day-planner/server.js).
  - Verified 0 lint errors, 0 warnings, and 30/30 unit tests passing (commit [`61b7792`](https://github.com/mhoffman02/day-planner/commit/61b7792)).
- [x] **Phase 3: "Close-to-Installable PWA" Affordances in Pure G.A.S.**:
  - Added standalone display meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `theme-color`) to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), root [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Restored Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)) and high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)).
  - Added desktop window shortcut guide ("Install Day Planner" / "Open as window") in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) and synchronized to [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Verified local dev preview via [`server.js`](file:///home/mike/projects/day-planner/server.js) (status 200) and verified 0 lint errors, 30/30 unit tests passing (commit [`494592d`](https://github.com/mhoffman02/day-planner/commit/494592d)).
- [x] **Future Planning Matrix**:
  - Backported [`src/futureMatrixEngine.js`](file:///home/mike/projects/day-planner/src/futureMatrixEngine.js) and [`tests/futureMatrixEngine.test.js`](file:///home/mike/projects/day-planner/tests/futureMatrixEngine.test.js) (25 unit tests).
  - Added Drive-backed persistence in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) (`getFutureMatrix`, `addFutureItem`, `updateFutureItemStatus`, `transferFutureItem`, `pushFutureItemToNextMonth`, `deleteFutureItem`) persisting to `future-matrix-<YYYY>.json` with 5-min caching.
  - Added Future Matrix mock dataset and RPC methods to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) (6 new bridge tests).
  - Backported interactive 12-month cards with add-bar, status cycling (`•` → `✓` → `→` → `X` → `G/✓`), transfer-to-date picker, push-forward, and delete to [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), mirrored in [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Verified 0 lint errors, 61/61 unit tests passing (commit [`82cf35f`](https://github.com/mhoffman02/day-planner/commit/82cf35f)).
- [x] **Daily Tasks Enhancements**:
  - Backported status dropdown menu with In-Progress (`•`), Forwarded (`→`), Delegated (`D/✓`), Canceled (`X`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Backported star toggle and per-column sorting (Priority, Status, Title, Category) in [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Added unit tests for column sorting, star sorting, and status validation in [`tests/taskEngine.test.js`](file:///home/mike/projects/day-planner/tests/taskEngine.test.js) (23 passing tests).
  - Added `updateDailyTask` with star, status, notes, and sourceMasterId sync to [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) with unit tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js) (13 passing tests).
  - Backported Notes hover popover for tasks with descriptions (`hasNotes(task)`).
  - Added CSS classes for sortable headers, star toggle, status menu, notes popover, and canceled task styles to both [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) including dark mode.
  - Verified 0 lint errors, 80/80 unit tests passing (commit [`beb6ee8`](https://github.com/mhoffman02/day-planner/commit/beb6ee8)).
- [x] **Modular Note Cards & Rich Formatting**:
  - Split note cards into Topic + Summary fields with category filtering.
  - Added rich formatting toolbar (bold, italic, underline, strike, text color swatches, bullet/ordered lists).
  - Added smart-paste Drive URL title resolution (`resolveDriveLinkTitle`) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) with 2 new bridge unit tests.
  - Added link syntax parsing (`[[link:URL]]text[[/link]]`) and sanitized HTML preview rendering in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Added dark mode and theme styling in [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Verified 0 lint errors, 81/81 unit tests passing (commit [`c9c0b71`](https://github.com/mhoffman02/day-planner/commit/c9c0b71)).
- [x] **Monthly Master Tasks (Undated Backlog)**:
  - Backported undated master tasks list (`getMasterTasks`) querying Google Tasks API for undated items (`!t.due`), decoding metadata for `category`, `movedTo`, and `movedTaskId` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Added `addMasterTask` (with `master: true` metadata) and `markMasterTaskMoved` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) with 3 new unit tests in [`tests/gasBridge.test.js`](file:///home/mike/projects/day-planner/tests/gasBridge.test.js).
  - Updated `addDailyTask` to support `sourceMasterId` linkage and `transferMasterTask` to accept task objects.
  - Backported Master Tasks Backlog UI with add-bar (Title + Category), sortable table, inline "Moved to <date>" note, and target date picker with "Move" action in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), [`index.html`](file:///home/mike/projects/day-planner/index.html), and [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css).
  - Added controller methods (`loadMasterTasks`, `addMasterTask`, `formatMovedDate`, `moveMasterTaskToDate`, `jumpToToday`) in [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).
  - Verified 0 lint errors, 84/84 unit tests passing (commit [`516d023`](https://github.com/mhoffman02/day-planner/commit/516d023)).
- [x] **Server Security & Robustness**:
  - Wrapped [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) in individual IIFEs (`(function(global) { ... })(this);`) with explicit top-level export surface assignments per `.agents/rules/gas-namespace-iife.md`.
  - Implemented `LockService.getUserLock()` concurrency locking across `getValidatedRootFolder` and `getFolderByNameOrCreate` to prevent race conditions and duplicate folder creation during concurrent requests.
  - Added folder ownership validation (`owner.getEmail() === currentUser` and `owners(me)`) in `getValidatedRootFolder` auto-search and `validateAndSaveFolderUrl` to prevent auto-adopting or connecting shared folders as private notes stores.
  - Added safe HTML escaping (`escapeHtml`) for server-returned folder names and error messages in [`gas-app/SetupFolder.html`](file:///home/mike/projects/day-planner/gas-app/SetupFolder.html) and `escapeHtml_` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
  - Removed duplicate `testDoGetInIDE` function from [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs).
- [x] **Universal Search**:
  - Enhanced [`src/searchEngine.js`](file:///home/mike/projects/day-planner/src/searchEngine.js) with local date extraction without `.toISOString()` UTC shift bugs, store array/object normalization, task notes matching, and exported [`flattenSearchResults()`](file:///home/mike/projects/day-planner/src/searchEngine.js#L50).
  - Wired `Ctrl+K` / `Cmd+K` keyboard shortcuts, input autofocus, arrow navigation (`↑`/`↓`), `Enter` jump, `Esc` dismissal, and [`selectSearchResult()`](file:///home/mike/projects/day-planner/src/app.js#L1453) in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html).
  - Implemented accessible listbox results rendering with type badges (Calendar, Task, Note, Index), date displays, and snippet context in [`index.html`](file:///home/mike/projects/day-planner/index.html) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html).
  - Styled search results, selection outlines, and dark mode themes in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), flattening all legacy 50% border-radii to 4px per [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md).
  - Expanded unit test coverage in [`tests/searchEngine.test.js`](file:///home/mike/projects/day-planner/tests/searchEngine.test.js); verified 0 lint errors, 88/88 tests passing across 11 suites (commit [`8335a4d`](https://github.com/mhoffman02/day-planner/commit/8335a4d)).
- [x] **Master Task List & Status Column Fixes**:
  - Renamed view title from "Master Task List (Backlog)" to "Master Task List" in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Simplified moved status text from "Moved to Sep 22" to date-only `Sep 22`, letting the `→` arrow glyph convey the moved state.
  - Widened status column to 200px (`.th-w-200`) and wrapped glyph and date in `.master-task-status-wrap` with `inline-flex; align-items: center; gap: 8px; white-space: nowrap;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Fixed Pico CSS `input:not(...)` specificity bug where the date picker expanded to 100% width and pushed the `[ Move ]` button off-screen (commits [`95c891a`](https://github.com/mhoffman02/day-planner/commit/95c891a), [`049f6d2`](https://github.com/mhoffman02/day-planner/commit/049f6d2)).
- [x] **Future Planning Matrix Enhancements**:
  - Renamed view title to "Future Planning" in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - Replaced single-click cycling status button with status popup menu matching Today view task controls, listing all 6 states (`•`, `○`, `✓`, `→`, `X`, `D/✓`).
  - Implemented responsive two-tier layout for future month cards, giving tasks horizontal breathing room.
- [x] **Centered Navbar & Flat Underline Navigation Tabs**:
  - Centered navigation items via balanced flex geometry: `.header-left` (`flex: 1 1 0; min-width: 0;`), `.header-actions-compact` (`flex: 1 1 0; min-width: 0; justify-content: flex-end;`), and `nav.view-segmented-control` (`flex: 0 0 auto; margin: 0 auto;`).
  - Replaced obsolete pill/capsule styling on navigation tabs with full-height (48px) flat tabs and `border-bottom: 3px solid #58bfa2` for the active tab in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Enforced [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) across all top-bar compact action buttons (`.today-jump-btn`, `.search-trigger-compact`, `.sync-btn-compact`, `.security-badge`), setting `border-radius: 4px` (commit [`53962c5`](https://github.com/mhoffman02/day-planner/commit/53962c5)).


