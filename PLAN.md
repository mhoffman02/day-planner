# Development Plan: Franklin-Google Digital Day Planner (GAS MVP)

## Project Overview
The **Franklin-Google Digital Day Planner** is a high-efficiency single-page digital binder application styled in classic Franklin Covey aesthetic (forest/teal ruling, cream background, serif headers). It bridges Franklin Dayplanner productivity methodology with Google Workspace APIs (Calendar, Tasks, Docs, Sheets, Drive) featuring full 2-Way Synchronization across Google Calendar, Google Tasks, and the Franklin Binder.

---

## Technical Stack & Architecture

- **Backend / GAS**: Google Apps Script (`Code.gs`) providing `doGet()` web app entry, Google Workspace API integrations (`CalendarApp`, `Tasks`, `DocumentApp`, `SpreadsheetApp`, `DriveApp`), and time-driven 2-Way Sync triggers.
- **Frontend Binder Shell**: Single Page Application (`Index.html`, `Styles.html`, `Script.html`) styled in Franklin Covey & UWSDS CSS system.
- **Client Logic & State**: Alpine.js for reactive binder tabs, daily/monthly state, 2-way workspace sync, modal popups, drag/drop task ordering, search filter.
- **Local Testing & Simulation**: Node.js test harness (`node:test` / modular JS) with mock GAS services allowing full local unit testing, dev server preview, and seamless GAS bundle syncing.

---

## Modular Architecture & Test Suite Map

| Module | Location | Description | Unit Test File | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Task Engine** | `src/taskEngine.js` | `[A1]` prefix parsing, status codes (`✓`, `→`, `X`, `G/✓`, `•`), sorting/sequencing, "Move to Today" transfer logic | `tests/taskEngine.test.js` | ✅ Passed (6 tests) |
| **Calendar & Schedule** | `src/calendarEngine.js` | 7am-7pm schedule grid formatting, 30-min slot mapping, event popup payload generation (gMeet & gCal links) | `tests/calendarEngine.test.js` | ✅ Passed (4 tests) |
| **2-Way Sync Engine** | `src/syncEngine.js` | Cross-references Tasks and Calendar Events via `syncId`, syncs task completion/priority to Calendar, and reconciles time shifts | `tests/syncEngine.test.js` | ✅ Passed (5 tests) |
| **Index & Docs Parser** | `src/indexParser.js` | Daily notes `#index` / `[INDEX]` tag extractor, topic categorization, index table aggregation | `tests/indexParser.test.js` | ✅ Passed (2 tests) |
| **Universal Search** | `src/searchEngine.js` | Multi-entity indexing (Calendar, Tasks, Docs, Index), search filtering, result ranking & highlights | `tests/searchEngine.test.js` | ✅ Passed (3 tests) |
| **Navigation & State** | `src/binderStore.js` | View router (Daily 2-Page, Monthly Calendar, Master Tasks, Index, Future Matrix), date navigation state | `tests/binderStore.test.js` | ✅ Passed (5 tests) |
| **GAS API Bridge** | `src/gasBridge.js` | Mock GAS backend for local preview & standard `google.script.run` adapter | `tests/gasBridge.test.js` | ✅ Passed (4 tests) |

---

## Phase Checklist & Progress Tracker

### Phase 1: Environment Setup & Core Logic Modules
- [x] Initialize `package.json` with Node test script (`node --test`).
- [x] Create `src/taskEngine.js` for task prioritization, status transitions, and monthly master transfer.
- [x] Create `tests/taskEngine.test.js` and verify task logic tests pass.
- [x] Create `src/calendarEngine.js` for 7am-7pm appointment grid, slot alignment, and event popup metadata.
- [x] Create `tests/calendarEngine.test.js` and verify calendar logic tests pass.

### Phase 2: Index Parser & Universal Search Engine
- [x] Create `src/indexParser.js` to parse daily note lines tagged `#index` or `[INDEX]`.
- [x] Create `tests/indexParser.test.js` and verify doc indexing tests pass.
- [x] Create `src/searchEngine.js` for cross-service indexing (`Ctrl + K` target).
- [x] Create `tests/searchEngine.test.js` and verify search query tests pass.

