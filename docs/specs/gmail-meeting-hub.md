# Engineering Handoff: Gmail–Calendar–Tasks–Meeting Notes Extension for Day Planner (RECONCILED)

Reconciled against user decisions of 2026-10-09. Original: [`gmail-meeting-hub-orig.md`](gmail-meeting-hub-orig.md). Every inferred or changed passage is marked `(RECONCILED)`.

## Reconciliation changes

| # | Area | Original | Reconciled |
|---|---|---|---|
| 1 | Label prefix | `_DP/*` | `🎯/*` everywhere (`🎯/Task`, `🎯/Task-Today`, …). ✅ rejected: collides with `✓` done status |
| 2 | Gmail access | Gmail modify; apply/remove labels | Read-only: `gmail.readonly` via the **Advanced Gmail service only**. `GmailApp` banned (needs full `mail.google.com` scope) and lint-enforced. User applies `🎯/` labels manually |
| 3 | Processed / Error | `_DP/Processed`, `_DP/Error` Gmail labels | Ledger statuses (`PROCESSED`, `ERROR`) surfaced in the Triage UI; no Gmail label writes |
| 4 | Label removal | "Source label removed only after success" | Dropped (no Gmail writes); replaced by ledger-status equivalents |
| 5 | §10 failure steps | Retain label, apply `_DP/Error`, not `_DP/Processed` | Label parts removed; keep: sanitized ledger error, continue batch, retry |
| 6 | §18 scopes | Gmail modify, Documents, Drive, Spreadsheets | `gmail.readonly` + existing scopes; Sheet and Docs via `drive.file` (app-created files). Sheets-under-`drive.file` spike pending in Wave 0 |
| 7 | §8 notes Doc | Existing human-notes Doc | App-owned `Meeting Notes – <Series>` Doc; user's existing Doc untouched; `HumanNotesDocId` auto-filled |
| 8 | §9 priority | `[A]`/`[B]`/`[C]` | Existing `[A1]`–`[C9]` convention |
| 9 | §9 Waiting | Separate list or existing model | Google Task + `[Waiting]` tag in dp-meta (person, nag date, Gmail link) |
| 10 | §19 flags | Source `const FEATURES` | Config tab in the Sheet; `DRY_RUN` default ON |
| 11 | §20/§24 scope | Phases 0–3 | Phases 0–5 full; Phase 6 interface + parser, flags OFF; Phase 7 excluded |
| 12 | §22 tests | Fixtures/mocks | Adds `GmailApp` lint ban; test tiers: pure engines (node), vm-loaded `.gs` with service stubs, live `UnitTests.gs`, remote trigger/readback (HOME) |
| 13 | Deploy gate | n/a | No `clasp push` containing the new scope without explicit user approval |

---

Use the following as a standalone handoff to a coding agent. Replace bracketed placeholders locally. Do not share production document IDs, email addresses, API keys, or sensitive content outside the approved environment.

---

## 1. Assignment

Extend an existing Google Apps Script web application called **Day Planner** so it becomes the workflow hub for:

- Gmail triage
- Google Tasks
- Google Calendar
- Recurring-meeting preparation
- Human meeting notes in Google Docs
- Gemini-generated meeting notes
- Post-meeting action-item review

The application uses a classic Franklin Covey–style day-planner interface. Preserve the existing application and add this functionality incrementally.

### Core workflow

```text
Gmail thread
  → human or deterministic triage
  → Google Task, Waiting item, Reading item, or meeting carry-in
  → relevant Calendar meeting occurrence
  → human meeting notes
  → Gemini/human-note reconciliation
  → confirmed Google Tasks
  → Day Planner daily view
```

### Key principle

Existing Gmail labels usually describe **subject matter**. New `🎯/*` labels describe **workflow actions**. (RECONCILED: prefix `🎯/`)

Do not replace the existing Gmail taxonomy.

---

# 2. Safety and implementation constraints

## Mandatory

1. **Do not destructively reorganize existing Gmail labels or filters.**
2. **Do not delete, mark read, archive, or send email during the initial implementation.** (RECONCILED: Gmail is fully read-only; the app never creates, applies, or removes Gmail labels. Advanced Gmail service only; `GmailApp` is banned and lint-enforced.)
3. Do not create Tasks automatically from broad candidate labels such as `00_AR`.
4. Do not automatically convert all Gemini-generated action items into Tasks.
5. Require human confirmation for AI- or Gemini-derived commitments.
6. Use idempotency controls to prevent duplicate Tasks and duplicate note entries.
7. Use `LockService` around queue processing and document writes.
8. Quarantine failures rather than blocking the entire queue.
9. Do not hard-code:
   - Email addresses
   - Document IDs
   - Calendar IDs
   - API keys
   - USAi credentials
