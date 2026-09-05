---
name: advisor
description: Ask the Opus / Gemini Advisor for design decisions, architecture choices, or debugging advice for day-planner.
tags: [advisor, design, architecture, day-planner, review]
version: 2.0.0
---

# Advisor Skill — Architecture & Design Consultant

Use this skill when seeking design feedback, architecture guidance, or structural advice for the `day-planner` codebase.

## Application Architecture Context
- **Node.js Local Server**: `server.js` (static file server for local dev & testing)
- **Static client-only app**: no server-side backend — the browser talks directly to Google's
  Calendar/Tasks/Drive/Docs REST APIs, authenticated via client-side Google Identity Services
  OAuth (`src/googleAuth.js`), hosted as a plain static site on GitHub Pages.
- **Core Modules (`src/`)**:
  - `calendarEngine.js`: Time-slot scheduling, overlapping event detection, day view layout engine
  - `taskEngine.js`: Task status transitions, due dates, priority sorting, binder associations
  - `binderStore.js`: Persistent store for binders, notes, checklists, and items
  - `gasBridge.js`: REST bridge to Google Workspace APIs, with a mock-data fallback for local dev
  - `googleAuth.js`: Client-side Google Identity Services OAuth (sign-in, token management)
  - `syncEngine.js`: Synchronization between local binder state and Google Calendar/Tasks
  - `searchEngine.js`: Full-text search and filtering across binders, tasks, and events
  - `indexParser.js`: Parsing index formats and markdown structured notes
- **Test Suite**: `tests/*.test.js` (`npm test` or `node --test tests/*.test.js`)

## When to Consult the Advisor
1. Adding new engine modules or extending the client-side UI.
2. Modifying REST integration with Google Workspace APIs or the OAuth flow.
3. Refactoring binder storage or search indexes.
4. Designing multi-step background sync or error recovery workflows.
