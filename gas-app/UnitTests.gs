/**
 * @file UnitTests.gs
 * @description Day Planner Server-Side Self-Test & Diagnostic Suite.
 * Runs an automated major systems & integration check to ensure system health and Google Workspace API connections.
 * All errors log detailed error message and err.stack using console.error for diagnostic clarity.
 *
 * Wrapped in a single IIFE (all .gs files in a project share one global scope) so only the
 * functions in the export list at the bottom are reachable from web-app clients
 * (`google.script.run`/`_runGasCall`), HtmlService templates, time-driven triggers (referenced
 * by name string), or the Apps Script IDE's manual-run dropdown. Everything else here is a
 * private helper invisible outside this file. `logError`, `getFolderByNameOrCreate`,
 * `getOrCreateDailyDocContent`, `DAY_PLANNER_FAVICON_URL`, `syncWorkspaceChanges`, and `doGet`
 * are Code.gs internals consumed here via its own export list -- see
 * .agents/rules/gas-namespace-iife.md before adding or removing an export.
 */
(function(global) {

/**
 * Runs automated self-test diagnostics across Drive, Tasks, Calendar, Docs, and Sync triggers.
 * @returns {{overallStatus: string, passedCount: number, totalTests: number, timestamp: string, results: Array<{test: string, status: string, details: string}>}} Diagnostic summary object.
 */
function runSelfTest() {
  var results = [];
  var passedCount = 0;
  var totalTests = 5;

  Logger.log('====================================================');
  Logger.log('  DAY PLANNER AUTOMATED SELF-TEST DIAGNOSTICS ');
  Logger.log('====================================================\n');

  // Test 1: Drive Root & Folder Hierarchy Access
  try {
    var rootFolder = getFolderByNameOrCreate(null, 'Day Planner');
    var yearFolder = getFolderByNameOrCreate(rootFolder, new Date().getFullYear().toString());
    results.push({
      test: '1. Google Drive & Folder Hierarchy',
      status: 'PASS',
      details: 'Day Planner root folder ID: ' + rootFolder.getId() + ', year folder ID: ' + yearFolder.getId()
    });
    passedCount++;
  } catch (err1) {
    console.error('🔥 [Self-Test 1 Drive]: ' + err1.toString() + '\nStack: ' + (err1.stack || 'N/A'));
    results.push({
      test: '1. Google Drive & Folder Hierarchy',
      status: 'FAIL',
      details: err1.toString() + ' | Stack: ' + (err1.stack || 'N/A')
    });
  }

  // Test 2: Google Tasks API Connection
  try {
    if (typeof Tasks !== 'undefined') {
      var taskList = Tasks.Tasks.list('@default');
      results.push({
        test: '2. Google Tasks API (v1)',
        status: 'PASS',
        details: 'Connected to default task list. Item count: ' + (taskList.items ? taskList.items.length : 0)
      });
      passedCount++;
    } else {
      results.push({
        test: '2. Google Tasks API (v1)',
        status: 'FAIL',
        details: 'Tasks Advanced Service is not defined in manifest dependencies.'
      });
    }
  } catch (err2) {
    console.error('🔥 [Self-Test 2 Tasks]: ' + err2.toString() + '\nStack: ' + (err2.stack || 'N/A'));
    results.push({
      test: '2. Google Tasks API (v1)',
      status: 'FAIL',
      details: err2.toString() + ' | Stack: ' + (err2.stack || 'N/A')
    });
  }

  // Test 3: Google Calendar Integration & Tagging
  try {
    if (typeof CalendarApp !== 'undefined') {
      var cal = CalendarApp.getDefaultCalendar();
      var calName = cal.getName();
      results.push({
        test: '3. Google Calendar Integration',
        status: 'PASS',
        details: 'Default Calendar connected: "' + calName + '"'
      });
      passedCount++;
    } else {
      results.push({
        test: '3. Google Calendar Integration',
        status: 'FAIL',
        details: 'CalendarApp service unavailable.'
      });
    }
  } catch (err3) {
    console.error('🔥 [Self-Test 3 Calendar]: ' + err3.toString() + '\nStack: ' + (err3.stack || 'N/A'));
    results.push({
      test: '3. Google Calendar Integration',
      status: 'FAIL',
      details: err3.toString() + ' | Stack: ' + (err3.stack || 'N/A')
    });
  }

  // Test 4: Google Docs Daily Notes Provider
  try {
    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var noteText = getOrCreateDailyDocContent(todayStr);
    results.push({
      test: '4. Google Docs Daily Notes Provider',
      status: 'PASS',
      details: 'Fetched/created daily doc content. Length: ' + (noteText ? noteText.length : 0) + ' chars'
    });
    passedCount++;
  } catch (err4) {
    console.error('🔥 [Self-Test 4 Docs]: ' + err4.toString() + '\nStack: ' + (err4.stack || 'N/A'));
    results.push({
      test: '4. Google Docs Daily Notes Provider',
      status: 'FAIL',
      details: err4.toString() + ' | Stack: ' + (err4.stack || 'N/A')
    });
  }

  // Test 5: 2-Way Sync Engine & Trigger Health
  try {
    syncWorkspaceChanges();
    var triggers = ScriptApp.getProjectTriggers();
    var hasSyncTrigger = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'syncWorkspaceChanges') {
        hasSyncTrigger = true;
        break;
      }
    }
    results.push({
      test: '5. 2-Way Sync Engine & Trigger Health',
      status: 'PASS',
      details: 'Sync execution clean. 5-min background trigger installed: ' + hasSyncTrigger
    });
    passedCount++;
  } catch (err5) {
    console.error('🔥 [Self-Test 5 Sync]: ' + err5.toString() + '\nStack: ' + (err5.stack || 'N/A'));
    results.push({
      test: '5. 2-Way Sync Engine & Trigger Health',
      status: 'FAIL',
      details: err5.toString() + ' | Stack: ' + (err5.stack || 'N/A')
    });
  }

  // Print Summary
  var overallStatus = passedCount === totalTests ? 'HEALTHY (100% PASS)' : (passedCount > 0 ? 'DEGRADED' : 'CRITICAL');

  results.forEach(function(r) {
    Logger.log('[' + r.status + '] ' + r.test + ' -> ' + r.details);
  });

  Logger.log('\n====================================================');
  Logger.log('  OVERALL SYSTEM STATUS: ' + overallStatus + ' (' + passedCount + '/' + totalTests + ')');
  Logger.log('====================================================');

  return {
    overallStatus: overallStatus,
    passedCount: passedCount,
    totalTests: totalTests,
    timestamp: new Date().toISOString(),
    results: results
  };
}

