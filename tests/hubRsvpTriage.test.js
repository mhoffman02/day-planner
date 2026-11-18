/**
 * @file hubRsvpTriage.test.js
 * @description Triage RSVP (user 2026-11-17): an invite email is recognised from its text/calendar part (METHOD:REQUEST),
 * mapped to the calendar event by the invite UID (Events.list iCalUID, never by scraping the Gmail link), answered through
 * the existing setEventRsvp, and only then archived. Any failure before the answer leaves the email in the Inbox; an answer
 * that saved but could not archive says so. DRY_RUN writes nothing. Invite text never reaches the board.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const ON = { GMAIL_ROUTER: true, NOTES: true, TRIAGE_BOARD: true, DRY_RUN: false };
const writes = (ctx) => ctx.__hub.gmail.calls.filter((c) => /^threads\.(modify|trash|delete)/.test(c));

const ics = (o = {}) => [
  'BEGIN:VCALENDAR', `METHOD:${o.method || 'REQUEST'}`,
  'BEGIN:VTIMEZONE', 'UID:not-this-one@tz', 'END:VTIMEZONE',
  'BEGIN:VEVENT', ...(o.uidLines || [`UID:${o.uid || 'abc123@google.com'}`]), ...(o.recurrence ? [`RECURRENCE-ID:${o.recurrence}`] : []),
  'DESCRIPTION:CANARY_ICS_DESCRIPTION', 'END:VEVENT', 'END:VCALENDAR'
].join('\r\n');

function setup(o = {}) {
  const ctx = makeHubContext({ features: o.features || ON, now: '2026-11-17T16:00:00Z' });
  addThread(ctx, { id: 'inv1', labels: ['🎯/Meeting'], subject: 'Invitation: Planning', ics: o.ics === undefined ? ics() : o.ics });
  addThread(ctx, { id: 'plain1', labels: ['🎯/Meeting'], subject: 'Just mail' });
  ctx.__hub.calendar.events.push(...(o.events || [{ id: 'evA', summary: 'Planning', start: '2026-11-18T15:00:00Z', end: '2026-11-18T16:00:00Z', iCalUID: 'abc123@google.com' }]));
  const answers = [];
  ctx.setEventRsvp = (id, response) => {
    if (o.rsvpThrows) throw new Error(o.rsvpThrows);
    answers.push([id, response]);
    return { id, myResponse: response };
  };
  return { ctx, answers };
}

test('the board flags a REQUEST invite as isInvite and never ships the invite text', () => {
  const { ctx } = setup();
  const r = call(ctx, 'getTriageBoard', {});
  const items = Object.values(r.queues).flat();
  assert.equal(items.find((i) => i.threadId === 'inv1').isInvite, true);
  assert.equal(items.find((i) => i.threadId === 'plain1').isInvite, false);
  assert.ok(!JSON.stringify(r).includes('CANARY_ICS_DESCRIPTION'), 'invite text leaked to the client');
  assert.ok(!JSON.stringify(r).includes('abc123@google.com'), 'invite UID leaked to the client');
});

test('a CANCEL notice is not an invite to answer', () => {
  const { ctx } = setup({ ics: ics({ method: 'CANCEL' }) });
  const items = Object.values(call(ctx, 'getTriageBoard', {}).queues).flat();
  assert.equal(items.find((i) => i.threadId === 'inv1').isInvite, false);
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted');
  assert.equal(r.errorCode, 'NOT_AN_INVITE');
  assert.deepEqual(writes(ctx), []);
});

test('rsvpTriageThread answers the matched event first, then archives the email', () => {
  const { ctx, answers } = setup();
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'tentative');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(answers, [['evA', 'tentative']]);
  assert.deepEqual(writes(ctx), ['threads.modify:{"removeLabelIds":["INBOX"]}']);
});

test('an unfolded UID (long UID folded across lines) still matches its event', () => {
  const { ctx, answers } = setup({ ics: ics({ uidLines: ['UID:abc123', ' @google.com'] }) });
  assert.equal(call(ctx, 'rsvpTriageThread', 'inv1', 'accepted').ok, true);
  assert.deepEqual(answers, [['evA', 'accepted']]);
});

test('the UID comes from the VEVENT, not the VTIMEZONE block', () => {
  const { ctx } = setup({ events: [{ id: 'tzEv', summary: 'x', start: '2026-11-18T15:00:00Z', end: '2026-11-18T16:00:00Z', iCalUID: 'not-this-one@tz' }] });
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted');
  assert.equal(r.errorCode, 'EVENT_NOT_FOUND');
});

test('one occurrence of a series: RECURRENCE-ID picks the exception, and without it the series master is answered', () => {
  const events = [
    { id: 'master', summary: 'Weekly', start: '2026-11-11T15:00:00Z', end: '2026-11-11T16:00:00Z', iCalUID: 'abc123@google.com' },
    { id: 'occ1', summary: 'Weekly', start: '2026-11-18T15:00:00Z', end: '2026-11-18T16:00:00Z', iCalUID: 'abc123@google.com', recurringEventId: 'master', originalStartTime: { dateTime: '2026-11-18T15:00:00Z' } },
    { id: 'occ2', summary: 'Weekly', start: '2026-11-25T15:00:00Z', end: '2026-11-25T16:00:00Z', iCalUID: 'abc123@google.com', recurringEventId: 'master', originalStartTime: { dateTime: '2026-11-25T15:00:00Z' } }
  ];
  const one = setup({ events, ics: ics({ recurrence: '20261125T150000Z' }) });
  assert.equal(call(one.ctx, 'rsvpTriageThread', 'inv1', 'declined').ok, true);
  assert.deepEqual(one.answers, [['occ2', 'declined']]);
  const all = setup({ events });
  assert.equal(call(all.ctx, 'rsvpTriageThread', 'inv1', 'declined').ok, true);
  assert.deepEqual(all.answers, [['master', 'declined']]);
});

test('no matching event: fail, keep the email in the Inbox', () => {
  const { ctx, answers } = setup({ events: [] });
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'EVENT_NOT_FOUND');
  assert.deepEqual(answers, []);
  assert.deepEqual(writes(ctx), []);
});

test('several candidates and no way to tell them apart: fail, answer nothing', () => {
  const dup = { start: '2026-11-18T15:00:00Z', end: '2026-11-18T16:00:00Z', iCalUID: 'abc123@google.com' };
  const { ctx, answers } = setup({ events: [{ id: 'e1', summary: 'a', ...dup }, { id: 'e2', summary: 'b', ...dup }] });
  assert.equal(call(ctx, 'rsvpTriageThread', 'inv1', 'accepted').errorCode, 'EVENT_AMBIGUOUS');
  assert.deepEqual(answers, []);
  assert.deepEqual(writes(ctx), []);
});

test('a thread with no invite part is refused before any write', () => {
  const { ctx, answers } = setup();
  const r = call(ctx, 'rsvpTriageThread', 'plain1', 'accepted');
  assert.equal(r.errorCode, 'NOT_AN_INVITE');
  assert.deepEqual(answers, []);
  assert.deepEqual(writes(ctx), []);
});

test('the answer failing leaves the email in the Inbox', () => {
  const { ctx } = setup({ rsvpThrows: 'You are not a guest on this event' });
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted');
  assert.equal(r.ok, false);
  assert.match(r.message, /not a guest/);
  assert.deepEqual(writes(ctx), []);
});

test('answer saved but the archive failed: say so, never plain success', () => {
  const { ctx, answers } = setup();
  ctx.__hub.gmail.failWrite = 'Gmail 503';
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted');
  assert.equal(r.ok, false);
  assert.match(r.message, /RSVP saved/);
  assert.deepEqual(answers, [['evA', 'accepted']]);
});

test('DRY_RUN answers nothing and archives nothing', () => {
  const { ctx, answers } = setup({ features: { ...ON, DRY_RUN: true } });
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'accepted', { expectDryRun: true });
  assert.equal(r.status, 'DRY_RUN');
  assert.deepEqual(answers, []);
  assert.deepEqual(writes(ctx), []);
});

test('GMAIL_ROUTER off writes nothing', () => {
  const { ctx, answers } = setup({ features: { ...ON, GMAIL_ROUTER: false } });
  assert.equal(call(ctx, 'rsvpTriageThread', 'inv1', 'accepted').errorCode, 'FLAG_OFF');
  assert.deepEqual(answers, []);
});

test('a bad answer value is rejected by the boundary guard', () => {
  const { ctx } = setup();
  const r = call(ctx, 'rsvpTriageThread', 'inv1', 'maybe');
  assert.equal(r.ok, false);
  assert.deepEqual(writes(ctx), []);
});
