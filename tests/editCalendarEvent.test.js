/**
 * @file editCalendarEvent.test.js
 * @description Contract tests for editing and deleting appointments (user 2026-11-06): the mapper flags
 * (canEdit/canDelete/recurringEventId/guestCount/etag) and the updateCalendarEvent / deleteCalendarEvent
 * RPCs in gas-app/Code.gs, run against the REAL file in a vm with GAS stubs.
 * Google Calendar behaviour mirrored: an organizer (or guests-can-modify) edits; "this event" patches the
 * instance, "all events" patches the series master keeping the series start date; guests are notified only
 * when the caller says so; a changed etag is refused instead of overwritten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const TZ = 'America/Chicago';

function ctxWith(store) {
  const ctx = makeGasContext();
  ctx.Calendar.Calendars = { get: () => ({ id: 'me@example.com', timeZone: TZ }) };
  const patches = [];
  const removes = [];
  ctx.Calendar.Events.get = (calId, id) => {
    if (!store[id]) throw new Error('Not Found: ' + id);
    return JSON.parse(JSON.stringify(store[id]));
  };
  ctx.Calendar.Events.patch = (res, calId, id, opts) => {
    patches.push({ res: toHost(res), calId, id, opts: toHost(opts) });
    store[id] = { ...store[id], ...toHost(res), etag: store[id].etag + 'x' };
    return JSON.parse(JSON.stringify(store[id]));
  };
  ctx.Calendar.Events.remove = (calId, id, opts) => {
    removes.push({ calId, id, opts: toHost(opts) });
    delete store[id];
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, patches, removes };
}

const mine = (over = {}) => ({
  id: 'e1', etag: '"1"', summary: 'Standup', start: { dateTime: '2026-11-09T09:00:00-06:00' }, end: { dateTime: '2026-11-09T09:30:00-06:00' },
  organizer: { self: true }, ...over
});

// Maps a raw event through the real daily path (getDailyData -> mapCalendarApiEvent_).
function mapped(raw) {
  const { ctx } = ctxWith({});
  ctx.__fakes.events.push(raw);
  return toHost(ctx.getDailyData('2026-11-09')).calendarEvents.find((e) => e.id === raw.id);
}

const payload = (over = {}) => ({ title: ' Standup 2 ', dateStr: '2026-11-10', startTime: '10:00', endTime: '10:45', description: 'd', location: 'r', ...over });

test('mapper: organizer timed event is editable and deletable; carries etag, recurringEventId, guestCount', () => {
  const out = mapped(mine({ recurringEventId: 'r1', attendees: [{ self: true }, { email: 'a' }, { email: 'b' }] }));
  assert.equal(out.canEdit, true);
  assert.equal(out.canDelete, true);
  assert.equal(out.etag, '"1"');
  assert.equal(out.recurringEventId, 'r1');
  assert.equal(out.guestCount, 2);
});

test('mapper: not editable when invited, all-day, or a special event type; guestsCanModify opens it', () => {
  const f = (o) => mapped(mine(o)).canEdit;
  assert.equal(f({ organizer: { self: false } }), false);
  assert.equal(f({ organizer: { self: false }, guestsCanModify: true }), true);
  for (const eventType of ['outOfOffice', 'focusTime', 'workingLocation', 'birthday', 'fromGmail']) assert.equal(f({ eventType }), false, eventType);
  assert.equal(f({ eventType: 'default' }), true);
});

test('update this event: patches only the instance, wall-clock in the calendar zone, notify none by default', () => {
  const { ctx, patches } = ctxWith({ e1: mine() });
  const out = toHost(ctx.updateCalendarEvent('e1', payload(), {}));
  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, 'e1');
  assert.equal(patches[0].res.summary, 'Standup 2');
  assert.deepEqual(patches[0].res.start, { dateTime: '2026-11-10T10:00:00', timeZone: TZ });
  assert.deepEqual(patches[0].res.end, { dateTime: '2026-11-10T10:45:00', timeZone: TZ });
  assert.equal(patches[0].opts.sendUpdates, 'none');
  assert.equal(out.id, 'e1');
  assert.equal(out.title, 'Standup 2');
});

test('update with notify true sends updates to all guests', () => {
  const { ctx, patches } = ctxWith({ e1: mine() });
  ctx.updateCalendarEvent('e1', payload(), { notify: true });
  assert.equal(patches[0].opts.sendUpdates, 'all');
});

test('update all events: patches the series master, keeps its start date, returns the instance', () => {
  const { ctx, patches } = ctxWith({
    i1: mine({ id: 'i1', recurringEventId: 'm1', start: { dateTime: '2026-11-16T09:00:00-06:00' }, end: { dateTime: '2026-11-16T09:30:00-06:00' } }),
    m1: mine({ id: 'm1', start: { dateTime: '2026-11-02T09:00:00-06:00' }, end: { dateTime: '2026-11-02T09:30:00-06:00' }, recurrence: ['RRULE:FREQ=WEEKLY'] })
  });
  const out = toHost(ctx.updateCalendarEvent('i1', payload({ dateStr: '2026-11-16' }), { scope: 'all' }));
  assert.equal(patches.length, 1);
  assert.equal(patches[0].id, 'm1');
  assert.deepEqual(patches[0].res.start, { dateTime: '2026-11-02T10:00:00', timeZone: TZ });
  assert.deepEqual(patches[0].res.end, { dateTime: '2026-11-02T10:45:00', timeZone: TZ });
  assert.equal(out.id, 'i1');
});

test('update refuses a stale etag and writes nothing', () => {
  const { ctx, patches } = ctxWith({ e1: mine({ etag: '"2"' }) });
  assert.throws(() => ctx.updateCalendarEvent('e1', payload(), { etag: '"1"' }), /changed in Google Calendar/);
  assert.equal(patches.length, 0);
});

test('update refuses an event the user cannot edit', () => {
  const { ctx, patches } = ctxWith({ e1: mine({ organizer: { self: false } }) });
  assert.throws(() => ctx.updateCalendarEvent('e1', payload(), {}), /not allowed to edit/);
  assert.equal(patches.length, 0);
});

test('update validates the payload like create', () => {
  const { ctx } = ctxWith({ e1: mine() });
  assert.throws(() => ctx.updateCalendarEvent('e1', payload({ endTime: '09:00' }), {}), /Invalid event/);
});

test('delete this event removes the instance; notify maps to sendUpdates', () => {
  const { ctx, removes } = ctxWith({ e1: mine() });
  const out = toHost(ctx.deleteCalendarEvent('e1', { notify: true }));
  assert.equal(removes[0].id, 'e1');
  assert.equal(removes[0].opts.sendUpdates, 'all');
  assert.deepEqual(out, { id: 'e1', deleted: true, scope: 'this' });
});

test('delete all events removes the series master', () => {
  const { ctx, removes } = ctxWith({ i1: mine({ id: 'i1', recurringEventId: 'm1' }), m1: mine({ id: 'm1' }) });
  const out = toHost(ctx.deleteCalendarEvent('i1', { scope: 'all' }));
  assert.equal(removes[0].id, 'm1');
  assert.equal(out.scope, 'all');
});

test('delete refuses an event the user cannot delete', () => {
  const { ctx, removes } = ctxWith({ e1: mine({ organizer: { self: false } }) });
  assert.throws(() => ctx.deleteCalendarEvent('e1', {}), /not allowed to delete/);
  assert.equal(removes.length, 0);
});

test('a Calendar failure on delete is surfaced', () => {
  const { ctx } = ctxWith({ e1: mine() });
  ctx.Calendar.Events.remove = () => { throw new Error('boom'); };
  assert.throws(() => ctx.deleteCalendarEvent('e1', {}), /was not deleted/);
});
