# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262). Systematically backport working features, bugfixes, and UI refinements running under native Google Workspace services (`CalendarApp`, `Tasks`, `DriveApp`), delivering an online-only digital day planner accessible across both personal HOME and locked-down federal WORK PCs.

---

### KEY DECISIONS

- **Baseline & Branch**: Rooted at baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`. Master preserved and tagged `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero SW**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js`, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Online-Only Sandbox**: No complex offline outbox syncing needed in sandboxed GAS iframe.
- **Native Auth Over Custom Gates**: No application-level whitelist/access gates. Pure GAS deployed with `executeAs: USER_ACCESSING` isolates Drive files and Google services under `drive.file` automatically.
- **GAS IIFE Isolation**: Both [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) are strictly wrapped in `(function(global) { ... })(this);` with explicit global export blocks ([`.agents/rules/gas-namespace-iife.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-namespace-iife.md)).
- **Top-Level Entry Point Delegators**: Entry points (`doGet()`, `onOpen()`, `syncWorkspaceChanges()`, etc.) are declared as top-level functions outside the IIFE so Google's AST parser discovers them for web app routing and IDE dropdown menus.
- **Temporary Minimal Baseline Test**: Implemented minimal `doGet(e)` at the top of [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L23-L25) returning `<h1>Basic test</h1><p>Pass</p>` to isolate serving issues from render logic. Original complete implementation is preserved as [`doGet_original(e)`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L309-L373) and [`doGet_original_wrapper(e)`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1839-L1841).
- **Target HOME Script**: Active `clasp` target switched in [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) to HOME script ID `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq` owned by `mhoffman02@gmail.com`.
- **Domain & Deployment Rules**:
  - `clasp deploy` requires the authenticated user in `~/.clasprc.json` to be in the same domain as the script owner (`mhoffman02@gmail.com`).
  - Google Apps Script restricts `/dev` strictly to project editors/owners; non-owner accounts receive "Page not found".
  - Production deployments (`/exec`) require redeploying the versioned deployment ID in the Apps Script IDE or via `clasp deploy` once authenticated as the owner.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.
- **No-Pills Design Policy**: Strictly enforce [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) — 4px button border radii, flat underline active tab indicator (`border-bottom: 3px solid #58bfa2`), zero stadiums/capsules.

---

### URL ROUTING — CANONICAL ENDPOINTS

> **NEVER** use the enterprise proxy path `/a/macros/gsa.gov/...` for this script.
> The script is owned by `mhoffman02@gmail.com` (consumer Gmail). GSA's enterprise proxy
> rejects consumer-owned deployments with HTTP 404 before `doGet()` is ever reached.
> **NEVER** request `/exec` against the `@HEAD` deployment ID; `/dev` is the correct suffix for `@HEAD`.

| Purpose | URL | Who Can Access |
|---|---|---|
| **HOME Dev minimal test** (`@HEAD`) | [`/dev`](https://script.google.com/macros/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev) | `mhoffman02@gmail.com` only |
| **HOME Prod app** (`@1`) | [`/exec`](https://script.google.com/macros/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) | Anyone |

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main`.
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Session Accomplishments (2026-09-23 PM)**:
  - **Minimal `doGet()` Isolation**: Replaced top `doGet()` with minimal HTML output (`<h1>Basic test</h1><p>Pass</p>`) while preserving the full original implementation as `doGet_original` inside the IIFE and `doGet_original_wrapper` at bottom.
  - **Deployment Domain Diagnosis**: Identified root cause of `Only users in the same domain as the script owner may deploy this script`: `~/.clasprc.json` was authenticated as `michael.hoffman@gsa.gov` instead of script owner `mhoffman02@gmail.com`.
  - **Stale Meta Tag Root Cause**: Identified that Prod (version 151) failure was due to old deprecated `addMetaTag('mobile-web-app-capable')` calls frozen in version 151.
  - **HOME Script Configuration**: Migrated [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) to HOME script ID `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq` and cleanly pushed all 8 project files via `clasp push --force`.
  - **Live Dev Endpoint Available**: Deployed to `@HEAD` with deployment ID `AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8`.

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

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Verify Minimal Baseline `doGet()` on HOME Script (`@HEAD`)**:
   - Open HOME dev endpoint: [`/dev`](https://script.google.com/macros/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev) signed into `mhoffman02@gmail.com`.
   - Confirm page renders `<h1>Basic test</h1><p>Pass</p>`.
   - Once verified, restore `doGet` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L23-L25) to delegate to full application logic (`_doGetInternal`), push via `clasp push`, and verify the full UI loads.
2. **Workspace UAT & Production Deployment on HOME Script**:
   - In Apps Script IDE for HOME script `1980roEKgkC_...`, update deployment or deploy new version.
   - Verify folder auto-creation and 2-way sync with Google Calendar and Google Tasks.
   - Verify `Day Planner - Run Log` document auto-created in your Google Drive `Day Planner` folder.
   - Tag git: `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.
3. **Desktop Shortcut Verification ("Open as Window")**:
   - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
   - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.

---

### IMMEDIATE NEXT STEP

Open the HOME Dev endpoint in a browser signed into `mhoffman02@gmail.com`:
👉 **[`https://script.google.com/macros/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev`](https://script.google.com/macros/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev)**

Confirm it returns `<h1>Basic test</h1><p>Pass</p>`. Once confirmed, swap the top `doGet()` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L23-L25) to call `return _doGetInternal(e);` to test full application load.
