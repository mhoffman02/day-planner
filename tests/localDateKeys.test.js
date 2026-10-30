/**
 * @file localDateKeys.test.js
 * @description Day keys are LOCAL dates, never `toISOString().slice(0, 10)` (a UTC day). The process
 * TZ is pinned to New York and the clock to 21:30 local on 2026-10-30, when UTC is already the 31st,
 * so any UTC-derived key shows up as the wrong day. ESLint bans the pattern (no-restricted-syntax).
 */
process.env.TZ = 'America/New_York';

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateMonthlyCalendarGrid, formatEventModalPayload } from '../src/calendarEngine.js';
import { syncTaskToCalendar } from '../src/syncEngine.js';
import { parseIndexEntriesFromNote } from '../src/indexParser.js';

const LATE_EVENING = new Date(2026, 9, 30, 21, 30); // UTC: 2026-10-31T01:30Z

describe('local date keys after 20:00 EDT', () => {
  before(() => mock.timers.enable({ apis: ['Date'], now: LATE_EVENING }));
  after(() => mock.timers.reset());

  it('monthly grid puts a 21:30 event on its local day', () => {
    const grid = generateMonthlyCalendarGrid(2026, 10, [{ id: 'e1', title: 'Late', startTime: '2026-10-30T21:30:00-04:00' }]);
    const day = (n) => grid.find(d => d.isCurrentMonth && d.dayNumber === n);
    assert.equal(day(30).events.length, 1);
    assert.equal(day(31).events.length, 0);
  });

  it('event modal link falls back to the local today', () => {
    assert.match(formatEventModalPayload({ title: 'No start' }).gCalLink, /\/r\/day\/2026\/10\/30$/);
  });

  it('a task with no due date syncs onto the local today', () => {
    assert.match(syncTaskToCalendar({ id: 't1', title: 'A1 Call' }).updatedEvent.startTime, /^2026-10-30T/);
  });

  it('an index entry with no note date is dated the local today', () => {
    assert.equal(parseIndexEntriesFromNote('[Finance] budget #index')[0].date, '2026-10-30');
  });
});
