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
- **Dev Deployment Workflow**: Code pushed to dev `@HEAD` deployment via `clasp push`. Production redeployment held until live UAT is completed.

---

### CURRENT STATE

- **Repository**: Branch `pure-gas-main` at commit [`3e9076a`](https://github.com/mhoffman02/day-planner/commit/3e9076a).
- **Test & Lint Status**: 0 lint errors (`npm run lint`), 88/88 unit tests passing across 11 suites (`npm test`), automated smoke test suite passing (`npm run smoke`), accessibility/contrast/responsive audit passing (`npm run audit:a11y`).
- **Phase 1-5 Complete**:
  - Baseline established, documentation backported, PWA/SW removed, standalone meta tags added, all 6 features backported.
  - Built automated headless Chrome CDP smoke test suite ([`tools/smoke-test.js`](file:///home/mike/projects/day-planner/tools/smoke-test.js)), verifying all 5 views, search modal (`Ctrl+K`), and theme toggle with 0 runtime errors (commit [`2a43cc9`](https://github.com/mhoffman02/day-planner/commit/2a43cc9)).
  - Built automated WCAG 2.1 AA/AAA contrast and responsive viewport suite ([`tools/audit-wcag-responsive.js`](file:///home/mike/projects/day-planner/tools/audit-wcag-responsive.js)), confirming full AA/AAA compliance and zero horizontal overflow down to 768px (commit [`3e9076a`](https://github.com/mhoffman02/day-planner/commit/3e9076a)).
  - Completed Phase 5 clasp development deployment (`clasp push`), pushing all 8 files into `@HEAD` (`AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil`). Diagnostic endpoint verified at `/dev?view=self-test`.

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

1. **Live Workspace UAT on Web App Dev Endpoint**:
   - Open dev web app endpoint ([`https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev)) in personal Google account (HOME).
   - Run `/self-test` diagnostic endpoint ([`https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test)) to confirm live Drive, Tasks, and Calendar service connections.
   - Verify Day Planner folder auto-creation and bidirectional sync across both HOME and locked-down federal WORK PCs.
2. **Production Release Deployment (`clasp deploy`)**:
   - After live UAT sign-off, redeploy production deployment `AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4` via `clasp deploy -i AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4 -d "Pure GAS v1.0 release"`.
   - Tag git repository with release version tag (e.g. `v1.0-pure-gas`).
3. **Desktop Shortcut Verification ("Open as Window")**:
   - Follow installation guide in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html) on Chrome and Edge.
   - Verify standalone window title bar, icon resolution, and persistent authentication across restarts.

---

### IMMEDIATE NEXT STEP

Open the live dev web app self-test endpoint ([`https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test`](https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test)) in browser to execute the self-test diagnostics suite against live Google Workspace services.
