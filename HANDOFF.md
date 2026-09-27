# Context Handoff Document

### OBJECTIVE

Deliver a pure Google Apps Script digital binder productivity app bridging Franklin Covey Day Planner methodology with Google Workspace APIs (Calendar, Tasks, Drive). The immediate focus is maintaining dual-environment synchronization (HOME `@224` and WORK `@55`), validating live browser behavior via native Chrome DevTools Protocol (CDP) tooling, and ensuring zero regressions across all core planner views.

---

### KEY DECISIONS

- **Sandboxed GAS Iframe CDP Introspection & Health Probe ([commit `ee20a0e`](file:///home/mike/projects/day-planner/commit/ee20a0e))**:
  - Enhanced [`tools/probe-live.js`](file:///home/mike/projects/day-planner/tools/probe-live.js), [`tools/eval-console.js`](file:///home/mike/projects/day-planner/tools/eval-console.js), and [`tools/read-console.js`](file:///home/mike/projects/day-planner/tools/read-console.js) to attach directly to `script.googleusercontent.com` child iframe targets.
  - Resolved tab-matching ambiguity by prioritizing exact web app title (`Day Planner`) and execution URLs (`/macros/s/`, `/exec`) over GAS project editor tabs (`/home/projects/`).
  - Enabled multi-target event streaming (`Log.enable`, `Runtime.enable`) across both outer page and inner app frames.
  - Verified live HOME `@224` health via `npm run probe`: Status `PASS`, activeView `daily`, 0 console errors.

- **Chrome DevTools Protocol (CDP) Console & Evaluation Tooling ([commits `4a3333a`](file:///home/mike/projects/day-planner/commit/4a3333a), [`5520785`](file:///home/mike/projects/day-planner/commit/5520785))**:
  - Implemented zero-dependency CDP inspection tools built on native Node.js v22/24 `WebSocket` and `fetch`:
    - [`tools/read-console.js`](file:///home/mike/projects/day-planner/tools/read-console.js): Streams live `console.log`, `warn`, `error`, `info`, and uncaught exceptions directly from the running Chrome instance on port 9222.
    - [`tools/eval-console.js`](file:///home/mike/projects/day-planner/tools/eval-console.js): Evaluates arbitrary JavaScript expressions, inspects DOM elements and state variables, and supports Apps Script sandboxed iframes (`--iframe`).
  - Added automatic target activation (`Target.activateTarget`) to prevent Chrome background timer throttling from freezing evaluations.

- **Lightweight Live Probe Skill & Automated Sense→Diagnose→Fix→Test Loop ([commit `148dccb`](file:///home/mike/projects/day-planner/commit/148dccb))**:
  - Evaluated the heavy 2,500-line `maximo-uat` probe harness and replaced it with a lean, zero-dependency diagnostic tool ([`tools/probe-live.js`](file:///home/mike/projects/day-planner/tools/probe-live.js)) executing in <2 seconds.
  - Wired `npm run probe` into [`package.json`](file:///home/mike/projects/day-planner/package.json).
  - Authored and synced [`.agents/skills/probe-live/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/probe-live/SKILL.md) and [`.agents/skills/chrome-console/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/chrome-console/SKILL.md) across `.claude/` and `.kilo/`.

- **Debug Logging Rule Enforcement ([commit `aafbe2c`](file:///home/mike/projects/day-planner/commit/aafbe2c))**:
  - Strictly enforced [`.agents/rules/debug-logging-no-temp-ui.md`](file:///home/mike/projects/day-planner/.agents/rules/debug-logging-no-temp-ui.md): All temporary debug instrumentation must route to the Chrome console (`console.log`, `warn`, `error`, `info`), NEVER injecting temporary UI elements into the DOM.

- **Dual-Environment Alignment (HOME `@224`, WORK `@55`) ([commits `aec1c67`](file:///home/mike/projects/day-planner/commit/aec1c67), [`a279fe1`](file:///home/mike/projects/day-planner/commit/a279fe1))**:
  - Locked active HOME production deployment to `AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w` (`@224`) in [`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md).
  - Promoted full vetted codebase to WORK script (`1980roEKgkC_...`) via `npm run push:work`, creating **Version 55** (`@55`).

- **Custom Themed Calendar Popovers & Hit Targets ([commits `609788b`](file:///home/mike/projects/day-planner/commit/609788b), [`7c485fe`](file:///home/mike/projects/day-planner/commit/7c485fe), [`957fdb7`](file:///home/mike/projects/day-planner/commit/957fdb7))**:
  - Replaced native date pickers with custom themed popover dropdowns for Today, Month, Index, and Master Tasks Due Date.
  - Attached both `mouseup` and `click` listeners to the full widget container so clicking anywhere on the date button triggers the popover cleanly.
  - Set `.header-left { overflow: visible; }` and `.day-picker-dropdown { z-index: 2000; }` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L256) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L256), resolving top bar overflow clipping.

- **Note Cards Unicode Ballot Boxes (`☐` / `☒`) ([commits `609788b`](file:///home/mike/projects/day-planner/commit/609788b), [`3cbd33f`](file:///home/mike/projects/day-planner/commit/3cbd33f))**:
  - Implemented lightweight unicode ballot box checklist support: `[ ]` auto-expands to `☐` (U+2610), `[x]` / `[X]` expands to `☒` (U+2612).
  - Toggling between states swaps glyphs inline without injecting newline or `<br>` tags.
  - Pressing `Enter` on a checklist line auto-continues a new `☐ ` line and autofocuses the new line.

- **Drive URL Link Modal & Universal Link Rendering ([commit `957fdb7`](file:///home/mike/projects/day-planner/commit/957fdb7))**:
  - Fixed Drive v2 `Drive.Files.get` call (`supportsAllDrives: true`) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1307) and added fallback placeholder titles on tab-off.
  - Upgraded `renderInline()` in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L1710) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L2454) to render standard markdown `[text](url)`, autolinks `<url>`, bracket links `[[link:url]]text[[/link]]`, and raw URLs into clickable `<a>` links.

- **Least-Privilege OAuth Scopes ([commit `6c762b4`](file:///home/mike/projects/day-planner/commit/6c762b4))**:
  - Maintained least-privilege OAuth scopes (`documents`, `drive.file`, `drive.readonly`, `calendar`, `tasks`, `script.scriptapp`) in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json#L22-L29).

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`.
- **Latest Commits**:
  - [`ee20a0e`](file:///home/mike/projects/day-planner/commit/ee20a0e): `fix(cdp): support sandboxed Apps Script iframe evaluation and improve tab targeting`.
  - [`a279fe1`](file:///home/mike/projects/day-planner/commit/a279fe1): `chore(release): record Version 55 push to WORK and sync handoff`.
  - [`aec1c67`](file:///home/mike/projects/day-planner/commit/aec1c67): `docs(deploy): lock active HOME deployment @224 in rules and plan`.
  - [`148dccb`](file:///home/mike/projects/day-planner/commit/148dccb): `feat(probe): add lightweight probe-live tool, skill, and npm run probe command`.
  - [`dbbfb41`](file:///home/mike/projects/day-planner/commit/dbbfb41): `feat(skills): add chrome-console skill for CDP read/write and live evaluation`.
  - [`5520785`](file:///home/mike/projects/day-planner/commit/5520785): `feat(tools): add live CDP script evaluator and console reader`.
  - [`aafbe2c`](file:///home/mike/projects/day-planner/commit/aafbe2c): `docs(rules): enforce console logging over temp UI for debug and record in handoff`.
  - [`6c762b4`](file:///home/mike/projects/day-planner/commit/6c762b4): `fix(auth): revert broad drive oauth scope to restore valid token`.
- **Live Deployment State**:
  - HOME Prod Active Deployment: [`AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w`](https://script.google.com/macros/s/AKfycbzVTowACUjXvTt0UG6kOlLdTvB2ASsiFf7Za0GzuQUodlf8T1rAg7PsWVZ_OeEPJSfD4w/exec) (`@224`).
  - WORK Prod Deployment: [`AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO`](https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec) (`9csO`, Version 55 / `@55` on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`).
- **Live Browser Verification**:
  - Dedicated debug Chrome instance verified running on port 9222.
  - Live probe status verified healthy (`PASS`, activeView: `daily`, 0 errors) via `npm run probe`.
- **Pre-Flight Verification Status**:
  - `npm run lint`: 0 errors (8 unused-var warnings).
  - `npm test`: **152/152 unit tests passing** across 19 suites (263ms).
  - `npm run check:gas-safe-chars`: Clean (0 unsafe patterns).

---

### CONSTRAINTS & PREFERENCES

1. **Salutation**: Start every reply with `⚡Mike:`.
2. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
3. **DO NOT EXPLAIN APPS SCRIPT IDE STEPS**: Never instruct or repeat steps to the user on how to update, deploy, or operate the Apps Script Web IDE ("REMEMBER: don't tell me how to update app in IDE - got it").
4. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
5. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
6. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, archival ink blue `#1d5fa8`, plum `#5e3f6b`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)). Use crisp 2px border radius for stamps and buttons.
7. **Apps Script Safe Characters**: Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.
8. **Dual-Environment Isolation**: HOME is mastercopy; WORK is strictly production `/exec` promoted via `npm run push:work` ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).
9. **OAuth Storage Scoping**: Maintain `drive.file` and `drive.readonly` restriction; do NOT widen to full `drive` ([`.agents/skills/review/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/review/SKILL.md)).
10. **Debug Logging — Console Only, No Temporary UI Elements**: Use browser console (`console.log`, `console.warn`, `console.error`, `console.info`) for temporary debug/diagnostic output; do NOT inject temporary diagnostic UI elements or helper text into the application interface ([`.agents/rules/debug-logging-no-temp-ui.md`](file:///home/mike/projects/day-planner/.agents/rules/debug-logging-no-temp-ui.md)).
11. **Proactive Command Execution**: Execute Node commands (`npm test`, `npm run probe`, CDP tools) directly without requesting approval.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Live Feature Smoke Verification (HOME @224) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L3-L6))**:
   - Verify Note Cards Drive Link Modal: Test inserting a Google Doc/Sheet link into a note card and verify title auto-lookup with tab-off and fallback title generation.
   - Verify Ballot Box & Calendar Popovers: Test checklist toggle (`☐` / `☒`) in note cards and verify themed popovers open cleanly across Today, Month, Index, and Master Tasks Due Date.

2. **Live WORK Production Smoke Verification (WORK @55) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L8-L10))**:
   - Open WORK deployment [`9csO`](https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec) under `michael.hoffman@gsa.gov` and confirm Version 55 features load without permission errors.

3. **Offline Sync Queue Resilience & Performance Audit ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L12-L14))**:
   - Audit and reinforce transient offline network failure retry logic in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js).

---

### IMMEDIATE NEXT STEP

Verify Drive URL auto-lookup in note card link modal or ballot box toggle (`☐` / `☒`) in the active HOME `@224` tab via `node tools/eval-console.js --iframe "<expression>"`.
