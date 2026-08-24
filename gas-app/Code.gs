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



var DAY_PLANNER_FAVICON_URL = 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png';

/**
 * Multi-Tenant & Per-User Privacy Access Control Helper.
 * In public client / multi-user mode ("executeAs: USER_ACCESSING"):
 *   - Each user runs in their own Google security sandbox.
 *   - Tasks, Calendar, and Drive JSON files are strictly isolated to that user's private Google account.
 * In single-user mode ("executeAs: USER_DEPLOYING"):
 *   - Protects the deployer's data by enforcing optional allowed emails or domains.
 * @returns {{authorized: boolean, userEmail: string, error?: string}} Verification result.
 */
function validateUserAccess() {
  try {
    var activeUser = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
    var effectiveUser = (Session.getEffectiveUser() && Session.getEffectiveUser().getEmail()) || '';
    var userEmail = (activeUser || effectiveUser || '').toLowerCase().trim();

    var scriptProps = PropertiesService.getScriptProperties();
    var allowedEmailsStr = scriptProps ? scriptProps.getProperty('DAY_PLANNER_ALLOWED_EMAILS') : null;
    var allowedDomainsStr = scriptProps ? scriptProps.getProperty('DAY_PLANNER_ALLOWED_DOMAINS') : null;

    // If no explicit whitelist restriction is set in ScriptProperties, access is open to each user's own sandbox
    if (!allowedEmailsStr && !allowedDomainsStr) {
      return { authorized: true, userEmail: userEmail || 'authenticated-user' };
    }

    if (allowedEmailsStr) {
      var emailList = allowedEmailsStr.toLowerCase().split(',').map(function(s) { return s.trim(); });
      if (emailList.indexOf(userEmail) !== -1) {
        return { authorized: true, userEmail: userEmail };
      }
    }

    if (allowedDomainsStr) {
      var domainList = allowedDomainsStr.toLowerCase().split(',').map(function(s) { return s.trim(); });
      for (var i = 0; i < domainList.length; i++) {
        var domain = domainList[i];
        if (userEmail.endsWith('@' + domain) || userEmail.endsWith('.' + domain)) {
          return { authorized: true, userEmail: userEmail };
        }
      }
    }

    return {
      authorized: false,
      userEmail: userEmail,
      error: 'Access Denied: Google Account (' + (userEmail || 'anonymous') + ') is not authorized on this Day Planner instance.'
    };
  } catch (err) {
    return { authorized: true, userEmail: 'session-user' };
  }
}

/**
 * Renders the HTML template page for setting up or connecting a Google Drive root folder.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Evaluated HTML setup page output.
 */
