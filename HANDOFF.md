# Context Handoff Document

### OBJECTIVE

Decouple Day Planner from Pico CSS v2 on a dedicated experimental branch (`feat/modern-normalize`) without risking `pure-gas-main`. Replace Pico's aggressive tag and attribute hijacking (`button`, `[role="button"]`, `<article>`) with `modern-normalize` and clean native CSS resets, ensuring 100% visual parity across both light (`#fcfbfa` parchment) and dark (`[data-theme="dark"]`) themes across all 5 binder views.

---

### KEY DECISIONS

- **Isolated Branching**: All `modern-normalize` work must happen on `feat/modern-normalize` branched off `pure-gas-main` at commit [`c957ba2`](file:///home/mike/projects/day-planner). `pure-gas-main` remains locked, verified, and untouched.
- **Light & Dark Mode Architecture Cost**: Near zero. Day Planner already owns and defines its complete dual-theme design system in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) via `[data-theme="dark"]` overrides and custom tokens (`--bg-parchment`, `--binder-teal`, `--border-line`, `--text-primary`, `--status-complete`). Pico CSS was only supplying generic fallback colors; dropping Pico requires zero extra thematic refactoring.
- **Zero-Opinion Baseline Over Classless Frameworks**: Classless libraries (Pico, Water.css, Sakura, MVP.css) apply opinionated padding, backgrounds, and box-shadows to raw HTML elements, causing bugs like the Tasks column star pill. `modern-normalize` (~1.5 kB) normalizes browser quirks (`box-sizing: border-box`, font inheritance, line-height 1.15) with zero visual opinions, making [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) the sole source of truth.
- **Why Not Pure.css**: Pure.css requires opt-in classes (`.pure-button`, `.pure-table`), which would require renaming dozens of classes across 1,000+ lines of Alpine.js templates for zero net benefit since Day Planner already has custom classes.
- **Star Toggle Semantic Button**: Commit [`c957ba2`](file:///home/mike/projects/day-planner) on `pure-gas-main` converted `.star-toggle` from a `<span>` to a semantic `<button type="button" class="star-toggle">` and stripped all button pill styling in [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css#L709-L747) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L710-L748). This foundation carries cleanly into `feat/modern-normalize`.
- **Target HOME Script**: Active `clasp` target remains [`gas-app/.clasp.json`](file:///home/mike/projects/day-planner/gas-app/.clasp.json#L2) targeting HOME script ID `1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W`.
- **Dual-Environment Invariant**: HOME is the mastercopy; WORK (`1980roEKgkC_...`) is promoted only via `npm run push:work`.

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main` (clean working tree).
- **Latest Commit**: [`c957ba2`](file:///home/mike/projects/day-planner) (`fix(ui): remove bulky button pill around star toggle in tasks column`).
- **Pre-Flight Verification**: Passed cleanly before handoff generation:
  - `npm run lint`: 0 errors.
  - `npm test`: 88/88 unit tests passing across 11 suites.
- **Live Deployment State**:
  - HOME: Version 170 (`@170`) on pinned production deployment `AKfycbzsxNOjkAa3WPA8nzlF28AJ8s4hDaTMWjPHnsfM4ZyRARME1e1sducanqZdrf6DJzKa0Q`.
  - WORK: Version 7 (`@7`) promoted via `npm run push:work`.

---

### CONSTRAINTS & PREFERENCES

1. **Conciseness & Directness**: Default to short, direct answers. Short is much more important than grammar. Drop opening pleasantries and wrap-up summaries. Lead with the answer, provide code and detail only when needed, and stop immediately when done.
2. **Salutation**: Start every reply with `⚡Mike:`.
3. **Clickable Links**: All file paths and code symbols MUST use clickable markdown links with `file://` scheme.
4. **No PR Theater**: Direct commits on working branch.
5. **Design System Constraints**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly **no pills** ([`.agents/rules/no-pills.md`](file:///home/mike/projects/day-planner/.agents/rules/no-pills.md)).
6. **Date Math**: Pure local year/month/day date arithmetic (`new Date(y, m - 1, d + delta)`), never `.toISOString()` on local dates to prevent UTC day-shift bugs.
7. **HtmlService Silent Truncation Bug Prevention**: Apps Script's `HtmlService.createHtmlOutputFromFile().getContent()` silently truncates served lines at literal `//` inside strings and apostrophes in comments. Protocol URLs must ALWAYS be split (`'https:' + '/' + '/...'`), and comment prose must use typographic `’` ([`.agents/rules/gas-html-safe-chars.md`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md)). Guarded by `npm run check:gas-safe-chars`.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Create and Checkout Branch `feat/modern-normalize`**:
   - Branch out from current commit [`c957ba2`](file:///home/mike/projects/day-planner) on `pure-gas-main`.
   - Command: `git checkout -b feat/modern-normalize`.
   - Invariant: `pure-gas-main` remains intact and unaffected.

2. **Replace Pico CSS with `modern-normalize` & Baseline Styles**:
   - In [`src/styles.css#L1`](file:///home/mike/projects/day-planner/src/styles.css#L1) and [`gas-app/Styles.html#L2`](file:///home/mike/projects/day-planner/gas-app/Styles.html#L2), replace `@import url('https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css');` with `@import url('https://cdn.jsdelivr.net/npm/modern-normalize@3.0.1/modern-normalize.min.css');`.
   - Add baseline unopinionated form rules (`input`, `select`, `textarea`, `a`) for default borders, padding, and focus rings.
   - Refactor the 39 occurrences of `--pico-*` variables across [`src/styles.css`](file:///home/mike/projects/day-planner/src/styles.css) and [`gas-app/Styles.html`](file:///home/mike/projects/day-planner/gas-app/Styles.html) to native Franklin Covey tokens (`--binder-teal`, `--bg-parchment`, font stacks).

3. **Verify Light & Dark Mode Parity Across All 5 Views**:
   - Inspect all 5 views (Daily Binder, Monthly Calendar, Master Tasks, Monthly Index, Future Planning Matrix) in both light mode (`#fcfbfa` parchment) and dark mode (`[data-theme="dark"]`).
   - Confirm Universal Search (`Ctrl+K`), notes popovers, and status dropdowns render with 100% fidelity.
   - Run `npm run lint` and `npm test`.

---

### IMMEDIATE NEXT STEP

Create and switch to the new feature branch:
```bash
git checkout -b feat/modern-normalize
```
*(Pre-flight verification `npm run lint && npm test` already passed cleanly with 88/88 tests passing before this handoff).*
