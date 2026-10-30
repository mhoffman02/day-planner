# Key Decisions: where they live and how they get captured

Date: 2026-10-30. Read-only research. No code was changed.

Files cited: [`src/integration/contracts.js`](file:///home/mike/projects/day-planner/src/integration/contracts.js), [`src/integration/taskPlanner.js`](file:///home/mike/projects/day-planner/src/integration/taskPlanner.js), [`src/integration/filterSuggest.js`](file:///home/mike/projects/day-planner/src/integration/filterSuggest.js), [`src/integration/notesPlanner.js`](file:///home/mike/projects/day-planner/src/integration/notesPlanner.js), [`src/integration/geminiParser.js`](file:///home/mike/projects/day-planner/src/integration/geminiParser.js), [`src/indexParser.js`](file:///home/mike/projects/day-planner/src/indexParser.js), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`gas-app/QueueProcessor.gs`](file:///home/mike/projects/day-planner/gas-app/QueueProcessor.gs), [`gas-app/HubController.gs`](file:///home/mike/projects/day-planner/gas-app/HubController.gs), [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

## Verdict

A decision is a tag on records we already store, not a new store. A **made** decision is a `#decision [Topic] what` line in the monthly notes Doc (daily cards or meeting notes), parsed the way `#index` is. A **pending** decision is a Google Task tagged `[Decision]`, the same mechanism as `[Future]` and `[Waiting]`. Gmail `🎯/Decision` creates that pending Task; it never writes the notes Doc. Retrieval is one register view: the existing Monthly Index tab with a Kind toggle, fed by a new month-wide read. No new scope, no new Doc, no Sheet tab.

Why a new tag and not `#index`: the app already calls `#index` the "Decision Registry" (Index.html:217, Index.html:1207, About.html:103, Code.gs:422, Code.gs:3322-3348), but `#index` has become the card-topic syntax. Every card with a topic is saved as `### #index [Topic] heading` (app.js:3657-3660), and an empty day defaults to `#index [General] Daily Notes` (Code.gs:2000). So the "registry" lists every topic card, not decisions. It is also not monthly. `buildIndexRecords` reads only the selected day's cards (app.js:4174-4202, Script.html:6190-6210). Today you can find a past decision only through text search (Code.gs:3221, Code.gs:3443).

## What already exists (reuse, don't rebuild)

- Tag-in-notes precedent: `#index` / `[INDEX]` on any line, topic in brackets (indexParser.js:45-60). `#task [A1]` links a line to a task (app.js:2501-2518).
- Task-tag precedent: `decodeTaskMeta`/`encodeTaskMeta` bracket tags (Code.gs:1035-1095). `planWaiting` builds a `[Waiting]` Task with a dp-meta op-key (taskPlanner.js:143-167), and TaskRepository picks it up by regex (TaskRepository.gs:18, :140).
- Gmail label plumbing: `WORKFLOW_LABEL` and `ACTIVE_LABELS` (contracts.js:23-40). Setup creates every name from `workflowLabelNames()` (filterSuggest.js:30-32, HubController.gs:727, :797). Each active label is one more paged scan per tick (QueueProcessor.gs:357-386).
- Meeting notes already have a `DECISIONS` section (notesPlanner.js:11-13). The Gemini parser recognizes "decisions" headings (geminiParser.js:13), but `readProposedDecisions` is a stub (geminiParser.js:127-129). The meeting picker already offers a "Decision needed" framing (Index.html:1580).
- The note-card category filter already has a "Decision" option (Index.html:613). It is a category, not a parsed record.
- Month read: `docsGetBodyElements_` (Code.gs:100) plus `extractDaySectionText_` (Code.gs:1937). `getDailyDataRange` already reads whole months, read-only (Code.gs:1725, :1835-1845).

## Options matrix

| Option | Capture paths | Retrieval | Storage | Scope impact | Effort | Fits tag pref? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. `#decision` inline tag + register view (rec.)** | Type in any card line or heading. Paste from email (smart paste) | Register tab filtered to Decision, month-wide. Universal search | Monthly notes Doc (existing) | none (`drive.file`, Docs adv. svc) | M | Yes |
| **B. `[Decision]` Task tag for pending (rec.)** | Task menu "Mark as decision". Gmail `🎯/Decision` | Master Tasks (undated) / Today (dated). Register "Pending" rows | Google Tasks (existing) | none (`tasks`) | S | Yes |
| C. Reuse `#index` as-is, retitle nothing | Already works | Same one-day view as today | Notes Doc | none | XS | Yes, but conflated with topics |
| D. `#index [Topic]` + "Decision" category | Category picker per card | Category filter (Index.html:613) | Notes Doc | none | S | Yes, but card-level, not line-level |
| E. Hub Sheet "Decisions" tab | Hub route, or an app form | Sheet filters + app table | New Sheet tab | none, but HOME `drive.file` writes to the hub Sheet 403 (memory: gcp-link) | M | No |
| F. Dedicated "Decision Log" Doc | Separate form/append | Open the Doc | New Doc | none | M | No |
| G. Gmail label appends `#decision` to today's notes | Gmail only | as A | Notes Doc | none | M | Yes, but unsafe until Phase 32 (see Risks 1) |

## Recommendation (recommended option first)

1. **Tag for a made decision.** A) New `#decision [Topic] what`, with optional `why:` / `by:` keys on the same line. `#index` keeps meaning "topic". B) Reuse `#index` and keep the conflation. C) Card category "Decision" only.
2. **Pending decisions.** A) A Google Task tagged `[Decision]` via `encodeTaskMeta`. Open = pending; completing it prompts "Log it?" and pre-fills a `#decision` line in today's card. B) No pending concept, only made decisions. C) A hub Sheet tab with a Status column.
3. **What `🎯/Decision` in Gmail does.** A) Creates a `[Decision]` Task with the Gmail link, via a `planDecision` cloned from `planWaiting`, behind `GMAIL_ROUTER`. B) Appends a `#decision` line to today's notes Doc (blocked by Risk 1). C) A meeting carry-in only (that is the existing "Decision needed" framing, Index.html:1580).
4. **Filter suggestions for `🎯/Decision`.** A) Manual only. Leave it out of `FILTER_TARGET_LABELS` (filterSuggest.js:15-21) and add it to the "stay manual" comment (filterSuggest.js:11-13), the same as Task-Today and Waiting. A filter can't tell that a decision is needed. B) Add it to the suggestions.
5. **Retrieval view.** A) Generalize the Monthly Index tab into "Index & Decisions", with a `[All] [Decisions] [Pending] [Topics]` radio toggle and a month-wide server read. Retitle "#index Decision Registry" to "Topic Index" so only one thing is called a decision. B) A separate Decisions tab. C) Search only.
6. **Ship order.** A) Slice 1 is `#decision` plus the register, with no hub needed, so it works on WORK even with the hub off. Slice 2 is `[Decision]` Tasks. Slice 3 is the Gmail label. Slice 4 parses the meeting notes `DECISIONS` section into the register. B) Ship it all at once.
7. **Order relative to Phase 32 (revision-safe save).** A) Land Phase 32 before or alongside Slice 1. Decisions are the records you can least afford to have overwritten. B) Ship Slice 1 first and accept the risk.

