/**
 * @file syncEngine.test.js
 * @description Unit tests for 2-way sync engine, metadata creation, task-calendar synchronization, and workspace reconciliation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyncMetadata,
  syncTaskToCalendar,
  syncCalendarToTask,
  reconcileWorkspaceChanges
} from '../src/syncEngine.js';

describe('2-Way Sync Engine Unit Tests', () => {
  it('should create sync metadata linkage between task and event', () => {
    const meta = createSyncMetadata('t100', 'e200');
    assert.equal(meta.taskId, 't100');
    assert.equal(meta.eventId, 'e200');
    assert.equal(meta.syncId, 'sync_t100_e200');
    assert.ok(meta.lastSyncedAt);
  });

  it('should sync task creation to new calendar event', () => {
    const task = {
      id: 't_alpha',
      title: '[A1] Review Q3 financial report',
      status: '•',
      dueDate: '2026-08-15',
      category: 'Financial'
    };

    const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, []);
    assert.equal(isNewEvent, true);
    assert.equal(updatedEvent.syncTaskId, 't_alpha');
    assert.equal(updatedEvent.title, '[A1] Review Q3 financial report');
    assert.equal(updatedEvent.location, 'Financial');
  });

  it('should sync task completion to existing calendar event title update', () => {
    const task = {
      id: 't_alpha',
      title: '[A1] Review Q3 financial report',
      status: '✓',
      dueDate: '2026-08-15'
    };

    const existingEvents = [
      { id: 'e1', title: '[A1] Review Q3 financial report', syncTaskId: 't_alpha' }
    ];

    const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, existingEvents);
    assert.equal(isNewEvent, false);
    assert.equal(updatedEvent.id, 'e1');
    assert.equal(updatedEvent.title, '[✓] Review Q3 financial report');
    assert.equal(updatedEvent.isCompleted, true);
  });

  it('should sync calendar event time shift back to linked task', () => {
    const dailyTasks = [
      { id: 't_beta', title: '[B2] Vendor contract review', status: '•', dueDate: '2026-08-15' }
    ];

    const modifiedEvent = {
      id: 'e_beta',
      syncTaskId: 't_beta',
      title: '[B2] Vendor contract review (Updated)',
      startTime: '2026-08-15T14:30:00Z',
      extendedProperties: { private: { gasTaskId: 't_beta' } }
    };

    const updatedTask = syncCalendarToTask(modifiedEvent, dailyTasks);
    assert.ok(updatedTask);
    assert.equal(updatedTask.id, 't_beta');
    assert.equal(updatedTask.title, '[B2] Vendor contract review (Updated)');
    assert.equal(updatedTask.scheduledTime, '2026-08-15T14:30:00Z');
  });

  it('should perform bidirectional reconciliation of all tasks and calendar events', () => {
    const tasks = [
      { id: 't1', title: '[A1] Team sync', status: '•', dueDate: '2026-08-15' },
      { id: 't2', title: '[B1] Submit expense report', status: '✓', dueDate: '2026-08-15' }
    ];

    const events = [
      { id: 'e1', syncTaskId: 't1', title: '[A1] Team sync', startTime: '2026-08-15T10:00:00Z' }
    ];

    const result = reconcileWorkspaceChanges(tasks, events);
    assert.equal(result.tasks.length, 2);
    assert.equal(result.calendarEvents.length, 2); // t2 event generated automatically
    assert.ok(result.syncTimestamp);

    const t2Event = result.calendarEvents.find(e => e.syncTaskId === 't2');
    assert.ok(t2Event);
    assert.equal(t2Event.title, '[✓] Submit expense report');
  });
});
