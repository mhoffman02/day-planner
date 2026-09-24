"use strict";

/**
 * @file Code.gs
 * @description Day Planner Google Apps Script server-side entry points, Drive folder management, error logging, and data handlers.
 * Robust Architecture with centralized error handling using console.error for stack tracing.
 * Uses strict drive.file scope with user-configured root folder ID.
 *
 * Wrapped in a single IIFE (all .gs files in a project share one global scope) so only the
 * functions in the export list at the bottom are reachable from web-app clients
 * (`google.script.run`/`_runGasCall`), HtmlService templates, time-driven triggers (referenced
 * by name string), or the Apps Script IDE's manual-run dropdown. Everything else here is a
 * private helper invisible outside this file. Existing indentation is left as-is (JS doesn't
 * care) to keep this a pure wrap with no line-by-line diff. See
 * .agents/rules/gas-namespace-iife.md before adding or removing an export.
 */

(function(global) {

var MAX_RING_LOGS_ = 25;

/**
 * Records a structured execution log entry into a persistent UserProperties ring buffer.
 * @param {'ERROR'|'WARN'|'INFO'} level Log severity level.
 * @param {string} context Descriptive context or operation name.
 * @param {string} message Log message.
 * @param {string|null} [stack] Optional error stack trace.
 */
function recordServerLog(level, context, message, stack) {
  try {
    var userProps = PropertiesService.getUserProperties();
    var raw = userProps.getProperty('RECENT_SERVER_LOGS');
    var logs = [];
    if (raw) {
      try {
        logs = JSON.parse(raw);
        if (!Array.isArray(logs)) logs = [];
      } catch (parseErr) {
        console.warn('recordServerLog parse exception: ' + parseErr.toString());
        logs = [];
      }
    }

    logs.unshift({
      timestamp: new Date().toISOString(),
      level: level || 'INFO',
      context: context || 'general',
      message: String(message || ''),
      stack: stack || null
    });

    if (logs.length > MAX_RING_LOGS_) {
      logs = logs.slice(0, MAX_RING_LOGS_);
    }

    userProps.setProperty('RECENT_SERVER_LOGS', JSON.stringify(logs));
  } catch (propErr) {
    console.warn('recordServerLog storage exception: ' + propErr.toString());
  }

  // Also persist to the permanent Google Doc Run Log in the user's Day Planner folder
  try {
    appendRunLogToDoc_(level, context, message, stack);
  } catch (docLogErr) {
    console.warn('appendRunLogToDoc_ trigger exception: ' + docLogErr.toString());
  }
}

/**
 * Appends a log entry to the permanent 'Day Planner - Run Log' Google Doc located
 * in the user's Day Planner Drive folder.
 * @param {'ERROR'|'WARN'|'INFO'} level Log severity.
 * @param {string} context Operation context.
 * @param {string} message Log message.
 * @param {string|null} [stack] Stack trace if available.
 */
function appendRunLogToDoc_(level, context, message, stack) {
  if (typeof DocumentApp === 'undefined') return;

  try {
    var userProps = PropertiesService.getUserProperties();
    var cachedDocId = userProps.getProperty('DAY_PLANNER_RUN_LOG_DOC_ID');
    var doc = null;

    if (cachedDocId) {
      try {
        doc = DocumentApp.openById(cachedDocId);
      } catch (openErr) {
        console.warn('cachedDocId open exception: ' + openErr.toString());
        userProps.deleteProperty('DAY_PLANNER_RUN_LOG_DOC_ID');
        doc = null;
      }
    }

    if (!doc) {
      var targetFolder = getValidatedRootFolder();
      if (!targetFolder) return;

      var docName = 'Day Planner - Run Log';
      var files = targetFolder.getFilesByName(docName);
      if (files.hasNext()) {
        doc = DocumentApp.openById(files.next().getId());
      } else {
        if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
          try {
            var newFile = Drive.Files.insert({
              title: docName,
              mimeType: 'application/vnd.google-apps.document',
              parents: [{ id: targetFolder.getId() }]
            });
            doc = DocumentApp.openById(newFile.id);
          } catch (driveErr) {
            console.warn('Drive.Files.insert run log fallback: ' + driveErr.toString());
          }
        }

        if (!doc) {
          doc = DocumentApp.create(docName);
          try {
            var docFile = DriveApp.getFileById(doc.getId());
            docFile.moveTo(targetFolder);
          } catch (moveErr) {
            console.warn('fallback moveTo skipped: ' + moveErr.toString());
          }
        }

        var headerBody = doc.getBody();
        headerBody.appendParagraph('Day Planner - System Diagnostics & Run Log')
          .setHeading(DocumentApp.ParagraphHeading.HEADING1);
        headerBody.appendParagraph('Permanent audit log of server-side events, warnings, and error diagnostics.')
          .setFontSize(10).setForegroundColor('#5c6b66');
        headerBody.appendHorizontalRule();
        doc.saveAndClose();
        doc = DocumentApp.openById(doc.getId());
      }

      if (doc) {
        userProps.setProperty('DAY_PLANNER_RUN_LOG_DOC_ID', doc.getId());
      }
    }

    if (!doc) return;

    var body = doc.getBody();
    var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss');
    var logLine = '[' + timeStr + '] [' + (level || 'INFO') + '] [' + (context || 'general') + '] ' + (message || '');
    var p = body.appendParagraph(logLine);
    p.setFontFamily('Consolas');
    p.setFontSize(9);

    if (level === 'ERROR') {
      p.setForegroundColor('#c62828').setBold(true);
    } else if (level === 'WARN') {
      p.setForegroundColor('#e65100').setBold(true);
    } else {
      p.setForegroundColor('#1c2826');
    }

    if (stack) {
      var pStack = body.appendParagraph(stack);
      pStack.setFontFamily('Consolas');
      pStack.setFontSize(8);
      pStack.setForegroundColor('#5c6b66');
      pStack.setIndentStart(24);
    }

    doc.saveAndClose();
  } catch (err) {
    console.warn('appendRunLogToDoc_ exception: ' + err.toString());
  }
}

/**
 * Retrieves the URL to the 'Day Planner - Run Log' Google Document.
 * @returns {string|null} Google Docs URL or null if not yet created.
 */
function getRunLogDocUrl() {
  try {
    var userProps = PropertiesService.getUserProperties();
    var cachedDocId = userProps.getProperty('DAY_PLANNER_RUN_LOG_DOC_ID');
    if (cachedDocId) {
      return 'https://docs.google.com/document/d/' + cachedDocId + '/edit';
    }
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) return null;
    var files = targetFolder.getFilesByName('Day Planner - Run Log');
    if (files.hasNext()) {
      var id = files.next().getId();
      userProps.setProperty('DAY_PLANNER_RUN_LOG_DOC_ID', id);
      return 'https://docs.google.com/document/d/' + id + '/edit';
    }
  } catch (err) {
    console.warn('getRunLogDocUrl exception: ' + err.toString());
    return null;
  }
}

/**
 * Retrieves the recent execution logs from UserProperties.
 * @returns {Array<{timestamp: string, level: string, context: string, message: string, stack: string|null}>} Recent logs list.
 */
function getRecentServerLogs() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty('RECENT_SERVER_LOGS');
    if (!raw) return [];
    var logs = JSON.parse(raw);
    return Array.isArray(logs) ? logs : [];
  } catch (err) {
    return [{ timestamp: new Date().toISOString(), level: 'ERROR', context: 'getRecentServerLogs', message: err.toString(), stack: err.stack || null }];
  }
}

/**
 * Clears the persistent execution log ring buffer.
 * @returns {{success: boolean}} Operation status.
 */
