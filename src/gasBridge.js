/**
 * @file gasBridge.js
 * @description Day Planner GAS API Bridge & Local Mock Provider.
 * Bridges client requests to Google Apps Script backend `google.script.run` or local mock state.
 */

import { transferMasterTaskToToday, forwardTaskToDate, TASK_STATUSES } from './taskEngine.js';
import { reconcileWorkspaceChanges } from './syncEngine.js';
import IndexedDbStore from './indexedDbStore.js';
import { createFutureItem, nextMonthKey, emptyYearMatrix } from './futureMatrixEngine.js';

/**
 * Outbox mutation type tags used to queue and later replay writes made while offline.
 */
export const OUTBOX_MUTATION_TYPES = {
  ADD_DAILY_TASK: 'ADD_DAILY_TASK',
  UPDATE_DAILY_TASK: 'UPDATE_DAILY_TASK',
  ADD_CALENDAR_EVENT: 'ADD_CALENDAR_EVENT',
  UPDATE_CALENDAR_EVENT: 'UPDATE_CALENDAR_EVENT',
  SAVE_DAILY_NOTE: 'SAVE_DAILY_NOTE'
};

/**
 * Service bridge for invoking Apps Script backend functions or providing mock fallback data.
 */
export class GASBridge {
  /**
   * Creates an instance of GASBridge.
   * @param {boolean} [useMock=true] Whether to force local mock data mode.
   */
  constructor(useMock = true) {
    this.useMock = useMock;
    // Test-only override; production offline detection uses navigator.onLine.
    this._forceOffline = false;

    // Seed mock data for local dev server & unit tests. The '2026-08-15' bucket is also the
    // fallback every other date resolves to (see getDailyData/getMonthData below), which makes
    // it the actual first-run content a gh-pwa-shell visitor sees before ever syncing real data
    // (see .agents/rules/sync-gas-app-and-shell-bundle.md) — so every collection here is a single,
    // clearly-labeled placeholder rather than fabricated business content someone could mistake
    // for their own synced data.
    this.mockData = {
      dailyTasks: {
        '2026-08-15': [
          { id: 't1', title: 'Try the Day Planner app', status: '✓', category: 'Personal', dueDate: '2026-08-15' }
        ]
      },
      masterTasks: [
        { id: 'm1', title: 'Example: a long-term to-do that doesn’t belong on one specific day', category: 'Personal', status: '•' }
      ],
      futureMatrix: {
        2026: (() => {
          const matrix = emptyYearMatrix(2026);
          matrix.months['2026-10'].push(createFutureItem('Example: something planned for a future month', 'Personal'));
          return matrix;
        })()
      },
      calendarEvents: {},
      dailyNotes: {
        '2026-08-15': `### 👋 Sample data
[[color:red]]**This is sample data.**[[/color]] Tap the sync button (🔄) above to connect your real tasks, appointments, and notes.

### 🚀 Get started
1. **Explore today's view** — tasks, appointments, and notes all live on one page.
2. *Tap sync* (🔄) to pull in your real Google Tasks, Calendar, and Drive.
3. [[color:teal]]**Install the app**[[/color]] from the banner below for one-tap access anytime.
4. Want the full walkthrough? See the **About** page.`
      },
      indexEntries: []
    };
  }

  /**
   * Whether the client currently has network connectivity. Falls back to "online"
   * when `navigator` isn't available (Node/test environments).
   * @returns {boolean}
   */
  isOnline() {
    if (this._forceOffline) return false;
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
    return navigator.onLine;
  }

