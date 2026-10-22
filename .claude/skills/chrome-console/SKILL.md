---
name: chrome-console
description: Probe and debug the live Day Planner Chrome tab over CDP - one-shot health check (tab, GAS iframe, plannerApp, view, counts, console errors), stream console logs, evaluate JS or inspect state. Use for live debugging, "probe", or verifying a deploy without temporary UI.
tags: [chrome, cdp, console, probe, debug, day-planner]
version: 2.0.0
---

# chrome-console

Zero-dependency CDP tools on port 9222 (`--port` or `CDP_PORT` to change). Chrome must be running via
`node tools/ensure-chrome.js` ([live-google-auth-browser-tool](../../rules/live-google-auth-browser-tool.md)).
Debug output goes to the console only, never to temporary UI ([debug-logging-no-temp-ui](../../rules/debug-logging-no-temp-ui.md)).

## 1. Probe first: `tools/probe-live.js`

```bash
npm run probe                      # human-readable
node tools/probe-live.js --json    # for agents; exit 0 = PASS, 1 = FAIL/WARN
node tools/probe-live.js --tail 5  # listen 5 s for console errors (default 2)
```

Checks: CDP reachable, Day Planner tab found and activated, Drive/auth error pages (404, expired session,
wrong account), `#userHtmlFrame` (GAS) or top window (local), Alpine + `plannerApp` initialized, active view (`daily`, `master-tasks`, `monthly-calendar`, `monthly-index`,
`future-matrix`),
task/note counts, header/nav/cards present, uncaught errors.

Reading the JSON:
- `status === "FAIL"` and `outerPage.title === "Page Not Found"` → session expired or wrong deployment URL.
- `errors` non-empty → read the stack and file/line.
- `checks.appState.loaded === false` → DOM structure or iframe barrier.

Loop: probe → diagnose → minimal fix in `src/` or `gas-app/` → `npm test` → probe again until PASS.

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
