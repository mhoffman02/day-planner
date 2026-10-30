# 0001 Stay a pure Google Apps Script web app

**Status:** Accepted 2026-09-09 (reverses the GAS-removal / static-client migration started 2026-08).

**Context:** A static client (GitHub Pages + Google Identity Services tokens + service worker) gives offline
use and installability. On the WORK network (GSA Workspace) only first-party Google hosting reliably reaches
Calendar, Tasks and Drive; client-side OAuth hits org API controls.

**Decision:** The app is served by HtmlService from `gas-app/`, authenticated as the signed-in Workspace
user. No service worker, no GIS tokens. `server.js` + `src/gasBridge.js` give a local mock preview only.

**Consequences:** No offline mode and no true PWA install (GAS pages cannot register a service worker).
Every server call costs ~3 s cold. HtmlService quirks (truncation on `//` in strings, HTML comment markers
in Script.html) become our problem; see the safe-chars lint and [0006](0006-live-deploy-gate.md).
