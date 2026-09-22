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

  it('should fetch master tasks list', async () => {
    const bridge = new GASBridge(true);
    const masterTasks = await bridge.getMasterTasks('August 2026');
    assert.equal(masterTasks.length, 4);
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

  it('should save daily doc cards content via bridge', async () => {
    const bridge = new GASBridge(true);
    const result = await bridge.saveDailyDocCards('2026-08-16', '### #index [Architecture] System Design\n- Clean 3-col layout');
    assert.ok(result.success);
    assert.ok(result.docName.includes('Day Planner Notes'));
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
});
