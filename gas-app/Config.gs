/**
 * @file Config.gs
 * @description Gmail/Meeting hub configuration (Phase 28, spec sections 6, 18, 19). Owns the
 * app-created "Day Planner Hub Config" Sheet (Day Planner Drive folder, drive.file scope) with four
 * tabs: Config (Key/Value + feature flags), Meeting Registry, Integration Ledger, Integration Ledger
 * Archive (DONE rows older than 90 days, see LedgerRepository.gs). Triage dismissals are ledger rows.
 * Uses ONLY the Advanced Sheets/Drive services (never the legacy Gmail/Spreadsheet built-ins). Reads
 * DPEngines (Engines.gs) lazily at call time, never at top level (gas-global-init-order rule).
 *
 * Wrapped in one IIFE (gas-namespace-iife rule); the only global it creates is `DPConfig`, used by
 * other .gs files (LedgerRepository, NotesRepository, queue/trigger code). Not a google.script.run
 * surface.
 *
 * FLAGS OFF IS A NO-OP: feature flags are mirrored into the UserProperties key HUB_FLAGS_JSON
 * (written by ensureSetup, setFeature, getConfig and every fresh read). getFeatures() reads ONLY
 * that key, so with the hub unprovisioned (key absent) all flags are OFF, DRY_RUN is true and no
 * Drive/Sheets call is made; the Sheet is never created by a read. getFeatures({fresh:true}) re-reads
 * the Config tab when (and only when) the Sheet already exists, picking up flags edited by hand.
 *
 * LOCKING: ensureSetup() serializes first-run creation with LockService.getUserLock() (a lock
 * distinct from the script lock the queue/controllers hold, so a locked caller cannot deadlock) and
 * re-checks the stored Sheet id after acquiring it, so concurrent first runs create exactly one Sheet.
 * Every other function here takes no lock.
 * RUN SNAPSHOT: a locked queue run calls beginSnapshot() once (ONE Values.batchGet of Config,
 * Registry and the caller's extra ranges) and endSnapshot() in a finally block. While it is open,
 * config/registry reads are served from it and setFeature/setRegistryDocId/updateRegistryRows patch
 * it after their write-through, so no later read in the run is stale.
 * Missing mandatory configuration throws Error('SETUP_ERROR: <key> ...') (spec section 19).
 */
