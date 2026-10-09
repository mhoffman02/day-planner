/**
 * @file registry.js
 * @description Meeting Registry: DEFAULT_SERIES table (spec section 5) plus parse/validate of the
 * 13-column Meeting Registry sheet (spec section 6). Pure functions, no Google services; throws a
 * setup error (code REGISTRY_SETUP) naming the column/row/value that is wrong.
 */

import { REGISTRY_COLUMNS, EVENT_TYPE } from './contracts.js';

const RG_DEFAULT_POST_REVIEW_MINUTES = 30;
const RG_DEFAULT_PREP_MINUTES = 30;
const RG_AI_VALUES = ['TRUE', 'FALSE', 'CONDITIONAL'];
const RG_GEMINI_VALUES = ['TRUE', 'FALSE', 'TBD'];

function rgSeries(SeriesKey, DisplayName, TitleFallback, PrepMinutes, extra = {}) {
  return Object.freeze({
    Enabled: true,
    SeriesKey,
    DisplayName,
    CalendarId: '',
    RecurringEventId: '',
    TitleFallback,
    MeetingRole: EVENT_TYPE.MEETING,
    PrepMinutes,
    PostReviewMinutes: RG_DEFAULT_POST_REVIEW_MINUTES,
    HumanNotesDocId: '',
    GeminiExpected: 'TBD',
    AIAllowed: 'FALSE',
    LabelHints: Object.freeze([]),
    ...extra
  });
}

/** The 10 known series from spec section 5 (IDs/doc ids are supplied locally via the sheet). */
export const DEFAULT_SERIES = Object.freeze([
  rgSeries('NCMMS_CORE', 'NCMMS Core Team', 'NCMMS Core Team Meeting', 30, { GeminiExpected: 'TRUE', AIAllowed: 'CONDITIONAL', LabelHints: Object.freeze(['_NCMMS', 'VIP']) }),
  rgSeries('NCMMS_DAILY', 'NCMMS Daily Standup', 'NCMMS - Daily Standup', 10, { GeminiExpected: 'TRUE', AIAllowed: 'CONDITIONAL', LabelHints: Object.freeze(['_NCMMS', 'Jira']) }),
  rgSeries('FACILITY_TECH', 'Facility Technology & Innovation', 'Facility Technology & Innovation Weekly', 30),
  rgSeries('NCMMS_AA', 'NCMMS A&A Assessment', 'NCMMS - A&A Assessment', 30, { LabelHints: Object.freeze(['_NCMMS']) }),
  rgSeries('WEEKLY_STATUS', 'Weekly Status Report', 'Weekly Status Report', 60),
  rgSeries('NCMMS_CHECKIN', 'NCMMS Check-in', 'NCMMS - Check-in', 30),
  rgSeries('NCMMS_ACQ', 'NCMMS Acquisition', 'NCMMS Acquisition', 30, { LabelHints: Object.freeze(['_NCMMS/Acquisition']) }),
  rgSeries('TRM_PM', 'GSA/TRM PM Meeting', 'GSA/TRM Weekly PM Meeting', 30, { LabelHints: Object.freeze(['_NCMMS/COR-TRM']) }),
  rgSeries('PRODUCT_OWNER_BOARD', 'Product Owner’s Board', "PBS IT Product Owner's Board Meeting", 30),
  rgSeries('ELEVATOR_DATA', 'Elevator Data', 'Elevator Data', 30)
]);

function rgFail(message) {
  const err = new Error(`Meeting Registry setup error: ${message}`);
  err.code = 'REGISTRY_SETUP';
  return err;
}

