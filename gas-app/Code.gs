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
 * Shared Docs Advanced Service helpers. Used instead of the DocumentApp built-in service so
 * this app can run under the narrower drive.file OAuth scope -- DocumentApp only accepts the
 * broad `documents` scope ("See, edit, create, and delete all your Google Docs documents"),
 * while the underlying Docs REST API (Docs.Documents.get/batchUpdate/create, exposed here as
 * the Docs Advanced Service) also accepts drive.file, per Google's own API reference. Requires
 * "Docs" (serviceId "docs") enabled in the manifest's enabledAdvancedServices AND added via the
 * Apps Script IDE's Services (+) button -- a manifest entry alone (e.g. via clasp push) does not
 * enable the underlying API in the linked Cloud project.
 */

/**
 * Returns a document's top-level body elements as plain objects (Docs API StructuralElement
 * shape), filtered to paragraph elements only. The first content element is always a
 * sectionBreak with no paragraph/startIndex and is dropped by this filter.
 * @param {string} documentId Google Doc id.
 * @returns {Array<Object>} Paragraph structural elements, each with startIndex/endIndex/paragraph.
 */
function docsGetBodyElements_(documentId) {
  var doc = Docs.Documents.get(documentId, {
    fields: 'body.content(startIndex,endIndex,paragraph(paragraphStyle.namedStyleType,bullet,elements(textRun.content,pageBreak)))'
  });
  var content = (doc.body && doc.body.content) || [];
  return content.filter(function (el) { return !!el.paragraph; });
}

/** @returns {string} Plain text of a paragraph structural element, trailing newline stripped. */
function docsElementText_(el) {
  if (!el.paragraph || !el.paragraph.elements) return '';
  return el.paragraph.elements.map(function (pe) {
    return (pe.textRun && pe.textRun.content) || '';
  }).join('').replace(/\n$/, '');
}

/** @returns {string} namedStyleType (e.g. 'HEADING_2') or 'NORMAL_TEXT' if unset. */
function docsElementHeading_(el) {
  return (el.paragraph && el.paragraph.paragraphStyle && el.paragraph.paragraphStyle.namedStyleType) || 'NORMAL_TEXT';
}

/** @returns {boolean} True if this paragraph element is (or contains) a page break. */
function docsElementIsPageBreak_(el) {
  if (!el.paragraph || !el.paragraph.elements) return false;
  return el.paragraph.elements.some(function (pe) { return !!pe.pageBreak; });
}

/** @returns {boolean} True if this paragraph is a bulleted list item. */
function docsElementIsListItem_(el) {
  return !!(el.paragraph && el.paragraph.bullet);
}

/**
 * Builds the insertText string plus paragraph-style/bullet requests for a "day section": an
 * H2 day heading followed by markdown-ish lines (### -> H3, - -> bullet, else plain text).
 * Ranges are computed relative to baseIndex, the character index the text will be inserted at,
 * so the caller can insert this text via one insertText request and apply these style requests
 * immediately after in the same batchUpdate.
 * @param {number} baseIndex Document character index where `text` will be inserted.
 * @param {string} dayHeadingText Day heading line, e.g. "Day Planner - Friday, ...".
 * @param {Array<string>} lines Card content lines (markdown-ish, as produced by the client).
 * @returns {{text: string, styleRequests: Array<Object>}} Insertable text and follow-up requests.
 */
function buildDaySectionRequests_(baseIndex, dayHeadingText, lines) {
  var text = '';
  var styleReqs = [];
  var bulletRanges = [];

  function appendLine(str, kind) {
    var start = baseIndex + text.length;
    text += str + '\n';
    var end = baseIndex + text.length - 1;
    if (kind === 'H2' || kind === 'H3') {
      styleReqs.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: kind === 'H2' ? 'HEADING_2' : 'HEADING_3' },
          fields: 'namedStyleType'
        }
      });
    } else if (kind === 'BULLET') {
      bulletRanges.push({ startIndex: start, endIndex: end });
    }
  }

  appendLine(dayHeadingText, 'H2');
  lines.forEach(function (line) {
    if (line.indexOf('### ') === 0) {
      appendLine(line.replace('### ', ''), 'H3');
    } else if (line.indexOf('- ') === 0) {
      appendLine(line.replace('- ', ''), 'BULLET');
    } else if (line.trim()) {
      appendLine(line, 'NORMAL');
    }
  });

  bulletRanges.forEach(function (r) {
    styleReqs.push({ createParagraphBullets: { range: r, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } });
  });

  // A single insertText call makes every new paragraph inherit whatever style sat at the
  // insertion point (often a leftover HEADING_2 from a just-deleted day heading, since deleting
  // a paragraph merges its content into the paragraph whose trailing newline survives, carrying
  // that paragraph's style backward across the merge point). Reset the WHOLE inserted range to
  // NORMAL_TEXT first, then apply the specific H2/H3 overrides above on top -- request order
  // matters here since later requests win on overlapping ranges. Without this, a bullet/plain
  // line silently inherits HEADING_2 and gets misread as a day-section boundary on the next read.
  var resetReq = {
    updateParagraphStyle: {
      range: { startIndex: baseIndex, endIndex: baseIndex + text.length - 1 },
      paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
      fields: 'namedStyleType'
    }
  };

  // Same inheritance hazard applies to bullets, not just heading style: a bulleted line merged
  // out from under a deleted section (e.g. the default "- Initialized daily topic card." bullet)
  // leaves its list membership on the paragraph that survives the merge point, so every new plain
  // line silently comes out bulleted too. That turned "#category: Work" into "- #category: Work"
  // on round-trip, which the client's tag regex doesn't match, so it fell into card content and a
  // fresh tag got written on top of it on every subsequent save (accumulating leaked tags).
  var bulletResetReq = {
    deleteParagraphBullets: {
      range: { startIndex: baseIndex, endIndex: baseIndex + text.length - 1 }
    }
  };

  return { text: text, styleRequests: [resetReq, bulletResetReq].concat(styleReqs) };
}

/**
 * Appends a single plain-text paragraph to the end of a doc via the Docs Advanced Service.
 * Docs API documents always end with a mandatory trailing newline that cannot be deleted, so
 * new content is inserted just before it (endIndex - 1), prefixed with its own newline.
 * @param {string} documentId Google Doc id.
 * @param {string} text Paragraph text (no trailing newline).
 * @returns {{startIndex: number, endIndex: number}} Character range of the inserted text.
 */
function docsAppendParagraph_(documentId, text) {
  var doc = Docs.Documents.get(documentId);
  var content = doc.body.content;
  var lastEndIndex = content[content.length - 1].endIndex;
  var insertAt = lastEndIndex - 1;
  Docs.Documents.batchUpdate({
    requests: [{ insertText: { location: { index: insertAt }, text: '\n' + text } }]
  }, documentId);
  return { startIndex: insertAt + 1, endIndex: insertAt + 1 + text.length };
}

/**
 * Appends a log entry to the permanent 'Day Planner - Run Log' Google Doc located
 * in the user's Day Planner Drive folder. Plain text only (no per-line styling) -- this is a
 * diagnostics-only doc, not user-facing, so the Docs-API port intentionally drops the previous
 * DocumentApp-based font/color/bold formatting to keep this port small and low-risk; the level
 * is still visible via the "[ERROR]"/"[WARN]"/"[INFO]" bracket in the text itself.
 * @param {'ERROR'|'WARN'|'INFO'} level Log severity.
 * @param {string} context Operation context.
 * @param {string} message Log message.
 * @param {string|null} [stack] Stack trace if available.
 */