(function(global) {

var PROP_SHEET_ID = 'DP_HUB_SHEET_ID';
var PROP_FOLDER_ID = 'DAY_PLANNER_ROOT_FOLDER_ID';
var SHEET_TITLE = 'Day Planner Hub Config';
var MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
var TAB_CONFIG = 'Config';
var TAB_REGISTRY = 'Meeting Registry';
var TAB_LEDGER = 'Integration Ledger';
var TAB_ARCHIVE = 'Integration Ledger Archive';
var ALL_TABS = ['Config', 'Meeting Registry', 'Integration Ledger', 'Integration Ledger Archive'];
var CONFIG_HEADER = ['Key', 'Value'];
// Made on demand by the filter recommender (not part of ALL_TABS: a Sheet without it is still complete).
var TAB_FILTERS = 'Filter Suggestions';
var FILTER_READ_RANGE = 'A1:J500';
var PROP_FLAGS = 'HUB_FLAGS_JSON';
var SETUP_LOCK_WAIT_MS = 30000;
var MANDATORY_KEYS = ['TimeZone', 'UserEmail', 'TasksListId'];
var ENABLED_SERIES = ['NCMMS_CORE', 'NCMMS_DAILY', 'NCMMS_AA', 'NCMMS_ACQ', 'TRM_PM'];
var CONFIG_READ_RANGE = 'A2:B200';
var REGISTRY_READ_RANGE = 'A1:M500';
var DEFAULT_TASKS_LIST_ID = '@default';
// Seed for a Sheet the app creates by itself (user decision 2026-10-12): Triage tab on, trial mode on.
// Every other flag keeps its DEFAULT_FEATURES value (OFF).
var AUTO_SETUP_FEATURES = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true };

function engines_() {
  if (!global.DPEngines) throw setupError_('DPEngines is not loaded (Engines.gs missing)');
  return global.DPEngines;
}

/**
 * console.errors the sanitized message plus stack frames. Local (not DPQueue.logSafe): Config runs
 * without QueueProcessor loaded (first-run setup, unit tests).
 * @param {string} context What failed and the fallback taken.
 * @param {*} err Thrown value.
 */
function logSafe_(context, err) {
  console.error(engines_().formatSafeError(context, err));
}

var sheetsMeter_ = { reads: 0, writes: 0 };
var sheetsApi_ = null;

/**
 * Metered stand-in for Sheets.Spreadsheets: every hub Sheets call goes through it so a queue run can
 * report its reads (get, Values.get/batchGet) and writes (batchUpdate, Values.update/batchUpdate/
 * append). Counts the attempt, so a call that throws still counts. Built on first use.
 * @returns {object} Same call shapes as Sheets.Spreadsheets for the methods the hub uses.
 */
function sheets_() {
  if (sheetsApi_) return sheetsApi_;
  var call = function (kind, owner, name) {
    return function () {
      sheetsMeter_[kind] += 1;
      var o = owner();
      return o[name].apply(o, arguments);
    };
  };
  var top = function () { return Sheets.Spreadsheets; };
  var values = function () { return Sheets.Spreadsheets.Values; };
  sheetsApi_ = {
    get: call('reads', top, 'get'),
    batchUpdate: call('writes', top, 'batchUpdate'),
    Values: {
      get: call('reads', values, 'get'),
      batchGet: call('reads', values, 'batchGet'),
      update: call('writes', values, 'update'),
      batchUpdate: call('writes', values, 'batchUpdate'),
      append: call('writes', values, 'append')
    }
  };
  return sheetsApi_;
}

/** Zeroes the Sheets meter (top of every queue run). */
function resetSheetsMeter() {
  sheetsMeter_.reads = 0;
  sheetsMeter_.writes = 0;
}

/** @returns {{reads:number, writes:number}} Sheets calls since the last reset. */
function sheetsMeter() {
  return { reads: sheetsMeter_.reads, writes: sheetsMeter_.writes };
}

function setupError_(message) {
  var e = new Error('SETUP_ERROR: ' + message);
  e.code = 'SETUP_ERROR';
  return e;
}

function cell_(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

/** @returns {string} Drive folder id of the Day Planner root folder (bound by the first-run setup). */
function getFolderId() {
  var id = PropertiesService.getUserProperties().getProperty(PROP_FOLDER_ID);
  if (!id) throw setupError_(PROP_FOLDER_ID + ' is not set; open the Day Planner app once to bind the Day Planner folder');
  return id;
}

/** @returns {boolean} True once the first-run setup has bound the Day Planner folder (no Drive call). */
function isFolderBound() {
  return !!PropertiesService.getUserProperties().getProperty(PROP_FOLDER_ID);
}

/** @returns {string} Hub Sheet id, creating the Sheet on first use. */
function getSheetId() {
  return ensureSetup();
}

function findHubSheetInFolder_(folderId) {
  var q = "title = '" + SHEET_TITLE + "' and mimeType = '" + MIME_SHEET + "' and '" + folderId + "' in parents and trashed = false";
  var res = Drive.Files.list({ q: q, maxResults: 1 });
  return res && res.items && res.items.length ? res.items[0].id : null;
}

/** @returns {string} The user's Calendar time zone (Settings, else primary calendar), or '' when unavailable. */
function userCalendarTimeZone_() {
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Settings && Calendar.Settings.get) {
      var setting = Calendar.Settings.get('timezone');
      if (setting && setting.value) return String(setting.value);
    }
  } catch (e) { logSafe_('Config: Calendar timezone setting unavailable, trying primary calendar', e); }
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Calendars && Calendar.Calendars.get) {
      var primary = Calendar.Calendars.get('primary');
      if (primary && primary.timeZone) return String(primary.timeZone);
    }
  } catch (e) { logSafe_('Config: primary calendar timezone unavailable, using script time zone', e); }
  return '';
}

/**
 * Config seeds the runtime supplies. Each returns {value, cause}: value '' when unavailable (getConfig then
 * fails SETUP_ERROR naming the key), cause the reason, for repairSeeds' error message.
 */
var RUNTIME_SEEDS_ = Object.freeze({
  TimeZone: function () {
    var tz = userCalendarTimeZone_();
    if (tz) return { value: tz, cause: '' };
    try { return { value: Session.getScriptTimeZone() || '', cause: '' }; } catch (e) {
      logSafe_('Config: script time zone unavailable, leaving TimeZone empty (getConfig then fails SETUP_ERROR)', e);
      return { value: '', cause: e.message };
    }
  },
  // Gmail profile, not Session.getActiveUser: the manifest has no userinfo.email scope.
  UserEmail: function () {
    try { return { value: Gmail.Users.getProfile('me').emailAddress || '', cause: '' }; } catch (e) {
      logSafe_('Config: user email unavailable from Gmail profile, leaving UserEmail empty (getConfig then fails SETUP_ERROR)', e);
      return { value: '', cause: e.message };
    }
  }
});

/**
 * @param {Array<Array<string>>} rows Config tab rows from A2.
 * @returns {Array<{key:string, row:number}>} Runtime-seeded keys whose row exists but is blank (a seed that
 *   failed at creation), with their 1-based Sheet row.
 */
function blankSeeds_(rows) {
  var out = [];
  rows.forEach(function (row, i) {
    var k = cell_(row[0]);
    if (Object.prototype.hasOwnProperty.call(RUNTIME_SEEDS_, k) && cell_(row[1]) === '') out.push({ key: k, row: i + 2 });
  });
  return out;
}

