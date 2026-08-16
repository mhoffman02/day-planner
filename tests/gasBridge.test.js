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
});