10. Keep production configuration in a private Sheet, User Properties, or Script Properties, as appropriate. (RECONCILED: the Sheet is app-created under `drive.file`.)
11. Avoid creating synchronization loops between Tasks and Calendar.
12. Preserve links and provenance between Gmail, Tasks, Calendar occurrences, and Docs.
13. Use bounded batches and resumable processing. Do not assume that the Workspace Enterprise account removes Apps Script limits.
14. Log metadata and errors, but do not log email bodies or sensitive meeting-note content.
15. Request only the OAuth scopes actually required.

## AI constraint

Do not add USAi integration during the core implementation. Build a provider-neutral interface that can be implemented later.

AI must never be required for routing, task creation, or notes processing to function.

---

# 3. Existing environment

## Platform

- Google Workspace Enterprise account
- Google Apps Script web app
- Gmail
- Google Calendar
- Google Tasks
- Google Docs
- Gemini-generated meeting notes
- Human-maintained meeting notes
- Optional future access to a USAi REST endpoint

## Existing Gmail labels relevant to the extension

### Topic/program labels

```text
_NCMMS
_NCMMS/Acquisition
_NCMMS/Approval-Request
_NCMMS/COR-TRM
_NCMMS/OIG Audit
_NCMMS/ncmms-support
_NCMMS/UAT

OFM
IT
P&S Tech & Innovation
Elevator
Jira
ServiceNow
scripts
```

### Existing classification labels

```text
00_AR
FYI
FYI_Candidate
VIP
Auto-file
Archived
News
```

Interpretation:

- `00_AR` means **action candidate**, not confirmed task.
- `FYI_Candidate` means **informational candidate**, not confirmed disposition.
- `VIP` is a priority signal, not an action.
- Existing topic labels should be used as routing hints.

## Sensitive-topic defaults

Do not send content from these categories to any AI integration unless explicitly approved:

```text
HR/*
_NCMMS/OIG Audit
_NCMMS/Acquisition
FOIA
Audit-related content
Potentially restricted COR/procurement content
```

---

# 4. New Gmail workflow labels

(RECONCILED: prefix is `🎯/`; the user creates and applies these labels manually. The app only reads them.)

Support:

```text
🎯/Task
🎯/Task-Today
🎯/Waiting
🎯/Meeting
🎯/Meeting/NCMMS-Core
🎯/Meeting/NCMMS-Daily
🎯/Read
🎯/Review
```

(RECONCILED: `🎯/Processed` and `🎯/Error` are not Gmail labels; they are ledger statuses.)

Initial implementation only needs to activate:

```text
🎯/Task
🎯/Task-Today
🎯/Waiting
🎯/Meeting/NCMMS-Core
```

## Label behavior

| Label | Action |
|---|---|
| `🎯/Task` | Create a Google Task without assuming it is due today |
| `🎯/Task-Today` | Create a Google Task due today |
| `🎯/Waiting` | Create/update a waiting-on item (Task + `[Waiting]` tag) (RECONCILED) |
| `🎯/Meeting` | Place thread in the planner’s Meeting Inbox |
| `🎯/Meeting/NCMMS-Core` | Route a pointer to the next eligible Core Team occurrence |
| `🎯/Meeting/NCMMS-Daily` | Route a pointer to the next eligible Daily Standup |
| `🎯/Read` | Add thread to a reading queue |
| `🎯/Review` | Place thread in human triage without external action |
| ledger `PROCESSED` | Marks successful processing (ledger status, not a Gmail label) (RECONCILED) |
| ledger `ERROR` | Marks failed processing; source label stays because it is never removed (RECONCILED) |

Do not treat ledger `PROCESSED` as a global permanent exclusion. Idempotency must be based on source identity plus action and target. (RECONCILED: because labels stay on the thread, a deliberate second Task from the same thread needs an explicit UI action with a new operation-key suffix.)

Label names are matched via the Advanced Gmail service label list and `Users.Threads.list` with `labelIds`; the emoji prefix must be handled as normal Unicode. (RECONCILED)

---

# 5. Calendar model

Calendar events must be normalized into these types:

```javascript
const EVENT_TYPE = Object.freeze({
  MEETING:       'MEETING',
  PREP:          'PREP',
  FOLLOWUP:      'FOLLOWUP',
  FOCUS:         'FOCUS',
  ROUTINE:       'ROUTINE',
  TASK_DUE:      'TASK_DUE',
  LEAVE:         'LEAVE',
  AVAILABILITY:  'AVAILABILITY',
  INFORMATIONAL: 'INFORMATIONAL'
});
```

## Known meeting series

