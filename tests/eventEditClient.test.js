/**
 * @file eventEditClient.test.js
 * @description User 2026-11-06: edit and delete appointments from the planner. Edit reuses the create modal
 * (prefilled), saves through updateCalendarEvent with the etag, scope and notify choice, and keeps the modal
 * open with the error on failure. Delete hides the event at once, shows an Undo toast, and sends
 * deleteCalendarEvent only after the Undo window; Undo cancels it. Runs against BOTH client copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const DATE = '2031-03-12';
const NEXT = '2031-03-13';
const evtOf = (over = {}) => ({
  id: 'e1', title: 'Budget review', startTime: `${DATE}T09:00:00-06:00`, endTime: `${DATE}T09:30:00-06:00`,
  location: 'Room 4', description: 'Agenda', etag: '"1"', recurringEventId: null, guestCount: 0, canEdit: true, canDelete: true, ...over
});

const clients = await bothClients();

for (const c of clients) {
  describe(`appointment edit and delete [${c.label}]`, () => {
    const vmWith = (evt, bridge = {}) => {
      c.cache.setCached(DATE, { tasks: [], calendarEvents: [{ ...evt }], noteContent: '', docUrl: '' });
      return makeVm(c.factory, { selectedDate: DATE, calendarEvents: [evt], dailyTasks: [], masterTasks: [], bridge });
    };

    it('openEditEventModal prefills the create modal from the event and switches it to edit mode', () => {
      const evt = evtOf();
      const vm = vmWith(evt);
      vm.openEventModal(evt);
      vm.openEditEventModal(evt);
      assert.equal(vm.eventModalOpen, false);
      assert.equal(vm.createEventModalOpen, true);
      assert.equal(vm.editingEvent.id, 'e1');
      assert.deepEqual(
        { t: vm.newEventData.title, s: vm.newEventData.startTime, e: vm.newEventData.endTime, d: vm.newEventData.dateStr, l: vm.newEventData.location, n: vm.newEventData.description },
        { t: 'Budget review', s: '09:00', e: '09:30', d: DATE, l: 'Room 4', n: 'Agenda' }
      );
    });

    it('openEditEventModal does nothing for an event I cannot edit', () => {
      const evt = evtOf({ canEdit: false });
      const vm = vmWith(evt);
      vm.openEditEventModal(evt);
      assert.equal(vm.createEventModalOpen, false);
    });

    it('openCreateEventModal leaves edit mode', () => {
      const evt = evtOf();
      const vm = vmWith(evt);
      vm.openEditEventModal(evt);
      vm.openCreateEventModal();
      assert.equal(vm.editingEvent, null);
    });

    it('save sends payload, scope, notify and etag, then shows the saved event', async () => {
      const calls = [];
      const evt = evtOf({ guestCount: 2 });
      const vm = vmWith(evt, { updateCalendarEvent: async (id, p, o) => { calls.push([id, p, o]); return evtOf({ title: p.title, etag: '"2"', endTime: `${DATE}T10:00:00-06:00` }); } });
      vm.openEditEventModal(evt);
      vm.newEventData.title = 'Budget review v2';
      vm.newEventData.endTime = '10:00';
      vm.eventNotify = true;
      await vm.submitEventForm();
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0][1], { title: 'Budget review v2', dateStr: DATE, startTime: '09:00', endTime: '10:00', description: 'Agenda', location: 'Room 4' });
      assert.deepEqual(calls[0][2], { scope: 'this', notify: true, etag: '"1"' });
      assert.equal(vm.createEventModalOpen, false);
      assert.equal(vm.calendarEvents.length, 1);
      assert.equal(vm.calendarEvents[0].title, 'Budget review v2');
      assert.equal(vm.calendarEvents[0].etag, '"2"');
    });

    it('moving to another day takes it off this day and puts it in the other day cache', async () => {
      const evt = evtOf();
      const vm = vmWith(evt, { updateCalendarEvent: async () => evtOf({ startTime: `${NEXT}T09:00:00-06:00`, endTime: `${NEXT}T09:30:00-06:00` }) });
      c.cache.setCached(NEXT, { tasks: [], calendarEvents: [], noteContent: '', docUrl: '' });
      vm.openEditEventModal(evt);
      vm.newEventData.dateStr = NEXT;
      await vm.submitEventForm();
      assert.equal(vm.calendarEvents.length, 0);
      assert.equal(c.cache.getCached(DATE).calendarEvents.length, 0);
      assert.equal(c.cache.getCached(NEXT).calendarEvents.length, 1);
    });

    it('a failed save keeps the modal open with the input and shows the error', async () => {
      const evt = evtOf();
      const vm = vmWith(evt, { updateCalendarEvent: async () => { throw new Error('This event changed in Google Calendar after you opened it.'); } });
      vm.openEditEventModal(evt);
      vm.newEventData.title = 'Changed';
      await captureConsoleError(() => vm.submitEventForm());
      assert.equal(vm.createEventModalOpen, true);
      assert.equal(vm.newEventData.title, 'Changed');
      assert.match(vm.createEventError, /changed in Google Calendar/);
      assert.equal(vm.calendarEvents[0].title, 'Budget review');
    });

    it('delete hides the event at once and only calls the server after the undo window', async () => {
      const calls = [];
      const evt = evtOf();
      const vm = vmWith(evt, { deleteCalendarEvent: async (id, o) => { calls.push([id, o]); return { id, deleted: true, scope: 'this' }; } });
      vm.requestDeleteEvent(evt);
      assert.equal(vm.calendarEvents.length, 0);
      assert.equal(c.cache.getCached(DATE).calendarEvents.length, 0);
      assert.equal(vm.taskToastUndo.kind, 'eventDelete');
      assert.equal(calls.length, 0);
      await settle();
      assert.deepEqual(calls, [['e1', { scope: 'this', notify: false }]]);
    });

    it('Undo before the window ends brings the event back and sends nothing', async () => {
      const calls = [];
      const evt = evtOf();
      const vm = vmWith(evt, { deleteCalendarEvent: async (id) => { calls.push(id); return {}; } });
      vm.requestDeleteEvent(evt);
      vm.runToastUndo(vm.taskToastUndo);
      assert.equal(vm.calendarEvents.length, 1);
      assert.equal(c.cache.getCached(DATE).calendarEvents.length, 1);
      assert.equal(vm.taskToast, null);
      await settle();
      assert.equal(calls.length, 0);
    });

    it('a failed delete puts the event back and reports it', async () => {
      const evt = evtOf();
      const vm = vmWith(evt, { deleteCalendarEvent: async () => { throw new Error('boom'); } });
      await captureConsoleError(async () => { vm.requestDeleteEvent(evt); await settle(); });
      assert.equal(vm.calendarEvents.length, 1);
      assert.ok(vm.errorTray.some((e) => /not deleted/i.test(e.message || e.text || JSON.stringify(e))));
    });

    it('a recurring event or one with guests asks first; nothing is hidden until confirmed', async () => {
      const calls = [];
      const evt = evtOf({ recurringEventId: 'm1', guestCount: 2 });
      const vm = vmWith(evt, { deleteCalendarEvent: async (id, o) => { calls.push([id, o]); return {}; } });
      vm.openEventModal(evt);
      vm.requestDeleteEvent(evt);
      assert.equal(vm.deletePromptOpen, true);
      assert.equal(vm.calendarEvents.length, 1);
      vm.eventScope = 'all';
      vm.eventNotify = true;
      vm.confirmDeleteEvent();
      assert.equal(vm.deletePromptOpen, false);
      assert.equal(vm.calendarEvents.length, 0);
      await settle();
      assert.deepEqual(calls, [['e1', { scope: 'all', notify: true }]]);
    });

    it('delete does nothing for an event I cannot delete', () => {
      const evt = evtOf({ canDelete: false });
      const vm = vmWith(evt);
      vm.requestDeleteEvent(evt);
      assert.equal(vm.calendarEvents.length, 1);
      assert.equal(vm.taskToast, null);
    });
  });
}

test('both Index copies wire Edit, Delete, the form dispatcher and the toast undo', () => {
  for (const f of ['gas-app/Index.html', 'index.html']) {
    const html = read(f);
    for (const needle of ['openEditEventModal(selectedEvent)', 'requestDeleteEvent(selectedEvent)', 'submitEventForm()', 'runToastUndo(taskToastUndo)', 'confirmDeleteEvent()']) {
      assert.ok(html.includes(needle), `${f} lacks ${needle}`);
    }
  }
});
