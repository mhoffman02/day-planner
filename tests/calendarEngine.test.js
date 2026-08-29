/**
 * @file calendarEngine.test.js
 * @description Unit tests for calendar grid generation, event mapping, payload formatting, and monthly view matrix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateScheduleGrid,
  mapEventsToGrid,
  formatEventModalPayload,
  generateMonthlyCalendarGrid
} from '../src/calendarEngine.js';

describe('Calendar Engine Unit Tests', () => {
  it('should generate 25 half-hourly schedule slots from 07:00 AM to 07:00 PM', () => {
    const grid = generateScheduleGrid();
    assert.equal(grid.length, 25);
    assert.equal(grid[0].displayTime, '7:00 AM');
    assert.equal(grid[0].timeKey, '07:00');
    assert.equal(grid[1].displayTime, '7:30 AM');
    assert.equal(grid[1].timeKey, '07:30');
    assert.equal(grid[24].displayTime, '7:00 PM');
    assert.equal(grid[24].timeKey, '19:00');
  });

  it('should format event modal payload with Meet and gCal links', () => {
    const rawEvt = {
      id: 'e100',
      title: 'Executive Sync',
      startTime: '2026-08-15T09:00:00Z',
      endTime: '2026-08-15T10:00:00Z',
      location: 'Boardroom A',
      description: 'Discuss Q3 goals',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      agendaDocUrl: 'https://docs.google.com/document/d/agenda_doc_123',
      attendees: ['alice@example.com', 'bob@example.com'],
      guestsCanModify: true
    };

    const payload = formatEventModalPayload(rawEvt);
    assert.equal(payload.id, 'e100');
    assert.equal(payload.title, 'Executive Sync');
    assert.equal(payload.meetLink, 'https://meet.google.com/abc-defg-hij');
    assert.equal(payload.agendaDocUrl, 'https://docs.google.com/document/d/agenda_doc_123');
    assert.equal(payload.guestsCanModify, true);
    assert.ok(payload.gCalLink.includes('calendar.google.com'));
    assert.equal(payload.attendees.length, 2);
  });

  it('should map events onto correct schedule slots', () => {
    const grid = generateScheduleGrid();
    const mockEvents = [
      {
        id: 'e1',
        title: 'Morning Standup',
        startTime: '2026-08-15T08:30:00Z',
        endTime: '2026-08-15T09:00:00Z'
      }
    ];

    // Create a local date for matching
    const sampleDate = new Date();
    sampleDate.setHours(8, 30, 0, 0);
    mockEvents[0].startTime = sampleDate.toISOString();

    const mappedGrid = mapEventsToGrid(grid, mockEvents);
    const slot0830 = mappedGrid.find(s => s.timeKey === '08:30');
    assert.ok(slot0830);
    assert.equal(slot0830.events.length, 1);
    assert.equal(slot0830.events[0].title, 'Morning Standup');
  });

  it('should generate monthly calendar grid matrix with proper padding and events', () => {
    const events = [
      { title: 'Project Kickoff', startTime: '2026-08-15T10:00:00Z' }
    ];

    const grid = generateMonthlyCalendarGrid(2026, 8, events);
    assert.equal(grid.length % 7, 0); // Must be multiples of 7
    const aug15 = grid.find(d => d.dateStr === '2026-08-15');
    assert.ok(aug15);
    assert.equal(aug15.dayNumber, 15);
    assert.equal(aug15.isCurrentMonth, true);
    assert.equal(aug15.events.length, 1);
  });

  it('should place a late-evening event on its local calendar day, not the UTC-shifted day', () => {
    const events = [
      { title: 'Late Night Call', startTime: '2026-08-15T23:30:00-07:00' }
    ];

    const grid = generateMonthlyCalendarGrid(2026, 8, events);
    const aug15 = grid.find(d => d.dateStr === '2026-08-15');
    const aug16 = grid.find(d => d.dateStr === '2026-08-16');
    assert.equal(aug15.events.length, 1);
    assert.equal(aug16.events.length, 0);
  });

  it('should default missing fields when formatting an event modal payload', () => {
    const payload = formatEventModalPayload();
    assert.equal(payload.title, 'Untitled Event');
    assert.equal(payload.formattedTime, 'All Day');
    assert.equal(payload.startTime, undefined);
    assert.equal(payload.meetLink, null);
    assert.equal(payload.agendaDocUrl, null);
    assert.deepEqual(payload.attendees, []);
    assert.ok(payload.id.startsWith('evt_'));
    assert.ok(payload.gCalLink.includes('calendar.google.com'));
  });

  it('should fall back to hangoutLink when meetLink is absent', () => {
    const payload = formatEventModalPayload({ title: 'Sync', hangoutLink: 'https://meet.google.com/legacy-link' });
    assert.equal(payload.meetLink, 'https://meet.google.com/legacy-link');
  });

  it('should leave events unmapped when they fall outside the 7am-7pm schedule grid', () => {
    const grid = generateScheduleGrid();
    const lateEvent = { id: 'e-late', title: 'Late Night Call', startTime: '2026-08-15T22:00:00' };
    const mappedGrid = mapEventsToGrid(grid, [lateEvent]);
    const totalMapped = mappedGrid.reduce((sum, s) => sum + s.events.length, 0);
    assert.equal(totalMapped, 0);
  });

  it('should default to empty grid/events arrays when called with no arguments', () => {
    assert.deepEqual(mapEventsToGrid(), []);
  });

  it('should correctly pad the leading and trailing weeks of the monthly grid', () => {
    const grid = generateMonthlyCalendarGrid(2026, 8);
    const leadingPadCount = new Date(2026, 7, 1).getDay(); // Aug 1, 2026 weekday index
    const currentMonthDays = grid.filter(d => d.isCurrentMonth);

    assert.equal(currentMonthDays.length, 31);
    assert.equal(grid.slice(0, leadingPadCount).every(d => !d.isCurrentMonth), true);
    assert.equal(grid[leadingPadCount].dateStr, '2026-08-01');

    const trailingPad = grid.slice(leadingPadCount + 31);
    assert.equal(trailingPad.every(d => !d.isCurrentMonth), true);
    // Trailing padding day numbers should restart at 1 (first days of the next month)
    if (trailingPad.length > 0) {
      assert.equal(trailingPad[0].dayNumber, 1);
    }
  });
});