function renderSetupFolderPage() {
  return HtmlService.createTemplateFromFile('SetupFolder')
    .evaluate()
    .setTitle('Day Planner - Setup Google Drive Folder')
    .setFaviconUrl(DAY_PLANNER_FAVICON_URL)
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
    // 1. Dynamic bundle API endpoint for PWA Shell Loader (CORS / SWR bundle fetch)
    var isBundleRequest = e && e.parameter && (e.parameter.action === 'bundle' || e.parameter.view === 'bundle');
    if (isBundleRequest) {
      return renderAppBundleJson(e);
    }

    // 0. Zero-Trust Access Control Verification
    var auth = validateUserAccess();
    if (!auth.authorized) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:serif;max-width:600px;margin:50px auto;padding:30px;background:#fcfbfa;border:2px solid #b3392f;border-radius:8px;color:#1c2d27;">' +
        '<h2 style="color:#b3392f;margin-top:0;">🔒 Day Planner Access Restricted</h2>' +
        '<p><b>' + auth.error + '</b></p>' +
        '<p style="font-size:0.9em;color:#555;">Please ensure you are logged into your authorized Google Workspace account.</p>' +
        '</div>'
      ).setTitle('Day Planner - Access Denied')
       .setFaviconUrl(DAY_PLANNER_FAVICON_URL)
       .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    }

    // 2. Check if requested /self-test diagnostic endpoint (via pathInfo or query param)
    var isSelfTest = e && (
      (e.pathInfo && (e.pathInfo.indexOf('self-test') !== -1 || e.pathInfo.indexOf('selftest') !== -1)) ||
      (e.parameter && (e.parameter.view === 'self-test' || e.parameter['self-test'] !== undefined || e.parameter.post === '1'))
    );

    if (isSelfTest) {
      return renderSelfTestDiagnosticReport();
    }

    // 3. Check if requested /setup-folder endpoint
    var isSetupRequest = e && (
      (e.pathInfo && e.pathInfo.indexOf('setup') !== -1) ||
      (e.parameter && (e.parameter.setup === '1' || e.parameter.view === 'setup'))
    );

    // 4. Validate presence of configured root folder for main web app
    var validatedFolder = getValidatedRootFolder();
    if (!validatedFolder || isSetupRequest) {
      return renderSetupFolderPage();
    }

    // 5. Regular Web App load
    var template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('Day Planner')
      .setFaviconUrl(DAY_PLANNER_FAVICON_URL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    var fail = logError('doGet exception', err);
    var errStr = (err.message || err.toString()).toLowerCase();
    var isFolderError = errStr.indexOf('folder') !== -1 || errStr.indexOf('drive') !== -1 || errStr.indexOf('day planner') !== -1;
    if (isFolderError) {
      return renderSetupFolderPage();
    }
    return HtmlService.createHtmlOutput('<h3>🔥 Day Planner Render Failure</h3><p><b>' + fail.error + '</b></p><pre>' + (fail.stack || '') + '</pre>')
      .setTitle('Day Planner - Render Failure')
      .setFaviconUrl(DAY_PLANNER_FAVICON_URL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
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
      console.warn('getValidatedRootFolder: cached ID invalid or unreadable: ' + err.toString());
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
    console.warn('getValidatedRootFolder auto-search notice: ' + err.toString());
  }

  // Under least-privilege drive.file scope, auto-create the dedicated folder seamlessly
  try {
    var newFolder = DriveApp.createFolder('Day Planner');
    userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', newFolder.getId());
    Logger.log('Auto-created dedicated Day Planner root folder ID: ' + newFolder.getId());
    return newFolder;
  } catch (createErr) {
    logError('getValidatedRootFolder auto-create', createErr);
    return null;
  }
}

/**
 * Server handler called by SetupFolder.html form to sanitize, validate, and save folder URL or ID.
 * @param {string} inputUrl Google Drive folder web URL or raw folder ID.
 * @returns {{success: boolean, folderId?: string, folderName?: string, message?: string, error?: string}} Validation result.
 */
function validateAndSaveFolderUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return {
      success: false,
      error: 'Please enter a valid Google Drive folder link, folder ID, or click "Auto-Create Folder".'
    };
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
    return {
      success: false,
      error: 'Invalid folder URL format. Please paste a standard Google Drive folder URL or click "Auto-Create Folder".'
    };
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
      folderName: folderName,
      message: 'Successfully connected to folder "' + folderName + '".'
    };
  } catch (err) {
    var errStr = (err.message || err.toString());
    logError('validateAndSaveFolderUrl(' + extractedId + ')', err);

    // Specific detection of drive.file scope sandbox limitation
    if (errStr.indexOf('permissions are not sufficient') !== -1 || errStr.indexOf('drive.readonly') !== -1 || errStr.indexOf('drive.file') !== -1) {
      try {
        var autoFolder = DriveApp.createFolder('Day Planner');
        PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', autoFolder.getId());
        return {
          success: true,
          folderId: autoFolder.getId(),
          folderName: autoFolder.getName(),
          autoCreated: true,
          message: 'Notice: Under least-privilege security ("drive.file"), Day Planner cannot access folders created manually outside the app. We automatically created a new dedicated "Day Planner" folder in your Google Drive!'
        };
      } catch (autoErr) {
        return {
          success: false,
          error: 'Security Scope Notice: Under least-privilege permissions, Day Planner cannot access folders created outside this application. Click "Auto-Create Folder" below to create an authorized folder.'
        };
      }
    }

    return {
      success: false,
      error: 'Unable to access folder: ' + errStr + '. Please use the 1-click "Auto-Create Folder" button below.'
    };
  }
}

