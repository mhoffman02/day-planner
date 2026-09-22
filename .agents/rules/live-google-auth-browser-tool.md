# Use `ensure-chrome`/`tools/e2e` for Any Browser Check

- MUST drive every day-planner browser check — including `localhost:3000` mock mode — with `node tools/ensure-chrome.js [url]` + `tools/e2e/*` (`cdp-client.js`, `smoke-test.js`).
- MUST NOT use a generic browser-automation tool (`mcp__chrome-devtools__*`, or any Puppeteer/Playwright-style `launch()`) for any day-planner page, mock mode included. No exception exists.
- If a generic browser tool is already open and Google auth appears unexpectedly mid-check: MUST stop and switch to `ensure-chrome.js` rather than pushing the generic tool through the block.

**Why:** generic tools set `--enable-automation`/`navigator.webdriver`, which trips Google's "This browser or app may not be secure" block. This isn't limited to pages that intentionally sign in — `googleAuth.js`'s GIS init can attempt a silent sign-in against carried-over session state even on a mock-mode page, tripping the same block via an unrequested tab (confirmed 2026-09-05). `tools/ensure-chrome.js` launches a plain, non-automated `chrome.exe` with a persistent profile instead; sign in manually once, it persists across runs. See `CLAUDE.md`'s "E2E / live-browser driver" section for mechanics.
