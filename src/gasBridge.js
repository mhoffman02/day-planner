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

    // Seed mock data for local dev server & unit tests
    this.mockData = {
      dailyTasks: {
        '2026-08-15': [
          { id: 't1', title: '[A1] Finalize Day Planner PRD & architecture', status: '✓', category: 'Work', dueDate: '2026-08-15' },
          { id: 't2', title: '[A2] Conduct team sync on Google Suite integration', status: '•', category: 'Work', dueDate: '2026-08-15' },
          { id: 't3', title: '[B1] Review Q3 budget draft', status: '•', category: 'Financial', dueDate: '2026-08-15' },
          { id: 't4', title: '[C1] Order ergonomic desk accessories', status: '•', category: 'Personal', dueDate: '2026-08-15' }
        ]
      },
      masterTasks: [
        { id: 'm1', title: 'Prepare Q3 performance appraisals', category: 'Work', status: '•' },
        { id: 'm2', title: 'Plan annual family retreat', category: 'Personal', status: '•' },
        { id: 'm3', title: 'Rebalance investment portfolio', category: 'Financial', status: '•' },
        { id: 'm4', title: 'Migrate server infrastructure to GCP', category: 'Projects', status: '•' }
      ],
      futureMatrix: {
        2026: (() => {
          const matrix = emptyYearMatrix(2026);
          matrix.months['2026-09'].push(createFutureItem('Book venue for annual offsite', 'Work'));
          matrix.months['2026-11'].push(createFutureItem('Open enrollment: review benefits', 'Personal'));
          matrix.months['2026-12'].push(createFutureItem('Year-end budget review', 'Financial'));
          return matrix;
        })()
      },
      calendarEvents: {
        '2026-08-15': [
          {
            id: 'e1',
            title: 'Morning Executive Briefing',
            startTime: '2026-08-15T08:00:00',
            endTime: '2026-08-15T08:30:00',
            location: 'Conference Room 1',
            description: 'Daily executive updates and Q3 metrics review.',
            meetLink: 'https://meet.google.com/abc-defg-hij'
          },
          {
            id: 'e2',
            title: 'Architecture & Design Review',
            startTime: '2026-08-15T10:30:00',
            endTime: '2026-08-15T11:30:00',
            location: 'Google Meet',
            description: 'Reviewing Day Planner UI binder layout and Alpine.js state bridge.',
            meetLink: 'https://meet.google.com/xyz-uvwx-rst'
          },
          {
            id: 'e3',
            title: 'Q3 Budget Approval Meeting',
            startTime: '2026-08-15T14:00:00',
            endTime: '2026-08-15T15:00:00',
            location: 'Boardroom B',
            description: 'Final sign-off on Q3 marketing & infrastructure budgets.',
            meetLink: 'https://meet.google.com/q3-budget-meet'
          }
        ]
      },
      dailyNotes: {
        '2026-08-15': `# Aug 15, 2026

## Key Meetings & Notes
- Executive briefing focused on accelerating digital transformation.
- #index [Architecture] Finalized single page binder layout using Alpine.js and clean UWSDS CSS.
- #index [Finance] Approved $15,000 infrastructure allocation for GCP migration.
- Team sync went smoothly. Reminded everyone about tomorrow's demo.

## Daily Tracker
- Water: 8 / 8 glasses
- Fitness: 45 min cardio
- Priority Focus: 100% on Day Planner Goals`
      },
      indexEntries: [
        { id: 'i1', date: '2026-08-15', topic: 'Architecture', summary: 'Finalized single page binder layout using Alpine.js', docUrl: '#doc-2026-08-15' },
        { id: 'i2', date: '2026-08-15', topic: 'Finance', summary: 'Approved $15,000 infrastructure allocation for GCP migration', docUrl: '#doc-2026-08-15' }
      ]
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
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [fnName](...args);
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
      const pending = await IndexedDbStore.getOutbox();
      return { flushed: 0, remaining: pending.length, failed: 0 };
    }

    const outbox = (await IndexedDbStore.getOutbox()).sort((a, b) => a.id - b.id);
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

        await IndexedDbStore.dequeueMutation(mutation.id);
        flushed++;
        if (typeof onResolved === 'function') onResolved(mutation, result, tempIdMap);
      } catch (err) {
        console.error('🔥 flushOutbox: mutation failed, stopping to preserve order', mutation, err);
        failed++;
        break;
      }
    }

    const remainingOutbox = await IndexedDbStore.getOutbox();
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
   * Adds a new task to the daily planner.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} title Task title description.
   * @param {string} [category='General'] Optional category name.
   * @returns {Promise<object>} Created daily task item promise.
   */
  async addDailyTask(dateStr, title, category = 'General') {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.dailyTasks[dateStr]) {
        this.mockData.dailyTasks[dateStr] = [];
      }
      const newTask = {
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        status: '•',
        category,
        dueDate: dateStr
      };
      this.mockData.dailyTasks[dateStr].push(newTask);
      return newTask;
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('addDailyTask', [dateStr, title, category]);
      } catch (err) {
        console.warn('addDailyTask: network call failed, queueing offline', err);
      }
    }

    const tempId = `offline_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await IndexedDbStore.enqueueMutation(OUTBOX_MUTATION_TYPES.ADD_DAILY_TASK, { dateStr, title, category, tempId });
    return { id: tempId, title, status: '•', category, dueDate: dateStr, _queuedOffline: true };
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
      return tasks[taskIndex];
    }

    if (this.isOnline()) {
      try {
        return await this._runGasCall('updateDailyTask', [dateStr, taskId, updates]);
      } catch (err) {
        console.warn('updateDailyTask: network call failed, queueing offline', err);
      }
    }

    await IndexedDbStore.enqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_DAILY_TASK, { dateStr, taskId, updates });
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
        ? (eventData.meetLink || `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}`)
        : null;

      const agendaDocUrl = autoAgendaDoc
        ? (eventData.agendaDocUrl || `https://docs.google.com/document/create?title=${encodeURIComponent('Agenda: ' + (eventData.title || 'New Appointment'))}`)
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
        syncTaskId: eventData.syncTaskId || null,
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
    await IndexedDbStore.enqueueMutation(OUTBOX_MUTATION_TYPES.ADD_CALENDAR_EVENT, { dateStr, eventData, tempId });
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
      syncTaskId: eventData.syncTaskId || null,
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

    await IndexedDbStore.enqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_CALENDAR_EVENT, { dateStr, eventId, updates });
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
   * Transfers a master task into the daily task list with priority prefix.
   * @param {string} masterTaskId Unique identifier of the master task.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise or null if master task not found.
   */
  async transferMasterTask(masterTaskId, dateStr, priorityGroup = 'A') {
    const masterTask = this.mockData.masterTasks.find(m => m.id === masterTaskId);
    if (!masterTask) return null;

    const existingDaily = this.mockData.dailyTasks[dateStr] || [];
    const newDailyTask = transferMasterTaskToToday(masterTask, existingDaily, priorityGroup, dateStr);

    if (!this.mockData.dailyTasks[dateStr]) {
      this.mockData.dailyTasks[dateStr] = [];
    }
    this.mockData.dailyTasks[dateStr].push(newDailyTask);
    return newDailyTask;
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

    await IndexedDbStore.enqueueMutation(OUTBOX_MUTATION_TYPES.SAVE_DAILY_NOTE, { dateStr, noteContent });
    return { success: true, queued: true, docName: null };
  }
}
