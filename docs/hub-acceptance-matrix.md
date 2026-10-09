# Hub acceptance matrix (Phase 28)

Maps every bullet of spec section 21 (reconciled) and every fixture 1-17 of section 22 in
[`specs/gmail-meeting-hub.md`](specs/gmail-meeting-hub.md) to the tests that cover it. Test names are
the `test()`/`it()` titles; the file is given first. "Live" means a step in
[`hub-setup-and-gate.md`](hub-setup-and-gate.md) section "Live verification".

Naming note: the spec says ledger status `PROCESSED`; the implemented status is `DONE`
(`LEDGER_STATUS.DONE`). `ERROR` is unchanged.

Legend: COVERED = automated test; PARTIAL = automated test plus a live-only remainder;
UNCOVERED = deliberately not built or not testable offline (reason given).

## Section 21: Gmail-to-Task

| Criterion | Status | Tests |
|---|---|---|
| Applying `🎯/Task` creates exactly one Task | COVERED | hubRouting: "(a) a 🎯/Task thread yields exactly one Task; rerun creates zero more"; "(a) Tasks beyond the first page and completed Tasks are searched before any create" |
| A label that stays on a ledgered thread does not duplicate | COVERED | hubRouting: "(a) ... rerun creates zero more"; ledger: "(a) duplicate routing returns SKIP_DONE and creates nothing" |
| Task includes a valid Gmail link | COVERED | hubRouting "(a) ..." asserts `Gmail: https://mail.google.com/mail/u/0/#all/<id>` in notes; taskPlanner: "notes carry Gmail URL, creation timestamp and dp-meta op-key marker" |
| Ledger `DONE` (spec: PROCESSED) after success | COVERED | hubRouting "(a) ..." (row `Status === 'DONE'`); ledger: "transitions PENDING->DONE\|ERROR\|DEFERRED and reject illegal ones"; hubLedgerRepo: "(e) upsert same OperationKey twice => one row..." |
| Ledger `ERROR` after failure | COVERED | hubRouting: "(d) failed item: sanitized ERROR row, rest of batch processed, retryFailedOperation succeeds later"; ledger: "(f) recoverable failure -> ERROR row then retry succeeds" |
| A failed item can be retried | COVERED | hubRouting "(d) failed item ..."; "(d) a thread deleted after queueing is quarantined as ERROR..."; hubRouting: "(h) a doc write that is inaccessible quarantines as ERROR and retry succeeds once fixed"; hubContractParity: "(b) mock/real server outputs satisfy the shared shape checker" (retry failure shape). UI Retry button: live step L6 |

## Section 21: Gmail-to-meeting

| Criterion | Status | Tests |
|---|---|---|
| Monday Core carry-in goes to the upcoming Tuesday | COVERED | occurrenceSelector: "(a) Monday afternoon routes to the Tuesday occurrence"; hubRouting: "(h) Monday-afternoon Core route targets the Tuesday occurrence; rerun does not duplicate" |
| Tuesday carry-in before the prep cutoff goes to that day | COVERED | occurrenceSelector: "(b) Tuesday 07:20 with prep starting 07:30 stays on the same day"; hubRouting: "(h) Tuesday 07:20 PT routes to the same day..." |
| Carry-in after the cutoff goes to the next occurrence | COVERED | occurrenceSelector: "(c) Tuesday 07:45 defers to the following occurrence", "cutoff instant itself is still eligible; one minute later is not", DST cases "(k)"; hubRouting "(h) ... 07:45 PT ... routes to next week" |
| User can override the occurrence | PARTIAL | occurrenceSelector: "(d) override current/recommended/specific/backlog"; hubRouting: "(h) user override routes to the current occurrence after the cutoff, or to a specific one", "(h) backlog routing is ledger-only..."; picker UI (flatten of `choices[].upcoming`, `options.seriesKey`) is exercised only by the mock/contract tests (gasBridge: "getUpcomingMeetingChoices returns recommended, choices..."; hubContractParity (b)). Rendering: live step L7 |
| Reprocessing does not duplicate the note entry | COVERED | notesPlanner: "appended exactly once across 3 reruns; missing heading handled in the same plan"; "dedupe survives a user editing the visible text"; hubNotesRepo: "(h) rerun 3x => carry-in appears once, with a working link and sections intact"; hubRouting "(h) Monday-afternoon ... rerun does not duplicate" |
| Note entry links back to Gmail | COVERED | notesPlanner: "carry-in uses spec section 8 format with a Gmail link"; hubNotesRepo: "(h) rerun 3x ... working link", "(h) a second carry-in lands after the first; inserted text does not inherit the link" |
| Prep view displays an accurate carry-in count | PARTIAL | notesPlanner: "carryInCount is 0 when heading missing and ignores other occurrences"; hubNotesRepo: "carryInCount rejects a bare occurrenceId instead of guessing"; hubSafety: "getHubStatus shape; getMeetingPrep(seriesKey, null) resolves the recommended occurrence with carry-in count"; hubContractParity (b) prep shape. Count is read from the real Doc: live step L7. The entry list is not shown (count only; see known limitations) |

