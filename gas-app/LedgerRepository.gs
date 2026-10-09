/**
 * @file LedgerRepository.gs
 * @description Persistence for the Integration Ledger tab of the hub Sheet (Phase 28, spec section
 * 10). Rows are plain objects keyed by DPEngines.LEDGER_COLUMNS. Advanced Sheets service only;
 * all values are written RAW (strings stay strings), every operation is a bounded read plus at most
 * one write call (no per-cell writes).
 *
 * CONCURRENCY: upsert() and appendMany() are read-modify-write and are NOT atomic. The CALLER MUST
 * hold LockService.getScriptLock() (e.g. via DPEngines.claimOperation/runOperation) around them;
 * this file deliberately takes no lock itself because locks are not re-entrant.
 *
 * QUOTA: a queue run calls beginSession() once (ONE Sheets read of the whole ledger) and
 * endSession() in a finally block. While a session is open get/list/upsert/appendMany are served
 * from the in-memory index and every write goes straight through (one Values.update per row), so a
 * 25-item batch costs one ledger read instead of one-plus-per-operation. Outside a session each
 * call re-reads, as before. The session is only valid while the caller holds the script lock.
 *
 * CAPACITY: the tab is capped at MAX_ROWS. When a read hits the cap, DONE rows whose UpdatedAt is
 * older than 90 days are moved to the "Integration Ledger Archive" tab (one append plus one
 * compaction batchUpdate) and the operation continues; with nothing archivable it still fails loud
 * with LEDGER_FULL.
 *
 * Wrapped in one IIFE (gas-namespace-iife rule); the only global created is `DPLedgerRepo`, used by
 * other .gs files (queue/trigger code). Reads DPConfig/DPEngines lazily at call time.
 */
(function(global) {

var MAX_ROWS = 5000;
var MAX_CELL_CHARS = 40000;
var ARCHIVE_AFTER_DAYS = 90;
var session_ = null;

function cols_() { return global.DPEngines.LEDGER_COLUMNS; }

function tabs_() { return global.DPConfig.tabs; }

function colLetter_(n) {
  var s = '';
  for (var x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function lastCol_() { return colLetter_(cols_().length); }

function rangeIn_(tab, a1) { return "'" + tab + "'!" + a1; }

function rangeFor_(a1) { return rangeIn_(tabs_().LEDGER, a1); }

function nowIso_() { return new Date().toISOString(); }

function cellText_(v) {
  var s = v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (s.length > MAX_CELL_CHARS) throw new Error('LEDGER_CELL_TOO_LARGE: a ledger value exceeds ' + MAX_CELL_CHARS + ' characters');
  return s;
}

function toArray_(row) { return cols_().map(function(c) { return cellText_(row[c]); }); }

function toObject_(arr) {
  var o = {};
  cols_().forEach(function(c, i) { o[c] = arr[i] === undefined ? '' : arr[i]; });
  return o;
}

function requireKey_(row) {
  if (!row || typeof row.OperationKey !== 'string' || row.OperationKey.trim() === '') {
    throw new Error('Ledger row requires a non-empty OperationKey');
  }
}

function fullError_() {
  return new Error('LEDGER_FULL: Integration Ledger has ' + MAX_ROWS + '+ rows and none are archivable (DONE and older than ' + ARCHIVE_AFTER_DAYS + ' days)');
}

/** Creates the archive tab (with header) when an older Sheet lacks it. */
function ensureArchiveTab_(sheetId) {
  var meta = Sheets.Spreadsheets.get(sheetId, { fields: 'sheets.properties(sheetId,title)' });
  var have = (meta.sheets || []).some(function(s) { return s.properties.title === tabs_().ARCHIVE; });
  if (have) return;
  Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: tabs_().ARCHIVE } } }] }, sheetId);
  Sheets.Spreadsheets.Values.update({ values: [cols_().slice()] }, sheetId, rangeIn_(tabs_().ARCHIVE, 'A1:' + lastCol_() + '1'), { valueInputOption: 'RAW' });
}

