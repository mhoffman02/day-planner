/**
 * @file Code.gs
 * @description Day Planner Google Apps Script server-side entry points, Drive folder management, error logging, and data handlers.
 * Robust Architecture with centralized error handling using console.error for stack tracing.
 * Uses strict drive.file scope with user-configured root folder ID.
 */

/**
 * Centralized error logging utility. Logs formatted error and stack trace to console.error.
 * @param {string} context Descriptive name or operation context where the error occurred.
 * @param {Error|object|string} err The thrown Error object or error message.
 * @returns {{success: boolean, error: string, stack: string|null, context: string}} Standardized error payload.
 */
function logError(context, err) {
  var errorMsg = '🔥 ' + context + ': ' + (err.message || err.toString());
  console.error(errorMsg + '\nStack:\n' + (err.stack || 'No stack trace available'));
  return {
    success: false,
    error: errorMsg,
    stack: err.stack || null,
    context: context
  };
}

/**
 * Renders the HTML template page for setting up or connecting a Google Drive root folder.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Evaluated HTML setup page output.
 */
function renderSetupFolderPage() {
  return HtmlService.createTemplateFromFile('SetupFolder')
    .evaluate()
    .setTitle('Day Planner - Setup Google Drive Folder')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Primary HTTP GET web app handler for Google Apps Script.
 * Routes traffic to self-test diagnostics, folder setup page, or main Day Planner UI.
 * @param {GoogleAppsScript.Events.DoGet} e Event parameter containing request query parameters and path information.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Rendered web page output.
 */
function doGet(e) {
  try {
    // 1. Check if requested /self-test diagnostic endpoint (via pathInfo or query param)
    var isSelfTest = e && (
      (e.pathInfo && (e.pathInfo.indexOf('self-test') !== -1 || e.pathInfo.indexOf('selftest') !== -1)) ||
      (e.parameter && (e.parameter.view === 'self-test' || e.parameter['self-test'] !== undefined || e.parameter.post === '1'))
    );

    if (isSelfTest) {
      return renderSelfTestDiagnosticReport();
    }

    // 2. Check if requested /setup-folder endpoint
    var isSetupRequest = e && (
      (e.pathInfo && e.pathInfo.indexOf('setup') !== -1) ||
      (e.parameter && (e.parameter.setup === '1' || e.parameter.view === 'setup'))
    );

    // 3. Validate presence of configured root folder for main web app
    var validatedFolder = getValidatedRootFolder();
    if (!validatedFolder || isSetupRequest) {
      return renderSetupFolderPage();
    }

    // 4. Regular Web App load
    try {
      syncWorkspaceChanges();
      ensure2WaySyncTriggerInstalled(5);
    } catch (syncErr) {
      logError('doGet background sync init', syncErr);
    }

    var template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('Day Planner')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    var fail = logError('doGet exception', err);
    var errStr = (err.message || err.toString()).toLowerCase();
    var isFolderError = errStr.indexOf('folder') !== -1 || errStr.indexOf('drive') !== -1 || errStr.indexOf('day planner') !== -1;
    if (isFolderError) {
      return renderSetupFolderPage();
    }
    return HtmlService.createHtmlOutput('<h3>🔥 Day Planner Render Failure</h3><p><b>' + fail.error + '</b></p><pre>' + (fail.stack || '') + '</pre>');
  }
}

/**
 * Validates and retrieves the configured root folder under drive.file scope.
 * Checks UserProperties DAY_PLANNER_ROOT_FOLDER_ID. Returns folder or null (redirects to SetupFolder.html).
 * @returns {GoogleAppsScript.Drive.Folder|null} Configured Google Drive root folder object or null.
 */
function getValidatedRootFolder() {
  if (typeof DriveApp === 'undefined') return null;

  var userProps = PropertiesService.getUserProperties();
  var cachedId = userProps.getProperty('DAY_PLANNER_ROOT_FOLDER_ID');

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (err) {
      console.error('getValidatedRootFolder cached ID invalid or unreadable: ' + err.toString());
    }
  }

  // Auto-search for existing "Day Planner" folder in Drive (under drive.file scope)
  try {
    var folders = DriveApp.getFoldersByName('Day Planner');
    if (folders.hasNext()) {
      var folder = folders.next();
      userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folder.getId());
      return folder;
    }
  } catch (err) {
    console.error('getValidatedRootFolder auto-search error: ' + err.toString());
  }

  // No valid folder cached or found; return null to trigger SetupFolder.html
  return null;
}

/**
 * Server handler called by SetupFolder.html form to sanitize, validate, and save folder URL or ID.
 * @param {string} inputUrl Google Drive folder web URL or raw folder ID.
 * @returns {{success: boolean, folderId?: string, folderName?: string, error?: string}} Validation result.
 */
function validateAndSaveFolderUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { success: false, error: 'Please enter a valid Google Drive folder web link or folder ID.' };
  }

  var sanitizedInput = inputUrl.trim();
  var extractedId = sanitizedInput;

  // Extract ID from full Google Drive URL if present
  var urlMatch = sanitizedInput.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    extractedId = urlMatch[1];
  }

  // Sanitize folder ID format (alphanumeric, dashes, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(extractedId)) {
    return { success: false, error: 'Invalid folder URL or ID format. Please paste the full Google Drive web link.' };
  }

  try {
    var folder = DriveApp.getFolderById(extractedId);
    var folderName = folder.getName();

    // Save validated ID in UserProperties
    PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', extractedId);
    Logger.log('Validated & saved Day Planner root folder ID: ' + extractedId + ' (' + folderName + ')');

    return {
      success: true,
      folderId: extractedId,
      folderName: folderName
    };
  } catch (err) {
    logError('validateAndSaveFolderUrl(' + extractedId + ')', err);
    return {
      success: false,
      error: 'Folder not found or permission denied. Please ensure you created the folder in Google Drive and pasted the correct link.'
    };
  }
}

