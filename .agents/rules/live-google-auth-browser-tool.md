# Browser Checks: `ensure-chrome` + `tools/` CDP Only

- Every day-planner browser check, mock mode (`localhost:3000`) included: `node tools/ensure-chrome.js [url]` + `tools/` CDP scripts (`eval-console.js`, `read-console.js`, `probe-live.js`, `smoke-test.js`).
- Never `mcp__chrome-devtools__*`, Puppeteer/Playwright `launch()` or any generic browser tool. No exceptions.
- Generic tool already open and Google auth appears: stop, switch to `ensure-chrome.js`.

**Why:** generic tools set `--enable-automation`/`navigator.webdriver`, tripping Google's "browser may not be secure" block. `ensure-chrome` launches plain chrome with a persistent profile; sign in once.