function clearRecentServerLogs() {
  try {
    PropertiesService.getUserProperties().deleteProperty('RECENT_SERVER_LOGS');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Centralized error logging utility. Logs formatted error and stack trace to console.error
 * and records to the in-app execution log ring buffer.
 * @param {string} context Descriptive name or operation context where the error occurred.
 * @param {Error|object|string} err The thrown Error object or error message.
 * @returns {{success: boolean, error: string, stack: string|null, context: string}} Standardized error payload.
 */
function logError(context, err) {
  var errorMsg = '🔥 ' + context + ': ' + (err ? (err.message || err.toString()) : 'Unknown error');
  var stack = (err && err.stack) ? err.stack : null;
  console.error(errorMsg + '\nStack:\n' + (stack || 'No stack trace available'));
  recordServerLog('ERROR', context, errorMsg, stack);
  return {
    success: false,
    error: errorMsg,
    stack: stack,
    context: context
  };
}

/**
 * Warning logging helper. Logs to console.warn and records to the in-app execution log ring buffer.
 * @param {string} context Descriptive context or operation name.
 * @param {string} message Warning message.
 * @param {string|null} [stack] Optional stack trace.
 */
function logWarn(context, message, stack) {
  var warnMsg = '⚠️ ' + context + ': ' + (message || '');
  console.warn(warnMsg + (stack ? '\nStack:\n' + stack : ''));
  recordServerLog('WARN', context, warnMsg, stack || null);
}

/**
 * Google Docs custom menu trigger. Adds "Planner 📖" custom menu to Google Docs interface when opened.
 * @param {object} e Open event parameter.
 * @returns {void}
 */
function onOpen() {
  if (typeof DocumentApp !== 'undefined') {
    try {
      var ui = DocumentApp.getUi();
      ui.createMenu('Planner 📖')
        .addItem('🔍 Search Across All Months...', 'showCrossMonthSearchSidebar')
        .addItem('📌 View #index Decision Registry', 'showIndexRegistrySidebar')
        .addSeparator()
        .addItem('📅 Open Day Planner Web App', 'openPlannerWebAppDialog')
        .addToUi();
    } catch (err) {
      console.log('onOpen custom menu notice: ' + err.toString());
    }
  }
}

var DAY_PLANNER_FAVICON_URL = 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png';

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
function doGet_original(e) {
  try {
    console.info('doGet: ' + JSON.stringify(e, null, 2));

    // 0. Check for log maintenance actions
    if (e && e.parameter && e.parameter.clear_logs === '1') {
      clearRecentServerLogs();
    }

    // Check if requested raw JSON execution logs endpoint
    if (e && e.parameter && (e.parameter.view === 'logs' || e.parameter.logs === '1') && e.parameter.format === 'json') {
      return ContentService.createTextOutput(JSON.stringify(getRecentServerLogs(), null, 2))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Check if requested /self-test diagnostic endpoint (via pathInfo or query param)
    var isSelfTest = e && (
      (e.pathInfo && (e.pathInfo.indexOf('self-test') !== -1 || e.pathInfo.indexOf('selftest') !== -1 || e.pathInfo.indexOf('logs') !== -1)) ||
      (e.parameter && (e.parameter.view === 'self-test' || e.parameter['self-test'] !== undefined || e.parameter.post === '1' || e.parameter.view === 'logs' || e.parameter.logs === '1'))
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
    return HtmlService.createHtmlOutput('<h3>🔥 Day Planner Render Failure</h3><p><b>' + escapeHtml_(fail.error) + '</b></p><pre>' + escapeHtml_(fail.stack || '') + '</pre>')
      .setTitle('Day Planner - Render Failure')
      .setFaviconUrl(DAY_PLANNER_FAVICON_URL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }
}

/**
 * Safe HTML escaping helper to prevent XSS when rendering server-side error output.
 * @param {string} str Raw string.
 * @returns {string} Escaped HTML string.
 */
function escapeHtml_(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates and retrieves the configured root folder under drive.file scope.
 * Checks UserProperties DAY_PLANNER_ROOT_FOLDER_ID. Returns folder or null (redirects to SetupFolder.html).
 * Synchronized with LockService.getUserLock() to prevent race conditions during folder discovery.
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
      logWarn('getValidatedRootFolder', 'cached ID invalid or unreadable: ' + err.toString(), err.stack);
    }
  }

  // From here on (search-then-adopt), concurrent executions under the SAME account --
  // parallel google.script.run calls on page load, the 5-min sync trigger overlapping a
  // manual visit, or a retry from validateAndSaveFolderUrl() -- could
  // otherwise each pass the "no cached ID yet" check and independently adopt or create their own
  // folder before any of them has written DAY_PLANNER_ROOT_FOLDER_ID. Serialize
  // per-user so only one execution at a time can reach the adopt/create step.
  var lock = LockService.getUserLock();
  var lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(10000);
    if (!lockAcquired) {
      logWarn('getValidatedRootFolder', 'lock timed out after 10s (contended by a concurrent execution), proceeding unlocked');
    }
  } catch (lockErr) {
    logWarn('getValidatedRootFolder', 'lock acquisition threw, proceeding unlocked: ' + lockErr.toString());
  }

  try {
    // Re-check the cache now that we (may) hold the lock
    var relockedId = userProps.getProperty('DAY_PLANNER_ROOT_FOLDER_ID');
    if (relockedId) {
      try {
        return DriveApp.getFolderById(relockedId);
      } catch (relockedErr) {
        logWarn('getValidatedRootFolder', 'relocked ID invalid or unreadable: ' + relockedErr.toString(), relockedErr.stack);
      }
    }

    // Auto-search for existing "Day Planner" folder in Drive (under drive.file scope)
    try {
      var folders = DriveApp.getFoldersByName('Day Planner');
      while (folders.hasNext()) {
        var folder = folders.next();
        var isOwner = true;
        try {
          var owner = folder.getOwner();
          var userEmail = Session.getActiveUser().getEmail();
          if (owner && owner.getEmail() && userEmail) {
            isOwner = (owner.getEmail().toLowerCase() === userEmail.toLowerCase());
          }
        } catch (ownerErr) {
          // In some restricted environments getOwner() may throw; proceed safely
        }
        if (isOwner) {
          userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folder.getId());
          return folder;
        }
      }
    } catch (err) {
      console.warn('getValidatedRootFolder auto-search notice: ' + err.toString() + '\nStack:\n' + (err.stack || 'No stack trace available'));
    }

    // Fallback: Check known default folder ID if accessible under drive.file
    try {
      var defaultFolder = DriveApp.getFolderById('1N2WRrFmtsAWKgqeaFIj9HtiQ2wupFEk0');
      if (defaultFolder) {
        userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', '1N2WRrFmtsAWKgqeaFIj9HtiQ2wupFEk0');
        return defaultFolder;
      }
    } catch (defaultFolderErr) {
      console.warn('Known folder lookup skipped: ' + defaultFolderErr.toString());
    }

    // Auto-create "Day Planner" root folder if none exists
    try {
      var newFolder = DriveApp.createFolder('Day Planner');
      if (newFolder) {
        userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', newFolder.getId());
        return newFolder;
      }
    } catch (createErr) {
      console.warn('getValidatedRootFolder auto-create notice: ' + createErr.toString());
    }

    // No valid folder cached, found, or created; return null to trigger SetupFolder.html
    return null;
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (relErr) {
        console.warn('getValidatedRootFolder: lock release threw: ' + relErr.toString());
      }
    }
  }
}