## MVP slice (1A + 5A, then 2A)

Red tests first, each failing for the diagnosed reason, then green, then `npm run lint && npm test`.

1. `src/integration/decisionParser.js` (new, pure, built into `Engines.gs` by `npm run build:engines`): `parseDecisionLines(dayText, dateStr, docUrl)` returns `{date, topic, what, why, by, cardHeading, docUrl}[]`. If `dateStr` is missing it must throw. Don't copy indexParser.js:70, which falls back to `toISOString()`, against the CLAUDE.md date rule. Word boundary, so `#decisions` and `#index` don't match.
   - Test: `tests/decisionParser.test.js` covers heading and body lines, default topic `General`, `why:`/`by:` split, several per card, card-heading context, a missing date throws, and `#index` is ignored.
2. `gas-app/Code.gs`: `getDecisionRegister(monthKey)` reads the month Doc once (`docsGetBodyElements_`), walks the day headings (`isAnyDayHeadingElement_`, Code.gs:1919), and calls `DPEngines.parseDecisionLines`. It is read-only and never creates the Doc, like `getDailyDataRange`. If the Doc can't be read, it throws (fail closed) rather than returning `[]`, so an empty register always means "none". It needs both the IIFE alias and the top-level delegator (gas-namespace-iife rule).
   - Test: `tests/decisionRegister.test.js` slices the function into a vm, like tests/hubTaskMeta.test.js:15-22. Cases: the happy path across 3 days, a Doc-read error is surfaced and not shown as empty, and a missing Doc returns `{missing:true}`.
