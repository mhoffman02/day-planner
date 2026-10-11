# Gmail / Meeting Hub: setup, push gate, rollback, limitations (Phase 28)

Architecture: [`hub-architecture.md`](hub-architecture.md). Acceptance mapping: [`hub-acceptance-matrix.md`](hub-acceptance-matrix.md).

Status: live on HOME prod (@319, 2026-10-10); HOME live checks passed (see PLAN-HISTORY Phase 28); WORK v132 pushed, pending IDE repoint. All hub
features default OFF and `DRY_RUN` is ON.

## 1. Private setup values checklist (spec "Private setup values")

Never paste these into a public prompt or commit them. Most are created or filled by the app.

| Value | Where it lives | Who provides it |
|---|---|---|
| Config spreadsheet ID | User property `DP_HUB_SHEET_ID`; the Sheet is app-created ("Day Planner Hub Config") in the Day Planner Drive folder | App (automatic) |
| Day Planner Drive folder | User property `DAY_PLANNER_ROOT_FOLDER_ID` (existing first-run setup) | Already bound; required before the Sheet can be created |
| Timezone | Config tab `TimeZone` (seeded from the Calendar user setting, else the primary calendar, else the script time zone) | Confirm; mandatory |
| User email | Config tab `UserEmail` (seeded from the session; may be blank on some accounts) | Fill if blank; mandatory |
| Google Tasks list ID | Config tab `TasksListId` (seeded `@default`) | Optionally the real list ID; mandatory |
| Primary Calendar ID | Meeting Registry `CalendarId` (blank = `primary`; discovery writes it) | Optional |
| NCMMS Core recurring event ID | Registry `RecurringEventId`; written by `discoverMeetingSeries` outside DRY_RUN | App (after discovery) |
| Meeting notes Doc IDs | Registry `HumanNotesDocId`; app-owned Docs auto-created and auto-filled | App (automatic) |
| Waiting list ID | Not used: Waiting is a Task tagged `[Waiting]` | none |
| Gemini attachment example | Needed only for Phase 6 discovery work (not built) | User, if approved |
| Deployment and rollback procedure | Section 5 below and `.agents/rules/gas-environments.md` | existing |
| Approved OAuth scopes / admin constraints | Section 4 (WORK) | WORK admin |
| Other Config tab keys | `BatchSize` (25), `TriggerMinutes` (5; one of 1, 5, 10, 15, 30), `MaxExcerptChars` (160), `ExcludedAiLabels` (`HR/,_NCMMS/OIG Audit,_NCMMS/Acquisition,FOIA`) | Defaults are fine |

Missing mandatory keys fail loudly with `SETUP_ERROR: <key> ...`; the app does not guess.

## 2. Enabling the features (after the gate passes)

Flags live in the `Config` tab of the hub Sheet (columns `Key`, `Value`; values `TRUE`/`FALSE`). Edit the Sheet by
hand, or run `DPConfig.setFeature(name, bool)` from a throwaway IDE function. Defaults:

| Flag | Default | Effect |
|---|---|---|
| `DRY_RUN` | TRUE | Every write becomes a "Would ..." message; no Task, Doc or ledger change |
| `GMAIL_ROUTER` | FALSE | Master switch for label routing, the queue, Triage and Meeting Prep RPCs |
| `TRIAGE_BOARD` | FALSE | Triage nav and board (also needs `GMAIL_ROUTER`) |
| `NCMMS_CORE_PILOT` | FALSE | Meeting Prep nav (also needs `GMAIL_ROUTER`) |
| `GEMINI_DISCOVERY`, `GEMINI_RECONCILIATION`, `USAI_ASSIST` | FALSE | Stubs only in this build; leave OFF |

Recommended order: (1) run discovery and the DRY_RUN smoke with `GMAIL_ROUTER` TRUE and `DRY_RUN` TRUE;
(2) read the "Would ..." output; (3) set `DRY_RUN` FALSE for a single seeded test thread; (4) enable
`TRIAGE_BOARD` and `NCMMS_CORE_PILOT`; (5) install the trigger by running `installHubTriggers` in the IDE (one
`hubDispatch` trigger; `removeHubTriggers` removes only it; the existing 5-minute sync trigger is untouched).

## 3. Labelling threads in Gmail

The app never writes Gmail. Create these labels once, with exactly these names (the target emoji is U+1F3AF; type
it with the OS emoji picker; slashes make nested labels), and apply them by hand:

`🎯/Task`, `🎯/Task-Today`, `🎯/Waiting`, `🎯/Meeting`, `🎯/Meeting/NCMMS-Core`, `🎯/Meeting/NCMMS-Daily`,
`🎯/Read`, `🎯/Review`.

