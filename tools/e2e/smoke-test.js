/**
 * @file tools/e2e/smoke-test.js
 * @description Loads a URL in the already-running debug Chrome (see tools/ensure-chrome.js),
 * confirms the Alpine app mounted, reports any console errors, and saves a screenshot. Works
 * against the local dev server (no auth) or the live GitHub Pages deployment (once you've signed
 * into Google once in that Chrome profile).
 *
 * Usage:
 *   node tools/ensure-chrome.js [url]     # once, to launch/attach Chrome
 *   node tools/e2e/smoke-test.js [url] [--out=path.png] [--port=9222]
 */

import path from 'node:path';
import { connectCdp } from './cdp-client.js';

const DEFAULT_URL = 'http://localhost:3000';

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
  const bodyHasLoginForm = await client.evaluate(
    '!!document.querySelector(\'input[type="password"], input[type="email"]\')'
  );

  // Distinguishes the states this app can actually be in, rather than a single boolean —
  // `[x-cloak]` only exists on the real planner template's `.binder-container`; the shell
  // loader's connector/setup screen has no Alpine markup at all, so "no [x-cloak] left" was a
  // vacuous false positive there.
  const state = await client.evaluate(`(() => {
    const d = document;
    if (d.querySelector('#shell-setup-form')) return 'shell-setup-screen';
    if (d.querySelector('#shell-skeleton')) return 'shell-loading-skeleton';
    if (d.querySelector('.binder-container[x-cloak]')) return 'planner-cloaked';
    if (d.querySelector('.binder-container')) return 'planner-mounted';
    return 'unknown';
  })()`);

  const errors = client.getConsoleMessages().filter((m) => m.type === 'error');

  await client.screenshot(out);
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
    console.log('[smoke-test] Shell has no cached bundle configured — not a failure, but not the planner UI either.');
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
