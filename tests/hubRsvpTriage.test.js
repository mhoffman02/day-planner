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

test('rows cached before isInvite existed (legacy key) are not reused, so invites still get RSVP buttons', () => {
  const { ctx } = setup();
  call(ctx, 'getTriageBoard', {});
  const store = ctx.__hub.cache.store;
  const legacy = new Map();
  for (const [k, v] of store.entries()) {
    if (!k.startsWith('triageRow.')) continue;
    const e = JSON.parse(v);
    delete e.row.isInvite; // the shape written before the RSVP release
    legacy.set(k.replace(/^triageRow\.v\d+:/, 'triageRow.v2:'), JSON.stringify(e));
  }
  store.clear();
  legacy.forEach((v, k) => store.set(k, v));
  const items = Object.values(call(ctx, 'getTriageBoard', {}).queues).flat();
  assert.equal(items.find((i) => i.threadId === 'inv1').isInvite, true, 'a pre-RSVP cached row hid the buttons');
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

// User 2026-11-19: "I do a lot of accept/reject/maybe to meetings as part of my daily triage" - invites belong in Direct
// Action even with no triage label, and even when the sender (calendar-notification@google.com) scores as automated.
const INVITE_Q = 'in:inbox filename:ics';
function inviteBoard(o = {}) {
  const ctx = makeHubContext({ features: ON, now: '2026-11-17T16:00:00Z' });
  addThread(ctx, { id: 'bare1', labels: [], from: 'Google Calendar <calendar-notification@google.com>', subject: 'Invitation: Standup', ics: ics() });
  addThread(ctx, { id: 'reply1', labels: [], subject: 'Accepted: Standup', ics: ics({ method: 'REPLY' }) });
  addThread(ctx, { id: 'other1', labels: [], subject: 'Unlabelled mail' });
  ctx.__hub.gmail.queryHits[INVITE_Q] = o.hits || ['bare1', 'reply1'];
  return ctx;
}
const allItems = (r) => Object.values(r.queues).flat();

test('an invite with no triage label shows in Direct Action with RSVP buttons', () => {
  const ctx = inviteBoard();
  const r = call(ctx, 'getTriageBoard', {});
  const row = r.queues.directAction.find((i) => i.threadId === 'bare1');
  assert.ok(row, 'unlabelled invite missing from Direct Action: ' + JSON.stringify(allItems(r).map((i) => [i.threadId, i.queue])));
  assert.equal(row.isInvite, true);
  assert.ok(!allItems(r).some((i) => i.threadId === 'other1'), 'unlabelled non-invite mail must stay off the board');
  assert.ok(ctx.__hub.gmail.listQueries.some((q) => /^in:inbox filename:ics newer_than:\d+d$/.test(q || '')), 'invite query is bounded by newer_than');
});

test('an RSVP reply (Accepted:, METHOD:REPLY) found only by the invite query stays off the board', () => {
  const r = call(inviteBoard(), 'getTriageBoard', {});
  assert.ok(!allItems(r).some((i) => i.threadId === 'reply1'));
});

test('a cached invite row still routes to Direct Action', () => {
  const ctx = inviteBoard();
  call(ctx, 'getTriageBoard', {});
  const before = ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length;
  const r = call(ctx, 'getTriageBoard', {});
  assert.equal(ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length, before, 'second build should reuse the row cache');
  assert.ok(r.queues.directAction.some((i) => i.threadId === 'bare1' && i.isInvite === true));
  assert.ok(!allItems(r).some((i) => i.threadId === 'reply1'), 'cached reply row leaked onto the board');
});

test('a labelled invite that scores low still lands in Direct Action, not FYI', () => {
  const ctx = makeHubContext({ features: ON, now: '2026-11-17T16:00:00Z' });
  addThread(ctx, { id: 'fyiInv', labels: ['FYI_Candidate'], from: 'Google Calendar <calendar-notification@google.com>', to: 'list@example.test', cc: 'me@example.test', subject: 'Invitation: All hands', ics: ics() });
  const r = call(ctx, 'getTriageBoard', {});
  assert.equal(allItems(r).find((i) => i.threadId === 'fyiInv').queue, 'Direct Action');
});

test('invites are listed before label queues, so a full board cannot crowd them out', () => {
  const ctx = inviteBoard();
  for (let i = 0; i < 5; i++) addThread(ctx, { id: 'vip' + i, labels: ['VIP'], subject: 'VIP ' + i });
  const r = call(ctx, 'getTriageBoard', { limit: 3 });
  assert.ok(r.queues.directAction.some((i) => i.threadId === 'bare1'));
});

// Real Google Calendar mail keeps the iCalendar text in an invite.ics attachment, not inline (HOME probe 2026-11-19:
// all 4 Inbox invites). The first release read inline parts only, so no real invite ever got RSVP buttons.
test('a real Calendar invite (invite.ics attachment, no inline data) gets RSVP buttons in Direct Action', () => {
  const ctx = makeHubContext({ features: ON, now: '2026-11-17T16:00:00Z' });
  addThread(ctx, { id: 'real1', labels: [], from: 'Pat <pat@example.test>', subject: 'Invitation: Christmas Ships', ics: ics(), icsAttached: true });
  ctx.__hub.gmail.queryHits[INVITE_Q] = ['real1'];
  const r = call(ctx, 'getTriageBoard', {});
  const row = r.queues.directAction.find((i) => i.threadId === 'real1');
  assert.ok(row, 'real Calendar invite missing: ' + JSON.stringify(allItems(r).map((i) => i.threadId)));
  assert.equal(row.isInvite, true);
  assert.ok(!JSON.stringify(r).includes('CANARY_ICS_DESCRIPTION'), 'invite text leaked to the client');
  assert.equal(ctx.__hub.gmail.calls.filter((c) => c.startsWith('messages.attachments.get')).length, 1, 'one attachment read per invite');
});

test('rsvpTriageThread answers a real Calendar invite read from its invite.ics attachment', () => {
  const { ctx, answers } = setup();
  addThread(ctx, { id: 'real2', labels: ['🎯/Meeting'], subject: 'Invitation: Planning', ics: ics(), icsAttached: true });
  const r = call(ctx, 'rsvpTriageThread', 'real2', 'accepted', {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(answers, [['evA', 'accepted']]);
});
