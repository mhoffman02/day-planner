# Learnings

## 2026-08-16 — 3-Column Workspace Layout & Modular Franklin Note Cards with Google Docs Menu

**Worked well:**
- Interactive clarification questions guided optimal UX design
- Modular Topic Cards in Column 3 with expand/collapse twisties & Google Chat toolbar
- 3-column responsive layout for PC Large screen with auto-height and vertical scroll
- 12 monthly Google Docs sync architecture with print-friendly formatting
- Custom Planner menu and cross-month search sidebar in Google Docs

**Needs improvement:**
- Future enhancement: complete continuous doc accordion parsing for Option 2 mode

---

## 2026-08-16 — Header Consolidation, Resizable 3-Column Layout & Dual-Mode Appointment Modal

**Worked well:**
- G.A.S. idiomatic doGet() methods (setTitle, setFaviconUrl, addMetaTag) implemented and verified
- Left-Right resizable 3-column layout added with drag splitters, percentage math, double-click reset, and localStorage persistence
- 3 header rows consolidated into 1 ultra-compact top bar (~50px height), reclaiming ~130px of vertical space (~70% reduction in header height)
- Added round (+) button to Appointment column with dual-mode modal (inline quick add + native pre-filled gCal popup window)
- All 30 unit tests passing cleanly and changes deployed via clasp push

**Needs improvement:**
- Ensure mobile breakpoints cleanly hide drag handles to prevent accidental touch resize triggers on phone screens

---

## 2026-08-17 — HTML Separation of Concerns Audit & Handoff Step Order Fix

**Worked well:**
- Standardized GAS template include pattern and eliminated inline styles/scripts
- Extracted PWA inline styles and JS to external files with DOM listeners
- Moved SW registration into src/app.js and added clean store template methods
- All 41 unit tests passed cleanly

**Needs improvement:**
- Fixed handoff.js step order so CONTEXT.md and HANDOFF_PROMPT.md are generated before git add/commit/push

---

## 2026-08-17 — UI/UX, Accessibility & Responsive Refinements

**Worked well:**
- Restored Light Mode tokens and palette parity
- Fixed modal dialog DOM nesting and ARIA semantics
- Added mobile 3-panel daily switcher and WCAG touch targets
- Upgraded dark mode placeholder contrast to >5.2:1 with focus rings
- All 42 unit tests passing

**Needs improvement:**
- Prevent future theme selector collisions between root light and dark scopes
- Add automated accessibility linter to CI/test suite

---