| Series key | Display name | Calendar-title fallback | Default preparation cutoff |
|---|---|---|---:|
| `NCMMS_CORE` | NCMMS Core Team | `NCMMS Core Team Meeting` | 30 minutes |
| `NCMMS_DAILY` | NCMMS Daily Standup | `NCMMS - Daily Standup` | 10 minutes |
| `FACILITY_TECH` | Facility Technology & Innovation | `Facility Technology & Innovation Weekly` | 30 minutes |
| `NCMMS_AA` | NCMMS A&A Assessment | `NCMMS - A&A Assessment` | 30 minutes |
| `WEEKLY_STATUS` | Weekly Status Report | `Weekly Status Report` | 60 minutes |
| `NCMMS_CHECKIN` | NCMMS Check-in | `NCMMS - Check-in` | 30 minutes |
| `NCMMS_ACQ` | NCMMS Acquisition | `NCMMS Acquisition` | 30 minutes |
| `TRM_PM` | GSA/TRM PM Meeting | `GSA/TRM Weekly PM Meeting` | 30 minutes |
| `PRODUCT_OWNER_BOARD` | Product Owner’s Board | `PBS IT Product Owner's Board Meeting` | 30 minutes |
| `ELEVATOR_DATA` | Elevator Data | `Elevator Data` | 30 minutes |

Use title matching only for initial discovery or fallback. Persist:

- Calendar ID
- Recurring event ID
- Occurrence event ID

Use the Advanced Calendar service where identifiers, attachments, conference information, or extended properties are required.

## Known NCMMS Core workflow

Treat these events as one workflow:

```text
PREP:
NCMMS: Core Team Meeting prep / time block (not a meeting)

MEETING:
🛠 NCMMS Core Team Meeting

FOLLOWUP:
Core team follow up

PUBLISH:
Post NCMMS Updates for Exec Summary & O&M Network Call
```

The Tuesday preparation cutoff is the start of the PREP event, normally 7:30 AM.

## Events excluded from meeting routing

Examples:

```text
Sunrise/sunset
event_busy
Core-hours overlays
Leave notices
Out-of-office notices
Pay dates
Federal holidays
Daily Check-in
Lunch / out
All-day Task due dates
```

Task-like Calendar titles include:

```text
Due: ...
... pending tasks
```

These must not be imported back into Tasks. (RECONCILED: existing Task-derived events are also identified by the `gasTaskId` extended property.)

---

# 6. Meeting registry

Create a configuration tab named `Meeting Registry`. (RECONCILED: in the app-created config Sheet.)

## Required columns

```text
Enabled
SeriesKey
DisplayName
CalendarId
RecurringEventId
TitleFallback
MeetingRole
PrepMinutes
PostReviewMinutes
HumanNotesDocId
GeminiExpected
AIAllowed
LabelHints
```

(RECONCILED: `HumanNotesDocId` holds the app-owned `Meeting Notes – <Series>` Doc ID, auto-filled on first use.)

Example rows:

| Enabled | SeriesKey | TitleFallback | Role | Prep | Gemini | AI allowed | Label hints |
|---:|---|---|---|---:|---:|---:|---|
| TRUE | `NCMMS_CORE` | `NCMMS Core Team Meeting` | MEETING | 30 | TRUE | Conditional | `_NCMMS,VIP` |
| TRUE | `NCMMS_DAILY` | `NCMMS - Daily Standup` | MEETING | 10 | TRUE | Conditional | `_NCMMS,Jira` |
| TRUE | `NCMMS_AA` | `NCMMS - A&A Assessment` | MEETING | 30 | TBD | FALSE initially | `_NCMMS` |
| TRUE | `NCMMS_ACQ` | `NCMMS Acquisition` | MEETING | 30 | TBD | FALSE | `_NCMMS/Acquisition` |
| TRUE | `TRM_PM` | `GSA/TRM Weekly PM Meeting` | MEETING | 30 | TBD | FALSE initially | `_NCMMS/COR-TRM` |

Production document IDs and Calendar IDs must be supplied locally.

---

# 7. Occurrence-selection rules

When routing an email to a recurring meeting:

1. Find future occurrences for the configured series.
2. Calculate each occurrence’s cutoff:
   - Use the linked PREP event start when configured.
   - Otherwise use meeting start minus `PrepMinutes`.
3. Select the earliest occurrence whose cutoff has not passed.
4. If the current occurrence is already beyond its cutoff, use the next occurrence.
5. Allow a user override:
   - Current/today’s occurrence
   - Recommended next occurrence
   - Specific future occurrence
   - Series backlog/parking lot

Examples:

- Monday afternoon route to Core Team → Tuesday Core occurrence.
- Tuesday at 7:20 AM → same day’s Core occurrence.
- Tuesday at 7:45 AM → following Core occurrence by default.
- User may explicitly override and route to the current occurrence.

Use the Calendar occurrence event ID as the target identity, not the date alone.

---

# 8. Notes model

The first pilot is **NCMMS Core Team**.

