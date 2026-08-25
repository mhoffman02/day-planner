/**
 * @file syncEngine.js
 * @description Day Planner 2-Way Sync Engine.
 * Handles bi-directional synchronization between Google Tasks, Google Calendar Events, and the Digital Binder.
 */

import { parseTaskTitle, formatTaskTitle, TASK_STATUSES } from './taskEngine.js';
import { getLocalDateStr } from './binderStore.js';

/**
 * Strips priority codes [A1-C9] and completion markers [✓] from a title string.
 * @param {string} [title=''] Raw title string.
 * @returns {string} Clean title without prefixes.
 */
export function getCleanTitle(title = '') {
  if (!title) return '';
  return title.replace(/^(\s*\[(?:✓|[A-Za-z][1-9])\]\s*)+/gi, '').trim();
}

/**
 * Creates or updates cross-reference metadata link between a Task and a Calendar Event.
 * @param {string} taskId Unique task identifier.
 * @param {string} [eventId] Optional unique calendar event identifier.
 * @returns {{syncId: string, taskId: string, eventId: string|null, lastSyncedAt: string}} Sync metadata object.
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
 * Syncs a Task change to its corresponding Calendar Event representation.
 * @param {object} task Task object { id, title, status, dueDate, scheduledTime, category }.
 * @param {Array<object>} [calendarEvents=[]] Current list of calendar events.
 * @returns {{updatedEvent: object|null, isNewEvent: boolean}} Updated calendar event and creation flag.
 *   `updatedEvent` is `null` when the task has no explicit `scheduledTime` and no existing
 *   linked event — day planners keep Tasks and Appointments distinct, so an untimed task
 *   never gets a calendar event.
 */
