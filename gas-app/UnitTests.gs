/**
 * @file UnitTests.gs
 * @description Day Planner Server-Side Self-Test & Diagnostic Suite.
 * Runs an automated major systems & integration check to ensure system health and Google Workspace API connections.
 * All errors log detailed error message and err.stack using console.error for diagnostic clarity.
 */

/**
 * Runs automated self-test diagnostics across Drive, Tasks, Calendar, Docs, and Sync triggers.
 * @returns {{overallStatus: string, passedCount: number, totalTests: number, timestamp: string, results: Array<{test: string, status: string, details: string}>}} Diagnostic summary object.
 */
function runSelfTest() {
  var results = [];
  var passedCount = 0;
  var totalTests = 6;

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
      details: 'Day Planner root folder ID: ' + rootFolder.getId() + ' | Year folder ID: ' + yearFolder.getId()
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

  // Test 6: Event.getTag()/setTag() extendedProperties.shared round-trip
  // Confirms the assumption behind Code.gs's dual-write comment (search "Written to both
  // maps") — that CalendarApp's setTag()/getTag() read/write extendedProperties.SHARED,
  // not private, so getDailyData's evt.getTag('gasTaskId') read-back actually works.
  try {
    if (typeof CalendarApp !== 'undefined') {
      var testTagKey = 'daypSelfTestTag';
      var testTagValue = 'selftest_' + new Date().getTime();
      var testCal = CalendarApp.getDefaultCalendar();
      var testStart = new Date();
      var testEnd = new Date(testStart.getTime() + 15 * 60 * 1000);
      var testEvt = testCal.createEvent('Day Planner Self-Test (safe to delete)', testStart, testEnd);
      var testEvtId = testEvt.getId();

      try {
        testEvt.setTag(testTagKey, testTagValue);
        var sameInstanceRead = testEvt.getTag(testTagKey);

        // Re-fetch by ID to prove the tag round-tripped through the server, not just an
        // in-memory Event object.
        var refetchedEvt = CalendarApp.getEventById(testEvtId);
        var refetchedRead = refetchedEvt.getTag(testTagKey);

        var advancedShared = null;
        var advancedPrivate = null;
        var advancedChecked = false;
        if (typeof Calendar !== 'undefined' && Calendar.Events) {
          advancedChecked = true;
          // Advanced Calendar API wants the bare event ID; CalendarApp.getId() appends
          // "@google.com" (see addCalendarEvent's matching .replace() a few hundred lines up).
          var advancedEvtId = testEvtId.replace(/@google\.com$/, '');
          var rawEvent = Calendar.Events.get('primary', advancedEvtId);
          advancedShared = rawEvent.extendedProperties && rawEvent.extendedProperties.shared
            ? rawEvent.extendedProperties.shared[testTagKey] : null;
          advancedPrivate = rawEvent.extendedProperties && rawEvent.extendedProperties.private
            ? rawEvent.extendedProperties.private[testTagKey] : null;
        }

        var sameInstanceOk = sameInstanceRead === testTagValue;
        var refetchOk = refetchedRead === testTagValue;
        var sharedOk = !advancedChecked || advancedShared === testTagValue;
        var privateEmptyOk = !advancedChecked || !advancedPrivate;

        if (sameInstanceOk && refetchOk && sharedOk && privateEmptyOk) {
          results.push({
            test: '6. Event.getTag()/setTag() -> extendedProperties.shared',
            status: 'PASS',
            details: 'Confirmed CalendarApp.setTag()/getTag() read/write extendedProperties.shared' +
              (advancedChecked
                ? ' (verified directly via Calendar.Events.get: shared.' + testTagKey + '="' + advancedShared + '", private.' + testTagKey + '=' + JSON.stringify(advancedPrivate) + ').'
                : ' (Advanced Calendar service unavailable, so shared/private map itself was not directly inspected; same-instance and refetch reads both matched).') +
              ' Same-instance read: ' + sameInstanceOk + ', refetch-by-ID read: ' + refetchOk + '.'
          });
          passedCount++;
        } else {
          results.push({
            test: '6. Event.getTag()/setTag() -> extendedProperties.shared',
            status: 'FAIL',
            details: 'Mismatch — sameInstanceRead="' + sameInstanceRead + '", refetchedRead="' + refetchedRead + '"' +
              (advancedChecked ? ', extendedProperties.shared.' + testTagKey + '="' + advancedShared + '", extendedProperties.private.' + testTagKey + '=' + JSON.stringify(advancedPrivate) : '') +
              ' (expected "' + testTagValue + '" and empty private).'
          });
        }
      } finally {
        testEvt.deleteEvent();
      }
    } else {
      results.push({
        test: '6. Event.getTag()/setTag() -> extendedProperties.shared',
        status: 'FAIL',
        details: 'CalendarApp service unavailable.'
      });
    }
  } catch (err6) {
    console.error('🔥 [Self-Test 6 getTag/setTag]: ' + err6.toString() + '\nStack: ' + (err6.stack || 'N/A'));
    results.push({
      test: '6. Event.getTag()/setTag() -> extendedProperties.shared',
      status: 'FAIL',
      details: err6.toString() + ' | Stack: ' + (err6.stack || 'N/A')
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

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Day Planner Self-Test Diagnostics</title>' +
    '<style>' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fcfbfa; color: #1c2826; padding: 30px; max-width: 900px; margin: 0 auto; }' +
    '.card { background: #ffffff; border: 1px solid #c8ded7; border-radius: 8px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }' +
    '.badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; background: ' + badgeBg + '; color: ' + badgeColor + '; border: 1px solid ' + badgeColor + '; }' +
    'table { width: 100%; border-collapse: collapse; margin-top: 20px; }' +
    'th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eef5f2; font-size: 0.9rem; }' +
    'th { background: #f4f9f7; color: #5c6b66; text-transform: uppercase; font-size: 0.75rem; }' +
    '.status-pass { color: #2e7d32; font-weight: bold; }' +
    '.status-fail { color: #c62828; font-weight: bold; }' +
    '.diag-header { display: flex; justify-content: space-between; align-items: center; }' +
    '.diag-meta { color: #5c6b66; font-size: 0.9rem; }' +
    '.diag-footer { margin-top: 24px; text-align: right; }' +
    '.btn-return { display: inline-block; padding: 10px 20px; background: #2d6a5a; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }' +
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
    html += '<tr><td><b>' + r.test + '</b></td><td class="' + cls + '">' + r.status + '</td><td>' + r.details + '</td></tr>';
  });

  html += '</tbody></table>' +
    '<div class="diag-footer">' +
    '<a href="../dev" class="btn-return">Return to Day Planner App &rarr;</a>' +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Day Planner Self-Test Diagnostics')
    .setFaviconUrl(typeof DAY_PLANNER_FAVICON_URL !== 'undefined' ? DAY_PLANNER_FAVICON_URL : 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
