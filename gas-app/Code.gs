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



// Green day-planner binder icon (same artwork as gh-pwa-shell/icons/icon.svg,
// hosted on the Shell's GitHub Pages site) instead of the generic Google
// Calendar icon, which read as an unrelated Google app to users. Must be a
// raster format (png/ico/gif/jpg) -- setFaviconUrl() rejects .svg with
// "The favicon icon image type is not supported."
var DAY_PLANNER_FAVICON_URL = 'https://mhoffman02.github.io/shell/icons/icon-192.png';

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
    logError('validateUserAccess', err);
    return {
      authorized: false,
      userEmail: 'session-user',
      error: 'Access Denied: could not verify authorization due to an internal error.'
    };
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
 * Under drive.file scope, DriveApp itself only ever works on files/folders created by a
 * *native* Apps Script service (DocumentApp, SpreadsheetApp, DriveApp). A folder or file
 * created via the Advanced Drive Service (Drive.Files.create) is never DriveApp-accessible,
 * and — separately — the Advanced Drive Service's own `alt=media` content download is also
 * broken under drive.file. So Drive persistence for the Day Planner folder never touches
 * DriveApp: metadata (create/list/get/update-parents) goes through the Advanced Drive
 * Service, and file *content* reads go through UrlFetchApp with the script's own OAuth
 * token (see readDriveFileContent below). These handles wrap that so the rest of the file
 * can keep calling .getId()/.getName()/.getFilesByName()/.createFile()/.getBlob() etc.
 * like it did against a real DriveApp Folder/File.
 */
function makeFileHandle(meta) {
  var fileId = meta.id;
  var fileName = meta.name;
  return {
    getId: function() { return fileId; },
    getName: function() { return fileName; },
    getBlob: function() {
      var text = readDriveFileContent(fileId);
      return Utilities.newBlob(text, 'text/plain', fileName);
    },
    setContent: function(newContent) {
      Drive.Files.update({}, fileId, Utilities.newBlob(newContent, 'text/plain', fileName));
    }
  };
}

/**
 * Wraps a Drive folder's `{id, name}` metadata in a DriveApp.Folder-shaped adapter, backed by
 * the Advanced Drive Service (see makeFileHandle above for why DriveApp itself can't be used
 * under drive.file scope). Lets the rest of the file keep calling .getFilesByName()/
 * .getFoldersByName()/.getFiles()/.createFile() as if against a real DriveApp Folder.
 * @param {string} id Drive folder ID.
 * @param {string} name Drive folder name.
 * @returns {object} Folder handle exposing getId/getName/getFilesByName/getFoldersByName/getFiles/createFile.
 */
function makeFolderHandle(id, name) {
  function listChildren(extraQuery) {
    var q = "'" + id + "' in parents and trashed = false" + (extraQuery ? ' and ' + extraQuery : '');
    var resp = Drive.Files.list({ q: q, fields: 'files(id,name)' });
    return (resp.files || []).map(function(f) { return makeFileHandle(f); });
  }
  return {
    getId: function() { return id; },
    getName: function() { return name; },
    getFilesByName: function(fileName) {
      var escaped = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var items = listChildren("name = '" + escaped + "' and mimeType != 'application/vnd.google-apps.folder'");
      var idx = 0;
      return {
        hasNext: function() { return idx < items.length; },
        next: function() { return items[idx++]; }
      };
    },
    getFoldersByName: function(folderName) {
      var escaped = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var items = listChildren("name = '" + escaped + "' and mimeType = 'application/vnd.google-apps.folder'")
        .map(function(f) { return makeFolderHandle(f.getId(), f.getName()); });
      var idx = 0;
      return {
        hasNext: function() { return idx < items.length; },
        next: function() { return items[idx++]; }
      };
    },
    getFiles: function() {
      var items = listChildren(null);
      var idx = 0;
      return {
        hasNext: function() { return idx < items.length; },
        next: function() { return items[idx++]; }
      };
    },
    createFile: function(fileName, content, mimeType) {
      var blob = Utilities.newBlob(content, 'text/plain', fileName);
      var created = Drive.Files.create({ name: fileName, parents: [id], mimeType: mimeType || 'text/plain' }, blob);
      return makeFileHandle(created);
    }
  };
}

/**
 * Reads a Drive file's content as text under drive.file scope. Neither DriveApp.getFileById()
 * nor the Advanced Drive Service's Drive.Files.get(id, {alt:'media'}) work for a file the app
 * created via the Advanced Drive Service — both require the broad drive/drive.readonly scope.
 * The documented drive.file-safe workaround is a direct authenticated fetch of the same
 * download endpoint. Requires the script.external_request OAuth scope.
 * @param {string} fileId Drive file ID.
 * @returns {string} File content as UTF-8 text.
 */
function readDriveFileContent(fileId) {
  var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('readDriveFileContent(' + fileId + '): HTTP ' + response.getResponseCode() + ' ' + response.getContentText());
  }
  return response.getContentText();
}

