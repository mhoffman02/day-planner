# Engineering Handoff: Gmail–Calendar–Tasks–Meeting Notes Extension for Day Planner

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

Existing Gmail labels usually describe **subject matter**. New `_DP/*` labels describe **workflow actions**.

Do not replace the existing Gmail taxonomy.

---

# 2. Safety and implementation constraints

## Mandatory

1. **Do not destructively reorganize existing Gmail labels or filters.**
2. **Do not delete, mark read, archive, or send email during the initial implementation.**
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
10. Keep production configuration in a private Sheet, User Properties, or Script Properties, as appropriate.
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

Create or support:

```text
_DP/Task
_DP/Task-Today
_DP/Waiting
_DP/Meeting
_DP/Meeting/NCMMS-Core
_DP/Meeting/NCMMS-Daily
_DP/Read
_DP/Review
_DP/Processed
_DP/Error
```

Initial implementation only needs to activate:

```text
_DP/Task
_DP/Task-Today
_DP/Waiting
_DP/Meeting/NCMMS-Core
_DP/Processed
_DP/Error
```

## Label behavior

| Label | Action |
|---|---|
| `_DP/Task` | Create a Google Task without assuming it is due today |
| `_DP/Task-Today` | Create a Google Task due today |
| `_DP/Waiting` | Create/update a waiting-on item |
| `_DP/Meeting` | Place thread in the planner’s Meeting Inbox |
| `_DP/Meeting/NCMMS-Core` | Route a pointer to the next eligible Core Team occurrence |
| `_DP/Meeting/NCMMS-Daily` | Route a pointer to the next eligible Daily Standup |
| `_DP/Read` | Add thread to a reading queue |
| `_DP/Review` | Place thread in human triage without external action |
| `_DP/Processed` | Mark successful processing |
| `_DP/Error` | Mark failed processing while retaining the source label |

Do not treat `_DP/Processed` as a global permanent exclusion. Idempotency must be based on source identity plus action and target.

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

These must not be imported back into Tasks.

---

# 6. Meeting registry

Create a configuration tab named `Meeting Registry`.

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

The configured human-notes Doc should contain or support this occurrence structure:

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

Do not assume Google Tasks has a native priority field. Preserve the Day Planner’s current convention; otherwise use a title prefix such as `[A]`, `[B]`, or `[C]`.

## Due dates

- `_DP/Task-Today`: due today in the script’s configured timezone.
- `_DP/Task`: no due date unless chosen in the UI.
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

Use a separate Task list or the existing Day Planner waiting-item model. Do not create both unless the existing architecture requires synchronization.

---

# 10. Idempotency and processing ledger

Create a Sheet tab or existing datastore named `Integration Ledger`.

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
- User reapplying a workflow label

## Failure behavior

If processing fails:

1. Retain the source workflow label.
2. Apply `_DP/Error`.
3. Record a sanitized error in the ledger.
4. Do not apply `_DP/Processed`.
5. Continue processing unrelated items.
6. Allow retry from the planner or the next trigger.

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

`Dismiss` only removes an item from the planner’s current triage set. It must not delete the email.

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

Suggestions require human confirmation unless the user explicitly applies a destination-specific `_DP/Meeting/*` label.

---

# 13. Gemini-note integration

Implement this after Core email carry-ins work.

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

Prepare an interface but do not call USAi in the initial build:

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

Adapt these modules to the existing project rather than forcing exact filenames.

```text
Config.gs
  Read validated configuration
  Read meeting registry
  Feature flags

GmailRepository.gs
  Search candidate threads
  Read thread metadata
  Apply/remove workflow labels
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
  Process _DP labels
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
8. Apply `_DP/Processed` only when appropriate.
9. Return a structured result.

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
  Process explicit _DP workflow labels

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

Do not create one permanent Apps Script trigger for every recurring Calendar occurrence. Prefer one scheduled dispatcher that checks completed configured meetings.

Trigger processing must be bounded and resumable.

---

# 18. Security and scopes

Use explicit scopes in `appsscript.json`, adjusted to actual implementation.

Likely services:

- Gmail modify access for workflow labels
- Google Tasks
- Calendar read or events access
- Documents access
- Drive metadata/access for note discovery
- Spreadsheets for configuration and ledger

Prefer the narrowest practical scopes. If the existing app already uses broader scopes, document rather than silently expand them.

Do not send emails, alter Calendar invitations, or modify source Gemini Docs during the initial implementation.

---

# 19. Required configuration

Use feature flags:

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

Required private configuration:

```text
Timezone
User email or safe self-identification mechanism
Google Tasks list ID
Waiting list ID or waiting datastore
Configuration spreadsheet ID
Human-notes Doc IDs
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
_DP/Task
_DP/Task-Today
_DP/Processed
_DP/Error
```

Use ledger and locks.

**Deliverable:** reliable Gmail-to-Task flow with source link and no duplicates.

## Phase 3 — NCMMS Core carry-in pilot

Implement:

- NCMMS Core occurrence resolution
- Prep cutoff behavior
- Human-notes occurrence skeleton
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

Implement:

- Attached-note discovery
- Structured extraction
- Human confirmation panel
- Confirmed Task creation
- Provenance links

**Deliverable:** no Gemini-derived Task is created without confirmation.

## Phase 7 — Optional AI pilot

Only after policy approval and explicit authorization.

---

# 21. Acceptance criteria

## Gmail-to-Task

- Applying `_DP/Task` creates exactly one Task.
- Reapplying the label does not create a duplicate Task.
- Task includes a valid Gmail link.
- Source label is removed only after success.
- `_DP/Processed` is applied after success.
- `_DP/Error` is applied after failure.
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

Begin with this narrowly scoped request:

> Inspect the existing Day Planner Apps Script project and implement Phases 0–3 only. First document the current architecture and identify integration points. Then add a read-only meeting registry and Calendar discovery view, explicit `_DP/Task` and `_DP/Task-Today` processing with idempotency, and an NCMMS Core email-carry-in pilot. Keep `DRY_RUN` enabled by default. Do not implement USAi, broad automatic email classification, Gemini action extraction, or destructive Gmail-filter changes. Stop and report any required scope or architecture decision before expanding permissions or modifying existing data models.

---

## Private setup values to provide directly to the agent

Provide these inside the approved development environment, not in a public prompt:

```text
[Existing Apps Script project/code]
[Configuration spreadsheet ID]
[Tasks list ID]
[Waiting list ID, if used]
[Primary Calendar ID]
[NCMMS Core recurring event ID, if known]
[NCMMS Core human-notes Doc ID]
[Actual Gemini attachment example, if approved]
[Existing deployment and rollback procedure]
[Approved OAuth scopes or administrative constraints]
[Script timezone]
```

This handoff deliberately starts with a non-destructive Core Team pilot. Once that workflow passes the acceptance tests, the meeting registry makes the remaining recurring meetings configuration work rather than separate custom implementations.