/** @returns {boolean} True when a provisioned Config tab has a blank runtime seed (TimeZone/UserEmail). */
function needsRepair() {
  return isProvisioned() && blankSeeds_(configValues_(getSheetId())).length > 0;
}

/**
 * Fills blank TimeZone/UserEmail cells left by a seed that failed at creation (e.g. Gmail not yet approved).
 * Never overwrites a value the user typed. Fails loud when a value is still unavailable.
 * @returns {Array<string>} Keys filled.
 */
function repairSeeds() {
  var id = getSheetId();
  var blank = blankSeeds_(configValues_(id));
  if (!blank.length) return [];
  var data = blank.map(function (b) {
    var got = RUNTIME_SEEDS_[b.key]();
    if (!got.value) throw setupError_(b.key + ' is empty in the "Config" tab and could not be filled automatically (' + got.cause + '). Type it in the Config tab, or approve the app permissions and try again');
    return { range: engines_().a1Range(TAB_CONFIG, 'B' + b.row), values: [[got.value]] };
  });
  sheets_().Values.batchUpdate({ valueInputOption: 'RAW', data: data }, id);
  return blank.map(function (b) { return b.key; });
}

/**
 * @param {Object<string, boolean>} [featureOverrides] Flag values that replace DEFAULT_FEATURES in the seed.
 * @returns {Array<Array<string>>} Config tab rows.
 */
function buildConfigSeed_(featureOverrides) {
  var E = engines_();
  var over = featureOverrides || {};
  // A seed the runtime cannot supply stays empty on purpose: getConfig() then fails loudly with
  // SETUP_ERROR naming the key, so the user fills it in the Config tab.
  var rows = [
    ['TimeZone', RUNTIME_SEEDS_.TimeZone().value],
    ['UserEmail', RUNTIME_SEEDS_.UserEmail().value],
    ['TasksListId', DEFAULT_TASKS_LIST_ID],
    ['BatchSize', '25'],
    ['TriggerMinutes', '5'],
    ['MaxExcerptChars', '160'],
    ['ExcludedAiLabels', E.AI_EXCLUDED_LABELS.join(',')]
  ];
  Object.keys(E.DEFAULT_FEATURES).forEach(function (name) {
    var on = Object.prototype.hasOwnProperty.call(over, name) ? over[name] === true : E.DEFAULT_FEATURES[name];
    rows.push([name, on ? 'TRUE' : 'FALSE']);
  });
  return rows;
}

function buildRegistrySeed_() {
  var E = engines_();
  return E.DEFAULT_SERIES.map(function (s) {
    return E.REGISTRY_COLUMNS.map(function (col) {
      if (col === 'Enabled') return ENABLED_SERIES.indexOf(s.SeriesKey) !== -1 ? 'TRUE' : 'FALSE';
      if (col === 'LabelHints') return s.LabelHints.join(',');
      return s[col] === undefined || s[col] === null ? '' : String(s[col]);
    });
  });
}

/**
 * Creates missing tabs, writes headers, seeds Config/Registry only when they have no data rows.
 * @param {string} sheetId Spreadsheet id.
 * @param {Object<string, boolean>} [seedFeatures] Flag overrides for a fresh Config tab (ignored when it has rows).
 */
function populate_(sheetId, seedFeatures) {
  var E = engines_();
  var meta = sheets_().get(sheetId, { fields: 'sheets.properties(sheetId,title)' });
  var existing = (meta.sheets || []).map(function (s) { return s.properties; });
  var have = existing.map(function (p) { return p.title; });
  var missing = ALL_TABS.filter(function (t) { return have.indexOf(t) === -1; });
  var requests = [];
  if (missing.length && existing.length === 1 && existing[0].title === 'Sheet1') {
    requests.push({ updateSheetProperties: { properties: { sheetId: existing[0].sheetId, title: missing[0] }, fields: 'title' } });
    missing = missing.slice(1);
  }
  missing.forEach(function (t) { requests.push({ addSheet: { properties: { title: t } } }); });
  if (requests.length) sheets_().batchUpdate({ requests: requests }, sheetId);

  var probe = sheets_().Values.batchGet(sheetId, {
    ranges: [engines_().a1Range(TAB_CONFIG, 'A2:A2'), engines_().a1Range(TAB_REGISTRY, 'A2:A2')]
  });
  var vr = probe.valueRanges || [];
  var configEmpty = !(vr[0] && vr[0].values && vr[0].values.length);
  var registryEmpty = !(vr[1] && vr[1].values && vr[1].values.length);

  var data = [
    { range: engines_().a1Range(TAB_CONFIG, 'A1:B1'), values: [CONFIG_HEADER] },
    { range: engines_().a1Range(TAB_REGISTRY, 'A1:' + engines_().colLetter(E.REGISTRY_COLUMNS.length) + '1'), values: [E.REGISTRY_COLUMNS.slice()] },
    { range: engines_().a1Range(TAB_LEDGER, 'A1:' + engines_().colLetter(E.LEDGER_COLUMNS.length) + '1'), values: [E.LEDGER_COLUMNS.slice()] },
    { range: engines_().a1Range(TAB_ARCHIVE, 'A1:' + engines_().colLetter(E.LEDGER_COLUMNS.length) + '1'), values: [E.LEDGER_COLUMNS.slice()] }
  ];
  if (configEmpty) {
    var seed = buildConfigSeed_(seedFeatures);
    data.push({ range: engines_().a1Range(TAB_CONFIG, 'A2:B' + (seed.length + 1)), values: seed });
  }
  if (registryEmpty) {
    var reg = buildRegistrySeed_();
    data.push({ range: engines_().a1Range(TAB_REGISTRY, 'A2:' + engines_().colLetter(E.REGISTRY_COLUMNS.length) + (reg.length + 1)), values: reg });
  }
  sheets_().Values.batchUpdate({ valueInputOption: 'RAW', data: data }, sheetId);
}

