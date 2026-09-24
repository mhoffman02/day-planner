# Context Handoff Document

### OBJECTIVE

Roll back the Day Planner project from an installable GitHub Pages PWA to a 100% pure Google Apps Script (GAS) hosted web application using baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262). Systematically backport working features, bugfixes, and UI refinements running under native Google Workspace services (`CalendarApp`, `Tasks`, `DriveApp`), delivering an online-only digital day planner accessible across both personal HOME (`mhoffman02@gmail.com`) and locked-down federal WORK (`michael.hoffman@gsa.gov`) Google Workspace accounts.

---

### KEY DECISIONS

- **Baseline & Branch**: Rooted at baseline commit [`d294262`](https://github.com/mhoffman02/day-planner/commit/d294262) on branch `pure-gas-main`. Master preserved and tagged `PWA-installable-22-Sep-2026`.
- **Zero External Hosting & Zero SW**: No GitHub Pages (`mhoffman02.github.io`), no `sw.js`, no client-side GIS OAuth tokens. The web app runs inside Google Apps Script (`script.google.com`) using first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Target HOME Script**: Active `clasp` target locked in [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) to HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W` owned by `mhoffman02@gmail.com`. Never target WORK script ID without explicit instruction ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).
- **Pinned Production Deployment**: Target production deployment ID is `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q` (`day-planner-v01`). Always deploy using `clasp deploy -i AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
- **GAS IIFE Isolation with Top-Level Delegators**: [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) and [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) are strictly wrapped in IIFEs for namespace hygiene ([`.agents/rules/gas-namespace-iife.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-namespace-iife.md)). All 18 client-callable `google.script.run` methods and IDE entry points are declared as top-level delegator functions outside the IIFE ([`gas-app/Code.gs#L1837-L1978`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L1837-L1978)) so Apps Script's AST parser discovers them.
- **Synchronous Alpine Document Order**: In [`gas-app/Index.html#L852-L854`](file:///home/mike/projects/day-planner/gas-app/Index.html#L852-L854), `<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>` is loaded synchronously at the end of `<body>` immediately after `<?!= include('Script'); ?>` (no `defer`). This guarantees `plannerApp` registers before Alpine scans the DOM (commit [`b86e451`](file:///home/mike/projects/day-planner)).
- **HtmlService Silent Truncation Bug Prevention**: Apps Script's `HtmlService.createHtmlOutputFromFile().getContent()` silently truncates served lines at literal `//` inside strings (e.g. `'https://...'`) and at apostrophes in comments (commit [`087b7ef`](file:///home/mike/projects/day-planner)). Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’`. Guarded by [`tools/check-gas-script-html-safe-chars.js`](file:///home/mike/projects/day-planner/tools/check-gas-script-html-safe-chars.js), wired into `npm run lint` and executable [`.githooks/pre-commit`](file:///home/mike/projects/day-planner/.githooks/pre-commit) ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)).
- **RPC Readiness Polling**: [`gas-app/Script.html#L360-L377`](file:///home/mike/projects/day-planner/gas-app/Script.html#L360-L377) uses `_runRpc` to poll up to 3s for `window.google.script.run[method]` to finish initializing before invoking, preventing client-side `is not a function` race conditions.
- **Circled-D Status Glyph (`Ⓓ`)**: Replaced `D/✓` with Unicode `U+24B9` (`Ⓓ`) across [`src/taskEngine.js`](file:///home/mike/projects/day-planner/src/taskEngine.js), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html), and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) for Franklin Covey paper planner fidelity, fitting the 28×28px status button with zero overflow.
- **Task/Appointment Separation (Option A)**: In [`gas-app/Code.gs#L644-L660`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L644-L660) and [`gas-app/Script.html#L918-L928`](file:///home/mike/projects/day-planner/gas-app/Script.html#L918-L928), tasks remain strictly checklist items in Google Tasks; [`syncWorkspaceChanges()`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L630) does NOT auto-create 30-minute blocks on Google Calendar. Middle column is preserved strictly for real calendar appointments.
- **Clean Plain-Text Metadata in Google Tasks**: [`encodeTaskMeta`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L774-L808) suppresses all metadata on default tasks (`General` category, no notes) so new tasks have completely blank notes in Google Tasks (eliminating `<!--dp-meta:{"category":"General"}-->`). Non-default metadata uses human-readable bracket tags (e.g. `[Category: Work]`, `[Status: Ⓓ]`).
- **Zero Dead PWA Manifest Links**: Stripped `<link rel="manifest" href="manifest.json">` and relative icon tags from [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) to eliminate the Chrome DevTools console `Syntax error: <!doctype html>` (which occurred when Chrome tried to parse GAS HTML as a JSON manifest).
- **Dual-Environment Promotion Pipeline (`npm run push:work`)**: HOME is the MASTERCOPY (`gas-app/.clasp.json`). WORK is targeted via isolated [`gas-app/.clasp-work.json`](file:///home/mike/projects/day-planner/gas-app/.clasp-work.json) (`1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`). [`tools/promote-to-work.js`](file:///home/mike/projects/day-planner/tools/promote-to-work.js) gates every push with `npm run lint` and `npm test` before pushing to WORK. Authorized via shared Editor permissions (`michael.hoffman@gsa.gov` shared script with `mhoffman02@gmail.com`).
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

- **Repository Branch**: `pure-gas-main`.
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`).
- **Live Deployment**: Version 166 (`@166`) deployed to pinned production ID `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
- **Verified in Chrome via CDP**:
  - Full 3-column binder UI (Tasks, Schedule, Notes) renders cleanly and completely.
  - Circled-D (`Ⓓ`) glyph displays properly in status buttons.
  - Priority dropdown ("Priority A/B/C") displays without text clipping.
  - Add task `[+]` button is vertically centered.
  - Console syntax errors: **0**.
- **Dual-Environment Promotion Status**:
  - `Day Planner HOME`: active mastercopy at Version 166 (`@166`).
  - `Day-Planner-WORK`: Version 2 (`@2`) successfully promoted via `npm run push:work`. Dev endpoint (`@HEAD`) live immediately; production endpoint awaiting version selection in GSA IDE.
  - Slash command `/push-work` wired across `.agents/commands/`, `.claude/commands/`, and `.kilo/workflows/`.
- **Enforcement Pipeline**:
  - `npm run check:gas-safe-chars` tests [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) for any literal `//` or comment apostrophes via `acorn`.
  - Wired into `npm run lint` and executable [`.githooks/pre-commit`](file:///home/mike/projects/day-planner/.githooks/pre-commit).

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

1. **Federal WORK Environment Access & Validation**:
   - WORK script promoted to Version 2 via `npm run push:work` (target `1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq`).
   - Test WORK dev endpoint on GSA machine: [`https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev`](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev).
   - In GSA Apps Script IDE, set Web App deployment to Version 2 to update the production `/exec` endpoint: [`https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec).
   - Verify native Google Workspace authorization without enterprise firewall/CORS blocks ([`.agents/rules/gas-environments.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-environments.md)).

2. **Run Log Google Doc Confirmation**:
   - Open `Day Planner` Google Drive folder on HOME account.
   - Verify [`Day Planner - Run Log`](file:///home/mike/projects/day-planner/gas-app/Code.gs#L74-L125) Google Doc exists and logs sync runs cleanly.

3. **Production Release Tagging (`git tag`)**:
   - Once WORK environment access and Run Log are validated, create and push the release tag:
     `git tag v1.0-pure-gas && git push origin v1.0-pure-gas`.

---

### IMMEDIATE NEXT STEP

Validate Federal WORK environment access:
1. Open WORK Dev endpoint in browser logged into GSA (`michael.hoffman@gsa.gov`):
   👉 [**https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev**](https://script.google.com/a/macros/gsa.gov/s/AKfycbw_OpkC0kTkrhkwI8AipH7jTeZeJfUYS7Xcy9BstG8/dev)
2. In GSA Apps Script IDE (Deploy > Manage Deployments), point the Web app deployment to Version 2.
3. Test production endpoint: [`https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec`](https://script.google.com/a/macros/gsa.gov/s/AKfycbynxBS2OW5FFwx-UU4Y1D_BkjkA4JaAfQZFVvXmsb_-iuFatr1-wNDJ5VGYtsKq2T3r/exec).
