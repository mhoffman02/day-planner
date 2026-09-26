# Context Handoff Document

### OBJECTIVE

Deliver a pure Google Apps Script digital binder productivity app bridging Franklin Covey Day Planner methodology with Google Workspace APIs (Calendar, Tasks, Drive). The immediate focus is implementing full Progressive Web App (PWA) installability features (excluding service worker) using an inline web app manifest and SVG / data PNG icons, followed by live workspace UAT and Phase 14 productivity enhancements.

---

### KEY DECISIONS

- **Removal of "Copy App Link" Button ([commit `33566a2`](file:///home/mike/projects/day-planner))**:
  - **Philosophy & Fix**: The "Copy app link" button in About tab and Install modal was redundant with the browser address bar and suffered from a trailing quote formatting bug. Removed the button, cleaned up associated Alpine state (`copiedAppUrl`, `copyAppUrl()`), and removed the injected `window.__DAY_PLANNER_WEB_APP_URL__` script block.
  - **Result**: Cleaner UI in both About and Install views without broken URL artifacts.

- **Accurate Chrome Desktop Shortcut Instructions ([commit `33566a2`](file:///home/mike/projects/day-planner))**:
  - Apps Script web apps run sandboxed inside iframes without standard PWA manifests on `script.google.com`, meaning Chrome will not show an address-bar install icon.
  - Updated both [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html#L140) and [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L1153) to clearly document the actual Chrome method:
    `Chrome Menu (⋮) → Save and share (or More tools) → Create shortcut... → Check "Open as window" → Click Create`.

- **Fixed Top App Bar ([commit `4009193`](file:///home/mike/projects/day-planner))**:
  - Pinned [`header.single-top-bar`](file:///home/mike/projects/day-planner/src/styles.css#L228) using `position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 1000;`, set `body { padding: 56px 12px 8px 12px; }`, and set modal `z-index: 10000;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html).
  - Keeps top navigation permanently pinned without bouncing during scroll.

- **High-Contrast Dark Mode Calendar Picker Icon ([commit `4009193`](file:///home/mike/projects/day-planner))**:
  - Inverted calendar indicator icon in dark mode using `filter: brightness(0) invert(1) !important; opacity: 1 !important;` in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L2877) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L3012).

- **Notion-Style LRU Topic Autocomplete Popover ([commit `4009193`](file:///home/mike/projects/day-planner))**:
  - Implemented persistent 10-item LRU cache stored in `localStorage` (`dayPlannerTopicLRU`) in [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js#L688) and [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html#L1458).
  - Provided dropdown on focus/typing with full keyboard navigation (`↑`, `↓`, `Enter`, `Esc`) in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html#L439) and dedicated "×" delete action on each row.

- **Theme-Green Open Folio Favicon with Minty Outline ([commit `eb69e81`](file:///home/mike/projects/day-planner))**:
  - Replaced Material icon with custom brand open folio icon matching Day Planner green theme:
    - Main pages/body: Deep forest green (`#163b2f`).
    - Turning leaf accent: Binder teal (`#2d6a5a`).
    - Outline & seams: Bright mint (`#6ee7b7`), delivering high contrast across light and dark tabs.
  - Production PNGs generated at [`icons/favicon.png`](file:///home/mike/projects/day-planner/icons/favicon.png) (96×96 Retina), [`icons/favicon-32x32.png`](file:///home/mike/projects/day-planner/icons/favicon-32x32.png), and [`icons/favicon-16x16.png`](file:///home/mike/projects/day-planner/icons/favicon-16x16.png).

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`.
- **Latest Commits**:
  - [`33566a2`](file:///home/mike/projects/day-planner): `fix(install): remove copy app link button and update chrome desktop shortcut guide`.
  - [`eb69e81`](file:///home/mike/projects/day-planner): `feat(branding): update favicon to green theme with minty outline for multi-tab contrast`.
  - [`afee716`](file:///home/mike/projects/day-planner): `fix(gas): use png for favicon url and guard setFaviconUrl in try-catch`.
  - [`0e61981`](file:///home/mike/projects/day-planner): `fix(app): sync category and due date state vars with script html and verify clean smoke tests`.
  - [`4009193`](file:///home/mike/projects/day-planner): `feat(ux): fixed top bar, high-contrast dark datepicker, open folio favicon, topic LRU dropdown, and install modal fixes`.
- **Live Deployment State**:
  - HOME Prod (`day-planner-v01`): Version 205 (`@205`) deployed on `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - WORK Prod (`9csO`): Version 52 (`@52`) created on script `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`.
- **Pre-Flight Verification**:
  - `npm run lint`: 0 errors (4 existing warnings).
  - `npm test`: 137/137 unit tests passing across 17 suites.
  - `npm run check:gas-safe-chars`: Clean.

---

### CONSTRAINTS & PREFERENCES

1. **Salutation**: Start every reply with `⚡Mike:`.
2. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
3. **DO NOT EXPLAIN APPS SCRIPT IDE STEPS**: Never instruct or repeat steps to the user on how to update, deploy, or operate the Apps Script Web IDE ("REMEMBER: don't tell me how to update app in IDE - got it").
4. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
5. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
6. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, archival ink blue `#1d5fa8`, plum `#5e3f6b`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)). Use crisp 2px border radius for stamps and buttons.
7. **Apps Script Safe Characters**: Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.
8. **Dual-Environment Isolation**: HOME is mastercopy; WORK is strictly production `/exec` promoted via `npm run push:work` ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **PWA Installability Enhancements (No Service Worker) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L3-L9))**:
   - Inline web app manifest via `data:application/manifest+json,...` `<link rel="manifest">` in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
   - Configure metadata: `name`, `short_name`, `start_url`, `display: "standalone"`, `background_color: "#fcfbfa"`, `theme_color: "#2d6a5a"`, `description`, `categories: ["productivity"]`.
   - Configure icons: SVG icon and base64 PNG icons (192×192, 512×512, maskable and any).
   - Ensure Apple touch icon and mobile-web-app meta tags are fully in place.
   - Wire `beforeinstallprompt` event listener to launch native prompt on install button click.
2. **Live Workspace UAT of Phase 13 UX Polish & App Affordances ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L11-L19))**:
   - Fixed Top Bar: Verify [`header.single-top-bar`](file:///home/mike/projects/day-planner/src/styles.css#L228) remains pinned.
   - Dark Datepicker: Verify high-contrast calendar picker icon.
   - Favicon: Verify green open folio icon with mint outline.
   - Notion-Style Topic Popover: Verify 10-item LRU autocomplete, keyboard nav, and "×" item deletion on note cards.
   - Install Modal: Verify `[Install Day Planner]` opens modal dialog 4 cleanly.
   - Master Tasks: Verify sticky header, custom 8px scrollbar, due date input, and dynamic category autocomplete datalist.
3. **Phase 14 Planning & Architecture ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md#L21-L25))**:
   - Evaluate recurring tasks / daily template checklist architecture and markdown checkbox rendering in note card bodies ([`PLAN.md:222`](file:///home/mike/projects/day-planner/PLAN.md#L222)).

---

### IMMEDIATE NEXT STEP

Construct the inline JSON Web App Manifest (`data:application/manifest+json,...`) containing complete metadata and base64/SVG icons, and embed it into [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) and [`index.html`](file:///home/mike/projects/day-planner/index.html).
