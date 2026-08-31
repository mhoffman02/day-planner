/**
 * @file tools/ensure-chrome.js
 * @description Launches (or reuses) a real, non-headless Chrome with a CDP debug port and a
 * persistent profile, then opens a target URL. Deliberately spawns a plain `chrome.exe` process
 * — never Puppeteer/Playwright's `launch()` — so Chrome never gets `--enable-automation` and
 * `navigator.webdriver` stays false. That flag is what Google's sign-in flow uses to block
 * automated browsers ("This browser or app may not be secure"); attaching after the fact via CDP
 * to a normally-launched Chrome, as this script does, avoids tripping it.
 *
 * Usage:
 *   node tools/ensure-chrome.js [url] [--port=9222]
 *
 * Log in manually (once) in the window this opens — the profile persists, so subsequent runs
 * reuse the session. Then drive it with tools/e2e/cdp-client.js (see tools/e2e/smoke-test.js for
 * an example) or attach directly to ws://localhost:<port>.
 */

import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

const DEFAULT_URL = 'http://localhost:3000';

function isWSL2() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

async function httpGetJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cdpAlive(port) {
  try {
    await httpGetJson(`http://localhost:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function waitForCdp(port, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await cdpAlive(port)) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function getWindowsUsername() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-Command', '[System.Environment]::UserName',
  ]);
  return stdout.trim();
}

function findChromeExe(wsl2) {
  const candidates = wsl2
    ? [
        process.env.CHROME_PATH,
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ]
    : [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

async function main() {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? portArg.split('=')[1] : (process.env.CHROME_CDP_PORT || '9222');
  const targetUrl = args.find((a) => !a.startsWith('--')) || DEFAULT_URL;

  console.log(`[ensure-chrome] Target URL: ${targetUrl}`);

  if (await cdpAlive(port)) {
    console.log(`[ensure-chrome] Chrome already running and responsive on port ${port}.`);
    const tabs = await httpGetJson(`http://localhost:${port}/json/list`);
    const targetOrigin = new URL(targetUrl).origin;
    const existing = tabs.find((t) => t.type === 'page' && t.url && t.url.startsWith(targetOrigin));
    if (existing) {
      console.log(`[ensure-chrome] Reusing existing tab: ${existing.url}`);
    } else {
      console.log(`[ensure-chrome] No matching tab — opening ${targetUrl}...`);
      await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' }).catch(() => {});
    }
    console.log('[ensure-chrome] If a Google sign-in page appears, log in manually — it only needs to happen once per profile.');
    return;
  }

  const wsl2 = isWSL2();
  const isWindows = !wsl2 && process.platform === 'win32';
  if (wsl2) console.log('[ensure-chrome] WSL2 detected — Chrome resolved via /mnt/c, launched as a native Windows process.');

  const chromePath = findChromeExe(wsl2 || isWindows);
  if (!chromePath) {
    console.error('[ensure-chrome] ERROR: No Chrome executable found. Set CHROME_PATH or install Chrome.');
    process.exitCode = 1;
    return;
  }

  let profileDir;
  let profileDirPosix;
  if (wsl2) {
    const winUser = await getWindowsUsername();
    profileDir = `C:\\Users\\${winUser}\\AppData\\Local\\Temp\\chrome-daily-planner-debug-${port}`;
    profileDirPosix = `/mnt/c/Users/${winUser}/AppData/Local/Temp/chrome-daily-planner-debug-${port}`;
  } else {
    profileDir = path.join(os.homedir(), '.cache', `chrome-daily-planner-debug-${port}`);
    profileDirPosix = profileDir;
  }
  fs.mkdirSync(profileDirPosix, { recursive: true });

  console.log(`[ensure-chrome] Launching ${path.basename(chromePath)} on port ${port}...`);
  console.log(`[ensure-chrome] Profile (persists login across runs): ${profileDir}`);

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--password-store=basic',
    targetUrl,
  ], { detached: true, stdio: 'ignore' });
  chrome.unref();

  const ready = await waitForCdp(port);
  if (!ready) {
    console.error(`[ensure-chrome] ERROR: Chrome launched but CDP not reachable on port ${port} after 15s.`);
    if (wsl2) {
      console.error('[ensure-chrome]   WSL2: verify from Windows side with:');
      console.error(`[ensure-chrome]   powershell.exe -Command "Invoke-WebRequest http://localhost:${port}/json/version -UseBasicParsing"`);
      console.error('[ensure-chrome]   If that works but this WSL2 fetch does not, check Windows Firewall / VPN interception of the WSL NAT interface.');
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[ensure-chrome] Chrome ready on port ${port}.`);
  console.log('[ensure-chrome] If a Google sign-in page appears, log in manually — the profile persists, so this is a one-time step.');
}

main().catch((err) => {
  console.error('[ensure-chrome] Fatal:', err.stack);
  process.exitCode = 1;
});
