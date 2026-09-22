# Active Tasks (TODO)

## Phase 4: Feature & Bugfix Backporting

- [x] **Server Security & Robustness**:
  - IIFE wrapping for [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) with explicit exports.
  - Deduplicated Drive folder creation with `LockService.getUserLock()`.
  - Folder ownership validation for auto-adopted folders.
  - Safe HTML escaping for server-returned messages.
- [ ] **Universal Search**:
  - Anchored Ctrl+K dropdown indexing Tasks, Appointments, and Notes.
