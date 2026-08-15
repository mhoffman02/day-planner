/**
 * Day Planner (GAS Server Logic)
 * Robust Architecture with centralized error handling and flame symbol stack tracing.
 */

function failLoud(context, err) {
  var errorMsg = '🔥 ' + context + ': ' + (err.message || err.toString());
  Logger.log(errorMsg + '\nStack:\n' + (err.stack || 'No stack trace available'));
  return {
    success: false,
    error: errorMsg,
    stack: err.stack || null,
    context: context
  };
}

function doGet(e) {
  // Check if requested /self-test diagnostic endpoint (supports pathInfo: "self-test" or params)
  var isSelfTest = e && (
    e.pathInfo === 'self-test' ||
    e.pathInfo === '/self-test' ||
    e.pathInfo === 'selftest' ||
    (e.parameter && (e.parameter.view === 'self-test' || e.parameter['self-test'] !== undefined || e.parameter.post === '1'))
  );

  if (isSelfTest) {
    return renderSelfTestDiagnosticReport();
  }

  // Regular Web App load
  try {
    syncWorkspaceChanges();
    ensure2WaySyncTriggerInstalled(5);
  } catch (err) {
    failLoud('doGet background sync init', err);
  }

  try {
    var template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('Day Planner')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    var fail = failLoud('doGet template render', err);
    return HtmlService.createHtmlOutput('<h3>🔥 Day Planner Render Failure</h3><p><b>' + fail.error + '</b></p><pre>' + (fail.stack || '') + '</pre>');
  }
}

/**
 * IDE Debugger Helper Function:
 * Select "testDoGetInIDE" in the IDE toolbar dropdown and click "Debug" or "Run"
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

function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    failLoud('include(' + filename + ')', err);
    return '<!-- Error including ' + filename + ' -->';
  }
}

/**
 * Ensures automated 5-minute 2-Way Sync trigger is installed
 */
function ensure2WaySyncTriggerInstalled(minutes) {
  var freq = minutes || 5;
  try {
    var existingTriggers = ScriptApp.getProjectTriggers();
    var triggerFound = false;

    for (var i = 0; i < existingTriggers.length; i++) {
      if (existingTriggers[i].getHandlerFunction() === 'syncWorkspaceChanges') {
        triggerFound = true;
        break;
      }
    }

    if (!triggerFound) {
      ScriptApp.newTrigger('syncWorkspaceChanges')
        .timeBased()
        .everyMinutes(freq)
        .create();
      Logger.log('Installed automated ' + freq + '-minute 2-Way Sync trigger.');
    }
  } catch (err) {
    failLoud('ensure2WaySyncTriggerInstalled', err);
  }
}

function setup2WaySyncTrigger() {
  try {
    var existingTriggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < existingTriggers.length; i++) {
      if (existingTriggers[i].getHandlerFunction() === 'syncWorkspaceChanges') {
        ScriptApp.deleteTrigger(existingTriggers[i]);
      }
    }

    ScriptApp.newTrigger('syncWorkspaceChanges')
      .timeBased()
      .everyMinutes(5)
      .create();

    Logger.log('Created 5-minute 2-Way Sync trigger successfully.');
  } catch (err) {
    failLoud('setup2WaySyncTrigger', err);
  }
}

/**
 * Background Time-Driven Handler for 2-Way Workspace Syncing
 */
function syncWorkspaceChanges() {
  try {
    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var dailyData = getDailyData(todayStr);

    if (dailyData.error) {
      Logger.log('syncWorkspaceChanges warning: dailyData returned error: ' + dailyData.error);
      return;
    }

    var tasks = dailyData.tasks || [];
    var defaultCal = CalendarApp.getDefaultCalendar();
    var matchingEvts = defaultCal.getEventsForDay(new Date());

    tasks.forEach(function(task) {
      if (!task.id) return;
      try {
        var linkedEvt = null;
        for (var j = 0; j < matchingEvts.length; j++) {
          if (matchingEvts[j].getTag('gasTaskId') === task.id || matchingEvts[j].getTitle().indexOf(task.title) !== -1) {
            linkedEvt = matchingEvts[j];
            break;
          }
        }

        var isDone = task.status === '✓';
        var formattedTitle = isDone ? '[✓] ' + task.title : task.title;

        if (linkedEvt) {
          linkedEvt.setTitle(formattedTitle);
        } else {
          var now = new Date();
          var endTime = new Date(now.getTime() + 30 * 60 * 1000);
          var newEvt = defaultCal.createEvent(formattedTitle, now, endTime, {
            description: 'Synced Day Planner Task: ' + task.id
          });
          newEvt.setTag('gasTaskId', task.id);
        }
      } catch (taskErr) {
        failLoud('syncWorkspaceChanges task item ' + task.id, taskErr);
      }
    });

    Logger.log('2-Way Workspace Sync complete for ' + todayStr);
  } catch (err) {
    failLoud('syncWorkspaceChanges main', err);
  }
}