/**
 * Idempotent: returns the hub Sheet id from UserProperties DP_HUB_SHEET_ID, else adopts an existing
 * app-created Sheet by name in the Day Planner folder (crash recovery) or creates one, populates
 * tabs/seeds, and records the id last. First-run creation runs under the user lock and re-checks the
 * stored id after acquiring it (concurrent first runs create exactly one Sheet).
 * @param {{autoSeed?: boolean}} [opts] autoSeed: a NEW Sheet starts with AUTO_SETUP_FEATURES (Triage on,
 *   trial mode) instead of all OFF. An adopted Sheet that already has Config rows keeps its own values.
 * @returns {string} Spreadsheet id.
 */
function ensureSetup(opts) {
  var props = PropertiesService.getUserProperties();
  var existing = props.getProperty(PROP_SHEET_ID);
  if (existing) return existing;
  var lock = LockService.getUserLock();
  lock.waitLock(SETUP_LOCK_WAIT_MS); // throws on timeout: fail loud rather than create a second Sheet
  try {
    existing = props.getProperty(PROP_SHEET_ID);
    if (existing) return existing;
    var folderId = getFolderId();
    var id = findHubSheetInFolder_(folderId);
    if (!id) {
      var created = Drive.Files.insert({ title: SHEET_TITLE, mimeType: MIME_SHEET, parents: [{ id: folderId }] });
      if (!created || !created.id) throw new Error('Hub Sheet creation returned no id');
      id = created.id;
    }
    populate_(id, opts && opts.autoSeed === true ? AUTO_SETUP_FEATURES : null);
    props.setProperty(PROP_SHEET_ID, id);
    refreshFlags_();
    return id;
  } finally {
    lock.releaseLock();
  }
}

/** @returns {boolean} True when the hub Sheet already exists (no Drive/Sheets call). */
function isProvisioned() {
  return !!PropertiesService.getUserProperties().getProperty(PROP_SHEET_ID);
}

var snapshot_ = null;

/**
 * Opens a run snapshot: ONE Values.batchGet of the Config and Registry tabs plus extraRanges.
 * Until endSnapshot(), config/registry reads come from it and config/registry writes patch it.
 * The caller must hold the script lock and MUST call endSnapshot() in a finally block.
 * @param {Array<string>} extraRanges More A1 ranges to fetch in the same call (the ledger).
 * @returns {Array<Array<Array<string>>>} Values of each extra range, in order.
 */
function beginSnapshot(extraRanges) {
  if (!Array.isArray(extraRanges)) throw new Error('beginSnapshot requires an array of ranges');
  var id = ensureSetup();
  var ranges = [engines_().a1Range(TAB_CONFIG, CONFIG_READ_RANGE), engines_().a1Range(TAB_REGISTRY, REGISTRY_READ_RANGE)].concat(extraRanges);
  var got = sheets_().Values.batchGet(id, { ranges: ranges }).valueRanges || [];
  if (got.length !== ranges.length) throw new Error('Sheets batchGet returned ' + got.length + ' ranges, expected ' + ranges.length);
  var vals = got.map(function (vr) { return vr.values || []; });
  snapshot_ = { config: vals[0], registry: vals[1] };
  return vals.slice(2);
}

/** Drops the run snapshot (safe to call when none is open). */
function endSnapshot() {
  snapshot_ = null;
}

/** @returns {Array<Array<string>>} Config tab rows from A2, from the snapshot when one is open. */
function configValues_(id) {
  if (snapshot_) return snapshot_.config;
  return sheets_().Values.get(id, engines_().a1Range(TAB_CONFIG, CONFIG_READ_RANGE)).values || [];
}

/** @returns {Array<Array<string>>} Registry tab rows from A1 (header first), from the snapshot when open. */
function registryValues_(id) {
  if (snapshot_) return snapshot_.registry;
  return sheets_().Values.get(id, engines_().a1Range(TAB_REGISTRY, REGISTRY_READ_RANGE)).values || [];
}