## Section 21: Calendar

| Criterion | Status | Tests |
|---|---|---|
| `event_busy`, sunrise/sunset, leave, lunch, holidays, Task-due events are not destinations | COVERED | eventClassifier: "(g) every excluded example from spec section 5 is not a meeting destination", "maps excluded categories to sensible types", "isMeetingDestination is true only for MEETING" |
| Emoji and title variations do not break resolution | COVERED | eventClassifier: "normalizeEventTitle strips emoji/punctuation and case-folds", "(i) classifies emoji/title variants of the Core meeting as MEETING"; occurrenceSelector: "falls back to normalized title only for discovery..." |
| Once discovered, recurring IDs are used instead of title matching | COVERED | occurrenceSelector: "resolves by RecurringEventId", "(f) renamed title still resolves by id and reports the rename", "reports a stale persisted id..."; hubSafety: "discoverMeetingSeries finds the recurring id and reports the missing registry writer...", "discoverMeetingSeries persists RecurringEventId and CalendarId through the real DPConfig registry writer"; hubConfig: "updateRegistryRow writes validated fields in one batch call", "updateRegistryRow rejects unknown series, unknown columns, and SeriesKey rewrites" |
| Task-derived Calendar events are not imported back as Tasks | COVERED | eventClassifier: "(h) gasTaskId-tagged event is TASK_DUE and never importable, even if titled like a meeting", "task-like and all-day events are never importable..."; hubRouting: "(i) Task-derived (gasTaskId) Calendar events are never destinations nor importable". Existing 2-way sync side: syncEngine tests (unchanged) |

## Section 21: Gemini (Phase 6 = interface + deterministic parser only, flags OFF)

| Criterion | Status | Tests / reason |
|---|---|---|
| Gemini notes discovered from attachment/description | UNCOVERED | Discovery is not built in v1 scope (`discoverGeminiNotes` is a flag-gated stub returning `NOT_IMPLEMENTED`). Only the pure parser exists. Needs a real Gemini attachment sample (spec "private setup values"); live step L10 once approved |
| Proposed actions shown before creation | UNCOVERED | Parser produces proposals (geminiParser: "checkbox and bullet forms both parsed", "detects owners"), but no UI or RPC surfaces them; `getProposedMeetingActions` is a stub (hubSafety: "Gemini RPCs are stubs: ok:false with flag-off message") |
| No action created without user confirmation | COVERED (vacuously) | Nothing creates Gemini actions: `confirmMeetingActions` is a stub (hubSafety: "Gemini RPCs are stubs..."); geminiParser: "missing notes -> empty proposals, not an error" and `parseGeminiNotes` is pure (no service access) |
| Created Tasks link to their source | UNCOVERED | Depends on Gemini action creation (not built). The Gmail-sourced equivalent is covered above (Task notes carry the Gmail link) |
| System functions when Gemini notes are missing | COVERED | geminiParser: "missing notes -> empty proposals, not an error"; hubRouting: "(f) all flags OFF: processWorkflowQueue touches nothing"; hubSafety: "Gemini RPCs are stubs..." |