/**
 * Retrieves daily data: Calendar events, Google Tasks, and Google Doc daily notes
 */
function getDailyData(dateStr) {
  var result = {
    date: dateStr,
    tasks: [],
    calendarEvents: [],
    noteContent: '',
    warnings: []
  };

  try {
    var targetDate = new Date(dateStr + 'T00:00:00');
    var nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    // 1. Fetch Calendar Events
    if (typeof CalendarApp !== 'undefined') {
      try {
        var events = CalendarApp.getDefaultCalendar().getEvents(targetDate, nextDate);
        result.calendarEvents = events.map(function(evt) {
          return {
            id: evt.getId(),
            title: evt.getTitle(),
            startTime: evt.getStartTime().toISOString(),
            endTime: evt.getEndTime().toISOString(),
            location: evt.getLocation(),
            description: evt.getDescription(),
            meetLink: evt.getHangoutLink(),
            syncTaskId: evt.getTag('gasTaskId') || null
          };
        });
      } catch (calErr) {
        result.warnings.push(failLoud('CalendarApp.getEvents', calErr).error);
      }
    }

    // 2. Fetch Google Tasks
    if (typeof Tasks !== 'undefined') {
      try {
        var taskList = Tasks.Tasks.list('@default');
        if (taskList.items) {
          result.tasks = taskList.items.map(function(t) {
            return {
              id: t.id,
              title: t.title,
              status: t.status === 'completed' ? '✓' : '•',
              dueDate: t.due ? t.due.substring(0, 10) : dateStr
            };
          });
        }
      } catch (tasksErr) {
        result.warnings.push(failLoud('Tasks.Tasks.list', tasksErr).error);
      }
    }

    // 3. Fetch or Create Daily Notes Google Doc
    try {
      result.noteContent = getOrCreateDailyDocContent(dateStr);
    } catch (notesErr) {
      result.warnings.push(failLoud('getOrCreateDailyDocContent', notesErr).error);
      result.noteContent = '⚠️ Error loading daily doc notes.';
    }

  } catch (err) {
    return failLoud('getDailyData(' + dateStr + ')', err);
  }

  return result;
}

/**
 * Gets or creates the daily note Google Doc content in /Day Planner/YYYY/MM/
 * Compatible with strict drive.file scope without calling getRootFolder()
 */
function getOrCreateDailyDocContent(dateStr) {
  if (typeof DriveApp === 'undefined' || typeof DocumentApp === 'undefined') {
    return 'Daily Notes for ' + dateStr + '\n#index [General] Initialized Day Planner note.';
  }

  try {
    var parts = dateStr.split('-');
    var year = parts[0];
    var month = parts[1];

    var parentFolder = getFolderByNameOrCreate(null, 'Day Planner');
    var yearFolder = getFolderByNameOrCreate(parentFolder, year);
    var monthFolder = getFolderByNameOrCreate(yearFolder, month);

    var docName = 'Day Planner Note - ' + dateStr;
    var files = monthFolder.getFilesByName(docName);

    if (files.hasNext()) {
      var file = files.next();
      var doc = DocumentApp.openById(file.getId());
      return doc.getBody().getText();
    } else {
      var newDoc = DocumentApp.create(docName);
      var docFile = DriveApp.getFileById(newDoc.getId());
      docFile.moveTo(monthFolder);

      var body = newDoc.getBody();
      body.appendParagraph('Day Planner Notes - ' + dateStr).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph('#index [Daily] Created daily note doc');
      newDoc.saveAndClose();

      return body.getText();
    }
  } catch (err) {
    failLoud('getOrCreateDailyDocContent(' + dateStr + ')', err);
    throw err;
  }
}

function getFolderByNameOrCreate(parent, name) {
  try {
    if (parent) {
      var folders = parent.getFoldersByName(name);
      if (folders.hasNext()) return folders.next();
      return parent.createFolder(name);
    } else {
      var topFolders = DriveApp.getFoldersByName(name);
      if (topFolders.hasNext()) return topFolders.next();
      return DriveApp.createFolder(name);
    }
  } catch (err) {
    failLoud('getFolderByNameOrCreate(' + name + ')', err);
    throw err;
  }
}

function getMasterTasks(monthYearStr) {
  try {
    return [
      { id: 'm1', title: 'Prepare Q3 performance appraisals', category: 'Work', status: '•' },
      { id: 'm2', title: 'Plan annual family retreat', category: 'Personal', status: '•' },
      { id: 'm3', title: 'Rebalance investment portfolio', category: 'Financial', status: '•' }
    ];
  } catch (err) {
    failLoud('getMasterTasks', err);
    return [];
  }
}

function addDailyTask(dateStr, title, category) {
  try {
    return {
      id: 'task_' + new Date().getTime(),
      title: title,
      status: '•',
      category: category || 'General',
      dueDate: dateStr
    };
  } catch (err) {
    failLoud('addDailyTask', err);
    throw err;
  }
}
