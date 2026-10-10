/**
 * @file failClosedSaves.test.js
 * @description Fail-closed save/load behavior of the plannerApp component, run against BOTH
 * client copies (src/app.js and gas-app/Script.html) via tests/helpers/plannerHarness.js so a
 * fix landing in only one file fails here. Contract under test: when a write to Google
 * (Tasks/Drive/Calendar) fails, is missing, or returns "not found", the UI and every cache roll
 * back to the last saved state, the stack goes to console.error, and the user sees err.message
 * in the dismissible error banner. Unsaved data is never shown or cached as saved.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const DATE = '2026-10-09';

function boom(msg) {
  return async () => { throw new Error(msg); };
}

function dailyVm(c, { tasks = [], master = [], bridge = {}, note = '' } = {}) {
  const vm = makeVm(c.factory, {
    selectedDate: DATE,
    selectedYear: 2026,
    selectedMonth: 10,
    dailyTasks: tasks,
    masterTasks: master,
    calendarEvents: [],
    dailyNote: note,
    bridge
  });
  c.cache.setCached(DATE, { tasks: tasks.map((t) => ({ ...t })), calendarEvents: [], noteContent: note, docUrl: '' });
  c.cache.setCachedMasterTasks(master.map((t) => ({ ...t })));
  return vm;
}

const clients = await bothClients();

for (const c of clients) {
  describe(`fail-closed saves [${c.label}]`, () => {

    it('trigger2WaySync does not wipe an error banner set by the failed save before it', async () => {
      const vm = dailyVm(c);
      vm.errorMessage = 'Could not save task status: quota';
      await vm.trigger2WaySync();
      assert.equal(vm.errorMessage, 'Could not save task status: quota');
    });

    describe('setTaskStatus', () => {
      it('rolls back the task, its linked master, and both caches when the Tasks write rejects', async () => {
        const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
        const linked = { id: 'm1', title: '[A1] Call vendor', status: '•', movedTaskId: 't1' };
        const vm = dailyVm(c, { tasks: [task], master: [linked], bridge: { updateDailyTask: boom('Tasks API 503') } });
        const logs = await captureConsoleError(async () => {
          await vm.setTaskStatus(task, '✓');
          await settle();
        });
        assert.equal(task.status, '•');
        assert.equal(linked.status, '•');
        assert.equal(c.cache.getCached(DATE).tasks[0].status, '•');
        assert.equal(c.cache.getCachedMasterTasks().tasks[0].status, '•');
        assert.match(vm.errorMessage || '', /Tasks API 503/);
        assert.ok(logs.some((l) => l.includes('Tasks API 503') && l.includes('at ')), 'stack logged');
      });

      it('treats a null result (task deleted in Google Tasks) as a failed save', async () => {
        const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
        const vm = dailyVm(c, { tasks: [task], bridge: { updateDailyTask: async () => null } });
        await captureConsoleError(async () => { await vm.setTaskStatus(task, '✓'); await settle(); });
        assert.equal(task.status, '•');
        assert.equal(c.cache.getCached(DATE).tasks[0].status, '•');
        assert.match(vm.errorMessage || '', /not saved|no longer exists/i);
      });

      it('treats a missing bridge method as an error, not a silent success', async () => {
        const mTask = { id: 'm1', title: '[B1] Plan retreat', status: '•' };
        const vm = dailyVm(c, { master: [mTask], bridge: {} });
        await captureConsoleError(async () => { await vm.setTaskStatus(mTask, '✓'); await settle(); });
        assert.equal(mTask.status, '•');
        assert.equal(c.cache.getCachedMasterTasks().tasks[0].status, '•');
        assert.match(vm.errorMessage || '', /unavailable/i);
      });

      it('rolls back a forward (→) when forwardDailyTask fails instead of caching → as saved', async () => {
        const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
        const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: boom('forward failed: 500') } });
        await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
        assert.equal(task.status, '•');
        assert.equal(c.cache.getCached(DATE).tasks[0].status, '•');
        assert.match(vm.errorMessage || '', /forward failed: 500/);
        assert.equal(vm.taskToast, null, 'no "Forwarded" success toast');
      });

      it('rolls back a forward when the server returns no forwarded task', async () => {
        const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
        const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: async () => null } });
        await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
        assert.equal(task.status, '•');
        assert.equal(vm.taskToast, null);
        assert.match(vm.errorMessage || '', /not saved|not forwarded/i);
      });

      it('does not clobber a newer status set while the failed write was in flight', async () => {
        const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
        let rejectFirst;
        const bridge = {
          updateDailyTask: (d, id, u) => (u.status === '✓'
            ? new Promise((resolve, reject) => { rejectFirst = reject; })
            : Promise.resolve({ id, status: u.status }))
        };
        const vm = dailyVm(c, { tasks: [task], bridge });
        await captureConsoleError(async () => {
          const first = vm.setTaskStatus(task, '✓');
          await settle(2);
          await vm.setTaskStatus(task, 'X');
          rejectFirst(new Error('late failure'));
          await first;
          await settle();
        });
        assert.equal(task.status, 'X');
      });
    });

    describe('daily note save', () => {
      it('rolls the cache back to the last saved note when saveDailyDocCards fails, keeping the editor text', async () => {
        const vm = dailyVm(c, {
          bridge: {
            getDailyData: async () => ({ tasks: [], calendarEvents: [], noteContent: 'saved v1', docUrl: '' }),
            saveDailyDocCards: boom('Drive quota exceeded')
          }
        });
        await vm.loadDayData();
        vm.dailyNote = 'typed v2 (unsaved)';
        const logs = await captureConsoleError(async () => {
          vm.scheduleDailyNoteSave();
          await settle();
        });
        assert.equal(c.cache.getCached(DATE).noteContent, 'saved v1');
        assert.equal(vm.dailyNote, 'typed v2 (unsaved)');
        assert.match(vm.errorMessage || '', /Drive quota exceeded/);
        assert.ok(logs.some((l) => l.includes('Drive quota exceeded') && l.includes('at ')));
      });

      it('treats a resolved {success:false} from saveDailyDocCards (Code.gs catch path) as a failed save', async () => {
        const vm = dailyVm(c, {
          bridge: {
            getDailyData: async () => ({ tasks: [], calendarEvents: [], noteContent: 'saved v1', docUrl: '' }),
            saveDailyDocCards: async () => ({ success: false, error: 'Root folder not configured.' })
          }
        });
        await vm.loadDayData();
        vm.dailyNote = 'typed v2 (unsaved)';
        await captureConsoleError(async () => { vm.scheduleDailyNoteSave(); await settle(); });
        assert.equal(c.cache.getCached(DATE).noteContent, 'saved v1');
        assert.match(vm.errorMessage || '', /Root folder not configured/);
        assert.equal(c.cache.getNoteRevisions(DATE).some((r) => r.noteContent === 'typed v2 (unsaved)'), false,
          'no Time Machine snapshot recorded for a save that did not land');
      });

      it('treats a missing saveDailyDocCards bridge method as a failed save', async () => {
        const vm = dailyVm(c, {
          bridge: { getDailyData: async () => ({ tasks: [], calendarEvents: [], noteContent: 'saved v1', docUrl: '' }) }
        });
        await vm.loadDayData();
        vm.dailyNote = 'typed v2 (unsaved)';
        await captureConsoleError(async () => { vm.scheduleDailyNoteSave(); await settle(); });
        assert.equal(c.cache.getCached(DATE).noteContent, 'saved v1');
        assert.match(vm.errorMessage || '', /unavailable/i);
      });

      it('commits the saved text to the cache once saveDailyDocCards succeeds', async () => {
        const vm = dailyVm(c, {
          bridge: {
            getDailyData: async () => ({ tasks: [], calendarEvents: [], noteContent: 'saved v1', docUrl: '' }),
            saveDailyDocCards: async () => ({ success: true, docName: 'Day Planner Notes - October 2026' })
          }
        });
        await vm.loadDayData();
        vm.dailyNote = 'v2';
        vm.scheduleDailyNoteSave();
        await settle();
        assert.equal(c.cache.getCached(DATE).noteContent, 'v2');
        assert.equal(vm.errorMessage, null);
      });
    });

    describe('deletes', () => {
      it('deleteDailyTask re-inserts the task in place (UI + cache) when the delete fails', async () => {
        const tasks = [{ id: 't1', title: 'a', status: '•' }, { id: 't2', title: 'b', status: '•' }];
        const vm = dailyVm(c, { tasks, bridge: { deleteDailyTask: boom('delete 403') } });
        await captureConsoleError(async () => { await vm.deleteDailyTask(tasks[0]); await settle(); });
        assert.deepEqual(vm.dailyTasks.map((t) => t.id), ['t1', 't2']);
        assert.deepEqual(c.cache.getCached(DATE).tasks.map((t) => t.id), ['t1', 't2']);
        assert.match(vm.errorMessage || '', /delete 403/);
      });

      it('deleteDailyTask with no bridge method keeps the task and reports an error', async () => {
        const tasks = [{ id: 't1', title: 'a', status: '•' }];
        const vm = dailyVm(c, { tasks, bridge: {} });
        await captureConsoleError(async () => { await vm.deleteDailyTask(tasks[0]); await settle(); });
        assert.deepEqual(vm.dailyTasks.map((t) => t.id), ['t1']);
        assert.match(vm.errorMessage || '', /unavailable/i);
      });

      it('deleteMasterTask re-inserts the task in place (UI + cache) when the delete fails', async () => {
        const master = [{ id: 'm1', title: 'a', status: '•' }, { id: 'm2', title: 'b', status: '•' }];
        const vm = dailyVm(c, { master, bridge: { deleteMasterTask: boom('delete 500') } });
        await captureConsoleError(async () => { await vm.deleteMasterTask(master[1]); await settle(); });
        assert.deepEqual(vm.masterTasks.map((t) => t.id), ['m1', 'm2']);
        assert.deepEqual(c.cache.getCachedMasterTasks().tasks.map((t) => t.id), ['m1', 'm2']);
        assert.match(vm.errorMessage || '', /delete 500/);
      });
    });

    describe('updateTaskTitle', () => {
      it('reverts and reports when no bridge update method exists', async () => {
        const task = { id: 't1', title: '[A1] Old', status: '•', notes: '' };
        const vm = dailyVm(c, { tasks: [task], bridge: {} });
        vm.editingTaskId = 't1';
        await captureConsoleError(async () => { await vm.updateTaskTitle('t1', 'New'); await settle(); });
        assert.equal(task.title, '[A1] Old');
        assert.equal(c.cache.getCached(DATE).tasks[0].title, '[A1] Old');
        assert.match(vm.errorMessage || '', /unavailable/i);
      });

      it('reverts and reports when the server says the task no longer exists (null)', async () => {
        const task = { id: 't1', title: '[A1] Old', status: '•', notes: '' };
        const vm = dailyVm(c, { tasks: [task], bridge: { updateDailyTask: async () => null } });
        vm.editingTaskId = 't1';
        await captureConsoleError(async () => { await vm.updateTaskTitle('t1', 'New'); await settle(); });
        assert.equal(task.title, '[A1] Old');
        assert.match(vm.errorMessage || '', /not saved|no longer exists/i);
      });

      it('also reverts the linked daily copy when a master title save fails', async () => {
        const daily = { id: 't9', title: '[A1] Old', status: '•', notes: '' };
        const mTask = { id: 'm1', title: '[A1] Old', status: '•', notes: '', movedTaskId: 't9' };
        const vm = dailyVm(c, { tasks: [daily], master: [mTask], bridge: { updateMasterTask: boom('patch 500') } });
        vm.editingTaskId = 'm1';
        await captureConsoleError(async () => { await vm.updateTaskTitle('m1', 'New'); await settle(); });
        assert.equal(mTask.title, '[A1] Old');
        assert.equal(daily.title, '[A1] Old');
        assert.equal(c.cache.getCached(DATE).tasks[0].title, '[A1] Old');
      });
    });

    describe('toggleTaskStar', () => {
      it('shows an error (not a silent revert) when the save rejects', async () => {
        const task = { id: 't1', title: 'a', status: '•', starred: false };
        const vm = dailyVm(c, { tasks: [task], bridge: { updateDailyTask: boom('star 503') } });
        await captureConsoleError(async () => { await vm.toggleTaskStar(task); await settle(); });
        assert.equal(task.starred, false);
        assert.match(vm.errorMessage || '', /star 503/);
      });

      it('shows an error when the server returns null (task gone)', async () => {
        const task = { id: 't1', title: 'a', status: '•', starred: false };
        const vm = dailyVm(c, { tasks: [task], bridge: { updateDailyTask: async () => null } });
        await captureConsoleError(async () => { await vm.toggleTaskStar(task); await settle(); });
        assert.equal(task.starred, false);
        assert.match(vm.errorMessage || '', /not saved|no longer exists/i);
      });
    });

    describe('saveNewEvent', () => {
      it('never shows an appointment that was not written to Google Calendar', async () => {
        const vm = dailyVm(c);
        vm.createEventModalOpen = true;
        vm.newEventData = { title: 'Dentist', startTime: '09:00', endTime: '10:00', location: '', description: '' };
        await vm.saveNewEvent();
        await settle();
        assert.equal(vm.calendarEvents.length, 0);
        assert.equal(vm.createEventModalOpen, true, 'modal stays open so the input is not lost');
        assert.equal(vm.newEventData.title, 'Dentist');
        assert.match(vm.createEventError || '', /not saved/i, 'error visible inside the open modal');
      });
    });

    describe('Future Planning item status', () => {
      function futureVm(bridge) {
        const item = { id: 'f1', title: 'Offsite', status: '•' };
        const vm = makeVm(c.factory, {
          futureMatrixYear: 2026,
          futureMatrix: { year: 2026, months: { '2026-11': [item] } },
          futureMatrixEditSeq: {},
          bridge
        });
        c.cache.setCachedFutureMatrix(2026, { year: 2026, months: { '2026-11': [{ ...item }] } });
        return { vm, item };
      }

      it('toggleFutureItemStatus reverts the item when the save fails', async () => {
        const { vm, item } = futureVm({ updateFutureItemStatus: boom('future 500') });
        await captureConsoleError(async () => { await vm.toggleFutureItemStatus('11', item); });
        assert.equal(item.status, '•');
        assert.equal(c.cache.getCachedFutureMatrix(2026).months['2026-11'][0].status, '•');
        assert.match(vm.errorMessage || '', /future 500/);
      });

      it('toggleFutureItemStatus treats a null result (item not found) as a failed save', async () => {
        const { vm, item } = futureVm({ updateFutureItemStatus: async () => null });
        await captureConsoleError(async () => { await vm.toggleFutureItemStatus('11', item); });
        assert.equal(item.status, '•');
        assert.match(vm.errorMessage || '', /not saved|no longer exists/i);
      });

      it('selectFutureItemStatus reverts the item when the save fails', async () => {
        const { vm, item } = futureVm({ updateFutureItemStatus: boom('future 502') });
        await captureConsoleError(async () => { await vm.selectFutureItemStatus('11', item, '✓'); });
        assert.equal(item.status, '•');
        assert.match(vm.errorMessage || '', /future 502/);
      });
    });

    describe('stale cache loads show an offline/stale indicator', () => {
      it('loadMasterTasks: cached list shown with "last synced" notice when refresh fails, cleared on next success', async () => {
        let fail = false;
        const vm = dailyVm(c, {
          bridge: { getMasterTasks: async () => { if (fail) throw new Error('offline'); return [{ id: 'm1', title: 'a', status: '•' }]; } }
        });
        await vm.loadMasterTasks();
        fail = true;
        await captureConsoleError(async () => { await vm.loadMasterTasks(); });
        assert.deepEqual(vm.masterTasks.map((t) => t.id), ['m1']);
        assert.match(vm.errorMessage || '', /Master Tasks/);
        assert.match(vm.errorMessage || '', /last synced [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M\)/);
        assert.match(vm.errorMessage || '', /offline/);
        fail = false;
        await vm.loadMasterTasks();
        assert.equal(vm.errorMessage, null, 'stale notice cleared after a successful refresh');
      });

      it('a stale notice never replaces an unsaved-note warning already in the banner', async () => {
        let offline = false;
        const vm = dailyVm(c, {
          bridge: {
            getDailyData: async () => ({ tasks: [], calendarEvents: [], noteContent: 'saved v1', docUrl: '' }),
            saveDailyDocCards: boom('offline'),
            getMasterTasks: async () => { if (offline) throw new Error('offline'); return []; }
          }
        });
        await vm.loadDayData();
        await vm.loadMasterTasks();
        offline = true;
        vm.dailyNote = 'typed while offline';
        await captureConsoleError(async () => {
          vm.scheduleDailyNoteSave();
          await settle();
          await vm.loadMasterTasks();
        });
        assert.match(vm.errorMessage || '', /NOT saved/);
      });

      it('loadDayData: cached day shown with a stale notice when refresh fails', async () => {
        let fail = false;
        const vm = dailyVm(c, {
          bridge: { getDailyData: async () => { if (fail) throw new Error('network down'); return { tasks: [], calendarEvents: [], noteContent: 'n', docUrl: '' }; } }
        });
        await vm.loadDayData();
        fail = true;
        await captureConsoleError(async () => { await vm.loadDayData(); });
        assert.equal(vm.dailyNote, 'n');
        assert.match(vm.errorMessage || '', /last synced [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M\)/);
        assert.match(vm.errorMessage || '', /network down/);
      });

      it('loadFutureMatrix: cached matrix shown with a stale notice when refresh fails', async () => {
        let fail = false;
        const vm = makeVm(c.factory, {
          futureMatrixYear: 2026,
          futureMatrixEditSeq: {},
          bridge: { getFutureMatrix: async () => { if (fail) throw new Error('timeout'); return { year: 2026, months: { '2026-11': [] } }; } }
        });
        await vm.loadFutureMatrix();
        fail = true;
        await captureConsoleError(async () => { await vm.loadFutureMatrix(); });
        assert.match(vm.errorMessage || '', /Future Planning/);
        assert.match(vm.errorMessage || '', /last synced [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M\)/);
      });
    });

    describe('read failures are visible, not empty results', () => {
      it('loadMonthlyCalendarData failure tells the user the month is incomplete', async () => {
        const vm = dailyVm(c, { bridge: { useMock: false, getDailyDataRange: boom('range 500') } });
        vm.activeView = 'monthly-calendar';
        await captureConsoleError(async () => { await vm.loadMonthlyCalendarData(); });
        assert.match(vm.errorMessage || '', /range 500/);
      });

      it('runArchiveSearch failure sets a visible archive error instead of looking like no matches', async () => {
        const vm = dailyVm(c, { bridge: { searchArchiveNotes: boom('archive 500') } });
        vm.searchQuery = 'budget';
        await captureConsoleError(async () => { await vm.runArchiveSearch('budget'); });
        assert.match(vm.archiveSearchError || '', /archive 500/);
      });

      it('runArchiveSearch surfaces a partial (incomplete) archive result instead of presenting it as complete', async () => {
        const vm = dailyVm(c, {
          bridge: {
            searchArchiveNotes: async () => [{
              date: '2026-07-20', snippet: 'budget talk', title: 'Archive', partial: true,
              archiveError: 'Archive search incomplete: 2 of 5 monthly docs could not be read'
            }]
          }
        });
        vm.searchQuery = 'budget';
        await vm.runArchiveSearch('budget');
        assert.equal(vm.searchResults.archive.length, 1, 'partial results still shown');
        assert.match(vm.archiveSearchWarning || '', /Archive search incomplete: 2 of 5/);
        assert.equal(vm.archiveSearchError || null, null);
      });

      it('runArchiveSearch clears a stale incomplete/error notice when a later search is clean', async () => {
        const vm = dailyVm(c, { bridge: { searchArchiveNotes: async () => [] } });
        vm.searchQuery = 'budget';
        vm.archiveSearchWarning = 'Archive search incomplete: old';
        vm.archiveSearchError = 'Archive search failed: old';
        await vm.runArchiveSearch('budget');
        assert.equal(vm.archiveSearchWarning || null, null);
        assert.equal(vm.archiveSearchError || null, null);
      });

      it('pullFromDictationScratchpad warns when the scratch doc could not be cleared', async () => {
        const field = {
          value: '', selectionStart: 0, selectionEnd: 0,
          dispatchEvent: () => {}, focus: () => {}, setSelectionRange: () => {}
        };
        const vm = dailyVm(c, {
          bridge: {
            createDictationScratchDoc: async () => ({ success: true, docId: 'doc1', docUrl: 'u' }),
            pullDictationScratchText: async () => ({ success: true, text: 'hello world', cleared: false, clearError: 'Docs API 429 rate limited' })
          }
        });
        await vm.ensureDictationScratchDoc(field);
        await captureConsoleError(async () => { await vm.pullFromDictationScratchpad(); });
        assert.equal(field.value, 'hello world', 'pulled text still inserted');
        assert.match(vm.sttError || '', /Docs API 429 rate limited/);
      });

      it('openTimeMachine failure sets a visible error instead of looking like no snapshots', async () => {
        const vm = dailyVm(c);
        vm.selectedDate = '2031-01-01'; // a date with no revisions recorded by earlier tests
        vm.dailyNote = { trim() { throw new Error('revision store broken'); } };
        await captureConsoleError(async () => { await vm.openTimeMachine(); });
        assert.match(vm.timeMachineError || '', /revision store broken/);
      });
    });
  });
}
