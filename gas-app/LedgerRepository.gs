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
 * Wrapped in one IIFE (gas-namespace-iife rule); the only global created is `DPLedgerRepo`, used by
 * other .gs files (queue/trigger code). Reads DPConfig/DPEngines lazily at call time.
 */
(function(global) {

var TAB = 'Integration Ledger';
var MAX_ROWS = 5000;
var MAX_CELL_CHARS = 40000;

function cols_() { return global.DPEngines.LEDGER_COLUMNS; }

function lastCol_() {
  var s = '';
  for (var x = cols_().length; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function rangeFor_(a1) { return "'" + TAB + "'!" + a1; }

function nowIso_() { return new Date().toISOString(); }

function cellText_(v) {
  var s = v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (s.length > MAX_CELL_CHARS) throw new Error('LEDGER_CELL_TOO_LARGE: a ledger value exceeds ' + MAX_CELL_CHARS + ' characters');
  return s;
}

function toArray_(row) { return cols_().map(function (c) { return cellText_(row[c]); }); }

function toObject_(arr) {
  var o = {};
  cols_().forEach(function (c, i) { o[c] = arr[i] === undefined ? '' : arr[i]; });
  return o;
}

function requireKey_(row) {
  if (!row || typeof row.OperationKey !== 'string' || row.OperationKey.trim() === '') {
    throw new Error('Ledger row requires a non-empty OperationKey');
  }
}

/** One bounded read of every data row: [{rowNumber, row}]. Fails loud when the cap is hit. */
function readAll_(sheetId) {
  var res = Sheets.Spreadsheets.Values.get(sheetId, rangeFor_('A2:' + lastCol_() + (MAX_ROWS + 1)));
  var values = res.values || [];
  if (values.length >= MAX_ROWS) {
    throw new Error('LEDGER_FULL: Integration Ledger has ' + MAX_ROWS + '+ rows; archive old rows before continuing');
  }
  return values.map(function (arr, i) { return { rowNumber: i + 2, row: toObject_(arr) }; });
}

/** @returns {Object|null} Ledger row for opKey, or null. */
function get(opKey) {
  if (typeof opKey !== 'string' || opKey === '') throw new Error('opKey is required');
  var all = readAll_(global.DPConfig.getSheetId());
  for (var i = 0; i < all.length; i++) {
    if (all[i].row.OperationKey === opKey) return all[i].row;
  }
  return null;
}

function definedFields_(row) {
  var out = {};
  cols_().forEach(function (c) { if (row[c] !== undefined && row[c] !== null) out[c] = row[c]; });
  return out;
}

/**
 * Insert-or-update by OperationKey. CreatedAt is stable across updates; UpdatedAt = row.UpdatedAt
 * if supplied, else now. Caller must hold the script lock (see file header).
 * @param {Object} row
 * @returns {Object} The stored row.
 */
function upsert(row) {
  requireKey_(row);
  var sheetId = global.DPConfig.getSheetId();
  var now = nowIso_();
  var all = readAll_(sheetId);
  var found = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].row.OperationKey === row.OperationKey) { found = all[i]; break; }
  }
  var merged = found ? Object.assign({}, found.row, definedFields_(row)) : Object.assign(toObject_([]), definedFields_(row));
  merged.CreatedAt = found ? (found.row.CreatedAt || now) : (row.CreatedAt || now);
  merged.UpdatedAt = row.UpdatedAt || now;
  var payload = { values: [toArray_(merged)] };
  if (found) {
    var a1 = 'A' + found.rowNumber + ':' + lastCol_() + found.rowNumber;
    Sheets.Spreadsheets.Values.update(payload, sheetId, rangeFor_(a1), { valueInputOption: 'RAW' });
  } else {
    Sheets.Spreadsheets.Values.append(payload, sheetId, rangeFor_('A1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  }
  return merged;
}

/**
 * Filtered list. @param {{status?: string, sourceType?: string}} [filter]
 * @returns {Array<Object>} Matching rows in sheet order.
 */
function list(filter) {
  var f = filter || {};
  return readAll_(global.DPConfig.getSheetId()).map(function (x) { return x.row; }).filter(function (r) {
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
  var sheetId = global.DPConfig.getSheetId();
  var seen = {};
  readAll_(sheetId).forEach(function (x) { seen[x.row.OperationKey] = true; });
  var now = nowIso_();
  var values = rows.map(function (r) {
    requireKey_(r);
    if (seen[r.OperationKey]) throw new Error('LEDGER_DUPLICATE_KEY: ' + r.OperationKey);
    seen[r.OperationKey] = true;
    var full = Object.assign(toObject_([]), definedFields_(r));
    full.CreatedAt = r.CreatedAt || now;
    full.UpdatedAt = r.UpdatedAt || now;
    return toArray_(full);
  });
  Sheets.Spreadsheets.Values.append({ values: values }, sheetId, rangeFor_('A1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  return values.length;
}

// used by other .gs files (queue/trigger code); not a google.script.run surface.
global.DPLedgerRepo = Object.freeze({
  get: get,
  upsert: upsert,
  list: list,
  appendMany: appendMany
});

})(this);