(RECONCILED) The notes Doc is an **app-owned `Meeting Notes – <Series>` Google Doc** created via the Docs API in the Day Planner Drive folder (`drive.file`). The user’s existing human-notes Doc is not written to; the user takes notes in the app-owned Doc going forward.

The notes Doc should contain or support this occurrence structure:

```text
2026-10-06 — NCMMS Core Team

PREP / EMAIL CARRY-INS

AGENDA

HUMAN NOTES

DECISIONS

ACTION ITEMS

GEMINI RECONCILIATION
```

The system must:

1. Find the occurrence heading.
2. Create the skeleton if missing.
3. Find `PREP / EMAIL CARRY-INS`.
4. Append a compact email reference.
5. Never append the same carry-in twice.
6. Preserve the Gmail thread link and routing provenance.

## Default carry-in format

```text
• [Decision/Input needed] Framing line — Email subject
  From: display name | Received: date | Gmail
```

Default to a pointer rather than copying the email body.

Store separately in the ledger:

```text
Gmail thread ID
Latest source message ID
Meeting series key
Occurrence event ID
Human notes Doc ID
Timestamp
Routing action
Inserted text signature
```

## Email content rule

Do not copy complete threads into Docs.

Allowed initial formats:

1. Subject, sender, date, and Gmail link
2. Optional user-entered framing statement
3. Optional short selected excerpt, capped at a configured length

---

# 9. Task creation

## Task source identity

A Task created from Gmail must contain:

- User-facing task title
- Source Gmail URL
- Source thread ID in ledger
- Creation timestamp
- Optional associated meeting occurrence
- Priority representation compatible with the existing Day Planner

Do not assume Google Tasks has a native priority field. (RECONCILED) Use the Day Planner’s existing `[A1]`–`[C9]` title convention (parsed by `src/taskEngine.js`), not bare `[A]`/`[B]`/`[C]`.

(RECONCILED) Provenance (operation key, Gmail URL, occurrence ID) is stored in the task notes dp-meta marker, consistent with the existing `<!--dp-meta:...-->` convention. Before creating, a retry searches existing notes for the operation key, since Tasks creation is not atomic with the ledger write.

## Due dates

- `🎯/Task-Today`: due today in the script’s configured timezone.
- `🎯/Task`: no due date unless chosen in the UI.
- Do not infer a deadline from email text in Phase 1.
- Later, display inferred deadlines as suggestions requiring confirmation.

## Waiting items

Waiting items must support:

```text
Description
Person/entity waited on
Source Gmail link
Created date
Review/nag date
Status
```

(RECONCILED) A Waiting item is a **Google Task with a `[Waiting]` tag in dp-meta** carrying person/entity, nag date, and Gmail link. No separate Task list and no separate Sheet store.

---

# 10. Idempotency and processing ledger

Create a Sheet tab or existing datastore named `Integration Ledger`. (RECONCILED: tab in the app-created config Sheet.)

## Required fields

```text
OperationKey
SourceType
SourceId
SourceVersion
Action
TargetType
TargetId
Status
CreatedAt
UpdatedAt
ErrorCode
ErrorMessage
MetadataJson
```

## Operation-key examples

```text
GMAIL|<threadId>|TASK
GMAIL|<threadId>|MEETING|<occurrenceEventId>
GEMINI|<docId>|<contentHash>|PROPOSE_ACTION
MEETING|<occurrenceEventId>|TASK|<actionHash>
```

System-notification deduplication should use external object IDs when available:

```text
JIRA|<issueKey>
SERVICENOW|<ticketNumber>
SCRIPT_FAILURE|<scriptOrProjectIdentifier>
```

The processor must be safe to rerun after:

- Trigger overlap
- Timeout
- Partial document update
- Temporary Google API failure
- User reapplying a workflow label (RECONCILED: labels are never removed, so "reapply" means a label that is still present on a thread already in the ledger)

## Failure behavior

If processing fails: (RECONCILED: Gmail label steps removed)

1. Record a sanitized error in the ledger with status `ERROR`.
2. Continue processing unrelated items.
3. Allow retry from the planner or the next trigger.

---

# 11. Triage board

Add a Day Planner view named `Triage`.

## Queues

### Direct Action

Potential signals:

- User directly addressed in `To`
- Latest relevant message from another person
- Explicit request language
- Deadline language
- VIP label
- No response from user after latest request
- Existing `00_AR` label

### Meeting Carry-ins

Candidate labels:

```text
_NCMMS
_NCMMS/COR-TRM
_NCMMS/Acquisition
OFM
IT
P&S Tech & Innovation
```

### System Exceptions

Group rather than display every message:

```text
Jira
ServiceNow
Apps Script failures
Elevator notifications
```

### FYI/Reading

Potential labels:

