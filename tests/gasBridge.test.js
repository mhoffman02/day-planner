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

  it('should update daily task status, star, and notes via bridge', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateDailyTask('2026-08-15', 't1', {
      status: 'X',
      starred: true,
      notes: 'Postponed pending review'
    });
    assert.ok(updated);
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
});