/**
 * Moves DONE rows older than ARCHIVE_AFTER_DAYS to the archive tab and compacts the ledger tab.
 * Archive append first, then ONE compaction batchUpdate, so a crash between them can only
 * duplicate archive rows, never lose a ledger row.
 * @param {string} sheetId Hub Sheet id.
 * @param {Array<Array<string>>} values Current ledger data rows (row 2 onward).
 * @returns {Array<Array<string>>|null} The kept rows (now contiguous from row 2), or null when nothing was archivable.
 */
function archiveOldDone_(sheetId, values) {
  var statusCol = cols_().indexOf('Status');
  var updatedCol = cols_().indexOf('UpdatedAt');
  var cutoff = Date.now() - ARCHIVE_AFTER_DAYS * 86400000;
  var archived = [];
  var kept = [];
  values.forEach(function(arr) {
    var at = Date.parse(arr[updatedCol] || '');
    if (arr[statusCol] === 'DONE' && !isNaN(at) && at < cutoff) archived.push(arr);
    else kept.push(arr);
  });
  if (!archived.length) return null;
  ensureArchiveTab_(sheetId);
  Sheets.Spreadsheets.Values.append({ values: archived }, sheetId, rangeIn_(tabs_().ARCHIVE, 'A1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  var blank = [];
  for (var i = kept.length; i < values.length; i++) blank.push(cols_().map(function() { return ''; }));
  var data = [];
  if (kept.length) data.push({ range: rangeFor_('A2:' + lastCol_() + (kept.length + 1)), values: kept });
  data.push({ range: rangeFor_('A' + (kept.length + 2) + ':' + lastCol_() + (values.length + 1)), values: blank });
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, sheetId);
  return kept;
}

/** One bounded read of every data row, archiving old DONE rows when the cap is hit. */
function readValues_(sheetId) {
  var res = Sheets.Spreadsheets.Values.get(sheetId, rangeFor_('A2:' + lastCol_() + (MAX_ROWS + 1)));
  var values = res.values || [];
  if (values.length >= MAX_ROWS) {
    var kept = archiveOldDone_(sheetId, values);
    if (!kept || kept.length >= MAX_ROWS) throw fullError_();
    values = kept;
  }
  return values;
}

/** @returns {{sheetId:string, rows:Array<{rowNumber:number,row:Object}>, byKey:Object, next:number}} Index of the ledger. */
function buildIndex_(sheetId) {
  var values = readValues_(sheetId);
  var idx = { sheetId: sheetId, rows: [], byKey: {}, next: values.length + 2 };
  values.forEach(function(arr, i) {
    var entry = { rowNumber: i + 2, row: toObject_(arr) };
    idx.rows.push(entry);
    if (!idx.byKey[entry.row.OperationKey]) idx.byKey[entry.row.OperationKey] = entry;
  });
  return idx;
}

function index_() { return session_ || buildIndex_(global.DPConfig.getSheetId()); }

/**
 * Opens a read-through session: ONE Sheets read now, then all get/list/upsert/appendMany calls are
 * served from memory with write-through. The caller must hold the script lock and MUST call
 * endSession() in a finally block.
 */
function beginSession() {
  session_ = buildIndex_(global.DPConfig.getSheetId());
}

/** Closes the session opened by beginSession (safe to call when none is open). */
function endSession() {
  session_ = null;
}

/** @returns {Object|null} Ledger row for opKey, or null. */
function get(opKey) {
  if (typeof opKey !== 'string' || opKey === '') throw new Error('opKey is required');
  var found = index_().byKey[opKey];
  return found ? Object.assign({}, found.row) : null;
}

function definedFields_(row) {
  var out = {};
  cols_().forEach(function(c) { if (row[c] !== undefined && row[c] !== null) out[c] = row[c]; });
  return out;
}

function track_(idx, entry) {
  if (!idx.byKey[entry.row.OperationKey]) idx.rows.push(entry);
  idx.byKey[entry.row.OperationKey] = entry;
}

/**
 * Insert-or-update by OperationKey. CreatedAt is stable across updates; UpdatedAt = row.UpdatedAt
 * if supplied, else now. Caller must hold the script lock (see file header).
 * @param {Object} row
 * @returns {Object} The stored row.
 */
function upsert(row) {
  requireKey_(row);
  var idx = index_();
  var now = nowIso_();
  var found = idx.byKey[row.OperationKey] || null;
  var merged = found ? Object.assign({}, found.row, definedFields_(row)) : Object.assign(toObject_([]), definedFields_(row));
  merged.CreatedAt = found ? (found.row.CreatedAt || now) : (row.CreatedAt || now);
  merged.UpdatedAt = row.UpdatedAt || now;
  var payload = { values: [toArray_(merged)] };
  if (found) {
    var a1 = 'A' + found.rowNumber + ':' + lastCol_() + found.rowNumber;
    Sheets.Spreadsheets.Values.update(payload, idx.sheetId, rangeFor_(a1), { valueInputOption: 'RAW' });
    found.row = merged;
  } else if (session_) {
    if (idx.rows.length + 1 >= MAX_ROWS) throw fullError_();
    Sheets.Spreadsheets.Values.update(payload, idx.sheetId, rangeFor_('A' + idx.next + ':' + lastCol_() + idx.next), { valueInputOption: 'RAW' });
    track_(idx, { rowNumber: idx.next, row: merged });
    idx.next += 1;
  } else {
    Sheets.Spreadsheets.Values.append(payload, idx.sheetId, rangeFor_('A1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  }
  return merged;
}

/**
 * Filtered list. @param {{status?: string, sourceType?: string}} [filter]
 * @returns {Array<Object>} Matching rows in sheet order.
 */
function list(filter) {
  var f = filter || {};
  return index_().rows.map(function(x) { return Object.assign({}, x.row); }).filter(function(r) {
    return (!f.status || r.Status === f.status) && (!f.sourceType || r.SourceType === f.sourceType);
  });
}

/**
 * Appends brand-new rows in ONE Sheets call. Throws on a key that already exists (use upsert).
 * Caller must hold the script lock (see file header).
 * @param {Array<Object>} rows
 * @returns {number} Rows appended.
 */
function appendMany(rows) {
  if (!Array.isArray(rows)) throw new Error('appendMany requires an array');
  if (rows.length === 0) return 0;
  var idx = index_();
  var seen = {};
  Object.keys(idx.byKey).forEach(function(k) { seen[k] = true; });
  var now = nowIso_();
  var objects = [];
  var values = rows.map(function(r) {
    requireKey_(r);
    if (seen[r.OperationKey]) throw new Error('LEDGER_DUPLICATE_KEY: ' + r.OperationKey);
    seen[r.OperationKey] = true;
    var full = Object.assign(toObject_([]), definedFields_(r));
    full.CreatedAt = r.CreatedAt || now;
    full.UpdatedAt = r.UpdatedAt || now;
    objects.push(full);
    return toArray_(full);
  });
  if (session_) {
    if (idx.rows.length + values.length >= MAX_ROWS) throw fullError_();
    Sheets.Spreadsheets.Values.update({ values: values }, idx.sheetId, rangeFor_('A' + idx.next + ':' + lastCol_() + (idx.next + values.length - 1)), { valueInputOption: 'RAW' });
    objects.forEach(function(o) {
      track_(idx, { rowNumber: idx.next, row: o });
      idx.next += 1;
    });
  } else {
    Sheets.Spreadsheets.Values.append({ values: values }, idx.sheetId, rangeFor_('A1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  }
  return values.length;
}

// used by other .gs files (queue/trigger code); not a google.script.run surface.
global.DPLedgerRepo = Object.freeze({
  get: get,
  upsert: upsert,
  list: list,
  appendMany: appendMany,
  beginSession: beginSession, // used by QueueProcessor.gs
  endSession: endSession      // used by QueueProcessor.gs
});

})(this);