/** Writes value into the open snapshot at 0-based (row, col), padding short rows. */
function patchSnapshot_(rows, r, c, value) {
  while (rows.length <= r) rows.push([]);
  while (rows[r].length <= c) rows[r].push('');
  rows[r][c] = value;
}

function readConfigMap_() {
  var map = {};
  configValues_(ensureSetup()).forEach(function (row) {
    var k = cell_(row[0]);
    if (k) map[k] = cell_(row[1]);
  });
  return map;
}

function parseBool_(key, raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  var u = raw.toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  throw setupError_(key + ' must be TRUE or FALSE, got ' + JSON.stringify(raw));
}

function parsePositiveInt_(key, raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw setupError_(key + ' must be a whole number >= 1, got ' + JSON.stringify(raw));
  return Number(raw);
}

function featuresFromMap_(map) {
  var defaults = engines_().DEFAULT_FEATURES;
  var out = {};
  Object.keys(defaults).forEach(function (name) { out[name] = parseBool_(name, map[name], defaults[name]); });
  return Object.freeze(out);
}

/**
 * @returns {Object} Frozen config: TimeZone, UserEmail, TasksListId, BatchSize, TriggerMinutes,
 *   MaxExcerptChars, ExcludedAiLabels (array), features. Throws SETUP_ERROR naming a missing key.
 */
function getConfig() {
  var map = readConfigMap_();
  PropertiesService.getUserProperties().setProperty(PROP_FLAGS, JSON.stringify(featuresFromMap_(map)));
  MANDATORY_KEYS.forEach(function (k) {
    if (!map[k]) throw setupError_(k + ' is missing or empty in the "Config" tab of the Day Planner Hub Config sheet');
  });
  var excluded = map.ExcludedAiLabels === undefined || map.ExcludedAiLabels === ''
    ? engines_().AI_EXCLUDED_LABELS.slice()
    : map.ExcludedAiLabels.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return Object.freeze({
    TimeZone: map.TimeZone,
    UserEmail: map.UserEmail,
    TasksListId: map.TasksListId,
    BatchSize: parsePositiveInt_('BatchSize', map.BatchSize, 25),
    TriggerMinutes: parsePositiveInt_('TriggerMinutes', map.TriggerMinutes, 5),
    MaxExcerptChars: parsePositiveInt_('MaxExcerptChars', map.MaxExcerptChars, 160),
    ExcludedAiLabels: Object.freeze(excluded),
    features: featuresFromMap_(map)
  });
}

function flagsFromStored_(stored) {
  var defaults = engines_().DEFAULT_FEATURES;
  var out = {};
  Object.keys(defaults).forEach(function (name) {
    out[name] = stored && typeof stored[name] === 'boolean' ? stored[name] : defaults[name];
  });
  return Object.freeze(out);
}

/** Re-reads the Config tab and mirrors the flags into HUB_FLAGS_JSON. Needs the Sheet to exist. */
function refreshFlags_() {
  var flags = featuresFromMap_(readConfigMap_());
  PropertiesService.getUserProperties().setProperty(PROP_FLAGS, JSON.stringify(flags));
  return flags;
}

/**
 * @param {{fresh?: boolean}} [opts] fresh re-reads the Config tab, but only if the Sheet already exists.
 * @returns {Object} Frozen feature flags (every DPEngines.DEFAULT_FEATURES key; DRY_RUN defaults true).
 *   Without opts this reads only UserProperties: hub never provisioned => all OFF, no Drive/Sheets call.
 */
function getFeatures(opts) {
  if (opts && opts.fresh === true && isProvisioned()) return refreshFlags_();
  var raw = PropertiesService.getUserProperties().getProperty(PROP_FLAGS);
  var stored = null;
  if (raw) {
    try { stored = JSON.parse(raw); } catch (e) { logSafe_('Config: HUB_FLAGS_JSON is corrupt, treating flags as defaults (OFF)', e); }
  }
  return flagsFromStored_(stored);
}

/**
 * Persists one feature flag in the Config tab (one range write; appends the row if absent).
 * @param {string} name A DPEngines.DEFAULT_FEATURES key.
 * @param {boolean} value
 * @returns {Object} Updated frozen feature flags.
 */
function setFeature(name, value) {
  var defaults = engines_().DEFAULT_FEATURES;
  if (!Object.prototype.hasOwnProperty.call(defaults, name)) throw new Error('Unknown feature flag: ' + String(name));
  if (typeof value !== 'boolean') throw new Error('Feature flag value must be boolean for ' + name);
  writeConfigRow_(name, value ? 'TRUE' : 'FALSE');
  return refreshFlags_();
}

/**
 * Persists TasksListId in the Config tab (the Google Tasks list the hub creates Tasks in).
 * @param {string} listId Tasks list id (caller validates the format).
 * @returns {string} The new TasksListId read back from getConfig.
 */
function setTasksListId(listId) {
  if (typeof listId !== 'string' || !listId) throw new Error('TasksListId must be a non-empty string');
  writeConfigRow_('TasksListId', listId);
  return getConfig().TasksListId;
}