## Section 21: Reliability

| Criterion | Status | Tests |
|---|---|---|
| Concurrent trigger runs do not duplicate | COVERED | ledger: "(b) two triggers on same op: exactly one PROCEEDs, other WAIT_IN_FLIGHT"; gasEnginesVm: "(b) two simulated concurrent triggers via the vm LockService..."; hubRouting: "(g) two concurrent runs: the second finds the lock held and does nothing"; hubSafety: "(m) installHubTriggers twice leaves exactly one hubDispatch trigger..." |
| One malformed thread does not stop the batch | COVERED | queuePlanner: "malformed item is quarantined with a sanitized message; others proceed", "(d) thread deleted after queuing -> quarantined SOURCE_MISSING...", "source check that throws quarantines only that item"; hubRouting "(d) failed item ...", "(d) a thread deleted after queueing ..."; hubSafety: getTriageBoard counts per-item errors without aborting |
| Logs omit message bodies and sensitive notes | COVERED | hubSafety: "(l) message bodies never reach logs, properties, ledger, Tasks, Docs or RPC returns", "(l) no GmailApp anywhere and no Gmail write method calls"; ledger: "(k) sanitizeError strips emails, long ids, urls, extra lines and caps length"; notesPlanner: "pointer only: body-like fields are rejected"; hubContractParity: board items carry no `body` |
| Dry-run mode performs no state changes | COVERED | hubRouting: "(e) DRY_RUN performs zero writes and returns the spec strings", "(e) DRY_RUN spec strings: skip-if-processed and defer-after-cutoff"; ledger: "(g) DRY_RUN yields the spec strings and mutates nothing"; hubContractParity: "(b) ... (DRY_RUN true)" for mock and real |
| All operational configuration changeable without editing core source | COVERED | hubConfig: "(c) features default DRY_RUN true and all other flags false", "(d) setFeature round-trips and rejects bad input", "getConfig returns typed, frozen values with defaults", "(b) missing TimeZone throws SETUP_ERROR naming the key", "updateRegistryRow ..."; registry: "(j) parses a valid sheet" and companions; hubContractParity: "(c) feature flag names ... equal DPEngines.DEFAULT_FEATURES". Sheet edit by hand: live step L3 |

## Section 22: fixtures 1-17