/**
 * Server handler called by SetupFolder.html form to sanitize, validate, and save folder URL or ID.
 * Enforces folder ownership check to ensure only user-owned folders are connected as notes stores.
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

    // Folder ownership validation: Day Planner refuses to connect a folder someone else merely shared
    var isOwner = true;
    try {
      var owner = folder.getOwner();
      var currentUser = Session.getActiveUser().getEmail();
      if (owner && owner.getEmail() && currentUser) {
        isOwner = (owner.getEmail().toLowerCase() === currentUser.toLowerCase());
      }
    } catch (e) {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
        var meta = Drive.Files.get(extractedId, { fields: 'owners(me)' });
        isOwner = meta.owners && meta.owners.length > 0 && meta.owners.some(function(o) { return o.me; });
      }
    }

    if (!isOwner) {
      return {
        success: false,
        error: 'Folder is not owned by this account -- refusing to connect a shared folder as the notes store.'
      };
    }

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
          if (matchingEvts[j].getTag('gasTaskId') === task.id) {
            linkedEvt = matchingEvts[j];
            break;
          }
        }

        if (linkedEvt) {
          var isDone = task.status === '✓' || task.status === 'Ⓓ' || task.status === 'D/✓';
          var formattedTitle = isDone ? '[✓] ' + task.title : task.title;
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

var TASK_STATUS_MARKER_RE = /(?:^<!--dp-status:(.+?)-->\n?|\[Status:\s*([^\]]+)\]\n?)/m;
var TASK_EXTRA_STATUSES = ['○', '→', 'X', 'Ⓓ'];
var DP_TOKEN_LINE_RE = /^<!--dp-(?:status|meta):.*?-->\n?/gm;
var TASK_META_MARKER_RE = /<!--dp-meta:(.*?)-->\n?/;
var DP_HUMAN_TAGS_RE = /\[(?:Category|Starred|Master|MovedTo|SourceMaster|Status):.*?\]\n?/gi;

/**
 * Strips the hidden status marker line from a Task's notes, if present.
 * @param {string} notes Raw notes field from a Google Task.
 * @returns {string} Notes with any status marker line removed.
 */
function stripTaskStatusMarker(notes) {
  return (notes || '')
    .replace(/^<!--dp-status:.+?-->\n?/gm, '')
    .replace(/\[Status:\s*[^\]]+\]\n?/gi, '')
    .trim();
}

/**
 * Strips all hidden dp-status, dp-meta markers and bracketed metadata tags from notes for display in UI.
 * @param {string} notes Raw notes field from a Google Task.
 * @returns {string} Clean user notes.
 */
function stripDpTokens(notes) {
  return (notes || '')
    .replace(DP_TOKEN_LINE_RE, '')
    .replace(DP_HUMAN_TAGS_RE, '')
    .trim();
}

/**
 * Computes the notes value to persist for a given app status.
 * @param {string} status App status glyph being written.
 * @param {string} existingNotes Current notes field on the task before this update.
 * @returns {string} New notes value to send in the patch.
 */
function encodeTaskStatusNotes(status, existingNotes) {
  var rest = stripTaskStatusMarker(existingNotes);
  if (TASK_EXTRA_STATUSES.indexOf(status) === -1 && status !== 'D/✓') {
    return rest;
  }
  var cleanStatus = status === 'D/✓' ? 'Ⓓ' : status;
  var marker = '[Status: ' + cleanStatus + ']';
  return rest ? rest + '\n\n' + marker : marker;
}

/**
 * Derives the app-facing status glyph for a Google Task.
 * @param {object} googleTask Task resource from the Tasks API.
 * @returns {string} One of '•', '○', '✓', '→', 'X', 'Ⓓ'.
 */
function deriveTaskStatus(googleTask) {
  var notes = googleTask.notes || '';
  var match = notes.match(TASK_STATUS_MARKER_RE);
  if (match) {
    var raw = (match[1] || match[2] || '').trim();
    if (raw === 'D/✓' || raw === 'Ⓓ') return 'Ⓓ';
    if (TASK_EXTRA_STATUSES.indexOf(raw) !== -1) return raw;
  }
  return googleTask.status === 'completed' ? '✓' : '•';
}

/**
 * Decodes the app-metadata blob from a Task's notes.
 * Supports legacy JSON <!--dp-meta:...--> and human-readable [Category: ...] tags.
 * @param {string} notes Raw notes field from a Google Task.
 * @returns {object} Parsed metadata object, or {} if absent/unparseable.
 */
function decodeTaskMeta(notes) {
  if (!notes) return {};
  var match = notes.match(TASK_META_MARKER_RE);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // Fall through to human tag parsing
    }
  }
  var meta = {};
  var catMatch = notes.match(/\[Category:\s*([^\]]+)\]/i);
  if (catMatch) meta.category = catMatch[1].trim();
  var starMatch = notes.match(/\[Starred\]/i);
  if (starMatch) meta.starred = true;
  var masterMatch = notes.match(/\[Master\]/i);
  if (masterMatch) meta.master = true;
  var movedMatch = notes.match(/\[MovedTo:\s*([^,\]]+)(?:,\s*id:\s*([^\]]+))?\]/i);
  if (movedMatch) {
    meta.movedTo = movedMatch[1].trim();
    if (movedMatch[2]) meta.movedTaskId = movedMatch[2].trim();
  }
  var srcMatch = notes.match(/\[SourceMaster:\s*([^\]]+)\]/i);
  if (srcMatch) meta.sourceMasterId = srcMatch[1].trim();
  return meta;
}

/**
 * Computes the notes value to persist after merging metaPatch into existing metadata.
 * Omits metadata tags entirely when all properties are defaults and no custom tags are needed.
 * @param {string} existingNotes Current notes field on the task before this update.
 * @param {object} metaPatch Fields to merge into the existing metadata object.
 * @returns {string} New notes value to send in the patch.
 */
