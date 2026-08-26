# Product Requirements Document (PRD): Google Digital Day Planner (GAS MVP)

## 1. Executive Summary & Product Vision

### 1.1 Vision
The **Google Digital Day Planner** bridges the timeless, battle-tested productivity methodology of the classic paper Day Planner with the modern, real-time cloud capabilities of Google Workspace (Google Suite). 

It provides a high-efficiency single-page digital binder interface—styled in classic Day Planner aesthetic (forest/teal ruling, cream background, serif headers) using Alpine.js and clean CSS—powered by Google Apps Script (GAS) running natively within the user's Google account.

### 1.2 Purpose & Scope
* **Target Audience**: Solo power user (developer/executive) who relies heavily on Google Workspace (Calendar, Tasks, Docs, Sheets, Meet, Chat) and values the structured discipline of Day Planner (Prioritized A1-C9 task lists, hourly appointment blocks, daily notes/trackers, monthly overview calendars, master task lists, and monthly index).
* **Scope**: Solo-developer MVP deployed as a Standalone Google Apps Script Web App (`doGet()`).

---

## 2. Image Assets & Reference Material

### 2.1 Downloaded Product Reference Images
All 7 original product reference images have been retrieved and stored in `images/`:
* `images/img1_50026.jpg`: Front cover & daily binder view overview.
* `images/img2_45207.jpg`: Full-screen monthly calendar spread with side month tabs (Jan-Dec).
* `images/img3_00198.jpg`: Features breakdown (Daily Notes, Master Task List, Future Planning).
* `images/img4_78019.jpg`: Full navigation callouts & hyperlink structure diagram.
* `images/img5_05033.jpg`: Three-page view (Monthly Index, Monthly Calendar, Monthly Master Task List).
* `images/img6_47427.jpg`: Stylized tablet layout view.
* `images/img7_96528.jpg`: Cover branding & leather binder styling.

---

## 3. Supported Day Planner Page Types

The application implements a complete suite of Day Planner page views accessible via tab navigation:

| Page Type | Layout & View Description | Google Workspace Integration |
| :--- | :--- | :--- |
| **1. Prioritized Daily Planner (2-Page Spread)** | Left page: Prioritized Daily Task List (A1-C9) & Daily Tracker. Right page: 7:00 AM - 7:00 PM Appointment Schedule & Scrollable Daily Notes view. | Google Calendar, Google Tasks, Google Drive |
| **2. Full-Screen Monthly Overview Calendar** | Interactive 7x5 monthly calendar grid displaying events, holidays, and high-level markers. | Google Calendar (`CalendarApp`) |
| **3. Monthly Master Task List Page** | Categorized high-level task list (Personal, Business, Projects) with one-click transfer to daily task lists. | Dedicated Google Task Lists (`[Month] [Year] Master Tasks`) |
| **4. Monthly Index Page** | Aggregated, searchable registry of key daily decisions, meeting summaries, and `#index` tagged notes. | Scanned Drive notes JSON |
| **5. Future Planning Matrix** | 12-month forward-look overview for scheduling milestone events in upcoming months. | Google Calendar & Google Sheets |

---

## 4. Detailed Feature Specifications & Workflows

### 4.1 Daily View (2-Page Spread)
* **Left Page: Prioritized Daily Task List**:
  * Prioritized task grid: Priority (A, B, C), Sequence (1..9), Title, Day Planner status code (`✓` complete, `→` forwarded, `X` canceled, `D/✓` delegated, `•` in-process).
  * Auto-syncs with Google Tasks using `[A1]` title prefixes.
  * Drag-and-drop or button re-ordering.
* **Right Page: Appointment Schedule (07:00 AM – 07:00 PM)**:
  * Hourly grid with 30-minute subdivisions synced live with Google Calendar.
  * **Interactive Event Modal**: Clicking an event opens an interactive popup showing event details, attendees, description, and direct action buttons:
    * **Join Google Meet** (if video conference attached).
    * **Open in gCal** (opens event in a new Google Calendar browser tab).
* **Right Page: Daily Notes View**:
  * **Embedded Notes Panel**: The right-hand lower pane renders the day's notes inline.
  * Notes are stored as partitioned monthly JSON records (`Day Planner/notes-YYYY-MM.json`) in Google Drive, keyed by date — not individual per-day Google Docs.

### 4.2 Monthly Master Task List & Task Transfer Workflow
* **Separate Monthly Task Lists**: Managed via dedicated Google Task Lists (e.g., `August 2026 Master Tasks`).
* **Categorization**: Grouped into Work, Personal, Financial, and Projects.
* **"Move to Today" Action**:
  * Clicking the **"Move to Today"** button on any monthly task assigns it an `[A1-C9]` priority code, moves it to the active Daily Task List, and sets the due date to Today.

### 4.3 Full-Screen Monthly Calendar Page
* Full-width grid showing all days of the selected month.
* Clicking any day cell navigates directly to that day's Daily 2-Page Spread.
* Displays calendar event pills fetched live from `CalendarApp`.

### 4.4 Monthly Index Page & Automated Scanning
* **Automated Scan**: GAS backend scans daily notes JSON entries for lines tagged with `#index` or `[INDEX]`.
* **Index View**: Displays a table sorted by date showing `Date | Topic / Category | Summary Highlight | Direct Doc Link`.

