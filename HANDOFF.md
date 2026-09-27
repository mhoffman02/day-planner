# Context Handoff Document

**Start by:** Run `npm run probe` against the live HOME deployment, then start sizing startup performance — see IMMEDIATE NEXT STEP below. (The other open item, WORK PC dictation re-test, needs the user at a physical WORK machine — see OPEN THREADS #2.)

### OBJECTIVE

Deliver a pure Google Apps Script digital binder productivity app bridging Franklin Covey Day Planner methodology with Google Workspace APIs (Calendar, Tasks, Drive). Current focus: size whether a client-asset caching effort is worth it, get the gDoc dictation fallback re-tested on the WORK PC, and keep `PLAN.md`/`TODO.md` lean going forward.

---

### KEY DECISIONS

- **In-App STT Dictation + Google Doc Fallback ([`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs), [`src/app.js`](file:///home/mike/projects/day-planner/src/app.js), commits `eaf519a`..`ab67935`)**:
  - Added `webkitSpeechRecognition`/`SpeechRecognition` feature-detected mic affordance to note card lines and the event description field.
  - Confirmed live on WORK PC: mic blocked by an org-managed enterprise Chrome policy (per-origin allowlist covers `docs.google.com`, not this app's origin) — not user-fixable in browser settings.
  - Built a Google Doc dictation fallback, **redesigned mid-session from popup to link-based** after two live-confirmed findings: (1) Google Docs sends a CSP `frame-ancestors` header scoped to its own origin, so iframing it is impossible; (2) `window.open()` without explicit features opens a background tab, not a new OS window, so it was invisible on alt-tab — combined with WORK's popup blocking, this produced "nothing visible happened."
  - Final flow: mic failure auto-creates a scratch Google Doc and renders its URL as a real clickable `<a target="_blank">` link in-app. Verified end-to-end live on HOME `@234` (create → pull → body-clear, real Drive/Docs APIs, not mocked). Pushed to WORK (Version 63).
- **Build Number Display ([commits `0b4eb4d`, `ed54056`](file:///home/mike/projects/day-planner/gas-app/About.html))**: `DAY_PLANNER_BUILD_NUMBER` (git commit count) now shown in top-nav hover and the About page; run `npm run stamp-build` before real deploys.
- **PLAN.md / TODO.md Tracker Split (commit `8fa08de`)**: Completed phases moved out of `PLAN.md` into new [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md) (mirrors the existing `TODO.md`/`TODO_HISTORY.md` pattern), so both stay lean planning docs instead of growing changelogs. The `handoff` skill now archives completed `PLAN.md` phases at session end; `CLAUDE.md`'s session-startup rule self-heals the same archiving if a prior session skipped `/handoff`.
- **24 Unpushed Commits Caught & Pushed (this session)**: a prior session (ending at commit `75411ab`) never ran `/handoff` or pushed — `origin/pure-gas-main` was 24 commits behind. Reviewed the diffstat (no secrets, no odd binaries) and fast-forward pushed to `origin/pure-gas-main` (now `8fa08de`). Note: the `gsa` remote (`oO-Mike-Oo/day-planner`) 404s — repo not found there, unrelated, still unresolved.

---

### CURRENT STATE

- **Repository Branch**: `pure-gas-main`, pushed to `origin/pure-gas-main` at `8fa08de`. Working tree clean.
- **Pre-Flight Verification**: `npm run lint` — 0 errors. `npm test` — **152/152 passing** across 19 suites.
- **Live Deployment State**:
  - HOME: dictation fallback verified live end-to-end on `@234`.
  - WORK: Version 63 pushed via `npm run push:work`; **not yet re-tested live** by the user on the WORK PC.
- **Tracker Docs**: `PLAN.md` now lean (Phase 17 — startup perf sizing — is the only open phase); `PLAN-HISTORY.md` holds Phases 1-16; `TODO.md`/`TODO_HISTORY.md` unchanged in structure. `LEARNINGS.md` has a fresh dated entry for this session.

---

### CONSTRAINTS & PREFERENCES

1. **Salutation**: Start every reply with `🔋Mike:`.
2. **Conciseness & Directness**: Short, direct answers. Drop pleasantries and wrap-up summaries. Lead with the answer.
3. **No PR Theater**: Direct commits on `pure-gas-main`, push to `origin` directly — no branches/PRs unless explicitly requested.
4. **Clickable Links**: All file paths and code symbols MUST use `file://`-scheme markdown links.
5. **Debug Logging — Console Only**: No temporary UI elements for debugging; use `console.log`/`warn`/`error`/`info`.
6. **Design System**: Day Planner aesthetic — parchment cream `#fcfbfa`, forest teal `#2d6a5a`, serif headers, strictly no pills.
7. **Dual-Environment Isolation**: HOME (`mhoffman02@gmail.com`) is mastercopy; WORK (`michael.hoffman@gsa.gov`) is production-only, promoted via `npm run push:work`.
8. **Lean Tracker Docs (new this session)**: `PLAN.md`/`TODO.md` must stay lean — completed phases/items archive to `PLAN-HISTORY.md`/`TODO_HISTORY.md` via the `handoff` skill at session end, and self-heal at session start if a prior session skipped it.

---

### OPEN THREADS (THE 3 MOST IMPORTANT TASKS)

1. **Startup Perf Sizing (agent-startable)** ([`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) Phase 17, [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) item 3): Size how much of the ~5s total load is cacheable client-asset load vs. the ~2-3s uncacheable GAS spinup floor, then decide go/no-go on a caching effort. Offline resilience is explicitly not wanted.

2. **WORK PC Dictation Re-Test (user-blocked)** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) item 4): Ask the user to confirm on the WORK PC that the mic-blocked flow now shows a clickable "Open Dictation Doc" link (auto-created, no extra click) instead of a popup, and that pulling dictated text back works.

3. **`gsa` Remote 404 (needs user input)**: `git remote -v` shows `gsa` pointing at `https://github.com/oO-Mike-Oo/day-planner.git`, which returns "Repository not found." Ask the user whether that remote should be removed, re-pointed, or is just stale/unused.

---

### IMMEDIATE NEXT STEP

Run `npm run probe` to confirm HOME is still healthy, then start on Phase 17: measure the local dev server's asset-load time vs. total page-load time (e.g. via Chrome DevTools Network panel timings against `npm start`) to separate the cacheable client-asset portion from the ~2-3s GAS spinup floor.
