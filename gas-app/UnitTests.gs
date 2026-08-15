/**
 * Day Planner Server-Side Power-On Self Test (POST) & Diagnostic Suite
 * Runs an automated major systems & integration check to ensure system health and Google Workspace API connections.
 */

function runPowerOnSelfTest() {
  var results = [];
  var passedCount = 0;
  var totalTests = 5;

  Logger.log('====================================================');
  Logger.log('  DAY PLANNER POWER-ON SELF TEST (POST) DIAGNOSTICS ');
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
    results.push({
      test: '1. Google Drive & Folder Hierarchy',
      status: 'FAIL',
      details: err1.toString()
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
    results.push({
      test: '2. Google Tasks API (v1)',
      status: 'FAIL',
      details: err2.toString()
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
    results.push({
      test: '3. Google Calendar Integration',
      status: 'FAIL',
      details: err3.toString()
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
    results.push({
      test: '4. Google Docs Daily Notes Provider',
      status: 'FAIL',
      details: err4.toString()
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
    results.push({
      test: '5. 2-Way Sync Engine & Trigger Health',
      status: 'FAIL',
      details: err5.toString()
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
