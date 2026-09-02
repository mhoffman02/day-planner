---
name: advisor
description: Ask the Opus / Gemini Advisor for design decisions, architecture choices, or debugging advice for day-planner.
tags: [advisor, design, architecture, day-planner, review]
version: 2.0.0
---

# Advisor Skill — Architecture & Design Consultant

Use this skill when seeking design feedback, architecture guidance, or structural advice for the `day-planner` codebase.

## Application Architecture Context
- **Node.js Local Server**: `server.js` (Express/HTTP backend for local dev & testing)
- **Google Apps Script (GAS) Client**: `gas-app/` (`Code.gs`, `UnitTests.gs`, `Index.html`, `Script.html`, `Styles.html`, `SetupFolder.html`)
- **Core Modules (`src/`)**:
  - `calendarEngine.js`: Time-slot scheduling, overlapping event detection, day view layout engine
  - `taskEngine.js`: Task status transitions, due dates, priority sorting, binder associations
  - `binderStore.js`: Persistent store for binders, notes, checklists, and items
  - `gasBridge.js`: Bridge logic between web client and Google Apps Script endpoints
  - `syncEngine.js`: Synchronization between local binder state and Google Calendar/Tasks
  - `searchEngine.js`: Full-text search and filtering across binders, tasks, and events
  - `indexParser.js`: Parsing index formats and markdown structured notes
- **Test Suite**: `tests/*.test.js` (`npm test` or `node --test tests/*.test.js`)

## When to Consult the Advisor
1. Adding new engine modules or extending GAS HTML UI components.
2. Modifying state synchronization between `src/` and `gas-app/`.
3. Refactoring binder storage or search indexes.
4. Designing multi-step background sync or error recovery workflows.