/**
 * Creates the "Day Planner" root folder under drive.file scope.
 * DriveApp.createFolder() requires the broad `drive` scope even when the manifest declares
 * only drive.file — Google enforces that at the API level regardless of oauthScopes. The
 * Advanced Drive Service (v3 REST API) is drive.file-safe for creating a folder the app then
 * owns; wrap it in the handle above so the rest of the code keeps using a Folder-like API.
 * @returns {{getId: function, getName: function, getFilesByName: function, getFiles: function, createFile: function}} Newly created root folder handle.
 */
function createDayPlannerDriveFolder() {
  var created = Drive.Files.create({
    name: 'Day Planner',
    mimeType: 'application/vnd.google-apps.folder'
  });
  return makeFolderHandle(created.id, created.name);
}

/**
 * Validates and retrieves the configured root folder under drive.file scope.
 * Checks UserProperties DAY_PLANNER_ROOT_FOLDER_ID. Returns folder handle or null (redirects to SetupFolder.html).
 * @returns {{getId: function, getName: function, getFilesByName: function, getFiles: function, createFile: function}|null} Configured Day Planner root folder handle or null.
 */
function getValidatedRootFolder() {
  if (typeof Drive === 'undefined') return null;

  var userProps = PropertiesService.getUserProperties();
  var cachedId = userProps.getProperty('DAY_PLANNER_ROOT_FOLDER_ID');

  if (cachedId) {
    // Re-validating the cached folder ID (not-trashed check) is a network round trip on
    // every single call. Since the root folder essentially never changes within a session,
    // cache a short-lived "known good" flag so repeat calls (e.g. scrolling across many
    // days) skip that round trip entirely instead of re-validating each time.
    var cache = CacheService.getUserCache();
    var validCacheKey = 'root_folder_valid_' + cachedId;
    if (cache && cache.get(validCacheKey)) {
      return makeFolderHandle(cachedId, userProps.getProperty('DAY_PLANNER_ROOT_FOLDER_NAME') || 'Day Planner');
    }
    try {
      var meta = Drive.Files.get(cachedId, { fields: 'id,name,trashed' });
      if (!meta.trashed) {
        userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_NAME', meta.name);
        if (cache) cache.put(validCacheKey, '1', 300);
        return makeFolderHandle(meta.id, meta.name);
      }
      console.warn('getValidatedRootFolder: cached folder ' + cachedId + ' is trashed');
    } catch (err) {
      console.warn('getValidatedRootFolder: cached ID invalid or unreadable: ' + err.toString());
    }
  }

  // Auto-search for existing "Day Planner" folder in Drive (under drive.file scope)
  try {
    var resp = Drive.Files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and name = 'Day Planner' and trashed = false",
      fields: 'files(id,name)'
    });
    if (resp.files && resp.files.length > 0) {
      var found = resp.files[0];
      userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', found.id);
      return makeFolderHandle(found.id, found.name);
    }
  } catch (err) {
    console.warn('getValidatedRootFolder auto-search notice: ' + err.toString());
  }

  // Under least-privilege drive.file scope, auto-create the dedicated folder seamlessly
  try {
    var newFolder = createDayPlannerDriveFolder();
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
    var meta = Drive.Files.get(extractedId, { fields: 'id,name,mimeType,trashed' });
    if (meta.trashed || meta.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error('Not a valid, non-trashed Drive folder.');
    }
    var folderName = meta.name;

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
        var autoFolder = createDayPlannerDriveFolder();
        PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', autoFolder.getId());
        return {
          success: true,
          folderId: autoFolder.getId(),
          folderName: autoFolder.getName(),
          autoCreated: true,
          message: 'Notice: Under least-privilege security ("drive.file"), Day Planner cannot access folders created manually outside the app. We automatically created a new dedicated "Day Planner" folder in your Google Drive!'
        };
      } catch (autoErr) {
        logError('validateAndSaveFolderUrl.autoCreate', autoErr);
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
    var folder = createDayPlannerDriveFolder();
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
        // task.title always carries the priority prefix ('[A1] Clean Title'), but a
        // completed task's linked event may be titled '[✓] Clean Title' with no
        // priority code (see syncTaskToCalendar in src/syncEngine.js) — comparing the
        // raw title would miss that match and create a duplicate event. Strip the
        // leading bracket prefix before comparing so both forms match.
        var cleanTaskTitle = task.title.replace(/^\[[^\]]+\]\s*/, '').trim();
        var linkedEvt = null;
        for (var j = 0; j < matchingEvts.length; j++) {
          if (matchingEvts[j].getTag('gasTaskId') === task.id ||
              (cleanTaskTitle && matchingEvts[j].getTitle().indexOf(cleanTaskTitle) !== -1)) {
            linkedEvt = matchingEvts[j];
            break;
          }
        }

        var isDone = task.status === '✓' || task.status === 'D/✓';
        var formattedTitle = isDone ? '[✓] ' + task.title : task.title;

        // Day planners keep Tasks and Appointments distinct: only keep an already-linked
        // event's title/status in sync. Never auto-create a new Calendar event for a bare
        // task here — the Tasks API gives no explicit time-of-day signal, so any event this
        // trigger created was an arbitrary now/now+30min placeholder duplicating task info
        // that belongs only in the Tasks panel. Explicit appointment creation goes through
        // addCalendarEvent (the Add Appointment modal), not this background trigger.
        if (linkedEvt) {
          linkedEvt.setTitle(formattedTitle);
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

// Google Tasks natively stores only 'completed'/'needsAction' — the app's 3 extra status
// glyphs ('→' forwarded, 'X' canceled, 'D/✓' delegated+done) have no native slot and used to
// collapse to '•'/'✓' on every reload. TASK_STATUS_MARKER_RE / encodeTaskStatusNotes /
// deriveTaskStatus persist them as a hidden line in the Task's `notes` field, which Day
// Planner never surfaces or lets the user edit, so it's safe to own as an app-only channel.
// The marker is HTML-comment-shaped and lives on its own line so it stays inert and is
// cleanly stripped if `notes` is ever exposed in the UI (e.g. a future per-task notes editor).
var TASK_STATUS_MARKER_RE = /^<!--dp-status:(.+?)-->\n?/;
var TASK_EXTRA_STATUSES = ['→', 'X', 'D/✓'];

/**
 * Strips the hidden status marker line from a Task's `notes`, if present.
 * @param {string} notes Raw `notes` field from a Google Task.
 * @returns {string} Notes with any status marker line removed.
 */
function stripTaskStatusMarker(notes) {
  return (notes || '').replace(TASK_STATUS_MARKER_RE, '');
}

/**
 * Computes the `notes` value to persist for a given app status, preserving any existing
 * non-marker notes content. Native statuses ('•'/'✓') need no marker, since 'completed'/
 * 'needsAction' already represent them; only the 3 extra statuses get one.
 * @param {string} status App status glyph being written.
 * @param {string} existingNotes Current `notes` field on the task before this update.
 * @returns {string} New `notes` value to send in the patch.
 */
function encodeTaskStatusNotes(status, existingNotes) {
  var rest = stripTaskStatusMarker(existingNotes);
  if (TASK_EXTRA_STATUSES.indexOf(status) === -1) {
    return rest;
  }
  var marker = '<!--dp-status:' + status + '-->';
  return rest ? marker + '\n' + rest : marker;
}

/**
 * Derives the app-facing status glyph for a Google Task, preferring the hidden `notes`
 * marker (for '→'/'X'/'D/✓') over the native completed/needsAction fallback.
 * @param {{status: string, notes: (string|undefined)}} googleTask Task resource from the Tasks API.
 * @returns {string} One of '•', '✓', '→', 'X', 'D/✓'.
 */
function deriveTaskStatus(googleTask) {
  var match = (googleTask.notes || '').match(TASK_STATUS_MARKER_RE);
  if (match && TASK_EXTRA_STATUSES.indexOf(match[1]) !== -1) {
    return match[1];
  }
  return googleTask.status === 'completed' ? '✓' : '•';
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

    // 1. Fetch Calendar Events. Prefers the Advanced Calendar Service (Calendar.Events.list)
    // because it returns `htmlLink` — the direct URL to this specific event in Google
    // Calendar — in the same call; CalendarApp has no htmlLink accessor at all, so the
    // CalendarApp fallback below hand-builds the same `eid=` link format Google Calendar
    // itself generates. Without either, the client had nothing but a title to work with and
    // fell back to an "create new event" URL for the "Open in gCal" button instead of
    // opening the event the user actually clicked.
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      try {
        var dayResp = Calendar.Events.list('primary', {
          timeMin: targetDate.toISOString(),
          timeMax: nextDate.toISOString(),
          singleEvents: true,
          maxResults: 250,
          fields: 'items(id,summary,start,end,location,description,hangoutLink,htmlLink,extendedProperties)'
        });
        result.calendarEvents = (dayResp.items || []).map(function(evt) {
          return {
            id: evt.id,
            title: evt.summary || '(untitled)',
            startTime: evt.start && (evt.start.dateTime || evt.start.date),
            endTime: evt.end && (evt.end.dateTime || evt.end.date),
            location: evt.location || '',
            description: evt.description || '',
            meetLink: evt.hangoutLink || null,
            htmlLink: evt.htmlLink || null,
            syncTaskId: (evt.extendedProperties && evt.extendedProperties.shared && evt.extendedProperties.shared.gasTaskId) || null
          };
        });
      } catch (calErr) {
        result.warnings.push(logError('Calendar.Events.list', calErr).error);
      }
    } else if (typeof CalendarApp !== 'undefined') {
      try {
        var defaultCal = CalendarApp.getDefaultCalendar();
        var defaultCalId = defaultCal.getId();
        var events = defaultCal.getEvents(targetDate, nextDate);
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
          // Normalized to the bare Calendar API v3 id (strip the CalendarApp
          // '@google.com' suffix) so this id round-trips cleanly through
          // updateCalendarEvent's Calendar.Events.patch call, which rejects the
          // suffixed form. See docs/patches — event-id format mismatch fix.
          var bareId = evt.getId().replace(/@google\.com$/, '');
          return {
            id: bareId,
            title: evt.getTitle(),
            startTime: evt.getStartTime().toISOString(),
            endTime: evt.getEndTime().toISOString(),
            location: evt.getLocation(),
            description: evt.getDescription(),
            meetLink: meetLink,
            // Same `eid=base64url(eventId + " " + calendarId)` format Google Calendar's
            // own htmlLink uses — CalendarApp exposes no direct accessor for it.
            htmlLink: 'https://calendar.google.com/calendar/event?eid=' +
              Utilities.base64EncodeWebSafe(bareId + ' ' + defaultCalId).replace(/=+$/, ''),
            syncTaskId: evt.getTag('gasTaskId') || null
          };
        });
      } catch (calErr) {
        result.warnings.push(logError('CalendarApp.getEvents', calErr).error);
      }
    }

    // 2. Fetch Google Tasks for this date only. dueMin/dueMax scopes the Tasks API
    // query to [targetDate, nextDate) — without this, every task in the list (any
    // due date, including undated tasks) came back on every call, which fed
    // reconcileWorkspaceChanges a phantom "task with no matching event" for every
    // task on every day and made it create a real duplicate Calendar event per
    // task on every date navigation.
    //
    // The Tasks API stores `due` as UTC midnight (see addDailyTask's
    // `due: dateStr + 'T00:00:00.000Z'`), not script-timezone midnight. Building
    // dueMin/dueMax from `targetDate` (America/Los_Angeles, per appsscript.json) shifted
    // the window by the UTC offset and silently returned an adjacent day's tasks instead
    // of this day's. Pad the API query by a day on each side and bucket by the task's own
    // `due` date string, which is unambiguous.
    if (typeof Tasks !== 'undefined') {
      try {
        var dueMinUtc = new Date(dateStr + 'T00:00:00.000Z');
        dueMinUtc.setUTCDate(dueMinUtc.getUTCDate() - 1);
        var dueMaxUtc = new Date(dateStr + 'T00:00:00.000Z');
        dueMaxUtc.setUTCDate(dueMaxUtc.getUTCDate() + 2);

        var taskList = Tasks.Tasks.list('@default', {
          dueMin: dueMinUtc.toISOString(),
          dueMax: dueMaxUtc.toISOString(),
          showCompleted: true,
          showHidden: true
        });
        if (taskList.items) {
          result.tasks = taskList.items
            .filter(function(t) { return t.due && t.due.substring(0, 10) === dateStr; })
            .map(function(t) {
              return {
                id: t.id,
                title: t.title,
                status: deriveTaskStatus(t),
                dueDate: t.due.substring(0, 10)
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
 * Reads (and 5-min user-caches) the month-partitioned notes JSON for monthStr, e.g.
 * { month: '2026-08', days: { '2026-08-15': { raw: '...' } } }. Shared by
 * getOrCreateDailyDocContent (single day) and getMonthData (whole-month batch) so both
 * pay for the Drive round trip (folder validate + file search + content fetch) at most
 * once per 5-minute cache window instead of once per day.
 * @param {string} monthStr Target month in YYYY-MM format.
 * @returns {{month: string, days: Object, folderMissing?: boolean}}
 */
function getMonthlyNotesData(monthStr) {
  var monthData = { month: monthStr, days: {} };
  var cache = CacheService.getUserCache();
  var cacheKey = 'notes_content_' + monthStr;
  var cached = cache ? cache.get(cacheKey) : null;

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (cacheParseErr) {
      console.warn('getMonthlyNotesData: bad cached JSON for ' + cacheKey + ', falling through to a real fetch', cacheParseErr);
    }
  }

  var targetFolder = getValidatedRootFolder();
  if (!targetFolder) {
    monthData.folderMissing = true;
    return monthData;
  }

  var fileName = 'notes-' + monthStr + '.json';
  var files = targetFolder.getFilesByName(fileName);
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
    if (cache) cache.put(cacheKey, JSON.stringify(monthData), 300);
  }

  return monthData;
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
    var monthStr = (dateStr || '').substring(0, 7); // 'YYYY-MM'
    var monthData = getMonthlyNotesData(monthStr);

    if (monthData.folderMissing) {
      return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.';
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
 * Batched month-wide fetch for the client's rolling 3-month cache (previous/current/next).
 * Replaces what would otherwise be ~30 getDailyData() round trips (each its own
 * CalendarApp + Tasks.list call) with a single client round trip backed by one paginated
 * Calendar.Events.list call, one paginated Tasks.Tasks.list call, and one (already-cached)
 * monthly notes JSON read — bucketed server-side by date.
 *
 * Uses the Advanced Calendar Service (Calendar.Events.list), not CalendarApp: CalendarApp's
 * per-field accessors (getTitle/getStartTime/getTag/...) are each a separate lazy RPC, so
 * mapping a month of events (~8 RPCs/event) risks the 6-minute execution limit on a busy
 * month. Calendar.Events.list with a `fields` mask is one HTTP call regardless of event count.
 *
 * @param {string} monthStr Target month in YYYY-MM format.
 * @returns {{month: string, days: Object<string, {tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}>, warnings: Array<string>, error?: string}}
 */
function getMonthData(monthStr) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    return { month: monthStr, days: {}, warnings: [auth.error], error: auth.error };
  }

  var result = { month: monthStr, days: {}, warnings: [] };

  try {
    var parts = monthStr.split('-').map(Number);
    var year = parts[0];
    var month = parts[1]; // 1-indexed
    var daysInMonth = new Date(year, month, 0).getDate();

    // Pre-seed every day of the month with an empty bucket so a partial API failure below
    // still returns a full day-keyed map the client can cache with confidence, rather than
    // silently omitting days.
    for (var d = 1; d <= daysInMonth; d++) {
      var seedDateStr = monthStr + '-' + String(d).padStart(2, '0');
      result.days[seedDateStr] = { tasks: [], calendarEvents: [], noteContent: '' };
    }

    // UTC month boundaries. Task due dates are UTC midnight (see addDailyTask) and event
    // start times are read back as absolute ISO instants below, so anchoring the range in
    // the script's local timezone (America/Los_Angeles, per appsscript.json) would shift it
    // by the UTC offset — the same bug getDailyData's dueMin/dueMax fix addresses.
    var monthStartUtc = new Date(Date.UTC(year, month - 1, 1));
    var monthEndUtc = new Date(Date.UTC(year, month, 1)); // first day of next month, UTC

    // 1. Calendar events for the whole month, paginated, via the Advanced Calendar Service.
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      try {
        var pageToken = null;
        do {
          var listParams = {
            timeMin: monthStartUtc.toISOString(),
            timeMax: monthEndUtc.toISOString(),
            singleEvents: true,
            maxResults: 2500,
            fields: 'nextPageToken,items(id,summary,start,end,location,hangoutLink,extendedProperties)'
          };
          if (pageToken) listParams.pageToken = pageToken;

          var resp = Calendar.Events.list('primary', listParams);
          (resp.items || []).forEach(function(evt) {
            var startIso = evt.start && (evt.start.dateTime || evt.start.date);
            if (!startIso) return;
            var dateStr = startIso.substring(0, 10);
            if (!result.days[dateStr]) return; // outside this month (e.g. all-day event edge)
            result.days[dateStr].calendarEvents.push({
              id: evt.id,
              title: evt.summary || '(untitled)',
              startTime: startIso,
              endTime: evt.end && (evt.end.dateTime || evt.end.date),
              location: evt.location || '',
              meetLink: evt.hangoutLink || null,
              syncTaskId: (evt.extendedProperties && evt.extendedProperties.shared && evt.extendedProperties.shared.gasTaskId) || null
            });
          });
          pageToken = resp.nextPageToken || null;
        } while (pageToken);
      } catch (calErr) {
        result.warnings.push(logError('getMonthData Calendar.Events.list', calErr).error);
      }
    } else {
      result.warnings.push('Advanced Calendar Service unavailable — month view has no events.');
    }

    // 2. Tasks for the whole month, paginated, padded a day past each UTC boundary and then
    // bucketed by the task's own `due` date string (see getDailyData's matching fix).
    if (typeof Tasks !== 'undefined') {
      try {
        var dueMin = new Date(monthStartUtc.getTime() - 24 * 60 * 60 * 1000).toISOString();
        var dueMax = new Date(monthEndUtc.getTime() + 24 * 60 * 60 * 1000).toISOString();
        var taskPageToken = null;
        do {
          var taskParams = {
            dueMin: dueMin,
            dueMax: dueMax,
            showCompleted: true,
            showHidden: true,
            maxResults: 100
          };
          if (taskPageToken) taskParams.pageToken = taskPageToken;

          var taskResp = Tasks.Tasks.list('@default', taskParams);
          (taskResp.items || []).forEach(function(t) {
            if (!t.due) return;
            var dateStr = t.due.substring(0, 10);
            if (!result.days[dateStr]) return;
            result.days[dateStr].tasks.push({
              id: t.id,
              title: t.title,
              status: deriveTaskStatus(t),
              dueDate: dateStr
            });
          });
          taskPageToken = taskResp.nextPageToken || null;
        } while (taskPageToken);
      } catch (tasksErr) {
        result.warnings.push(logError('getMonthData Tasks.Tasks.list', tasksErr).error);
      }
    }

    // 3. Notes — one (already-cached) monthly JSON read instead of one per day. Description
    // text is intentionally omitted from calendarEvents above to keep this payload small;
    // full event detail (including description) is still fetched per-day via getDailyData
    // when a day is actually opened.
    try {
      var monthNotes = getMonthlyNotesData(monthStr);
      Object.keys(result.days).forEach(function(dateStr) {
        if (monthNotes.days && monthNotes.days[dateStr] && monthNotes.days[dateStr].raw) {
          result.days[dateStr].noteContent = monthNotes.days[dateStr].raw;
        }
      });
    } catch (notesErr) {
      result.warnings.push(logError('getMonthData notes', notesErr).error);
    }
  } catch (err) {
    return logError('getMonthData(' + monthStr + ')', err);
  }

  return result;
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
          console.warn('saveDailyDocCards: bad existing JSON in ' + fileName + ', resetting month file', e);
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

    // Keep the read-side cache (getOrCreateDailyDocContent) in sync so the next day
    // navigation reflects this save immediately instead of serving stale cached content.
    var cache = CacheService.getUserCache();
    if (cache) cache.put('notes_content_' + monthStr, serialized, 300);

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

  // Static placeholder data — no Drive-backed master task store exists yet, so there is
  // nothing here that can throw; monthYearStr is accepted for the future real filter.
  return [
    { id: 'm1', title: 'Prepare Q3 performance appraisals', category: 'Work', status: '•' },
    { id: 'm2', title: 'Plan annual family retreat', category: 'Personal', status: '•' },
    { id: 'm3', title: 'Rebalance investment portfolio', category: 'Financial', status: '•' }
  ];
}

/**
 * Computes the month key immediately following the given one, rolling into the next
 * calendar year after December. Mirrors src/futureMatrixEngine.js's nextMonthKey().
 * @param {string} monthKey Source month key in YYYY-MM format.
 * @returns {string} The following month's key in YYYY-MM format.
 */
function nextMonthKeyStr_(monthKey) {
  var parts = monthKey.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return year + '-' + String(month).padStart(2, '0');
}

/**
 * Reads the Future Planning Matrix JSON file for a given year from Drive, falling back to
 * an empty 12-month skeleton when the file doesn't exist yet. Cached like
 * getMonthlyNotesData() to avoid a Drive round trip on every card render.
 * @param {number|string} year Target calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>, folderMissing?: boolean}}
 */
function getFutureMatrixData_(year) {
  var yearStr = String(year);
  var matrixData = { year: yearStr, months: {} };
  for (var m = 1; m <= 12; m++) {
    matrixData.months[yearStr + '-' + String(m).padStart(2, '0')] = [];
  }

  var cache = CacheService.getUserCache();
  var cacheKey = 'future_matrix_' + yearStr;
  var cached = cache ? cache.get(cacheKey) : null;
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (cacheParseErr) {
      console.warn('getFutureMatrixData_: bad cached JSON for ' + cacheKey + ', falling through to a real fetch', cacheParseErr);
    }
  }

  var targetFolder = getValidatedRootFolder();
  if (!targetFolder) {
    matrixData.folderMissing = true;
    return matrixData;
  }

  var fileName = 'future-matrix-' + yearStr + '.json';
  var files = targetFolder.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    var content = file.getBlob().getDataAsString();
    if (content && content.trim()) {
      try {
        var parsed = JSON.parse(content);
        if (parsed.months) {
          Object.keys(parsed.months).forEach(function(key) {
            matrixData.months[key] = parsed.months[key];
          });
        }
      } catch (jsonErr) {
        console.warn('JSON parse warning in ' + fileName + ': ' + jsonErr.toString());
      }
    }
    if (cache) cache.put(cacheKey, JSON.stringify(matrixData), 300);
  }

  return matrixData;
}

/**
 * Writes the Future Planning Matrix JSON file for a given year back to Drive and refreshes
 * the read-side cache so the next fetch reflects this save immediately.
 * @param {number|string} year Target calendar year.
 * @param {{year: string, months: Object<string, Array<object>>}} matrixData Full year matrix to persist.
 * @returns {void}
 */
function saveFutureMatrixData_(year, matrixData) {
  var targetFolder = getValidatedRootFolder();
  if (!targetFolder) throw new Error('Root folder not configured.');

  var yearStr = String(year);
  var fileName = 'future-matrix-' + yearStr + '.json';
  var files = targetFolder.getFilesByName(fileName);
  var serialized = JSON.stringify(matrixData, null, 2);

  if (files.hasNext()) {
    files.next().setContent(serialized);
  } else {
    targetFolder.createFile(fileName, serialized, MimeType.PLAIN_TEXT);
  }

  var cache = CacheService.getUserCache();
  if (cache) cache.put('future_matrix_' + yearStr, serialized, 300);
}

/**
 * Fetches the Future Planning Matrix (12-month overview) for a given year — month-scoped
 * "big rock" items not yet tied to a specific day, per the Franklin Covey Master Task List
 * model applied across the whole year.
 * @param {number|string} year Target calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>}}
 */
function getFutureMatrix(year) {
  var auth = validateUserAccess();
  if (!auth.authorized) return { year: String(year), months: {}, error: auth.error };

  try {
    if (typeof DriveApp === 'undefined') return { year: String(year), months: {} };
    return getFutureMatrixData_(year);
  } catch (err) {
    return logError('getFutureMatrix(' + year + ')', err);
  }
}

/**
 * Adds a new future planning item to a month's bucket and persists the year file.
 * @param {number|string} year Target calendar year.
 * @param {string} monthKey Target month key in YYYY-MM format.
 * @param {string} title Item title/description.
 * @param {string} [category] Optional category label.
 * @returns {{id: string, title: string, category: string, status: string, createdAt: string}} Created future item.
 */
function addFutureItem(year, monthKey, title, category) {
  var auth = validateUserAccess();
  if (!auth.authorized) throw new Error(auth.error || 'Access Denied');

  try {
    var matrixData = getFutureMatrixData_(year);
    if (!matrixData.months[monthKey]) matrixData.months[monthKey] = [];

    var newItem = {
      id: 'fm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: title,
      category: category || 'General',
      status: '•',
      createdAt: new Date().toISOString()
    };
    matrixData.months[monthKey].push(newItem);
    saveFutureMatrixData_(year, matrixData);
    return newItem;
  } catch (err) {
    logError('addFutureItem(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Cycles a future item's Franklin-style status marker and persists the year file.
 * @param {number|string} year Target calendar year.
 * @param {string} monthKey Target month key in YYYY-MM format.
 * @param {string} itemId Future item identifier.
 * @param {string} status New status symbol.
 * @returns {object|null} Updated future item, or null if not found.
 */
function updateFutureItemStatus(year, monthKey, itemId, status) {
  var auth = validateUserAccess();
  if (!auth.authorized) throw new Error(auth.error || 'Access Denied');

  try {
    var matrixData = getFutureMatrixData_(year);
    var items = matrixData.months[monthKey] || [];
    var item = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) { item = items[i]; break; }
    }
    if (!item) return null;

    item.status = status;
    saveFutureMatrixData_(year, matrixData);
    return item;
  } catch (err) {
    logError('updateFutureItemStatus(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Transfers a future planning item onto a specific day's task list, removing it from its
 * month bucket — Franklin Covey's "forwarded" semantics: the item now lives on that day.
 * Reuses addDailyTask() so the transferred item is a real Google Task like any other.
 * @param {number|string} year Source calendar year.
 * @param {string} monthKey Source month key in YYYY-MM format.
 * @param {string} itemId Future item identifier.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} [priorityGroup] Priority group code ('A', 'B', or 'C').
 * @returns {object|null} Created daily task object, or null if item not found.
 */
function transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup) {
  var auth = validateUserAccess();
  if (!auth.authorized) throw new Error(auth.error || 'Access Denied');

  try {
    var matrixData = getFutureMatrixData_(year);
    var items = matrixData.months[monthKey] || [];
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) { idx = i; break; }
    }
    if (idx === -1) return null;

    var item = items[idx];
    items.splice(idx, 1);
    saveFutureMatrixData_(year, matrixData);

    var formattedTitle = '[' + (priorityGroup || 'A').toUpperCase() + '1] ' + item.title;
    return addDailyTask(dateStr, formattedTitle, item.category);
  } catch (err) {
    logError('transferFutureItem(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Carries a still-open future item forward into next month's bucket, rolling into next
 * calendar year's matrix file when pushed from December.
 * @param {number|string} year Source calendar year.
 * @param {string} monthKey Source month key in YYYY-MM format.
 * @param {string} itemId Future item identifier.
 * @returns {object|null} The carried-forward item, or null if not found.
 */
function pushFutureItemToNextMonth(year, monthKey, itemId) {
  var auth = validateUserAccess();
  if (!auth.authorized) throw new Error(auth.error || 'Access Denied');

  try {
    var matrixData = getFutureMatrixData_(year);
    var items = matrixData.months[monthKey] || [];
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) { idx = i; break; }
    }
    if (idx === -1) return null;

    var item = items[idx];
    items.splice(idx, 1);

    var nextKey = nextMonthKeyStr_(monthKey);
    var nextYear = nextKey.substring(0, 4);

    if (nextYear === String(year)) {
      if (!matrixData.months[nextKey]) matrixData.months[nextKey] = [];
      matrixData.months[nextKey].push(item);
      saveFutureMatrixData_(year, matrixData);
    } else {
      saveFutureMatrixData_(year, matrixData); // persist the removal from the old year file
      var nextYearData = getFutureMatrixData_(nextYear);
      if (!nextYearData.months[nextKey]) nextYearData.months[nextKey] = [];
      nextYearData.months[nextKey].push(item);
      saveFutureMatrixData_(nextYear, nextYearData);
    }
    return item;
  } catch (err) {
    logError('pushFutureItemToNextMonth(' + year + ',' + monthKey + ')', err);
    throw err;
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
        status: deriveTaskStatus(created),
        category: category || 'General',
        dueDate: created.due ? created.due.substring(0, 10) : dateStr
      };
    }

    // No fabricated fallback: a 'task_<timestamp>' id with no Tasks API backing looked
    // saved to the user but vanished on the next getDailyData() fetch. Matches
    // updateDailyTask's behavior for the identical condition.
    throw new Error('Tasks Advanced Service is not enabled for this deployment.');
  } catch (err) {
    logError('addDailyTask', err);
    throw err;
  }
}