function encodeTaskMeta(existingNotes, metaPatch) {
  var merged = Object.assign({}, decodeTaskMeta(existingNotes), metaPatch);
  var rest = (existingNotes || '')
    .replace(TASK_META_MARKER_RE, '')
    .replace(/\[(?:Category|Starred|Master|MovedTo|SourceMaster):.*?\]\n?/gi, '')
    .trim();

  var tags = [];
  if (merged.category && merged.category !== 'General') {
    tags.push('[Category: ' + merged.category + ']');
  }
  if (merged.starred) {
    tags.push('[Starred]');
  }
  if (merged.master) {
    tags.push('[Master]');
  }
  if (merged.movedTo) {
    tags.push(merged.movedTaskId ? '[MovedTo: ' + merged.movedTo + ', id: ' + merged.movedTaskId + ']' : '[MovedTo: ' + merged.movedTo + ']');
  }
  if (merged.sourceMasterId) {
    tags.push('[SourceMaster: ' + merged.sourceMasterId + ']');
  }

  if (tags.length === 0) {
    return rest;
  }
  var tagStr = tags.join(' ');
  return rest ? rest + '\n\n' + tagStr : tagStr;
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
          result.tasks = taskList.items
            .filter(function(t) { return !t.due || t.due.substring(0, 10) === dateStr; })
            .map(function(t) {
              var meta = decodeTaskMeta(t.notes);
              return {
                id: t.id,
                title: t.title,
                status: deriveTaskStatus(t),
                category: meta.category || 'General',
                dueDate: t.due ? t.due.substring(0, 10) : dateStr,
                sourceMasterId: meta.sourceMasterId || null,
                starred: Boolean(meta.starred),
                notes: stripDpTokens(t.notes)
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
 * Retrieves an existing Monthly Notes Google Doc from the target folder, or creates
 * a new one directly inside targetFolder using Drive Advanced Service (avoiding moveTo
 * which requires broad drive scope).
 * @param {GoogleAppsScript.Drive.Folder} targetFolder Destination folder.
 * @param {string} docName Title of the monthly Google Doc.
 * @param {string} monthName Name of the month.
 * @param {number} year Four-digit year.
 * @returns {GoogleAppsScript.Document.Document} Opened Google Document instance.
 */
function getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year) {
  var files = targetFolder.getFilesByName(docName);
  if (files.hasNext()) {
    return DocumentApp.openById(files.next().getId());
  }

  var doc = null;
  // 1. Preferred: create directly inside targetFolder via Drive API without touching root or calling moveTo
  if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
    try {
      var resource = {
        title: docName,
        mimeType: 'application/vnd.google-apps.document',
        parents: [{ id: targetFolder.getId() }]
      };
      var created = Drive.Files.insert(resource);
      doc = DocumentApp.openById(created.id);
    } catch (driveApiErr) {
      console.warn('Drive.Files.insert doc creation fallback: ' + driveApiErr.toString());
    }
  }

  // 2. Fallback if Drive Advanced Service unavailable: DocumentApp.create with safe moveTo
  if (!doc) {
    doc = DocumentApp.create(docName);
    try {
      var docFile = DriveApp.getFileById(doc.getId());
      docFile.moveTo(targetFolder);
    } catch (moveErr) {
      console.warn('docFile.moveTo skipped (requires broad drive scope, using existing parent): ' + moveErr.toString());
    }
  }

  var body = doc.getBody();
  body.appendParagraph('Day Planner Notes - ' + monthName + ' ' + year)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  doc.saveAndClose();
  return DocumentApp.openById(doc.getId());
}

/**
 * Gets or creates the Monthly Note Google Doc (12 per year) and extracts/appends daily note content.
 * Script-efficient and formatted for human readability & printing.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @returns {string} Text content of daily note section.
 */
function getOrCreateDailyDocContent(dateStr) {
  if (typeof DriveApp === 'undefined' || typeof DocumentApp === 'undefined') {
    return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.\n\n### #index [Finance] Budget Sync\n- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.';
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) {
      return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.';
    }

    var d = new Date(dateStr + 'T00:00:00');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthName = monthNames[d.getMonth()];
    var year = d.getFullYear();
    var docName = 'Day Planner Notes - ' + monthName + ' ' + year;

    var doc = getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year);

    var fullText = doc.getBody().getText();
    var dateHeader = '## ' + dateStr;
    var dateIdx = fullText.indexOf(dateHeader);

    if (dateIdx !== -1) {
      var nextDateIdx = fullText.indexOf('\n## ', dateIdx + dateHeader.length);
      var sectionText = nextDateIdx !== -1 ? fullText.substring(dateIdx, nextDateIdx) : fullText.substring(dateIdx);
      return sectionText.replace(dateHeader, '').trim();
    } else {
      return '### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.';
    }
  } catch (err) {
    logError('getOrCreateDailyDocContent(' + dateStr + ')', err);
    return '### #index [General] Daily Notes for ' + dateStr;
  }
}

/**
 * Saves/updates daily topic cards content in the Monthly Google Doc (12 per year).
 * Efficient batch append/update with human-readable page spacing and print-friendly styles.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} noteContent Markdown/card note content to persist.
 * @returns {{success: boolean, docName: string}} Result status.
 */
function saveDailyDocCards(dateStr, noteContent) {
  if (typeof DriveApp === 'undefined' || typeof DocumentApp === 'undefined') {
    return { success: true, docName: 'Local Dev Mock Doc' };
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) throw new Error('Root folder not configured.');

    var d = new Date(dateStr + 'T00:00:00');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthName = monthNames[d.getMonth()];
    var year = d.getFullYear();
    var docName = 'Day Planner Notes - ' + monthName + ' ' + year;

    var doc = getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year);

    var body = doc.getBody();
    var dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    body.appendPageBreak();
    body.appendParagraph('Day Planner - ' + dayFormatted).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    var lines = (noteContent || '').split('\n');
    lines.forEach(function(line) {
      if (line.startsWith('### ')) {
        body.appendParagraph(line.replace('### ', '')).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      } else if (line.startsWith('- ')) {
        body.appendListItem(line.replace('- ', ''));
      } else if (line.trim()) {
        body.appendParagraph(line);
      }
    });

    doc.saveAndClose();
    return { success: true, docName: docName };
  } catch (err) {
    logError('saveDailyDocCards(' + dateStr + ')', err);
    return { success: false, error: err.message || err.toString() };
  }
}

/**
 * Resolves the display title for a Google Drive / Docs / Sheets / Slides / Forms URL.
 * Used for smart-paste in note cards.
 * @param {string} url Target Google Drive file URL.
 * @returns {{success: boolean, title?: string, fileId?: string, error?: string}} Resolution result.
 */
function resolveDriveFileTitle(url) {
  if (!url || typeof url !== 'string') {
    return { success: false, error: 'No URL provided.' };
  }
  var idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!idMatch) {
    return { success: false, error: 'Not a recognized Google Docs/Sheets/Slides/Forms/Drive URL.' };
  }
  try {
    var fileId = idMatch[1];
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
      var meta = Drive.Files.get(fileId, { fields: 'id,name,trashed' });
      if (meta.trashed) {
        return { success: false, error: 'File is trashed.' };
      }
      return { success: true, title: meta.name, fileId: fileId };
    }
    if (typeof DriveApp !== 'undefined') {
      var file = DriveApp.getFileById(fileId);
      if (file.isTrashed()) {
        return { success: false, error: 'File is trashed.' };
      }
      return { success: true, title: file.getName(), fileId: fileId };
    }
    return { success: true, title: 'Document (' + fileId.slice(0, 6) + ')', fileId: fileId };
  } catch (err) {
    logError('resolveDriveFileTitle(' + url + ')', err);
    return { success: false, error: err.message || err.toString() };
  }
}

/**
 * Retrieves a child folder by name under the parent folder, creating it if it does not exist.
 * If parent is null or omitted, returns the validated root Day Planner folder.
 * Synchronized with LockService.getUserLock() to prevent race conditions during folder creation.
 * @param {GoogleAppsScript.Drive.Folder|null} parent Parent folder object, or null to target root folder.
 * @param {string} name Folder name to find or create.
 * @returns {GoogleAppsScript.Drive.Folder|null} Found or created folder object, or null on error.
 */
function getFolderByNameOrCreate(parent, name) {
  var lock = LockService.getUserLock();
  var lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(10000);
    if (!lockAcquired) {
      console.warn('getFolderByNameOrCreate: lock timed out after 10s, proceeding unlocked');
    }
  } catch (lockErr) {
    console.warn('getFolderByNameOrCreate: lock acquisition threw, proceeding unlocked: ' + lockErr.toString());
  }

  try {
    var rootFolder = getValidatedRootFolder();
    if (!rootFolder) {
      throw new Error('No valid Google Drive Day Planner folder connected.');
    }
    if (parent) {
      var folders = parent.getFoldersByName(name);
      if (folders.hasNext()) return folders.next();

      // Preferred under drive.file scope: create directly in parent folder via Drive Advanced Service
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
        try {
          var folderResource = {
            title: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [{ id: parent.getId() }]
          };
          var createdFolder = Drive.Files.insert(folderResource);
          return DriveApp.getFolderById(createdFolder.id);
        } catch (driveApiErr) {
          console.warn('Drive.Files.insert folder creation fallback: ' + driveApiErr.toString());
        }
      }

      // Fallback: parent.createFolder (may require broad drive scope under DriveApp)
      if (typeof parent.createFolder === 'function') {
        try {
          return parent.createFolder(name);
        } catch (createErr) {
          console.warn('getFolderByNameOrCreate could not create subfolder: ' + createErr.toString());
        }
      }
      return parent;
    }
    return rootFolder;
  } catch (err) {
    logError('getFolderByNameOrCreate(' + name + ')', err);
    return null;
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (relErr) {
        console.warn('getFolderByNameOrCreate: lock release threw: ' + relErr.toString());
      }
    }
  }
}

