# Active Tasks (TODO)

- [ ] **1. Live Workspace UAT of Phase 13 Polish & Install Affordances**:
  - [ ] **Master Tasks Scroll & Thematic Scrollbars**:
    - Verify scrollbar renders cleanly when tasks exceed container space (`.master-tasks-table-container`).
    - Verify sticky table header (`th`) remains pinned at the top during scrolling.
    - Verify subtle thematic scrollbars in both Light (slate-teal thumb) and Dark (forest jade thumb) modes.
  - [ ] **Master Tasks Quick-Add Due Date & Visibility**:
    - Verify optional due date input between Task Title and Category in quick-add bar.
    - Add a task with a due date and confirm it saves to Google Tasks and appears in the table with date badge.
    - Verify adding an undated task while filtered to Future/Overdue automatically resets horizon filter to `All Dates`.
  - [ ] **Themed Date Pickers**:
    - Verify `.master-task-date-input`, `.master-task-due-date-input`, and `.future-item-date-input` date pickers in Light and Dark modes.
    - Verify calendar picker indicator glyph matches theme (teal in Light, mint in Dark).
  - [ ] **Category Autocomplete `<datalist>`**:
    - Focus Category input on Master Tasks and Daily Tasks quick-add bars.
    - Verify dropdown suggestions populate dynamically from existing tasks and categories (`#category-suggestions`).
  - [ ] **Note Card Category Buttons**:
    - Verify 20px button height and bottom padding cleanly accommodate font descenders (`g`, `y`, `p`).
  - [ ] **Desktop Install Affordance & Modal Guide**:
    - In About tab, verify header button reads `Install Day Planner` with tooltip `Version 3.0 — Click to install Day Planner as a desktop app`.
    - Click header Install button or Section 5 `Install Day Planner` button and verify Install Guide modal opens.
    - Verify Section 5 `Copy Direct App Link` button copies URL to clipboard with "Copied!" feedback.
    - In Dark mode, verify secondary outline button styling (transparent background, mint `#79d6bd` text, `#3b8773` border).

- [ ] **2. Phase 14 Roadmap: Advanced Productivity Enhancements**:
  - Evaluate recurring tasks / daily template checklist support.
  - Evaluate rich text / markdown checklist support inside note card topic bodies.
  - Evaluate offline sync / cached read-only fallback mode.
