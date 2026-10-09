/**
 * @file eventClassifier.test.js
 * @description Unit tests for calendar event classification and meeting-destination gating.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPE } from '../src/integration/contracts.js';
import { classifyEvent, classifyEventDetailed, isMeetingDestination, normalizeEventTitle } from '../src/integration/eventClassifier.js';

const timed = (summary, extra = {}) => ({ id: 'e1', summary, start: '2026-10-27T08:00:00-07:00', end: '2026-10-27T09:00:00-07:00', allDay: false, ...extra });
const allDay = (summary, extra = {}) => ({ id: 'e2', summary, start: '2026-10-27', end: '2026-10-28', allDay: true, ...extra });

describe('eventClassifier', () => {
  it('normalizeEventTitle strips emoji/punctuation and case-folds', () => {
    assert.equal(normalizeEventTitle('🛠️ NCMMS: Core Team  Meeting!'), 'ncmms core team meeting');
    assert.equal(normalizeEventTitle('PBS IT Product Owner’s Board'), 'pbs it product owners board');
  });

  it('classifies Core workflow titles', () => {
    assert.equal(classifyEvent(timed('NCMMS: Core Team Meeting prep / time block (not a meeting)')), EVENT_TYPE.PREP);
    assert.equal(classifyEvent(timed('🛠 NCMMS Core Team Meeting')), EVENT_TYPE.MEETING);
    assert.equal(classifyEvent(timed('Core team follow up')), EVENT_TYPE.FOLLOWUP);
    assert.equal(classifyEvent(timed('Post NCMMS Updates for Exec Summary & O&M Network Call')), EVENT_TYPE.FOLLOWUP);
  });

  it('(i) classifies emoji/title variants of the Core meeting as MEETING', () => {
    for (const t of ['🛠 NCMMS Core Team Meeting', 'NCMMS Core Team Meeting', '🛠️ NCMMS - Core Team Meeting!', 'ncmms core team meeting', 'NCMMS: Core Team Meeting', '🔧  NCMMS   Core Team Meeting  ']) {
      assert.equal(classifyEvent(timed(t)), EVENT_TYPE.MEETING, t);
    }
  });

  it('classifies other default series and registry rows as MEETING', () => {
    assert.equal(classifyEvent(timed('NCMMS - Daily Standup')), EVENT_TYPE.MEETING);
    const reg = [{ Enabled: true, SeriesKey: 'X', TitleFallback: 'Custom Sync', RecurringEventId: 'rec9' }];
    assert.equal(classifyEvent(timed('Totally renamed', { recurringEventId: 'rec9' }), reg), EVENT_TYPE.MEETING);
    assert.equal(classifyEvent(timed('Custom Sync'), reg), EVENT_TYPE.MEETING);
  });

  it('(g) every excluded example from spec section 5 is not a meeting destination', () => {
    const excluded = [
      timed('Sunrise 7:12 AM'),
      timed('Sunset 5:40 PM'),
      timed('event_busy'),
      timed('Busy', { eventType: 'workingLocation' }),
      timed('Core Hours', { transparency: 'transparent' }),
      timed('Core hours 9-3'),
      timed('Mike - Out of office', { eventType: 'outOfOffice' }),
      allDay('Annual leave'),
      allDay('Leave: Mike'),
      timed('OOO'),
      allDay('Pay date'),
      allDay('Payday'),
      allDay('Columbus Day (federal holiday)'),
      allDay('Federal Holiday'),
      timed('Daily Check-in'),
      timed('Lunch'),
      timed('Out'),
      allDay('Submit report'),
      allDay('NCMMS Core Team Meeting'),
      timed('Due: Quarterly report'),
      timed('3 pending tasks')
    ];
    for (const e of excluded) {
      const t = classifyEvent(e);
      assert.ok(Object.values(EVENT_TYPE).includes(t), e.summary);
      assert.equal(isMeetingDestination(t), false, `${e.summary} -> ${t}`);
    }
  });

  it('maps excluded categories to sensible types', () => {
    assert.equal(classifyEvent(timed('Out of office', { eventType: 'outOfOffice' })), EVENT_TYPE.LEAVE);
    assert.equal(classifyEvent(timed('Core hours')), EVENT_TYPE.AVAILABILITY);
    assert.equal(classifyEvent(timed('Daily Check-in')), EVENT_TYPE.ROUTINE);
    assert.equal(classifyEvent(timed('Due: Report')), EVENT_TYPE.TASK_DUE);
    assert.equal(classifyEvent(timed('4 pending tasks')), EVENT_TYPE.TASK_DUE);
    assert.equal(classifyEvent(timed('Focus time', { eventType: 'focusTime' })), EVENT_TYPE.FOCUS);
    assert.equal(classifyEvent(allDay('Pay date')), EVENT_TYPE.INFORMATIONAL);
  });

  it('(h) gasTaskId-tagged event is TASK_DUE and never importable, even if titled like a meeting', () => {
    const e = timed('NCMMS Core Team Meeting', { extendedProperties: { shared: { gasTaskId: 't1' } } });
    const d = classifyEventDetailed(e);
    assert.equal(d.type, EVENT_TYPE.TASK_DUE);
    assert.equal(d.importable, false);
    assert.equal(classifyEvent(e), EVENT_TYPE.TASK_DUE);
  });

  it('task-like and all-day events are never importable; ordinary events are importable', () => {
    assert.equal(classifyEventDetailed(timed('Due: x')).importable, false);
    assert.equal(classifyEventDetailed(allDay('Pay date')).importable, false);
    assert.equal(classifyEventDetailed(timed('Core team follow up')).importable, true);
  });

  it('isMeetingDestination is true only for MEETING', () => {
    for (const t of Object.values(EVENT_TYPE)) assert.equal(isMeetingDestination(t), t === EVENT_TYPE.MEETING);
  });

  it('throws on invalid input', () => {
    assert.throws(() => classifyEvent(null), /event/i);
    assert.throws(() => classifyEvent({ id: 'x' }), /summary/i);
    assert.throws(() => isMeetingDestination('NOPE'), /EVENT_TYPE/);
  });
});