/**
 * Writes one Config key/value row (one range write; appends the row if absent) and patches the snapshot.
 * @param {string} name Config key in column A.
 * @param {string} cellValue Raw value for column B.
 */
function writeConfigRow_(name, cellValue) {
  var id = ensureSetup();
  var keys = snapshot_ ? snapshot_.config : sheets_().Values.get(id, engines_().a1Range(TAB_CONFIG, CONFIG_READ_RANGE.replace('B200', 'A200'))).values || [];
  var row = -1;
  for (var i = 0; i < keys.length; i++) {
    if (cell_(keys[i][0]) === name) { row = i + 2; break; }
  }
  var payload = { values: [[name, cellValue]] };
  if (row > 0) {
    sheets_().Values.update(payload, id, engines_().a1Range(TAB_CONFIG, 'A' + row + ':B' + row), { valueInputOption: 'RAW' });
    if (snapshot_) patchSnapshot_(snapshot_.config, row - 2, 1, payload.values[0][1]);
  } else {
    sheets_().Values.append(payload, id, engines_().a1Range(TAB_CONFIG, 'A1:B1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    if (snapshot_) snapshot_.config.push(payload.values[0].slice());
  }
}

/** @returns {Array<Object>} Parsed + validated registry rows via DPEngines.parseRegistry. */
function getRegistry() {
  return engines_().parseRegistry(registryValues_(ensureSetup()));
}

/**
 * Writes HumanNotesDocId for a registry row (used by NotesRepository.ensureNotesDoc).
 * @param {string} seriesKey
 * @param {string} docId
 */
function setRegistryDocId(seriesKey, docId) {
  var id = ensureSetup();
  var values = registryValues_(id);
  var header = (values[0] || []).map(cell_);
  var keyCol = header.indexOf('SeriesKey');
  var docCol = header.indexOf('HumanNotesDocId');
  if (keyCol < 0 || docCol < 0) throw setupError_('Meeting Registry header lacks SeriesKey/HumanNotesDocId');
  for (var r = 1; r < values.length; r++) {
    if (cell_(values[r][keyCol]) === seriesKey) {
      var a1 = engines_().colLetter(docCol + 1) + (r + 1);
      sheets_().Values.update({ values: [[docId]] }, id, engines_().a1Range(TAB_REGISTRY, a1 + ':' + a1), { valueInputOption: 'RAW' });
      if (snapshot_) patchSnapshot_(snapshot_.registry, r, docCol, docId);
      return;
    }
  }
  throw setupError_('SeriesKey ' + seriesKey + ' not found in the Meeting Registry tab');
}

/**
 * Writes registry columns for one or more series: one registry read (none inside a run snapshot)
 * and ONE Sheets batch write. Validates every update before writing anything. Takes no lock
 * (callers hold the script lock). SeriesKey is the row identity and cannot be rewritten.
 * @param {Array<{seriesKey:string, fields:Object}>} updates fields maps REGISTRY_COLUMNS name to value.
 */
function updateRegistryRows(updates) {
  var E = engines_();
  if (!Array.isArray(updates)) throw new Error('updateRegistryRows requires an array of {seriesKey, fields}');
  if (!updates.length) return;
  updates.forEach(function (u) {
    var names = u && u.fields && typeof u.fields === 'object' ? Object.keys(u.fields) : [];
    if (!names.length) throw new Error('updateRegistryRows requires a non-empty fields object');
    names.forEach(function (n) {
      if (n === 'SeriesKey') throw new Error('updateRegistryRows cannot change SeriesKey');
      if (E.REGISTRY_COLUMNS.indexOf(n) === -1) throw new Error('Unknown Meeting Registry column: ' + n);
    });
  });
  var id = ensureSetup();
  var values = registryValues_(id);
  var header = (values[0] || []).map(cell_);
  var keyCol = header.indexOf('SeriesKey');
  if (keyCol < 0) throw setupError_('Meeting Registry header lacks SeriesKey');
  var cells = [];
  updates.forEach(function (u) {
    var r = -1;
    for (var i = 1; i < values.length; i++) {
      if (cell_(values[i][keyCol]) === u.seriesKey) { r = i; break; }
    }
    if (r < 0) throw setupError_('SeriesKey ' + u.seriesKey + ' not found in the Meeting Registry tab');
    Object.keys(u.fields).forEach(function (n) {
      var c = header.indexOf(n);
      if (c < 0) throw setupError_('Meeting Registry header lacks ' + n);
      var v = u.fields[n] === undefined || u.fields[n] === null ? '' : String(u.fields[n]);
      cells.push({ r: r, c: c, v: v });
    });
  });
  var data = cells.map(function (x) {
    var a1 = E.colLetter(x.c + 1) + (x.r + 1);
    return { range: E.a1Range(TAB_REGISTRY, a1 + ':' + a1), values: [[x.v]] };
  });
  E.chunkValueRanges(data).forEach(function (chunk) {
    sheets_().Values.batchUpdate({ valueInputOption: 'RAW', data: chunk }, id);
  });
  if (snapshot_) cells.forEach(function (x) { patchSnapshot_(snapshot_.registry, x.r, x.c, x.v); });
}

/** @returns {string} Browser URL of the hub Sheet. */
function getSheetUrl() {
  return 'https:' + '/' + '/docs.google.com/spreadsheets/d/' + ensureSetup() + '/edit';
}

/**
 * Read-only link to the hub Sheet, opened on its Config tab. Never provisions and never rewrites
 * properties (About calls this on every open). Users delete things, so a stored id whose Sheet is in
 * the trash or gone reports missing:'trashed'|'deleted' instead of a dead link; setupHub re-creates it.
 * @returns {{provisioned: boolean, url: (string|null), missing: (string|null)}} missing is 'never' when no
 *   Sheet was ever set up.
 */
function getSheetLink() {
  var id = PropertiesService.getUserProperties().getProperty(PROP_SHEET_ID);
  if (!id) return { provisioned: false, url: null, missing: 'never' };
  var file;
  try {
    file = Drive.Files.get(id);
  } catch (err) {
    if (!/\bnot found\b/i.test(String(err && err.message))) throw err;
    logSafe_('Config: hub Sheet ' + id + ' no longer exists, reporting it missing so the user can re-create it', err);
    return { provisioned: false, url: null, missing: 'deleted' };
  }
  if (file && file.labels && file.labels.trashed === true) return { provisioned: false, url: null, missing: 'trashed' };
  var meta = sheets_().get(id, { fields: 'sheets.properties(sheetId,title)' });
  var tab = (meta.sheets || []).map(function (s) { return s.properties; }).filter(function (p) { return p.title === TAB_CONFIG; })[0];
  if (!tab) throw setupError_('The "' + TAB_CONFIG + '" tab is missing from the ' + SHEET_TITLE + ' sheet');
  return { provisioned: true, url: 'https:' + '/' + '/docs.google.com/spreadsheets/d/' + id + '/edit#gid=' + tab.sheetId, missing: null };
}

/**
 * Drops a stored hub Sheet id that getSheetLink reported trashed/deleted, so the next ensureSetup
 * creates a fresh Sheet (ensureSetup trusts the stored id and never re-checks Drive).
 * @param {string} staleId The id getSheetLink found missing; ignored if the stored id has since changed.
 */
function forgetSheet(staleId) {
  var props = PropertiesService.getUserProperties();
  if (props.getProperty(PROP_SHEET_ID) !== staleId) return;
  props.deleteProperty(PROP_SHEET_ID);
  snapshot_ = null;
}

// used by other .gs files (LedgerRepository, NotesRepository, queue/trigger code); not a google.script.run surface.
// getSheetId/getFolderId/setRegistryDocId are additive helpers beyond the core contract (used by the repositories).
/**
 * @param {string} id Spreadsheet id.
 * @returns {{sheetId:number, title:string}|null} The Filter Suggestions tab, or null when absent.
 */
function filterTab_(id) {
  var meta = sheets_().get(id, { fields: 'sheets.properties(sheetId,title)' });
  var hit = (meta.sheets || []).map(function (x) { return x.properties; }).filter(function (p) { return p.title === TAB_FILTERS; });
  return hit.length ? hit[0] : null;
}

/**
 * Rows of the Filter Suggestions tab (empty when the hub or the tab does not exist yet).
 * @returns {Array<{row:number, label:string, query:string, source:string, create:boolean, status:string, filterId:string}>}
 *   row is the 1-based Sheet row.
 */
function readFilterRows() {
  if (!isProvisioned()) return [];
  var id = getSheetId();
  if (!filterTab_(id)) return [];
  var E = engines_();
  var values = sheets_().Values.get(id, E.a1Range(TAB_FILTERS, FILTER_READ_RANGE)).values || [];
  var header = (values[0] || []).map(cell_);
  var col = function (name) { return header.indexOf(name); };
  var c = { label: col('Label'), query: col('Gmail query'), source: col('Source'), create: col('Create?'), status: col('Status'), filterId: col('Filter id') };
  if (c.label < 0 || c.query < 0) throw setupError_('Filter Suggestions tab lacks the Label or Gmail query column');
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r] || [];
    var label = cell_(v[c.label]);
    var query = cell_(v[c.query]);
    if (!label && !query) continue;
    out.push({
      row: r + 1,
      label: label,
      query: query,
      source: c.source < 0 ? '' : cell_(v[c.source]),
      create: c.create >= 0 && /^true$/i.test(cell_(v[c.create])),
      status: c.status < 0 ? '' : cell_(v[c.status]),
      filterId: c.filterId < 0 ? '' : cell_(v[c.filterId])
    });
  }
  return out;
}

