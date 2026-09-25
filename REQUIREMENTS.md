# REQUIREMENTS.md: Google Digital Day Planner (Pure G.A.S. Architecture)

## 1. Executive Summary & Vision

### 1.1 Goal
Provide a fully functioning, online-only Digital Day Planner running natively within Google Apps Script (GAS) Web App (`script.google.com`) that executes reliably across both **Personal (HOME)** and **locked-down Federal (WORK)** Google Workspace accounts.

### 1.2 Architectural Pivot & Downgrade Rationale
- **Previous Architecture**: Static client-only PWA hosted on GitHub Pages (`https://mhoffman02.github.io/day-planner/`) with client-side Google Identity Services (GIS) OAuth calling Google Workspace REST APIs directly from the browser with service workers (`sw.js`).
- **Core Blocker**: Locked-down federal government (`.gov`) Workspaces enforce strict API Controls and Zero-Trust policies that block third-party client-side OAuth (GIS) and cross-origin REST token exchange to external origins. Furthermore, script execution inside sandboxed iframes (`script.google.com`) disallows Service Worker registration.
- **Pivot Objective**: Roll back repository to a pure Google Apps Script hosted baseline, strip out all GitHub Pages and Service Worker (`sw.js`) dependencies, and backport functional features and bugfixes into a 100% pure GAS web application. Downgrade from full installable PWA to "as close to an installable PWA as possible with pure GAS" (standalone window shortcut, web app manifest, mobile web app meta tags).

---

## 2. Target Operating Environments

### 2.1 Production (Google Apps Script Web App)
- **Host**: Google Apps Script (`script.google.com/macros/s/<DEPLOYMENT_ID>/exec`).
- **Execution Mode**: `executeAs: USER_ACCESSING` with access granted to authorized users/domains.
- **Authentication**: Native first-party Google Workspace session (`Session.getActiveUser().getEmail()`). No third-party OAuth consent screen, no client-side GIS tokens, no Google Cloud Console OAuth Web Client ID.
- **Client Runtime**: HtmlService template (`Index.html`, `Styles.html`, `Script.html`, `About.html`, `SetupFolder.html`).
- **Server Communication**: Asynchronous Remote Procedure Calls (RPC) via `google.script.run` calling server functions in `Code.gs`.
- **Target Clients**:
  1. HOME PC (Modern Chrome / Edge / Firefox / Safari, standard Google Account).
  2. WORK PC (Strict federal security baseline, locked-down browser policies, enterprise/gov Google Workspace).

### 2.2 Local Dev & CI Environment
- **Local Dev Server**: Node.js preview server (`server.js` serving `http://localhost:3000`).
- **Data Emulation**: Mock data bridge (`src/gasBridge.js`) providing complete in-memory mocks of Calendar, Tasks, Drive, and Notes without network access.
- **Test Runner**: Node test runner (`node --test tests/*.test.js`) verifying pure logic engines.
- **Deployment Tool**: Clasp CLI (`clasp push`, `clasp deploy`) pushing `gas-app/` code to the Google Apps Script project.

---

## 3. "Close-to-Installable PWA" Requirements (Pure G.A.S.)

Because Google Apps Script Web Apps run inside a sandboxed iframe (`sandbox="allow-scripts allow-forms allow-popups..."`), browsers forbid Service Worker registration (`navigator.serviceWorker.register()` throws security errors).