```text
FYI
FYI_Candidate
News
Auto-file
```

## Required row actions

```text
Task Today
Task Later
Waiting
Send to Meeting
Read Later
Dismiss
Open Gmail
```

`Dismiss` only removes an item from the planner’s current triage set. It must not delete the email. (RECONCILED: dismissal is stored in the ledger, not in Gmail.)

## Deterministic score

Implement configurable scoring. Initial defaults:

| Signal | Points |
|---|---:|
| User directly in `To:` | +3 |
| Latest message from someone else | +2 |
| Explicit request phrase | +3 |
| Deadline/date near request language | +2 |
| VIP label | +2 |
| No reply from user since request | +3 |
| User only copied | −2 |
| Known automated sender | −4 |
| `Auto-file`, `News`, or `Elevator` | −4 |
| Completed/resolved/closed language | −3 |

Bands:

```text
8+       High-confidence action candidate
4–7      Human review
0–3      Likely FYI
Below 0  Automation/noise
```

Do not auto-create Tasks solely from this score.

(RECONCILED) Scoring reads message headers and body text server-side via `gmail.readonly`; bodies are never logged or persisted.

---

# 12. Topic-to-meeting suggestions

Use existing labels as hints.

| Evidence | Suggested destination |
|---|---|
| `_NCMMS/Acquisition` | `NCMMS_ACQ` |
| `_NCMMS/COR-TRM` | `TRM_PM`, then `NCMMS_CORE` |
| `_NCMMS/Approval-Request` | Task or `NCMMS_CORE` |
| `_NCMMS/OIG Audit` | Human review; no automated AI |
| `_NCMMS/ncmms-support` | `NCMMS_DAILY` for unresolved exceptions |
| `P&S Tech & Innovation` | `FACILITY_TECH` |
| `Elevator` | `ELEVATOR_DATA`, exceptions only |
| `Jira` plus NCMMS context | `NCMMS_DAILY` |
| General `_NCMMS` plus VIP/action candidate | `NCMMS_CORE` |
| General short operational NCMMS issue | `NCMMS_DAILY` |

Suggestions require human confirmation unless the user explicitly applies a destination-specific `🎯/Meeting/*` label.

---

# 13. Gemini-note integration

Implement this after Core email carry-ins work. (RECONCILED: Phase 6 builds only the `MeetingNotesProvider` interface and a deterministic parser, with `GEMINI_DISCOVERY` and `GEMINI_RECONCILIATION` OFF. No real Gemini attachment format has been seen yet.)

## Discovery order

For a completed meeting occurrence:

1. Inspect Calendar event attachments.
2. Inspect event description links.
3. Identify Google Docs associated with the occurrence.
4. Compare with the configured human-notes Doc.
5. Only if necessary, perform a narrow Drive search using series and occurrence date.

Do not assume Gemini uses a fixed document title or section format.

Build a `MeetingNotesProvider` adapter:

```javascript
class MeetingNotesProvider {
  discoverForOccurrence(occurrence) {}
  readProposedActions(documentId) {}
  readProposedDecisions(documentId) {}
}
```

## Reconciliation workflow

1. Read the relevant Gemini sections.
2. Read human `DECISIONS` and `ACTION ITEMS`.
3. Produce proposed reconciled items.
4. Show them in the planner.
5. Require confirmation.
6. Create Tasks only for selected items.
7. Write Task links back into human notes or the integration index.
8. Preserve source document and paragraph/text provenance.

Suggested review card:

```text
NCMMS Core Team — Oct. 6

Proposed action:
Owner: [user/unassigned]
Action: ...
Due: ...
Source: Gemini notes
Confidence: ...

[Create Task] [Waiting] [Ignore] [Edit]
```

The deterministic parser should look for explicit headings and checkbox/list items first. AI-assisted extraction is deferred.

---

# 14. Optional future USAi adapter

Prepare an interface but do not call USAi in the initial build: (RECONCILED: Phase 7 excluded entirely from this run.)

```javascript
class LanguageAssistant {
  draftMeetingFramingLine(input) {
    throw new Error('Not configured');
  }

  extractCandidateActions(input) {
    throw new Error('Not configured');
  }
}
```

Potential approved use cases:

1. Draft a one-sentence meeting framing line from user-selected email content.
2. Reconcile action items from selected Gemini and human-note sections.

Required behavior if implemented later:

- User-selected content only
- Configurable exclusions by Gmail label and meeting series
- Human confirmation
- Timeout and retry handling
- Deterministic fallback
- No API key in source
- No email body in logs
- No broad inbox classification
- Compliance with agency AI, privacy, and records policies

---

# 15. Suggested application architecture

