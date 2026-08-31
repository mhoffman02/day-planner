/**
 * @file tools/e2e/smoke-test.js
 * @description Loads a URL in the already-running debug Chrome (see tools/ensure-chrome.js),
 * confirms the Alpine app mounted, reports any console errors, and saves a screenshot. Works
 * against the local dev server (no auth) or a live GAS `/dev`/`/exec` URL (once you've logged in
 * once in that Chrome profile).
 *
 * A GAS `/dev`/`/exec` page is a wrapper two frames deep: `script.google.com` embeds a
 * `*.googleusercontent.com` `userCodeAppPanel` document, which Chrome exposes as its own CDP
 * target (`type: 'iframe'` in /json/list) — but the actual `HtmlService` app markup isn't in
 * that document either. It's inside `#userHtmlFrame`, a same-origin child iframe of *that*
 * document (`src` ends up `/blank`, content is written in via `document.write`), which does NOT
 * get its own CDP target. So DOM checks reach it via
 * `document.getElementById('userHtmlFrame').contentDocument` from the `iframe`-type target's
 * execution context, not via a third CDP connection. This script detects a `script.google.com`
 * host, waits for the `userCodeAppPanel` iframe target, then queries through `#userHtmlFrame`
 * from there — retrying because the first real GAS render is often slow (observed several
 * seconds, not the ~1.5s a normal page needs).
 *
 * Usage:
 *   node tools/ensure-chrome.js [url]     # once, to launch/attach Chrome
 *   node tools/e2e/smoke-test.js [url] [--out=path.png] [--port=9222]
 */

import path from 'node:path';
import { connectCdp } from './cdp-client.js';

const DEFAULT_URL = 'http://localhost:3000';

async function waitForContentIframe(port, attempts = 10, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await connectCdp({ port, type: 'iframe', urlContains: 'googleusercontent.com' });
    } catch {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const outArg = args.find((a) => a.startsWith('--out='));
  const port = portArg ? Number(portArg.split('=')[1]) : Number(process.env.CHROME_CDP_PORT || 9222);
  const url = args.find((a) => !a.startsWith('--')) || DEFAULT_URL;
  const out = outArg ? outArg.split('=')[1] : path.resolve(process.cwd(), 'smoke-test.png');

  const client = await connectCdp({ port });
  console.log(`[smoke-test] Attached to tab: ${client.target.url}`);
  console.log(`[smoke-test] Navigating to ${url}...`);
  await client.navigate(url, 2500);

  const title = await client.evaluate('document.title');
  const topLoginForm = await client.evaluate(
    '!!document.querySelector(\'input[type="password"], input[type="email"]\')'
  );

  let contentClient = client;
  const isGasHost = new URL(url).hostname === 'script.google.com';
  if (isGasHost) {
    console.log('[smoke-test] GAS host — waiting for the content iframe target (this is often slow)...');
    const iframeClient = await waitForContentIframe(port);
    if (iframeClient) {
      contentClient = iframeClient;
      console.log(`[smoke-test] Attached to content iframe: ${contentClient.target.url}`);
      await new Promise((r) => setTimeout(r, 2000)); // let the iframe's own Alpine finish mounting
    } else {
      console.log('[smoke-test] No content iframe appeared in time — state check will run against the outer wrapper page (likely inaccurate).');
    }
  }

  // Distinguishes the states this app can actually be in, rather than a single boolean —
  // `[x-cloak]` only exists on the real planner template (gas-app/Index.html's
  // `.binder-container`); the local shellLoader.js connector/setup screen has no Alpine
  // markup at all, so "no [x-cloak] left" was a vacuous false positive there.
  // GAS_DOC resolves to #userHtmlFrame's contentDocument when present (the real app frame,
  // reached from the userCodeAppPanel iframe target), else falls back to `document` for local dev.
  const GAS_DOC = "(document.getElementById('userHtmlFrame') && document.getElementById('userHtmlFrame').contentDocument) || document";
  const state = await contentClient.evaluate(`(() => {
    const d = ${GAS_DOC};
    if (d.querySelector('#shell-setup-form')) return 'shell-setup-screen';
    if (d.querySelector('#shell-skeleton')) return 'shell-loading-skeleton';
    if (d.querySelector('.binder-container[x-cloak]')) return 'planner-cloaked';
    if (d.querySelector('.binder-container')) return 'planner-mounted';
    return 'unknown';
  })()`);
  const bodyHasLoginForm = topLoginForm || (contentClient !== client && await contentClient.evaluate(
    `!!(${GAS_DOC}).querySelector('input[type="password"], input[type="email"]')`
  ));

  const errors = [
    ...client.getConsoleMessages(),
    ...(contentClient !== client ? contentClient.getConsoleMessages() : []),
  ].filter((m) => m.type === 'error');

  await client.screenshot(out);
  if (contentClient !== client) contentClient.close();
  client.close();

  console.log(`[smoke-test] Title: ${title}`);
  console.log(`[smoke-test] Page state: ${state}`);
  console.log(`[smoke-test] Login form present: ${bodyHasLoginForm}`);
  console.log(`[smoke-test] Console errors: ${errors.length}`);
  for (const e of errors) console.log(`  [error] ${e.text}`);
  console.log(`[smoke-test] Screenshot saved: ${out}`);

  if (bodyHasLoginForm) {
    console.log('[smoke-test] Blocked on a login form — log in manually in that Chrome window, then re-run.');
    process.exitCode = 2;
    return;
  }
  if (state === 'shell-setup-screen') {
    console.log('[smoke-test] Shell has no cached bundle / no GAS URL configured — not a failure, but not the planner UI either.');
    console.log('[smoke-test] Fill in the GAS URL in that Chrome window (or pass a ?gasUrl=... / gas-app /dev URL directly), then re-run.');
    process.exitCode = 2;
    return;
  }
  if (state !== 'planner-mounted') {
    console.error(`[smoke-test] FAIL: planner did not mount (state: ${state}).`);
    process.exitCode = 1;
    return;
  }
  if (errors.length > 0) {
    console.error('[smoke-test] FAIL: console errors present.');
    process.exitCode = 1;
    return;
  }
  console.log('[smoke-test] PASS');
}

main().catch((err) => {
  console.error('[smoke-test] Fatal:', err.stack);
  process.exitCode = 1;
});
