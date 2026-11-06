/**
 * @file scheduleSlotCreate.test.js
 * @description Today > Appointments: clicking a slot's time label, or the empty body of a free slot, opens the new
 * appointment form prefilled with that slot's start (one hour long). A slot that already holds an appointment is only
 * addable from its time label, so the pill click still opens the existing appointment.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

for (const c of await bothClients()) {
  describe(`schedule slot create [${c.label}]`, () => {
    it('prefills start and a one-hour end from the slot key', () => {
      const v = makeVm(c.factory, { selectedDate: '2031-03-12' });
      v.openCreateEventModal('16:00');
      assert.equal(v.createEventModalOpen, true);
      assert.equal(v.newEventData.startTime, '16:00');
      assert.equal(v.newEventData.endTime, '17:00');
    });

    it('half-hour slot keeps its minutes', () => {
      const v = makeVm(c.factory, { selectedDate: '2031-03-12' });
      v.openCreateEventModal('13:30');
      assert.equal(v.newEventData.startTime, '13:30');
      assert.equal(v.newEventData.endTime, '14:30');
    });

    it('no argument keeps the 09:00 default', () => {
      const v = makeVm(c.factory, { selectedDate: '2031-03-12' });
      v.openCreateEventModal();
      assert.equal(v.newEventData.startTime, '09:00');
      assert.equal(v.newEventData.endTime, '10:00');
    });

    it('a click event passed by mistake falls back to the default', () => {
      const v = makeVm(c.factory, { selectedDate: '2031-03-12' });
      v.openCreateEventModal({ type: 'click' });
      assert.equal(v.newEventData.startTime, '09:00');
    });
  });
}

describe('schedule slot create markup', () => {
  it('both Index copies wire the time label and the free slot body', () => {
    for (const p of ['gas-app/Index.html', 'index.html']) {
      const src = read(p);
      assert.match(src, /<time class="schedule-time"[^>]*@click="openCreateEventModal\(slot\.timeKey\)"/, p);
      assert.match(src, /class="schedule-content"[^>]*@click="slot\.events\.length === 0 && openCreateEventModal\(slot\.timeKey\)"/, p);
    }
  });
});