Adapt these modules to the existing project rather than forcing exact filenames. (RECONCILED: every new `.gs` file is IIFE-wrapped with an explicit export block, plus top-level delegators for RPC names, per the repo’s gas-namespace-iife and gas-global-init-order rules. Pure logic lives in `src/integration/*.js` and is built into `gas-app/Engines.gs` by `tools/build-gas-engines.js`.)

```text
Config.gs
  Read validated configuration
  Read meeting registry
  Feature flags (from Config tab) (RECONCILED)

GmailRepository.gs
  Search candidate threads
  Read thread metadata
  (RECONCILED) Read-only; no label apply/remove. Advanced Gmail service only.
  Generate Gmail links

TriageService.gs
  Calculate deterministic signals
  Rank candidates
  Suggest meeting destinations

TaskRepository.gs
  Create/update Tasks
  Read current Tasks
  Prevent Calendar/Task loops

CalendarRepository.gs
  Load occurrences
  Resolve recurring event IDs
  Classify events
  Discover attachments

MeetingService.gs
  Choose target occurrence
  Link prep/meeting/follow-up workflow
  Produce meeting-prep view

NotesRepository.gs
  Find/create occurrence sections
  Append carry-ins
  Read action/decision sections

GeminiNotesProvider.gs
  Discover generated notes
  Parse structured proposed items

LedgerRepository.gs
  Generate operation keys
  Check idempotency
  Write statuses and errors

QueueProcessor.gs
  Process 🎯 workflow labels
  Lock execution
  Bound batch size
  Quarantine errors

WebAppController.gs
  Serve Day, Triage, and Meeting Prep views
  Validate client actions

Triggers.gs
  Install/remove triggers
  Refresh caches
  Process queues
  Post-meeting discovery

Tests.gs
  Unit-like deterministic tests
  Dry-run integration tests
```

---

# 16. Server-side operations

Implement functions equivalent to:

```javascript
getTriageBoard(filters)
getMeetingPrep(seriesKey, occurrenceId)
getUpcomingMeetingChoices(threadId)
routeThreadToTask(threadId, options)
routeThreadToWaiting(threadId, options)
routeThreadToMeeting(threadId, occurrenceId, options)
dismissTriageItem(threadId)
processWorkflowQueue()
discoverMeetingSeries()
discoverGeminiNotes(occurrenceId)
getProposedMeetingActions(occurrenceId)
confirmMeetingActions(occurrenceId, selectedItems)
retryFailedOperation(operationKey)
```

All state-changing calls must:

1. Validate inputs.
2. Verify the referenced Gmail thread/event/doc still exists.
3. Verify authorization.
4. Obtain an appropriate lock.
5. Check the ledger.
6. Perform the operation.
7. Record success.
8. (RECONCILED) Set ledger status `PROCESSED` only when appropriate; no Gmail label is applied.
9. Return a structured result.

(RECONCILED) Each RPC name needs both the `global._xInternal` alias and a top-level delegator in `Code.gs`.

Example result:

```javascript
{
  ok: true,
  operationKey: '...',
  sourceUrl: '...',
  targetUrl: '...',
  message: 'Added to NCMMS Core Team on 2026-10-06'
}
```

---

# 17. Trigger plan

Make trigger times configurable. Initial operational model:

```text
Every 5–10 minutes:
  Process explicit 🎯 workflow labels

Approximately 6:55 AM local:
  Build/refresh daily planner and meeting-prep data

Approximately 7:20 AM:
  Refresh early NCMMS carry-ins

Midday:
  Refresh triage board data

End of workday:
  Reconcile waiting items and meeting actions

20–45 minutes after configured meetings:
  Look for Gemini notes and proposed action items
```

Do not create one permanent Apps Script trigger for every recurring Calendar occurrence. Prefer one scheduled dispatcher that checks completed configured meetings. (RECONCILED: a single dispatcher, consolidated with the existing 5-minute `syncWorkspaceChanges` trigger.)

Trigger processing must be bounded and resumable.

---

# 18. Security and scopes

Use explicit scopes in `appsscript.json`, adjusted to actual implementation.

(RECONCILED) Scopes:

- `gmail.readonly` (new; Advanced Gmail service; only new scope)
- Google Tasks (existing)
- Calendar (existing `calendar`)
- Docs via the Docs Advanced Service under `drive.file` (existing; `documents` stays removed)
- Drive: existing `drive.file` and `drive.readonly` (Gemini note discovery)
- Config/ledger Sheet via `drive.file` for an app-created Sheet. **Spike pending in Wave 0.** If it requires the `spreadsheets` scope, stop and report before expanding permissions.

Prefer the narrowest practical scopes. If the existing app already uses broader scopes, document rather than silently expand them.

Do not send emails, alter Calendar invitations, or modify source Gemini Docs during the initial implementation.

(RECONCILED) **Deploy gate:** no `clasp push` containing the new scope without explicit user approval. WORK additionally needs admin API-controls approval.

