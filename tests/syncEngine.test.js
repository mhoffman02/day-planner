/**
 * @file syncEngine.test.js
 * @description Comprehensive unit tests for 2-way sync engine: UI updates, G-Suite API updates, task-appointment synchronization, and bidirectional reconciliation cross-checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyncMetadata,
  getCleanTitle,
  syncTaskToCalendar,
  syncCalendarToTask,
  reconcileWorkspaceChanges,
  planSyncPersistence
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

    it('should default eventId to null and label the syncId placeholder when no event is linked yet', () => {
      const meta = createSyncMetadata('t100');
      assert.equal(meta.eventId, null);
      assert.equal(meta.syncId, 'sync_t100_evt');
    });
  });

  describe('getCleanTitle', () => {
    it('should strip priority prefixes and completion markers from a title', () => {
      assert.equal(getCleanTitle('[A1] Review quarterly roadmap'), 'Review quarterly roadmap');
      assert.equal(getCleanTitle('[✓] Review quarterly roadmap'), 'Review quarterly roadmap');
    });

    it('should strip multiple stacked prefixes (e.g. completed + priority) in one pass', () => {
      assert.equal(getCleanTitle('[✓] [A1] Review quarterly roadmap'), 'Review quarterly roadmap');
    });

    it('should return an empty string for falsy/empty titles and leave untagged titles untouched', () => {
      assert.equal(getCleanTitle(), '');
      assert.equal(getCleanTitle(''), '');
      assert.equal(getCleanTitle('No prefix here'), 'No prefix here');
    });
  });

  describe('UI Updates: Task -> Appointment Sync', () => {
    it('should not create a calendar event for a task with no explicit scheduled time', () => {
      // Day planners keep Tasks and Appointments distinct — an untimed task must never
      // auto-project onto the calendar as a phantom appointment.
      const task = {
        id: 't_alpha',
        title: '[A1] Review Q3 financial report',
        status: '•',
        dueDate: '2026-08-15',
        category: 'Financial'
      };

      const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, []);
      assert.equal(isNewEvent, false);
      assert.equal(updatedEvent, null);
    });

    it('should sync an explicitly time-blocked task creation in UI to a new calendar event', () => {
      const task = {
        id: 't_alpha',
        title: '[A1] Review Q3 financial report',
        status: '•',
        dueDate: '2026-08-15',
        scheduledTime: '2026-08-15T14:00:00Z',
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

    it('should return null when an event has no syncTaskId/gasTaskId link and no clean-title match', () => {
      const dailyTasks = [
        { id: 't_unrelated', title: '[A1] Something else entirely', status: '•', dueDate: '2026-08-15' }
      ];
      const standaloneEvent = { id: 'e_standalone', title: 'Coffee with a friend' };
      assert.equal(syncCalendarToTask(standaloneEvent, dailyTasks), null);
    });

    it('should fall back to matching an unlinked, priority-tagged event by clean title', () => {
      const dailyTasks = [
        { id: 't_fallback', title: '[B1] Draft partnership proposal', status: '•', dueDate: '2026-08-15' }
      ];
      // No syncTaskId/extendedProperties — must match purely by clean title text
      const unlinkedEvent = { id: 'e_fallback', title: '[B1] Draft partnership proposal', isCompleted: true };

      const updatedTask = syncCalendarToTask(unlinkedEvent, dailyTasks);
      assert.ok(updatedTask);
      assert.equal(updatedTask.id, 't_fallback');
      assert.equal(updatedTask.status, '✓');
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
    it('should reconcile a linked task/event pair while leaving untimed tasks off the calendar', () => {
      const tasks = [
        { id: 't1', title: '[A1] Team sync', status: '•', dueDate: '2026-08-15' },
        // t2/t3 are untimed — day planners keep these in Tasks only, never auto-projected
        // onto the calendar as phantom appointments.
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
      // Only e1 (already linked) and e_stand (standalone) — no new events for untimed t2/t3
      assert.equal(result.calendarEvents.length, 2);
      assert.ok(result.syncTimestamp);
      assert.equal(result.calendarEvents.some(e => e.syncTaskId === 't2'), false);
      assert.equal(result.calendarEvents.some(e => e.syncTaskId === 't3'), false);

      // Verify standalone event remains intact
      const standalone = result.calendarEvents.find(e => e.id === 'e_stand');
      assert.ok(standalone);
      assert.equal(standalone.title, 'Coffee with Partner');
    });

    it('should create a calendar event for an explicitly time-blocked task during reconciliation', () => {
      const tasks = [
        { id: 't_blocked', title: '[A1] Deep work session', status: '•', dueDate: '2026-08-15', scheduledTime: '2026-08-15T13:00:00Z' }
      ];
      const events = [];

      const result = reconcileWorkspaceChanges(tasks, events);
      assert.equal(result.calendarEvents.length, 1);
      assert.equal(result.calendarEvents[0].syncTaskId, 't_blocked');
    });

    it('should never create a task from an unlinked appointment, even with a priority tag', () => {
      const tasks = [];
      const events = [
        { id: 'e_tagged', title: '[A1] Important Planning Session', startTime: '2026-08-15T14:00:00Z', location: 'Work' }
      ];

      const result = reconcileWorkspaceChanges(tasks, events);
      assert.equal(result.tasks.length, 0);
      assert.equal(result.calendarEvents.length, 1);
      assert.equal(result.calendarEvents[0].syncTaskId, undefined);
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

  describe('planSyncPersistence', () => {
    it('should plan a task update only when title or status actually changed', () => {
      const beforeTasks = [
        { id: 't1', title: '[A1] Team sync', status: '•' },
        { id: 't2', title: '[B1] Untouched task', status: '•' }
      ];
      const reconciled = {
        tasks: [
          { id: 't1', title: '[✓] Team sync', status: '✓', dueDate: '2026-08-15' },
          { id: 't2', title: '[B1] Untouched task', status: '•', dueDate: '2026-08-15' }
        ],
        calendarEvents: []
      };

      const plan = planSyncPersistence(beforeTasks, [], reconciled);
      assert.equal(plan.taskUpdates.length, 1);
      assert.deepEqual(plan.taskUpdates[0], { taskId: 't1', title: '[✓] Team sync', status: '✓', dueDate: '2026-08-15' });
    });

    it('should plan an event create for a reconciled event with no prior counterpart, carrying gasTaskId and disabling auto-extras', () => {
      const reconciled = {
        tasks: [],
        calendarEvents: [
          { id: 'evt_sync_1', title: '[A1] Deep work', startTime: '2026-08-15T13:00:00Z', endTime: '2026-08-15T14:00:00Z', syncTaskId: 't_blocked' }
        ]
      };

      const plan = planSyncPersistence([], [], reconciled);
      assert.equal(plan.eventCreates.length, 1);
      assert.equal(plan.eventUpdates.length, 0);
      assert.equal(plan.eventCreates[0].index, 0);
      assert.equal(plan.eventCreates[0].payload.gasTaskId, 't_blocked');
      assert.equal(plan.eventCreates[0].payload.autoGoogleMeet, false);
      assert.equal(plan.eventCreates[0].payload.autoAgendaDoc, false);
    });

    it('should plan an event update only when title/startTime/endTime changed on an already-linked event', () => {
      const beforeEvents = [
        { id: 'e1', title: '[A1] Team sync', startTime: '2026-08-15T09:00:00Z', endTime: '2026-08-15T10:00:00Z' }
      ];
      const reconciled = {
        tasks: [],
        calendarEvents: [
          { id: 'e1', title: '[A1] Team sync', startTime: '2026-08-15T15:00:00Z', endTime: '2026-08-15T16:00:00Z' }
        ]
      };

      const plan = planSyncPersistence([], beforeEvents, reconciled);
      assert.equal(plan.eventCreates.length, 0);
      assert.equal(plan.eventUpdates.length, 1);
      assert.deepEqual(plan.eventUpdates[0], {
        eventId: 'e1',
        title: '[A1] Team sync',
        startTime: '2026-08-15T15:00:00Z',
        endTime: '2026-08-15T16:00:00Z'
      });
    });

    it('should plan nothing when reconciliation produced no diffs', () => {
      const beforeTasks = [{ id: 't1', title: '[A1] Team sync', status: '•' }];
      const beforeEvents = [{ id: 'e1', title: '[A1] Team sync', startTime: '2026-08-15T09:00:00Z', endTime: '2026-08-15T10:00:00Z' }];
      const reconciled = {
        tasks: [{ id: 't1', title: '[A1] Team sync', status: '•', dueDate: '2026-08-15' }],
        calendarEvents: [{ id: 'e1', title: '[A1] Team sync', startTime: '2026-08-15T09:00:00Z', endTime: '2026-08-15T10:00:00Z' }]
      };

      const plan = planSyncPersistence(beforeTasks, beforeEvents, reconciled);
      assert.equal(plan.taskUpdates.length, 0);
      assert.equal(plan.eventCreates.length, 0);
      assert.equal(plan.eventUpdates.length, 0);
    });
  });
});