/**
 * Retrieves master task entries for monthly planning / backlog.
 * Undated Google Tasks flagged via the hidden metadata marker or without due dates.
 * @param {string} [monthYearStr] Optional month/year string (kept for signature compatibility).
 * @returns {Array<{id: string, title: string, category: string, status: string, movedTo: (string|null), movedTaskId: (string|null)}>} Array of master task items.
 */
function getMasterTasks(monthYearStr) {
  try {
    if (typeof Tasks === 'undefined') {
      return [
        { id: 'm1', title: 'Prepare Q3 performance appraisals', category: 'Work', status: '•', movedTo: null, movedTaskId: null },
        { id: 'm2', title: 'Plan annual family retreat', category: 'Personal', status: '•', movedTo: null, movedTaskId: null },
        { id: 'm3', title: 'Rebalance investment portfolio', category: 'Financial', status: '•', movedTo: null, movedTaskId: null }
      ];
    }
    var resp = Tasks.Tasks.list('@default', { showCompleted: true, showHidden: true, maxResults: 100 });
    var items = resp.items || [];
    return items
      .filter(function(t) { return !t.due; })
      .map(function(t) {
        var meta = decodeTaskMeta(t.notes);
        return {
          id: t.id,
          title: t.title,
          category: meta.category || 'General',
          status: deriveTaskStatus(t),
          movedTo: meta.movedTo || null,
          movedTaskId: meta.movedTaskId || null
        };
      });
  } catch (err) {
    logError('getMasterTasks(' + (monthYearStr || '') + ')', err);
    return [];
  }
}

/**
 * Creates a new master task — an undated Google Task flagged via metadata marker.
 * @param {string} title Task title.
 * @param {string} [category='General'] Optional category classification.
 * @returns {{id: string, title: string, category: string, status: string, movedTo: null, movedTaskId: null}} Created master task object.
 */
function addMasterTask(title, category) {
  try {
    if (typeof Tasks === 'undefined') {
      return {
        id: 'master_' + new Date().getTime(),
        title: title,
        category: category || 'General',
        status: '•',
        movedTo: null,
        movedTaskId: null
      };
    }
    var created = Tasks.Tasks.insert({
      title: title,
      notes: encodeTaskMeta('', { master: true, category: category || 'General' })
    }, '@default');
    return {
      id: created.id,
      title: created.title,
      category: category || 'General',
      status: deriveTaskStatus(created),
      movedTo: null,
      movedTaskId: null
    };
  } catch (err) {
    logError('addMasterTask', err);
    throw err;
  }
}

/**
 * Records that a master task was moved (transferred) to a specific daily task list.
 * @param {string} masterTaskId Master task's Google Task id.
 * @param {string} targetDateStr Date the task was moved to, in YYYY-MM-DD format.
 * @param {string} movedTaskId Id of the newly created daily task.
 * @returns {{id: string, title: string, category: string, status: string, movedTo: string, movedTaskId: string}} Updated master task object.
 */
function markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
  try {
    if (typeof Tasks === 'undefined') {
      return {
        id: masterTaskId,
        title: '',
        category: 'General',
        status: '→',
        movedTo: targetDateStr,
        movedTaskId: movedTaskId
      };
    }
    var current = Tasks.Tasks.get('@default', masterTaskId);
    var notes = encodeTaskMeta(current.notes, { movedTo: targetDateStr, movedTaskId: movedTaskId });
    notes = encodeTaskStatus(notes, '→');
    var updated = Tasks.Tasks.patch({ notes: notes }, '@default', masterTaskId);
    var meta = decodeTaskMeta(updated.notes);
    return {
      id: updated.id,
      title: updated.title,
      category: meta.category || 'General',
      status: deriveTaskStatus(updated),
      movedTo: meta.movedTo || null,
      movedTaskId: meta.movedTaskId || null
    };
  } catch (err) {
    logError('markMasterTaskMoved(' + masterTaskId + ')', err);
    throw err;
  }
}

/**
 * Creates and appends a new daily task item for the specified date.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @param {string} title Task title description.
 * @param {string} [category='General'] Optional task category classification.
 * @param {string} [sourceMasterId] Optional originating master task ID.
 * @returns {{id: string, title: string, status: string, category: string, dueDate: string, starred: boolean, notes: string, sourceMasterId: (string|null)}} Created task object.
 */
function addDailyTask(dateStr, title, category, sourceMasterId) {
  try {
    if (typeof Tasks !== 'undefined') {
      var metaPatch = { category: category || 'General' };
      if (sourceMasterId) metaPatch.sourceMasterId = sourceMasterId;
      var taskResource = {
        title: title,
        due: dateStr + 'T00:00:00.000Z',
        notes: encodeTaskMeta('', metaPatch)
      };
      var created = Tasks.Tasks.insert(taskResource, '@default');
      return {
        id: created.id,
        title: created.title,
        status: deriveTaskStatus(created),
        category: category || 'General',
        dueDate: created.due ? created.due.substring(0, 10) : dateStr,
        sourceMasterId: sourceMasterId || null,
        starred: false,
        notes: stripDpTokens(created.notes)
      };
    }
    return {
      id: 'task_' + new Date().getTime(),
      title: title,
      status: '•',
      category: category || 'General',
      dueDate: dateStr,
      sourceMasterId: sourceMasterId || null,
      starred: false,
      notes: ''
    };
  } catch (err) {
    logError('addDailyTask', err);
    throw err;
  }
}

/**
 * Updates an existing Google Task's title and/or completion status and metadata.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @param {string} taskId Google Task id.
 * @param {object} updates Fields to update: { title, status, category, dueDate, starred, notes }.
 * @returns {object|null} Updated task object, or null if the task no longer exists.
 */
function updateDailyTask(dateStr, taskId, updates) {
  try {
    if (typeof Tasks === 'undefined') {
      return {
        id: taskId,
        title: (updates && updates.title !== undefined) ? updates.title : '',
        status: (updates && updates.status !== undefined) ? updates.status : '•',
        category: (updates && updates.category !== undefined) ? updates.category : 'General',
        dueDate: (updates && updates.dueDate !== undefined) ? updates.dueDate : dateStr,
        starred: Boolean(updates && updates.starred),
        notes: (updates && updates.notes !== undefined) ? updates.notes : ''
      };
    }

    var patch = {};
    var current = null;
    function ensureCurrent() {
      if (!current) current = Tasks.Tasks.get('@default', taskId);
      return current;
    }
    if (updates && updates.title !== undefined) {
      patch.title = updates.title;
    }
    if (updates && updates.status !== undefined) {
      patch.status = (updates.status === '✓' || updates.status === 'Ⓓ' || updates.status === 'D/✓') ? 'completed' : 'needsAction';
      patch.notes = encodeTaskStatusNotes(updates.status, ensureCurrent().notes);
    }
    if (updates && updates.category !== undefined) {
      var notesBaseCat = patch.notes !== undefined ? patch.notes : ensureCurrent().notes;
      patch.notes = encodeTaskMeta(notesBaseCat, { category: updates.category });
    }
    if (updates && updates.starred !== undefined) {
      var notesBaseStar = patch.notes !== undefined ? patch.notes : ensureCurrent().notes;
      patch.notes = encodeTaskMeta(notesBaseStar, { starred: Boolean(updates.starred) });
    }
    if (updates && updates.dueDate !== undefined) {
      patch.due = updates.dueDate + 'T00:00:00.000Z';
    }

    var updated = Tasks.Tasks.patch(patch, '@default', taskId);

    // Mirror a status change back onto this task's source master task, if it was transferred from one
    if (current && updates && updates.status !== undefined) {
      var meta = decodeTaskMeta(current.notes);
      if (meta.sourceMasterId) {
        try {
          var masterCurrent = Tasks.Tasks.get('@default', meta.sourceMasterId);
          Tasks.Tasks.patch({
            status: patch.status,
            notes: encodeTaskStatusNotes(updates.status, masterCurrent.notes)
          }, '@default', meta.sourceMasterId);
        } catch (syncErr) {
          logError('updateDailyTask->masterSync(' + meta.sourceMasterId + ')', syncErr);
        }
      }
    }

    var updatedMeta = decodeTaskMeta(updated.notes);
    return {
      id: updated.id,
      title: updated.title,
      status: deriveTaskStatus(updated),
      category: updatedMeta.category || 'General',
      dueDate: updated.due ? updated.due.substring(0, 10) : ((updates && updates.dueDate) || dateStr),
      starred: Boolean(updatedMeta.starred),
      notes: stripDpTokens(updated.notes)
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
 * an empty 12-month skeleton if the file does not yet exist.
 * Cached in UserCache for 5 minutes (300 seconds).
 * @param {number|string} year Target calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>}} Full year matrix.
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
    } catch (e) {
      console.warn('getFutureMatrixData_: bad cached JSON: ' + e.toString());
    }
  }

  var targetFolder = getValidatedRootFolder();
  if (!targetFolder) {
    matrixData.folderMissing = true;
    return matrixData;
  }

  var fileName = 'future-matrix-' + yearStr + '.json';
  var files = targetFolder.getFilesByName(fileName);
  var parseFailed = false;
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
        parseFailed = true;
        console.warn('JSON parse warning in ' + fileName + ': ' + jsonErr.toString());
      }
    }
    if (cache && !parseFailed) cache.put(cacheKey, JSON.stringify(matrixData), 300);
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
      saveFutureMatrixData_(year, matrixData); // persist removal from current year
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
 * Deletes a future planning item from a month's bucket and persists the year file.
 * @param {number|string} year Target calendar year.
 * @param {string} monthKey Target month key in YYYY-MM format.
 * @param {string} itemId Future item identifier.
 * @returns {boolean} True if deleted, false if not found.
 */