function appendRunLogToDoc_(level, context, message, stack) {
  if (typeof Docs === 'undefined' || typeof Drive === 'undefined') return;

  try {
    var userProps = PropertiesService.getUserProperties();
    var cachedDocId = userProps.getProperty('DAY_PLANNER_RUN_LOG_DOC_ID');
    var docId = null;

    if (cachedDocId) {
      try {
        Docs.Documents.get(cachedDocId);
        docId = cachedDocId;
      } catch (openErr) {
        console.warn('cachedDocId open exception: ' + openErr.toString());
        userProps.deleteProperty('DAY_PLANNER_RUN_LOG_DOC_ID');
        docId = null;
      }
    }

    if (!docId) {
      var targetFolder = getValidatedRootFolder();
      if (!targetFolder) return;

      var docName = 'Day Planner - Run Log';
      var files = targetFolder.getFilesByName(docName);
      if (files.hasNext()) {
        docId = files.next().getId();
      } else {
        var newFile = Drive.Files.insert({
          title: docName,
          mimeType: 'application/vnd.google-apps.document',
          parents: [{ id: targetFolder.getId() }]
        });
        docId = newFile.id;

        var headerText = 'Day Planner - System Diagnostics & Run Log';
        var subText = 'Permanent audit log of server-side events, warnings, and error diagnostics.';
        Docs.Documents.batchUpdate({
          requests: [
            { insertText: { location: { index: 1 }, text: headerText + '\n' + subText + '\n' } },
            {
              updateParagraphStyle: {
                range: { startIndex: 1, endIndex: 1 + headerText.length },
                paragraphStyle: { namedStyleType: 'HEADING_1' },
                fields: 'namedStyleType'
              }
            }
          ]
        }, docId);
      }

      if (docId) {
        userProps.setProperty('DAY_PLANNER_RUN_LOG_DOC_ID', docId);
      }
    }

    if (!docId) return;

    var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss');
    var logLine = '[' + timeStr + '] [' + (level || 'INFO') + '] [' + (context || 'general') + '] ' + (message || '');
    docsAppendParagraph_(docId, logLine);

    if (stack) {
      docsAppendParagraph_(docId, stack);
    }
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

var DAY_PLANNER_FAVICON_URL = 'https:' + '/' + '/raw.githubusercontent.com/mhoffman02/day-planner/pure-gas-main/icons/favicon.png';

// Build number = git commit count at last stamp (see tools/stamp-build-number.js). Run
// `npm run stamp-build` before a real deploy so this reflects the code actually shipping;
// an approximate/stale number here is a stale reminder to re-stamp, not a broken build.
var DAY_PLANNER_BUILD_NUMBER = 345;

/**
 * Renders the HTML template page for setting up or connecting a Google Drive root folder.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Evaluated HTML setup page output.
 */
function renderSetupFolderPage() {
  var output = HtmlService.createTemplateFromFile('SetupFolder')
    .evaluate()
    .setTitle('Day Planner - Setup Google Drive Folder')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  try {
    output.setFaviconUrl(DAY_PLANNER_FAVICON_URL);
  } catch (_favErr) {
    console.warn('setFaviconUrl notice: ' + _favErr.toString());
  }
  return output;
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
    var output = template.evaluate()
      .setTitle('Day Planner')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    try {
      output.setFaviconUrl(DAY_PLANNER_FAVICON_URL);
    } catch (_favErr) {
      console.warn('setFaviconUrl notice: ' + _favErr.toString());
    }
    return output;

  } catch (err) {
    var fail = logError('doGet exception', err);
    var errStr = (err.message || err.toString()).toLowerCase();
    var isFolderError = errStr.indexOf('folder') !== -1 || errStr.indexOf('drive') !== -1 || errStr.indexOf('day planner') !== -1;
    if (isFolderError) {
      return renderSetupFolderPage();
    }
    var errOutput = HtmlService.createHtmlOutput('<h3>🔥 Day Planner Render Failure</h3><p><b>' + escapeHtml_(fail.error) + '</b></p><pre>' + escapeHtml_(fail.stack || '') + '</pre>')
      .setTitle('Day Planner - Render Failure')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

    try {
      errOutput.setFaviconUrl(DAY_PLANNER_FAVICON_URL);
    } catch (_favErr) {
      console.warn('setFaviconUrl notice: ' + _favErr.toString());
    }
    return errOutput;
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
        } catch {
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
    // Attempt 1: Advanced Drive Service (preferred under drive.file scope)
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
        var folderResource = {
          title: 'Day Planner',
          mimeType: 'application/vnd.google-apps.folder'
        };
        var created = Drive.Files.insert(folderResource);
        if (created && created.id) {
          userProps.setProperty('DAY_PLANNER_ROOT_FOLDER_ID', created.id);
          return DriveApp.getFolderById(created.id);
        }
      }
    } catch (driveInsertErr) {
      console.warn('getValidatedRootFolder Drive.Files.insert notice: ' + driveInsertErr.toString());
    }

    // Attempt 2: DriveApp fallback
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

    // Folder ownership / capability validation: support Google Workspace enterprise domains
    var isAuthorized = true;
    try {
      var owner = folder.getOwner();
      var currentUser = Session.getActiveUser().getEmail();
      if (owner && owner.getEmail() && currentUser) {
        isAuthorized = (owner.getEmail().toLowerCase() === currentUser.toLowerCase());
      } else {
        // In Google Workspace (e.g. GSA), folder.getOwner() often returns null or hides email.
        // Check write capabilities via Drive API v2 if available.
        if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
          var meta = Drive.Files.get(extractedId, { fields: 'editable,userPermission(role)' });
          isAuthorized = !meta || meta.editable || (meta.userPermission && (meta.userPermission.role === 'owner' || meta.userPermission.role === 'writer'));
        }
      }
    } catch (permErr) {
      // In restricted enterprise environments, proceed if getFolderById succeeded
      console.warn('validateAndSaveFolderUrl perm check notice: ' + permErr.toString());
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Folder is not owned by or writable for this account.'
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
var DP_HUMAN_TAGS_RE = /\[(?:Category|Starred|Master|Future|MovedTo|SourceMaster|Status)(?::[^\]]*)?\]\n?/gi;

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
  var futureMatch = notes.match(/\[Future\]/i);
  if (futureMatch) meta.future = true;
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
    .replace(/\[(?:Category|Starred|Master|Future|MovedTo|SourceMaster)(?::[^\]]*)?\]\n?/gi, '')
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
  if (merged.future) {
    tags.push('[Future]');
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
 * Extracts a Google Meet video conference link from calendar event objects or text fields.
 * @param {object} evt Raw calendar event or CalendarEvent instance.
 * @returns {string|null} Full Google Meet URL or null.
 */
function extractMeetLinkFromEvent_(evt) {
  if (!evt) return null;
  var link = evt.hangoutLink || null;
  if (!link && typeof evt.getHangoutLink === 'function') {
    try {
      var hl = evt.getHangoutLink();
      if (hl && typeof hl === 'string') link = hl.trim();
    } catch {
      // getHangoutLink may throw if unsupported on specific event type
    }
  }
  if (!link && evt.conferenceData && evt.conferenceData.entryPoints) {
    for (var c = 0; c < evt.conferenceData.entryPoints.length; c++) {
      var ep = evt.conferenceData.entryPoints[c];
      if (ep && (ep.entryPointType === 'video' || (ep.uri && ep.uri.indexOf('meet.google.com') !== -1))) {
        if (ep.uri && typeof ep.uri === 'string') {
          link = ep.uri.trim();
          break;
        }
      }
    }
  }
  if (!link) {
    var title = (typeof evt.getTitle === 'function' ? evt.getTitle() : '') || evt.title || evt.summary || '';
    var desc = (typeof evt.getDescription === 'function' ? evt.getDescription() : '') || evt.description || '';
    var loc = (typeof evt.getLocation === 'function' ? evt.getLocation() : '') || evt.location || '';
    var combined = title + ' ' + loc + ' ' + desc;
    var match = combined.match(/(?:https?:\/\/)?meet\.google\.com\/[a-z0-9_-]+(?:\?[^\s"'<>]*)?/i);
    if (match) {
      link = match[0];
      if (!/^https?:\/\//i.test(link)) {
        link = 'https:' + '/' + '/' + link;
      }
    }
  }
  return link || null;
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
    docUrl: '',
    warnings: []
  };

  try {
    var targetDate = new Date(dateStr + 'T00:00:00');
    var nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    // 1. Fetch Calendar Events
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      try {
        var dayResp = Calendar.Events.list('primary', {
          timeMin: targetDate.toISOString(),
          timeMax: nextDate.toISOString(),
          singleEvents: true,
          maxResults: 250,
          conferenceDataVersion: 1,
          fields: 'items(id,summary,start,end,location,description,hangoutLink,conferenceData,htmlLink,extendedProperties)'
        });
        result.calendarEvents = (dayResp.items || []).map(function(evt) {
          var meetLink = extractMeetLinkFromEvent_(evt);
          return {
            id: evt.id,
            title: evt.summary || '(untitled)',
            startTime: evt.start && (evt.start.dateTime || evt.start.date),
            endTime: evt.end && (evt.end.dateTime || evt.end.date),
            location: evt.location || '',
            description: evt.description || '',
            meetLink: meetLink,
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
          var meetLink = extractMeetLinkFromEvent_(evt);
          var bareId = evt.getId().replace(/@google\.com$/, '');
          return {
            id: bareId,
            title: evt.getTitle(),
            startTime: evt.getStartTime().toISOString(),
            endTime: evt.getEndTime().toISOString(),
            location: evt.getLocation(),
            description: evt.getDescription(),
            meetLink: meetLink,
            htmlLink: 'https:' + '/' + '/calendar.google.com/calendar/event?eid=' +
              Utilities.base64EncodeWebSafe(bareId + ' ' + defaultCalId).replace(/=+$/, ''),
            syncTaskId: evt.getTag('gasTaskId') || null
          };
        });
      } catch (calErr) {
        result.warnings.push(logError('CalendarApp.getEvents', calErr).error);
      }
    }

    // 2. Fetch Google Tasks. Pad the window by a day on each side and re-filter by the exact
    // date client-side, since Google Tasks stores `due` as UTC midnight -- a narrower UTC
    // window can silently drop/shift tasks near the local-day boundary. Paginate: the default
    // page size (~20-100) can be smaller than a user's due-window task count, and an unpaginated
    // call would silently drop tasks past the first page.
    if (typeof Tasks !== 'undefined') {
      try {
        var dueMinUtc = new Date(dateStr + 'T00:00:00.000Z');
        dueMinUtc.setUTCDate(dueMinUtc.getUTCDate() - 1);
        var dueMaxUtc = new Date(dateStr + 'T00:00:00.000Z');
        dueMaxUtc.setUTCDate(dueMaxUtc.getUTCDate() + 2);

        var dayTaskItems = [];
        var dayPageToken = null;
        do {
          var dayTaskParams = {
            dueMin: dueMinUtc.toISOString(),
            dueMax: dueMaxUtc.toISOString(),
            showCompleted: true,
            showHidden: true,
            maxResults: 100
          };
          if (dayPageToken) dayTaskParams.pageToken = dayPageToken;
          var dayTaskResp = Tasks.Tasks.list('@default', dayTaskParams);
          dayTaskItems = dayTaskItems.concat(dayTaskResp.items || []);
          dayPageToken = dayTaskResp.nextPageToken || null;
        } while (dayPageToken);

        result.tasks = dayTaskItems
          .filter(function(t) { return Boolean(t.due) && t.due.substring(0, 10) === dateStr; })
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
      } catch (tasksErr) {
        result.warnings.push(logError('Tasks.Tasks.list', tasksErr).error);
      }
    }

    // 3. Fetch or Create Daily Notes Google Doc. Look up the folder/doc once and reuse the
    // docId for both the docUrl and the content extraction below, instead of each doing its
    // own getValidatedRootFolder()+getOrCreateMonthlyNotesDoc_() Drive round trip.
    try {
      if (typeof DriveApp !== 'undefined' && typeof Docs !== 'undefined') {
        var targetFolder = getValidatedRootFolder();
        if (targetFolder) {
          var d = new Date(dateStr + 'T00:00:00');
          var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          var monthName = monthNames[d.getMonth()];
          var year = d.getFullYear();
          var docName = 'Day Planner Notes - ' + monthName + ' ' + year;
          var docId = getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year);
          if (docId) {
            result.docUrl = 'https:' + '/' + '/docs.google.com/document/d/' + docId + '/edit';
          }
          result.noteContent = getOrCreateDailyDocContent(dateStr, docId);
        } else {
          result.noteContent = getOrCreateDailyDocContent(dateStr);
        }
      } else {
        result.docUrl = 'https:' + '/' + '/docs.google.com/document/d/mock-local-doc/edit';
        result.noteContent = getOrCreateDailyDocContent(dateStr);
      }
    } catch (notesErr) {
      result.warnings.push(logError('getOrCreateDailyDocContent', notesErr).error);
      result.noteContent = '⚠️ Error loading daily doc notes.';
    }

  } catch (err) {
    return logError('getDailyData(' + dateStr + ')', err);
  }

  return result;
}

/** @returns {string} Local YYYY-MM-DD key for a Date, using the script's own local fields (no UTC shift). */
function localDateKey_(d) {
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

/** @returns {Array<string>} Every YYYY-MM-DD date key from startDateStr to endDateStr, inclusive. */
function enumerateDateRange_(startDateStr, endDateStr) {
  var keys = [];
  var cur = new Date(startDateStr + 'T00:00:00');
  var end = new Date(endDateStr + 'T00:00:00');
  while (cur <= end) {
    keys.push(localDateKey_(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

/**
 * Determines which of the requested date keys a Calendar event overlaps, by actual start/end
 * span rather than just its start date -- otherwise day 2+ of a multi-day event silently
 * disappears from the range payload.
 * @param {Object} evt Raw Calendar.Events.list item.
 * @param {Array<string>} dateKeys Sorted candidate date keys for the requested range.
 * @returns {Array<string>} The subset of dateKeys this event spans.
 */
function eventOverlapDateKeys_(evt, dateKeys) {
  var startRaw = evt.start && (evt.start.dateTime || evt.start.date);
  var endRaw = evt.end && (evt.end.dateTime || evt.end.date);
  if (!startRaw) return [];
  var isAllDay = !!(evt.start && evt.start.date && !evt.start.dateTime);

  var startDate = new Date(startRaw);
  var endDate = endRaw ? new Date(endRaw) : startDate;
  if (isAllDay) {
    // Google Calendar's all-day end.date is exclusive -- step back a day so the range covers
    // the last real day the event occupies, not the day after it ends.
    endDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  } else {
    // A timed event ending exactly at local midnight shouldn't also claim the next calendar day.
    endDate = new Date(endDate.getTime() - 1);
  }

  var startKey = localDateKey_(startDate);
  var endKey = localDateKey_(endDate < startDate ? startDate : endDate);
  return dateKeys.filter(function(k) { return k >= startKey && k <= endKey; });
}

/**
 * Batched, READ-ONLY fetch of Calendar/Tasks/Notes data for every date in
 * [startDateStr, endDateStr] (inclusive), for client-side prefetch/caching so day-by-day
 * navigation doesn't cost one getDailyData() round trip (Calendar list + Tasks list + a full
 * monthly-doc read) per day. Unlike getDailyData, this never creates a monthly notes doc as a
 * side effect of being called -- a background prefetch scanning past/future months must not
 * conjure new empty Google Docs. A day whose monthly doc doesn't exist yet, or has no section
 * for that day, comes back with noteContent === null; the client falls back to the existing
 * single-day getDailyData(dateStr) (which does create-if-missing) once that day is opened.
 * @param {string} startDateStr Range start (inclusive), YYYY-MM-DD.
 * @param {string} endDateStr Range end (inclusive), YYYY-MM-DD.
 * @returns {{days: Object<string, Object>, warnings: Array<string>}} Per-date payloads keyed by date.
 */
function getDailyDataRange(startDateStr, endDateStr) {
  var warnings = [];
  var dateKeys = enumerateDateRange_(startDateStr, endDateStr);
  var days = {};
  dateKeys.forEach(function(k) {
    days[k] = { date: k, tasks: [], calendarEvents: [], noteContent: null, docUrl: '' };
  });

  if (typeof Calendar === 'undefined' || !Calendar.Events || typeof Tasks === 'undefined') {
    // Local-dev mock mode: no Workspace services available. Return empty-but-shaped buckets so
    // the client-side mock bridge can seed them from its own mock dataset per date, same as
    // getDailyData's mock branch does.
    return { days: days, warnings: warnings };
  }

  var rangeStart = new Date(startDateStr + 'T00:00:00');
  var rangeEndExclusive = new Date(endDateStr + 'T00:00:00');
  rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);

  // 1. Calendar events, paginated, bucketed by day overlap.
  try {
    var calItems = [];
    var calPageToken = null;
    do {
      var calParams = {
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEndExclusive.toISOString(),
        singleEvents: true,
        maxResults: 250,
        conferenceDataVersion: 1,
        fields: 'items(id,summary,start,end,location,description,hangoutLink,conferenceData,htmlLink,extendedProperties),nextPageToken'
      };
      if (calPageToken) calParams.pageToken = calPageToken;
      var calResp = Calendar.Events.list('primary', calParams);
      calItems = calItems.concat(calResp.items || []);
      calPageToken = calResp.nextPageToken || null;
    } while (calPageToken);

    calItems.forEach(function(evt) {
      var mapped = {
        id: evt.id,
        title: evt.summary || '(untitled)',
        startTime: evt.start && (evt.start.dateTime || evt.start.date),
        endTime: evt.end && (evt.end.dateTime || evt.end.date),
        location: evt.location || '',
        description: evt.description || '',
        meetLink: extractMeetLinkFromEvent_(evt),
        htmlLink: evt.htmlLink || null,
        syncTaskId: (evt.extendedProperties && evt.extendedProperties.shared && evt.extendedProperties.shared.gasTaskId) || null
      };
      eventOverlapDateKeys_(evt, dateKeys).forEach(function(k) {
        if (days[k]) days[k].calendarEvents.push(mapped);
      });
    });
  } catch (calErr) {
    warnings.push(logError('getDailyDataRange Calendar.Events.list', calErr).error);
  }

  // 2. Tasks, paginated, padded UTC window, bucketed by exact due date.
  try {
    var dueMinUtc = new Date(startDateStr + 'T00:00:00.000Z');
    dueMinUtc.setUTCDate(dueMinUtc.getUTCDate() - 1);
    var dueMaxUtc = new Date(endDateStr + 'T00:00:00.000Z');
    dueMaxUtc.setUTCDate(dueMaxUtc.getUTCDate() + 2);

    var taskItems = [];
    var taskPageToken = null;
    do {
      var taskParams = {
        dueMin: dueMinUtc.toISOString(),
        dueMax: dueMaxUtc.toISOString(),
        showCompleted: true,
        showHidden: true,
        maxResults: 100
      };
      if (taskPageToken) taskParams.pageToken = taskPageToken;
      var taskResp = Tasks.Tasks.list('@default', taskParams);
      taskItems = taskItems.concat(taskResp.items || []);
      taskPageToken = taskResp.nextPageToken || null;
    } while (taskPageToken);

    taskItems.forEach(function(t) {
      if (!t.due) return;
      var dueDateKey = t.due.substring(0, 10);
      if (!days[dueDateKey]) return;
      var meta = decodeTaskMeta(t.notes);
      days[dueDateKey].tasks.push({
        id: t.id,
        title: t.title,
        status: deriveTaskStatus(t),
        category: meta.category || 'General',
        dueDate: dueDateKey,
        sourceMasterId: meta.sourceMasterId || null,
        starred: Boolean(meta.starred),
        notes: stripDpTokens(t.notes)
      });
    });
  } catch (tasksErr) {
    warnings.push(logError('getDailyDataRange Tasks.Tasks.list', tasksErr).error);
  }

  // 3. Notes: read-only per-month doc lookup (never create), one Docs.Documents.get per month
  // spanned by the range, split into per-day sections in memory.
  if (typeof DriveApp !== 'undefined' && typeof Docs !== 'undefined') {
    try {
      var targetFolder = getValidatedRootFolder();
      if (targetFolder) {
        var monthKeys = {};
        dateKeys.forEach(function(k) { monthKeys[k.substring(0, 7)] = true; });
        var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        Object.keys(monthKeys).forEach(function(monthKey) {
          var monthParts = monthKey.split('-');
          var monthName = monthNames[parseInt(monthParts[1], 10) - 1];
          var year = parseInt(monthParts[0], 10);
          var docName = 'Day Planner Notes - ' + monthName + ' ' + year;

          var files = targetFolder.getFilesByName(docName);
          if (!files.hasNext()) return; // read-only: never create a month's doc during a prefetch
          var docId = files.next().getId();
          var docUrl = 'https:' + '/' + '/docs.google.com/document/d/' + docId + '/edit';
          var elements = docsGetBodyElements_(docId);

          dateKeys.forEach(function(k) {
            if (k.substring(0, 7) !== monthKey) return;
            days[k].docUrl = docUrl;
            var extracted = extractDaySectionText_(elements, k);
            if (extracted !== null) days[k].noteContent = extracted;
          });
        });
      }
    } catch (notesErr) {
      warnings.push(logError('getDailyDataRange notes', notesErr).error);
    }
  }

  return { days: days, warnings: warnings };
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
    return files.next().getId();
  }

  var resource = {
    title: docName,
    mimeType: 'application/vnd.google-apps.document',
    parents: [{ id: targetFolder.getId() }]
  };
  var created = Drive.Files.insert(resource);
  var titleText = 'Day Planner Notes - ' + monthName + ' ' + year;
  Docs.Documents.batchUpdate({
    requests: [
      { insertText: { location: { index: 1 }, text: titleText } },
      {
        updateParagraphStyle: {
          range: { startIndex: 1, endIndex: 1 + titleText.length },
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType'
        }
      }
    ]
  }, created.id);
  return created.id;
}

/**
 * Helper to identify if a Docs API structural element is the heading for a specific target day.
 * Matches HEADING_2 paragraphs or lines containing dayFormatted or dateStr.
 * @param {Object} element Candidate body structural element (see docsGetBodyElements_).
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} [dayFormatted] Formatted date string (e.g. "Friday, September 25, 2026").
 * @returns {boolean} True if element matches the day’s heading.
 */
function isDayHeadingElement_(element, dateStr, dayFormatted) {
  if (!element) return false;
  var heading = docsElementHeading_(element);
  var text = docsElementText_(element).trim();
  if (heading === 'HEADING_2' || text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) {
    if (text.indexOf(dateStr) !== -1 || (dayFormatted && text.indexOf(dayFormatted) !== -1)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to identify if a Docs API structural element marks any day’s section boundary.
 * @param {Object} element Candidate body structural element (see docsGetBodyElements_).
 * @returns {boolean} True if element is a day heading.
 */
function isAnyDayHeadingElement_(element) {
  if (!element) return false;
  var heading = docsElementHeading_(element);
  var text = docsElementText_(element).trim();
  if (heading === 'HEADING_2') return true;
  if (text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) return true;
  return false;
}

/**
 * Locates and extracts a single day's section text from an already-fetched array of doc body
 * elements (see docsGetBodyElements_). Shared by getOrCreateDailyDocContent (single day) and
 * getDailyDataRange (many days against one already-read monthly doc, so this never re-reads
 * the doc per day).
 * @param {Array<Object>} elements Doc body paragraph elements for one monthly doc.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @returns {string|null} Card content text, or null if this date has no section in the doc.
 */
function extractDaySectionText_(elements, dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
  var dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  var dayHeadingIndex = -1;
  for (var i = 0; i < elements.length; i++) {
    if (isDayHeadingElement_(elements[i], dateStr, dayFormatted)) {
      dayHeadingIndex = i;
      break;
    }
  }
  if (dayHeadingIndex === -1) return null;

  var contentLines = [];
  for (var j = dayHeadingIndex + 1; j < elements.length; j++) {
    var el = elements[j];
    if (isAnyDayHeadingElement_(el)) break;
    if (docsElementIsPageBreak_(el)) continue;
    var heading = docsElementHeading_(el);
    var text = docsElementText_(el);
    if (heading === 'HEADING_3') {
      contentLines.push('### ' + text);
    } else if (docsElementIsListItem_(el)) {
      contentLines.push('- ' + text);
    } else if (text.trim()) {
      contentLines.push(text);
    }
  }
  return contentLines.length > 0 ? contentLines.join('\n') : null;
}

/**
 * Gets or creates the Monthly Note Google Doc (12 per year) and extracts/appends daily note content.
 * Script-efficient and formatted for human readability & printing.
 * @param {string} dateStr Target date string in YYYY-MM-DD format.
 * @param {string} [knownDocId] Pre-resolved doc id (e.g. from a caller that already looked up
 *   the monthly doc for this date), skipping the redundant folder/file Drive lookup below.
 * @returns {string} Text content of daily note section.
 */
function getOrCreateDailyDocContent(dateStr, knownDocId) {
  if (typeof DriveApp === 'undefined' || typeof Docs === 'undefined') {
    return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.\n\n### #index [Finance] Budget Sync\n- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.';
  }

  try {
    var docId = knownDocId;
    if (!docId) {
      var targetFolder = getValidatedRootFolder();
      if (!targetFolder) {
        return '### #index [Architecture] System Design\nFinalized 3-column binder layout with Alpine.js and clean CSS.';
      }

      var parts = dateStr.split('-');
      var docDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var monthName = monthNames[docDate.getMonth()];
      var year = docDate.getFullYear();
      var docName = 'Day Planner Notes - ' + monthName + ' ' + year;
      docId = getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year);
    }
    var elements = docsGetBodyElements_(docId);
    var extracted = extractDaySectionText_(elements, dateStr);
    return extracted !== null ? extracted : ('### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.');
  } catch (err) {
    logError('getOrCreateDailyDocContent(' + dateStr + ')', err);
    return '### #index [General] Daily Notes for ' + dateStr;
  }
}

/**
 * Saves/updates daily topic cards content in the Monthly Google Doc (12 per year).
 * Idempotently replaces existing day section in-place to prevent duplication, via a single
 * Docs Advanced Service batchUpdate (delete the old section's character range, insert the new
 * one, then apply heading/bullet style requests) rather than DocumentApp's per-element tree API.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} noteContent Markdown/card note content to persist.
 * @returns {{success: boolean, docName: string}} Result status.
 */
function saveDailyDocCards(dateStr, noteContent) {
  if (typeof DriveApp === 'undefined' || typeof Docs === 'undefined') {
    return { success: true, docName: 'Local Dev Mock Doc' };
  }

  try {
    var targetFolder = getValidatedRootFolder();
    if (!targetFolder) throw new Error('Root folder not configured.');

    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthName = monthNames[d.getMonth()];
    var year = d.getFullYear();
    var docName = 'Day Planner Notes - ' + monthName + ' ' + year;

    var docId = getOrCreateMonthlyNotesDoc_(targetFolder, docName, monthName, year);
    var dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    var dayHeadingText = 'Day Planner - ' + dayFormatted;
    var lines = (noteContent || '').split('\n');

    var elements = docsGetBodyElements_(docId);
    var dayHeadingIndex = -1;
    for (var i = 0; i < elements.length; i++) {
      if (isDayHeadingElement_(elements[i], dateStr, dayFormatted)) {
        dayHeadingIndex = i;
        break;
      }
    }

    var requests = [];

    if (dayHeadingIndex !== -1) {
      // Idempotent replacement: determine range of existing day section [dayHeadingIndex, endElIndex)
      var endElIndex = elements.length;
      for (var j = dayHeadingIndex + 1; j < elements.length; j++) {
        if (isAnyDayHeadingElement_(elements[j])) {
          // If the element immediately preceding the next day heading is a page break, keep it
          // in place for the next section rather than deleting it as part of this one.
          if (j > 0 && docsElementIsPageBreak_(elements[j - 1])) {
            endElIndex = j - 1;
          } else {
            endElIndex = j;
          }
          break;
        }
      }

      var deleteStart = elements[dayHeadingIndex].startIndex;
      var deleteEnd = elements[endElIndex - 1].endIndex;
      var docEndIndex = elements[elements.length - 1].endIndex;
      // A doc's final newline can never be deleted -- clamp if this range would reach doc end.
      if (deleteEnd >= docEndIndex) deleteEnd = docEndIndex - 1;

      requests.push({ deleteContentRange: { range: { startIndex: deleteStart, endIndex: deleteEnd } } });
      var plan = buildDaySectionRequests_(deleteStart, dayHeadingText, lines);
      requests.push({ insertText: { location: { index: deleteStart }, text: plan.text } });
      requests = requests.concat(plan.styleRequests);
    } else {
      // New day: insert a page break first if the doc doesn't already end with one, then the
      // heading and cards after it.
      var lastElement = elements[elements.length - 1];
      var insertAt = lastElement ? lastElement.endIndex - 1 : 1;
      if (lastElement && !docsElementIsPageBreak_(lastElement)) {
        requests.push({ insertPageBreak: { location: { index: insertAt } } });
        insertAt += 1;
      }
      var newPlan = buildDaySectionRequests_(insertAt, dayHeadingText, lines);
      requests.push({ insertText: { location: { index: insertAt }, text: newPlan.text } });
      requests = requests.concat(newPlan.styleRequests);
    }

    Docs.Documents.batchUpdate({ requests: requests }, docId);
    return { success: true, docName: docName };
  } catch (err) {
    logError('saveDailyDocCards(' + dateStr + ')', err);
    return { success: false, error: err.message || err.toString() };
  }
}

/**
 * STT fallback: creates a fresh, single-purpose Google Doc for the user to dictate into via
 * Docs' own Voice Typing (works on locked-down networks where this app's own mic access is
 * blocked by enterprise policy, since docs.google.com is commonly allowlisted separately).
 * Identified by its own docId so concurrent dictation sessions (multiple tabs/fields) never
 * collide on a shared scratch file. Caller is responsible for calling
 * pullDictationScratchText(docId) to retrieve the text; the doc's body is cleared (not
 * trashed/deleted) once successfully pulled, so the doc stays in place but reads as empty.
 * @returns {{success: boolean, docId?: string, docUrl?: string, error?: string}} Creation result.
 */
function createDictationScratchDoc() {
  if (typeof Drive === 'undefined' || typeof Docs === 'undefined') {
    return { success: true, docId: 'mock-scratch-doc', docUrl: 'https:' + '/' + '/docs.google.com/document/d/mock-scratch-doc/edit' };
  }
  try {
    var scratchTimestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var targetFolder = getValidatedRootFolder();
    var created = Drive.Files.insert({
      title: 'Day Planner - Voice Typing Scratchpad ' + scratchTimestamp,
      mimeType: 'application/vnd.google-apps.document',
      parents: targetFolder ? [{ id: targetFolder.getId() }] : undefined
    });
    var instructions = 'Click below, then use Tools > Voice typing (Ctrl+Shift+S). Switch back to Day Planner and click "Pull from Doc" when done.';
    Docs.Documents.batchUpdate({
      requests: [{ insertText: { location: { index: 1 }, text: instructions } }]
    }, created.id);

    return { success: true, docId: created.id, docUrl: 'https:' + '/' + '/docs.google.com/document/d/' + created.id + '/edit' };
  } catch (err) {
    logError('createDictationScratchDoc()', err);
    return { success: false, error: err.message || err.toString() };
  }
}

/**
 * Reads back the dictated text from a scratch doc created by createDictationScratchDoc(),
 * strips the instructional placeholder line, and clears the doc body so a re-pull of the same
 * docId can't silently return duplicate text.
 * @param {string} docId The scratch doc's id, as returned by createDictationScratchDoc().
 * @returns {{success: boolean, text?: string, error?: string}} Pull result.
 */
function pullDictationScratchText(docId) {
  if (typeof Docs === 'undefined') {
    return { success: true, text: 'Mock voice-typed text from local dev scratch doc.' };
  }
  if (!docId) {
    return { success: false, error: 'No scratch doc id provided.' };
  }
  try {
    var elements = docsGetBodyElements_(docId);
    var lines = elements.map(docsElementText_);
    var placeholder = 'Click below, then use Tools > Voice typing';
    var text = lines.filter(function (line) {
      return line.indexOf(placeholder) !== 0;
    }).join('\n').trim();

    try {
      var docEndIndex = elements.length ? elements[elements.length - 1].endIndex : 2;
      if (docEndIndex > 2) {
        Docs.Documents.batchUpdate({
          requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: docEndIndex - 1 } } }]
        }, docId);
      }
    } catch (clearErr) {
      console.warn('pullDictationScratchText body clear skipped: ' + clearErr.toString());
    }

    return { success: true, text: text };
  } catch (err) {
    logError('pullDictationScratchText(' + docId + ')', err);
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
  var idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) {
    return { success: false, error: 'Not a recognized Google Docs/Sheets/Slides/Forms/Drive URL.' };
  }
  var fileId = idMatch[1];
  var isFolder = /\/folders\//.test(url);

  var errors = [];

  // Try 1: Drive Advanced Service v2 (Handles files, folders, shortcuts, and shared drives)
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
      var item = null;
      try {
        item = Drive.Files.get(fileId, { supportsAllDrives: true });
      } catch {
        item = Drive.Files.get(fileId);
      }
      if (item && (item.title || item.name)) {
        return { success: true, title: item.title || item.name, fileId: fileId };
      }
    }
  } catch (v2Err) {
    var m1 = 'Drive v2: ' + (v2Err.message || v2Err.toString());
    errors.push(m1);
    logWarn('resolveDriveFileTitle: ' + m1);
  }

  // Try 2: DriveApp (Folders and Files)
  try {
    if (typeof DriveApp !== 'undefined') {
      if (isFolder) {
        var folder = DriveApp.getFolderById(fileId);
        if (folder) return { success: true, title: folder.getName(), fileId: fileId };
      } else {
        var file = DriveApp.getFileById(fileId);
        if (file) return { success: true, title: file.getName(), fileId: fileId };
      }
    }
  } catch (driveErr) {
    var m2 = 'DriveApp: ' + (driveErr.message || driveErr.toString());
    errors.push(m2);
    logWarn('resolveDriveFileTitle: ' + m2);
  }

  // Try 3: Specialized Workspace App services (Docs handled by Try 1/2 via Drive metadata
  // already -- DocumentApp.openById() was dropped here since it duplicated that coverage while
  // requiring the broad `documents` OAuth scope for no additional benefit)
  try {
    if (/spreadsheets/i.test(url) && typeof SpreadsheetApp !== 'undefined') {
      var ss = SpreadsheetApp.openById(fileId);
      if (ss) return { success: true, title: ss.getName(), fileId: fileId };
    }
  } catch (ssErr) {
    var m4 = 'SpreadsheetApp: ' + (ssErr.message || ssErr.toString());
    errors.push(m4);
    logWarn('resolveDriveFileTitle: ' + m4);
  }

  try {
    if (/presentation/i.test(url) && typeof SlidesApp !== 'undefined') {
      var pres = SlidesApp.openById(fileId);
      if (pres) return { success: true, title: pres.getName(), fileId: fileId };
    }
  } catch (presErr) {
    var m5 = 'SlidesApp: ' + (presErr.message || presErr.toString());
    errors.push(m5);
    logWarn('resolveDriveFileTitle: ' + m5);
  }

  return { success: false, error: errors.join('; ') || 'Unable to resolve title for this Drive link.' };
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
/**
 * Builds the unified Master Tasks commitment clearinghouse list.
 * Merges undated backlog tasks with incomplete dated tasks across all dates.
 * Deduplicates and collapses moved master tasks with their scheduled daily tasks.
 * @param {Array<object>} rawTasks Array of task objects.
 * @returns {Array<object>} Unified clearinghouse tasks.
 */
function buildMasterTasksClearinghouse(rawTasks) {
  if (!rawTasks || !rawTasks.length) return [];

  var normalized = rawTasks.map(function(t) {
    var rawDue = t.due ? String(t.due).substring(0, 10) : (t.dueDate || null);
    var movedTo = t.movedTo || null;
    var movedTaskId = t.movedTaskId || null;
    var sourceMasterId = t.sourceMasterId || null;
    var status = t.status || '•';
    var isCompleted = status === '✓' || status === 'X' || t.status === 'completed' || t.statusRaw === 'completed';

    return {
      id: t.id,
      title: t.title || '',
      category: t.category || 'General',
      status: status,
      starred: Boolean(t.starred),
      notes: t.notes || '',
      dueDate: rawDue || movedTo || null,
      movedTo: movedTo,
      movedTaskId: movedTaskId,
      sourceMasterId: sourceMasterId,
      rawDue: rawDue,
      isCompleted: isCompleted
    };
  });

  var taskById = {};
  var dailyBySourceMasterId = {};
  var masterByMovedTaskId = {};

  for (var i = 0; i < normalized.length; i++) {
    var item = normalized[i];
    if (item.id) taskById[item.id] = item;
    if (item.sourceMasterId) dailyBySourceMasterId[item.sourceMasterId] = item;
    if (item.movedTaskId) masterByMovedTaskId[item.movedTaskId] = item;
  }

  var consumedIds = {};
  var clearinghouse = [];

  // Pass 1: Moved master tasks paired with daily task
  for (var j = 0; j < normalized.length; j++) {
    var mItem = normalized[j];
    if (consumedIds[mItem.id]) continue;

    var targetDaily = mItem.movedTaskId ? taskById[mItem.movedTaskId] : dailyBySourceMasterId[mItem.id];
    if (targetDaily && targetDaily.id !== mItem.id) {
      consumedIds[mItem.id] = true;
      consumedIds[targetDaily.id] = true;

      var mergedDueDate = targetDaily.dueDate || mItem.dueDate || mItem.movedTo;
      clearinghouse.push({
        id: mItem.id,
        title: targetDaily.title || mItem.title,
        category: targetDaily.category || mItem.category || 'General',
        status: targetDaily.status || mItem.status,
        starred: Boolean(targetDaily.starred || mItem.starred),
        notes: targetDaily.notes || mItem.notes || '',
        dueDate: mergedDueDate,
        movedTo: mItem.movedTo || targetDaily.dueDate || null,
        movedTaskId: targetDaily.id
      });
      continue;
    }

    var sourceMaster = mItem.sourceMasterId ? taskById[mItem.sourceMasterId] : masterByMovedTaskId[mItem.id];
    if (sourceMaster && sourceMaster.id !== mItem.id) {
      consumedIds[mItem.id] = true;
      consumedIds[sourceMaster.id] = true;

      var sMergedDueDate = mItem.dueDate || sourceMaster.dueDate || sourceMaster.movedTo;
      clearinghouse.push({
        id: sourceMaster.id,
        title: mItem.title || sourceMaster.title,
        category: mItem.category || sourceMaster.category || 'General',
        status: mItem.status || sourceMaster.status,
        starred: Boolean(mItem.starred || sourceMaster.starred),
        notes: mItem.notes || sourceMaster.notes || '',
        dueDate: sMergedDueDate,
        movedTo: sourceMaster.movedTo || mItem.dueDate || null,
        movedTaskId: mItem.id
      });
      continue;
    }
  }

  // Pass 2: Unlinked tasks
  for (var k = 0; k < normalized.length; k++) {
    var uItem = normalized[k];
    if (consumedIds[uItem.id]) continue;

    if (uItem.rawDue) {
      if (!uItem.isCompleted) {
        clearinghouse.push({
          id: uItem.id,
          title: uItem.title,
          category: uItem.category,
          status: uItem.status,
          starred: uItem.starred,
          notes: uItem.notes,
          dueDate: uItem.dueDate,
          movedTo: uItem.movedTo || null,
          movedTaskId: uItem.movedTaskId || null
        });
      }
    } else {
      clearinghouse.push({
        id: uItem.id,
        title: uItem.title,
        category: uItem.category,
        status: uItem.status,
        starred: uItem.starred,
        notes: uItem.notes,
        dueDate: uItem.movedTo || null,
        movedTo: uItem.movedTo || null,
        movedTaskId: uItem.movedTaskId || null
      });
    }
  }

  return clearinghouse;
}

/**
 * Undated Google Tasks and incomplete dated commitments across all dates.
 * @param {string} [monthYearStr] Optional month/year string (kept for signature compatibility).
 * @returns {Array<{id: string, title: string, category: string, status: string, starred: boolean, notes: string, dueDate: (string|null), movedTo: (string|null), movedTaskId: (string|null)}>} Array of master task items.
 */
function getMasterTasks(monthYearStr) {
  try {
    if (typeof Tasks === 'undefined') {
      return [
        { id: 'm1', title: '[A1] Prepare Q3 performance appraisals', category: 'Work', status: '•', starred: false, notes: 'Draft reviews before Friday', dueDate: null, movedTo: null, movedTaskId: null },
        { id: 'm2', title: '[B1] Plan annual family retreat', category: 'Personal', status: '•', starred: true, notes: 'Check cabin availability in Tahoe', dueDate: null, movedTo: null, movedTaskId: null },
        { id: 'm3', title: '[C1] Rebalance investment portfolio', category: 'Financial', status: '•', starred: false, notes: '', dueDate: null, movedTo: null, movedTaskId: null },
        { id: 'm4', title: '[B2] Migrate server infrastructure to GCP', category: 'Projects', status: '•', starred: false, notes: 'Evaluate Cloud Run vs App Engine', dueDate: null, movedTo: null, movedTaskId: null }
      ];
    }
    var items = [];
    var pageToken = null;
    do {
      var listParams = { showCompleted: true, showHidden: true, maxResults: 100 };
      if (pageToken) listParams.pageToken = pageToken;
      var resp = Tasks.Tasks.list('@default', listParams);
      items = items.concat(resp.items || []);
      pageToken = resp.nextPageToken || null;
    } while (pageToken);
    var decoded = items.map(function(t) {
      var meta = decodeTaskMeta(t.notes);
      return {
        id: t.id,
        title: t.title,
        category: meta.category || 'General',
        status: deriveTaskStatus(t),
        starred: Boolean(meta.starred),
        notes: stripDpTokens(t.notes),
        due: t.due || null,
        movedTo: meta.movedTo || null,
        movedTaskId: meta.movedTaskId || null,
        sourceMasterId: meta.sourceMasterId || null,
        statusRaw: t.status
      };
    });
    return buildMasterTasksClearinghouse(decoded);
  } catch (err) {
    logError('getMasterTasks(' + (monthYearStr || '') + ')', err);
    return [];
  }
}

/**
 * Creates a new master task — an undated or dated Google Task flagged via metadata marker.
 * @param {string} title Task title.
 * @param {string} [category='General'] Optional category classification.
 * @param {string} [dueDate=null] Optional due date in YYYY-MM-DD format.
 * @returns {{id: string, title: string, category: string, status: string, starred: boolean, notes: string, dueDate: string|null, movedTo: null, movedTaskId: null}} Created master task object.
 */
function addMasterTask(title, category, dueDate) {
  try {
    if (typeof Tasks === 'undefined') {
      return {
        id: 'master_' + new Date().getTime(),
        title: title,
        category: category || 'General',
        status: '•',
        starred: false,
        notes: '',
        dueDate: dueDate || null,
        movedTo: null,
        movedTaskId: null
      };
    }
    var taskResource = {
      title: title,
      notes: encodeTaskMeta('', { master: true, category: category || 'General' })
    };
    if (dueDate) {
      taskResource.due = dueDate + 'T00:00:00.000Z';
    }
    var created = Tasks.Tasks.insert(taskResource, '@default');
    var meta = decodeTaskMeta(created.notes);
    return {
      id: created.id,
      title: created.title,
      category: meta.category || category || 'General',
      status: deriveTaskStatus(created),
      starred: Boolean(meta.starred),
      notes: stripDpTokens(created.notes),
      dueDate: created.due ? created.due.substring(0, 10) : (dueDate || null),
      movedTo: null,
      movedTaskId: null
    };
  } catch (err) {
    logError('addMasterTask', err);
    throw err;
  }
}

/**
 * Deletes a master task entirely by ID.
 * @param {string} taskId Google Task id.
 * @returns {boolean} True if deleted successfully.
 */
function deleteMasterTask(taskId) {
  return deleteDailyTask(taskId);
}

/**
 * Updates an existing master task title, status, category, starred, or notes.
 * @param {string} taskId Google Task id.
 * @param {object} updates Fields to update: { title, status, category, starred, notes }.
 * @returns {object|null} Updated task object, or null if the task no longer exists.
 */
function updateMasterTask(taskId, updates) {
  return updateDailyTask('', taskId, updates);
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
    notes = encodeTaskStatusNotes('→', notes);
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

    // Mirror a status change back onto source master task or moved daily task
    if (updates && updates.status !== undefined) {
      var cur = ensureCurrent();
      if (cur) {
        var meta = decodeTaskMeta(cur.notes);
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
        if (meta.movedTaskId) {
          try {
            var movedCurrent = Tasks.Tasks.get('@default', meta.movedTaskId);
            Tasks.Tasks.patch({
              status: patch.status,
              notes: encodeTaskStatusNotes(updates.status, movedCurrent.notes)
            }, '@default', meta.movedTaskId);
          } catch (syncMovedErr) {
            logError('updateDailyTask->movedTaskSync(' + meta.movedTaskId + ')', syncMovedErr);
          }
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
 * Deletes a Google Task entirely by ID.
 * @param {string} taskId Google Task id.
 * @returns {boolean} True if deleted successfully.
 */
function deleteDailyTask(taskId) {
  try {
    if (typeof Tasks === 'undefined') {
      return true;
    }
    Tasks.Tasks.remove('@default', taskId);
    return true;
  } catch (err) {
    if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('Not Found') !== -1)) {
      return true;
    }
    logError('deleteDailyTask(' + taskId + ')', err);
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
 * Computes the last day of a given month as a YYYY-MM-DD string.
 * @param {string} monthKey Month key in YYYY-MM format.
 * @returns {string} Last calendar day of that month, YYYY-MM-DD.
 */
function lastDayOfMonthStr_(monthKey) {
  var parts = monthKey.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var lastDay = new Date(year, month, 0).getDate();
  return monthKey + '-' + String(lastDay).padStart(2, '0');
}

/**
 * Resolves a Future Planning item's due date: the given day-of-month if valid for that
 * month, clamped to the month's last day if out of range, or the last day of the month if
 * no day was given.
 * @param {string} monthKey Target month key in YYYY-MM format.
 * @param {number} [day] Optional day-of-month (1-31).
 * @returns {string} Due date in YYYY-MM-DD format.
 */
function resolveFutureItemDueDate_(monthKey, day) {
  if (!day) return lastDayOfMonthStr_(monthKey);
  var parts = monthKey.split('-');
  var lastDay = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0).getDate();
  var clampedDay = Math.min(Math.max(1, parseInt(day, 10) || 1), lastDay);
  return monthKey + '-' + String(clampedDay).padStart(2, '0');
}

/**
 * Reads all Future Planning items (Google Tasks flagged `[Future]`) whose due date falls
 * within a given calendar year, grouped into a 12-month skeleton.
 * @param {number|string} year Target calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>}} Full year matrix.
 */
function getFutureMatrixData_(year) {
  var yearStr = String(year);
  var matrixData = { year: yearStr, months: {} };
  for (var m = 1; m <= 12; m++) {
    matrixData.months[yearStr + '-' + String(m).padStart(2, '0')] = [];
  }

  // Tasks API caps maxResults at 100 per page (matches getMasterTasks' own list call), so a
  // year with more than 100 due-dated tasks (daily + future combined) needs pagination -- a
  // single unpaginated call would silently truncate and could drop Future items entirely.
  var pageToken = null;
  do {
    var listParams = {
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
      dueMin: yearStr + '-01-01T00:00:00.000Z',
      dueMax: yearStr + '-12-31T23:59:59.999Z'
    };
    if (pageToken) listParams.pageToken = pageToken;
    var resp = Tasks.Tasks.list('@default', listParams);
    var items = resp.items || [];
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      if (!t.due) continue;
      var meta = decodeTaskMeta(t.notes);
      if (!meta.future) continue;
      var monthKey = t.due.substring(0, 7);
      if (!matrixData.months[monthKey]) matrixData.months[monthKey] = [];
      matrixData.months[monthKey].push({
        id: t.id,
        title: t.title,
        category: meta.category || 'General',
        status: deriveTaskStatus(t),
        dueDate: t.due.substring(0, 10)
      });
    }
    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  return matrixData;
}

/**
 * Fetches the Future Planning Matrix (12-month overview) for a given year — month-scoped
 * "big rock" items not yet tied to a specific day, per the Franklin Covey Master Task List
 * model applied across the whole year. Backed by real Google Tasks (flagged `[Future]` in
 * their notes) rather than a per-year Drive JSON file.
 * @param {number|string} year Target calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>}}
 */
function getFutureMatrix(year) {
  try {
    if (typeof Tasks === 'undefined') {
      var mockYear = String(year);
      var mock = { year: mockYear, months: {} };
      for (var m = 1; m <= 12; m++) {
        mock.months[mockYear + '-' + String(m).padStart(2, '0')] = [];
      }
      return mock;
    }
    return getFutureMatrixData_(year);
  } catch (err) {
    return logError('getFutureMatrix(' + year + ')', err);
  }
}

/**
 * Creates a new Future Planning item as a Google Task flagged `[Future]`, due on the given
 * day, or the last day of the target month if no day is specified.
 * @param {number|string} year Target calendar year.
 * @param {string} monthKey Target month key in YYYY-MM format.
 * @param {string} title Item title/description.
 * @param {string} [category] Optional category label.
 * @param {number} [day] Optional day-of-month (1-31). Defaults to the month's last day.
 * @returns {{id: string, title: string, category: string, status: string, dueDate: string}} Created future item.
 */
function addFutureItem(year, monthKey, title, category, day) {
  try {
    if (typeof Tasks === 'undefined') {
      return {
        id: 'fm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: title,
        category: category || 'General',
        status: '•',
        dueDate: resolveFutureItemDueDate_(monthKey, day)
      };
    }
    var dueDate = resolveFutureItemDueDate_(monthKey, day);
    var taskResource = {
      title: title,
      due: dueDate + 'T00:00:00.000Z',
      notes: encodeTaskMeta('', { future: true, category: category || 'General' })
    };
    var created = Tasks.Tasks.insert(taskResource, '@default');
    var meta = decodeTaskMeta(created.notes);
    return {
      id: created.id,
      title: created.title,
      category: meta.category || category || 'General',
      status: deriveTaskStatus(created),
      dueDate: created.due ? created.due.substring(0, 10) : dueDate
    };
  } catch (err) {
    logError('addFutureItem(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Cycles a future item's Franklin-style status marker.
 * @param {number|string} year Target calendar year (unused, kept for call-site compatibility).
 * @param {string} monthKey Target month key (unused, kept for call-site compatibility).
 * @param {string} itemId Future item's Google Task id.
 * @param {string} status New status symbol.
 * @returns {object|null} Updated future item, or null if not found.
 */
function updateFutureItemStatus(year, monthKey, itemId, status) {
  try {
    if (typeof Tasks === 'undefined') {
      return { id: itemId, title: '', category: 'General', status: status };
    }
    var updated = updateDailyTask('', itemId, { status: status });
    if (!updated) return null;
    return { id: updated.id, title: updated.title, category: updated.category, status: updated.status };
  } catch (err) {
    logError('updateFutureItemStatus(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Transfers a future planning item onto a specific day's task list — Franklin Covey's
 * "forwarded" semantics: the item now lives on that day instead of its month bucket.
 * Patches the same underlying Google Task in place (clearing its `[Future]` flag) rather
 * than deleting and recreating it, so the task id is preserved across the transfer.
 * @param {number|string} year Source calendar year (unused, kept for call-site compatibility).
 * @param {string} monthKey Source month key (unused, kept for call-site compatibility).
 * @param {string} itemId Future item's Google Task id.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {string} [priorityGroup] Priority group code ('A', 'B', or 'C').
 * @returns {object|null} Updated daily task object, or null if item not found.
 */
function transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup) {
  try {
    if (typeof Tasks === 'undefined') {
      return { id: itemId, title: '', status: '•', category: 'General', dueDate: dateStr };
    }
    var current = Tasks.Tasks.get('@default', itemId);
    var formattedTitle = '[' + (priorityGroup || 'A').toUpperCase() + '1] ' + current.title;
    var patch = {
      title: formattedTitle,
      due: dateStr + 'T00:00:00.000Z',
      notes: encodeTaskMeta(current.notes, { future: false })
    };
    var updated = Tasks.Tasks.patch(patch, '@default', itemId);
    var meta = decodeTaskMeta(updated.notes);
    return {
      id: updated.id,
      title: updated.title,
      status: deriveTaskStatus(updated),
      category: meta.category || 'General',
      dueDate: updated.due ? updated.due.substring(0, 10) : dateStr,
      starred: Boolean(meta.starred),
      notes: stripDpTokens(updated.notes)
    };
  } catch (err) {
    if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('Not Found') !== -1)) {
      return null;
    }
    logError('transferFutureItem(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Carries a still-open future item forward into next month's bucket by moving its due date
 * to the last day of the following month (rolling into the next calendar year after December).
 * @param {number|string} year Source calendar year (unused, kept for call-site compatibility).
 * @param {string} monthKey Source month key in YYYY-MM format.
 * @param {string} itemId Future item's Google Task id.
 * @returns {object|null} The carried-forward item, or null if not found.
 */
function pushFutureItemToNextMonth(year, monthKey, itemId) {
  try {
    var nextKey = nextMonthKeyStr_(monthKey);
    if (typeof Tasks === 'undefined') {
      return { id: itemId, title: '', category: 'General', status: '•', dueDate: lastDayOfMonthStr_(nextKey) };
    }
    var nextDue = lastDayOfMonthStr_(nextKey);
    var updated = Tasks.Tasks.patch({ due: nextDue + 'T00:00:00.000Z' }, '@default', itemId);
    var meta = decodeTaskMeta(updated.notes);
    return {
      id: updated.id,
      title: updated.title,
      category: meta.category || 'General',
      status: deriveTaskStatus(updated),
      dueDate: updated.due ? updated.due.substring(0, 10) : nextDue
    };
  } catch (err) {
    if (err.message && (err.message.indexOf('404') !== -1 || err.message.indexOf('Not Found') !== -1)) {
      return null;
    }
    logError('pushFutureItemToNextMonth(' + year + ',' + monthKey + ')', err);
    throw err;
  }
}

/**
 * Deletes a future planning item (its underlying Google Task) entirely.
 * @param {number|string} year Target calendar year (unused, kept for call-site compatibility).
 * @param {string} monthKey Target month key (unused, kept for call-site compatibility).
 * @param {string} itemId Future item's Google Task id.
 * @returns {boolean} True if deleted, false if not found.
 */
function deleteFutureItem(year, monthKey, itemId) {
  return deleteDailyTask(itemId);
}

/**
 * Searches across all monthly Google Docs in the Day Planner folder.
 * @param {string} query Search term.
 * @returns {Array<{docName: string, docId: string, docUrl: string, matches: Array<{heading: string, snippet: string}>}>} Match results.
 */
function searchAcrossAllMonthlyDocs(query) {
  var cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) return [];

  if (typeof DriveApp === 'undefined' || typeof Docs === 'undefined') {
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
        var text = docsGetBodyElements_(file.getId()).map(docsElementText_).join('\n');

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

/**
 * Retrieves the published Google Apps Script web app URL.
 * @returns {string} Web app /exec URL.
 */
function getWebAppUrl() {
  return (typeof ScriptApp !== 'undefined' && ScriptApp.getService) ? ScriptApp.getService().getUrl() : '';
}

/**
 * Fetches dictionary definition and synonyms/antonyms for a word via server-side UrlFetchApp.
 * Provides fallback proxy when clientside direct fetch is blocked by strict enterprise/proxy network rules.
 * @param {string} word The word to look up.
 * @returns {object} Lexicon result with word, phonetic, audioUrl, meanings, synonyms, antonyms.
 */
function fetchLexicon(word) {
  try {
    if (!word || typeof word !== 'string') {
      return { success: false, word: '', error: 'No word provided.' };
    }
    var cleanWord = word.trim().toLowerCase().replace(/^[^a-z0-9]+/i, '').replace(/[^a-z0-9]+$/i, '');
    if (!cleanWord) {
      return { success: false, word: '', error: 'Invalid word.' };
    }

    var dictUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(cleanWord);
    var synUrl = 'https://api.datamuse.com/words?rel_syn=' + encodeURIComponent(cleanWord) + '&max=12';
    var antUrl = 'https://api.datamuse.com/words?rel_ant=' + encodeURIComponent(cleanWord) + '&max=12';

    var dictRes = null;
    try {
      var resp = UrlFetchApp.fetch(dictUrl, { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        dictRes = JSON.parse(resp.getContentText());
      }
    } catch (e) {
      console.warn('fetchLexicon dict error: ' + e);
    }

    var synRes = [];
    try {
      var sResp = UrlFetchApp.fetch(synUrl, { muteHttpExceptions: true });
      if (sResp.getResponseCode() === 200) {
        synRes = JSON.parse(sResp.getContentText());
      }
    } catch (e) {
      console.warn('fetchLexicon syn error: ' + e);
    }

    var antRes = [];
    try {
      var aResp = UrlFetchApp.fetch(antUrl, { muteHttpExceptions: true });
      if (aResp.getResponseCode() === 200) {
        antRes = JSON.parse(aResp.getContentText());
      }
    } catch (e) {
      console.warn('fetchLexicon ant error: ' + e);
    }

    var phonetic = '';
    var audioUrl = '';
    var meanings = [];
    var synSet = {};
    var antSet = {};

    if (Array.isArray(dictRes)) {
      dictRes.forEach(function(entry) {
        if (!phonetic && entry.phonetic) phonetic = entry.phonetic;
        if (Array.isArray(entry.phonetics)) {
          entry.phonetics.forEach(function(p) {
            if (!phonetic && p.text) phonetic = p.text;
            if (!audioUrl && p.audio && typeof p.audio === 'string' && p.audio.trim()) {
              var a = p.audio.trim();
              if (a.indexOf('//') === 0) a = 'https:' + a;
              audioUrl = a;
            }
          });
        }
        if (Array.isArray(entry.meanings)) {
          entry.meanings.forEach(function(m) {
            var pos = m.partOfSpeech || 'general';
            var defs = [];
            if (Array.isArray(m.definitions)) {
              m.definitions.slice(0, 3).forEach(function(d) {
                defs.push({ definition: d.definition || '', example: d.example || '' });
                if (Array.isArray(d.synonyms)) {
                  d.synonyms.forEach(function(s) { if (s) synSet[s.toLowerCase()] = true; });
                }
                if (Array.isArray(d.antonyms)) {
                  d.antonyms.forEach(function(a) { if (a) antSet[a.toLowerCase()] = true; });
                }
              });
            }
            if (Array.isArray(m.synonyms)) {
              m.synonyms.forEach(function(s) { if (s) synSet[s.toLowerCase()] = true; });
            }
            if (Array.isArray(m.antonyms)) {
              m.antonyms.forEach(function(a) { if (a) antSet[a.toLowerCase()] = true; });
            }
            if (defs.length > 0) {
              meanings.push({ partOfSpeech: pos, definitions: defs });
            }
          });
        }
      });
    }

    if (Array.isArray(synRes)) {
      synRes.forEach(function(item) {
        if (item && item.word) synSet[item.word.toLowerCase()] = true;
      });
    }
    if (Array.isArray(antRes)) {
      antRes.forEach(function(item) {
        if (item && item.word) antSet[item.word.toLowerCase()] = true;
      });
    }

    delete synSet[cleanWord];
    delete antSet[cleanWord];

    var synList = Object.keys(synSet).slice(0, 16);
    var antList = Object.keys(antSet).slice(0, 16);

    if (meanings.length === 0 && synList.length === 0 && antList.length === 0) {
      return { success: false, word: cleanWord, error: 'No definitions found for "' + cleanWord + '".' };
    }

    return {
      success: true,
      word: cleanWord,
      phonetic: phonetic,
      audioUrl: audioUrl,
      meanings: meanings.slice(0, 3),
      synonyms: synList,
      antonyms: antList
    };
  } catch (err) {
    recordServerLog('ERROR', 'fetchLexicon', err.message, err.stack);
    return { success: false, word: word, error: 'Lexicon service unavailable: ' + err.message };
  }
}

/**
 * Helper to parse a date string (YYYY-MM-DD) from a section heading or monthly doc title.
 * @param {string} heading Heading text.
 * @param {string} docTitle Document title.
 * @returns {string} Formatted date (YYYY-MM-DD) or empty string.
 */
function parseArchiveNoteHeading_(heading, docTitle) {
  var monthMap = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12'
  };

  var text = (heading || '').trim();

  // 1. Look for ISO date: YYYY-MM-DD
  var isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  }

  // 2. Look for Month Day, Year (e.g. "Sunday, August 16, 2026")
  var monthDayYearMatch = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (monthDayYearMatch) {
    var mName = monthDayYearMatch[1].toLowerCase();
    if (monthMap[mName]) {
      var y = monthDayYearMatch[3];
      var m = monthMap[mName];
      var d = String(monthDayYearMatch[2]);
      if (d.length === 1) d = '0' + d;
      return y + '-' + m + '-' + d;
    }
  }

  // 3. Fall back to docTitle if it contains Year and Month
  var titleText = (docTitle || '').trim();
  var titleIsoMatch = titleText.match(/\b(\d{4})-(\d{2})\b/);
  if (titleIsoMatch) {
    return titleIsoMatch[1] + '-' + titleIsoMatch[2] + '-01';
  }
  var titleMonthMatch = titleText.match(/([A-Za-z]+)\s+(\d{4})/);
  if (titleMonthMatch) {
    var tmName = titleMonthMatch[1].toLowerCase();
    if (monthMap[tmName]) {
      return titleMonthMatch[2] + '-' + monthMap[tmName] + '-01';
    }
  }

  return '';
}

/**
 * Deep archive search across historical Day Planner Notes monthly Google Docs
 * using Google Drive fullText search index.
 * @param {string} query Search keyword.
 * @returns {Array<{type: string, title: string, snippet: string, date: string, targetView: string, docName: string, docUrl: string}>}
 */
function searchArchiveNotes(query) {
  var cleanQuery = (query || '').trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  if (typeof DriveApp === 'undefined' && typeof Drive === 'undefined') {
    return [
      {
        type: 'archive',
        title: 'Archive: Daily Note (2026-08-16)',
        snippet: '...Finalized 3-column binder layout with Alpine.js and clean CSS...',
        date: '2026-08-16',
        targetView: 'daily',
        docName: 'Day Planner Notes - August 2026',
        docUrl: '#'
      }
    ];
  }

  try {
    var escapedQuery = cleanQuery.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var driveQuery = "fullText contains '" + escapedQuery + "' and title contains 'Day Planner Notes - ' and trashed = false";

    var matchingFiles = [];
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      try {
        var listRes = Drive.Files.list({
          q: driveQuery,
          maxResults: 12,
          fields: 'items(id,title,alternateLink)'
        });
        if (listRes && Array.isArray(listRes.items)) {
          matchingFiles = listRes.items;
        }
      } catch (listErr) {
        console.warn('Drive.Files.list archive search warning: ' + listErr.toString());
      }
    }

    if (matchingFiles.length === 0 && typeof DriveApp !== 'undefined') {
      try {
        var fileIter = DriveApp.searchFiles(driveQuery);
        var count = 0;
        while (fileIter.hasNext() && count < 12) {
          var f = fileIter.next();
          matchingFiles.push({
            id: f.getId(),
            title: f.getName(),
            alternateLink: f.getUrl()
          });
          count++;
        }
      } catch (iterErr) {
        console.warn('DriveApp.searchFiles archive warning: ' + iterErr.toString());
      }
    }

    var results = [];
    var cleanLower = cleanQuery.toLowerCase();

    for (var i = 0; i < matchingFiles.length; i++) {
      var file = matchingFiles[i];
      var fileId = file.id;
      var fileTitle = file.title || ('Day Planner Notes - ' + (i + 1));
      var fileUrl = file.alternateLink || ('https:' + '/' + '/docs.google.com/document/d/' + fileId + '/edit');

      var elements = [];
      try {
        if (typeof docsGetBodyElements_ === 'function') {
          elements = docsGetBodyElements_(fileId);
        }
      } catch (docsErr) {
        console.warn('docsGetBodyElements_ error on ' + fileId + ': ' + docsErr.toString());
        continue;
      }

      var currentHeading = fileTitle;
      var currentDate = '';
      var docMatches = 0;

      for (var j = 0; j < elements.length; j++) {
        var el = elements[j];
        var text = (typeof docsElementText_ === 'function') ? docsElementText_(el) : '';
        if (!text) continue;

        var heading = (typeof docsElementHeading_ === 'function') ? docsElementHeading_(el) : '';
        var isHeading = heading === 'HEADING_2' || text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0;

        if (isHeading) {
          currentHeading = text;
          currentDate = parseArchiveNoteHeading_(currentHeading, fileTitle);
        }

        if (text.toLowerCase().indexOf(cleanLower) !== -1) {
          var dateForMatch = currentDate || parseArchiveNoteHeading_(text, fileTitle);

          var idx = text.toLowerCase().indexOf(cleanLower);
          var start = Math.max(0, idx - 25);
          var end = Math.min(text.length, idx + cleanLower.length + 45);
          var prefix = start > 0 ? '...' : '';
          var suffix = end < text.length ? '...' : '';
          var snippet = prefix + text.substring(start, end).replace(/\n/g, ' ') + suffix;

          results.push({
            type: 'archive',
            title: 'Archive: ' + (dateForMatch ? 'Daily Note (' + dateForMatch + ')' : fileTitle),
            snippet: snippet.trim(),
            date: dateForMatch || '',
            targetView: 'daily',
            docName: fileTitle,
            docUrl: fileUrl
          });

          docMatches++;
          if (docMatches >= 5) break;
        }
      }

      if (results.length >= 25) break;
    }

    return results;
  } catch (err) {
    recordServerLog('ERROR', 'searchArchiveNotes', err.message, err.stack);
    return [];
  }
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
global.getWebAppUrl = getWebAppUrl;                          // google.script.run: Script.html / About.html
global.syncWorkspaceChanges = syncWorkspaceChanges;          // time-driven trigger handler (by name)
global.include = include;                                    // template: Index.html, SetupFolder.html
global.validateAndSaveFolderUrl = validateAndSaveFolderUrl;  // google.script.run: SetupFolder.html
global.getDailyData = getDailyData;                          // google.script.run: Script.html
global.getDailyDataRange = getDailyDataRange;                // google.script.run: Script.html
global.getMasterTasks = getMasterTasks;                      // google.script.run: Script.html
global.addDailyTask = addDailyTask;                          // google.script.run: Script.html
global.updateDailyTask = updateDailyTask;                    // google.script.run: Script.html
global.deleteDailyTask = deleteDailyTask;                    // google.script.run: Script.html
global.addMasterTask = addMasterTask;                        // google.script.run: Script.html
global.updateMasterTask = updateMasterTask;                  // google.script.run: Script.html
global.deleteMasterTask = deleteMasterTask;                  // google.script.run: Script.html
global.markMasterTaskMoved = markMasterTaskMoved;            // google.script.run: Script.html
global.saveDailyDocCards = saveDailyDocCards;                // google.script.run: Script.html
global.createDictationScratchDoc = createDictationScratchDoc; // google.script.run: Script.html
global.pullDictationScratchText = pullDictationScratchText;  // google.script.run: Script.html
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
global.fetchLexicon = fetchLexicon;                            // google.script.run: Script.html
global.searchArchiveNotes = searchArchiveNotes;              // google.script.run: Script.html

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
global.getOrCreateMonthlyNotesDoc_ = getOrCreateMonthlyNotesDoc_; // used by UnitTests.gs
global.docsGetBodyElements_ = docsGetBodyElements_;          // used by UnitTests.gs
global.docsElementHeading_ = docsElementHeading_;            // used by UnitTests.gs
global.docsElementText_ = docsElementText_;                  // used by UnitTests.gs
global.DAY_PLANNER_FAVICON_URL = DAY_PLANNER_FAVICON_URL;    // used by UnitTests.gs
global.DAY_PLANNER_BUILD_NUMBER = DAY_PLANNER_BUILD_NUMBER;  // HtmlService template scriptlet: Index.html

// Internal aliases for top-level entry point delegators
global._doGetInternal = doGet_original;
global._onOpenInternal = onOpen;
global._syncWorkspaceChangesInternal = syncWorkspaceChanges;
global._setup2WaySyncTriggerInternal = setup2WaySyncTrigger;
global._ensure2WaySyncTriggerInstalledInternal = ensure2WaySyncTriggerInstalled;
global._includeInternal = include;
global._validateAndSaveFolderUrlInternal = validateAndSaveFolderUrl;
global._getDailyDataInternal = getDailyData;
global._getDailyDataRangeInternal = getDailyDataRange;
global._getMasterTasksInternal = getMasterTasks;
global._addDailyTaskInternal = addDailyTask;
global._updateDailyTaskInternal = updateDailyTask;
global._deleteDailyTaskInternal = deleteDailyTask;
global._addMasterTaskInternal = addMasterTask;
global._updateMasterTaskInternal = updateMasterTask;
global._deleteMasterTaskInternal = deleteMasterTask;
global._markMasterTaskMovedInternal = markMasterTaskMoved;
global._saveDailyDocCardsInternal = saveDailyDocCards;
global._createDictationScratchDocInternal = createDictationScratchDoc;
global._pullDictationScratchTextInternal = pullDictationScratchText;
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
global._getWebAppUrlInternal = getWebAppUrl;
global._fetchLexiconInternal = fetchLexicon;
global._searchArchiveNotesInternal = searchArchiveNotes;

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

function getDailyDataRange(startDateStr, endDateStr) {
  return (typeof _getDailyDataRangeInternal === 'function') ? _getDailyDataRangeInternal(startDateStr, endDateStr) : (globalThis._getDailyDataRangeInternal ? globalThis._getDailyDataRangeInternal(startDateStr, endDateStr) : null);
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

function deleteDailyTask(taskId) {
  return (typeof _deleteDailyTaskInternal === 'function') ? _deleteDailyTaskInternal(taskId) : (globalThis._deleteDailyTaskInternal ? globalThis._deleteDailyTaskInternal(taskId) : null);
}

function addMasterTask(title, category, dueDate) {
  return (typeof _addMasterTaskInternal === 'function') ? _addMasterTaskInternal(title, category, dueDate) : (globalThis._addMasterTaskInternal ? globalThis._addMasterTaskInternal(title, category, dueDate) : null);
}

function updateMasterTask(taskId, updates) {
  return (typeof _updateMasterTaskInternal === 'function') ? _updateMasterTaskInternal(taskId, updates) : (globalThis._updateMasterTaskInternal ? globalThis._updateMasterTaskInternal(taskId, updates) : null);
}

function deleteMasterTask(taskId) {
  return (typeof _deleteMasterTaskInternal === 'function') ? _deleteMasterTaskInternal(taskId) : (globalThis._deleteMasterTaskInternal ? globalThis._deleteMasterTaskInternal(taskId) : null);
}

function markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
  return (typeof _markMasterTaskMovedInternal === 'function') ? _markMasterTaskMovedInternal(masterTaskId, targetDateStr, movedTaskId) : (globalThis._markMasterTaskMovedInternal ? globalThis._markMasterTaskMovedInternal(masterTaskId, targetDateStr, movedTaskId) : null);
}

function saveDailyDocCards(dateStr, noteContent) {
  return (typeof _saveDailyDocCardsInternal === 'function') ? _saveDailyDocCardsInternal(dateStr, noteContent) : (globalThis._saveDailyDocCardsInternal ? globalThis._saveDailyDocCardsInternal(dateStr, noteContent) : null);
}

function createDictationScratchDoc() {
  return (typeof _createDictationScratchDocInternal === 'function') ? _createDictationScratchDocInternal() : (globalThis._createDictationScratchDocInternal ? globalThis._createDictationScratchDocInternal() : null);
}

function pullDictationScratchText(docId) {
  return (typeof _pullDictationScratchTextInternal === 'function') ? _pullDictationScratchTextInternal(docId) : (globalThis._pullDictationScratchTextInternal ? globalThis._pullDictationScratchTextInternal(docId) : null);
}

function resolveDriveFileTitle(url) {
  return (typeof _resolveDriveFileTitleInternal === 'function') ? _resolveDriveFileTitleInternal(url) : (globalThis._resolveDriveFileTitleInternal ? globalThis._resolveDriveFileTitleInternal(url) : null);
}

function getFutureMatrix(year) {
  return (typeof _getFutureMatrixInternal === 'function') ? _getFutureMatrixInternal(year) : (globalThis._getFutureMatrixInternal ? globalThis._getFutureMatrixInternal(year) : null);
}

function addFutureItem(year, monthKey, title, category, day) {
  return (typeof _addFutureItemInternal === 'function') ? _addFutureItemInternal(year, monthKey, title, category, day) : (globalThis._addFutureItemInternal ? globalThis._addFutureItemInternal(year, monthKey, title, category, day) : null);
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

function getWebAppUrl() {
  return (typeof _getWebAppUrlInternal === 'function') ? _getWebAppUrlInternal() : (globalThis._getWebAppUrlInternal ? globalThis._getWebAppUrlInternal() : '');
}

function fetchLexicon(word) {
  return (typeof _fetchLexiconInternal === 'function') ? _fetchLexiconInternal(word) : (globalThis._fetchLexiconInternal ? globalThis._fetchLexiconInternal(word) : null);
}

function searchArchiveNotes(query) {
  return (typeof _searchArchiveNotesInternal === 'function') ? _searchArchiveNotesInternal(query) : (globalThis._searchArchiveNotesInternal ? globalThis._searchArchiveNotesInternal(query) : []);
}