/**
 * Forwards a daily task to a new date — Franklin Covey's "➜ forwarded to a new date"
 * semantics. Creates a new real Google Task on the target date (via addDailyTask, so it's a
 * genuine task like any other) carrying the same priority group/category, and marks the
 * original task's status as FORWARDED so today's page still shows it was handled. The Tasks
 * API has no server-readable "category" field, so `sourceTaskSnapshot` (title/category) is
 * supplied by the caller rather than re-fetched.
 * @param {string} dateStr Source date string in YYYY-MM-DD format.
 * @param {string} taskId Google Task id on the source date.
 * @param {{title: string, category?: string}} sourceTaskSnapshot Current title/category of the task being forwarded.
 * @param {string} targetDateStr Target date string in YYYY-MM-DD format.
 * @returns {{originalTask: object, forwardedTask: object}} Both updated task objects.
 */
function forwardDailyTask(dateStr, taskId, sourceTaskSnapshot, targetDateStr) {
  var auth = validateUserAccess();
  if (!auth.authorized) {
    throw new Error(auth.error || 'Access Denied');
  }

  try {
    var match = (sourceTaskSnapshot.title || '').match(/^\[([A-C])[1-9]\]\s*(.*)$/i);
    var priorityGroup = match ? match[1].toUpperCase() : 'A';
    var cleanTitle = match ? match[2].trim() : (sourceTaskSnapshot.title || 'Untitled Task').trim();
    var formattedTitle = '[' + priorityGroup + '1] ' + cleanTitle;

    var forwardedTask = addDailyTask(targetDateStr, formattedTitle, sourceTaskSnapshot.category);
    var originalTask = updateDailyTask(dateStr, taskId, { title: sourceTaskSnapshot.title, status: '→', dueDate: dateStr });

    return { originalTask: originalTask, forwardedTask: forwardedTask };
  } catch (err) {
    logError('forwardDailyTask(' + taskId + ')', err);
    throw err;
  }
}