### Phase 3: Binder Store & GAS Mock/Bridge
- [x] Create `src/binderStore.js` to manage 5 page view states, active date, tab switching, and modal controls.
- [x] Create `tests/binderStore.test.js` and verify state transitions.
- [x] Create `src/gasBridge.js` providing GAS API integration handlers + local memory store fallback for standalone preview.
- [x] Create `tests/gasBridge.test.js` and verify bridge API handlers.

### Phase 4: 2-Way Synchronization Engine Integration
- [x] Create `src/syncEngine.js` implementing bi-directional task <-> event linkage, status sync (`[✓]`), and reconciliation.
- [x] Create `tests/syncEngine.test.js` and verify sync logic tests pass.
- [x] Update `gas-app/Code.gs` with server-side `syncWorkspaceChanges()` handler and `setup2WaySyncTrigger()` for 10-minute automated background syncing.

### Phase 5: UI Design System & Single Page App (SPA) Binder
- [x] Create `gas-app/Styles.html` implementing classic Franklin Covey aesthetic (Parchment `#fcfbfa`, Franklin Teal `#2d6a5a`, Serif typography, tab binder layout).
- [x] Create `gas-app/Script.html` containing Alpine.js app initialization, 2-Way Sync action triggers, and search modal handlers.
- [x] Create `gas-app/Index.html` housing the 5 core views:
  1. Prioritized Daily Planner (2-Page Spread: Tasks/Tracker left, 7am-7pm Schedule + Daily Notes right).
  2. Full-Screen Monthly Overview Calendar (7x5 grid with event pills & direct day click).
  3. Monthly Master Task List Page (Categorized Work, Personal, Financial, Projects + "Move to Today").
  4. Monthly Index Page (Searchable registry with topic, summary highlight, direct link).
  5. Future Planning Matrix (12-month forward look).

### Phase 6: Local Dev Server & Full Test Suite Verification
- [x] Create local server runner (`server.js`) to serve the full digital binder web interface locally at `http://localhost:3000`.
- [x] Run full test suite (`npm test`) to ensure 100% test passing across all feature modules (29/29 passing).
- [x] Verify UI responsiveness, modal popups, `Ctrl + K` search, task status transitions, 2-way sync button, and calendar navigation.

### Phase 7: Code Review, Security & Modernization Refactoring
- [x] Fix date navigation timezone bug in `src/binderStore.js` using local year/month/day date math.
- [x] Refactor `src/gasBridge.js` to leverage `taskEngine.js` for sequence generation and task transfer.
- [x] Modernize JS engine modules by replacing deprecated `String.prototype.substr()` calls with standard `slice()`.
- [x] Enhance accessibility with dynamic `:aria-label` bindings on task status cycling controls in `gas-app/Index.html`.
- [x] Secure external links with `rel="noopener noreferrer"` across `Index.html`, `About.html`, and `SetupFolder.html`.
- [x] Fix year interpolation in Future Planning Matrix month card titles (`gas-app/Index.html`).
- [x] Normalize HTTP URL parsing in `server.js` using `URL` pathname extraction.

### Phase 8: 3-Column Layout, Modular Note Cards & Google Docs Custom Menu
- [x] Refactor Daily View layout in `gas-app/Index.html` to a 3-column workspace on PC Large screens (Tasks = Col 1, Appointment = Col 2, Notes = Col 3).
- [x] Implement multi-line text auto-fit (1-3 lines) and vertical scrolling (>4 lines) for Tasks and Appointment pills.
- [x] Build Modular Franklin Topic Cards with expand/collapse twisties (`▼`/`▶`), editable H3 headings, category tags, Google Chat formatting toolbar, and card search/filter dropdown menu.
- [x] Implement 12 Monthly Google Docs sync architecture (`Day Planner Notes - August 2026`) with print-friendly formatting (page breaks per day, styled headers, bullet lists).
- [x] Add custom `Planner 📖` menu to Google Docs (`onOpen`) with cross-month universal search sidebar and `#index` decision registry.

---

## Verification Criteria
- [x] All unit tests in `tests/*.test.js` pass cleanly (`npm test`).
- [x] UI matches Franklin Covey design rules (#fcfbfa cream, #2d6a5a teal ruling, serif headers).
- [x] 2-Way Sync correctly cross-references tasks and calendar appointments.
- [x] All views function correctly in both local dev server (`http://localhost:3000`) and GAS file bundle.
- [x] Code passes comprehensive JavaScript & HTML code reviews with zero security or date-shift warnings.

