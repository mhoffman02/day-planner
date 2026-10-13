# Gmail / Calendar / Tasks / Meeting-Notes Hub: architecture (Phase 28, Phase 0 deliverable)

Spec: [`specs/gmail-meeting-hub.md`](specs/gmail-meeting-hub.md) (reconciled). Original:
[`specs/gmail-meeting-hub-orig.md`](specs/gmail-meeting-hub-orig.md). Acceptance mapping:
[`hub-acceptance-matrix.md`](hub-acceptance-matrix.md). Setup and gate: [`hub-setup-and-gate.md`](hub-setup-and-gate.md).

## 1. Existing Day Planner architecture (what the hub plugs into)

- **Pure Google Apps Script web app** (`clasp`-deployed, V8). No service worker, no client OAuth; identity is the
  Workspace session. Two execution environments: local preview (`server.js` serves `index.html` + `src/`,
  `src/gasBridge.js` returns mock data) and production (`gas-app/Code.gs` `doGet` evaluates `gas-app/Index.html`
  with `Script.html` and `Styles.html`).
- **Client**: Alpine.js controller (`src/app.js` locally, mirrored by `gas-app/Script.html` in GAS because GAS cannot
  import modules). RPC goes through `GASBridge` (`google.script.run` in production, mock in local mode).
- **Server**: `gas-app/Code.gs` is one IIFE with explicit exports plus a second block of top-level delegators.
  Apps Script finds `google.script.run`/`doGet`/trigger/IDE-dropdown names by a static scan of top-level
  `function name(...)` declarations, so every RPC needs both a `global._xInternal = x` alias inside an IIFE and a
  delegator (rule: `.agents/rules/gas-namespace-iife.md`).
- **Storage**: Google Tasks (Advanced service), Calendar (Advanced), Docs (Advanced Docs API under `drive.file`),
  Drive folder `Day Planner` bound at first run (`DAY_PLANNER_ROOT_FOLDER_ID` user property).
- **Constraints inherited**: `drive.file` only (no broad Drive), literal-only top-level `.gs` initializers
  (clasp pushes files alphabetically), GAS HtmlService truncation on literal double slashes/apostrophes/backticks in
  `.html` (checked by `npm run check:gas-safe-chars`), no pills, local-date arithmetic only.

## 2. What the hub adds

A deterministic workflow: the user applies `🎯/` labels in Gmail by hand, the app reads (never writes) Gmail and
turns labelled threads into Google Tasks, Waiting items, or carry-in entries in an app-owned meeting-notes Doc for
the right recurring-meeting occurrence. A Triage board ranks other candidate threads; a Meeting Prep view shows the
next occurrence, its prep cutoff and carry-in count. Every write is idempotent through an Integration Ledger.
`DRY_RUN` is on by default and all hub features are off until flags are enabled.

Locked decisions: Gmail via `gmail.modify` (was `gmail.readonly` until 2026-10-12; writes limited to the Triage Archive = remove INBOX and Delete = Trash buttons), Advanced Gmail service only, `GmailApp` lint-banned);
Processed/Error are ledger statuses, not Gmail labels; config/ledger/registry live in an app-created Sheet under
`drive.file`; notes Docs are app-owned; Gemini/USAi are interface or parser only with flags OFF.

## 3. Module map

### Pure engines (`src/integration/*.js`, node-tested, tier A)

| Module | Responsibility |
|---|---|
| `contracts.js` | Constants and shapes: label names, `EVENT_TYPE`, `LEDGER_STATUS`, `LEDGER_COLUMNS`, `REGISTRY_COLUMNS`, `DEFAULT_FEATURES`, operation-key builders, `makeResult` |
| `eventClassifier.js` | Calendar event to `EVENT_TYPE`; excluded events; Task-derived events never importable |
| `registry.js` | `DEFAULT_SERIES` (10 series), parse/validate of the 13-column Meeting Registry |
| `occurrenceSelector.js` | Occurrence + prep-cutoff selection, overrides (`current`/`recommended`/`specific`/`backlog`), series resolution by recurring id then title fallback, DST-safe |
| `ledger.js` | Operation-key state machine (`decideOperation`, transitions, `runOperation`, DRY_RUN strings, `sanitizeError`) |
| `queuePlanner.js` | Bounded, resumable batch with quarantine of malformed items |
| `taskPlanner.js` | Task title/notes/due/dp-meta planning, `[Waiting]` items, find-by-op-key |
| `notesPlanner.js` | Meeting-notes Doc skeleton, carry-in format, dedupe signature, `carryInCount` |
| `triageScore.js` | Deterministic score (spec 11), bands, queue assignment |
| `topicRouting.js` | Label to meeting-series suggestions; confirmation rules |
| `externalTickets.js` | Jira/ServiceNow/Apps Script ticket key extraction |
| `aiGuard.js` | Fail-closed guard for any AI path; `LanguageAssistant` placeholder |
| `geminiParser.js` | Pure parser for Gemini notes + `MeetingNotesProvider` interface (Phase 6, flags OFF) |

