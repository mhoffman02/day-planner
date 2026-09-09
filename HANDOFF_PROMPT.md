# Session Handoff & Continuation Prompt — 2026-09-09

**Generated**: 2026-09-09 (manual — planning handoff, no code changed this session)
**Branch**: master
**Last Commit**: 4b66bb6 docs(plan): track dead global-search backend and IIFE refactor completion

## Task for Next Session: Make Ctrl+K Search Actually Global

**Decision (already made, don't re-litigate)**: build local IndexedDB backfill + wire the
existing `executeUniversalSearch()` engine in, **not** the dead GAS server-search path
(`searchAcrossAllMonthlyDocs()` in `gas-app/Code.gs:2178-2242`). Rejected server-side search:
per-query Drive round trips, no offline search, fights the app's offline-first/static-client
design. See `PLAN.md`'s Feature Backlog entry (search "Make Ctrl+K search actually global") for
the full rationale.

### The gap, precisely

`runSearch()` in `src/app.js` (~line 3178) is a second, worse, inline reimplementation of the
already-written and already-unit-tested `executeUniversalSearch()` in `src/searchEngine.js`. Two
problems, not one:

1. **It's the wrong function.** `executeUniversalSearch()` exists, is covered by
   `tests/searchEngine.test.js`, and is never called from `app.js`. `runSearch()` should call it
   instead of hand-rolling matching against `this.calendarEvents`/`this.dailyTasks` etc.
2. **The data it searches is scoped to "right now," not "globally."** `this.dailyNote` is only
   the currently-open day's note text, and `this.indexRecords` (`app.js` ~line 2495) is parsed
   *from that same single note* — so notes/index search only ever covers whatever day happens to
   be on screen, silently. `calendarEvents` is whatever range happens to be loaded (rich/dense
   data). `dailyTasks`+`masterTasks` is already close to global (Tasks API is global by nature) —
   tasks are the sparse side of this, so they're the least urgent piece.

### What to build

**Fast path — current month, eager (no behavior change needed here, just confirm):**
Current-day/current-month data already loads eagerly via the normal day-load path. No new work
required for "today" to be searchable instantly.

**Lazy path — ±6 months, on-demand expand:**
- Reuse, don't reinvent, the rolling-prefetch machinery already in `app.js`:
  `_prefetchMonth(monthStr, {force})` (~line 1557), `_scheduleMonthWindowPrefetch(centerMonthStr)`
  (~line 1589, currently hardcoded to a ±1 month window), `IDB_STORE_MONTH_OVERVIEW` +
  `IDB_STORE_MONTHLY_NOTES` in `src/indexedDbStore.js`.
- Add a search-triggered backfill: when the search modal opens (`toggleSearchModal()`,
  `app.js` ~line 3159) or a search comes back match-poor, kick off (or extend) a background walk
  outward to ±6 months from the currently-open month, using the same idle-queue staggering
  `_scheduleMonthWindowPrefetch` already does (one month at a time via
  `requestIdleCallback`/`setTimeout` fallback, current-month-out ordering) — **not** an eager
  full-history load on app start. Track already-backfilled months (a `Set` alongside
  `_prefetchInFlight`/`_monthPrefetchInFlight`) so repeat searches don't re-walk months already
  cached and fresh.
- Budget for calendar data first: notes are currently sparse and cheap, calendar events are
  dense/rich, so a ±6-month window is calendar-call-volume-bound, not notes-bound. Tasks are
  sparse too — low priority to expand further, they're already close to globally visible via the
  Tasks API.
- Wire `runSearch()` to call `executeUniversalSearch()` against the accumulated IndexedDB state
  (current month + whatever ±N months have been backfilled so far) instead of only live Alpine
  state. Decide the store shape `executeUniversalSearch({calendarEvents, dailyTasks, masterTasks,
  dailyNotes, indexEntries})` expects vs. what's actually sitting in `IDB_STORE_MONTHLY_NOTES` /
  `IDB_STORE_MONTH_OVERVIEW` — some assembly/mapping will be needed, this isn't a drop-in.
- Manual refresh: an explicit "search wider" or resync affordance in the search modal to force a
  backfill beyond whatever's cached, rather than only ever the passive on-open trigger.

### Test-before-fix

This is a feature addition (extending existing untested-integration behavior + wiring an existing
tested engine), not a bug fix in the strict sense of `.claude/rules/test-before-fix.md`, but the
same discipline applies: extend `tests/searchEngine.test.js` and/or a new
`tests/app.js`-adjacent test (check what harness, if any, currently covers `app.js` Alpine
methods — likely none, since it's DOM-wired; if so, keep the new backfill logic in a small pure
helper function that *is* unit-testable, mirroring how `_prefetchMonth`'s core logic could be
extracted, rather than adding more untested inline Alpine-object code).

### Constraint: don't regress offline behavior

Opening the app at all still requires being online (gas-app server dependency, load-to-home-screen
included — this is a known, accepted limitation, not something this task fixes). But once open,
the app's existing offline-capable behavior — outbox-queued writes while offline, periodic
reconnect checks, manual "sync now" — is a standing requirement this task must preserve, not just
avoid breaking:
- The ±6-month lazy backfill described above is a *read* path — if offline, backfill requests
  simply fail/no-op (matching `_prefetchMonth`'s existing `catch`-and-warn behavior); don't add
  retry/blocking logic that stalls search UI waiting on network.
- Any writes involved in search (there shouldn't be any — search is read-only) must go through
  the existing outbox queue (`IDB_STORE_OUTBOX`) like every other mutation, never a new bypass path.
  Not expected to apply here, called out because it's a hard rule if scope ever grows.
- When connectivity returns, backfill should periodically retry stale/failed months in the
  background (reuse whatever periodic-reconnect mechanism already drives outbox flush/resync —
  check `app.js` for the existing online/offline event listener and resync trigger before adding
  a second one) and support the same on-user-demand manual resync pattern this task already adds
  for "search wider."

### Files involved

- `src/app.js` — `runSearch()`, `toggleSearchModal()`, `_prefetchMonth`,
  `_scheduleMonthWindowPrefetch`, `indexRecords` builder (~line 2495), `_prefetchInFlight`/
  `_monthPrefetchInFlight` state (~line 142).
- `src/searchEngine.js` — `executeUniversalSearch()`, already correct, just needs a real caller
  and real cross-month data.
- `src/indexedDbStore.js` — `IDB_STORE_MONTHLY_NOTES`, `IDB_STORE_MONTH_OVERVIEW`.
- `tests/searchEngine.test.js` — extend for the multi-month-store shape.
- `PLAN.md` Feature Backlog — check this item off (or update with what actually shipped, if scope
  changed) when done, per this repo's Feature Backlog convention (`~~text~~` **Done (date).**).

## Next Steps for Continuing Session

1. Read `src/searchEngine.js` + `tests/searchEngine.test.js` in full to confirm the exact
   `store` shape `executeUniversalSearch()` expects before writing any IDB-assembly code.
2. Prototype the ±6-month lazy backfill by generalizing `_scheduleMonthWindowPrefetch`'s
   hardcoded ±1 window rather than writing a parallel mechanism.
3. Wire `runSearch()` to `executeUniversalSearch()`, run `npm test`, then a live/local-dev smoke
   test of Ctrl+K search across a note written on a different month than the one currently open
   (`tools/ensure-chrome.js` + `tools/e2e/smoke-test.js` per `.claude/rules/live-google-auth-browser-tool.md`
   — mock mode is fine for this, no live Google auth needed to prove cross-month notes surface).
4. Per `.claude/rules/no-pr-theater.md`: commit directly to `master` once tests + smoke check
   pass, no PR.
