/**
 * @file GmailRepository.gs
 * @description Gmail access for the Gmail/Meeting hub (Phase 28). Uses ONLY the Advanced Gmail service
 * (gmail.modify): Users.Labels.list, Users.Threads.list, Users.Threads.get with format metadata or full.
 * The built-in mail service is banned (needs the full mail scope; lint enforced). The only thread writes
 * are the two Triage buttons: archiveThread (removes the INBOX label and nothing else, so the 🎯 labels
 * the queue relies on survive) and trashThread (Trash, recoverable; never a permanent delete).
 * Setup writes: ensureLabels creates missing 🎯/ labels (never renames or deletes), and createFilter
 * adds a filter whose only action is adding one label (gmail.settings.basic; the user ticks each one).
 * Message bodies are read in memory for triage scoring, capped, returned only to in-process callers,
 * and NEVER logged or persisted.
 *
 * Label names contain an emoji prefix and slashes, so they are resolved to label IDs through
 * Labels.list and queried via labelIds, never via a q= string.
 *
 * Wrapped in an IIFE per .agents/rules/gas-namespace-iife.md; the only export is the DPGmailRepo
 * namespace (cross-file use by QueueProcessor.gs / HubController.gs). Top-level state is literal-only
 * per .agents/rules/gas-global-init-order.md; DPEngines and friends are read lazily inside functions.
 */
(function(global) {

var GMAIL_ME_ = 'me';
// Account-agnostic permalink (no /u/0/ account index): Gmail resolves it in whichever signed-in account owns the thread.
var GMAIL_URL_BASE_ = 'https://mail.google.com/mail/#all/';
var GMAIL_THREAD_ID_RE_ = /^[A-Za-z0-9_-]{1,64}$/;
var GMAIL_BODY_CAP_ = 4000;
// Triage row preview: Gmail's own snippet of the latest message (Gmail sends about 200 chars).
var GMAIL_SNIPPET_CAP_ = 300;
var GMAIL_META_HEADERS_ = ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Id'];
// Gmail quota units per call (Gmail API usage limits, May 2026: 6,000 units per user per minute, shared by
// everything this app does). Callers that read in bulk charge a meter with these before each call.
var GMAIL_UNITS_ = { messagesList: 5, messagesGet: 20, threadsList: 10, threadsGet: 40 };
var gmailLabelCache_ = null;

/**
 * @returns {void}
 * @throws {Error} When the Advanced Gmail service is not enabled.
 */
function requireGmail_() {
  if (typeof Gmail === 'undefined' || !Gmail.Users || !Gmail.Users.Threads || !Gmail.Users.Labels) {
    var err = new Error('Advanced Gmail service is not enabled for this project');
    err.code = 'GMAIL_SERVICE_MISSING';
    throw err;
  }
}

/**
 * @param {*} threadId Candidate thread id.
 * @returns {string} The validated id.
 * @throws {Error} When the id is not a plain Gmail id (also guards operation keys).
 */
function validateThreadId(threadId) {
  if (typeof threadId !== 'string' || !GMAIL_THREAD_ID_RE_.test(threadId)) {
    var err = new Error('Invalid Gmail thread id');
    err.code = 'INVALID_THREAD_ID';
    err.retryable = false;
    throw err;
  }
  return threadId;
}

/**
 * Permalink to a thread in the Gmail web UI.
 * @param {string} threadId Gmail thread id.
 * @returns {string} URL.
 */
function gmailUrl(threadId) {
  return GMAIL_URL_BASE_ + validateThreadId(threadId);
}

/**
 * @returns {Array<{id:string,name:string}>} All labels of the user (cached per execution).
 */
function listLabels_() {
  if (gmailLabelCache_) return gmailLabelCache_;
  requireGmail_();
  var resp = Gmail.Users.Labels.list(GMAIL_ME_) || {};
  gmailLabelCache_ = (resp.labels || []).map(function(l) { return { id: l.id, name: l.name }; });
  return gmailLabelCache_;
}

/**
 * Resolves a label NAME (emoji/slashes allowed) to its id.
 * @param {string} name Label name.
 * @returns {string|null} Label id or null when the user has no such label.
 */
function resolveLabelId(name) {
  var labels = listLabels_();
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].name === name) return labels[i].id;
  }
  return null;
}

