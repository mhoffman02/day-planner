/**
 * @file gasBridge.js
 * @description Day Planner GAS API Bridge & Local Mock Provider.
 * Bridges client requests to Google Apps Script backend `google.script.run` or local mock state.
 */

import { transferMasterTaskToToday } from './taskEngine.js';
import { reconcileWorkspaceChanges } from './syncEngine.js';

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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addDailyTask(dateStr, title, category);
    });
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .updateDailyTask(dateStr, taskId, updates);
    });
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addCalendarEvent(dateStr, eventData);
    });
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .updateCalendarEvent(dateStr, eventId, updates);
    });
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .saveDailyDocCards(dateStr, noteContent);
    });
  }
}
