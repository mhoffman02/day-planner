/**
 * @file GmailRepository.gs
 * @description Read-only Gmail access for the Gmail/Meeting hub (Phase 28). Uses ONLY the Advanced
 * Gmail service (gmail.readonly): Users.Labels.list, Users.Threads.list, Users.Threads.get with
 * format metadata or full. The built-in mail service is banned (needs the full mail scope; lint
 * enforced). Nothing here writes to Gmail. Message bodies are read in memory for triage scoring,
 * capped, returned only to in-process callers, and NEVER logged or persisted.
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
var GMAIL_META_HEADERS_ = ['From', 'To', 'Cc', 'Subject', 'Date'];
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
  if (!labelId) return { labelFound: false, threadIds: [], nextPageToken: null };
  var params = { labelIds: [labelId], maxResults: o.maxResults || 50 };
  if (o.pageToken) params.pageToken = o.pageToken;
  var resp = Gmail.Users.Threads.list(GMAIL_ME_, params) || {};
  return {
    labelFound: true,
    threadIds: (resp.threads || []).map(function(t) { return t.id; }),
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
      out.push(Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString());
    }
    (part.parts || []).forEach(function(p) { stack.push(p); });
  }
  return out.join('\n').slice(0, GMAIL_BODY_CAP_);
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
 * @param {{withBody?:boolean}} [opts] withBody reads format full (bodies kept in memory only).
 * @returns {{threadId:string,url:string,subject:string,labels:string[],userEmail:string,lastMessageId:string,
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

global.DPGmailRepo = Object.freeze({
  validateThreadId: validateThreadId,
  gmailUrl: gmailUrl,
  resolveLabelId: resolveLabelId,
  listThreadsByLabel: listThreadsByLabel,
  getThreadMeta: getThreadMeta,
  threadExists: threadExists
});   // cross-file only: QueueProcessor.gs, HubController.gs, UnitTests.gs

})(typeof globalThis !== 'undefined' ? globalThis : this);