| # | Fixture | Status | Tests |
|---|---|---|---|
| 1 | Core email routed Monday afternoon | COVERED | occurrenceSelector "(a) ..."; hubRouting "(h) Monday-afternoon ..." |
| 2 | Core email before Tuesday prep cutoff | COVERED | occurrenceSelector "(b) ..."; hubRouting "(h) Tuesday 07:20 PT ..." |
| 3 | Core email after cutoff | COVERED | occurrenceSelector "(c) ..."; hubRouting "(h) ... 07:45 PT ..."; hubRouting "(e) DRY_RUN spec strings: skip-if-processed and defer-after-cutoff" |
| 4 | Duplicate routing attempt | COVERED | ledger "(a) duplicate routing returns SKIP_DONE and creates nothing"; hubRouting "(a) ..." and "(h) ... rerun does not duplicate"; notesPlanner "appended exactly once across 3 reruns..." |
| 5 | Gmail thread deleted after being queued | COVERED | queuePlanner "(d) thread deleted after queuing -> quarantined SOURCE_MISSING, rest of batch proceeds"; hubRouting "(d) a thread deleted after queueing is quarantined as ERROR and the batch continues" |
| 6 | Notes heading missing | COVERED | notesPlanner "(e) heading missing -> full skeleton created, once"; hubNotesRepo "(h) applyPlan on an empty doc creates the skeleton..." |
| 7 | Notes subsection missing | COVERED | notesPlanner "(e) subsection missing -> only that subsection added, in canonical order" |
| 8 | Doc temporarily inaccessible | COVERED | notesPlanner "(e/#8) doc inaccessible -> retryable ERROR via ledger, no partial write"; hubNotesRepo "(h) DOC_INACCESSIBLE: read and apply throw a retryable error and leave the doc unchanged", "(h) DOC_INACCESSIBLE raised by batchUpdate itself ..."; hubRouting "(h) a doc write that is inaccessible quarantines as ERROR and retry succeeds once fixed" |
| 9 | Calendar occurrence rescheduled | COVERED | occurrenceSelector "(e) rescheduled occurrence recomputes cutoff and keeps its id" |
| 10 | Recurring meeting title changed | COVERED | occurrenceSelector "(f) renamed title still resolves by id and reports the rename"; eventClassifier "(i) ..." |
| 11 | Gemini notes missing | COVERED | geminiParser "missing notes -> empty proposals, not an error" |
| 12 | Gemini action has no owner | COVERED | geminiParser "action with no owner -> owner null, dueHint null" |
| 13 | Existing Task-derived Calendar event | COVERED | eventClassifier "(h) gasTaskId-tagged event is TASK_DUE ..."; hubRouting "(i) Task-derived (gasTaskId) Calendar events ..." |
| 14 | Two triggers attempting the same operation | COVERED | ledger "(b) ..."; gasEnginesVm "(b) ..."; hubRouting "(g) ..." |
| 15 | Apps Script timeout or recoverable failure | COVERED (simulated) | ledger "(f) recoverable failure -> ERROR row then retry succeeds", "completion-write crash leaves PENDING that goes stale and is retried"; hubRouting "(c) crash after Task create but before ledger DONE...", "(c) hard crash leaves a stale PENDING row..."; taskPlanner "(c) crash between Task create and ledger write..."; queuePlanner "(i) batch is bounded by batchSize and the cursor resumes to completion". A real 6-minute timeout cannot be induced offline: live step L8 |
| 16 | Sensitive-label item attempting AI processing | COVERED | aiGuard "sensitive labels blocked in all flag combinations (spec test 16)", "explicit audit signal blocks", "flag off blocks" |
| 17 | Jira/ServiceNow messages referencing the same ticket | COVERED | externalTickets "same ticket via different senders/formats yields same key", "ServiceNow message referencing a Jira key resolves by subject first" |

## Cross-cutting guards added in Wave 3

| Guard | Test |
|---|---|
| Every RPC the UI/bridge calls has an IIFE alias and a Code.gs top-level delegator | hubContractParity "(a) ..." |
| Mock and real server outputs share one shape (`tests/helpers/hubShapes.js`) for getHubStatus, getTriageBoard, getUpcomingMeetingChoices, getMeetingPrep, route*, dismiss, retry, failure/flag-off envelopes, in DRY_RUN on and off | hubContractParity "(b) ..." (4 tests) and "(b) queue keys on the board are exactly the keys the UI renders" |
| UI flag names and mock flags equal `DEFAULT_FEATURES` | hubContractParity "(c) ..." |
| `GmailApp` banned; only Advanced Gmail; `gmail.readonly` only; no broad scopes | hubSafety "(l) no GmailApp anywhere..."; hubConfig "(j) own .gs files never reference GmailApp or SpreadsheetApp", "(k) appsscript.json: valid, gmail.readonly present, broad scopes absent, services enabled" |
| One dispatcher trigger; existing 5-minute sync trigger untouched | hubSafety "(m) ..." |

## Live-only items and the step that covers each

See `hub-setup-and-gate.md`: L1 Sheets-under-`drive.file` spike, L2 Gmail label-name resolution with emoji,
L3 Config/Registry edits in the Sheet, L4 DRY_RUN smoke, L5 explicit `🎯/Task` with DRY_RUN off,
L6 retry of a failed item, L7 Triage and Meeting Prep rendering plus the occurrence picker and carry-in count,
L8 timeout/trigger behavior, L9 WORK scope approval, L10 Gemini sample (deferred).

## Uncovered summary

- Gemini discovery, proposal display and source-linked Task creation (3 bullets): Phase 6 is interface +
  parser only by scope decision; flags OFF.
- No other section 21 or 22 item is uncovered. PARTIAL items need a live check for the real Google
  service behavior the fakes cannot prove.