Acted on in v1: `🎯/Task`, `🎯/Task-Today`, `🎯/Waiting`, `🎯/Meeting/NCMMS-Core`. The rest are recognized and
inert (they feed Triage candidates). Leaving a label on a processed thread is safe: the ledger prevents a second
Task. Result of each thread shows as ledger status (`DONE`, `ERROR`, `DRY_RUN`, `DEFERRED`) in Triage; there are
no Processed or Error labels in Gmail.

## 4. PUSH GATE runbook (STOP: user approval required before any of this)

`gas-app/appsscript.json` on this branch already contains the new scope and services, so **any `clasp push` of this
branch includes them**. Do not push without explicit user approval. Do not run `npm run push:work` yet.

New in the manifest: scope `https://www.googleapis.com/auth/gmail.readonly`; Advanced Services `Gmail` (v1) and
`Sheets` (v4). No broad `spreadsheets`, `documents`, `mail.google.com` or `drive` scope.

Order of operations (HOME first; HOME is the mastercopy):

1. Pre-flight: `npm run lint && npm test` clean. `npm run check:engines` clean.
2. Close any open Apps Script IDE editor tab for the project (an open tab silently clobbers clasp pushes that
   touch the manifest).
3. `clasp push --force` to HOME (user-approved), then the pinned deploy per the standing HOME procedure.
4. In the Apps Script IDE: **Services (+)**: confirm `Gmail API` (v1, identifier `Gmail`) and `Google Sheets API`
   (v4, identifier `Sheets`) are listed; add them if not (a manifest entry alone does not enable the underlying
   Cloud API). In the linked Google Cloud project enable the Gmail API and the Sheets API.
5. Re-consent: as `mhoffman02@gmail.com`, open the `/dev` URL (or run any function from the IDE) and accept the new
   `gmail.readonly` consent. The web app deploys as the deploying user, so the owner must consent once. Redeploy a
   new version after the scope change so `/exec` uses it.
6. Nothing is enabled yet: all flags OFF, so the app behaves as before. Open `?view=self-test` and confirm the
   `hub` section: modules present, dispatcher trigger count 0 or 1.

### Live spike: Sheets under `drive.file` (assumption 6, must pass before anything else)

The hub Sheet is created by the app and read/written through the Sheets Advanced service under `drive.file` only.
This worked for Docs; it is unproven for Sheets.

1. Run `UnitTests.gs:hubSpike` in the IDE. It runs `DPConfig.ensureSetup()`, lists the tabs, reads Config, runs
   `discoverMeetingSeries` (DRY_RUN), and logs every step ending in `[hubSpike] RESULT: PASS` or `FAIL at <step>`.
   (`getHubStatus` deliberately touches no Sheet while unprovisioned, and the IDE hides return values.)
2. Pass: a Sheet named "Day Planner Hub Config" appears in the Day Planner Drive folder with four tabs
   (`Config`, `Meeting Registry`, `Integration Ledger`, `Integration Ledger Archive`), headers present, Config seeded with flags
   (`DRY_RUN` TRUE), Registry seeded with 10 series (5 enabled); `getHubStatus` returns `ok:true`; edit a flag in the
   Sheet and see it reflected (`getHubStatus` and every `hubDispatch` tick re-read the Config tab and refresh the
   `HUB_FLAGS_JSON` property mirror; the other RPCs read only that mirror); run `discoverMeetingSeries` with `DRY_RUN` TRUE (reports matches, `persisted:false`),
   then FALSE and confirm `RecurringEventId`/`CalendarId` appear in the registry row.
3. Fail: `getHubStatus` returns `ok:false` with a message containing a 403/"permission"/"insufficient" error from
   Sheets, or the Sheet exists but reads fail; `SETUP_ERROR` about the Sheet id is a different problem (folder not
   bound).
4. Fallback if it fails (STOP and report; do not widen scopes on your own):
   (a) request approval to add the broad `https://www.googleapis.com/auth/spreadsheets` scope (heavier consent, harder
   for WORK admin approval), or (b) replace the Sheet-backed `DPConfig`/`DPLedgerRepo` storage with a Drive JSON file
   under `drive.file` (same interfaces; the repositories and engines do not change, but the user loses the
   hand-editable Sheet). Option (b) is the recommended default if the user wants to stay on narrow scopes.

### Live verification steps (cover the PARTIAL/live-only matrix items)

- L1 Sheets spike (above).
- L2 Gmail label-name resolution with emoji: with `GMAIL_ROUTER` TRUE and `DRY_RUN` TRUE, label a seeded test thread
  `🎯/Task`; `processWorkflowQueue` from the IDE must report "Would create Task". If the label is not found, see
  assumption A1.