function rgText(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function rgLabel(row, rowNum) {
  const key = rgText(row.SeriesKey);
  return key ? `row ${rowNum} (${key})` : `row ${rowNum}`;
}

function rgParseEnabled(v, where) {
  if (typeof v === 'boolean') return v;
  const s = rgText(v).toUpperCase();
  if (s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1') return true;
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === '0' || s === '') return false;
  throw rgFail(`${where}: Enabled must be TRUE or FALSE, got ${JSON.stringify(v)}`);
}

function rgParseMinutes(v, column, where, fallback) {
  const s = rgText(v);
  if (s === '') return fallback;
  if (!/^\d+$/.test(s)) throw rgFail(`${where}: ${column} must be a whole number of minutes >= 0, got ${JSON.stringify(v)}`);
  return Number(s);
}

function rgParseEnum(v, column, allowed, fallback, where) {
  const s = rgText(v).toUpperCase();
  if (s === '') return fallback;
  // Tolerate prose after the keyword, e.g. "FALSE initially" from the spec table.
  const word = s.split(/\s+/)[0];
  if (allowed.includes(word)) return word;
  throw rgFail(`${where}: ${column} must be one of ${allowed.join('/')}, got ${JSON.stringify(v)}`);
}

/**
 * Validate parsed registry rows. Throws on the first setup problem.
 * @param {Array<object>} rows Parsed rows (see parseRegistry) or DEFAULT_SERIES.
 * @returns {Array<object>} The same rows.
 */
export function validateRegistry(rows) {
  if (!Array.isArray(rows)) throw rgFail('registry must be an array of rows');
  const seen = new Set();
  rows.forEach((row, i) => {
    const where = rgLabel(row, i + 1);
    for (const col of ['SeriesKey', 'DisplayName', 'MeetingRole']) {
      if (rgText(row[col]) === '') throw rgFail(`${where}: mandatory value ${col} is empty`);
    }
    if (!Object.values(EVENT_TYPE).includes(row.MeetingRole)) {
      throw rgFail(`${where}: MeetingRole must be an EVENT_TYPE (${Object.values(EVENT_TYPE).join(', ')}), got ${JSON.stringify(row.MeetingRole)}`);
    }
    if (rgText(row.RecurringEventId) === '' && rgText(row.TitleFallback) === '') {
      throw rgFail(`${where}: needs RecurringEventId or TitleFallback so the series can be found`);
    }
    for (const col of ['PrepMinutes', 'PostReviewMinutes']) {
      if (!Number.isInteger(row[col]) || row[col] < 0) throw rgFail(`${where}: ${col} must be a whole number >= 0, got ${JSON.stringify(row[col])}`);
    }
    if (!RG_AI_VALUES.includes(row.AIAllowed)) throw rgFail(`${where}: AIAllowed must be one of ${RG_AI_VALUES.join('/')}, got ${JSON.stringify(row.AIAllowed)}`);
    if (!RG_GEMINI_VALUES.includes(row.GeminiExpected)) throw rgFail(`${where}: GeminiExpected must be one of ${RG_GEMINI_VALUES.join('/')}, got ${JSON.stringify(row.GeminiExpected)}`);
    if (seen.has(row.SeriesKey)) throw rgFail(`${where}: duplicate SeriesKey ${row.SeriesKey}`);
    seen.add(row.SeriesKey);
  });
  return rows;
}

/**
 * Parse the Meeting Registry sheet (first row = header, order-insensitive) and validate it.
 * @param {Array<Array<*>>} rows2D Sheet values.
 * @returns {Array<object>} One object per non-blank data row with typed fields.
 */
export function parseRegistry(rows2D) {
  if (!Array.isArray(rows2D) || rows2D.length === 0 || !Array.isArray(rows2D[0])) {
    throw rgFail('sheet has no header row');
  }
  const header = rows2D[0].map(rgText);
  const missing = REGISTRY_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw rgFail(`missing mandatory column(s): ${missing.join(', ')}`);
  const idx = {};
  for (const c of REGISTRY_COLUMNS) idx[c] = header.indexOf(c);

  const defaultsByKey = new Map(DEFAULT_SERIES.map((s) => [s.SeriesKey, s]));
  const out = [];
  for (let r = 1; r < rows2D.length; r++) {
    const raw = rows2D[r];
    if (!Array.isArray(raw)) throw rgFail(`row ${r + 1} is not an array`);
    if (raw.every((c) => rgText(c) === '')) continue;
    const cell = (c) => raw[idx[c]];
    const seriesKey = rgText(cell('SeriesKey'));
    const where = `row ${r + 1}${seriesKey ? ` (${seriesKey})` : ''}`;
    const known = defaultsByKey.get(seriesKey);
    out.push({
      Enabled: rgParseEnabled(cell('Enabled'), where),
      SeriesKey: seriesKey,
      DisplayName: rgText(cell('DisplayName')),
      CalendarId: rgText(cell('CalendarId')),
      RecurringEventId: rgText(cell('RecurringEventId')),
      TitleFallback: rgText(cell('TitleFallback')),
      MeetingRole: rgText(cell('MeetingRole')).toUpperCase() || EVENT_TYPE.MEETING,
      PrepMinutes: rgParseMinutes(cell('PrepMinutes'), 'PrepMinutes', where, known ? known.PrepMinutes : RG_DEFAULT_PREP_MINUTES),
      PostReviewMinutes: rgParseMinutes(cell('PostReviewMinutes'), 'PostReviewMinutes', where, RG_DEFAULT_POST_REVIEW_MINUTES),
      HumanNotesDocId: rgText(cell('HumanNotesDocId')),
      GeminiExpected: rgParseEnum(cell('GeminiExpected'), 'GeminiExpected', RG_GEMINI_VALUES, 'TBD', where),
      AIAllowed: rgParseEnum(cell('AIAllowed'), 'AIAllowed', RG_AI_VALUES, 'FALSE', where),
      LabelHints: rgText(cell('LabelHints')).split(',').map((s) => s.trim()).filter(Boolean)
    });
  }
  return validateRegistry(out);
}
