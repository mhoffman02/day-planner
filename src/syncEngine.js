/**
 * @file syncEngine.js
 * @description Franklin Planner 2-Way Sync Engine.
 * Handles bi-directional synchronization between Google Tasks, Google Calendar Events, and the Franklin Binder.
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
 * @returns {{updatedEvent: object, isNewEvent: boolean}} Object containing updated calendar event and creation flag.
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
    if (isNewEvent) {
      reconciledEvents.push(updatedEvent);
    } else {
      const matchIdx = reconciledEvents.findIndex(e => e.id === updatedEvent.id);
      if (matchIdx !== -1) {
        reconciledEvents[matchIdx] = updatedEvent;
      }
    }
  });

  // 2. Reflect any event time/title shifts/completions back into tasks (Event -> Task)
  reconciledEvents.forEach((evt) => {
    const updatedTask = syncCalendarToTask(evt, reconciledTasks);
    if (updatedTask) {
      const taskIdx = reconciledTasks.findIndex(t => t.id === updatedTask.id);
      if (taskIdx !== -1) {
        reconciledTasks[taskIdx] = updatedTask;
      }
    } else {
      // Check if this is an unlinked calendar event with a priority prefix (e.g. [A1], [B2], [✓])
      const parsed = parseTaskTitle(evt.title);
      if (parsed.priorityCode && !evt.syncTaskId) {
        const newTaskId = `task_sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const isCompleted = evt.title.startsWith('[✓]') || Boolean(evt.isCompleted);
        const newTask = {
          id: newTaskId,
          title: formatTaskTitle(parsed.priorityGroup, parsed.sequence, getCleanTitle(parsed.cleanTitle || evt.title)),
          status: isCompleted ? TASK_STATUSES.COMPLETED : TASK_STATUSES.OPEN,
          category: evt.location || 'General',
          dueDate: evt.startTime ? evt.startTime.slice(0, 10) : getLocalDateStr(),
          scheduledTime: evt.startTime || null
        };
        evt.syncTaskId = newTaskId;
        if (!evt.extendedProperties) evt.extendedProperties = {};
        if (!evt.extendedProperties.private) evt.extendedProperties.private = {};
        evt.extendedProperties.private.gasTaskId = newTaskId;
        reconciledTasks.push(newTask);
      }
    }
  });

  return {
    tasks: reconciledTasks,
    calendarEvents: reconciledEvents,
    syncTimestamp: new Date().toISOString()
  };
}
