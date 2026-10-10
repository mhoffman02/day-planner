/**
 * @file createCalendarEvent.test.js
 * @description Contract tests for the createCalendarEvent(payload) RPC in gas-app/Code.gs, run against
 * the REAL file in a vm with GAS stubs. Contract (client codes against it):
 *   payload {title, dateStr 'YYYY-MM-DD', startTime 'HH:MM', endTime 'HH:MM', description?, location?, addMeet?}
 *   returns the event in exactly the getDailyData(dateStr).calendarEvents[] shape.
 *   bad input -> Error('Invalid event: <reason>'), Calendar failure -> logged + friendly Error.
 * Times are wall-clock in the user's primary-calendar time zone (sent as dateTime + timeZone; no
 * offset math, no toISOString).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const TZ = 'America/Chicago';
const EVENT_KEYS = ['description', 'endTime', 'htmlLink', 'id', 'location', 'meetLink', 'startTime', 'syncTaskId', 'title'];

function calCtx(o = {}) {
  const ctx = makeGasContext();
  ctx.Utilities.formatDate = () => '2026-10-09 12:00:00';
  const inserts = [];
  ctx.Calendar.Calendars = {
    get: o.calendarsGet || ((id) => { if (id !== 'primary') throw new Error('unexpected calendar ' + id); return { id: 'me@example.com', timeZone: TZ }; })
  };
  // Real Advanced Service signature: Calendar.Events.insert(resource, calendarId, optionalArgs).
  ctx.Calendar.Events.insert = o.insert || ((resource, calendarId, opts) => {
    inserts.push({ resource: toHost(resource), calendarId, opts: toHost(opts) });
    const off = '-05:00';
    const created = {
      id: 'evt' + inserts.length,
      summary: resource.summary,
      description: resource.description,
      location: resource.location,
      start: { dateTime: resource.start.dateTime + off, timeZone: resource.start.timeZone },
      end: { dateTime: resource.end.dateTime + off, timeZone: resource.end.timeZone },
      htmlLink: 'https:' + '//calendar.google.com/event?eid=x' + inserts.length
    };
    ctx.__fakes.events.push(created);
    return created;
  });
  loadGasFile(ctx, 'Code.gs');
  return { ctx, inserts };
}

const good = (over = {}) => ({ title: '  Design review  ', dateStr: '2026-10-09', startTime: '09:00', endTime: '10:30', ...over });
const consoleText = (ctx) => ctx.__consoleLines.join('\n');

test('creates the event on the primary calendar with wall-clock times in the calendar time zone', () => {
  const { ctx, inserts } = calCtx();
  const out = toHost(ctx.createCalendarEvent(good({ description: 'Agenda', location: 'Room 4' })));
  assert.equal(inserts.length, 1);
  const { resource, calendarId } = inserts[0];
  assert.equal(calendarId, 'primary');
  assert.equal(resource.summary, 'Design review');
  assert.deepEqual(resource.start, { dateTime: '2026-10-09T09:00:00', timeZone: TZ });
  assert.deepEqual(resource.end, { dateTime: '2026-10-09T10:30:00', timeZone: TZ });
  assert.equal(resource.description, 'Agenda');
  assert.equal(resource.location, 'Room 4');
  assert.deepEqual(out, {
    id: 'evt1',
    title: 'Design review',
    startTime: '2026-10-09T09:00:00-05:00',
    endTime: '2026-10-09T10:30:00-05:00',
    location: 'Room 4',
    description: 'Agenda',
    meetLink: null,
    htmlLink: 'https:' + '//calendar.google.com/event?eid=x1',
    syncTaskId: null
  });
});

test('returned event is identical to how getDailyData(dateStr) maps the same event', () => {
  const { ctx } = calCtx();
  const created = toHost(ctx.createCalendarEvent(good()));
  assert.deepEqual(Object.keys(created).sort(), EVENT_KEYS);
  const day = toHost(ctx.getDailyData('2026-10-09'));
  const listed = day.calendarEvents.find((e) => e.id === created.id);
  assert.ok(listed, 'event not in getDailyData');
  assert.deepEqual(created, listed);
});

test('optional description/location omitted -> empty strings in the returned shape; addMeet accepted', () => {
  const { ctx, inserts } = calCtx();
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(out.description, '');
  assert.equal(out.location, '');
  assert.equal(inserts[0].resource.conferenceData, undefined, 'Meet creation is not implemented server-side');
});

const INVALID = [
  ['non-object payload', null, /payload/i],
  ['missing title', good({ title: undefined }), /title/i],
  ['whitespace title', good({ title: '   ' }), /title/i],
  ['non-string title', good({ title: 42 }), /title/i],
  ['title over 500 chars', good({ title: 'x'.repeat(501) }), /title/i],
  ['missing dateStr', good({ dateStr: undefined }), /date/i],
  ['malformed dateStr', good({ dateStr: '10/09/2026' }), /date/i],
  ['impossible month', good({ dateStr: '2026-13-01' }), /date/i],
  ['impossible day', good({ dateStr: '2026-02-30' }), /date/i],
  ['bad startTime hour', good({ startTime: '24:00' }), /start/i],
  ['unpadded startTime', good({ startTime: '9:00' }), /start/i],
  ['bad endTime minutes', good({ endTime: '10:60' }), /end/i],
  ['end equals start', good({ endTime: '09:00' }), /end/i],
  ['end before start', good({ startTime: '11:00', endTime: '10:00' }), /end/i],
  ['non-string description', good({ description: 7 }), /description/i],
  ['non-string location', good({ location: {} }), /location/i]
];

for (const [name, payload, reason] of INVALID) {
  test(`invalid input (${name}) -> Invalid event: error, nothing inserted`, () => {
    const { ctx, inserts } = calCtx();
    assert.throws(() => ctx.createCalendarEvent(payload), (err) => {
      assert.match(err.message, /^Invalid event: /);
      assert.match(err.message, reason);
      return true;
    });
    assert.equal(inserts.length, 0);
  });
}

test('title of exactly 500 chars is accepted', () => {
  const { ctx, inserts } = calCtx();
  ctx.createCalendarEvent(good({ title: 'y'.repeat(500) }));
  assert.equal(inserts.length, 1);
});

test('Calendar insert failure -> stack logged, friendly error thrown, no event claimed', () => {
  const { ctx } = calCtx({ insert: () => { throw new Error('API call to calendar.events.insert failed with error: Forbidden'); } });
  assert.throws(() => ctx.createCalendarEvent(good()), (err) => {
    assert.match(err.message, /could not create/i);
    assert.match(err.message, /Design review/);
    assert.doesNotMatch(err.message, /\n\s+at /, 'stack leaked into user-facing message');
    return true;
  });
  assert.match(consoleText(ctx), /Forbidden[\s\S]*\n\s+at /, 'API failure stack not logged');
});

test('insert returning no event id is a failure, never a success', () => {
  const { ctx } = calCtx({ insert: () => ({}) });
  assert.throws(() => ctx.createCalendarEvent(good()), /could not create/i);
});

test('calendar time zone lookup failure -> fails closed (no fallback to the script time zone)', () => {
  const { ctx, inserts } = calCtx({ calendarsGet: () => { throw new Error('Calendars.get 500'); } });
  assert.throws(() => ctx.createCalendarEvent(good()), /time zone/i);
  assert.equal(inserts.length, 0);
  assert.match(consoleText(ctx), /Calendars\.get 500[\s\S]*\n\s+at /);
});

test('calendar time zone missing in the response -> fails closed', () => {
  const { ctx, inserts } = calCtx({ calendarsGet: () => ({ id: 'primary' }) });
  assert.throws(() => ctx.createCalendarEvent(good()), /time zone/i);
  assert.equal(inserts.length, 0);
});
