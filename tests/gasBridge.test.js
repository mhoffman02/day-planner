/**
 * @file gasBridge.test.js
 * @description Unit tests for GASBridge client API wrapper and mock data handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GASBridge } from '../src/gasBridge.js';

describe('GAS Bridge Unit Tests', () => {
  it('should fetch daily mock data correctly', async () => {
    const bridge = new GASBridge(true);
    const data = await bridge.getDailyData('2026-08-15');
    assert.equal(data.date, '2026-08-15');
    assert.equal(data.tasks.length, 4);
    assert.equal(data.calendarEvents.length, 3);
    assert.ok(data.noteContent.includes('Executive briefing'));
  });

  it('should fetch unified master tasks clearinghouse (undated + incomplete dated, excluding completed dated)', async () => {
    const bridge = new GASBridge(true);
    const masterTasks = await bridge.getMasterTasks('August 2026');
    assert.equal(masterTasks.length, 7);
    assert.ok(masterTasks.some(m => m.id === 'm1' && m.dueDate === null));
    assert.ok(masterTasks.some(m => m.id === 't2' && m.dueDate === '2026-08-15'));
    assert.ok(!masterTasks.some(m => m.id === 't1'));
  });

  it('should deduplicate and collapse moved master tasks in clearinghouse', async () => {
    const bridge = new GASBridge(true);
    const transferred = await bridge.transferMasterTask('m1', '2026-08-15', 'A');
    await bridge.markMasterTaskMoved('m1', '2026-08-15', transferred.id);

    const masterTasks = await bridge.getMasterTasks('August 2026');
    const m1Matches = masterTasks.filter(m => m.id === 'm1' || m.id === transferred.id);
    assert.equal(m1Matches.length, 1);
    assert.equal(m1Matches[0].dueDate, '2026-08-15');
    assert.equal(m1Matches[0].movedTo, '2026-08-15');
  });

  it('should add a new daily task via bridge handler', async () => {
    const bridge = new GASBridge(true);
    const newTask = await bridge.addDailyTask('2026-08-15', '[B2] Send weekly status update', 'Work');
    assert.ok(newTask.id);
    assert.equal(newTask.title, '[B2] Send weekly status update');

    const updatedData = await bridge.getDailyData('2026-08-15');
    assert.equal(updatedData.tasks.length, 5);
  });

  it('should transfer master task to daily task via bridge', async () => {
    const bridge = new GASBridge(true);
    const transferred = await bridge.transferMasterTask('m1', '2026-08-15', 'A');
    assert.ok(transferred);
    assert.ok(transferred.title.startsWith('[A3]'));
    assert.equal(transferred.category, 'Work');
  });

  it('should update daily task status, star, notes, and title via bridge', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateDailyTask('2026-08-15', 't1', {
      title: '[A1] Updated task title',
      status: 'X',
      starred: true,
      notes: 'Postponed pending review'
    });
    assert.ok(updated);
    assert.equal(updated.title, '[A1] Updated task title');
    assert.equal(updated.status, 'X');
    assert.equal(updated.starred, true);
    assert.equal(updated.notes, 'Postponed pending review');

    const nonExistent = await bridge.updateDailyTask('2026-08-15', 't_missing', { status: '✓' });
    assert.equal(nonExistent, null);
  });

  it('should delete daily task entirely via bridge', async () => {
    const bridge = new GASBridge(true);
    const initialData = await bridge.getDailyData('2026-08-15');
    const initialCount = initialData.tasks.length;
    const taskToDelete = initialData.tasks[0];

    const result = await bridge.deleteDailyTask('2026-08-15', taskToDelete.id);
    assert.equal(result, true);

    const afterData = await bridge.getDailyData('2026-08-15');
    assert.equal(afterData.tasks.length, initialCount - 1);
    assert.equal(afterData.tasks.some(t => t.id === taskToDelete.id), false);
  });

  it('should mirror daily task status change to source master task via bridge', async () => {
    const bridge = new GASBridge(true);
    const transferred = await bridge.transferMasterTask('m2', '2026-08-15', 'A');
    assert.ok(transferred);

    await bridge.updateDailyTask('2026-08-15', transferred.id, { status: '✓' });
    const masterTasks = await bridge.getMasterTasks('August 2026');
    const master = masterTasks.find(m => m.id === 'm2');
    assert.equal(master.status, '✓');
  });

  it('should save daily doc cards content via bridge', async () => {
    const bridge = new GASBridge(true);
    const result = await bridge.saveDailyDocCards('2026-08-16', '### #index [Architecture] System Design\n- Clean 3-col layout');
    assert.ok(result.success);
    assert.ok(result.docName.includes('Day Planner Notes'));
  });

  it('should resolve drive link title via bridge', async () => {
    const bridge = new GASBridge(true);
    const resDoc = await bridge.resolveLinkTitle('https://docs.google.com/document/d/doc12345/edit');
    assert.ok(resDoc.success);
    assert.equal(resDoc.title, 'Executive Briefing Doc');
    assert.equal(resDoc.fileId, 'doc12345');

    const resSheet = await bridge.resolveLinkTitle('https://docs.google.com/spreadsheets/d/sheet67890/edit');
    assert.ok(resSheet.success);
    assert.equal(resSheet.title, 'Financial Planning Spreadsheet');

    const resSlide = await bridge.resolveLinkTitle('https://docs.google.com/presentation/d/deck123/edit');
    assert.ok(resSlide.success);
    assert.equal(resSlide.title, 'Architecture Slide Deck');

    const resFolder = await bridge.resolveLinkTitle('https://drive.google.com/drive/folders/folder999');
    assert.ok(resFolder.success);
    assert.equal(resFolder.title, 'Shared Drive Folder');

    const resInvalid = await bridge.resolveLinkTitle('https://example.com/not-drive');
    assert.equal(resInvalid.success, false);

    const resEmpty = await bridge.resolveLinkTitle('');
    assert.equal(resEmpty.success, false);
  });

  it('should fetch the future planning matrix for a year with all 12 months present', async () => {
    const bridge = new GASBridge(true);
    const matrix = await bridge.getFutureMatrix(2026);
    assert.equal(matrix.year, '2026');
    assert.equal(Object.keys(matrix.months).length, 12);
    assert.equal(matrix.months['2026-09'].length, 1);
  });

  it('should add a future planning item to a month bucket via bridge', async () => {
    const bridge = new GASBridge(true);
    const item = await bridge.addFutureItem(2026, '2026-04', 'Renew business license', 'Financial');
    assert.equal(item.title, 'Renew business license');
    assert.equal(item.status, '•');
    const matrix = await bridge.getFutureMatrix(2026);
    assert.ok(matrix.months['2026-04'].some(i => i.id === item.id));
  });

  it('should cycle a future item status via bridge', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateFutureItemStatus(2026, '2026-09', 'fm_seed', 'X');
    assert.equal(updated, null);

    const matrix = await bridge.getFutureMatrix(2026);
    const seeded = matrix.months['2026-09'][0];
    const cycled = await bridge.updateFutureItemStatus(2026, '2026-09', seeded.id, '✓');
    assert.equal(cycled.status, '✓');
  });

  it('should transfer a future item onto a specific day and remove it from its month bucket', async () => {
    const bridge = new GASBridge(true);
    const matrix = await bridge.getFutureMatrix(2026);
    const item = matrix.months['2026-11'][0];

    const transferred = await bridge.transferFutureItem(2026, '2026-11', item.id, '2026-11-03', 'B');
    assert.ok(transferred.title.includes(item.title));
    assert.equal(transferred.dueDate, '2026-11-03');

    const refreshed = await bridge.getFutureMatrix(2026);
    assert.equal(refreshed.months['2026-11'].length, 0);
  });

  it('should push an open future item into next month, rolling into next year from December', async () => {
    const bridge = new GASBridge(true);
    const matrix = await bridge.getFutureMatrix(2026);
    const item = matrix.months['2026-12'][0];

    const pushed = await bridge.pushFutureItemToNextMonth(2026, '2026-12', item.id);
    assert.equal(pushed.id, item.id);

    const nextYearMatrix = await bridge.getFutureMatrix(2027);
    assert.ok(nextYearMatrix.months['2027-01'].some(i => i.id === item.id));

    const refreshed2026 = await bridge.getFutureMatrix(2026);
    assert.equal(refreshed2026.months['2026-12'].length, 0);
  });

  it('should delete a future planning item via bridge', async () => {
    const bridge = new GASBridge(true);
    const matrix = await bridge.getFutureMatrix(2026);
    const item = matrix.months['2026-09'][0];
    const deleted = await bridge.deleteFutureItem(2026, '2026-09', item.id);
    assert.equal(deleted, true);

    const refreshed = await bridge.getFutureMatrix(2026);
    assert.equal(refreshed.months['2026-09'].length, 0);
  });

  it('should add a new master task via bridge', async () => {
    const bridge = new GASBridge(true);
    const added = await bridge.addMasterTask('Conduct security audit for federal compliance', 'Security');
    assert.ok(added.id);
    assert.equal(added.title, 'Conduct security audit for federal compliance');
    assert.equal(added.category, 'Security');
    assert.equal(added.status, '•');
    assert.equal(added.movedTo, null);

    const masterTasks = await bridge.getMasterTasks('August 2026');
    assert.ok(masterTasks.some(m => m.id === added.id));
  });

  it('should add a new master task with an optional due date via bridge', async () => {
    const bridge = new GASBridge(true);
    const added = await bridge.addMasterTask('Q4 Strategy Review', 'Strategy', '2026-10-15');
    assert.ok(added.id);
    assert.equal(added.title, 'Q4 Strategy Review');
    assert.equal(added.category, 'Strategy');
    assert.equal(added.dueDate, '2026-10-15');
    assert.equal(added.status, '•');

    const masterTasks = await bridge.getMasterTasks('October 2026');
    assert.ok(masterTasks.some(m => m.id === added.id && m.dueDate === '2026-10-15'));
  });

  it('should mark a master task as moved with date and linked task ID', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.markMasterTaskMoved('m3', '2026-08-20', 't_new_123');
    assert.ok(updated);
    assert.equal(updated.movedTo, '2026-08-20');
    assert.equal(updated.movedTaskId, 't_new_123');
    assert.equal(updated.status, '→');

    const masterTasks = await bridge.getMasterTasks('August 2026');
    const m3 = masterTasks.find(m => m.id === 'm3');
    assert.equal(m3.movedTo, '2026-08-20');
    assert.equal(m3.movedTaskId, 't_new_123');
    assert.equal(m3.status, '→');
  });

  it('should transfer master task passed as an object and attach sourceMasterId', async () => {
    const bridge = new GASBridge(true);
    const mTaskObj = { id: 'm4', title: 'Migrate server infrastructure to GCP', category: 'Projects' };
    const transferred = await bridge.transferMasterTask(mTaskObj, '2026-08-15', 'B');
    assert.ok(transferred);
    assert.ok(transferred.title.startsWith('[B'));
    assert.equal(transferred.category, 'Projects');
  });

  it('should return authentic docUrl from getDailyData', async () => {
    const bridge = new GASBridge(true);
    const data = await bridge.getDailyData('2026-08-15');
    assert.ok(data.docUrl);
    assert.ok(data.docUrl.startsWith('https://docs.google.com/document/'));
  });

  it('should update master task status, category, and star via bridge', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateMasterTask('m1', { status: '✓', starred: true, category: 'Executive' });
    assert.ok(updated);
    assert.equal(updated.status, '✓');
    assert.equal(updated.starred, true);
    assert.equal(updated.category, 'Executive');

    const masterTasks = await bridge.getMasterTasks('August 2026');
    const m1 = masterTasks.find(m => m.id === 'm1');
    assert.equal(m1.status, '✓');
    assert.equal(m1.starred, true);
    assert.equal(m1.category, 'Executive');
  });

  it('should delete master task entirely via bridge', async () => {
    const bridge = new GASBridge(true);
    const deleted = await bridge.deleteMasterTask('m2');
    assert.equal(deleted, true);

    const masterTasks = await bridge.getMasterTasks('August 2026');
    assert.ok(!masterTasks.some(m => m.id === 'm2'));
  });

  it('should retrieve web app URL via bridge', async () => {
    const bridge = new GASBridge(true);
    const url = await bridge.getWebAppUrl();
    assert.ok(url);
    assert.ok(url.includes('/exec'));
  });

  describe('Hub RPC mocks', () => {
    const QUEUES = ['directAction', 'meetingCarryIns', 'systemExceptions', 'fyiReading'];

    it('getHubStatus returns flags, dryRun, lastRun, counts', async () => {
      const st = await new GASBridge(true).getHubStatus();
      assert.equal(typeof st.flags, 'object');
      assert.equal(typeof st.dryRun, 'boolean');
      assert.ok('lastRun' in st);
      assert.equal(typeof st.counts, 'object');
    });

    it('getTriageBoard returns four populated queues with contract item fields', async () => {
      const board = await new GASBridge(true).getTriageBoard({});
      QUEUES.forEach((q) => {
        assert.ok(Array.isArray(board.queues[q]) && board.queues[q].length > 0, q);
        const it0 = board.queues[q][0];
        ['threadId', 'subject', 'fromName', 'date', 'score', 'signals', 'labels', 'suggestions', 'url'].forEach((k) => assert.ok(k in it0, `${q}.${k}`));
        assert.ok('ledgerStatus' in it0);
      });
      const statuses = new Set(QUEUES.flatMap((q) => board.queues[q].map((t) => t.ledgerStatus)));
      ['DONE', 'ERROR', 'DEFERRED', 'DRY_RUN'].forEach((s) => assert.ok(statuses.has(s), s));
    });

    it('getUpcomingMeetingChoices returns recommended, choices, backlogSeriesKey', async () => {
      const c = await new GASBridge(true).getUpcomingMeetingChoices('t-2001');
      assert.equal(c.ok, true);
      const dest = c.choices[0];
      assert.equal(dest.seriesKey, 'NCMMS_CORE');
      assert.ok(dest.recommended.occurrenceId && dest.recommended.reason);
      assert.ok(dest.upcoming.length >= 2 && dest.upcoming.every((x) => x.occurrenceId && x.start && x.cutoffISO));
      assert.ok(dest.upcoming.some((x) => x.occurrenceId === dest.recommended.occurrenceId));
    });

    it('routeThreadToTask is idempotent: one mock task, ledger DONE', async () => {
      const bridge = new GASBridge(true);
      const a = await bridge.routeThreadToTask('t-1001', { today: true, priority: 'A1' });
      const b = await bridge.routeThreadToTask('t-1001', { today: true, priority: 'A1' });
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      assert.equal(a.operationKey, b.operationKey);
      assert.equal(bridge.hub.tasks.length, 1);
      assert.equal(bridge.hub.ledger.get(a.operationKey).status, 'DONE');
      const board = await bridge.getTriageBoard({});
      assert.equal(board.queues.directAction.find((t) => t.threadId === 't-1001').ledgerStatus, 'DONE');
    });

    it('routeThreadToWaiting and routeThreadToMeeting are idempotent', async () => {
      const bridge = new GASBridge(true);
      await bridge.routeThreadToWaiting('t-1002', { waitingOn: 'Priya', nagDate: '2026-10-20' });
      await bridge.routeThreadToWaiting('t-1002', { waitingOn: 'Priya', nagDate: '2026-10-20' });
      assert.equal(bridge.hub.waiting.length, 1);
      const before = bridge.hub.carryIns.length;
      const m1 = await bridge.routeThreadToMeeting('t-2001', 'NCMMS_CORE-occ-1', { framing: 'Decision needed', seriesKey: 'NCMMS_CORE' });
      const m2 = await bridge.routeThreadToMeeting('t-2001', 'NCMMS_CORE-occ-1', { framing: 'Decision needed', seriesKey: 'NCMMS_CORE' });
      assert.equal(m1.ok && m2.ok, true);
      assert.equal(bridge.hub.carryIns.length, before + 1);
    });

    it('dry run records DRY_RUN and creates nothing', async () => {
      const bridge = new GASBridge(true, { dryRun: true });
      const r = await bridge.routeThreadToTask('t-1001', {});
      assert.equal(r.ok, true);
      assert.match(r.message, /Would create Task/);
      assert.equal(bridge.hub.tasks.length, 0);
      assert.equal(bridge.hub.ledger.get(r.operationKey).status, 'DRY_RUN');
    });

    it('dismissTriageItem removes the item from the board; unknown thread fails loud', async () => {
      const bridge = new GASBridge(true);
      const r = await bridge.dismissTriageItem('t-4001');
      assert.equal(r.ok, true);
      const board = await bridge.getTriageBoard({});
      assert.ok(!board.queues.fyiReading.some((t) => t.threadId === 't-4001'));
      const bad = await bridge.dismissTriageItem('nope');
      assert.equal(bad.ok, false);
      assert.equal(bad.errorCode, 'THREAD_NOT_FOUND');
    });

    it('retryFailedOperation recovers an ERROR row, rejects non-errors', async () => {
      const bridge = new GASBridge(true);
      const board = await bridge.getTriageBoard({});
      const failed = board.queues.directAction.find((t) => t.ledgerStatus === 'ERROR');
      const r = await bridge.retryFailedOperation(failed.operationKey);
      assert.equal(r.ok, true);
      const again = await bridge.retryFailedOperation(failed.operationKey);
      assert.equal(again.ok, false);
      assert.equal(again.errorCode, 'NOT_RETRYABLE');
    });

    it('getMeetingPrep returns the contract shape and reflects routed carry-ins', async () => {
      const bridge = new GASBridge(true);
      const p0 = await bridge.getMeetingPrep('NCMMS_CORE', 'NCMMS_CORE-occ-1');
      ['series', 'occurrence', 'upcoming', 'carryInCount', 'notesDocUrl', 'warning'].forEach((k) => assert.ok(k in p0, k));
      assert.equal(p0.occurrence.occurrenceId, 'NCMMS_CORE-occ-1');
      await bridge.routeThreadToMeeting('t-2003', 'NCMMS_CORE-occ-1', { seriesKey: 'NCMMS_CORE' });
      const p1 = await bridge.getMeetingPrep('NCMMS_CORE', 'NCMMS_CORE-occ-1');
      assert.equal(p1.carryInCount, p0.carryInCount + 1);
    });
  });
});


