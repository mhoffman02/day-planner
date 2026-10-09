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
var PROP_FLAGS = 'HUB_FLAGS_JSON';
var SETUP_LOCK_WAIT_MS = 30000;
var MANDATORY_KEYS = ['TimeZone', 'UserEmail', 'TasksListId'];
var ENABLED_SERIES = ['NCMMS_CORE', 'NCMMS_DAILY', 'NCMMS_AA', 'NCMMS_ACQ', 'TRM_PM'];
var CONFIG_READ_RANGE = 'A2:B200';
var REGISTRY_READ_RANGE = 'A1:M500';
var DEFAULT_TASKS_LIST_ID = '@default';

function engines_() {
  if (!global.DPEngines) throw setupError_('DPEngines is not loaded (Engines.gs missing)');
  return global.DPEngines;
}

function setupError_(message) {
  var e = new Error('SETUP_ERROR: ' + message);
  e.code = 'SETUP_ERROR';
  return e;
}

function quoteTab_(tab) {
  return "'" + tab.replace(/'/g, "''") + "'";
}

function range_(tab, a1) {
  return quoteTab_(tab) + '!' + a1;
}

function colLetter_(n) {
  var s = '';
  for (var x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
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
  } catch (e) { console.error('Config: Calendar timezone setting unavailable, trying primary calendar: ' + e.message); }
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Calendars && Calendar.Calendars.get) {
      var primary = Calendar.Calendars.get('primary');
      if (primary && primary.timeZone) return String(primary.timeZone);
    }
  } catch (e) { console.error('Config: primary calendar timezone unavailable, using script time zone: ' + e.message); }
  return '';
}