### 4.5 Universal Search Feature
* **Search Header**: Top navigation bar includes a **Universal Search input bar** (`Ctrl + K` shortcut).
* **Cross-Service Indexing**: Searches simultaneously across:
  * Google Calendar appointments (title, location, description).
  * Google Tasks (Daily & Master Task Lists).
  * Daily Notes text contents (Drive JSON).
  * Monthly Index entries.
* **Results Panel**: Renders grouped search results with one-click jump buttons to the corresponding date/page.

---

## 5. UI/UX Design System & Styling Rules

* **Color System**:
  * Background: `#fcfbfa` (Warm Cream / Parchment)
  * Ruling Lines: `#2d6a5a` (Classic Day Planner Teal/Forest Green)
  * Header Text: `#1b4332` (Deep Forest)
  * Active Tabs: `#e9f5f2` (Light Teal Tint)
  * Priority Badges: `A` (Coral Red), `B` (Amber Gold), `C` (Slate Blue)
* **Typography**:
  * Headers & Titles: *Playfair Display* / *Georgia* (Classic Day Planner look)
  * Grid Content & Inputs: *Inter* / *Roboto* (High legibility)
* **Frontend Tech Stack**:
  * **Alpine.js**: Reactive state management for binder tabs, modal popups, task status updates, and universal search filter.
  * **UWSDS-inspired CSS**: Responsive layout grid, accessible contrast, clean borders.

---

## 6. Google Suite API Integration Matrix

| Google Service | Apps Script API | Integration Role |
| :--- | :--- | :--- |
| **Google Calendar** | `CalendarApp` | Sync events into 07:00-19:00 grid, event popup details modal, Meet launcher. |
| **Google Tasks** | `Tasks` / `TasksApp` | Manage daily `[A1]` tasks and monthly master task lists (`[Month] [Year] Master Tasks`), execute task transfer. |
| **Google Docs** | `DocumentApp` | Auto-generate a structured Agenda Doc (objectives, attendees, Meet link, action items) when a calendar event is created with `autoAgendaDoc` enabled. Not used for daily notes. |
| **Google Drive** | `DriveApp` | Store/retrieve partitioned monthly daily-notes JSON (`Day Planner/notes-YYYY-MM.json`) and Agenda Docs, scoped to `drive.file`. |

> **Not implemented**: Google Sheets (`SpreadsheetApp`) integration and expense tracking were scoped in early planning but have no implementation in the codebase. Treat as out of scope unless revisited.

---

## 7. Technical Architecture & File Structure

> This section reflects the current implementation (post-MVP), not the original planning-stage layout.

```
/home/mike/projects/day-planner/
├── PRD.md, README.md, README.txt  # Product spec, quick-start, developer theory-of-ops
├── package.json, server.js        # ES module config; local Node preview server (npm start)
├── images/                        # Downloaded reference product images
├── src/                           # Canonical logic engines (unit-tested, run locally + browser)
│   ├── taskEngine.js, calendarEngine.js, syncEngine.js, indexParser.js,
│   │   searchEngine.js, binderStore.js, gasBridge.js, indexedDbStore.js,
│   │   shellLoader.js, app.js
│   └── vendor/                    # Bundled Alpine.js, Pico CSS
├── tests/                         # node --test unit suite, one file per engine
├── gas-app/                       # Google Apps Script project (clasp deploy target)
│   ├── Code.gs                    # Backend logic, API integrations, bundle-export endpoint
│   ├── Index.html / Styles.html / About.html
│   ├── Script.html                # Alpine.js components — hand-duplicated copy of src/ logic
│   └── UnitTests.gs               # Self-test diagnostics (`/dev/self-test`)
├── gh-pwa-shell/                  # Separate git repo: public Universal PWA Shell loader
└── tools/                         # Build/ops scripts (shell bundle build, screenshots, handoff)
```

See `CLAUDE.md` for the dual-runtime architecture (why `src/` and `gas-app/Script.html` both exist and must stay in sync) and `shell-gas-pattern.md` for the PWA shell design.

---

## 8. Development Implementation Plan

1. **Phase 1: GAS Backend & Template Architecture**
   * Build `Code.gs` handlers for `CalendarApp`, `TasksApp`, `DocumentApp`, `DriveApp`.
   * Create Day Planner Google Docs Template generator script.
2. **Phase 2: Alpine.js Binder Frontend & Universal Search**
   * Implement 2-page Daily Binder layout, Full-Screen Monthly Overview Calendar, Monthly Master Task List, and Monthly Index view.
   * Build Universal Search component (`Ctrl + K`) querying Calendar, Tasks, Docs, and Index.
3. **Phase 3: Task Transfer & Event Modal Integrations**
   * Implement "Move to Today" task migration from `August 2026 Master Tasks` to active daily list.
   * Implement Calendar event detail popup modal (gMeet button + open in gCal tab).
4. **Phase 4: Automated Indexing & Verification**
   * Build Google Docs `#index` tag parser service.
   * Perform end-to-end verification of Web App `doGet()` deployment.
