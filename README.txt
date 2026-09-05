================================================================================
                       DAY PLANNER - DEVELOPER NOTES & THEORY OF OPS
================================================================================

1. OVERVIEW & PURPOSE
--------------------------------------------------------------------------------
The Day Planner is a single-page digital binder application built for solo power
users. It bridges daily task prioritization methodology (A1-C9 grid, status
toggling, daily notes, monthly index) with Google Workspace APIs (Calendar,
Tasks, Docs, Drive).

It is a 100% static, client-only app: no server-side backend of any kind. The
browser calls Google's Calendar/Tasks/Drive/Docs REST APIs directly, authenticated
via client-side Google Identity Services (GIS) OAuth. The project runs in two
environments:
  A) Production: static site on GitHub Pages, real Google sign-in + REST calls.
  B) Local Dev: Node.js test harness (`npm test`) & local preview server
     (`server.js`), which uses a local mock data store instead of real OAuth/APIs.


2. LIVE DEPLOYMENT LINKS
--------------------------------------------------------------------------------
- Live App (GitHub Pages):
  https://mhoffman02.github.io/day-planner/

- Local Preview Web Server (Node.js):
  http://localhost:3000


3. THEORY OF OPERATIONS & CORE ARCHITECTURE
--------------------------------------------------------------------------------
- Client UI & State:
  Built with Alpine.js (`index.html` + `src/app.js`), a 5-view tab binder styled
  in classic parchment aesthetic (`src/styles.css`) with Google Material Symbols.

- Auth:
  `src/googleAuth.js` wraps Google Identity Services (GIS) to obtain a browser-side
  OAuth access token. No token or credential ever touches a server this app controls.

- Data Storage Model:
  - Daily Tasks: Google Tasks API (`[A1]` priority prefixes).
  - Appointments: Google Calendar API, 07:00 AM - 07:00 PM grid.
  - Daily Notes: Partitioned monthly JSON records (`Day Planner/notes-YYYY-MM.json`)
    stored in Google Drive, keyed by date. Not per-day Google Docs.
  - Monthly Index: Scans daily notes JSON for `#index [Topic] Summary` lines.
  - Meeting Agenda Docs: When creating a calendar event with `autoAgendaDoc` enabled,
    `src/gasBridge.js` auto-generates a structured Google Doc (objectives, attendees,
    Meet link, action items) via the Docs REST API. This is the only current use of
    Google Docs.

- Google Workspace REST Bridge (`src/gasBridge.js`):
  Client code calls `GASBridge`. In real mode it calls Google's REST APIs directly
  using the access token from `googleAuth.js`. When running locally in mock mode
  (or signed out), it uses a local mock data store for instant browser preview and
  offline unit testing.


4. DIRECTORY MAP
--------------------------------------------------------------------------------
/home/mike/projects/day-planner/
├── PRD.md, CLAUDE.md      # Product spec; guidance for Claude Code instances
├── PLAN.md                # Feature progress tracker & task checklist
├── README.txt             # Developer theory of operations & gotchas
├── docs/google-cloud-oauth-setup-guide.md  # How to create/configure a GIS OAuth client ID
├── package.json           # ES module config & test script (`npm test`)
├── server.js              # Local Node preview web server (http://localhost:3000)
├── index.html             # App shell entry point, OAuth client ID, theme bootstrap
├── manifest.json, sw.js   # PWA manifest + service worker (app-shell caching)
├── src/                   # Core Modular JavaScript Logic Engine (canonical; unit-tested)
│   ├── taskEngine.js      # A1-C9 priority parsing, status cycling, master transfer
│   ├── calendarEngine.js  # 07:00-19:00 grid, event popup modal payload generator
│   ├── syncEngine.js      # 2-Way Task <-> Calendar synchronization logic
│   ├── indexParser.js     # Daily notes #index tag extractor & monthly indexer
│   ├── searchEngine.js    # Cross-service Universal Search engine (Ctrl + K)
│   ├── binderStore.js     # SPA binder view router & date navigation store
│   ├── googleAuth.js      # Client-side Google Identity Services OAuth
│   ├── gasBridge.js       # REST bridge to Google Workspace APIs + local mock fallback
│   ├── indexedDbStore.js  # Client-side offline cache / outbox queue
│   ├── app.js             # Alpine.js app wiring for local/browser preview
│   └── vendor/            # Bundled Alpine.js, Pico CSS
├── tests/                 # Unit Test Suite (`npm test`)
└── tools/                 # Build/ops scripts (sw cache-version bump, screenshots, handoff,
                            #   retro, CDP-based live-browser e2e driver — see CLAUDE.md)


5. TRICKY DETAILS & TECHNICAL GOTCHAS
--------------------------------------------------------------------------------
[!] Security & OAuth Scope Restriction:
    DO NOT use the broad `https://www.googleapis.com/auth/drive` scope.
    `src/googleAuth.js`'s `GOOGLE_AUTH_SCOPES` uses
    `https://www.googleapis.com/auth/drive.file`. This restricts Google Drive
    access STRICTLY to files and folders created by or opened with this app
    (`/Day Planner/`). It prevents the app from accessing any of the user's other
    private Drive files. `drive.readonly` is the one deliberate exception, scoped
    solely to resolving the title of a pasted Docs/Sheets/Slides/Drive link the app
    didn't create.

[!] 2-Way Sync Tagging (`gasTaskId`):
    Tasks and Calendar Events are linked using a custom `gasTaskId` field encoded
    into each Task's notes (see `src/gasBridge.js`/`src/syncEngine.js`). Sync
    reconciliation runs client-side (on focus/interval), not via a server-side
    time-driven trigger.

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

[!] Local Testing & Preview:
    To run all unit tests:
    $ npm test

    To start the local preview server:
    $ node server.js
    (View at http://localhost:3000)


6. LIVE-BROWSER SMOKE TESTING
--------------------------------------------------------------------------------
Any browser check that needs a real Google sign-in (i.e. testing the deployed
GitHub Pages app, not local-dev mock mode) must go through the CDP-based driver,
not a generic automation tool — see `.agents/rules/live-google-auth-browser-tool.md`
and CLAUDE.md's "E2E / live-browser driver" section:

    $ node tools/ensure-chrome.js [url]
    $ node tools/e2e/smoke-test.js [url]
================================================================================