function buildConfigSeed_() {
  var E = engines_();
  // A seed the runtime cannot supply stays empty on purpose: getConfig() then fails loudly with
  // SETUP_ERROR naming the key, so the user fills it in the Config tab.
  var tz = userCalendarTimeZone_();
  var email;
  if (!tz) { try { tz = Session.getScriptTimeZone(); } catch (e) { console.error('Config: script time zone unavailable: ' + e.message); tz = ''; } }
  // Gmail profile, not Session.getActiveUser: the manifest has no userinfo.email scope.
  try { email = Gmail.Users.getProfile('me').emailAddress; } catch (e) { console.error('Config: user email unavailable from Gmail profile: ' + e.message); email = ''; }
  tz = tz || '';
  email = email || '';
  var rows = [
    ['TimeZone', tz],
    ['UserEmail', email],
    ['TasksListId', DEFAULT_TASKS_LIST_ID],
    ['BatchSize', '25'],
    ['TriggerMinutes', '5'],
    ['MaxExcerptChars', '160'],
    ['ExcludedAiLabels', E.AI_EXCLUDED_LABELS.join(',')]
  ];
  Object.keys(E.DEFAULT_FEATURES).forEach(function (name) {
    rows.push([name, E.DEFAULT_FEATURES[name] ? 'TRUE' : 'FALSE']);
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

/** Creates missing tabs, writes headers, seeds Config/Registry only when they have no data rows. */
function populate_(sheetId) {
  var E = engines_();
  var meta = Sheets.Spreadsheets.get(sheetId, { fields: 'sheets.properties(sheetId,title)' });
  var existing = (meta.sheets || []).map(function (s) { return s.properties; });
  var have = existing.map(function (p) { return p.title; });
  var missing = ALL_TABS.filter(function (t) { return have.indexOf(t) === -1; });
  var requests = [];
  if (missing.length && existing.length === 1 && existing[0].title === 'Sheet1') {
    requests.push({ updateSheetProperties: { properties: { sheetId: existing[0].sheetId, title: missing[0] }, fields: 'title' } });
    missing = missing.slice(1);
  }
  missing.forEach(function (t) { requests.push({ addSheet: { properties: { title: t } } }); });
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, sheetId);

  var probe = Sheets.Spreadsheets.Values.batchGet(sheetId, {
    ranges: [range_(TAB_CONFIG, 'A2:A2'), range_(TAB_REGISTRY, 'A2:A2')]
  });
  var vr = probe.valueRanges || [];
  var configEmpty = !(vr[0] && vr[0].values && vr[0].values.length);
  var registryEmpty = !(vr[1] && vr[1].values && vr[1].values.length);

  var data = [
    { range: range_(TAB_CONFIG, 'A1:B1'), values: [CONFIG_HEADER] },
    { range: range_(TAB_REGISTRY, 'A1:' + colLetter_(E.REGISTRY_COLUMNS.length) + '1'), values: [E.REGISTRY_COLUMNS.slice()] },
    { range: range_(TAB_LEDGER, 'A1:' + colLetter_(E.LEDGER_COLUMNS.length) + '1'), values: [E.LEDGER_COLUMNS.slice()] },
    { range: range_(TAB_ARCHIVE, 'A1:' + colLetter_(E.LEDGER_COLUMNS.length) + '1'), values: [E.LEDGER_COLUMNS.slice()] }
  ];
  if (configEmpty) {
    var seed = buildConfigSeed_();
    data.push({ range: range_(TAB_CONFIG, 'A2:B' + (seed.length + 1)), values: seed });
  }
  if (registryEmpty) {
    var reg = buildRegistrySeed_();
    data.push({ range: range_(TAB_REGISTRY, 'A2:' + colLetter_(E.REGISTRY_COLUMNS.length) + (reg.length + 1)), values: reg });
  }
  Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, sheetId);
}

/**
 * Idempotent: returns the hub Sheet id from UserProperties DP_HUB_SHEET_ID, else adopts an existing
 * app-created Sheet by name in the Day Planner folder (crash recovery) or creates one, populates
 * tabs/seeds, and records the id last. First-run creation runs under the user lock and re-checks the
 * stored id after acquiring it (concurrent first runs create exactly one Sheet).
 * @returns {string} Spreadsheet id.
 */
function ensureSetup() {
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
    populate_(id);
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

function readConfigMap_() {
  var id = ensureSetup();
  var res = Sheets.Spreadsheets.Values.get(id, range_(TAB_CONFIG, CONFIG_READ_RANGE));
  var map = {};
  (res.values || []).forEach(function (row) {
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
    try { stored = JSON.parse(raw); } catch (e) { console.error('Config: HUB_FLAGS_JSON is corrupt, treating flags as defaults (OFF): ' + e.message); }
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
  var id = ensureSetup();
  var keys = Sheets.Spreadsheets.Values.get(id, range_(TAB_CONFIG, CONFIG_READ_RANGE.replace('B200', 'A200'))).values || [];
  var row = -1;
  for (var i = 0; i < keys.length; i++) {
    if (cell_(keys[i][0]) === name) { row = i + 2; break; }
  }
  var payload = { values: [[name, value ? 'TRUE' : 'FALSE']] };
  if (row > 0) {
    Sheets.Spreadsheets.Values.update(payload, id, range_(TAB_CONFIG, 'A' + row + ':B' + row), { valueInputOption: 'RAW' });
  } else {
    Sheets.Spreadsheets.Values.append(payload, id, range_(TAB_CONFIG, 'A1:B1'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  }
  return refreshFlags_();
}

/** @returns {Array<Object>} Parsed + validated registry rows via DPEngines.parseRegistry. */
function getRegistry() {
  var id = ensureSetup();
  var res = Sheets.Spreadsheets.Values.get(id, range_(TAB_REGISTRY, REGISTRY_READ_RANGE));
  return engines_().parseRegistry(res.values || []);
}

/**
 * Writes HumanNotesDocId for a registry row (used by NotesRepository.ensureNotesDoc).
 * @param {string} seriesKey
 * @param {string} docId
 */
function setRegistryDocId(seriesKey, docId) {
  var id = ensureSetup();
  var values = Sheets.Spreadsheets.Values.get(id, range_(TAB_REGISTRY, REGISTRY_READ_RANGE)).values || [];
  var header = (values[0] || []).map(cell_);
  var keyCol = header.indexOf('SeriesKey');
  var docCol = header.indexOf('HumanNotesDocId');
  if (keyCol < 0 || docCol < 0) throw setupError_('Meeting Registry header lacks SeriesKey/HumanNotesDocId');
  for (var r = 1; r < values.length; r++) {
    if (cell_(values[r][keyCol]) === seriesKey) {
      var a1 = colLetter_(docCol + 1) + (r + 1);
      Sheets.Spreadsheets.Values.update({ values: [[docId]] }, id, range_(TAB_REGISTRY, a1 + ':' + a1), { valueInputOption: 'RAW' });
      return;
    }
  }
  throw setupError_('SeriesKey ' + seriesKey + ' not found in the Meeting Registry tab');
}

/**
 * Writes one or more registry columns for a series in ONE Sheets batch write. Takes no lock
 * (callers hold the script lock). SeriesKey is the row identity and cannot be rewritten.
 * @param {string} seriesKey
 * @param {Object} fields Map of REGISTRY_COLUMNS name to value.
 */
function updateRegistryRow(seriesKey, fields) {
  var E = engines_();
  var names = fields && typeof fields === 'object' ? Object.keys(fields) : [];
  if (!names.length) throw new Error('updateRegistryRow requires a non-empty fields object');
  names.forEach(function (n) {
    if (n === 'SeriesKey') throw new Error('updateRegistryRow cannot change SeriesKey');
    if (E.REGISTRY_COLUMNS.indexOf(n) === -1) throw new Error('Unknown Meeting Registry column: ' + n);
  });
  var id = ensureSetup();
  var values = Sheets.Spreadsheets.Values.get(id, range_(TAB_REGISTRY, REGISTRY_READ_RANGE)).values || [];
  var header = (values[0] || []).map(cell_);
  var keyCol = header.indexOf('SeriesKey');
  if (keyCol < 0) throw setupError_('Meeting Registry header lacks SeriesKey');
  var cols = names.map(function (n) {
    var c = header.indexOf(n);
    if (c < 0) throw setupError_('Meeting Registry header lacks ' + n);
    return c;
  });
  for (var r = 1; r < values.length; r++) {
    if (cell_(values[r][keyCol]) === seriesKey) {
      var data = names.map(function (n, i) {
        var a1 = colLetter_(cols[i] + 1) + (r + 1);
        return { range: range_(TAB_REGISTRY, a1 + ':' + a1), values: [[fields[n] === undefined || fields[n] === null ? '' : String(fields[n])]] };
      });
      Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, id);
      return;
    }
  }
  throw setupError_('SeriesKey ' + seriesKey + ' not found in the Meeting Registry tab');
}

/** @returns {string} Browser URL of the hub Sheet. */
function getSheetUrl() {
  return 'https:' + '/' + '/docs.google.com/spreadsheets/d/' + ensureSetup() + '/edit';
}

// used by other .gs files (LedgerRepository, NotesRepository, queue/trigger code); not a google.script.run surface.
// getSheetId/getFolderId/setRegistryDocId are additive helpers beyond the core contract (used by the repositories).
global.DPConfig = Object.freeze({
  ensureSetup: ensureSetup,
  getConfig: getConfig,
  getFeatures: getFeatures,
  isProvisioned: isProvisioned,
  tabs: Object.freeze({ LEDGER: TAB_LEDGER, ARCHIVE: TAB_ARCHIVE }), // used by LedgerRepository
  getRegistry: getRegistry,
  setFeature: setFeature,
  getSheetUrl: getSheetUrl,
  getSheetId: getSheetId,
  getFolderId: getFolderId,
  setRegistryDocId: setRegistryDocId,
  updateRegistryRow: updateRegistryRow // used by CalendarRepository.discoverSeries
});

})(this);
