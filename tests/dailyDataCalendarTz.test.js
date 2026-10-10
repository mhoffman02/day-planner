/**
 * @file dailyDataCalendarTz.test.js
 * @description getDailyData / getDailyDataRange build each day's window (and bucket events) in the
 * user's PRIMARY CALENDAR time zone (Calendar.Calendars.get('primary').timeZone, the same source
 * createCalendarEvent uses), never the script/process time zone. Unreadable time zone fails loud.
 * The process TZ is pinned to differ from the calendar TZ so the result never depends on the host.
 */
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

/**
 * @param {{tz?:string, calendarsGet?:Function, events?:Array<object>}} o Calendar setup.
 * @returns {{ctx:object, listCalls:Array<object>}}
 */
function tzCtx(o = {}) {
  const ctx = makeGasContext();
  const listCalls = [];
  ctx.Calendar.Calendars = {
    get: o.calendarsGet || ((id) => { if (id !== 'primary') throw new Error('unexpected calendar ' + id); return { id: 'me@example.com', timeZone: o.tz || 'Asia/Tokyo' }; })
  };
  const events = o.events || [];
  // Real API semantics: an event is returned when it overlaps [timeMin, timeMax).
  ctx.Calendar.Events.list = (calendarId, params) => {
    listCalls.push(toHost(params));
    const min = Date.parse(params.timeMin);
    const max = Date.parse(params.timeMax);
    if (Number.isNaN(min) || Number.isNaN(max)) throw new Error('timeMin/timeMax must be RFC3339');
    const items = events.filter((e) => {
      const s = e.start.dateTime ? Date.parse(e.start.dateTime) : Date.parse(e.start.date + 'T00:00:00+09:00');
      const en = e.end.dateTime ? Date.parse(e.end.dateTime) : Date.parse(e.end.date + 'T00:00:00+09:00');
      return s < max && en > min;
    });
    return { items };
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, listCalls };
}

// Asia/Tokyo is UTC+9 (no DST); the script/process zone is America/New_York (UTC-4 in October).
const late = { id: 'late', summary: 'Late call', start: { dateTime: '2026-10-09T23:30:00+09:00' }, end: { dateTime: '2026-10-09T23:59:00+09:00' } };
const early = { id: 'early', summary: 'Early call', start: { dateTime: '2026-10-10T00:30:00+09:00' }, end: { dateTime: '2026-10-10T01:00:00+09:00' } };
const prevEarly = { id: 'prevEarly', summary: 'Early on the 9th', start: { dateTime: '2026-10-09T00:30:00+09:00' }, end: { dateTime: '2026-10-09T01:00:00+09:00' } };
const allDay = { id: 'allday', summary: 'Holiday', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } };

test('getDailyData: day window is midnight-to-midnight in the calendar time zone, not the script zone', () => {
  const { ctx, listCalls } = tzCtx({ events: [prevEarly, late, early] });
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.equal(listCalls[0].timeMin, '2026-10-08T15:00:00.000Z');
  assert.equal(listCalls[0].timeMax, '2026-10-09T15:00:00.000Z');
  assert.deepEqual(day.calendarEvents.map((e) => e.id).sort(), ['late', 'prevEarly'], '23:30 on the 9th and 00:30 on the 9th belong to the 9th');
  const next = toHost(ctx.getDailyData('2026-10-10'));
  assert.deepEqual(next.calendarEvents.map((e) => e.id), ['early'], '00:30 on the 10th belongs to the 10th');
});

test('getDailyData: DST change day uses both real midnights (25h day), stepping the date by y/m/d', () => {
  const { ctx, listCalls } = tzCtx({ tz: 'Europe/London' });
  ctx.getDailyData('2026-10-25'); // BST (+01:00) ends at 02:00 local
  assert.equal(listCalls[0].timeMin, '2026-10-24T23:00:00.000Z');
  assert.equal(listCalls[0].timeMax, '2026-10-26T00:00:00.000Z');
});

test('getDailyData: month rollover (Oct 31 -> Nov 1) uses pure y/m/d arithmetic', () => {
  const { ctx, listCalls } = tzCtx({ tz: 'Pacific/Honolulu' }); // UTC-10, no DST
  ctx.getDailyData('2026-10-31');
  assert.equal(listCalls[0].timeMin, '2026-10-31T10:00:00.000Z');
  assert.equal(listCalls[0].timeMax, '2026-11-01T10:00:00.000Z');
});

test('getDailyData: unreadable calendar time zone -> no calendar fetch, loud warning, stack logged (no script-zone fallback)', () => {
  const { ctx, listCalls } = tzCtx({ calendarsGet: () => { throw new Error('Calendars.get 503'); }, events: [late] });
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.equal(listCalls.length, 0, 'must not list with a guessed window');
  assert.deepEqual(day.calendarEvents, []);
  assert.ok(day.warnings.some((w) => /time zone/i.test(w)), JSON.stringify(day.warnings));
  assert.ok(day.warnings.every((w) => !/\n\s+at /.test(w)), 'stack leaked into the user warning');
  assert.match(ctx.__consoleLines.join('\n'), /Calendars\.get 503[\s\S]*\n\s+at /);
});

test('getDailyData: calendar with no timeZone -> loud warning, no fetch', () => {
  const { ctx, listCalls } = tzCtx({ calendarsGet: () => ({ id: 'primary' }) });
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.equal(listCalls.length, 0);
  assert.ok(day.warnings.some((w) => /time zone/i.test(w)));
});

test('getDailyDataRange: window and day buckets follow the calendar time zone (23:30 / 00:30 / all-day)', () => {
  const { ctx, listCalls } = tzCtx({ events: [prevEarly, late, early, allDay] });
  const out = toHost(ctx.getDailyDataRange('2026-10-09', '2026-10-10'));
  assert.equal(listCalls[0].timeMin, '2026-10-08T15:00:00.000Z');
  assert.equal(listCalls[0].timeMax, '2026-10-10T15:00:00.000Z');
  assert.deepEqual(out.days['2026-10-09'].calendarEvents.map((e) => e.id).sort(), ['late', 'prevEarly']);
  assert.deepEqual(out.days['2026-10-10'].calendarEvents.map((e) => e.id).sort(), ['allday', 'early']);
  assert.deepEqual(out.warnings, []);
});

test('getDailyDataRange: multi-day all-day event covers start..end-1 by date string, no UTC shift', () => {
  const span = { id: 'span', summary: 'Trip', start: { date: '2026-10-09' }, end: { date: '2026-10-11' } };
  const { ctx } = tzCtx({ tz: 'Pacific/Honolulu', events: [span] });
  const out = toHost(ctx.getDailyDataRange('2026-10-08', '2026-10-11'));
  assert.deepEqual(Object.keys(out.days).filter((k) => out.days[k].calendarEvents.length), ['2026-10-09', '2026-10-10']);
});

test('getDailyDataRange: unreadable calendar time zone throws (a prefetch must not prime empty days)', () => {
  const { ctx, listCalls } = tzCtx({ calendarsGet: () => { throw new Error('Calendars.get 503'); } });
  assert.throws(() => ctx.getDailyDataRange('2026-10-09', '2026-10-10'), (err) => {
    assert.match(err.message, /time zone/i);
    assert.doesNotMatch(err.message, /\n\s+at /);
    return true;
  });
  assert.equal(listCalls.length, 0);
  assert.match(ctx.__consoleLines.join('\n'), /Calendars\.get 503[\s\S]*\n\s+at /);
});