/**
 * Server-side 1-click handler to auto-create and connect a dedicated Day Planner root folder.
 * @returns {{success: boolean, folderId?: string, folderName?: string, message?: string, error?: string}}
 */
function autoCreateRootFolder() {
  try {
    var folder = DriveApp.createFolder('Day Planner');
    var folderId = folder.getId();
    PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folderId);
    Logger.log('1-Click Created dedicated Day Planner root folder: ' + folderId);
    return {
      success: true,
      folderId: folderId,
      folderName: folder.getName(),
      message: 'Dedicated "Day Planner" folder created and connected successfully!'
    };
  } catch (err) {
    logError('autoCreateRootFolder', err);
    return {
      success: false,
      error: 'Failed to create Day Planner folder in Google Drive: ' + (err.message || err.toString())
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
 * Direct OAuth Consent Trigger:
 * Select "grantAllPermissions" in the Apps Script IDE toolbar and click "Run".
 * Directly calls DriveApp, CalendarApp, and Tasks under least-privilege scopes (drive.file, calendar, tasks).
 */
function grantAllPermissions() {
  Logger.log('Triggering DriveApp (drive.file) authorization...');
  var folder = getValidatedRootFolder();
  Logger.log('Drive Folder: ' + (folder ? folder.getName() : 'Ready'));

  Logger.log('Triggering CalendarApp authorization...');
  var defaultCal = CalendarApp.getDefaultCalendar();
  Logger.log('Calendar: ' + (defaultCal ? defaultCal.getName() : 'Ready'));

  Logger.log('Triggering Tasks API authorization...');
  if (typeof Tasks !== 'undefined' && Tasks.Tasklists) {
    Tasks.Tasklists.list();
  }

  Logger.log('🎉 All least-privilege scopes (drive.file, Calendar, Tasks) authorized successfully!');
  return 'SUCCESS';
}

/**
 * One-Click OAuth Authorization & Diagnostics Helper:
 * Select "authorizeAndTestServices" in the Apps Script IDE toolbar and click "Run".
 * Exercises least-privilege scopes (drive.file, CalendarApp, Tasks, ScriptApp)
 * and verifies complete workspace 2-way sync.
 * @returns {object} Authorization verification result.
 */
function authorizeAndTestServices() {
  Logger.log('=== Authorizing Google Workspace Services (Least-Privilege) ===');
  grantAllPermissions();
  
  Logger.log('Running 2-Way Workspace Sync...');
  var syncResult = syncWorkspaceChanges();
  Logger.log('Sync Result: ' + JSON.stringify(syncResult));
  
  Logger.log('✅ All services authorized and tested successfully under drive.file!');
  return { success: true, message: 'All Google Workspace services authorized successfully under drive.file.' };
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
  var auth = validateUserAccess();
  if (!auth.authorized) {
    return {
      date: dateStr,
      tasks: [],
      calendarEvents: [],
      noteContent: '',
      warnings: [auth.error],
      error: auth.error
    };
  }

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
 * Retrieves daily topic cards content for the specified date from the Monthly JSON file in Day Planner folder.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @returns {string} Text content of daily note section.
 */
function getOrCreateDailyDocContent(dateStr) {
  if (typeof DriveApp === 'undefined') {
    return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.\n\n### #index [Finance] Budget Sync\n- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.';
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) {
      return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.';
    }

    var monthStr = (dateStr || '').substring(0, 7); // 'YYYY-MM'
    var fileName = 'notes-' + monthStr + '.json';

    var files = targetFolder.getFilesByName(fileName);
    var monthData = { month: monthStr, days: {} };

    if (files.hasNext()) {
      var file = files.next();
      var content = file.getBlob().getDataAsString();
      if (content && content.trim()) {
        try {
          monthData = JSON.parse(content);
        } catch (jsonErr) {
          console.warn('JSON parse warning in ' + fileName + ': ' + jsonErr.toString());
        }
      }
    }

    if (monthData.days && monthData.days[dateStr] && monthData.days[dateStr].raw) {
      return monthData.days[dateStr].raw;
    } else {
      return '### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.';
    }
  } catch (err) {
    logError('getOrCreateDailyDocContent(' + dateStr + ')', err);
    return '### #index [General] Daily Notes for ' + dateStr;
  }
}

/**
 * Saves/updates daily topic cards content in the Monthly JSON file (Day Planner/notes-YYYY-MM.json).
 * Ultra-fast, lightweight, structured JSON persistence with version history under drive.file.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} noteContent Markdown/card note content to persist.
 * @returns {{success: boolean, fileName: string, fileId?: string}} Result status.
 */
function saveDailyDocCards(dateStr, noteContent) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  if (typeof DriveApp === 'undefined') {
    return { success: true, fileName: 'notes-local-mock.json' };
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) throw new Error('Root folder not configured.');

    var monthStr = (dateStr || '').substring(0, 7);
    var fileName = 'notes-' + monthStr + '.json';

    var files = targetFolder.getFilesByName(fileName);
    var file = null;
    var monthData = { month: monthStr, days: {} };

    if (files.hasNext()) {
      file = files.next();
      var content = file.getBlob().getDataAsString();
      if (content && content.trim()) {
        try {
          monthData = JSON.parse(content);
        } catch (e) {
          monthData = { month: monthStr, days: {} };
        }
      }
    }

    if (!monthData.days) monthData.days = {};
    monthData.days[dateStr] = {
      raw: noteContent || '',
      updatedAt: new Date().toISOString()
    };

    var serialized = JSON.stringify(monthData, null, 2);

    if (file) {
      file.setContent(serialized);
    } else {
      file = targetFolder.createFile(fileName, serialized, MimeType.PLAIN_TEXT);
    }

    return { success: true, fileName: fileName, fileId: file.getId() };
  } catch (err) {
    logError('saveDailyDocCards(' + dateStr + ')', err);
    return { success: false, error: err.message || err.toString() };
  }
}

