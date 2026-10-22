/**
 * @file eventRsvp.test.js
 * @description RSVP ("Going? Yes / No / Maybe") read + write. Read: getDailyData/getDailyDataRange events
 * carry myResponse (the self attendee responseStatus, or null when there is no self attendee). Write:
 * setEventRsvp(eventId, response) RPC in gas-app/Code.gs, run against the REAL file in a vm with GAS stubs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const TZ = 'America/Chicago';

function rsvpCtx(o = {}) {
  const ctx = makeGasContext();
  const patches = [];
  const lists = [];
  ctx.Calendar.Calendars = { get: () => ({ id: 'me@example.com', timeZone: TZ }) };
  const attendees = o.attendees || [
    { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
    { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
    { email: 'pal@example.com', responseStatus: 'tentative', comment: 'maybe late' }
  ];
  const event = { id: 'ev1', summary: 'Planning', start: { dateTime: '2026-10-09T09:00:00-05:00' }, end: { dateTime: '2026-10-09T10:00:00-05:00' }, attendees };
  ctx.__fakes.events.push(event);
  const innerList = ctx.Calendar.Events.list;
  ctx.Calendar.Events.list = (cal, opts) => { lists.push(toHost(opts)); return innerList.call(ctx.Calendar.Events, cal, opts); };
  ctx.Calendar.Events.get = (cal, id) => { if (id !== 'ev1') throw new Error('Not Found'); return JSON.parse(JSON.stringify(event)); };
  ctx.Calendar.Events.patch = o.patch || ((resource, cal, id, opts) => {
    patches.push({ resource: toHost(resource), cal, id, opts: toHost(opts) });
    const out = JSON.parse(JSON.stringify(event));
    out.attendees = toHost(resource).attendees;
    return out;
  });
  loadGasFile(ctx, 'Code.gs');
  return { ctx, patches, lists, event };
}

test('listed events carry myResponse from the self attendee, and ask Calendar for attendees', () => {
  const { ctx, lists } = rsvpCtx();
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.equal(day.calendarEvents[0].myResponse, 'needsAction');
  assert.equal(day.calendarEvents[0].attendees, undefined, 'the attendee list is not sent to the client');
  assert.match(lists[0].fields, /attendees\(self,responseStatus\)/);
  lists.length = 0;
  ctx.getDailyDataRange('2026-10-09', '2026-10-09');
  assert.match(lists[0].fields, /attendees\(self,responseStatus\)/, 'range fetch asks for attendees too');
});

test('no self attendee (my own event, or no guests) -> myResponse null', () => {
  for (const attendees of [[], [{ email: 'x@example.com', responseStatus: 'accepted' }]]) {
    const { ctx } = rsvpCtx({ attendees });
    assert.equal(toHost(ctx.getDailyData('2026-10-09')).calendarEvents[0].myResponse, null);
  }
});

test('setEventRsvp patches the full guest list with only my response changed', () => {
  const { ctx, patches } = rsvpCtx();
  const out = toHost(ctx.setEventRsvp('ev1', 'tentative'));
  assert.deepEqual(out, { id: 'ev1', myResponse: 'tentative' });
  assert.equal(patches.length, 1);
  const { resource, cal, id, opts } = patches[0];
  assert.equal(cal, 'primary');
  assert.equal(id, 'ev1');
  assert.deepEqual(Object.keys(resource), ['attendees']);
  assert.deepEqual(resource.attendees, [
    { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
    { email: 'me@example.com', self: true, responseStatus: 'tentative' },
    { email: 'pal@example.com', responseStatus: 'tentative', comment: 'maybe late' }
  ]);
  assert.equal(opts.sendUpdates, 'none');
});

test('setEventRsvp rejects a bad response or event id without calling Calendar', () => {
  const { ctx, patches } = rsvpCtx();
  for (const bad of ['needsAction', 'yes', '', null]) {
    assert.throws(() => ctx.setEventRsvp('ev1', bad), /Invalid RSVP/);
  }
  assert.throws(() => ctx.setEventRsvp('', 'accepted'), /Invalid RSVP/);
  assert.equal(patches.length, 0);
});

test('setEventRsvp throws when I am not a guest, rather than adding myself', () => {
  const { ctx, patches } = rsvpCtx({ attendees: [{ email: 'x@example.com', responseStatus: 'accepted' }] });
  assert.throws(() => ctx.setEventRsvp('ev1', 'accepted'), /not a guest/i);
  assert.equal(patches.length, 0);
});

test('setEventRsvp fails loud when the patch throws or does not stick', () => {
  const thrown = rsvpCtx({ patch: () => { throw new Error('Forbidden'); } });
  assert.throws(() => thrown.ctx.setEventRsvp('ev1', 'accepted'), /RSVP was not saved.*Forbidden/);
  assert.match(thrown.ctx.__consoleLines.join('\n'), /setEventRsvp/);
  const ignored = rsvpCtx({ patch: (r, c, id) => ({ id, attendees: [{ email: 'me@example.com', self: true, responseStatus: 'needsAction' }] }) });
  assert.throws(() => ignored.ctx.setEventRsvp('ev1', 'accepted'), /RSVP was not saved/);
});

test('setEventRsvp is reachable from google.script.run (alias + top-level delegator)', () => {
  const src = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  assert.equal((src.match(/^function setEventRsvp\(/gm) || []).length, 2);
  assert.match(src, /global\._setEventRsvpInternal = setEventRsvp;/);
});
