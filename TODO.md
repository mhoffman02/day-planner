# Active Tasks (TODO)

- [x] **Fix Appointment Modal HTML/Plain-text Description & gCal Link 500 Error (commit `6f25dc2`)**:
  - Implemented `formatEventDescriptionHtml`: HTML-bearing descriptions are sanitized (scripts, styles, event handlers, and unsafe protocols stripped; external links target new tab) and rendered via `x-html`; plain-text descriptions are escaped and wrapped in `<pre>` to preserve line breaks.
  - Fixed gCal 500 error: `gas-app/Code.gs` now returns authentic event `htmlLink` via `Calendar.Events` or hand-built `base64url(bareId + ' ' + defaultCalId)`, eliminating broken `eventedit/<cleanId>` links.
- [x] **Deploy to HOME Prod (`@177`)**:
  - Created Version 177 and deployed to endpoint `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
- [ ] **Deploy Version 15 on WORK Deployment `Version 3` (`9csO`)**:
  - In [WORK Apps Script IDE](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit), select deployment `Version 3` (`9csO`), edit, select **New version** (or Version 15), and click **Deploy**.
- [ ] **Live Workspace UAT of Phase 9 & Calendar Fixes**:
  - Verify appointment details modal renders HTML formatted descriptions with working new-tab links.
  - Verify appointment details modal renders plain-text descriptions wrapped cleanly in `<pre>`.
  - Verify clicking [Open in gCal] opens the specific calendar event without 500 error.
  - Verify thematic priority colors, local Pacific time, star outline suppression, and backlog filtering.
- [ ] **Standalone Desktop Shortcut ("Open as Window")**:
  - Verify Chrome "Install Day Planner" / "Open as window" shortcut from [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
