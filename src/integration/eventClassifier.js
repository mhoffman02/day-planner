/**
 * @file eventClassifier.js
 * @description Classifies normalized Calendar v3 events into EVENT_TYPE (spec section 5) and gates
 * which events may be meeting destinations / imported back into Tasks. Pure functions; titles are
 * normalized (emoji and punctuation stripped, case-folded) so cosmetic title edits never break
 * matching. Task-derived events (extendedProperties.shared.gasTaskId) are never importable.
 */

import { EVENT_TYPE } from './contracts.js';
import { DEFAULT_SERIES } from './registry.js';

/**
 * Normalize an event title for matching: case-fold, drop emoji/symbols/punctuation, collapse spaces.
 * @param {string} title
 * @returns {string}
 */
export function normalizeEventTitle(title) {
  if (typeof title !== 'string') throw new Error(`normalizeEventTitle expects a string, got ${typeof title}`);
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const EC_HOLIDAY_RE = /\b(federal holiday|holiday|christmas|thanksgiving|juneteenth|independence day|labor day|memorial day|veterans day|columbus day|presidents day|martin luther king|new years day)\b/;
const EC_LEAVE_RE = /\b(out of office|ooo|annual leave|sick leave|leave|vacation|pto|day off)\b/;
const EC_PAY_RE = /\b(pay date|payday|pay day|pay period)\b/;

function ecRequireEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('classifyEvent requires an event object');
  if (typeof event.summary !== 'string') throw new Error(`classifyEvent: event ${event.id || '(no id)'} has no string summary`);
}

function ecIsAllDay(event) {
  if (typeof event.allDay === 'boolean') return event.allDay;
  const s = event.start;
  return !!(s && typeof s === 'object' && s.date && !s.dateTime);
}

function ecActiveRows(registry) {
  const rows = Array.isArray(registry) ? registry : DEFAULT_SERIES;
  return rows.filter((r) => r && r.Enabled !== false);
}

function ecMatchesRegistry(event, norm, rows) {
  return rows.some((r) => {
    if (r.RecurringEventId && (event.recurringEventId === r.RecurringEventId || event.id === r.RecurringEventId)) return true;
    const fb = r.TitleFallback ? normalizeEventTitle(r.TitleFallback) : '';
    return fb !== '' && (norm === fb || (' ' + norm + ' ').includes(' ' + fb + ' '));
  });
}

function ecResult(type, importable, reason) {
  return { type, importable, reason };
}

/**
 * Classify with detail.
 * @param {object} event Normalized Calendar event (summary, start, end, allDay, eventType, transparency,
 *   extendedProperties.shared.gasTaskId, recurringEventId, id).
 * @param {Array<object>} [registry] Parsed registry rows; defaults to DEFAULT_SERIES.
 * @returns {{type: string, importable: boolean, reason: string}} importable = may be imported into Tasks.
 */
export function classifyEventDetailed(event, registry) {
  ecRequireEvent(event);
  const shared = event.extendedProperties && event.extendedProperties.shared;
  if (shared && shared.gasTaskId) return ecResult(EVENT_TYPE.TASK_DUE, false, 'task-derived (gasTaskId)');

  const norm = normalizeEventTitle(event.summary);
  const allDay = ecIsAllDay(event);

  if (/^due\b/.test(norm) || /\bpending tasks?$/.test(norm)) return ecResult(EVENT_TYPE.TASK_DUE, false, 'task-like title');

  const et = event.eventType;
  if (et === 'outOfOffice') return ecResult(EVENT_TYPE.LEAVE, false, 'outOfOffice eventType');
  if (et === 'focusTime') return ecResult(EVENT_TYPE.FOCUS, true, 'focusTime eventType');
  if (et === 'workingLocation') return ecResult(EVENT_TYPE.AVAILABILITY, false, 'workingLocation eventType');
  if (et === 'birthday' || et === 'fromGmail') return ecResult(EVENT_TYPE.INFORMATIONAL, false, `${et} eventType`);

  if (/\b(sunrise|sunset)\b/.test(norm)) return ecResult(EVENT_TYPE.INFORMATIONAL, false, 'sunrise/sunset');
  if (norm === 'event busy' || /\bcore hours\b/.test(norm)) return ecResult(EVENT_TYPE.AVAILABILITY, false, 'availability overlay');
  if (EC_PAY_RE.test(norm) || EC_HOLIDAY_RE.test(norm)) return ecResult(EVENT_TYPE.INFORMATIONAL, false, 'pay date / holiday');
  if (EC_LEAVE_RE.test(norm)) return ecResult(EVENT_TYPE.LEAVE, false, 'leave notice');
  if (norm === 'daily check in') return ecResult(EVENT_TYPE.ROUTINE, true, 'daily check-in');
  if (/\blunch\b/.test(norm) || norm === 'out') return ecResult(EVENT_TYPE.ROUTINE, true, 'lunch/out');

  // All-day events can never be a meeting destination; treat as informational (task due dates, notices).
  if (allDay) return ecResult(EVENT_TYPE.INFORMATIONAL, false, 'all-day event');

  // Workflow neighbours of a meeting must be checked before the meeting match: their titles contain it.
  if (/\bprep\b|\bpreparation\b/.test(norm)) return ecResult(EVENT_TYPE.PREP, true, 'prep block');
  if (/\bfollow ?up\b/.test(norm)) return ecResult(EVENT_TYPE.FOLLOWUP, true, 'follow-up');
  if (/^post ncmms updates\b/.test(norm)) return ecResult(EVENT_TYPE.FOLLOWUP, true, 'publish item');
  if (/\b(focus time|heads down|deep work)\b/.test(norm)) return ecResult(EVENT_TYPE.FOCUS, true, 'focus block');

  if (ecMatchesRegistry(event, norm, ecActiveRows(registry))) return ecResult(EVENT_TYPE.MEETING, true, 'registered series');
  const attendees = Array.isArray(event.attendees) ? event.attendees.length : 0;
  if (event.hangoutLink || event.conferenceData || attendees > 1) return ecResult(EVENT_TYPE.MEETING, true, 'conference/attendees');

  return ecResult(EVENT_TYPE.INFORMATIONAL, true, 'unclassified');
}

/**
 * @param {object} event
 * @param {Array<object>} [registry]
 * @returns {string} EVENT_TYPE value.
 */
export function classifyEvent(event, registry) {
  return classifyEventDetailed(event, registry).type;
}

/**
 * @param {string} type EVENT_TYPE value.
 * @returns {boolean} True only for MEETING.
 */
export function isMeetingDestination(type) {
  if (!Object.values(EVENT_TYPE).includes(type)) throw new Error(`isMeetingDestination: ${JSON.stringify(type)} is not an EVENT_TYPE`);
  return type === EVENT_TYPE.MEETING;
}
