#!/usr/bin/env node
/**
 * @file tools/deploy-home.js
 * @description Gated HOME deploy. Pushes gas-app to HOME @HEAD, loads the /dev app in a fresh Chrome
 * tab and probes it over CDP; only when the app initializes does "Day Planner v1" move to a new
 * version. Unit tests cannot see what HtmlService serves: on 2026-10-30 @337-@340 passed every test
 * yet never loaded (an HTML comment marker in Script.html), and the user found it, not us.
 *
 * Usage:
 *   npm run deploy:home               # push, live-check /dev, then deploy Day Planner v1
 *   npm run deploy:home -- --check    # push and live-check only; v1 is left alone
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureChrome } from './ensure-chrome.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAS_DIR = path.join(ROOT, 'gas-app');
const PORT = process.env.CDP_PORT || '9222';
const DEV_APP_URL = 'https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev';
const V1_DEPLOYMENT_ID = 'AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA';
const LOAD_TIMEOUT_MS = 90 * 1000;
const POLL_MS = 5000;

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status}): ${(res.stderr || res.stdout || '').trim()}`);
  }
  return res.stdout;
}

function probe(tabId) {
  const res = spawnSync('node', [path.join(ROOT, 'tools', 'probe-live.js'), '--json', '--target', tabId, '--tail', '3'],
    { cwd: ROOT, encoding: 'utf8' });
  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    console.error('probe-live output was not JSON; counting this poll as a failure:', err.stack);
    return { status: 'ERROR', diagnosis: (res.stdout || res.stderr || '').trim().slice(0, 300) };
  }
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  console.log('1/3 clasp push --force (HOME @HEAD)');
  run('npx', ['clasp', 'push', '--force'], GAS_DIR);

  console.log('2/3 live check of /dev in a fresh tab');
  await ensureChrome(DEV_APP_URL);
  const tabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(DEV_APP_URL)}`, { method: 'PUT' });
  if (!tabRes.ok) throw new Error(`Could not open a /dev tab over CDP (${tabRes.status} ${tabRes.statusText})`);
  const tab = await tabRes.json();

  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  let last = null;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const live = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      if (live.some((t) => t.type === 'page' && (t.url || '').startsWith('https://accounts.google.com/'))) {
        last = { status: 'FAIL', diagnosis: 'the CDP Chrome profile is not signed in to Google: sign in once in that Chrome window (it persists), then rerun' };
        break;
      }
      last = probe(tab.id);
      if (last.status === 'PASS') break;
    }
  } finally {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch((err) => {
      console.error(`Could not close the probe tab ${tab.id}; close it by hand:`, err.stack);
    });
  }

  if (!last || last.status !== 'PASS') {
    console.error(`❌ /dev did not load within ${LOAD_TIMEOUT_MS / 1000}s: ${last ? last.status + ' ' + last.diagnosis : 'no probe ran'}`);
    if (last && last.errors && last.errors.length) console.error(last.errors.slice(0, 5).join('\n'));
    console.error('Day Planner v1 was NOT moved. Fix the build, then rerun.');
    process.exit(1);
  }
  console.log(`✅ /dev loaded: ${last.diagnosis}`);

  if (checkOnly) {
    console.log('3/3 skipped (--check): Day Planner v1 left as is.');
    return;
  }
  console.log('3/3 clasp deploy Day Planner v1');
  console.log(run('npx', ['clasp', 'deploy', '-i', V1_DEPLOYMENT_ID, '-d', 'Day Planner v1'], GAS_DIR).trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('deploy:home failed; Day Planner v1 was not moved:', err.stack);
    process.exit(1);
  });
}
