/**
 * Day Planner Server-Side Self-Test & Diagnostic Suite
 * Runs an automated major systems & integration check to ensure system health and Google Workspace API connections.
 * All errors log detailed error message and err.stack for diagnostic clarity.
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
    var rootFolder = getFolderByNameOrCreate(DriveApp.getRootFolder(), 'Day Planner');
    var yearFolder = getFolderByNameOrCreate(rootFolder, new Date().getFullYear().toString());
    results.push({
      test: '1. Google Drive & Folder Hierarchy',
      status: 'PASS',
      details: 'Day Planner root folder ID: ' + rootFolder.getId()
    });
    passedCount++;
  } catch (err1) {
    Logger.log('🔥 [Self-Test 1 Drive]: ' + err1.toString() + '\nStack: ' + (err1.stack || 'N/A'));
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
    Logger.log('🔥 [Self-Test 2 Tasks]: ' + err2.toString() + '\nStack: ' + (err2.stack || 'N/A'));
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
    Logger.log('🔥 [Self-Test 3 Calendar]: ' + err3.toString() + '\nStack: ' + (err3.stack || 'N/A'));
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
    Logger.log('🔥 [Self-Test 4 Docs]: ' + err4.toString() + '\nStack: ' + (err4.stack || 'N/A'));
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
    Logger.log('🔥 [Self-Test 5 Sync]: ' + err5.toString() + '\nStack: ' + (err5.stack || 'N/A'));
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
 * Backward compatibility alias
 */
function runPowerOnSelfTest() {
  return runSelfTest();
}

/**
 * Renders HTML diagnostic report page for the /self-test web endpoint
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
    '</style></head><body>' +
    '<div class="card">' +
    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
    '<h2>⚡ Day Planner Self-Test Diagnostics</h2>' +
    '<span class="badge">' + testResult.overallStatus + '</span>' +
    '</div>' +
    '<p style="color:#5c6b66; font-size:0.9rem;">Timestamp: ' + testResult.timestamp + ' | Target: Google Workspace Integration Engine</p>' +
    '<table><thead><tr><th>Test Suite</th><th>Result</th><th>Diagnostic Details</th></tr></thead><tbody>';

  testResult.results.forEach(function(r) {
    var cls = r.status === 'PASS' ? 'status-pass' : 'status-fail';
    html += '<tr><td><b>' + r.test + '</b></td><td class="' + cls + '">' + r.status + '</td><td>' + r.details + '</td></tr>';
  });

  html += '</tbody></table>' +
    '<div style="margin-top:24px; text-align:right;">' +
    '<a href="../dev" style="display:inline-block; padding:10px 20px; background:#2d6a5a; color:#fff; text-decoration:none; border-radius:4px; font-weight:bold;">Return to Day Planner App &rarr;</a>' +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Day Planner Self-Test Diagnostics')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
