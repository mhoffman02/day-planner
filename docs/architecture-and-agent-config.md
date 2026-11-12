# Architecture & Agent Configuration

Moved out of CLAUDE.md (2026-11-12) to cut per-request tokens. Read on demand.

## 1. Architecture & Deployment Model

The **Google Digital Day Planner** is a single-page digital binder application bridging Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive, Docs) via full 2-way synchronization.

- **Pure Google Apps Script (GAS) Web App**: 100% natively hosted on Google Apps Script (`script.google.com`) and deployed via `clasp`.
- **Zero Service Worker & Zero GIS OAuth**: No `sw.js`, no GitHub Pages hosting, and no client-side Google Identity Services (GIS) token management. Authentication is first-party Workspace authentication (`Session.getActiveUser().getEmail()`).
- **Dual Execution Environments**:
  1. **Local Preview Mode**: [`server.js`](file:///home/mike/projects/day-planner/server.js) serves root [`index.html`](file:///home/mike/projects/day-planner/index.html), [`src/`](file:///home/mike/projects/day-planner/src/), [`icons/`](file:///home/mike/projects/day-planner/icons/), and [`manifest.json`](file:///home/mike/projects/day-planner/manifest.json) at `http://localhost:3000`. [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) supplies simulated mock data.
  2. **Production GAS Web App**: [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) evaluates [`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) with embedded components, calling native Google Apps Script services (`CalendarApp`, `Tasks`, `DriveApp`, `DocumentApp`).
- **Standalone PWA Affordances**: Web App Manifest ([`manifest.json`](file:///home/mike/projects/day-planner/manifest.json)), high-resolution icons ([`icons/icon.svg`](file:///home/mike/projects/day-planner/icons/icon.svg), [`icons/apple-touch-icon.png`](file:///home/mike/projects/day-planner/icons/apple-touch-icon.png)), standalone mobile meta tags, and desktop "Open as Window" shortcut guidance in [`gas-app/About.html`](file:///home/mike/projects/day-planner/gas-app/About.html).

---

## 2. Agent Configuration & Cross-CLI Protocol

- **Single Source of Truth**: Hand-edit configs strictly inside [`.agents/`](file:///home/mike/projects/day-planner/.agents/) (`rules/`, `commands/`, `skills/`). Never edit [`.claude/`](file:///home/mike/projects/day-planner/.claude/) or [`.kilo/`](file:///home/mike/projects/day-planner/.kilo/) directly.
- **Mirror Sync**: Run `npm run sync:agents` to regenerate tracked real-file mirrors. Pre-commit hooks enforce `npm run sync:agents:check`.
- **Dual-CLI Headless Protocol** ([`.agents/rules/cross-cli-headless-invocation.md`](file:///home/mike/projects/day-planner/.agents/rules/cross-cli-headless-invocation.md)):
  - From Claude to Antigravity: `agy -p "<task>" --dangerously-skip-permissions` (via `/consult-agy`).
  - From Antigravity to Claude: `claude --safe-mode -p "<task>" --permission-mode acceptEdits --allowedTools "<tools>" --add-dir <root>` (via `/consult-claude`).
  - Rely on local user subscription logins without external API keys.