export function syncTaskToCalendar(task, calendarEvents = []) {
  const parsed = parseTaskTitle(task.title);
  const cleanTitle = getCleanTitle(parsed.cleanTitle || task.title);
  const isCompleted = task.status === TASK_STATUSES.COMPLETED || task.status === '✓';

  // Format event title with status indicator if completed
  const eventTitle = isCompleted ? `[✓] ${cleanTitle}` : (parsed.priorityCode ? `[${parsed.priorityCode}] ${cleanTitle}` : cleanTitle);

  // Find existing linked calendar event via syncTaskId or extendedProperties
  const existingEvent = calendarEvents.find(evt =>
    evt.syncTaskId === task.id || (evt.extendedProperties && evt.extendedProperties.private?.gasTaskId === task.id)
  );

  // Day planners keep Tasks and Appointments distinct: a task only becomes a calendar
  // event when the user explicitly time-blocks it (task.scheduledTime). Without that, no
  // event is created — an untimed task must never appear as a phantom "9am appointment".
  if (!task.scheduledTime && !existingEvent) {
    return { updatedEvent: null, isNewEvent: false };
  }

  const startTime = task.scheduledTime || `${task.dueDate || getLocalDateStr()}T09:00:00Z`;
  const defaultEndTime = `${startTime.substring(0, 11)}${String(Math.min(23, parseInt(startTime.substring(11, 13) || '9', 10) + 1)).padStart(2, '0')}:00:00Z`;
  const endTime = task.endTime || (existingEvent ? existingEvent.endTime : defaultEndTime);

  if (existingEvent) {
    return {
      updatedEvent: {
        ...existingEvent,
        title: eventTitle,
        startTime: task.scheduledTime || existingEvent.startTime || startTime,
        endTime: task.endTime || existingEvent.endTime || endTime,
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
      id: `evt_sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: eventTitle,
      startTime,
      endTime,
      location: task.category || 'Planner Task',
      description: `Synced from Planner Task [${parsed.priorityCode || 'Open'}]`,
      syncTaskId: task.id,
      isCompleted,
      extendedProperties: { private: { gasTaskId: task.id } },
      lastSyncedAt: new Date().toISOString()
    },
    isNewEvent: true
  };
}

/**
 * Syncs a Calendar Event change back to its linked Task.
 * @param {object} calendarEvent Modified calendar event object.
 * @param {Array<object>} [dailyTasks=[]] Current daily tasks list.
 * @returns {object|null} Updated task object or null if not linked to a task.
 */
export function syncCalendarToTask(calendarEvent, dailyTasks = []) {
  const linkedTaskId = calendarEvent.syncTaskId || calendarEvent.extendedProperties?.private?.gasTaskId;
  
  let targetTask = linkedTaskId ? dailyTasks.find(t => t.id === linkedTaskId) : null;

  const eventTitleClean = getCleanTitle(calendarEvent.title);
  const parsedEvent = parseTaskTitle(calendarEvent.title);

  // Fallback match by clean title if unlinked
  if (!targetTask && (parsedEvent.priorityCode || calendarEvent.title.startsWith('[✓]'))) {
    targetTask = dailyTasks.find(t => {
      const parsedT = parseTaskTitle(t.title);
      const cleanT = getCleanTitle(parsedT.cleanTitle || t.title);
      return cleanT && cleanT.toLowerCase() === eventTitleClean.toLowerCase();
    });
  }

  if (!targetTask) return null;

  const parsedTask = parseTaskTitle(targetTask.title);
  
  const priorityGroup = parsedEvent.priorityGroup || parsedTask.priorityGroup;
  const sequence = parsedEvent.sequence || parsedTask.sequence;
  const formattedTitle = (priorityGroup && sequence)
    ? formatTaskTitle(priorityGroup, sequence, eventTitleClean)
    : eventTitleClean;

  const isCompletedInEvent = calendarEvent.title.startsWith('[✓]') || Boolean(calendarEvent.isCompleted);
  
  let newStatus = targetTask.status;
  if (isCompletedInEvent) {
    newStatus = TASK_STATUSES.COMPLETED;
  } else if (targetTask.status === TASK_STATUSES.COMPLETED || targetTask.status === '✓') {
    newStatus = TASK_STATUSES.OPEN;
  }

  return {
    ...targetTask,
    title: formattedTitle,
    status: newStatus,
    scheduledTime: calendarEvent.startTime || targetTask.scheduledTime,
    dueDate: calendarEvent.startTime ? calendarEvent.startTime.slice(0, 10) : targetTask.dueDate
  };
}

/**
 * Performs full bidirectional reconciliation across Tasks and Calendar Events.
 * @param {Array<object>} [dailyTasks=[]] Current daily tasks array.
 * @param {Array<object>} [calendarEvents=[]] Current calendar events array.
 * @returns {{tasks: Array<object>, calendarEvents: Array<object>, syncTimestamp: string}} Reconciled tasks, events, and timestamp.
 */
export function reconcileWorkspaceChanges(dailyTasks = [], calendarEvents = []) {
  const reconciledTasks = [...dailyTasks];
  const reconciledEvents = [...calendarEvents];

  // 1. Ensure all tasks have corresponding calendar events and sync state (Task -> Event)
  reconciledTasks.forEach((task) => {
    const { updatedEvent, isNewEvent } = syncTaskToCalendar(task, reconciledEvents);
    if (!updatedEvent) return; // untimed task: no calendar event to create or update
    if (isNewEvent) {
      reconciledEvents.push(updatedEvent);
    } else {
      const matchIdx = reconciledEvents.findIndex(e => e.id === updatedEvent.id);
      if (matchIdx !== -1) {
        reconciledEvents[matchIdx] = updatedEvent;
      }
    }
  });

  // 2. Reflect any event time/title shifts/completions back into linked tasks (Event -> Task).
  // Events never create tasks: Tasks belong on the Tasks pane, events belong on the Calendar.
  // An unlinked event with no matching task is left as calendar-only.
  reconciledEvents.forEach((evt) => {
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
