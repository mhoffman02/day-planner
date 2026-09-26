/**
 * @file smoke-test.js
 * @description Automated headless Chrome CDP smoke test for Day Planner.
 * Verifies all 5 active views, Universal Search modal, theme toggle, and error-free execution.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_PORT = process.env.CHROME_PORT ? parseInt(process.env.CHROME_PORT, 10) : 9225;
const TARGET_URL = 'http://localhost:3000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDebuggerUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
      if (res.ok) {
        const data = await res.json();
        const page = data.find(p => p.type === 'page' && p.url.includes('localhost:3000'));
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Chrome starting up
    }
    await wait(200);
  }
  throw new Error('Failed to obtain WebSocket debugger URL from Chrome');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.errors = [];

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.exceptionThrown') {
          const exc = msg.params.exceptionDetails;
          this.errors.push(`Uncaught Exception: ${exc.exception?.description || exc.text} at ${exc.url || 'eval'}:${exc.lineNumber}`);
        } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
          this.errors.push(`Console Error: ${msg.params.entry.text}`);
        }
      }
    };
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Eval error: ${desc} (${expression})`);
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function runSmokeTest() {
  console.log('🚀 Starting headless Chrome for smoke testing...');
  const tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'day-planner-smoke-'));
  const chromeProcess = spawn('google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    `--user-data-dir=${tmpProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    TARGET_URL
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try {
      chromeProcess.kill();
    } catch {
      // Process already terminated
    }
    try {
      fs.rmSync(tmpProfileDir, { recursive: true, force: true });
    } catch {
      // Temp dir cleanup
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    const wsUrl = await getDebuggerUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.ready();

    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    console.log('⏳ Waiting for Alpine app initialization...');
    let alpineReady = false;
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.eval('Boolean(window.Alpine && document.querySelector("[x-data]")?._x_dataStack)');
      if (ready) {
        alpineReady = true;
        break;
      }
      await wait(150);
    }

    if (!alpineReady) {
      throw new Error('Alpine app failed to initialize on localhost:3000 within 6s');
    }
    console.log('✔ Alpine initialized successfully');

    // Helper to get Alpine root data
    const getAppProp = (expr) => cdp.eval(`document.querySelector("[x-data]")._x_dataStack[0].${expr}`);
    const setAppMethod = (expr) => cdp.eval(`document.querySelector("[x-data]")._x_dataStack[0].${expr}`);

    // TEST 1: Daily 3-Column View
    console.log('\n--- 1. Testing Daily 3-Column View ---');
    const initialView = await getAppProp('activeView');
    console.log(`  Initial activeView: "${initialView}"`);
    if (initialView !== 'daily') throw new Error(`Expected activeView to be daily, got ${initialView}`);

    const scheduleVisible = await cdp.eval('Boolean(document.querySelector(".schedule-column, .schedule-panel, [x-show*=\'daily\']"))');
    const tasksCount = await cdp.eval('document.querySelector("[x-data]")._x_dataStack[0].dailyTasks?.length || 0');
    const notesLength = await cdp.eval('document.querySelector("[x-data]")._x_dataStack[0].dailyNote?.length || 0');
    console.log(`  Schedule visible: ${scheduleVisible}, Daily tasks loaded: ${tasksCount}, Note text length: ${notesLength}`);

    // TEST 2: Month Calendar View
    console.log('\n--- 2. Testing Month Calendar View ---');
    await setAppMethod('setView("monthly-calendar")');
    await wait(200);
    const monthViewActive = await getAppProp('activeView');
    const monthlyGridRows = await getAppProp('monthlyGrid?.length || 0');
    const hasWeekdayHeader = await cdp.eval('Boolean(document.querySelector(".monthly-weekday-header-row"))');
    const hasEventsScrollContainer = await cdp.eval('Boolean(document.querySelector(".calendar-day-events"))');
    console.log(`  activeView: "${monthViewActive}", Monthly grid cells: ${monthlyGridRows}, Weekday header: ${hasWeekdayHeader}, Day scroll container: ${hasEventsScrollContainer}`);
    if (monthViewActive !== 'monthly-calendar' || monthlyGridRows === 0) {
      throw new Error(`Failed to activate monthly-calendar view properly (grid cells: ${monthlyGridRows})`);
    }
    if (!hasWeekdayHeader || !hasEventsScrollContainer) {
      throw new Error('Monthly calendar missing weekday header or day scroll container');
    }

    // TEST 3: Master Tasks View
    console.log('\n--- 3. Testing Master Tasks View & Status Filters ---');
    await setAppMethod('setView("master-tasks")');
    await wait(200);
    const masterViewActive = await getAppProp('activeView');
    const masterTasksCount = await getAppProp('masterTasks?.length || 0');
    const hasFilterGroup = await cdp.eval('Boolean(document.querySelector(".task-filter-stamp-group"))');
    console.log(`  activeView: "${masterViewActive}", Master tasks: ${masterTasksCount}, Filter group: ${hasFilterGroup}`);
    if (masterViewActive !== 'master-tasks') {
      throw new Error('Failed to activate master-tasks view');
    }
    if (!hasFilterGroup) {
      throw new Error('Master Tasks missing status filter stamp group');
    }

    // Test toggle filter to '•' only
    await setAppMethod('masterTaskStatusFilter = ["•"]');
    await wait(100);
    const filteredCount = await getAppProp('filteredMasterTasks?.length');
    console.log(`  Filtered master tasks with [•] only: ${filteredCount}`);

    // Reset filter to All
    await setAppMethod('toggleAllMasterTaskStatusFilters()');
    await wait(100);
    const resetCount = await getAppProp('filteredMasterTasks?.length');
    console.log(`  Reset master tasks with [All]: ${resetCount}`);
    if (resetCount !== masterTasksCount) {
      throw new Error(`Expected all master tasks (${masterTasksCount}) after reset, got ${resetCount}`);
    }

    // TEST 4: Monthly Index View
    console.log('\n--- 4. Testing Monthly Index View & Daily Page Jump ---');
    await setAppMethod('setView("monthly-index")');
    await wait(200);
    const indexViewActive = await getAppProp('activeView');
    const indexCount = await getAppProp('indexRecords?.length || 0');
    const hasJumpButton = await cdp.eval('Boolean(document.querySelector(".btn-jump-day"))');
    console.log(`  activeView: "${indexViewActive}", Index records: ${indexCount}, Has Jump to Day button: ${hasJumpButton}`);
    if (indexViewActive !== 'monthly-index') {
      throw new Error('Failed to activate monthly-index view');
    }
    if (!hasJumpButton) {
      throw new Error('Monthly Index missing .btn-jump-day navigation button');
    }

    // Test in-app navigation jump to daily page
    await cdp.eval('document.querySelector(".btn-jump-day").click()');
    await wait(250);
    const jumpedView = await getAppProp('activeView');
    console.log(`  Clicked "Jump to Day" -> activeView is now: "${jumpedView}"`);
    if (jumpedView !== 'daily') {
      throw new Error(`Expected activeView to be daily after Jump to Day click, got "${jumpedView}"`);
    }

    // TEST 5: Future Planning View
    console.log('\n--- 5. Testing Future Planning View ---');
    await setAppMethod('setView("future-matrix")');
    await wait(200);
    const futureViewActive = await getAppProp('activeView');
    const futureMatrixYear = await getAppProp('futureMatrixYear');
    const futureMonthsCount = await cdp.eval('Object.keys(document.querySelector("[x-data]")._x_dataStack[0].futureMatrix?.months || {}).length');
    console.log(`  activeView: "${futureViewActive}", Matrix Year: ${futureMatrixYear}, Months populated: ${futureMonthsCount}`);
    if (futureViewActive !== 'future-matrix' || futureMonthsCount < 12) {
      throw new Error(`Failed to activate future-matrix view (populated months: ${futureMonthsCount})`);
    }

    // TEST 6: Universal Search Modal
    console.log('\n--- 6. Testing Universal Search (Ctrl+K) ---');
    await setAppMethod('toggleSearchModal()');
    await wait(200);
    const searchModalOpen = await getAppProp('searchModalOpen');
    console.log(`  Search modal open: ${searchModalOpen}`);
    if (!searchModalOpen) throw new Error('Search modal failed to open');

    await cdp.eval(`(() => {
      const app = document.querySelector("[x-data]")._x_dataStack[0];
      app.searchQuery = "Meeting";
      app.runSearch();
    })()`);
    await wait(300);
    const searchResultsCount = await getAppProp('searchResults?.totalMatches || 0');
    console.log(`  Search results for "Meeting": ${searchResultsCount} items found`);

    await setAppMethod('closeSearchModal()');
    await wait(150);
    const searchModalOpenAfter = await getAppProp('searchModalOpen');
    console.log(`  Search modal closed: ${!searchModalOpenAfter}`);
    if (searchModalOpenAfter) throw new Error('Search modal failed to close');

    // TEST 7: Daily Notes Hyperlink Modal & Drive Lookup
    console.log('\n--- 7. Testing Daily Notes Hyperlink Modal & Drive Lookup ---');
    await cdp.eval(`(() => {
      const app = document.querySelector("[x-data]")._x_dataStack[0];
      const card = app.noteCards?.[0];
      if (card) {
        app.openLinkModal(card, 0);
      }
    })()`);
    await wait(150);
    const linkModalOpen = await getAppProp('linkModalOpen');
    console.log(`  Link modal open: ${linkModalOpen}`);
    if (!linkModalOpen) throw new Error('Link modal failed to open');

    await cdp.eval(`(() => {
      const app = document.querySelector("[x-data]")._x_dataStack[0];
      app.linkModalUrl = 'https://docs.google.com/document/d/mock123/edit';
      app.handleLinkUrlInput();
    })()`);
    await wait(250);
    const detectedDrive = await getAppProp('linkModalDetectedDrive');
    const resolvedTitle = await getAppProp('linkModalText');
    console.log(`  Drive detected: ${detectedDrive}, Resolved Link Text: "${resolvedTitle}"`);
    if (!detectedDrive || resolvedTitle !== 'Executive Briefing Doc') {
      throw new Error(`Drive lookup failed to set link text (got "${resolvedTitle}")`);
    }

    await setAppMethod('closeLinkModal()');
    await wait(100);
    const linkModalOpenAfter = await getAppProp('linkModalOpen');
    console.log(`  Link modal closed: ${!linkModalOpenAfter}`);
    if (linkModalOpenAfter) throw new Error('Link modal failed to close');

    // TEST 8: Theme Toggle
    console.log('\n--- 8. Testing Theme Toggle ---');
    const initialTheme = await cdp.eval('document.documentElement.getAttribute("data-theme")');
    await setAppMethod('toggleTheme()');
    await wait(100);
    const toggledTheme = await cdp.eval('document.documentElement.getAttribute("data-theme")');
    console.log(`  Theme toggle: "${initialTheme}" -> "${toggledTheme}"`);
    if (initialTheme === toggledTheme) {
      throw new Error(`Theme toggle did not change attribute: ${initialTheme}`);
    }
    // Toggle back
    await setAppMethod('toggleTheme()');

    // Return to Daily view
    await setAppMethod('setView("daily")');
    await wait(200);

    // Verify error log
    console.log('\n--- 9. Checking Console & Runtime Errors ---');
    if (cdp.errors.length > 0) {
      console.error('❌ Errors detected during smoke test:');
      cdp.errors.forEach(e => console.error('  ', e));
      throw new Error(`Smoke test failed with ${cdp.errors.length} error(s)`);
    } else {
      console.log('✔ Zero console or unhandled runtime exceptions detected');
    }

    console.log('\n=========================================');
    console.log('✅ ALL SMOKE TESTS PASSED CLEANLY');
    console.log('=========================================');
    cdp.close();
    chromeProcess.kill();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Smoke test failed:', err);
    cleanup();
    process.exit(1);
  }
}

runSmokeTest();
