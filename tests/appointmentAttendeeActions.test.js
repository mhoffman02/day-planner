/**
 * @file appointmentAttendeeActions.test.js
 * @description Today > Appointments row icons (user 2026-11-18): Email attendees (Gmail compose link, To and Subject
 * filled; only when someone else is invited) and Open in Google Calendar (every appointment; Calendar has Chat with
 * guests, and the old chat icon only copied addresses, so the user replaced it 2026-11-18). Runs against both client copies via plannerHarness, plus a markup check of both Index copies.
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

    it('the chat copy helpers are gone: the second icon is the Calendar opener', () => {
      const v = makeVm(c.factory, {});
      assert.equal(v.chatGuestsUrl, undefined);
      assert.equal(v.copyChatText, undefined);
    });

    it('openGCalWindow exists: the Calendar icon opens a sized window, since the installed app has no tabs', () => {
      const v = makeVm(c.factory, {});
      assert.equal(typeof v.openGCalWindow, 'function');
    });

    it('eventGCalLink opens the appointment in Google Calendar', () => {
      const v = makeVm(c.factory, {});
      assert.equal(v.eventGCalLink({ id: 'e1', htmlLink: 'https://calendar.google.com/event?eid=abc' }), 'https://calendar.google.com/event?eid=abc');
    });
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: appointment rows carry the email icon (other attendees only) and an open-in-Calendar icon (every appointment)`, () => {
    const html = read(file);
    assert.match(html, /<a [^>]*class="[^"]*appt-guest-action[^"]*"[^>]*:href="emailGuestsUrl\(evt\)"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(html, /<a [^>]*class="[^"]*appt-guest-action[^"]*"[^>]*:href="eventGCalLink\(evt\)"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*title="Open in gCal: Edit, chat\.\.\."[^>]*>\s*<span class="material-symbols-outlined icon-14">calendar_today<\/span>/);
    assert.equal((html.match(/x-show="hasOtherGuests\(evt\)"/g) || []).length, 1);
    assert.match(html, /:href="eventGCalLink\(evt\)"[^>]*@click\.stop\.prevent="openGCalWindow\(evt\)"/);
    assert.match(html, /<a :href="selectedEvent\?\.gCalLink" target="_blank" rel="noopener noreferrer" @click\.prevent="openGCalWindow\(selectedEvent\)" class="btn-primary">/);
    assert.doesNotMatch(html, /copyChatText|chatGuestsUrl/);
  });
}
