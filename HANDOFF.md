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
- **Target HOME Script**: Active `clasp` target configured in [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) to HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W` owned by `mhoffman02@gmail.com`.
- **Target WORK Script**: WORK script ID is `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq` owned by `michael.hoffman@gsa.gov`.
- **Domain & Deployment Rules**:
  - `clasp deploy` and `clasp push` require the authenticated user in `~/.clasprc.json` to have Editor/Owner permissions on the target script. Currently `~/.clasprc.json` is logged in as `michael.hoffman@gsa.gov`.
  - Google Apps Script restricts `/dev` strictly to project editors/owners; non-owner accounts receive "Page not found".
  - Production deployments (`/exec`) require redeploying the versioned deployment ID in the Apps Script IDE or via `clasp deploy` once authenticated as the owner.
- **Pre-Flight Verified Handoff Pipeline**: All test and lint checks (`npm run lint && npm test`) MUST pass BEFORE initiating handoff updates.
- **No-Pills Design Policy**: Strictly enforce [`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md) — 4px button border radii, flat underline active tab indicator (`border-bottom: 3px solid #58bfa2`), zero stadiums/capsules.

---

### URL ROUTING — CANONICAL ENDPOINTS

> **NEVER** use the enterprise proxy path `/a/macros/gsa.gov/...` for the HOME script.
> The HOME script is owned by `mhoffman02@gmail.com` (consumer Gmail). GSA's enterprise proxy
> rejects consumer-owned deployments with HTTP 404 before `doGet()` is ever reached.
> **NEVER** request `/exec` against the `@HEAD` deployment ID; `/dev` is the correct suffix for `@HEAD`.

| Environment | Purpose | URL | Who Can Access |
|---|---|---|---|
| **HOME** | **Dev endpoint** (`@HEAD`) | [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) | `mhoffman02@gmail.com` only |
| **HOME** | **Dev self-test** (`@HEAD`) | [`/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test) | `mhoffman02@gmail.com` only |
| **HOME** | **Prod app** (`day-planner-v01`) | [`/exec`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec) | Anyone |
| **HOME** | **Prod self-test** (`day-planner-v01`) | [`/exec?view=self-test`](https://script.google.com/macros/s/AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q/exec?view=self-test) | Anyone |
| **HOME** | **Script IDE** | [Edit Script](https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit) | `mhoffman02@gmail.com` |
| **WORK** | **Dev endpoint** (`@HEAD`) | [`/dev`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev) | `michael.hoffman@gsa.gov` only |
| **WORK** | **Prod app** | [`/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec) | Anyone in GSA |
| **WORK** | **Script IDE** | [Edit Script](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) | `michael.hoffman@gsa.gov` |

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main`.
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Session Accomplishments (2026-09-23 PM)**:
  - **Script Identity Disambiguation**: Verified and disambiguated HOME script (`1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W` owned by `mhoffman02@gmail.com`) and WORK script (`1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq` owned by `michael.hoffman@gsa.gov`).
  - **Minimal `doGet()` Isolation**: Replaced top `doGet()` with minimal HTML output (`<h1>Basic test</h1><p>Pass</p>`) while preserving the full original implementation as `doGet_original` inside the IIFE and `doGet_original_wrapper` at bottom.
  - **Clasp Auth Status**: Identified that `~/.clasprc.json` is logged in as `michael.hoffman@gsa.gov`. To push to HOME via clasp, re-auth via `clasp login` or add `michael.hoffman@gsa.gov` as Editor on the HOME script.
  - **Stale Meta Tag Root Cause**: Identified that Prod failure was due to old deprecated `addMetaTag('mobile-web-app-capable')` calls rejected by GAS runtime. Removed disallowed meta tags from `Code.gs`.

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

1. **Verify Baseline `doGet()` on HOME Script (`@HEAD`)**:
   - Authenticate clasp as `mhoffman02@gmail.com` via `clasp login` (or share HOME script with `michael.hoffman@gsa.gov` as Editor), push via `clasp push --force`.
   - Open HOME dev endpoint: [`/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev) signed into `mhoffman02@gmail.com`.
   - Confirm page renders properly. Once verified, restore `doGet` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) to delegate to full application logic (`_doGetInternal`), push, and verify full UI loads.
2. **Workspace UAT & Production Deployment on HOME Script**:
   - In Apps Script IDE for HOME script [`1XUrbUS55yQf_...`](https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit), update deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`) to new version.
   - Verify folder auto-creation and 2-way sync with Google Calendar and Google Tasks.
   - Verify `Day Planner - Run Log` document auto-created in your Google Drive `Day Planner` folder.
   - Tag git: `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.
3. **Desktop Shortcut Verification ("Open as Window")**:
   - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
   - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.

---

### IMMEDIATE NEXT STEP

Re-authenticate clasp to HOME account (`mhoffman02@gmail.com`) via `clasp login` or grant editor access to `michael.hoffman@gsa.gov` on the HOME script [1XUrbUS55yQf_...](https://script.google.com/d/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/edit), then push latest code via `clasp push --force` and test:
👉 **[`https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev)**
