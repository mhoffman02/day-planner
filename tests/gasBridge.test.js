/**
 * @file gasBridge.test.js
 * @description Unit tests for GASBridge client API wrapper, mock data handling, task/calendar updates, and 2-way synchronization.
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

  it('should update an existing daily task via bridge handler', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateDailyTask('2026-08-15', 't2', { status: '✓', title: '[A2] Conduct team sync (Completed)' });
    assert.ok(updated);
    assert.equal(updated.status, '✓');
    assert.equal(updated.title, '[A2] Conduct team sync (Completed)');
  });

  it('should add and update calendar events via bridge', async () => {
    const bridge = new GASBridge(true);
    const newEvt = await bridge.addCalendarEvent('2026-08-15', {
      title: 'Strategy & Architecture Discussion',
      startTime: '2026-08-15T16:00:00',
      endTime: '2026-08-15T17:00:00',
      location: 'Boardroom A'
    });
    assert.ok(newEvt.id);
    assert.equal(newEvt.title, 'Strategy & Architecture Discussion');

    const updatedEvt = await bridge.updateCalendarEvent('2026-08-15', newEvt.id, {
      title: 'Strategy & Architecture Discussion (Finalized)',
      isCompleted: true
    });
    assert.ok(updatedEvt);
    assert.equal(updatedEvt.title, 'Strategy & Architecture Discussion (Finalized)');
    assert.equal(updatedEvt.isCompleted, true);
  });

  it('should perform workspace 2-way sync through the bridge', async () => {
    const bridge = new GASBridge(true);
    // Add a new task without calendar event
    await bridge.addDailyTask('2026-08-15', '[A5] Synchronize Google Cloud endpoints', 'Work');
    
    const syncResult = await bridge.syncWorkspace('2026-08-15');
    assert.ok(syncResult);
    assert.ok(syncResult.tasks.length >= 5);
    
    // Check that calendar events contain an event corresponding to the new task
    const syncedEvt = syncResult.calendarEvents.find(e => e.title.includes('Synchronize Google Cloud endpoints'));
    assert.ok(syncedEvt);
    assert.ok(syncedEvt.syncTaskId);
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
});
