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
      attendees: ['alice@example.com', 'bob@example.com']
    };

    const payload = formatEventModalPayload(rawEvt);
    assert.equal(payload.id, 'e100');
    assert.equal(payload.title, 'Executive Sync');
    assert.equal(payload.meetLink, 'https://meet.google.com/abc-defg-hij');
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
});