---

# 19. Required configuration

(RECONCILED) Feature flags live in the `Config` tab of the config Sheet, not in source constants, so they change without code edits. Defaults:

```javascript
const FEATURES = {
  GMAIL_ROUTER: true,
  TRIAGE_BOARD: true,
  NCMMS_CORE_PILOT: true,
  GEMINI_DISCOVERY: false,
  GEMINI_RECONCILIATION: false,
  USAI_ASSIST: false,
  DRY_RUN: true
};
```

(RECONCILED) Until the user passes the scope gate, `GMAIL_ROUTER` is effectively OFF in deployed builds.

Required private configuration:

```text
Timezone
User email or safe self-identification mechanism
Google Tasks list ID
Waiting list ID or waiting datastore (RECONCILED: not needed; Waiting is a tagged Task)
Configuration spreadsheet ID
Human-notes Doc IDs (RECONCILED: app-owned notes Doc IDs, auto-filled)
Calendar IDs
Recurring event IDs
Batch size
Trigger intervals
Maximum excerpt length
Excluded AI labels
```

The system should fail with a clear setup error if mandatory configuration is missing.

---

# 20. Build phases

(RECONCILED) Run scope: Phases 0–5 built in full; Phase 6 limited to interface, parser, and flags OFF; Phase 7 excluded.

## Phase 0 — Inspect and document

Before changing code:

1. Inventory existing files, services, UI routes, Tasks logic, and configuration.
2. Identify the existing Day Planner data model.
3. Identify current date/time and timezone helpers.
4. Identify existing Task-to-Calendar behavior.
5. Create a short architecture note describing proposed integration points.
6. Back up the script project or work in a separate deployment/version.

**Deliverable:** architecture/integration note and change plan.

## Phase 1 — Read-only discovery

Implement:

- Meeting registry reader
- Calendar event normalization
- NCMMS Core series discovery
- Upcoming-occurrence selection
- Read-only Gmail triage census
- Dry-run queue display

No Tasks, Docs, or Gmail labels are modified.

**Deliverable:** diagnostic page showing how sample data would be classified and routed.

## Phase 2 — Explicit Gmail-to-Task routing

Implement:

```text
🎯/Task
🎯/Task-Today
ledger statuses PROCESSED / ERROR (RECONCILED)
```

Use ledger and locks.

**Deliverable:** reliable Gmail-to-Task flow with source link and no duplicates.

## Phase 3 — NCMMS Core carry-in pilot

Implement:

- NCMMS Core occurrence resolution
- Prep cutoff behavior
- Notes occurrence skeleton in the app-owned Doc (RECONCILED)
- Pointer-only carry-ins
- Carry-in count on prep view
- Retry/error behavior

**Deliverable:** Gmail thread routes to exactly one selected Core occurrence.

## Phase 4 — Triage board

Implement:

- Deterministic score
- Direct Action queue
- Meeting Carry-in queue
- System Exception queue
- FYI/Reading queue
- User actions

**Deliverable:** user can triage without opening each Gmail thread.

## Phase 5 — Additional meetings and waiting items

Add:

- Daily Standup
- Facility Technology
- A&A
- Acquisition
- GSA/TRM
- Other configured meetings
- Waiting workflow

**Deliverable:** registry-driven behavior without meeting-specific code forks.

## Phase 6 — Gemini discovery and reconciliation

(RECONCILED: this run builds only the provider interface, the deterministic parser, and flags OFF.)

Implement:

- Attached-note discovery
- Structured extraction
- Human confirmation panel
- Confirmed Task creation
- Provenance links

**Deliverable:** no Gemini-derived Task is created without confirmation.

## Phase 7 — Optional AI pilot

Only after policy approval and explicit authorization. (RECONCILED: excluded from this run.)

---

# 21. Acceptance criteria

## Gmail-to-Task

- Applying `🎯/Task` creates exactly one Task.
- A label that remains on a thread already in the ledger does not create a duplicate Task. (RECONCILED)
- Task includes a valid Gmail link.
- Ledger status is `PROCESSED` after success. (RECONCILED; replaces label-removal and `_DP/Processed` criteria)
- Ledger status is `ERROR` after failure. (RECONCILED)
- A failed item can be retried.

## Gmail-to-meeting

- A Monday Core carry-in goes to the upcoming Tuesday occurrence.
- A Tuesday carry-in before the prep cutoff goes to that day.
- A carry-in after the cutoff goes to the next occurrence by default.
- User can override the occurrence.
- Reprocessing does not duplicate the note entry.
- The note entry links back to Gmail.
- The prep view displays an accurate carry-in count.

## Calendar

