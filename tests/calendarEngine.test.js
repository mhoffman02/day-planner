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
  generateMonthlyCalendarGrid,
  formatEventDescriptionHtml,
  extractMeetLink
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

  it('should escape and wrap a plain-text description in <pre> so line breaks survive', () => {
    const html = formatEventDescriptionHtml('Line one\nLine two <not-really-a-tag');
    assert.equal(html, '<pre>Line one\nLine two &lt;not-really-a-tag</pre>');
  });

  it('should render an HTML-bearing description as HTML and ensure links open in new tab', () => {
    const html = formatEventDescriptionHtml('Call in via <a href="https://meet.example.com">this link</a><br>Bring notes');
    assert.ok(html.includes('href="https://meet.example.com"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('<br>'));
  });

  it('should strip script/style blocks and inline event-handler attributes from HTML descriptions', () => {
    const html = formatEventDescriptionHtml('<img src=x onerror="alert(1)"><script>alert(2)</script><b onclick="evil()">hi</b>');
    assert.ok(!html.includes('onerror'));
    assert.ok(!html.includes('onclick'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('alert(2)'));
  });

  it('should neutralize javascript: URIs in href/src attributes of HTML descriptions', () => {
    const html = formatEventDescriptionHtml('<a href="javascript:alert(1)">click</a>');
    assert.ok(!html.includes('javascript:'));
  });

  it('should return an empty string for an empty/missing description', () => {
    assert.equal(formatEventDescriptionHtml(''), '');
    assert.equal(formatEventDescriptionHtml(), '');
  });

  describe('extractMeetLink & Conference Data Detection', () => {
    it('should extract meetLink when explicitly provided', () => {
      const link = extractMeetLink({ meetLink: 'https://meet.google.com/abc-defg-hij' });
      assert.equal(link, 'https://meet.google.com/abc-defg-hij');
    });

    it('should extract meetLink from hangoutLink', () => {
      const link = extractMeetLink({ hangoutLink: 'https://meet.google.com/hgt-link-test' });
      assert.equal(link, 'https://meet.google.com/hgt-link-test');
    });

    it('should extract meetLink from conferenceData entryPoints', () => {
      const evt = {
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+1234567890' },
            { entryPointType: 'video', uri: 'https://meet.google.com/ncm-msds-mtg' }
          ]
        }
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/ncm-msds-mtg');
    });

    it('should extract meetLink from description text', () => {
      const evt = {
        title: 'NCMMS - Daily Standup',
        description: 'Join with Google Meet: https://meet.google.com/xyz-standup-gsa\nOr phone: +1-555-0100'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/xyz-standup-gsa');
    });

    it('should extract meetLink from location field', () => {
      const evt = {
        title: 'Team Sync',
        location: 'https://meet.google.com/loc-sync-link'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/loc-sync-link');
    });

    it('formatEventModalPayload should automatically populate meetLink from description if not on root', () => {
      const rawEvt = {
        id: 'evt_ncmms',
        title: 'NCMMS - Daily Standup',
        startTime: '2026-08-15T09:00:00Z',
        endTime: '2026-08-15T09:30:00Z',
        description: 'Daily Scrum meeting.\nGoogle Meet: https://meet.google.com/ncm-ms-standup'
      };
      const payload = formatEventModalPayload(rawEvt);
      assert.equal(payload.meetLink, 'https://meet.google.com/ncm-ms-standup');
    });

    it('should return null when no meeting link exists anywhere', () => {
      assert.equal(extractMeetLink({ description: 'In-person meeting in Room 4B', location: 'HQ' }), null);
      assert.equal(extractMeetLink(null), null);
    });
  });
});