/**
 * Rewrites the Filter Suggestions tab (creating it if needed): header, one line per row, blank lines over any
 * older extra rows, and the Create? column as checkboxes.
 * @param {Array<{label:string, query:string, source:string, caught:(number|string), wrong:(number|string),
 *   precision:(number|string), coveredBy:string, create:boolean, status:string, filterId:string}>} rows Rows.
 * @returns {void}
 */
function writeFilterRows(rows) {
  var E = engines_();
  var id = ensureSetup();
  var tab = filterTab_(id);
  var prevCount = 0;
  if (!tab) {
    sheets_().batchUpdate({ requests: [{ addSheet: { properties: { title: TAB_FILTERS } } }] }, id);
    tab = filterTab_(id);
    if (!tab) throw setupError_('Could not add the ' + TAB_FILTERS + ' tab');
  } else {
    prevCount = (sheets_().Values.get(id, E.a1Range(TAB_FILTERS, 'A1:A500')).values || []).length;
  }
  var cols = E.FILTER_TAB_COLUMNS;
  var blank = function (v) { return v === undefined || v === null ? '' : v; };
  var out = [cols.slice()].concat((rows || []).map(function (r) {
    return [r.label, r.query, blank(r.source), blank(r.caught), blank(r.wrong), blank(r.precision), blank(r.coveredBy),
      r.create === true, blank(r.status), blank(r.filterId)];
  }));
  while (out.length < prevCount) out.push(cols.map(function () { return ''; }));
  sheets_().Values.update({ values: out }, id, E.a1Range(TAB_FILTERS, 'A1:' + E.colLetter(cols.length) + out.length), { valueInputOption: 'RAW' });
  if (rows && rows.length) {
    var createCol = cols.indexOf('Create?');
    sheets_().batchUpdate({ requests: [{ setDataValidation: {
      range: { sheetId: tab.sheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: createCol, endColumnIndex: createCol + 1 },
      rule: { condition: { type: 'BOOLEAN' }, strict: true }
    } }] }, id);
  }
}

