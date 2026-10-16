/**
 * @file appointmentNotePopover.test.js
 * @description Appointments get a note icon like Tasks; hovering it shows the same details the click popup
 * shows (time, location, Meet link, description), built by one shared eventDetails(). Runs against both
 * client copies via plannerHarness, plus a markup check of both Index copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const EVT = {
  id: 'e1', title: 'Budget review', startTime: '2031-03-12T09:00:00', endTime: '2031-03-12T09:30:00',
  location: 'Room 4B', description: 'Bring Q3 numbers', hangoutLink: 'https://meet.google.com/abc-defg-hij'
};

for (const c of await bothClients()) {
  describe(`appointment note popover [${c.label}]`, () => {
    const vm = () => makeVm(c.factory, { selectedDate: '2031-03-12', calendarEvents: [EVT], dailyTasks: [], masterTasks: [] });

    it('the popup and the hover note use the same details', () => {
      const v = vm();
      v.openEventModal(EVT);
      const d = v.eventDetails(EVT);
      for (const k of ['title', 'meetLink', 'gCalLink', 'formattedTime', 'location', 'description']) {
        assert.deepEqual(d[k], v.selectedEvent[k], k);
      }
      assert.equal(d.meetLink, 'https://meet.google.com/abc-defg-hij');
      assert.equal(d.locationLabel, 'Room 4B');
    });

    it('a Meet location reads as Google Meet, and an empty one says so', () => {
      const v = vm();
      assert.equal(v.eventDetails({ ...EVT, location: 'https://meet.google.com/x' }).locationLabel, 'Google Meet');
      assert.equal(v.eventDetails({ ...EVT, location: '' }).locationLabel, 'No location set');
    });

    it('the icon shows only when there is more than the title', () => {
      const v = vm();
      assert.equal(v.hasEventDetails(EVT), true);
      assert.equal(v.hasEventDetails({ id: 'e2', title: 'Focus time', startTime: '2031-03-12T10:00:00' }), false);
      assert.equal(v.hasEventDetails({ id: 'e3', title: 'Call', location: 'Phone' }), true);
    });

    it('each appointment has its own popover key, apart from task ids', () => {
      const v = vm();
      assert.equal(v.eventPopoverKey(EVT), 'evt:e1');
      assert.notEqual(v.eventPopoverKey({ title: 'A', startTime: '2031-03-12T09:00:00' }), v.eventPopoverKey({ title: 'B', startTime: '2031-03-12T09:00:00' }));
    });
  });
}

test('both Index copies put a note icon with a details popover on each appointment', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    const block = (html.match(/<section class="schedule-list"[\s\S]*?<\/section>/) || [''])[0];
    assert.match(block, /x-show="hasEventDetails\(evt\)"/, `${page}: icon only when there are details`);
    assert.match(block, /openNotesPopover\(eventPopoverKey\(evt\), \$event\)/, `${page}: hover opens`);
    assert.match(block, /class="notes-popover event-notes-popover"/, `${page}: popover`);
    assert.match(block, /eventDetails\(evt\)\.locationLabel/, `${page}: same location text as the popup`);
    assert.match(block, /formatEventDescription\(/, `${page}: same description formatting as the popup`);
  }
});