- L3 Edit a registry cell and a flag in the Sheet; confirm the app picks it up without a code change.
- L4 DRY_RUN smoke: all "Would ..." strings, zero Tasks/Docs/ledger writes.
- L5 `DRY_RUN` FALSE with 2-3 seeded threads (one per `🎯/Task`, `🎯/Task-Today`, `🎯/Waiting`): exactly one Task
  each, Gmail link in notes, ledger `DONE`; rerun creates nothing.
- L6 Force a failure (revoke the notes Doc or use a bad Task list ID), see ledger `ERROR` in Triage, fix, press Retry.
- L7 Triage and Meeting Prep render against the real server (queue keys, item fields, picker, carry-in count equals
  the Doc), using `tools/ensure-chrome.js` + `tools/e2e/*` (never a generic browser tool).
- L8 Dispatcher: `installHubTriggers` twice leaves one trigger; observe a scheduled run; a run that overlaps another
  skips on the lock.
- L9 WORK: scope approval (section 6).
- L10 Gemini attachment sample: deferred; no Gemini code is active.

## 5. Rollback

- Fastest: set `GMAIL_ROUTER` FALSE in the Config tab. All hub RPCs return `FLAG_OFF`, the dispatcher no-ops, the
  nav items hide. Then run `removeHubTriggers` in the IDE to delete the one `hubDispatch` trigger.
- Data: Tasks, Docs and Sheet rows already created remain (they are ordinary Google files). The ledger is the
  record of what was created; delete the Sheet only if you also accept losing idempotency history.
- Code: redeploy the previous pinned version (`clasp deploy -i <pinned-id>` of the prior version), or `git revert`
  the merge and push. Because the manifest scope and services are part of the revert, the consent screen reverts on
  the next version. The Gmail/Sheets Advanced Services can be removed in IDE Services (+) afterwards.
- WORK: do not promote before HOME passes. If WORK already took the version, repoint `/exec` to the previous
  version in the WORK IDE.

## 6. WORK promotion

1. Only after HOME passes L1-L8: `npm run push:work` (targets `gas-app/.clasp-work.json`; never edit
   `.clasp.json`). It creates the version through the shared editor but does not repoint `/exec`.
2. `michael.hoffman@gsa.gov` must, in the WORK IDE: Services (+) add Gmail and Sheets (as in step 4), then
   Deploy > Manage deployments > Edit > Version > Deploy. Per the standing rule, after `push:work` the message is
   just "Update WORK".
3. Admin approval caveat: WORK is a US federal .gov Workspace. New OAuth scopes (`gmail.readonly`) and enabling the
   Gmail/Sheets APIs for the Cloud project may be blocked by org-level API Controls, and unverified apps may need an
   admin to allow them. Treat this as likely-blocked until proven; a failure there is an org policy outcome, not a
   code defect, and HOME remains fully functional. `/dev` is never used on WORK.

## 7. Known limitations

- Gmail is read-only: no label changes, no archiving. Processed/Error exist only as ledger status.
- Meeting Prep shows the carry-in **count** only; entries are read in the notes Doc. No agenda, no entry list.
- Read Later in Triage is client-only `localStorage` (per browser, not synced, not in the ledger).
- Phase 6 is interface + parser only: Gemini discovery, proposal UI and action creation are not built; those RPCs
  return `NOT_IMPLEMENTED` behind flags. No USAi, no broad auto-classification, no Gmail filter changes.
- The Triage board scans a bounded set (default 40, max 100) of threads carrying the triage labels, not the whole inbox.
- Send to Meeting picker uses the first available suggested series; a thread suggested to several series needs a
  second route for the others.
- Apps Script limits: 6-minute executions (bounded batch with a 4 minute start guard, resumable by DONE-filtering, no cursor), `LockService` waits of 10 s for RPCs;
  Docs/Sheets quotas apply.
- Sheet-backed config means user edits are not validated until read; invalid values throw `SETUP_ERROR`.
- Local preview mode uses `src/hubMock.js`; it matches response shapes (tested) but not Google behavior.

## 8. Assumptions needing your confirmation

Collected from the build waves; each is covered by tests at the fake level but needs a real-service check.