- `event_busy`, sunrise/sunset, leave, lunch, holidays, and Task due events are not offered as meeting destinations.
- Emoji and title variations do not break configured meeting resolution.
- Once discovered, recurring event IDs are used instead of title matching.
- Existing Task-derived Calendar events are not imported back as Tasks.

## Gemini

- Gemini notes are discovered from the event attachment/description where possible.
- Proposed actions are shown before creation.
- No action is created without user confirmation.
- Created Tasks link to their source.
- The system remains functional when Gemini notes are missing.

## Reliability

- Concurrent trigger runs do not produce duplicates.
- One malformed thread does not stop the batch.
- Logs omit message bodies and sensitive notes.
- Dry-run mode performs no state changes.
- All operational configuration can be changed without editing core source files.

---

# 22. Testing requirements

Create test fixtures or mock objects for:

1. Core email routed Monday afternoon.
2. Core email routed before Tuesday prep cutoff.
3. Core email routed after cutoff.
4. Duplicate routing attempt.
5. Gmail thread deleted after being queued.
6. Notes heading missing.
7. Notes subsection missing.
8. Doc temporarily inaccessible.
9. Calendar occurrence rescheduled.
10. Recurring meeting title changed.
11. Gemini notes missing.
12. Gemini action has no owner.
13. Existing Task-derived Calendar event.
14. Two triggers attempting the same operation.
15. Apps Script timeout or recoverable failure.
16. Sensitive-label item attempting AI processing.
17. Jira/ServiceNow messages referencing the same external ticket.

(RECONCILED) Test tiers:

- **A. Pure engines** in `src/integration/*.js`, node-tested (`npm test`).
- **B. vm-loaded `.gs`** with stubbed `PropertiesService`, `LockService`, `Utilities`, Advanced Gmail/Calendar/Tasks/Docs services (pattern: `gsa-tenant-portal-forms/tests/gas-runtime-stubs.js`).
- **C. Live `UnitTests.gs`** self-test in the real runtime.
- **D. Remote trigger/readback** (`?view=self-test&format=json` plus a signed result sink), HOME only. `clasp run` is not used.
- **Lint rule:** `GmailApp` is banned in `gas-app/*.gs`; only the Advanced Gmail service is allowed.

Include a `DRY_RUN` mode whose result states what would happen:

```text
Would create Task
Would route to NCMMS Core occurrence <ID>
Would append carry-in to Doc <masked ID>
Would skip because already processed
Would defer because cutoff passed
```

---

# 23. Expected engineering deliverables

The agent should return:

1. A brief description of the existing Day Planner architecture.
2. A file-by-file implementation plan.
3. Any required manifest changes and scopes.
4. Configuration Sheet schemas.
5. Apps Script source changes.
6. HTML/CSS/JavaScript changes for the Triage and Meeting Prep views.
7. Trigger installation/removal functions.
8. Dry-run diagnostics.
9. Test instructions and test results.
10. Deployment and rollback instructions.
11. Known limitations.
12. A list of assumptions requiring user confirmation.

Do not return only isolated code fragments. Integrate the changes with the existing application’s conventions.

---

# 24. Initial task to the agent

(RECONCILED) Scope is Phases 0–5 in full, Phase 6 interface/parser with flags OFF, Phase 7 excluded, and Gmail strictly read-only.

Begin with this scoped request:

> Inspect the existing Day Planner Apps Script project and implement Phases 0–5 (Phase 6 limited to the provider interface and deterministic parser, flags OFF). First document the current architecture and identify integration points. Then add a read-only meeting registry and Calendar discovery view, explicit `🎯/Task` and `🎯/Task-Today` processing with idempotency, an NCMMS Core email-carry-in pilot, the Triage board, and registry-driven additional meetings plus Waiting items. Keep `DRY_RUN` enabled by default. Do not implement USAi, broad automatic email classification, Gemini action extraction, Gmail label writes, or destructive Gmail-filter changes. Stop and report any required scope or architecture decision before expanding permissions or modifying existing data models. Do not `clasp push` a build containing the new Gmail scope without explicit user approval.

---

## Private setup values to provide directly to the agent

Provide these inside the approved development environment, not in a public prompt:

```text
[Existing Apps Script project/code]
[Configuration spreadsheet ID] (RECONCILED: created by the app)
[Tasks list ID]
[Waiting list ID, if used] (RECONCILED: not used)
[Primary Calendar ID]
[NCMMS Core recurring event ID, if known]
[NCMMS Core human-notes Doc ID] (RECONCILED: app-owned Doc, auto-created)
[Actual Gemini attachment example, if approved]
[Existing deployment and rollback procedure]
[Approved OAuth scopes or administrative constraints]
[Script timezone]
```

This handoff deliberately starts with a non-destructive Core Team pilot. Once that workflow passes the acceptance tests, the meeting registry makes the remaining recurring meetings configuration work rather than separate custom implementations.