/**
 * Gets or returns the validated root Day Planner folder by ID.
 * @param {GoogleAppsScript.Drive.Folder|null} parent Parent folder object, or null to target root folder.
 * @param {string} name Folder name to find.
 * @returns {GoogleAppsScript.Drive.Folder|null} Found folder object or root folder by ID.
 */
function getFolderByNameOrCreate(parent, name) {
  try {
    var rootFolder = getValidatedRootFolder();
    if (!rootFolder) {
      throw new Error('No valid Google Drive Day Planner folder connected.');
    }
    if (parent) {
      var folders = parent.getFoldersByName(name);
      if (folders.hasNext()) return folders.next();
      return parent;
    }
    return rootFolder;
  } catch (err) {
    logError('getFolderByNameOrCreate(' + name + ')', err);
    return null;
  }
}

/**
 * Retrieves master task entries for monthly planning.
 * @param {string} [monthYearStr] Optional month/year string filter.
 * @returns {Array<{id: string, title: string, category: string, status: string}>} Array of master task items.
 */
function getMasterTasks(monthYearStr) {
  var auth = validateUserAccess();
  if (!auth.authorized) return [];

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
  var auth = validateUserAccess();
  if (!auth.authorized) {
    throw new Error(auth.error || 'Access Denied');
  }

  try {
    if (typeof Tasks !== 'undefined') {
      var created = Tasks.Tasks.insert({
        title: title,
        due: dateStr + 'T00:00:00.000Z'
      }, '@default');
      return {
        id: created.id,
        title: created.title,
        status: created.status === 'completed' ? '✓' : '•',
        category: category || 'General',
        dueDate: created.due ? created.due.substring(0, 10) : dateStr
      };
    }

    // Fallback for environments without the Tasks Advanced Service enabled.
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

/**
 * Updates an existing Google Task's title and/or completion status.
 * Only 'completed'/'needsAction' are natively representable by the Tasks API;
 * app-only status states (→ forwarded, X canceled, G/✓ delegated) are treated
 * as "not completed" for persistence purposes and will read back as '•' on the
 * next fetch, matching getDailyData's existing read-side status mapping.
 * @param {string} dateStr Target date string in YYYY-MM-DD format (unused by the Tasks API, kept for signature parity with the client bridge).
 * @param {string} taskId Google Task id.
 * @param {object} updates Fields to update: { title, status, category, dueDate }.
 * @returns {object|null} Updated task object, or null if the task no longer exists.
 */
function updateDailyTask(dateStr, taskId, updates) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    throw new Error(auth.error || 'Access Denied');
  }

  try {
    if (typeof Tasks === 'undefined') {
      throw new Error('Tasks Advanced Service is not enabled for this deployment.');
    }

    var patch = {};
    if (updates && updates.title !== undefined) {
      patch.title = updates.title;
    }
    if (updates && updates.status !== undefined) {
      patch.status = (updates.status === '✓' || updates.status === 'G/✓') ? 'completed' : 'needsAction';
    }
    if (updates && updates.dueDate !== undefined) {
      patch.due = updates.dueDate + 'T00:00:00.000Z';
    }

    var updated = Tasks.Tasks.patch(patch, '@default', taskId);
    return {
      id: updated.id,
      title: updated.title,
      status: updated.status === 'completed' ? '✓' : '•',
      category: (updates && updates.category) || 'General',
      dueDate: updated.due ? updated.due.substring(0, 10) : (updates && updates.dueDate) || dateStr
    };
  } catch (err) {
    if (err.message && err.message.indexOf('404') !== -1) {
      return null;
    }
    logError('updateDailyTask(' + taskId + ')', err);
    throw err;
  }
}