/**
 * Lists thread ids carrying a label.
 * @param {string} labelName Label name, e.g. the workflow Task label.
 * @param {{maxResults?:number, pageToken?:string}} [opts] Paging.
 * @returns {{labelFound:boolean, threadIds:string[], nextPageToken:(string|null)}} Page of ids.
 */
function listThreadsByLabel(labelName, opts) {
  var o = opts || {};
  var labelId = resolveLabelId(labelName);
  if (!labelId) return { labelFound: false, threadIds: [], historyIds: {}, nextPageToken: null };
  // inboxOnly: Gmail ANDs labelIds, so this lists threads with the label that are still in the Inbox.
  var params = { labelIds: o.inboxOnly ? [labelId, 'INBOX'] : [labelId], maxResults: o.maxResults || 50 };
  if (o.pageToken) params.pageToken = o.pageToken;
  var resp = Gmail.Users.Threads.list(GMAIL_ME_, params) || {};
  // historyId moves on any new message or label change: the Triage row cache keys on it.
  var historyIds = {};
  (resp.threads || []).forEach(function(t) { if (t.historyId) historyIds[t.id] = String(t.historyId); });
  return {
    labelFound: true,
    threadIds: (resp.threads || []).map(function(t) { return t.id; }),
    historyIds: historyIds,
    nextPageToken: resp.nextPageToken || null
  };
}

/**
 * @param {Array<{name:string,value:string}>} headers Message headers.
 * @param {string} name Header name.
 * @returns {string} Header value or empty string.
 */
function header_(headers, name) {
  var lower = name.toLowerCase();
  for (var i = 0; i < (headers || []).length; i++) {
    if (String(headers[i].name).toLowerCase() === lower) return String(headers[i].value || '');
  }
  return '';
}

/**
 * @param {number|string} value Epoch ms or a date string.
 * @returns {string} ISO instant, or '' when the value is missing or unparseable.
 */
