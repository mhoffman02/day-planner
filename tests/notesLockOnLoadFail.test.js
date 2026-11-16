/**
 * @file notesLockOnLoadFail.test.js
 * @description When the server could not read a day's notes (getDailyData sets noteLoadFailed), the
 * client locks that day's notes: no save can reach saveDailyDocCards, the cache keeps any good
 * note, and a later successful load unlocks. Runs against both client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const failedDay = (d) => ({ date: d, tasks: [], calendarEvents: [], docUrl: '', noteContent: '', noteLoadFailed: true, warnings: ['Docs 503'] });
const okDay = (d, note) => ({ date: d, tasks: [], calendarEvents: [], docUrl: '', noteContent: note, warnings: [] });

const clients = await bothClients();

for (const c of clients) {
  describe(`notes lock on load failure [${c.label}]`, () => {
    // Each test uses its own date: the memory cache is shared across tests of a client.
    function vmWith(date, getDailyData, calls, cached) {
      if (cached) c.cache.setCached(date, cached, { synced: true });
      return makeVm(c.factory, {
        selectedDate: date, selectedYear: 2026, selectedMonth: 11,
        dailyTasks: [], calendarEvents: [], dailyNote: '',
        bridge: { getDailyData, getDayDocLink: async () => ({ url: '' }), saveDailyDocCards: async (...a) => { calls.push(a); return { success: true }; } }
      });
    }

    it('a failed notes load locks the date and a save never calls saveDailyDocCards', async () => {
      const D = '2026-11-01';
      const calls = [];
      const vm = vmWith(D, async () => failedDay(D), calls);
      await captureConsoleError(async () => {
        await vm.loadDayData();
        assert.equal(vm.notesLocked, true);
        vm.dailyNote = 'typed';
        vm.scheduleDailyNoteSave();
        assert.throws(() => vm.saveDailyNote(D, 'typed'), /could not load/i);
        await settle();
      });
      assert.equal(calls.length, 0, 'saveDailyDocCards must not be called while locked');
    });

    it('logs a console.error with context when a locked save is refused', async () => {
      const D = '2026-11-02';
      const vm = vmWith(D, async () => failedDay(D), []);
      const logs = await captureConsoleError(async () => {
        await vm.loadDayData();
        vm.scheduleDailyNoteSave();
        assert.throws(() => vm.saveDailyNote(D, 'x'));
      });
      assert.ok(logs.some((l) => /locked/i.test(l)), logs.join('\n'));
    });

    it('keeps a cached good note (read-only) and never overwrites it with empty text', async () => {
      const D = '2026-11-03';
      const good = { tasks: [], calendarEvents: [], docUrl: '', noteContent: 'good note' };
      const vm = vmWith(D, async () => failedDay(D), [], good);
      await vm.loadDayData();
      assert.equal(c.cache.getCached(D).noteContent, 'good note');
      assert.equal(vm.dailyNote, 'good note');
      assert.equal(vm.notesLocked, true);
    });

    it('does not cache the failed (empty) note or record a synced baseline', async () => {
      const D = '2026-11-04';
      const vm = vmWith(D, async () => failedDay(D), []);
      await vm.loadDayData();
      assert.ok(!c.cache.getCached(D), 'no cache entry written for the failed load');
      assert.ok(!(D in vm.savedNoteByDate), 'no synced baseline recorded');
    });

    it('a later successful load clears the lock and saves work again', async () => {
      const D = '2026-11-05';
      const calls = [];
      let fail = true;
      const vm = vmWith(D, async () => (fail ? failedDay(D) : okDay(D, 'real')), calls);
      await vm.loadDayData();
      assert.equal(vm.notesLocked, true);
      fail = false;
      await vm.loadDayData();
      assert.equal(vm.notesLocked, false);
      assert.equal(vm.dailyNote, 'real');
      vm.saveDailyNote(D, 'real+');
      await settle();
      assert.equal(calls.length, 1);
    });
  });
}
