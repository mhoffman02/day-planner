---
name: chrome-console
description: Read and write to the active Chrome browser console, stream live logs/errors/warnings, and evaluate arbitrary JavaScript expressions or inspect variables via Chrome DevTools Protocol (CDP). Use for live debugging, DOM inspection, state verification, and verifying frontend behavior without temporary UI elements.
tags: [chrome, cdp, console, debug, evaluation, inspection, day-planner]
version: 1.0.0
---

# Chrome Console Skill (`chrome-console`)

Provides programmatic read and write access to the Chrome browser console via Chrome DevTools Protocol (CDP) on port 9222 (default) without bot-detection flags or UI modifications.

Strictly follows [**`.agents/rules/debug-logging-no-temp-ui.md`**](file:///home/mike/projects/day-planner/.agents/rules/debug-logging-no-temp-ui.md) — temporary debug code must route exclusively to `console.log`, `console.warn`, `console.error`, and `console.info`, **never** to temporary UI DOM elements.

---

## Capabilities & Tools

This skill is powered by two lightweight, zero-dependency tools built on native Node.js v22/24 `WebSocket` and `fetch`:

1. [**`tools/eval-console.js`**](file:///home/mike/projects/day-planner/tools/eval-console.js) — **Write & Evaluate**:
   - Executes arbitrary JavaScript in the live Chrome tab.
   - Reads global variables, DOM properties, `localStorage`, and application state.
   - Formats complex objects as JSON.
   - Evaluates inside the Apps Script `userHtmlFrame` sandbox via `--iframe`.
   - Automatically activates target tabs via `Target.activateTarget` so Chrome background timer throttling never hangs execution.

2. [**`tools/read-console.js`**](file:///home/mike/projects/day-planner/tools/read-console.js) — **Read & Stream**:
   - Captures `console.log`, `console.warn`, `console.error`, `console.info`, and uncaught exceptions in real-time.
   - Listens for a configurable duration (`--tail <seconds>`).
   - Automatically color-codes output and decodes structured arguments.

---

## Quick Reference Commands

### 1. Read / Stream Chrome Console Logs

```bash
# Capture next 10 seconds of console output (default)
node tools/read-console.js

# Capture for 30 seconds
node tools/read-console.js --tail 30

# Filter target tab by name (e.g., Day Planner or Gmail)
node tools/read-console.js --tab "Day Planner" --tail 15

# Custom CDP port
node tools/read-console.js --port 9222
```

### 2. Evaluate Expressions & Inspect Variables

```bash
# Basic property inspection
node tools/eval-console.js "document.title"
node tools/eval-console.js "window.location.href"

# Inspect structured state as JSON
node tools/eval-console.js "({ title: document.title, location: location.href, screen: { w: innerWidth, h: innerHeight } })"

# Check localStorage items
node tools/eval-console.js "localStorage.getItem('dayPlannerTheme')"

# Inspect inside Google Apps Script iframe
node tools/eval-console.js --iframe "typeof plannerApp !== 'undefined'"
node tools/eval-console.js --iframe "Object.keys(window.plannerApp || {})"

# Target specific tab
node tools/eval-console.js --tab Gmail "document.title"

# Trigger a test log or function call
node tools/eval-console.js "console.warn('Probing state...')"
```

---

## Common Debug / Verification Workflows

### Workflow A: Verify Live UI State After Code Deploy
When verifying deployed changes in Chrome:
1. Run `node tools/eval-console.js "document.title"` to ensure the tab is loaded and responsive.
2. Inspect application state:
   ```bash
   node tools/eval-console.js --iframe "document.querySelector('#note-link-modal') ? 'modal present' : 'no modal'"
   ```

### Workflow B: Reproduce and Catch Frontend Exceptions
When investigating a bug reported by the user:
1. Start streaming console logs in the background:
   ```bash
   node tools/read-console.js --tail 20 &
   ```
2. Trigger the action or evaluate state using `node tools/eval-console.js` or interact in the browser.
3. Review any `[console.error]` or `[Uncaught Exception]` entries captured.

---

## Best Practices & Rules

1. **No Temporary UI Text**: Never append test buttons, debug banners, or debug paragraphs to the DOM. Instrument with `console.log` / `console.warn` and observe via `read-console.js`.
2. **Tab Auto-Waking**: If a tab was in the background, Chrome suspends its event loop. `tools/eval-console.js` automatically wakes the tab using `Target.activateTarget`.
3. **Apps Script Iframes**: Apps Script HTML apps execute inside an iframe (`#userHtmlFrame`). Use the `--iframe` flag when inspecting app-level state or variables defined inside `Script.html` / `app.js`.
