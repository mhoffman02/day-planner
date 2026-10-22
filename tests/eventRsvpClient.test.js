/**
 * @file eventRsvpClient.test.js
 * @description "Going? Yes / No / Maybe" on appointments, in the click popup and the hover note. setRsvp writes
 * through the setEventRsvp bridge call, shows the answer at once, and rolls back with an error on failure. Runs
 * against both client copies via plannerHarness, plus a markup check of both Index copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, captureConsoleError } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const DATE = '2031-03-12';
const evtOf = (over = {}) => ({ id: 'e1', title: 'Budget review', startTime: `${DATE}T09:00:00`, endTime: `${DATE}T09:30:00`, myResponse: 'needsAction', ...over });

const clients = await bothClients();

for (const c of clients) {
  describe(`appointment RSVP [${c.label}]`, () => {
    const vm = (evt, bridge = {}) => {
      c.cache.setCached(DATE, { tasks: [], calendarEvents: [{ ...evt }], noteContent: '', docUrl: '' });
      return makeVm(c.factory, { selectedDate: DATE, calendarEvents: [evt], dailyTasks: [], masterTasks: [], bridge });
    };

    it('eventDetails exposes my RSVP for the popup and the hover note', () => {
      const v = vm(evtOf({ myResponse: 'tentative' }));
      assert.equal(v.eventDetails(v.calendarEvents[0]).myResponse, 'tentative');
    });

    it('an invite with no other details still gets the hover note, so I can answer it there', () => {
      const v = vm(evtOf());
      assert.equal(v.hasEventDetails(evtOf()), true);
      assert.equal(v.hasEventDetails(evtOf({ myResponse: null })), false);
    });

    it('saves the answer, shows it at once in the list and the open popup, and updates the day cache', async () => {
      const calls = [];
      let release;
      const gate = new Promise((r) => { release = r; });
      const v = vm(evtOf(), { setEventRsvp: async (id, resp) => { calls.push([id, resp]); await gate; return { id, myResponse: resp }; } });
      const evt = v.calendarEvents[0];
      v.openEventModal(evt);
      const pending = v.setRsvp(evt, 'accepted');
      assert.equal(evt.myResponse, 'accepted', 'shown before the server answers');
      assert.equal(v.selectedEvent.myResponse, 'accepted', 'the open popup updates too');
      assert.equal(v.isRsvpSaving(evt), true);
      await v.setRsvp(evt, 'declined');
      assert.equal(calls.length, 1, 'a second click while saving is ignored');
      release();
      await pending;
      assert.deepEqual(calls, [['e1', 'accepted']]);
      assert.equal(v.isRsvpSaving(evt), false);
      assert.equal(c.cache.getCached(DATE).calendarEvents[0].myResponse, 'accepted');
    });

    it('clicking the current answer does nothing', async () => {
      let n = 0;
      const v = vm(evtOf({ myResponse: 'accepted' }), { setEventRsvp: async () => { n++; return {}; } });
      await v.setRsvp(v.calendarEvents[0], 'accepted');
      assert.equal(n, 0);
    });

    it('rolls back and reports when the save fails', async () => {
      const v = vm(evtOf(), { setEventRsvp: async () => { throw new Error('Your RSVP was not saved (Forbidden).'); } });
      const evt = v.calendarEvents[0];
      v.openEventModal(evt);
      const logged = await captureConsoleError(() => v.setRsvp(evt, 'tentative'));
      assert.equal(evt.myResponse, 'needsAction');
      assert.equal(v.selectedEvent.myResponse, 'needsAction');
      assert.equal(v.isRsvpSaving(evt), false);
      assert.match(logged.join('\n'), /setRsvp/);
      const entry = v.errorTray.find((e) => e.key === 'rsvp:e1');
      assert.ok(entry, 'error shown in the tray');
      assert.match(entry.message, /Budget review/);
      assert.match(entry.message, /Forbidden/);
    });

    it('a missing bridge method is a failed save, not a silent success', async () => {
      const v = vm(evtOf());
      const evt = v.calendarEvents[0];
      await captureConsoleError(() => v.setRsvp(evt, 'accepted'));
      assert.equal(evt.myResponse, 'needsAction');
      assert.ok(v.errorTray.find((e) => e.key === 'rsvp:e1'));
    });
  });
}

test('both Index copies show Going? Yes / No / Maybe in the popup and the hover note', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    const hover = (html.match(/<section class="schedule-list"[\s\S]*?<\/section>/) || [''])[0];
    const modal = (html.match(/aria-labelledby="eventModalTitle"[\s\S]*?<\/dialog>/) || [''])[0];
    for (const [where, block, ref] of [['hover note', hover, 'evt'], ['popup', modal, 'selectedEvent']]) {
      const row = (block.match(/<div class="event-rsvp[^"]*"[\s\S]*?<\/div>/) || [''])[0];
      assert.ok(row, `${page} ${where}: has the RSVP row`);
      assert.match(row, new RegExp(`x-show="${ref}\\?*\\.myResponse"`), `${page} ${where}: only for invites`);
      assert.match(row, />Going\?</, `${page} ${where}: Going? label`);
      for (const [status, label] of [['accepted', 'Yes'], ['declined', 'No'], ['tentative', 'Maybe']]) {
        const btn = (row.match(new RegExp(`<button[^>]*setRsvp\\(${ref}, '${status}'\\)[^>]*>${label}</button>`)) || [''])[0];
        assert.ok(btn, `${page} ${where}: ${label} button`);
        assert.match(btn, new RegExp(`:aria-pressed="${ref}\\?*\\.myResponse === '${status}'"`), `${page} ${where}: ${label} shows the current answer`);
        assert.match(btn, /:disabled="isRsvpSaving\(/, `${page} ${where}: ${label} disabled while saving`);
        if (where === 'hover note') assert.match(btn, /@click\.stop=/, `${page}: ${label} click does not open the popup`);
      }
    }
  }
});