| # | Assumption | Impact if wrong | Check |
|---|---|---|---|
| A1 | Gmail label-name to id resolution works for names with emoji and slashes via `Gmail.Users.Labels.list` exact match | Labelled threads are never seen | Live L2 |
| A2 | `Intl.DateTimeFormat` with `timeZone` is available and correct in the Apps Script V8 runtime (used for zone-local dates and DST-safe cutoffs) | Wrong due dates/cutoffs near midnight or DST | Self-test / L5 |
| A3 | The lock is the **script lock** (`LockService.getScriptLock`), shared by the dispatcher and RPCs; locks are not re-entrant so Config/Ledger take none | Duplicates under concurrency if user-lock semantics differ | L8 |
| A4 | `TriggerMinutes` is limited to 1, 5, 10, 15, 30 (Apps Script `everyMinutes` accepted values) | Install throws on other values | Config guidance |
| A5 | Backlog routing uses `GMAIL|<thread>|MEETING|BACKLOG-<SERIES_KEY>` in the occurrence slot (a series key can never collide with a Calendar event id) | Collision would skip a real route | Test "(h) backlog routing ..." |
| A6 | `again:true` on `routeThreadToTask` makes a second Task by appending a time-based suffix (`<thread>~<base36 ms>`) to the thread id in the op key | A deliberate second Task is otherwise blocked by the ledger | Product decision |
| A7 | Read Later is client-only `localStorage` and acceptable | Lost on browser change | Product decision |
| A8 | `carryInCount(docModel, {date, displayName})` signature: the occurrence is the local date plus series display name; a bare occurrence id is rejected | Count would be 0 or wrong | Test "carryInCount rejects a bare occurrenceId..." |
| A9 | Prep cutoff is **inclusive**: an item at exactly the cutoff instant still goes to that occurrence; one minute later defers | Off-by-one at the boundary | Test "cutoff instant itself is still eligible..." |
| A10 | Blank `PostReviewMinutes` defaults to 30 (and blank `PrepMinutes` to the spec section 5 value) | Review window length | Registry parse tests |
| A11 | Sheets/Docs/Tasks access works under `drive.file` for app-created files, and Tasks/Calendar stay on existing scopes | Whole Sheet-backed design | Live L1 |
| A12 | Gmail thread bodies are available through the Advanced Gmail `format=full` payload and are used in memory only | Scoring signals degrade | L7 |
| A13 | Priority uses the existing `[A1]-[C9]` convention (`A1` for score >= 8 Today, `B1` otherwise; `C1` low) rather than the spec `[A]` | Task titles differ from spec | Product decision |
| A14 | Notes Docs are app-owned (`Meeting Notes - <Series>`); the user's existing human-notes Doc is untouched | Two docs per series | Product decision |
| A15 | `discoverMeetingSeries` now persists both `RecurringEventId` and `CalendarId` (the calendar the event was found on; `primary` when the row was blank) | Registry gets an explicit `primary` | Live L1 |

## Operational behavior added by the adversarial review fixes (findings 2-6, 8-14)

- **Flags OFF is a no-op.** Flags are mirrored into the UserProperties key `HUB_FLAGS_JSON`. Until the hub Sheet
  exists the key is absent, so every flag reads OFF (`DRY_RUN` TRUE) and app load (`getHubStatus`) makes no Drive or
  Sheets call and never creates the Sheet. The Sheet is created only by an explicit setup action
  (`DPConfig.ensureSetup`, `setFeature`, `getConfig`, `discoverMeetingSeries`). First-run creation is serialized with
  the user lock and re-checks the stored id, so two concurrent first runs create one Sheet.
- **Retries.** The trigger loop re-runs a failed (`ERROR`) item only when it is retryable: backoff 5, 10, 20, 40 minutes
  (cap 240), at most 5 attempts (`attempts`, `retryable`, `nextRetryAt` in `MetadataJson`). `SERIES_NOT_FOUND`,
  `OCCURRENCE_NOT_FOUND`, `SOURCE_MISSING` and any `retryable:false` error are never auto-retried. The manual
  `retryFailedOperation` always re-runs.
- **Runtime/quota.** One ledger read and one Tasks list read per queue run; no new item starts after 4 minutes (the rest
  resume next run, no `PENDING` orphans, lock released). `LOCK_BUSY` or a failed pass does not mark a daily job done.
  `TRIAGE_REFRESH` counts from metadata-format reads, capped at 20 threads.
- **Ledger capacity.** At 5000 rows, `DONE` rows older than 90 days move to the `Integration Ledger Archive` tab in one
  batch; with nothing archivable the operation still fails with `LEDGER_FULL`.
- **DRY_RUN bookkeeping.** A dry run writes only `HUB_LAST_RUN_DRY` (never `HUB_LAST_RUN`); `getHubStatus.lastRun`
  reports whichever is newer.
- **Links.** Gmail links are account-agnostic (`mail.google.com/mail/#all/<threadId>`, no `/u/0/`); previously created
  Tasks keep their old links.
