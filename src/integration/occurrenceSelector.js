/**
 * @file occurrenceSelector.js
 * @description Picks the Calendar occurrence a recurring-meeting item should be routed to (spec
 * section 7) and resolves registry series to calendar events (prefer persisted RecurringEventId,
 * title fallback for discovery only). Pure: `now` and `timeZone` are always injected; instants are
 * epoch-ms arithmetic, local calendar dates come from Intl in the given IANA zone (never from
 * toISOString on a local date). The target identity is the occurrence event id, never the date.
 */

import { normalizeEventTitle } from './eventClassifier.js';

const OS_MINUTE_MS = 60 * 1000;
const OS_MODES = ['current', 'recommended', 'specific', 'backlog'];

function osCheckZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') throw new Error('selectOccurrence: timeZone (IANA name) is required');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch (e) {
    throw new Error(`selectOccurrence: invalid timeZone ${JSON.stringify(timeZone)}: ${e.message}`, { cause: e });
  }
}

function osZoneParts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) };
}

function osZoneOffsetMs(ms, timeZone) {
  const p = osZoneParts(ms, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

function osLocalYmd(ms, timeZone) {
  const p = osZoneParts(ms, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Parse an ISO string / Date / epoch ms / Calendar {dateTime,date} into epoch ms. Offset-less strings are read in timeZone. */
function osToMs(value, timeZone, what) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const tz = value.timeZone || timeZone;
    return osToMs(value.dateTime || value.date, tz, what);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${what}: invalid Date`);
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value === '') throw new Error(`${what}: missing or non-string time ${JSON.stringify(value)}`);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) throw new Error(`${what}: unparseable time ${JSON.stringify(value)}`);
    return ms;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) throw new Error(`${what}: unparseable time ${JSON.stringify(value)}`);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const first = guess - osZoneOffsetMs(guess, timeZone);
  return guess - osZoneOffsetMs(first, timeZone);
}

function osNowMs(now, timeZone) {
  if (now === undefined || now === null) throw new Error('selectOccurrence: now is required (inject it; no ambient clock)');
  return osToMs(now, timeZone, 'now');
}

function osPrepStart(occ) {
  if (occ.prepStart) return occ.prepStart;
  if (occ.prep && occ.prep.start) return occ.prep.start;
  return null;
}

function osPrepMinutes(series) {
  const n = series && series.PrepMinutes;
  if (!Number.isInteger(n) || n < 0) throw new Error(`selectOccurrence: series ${series && series.SeriesKey} needs integer PrepMinutes >= 0, got ${JSON.stringify(n)}`);
  return n;
}

function osDescribe(occ, series, timeZone) {
  if (!occ || typeof occ.id !== 'string' || occ.id === '') throw new Error('selectOccurrence: every occurrence needs a string event id');
  const startMs = osToMs(occ.start, timeZone, `occurrence ${occ.id} start`);
  const endMs = occ.end ? osToMs(occ.end, timeZone, `occurrence ${occ.id} end`) : startMs;
  const prep = osPrepStart(occ);
  const cutoffMs = prep ? osToMs(prep, timeZone, `occurrence ${occ.id} prepStart`) : startMs - osPrepMinutes(series) * OS_MINUTE_MS;
  return { id: occ.id, startMs, endMs, cutoffMs, linkedPrep: !!prep };
}

function osResult(d, reason, deferred) {
  const r = { occurrenceId: d.id, cutoffISO: new Date(d.cutoffMs).toISOString(), reason };
  if (deferred) r.deferred = true;
  return r;
}

/**
 * Select the target occurrence for a recurring series.
 * @param {{occurrences: Array<object>, series: {SeriesKey: string, PrepMinutes: number}, now: (string|Date|number),
 *   timeZone: string, override?: {mode: string, occurrenceId?: string}}} args
 *   occurrences: {id, start, end, status?, prepStart?|prep?:{start}}; prep wins over start - PrepMinutes.
 * @returns {{occurrenceId: (string|null), cutoffISO: (string|null), reason: string, deferred?: boolean, backlog?: boolean, seriesKey?: string}}
 */
export function selectOccurrence({ occurrences, series, now, timeZone, override } = {}) {
  osCheckZone(timeZone);
  if (!series || typeof series.SeriesKey !== 'string') throw new Error('selectOccurrence: series with SeriesKey is required');
  if (!Array.isArray(occurrences)) throw new Error('selectOccurrence: occurrences must be an array');
  const nowMs = osNowMs(now, timeZone);
  const mode = override ? override.mode : undefined;
  if (override && !OS_MODES.includes(mode)) throw new Error(`selectOccurrence: unknown override mode ${JSON.stringify(mode)} (use ${OS_MODES.join('/')})`);

  const all = occurrences
    .filter((o) => !(o && o.status === 'cancelled'))
    .map((o) => osDescribe(o, series, timeZone))
    .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1));

  if (mode === 'backlog') {
    return { occurrenceId: null, cutoffISO: null, backlog: true, seriesKey: series.SeriesKey, reason: `override: series backlog for ${series.SeriesKey}` };
  }
  if (mode === 'specific') {
    const id = override.occurrenceId;
    if (typeof id !== 'string' || id === '') throw new Error('selectOccurrence: override mode specific requires occurrenceId');
    const hit = all.find((d) => d.id === id);
    if (!hit) throw new Error(`selectOccurrence: override occurrenceId ${id} is not an occurrence of ${series.SeriesKey}`);
    return osResult(hit, `override: specific occurrence ${id}`);
  }

  const upcoming = all.filter((d) => d.endMs > nowMs || d.startMs > nowMs);
  if (mode === 'current') {
    const today = osLocalYmd(nowMs, timeZone);
    const hit = upcoming.find((d) => osLocalYmd(d.startMs, timeZone) === today);
    if (!hit) throw new Error(`selectOccurrence: no current occurrence of ${series.SeriesKey} today (${today}, ${timeZone})`);
    return osResult(hit, 'override: current occurrence');
  }

  const skipped = [];
  for (const d of upcoming) {
    if (d.cutoffMs >= nowMs) {
      if (skipped.length) {
        return osResult(d, `cutoff passed for ${skipped.join(', ')}; using next occurrence`, true);
      }
      return osResult(d, `earliest occurrence with cutoff ${new Date(d.cutoffMs).toISOString()} not yet passed`);
    }
    skipped.push(d.id);
  }
  throw new Error(`selectOccurrence: no upcoming occurrence of ${series.SeriesKey} with an open cutoff at ${new Date(nowMs).toISOString()}`);
}

/**
 * Resolve each enabled registry row to its calendar events.
 * Prefers the persisted RecurringEventId; matches on normalized TitleFallback only for discovery.
 * @param {Array<object>} registryRows Parsed registry rows.
 * @param {Array<object>} events Normalized events ({id, summary, recurringEventId}).
 * @returns {Array<{seriesKey: string, row: object, matchedBy: (string|null), events: Array<object>, renamed: boolean,
 *   discovery: boolean, discoveredRecurringEventId: (string|null), staleRecurringEventId: boolean}>}
 */
export function resolveSeries(registryRows, events) {
  if (!Array.isArray(registryRows)) throw new Error('resolveSeries: registryRows must be an array');
  if (!Array.isArray(events)) throw new Error('resolveSeries: events must be an array');
  return registryRows.filter((r) => r && r.Enabled !== false).map((row) => {
    const fb = row.TitleFallback ? normalizeEventTitle(row.TitleFallback) : '';
    const titleMatches = (e) => fb !== '' && typeof e.summary === 'string' && normalizeEventTitle(e.summary) === fb;
    const base = { seriesKey: row.SeriesKey, row, matchedBy: null, events: [], renamed: false, discovery: false, discoveredRecurringEventId: null, staleRecurringEventId: false };
    if (row.RecurringEventId) {
      const byId = events.filter((e) => e.recurringEventId === row.RecurringEventId || e.id === row.RecurringEventId);
      if (byId.length) {
        return { ...base, matchedBy: 'recurringEventId', events: byId, renamed: fb !== '' && byId.some((e) => !titleMatches(e)) };
      }
    }
    const byTitle = events.filter(titleMatches);
    if (!byTitle.length) return base;
    const found = byTitle.find((e) => e.recurringEventId);
    return {
      ...base,
      matchedBy: 'titleFallback',
      events: byTitle,
      discovery: true,
      discoveredRecurringEventId: found ? found.recurringEventId : null,
      staleRecurringEventId: !!row.RecurringEventId
    };
  });
}