`tools/build-gas-engines.js` compiles these into `gas-app/Engines.gs` as the single global `DPEngines`
(`npm run build:engines`; `npm run check:engines` and `integrationContracts.test.js` fail if stale). Never edit
`Engines.gs` by hand.

### Server (`gas-app/*.gs`, vm-tested with service fakes, tier B)

| File | Global | Role |
|---|---|---|
| `Engines.gs` | `DPEngines` | Generated engines |
| `Config.gs` | `DPConfig` | Hub Sheet (tabs `Config`, `Meeting Registry`, `Integration Ledger`, `Integration Ledger Archive`; dismissals are ledger rows), flags, registry read/write (`getRegistry`, `setRegistryDocId`, `updateRegistryRow`), `SETUP_ERROR` on missing mandatory keys |
| `LedgerRepository.gs` | `DPLedgerRepo` | Ledger rows: upsert, list, `appendMany` (one write) |
| `GmailRepository.gs` | `DPGmailRepo` | Advanced Gmail: label-name to id, thread metadata, `withBody` only in memory; writes only `archiveThread` (remove INBOX) and `trashThread` |
| `CalendarRepository.gs` | `DPCalendarRepo` | Advanced Calendar reads, occurrences, `discoverSeries` (persists recurring ids via `DPConfig.updateRegistryRow` outside DRY_RUN) |
| `TaskRepository.gs` | `DPTaskRepo` | Tasks create/find/patch, op-key search before create |
| `NotesRepository.gs` | `DPNotesRepo` | App-owned `Meeting Notes - <Series>` Docs via Docs API, `applyPlan`, `carryInCount` |
| `QueueProcessor.gs` | `DPQueue` | `executeRoute`, `processWorkflowQueue`, last-run record, sanitized logging |
| `HubController.gs` | (RPC aliases) | The `google.script.run` surface; validates input, checks flags, takes the lock, returns `makeResult`-shaped objects |
| `Triggers.gs` | (aliases) | One dispatcher trigger, `hubDispatch`, daily refresh jobs |
| `Code.gs` | | Top-level delegators for each RPC / trigger handler |
| `UnitTests.gs` | | `runHubSelfChecks()`: read-only live self-test (tier C) |

### Client

`src/hubUi.js` (pure helpers; mirrored in `Script.html` between `HUB-UI-MIRROR-BEGIN/END`, parity-tested),
`src/hubMock.js` (stateful mock honoring the same result shapes), `src/gasBridge.js` / `Script.html` bridge methods,
Triage and Meeting Prep views in `Index.html` / `index.html`, styles in `src/styles.css` mirrored in `Styles.html`.

## 4. RPC surface (all return `makeResult`-shaped objects; never throw to the client)

`getHubStatus`, `getTriageBoard`, `getUpcomingMeetingChoices`, `getMeetingPrep`, `routeThreadToTask`,
`routeThreadToWaiting`, `routeThreadToMeeting`, `dismissTriageItem`, `retryFailedOperation`,
`discoverMeetingSeries`, plus flag-gated Gemini stubs (`discoverGeminiNotes`, `getProposedMeetingActions`,
`confirmMeetingActions`) and IDE/trigger entry points (`processWorkflowQueue`, `installHubTriggers`,
`removeHubTriggers`, `hubDispatch`). Failure envelope: `{ok:false, status:'ERROR', errorCode, message}`; flags off gives
`errorCode:'FLAG_OFF'`. The shared shape checker is `tests/helpers/hubShapes.js`; `hubContractParity.test.js` runs it
against both the mock and the real controller.

