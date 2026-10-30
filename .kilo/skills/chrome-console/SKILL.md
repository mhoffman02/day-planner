---
name: chrome-console
description: Debug the live Day Planner Chrome tab over CDP - evaluate JS, inspect plannerApp state inside the GAS iframe, stream console logs. Use for live debugging beyond the one-shot probe-live health check.
tags: [chrome, cdp, console, probe, debug, day-planner]
version: 2.0.0
---

# chrome-console

Zero-dependency CDP tools on port 9222 (`--port` or `CDP_PORT` to change). Chrome must be running via
`node tools/ensure-chrome.js` ([live-google-auth-browser-tool](../../rules/live-google-auth-browser-tool.md)).
Debug output goes to the console only, never to temporary UI ([debug-logging-no-temp-ui](../../rules/debug-logging-no-temp-ui.md)).

## 1. Probe first

Run the global `probe-live` skill (`node tools/probe-live.js --json`) for the one-shot health check, then use
the tools below to dig in.

## 2. Evaluate: `tools/eval-console.js`

```bash
node tools/eval-console.js "document.title"
node tools/eval-console.js "({ href: location.href, w: innerWidth })"   # objects print as JSON
node tools/eval-console.js --iframe "Object.keys(window.plannerApp || {})"
node tools/eval-console.js --tab Gmail "document.title"
```

- App state lives inside the GAS iframe (`#userHtmlFrame`): pass `--iframe` for anything from `Script.html`/`app.js`.
- The tool activates the tab (`Target.activateTarget`) so background throttling can't hang it.

## 3. Stream logs: `tools/read-console.js`

```bash
node tools/read-console.js                          # next 10 s
node tools/read-console.js --tab "Day Planner" --tail 30
```

Captures log/warn/error/info and uncaught exceptions. To catch a repro, run it in the background, trigger the
action (eval or by hand), then read the `[console.error]` / `[Uncaught Exception]` lines.