function isoOrEmpty_(value) {
  if (value === '' || value === undefined || value === null) return '';
  var d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * @param {string} list Comma separated address list header.
 * @returns {string[]} Individual address strings.
 */
function splitAddresses_(list) {
  return String(list || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * @param {string} from Raw From header.
 * @returns {string} Display name (or the address when no display name).
 */
function displayName_(from) {
  var m = String(from || '').match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return m && m[1].trim() ? m[1].trim() : String(from || '').replace(/[<>]/g, '').trim();
}

/**
 * @param {string} from Raw From header.
 * @returns {string} Lower-cased bare address.
 */
function address_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

/**
 * The Advanced Gmail service returns body.data already decoded, as a byte array; base64-decoding it threw
 * "Could not decode string." live (2026-10-10). A string (REST shape: base64url, unpadded) is decoded.
 * @param {Array<number>|string} data body.data
 * @returns {Array<number>} Bytes for Utilities.newBlob.
 */
function bodyBytes_(data) {
  if (typeof data !== 'string') return data;
  var s = data;
  while (s.length % 4 !== 0) s += '=';
  return Utilities.base64DecodeWebSafe(s);
}

/**
 * Extracts plain text from a full-format payload, in memory only, capped.
 * @param {object} payload Gmail message payload.
 * @returns {string} Up to the cap of plain text.
 */
function bodyText_(payload) {
  var out = [];
  var stack = [payload];
  while (stack.length && out.join('').length < GMAIL_BODY_CAP_) {
    var part = stack.shift();
    if (!part) continue;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      out.push(Utilities.newBlob(bodyBytes_(part.body.data)).getDataAsString());
    }
    (part.parts || []).forEach(function(p) { stack.push(p); });
  }
  return out.join('\n').slice(0, GMAIL_BODY_CAP_);
}

/**
 * Gmail snippets arrive HTML-escaped (&#39; &amp; ...). Decoded to plain text for x-text display.
 * @param {string} s Raw Gmail snippet.
 * @returns {string} Plain text, capped.
 */
function decodeSnippet_(s) {
  var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(s || '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function(all, code) {
    if (code.charAt(0) === '#') {
      var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    var v = named[code.toLowerCase()];
    return v === undefined ? all : v;
  }).slice(0, GMAIL_SNIPPET_CAP_);
}

var userEmailMemo_ = null;

/**
 * Config tab UserEmail (seeded from the Gmail profile), read once per execution. Not
 * Session.getActiveUser: the manifest has no userinfo.email scope.
 * @returns {string} Lower-cased email of the user.
 */
function userEmail_() {
  if (userEmailMemo_ === null) userEmailMemo_ = String(DPConfig.getConfig().UserEmail).toLowerCase();
  return userEmailMemo_;
}

/**
 * Reads a thread and normalizes it. Throws with code THREAD_NOT_FOUND (retryable false) on 404.
 * @param {string} threadId Gmail thread id.
 * @param {{withBody?:boolean, withSnippet?:boolean}} [opts] withBody reads format full (bodies kept in memory only);
 *   withSnippet adds lastSnippet, Gmail's preview of the latest message (Triage board only).
 * @returns {{threadId:string,url:string,subject:string,labels:string[],userEmail:string,lastMessageId:string,lastSnippet:string,
 *   messages:Array<{id:string,from:string,fromName:string,to:string[],cc:string[],date:string,isFromUser:boolean,bodyText:string}>}}
 *   Normalized thread. bodyText is empty unless withBody.
 */
function getThreadMeta(threadId, opts) {
  validateThreadId(threadId);
  requireGmail_();
  var withBody = !!(opts && opts.withBody);
  var thread;
  try {
    thread = withBody
      ? Gmail.Users.Threads.get(GMAIL_ME_, threadId, { format: 'full' })
      : Gmail.Users.Threads.get(GMAIL_ME_, threadId, { format: 'metadata', metadataHeaders: GMAIL_META_HEADERS_ });
  } catch (err) {
    var text = String((err && err.message) || err);
    if ((err && err.code === 404) || /not found|404/i.test(text)) {
      var nf = new Error('Gmail thread not found');
      nf.code = 'THREAD_NOT_FOUND';
      nf.retryable = false;
      throw nf;
    }
    throw err;
  }
  var me = userEmail_();
  var idToName = {};
  listLabels_().forEach(function(l) { idToName[l.id] = l.name; });
  var labelIds = {};
  var messages = (thread.messages || []).map(function(m) {
    (m.labelIds || []).forEach(function(id) { labelIds[id] = true; });
    var h = (m.payload && m.payload.headers) || [];
    var from = header_(h, 'From');
    var dateHeader = header_(h, 'Date');
    // internalDate first, the Date header as fallback; an unparseable value yields '' instead of throwing for the whole thread.
    var dateIso = isoOrEmpty_(m.internalDate ? Number(m.internalDate) : NaN) || isoOrEmpty_(dateHeader);
    return {
      id: m.id,
      from: from,
      fromName: displayName_(from),
      to: splitAddresses_(header_(h, 'To')),
      cc: splitAddresses_(header_(h, 'Cc')),
      date: dateIso,
      isFromUser: !!me && address_(from) === me,
      subject: header_(h, 'Subject'),
      listId: header_(h, 'List-Id'),
      bodyText: withBody ? bodyText_(m.payload) : ''
    };
  });
  var first = messages[0] || { subject: '' };
  var labels = Object.keys(labelIds).map(function(id) { return idToName[id] || id; });
  return {
    threadId: threadId,
    url: gmailUrl(threadId),
    subject: first.subject || '(no subject)',
    labels: labels,
    userEmail: me,
    lastMessageId: messages.length ? messages[messages.length - 1].id : '',
    lastSnippet: opts && opts.withSnippet && thread.messages && thread.messages.length ? decodeSnippet_(thread.messages[thread.messages.length - 1].snippet) : '',
    messages: messages
  };
}

/**
 * @param {string} threadId Gmail thread id.
 * @returns {boolean} True when the thread still exists (metadata read; false only on a real 404).
 */
function threadExists(threadId) {
  try {
    getThreadMeta(threadId, null);
    return true;
  } catch (err) {
    if (err && err.code === 'THREAD_NOT_FOUND') return false;
    throw err;
  }
}

/**
 * Triage [Archive]: removes the INBOX label only. Idempotent (archiving an archived thread is a no-op).
 * @param {string} threadId Gmail thread id.
 * @returns {void}
 */
function archiveThread(threadId) {
  requireGmail_();
  Gmail.Users.Threads.modify({ removeLabelIds: ['INBOX'] }, GMAIL_ME_, validateThreadId(threadId));
}

/**
 * Triage [Delete]: moves the thread to Gmail Trash (recoverable for 30 days). Never a permanent delete.
 * @param {string} threadId Gmail thread id.
 * @returns {void}
 */
function trashThread(threadId) {
  requireGmail_();
  Gmail.Users.Threads.trash(GMAIL_ME_, validateThreadId(threadId));
}

/**
 * Creates every missing label, parents first (the 🎯 parent before 🎯/Task), so Gmail nests them.
 * Exact name match; existing labels are never renamed or deleted.
 * @param {string[]} names Label names.
 * @returns {{created:string[], existing:string[]}} What was created and what was already there.
 */
function ensureLabels(names) {
  requireGmail_();
  var want = [];
  (names || []).forEach(function(n) {
    var parts = String(n).split('/');
    for (var i = 1; i <= parts.length; i++) {
      var p = parts.slice(0, i).join('/');
      if (p && want.indexOf(p) === -1) want.push(p);
    }
  });
  var have = {};
  listLabels_().forEach(function(l) { have[l.name] = true; });
  var created = [];
  var existing = [];
  try {
    want.forEach(function(name) {
      if (have[name]) {
        existing.push(name);
        return;
      }
      Gmail.Users.Labels.create({ name: name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, GMAIL_ME_);
      created.push(name);
      have[name] = true;
    });
  } finally {
    gmailLabelCache_ = null; // the next lookup sees the new labels
  }
  return { created: created, existing: existing };
}

/** @returns {Object<string,string>} Label name per label id. */
function labelNamesById() {
  var out = {};
  listLabels_().forEach(function(l) { out[l.id] = l.name; });
  return out;
}

/**
 * @returns {void}
 * @throws {Error} When the Gmail filter API is not available.
 */
function requireFilters_() {
  requireGmail_();
  if (!Gmail.Users.Settings || !Gmail.Users.Settings.Filters) {
    var err = new Error('Gmail filter settings are not available in this Advanced Gmail service');
    err.code = 'GMAIL_SERVICE_MISSING';
    throw err;
  }
}

/**
 * Reads the user Gmail filters (needs gmail.settings.basic).
 * @returns {Array<{id:string, criteria:object, action:object}>} Filters.
 */
function listFilters() {
  requireFilters_();
  var resp = Gmail.Users.Settings.Filters.list(GMAIL_ME_) || {};
  return (resp.filter || []).map(function(f) { return { id: f.id, criteria: f.criteria || {}, action: f.action || {} }; });
}

/**
 * Creates a filter whose ONLY action is adding one label (no archive, no skip inbox, no delete).
 * @param {string} query Gmail search query.
 * @param {string} labelId Label id to add.
 * @returns {string} New filter id.
 */
function createFilter(query, labelId) {
  requireFilters_();
  var f = Gmail.Users.Settings.Filters.create({ criteria: { query: query }, action: { addLabelIds: [labelId] } }, GMAIL_ME_);
  return f && f.id ? f.id : '';
}

/**
 * Thread ids matching a Gmail search, optionally only those with one label (labelIds, never a label: term,
 * since emoji names do not search reliably). Stops at cap.
 * @param {string} query Gmail search query.
 * @param {{labelId?:string, cap?:number}} [opts] Options.
 * @returns {{ids:string[], capped:boolean}} Matching ids and whether more exist.
 */
function searchThreadIds(query, opts) {
  requireGmail_();
  var o = opts || {};
  var cap = o.cap || 300;
  var ids = [];
  var token = null;
  do {
    if (o.meter) o.meter(GMAIL_UNITS_.threadsList);
    var params = { q: query, maxResults: Math.min(100, cap - ids.length) };
    if (o.labelId) params.labelIds = [o.labelId];
    if (token) params.pageToken = token;
    var resp = Gmail.Users.Threads.list(GMAIL_ME_, params) || {};
    (resp.threads || []).forEach(function(t) { ids.push(t.id); });
    token = resp.nextPageToken || null;
  } while (token && ids.length < cap);
  return { ids: ids, capped: !!token };
}

/**
 * Message ids for a search, one per thread (the oldest listed: usually the message that started it, which is the
 * one a filter would have caught). Ids only, no content.
 * @param {string} query Gmail search.
 * @param {{labelId?:string, cap?:number, meter?:function(number)}} [opts] cap counts threads; meter is charged per page.
 * @returns {{refs:Array<{id:string, threadId:string}>, capped:boolean}} Refs.
 */
function listMessageRefs(query, opts) {
  requireGmail_();
  var o = opts || {};
  var cap = o.cap || 500;
  var byThread = {};
  var order = [];
  var token = null;
  do {
    if (o.meter) o.meter(GMAIL_UNITS_.messagesList);
    var params = { q: query, maxResults: 100 };
    if (o.labelId) params.labelIds = [o.labelId];
    if (token) params.pageToken = token;
    var resp = Gmail.Users.Messages.list(GMAIL_ME_, params) || {};
    (resp.messages || []).forEach(function(m) {
      if (!byThread[m.threadId]) order.push(m.threadId);
      byThread[m.threadId] = m.id;
    });
    token = resp.nextPageToken || null;
  } while (token && order.length < cap);
  return { refs: order.slice(0, cap).map(function(t) { return { id: byThread[t], threadId: t }; }), capped: !!token || order.length > cap };
}

/**
 * One message for the filter recommender: label names and the From, Subject and List-Id headers; the body only
 * when withBody (kept in memory by the caller, never stored).
 * @param {string} id Message id.
 * @param {{withBody?:boolean, meter?:function(number)}} [opts] Options.
 * @returns {{id:string, labels:string[], from:string, subject:string, listId:string, body:string}} Sample.
 */
function getMessageSample(id, opts) {
  validateThreadId(id);
  requireGmail_();
  var o = opts || {};
  if (o.meter) o.meter(GMAIL_UNITS_.messagesGet);
  var m = o.withBody
    ? Gmail.Users.Messages.get(GMAIL_ME_, id, { format: 'full' })
    : Gmail.Users.Messages.get(GMAIL_ME_, id, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id'] });
  var idToName = {};
  listLabels_().forEach(function(l) { idToName[l.id] = l.name; });
  var h = (m.payload && m.payload.headers) || [];
  return {
    id: id,
    labels: (m.labelIds || []).map(function(lid) { return idToName[lid] || lid; }),
    from: header_(h, 'From'),
    subject: header_(h, 'Subject'),
    listId: header_(h, 'List-Id'),
    body: o.withBody ? bodyText_(m.payload) : ''
  };
}

global.DPGmailRepo = Object.freeze({
  units: function() { return Object.freeze(Object.assign({}, GMAIL_UNITS_)); }, // HubController filter learner budget
  listMessageRefs: listMessageRefs,     // HubController filter learner
  getMessageSample: getMessageSample,   // HubController filter learner
  validateThreadId: validateThreadId,
  gmailUrl: gmailUrl,
  resolveLabelId: resolveLabelId,
  listThreadsByLabel: listThreadsByLabel,
  getThreadMeta: getThreadMeta,
  threadExists: threadExists,
  archiveThread: archiveThread, // HubController.archiveTriageThread only
  trashThread: trashThread,     // HubController.trashTriageThread only
  ensureLabels: ensureLabels,   // HubController.hubSetupLabels / provisionHub_
  labelNamesById: labelNamesById, // HubController filter suggestions
  listFilters: listFilters,     // HubController filter suggestions (gmail.settings.basic)
  createFilter: createFilter,   // HubController.hubCreateSelectedFilters only
  searchThreadIds: searchThreadIds // HubController filter measuring
});   // cross-file only: QueueProcessor.gs, HubController.gs, UnitTests.gs

})(typeof globalThis !== 'undefined' ? globalThis : this);
