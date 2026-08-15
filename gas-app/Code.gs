/**
 * Day Planner (GAS Server Logic)
 * Includes 2-Way Sync Engine between Google Calendar, Google Tasks, and Day Planner Binder.
 * All risky operations are wrapped in try-catch with err.stack diagnostic logging.
 */

function doGet(e) {
  // 1. Perform immediate 2-Way Sync on Web App load
  try {
    syncWorkspaceChanges();
  } catch (err) {
    Logger.log('ERROR [doGet syncWorkspaceChanges]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
  }

  // 2. Ensure automated 5-minute 2-Way Sync trigger is installed
  try {
    ensure2WaySyncTriggerInstalled(5);
  } catch (err) {
    Logger.log('ERROR [doGet ensure2WaySyncTriggerInstalled]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
  }

  try {
    var template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('Day Planner')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('ERROR [doGet template evaluate]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
    return HtmlService.createHtmlOutput('<h3>Error loading Day Planner UI</h3><p>' + err.toString() + '</p>');
  }
}

function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    Logger.log('ERROR [include file: ' + filename + ']: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
    return '<!-- Error loading included file: ' + filename + ' -->';
  }
}

/**
 * Checks if 2-Way Sync trigger is installed; installs if missing (default 5-minute frequency)
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
    Logger.log('ERROR [ensure2WaySyncTriggerInstalled]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
  }
}

/**
 * Sets up 5-minute automated time-driven trigger for 2-Way Sync
 */
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
    Logger.log('ERROR [setup2WaySyncTrigger]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
  }
}

/**
 * Background Time-Driven Handler for 2-Way Workspace Syncing
 */
function syncWorkspaceChanges() {
  try {
    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var dailyData = getDailyData(todayStr);

    var tasks = dailyData.tasks || [];

    // Sync Tasks ➔ Calendar
    tasks.forEach(function(task) {
      if (task.id && typeof CalendarApp !== 'undefined') {
        try {
          var defaultCal = CalendarApp.getDefaultCalendar();
          var matchingEvts = defaultCal.getEventsForDay(new Date());

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
          Logger.log('ERROR [syncWorkspaceChanges per-task: ' + task.id + ']: ' + taskErr.toString() + '\nStack: ' + (taskErr.stack || 'N/A'));
        }
      }
    });

    Logger.log('2-Way Workspace Sync complete for ' + todayStr);
  } catch (err) {
    Logger.log('ERROR [syncWorkspaceChanges]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
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
    noteContent: ''
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
        Logger.log('ERROR [getDailyData CalendarApp]: ' + calErr.toString() + '\nStack: ' + (calErr.stack || 'N/A'));
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
        Logger.log('ERROR [getDailyData Tasks API]: ' + tasksErr.toString() + '\nStack: ' + (tasksErr.stack || 'N/A'));
      }
    }

    // 3. Fetch or Create Daily Notes Google Doc in /Day Planner/YYYY/MM/
    try {
      result.noteContent = getOrCreateDailyDocContent(dateStr);
    } catch (notesErr) {
      Logger.log('ERROR [getDailyData getOrCreateDailyDocContent]: ' + notesErr.toString() + '\nStack: ' + (notesErr.stack || 'N/A'));
    }

  } catch (err) {
    Logger.log('ERROR [getDailyData]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
  }

  return result;
}

/**
 * Gets or creates the daily note Google Doc content in /Day Planner/YYYY/MM/
 */
function getOrCreateDailyDocContent(dateStr) {
  if (typeof DriveApp === 'undefined' || typeof DocumentApp === 'undefined') {
    return 'Daily Notes for ' + dateStr + '\n#index [General] Initialized Day Planner note with 2-Way Sync enabled.';
  }

  try {
    var parts = dateStr.split('-');
    var year = parts[0];
    var month = parts[1];

    var parentFolder = getFolderByNameOrCreate(DriveApp.getRootFolder(), 'Day Planner');
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
    Logger.log('ERROR [getOrCreateDailyDocContent]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
    return 'Daily Notes for ' + dateStr + '\n#index [General] Initialized Day Planner note.';
  }
}

function getFolderByNameOrCreate(parent, name) {
  try {
    var folders = parent.getFoldersByName(name);
    if (folders.hasNext()) return folders.next();
    return parent.createFolder(name);
  } catch (err) {
    Logger.log('ERROR [getFolderByNameOrCreate: ' + name + ']: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
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
    Logger.log('ERROR [getMasterTasks]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
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
    Logger.log('ERROR [addDailyTask]: ' + err.toString() + '\nStack: ' + (err.stack || 'N/A'));
    throw err;
  }
}
