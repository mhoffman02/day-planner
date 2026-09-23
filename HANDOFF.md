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
- **Least-Privilege Drive Creation**: Enabled `Drive` Advanced Service v2 in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json) and use `Drive.Files.insert({ title, mimeType, parents: [{id: targetFolder.getId()}] })` to create Google Docs directly in destination folders under `drive.file` scope, eliminating `docFile.moveTo()` which required broad `drive`.
- **Dual In-App & Google Doc Logging**: Reused existing `documents` and `drive.file` scopes (avoiding new `spreadsheets` scope) to record permanent monospace audit logs in `Day Planner - Run Log` inside the Day Planner folder, paired with a 25-entry `UserProperties` ring buffer for instant `/self-test` table rendering and raw JSON export (`?view=logs&format=json`).
- **Target Production Deployment**: Pinned production deployment ID `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) for all future `/exec` releases.
- **Session Startup Check**: New sessions run only `git log -n 1 --oneline && git status -s`. If HEAD matches the handoff commit and the tree is clean, proceed immediately with **zero file reads** of `TODO.md`, `PLAN.md`, or `HANDOFF.md`.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.
- **No-Pills Design Policy**: Strictly enforce [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) — 4px button border radii, flat underline active tab indicator (`border-bottom: 3px solid #58bfa2`), zero stadiums/capsules.
- **Header Flex Geometry & Min-Width Reservations**: Pinned `.header-left` and `.header-actions-compact` to `flex: 0 0 auto; min-width: 0;` (with `overflow: hidden;` on `.header-left`) to prevent horizontal collapse or tab overlap on desktop viewports. Reserved `min-width: 280px;` on `.date-nav-compact` so undated views (Master Tasks) do not cause tab jitter. Full centering (`flex: 1 1 0`) activates only at `@media (min-width: 1400px)`.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`32084b9`](https://github.com/mhoffman02/day-planner/commit/32084b9).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`), automated smoke test suite passing (`npm run smoke`), accessibility/contrast/responsive audit passing (`npm run audit:a11y`).
- **Session Accomplishments**:
  - Restored minimal `https://www.googleapis.com/auth/drive.readonly` scope in [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json) to satisfy `DriveApp.getFolderById` permissions without broad `drive` (commit [`abcdf03`](file:///home/mike/projects/day-planner/commit/abcdf03)).
  - Eliminated `docFile.moveTo()` broad drive requirement via `Drive.Files.insert` helper [`getOrCreateMonthlyNotesDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L607) in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) (commit [`ea39b71`](file:///home/mike/projects/day-planner/commit/ea39b71)).
  - Built persistent in-app 25-entry ring buffer in `UserProperties` (`RECENT_SERVER_LOGS`) and rendered formatted log table on `/self-test` (commit [`ecf9850`](file:///home/mike/projects/day-planner/commit/ecf9850)).
  - Built permanent Google Doc run-log ([`appendRunLogToDoc_`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74)) under existing `documents` scope with zero new scopes, accessible via **📄 Open Google Doc Run Log** on `/self-test` (commit [`32084b9`](file:///home/mike/projects/day-planner/commit/32084b9)).
  - Pinned production deployment ID `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) and pushed all 8 files to `@HEAD` via `clasp push --force`.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done. Push back directly when the user's premise is flawed.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch (`pure-gas-main`).
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
6. **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
7. **OAuth Scopes**: Minimal `drive.file` and `drive.readonly` (for link title lookup and `getFolderById`). Never request broad `drive`. Never add `spreadsheets` scope when existing `documents` scope can be used.

---

### URL ROUTING — ANTI-PATTERN & CANONICAL URLS

> **NEVER** use the enterprise proxy path `/a/macros/gsa.gov/...` for this script.
> The script is owned by `mhoffman02@gmail.com` (consumer Gmail). GSA's enterprise proxy
> rejects consumer-owned deployments with HTTP 404 before `doGet()` is ever reached.
> **NEVER** request `/exec` against the `@HEAD` deployment ID (`AKfycbwb...vwil`);
> `/exec` is only valid on versioned deployment IDs. `/dev` is the correct suffix for `@HEAD`.

| Purpose | URL |
|---|---|
| **Dev self-test** (`@HEAD`, must be `mhoffman02@gmail.com`) | [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test) |
| **Dev app** (`@HEAD`) | [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) |
| **Production self-test** (`day-planner-v01`, anyone) | [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test) |
| **Production app** (`day-planner-v01`) | [`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec) |

> If Chrome has multiple Google accounts signed in, prefix with `/u/0/` or `/u/1/` matching
> `mhoffman02@gmail.com`: e.g. `https://script.google.com/u/0/macros/s/.../dev?view=self-test`

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Live Workspace UAT on Web App Endpoint (`day-planner-v01` & `/dev`)**:
   - Dev self-test (signed in as `mhoffman02@gmail.com`): [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test)
   - Production self-test (anyone): [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test)
   - Confirm all 5 test suites pass (100% HEALTHY) and verify the Recent Server Execution Logs table.
   - Verify `Day Planner - Run Log` document auto-created in your Google Drive `Day Planner` folder.
   - Test bidirectional sync across both HOME and locked-down federal WORK PCs.
2. **Production Release Deployment (`clasp deploy` onto `day-planner-v01`)**:
   - In Apps Script IDE, update deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) to "New version" to publish latest changes to `/exec`.
   - After UAT sign-off, tag git repository with release version tag (e.g. `v1.0-pure-gas`).
3. **Desktop Shortcut Verification ("Open as Window")**:
   - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
   - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.

---

### IMMEDIATE NEXT STEP

Start with the production self-test (anyone, no account switching needed):
[`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test)

Or the dev self-test (must be signed in as `mhoffman02@gmail.com`):
[`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test)

Confirm all 5 test suites 100% HEALTHY, then proceed to production `clasp deploy` (Phase 6, Task 2).