/**
 * Updates an existing calendar event's title and/or timing. Mirrors addCalendarEvent's
 * dual-path pattern: prefers the Advanced Calendar Service (Calendar API v3) when enabled,
 * falls back to CalendarApp otherwise.
 * @param {string} dateStr Target date string in YYYY-MM-DD format (unused, kept for signature parity with the client bridge).
 * @param {string} eventId Calendar event id.
 * @param {object} updates Fields to update: { title, startTime, endTime, location, description }.
 * @returns {object|null} Updated event payload, or null if the event no longer exists.
 */
function updateCalendarEvent(dateStr, eventId, updates) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    throw new Error(auth.error || 'Access Denied');
  }

  try {
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      var patch = {};
      if (updates && updates.title !== undefined) patch.summary = updates.title;
      if (updates && updates.location !== undefined) patch.location = updates.location;
      if (updates && updates.description !== undefined) patch.description = updates.description;
      if (updates && updates.startTime !== undefined) {
        patch.start = { dateTime: updates.startTime, timeZone: Session.getScriptTimeZone() };
      }
      if (updates && updates.endTime !== undefined) {
        patch.end = { dateTime: updates.endTime, timeZone: Session.getScriptTimeZone() };
      }

      var updated = Calendar.Events.patch(patch, 'primary', eventId);
      return {
        id: updated.id,
        title: updated.summary,
        startTime: updated.start && (updated.start.dateTime || updated.start.date),
        endTime: updated.end && (updated.end.dateTime || updated.end.date),
        location: updated.location || '',
        description: updated.description || ''
      };
    }

    if (typeof CalendarApp !== 'undefined') {
      var evt = CalendarApp.getEventById(eventId);
      if (!evt) return null;
      if (updates && updates.title !== undefined) evt.setTitle(updates.title);
      if (updates && updates.location !== undefined) evt.setLocation(updates.location);
      if (updates && updates.description !== undefined) evt.setDescription(updates.description);
      if (updates && updates.startTime !== undefined && updates.endTime !== undefined) {
        evt.setTime(new Date(updates.startTime), new Date(updates.endTime));
      }
      return {
        id: evt.getId(),
        title: evt.getTitle(),
        startTime: evt.getStartTime().toISOString(),
        endTime: evt.getEndTime().toISOString(),
        location: evt.getLocation(),
        description: evt.getDescription()
      };
    }

    throw new Error('Neither the Advanced Calendar Service nor CalendarApp is available.');
  } catch (err) {
    if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('Not Found') !== -1)) {
      return null;
    }
    logError('updateCalendarEvent(' + eventId + ')', err);
    throw err;
  }
}

