# Active Tasks (TODO)

- [ ] **1. Live Workspace UAT of Phase 13 UX Polish & App Affordances**:
  - [ ] **Fixed Top App Bar**: Verify `header.single-top-bar` remains pinned to the viewport without bouncing or scrolling out of view when scrolling long views.
  - [ ] **Dark Mode Datepicker Contrast**: Verify calendar picker icon is inverted and cleanly visible against dark mode backgrounds.
  - [ ] **Themed Open Folio Favicon**: Verify the new green-themed folio favicon (`#163b2f` fill, `#6ee7b7` mint outline) renders with high contrast across light, dark, and teal browser tabs.
  - [ ] **Notion-Style LRU Topic Popover**:
    - Focus the `"Local only"` topic field on a daily note card and verify recent topics popover opens.
    - Test typing filter, arrow-key navigation (`↑`/`↓`), `Enter` to select, and `Esc` to close.
    - Click the `"×"` button on an item and verify it is removed from the persistent 10-item LRU cache (`dayPlannerTopicLRU` in `localStorage`).
  - [ ] **Direct App Link Copier**: Click `[Copy direct app link]` in About tab Section 5 and verify the copied link is the real published `/exec` URL and opens cleanly in a new window/tab without sandboxed OAuth redirection.
  - [ ] **Install Modal Trigger**: Click `[Install Day Planner]` (in header and Section 5) and verify Dialog 4 (`.modal-card-install`) opens cleanly without self-closing.
  - [ ] **Master Tasks Scroll & Due Date**: Verify sticky header, custom 8px scrollbar, and due date quick-add persist to Google Tasks.
  - [ ] **Category Suggestions**: Verify dynamic `<datalist id="category-suggestions">` on task quick-add bars.

- [ ] **2. Phase 14 Roadmap: Advanced Productivity Enhancements**:
  - Evaluate recurring tasks / daily template checklist support.
  - Evaluate rich text / markdown checklist support inside note card topic bodies.
  - Evaluate offline sync / cached read-only fallback mode.
