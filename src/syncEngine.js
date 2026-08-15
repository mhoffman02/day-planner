/**
 * Franklin Planner 2-Way Sync Engine
 * Handles bi-directional synchronization between Google Tasks, Google Calendar Events, and the Franklin Binder.
 */

import { parseTaskTitle, formatTaskTitle, TASK_STATUSES } from './taskEngine.js';

/**
 * Creates or updates cross-reference metadata link between a Task and a Calendar Event
 */
export function createSyncMetadata(taskId, eventId) {
  const syncId = `sync_${taskId}_${eventId || 'evt'}`;
  return {
    syncId,
    taskId,
    eventId: eventId || null,
    lastSyncedAt: new Date().toISOString()
  };
}

/**
 * Syncs a Task change to its corresponding Calendar Event representation
 * @param {object} task Task object { id, title, status, dueDate, scheduledTime, category }
 * @param {Array<object>} calendarEvents Current list of calendar events
 * @returns {object} { updatedEvent, isNewEvent }
 */
export function syncTaskToCalendar(task, calendarEvents = []) {
  const parsed = parseTaskTitle(task.title);
  const cleanTitle = parsed.cleanTitle || task.title;
  const isCompleted = task.status === TASK_STATUSES.COMPLETED || task.status === '✓';

  // Format event title with status indicator if completed
  const eventTitle = isCompleted ? `[✓] ${cleanTitle}` : `[${parsed.priorityCode || 'Task'}] ${cleanTitle}`;

  // Find existing linked calendar event via syncId or task metadata
  const existingEvent = calendarEvents.find(evt => 
    evt.syncTaskId === task.id || (evt.extendedProperties && evt.extendedProperties.private?.gasTaskId === task.id)
  );

  const startTime = task.scheduledTime || `${task.dueDate || new Date().toISOString().slice(0, 10)}T09:00:00Z`;
  const endTime = `${startTime.substring(0, 11)}10:00:00Z`;

  if (existingEvent) {
    return {
      updatedEvent: {
        ...existingEvent,
        title: eventTitle,
        startTime,
        endTime,
        isCompleted,
        syncTaskId: task.id,
        lastSyncedAt: new Date().toISOString()
      },
      isNewEvent: false
    };
  }

  // Create new linked event
  return {
    updatedEvent: {
      id: `evt_sync_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: eventTitle,
      startTime,
      endTime,
      location: task.category || 'Franklin Task',
      description: `Synced from Franklin Task [${parsed.priorityCode || 'Open'}]`,
      syncTaskId: task.id,
      isCompleted,
      extendedProperties: { private: { gasTaskId: task.id } },
      lastSyncedAt: new Date().toISOString()
    },
    isNewEvent: true
  };
}

/**
 * Syncs a Calendar Event change back to its linked Task
 * @param {object} calendarEvent Modified calendar event
 * @param {Array<object>} dailyTasks Current daily tasks
 * @returns {object|null} Updated task object or null if not linked
 */
export function syncCalendarToTask(calendarEvent, dailyTasks = []) {
  const linkedTaskId = calendarEvent.syncTaskId || calendarEvent.extendedProperties?.private?.gasTaskId;
  if (!linkedTaskId) return null;

  const targetTask = dailyTasks.find(t => t.id === linkedTaskId);
  if (!targetTask) return null;

  const eventTitleClean = calendarEvent.title.replace(/^\[✓\]\s*|^\[[A-C][1-9]\]\s*/i, '').trim();
  const parsed = parseTaskTitle(targetTask.title);
  const formattedTitle = formatTaskTitle(parsed.priorityGroup, parsed.sequence, eventTitleClean);

  const isCompletedInEvent = calendarEvent.title.startsWith('[✓]') || calendarEvent.isCompleted;

  return {
    ...targetTask,
    title: formattedTitle,
    status: isCompletedInEvent ? TASK_STATUSES.COMPLETED : targetTask.status,
    scheduledTime: calendarEvent.startTime,
    dueDate: calendarEvent.startTime ? calendarEvent.startTime.slice(0, 10) : targetTask.dueDate
  };
}

/**
 * Performs full bidirectional reconciliation across Tasks and Calendar Events
 */
export function reconcileWorkspaceChanges(dailyTasks = [], calendarEvents = []) {
  const reconciledTasks = [...dailyTasks];
  const reconciledEvents = [...calendarEvents];

  // 1. Ensure all tasks have corresponding calendar events
  reconciledTasks.forEach((task, idx) => {
    const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, reconciledEvents);
    if (isNewEvent) {
      reconciledEvents.push(updatedEvent);
    } else {
      const matchIdx = reconciledEvents.findIndex(e => e.id === updatedEvent.id);
      if (matchIdx !== -1) {
        reconciledEvents[matchIdx] = updatedEvent;
      }
    }
  });

  // 2. Reflect any event time/title shifts back into tasks
  reconciledEvents.forEach(evt => {
    const updatedTask = syncCalendarToTask(evt, reconciledTasks);
    if (updatedTask) {
      const taskIdx = reconciledTasks.findIndex(t => t.id === updatedTask.id);
      if (taskIdx !== -1) {
        reconciledTasks[taskIdx] = updatedTask;
      }
    }
  });

  return {
    tasks: reconciledTasks,
    calendarEvents: reconciledEvents,
    syncTimestamp: new Date().toISOString()
  };
}
