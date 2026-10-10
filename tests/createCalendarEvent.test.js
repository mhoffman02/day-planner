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
  const ctx = makeGasContext(); // real zone-aware Utilities.formatDate stub (getDailyData needs it)
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
    // o.meet(resource, opts) returns the conference fields the API attaches ({conferenceData, hangoutLink}).
    if (o.meet) Object.assign(created, o.meet(resource, opts));
    ctx.__fakes.events.push(created);
    return created;
  });
  const gets = [];
  const sleeps = [];
  ctx.Utilities.sleep = (ms) => { sleeps.push(ms); };
  ctx.Calendar.Events.get = o.get || ((calendarId, eventId, opts) => { gets.push({ calendarId, eventId, opts: toHost(opts) }); return o.getResult ? o.getResult(gets.length) : { id: eventId }; });
  if (o.get) { const inner = o.get; ctx.Calendar.Events.get = (c, e, opts) => { gets.push({ calendarId: c, eventId: e, opts: toHost(opts) }); return inner(c, e, opts, gets.length); }; }
  loadGasFile(ctx, 'Code.gs');
  return { ctx, inserts, gets, sleeps };
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

// Contract change 2026-10-09 (#11 Meet): addMeet === true now creates a Meet conference. Without it
// (absent or false) no conferenceData is requested and no meetError key is returned.
test('optional description/location omitted -> empty strings; addMeet absent/false -> no conference, no meetError', () => {
  for (const extra of [{}, { addMeet: false }]) {
    const { ctx, inserts } = calCtx();
    const out = toHost(ctx.createCalendarEvent(good(extra)));
    assert.equal(out.description, '');
    assert.equal(out.location, '');
    assert.equal(inserts[0].resource.conferenceData, undefined);
    assert.equal(inserts[0].opts && inserts[0].opts.conferenceDataVersion, undefined);
    assert.deepEqual(Object.keys(out).sort(), EVENT_KEYS);
  }
});