function deleteFutureItem(year, monthKey, itemId) {
  try {
    var matrixData = getFutureMatrixData_(year);
    var items = matrixData.months[monthKey] || [];
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) { idx = i; break; }
    }
    if (idx === -1) return false;

    items.splice(idx, 1);
    saveFutureMatrixData_(year, matrixData);
    return true;
  } catch (err) {
    logError('deleteFutureItem(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Searches across all monthly Google Docs in the Day Planner folder.
 * @param {string} query Search term.
 * @returns {Array<{docName: string, docId: string, docUrl: string, matches: Array<{heading: string, snippet: string}>}>} Match results.
 */
function searchAcrossAllMonthlyDocs(query) {
  var cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) return [];

  if (typeof DriveApp === 'undefined' || typeof DocumentApp === 'undefined') {
    return [
      {
        docName: 'Day Planner Notes - August 2026',
        docId: 'mock_doc_1',
        docUrl: '#',
        matches: [
          { heading: 'Day Planner - Sunday, August 16, 2026', snippet: 'Finalized 3-column binder layout with Alpine.js and clean CSS.' }
        ]
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
      if (name.indexOf('Day Planner Notes') !== -1) {
        var doc = DocumentApp.openById(file.getId());
        var text = doc.getBody().getText();

        if (text.toLowerCase().indexOf(cleanQuery) !== -1) {
          var lines = text.split('\n');
          var matches = [];
          var currentHeading = name;

          lines.forEach(function(line) {
            if (line.startsWith('Day Planner - ') || line.startsWith('## ')) {
              currentHeading = line;
            }
            if (line.toLowerCase().indexOf(cleanQuery) !== -1) {
              matches.push({
                heading: currentHeading,
                snippet: line.trim()
              });
            }
          });

          results.push({
            docName: name,
            docId: file.getId(),
            docUrl: file.getUrl(),
            matches: matches
          });
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
 * Displays the Cross-Month Search Sidebar in Google Docs.
 * @returns {void}
 */
function showCrossMonthSearchSidebar() {
  if (typeof DocumentApp === 'undefined') return;
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif; padding:12px; color:#1c2826;">' +
    '<h3 style="color:#2d6a5a; margin-top:0;">🔍 Universal Planner Search</h3>' +
    '<p style="font-size:0.82rem; color:#5c6b66;">Search topics, decisions, and keywords across all 12 monthly Google Docs.</p>' +
    '<input type="search" id="q" placeholder="Type keyword (e.g. #index, budget)..." style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #c8ded7; border-radius:4px; box-sizing:border-box;">' +
    '<button onclick="runSearch()" style="width:100%; padding:8px; background:#2d6a5a; color:white; border:none; border-radius:4px; font-weight:600; cursor:pointer;">Search All Months</button>' +
    '<div id="results" style="margin-top:16px; font-size:0.85rem;"></div>' +
    '<script>' +
    'function runSearch() {' +
    '  var q = document.getElementById("q").value;' +
    '  var resDiv = document.getElementById("results");' +
    '  resDiv.innerHTML = "<p><i>Searching monthly docs...</i></p>";' +
    '  google.script.run.withSuccessHandler(function(res) {' +
    '    if (!res || res.length === 0) { resDiv.innerHTML = "<p>No matches found across monthly docs.</p>"; return; }' +
    '    var html = "";' +
    '    res.forEach(function(r) {' +
    '      html += "<div style=\'background:#f2f8f5; border:1px solid #c8ded7; border-radius:6px; padding:10px; margin-bottom:10px;\'>";' +
    '      html += "<strong style=\'color:#2d6a5a;\'>" + r.docName + "</strong>";' +
    '      r.matches.forEach(function(m) { html += "<p style=\'margin:4px 0; font-size:0.8rem;\'>• <b>" + m.heading + "</b>: " + m.snippet + "</p>"; });' +
    '      html += "</div>";' +
    '    });' +
    '    resDiv.innerHTML = html;' +
    '  }).searchAcrossAllMonthlyDocs(q);' +
    '}' +
    '</script>' +
    '</div>'
  ).setTitle('Planner Universal Search');

  DocumentApp.getUi().showSidebar(html);
}

/**
 * Displays the #index Decision Registry Sidebar in Google Docs.
 * @returns {void}
 */
function showIndexRegistrySidebar() {
  if (typeof DocumentApp === 'undefined') return;
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif; padding:12px; color:#1c2826;">' +
    '<h3 style="color:#2d6a5a; margin-top:0;">📌 #index Decision Registry</h3>' +
    '<p style="font-size:0.82rem; color:#5c6b66;">Key decisions & indexed milestones tagged with <b>#index [Topic]</b> across your planner.</p>' +
    '<div id="indexResults">Loading registry...</div>' +
    '<script>' +
    'google.script.run.withSuccessHandler(function(res) {' +
    '  var div = document.getElementById("indexResults");' +
    '  if (!res || res.length === 0) { div.innerHTML = "<p>No #index items found.</p>"; return; }' +
    '  var html = "";' +
    '  res.forEach(function(r) {' +
    '    r.matches.forEach(function(m) {' +
    '      if (m.snippet.indexOf("#index") !== -1) {' +
    '        html += "<div style=\'border-bottom:1px solid #e1ede8; padding:6px 0;\'><b>" + m.snippet + "</b><br><small style=\'color:#5c6b66;\'>" + r.docName + "</small></div>";' +
    '      }' +
    '    });' +
    '  });' +
    '  div.innerHTML = html || "<p>No tagged #index items found.</p>";' +
    '}).searchAcrossAllMonthlyDocs("#index");' +
    '</script>' +
    '</div>'
  ).setTitle('#index Decision Registry');

  DocumentApp.getUi().showSidebar(html);
}

/**
 * Opens a modal dialog providing a direct launch button for the Day Planner Web App.
 * @returns {void}
 */
function openPlannerWebAppDialog() {
  if (typeof DocumentApp === 'undefined') return;
  var url = ScriptApp.getService().getUrl();
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif; padding:16px; text-align:center;">' +
    '<h3 style="color:#2d6a5a;">📖 Day Planner Web App</h3>' +
    '<p>Click below to open your Digital Binder Application in a new browser tab:</p>' +
    '<a href="' + url + '" target="_blank" style="display:inline-block; padding:10px 20px; background:#2d6a5a; color:white; text-decoration:none; border-radius:6px; font-weight:700;">Launch Day Planner SPA</a>' +
    '</div>'
  ).setWidth(360).setHeight(180);

  DocumentApp.getUi().showModalDialog(html, 'Open Day Planner SPA');
}

// ── Explicit export surface ──────────────────────────────────────────────────
// Everything above is private to this IIFE. Only names assigned here are visible to: the Apps
// Script runtime (doGet, onOpen), google.script.run / Script.html, HtmlService template
// scriptlets (<?= ?>), a time-driven trigger looked up by handler name string, or the Apps
// Script IDE's manual "select function, click Run" dropdown. Adding a function here means any
// script running in the web app page can invoke it by name -- keep this list to exactly what's
// actually called from one of those places. See .agents/rules/gas-namespace-iife.md.
global.doGet = doGet;                                        // Apps Script web app entry point
global.onOpen = onOpen;                                      // Google Docs runtime onOpen trigger
global.syncWorkspaceChanges = syncWorkspaceChanges;          // time-driven trigger handler (by name)
global.include = include;                                    // template: Index.html, SetupFolder.html
global.validateAndSaveFolderUrl = validateAndSaveFolderUrl;  // google.script.run: SetupFolder.html
global.getDailyData = getDailyData;                          // google.script.run: Script.html
global.getMasterTasks = getMasterTasks;                      // google.script.run: Script.html
global.addDailyTask = addDailyTask;                          // google.script.run: Script.html
global.updateDailyTask = updateDailyTask;                    // google.script.run: Script.html
global.addMasterTask = addMasterTask;                        // google.script.run: Script.html
global.markMasterTaskMoved = markMasterTaskMoved;            // google.script.run: Script.html
global.saveDailyDocCards = saveDailyDocCards;                // google.script.run: Script.html
global.resolveDriveFileTitle = resolveDriveFileTitle;        // google.script.run: Script.html
global.getFutureMatrix = getFutureMatrix;                    // google.script.run: Script.html
global.addFutureItem = addFutureItem;                        // google.script.run: Script.html
global.updateFutureItemStatus = updateFutureItemStatus;      // google.script.run: Script.html
global.transferFutureItem = transferFutureItem;              // google.script.run: Script.html
global.pushFutureItemToNextMonth = pushFutureItemToNextMonth; // google.script.run: Script.html
global.deleteFutureItem = deleteFutureItem;                  // google.script.run: Script.html
global.searchAcrossAllMonthlyDocs = searchAcrossAllMonthlyDocs; // google.script.run: Google Docs sidebar
global.showCrossMonthSearchSidebar = showCrossMonthSearchSidebar; // Google Docs menu action
global.showIndexRegistrySidebar = showIndexRegistrySidebar;  // Google Docs menu action
global.openPlannerWebAppDialog = openPlannerWebAppDialog;    // Google Docs menu action
global.ensure2WaySyncTriggerInstalled = ensure2WaySyncTriggerInstalled; // IDE manual-run
global.setup2WaySyncTrigger = setup2WaySyncTrigger;          // IDE manual-run

// Cross-file only (not reachable from any client/template/trigger/IDE surface above, but needed
// by other .gs files' own IIFEs since GAS has no import statement -- this global object is the
// only channel between files):
global.logError = logError;                                  // used by UnitTests.gs
global.logWarn = logWarn;                                    // used by UnitTests.gs
global.recordServerLog = recordServerLog;                    // used by UnitTests.gs
global.getRecentServerLogs = getRecentServerLogs;            // used by UnitTests.gs
global.clearRecentServerLogs = clearRecentServerLogs;        // used by UnitTests.gs
global.getRunLogDocUrl = getRunLogDocUrl;                    // used by UnitTests.gs
global.escapeHtml_ = escapeHtml_;                            // used by UnitTests.gs
global.getFolderByNameOrCreate = getFolderByNameOrCreate;    // used by UnitTests.gs
global.getOrCreateDailyDocContent = getOrCreateDailyDocContent; // used by UnitTests.gs
global.DAY_PLANNER_FAVICON_URL = DAY_PLANNER_FAVICON_URL;    // used by UnitTests.gs

// Internal aliases for top-level entry point delegators
global._doGetInternal = doGet_original;
global._onOpenInternal = onOpen;
global._syncWorkspaceChangesInternal = syncWorkspaceChanges;
global._setup2WaySyncTriggerInternal = setup2WaySyncTrigger;
global._ensure2WaySyncTriggerInstalledInternal = ensure2WaySyncTriggerInstalled;
global._includeInternal = include;
global._validateAndSaveFolderUrlInternal = validateAndSaveFolderUrl;
global._getDailyDataInternal = getDailyData;
global._getMasterTasksInternal = getMasterTasks;
global._addDailyTaskInternal = addDailyTask;
global._updateDailyTaskInternal = updateDailyTask;
global._addMasterTaskInternal = addMasterTask;
global._markMasterTaskMovedInternal = markMasterTaskMoved;
global._saveDailyDocCardsInternal = saveDailyDocCards;
global._resolveDriveFileTitleInternal = resolveDriveFileTitle;
global._getFutureMatrixInternal = getFutureMatrix;
global._addFutureItemInternal = addFutureItem;
global._updateFutureItemStatusInternal = updateFutureItemStatus;
global._transferFutureItemInternal = transferFutureItem;
global._pushFutureItemToNextMonthInternal = pushFutureItemToNextMonth;
global._deleteFutureItemInternal = deleteFutureItem;
global._searchAcrossAllMonthlyDocsInternal = searchAcrossAllMonthlyDocs;
global._showCrossMonthSearchSidebarInternal = showCrossMonthSearchSidebar;
global._showIndexRegistrySidebarInternal = showIndexRegistrySidebar;
global._openPlannerWebAppDialogInternal = openPlannerWebAppDialog;

})(typeof globalThis !== 'undefined' ? globalThis : this);

// ── Top-level entry points for Google Apps Script runtime & IDE ──────────────
// The Google Apps Script Web App gateway, Google Docs trigger engine, and the IDE
// "Select function" dropdown statically scan project source code for top-level `function`
// declarations. Functions declared solely inside an IIFE (even when assigned to `global`)
// are NOT detected by Google's Web App router (causing HTTP 404 Page Not Found) and do NOT
// appear in the IDE menu. These top-level wrappers delegate to the internal implementations.

/**
 * Primary HTTP GET web app handler for Google Apps Script.
 * MUST be declared as a top-level function outside any IIFE so the Apps Script
 * gateway AST parser discovers the web app entry point and routes HTTP requests.
 * @param {GoogleAppsScript.Events.DoGet} e Request parameters.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Rendered web page output.
 */
function doGet(e) {
  return (typeof _doGetInternal === 'function') ? _doGetInternal(e) : (globalThis._doGetInternal ? globalThis._doGetInternal(e) : null);
}

/**
 * Google Docs custom menu trigger.
 * MUST be declared as a top-level function outside any IIFE so Docs can discover
 * and execute the onOpen simple trigger upon document load.
 * @param {object} e Open event.
 */
function onOpen(e) {
  return (typeof _onOpenInternal === 'function') ? _onOpenInternal(e) : (globalThis._onOpenInternal ? globalThis._onOpenInternal(e) : null);
}

/**
 * Time-driven trigger handler for 2-Way Sync.
 * MUST be declared as a top-level function outside any IIFE so time-based triggers
 * can invoke it by name.
 */
function syncWorkspaceChanges() {
  return (typeof _syncWorkspaceChangesInternal === 'function') ? _syncWorkspaceChangesInternal() : (globalThis._syncWorkspaceChangesInternal ? globalThis._syncWorkspaceChangesInternal() : null);
}

/**
 * IDE Setup helper for installing the 2-Way Sync trigger.
 * MUST be declared as a top-level function outside any IIFE so it appears in the
 * Apps Script IDE's "Select function" dropdown for manual execution.
 */
function setup2WaySyncTrigger() {
  return (typeof _setup2WaySyncTriggerInternal === 'function') ? _setup2WaySyncTriggerInternal() : (globalThis._setup2WaySyncTriggerInternal ? globalThis._setup2WaySyncTriggerInternal() : null);
}

/**
 * IDE Setup helper for ensuring the 2-Way Sync trigger is installed.
 * Statically discovered by the Apps Script IDE dropdown.
 */
function ensure2WaySyncTriggerInstalled() {
  return (typeof _ensure2WaySyncTriggerInstalledInternal === 'function') ? _ensure2WaySyncTriggerInstalledInternal() : (globalThis._ensure2WaySyncTriggerInstalledInternal ? globalThis._ensure2WaySyncTriggerInstalledInternal() : null);
}

// ── Client-side google.script.run RPC entry points ───────────────────────────
// Google Apps Script's HTML compiler statically inspects project source code
// for top-level `function` declarations to synthesize the client-side
// `google.script.run` proxy. Functions defined only inside an IIFE closure
// are NOT discovered, causing `google.script.run.<fn> is not a function`.

function include(filename) {
  return (typeof _includeInternal === 'function') ? _includeInternal(filename) : (globalThis._includeInternal ? globalThis._includeInternal(filename) : null);
}

function validateAndSaveFolderUrl(url) {
  return (typeof _validateAndSaveFolderUrlInternal === 'function') ? _validateAndSaveFolderUrlInternal(url) : (globalThis._validateAndSaveFolderUrlInternal ? globalThis._validateAndSaveFolderUrlInternal(url) : null);
}

function getDailyData(dateStr) {
  return (typeof _getDailyDataInternal === 'function') ? _getDailyDataInternal(dateStr) : (globalThis._getDailyDataInternal ? globalThis._getDailyDataInternal(dateStr) : null);
}

function getMasterTasks(monthYearStr) {
  return (typeof _getMasterTasksInternal === 'function') ? _getMasterTasksInternal(monthYearStr) : (globalThis._getMasterTasksInternal ? globalThis._getMasterTasksInternal(monthYearStr) : null);
}

function addDailyTask(dateStr, title, category, sourceMasterId) {
  return (typeof _addDailyTaskInternal === 'function') ? _addDailyTaskInternal(dateStr, title, category, sourceMasterId) : (globalThis._addDailyTaskInternal ? globalThis._addDailyTaskInternal(dateStr, title, category, sourceMasterId) : null);
}

function updateDailyTask(dateStr, taskId, updates) {
  return (typeof _updateDailyTaskInternal === 'function') ? _updateDailyTaskInternal(dateStr, taskId, updates) : (globalThis._updateDailyTaskInternal ? globalThis._updateDailyTaskInternal(dateStr, taskId, updates) : null);
}

function addMasterTask(title, category) {
  return (typeof _addMasterTaskInternal === 'function') ? _addMasterTaskInternal(title, category) : (globalThis._addMasterTaskInternal ? globalThis._addMasterTaskInternal(title, category) : null);
}

function markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
  return (typeof _markMasterTaskMovedInternal === 'function') ? _markMasterTaskMovedInternal(masterTaskId, targetDateStr, movedTaskId) : (globalThis._markMasterTaskMovedInternal ? globalThis._markMasterTaskMovedInternal(masterTaskId, targetDateStr, movedTaskId) : null);
}

function saveDailyDocCards(dateStr, noteContent) {
  return (typeof _saveDailyDocCardsInternal === 'function') ? _saveDailyDocCardsInternal(dateStr, noteContent) : (globalThis._saveDailyDocCardsInternal ? globalThis._saveDailyDocCardsInternal(dateStr, noteContent) : null);
}

function resolveDriveFileTitle(url) {
  return (typeof _resolveDriveFileTitleInternal === 'function') ? _resolveDriveFileTitleInternal(url) : (globalThis._resolveDriveFileTitleInternal ? globalThis._resolveDriveFileTitleInternal(url) : null);
}

function getFutureMatrix(year) {
  return (typeof _getFutureMatrixInternal === 'function') ? _getFutureMatrixInternal(year) : (globalThis._getFutureMatrixInternal ? globalThis._getFutureMatrixInternal(year) : null);
}

function addFutureItem(year, monthKey, title, category) {
  return (typeof _addFutureItemInternal === 'function') ? _addFutureItemInternal(year, monthKey, title, category) : (globalThis._addFutureItemInternal ? globalThis._addFutureItemInternal(year, monthKey, title, category) : null);
}

function updateFutureItemStatus(year, monthKey, itemId, status) {
  return (typeof _updateFutureItemStatusInternal === 'function') ? _updateFutureItemStatusInternal(year, monthKey, itemId, status) : (globalThis._updateFutureItemStatusInternal ? globalThis._updateFutureItemStatusInternal(year, monthKey, itemId, status) : null);
}

function transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup) {
  return (typeof _transferFutureItemInternal === 'function') ? _transferFutureItemInternal(year, monthKey, itemId, dateStr, priorityGroup) : (globalThis._transferFutureItemInternal ? globalThis._transferFutureItemInternal(year, monthKey, itemId, dateStr, priorityGroup) : null);
}

