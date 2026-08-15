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
  - Daily Notes: Backed by Google Docs automatically created under 
    `/Day Planner/YYYY/MM/`.
  - Monthly Index: Scans daily notes for `#index [Topic] Summary` lines.

- Dual Execution Bridge (`src/gasBridge.js`):
  Client code calls `GASBridge`. When running inside Apps Script, it invokes 
  `google.script.run`. When running locally, it seamlessly uses a local mock 
  data store for instant browser preview and offline unit testing.


4. DIRECTORY MAP
--------------------------------------------------------------------------------
/home/mike/projects/day-planner/
├── PRD.md                 # Product Requirements Document
├── PLAN.md                # Feature progress tracker & task checklist
├── README.txt             # Developer theory of operations & gotchas
├── package.json           # ES module config & test script (`npm test`)
├── server.js              # Local Node preview web server (http://localhost:3000)
├── src/                   # Core Modular JavaScript Logic Engine
│   ├── taskEngine.js      # A1-C9 priority parsing, status cycling, master transfer
│   ├── calendarEngine.js  # 07:00-19:00 grid, event popup modal payload generator
│   ├── syncEngine.js      # 2-Way Task <-> Calendar synchronization logic
│   ├── indexParser.js     # Daily notes #index tag extractor & monthly indexer
│   ├── searchEngine.js    # Cross-service Universal Search engine (Ctrl + K)
│   ├── binderStore.js     # SPA binder view router & date navigation store
│   └── gasBridge.js       # Bridge adapter connecting UI to GAS backend or local mock
├── tests/                 # Unit Test Suite (29 tests)
│   ├── taskEngine.test.js
│   ├── calendarEngine.test.js
│   ├── syncEngine.test.js
│   ├── indexParser.test.js
│   ├── searchEngine.test.js
│   ├── binderStore.test.js
│   └── gasBridge.test.js
└── gas-app/               # Google Apps Script Project Directory (clasp target)
    ├── Code.gs            # Server-side Apps Script logic & 2-Way Sync background trigger
    ├── Index.html         # Main SPA Binder Shell
    ├── Styles.html        # Digital Binder CSS Design System with Material Symbols
    ├── Script.html        # Alpine.js reactive components & event handlers
    ├── About.html         # In-app static About documentation card
    └── appsscript.json    # GAS manifest with minimal OAuth permissions


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
    The 10-minute automated background trigger (`setup2WaySyncTrigger()`) reconciles
    task completions (`[✓]`) and calendar time shifts.

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
================================================================================