/**
 * Writes Status and Filter id for rows of the Filter Suggestions tab (one batch write).
 * @param {Array<{row:number, status:string, filterId:string}>} updates 1-based Sheet rows.
 * @returns {void}
 */
function updateFilterRows(updates) {
  if (!updates || !updates.length) return;
  var E = engines_();
  var id = getSheetId();
  var cols = E.FILTER_TAB_COLUMNS;
  var sc = E.colLetter(cols.indexOf('Status') + 1);
  var fc = E.colLetter(cols.indexOf('Filter id') + 1);
  var data = updates.map(function (u) {
    return { range: E.a1Range(TAB_FILTERS, sc + u.row + ':' + fc + u.row), values: [[u.status || '', u.filterId || '']] };
  });
  E.chunkValueRanges(data).forEach(function (chunk) {
    sheets_().Values.batchUpdate({ valueInputOption: 'RAW', data: chunk }, id);
  });
}

global.DPConfig = Object.freeze({
  ensureSetup: ensureSetup,
  getConfig: getConfig,
  getFeatures: getFeatures,
  isProvisioned: isProvisioned,
  isFolderBound: isFolderBound, // used by HubController.provisionHub_ (auto-setup on app load)
  tabs: Object.freeze({ LEDGER: TAB_LEDGER, ARCHIVE: TAB_ARCHIVE }), // used by LedgerRepository
  getRegistry: getRegistry,
  setFeature: setFeature,
  setTasksListId: setTasksListId, // used by HubController.hubSetTasksListId (gas-rpc)
  getSheetUrl: getSheetUrl,
  readFilterRows: readFilterRows, // used by HubController filter suggestions
  writeFilterRows: writeFilterRows, // used by HubController.hubSuggestFilters
  updateFilterRows: updateFilterRows, // used by HubController.hubCreateSelectedFilters
  getSheetLink: getSheetLink, // used by HubController.getHubSheetLink/setupHub (About link)
  forgetSheet: forgetSheet, // used by HubController.setupHub (re-create a trashed/deleted Sheet)
  needsRepair: needsRepair, // used by HubController.getHubStatus (blank TimeZone/UserEmail seed)
  repairSeeds: repairSeeds, // used by HubController.provisionHub_
  getSheetId: getSheetId,
  getFolderId: getFolderId,
  setRegistryDocId: setRegistryDocId,
  updateRegistryRows: updateRegistryRows, // used by CalendarRepository.discoverSeries (one batch write)
  beginSnapshot: beginSnapshot, // used by QueueProcessor.runLocked_ (one batchGet per locked run)
  endSnapshot: endSnapshot, // used by QueueProcessor.runLocked_ (finally)
  sheets: sheets_, // metered Sheets.Spreadsheets, used by LedgerRepository
  resetSheetsMeter: resetSheetsMeter, // used by QueueProcessor.runQueue
  sheetsMeter: sheetsMeter // used by QueueProcessor (counts.sheetsReads/sheetsWrites)
});

})(this);
