/**
 * @file tools/ensure-chrome.js
 * @description Cross-platform Chrome launcher & CDP session manager for Day Planner.
 * Adapted from maximo-uat/tools/ensure-chrome.js for WSL2 / Git Bash / native Linux.
 * Targets the canonical @HEAD /dev URL for Apps Script development and self-testing.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.CDP_PORT || '9222';
const DEV_SELF_TEST_URL = 'https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test';

function isWSL2() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

function findChromeExe(wsl2) {
  let candidates;
  if (wsl2) {
    candidates = [
      process.env.CHROME_PATH,
      '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ];
  } else if (process.platform === 'win32') {
    candidates = [
      process.env.CHROME_PATH,
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
  } else {
    candidates = [
      process.env.CHROME_PATH,
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/snap/bin/chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ];
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

async function isCdpAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(port, maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isCdpAlive(port)) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function getWindowsUsername() {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync('powershell.exe -NoProfile -Command "[System.Environment]::UserName"', { encoding: 'utf8' });
    return out.trim() || null;
  } catch {
    return null;
  }
}

export async function ensureChrome(targetUrl = DEV_SELF_TEST_URL) {
  console.log(`[ensure-chrome] Checking CDP on port ${PORT}...`);
  const wsl2 = isWSL2();
  const isWindows = process.platform === 'win32';

  if (await isCdpAlive(PORT)) {
    console.log(`[ensure-chrome] ✅ Chrome is already running with CDP on port ${PORT}.`);
    // Ensure tab exists
    try {
      const tabsRes = await fetch(`http://127.0.0.1:${PORT}/json`);
      const tabs = await tabsRes.json();
      const existingTab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('script.google.com'));
      if (!existingTab) {
        console.log(`[ensure-chrome] Opening target URL in new tab: ${targetUrl}`);
        await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(targetUrl)}`);
      } else {
        console.log(`[ensure-chrome] Found existing tab: ${existingTab.title || existingTab.url}`);
      }
    } catch (e) {
      console.warn(`[ensure-chrome] Warning checking tabs: ${e.message}`);
    }
    return { port: PORT, launched: false };
  }

  console.log('[ensure-chrome] CDP not active. Launching Chrome...');
  const chromePath = findChromeExe(wsl2);
  if (!chromePath) {
    throw new Error('Chrome executable not found on system.');
  }

  let profileDir;
  let profileDirPosix;
  if (wsl2) {
    const winUser = await getWindowsUsername() || 'default';
    profileDir = `C:\\Users\\${winUser}\\AppData\\Local\\Temp\\chrome-dayplanner-debug-${PORT}`;
    profileDirPosix = `/mnt/c/Users/${winUser}/AppData/Local/Temp/chrome-dayplanner-debug-${PORT}`;
  } else if (isWindows) {
    profileDir = path.join(os.tmpdir(), `chrome-dayplanner-debug-${PORT}`);
    profileDirPosix = profileDir;
  } else {
    profileDir = path.join(os.homedir(), '.cache', `chrome-dayplanner-debug-${PORT}`);
    profileDirPosix = profileDir;
  }

  fs.mkdirSync(profileDirPosix, { recursive: true });

  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    targetUrl
  ];

  console.log(`[ensure-chrome] Spawning ${chromePath} on port ${PORT}...`);
  const proc = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  proc.unref();

  console.log('[ensure-chrome] Waiting for CDP endpoint to respond...');
  const ready = await waitForCdp(PORT, 12);
  if (!ready) {
    throw new Error(`Chrome launched on port ${PORT} but CDP did not respond within timeout.`);
  }

  console.log(`[ensure-chrome] ✅ Chrome CDP ready on port ${PORT}`);
  return { port: PORT, launched: true };
}

// CLI direct run
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || DEV_SELF_TEST_URL;
  ensureChrome(target)
    .then(res => {
      console.log(`[ensure-chrome] Ready on port ${res.port}`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`[ensure-chrome] ❌ Error: ${err.message}`);
      process.exit(1);
    });
}
