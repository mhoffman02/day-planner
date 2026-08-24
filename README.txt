================================================================================
                       DAY PLANNER - DEVELOPER NOTES & THEORY OF OPS
================================================================================

1. OVERVIEW & PURPOSE
--------------------------------------------------------------------------------
The Day Planner is a single-page digital binder application built for solo power
users. It bridges daily task prioritization methodology (A1-C9 grid, status 
toggling, daily notes, monthly index) with Google Workspace APIs (Calendar,
Tasks, Docs, Drive).

The project is architected to run in two environments:
  A) Production / GAS: Google Apps Script Standalone Web App
  B) Local Dev: Node.js test harness (`npm test`) & local preview server (`server.js`)


2. GOOGLE APPS SCRIPT PROJECT & DEPLOYMENT LINKS
--------------------------------------------------------------------------------
- GAS Project Editor Link (Apps Script IDE):
  https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit

- Development `/dev` Web App Execution Link (Logged-in Owner Execution):
  https://script.google.com/macros/s/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/dev

- Self-Test Diagnostics Web Endpoint (`/self-test`):
  https://script.google.com/macros/s/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/dev/self-test

- Local Preview Web Server (Node.js):
  http://localhost:3000


3. THEORY OF OPERATIONS & CORE ARCHITECTURE
--------------------------------------------------------------------------------
- Client UI & State:
  Built with Alpine.js (`gas-app/Script.html`) rendering a 5-view tab binder 
  (`gas-app/Index.html`) styled in classic parchment aesthetic (`gas-app/Styles.html`) 
  with Google Material Symbols.

- Data Storage Model:
  - Daily Tasks: Google Tasks API (`[A1]` priority prefixes).
  - Appointments: Google Calendar (`CalendarApp`, 07:00 AM - 07:00 PM grid).
  - Daily Notes: Partitioned monthly JSON records (`Day Planner/notes-YYYY-MM.json`)
    stored in Google Drive, keyed by date. Not per-day Google Docs.
  - Monthly Index: Scans daily notes JSON for `#index [Topic] Summary` lines.
  - Meeting Agenda Docs: When creating a calendar event with `autoAgendaDoc` enabled,
    `Code.gs` auto-generates a structured Google Doc (objectives, attendees, Meet link,
    action items) via `DocumentApp`. This is the only current use of Google Docs.

- Dual Execution Bridge (`src/gasBridge.js`):
  Client code calls `GASBridge`. When running inside Apps Script, it invokes 
  `google.script.run`. When running locally, it seamlessly uses a local mock 
  data store for instant browser preview and offline unit testing.


4. DIRECTORY MAP
--------------------------------------------------------------------------------
/home/mike/projects/day-planner/
├── PRD.md, CLAUDE.md      # Product spec; guidance for Claude Code instances
├── PLAN.md                # Feature progress tracker & task checklist
├── README.txt             # Developer theory of operations & gotchas
├── shell-gas-pattern.md   # Universal PWA Shell + Private GAS architecture pattern
├── package.json           # ES module config & test script (`npm test`)
├── server.js              # Local Node preview web server (http://localhost:3000)
├── src/                   # Core Modular JavaScript Logic Engine (canonical; unit-tested)
│   ├── taskEngine.js      # A1-C9 priority parsing, status cycling, master transfer
│   ├── calendarEngine.js  # 07:00-19:00 grid, event popup modal payload generator
│   ├── syncEngine.js      # 2-Way Task <-> Calendar synchronization logic
│   ├── indexParser.js     # Daily notes #index tag extractor & monthly indexer
│   ├── searchEngine.js    # Cross-service Universal Search engine (Ctrl + K)
│   ├── binderStore.js     # SPA binder view router & date navigation store
│   ├── gasBridge.js       # Bridge adapter connecting UI to GAS backend or local mock
│   ├── indexedDbStore.js  # Client-side offline cache / outbox queue
│   ├── shellLoader.js     # PWA shell bootstrap (bundle load, hash check, mount)
│   ├── app.js              # Alpine.js app wiring for local/browser preview
│   └── vendor/             # Bundled Alpine.js, Pico CSS
├── tests/                 # Unit Test Suite (107 tests / 19 suites, `npm test`)
├── gas-app/               # Google Apps Script Project Directory (clasp target)
│   ├── Code.gs            # Server-side Apps Script logic & 2-Way Sync background trigger
│   ├── Index.html         # Main SPA Binder Shell
│   ├── Styles.html        # Digital Binder CSS Design System with Material Symbols
│   ├── Script.html        # Alpine.js reactive components & event handlers
│   │                       # (hand-duplicated copy of src/ logic — see sync rule below)
│   ├── About.html         # In-app static About documentation card
│   ├── UnitTests.gs       # Self-Test diagnostic suite & HTML report generator
│   └── appsscript.json    # GAS manifest with minimal OAuth permissions
├── gh-pwa-shell/          # SEPARATE git repo: public Universal PWA Shell (GitHub Pages loader)
└── tools/                 # Build/ops scripts (shell bundle build, screenshots, handoff, retro)