/**
 * Backward compatibility alias for runSelfTest.
 * @returns {{overallStatus: string, passedCount: number, totalTests: number, timestamp: string, results: Array<{test: string, status: string, details: string}>}} Diagnostic summary object.
 */
function runPowerOnSelfTest() {
  return runSelfTest();
}

/**
 * IDE Execution helper for single-stepping or debugging doGet(e) in the Apps Script IDE.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Rendered HTML response from doGet.
 */
function testDoGetInIDE() {
  var mockEvent = {
    pathInfo: 'self-test',
    queryString: 'view=self-test',
    parameter: { view: 'self-test' },
    parameters: { view: ['self-test'] },
    contextPath: ''
  };
  Logger.log('Executing doGet(mockEvent)...');
  var output = doGet(mockEvent);
  Logger.log('doGet Output Length: ' + output.getContent().length);
  return output;
}

/**
 * Renders HTML diagnostic report page for the /self-test web endpoint.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Rendered self-test diagnostic report HTML.
 */
function renderSelfTestDiagnosticReport() {
  var testResult = runSelfTest();
  var isHealthy = testResult.passedCount === testResult.totalTests;
  var badgeColor = isHealthy ? '#2e7d32' : '#c62828';
  var badgeBg = isHealthy ? '#e8f5e9' : '#ffebee';

  var serverLogs = (typeof getRecentServerLogs === 'function') ? getRecentServerLogs() : (global.getRecentServerLogs ? global.getRecentServerLogs() : []);

  var escape = function(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var runLogDocUrl = (typeof getRunLogDocUrl === 'function') ? getRunLogDocUrl() : (global.getRunLogDocUrl ? global.getRunLogDocUrl() : null);

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Day Planner Self-Test Diagnostics</title>' +
    '<style>' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fcfbfa; color: #1c2826; padding: 30px; max-width: 900px; margin: 0 auto; }' +
    '.card { background: #ffffff; border: 1px solid #c8ded7; border-radius: 4px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }' +
    '.badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; background: ' + badgeBg + '; color: ' + badgeColor + '; border: 1px solid ' + badgeColor + '; }' +
    '.log-level { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.75rem; }' +
    '.log-ERROR { background: #ffebee; color: #c62828; border: 1px solid #ef5350; }' +
    '.log-WARN { background: #fff8e1; color: #f57f17; border: 1px solid #ffb74d; }' +
    '.log-INFO { background: #e8f5e9; color: #2e7d32; border: 1px solid #81c784; }' +
    'table { width: 100%; border-collapse: collapse; margin-top: 16px; }' +
    'th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eef5f2; font-size: 0.85rem; vertical-align: top; }' +
    'th { background: #f4f9f7; color: #5c6b66; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }' +
    '.status-pass { color: #2e7d32; font-weight: bold; }' +
    '.status-fail { color: #c62828; font-weight: bold; }' +
    '.diag-header { display: flex; justify-content: space-between; align-items: center; }' +
    '.diag-meta { color: #5c6b66; font-size: 0.85rem; margin-top: 6px; }' +
    '.diag-footer { margin-top: 24px; text-align: right; }' +
    '.btn-return { display: inline-block; padding: 8px 18px; background: #2d6a5a; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 0.9rem; }' +
    '.btn-sec { display: inline-block; padding: 5px 12px; background: #f4f9f7; border: 1px solid #c8ded7; color: #2d6a5a; text-decoration: none; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-left: 6px; }' +
    '.btn-sec:hover { background: #e4efe9; }' +
    'pre.stack-box { white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.75rem; background: #f8fbf9; border: 1px solid #dbeae3; border-radius: 4px; padding: 8px; margin: 6px 0 0; }' +
    '</style></head><body>' +
    '<div class="card">' +
    '<div class="diag-header">' +
    '<h2>⚡ Day Planner Self-Test Diagnostics</h2>' +
    '<span class="badge">' + testResult.overallStatus + '</span>' +
    '</div>' +
    '<p class="diag-meta">Timestamp: ' + testResult.timestamp + ' | Target: Google Workspace Integration Engine</p>' +
    '<table><thead><tr><th>Test Suite</th><th>Result</th><th>Diagnostic Details</th></tr></thead><tbody>';

  testResult.results.forEach(function(r) {
    var cls = r.status === 'PASS' ? 'status-pass' : 'status-fail';
    html += '<tr><td><b>' + escape(r.test) + '</b></td><td class="' + cls + '">' + escape(r.status) + '</td><td>' + escape(r.details) + '</td></tr>';
  });

  html += '</tbody></table>' +
    '<div style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #eef5f2;">' +
    '<div class="diag-header">' +
    '<h3 style="margin: 0; color: #2d6a5a;">📋 Recent Server Execution Logs</h3>' +
    '<div>' +
    (runLogDocUrl ? '<a href="' + escape(runLogDocUrl) + '" target="_blank" class="btn-sec">📄 Open Google Doc Run Log</a>' : '') +
    '<a href="?view=logs&format=json" target="_blank" class="btn-sec">Export JSON</a>' +
    '<a href="?view=self-test&clear_logs=1" class="btn-sec">Clear Logs</a>' +
    '</div></div>';

  if (serverLogs.length === 0) {
    html += '<p style="color: #5c6b66; font-style: italic; margin-top: 12px; font-size: 0.85rem;">No recent server warnings or errors recorded.</p>';
  } else {
    html += '<table><thead><tr><th style="width:140px;">Time</th><th style="width:70px;">Level</th><th style="width:160px;">Context</th><th>Message / Stack</th></tr></thead><tbody>';
    serverLogs.forEach(function(l) {
      var lvl = escape(l.level || 'INFO');
      var timeFormatted = l.timestamp ? l.timestamp.replace('T', ' ').substring(0, 19) : 'N/A';
      var stackHtml = l.stack ? '<details style="margin-top:4px;"><summary style="cursor:pointer; color:#2d6a5a; font-size:0.75rem;">View Stack Trace</summary><pre class="stack-box">' + escape(l.stack) + '</pre></details>' : '';
      html += '<tr>' +
        '<td style="color:#5c6b66; font-size:0.8rem;">' + escape(timeFormatted) + '</td>' +
        '<td><span class="log-level log-' + lvl + '">' + lvl + '</span></td>' +
        '<td><b>' + escape(l.context || 'general') + '</b></td>' +
        '<td>' + escape(l.message || '') + stackHtml + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  html += '</div>' +
    '<div class="diag-footer">' +
    '<a href="../dev" class="btn-return">Return to Day Planner App &rarr;</a>' +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Day Planner Self-Test Diagnostics')
    .setFaviconUrl(typeof DAY_PLANNER_FAVICON_URL !== 'undefined' ? DAY_PLANNER_FAVICON_URL : 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Explicit export surface ──────────────────────────────────────────────────
// See the header comment above and .agents/rules/gas-namespace-iife.md.
global.runSelfTest = runSelfTest;                             // IDE manual-run
global.runPowerOnSelfTest = runPowerOnSelfTest;               // IDE manual-run (backward-compat alias)
global.testDoGetInIDE = testDoGetInIDE;                       // IDE manual-run
global.renderSelfTestDiagnosticReport = renderSelfTestDiagnosticReport; // called by Code.gs's doGet

// Internal aliases for top-level entry point delegators
global._runSelfTestInternal = runSelfTest;
global._runPowerOnSelfTestInternal = runPowerOnSelfTest;
global._testDoGetInIDEInternal = testDoGetInIDE;

})(typeof globalThis !== 'undefined' ? globalThis : this);

// ── Top-level entry points for Google Apps Script IDE dropdown ───────────────
// Apps Script populates the "Select function" IDE dropdown via static AST analysis
// of top-level function declarations. Functions declared solely inside an IIFE are
// not detected by the IDE dropdown. These top-level wrappers delegate to the internal
// implementations to make test and setup utilities directly runnable in the IDE.

/**
 * IDE Execution helper for single-stepping or debugging doGet(e) in the Apps Script IDE.
 * Statically discovered by the Apps Script IDE dropdown.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Rendered HTML response from doGet.
 */
function testDoGetInIDE() {
  return (typeof _testDoGetInIDEInternal === 'function') ? _testDoGetInIDEInternal() : (globalThis._testDoGetInIDEInternal ? globalThis._testDoGetInIDEInternal() : null);
}

/**
 * Diagnostic test runner for the Apps Script IDE.
 * Statically discovered by the Apps Script IDE dropdown.
 * @returns {object} Diagnostic summary object.
 */
function runSelfTest() {
  return (typeof _runSelfTestInternal === 'function') ? _runSelfTestInternal() : (globalThis._runSelfTestInternal ? globalThis._runSelfTestInternal() : null);
}

/**
 * Backward-compatible alias for runSelfTest.
 * Statically discovered by the Apps Script IDE dropdown.
 * @returns {object} Diagnostic summary object.
 */
function runPowerOnSelfTest() {
  return (typeof _runPowerOnSelfTestInternal === 'function') ? _runPowerOnSelfTestInternal() : (globalThis._runPowerOnSelfTestInternal ? globalThis._runPowerOnSelfTestInternal() : null);
}

/**
 * Explicit scope authorization helper for the Apps Script IDE.
 * Touches Drive, Tasks, and Calendar services outside try/catch so running this
 * once in the IDE triggers Google's OAuth consent modal to grant newly added manifest scopes.
 */
function authorizeNewScopes() {
  DriveApp.getRootFolder();
  CalendarApp.getDefaultCalendar();
  if (typeof Tasks !== 'undefined') {
    Tasks.Tasks.list('@default');
  }
}