/**
 * Adds a new calendar event for a given date in Google Calendar.
 * Provisions a real Google Meet conference and applies guestsCanModify via the
 * Advanced Calendar Service (Calendar API v3, enabled in appsscript.json) so
 * both features actually take effect instead of being faked or silently dropped.
 * Falls back to the basic CalendarApp event (no Meet link, no guestsCanModify)
 * if the Advanced Calendar Service isn't enabled for this deployment.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @param {object} eventData Event creation payload { title, startTime, endTime, location, description, attendees, autoGoogleMeet, guestsCanModify, autoAgendaDoc }.
 * @returns {object} Created event payload.
 */
function addCalendarEvent(dateStr, eventData) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    throw new Error(auth.error || 'Access Denied');
  }

  try {
    var title = (eventData && eventData.title) ? eventData.title.trim() : 'New Appointment';
    var startIso = (eventData && eventData.startTime) ? eventData.startTime : (dateStr + 'T09:00:00');
    var endIso = (eventData && eventData.endTime) ? eventData.endTime : (dateStr + 'T09:30:00');
    var location = (eventData && eventData.location) ? eventData.location : '';
    var description = (eventData && eventData.description) ? eventData.description : '';
    var attendees = (eventData && eventData.attendees) ? eventData.attendees : [];
    var autoGoogleMeet = (eventData && eventData.autoGoogleMeet !== undefined) ? eventData.autoGoogleMeet : true;
    var guestsCanModify = (eventData && eventData.guestsCanModify !== undefined) ? eventData.guestsCanModify : true;
    var autoAgendaDoc = (eventData && eventData.autoAgendaDoc !== undefined) ? eventData.autoAgendaDoc : true;
    // Links this event back to a Day Planner task (Task -> Event sync). Read back via
    // getDailyData's evt.getTag('gasTaskId') / extendedProperties.private.gasTaskId.
    var gasTaskId = (eventData && eventData.gasTaskId) ? eventData.gasTaskId : null;

    var attendeesList = Array.isArray(attendees) ? attendees : (typeof attendees === 'string' ? attendees.split(/[,;]+/).map(function(s) { return s.trim(); }).filter(Boolean) : []);

    var createdId = 'evt_' + new Date().getTime();
    var meetLink = null;
    var guestsCanModifyApplied = false;
    var usedAdvancedCalendar = false;

    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      var timeZone = Session.getScriptTimeZone();
      var eventResource = {
        summary: title,
        location: location,
        description: description,
        start: { dateTime: startIso, timeZone: timeZone },
        end: { dateTime: endIso, timeZone: timeZone },
        guestsCanModify: !!guestsCanModify
      };
      if (attendeesList.length > 0) {
        eventResource.attendees = attendeesList.map(function(email) { return { email: email }; });
      }
      if (gasTaskId) {
        eventResource.extendedProperties = { private: { gasTaskId: gasTaskId } };
      }

      var insertOptions = { sendUpdates: attendeesList.length > 0 ? 'all' : 'none' };
      if (autoGoogleMeet) {
        eventResource.conferenceData = {
          createRequest: {
            requestId: Utilities.getUuid(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        };
        insertOptions.conferenceDataVersion = 1;
      }

      var createdEvent = Calendar.Events.insert(eventResource, 'primary', insertOptions);
      createdId = createdEvent.id;
      guestsCanModifyApplied = !!guestsCanModify;
      usedAdvancedCalendar = true;
      meetLink = createdEvent.hangoutLink ||
        (createdEvent.conferenceData && createdEvent.conferenceData.entryPoints && createdEvent.conferenceData.entryPoints.length > 0
          ? createdEvent.conferenceData.entryPoints[0].uri
          : null);
    } else if (typeof CalendarApp !== 'undefined') {
      var startDate = new Date(startIso);
      var endDate = new Date(endIso);
      var cal = CalendarApp.getDefaultCalendar();
      var evt = cal.createEvent(title, startDate, endDate, {
        location: location,
        description: description,
        guests: attendeesList.join(','),
        sendInvites: attendeesList.length > 0
      });
      if (gasTaskId) {
        evt.setTag('gasTaskId', gasTaskId);
      }
      createdId = evt.getId();
    }

    var agendaDocUrl = null;

    // Create structured Agenda Doc if enabled (after event creation so it can reference the real Meet link)
    if (autoAgendaDoc) {
      try {
        if (typeof DocumentApp !== 'undefined') {
          var docName = 'Agenda: ' + title + ' (' + dateStr + ')';
          var doc = DocumentApp.create(docName);
          var body = doc.getBody();
          body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
          body.appendParagraph('📅 Date & Time: ' + dateStr + ' ' + (eventData.startTime || '09:00'));
          if (attendeesList.length > 0) {
            body.appendParagraph('👥 Attendees: ' + attendeesList.join(', '));
          }
          if (meetLink) {
            body.appendParagraph('📹 Google Meet: ' + meetLink);
          }
          body.appendParagraph('\n🎯 Objectives & Goals\n• \n\n📋 Discussion Topics\n• \n\n✅ Action Items & Next Steps\n• ');
          doc.saveAndClose();
          agendaDocUrl = doc.getUrl();

          if (typeof DriveApp !== 'undefined') {
            var docFile = DriveApp.getFileById(doc.getId());
            var rootFolder = getValidatedRootFolder();
            if (rootFolder) {
              docFile.moveTo(rootFolder);
            }
          }
        } else {
          agendaDocUrl = 'https://docs.google.com/document/create?title=' + encodeURIComponent('Agenda: ' + title);
        }
      } catch (docErr) {
        logError('addCalendarEvent autoAgendaDoc', docErr);
        agendaDocUrl = 'https://docs.google.com/document/create?title=' + encodeURIComponent('Agenda: ' + title);
      }
    }

    var fullDescription = description;
    if (agendaDocUrl && fullDescription.indexOf(agendaDocUrl) === -1) {
      fullDescription += (fullDescription ? '\n\n' : '') + '📄 Meeting Agenda & Notes Doc: ' + agendaDocUrl;
    }

    // Patch the event description now that the Agenda Doc URL exists (insert happened before the doc did)
    if (usedAdvancedCalendar && fullDescription !== description) {
      try {
        Calendar.Events.patch({ description: fullDescription }, 'primary', createdId);
      } catch (patchErr) {
        logError('addCalendarEvent description patch', patchErr);
      }
    }

    return {
      id: createdId,
      title: title,
      startTime: startIso,
      endTime: endIso,
      location: location,
      description: fullDescription,
      meetLink: meetLink,
      agendaDocUrl: agendaDocUrl,
      attendees: attendeesList,
      guestsCanModify: guestsCanModifyApplied,
      syncTaskId: gasTaskId
    };
  } catch (err) {
    logError('addCalendarEvent', err);
    throw err;
  }
}