5. TRICKY DETAILS & TECHNICAL GOTCHAS
--------------------------------------------------------------------------------
[!] Security & OAuth Scope Restriction:
    DO NOT use the broad `https://www.googleapis.com/auth/drive` scope.
    The manifest (`gas-app/appsscript.json`) uses `https://www.googleapis.com/auth/drive.file`.
    This restricts Google Drive access STRICTLY to files and folders created by
    or opened with this app (`/Day Planner/`). It prevents the app from accessing
    any of the user's other private Drive files.

[!] 2-Way Sync Tagging (`gasTaskId`):
    Tasks and Calendar Events are linked using custom tags. `Code.gs` uses
    `evt.setTag('gasTaskId', task.id)` and `evt.getTag('gasTaskId')`.
    The 5-minute automated background trigger (`setup2WaySyncTrigger()`) reconciles
    task completions (`[✓]`) and calendar time shifts.

[!] Date Navigation & Timezone Safety:
    Avoid `new Date('YYYY-MM-DDT00:00:00').toISOString()` when computing date arithmetic
    in local timezones. Calling `.toISOString()` converts local midnight to UTC, which 
    shifts the date string back by one day in non-UTC timezones. `binderStore.js` uses
    pure local year/month/day arithmetic (`new Date(y, m - 1, d + delta)`) for navigation.

[!] Security & External Links (`rel="noopener noreferrer"`):
    All external links targeting `target="_blank"` are secured with `rel="noopener noreferrer"`
    to prevent reverse tabnabbing and window opening security vulnerabilities.

[!] Modern JavaScript Standard (ES2022+):
    Avoid deprecated `String.prototype.substr()`. Use standard `slice()` across all core
    engines (`calendarEngine.js`, `taskEngine.js`, `syncEngine.js`, `indexParser.js`).

[!] Clasp Deployment Commands:
    To update the live Google Apps Script project:
    $ cd gas-app
    $ clasp push --force
    $ clasp deploy --description "Release Notes Here"

[!] Local Testing & Preview:
    To run all unit tests:
    $ npm test

    To start the local preview server:
    $ node server.js
    (View at http://localhost:3000)


6. TESTER NOTES & AUTOMATED SELF-TEST DIAGNOSTICS
--------------------------------------------------------------------------------
To run the automated Self-Test diagnostic suite:

Option A - Direct Web Sub-Path Endpoint (Recommended):
    Open: https://script.google.com/macros/s/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/dev/self-test

Option B - Via Apps Script IDE:
    1. Open https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit
    2. Select `runSelfTest` from the function dropdown at the top.
    3. Click `Run` and inspect Execution Log.

The Self-Test diagnostic suite tests Drive folder access, Google Tasks API, 
CalendarApp tagging, Google Docs daily notes generation, and 2-Way Sync trigger health.
================================================================================