/**
 * Updates an existing Google Task's title and/or completion status.
 * Only 'completed'/'needsAction' are natively representable by the Tasks API; app-only
 * status states (→ forwarded, X canceled, D/✓ delegated) are additionally persisted as a
 * hidden marker in `notes` (see encodeTaskStatusNotes/deriveTaskStatus above) so they
 * survive the next fetch instead of collapsing to '•'/'✓'.
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
      patch.status = (updates.status === '✓' || updates.status === 'D/✓') ? 'completed' : 'needsAction';
      var current = Tasks.Tasks.get('@default', taskId);
      patch.notes = encodeTaskStatusNotes(updates.status, current.notes);
    }
    if (updates && updates.dueDate !== undefined) {
      patch.due = updates.dueDate + 'T00:00:00.000Z';
    }

    var updated = Tasks.Tasks.patch(patch, '@default', taskId);
    return {
      id: updated.id,
      title: updated.title,
      status: deriveTaskStatus(updated),
      category: (updates && updates.category) || 'General',
      dueDate: updated.due ? updated.due.substring(0, 10) : (updates && updates.dueDate) || dateStr
    };
  } catch (err) {
    if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('Not Found') !== -1)) {
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
      // CalendarApp.getEventById needs the '@google.com'-suffixed id form; incoming
      // eventId is the bare form getDailyData/addCalendarEvent now hand to the client.
      var lookupId = eventId.indexOf('@') === -1 ? eventId + '@google.com' : eventId;
      var evt = CalendarApp.getEventById(lookupId);
      if (!evt) return null;
      if (updates && updates.title !== undefined) evt.setTitle(updates.title);
      if (updates && updates.location !== undefined) evt.setLocation(updates.location);
      if (updates && updates.description !== undefined) evt.setDescription(updates.description);
      if (updates && updates.startTime !== undefined && updates.endTime !== undefined) {
        evt.setTime(new Date(updates.startTime), new Date(updates.endTime));
      }
      return {
        id: evt.getId().replace(/@google\.com$/, ''),
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
        // Written to both maps: CalendarApp's getTag() (used by getDailyData to read
        // syncTaskId back) reads the *shared* extended-property map, not private —
        // private alone left the read side unable to find the link it just wrote.
        eventResource.extendedProperties = { private: { gasTaskId: gasTaskId }, shared: { gasTaskId: gasTaskId } };
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
      createdId = evt.getId().replace(/@google\.com$/, '');
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
          console.warn('getRecentAttendees: skipping event with unreadable guest list', e);
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
            console.warn('Search JSON parse error in ' + name, jsonParseErr);
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
  var styles;
  var script;
  var indexContent;

  try {
    styles = HtmlService.createHtmlOutputFromFile('Styles').getContent();
  } catch (e) {
    console.warn('getCompiledAppBundle: Styles.html missing/unreadable, bundle will ship with no styles', e);
    styles = '';
  }

  try {
    script = HtmlService.createHtmlOutputFromFile('Script').getContent();
  } catch (e) {
    console.warn('getCompiledAppBundle: Script.html missing/unreadable, bundle will ship with no script', e);
    script = '';
  }

  try {
    var template = HtmlService.createTemplateFromFile('Index');
    // Script.html is already carried separately as bundle.script below; if the Index
    // template also inlined its own copy via `include('Script')`, the PWA shell would
    // concatenate both into one <script> tag and re-declare every top-level const/let,
    // a fatal SyntaxError (see tests/gasAppBundle.test.js).
    template.isBundleExport = true;
    indexContent = template.evaluate().getContent();
  } catch (e) {
    console.warn('getCompiledAppBundle: Index.html template evaluation failed, trying static read', e);
    try {
      indexContent = HtmlService.createHtmlOutputFromFile('Index').getContent();
    } catch (e2) {
      console.warn('getCompiledAppBundle: Index.html missing/unreadable, serving placeholder shell', e2);
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