const MEET_URI = 'https:' + '//meet.google.com/abc-defg-hij';
const meetOk = (resource) => ({
  hangoutLink: MEET_URI,
  conferenceData: {
    createRequest: { requestId: resource.conferenceData.createRequest.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' }, status: { statusCode: 'success' } },
    entryPoints: [{ entryPointType: 'video', uri: MEET_URI }, { entryPointType: 'phone', uri: 'tel:+1-555-0100' }],
    conferenceSolution: { key: { type: 'hangoutsMeet' } }
  }
});

test('addMeet true -> conferenceData.createRequest (hangoutsMeet, unique requestId) with conferenceDataVersion 1; meetLink returned', () => {
  const { ctx, inserts } = calCtx({ meet: meetOk });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  const second = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  const req = inserts[0].resource.conferenceData.createRequest;
  assert.deepEqual(req.conferenceSolutionKey, { type: 'hangoutsMeet' });
  assert.equal(typeof req.requestId, 'string');
  assert.ok(req.requestId.length > 0);
  assert.notEqual(req.requestId, inserts[1].resource.conferenceData.createRequest.requestId, 'requestId must be unique per insert');
  assert.deepEqual(inserts[0].opts, { conferenceDataVersion: 1 });
  assert.equal(out.meetLink, MEET_URI);
  assert.equal(second.meetLink, MEET_URI);
  assert.deepEqual(Object.keys(out).sort(), EVENT_KEYS, 'no meetError key on success');
});

test('addMeet true, entry point only (no hangoutLink) -> meetLink is the video entry point uri', () => {
  const { ctx } = calCtx({ meet: (r) => { const m = meetOk(r); delete m.hangoutLink; return m; } });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(out.meetLink, MEET_URI);
  assert.equal(out.meetError, undefined);
});

const meetFailureCases = [
  ['status failure', (r) => ({ conferenceData: { createRequest: { requestId: r.conferenceData.createRequest.requestId, status: { statusCode: 'failure' } } } })],
  ['status pending (link not ready)', (r) => ({ conferenceData: { createRequest: { requestId: r.conferenceData.createRequest.requestId, status: { statusCode: 'pending' } } } })],
  ['success but no entry point and no hangoutLink', (r) => ({ conferenceData: { createRequest: { requestId: r.conferenceData.createRequest.requestId, status: { statusCode: 'success' } }, entryPoints: [] } })],
  ['no conferenceData at all', () => ({})]
];

for (const [name, meet] of meetFailureCases) {
  test(`addMeet true, ${name} -> event still saved, meetLink null, user-facing meetError, context+stack logged`, () => {
    const { ctx, inserts } = calCtx({ meet });
    const out = toHost(ctx.createCalendarEvent(good({ addMeet: true, description: 'Join at ' + MEET_URI + '/old' })));
    assert.equal(inserts.length, 1);
    assert.equal(out.id, 'evt1', 'event returned (it was saved)');
    assert.equal(ctx.__fakes.events.length, 1, 'event not deleted');
    assert.equal(out.meetLink, null, 'never fall back to a Meet URL scraped from the description');
    assert.equal(typeof out.meetError, 'string');
    assert.match(out.meetError, /Meet/);
    assert.match(out.meetError, /saved/i);
    assert.doesNotMatch(out.meetError, /\n\s+at |statusCode|conferenceData/, 'no stack or raw API text in the user message');
    assert.deepEqual(Object.keys(out).sort(), [...EVENT_KEYS, 'meetError'].sort());
    assert.match(consoleText(ctx), /createCalendarEvent[\s\S]*Meet[\s\S]*evt1[\s\S]*\n\s+at /, 'context + stack logged');
  });
}

test('addMeet true and the insert itself fails -> throws as before, nothing claimed', () => {
  const { ctx } = calCtx({ insert: () => { throw new Error('Invalid conference type value.'); } });
  assert.throws(() => ctx.createCalendarEvent(good({ addMeet: true })), /could not create/i);
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

// --- (b) conference-type rejection retries once without conferenceData; anything else never retries ---
test('conference type rejected on insert -> exactly 2 inserts (second without conferenceData), event kept, meetError set', () => {
  let n = 0;
  const calls = [];
  const { ctx } = calCtx({
    insert: (resource, calendarId, opts) => {
      n += 1;
      calls.push({ hasConf: resource.conferenceData !== undefined, opts: toHost(opts) });
      if (resource.conferenceData) throw new Error('Invalid conference type value.');
      return { id: 'evtR', summary: resource.summary, start: { dateTime: resource.start.dateTime + '-05:00' }, end: { dateTime: resource.end.dateTime + '-05:00' } };
    }
  });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(n, 2);
  assert.equal(calls[0].hasConf, true);
  assert.equal(calls[1].hasConf, false);
  assert.equal(out.id, 'evtR');
  assert.equal(out.meetLink, null);
  assert.equal(typeof out.meetError, 'string');
  assert.match(out.meetError, /saved/i);
  assert.match(consoleText(ctx), /Invalid conference type[\s\S]*\n\s+at /, 'rejection stack logged');
});

for (const msg of ['API call to calendar.events.insert failed with error: Service timed out', 'Backend Error 503', 'Quota exceeded for conference rate']) {
  test(`non-rejection insert error (${msg}) with addMeet -> exactly 1 insert, throws, stack logged`, () => {
    let n = 0;
    const { ctx } = calCtx({ insert: () => { n += 1; throw new Error(msg); } });
    assert.throws(() => ctx.createCalendarEvent(good({ addMeet: true })), /could not create/i);
    assert.equal(n, 1, 'blind retry could duplicate the event');
    assert.match(consoleText(ctx), /\n\s+at /);
  });
}

test('conference rejection retry that itself fails -> throws (nothing saved)', () => {
  let n = 0;
  const { ctx } = calCtx({ insert: () => { n += 1; throw new Error(n === 1 ? 'conference solution not allowed' : 'Backend Error'); } });
  assert.throws(() => ctx.createCalendarEvent(good({ addMeet: true })), /could not create/i);
  assert.equal(n, 2);
});

test('addMeet false and insert fails with a conference-looking message -> 1 call, throws, no conferenceData', () => {
  let n = 0;
  const { ctx } = calCtx({ insert: (r) => { n += 1; assert.equal(r.conferenceData, undefined); throw new Error('Invalid conference type value.'); } });
  assert.throws(() => ctx.createCalendarEvent(good({ addMeet: false })), /could not create/i);
  assert.equal(n, 1);
});

// --- (c) pending conference: bounded poll of Events.get ---
const pendingMeet = (r) => ({ conferenceData: { createRequest: { requestId: r.conferenceData.createRequest.requestId, status: { statusCode: 'pending' } } } });

test('pending then success on poll 2 -> returns Meet link, 2 gets with conferenceDataVersion 1, sleeps bounded', () => {
  const { ctx, gets, sleeps } = calCtx({
    meet: pendingMeet,
    get: (c, id, opts, k) => (k < 2
      ? { id, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }
      : { id, hangoutLink: MEET_URI, conferenceData: { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: MEET_URI }] } })
  });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(gets.length, 2);
  assert.equal(gets[0].calendarId, 'primary');
  assert.equal(gets[0].eventId, 'evt1');
  assert.deepEqual(gets[0].opts, { conferenceDataVersion: 1 });
  assert.equal(out.meetLink, MEET_URI);
  assert.equal(out.meetError, undefined);
  assert.ok(sleeps.length >= 1 && sleeps.every((ms) => ms <= 1000));
});

test('pending x3 -> exactly 3 gets, meetLink null, meetError set', () => {
  const { ctx, gets, sleeps } = calCtx({ meet: pendingMeet, get: (c, id) => ({ id, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }) });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(gets.length, 3);
  assert.ok(sleeps.every((ms) => ms <= 1000));
  assert.equal(out.meetLink, null);
  assert.equal(typeof out.meetError, 'string');
  assert.equal(out.id, 'evt1');
});

test('pending then failure on poll -> stops polling, meetError, no link', () => {
  const { ctx, gets } = calCtx({ meet: pendingMeet, get: (c, id) => ({ id, conferenceData: { createRequest: { status: { statusCode: 'failure' } } } }) });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(gets.length, 1);
  assert.equal(out.meetLink, null);
  assert.equal(typeof out.meetError, 'string');
});

test('Events.get throws while polling -> event returned with meetError, stack logged, not rethrown', () => {
  const { ctx, gets } = calCtx({ meet: pendingMeet, get: () => { throw new Error('Events.get 500 boom'); } });
  const out = toHost(ctx.createCalendarEvent(good({ addMeet: true })));
  assert.equal(gets.length, 1);
  assert.equal(out.id, 'evt1');
  assert.equal(out.meetLink, null);
  assert.equal(typeof out.meetError, 'string');
  assert.match(consoleText(ctx), /Events\.get 500 boom[\s\S]*\n\s+at /);
});

test('non-pending outcomes never poll', () => {
  const { ctx, gets } = calCtx({ meet: meetOk });
  ctx.createCalendarEvent(good({ addMeet: true }));
  assert.equal(gets.length, 0);
});

// --- (d) primary time zone memoized per execution, failures never cached ---
test('two creates in one execution -> one Calendars.get', () => {
  let n = 0;
  const { ctx } = calCtx({ calendarsGet: () => { n += 1; return { timeZone: TZ }; } });
  ctx.createCalendarEvent(good());
  ctx.createCalendarEvent(good());
  assert.equal(n, 1);
});

test('first Calendars.get throws, second succeeds -> 2 calls, correct zone, failure not cached', () => {
  let n = 0;
  const { ctx, inserts } = calCtx({ calendarsGet: () => { n += 1; if (n === 1) throw new Error('Calendars.get 500'); return { timeZone: TZ }; } });
  assert.throws(() => ctx.createCalendarEvent(good()), /time zone/i);
  ctx.createCalendarEvent(good());
  assert.equal(n, 2);
  assert.equal(inserts[0].resource.start.timeZone, TZ);
});

test('missing timeZone is not cached either', () => {
  let n = 0;
  const { ctx } = calCtx({ calendarsGet: () => { n += 1; return n === 1 ? { id: 'p' } : { timeZone: TZ }; } });
  assert.throws(() => ctx.createCalendarEvent(good()), /time zone/i);
  ctx.createCalendarEvent(good());
  assert.equal(n, 2);
});