Board queue keys are stable: `directAction`, `meetingCarryIns`, `systemExceptions`, `fyiReading`
(`HubController.gs` maps the engine display names to these).

## 5. Data flow

```
Gmail (user applies 🎯/ label)                     Calendar (recurring series)
        |  read-only, Advanced Gmail                     |  Advanced Calendar
        v                                                v
  GmailRepository ---> QueueProcessor <--- CalendarRepository (occurrences, recurring ids)
                         |   (script lock; DPEngines.decideOperation per op key)
        +----------------+------------------+
        v                v                  v
  TaskRepository   NotesRepository     Ledger (Sheet tab)
  (Google Tasks)   (app-owned Doc)      PENDING -> DONE | ERROR | DEFERRED | DRY_RUN
        ^                ^                  ^
        +----------- HubController (RPC) ----+---- Triage board / Meeting Prep (Alpine UI)
                         ^
   Triggers.gs: ONE hubDispatch trigger (every TriggerMinutes) runs the bounded queue + daily jobs
```

1. **Input**: a thread with `🎯/Task`, `🎯/Task-Today`, `🎯/Waiting`, `🎯/Meeting/*`; or the user routes a Triage
   candidate through the UI.
2. **Idempotency**: each action has an op key, e.g. `GMAIL|<thread>|TASK`, `|TASK_TODAY`, `|WAITING`,
   `|MEETING|<occurrenceEventId>` (backlog: `|MEETING|BACKLOG-<SERIES_KEY>`). A DONE row skips; a fresh PENDING waits; a stale
   PENDING or ERROR retries. The op key is embedded in Task notes (dp-meta) so a crash between Tasks create and the
   ledger write is recovered by searching before create.
3. **Meeting routing**: `selectOccurrence` picks the occurrence; if the prep cutoff has passed the item defers to the
   next one (override available). The carry-in line is inserted once into the occurrence block, with a Gmail link;
   the dedupe signature rides in the link, so editing the visible text does not cause a duplicate.
4. **Safety**: bodies are read in memory for scoring only, never logged, stored, or returned (the Triage board returns only Gmail's own `snippet` of the latest message, the inbox preview line, for display; it is never logged; to spare the Gmail per-user quota the server keeps each scored display row (subject, sender, snippet, labels, score, no body) in the user's `CacheService` for up to 6 h, reused only while the thread's Gmail `historyId` is unchanged; the client keeps the last board, allowlisted row fields only, in the tab's `sessionStorage` so Triage opens instantly, and that copy is cleared when the tab closes or the hub turns off); `GmailApp` is banned;
   sensitive labels block every AI path; `DRY_RUN` makes each write a "Would ..." message.
5. **Concurrency**: one script lock around the action; hub writes assume the caller holds it (Config/Ledger take no
   lock of their own because Apps Script locks are not re-entrant).

## 6. Integration points with existing code

- `gas-app/Code.gs`: delegator block (RPCs, trigger handler names) and the existing 5-minute
  `syncWorkspaceChanges` trigger, which the hub never touches.
- `gas-app/appsscript.json`: adds the `gmail.modify` scope (was `gmail.readonly`) and the Gmail and Sheets Advanced Services (the only
  manifest change).
- Task `notes` dp-meta marker: hub keys (`opKey`, `[Waiting]` data) survive star/category edits
  (hubTaskMeta tests); legacy notes encode exactly as before.
- Task-derived Calendar events (`gasTaskId`) are classified `TASK_DUE` and never routed or imported.
- `src/binderStore.js` view router gained `triage` and `meetingPrep`; `getHubStatus().flags` controls nav visibility
  (hidden unless `GMAIL_ROUTER` plus the view flag are on).
- `UnitTests.gs`: `runHubSelfChecks()` is included in `?view=self-test`.

## 7. Test tiers

A pure engines (`npm test`), B vm-loaded `.gs` with service fakes (`tests/helpers/gasRuntimeStubs.js`,
`gasFakesHub.js`), C live `UnitTests.gs` self-test, D remote run on HOME only via the Apps Script Execution API: `npm run rpc -- <fn>` (`tools/gas-rpc.js`, skill `gas-rpc`).
