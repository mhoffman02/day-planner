/**
 * @file appointmentAttendeeActions.test.js
 * @description Today > Appointments row icons (user 2026-11-18): Email attendees (Gmail compose link, To and Subject
 * filled) and Chat with attendees (Chat in a new tab, "title: addresses" copied). Both show only when someone else is
 * invited. Runs against both client copies via plannerHarness, plus a markup check of both Index copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clients = await bothClients();
const evt = { id: 'e1', title: 'Budget review', guests: [{ name: 'Me', email: 'me@example.test', self: true }, { name: 'Pat', email: 'pat@example.test' }] };
const solo = { id: 'e2', title: 'Focus', guests: [{ name: 'Me', email: 'me@example.test', self: true }] };

for (const c of clients) {
  describe(`appointment attendee actions [${c.label}]`, () => {
    it('hasOtherGuests is true only when someone besides me is invited', () => {
      const v = makeVm(c.factory, {});
      assert.equal(v.hasOtherGuests(evt), true);
      assert.equal(v.hasOtherGuests(solo), false);
      assert.equal(v.hasOtherGuests({ title: 'No guests' }), false);
    });

    it('emailGuestsUrl is the Gmail compose link with the other attendees and the meeting title', () => {
      const v = makeVm(c.factory, {});
      const q = new URL(v.emailGuestsUrl(evt)).searchParams;
      assert.equal(q.get('to'), 'pat@example.test');
      assert.equal(q.get('su'), 'Budget review');
      assert.equal(v.emailGuestsUrl(solo), '');
    });

    it('chatGuestsUrl is Google Chat', () => {
      assert.equal(makeVm(c.factory, {}).chatGuestsUrl, 'https://chat.google.com/');
    });

    it('copyChatText copies "title: addresses" and says so', async () => {
      const copied = [];
      Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { copied.push(t); } } }, configurable: true });
      const v = makeVm(c.factory, {});
      const toasts = [];
      v.showTaskToast = (m) => toasts.push(m);
      await v.copyChatText(evt);
      await settle();
      assert.deepEqual(copied, ['Budget review: pat@example.test']);
      assert.match(toasts[0], /paste.*New chat/i);
    });

    it('copyChatText with the clipboard blocked says so instead of failing quietly', async () => {
      Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, configurable: true });
      const v = makeVm(c.factory, {});
      const toasts = [];
      v.showTaskToast = (m) => toasts.push(m);
      const errors = [];
      const orig = console.error;
      console.error = (...a) => errors.push(a.join(' '));
      try { await v.copyChatText(evt); } finally { console.error = orig; }
      assert.match(toasts[0], /could not copy/i);
      assert.match(errors.join('\n'), /denied/);
    });
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: appointment rows carry the email and chat icons, shown only with other attendees`, () => {
    const html = read(file);
    assert.match(html, /<a [^>]*class="[^"]*appt-guest-action[^"]*"[^>]*:href="emailGuestsUrl\(evt\)"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(html, /<a [^>]*class="[^"]*appt-guest-action[^"]*"[^>]*:href="chatGuestsUrl"[^>]*@click="copyChatText\(evt\)"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.equal((html.match(/x-show="hasOtherGuests\(evt\)"/g) || []).length >= 2, true);
  });
}