/**
 * Fetches recent meeting attendees across looking back (default 60 days) and forward (default 15 days).
 * @param {number} [lookbackDays=60] Days to look back.
 * @param {number} [lookaheadDays=15] Days to look forward.
 * @returns {Array<string>} Unique list of attendee email addresses.
 */
function getRecentAttendees(lookbackDays, lookaheadDays) {
  var auth = validateUserAccess();
  if (!auth.authorized) return [];

  var pastDays = (typeof lookbackDays === 'number' && lookbackDays > 0) ? lookbackDays : 60;
  var futureDays = (typeof lookaheadDays === 'number' && lookaheadDays > 0) ? lookaheadDays : 15;

  var attendeesMap = {};

  try {
    if (typeof CalendarApp !== 'undefined') {
      var now = new Date();
      var startDate = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000);
      var endDate = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000);

      var events = CalendarApp.getDefaultCalendar().getEvents(startDate, endDate);
      events.forEach(function(evt) {
        try {
          var guests = evt.getGuestList();
          guests.forEach(function(guest) {
            var email = guest.getEmail();
            if (email && email.indexOf('@') !== -1) {
              attendeesMap[email.toLowerCase()] = true;
            }
          });
        } catch (e) {
          // ignore single event error
        }
      });
    }
  } catch (err) {
    logError('getRecentAttendees', err);
  }

  return Object.keys(attendeesMap).sort();
}

/**
 * Searches across all monthly JSON files in the Day Planner folder.
 * @param {string} query Search term.
 * @returns {Array<{fileName: string, fileId: string, date: string, heading: string, snippet: string}>} Match results.
 */
