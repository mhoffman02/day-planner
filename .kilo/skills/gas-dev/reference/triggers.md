# ScriptApp triggers — reference

Source: live-fetched `developers.google.com/apps-script/reference/script`
(2026-09-19).

## Trigger management

| Method | Returns | Notes |
|---|---|---|
| `ScriptApp.newTrigger(functionName)` | `TriggerBuilder` | `functionName` is a string naming a global function — start of the builder chain. |
| `ScriptApp.getProjectTriggers()` | `Trigger[]` | All installable triggers for the current project/user. |
| `ScriptApp.getUserTriggers(document\|form\|spreadsheet)` | `Trigger[]` | Triggers owned by the current user on a specific bound container. |
| `ScriptApp.deleteTrigger(trigger)` | `void` | |
| `ScriptApp.getService()` | `Service` | Web-app publishing info. |
| `ScriptApp.getOAuthToken()` | `String` | OAuth token for the effective (running) user. |

## `TriggerBuilder` — container/event builders

- `.forDocument(doc\|key)` → `DocumentTriggerBuilder`
- `.forSpreadsheet(sheet\|key)` → `SpreadsheetTriggerBuilder`
- `.forUserCalendar(emailId)` → `CalendarTriggerBuilder`
- `.timeBased()` → `ClockTriggerBuilder`

Event methods (on the relevant builder): `.onOpen()`, `.onEdit()`,
`.onChange()`, `.onEventUpdated()`.

## `ClockTriggerBuilder` (time-driven)

`.after(durationMs)`, `.at(date)`, `.atDate(year, month, day)`,
`.everyMinutes(n)`, `.everyHours(n)`, `.everyDays(n)`, `.everyWeeks(n)`,
`.inTimezone(tz)`, `.atHour(hour)`, `.nearMinute(minute)`.

`.create()` finalizes any builder chain → returns a `Trigger`.

## Pattern: one-shot trigger + self-delete

Useful for deferring work out of a request context (e.g. a `doGet`
handler) into a trigger execution context:

```javascript
function enqueueWork_() {
  ScriptApp.newTrigger('doTheWorkViaTrigger_').timeBased().after(1000).create();
}

function doTheWorkViaTrigger_() {
  try {
    doTheRealWork_(); // runs in trigger execution context
  } finally {
    // Self-cleanup — an installable trigger doesn't remove itself.
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'doTheWorkViaTrigger_') ScriptApp.deleteTrigger(t);
    });
  }
}
```

Caveats:
- Per-user trigger quota is small (Apps Script's documented limit is 20
  installable triggers per script per user) — always clean up your own
  one-shot triggers, don't let them accumulate.
- The caller (e.g. `doGet`) gets no return value from the deferred work
  — it only knows the trigger was scheduled, not that the work
  succeeded. Design the caller's response around "queued," and have the
  handler write its result somewhere durable (a Drive file, a Script
  Property) for later inspection.