To achieve the closest possible PWA-like experience without a service worker:
1. **App Manifest (`manifest.json`)**: Provide a standalone Web App Manifest specifying name, short_name, icons, `display: "standalone"`, `start_url`, `theme_color: "#2d6a5a"`, and `background_color: "#fcfbfa"`.
2. **Mobile & Browser Meta Tags**:
   - `<meta name="mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
   - `<meta name="apple-mobile-web-app-title" content="Day Planner">`
   - `<link rel="apple-touch-icon" href="...">`
   - `<link rel="icon" type="image/png" href="...">`
3. **Desktop Window / Shortcut Support**: Provide user-facing instructions and UI affordances for desktop installation:
   - Chrome / Edge: "Install Day Planner" or "More Tools -> Create Shortcut... -> [x] Open as window".
4. **Online-Only Reliability**:
   - Instant responsive feedback on UI interactions.
   - Clean loading indicators, error banners, and non-blocking retry mechanisms.
   - Explicit confirmation that offline caching via service worker is decommissioned.

---

## 4. Functional Requirements & Feature Matrix

### 4.1 Daily View (Daily 3-Column View / "Today" / Franklin 2-Page Spread)
- Digital implementation of the classic Franklin Covey 2-page daily spread structured as an interactive 3-column binder:
  1. Column 1: Prioritized Daily Task List (A1-C9).
  2. Column 2: Appointment Schedule (07:00 AM – 07:00 PM).
  3. Column 3: Modular Daily Notes Panel.
- **Prioritized Daily Task List (A1-C9)**:
  - Task priority groups (`A`, `B`, `C`) and sequences (`1` through `9`).
  - Status cycling and direct dropdown: Open (` `), In-Progress (`•`), Completed (`✓`), Forwarded (`→`), Delegated (`D/✓`), Canceled (`X`).
  - Star toggle for high-priority highlighting.
  - Per-column sorting (Priority, Status, Title, Category) with persistent order.
  - Quick-add task bar with automatic priority sequencing.
  - Notes popover for hovering over tasks with attached notes.
  - 2-Way synchronization with Google Tasks.
- **Appointment Schedule (07:00 AM – 07:00 PM)**:
  - 30-minute time-slot grid synced with Google Calendar.
  - Interactive event detail modal: Attendee chips, description with HTML/formatting, Google Meet link button, and direct Google Calendar deep link.
  - Inline appointment creation modal.
- **Modular Daily Notes Panel**:
  - Modular topic cards with expand/collapse twisties (`▼`/`▶`).
  - Topic and Summary split header fields.
  - Rich text formatting toolbar (bold, italic, underline, strikethrough, color swatches, ordered/unordered lists).
  - External link markup (`[[link:URL]]text[[/link]]`) and smart-paste Drive/Docs URL title resolution.
  - Monthly JSON partition persistence in Google Drive (`Day Planner/notes-YYYY-MM.json`).

### 4.2 Monthly Master Tasks
- High-level undated task management categorized by Work, Personal, Financial, Projects.
- Dedicated Google Tasks list or Drive JSON archive persistence.
- "Move to Today" action with date picker to transfer tasks to the active day list.
- Inline status tracking ("Moved to YYYY-MM-DD").

### 4.3 Full-Screen Monthly Overview Calendar
- 7x5 interactive calendar grid displaying all days in the selected month.
- Event pills fetched from Google Calendar.
- One-click navigation from any day cell to that day's Daily Page ("Today" 3-column view).

### 4.4 Monthly Index Page
- Automated extraction of `#index [Topic] Summary` entries from all daily notes in the active month.
- Searchable, sortable table linking directly to the corresponding daily page via "Jump to Day" (`.btn-jump-day`) and external Google Doc via "Source Doc" (`View Google Doc ↗`).

### 4.5 Future Planning Matrix
- 12-month forward-look overview.
- Add and status-cycle future milestone items per month.
- Push item forward to next month or transfer to a specific day's task list.

### 4.6 Universal Search (Ctrl + K)
- Anchored quick-search dropdown indexing Tasks, Calendar Appointments, and Daily Notes.
- Highlighted match snippets with direct jump navigation to the matched entity.

### 4.7 2-Way Sync Engine
- Automatic reconciliation between Google Tasks and Google Calendar appointments via `gasTaskId` extended properties.
- Optional 5-minute automated background trigger (`setup2WaySyncTrigger()`) in GAS.

---

## 5. Security & Governance Requirements

1. **Zero-Trust Access Control**:
   - `validateUserAccess()` checking `Session.getActiveUser().getEmail()` against an optional allowlist.
   - Restrict Drive folder auto-adoption or folder path creation strictly to folders owned by the active user.
2. **Minimal OAuth Scopes**:
   - Strict `drive.file` scope (only files/folders created by Day Planner).
   - Read-only title inspection under `drive.readonly` for smart-paste link resolution.
   - `calendar.events` (or `calendar`) and `tasks`.
   - Never request root `drive` scope.
3. **Safe HtmlService Character Escaping**:
   - Automated guard against HtmlService comment truncation bugs (`//` in script tags).
   - Safe escaping of server-returned strings in modal dialogues and setup boxes.
4. **Namespace Encapsulation**:
   - Server scripts (`Code.gs`, `UnitTests.gs`) wrapped in IIFEs with explicit exports to restrict the public RPC surface.

---

## 6. Deprecation & Deletion Matrix

The following components from the GitHub Pages PWA architecture are strictly deprecated and excluded:
| Deprecated Item | Path / Location | Action |
| :--- | :--- | :--- |
| Service Worker | `sw.js`, `tools/update-sw-cache-version.js` | Remove from deployment |
| GitHub Pages Shell | `index.html` (root PWA shell), `.nojekyll` | Replace with local dev preview |
| GIS OAuth REST Client | `src/googleAuth.js`, `tests/googleAuth.test.js` | Deprecate / remove |
| PWA Shell Bundler | `gh-pwa-shell/`, `tests/shellLoader.test.js`, `src/shellLoader.js` | Delete |
| Offline Outbox Queue | Outbox replay logic specific to disconnected PWA | Replace with live GAS RPC |
