/**
 * @file syncEngine.test.js
 * @description Comprehensive unit tests for 2-way sync engine: UI updates, G-Suite API updates, task-appointment synchronization, and bidirectional reconciliation cross-checks.
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
  describe('Metadata & Linkage', () => {
    it('should create sync metadata linkage between task and event', () => {
      const meta = createSyncMetadata('t100', 'e200');
      assert.equal(meta.taskId, 't100');
      assert.equal(meta.eventId, 'e200');
      assert.equal(meta.syncId, 'sync_t100_e200');
      assert.ok(meta.lastSyncedAt);
    });
  });

  describe('UI Updates: Task -> Appointment Sync', () => {
    it('should sync task creation in UI to new calendar event', () => {
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
      assert.equal(updatedEvent.isCompleted, false);
      assert.equal(updatedEvent.extendedProperties?.private?.gasTaskId, 't_alpha');
    });

    it('should sync task completion in UI to existing calendar event', () => {
      const task = {
        id: 't_alpha',
        title: '[A1] Review Q3 financial report',
        status: '✓',
        dueDate: '2026-08-15'
      };

      const existingEvents = [
        { id: 'e1', title: '[A1] Review Q3 financial report', syncTaskId: 't_alpha', isCompleted: false }
      ];

      const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, existingEvents);
      assert.equal(isNewEvent, false);
      assert.equal(updatedEvent.id, 'e1');
      assert.equal(updatedEvent.title, '[✓] Review Q3 financial report');
      assert.equal(updatedEvent.isCompleted, true);
    });

    it('should sync task reopening in UI back to calendar event', () => {
      const task = {
        id: 't_alpha',
        title: '[A1] Review Q3 financial report',
        status: '•',
        dueDate: '2026-08-15'
      };

      const existingEvents = [
        { id: 'e1', title: '[✓] Review Q3 financial report', syncTaskId: 't_alpha', isCompleted: true }
      ];

      const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, existingEvents);
      assert.equal(isNewEvent, false);
      assert.equal(updatedEvent.id, 'e1');
      assert.equal(updatedEvent.title, '[A1] Review Q3 financial report');
      assert.equal(updatedEvent.isCompleted, false);
    });

    it('should sync task rescheduling in UI to calendar event start/end times', () => {
      const task = {
        id: 't_resched',
        title: '[B1] Board presentation prep',
        status: '•',
        dueDate: '2026-08-15',
        scheduledTime: '2026-08-15T15:30:00Z',
        endTime: '2026-08-15T16:30:00Z'
      };

      const existingEvents = [
        { id: 'e_resched', title: '[B1] Board presentation prep', syncTaskId: 't_resched', startTime: '2026-08-15T09:00:00Z', endTime: '2026-08-15T10:00:00Z' }
      ];

      const { updatedEvent } = syncTaskToCalendar(task, existingEvents);
      assert.equal(updatedEvent.startTime, '2026-08-15T15:30:00Z');
      assert.equal(updatedEvent.endTime, '2026-08-15T16:30:00Z');
    });

    it('should sync task priority/title edit in UI to calendar event', () => {
      const task = {
        id: 't_edit',
        title: '[A2] Updated Strategy Workshop',
        status: '•',
        dueDate: '2026-08-15'
      };

      const existingEvents = [
        { id: 'e_edit', title: '[A1] Strategy Workshop', syncTaskId: 't_edit' }
      ];

      const { updatedEvent } = syncTaskToCalendar(task, existingEvents);
      assert.equal(updatedEvent.title, '[A2] Updated Strategy Workshop');
    });
  });

  describe('UI Updates: Appointment -> Task Sync', () => {
    it('should sync appointment completion in UI back to linked task', () => {
      const dailyTasks = [
        { id: 't_sync_1', title: '[A1] Complete system audit', status: '•', dueDate: '2026-08-15' }
      ];

      const completedEvent = {
        id: 'e_sync_1',
        syncTaskId: 't_sync_1',
        title: '[✓] Complete system audit',
        isCompleted: true,
        startTime: '2026-08-15T11:00:00Z'
      };

      const updatedTask = syncCalendarToTask(completedEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.id, 't_sync_1');
      assert.equal(updatedTask.status, '✓');
      assert.equal(updatedTask.title, '[A1] Complete system audit');
    });

    it('should sync appointment reopening in UI back to linked task', () => {
      const dailyTasks = [
        { id: 't_sync_2', title: '[B2] Audit compliance review', status: '✓', dueDate: '2026-08-15' }
      ];

      const reopenedEvent = {
        id: 'e_sync_2',
        syncTaskId: 't_sync_2',
        title: '[B2] Audit compliance review',
        isCompleted: false,
        startTime: '2026-08-15T14:00:00Z'
      };

      const updatedTask = syncCalendarToTask(reopenedEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.status, '•');
    });

    it('should sync appointment reschedule in UI back to linked task', () => {
      const dailyTasks = [
        { id: 't_sync_3', title: '[A2] Client briefing', status: '•', dueDate: '2026-08-15', scheduledTime: '2026-08-15T09:00:00Z' }
      ];

      const rescheduledEvent = {
        id: 'e_sync_3',
        syncTaskId: 't_sync_3',
        title: '[A2] Client briefing',
        startTime: '2026-08-16T13:00:00Z'
      };

      const updatedTask = syncCalendarToTask(rescheduledEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.scheduledTime, '2026-08-16T13:00:00Z');
      assert.equal(updatedTask.dueDate, '2026-08-16');
    });

    it('should sync appointment rename in UI back to linked task', () => {
      const dailyTasks = [
        { id: 't_sync_4', title: '[C1] Order office supplies', status: '•', dueDate: '2026-08-15' }
      ];

      const renamedEvent = {
        id: 'e_sync_4',
        syncTaskId: 't_sync_4',
        title: '[C1] Order ergonomic supplies and monitors'
      };

      const updatedTask = syncCalendarToTask(renamedEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.title, '[C1] Order ergonomic supplies and monitors');
    });
  });

  describe('G-Suite API Updates: Google Tasks API -> Appointments', () => {
    it('should sync remote Google Tasks API status changes to calendar appointments', () => {
      const existingEvents = [
        { id: 'evt_api_1', syncTaskId: 'gas_task_99', title: '[A1] Review GCP Architecture', isCompleted: false, startTime: '2026-08-15T10:00:00Z' }
      ];

      // Simulated payload coming from Google Tasks API (marked completed on mobile / web)
      const remoteGoogleTask = {
        id: 'gas_task_99',
        title: '[A1] Review GCP Architecture',
        status: '✓',
        dueDate: '2026-08-15'
      };

      const { updatedEvent, isNewEvent } = syncTaskToCalendar(remoteGoogleTask, existingEvents);
      assert.equal(isNewEvent, false);
      assert.equal(updatedEvent.id, 'evt_api_1');
      assert.equal(updatedEvent.title, '[✓] Review GCP Architecture');
      assert.equal(updatedEvent.isCompleted, true);
    });

    it('should sync remote Google Tasks API title update to calendar appointments', () => {
      const existingEvents = [
        { id: 'evt_api_2', syncTaskId: 'gas_task_100', title: '[B1] Old Title', isCompleted: false }
      ];

      // Simulated Google Tasks API title update
      const remoteGoogleTask = {
        id: 'gas_task_100',
        title: '[B1] Updated PRD Specifications',
        status: '•',
        dueDate: '2026-08-15'
      };

      const { updatedEvent } = syncTaskToCalendar(remoteGoogleTask, existingEvents);
      assert.equal(updatedEvent.title, '[B1] Updated PRD Specifications');
    });
  });

  describe('G-Suite API Updates: Google Calendar API -> Tasks', () => {
    it('should sync remote Google Calendar API event time shift to tasks', () => {
      const dailyTasks = [
        { id: 't_gcal_1', title: '[A1] Executive Committee Meeting', status: '•', dueDate: '2026-08-15', scheduledTime: '2026-08-15T09:00:00Z' }
      ];

      // Simulated Google Calendar API event update (rescheduled via Google Calendar)
      const remoteGCalEvent = {
        id: 'gcal_evt_1',
        title: '[A1] Executive Committee Meeting',
        startTime: '2026-08-15T15:00:00Z',
        endTime: '2026-08-15T16:00:00Z',
        extendedProperties: { private: { gasTaskId: 't_gcal_1' } }
      };

      const updatedTask = syncCalendarToTask(remoteGCalEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.id, 't_gcal_1');
      assert.equal(updatedTask.scheduledTime, '2026-08-15T15:00:00Z');
    });

    it('should sync remote Google Calendar API completion tag to tasks', () => {
      const dailyTasks = [
        { id: 't_gcal_2', title: '[B1] Vendor contract finalization', status: '•', dueDate: '2026-08-15' }
      ];

      // Simulated Google Calendar API event update with completed mark
      const remoteGCalEvent = {
        id: 'gcal_evt_2',
        title: '[✓] Vendor contract finalization',
        isCompleted: true,
        extendedProperties: { private: { gasTaskId: 't_gcal_2' } }
      };

      const updatedTask = syncCalendarToTask(remoteGCalEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.status, '✓');
      assert.equal(updatedTask.title, '[B1] Vendor contract finalization');
    });
  });

  describe('Bidirectional Reconciliation Cross-Check', () => {
    it('should perform complete bidirectional reconciliation across mixed tasks and events', () => {
      const tasks = [
        { id: 't1', title: '[A1] Team sync', status: '•', dueDate: '2026-08-15' },
        { id: 't2', title: '[B1] Submit expense report', status: '✓', dueDate: '2026-08-15' },
        { id: 't3', title: '[C1] Read research paper', status: '•', dueDate: '2026-08-15' }
      ];

      const events = [
        { id: 'e1', syncTaskId: 't1', title: '[A1] Team sync', startTime: '2026-08-15T10:00:00Z' },
        // e_stand: pure standalone meeting (not a task)
        { id: 'e_stand', title: 'Coffee with Partner', startTime: '2026-08-15T12:00:00Z' }
      ];

      const result = reconcileWorkspaceChanges(tasks, events);

      // Verify all tasks accounted for
      assert.equal(result.tasks.length, 3);
      // Verify events include e1, e_stand, plus newly generated events for t2 and t3
      assert.equal(result.calendarEvents.length, 4);
      assert.ok(result.syncTimestamp);

      // Verify t2 event has completed status
      const t2Evt = result.calendarEvents.find(e => e.syncTaskId === 't2');
      assert.ok(t2Evt);
      assert.equal(t2Evt.title, '[✓] Submit expense report');
      assert.equal(t2Evt.isCompleted, true);

      // Verify standalone event remains intact
      const standalone = result.calendarEvents.find(e => e.id === 'e_stand');
      assert.ok(standalone);
      assert.equal(standalone.title, 'Coffee with Partner');
    });

    it('should automatically generate a linked task when a new appointment has a priority tag', () => {
      const tasks = [];
      const events = [
        { id: 'e_tagged', title: '[A1] Important Planning Session', startTime: '2026-08-15T14:00:00Z', location: 'Work' }
      ];

      const result = reconcileWorkspaceChanges(tasks, events);
      assert.equal(result.tasks.length, 1);
      assert.equal(result.tasks[0].title, '[A1] Important Planning Session');
      assert.equal(result.tasks[0].category, 'Work');
      assert.equal(result.calendarEvents[0].syncTaskId, result.tasks[0].id);
    });

    it('should be idempotent across multiple consecutive reconciliation runs', () => {
      const initialTasks = [
        { id: 't_idemp_1', title: '[A1] Task One', status: '•', dueDate: '2026-08-15' },
        { id: 't_idemp_2', title: '[B2] Task Two', status: '✓', dueDate: '2026-08-15' }
      ];
      const initialEvents = [
        { id: 'e_idemp_1', syncTaskId: 't_idemp_1', title: '[A1] Task One', startTime: '2026-08-15T09:00:00Z' }
      ];

      const firstPass = reconcileWorkspaceChanges(initialTasks, initialEvents);
      const secondPass = reconcileWorkspaceChanges(firstPass.tasks, firstPass.calendarEvents);

      assert.equal(secondPass.tasks.length, firstPass.tasks.length);
      assert.equal(secondPass.calendarEvents.length, firstPass.calendarEvents.length);
      assert.deepEqual(
        secondPass.tasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
        firstPass.tasks.map(t => ({ id: t.id, title: t.title, status: t.status }))
      );
    });
  });
});
