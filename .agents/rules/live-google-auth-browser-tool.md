# Use `ensure-chrome`/`tools/e2e` for Any Browser Check That Needs Google Sign-In

## The rule

Any time a browser check will hit a real Google sign-in flow — a live GAS
`/dev`/`/exec` deployment, or any other page that requires an authenticated
Google session — you **must** drive it with
`node tools/ensure-chrome.js [url]` + `tools/e2e/*` (`cdp-client.js`,
`smoke-test.js`), never a generic browser-automation tool
(`mcp__chrome-devtools__*` or any Puppeteer/Playwright-style `launch()`).

Generic automation tools set `--enable-automation` / leave
`navigator.webdriver` true, which is exactly what trips Google's "This
browser or app may not be secure" sign-in block. `tools/ensure-chrome.js`
launches a plain, non-headless `chrome.exe` with a CDP debug port and a
persistent profile instead — deliberately not `launch()` — so a human can log
in manually once and the session persists across runs without tripping the
block. See `CLAUDE.md`'s "E2E / live-browser driver" section for the full
mechanics (frame nesting, `smoke-test.js`, etc.).

**No local-dev/mock-mode exception.** An earlier version of this rule carved
out `http://localhost:3000` mock mode as safe for generic tools, on the theory
that mock mode never hits a real sign-in flow. That's false in practice: the
underlying browser instance a generic tool attaches to can carry real Google
session state from unrelated prior work, and `googleAuth.js`'s GIS init can
still attempt a background/silent sign-in against that state — which trips
the same automation block via an unexpected new tab, even though the page
itself never asked for one (confirmed 2026-09-05: a plain reload of
`localhost:3000` in `mcp__chrome-devtools__*` spawned an unrequested
`accounts.google.com` tab that hit "This browser or app may not be secure").
Use `ensure-chrome.js` + `tools/e2e/*` for **every** day-planner browser
check, full stop — there is no page in this app for which the generic tool is
the right choice.

## Why

This has tripped repeatedly: generic automation against a live-GAS or other
Google-authenticated page reliably hits Google's automation block instead of
reaching the sign-in form, wasting a round trip every time. The fix isn't
"try harder to get the generic tool to work" — it's "use the tool built for
this," since `tools/ensure-chrome.js` exists specifically because it doesn't
trip the block.

## How to apply

- Before opening any browser automation against a URL, ask: will this page's
  flow require a live Google sign-in (live GAS deployment, any
  Google-authenticated page)? If yes, use `ensure-chrome.js` + `tools/e2e/*`
  from the start — don't attempt a generic tool first and fall back only
  after it fails.
- If a generic browser tool is already open and the check turns out to need
  Google auth partway through (e.g. a "Sign in" flow appears unexpectedly),
  stop and switch to `ensure-chrome.js` rather than trying to push the
  generic tool through the block.