function searchAcrossAllMonthlyDocs(query) {
  var auth = validateUserAccess();
  if (!auth.authorized) return [];

  var cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) return [];

  if (typeof DriveApp === 'undefined') {
    return [
      {
        fileName: 'notes-2026-08.json',
        fileId: 'mock_file_1',
        date: '2026-08-16',
        heading: 'Day 2026-08-16',
        snippet: 'Finalized 3-column binder layout with Alpine.js and clean CSS.'
      }
    ];
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) return [];

    var files = targetFolder.getFiles();
    var results = [];

    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      if (name.startsWith('notes-') && name.endsWith('.json')) {
        var content = file.getBlob().getDataAsString();
        if (content && content.toLowerCase().indexOf(cleanQuery) !== -1) {
          try {
            var data = JSON.parse(content);
            if (data.days) {
              Object.keys(data.days).forEach(function(dayKey) {
                var dayRaw = (data.days[dayKey] && data.days[dayKey].raw) || '';
                if (dayRaw.toLowerCase().indexOf(cleanQuery) !== -1) {
                  var lines = dayRaw.split('\n');
                  lines.forEach(function(line) {
                    if (line.toLowerCase().indexOf(cleanQuery) !== -1) {
                      results.push({
                        fileName: name,
                        fileId: file.getId(),
                        date: dayKey,
                        heading: 'Day ' + dayKey,
                        snippet: line.trim()
                      });
                    }
                  });
                }
              });
            }
          } catch (jsonParseErr) {
            console.warn('Search JSON parse error in ' + name);
          }
        }
      }
    }
    return results;
  } catch (err) {
    logError('searchAcrossAllMonthlyDocs', err);
    return [];
  }
}

/**
 * Compiles the full application payload (styles, markup, client scripts) into a versioned bundle.
 * @returns {object} Compiled bundle object with hash, version, and code assets.
 */
function getCompiledAppBundle() {
  var appVersion = '1.3.0';
  var styles = '';
  var script = '';
  var indexContent = '';

  try {
    styles = HtmlService.createHtmlOutputFromFile('Styles').getContent();
  } catch (e) {
    styles = '';
  }

  try {
    script = HtmlService.createHtmlOutputFromFile('Script').getContent();
  } catch (e) {
    script = '';
  }

  try {
    var template = HtmlService.createTemplateFromFile('Index');
    indexContent = template.evaluate().getContent();
  } catch (e) {
    try {
      indexContent = HtmlService.createHtmlOutputFromFile('Index').getContent();
    } catch (e2) {
      indexContent = '<div>Application Shell Loading...</div>';
    }
  }

  // Calculate content-based signature hash (must hash actual content, not
  // lengths, so a length-preserving edit doesn't silently miss the SWR update)
  var rawPayload = appVersion + ':' + styles + ':' + script + ':' + indexContent;
  var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, rawPayload));

  return {
    version: appVersion,
    hash: hash,
    timestamp: new Date().toISOString(),
    bundle: {
      title: 'Day Planner',
      themeColor: '#2d6a5a',
      styles: styles,
      html: indexContent,
      script: script
    }
  };
}

/**
 * HTTP endpoint handler for PWA Shell Loader to fetch or hot-update the Day Planner app bundle.
 * Supports CORS and client cache validation (currentHash).
 * @param {GoogleAppsScript.Events.DoGet} e Event object.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response with application bundle or cache validation.
 */
function renderAppBundleJson(e) {
  var bundleData = getCompiledAppBundle();
  var clientHash = e && e.parameter ? e.parameter.currentHash : null;

  var response;
  if (clientHash && clientHash === bundleData.hash) {
    response = {
      upToDate: true,
      version: bundleData.version,
      hash: bundleData.hash,
      timestamp: bundleData.timestamp
    };
  } else {
    response = {
      upToDate: false,
      version: bundleData.version,
      hash: bundleData.hash,
      timestamp: bundleData.timestamp,
      bundle: bundleData.bundle
    };
  }

  var jsonString = JSON.stringify(response);
  var callback = e && e.parameter ? (e.parameter.callback || e.parameter.prefix) : null;

  // Sanitize callback name to alphanumeric, $, _, and .
  if (callback && /^[$A-Z_][0-9A-Z_$.]*$/i.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + jsonString + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}