  /**
   * Invokes a named `google.script.run` server function and resolves/rejects with its result.
   * @param {string} fnName Server-side function name on `google.script.run`.
   * @param {Array<any>} args Positional arguments to forward.
   * @returns {Promise<any>}
   */
  _runGasCall(fnName, args) {
    return new Promise((resolve, reject) => {
      const runner = window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);
      runner[fnName](...args);
    });
  }

  /**
   * Replays queued offline mutations (in FIFO order) against the live GAS backend once
   * connectivity is restored, dequeuing each on success and stopping at the first failure
   * so ordering/dependencies (e.g. an edit queued after its own offline create) are preserved
   * for retry on the next flush.
   * @param {(mutation: object, result: any, tempIdMap: Object<string,string>) => void} [onResolved]
   *   Called after each mutation successfully replays, so the caller can reconcile any
   *   client-generated temp id against the real server-assigned id.
   * @returns {Promise<{flushed: number, remaining: number, failed: number}>}
   */
  async flushOutbox(onResolved) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      return { flushed: 0, remaining: 0, failed: 0 };
    }
    if (!this.isOnline()) {
      const pending = await IndexedDbStore.idbGetOutbox();
      return { flushed: 0, remaining: pending.length, failed: 0 };
    }

    const outbox = (await IndexedDbStore.idbGetOutbox()).sort((a, b) => a.id - b.id);
    const tempIdMap = {};
    const resolveId = (id) => tempIdMap[id] || id;

    let flushed = 0;
    let failed = 0;

    for (const mutation of outbox) {
      try {
        let result;
        switch (mutation.type) {
          case OUTBOX_MUTATION_TYPES.ADD_DAILY_TASK: {
            const { dateStr, title, category, tempId } = mutation.payload;
            result = await this._runGasCall('addDailyTask', [dateStr, title, category]);
            if (result && result.id && tempId) tempIdMap[tempId] = result.id;
            break;
          }
          case OUTBOX_MUTATION_TYPES.UPDATE_DAILY_TASK: {
            const { dateStr, taskId, updates } = mutation.payload;
            result = await this._runGasCall('updateDailyTask', [dateStr, resolveId(taskId), updates]);
            break;
          }
          case OUTBOX_MUTATION_TYPES.ADD_CALENDAR_EVENT: {
            const { dateStr, eventData, tempId } = mutation.payload;
            result = await this._runGasCall('addCalendarEvent', [dateStr, eventData]);
            if (result && result.id && tempId) tempIdMap[tempId] = result.id;
            break;
          }
          case OUTBOX_MUTATION_TYPES.UPDATE_CALENDAR_EVENT: {
            const { dateStr, eventId, updates } = mutation.payload;
            result = await this._runGasCall('updateCalendarEvent', [dateStr, resolveId(eventId), updates]);
            break;
          }
          case OUTBOX_MUTATION_TYPES.SAVE_DAILY_NOTE: {
            const { dateStr, noteContent } = mutation.payload;
            result = await this._runGasCall('saveDailyDocCards', [dateStr, noteContent]);
            break;
          }
          default:
            result = null;
        }

        await IndexedDbStore.idbDequeueMutation(mutation.id);
        flushed++;
        if (typeof onResolved === 'function') onResolved(mutation, result, tempIdMap);
      } catch (err) {
        console.error('🔥 flushOutbox: mutation failed, stopping to preserve order', mutation, err);
        failed++;
        break;
      }
    }

    const remainingOutbox = await IndexedDbStore.idbGetOutbox();
    return { flushed, remaining: remainingOutbox.length, failed };
  }

  /**
   * Fetches tasks, calendar events, and notes for a specific date.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {Promise<{date: string, tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}>} Daily dataset promise.
   */
  async getDailyData(dateStr) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const seedTasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const seedEvents = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];
      const seedNote = this.mockData.dailyNotes[dateStr] || this.mockData.dailyNotes['2026-08-15'] || `No notes recorded for ${dateStr}.`;

      const adjustedTasks = seedTasks.map(t => ({ ...t, dueDate: dateStr }));
      const adjustedEvents = seedEvents.map(e => ({
        ...e,
        startTime: e.startTime ? e.startTime.replace(/^\d{4}-\d{2}-\d{2}/, dateStr).replace(/Z$/, '') : `${dateStr}T09:00:00`,
        endTime: e.endTime ? e.endTime.replace(/^\d{4}-\d{2}-\d{2}/, dateStr).replace(/Z$/, '') : `${dateStr}T10:00:00`
      }));

      return {
        date: dateStr,
        tasks: adjustedTasks,
        calendarEvents: adjustedEvents,
        noteContent: seedNote
      };
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getDailyData(dateStr);
    });
  }

  /**
   * Fetches tasks, calendar events, and notes for every day of a given month in one call —
   * the batched counterpart to getDailyData(), used to warm the rolling 3-month client cache
   * without issuing a getDailyData() round trip per day.
   * @param {string} monthStr Target month in YYYY-MM format.
   * @returns {Promise<{month: string, days: Object<string, {tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}>}>}
   */
  async getMonthData(monthStr) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const days = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
        const dayData = await this.getDailyData(dateStr);
        days[dateStr] = {
          tasks: dayData.tasks || [],
          calendarEvents: dayData.calendarEvents || [],
          noteContent: dayData.noteContent || ''
        };
      }
      return { month: monthStr, days };
    }

    return this._runGasCall('getMonthData', [monthStr]);
  }

  /**
   * Fetches monthly master task list.
   * @param {string} monthYearStr Target month/year identifier string.
   * @returns {Promise<Array<object>>} List of master task items promise.
   */
  async getMasterTasks(monthYearStr) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      return this.mockData.masterTasks;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getMasterTasks(monthYearStr);
    });
  }

  /**
   * Creates a new master task (mock mode only appends to the in-memory list; production is
   * backed by a real Google Task, see gas-app/Code.gs#addMasterTask).
   * @param {string} title Task title.
   * @param {string} [category='General'] Optional category classification.
   * @returns {Promise<object>} Created master task object.
   */
  async addMasterTask(title, category = 'General') {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const newTask = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        category,
        status: '•',
        movedTo: null,
        movedTaskId: null
      };
      this.mockData.masterTasks.push(newTask);
      return newTask;
    }
    return this._runGasCall('addMasterTask', [title, category]);
  }

  /**
   * Records that a master task was moved to a specific daily task list, for the "Moved to
   * <date>" note in the Master Tasks view. See gas-app/Code.gs#markMasterTaskMoved.
   * @param {string} masterTaskId Master task id.
   * @param {string} targetDateStr Date moved to, in YYYY-MM-DD format.
   * @param {string} movedTaskId Id of the newly created daily task.
   * @returns {Promise<object|null>} Updated master task object, or null if not found (mock mode only).
   */
  async markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const task = this.mockData.masterTasks.find(t => t.id === masterTaskId);
      if (!task) return null;
      task.movedTo = targetDateStr;
      task.movedTaskId = movedTaskId;
      return task;
    }
    return this._runGasCall('markMasterTaskMoved', [masterTaskId, targetDateStr, movedTaskId]);
  }

  /**
   * Resolves the title of a pasted Google Docs/Sheets/Slides/Forms/Drive URL via the backend's
   * drive.readonly-scoped lookup, for the Notes "smart paste" hyperlink feature. Local/mock mode
   * has no real Drive to query, so it always reports failure rather than fabricating a title —
   * callers fall back to inserting the plain URL, same as pasting any other link.
   * @param {string} url A pasted Google Docs/Sheets/Slides/Forms/Drive URL.
   * @returns {Promise<{success: boolean, title?: string, fileId?: string, error?: string}>}
   */
  async resolveLinkTitle(url) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      return { success: false, error: 'Drive title lookup is unavailable in local/mock mode.' };
    }
    return this._runGasCall('resolveDriveFileTitle', [url]);
  }

  /**
   * Adds a new task to the daily planner.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} title Task title description.
   * @param {string} [category='General'] Optional category name.
   * @param {string} [sourceMasterId] Id of the master task this was transferred from, if any.
   * @returns {Promise<object>} Created daily task item promise.
   */
  async addDailyTask(dateStr, title, category = 'General', sourceMasterId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.dailyTasks[dateStr]) {
        this.mockData.dailyTasks[dateStr] = [];
      }
      const newTask = {
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        status: '•',
        category,
        dueDate: dateStr,
        sourceMasterId: sourceMasterId || null
      };
      this.mockData.dailyTasks[dateStr].push(newTask);
      return newTask;
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('addDailyTask', [dateStr, title, category, sourceMasterId]);
      } catch (err) {
        console.warn('addDailyTask: network call failed, queueing offline', err);
      }
    }

    const tempId = `offline_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.ADD_DAILY_TASK, { dateStr, title, category, tempId });
    return { id: tempId, title, status: '•', category, dueDate: dateStr, sourceMasterId: sourceMasterId || null, _queuedOffline: true };
  }

  /**
   * Updates an existing daily task (from UI or Google Tasks API sync).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} taskId Task identifier.
   * @param {object} updates Updated task properties.
   * @returns {Promise<object|null>} Updated task object or null.
   */
  async updateDailyTask(dateStr, taskId, updates = {}) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return null;

      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      this.mockData.dailyTasks[dateStr] = tasks;

      // Mirror a status change back onto the source master task, if this daily task was
      // transferred from one — see gas-app/Code.gs#updateDailyTask for the production
      // equivalent (best-effort; a missing master task shouldn't fail the daily task update).
      if (updates.status !== undefined && tasks[taskIndex].sourceMasterId) {
        const master = this.mockData.masterTasks.find(m => m.id === tasks[taskIndex].sourceMasterId);
        if (master) master.status = updates.status;
      }

      return tasks[taskIndex];
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('updateDailyTask', [dateStr, taskId, updates]);
      } catch (err) {
        console.warn('updateDailyTask: network call failed, queueing offline', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_DAILY_TASK, { dateStr, taskId, updates });
    return { id: taskId, ...updates, _queuedOffline: true };
  }

  /**
   * Adds or creates a calendar event / appointment.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {object} eventData Calendar event payload.
   * @returns {Promise<object>} Created calendar event.
   */
  async addCalendarEvent(dateStr, eventData = {}) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.calendarEvents[dateStr]) {
        this.mockData.calendarEvents[dateStr] = [];
      }

      const attendeesList = Array.isArray(eventData.attendees)
        ? eventData.attendees
        : (typeof eventData.attendees === 'string'
            ? eventData.attendees.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
            : []);

      const autoGoogleMeet = eventData.autoGoogleMeet !== undefined ? eventData.autoGoogleMeet : true;
      const guestsCanModify = eventData.guestsCanModify !== undefined ? eventData.guestsCanModify : true;
      const autoAgendaDoc = eventData.autoAgendaDoc !== undefined ? eventData.autoAgendaDoc : true;

      const meetLink = autoGoogleMeet
        ? (eventData.meetLink || ('https://meet.google.com/' + Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 5)))
        : null;

      const agendaDocUrl = autoAgendaDoc
        ? (eventData.agendaDocUrl || ('https://docs.google.com/document/create?title=' + encodeURIComponent('Agenda: ' + (eventData.title || 'New Appointment'))))
        : null;

      let fullDesc = eventData.description || '';
      if (agendaDocUrl && !fullDesc.includes(agendaDocUrl)) {
        fullDesc += (fullDesc ? '\n\n' : '') + `📄 Meeting Agenda Doc: ${agendaDocUrl}`;
      }

      const newEvt = {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: eventData.title || 'New Appointment',
        startTime: eventData.startTime || `${dateStr}T09:00:00`,
        endTime: eventData.endTime || `${dateStr}T09:30:00`,
        location: eventData.location || (meetLink ? 'Google Meet' : ''),
        description: fullDesc,
        meetLink: meetLink,
        agendaDocUrl: agendaDocUrl,
        attendees: attendeesList,
        guestsCanModify: guestsCanModify,
        syncTaskId: eventData.gasTaskId || eventData.syncTaskId || null,
        isCompleted: eventData.isCompleted || false
      };
      this.mockData.calendarEvents[dateStr].push(newEvt);
      return newEvt;
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('addCalendarEvent', [dateStr, eventData]);
      } catch (err) {
        console.warn('addCalendarEvent: network call failed, queueing offline', err);
      }
    }

    const tempId = `offline_evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const attendeesList = Array.isArray(eventData.attendees)
      ? eventData.attendees
      : (typeof eventData.attendees === 'string'
          ? eventData.attendees.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
          : []);
    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.ADD_CALENDAR_EVENT, { dateStr, eventData, tempId });
    return {
      id: tempId,
      title: eventData.title || 'New Appointment',
      startTime: eventData.startTime || `${dateStr}T09:00:00`,
      endTime: eventData.endTime || `${dateStr}T09:30:00`,
      location: eventData.location || '',
      description: eventData.description || '',
      meetLink: null,
      agendaDocUrl: null,
      attendees: attendeesList,
      guestsCanModify: eventData.guestsCanModify !== undefined ? eventData.guestsCanModify : true,
      syncTaskId: eventData.gasTaskId || eventData.syncTaskId || null,
      isCompleted: eventData.isCompleted || false,
      _queuedOffline: true
    };
  }

  /**
   * Fetches recent meeting attendees looking back (default 60 days) and forward (default 15 days).
   * @param {number} [lookbackDays=60] Days to look back.
   * @param {number} [lookaheadDays=15] Days to look forward.
   * @returns {Promise<Array<string>>} Unique sorted list of attendee email addresses.
   */
  async getRecentAttendees(lookbackDays = 60, lookaheadDays = 15) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const emailSet = new Set([
        'alex.rivera@example.com',
        'sarah.chen@example.com',
        'jordan.lee@example.com',
        'taylor.smith@example.com',
        'morgan.davis@example.com',
        'pat.patel@example.com'
      ]);

      // Collect from mock events
      Object.values(this.mockData.calendarEvents || {}).forEach(events => {
        events.forEach(evt => {
          (evt.attendees || []).forEach(email => {
            if (email && email.includes('@')) emailSet.add(email.toLowerCase().trim());
          });
        });
      });

      return Array.from(emailSet).sort();
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getRecentAttendees(lookbackDays, lookaheadDays);
    });
  }

  /**
   * Updates an existing calendar event / appointment (from UI or Google Calendar API sync).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} eventId Calendar event identifier.
   * @param {object} updates Updated event properties.
   * @returns {Promise<object|null>} Updated event object or null.
   */
  async updateCalendarEvent(dateStr, eventId, updates = {}) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const events = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return null;

      events[eventIndex] = { ...events[eventIndex], ...updates };
      this.mockData.calendarEvents[dateStr] = events;
      return events[eventIndex];
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('updateCalendarEvent', [dateStr, eventId, updates]);
      } catch (err) {
        console.warn('updateCalendarEvent: network call failed, queueing offline', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_CALENDAR_EVENT, { dateStr, eventId, updates });
    return { id: eventId, ...updates, _queuedOffline: true };
  }

  /**
   * Performs 2-way sync reconciliation for a specific date across tasks and calendar appointments.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {Promise<{tasks: Array<object>, calendarEvents: Array<object>, syncTimestamp: string}>}
   */
  async syncWorkspace(dateStr) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const events = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];

      const reconciled = reconcileWorkspaceChanges(tasks, events);
      this.mockData.dailyTasks[dateStr] = reconciled.tasks;
      this.mockData.calendarEvents[dateStr] = reconciled.calendarEvents;
      return reconciled;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .syncWorkspaceChanges(dateStr);
    });
  }

  /**
   * Transfers a master task into the daily task list with priority prefix. Takes the full
   * master task object (rather than re-looking it up by id) because the caller already has it
   * in hand from the last `getMasterTasks()` fetch — mirroring `forwardDailyTask`'s
   * `sourceTaskSnapshot` pattern, and avoiding a stale/mismatched internal lookup.
   * @param {object} masterTask Master task object to transfer (must have `id`).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise, or null if `masterTask` is missing/invalid.
   */
  async transferMasterTask(masterTask, dateStr, priorityGroup = 'A') {
    if (!masterTask || !masterTask.id) return null;

    const existingDaily = this.mockData.dailyTasks[dateStr] || [];
    const { title, category } = transferMasterTaskToToday(masterTask, existingDaily, priorityGroup, dateStr);

    return this.addDailyTask(dateStr, title, category, masterTask.id);
  }

  /**
   * Forwards a daily task to a new date (default: the day after `dateStr`) — Franklin Covey's
   * "➜ forwarded to a new date" semantics. The original task's status is set to FORWARDED and
   * left in place on its original day so the page still shows it was handled; a new open task
   * carrying the same priority group/category is created on the target date.
   * @param {string} dateStr Source date in YYYY-MM-DD format.
   * @param {string} taskId Task identifier on the source date.
   * @param {{title: string, category?: string}} sourceTaskSnapshot Current title/category of the
   *   task being forwarded — the Tasks API has no server-readable "category" field, so the
   *   caller (which already has the task in hand) supplies it rather than requiring a round trip.
   * @param {string} [targetDateStr] Target date in YYYY-MM-DD format (defaults to the day after `dateStr`).
   * @returns {Promise<{originalTask: object, forwardedTask: object}|null>} Both updated task objects, or null if the source task was not found.
   */
  async forwardDailyTask(dateStr, taskId, sourceTaskSnapshot, targetDateStr) {
    const resolvedTargetDate = targetDateStr || (() => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    })();

    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const tasks = this.mockData.dailyTasks[dateStr] || [];
      const sourceTask = tasks.find(t => t.id === taskId);
      if (!sourceTask) return null;

      const existingTargetDayTasks = this.mockData.dailyTasks[resolvedTargetDate] || [];
      const forwardedTask = forwardTaskToDate(sourceTask, existingTargetDayTasks, resolvedTargetDate);

      sourceTask.status = TASK_STATUSES.FORWARDED;
      if (!this.mockData.dailyTasks[resolvedTargetDate]) this.mockData.dailyTasks[resolvedTargetDate] = [];
      this.mockData.dailyTasks[resolvedTargetDate].push(forwardedTask);

      return { originalTask: sourceTask, forwardedTask };
    }

    return this._runGasCall('forwardDailyTask', [dateStr, taskId, sourceTaskSnapshot, resolvedTargetDate]);
  }

  /**
   * Fetches the Future Planning Matrix (12-month overview) for a given year — month-scoped
   * "big rock" items not yet tied to a specific day, per the Franklin Covey Master Task List
   * model applied across the whole year.
   * @param {number|string} year Target calendar year.
   * @returns {Promise<{year: string, months: Object<string, Array<object>>}>} Year matrix promise.
   */
  async getFutureMatrix(year) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.futureMatrix[year]) {
        this.mockData.futureMatrix[year] = emptyYearMatrix(year);
      }
      return this.mockData.futureMatrix[year];
    }

    return this._runGasCall('getFutureMatrix', [year]);
  }

  /**
   * Adds a new future planning item to a month's bucket.
   * @param {number|string} year Target calendar year.
   * @param {string} monthKey Target month key in YYYY-MM format.
   * @param {string} title Item title/description.
   * @param {string} [category='General'] Optional category label.
   * @returns {Promise<object>} Created future item promise.
   */
  async addFutureItem(year, monthKey, title, category = 'General') {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.futureMatrix[year]) {
        this.mockData.futureMatrix[year] = emptyYearMatrix(year);
      }
      const matrix = this.mockData.futureMatrix[year];
      if (!matrix.months[monthKey]) matrix.months[monthKey] = [];
      const newItem = createFutureItem(title, category);
      matrix.months[monthKey].push(newItem);
      return newItem;
    }

    return this._runGasCall('addFutureItem', [year, monthKey, title, category]);
  }

  /**
   * Cycles a future item's Franklin-style status marker (open → done → forwarded →
   * canceled → delegated).
   * @param {number|string} year Target calendar year.
   * @param {string} monthKey Target month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @param {string} status New status symbol.
   * @returns {Promise<object|null>} Updated future item promise, or null if not found.
   */
  async updateFutureItemStatus(year, monthKey, itemId, status) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const item = items.find(i => i.id === itemId);
      if (!item) return null;
      item.status = status;
      return item;
    }

    return this._runGasCall('updateFutureItemStatus', [year, monthKey, itemId, status]);
  }

  /**
   * Transfers a future planning item onto a specific day's task list, removing it from its
   * month bucket — Franklin Covey's "forwarded" semantics: the item now lives on that day.
   * @param {number|string} year Source calendar year.
   * @param {string} monthKey Source month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise, or null if not found.
   */
  async transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup = 'A') {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return null;
      const [item] = items.splice(idx, 1);

      const existingDaily = this.mockData.dailyTasks[dateStr] || [];
      const newDailyTask = transferMasterTaskToToday(item, existingDaily, priorityGroup, dateStr);
      if (!this.mockData.dailyTasks[dateStr]) this.mockData.dailyTasks[dateStr] = [];
      this.mockData.dailyTasks[dateStr].push(newDailyTask);
      return newDailyTask;
    }

    return this._runGasCall('transferFutureItem', [year, monthKey, itemId, dateStr, priorityGroup]);
  }

  /**
   * Carries a still-open future item forward into next month's bucket, rolling into next
   * calendar year's matrix when pushed from December.
   * @param {number|string} year Source calendar year.
   * @param {string} monthKey Source month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @returns {Promise<object|null>} The carried-forward item promise, or null if not found.
   */
  async pushFutureItemToNextMonth(year, monthKey, itemId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return null;
      const [item] = items.splice(idx, 1);

      const nextKey = nextMonthKey(monthKey);
      const nextYear = nextKey.slice(0, 4);
      if (!this.mockData.futureMatrix[nextYear]) {
        this.mockData.futureMatrix[nextYear] = emptyYearMatrix(nextYear);
      }
      const nextMatrix = this.mockData.futureMatrix[nextYear];
      if (!nextMatrix.months[nextKey]) nextMatrix.months[nextKey] = [];
      nextMatrix.months[nextKey].push(item);
      return item;
    }

    return this._runGasCall('pushFutureItemToNextMonth', [year, monthKey, itemId]);
  }

  /**
   * Saves daily topic cards to the Monthly Google Doc.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} noteContent Card note content.
   * @returns {Promise<{success: boolean, docName?: string}>} Promise of save result.
   */
  async saveDailyDocCards(dateStr, noteContent) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      this.mockData.dailyNotes[dateStr] = noteContent;
      return { success: true, docName: `Day Planner Notes - Mock ${dateStr}` };
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('saveDailyDocCards', [dateStr, noteContent]);
      } catch (err) {
        console.warn('saveDailyDocCards: network call failed, queueing offline', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.SAVE_DAILY_NOTE, { dateStr, noteContent });
    return { success: true, queued: true, docName: null };
  }
}