3. `src/gasBridge.js`: a mock `getDecisionRegister`. `tests/gasBridge.test.js` checks the shape matches.
4. `src/app.js` **and** `gas-app/Script.html` (hand mirror, tests/htmlIncludeMirror.test.js:59): `loadDecisionRegister()`, the Kind toggle, and a `#decision` badge in `renderCardLine` next to the `#index`/`#task` badges (app.js:3451-3452). On an error, show `err.message` in the error tray. Never show an empty table for a failed read.
   - Test: extend `tests/noteCardLink.test.js` (or a new `tests/decisionBadge.test.js`) to run both copies, like tests/notePaste.test.js:85.
5. `gas-app/Index.html`: toggle markup in the Monthly Index header (Index.html:1202-1210). Flat underline radios, no pills. Retitle the strings at Index.html:217 and :1207, About.html:103, :173, :226, Tutorial.html:258-259 (T07) and Code.gs:422.
6. Slice 2: `decision` in `decodeTaskMeta`/`encodeTaskMeta`, including the strip regex at Code.gs:1078.
   - Test: extend `tests/hubTaskMeta.test.js`. `[Decision]` must round-trip and survive a star or category edit, and must not stack.
7. Slice 3: `WORKFLOW_LABEL.DECISION`, plus `ACTIVE_LABELS`, `gmailDecisionKey`, `planDecision`, `ROUTE_ACTIONS_` (QueueProcessor.gs:148), the `collectItems_` scan, `routeThreadToDecision`, and the hubUi messages (hubUi.js:56-57, app.js:1442).
   - Tests: `tests/integrationContracts.test.js`, `tests/filterSuggest.test.js` (Decision is not a filter target), `tests/taskPlanner.test.js` (`planDecision` CREATE/EXISTS idempotency, no body stored), `tests/hubContractParity.test.js`, `npm run check:engines`.

## Risks

1. **Data loss.** `saveDailyDocCards` rewrites the whole day section with no `writeControl` (Code.gs:2088, TODO.md:5). A `#decision` typed directly in the Doc gets overwritten by the next app save. That is also why option 3B (a server append into the Doc) is unsafe.
2. **Mirror drift.** Script.html is a hand copy of app.js. Every client change lands twice, so make the dual-copy test mandatory.
3. **WORK Gmail quota.** One more active label adds a paged list call per tick (QueueProcessor.gs:357-386). WORK already hit its per-minute quota, so keep it behind `GMAIL_ROUTER` and measure with the Sheets/Gmail meter.
4. **Search.** Drive `fullText` (Code.gs:3463) may drop the `#`, so searching archives for "#decision" matches any "decision". The register read is the reliable path, and search is only a fallback.
5. **Naming.** Until the retitle in step 5 ships, two things are called "decision" (the `#index` registry and `#decision`). Ship the retitle with Slice 1.
6. **Sensitivity.** Decision text can be HR or acquisition material. It must never reach Gemini/USAi, so honor `AI_EXCLUDED_LABELS` (contracts.js:75-77) if Slice 4 ever adds AI extraction.
7. **Scope.** None of the recommended slices needs a new scope. The Docs Advanced Service already uses `drive.file`, and Tasks and Gmail use their existing scopes (appsscript.json:38-44).
