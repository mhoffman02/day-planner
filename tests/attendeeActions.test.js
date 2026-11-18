/**
 * @file attendeeActions.test.js
 * @description Appointment row actions (user 2026-11-18): email the attendees (Gmail compose, To and Subject filled, the
 * way Google Calendar's Email guests does) and chat with them (Google Chat has no link that sets a group title, so the
 * title and addresses are copied for the user to paste). Pure helpers, no DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otherGuestEmails, emailAttendeesUrl } from '../src/attendeeActions.js';

const guests = [
  { name: 'Me', email: 'me@example.test', self: true },
  { name: 'Pat', email: 'pat@example.test', self: false },
  { name: 'Lee', email: 'lee+x@example.test', self: false }
];

test('otherGuestEmails drops me, blank addresses and duplicates', () => {
  assert.deepEqual(otherGuestEmails([...guests, { name: 'No mail', email: '' }, { name: 'Dup', email: 'PAT@example.test' }]), ['pat@example.test', 'lee+x@example.test']);
});

test('otherGuestEmails of nothing is empty', () => {
  assert.deepEqual(otherGuestEmails(undefined), []);
  assert.deepEqual(otherGuestEmails([guests[0]]), []);
});

test('emailAttendeesUrl opens Gmail compose with To and the meeting title as Subject, encoded', () => {
  const url = emailAttendeesUrl({ title: 'Q4 plan & budget: review?', guests });
  assert.ok(url.startsWith('https://mail.google.com/mail/?view=cm&fs=1&'), url);
  const q = new URL(url).searchParams;
  assert.equal(q.get('to'), 'pat@example.test,lee+x@example.test');
  assert.equal(q.get('su'), 'Q4 plan & budget: review?');
});

test('emailAttendeesUrl is empty when nobody else is invited', () => {
  assert.equal(emailAttendeesUrl({ title: 'Focus', guests: [guests[0]] }), '');
  assert.equal(emailAttendeesUrl({ title: 'Focus' }), '');
});
