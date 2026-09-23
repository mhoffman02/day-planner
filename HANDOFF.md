# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA (with service worker `sw.js` and client-side Google Identity Services OAuth) to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) (Aug 17, 2026). Then systematically backport working features, bugfixes, and UI refinements that only require GAS-hosted pages and scripts, delivering a fast, online-only digital day planner running seamlessly across personal HOME and locked-down federal WORK PCs.

---

### KEY DECISIONS

- **Baseline & Branch**: Rooted at baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`. Master preserved and tagged `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero SW**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js`, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Online-Only Sandbox**: No complex offline outbox syncing needed in sandboxed GAS iframe.
- **Native Auth Over Custom Gates**: No application-level whitelist/access gates. Pure GAS deployed with `executeAs: USER_ACCESSING` isolates Drive files and Google services under `drive.file` automatically.
- **Close-to-Installable PWA**: Standalone meta tags, manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), high-res icons, and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).
- **GAS IIFE Isolation**: Both [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) are strictly wrapped in `(function(global) { ... })(this);` with explicit global export blocks ([`.agents/rules/gas-namespace-iife.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-namespace-iife.md)).
- **Concurrency & Ownership Guards**: `LockService.getUserLock()` prevents race conditions in Drive folder creation/discovery; folder ownership validation blocks auto-adopting or connecting non-owned folders.
- **Session Startup Check**: New sessions run only `git log -n 1 --oneline && git status -s`. If HEAD matches the handoff commit and the tree is clean, proceed immediately with **zero file reads** of `TODO.md`, `PLAN.md`, or `HANDOFF.md`.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.
- **No-Pills Design Policy**: Strictly enforce [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) — 4px button border radii, flat underline active tab indicator (`border-bottom: 3px solid #58bfa2`), zero stadiums/capsules.
- **Header Flex Geometry & Min-Width Reservations**: Pinned `.header-left` and `.header-actions-compact` to `flex: 0 0 auto; min-width: 0;` (with `overflow: hidden;` on `.header-left`) to prevent horizontal collapse or tab overlap on desktop viewports. Reserved `min-width: 280px;` on `.date-nav-compact` so undated views (Master Tasks) do not cause tab jitter. Full centering (`flex: 1 1 0`) activates only at `@media (min-width: 1400px)`.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`ce56ea4`](https://github.com/mhoffman02/day-planner/commit/ce56ea4).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Phase 1-4 Complete**:
  - Baseline established, documentation backported, PWA/SW removed, standalone meta tags added, and all 6 core features backported (Future Planning, Daily Tasks enhancements, Modular Note Cards with rich formatting, Master Tasks backlog, Server Security & IIFE, Universal Search).
- **Recent Polish & Bugfixes**:
  - **Header Date Nav Overlap Resolved**: Fixed Month View date heading collision with centered navigation tabs ([`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L149), [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L150)) by restoring historical flex pinning (`flex: 0 0 auto; min-width: 0;`), width reservations (`min-width: 280px;` on `.date-nav-compact`, `calc(10ch + 12px)` on `.today-jump-btn`, `calc(14ch + 4px)` on `.date-text-display`), text truncation, and responsive breakpoints (≤1200px and ≤992px) (commit [`98f2086`](https://github.com/mhoffman02/day-planner/commit/98f2086)).
  - **Month View Jump Button Simplified**: Replaced dynamic `x-text="currentMonthName"` with static `This Month` on [`.today-jump-btn`](file:///home/mike/projects/day-planner/gas-app/Index.html#L75) to eliminate duplicate "September" adjacent to "September 2026".
  - **Kilo CLI Permissions Configured**: Configured Kilo permissions across project configs ([`kilo.jsonc`](file:///home/mike/projects/day-planner/kilo.jsonc), [`.kilo/kilo.jsonc`](file:///home/mike/projects/day-planner/.kilo/kilo.jsonc)), global configs ([`~/.config/kilo/kilo.jsonc`](file:///home/mike/.config/kilo/kilo.jsonc), Windows [`/mnt/c/Users/mhoff/.config/kilo/kilo.jsonc`](file:///mnt/c/Users/mhoff/.config/kilo/kilo.jsonc)), and sister projects to always auto-allow commands beginning with `git show` (commit [`ce56ea4`](https://github.com/mhoffman02/day-planner/commit/ce56ea4)).

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
6. **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
7. **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup). Never request broad `drive`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Phase 5 Local Smoke Testing & Safe Chars Check**:
   - Audit scriptlets in [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) to verify no single-line `//` comment truncation risks exist inside Apps Script template evaluation.
   - Run local dev server via `npm start` (`http://localhost:3000`) and verify manual smoke test across all 5 active views (Daily, Month Calendar, Master Tasks, Monthly Index, Future Planning) and Universal Search (`Ctrl+K`).
2. **Phase 5 Clasp Deployment Gate**:
   - Push to Google Apps Script development endpoint via `clasp push`.
   - Run `/self-test` diagnostic suite to verify live Google Workspace service integrations (Calendar, Tasks, Drive).
3. **WCAG Contrast & Responsive Verification**:
   - Audit top-bar and panel headers across light parchment (`#fcfbfa`) and dark mode (`#0c1813` / `#142820`) palettes in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L130-L380) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L130-L380).
   - Verify responsive breakpoint scaling down to 768px (mobile viewport) without horizontal overflow.

---

### IMMEDIATE NEXT STEP

Verify Apps Script HTML scriptlets for single-line `//` comment truncation hazards across [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html), then launch the local dev server with `npm start` to conduct smoke testing.