function pushFutureItemToNextMonth(year, monthKey, itemId) {
  return (typeof _pushFutureItemToNextMonthInternal === 'function') ? _pushFutureItemToNextMonthInternal(year, monthKey, itemId) : (globalThis._pushFutureItemToNextMonthInternal ? globalThis._pushFutureItemToNextMonthInternal(year, monthKey, itemId) : null);
}

function deleteFutureItem(year, monthKey, itemId) {
  return (typeof _deleteFutureItemInternal === 'function') ? _deleteFutureItemInternal(year, monthKey, itemId) : (globalThis._deleteFutureItemInternal ? globalThis._deleteFutureItemInternal(year, monthKey, itemId) : null);
}

function searchAcrossAllMonthlyDocs(query) {
  return (typeof _searchAcrossAllMonthlyDocsInternal === 'function') ? _searchAcrossAllMonthlyDocsInternal(query) : (globalThis._searchAcrossAllMonthlyDocsInternal ? globalThis._searchAcrossAllMonthlyDocsInternal(query) : null);
}

function showCrossMonthSearchSidebar() {
  return (typeof _showCrossMonthSearchSidebarInternal === 'function') ? _showCrossMonthSearchSidebarInternal() : (globalThis._showCrossMonthSearchSidebarInternal ? globalThis._showCrossMonthSearchSidebarInternal() : null);
}

function showIndexRegistrySidebar() {
  return (typeof _showIndexRegistrySidebarInternal === 'function') ? _showIndexRegistrySidebarInternal() : (globalThis._showIndexRegistrySidebarInternal ? globalThis._showIndexRegistrySidebarInternal() : null);
}

function openPlannerWebAppDialog() {
  return (typeof _openPlannerWebAppDialogInternal === 'function') ? _openPlannerWebAppDialogInternal() : (globalThis._openPlannerWebAppDialogInternal ? globalThis._openPlannerWebAppDialogInternal() : null);
}