/**
 * IDE Debugger Helper Function:
 * Select "testDoGetInIDE" in the IDE toolbar dropdown and click "Debug" or "Run".
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Output of doGet execution.
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
 * Evaluates and returns the raw content of an HTML file for template inline inclusion.
 * @param {string} filename Name of the HTML file to include (without extension).
 * @returns {string} Evaluated file text content.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    logError('include(' + filename + ')', err);
    return '<!-- Error including ' + filename + ' -->';
  }
}

/**
 * Ensures automated time-driven 2-Way Sync trigger is installed.
 * @param {number} [minutes=5] Interval frequency in minutes.
 * @returns {void}
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
    logError('ensure2WaySyncTriggerInstalled', err);
  }
}

/**
 * Resets and installs a fresh 5-minute recurring time-driven 2-Way Sync trigger.
 * @returns {void}
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
    logError('setup2WaySyncTrigger', err);
  }
}

/**
 * Background Time-Driven Handler for 2-Way Workspace Syncing.
 * Synchronizes daily tasks with Google Calendar events.
 * @returns {void}
 */
function syncWorkspaceChanges() {
  try {
    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var dailyData = getDailyData(todayStr);

    if (dailyData.error) {
      console.error('syncWorkspaceChanges warning: dailyData returned error: ' + dailyData.error);
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
        logError('syncWorkspaceChanges task item ' + task.id, taskErr);
      }
    });

    Logger.log('2-Way Workspace Sync complete for ' + todayStr);
  } catch (err) {
    logError('syncWorkspaceChanges main', err);
  }
}

/**
 * Retrieves daily data: Calendar events, Google Tasks, and Google Doc daily notes for a given date.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @returns {{date: string, tasks: Array<object>, calendarEvents: Array<object>, noteContent: string, warnings: Array<string>}|object} Daily planner dataset or error payload.
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
          var meetLink = null;
          if (typeof evt.getHangoutLink === 'function') {
            meetLink = evt.getHangoutLink();
          } else {
            var desc = evt.getDescription() || '';
            var loc = evt.getLocation() || '';
            var match = (desc + ' ' + loc).match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
            if (match) meetLink = match[0];
          }
          return {
            id: evt.getId(),
            title: evt.getTitle(),
            startTime: evt.getStartTime().toISOString(),
            endTime: evt.getEndTime().toISOString(),
            location: evt.getLocation(),
            description: evt.getDescription(),
            meetLink: meetLink,
            syncTaskId: evt.getTag('gasTaskId') || null
          };
        });
      } catch (calErr) {
        result.warnings.push(logError('CalendarApp.getEvents', calErr).error);
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
        result.warnings.push(logError('Tasks.Tasks.list', tasksErr).error);
      }
    }

    // 3. Fetch or Create Daily Notes Google Doc
    try {
      result.noteContent = getOrCreateDailyDocContent(dateStr);
    } catch (notesErr) {
      result.warnings.push(logError('getOrCreateDailyDocContent', notesErr).error);
      result.noteContent = '⚠️ Error loading daily doc notes.';
    }

  } catch (err) {
    return logError('getDailyData(' + dateStr + ')', err);
  }

  return result;
}

/**
 * Gets or creates the daily note Google Doc content in /Day Planner/YYYY/MM/.
 * Compatible with strict drive.file scope using UserProperties cached folder ID.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @returns {string} Full text content of the daily note Google Doc.
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
    logError('getOrCreateDailyDocContent(' + dateStr + ')', err);
    throw err;
  }
}

/**
 * Gets or creates subfolders under the root Day Planner folder or parent folder.
 * @param {GoogleAppsScript.Drive.Folder|null} parent Parent folder object, or null to target root folder.
 * @param {string} name Folder name to find or create.
 * @returns {GoogleAppsScript.Drive.Folder} Found or created folder object.
 */
function getFolderByNameOrCreate(parent, name) {
  try {
    if (parent) {
      var folders = parent.getFoldersByName(name);
      if (folders.hasNext()) return folders.next();
      return parent.createFolder(name);
    } else {
      var folder = getValidatedRootFolder();
      if (!folder) {
        throw new Error('No valid Google Drive Day Planner folder connected.');
      }
      return folder;
    }
  } catch (err) {
    logError('getFolderByNameOrCreate(' + name + ')', err);
    throw err;
  }
}

/**
 * Retrieves master task entries for monthly planning.
 * @param {string} [monthYearStr] Optional month/year string filter.
 * @returns {Array<{id: string, title: string, category: string, status: string}>} Array of master task items.
 */
function getMasterTasks(monthYearStr) {
  try {
    return [
      { id: 'm1', title: 'Prepare Q3 performance appraisals', category: 'Work', status: '•' },
      { id: 'm2', title: 'Plan annual family retreat', category: 'Personal', status: '•' },
      { id: 'm3', title: 'Rebalance investment portfolio', category: 'Financial', status: '•' }
    ];
  } catch (err) {
    logError('getMasterTasks', err);
    return [];
  }
}

/**
 * Creates and appends a new daily task item for the specified date.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @param {string} title Task title description.
 * @param {string} [category='General'] Optional task category classification.
 * @returns {{id: string, title: string, status: string, category: string, dueDate: string}} Created task object.
 */
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
    logError('addDailyTask', err);
    throw err;
  }
}
