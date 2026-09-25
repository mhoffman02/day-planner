# Active Tasks (TODO)

- [ ] **Deploy Version 26 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit), select deployment `Version 3` (`9csO`), edit, select **New version** (Version 26), and click **Deploy**.
- [ ] **Live Workspace UAT of Master Tasks, Monthly Index & Month Picker**:
  - Verify Master Tasks header displays "Master Tasks" across both local dev and production GAS web app.
  - Verify Master Tasks quick add bar includes segmented priority buttons (`A` | `B` | `C`) with hover titles, `Alt+A/B/C` shortcuts, and inline `#a`, `#b`, `#c` title prefix detection.
  - Verify Master Tasks table columns: `Pri` badge, `Sts` dropdown menu with Franklin glyphs and "Delete" option, Task Description with star toggle and notes popover hover/click, `Category`, and Action column with date picker, `[Move]` button, and `[Delete]` button (`.btn-delete-row`).
  - Verify deleting a master task removes it completely from Google Tasks (`Tasks.Tasks.remove('@default', taskId)`).
  - Verify status change on a moved master task mirrors to its linked daily task.
  - Verify Monthly Index displays header "Monthly Index and Decisions" and renders "Summary Highlight" using rich text format (`renderCardLine`).
  - Verify Monthly Index "DIRECT DOC LINK" opens authentic Google Docs URLs (`https://docs.google.com/document/d/...`) rather than script proxy URLs.
  - Verify top navbar `< This Month >` opens hover-drop month picker with `< [Year] >` year stepper and 12-month grid for rapid multi-year navigation.
- [ ] **Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

