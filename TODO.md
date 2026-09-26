# Active Tasks (TODO)

- [ ] **1. PWA Installability Enhancements (No Service Worker)**:
  - [ ] **Inline Web App Manifest**: Add inline JSON manifest via `data:application/manifest+json,...` `<link rel="manifest">` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
  - [ ] **PWA Manifest Metadata**: Include `name`, `short_name`, `start_url`, `display: "standalone"`, `background_color: "#fcfbfa"`, `theme_color: "#2d6a5a"`, `description`, and `categories`.
  - [ ] **PWA Icons**: Provide SVG icon and PNG icons (192×192, 512×512, maskable and any) using base64 data URIs and reliable raw assets.
  - [ ] **Apple & Mobile Web App Meta**: Ensure `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and `mobile-web-app-capable` meta tags are fully configured.
  - [ ] **Native Install Trigger Handling**: Wire `beforeinstallprompt` event capture in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) so "Install Day Planner" buttons trigger native browser prompt if available, falling back to modal guide.

- [ ] **2. Live Workspace UAT of Phase 13 UX Polish & App Affordances**:
  - [ ] **Fixed Top App Bar**: Verify `header.single-top-bar` remains pinned to the viewport without bouncing or scrolling out of view when scrolling long views.
  - [ ] **Dark Mode Datepicker Contrast**: Verify calendar picker icon is inverted and cleanly visible against dark mode backgrounds.
  - [ ] **Themed Open Folio Favicon**: Verify the green-themed folio favicon renders cleanly in browser tabs.
  - [ ] **Notion-Style LRU Topic Popover**: Test typing filter, arrow-key navigation, `Enter` selection, and "×" item deletion.
  - [ ] **Install Modal Trigger**: Verify `[Install Day Planner]` buttons open modal dialog 4 cleanly.
  - [ ] **Master Tasks Scroll & Due Date**: Verify sticky header, custom 8px scrollbar, and due date quick-add persist to Google Tasks.
  - [ ] **Category Suggestions**: Verify dynamic `<datalist id="category-suggestions">` on task quick-add bars.

- [ ] **3. Phase 14 Roadmap: Advanced Productivity Enhancements**:
  - Evaluate recurring tasks / daily template checklist support.
  - Evaluate rich text / markdown checklist support inside note card topic bodies.
  - Evaluate offline sync / cached read-only fallback mode.
