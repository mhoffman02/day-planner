/**
 * @file gasBridge.js
 * @description Day Planner GAS API Bridge & Local Mock Provider.
 * Bridges client requests to Google Apps Script backend `google.script.run` or local mock state.
 */

import { transferMasterTaskToToday, buildMasterTasksClearinghouse } from './taskEngine.js';
import { createFutureItem, nextMonthKey, emptyYearMatrix } from './futureMatrixEngine.js';

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
          { id: 't1', title: '[A1] Finalize Day Planner PRD & architecture', status: '✓', category: 'Work', dueDate: '2026-08-15', starred: false, notes: '' },
          { id: 't2', title: '[A2] Conduct team sync on Google Suite integration', status: '•', category: 'Work', dueDate: '2026-08-15', starred: true, notes: 'Agenda: OAuth, scopes, and quotas' },
          { id: 't3', title: '[B1] Review Q3 budget draft', status: '•', category: 'Financial', dueDate: '2026-08-15', starred: false, notes: '' },
          { id: 't4', title: '[C1] Order ergonomic desk accessories', status: '•', category: 'Personal', dueDate: '2026-08-15', starred: false, notes: 'Standing desk mat + monitor arm' }
        ]
      },
      masterTasks: [
        { id: 'm1', title: '[A1] Prepare Q3 performance appraisals', category: 'Work', status: '•', starred: false, notes: 'Draft reviews before Friday', movedTo: null, movedTaskId: null },
        { id: 'm2', title: '[B1] Plan annual family retreat', category: 'Personal', status: '•', starred: true, notes: 'Check cabin availability in Tahoe', movedTo: null, movedTaskId: null },
        { id: 'm3', title: '[C1] Rebalance investment portfolio', category: 'Financial', status: '•', starred: false, notes: '', movedTo: null, movedTaskId: null },
        { id: 'm4', title: '[B2] Migrate server infrastructure to GCP', category: 'Projects', status: '•', starred: false, notes: 'Evaluate Cloud Run vs App Engine', movedTo: null, movedTaskId: null }
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
            meetLink: 'https:' + '/' + '/meet.google.com/q3-budget-meet'
          }
        ],
        '2026-09-25': [
          {
            id: 'e_sep25_1',
            title: 'Morning Executive Briefing',
            startTime: '2026-09-25T08:00:00',
            endTime: '2026-09-25T08:30:00',
            location: 'Conference Room 1',
            description: 'Daily executive updates and Q3 metrics review.',
            meetLink: 'https:' + '/' + '/meet.google.com/abc-defg-hij'
          },
          {
            id: 'e_sep25_2',
            title: 'Engineering Standup Sync',
            startTime: '2026-09-25T09:00:00',
            endTime: '2026-09-25T09:30:00',
            location: 'Google Meet',
            description: 'Engineering daily standup and blocker check.',
            meetLink: 'https:' + '/' + '/meet.google.com/xyz-uvwx-rst'
          },
          {
            id: 'e_sep25_3',
            title: 'Architecture & Design Review',
            startTime: '2026-09-25T10:00:00',
            endTime: '2026-09-25T11:00:00',
            location: 'Boardroom A',
            description: 'Review Day Planner architecture and pure GAS deployment parity.',
            meetLink: 'https:' + '/' + '/meet.google.com/q3-budget-meet'
          },
          {
            id: 'e_sep25_4',
            title: 'Lunch with Engineering Team',
            startTime: '2026-09-25T12:00:00',
            endTime: '2026-09-25T13:00:00',
            location: 'Cafeteria',
            description: 'Team social and informal sync.'
          },
          {
            id: 'e_sep25_5',
            title: 'Master Tasks & Index Walkthrough',
            startTime: '2026-09-25T13:30:00',
            endTime: '2026-09-25T14:30:00',
            location: 'Conference Room 2',
            description: 'Demonstration of Franklin status stamp toggles and Google Doc links.'
          },
          {
            id: 'e_sep25_6',
            title: 'Q3 Budget Sign-off',
            startTime: '2026-09-25T15:00:00',
            endTime: '2026-09-25T15:45:00',
            location: 'Executive Suite',
            description: 'Final authorization of cloud infrastructure budget.'
          },
          {
            id: 'e_sep25_7',
            title: 'Sprint Retrospective',
            startTime: '2026-09-25T16:00:00',
            endTime: '2026-09-25T17:00:00',
            location: 'Virtual Room B',
            description: 'Bi-weekly retrospective and process improvement.'
          },
          {
            id: 'e_sep25_8',
            title: 'Daily Wrap-up & Tomorrow Planning',
            startTime: '2026-09-25T17:15:00',
            endTime: '2026-09-25T17:45:00',
            location: 'Office',
            description: 'Reviewing completion state and prioritizing tomorrow tasks.'
          }
        ]
      },
      dailyNotes: {
        '2026-08-15': `### #index [Architecture] System Design
- Executive briefing focused on accelerating digital transformation.
- Finalized single page binder layout using Alpine.js and clean UWSDS CSS.
- Team sync went smoothly. Reminded everyone about tomorrow's demo.

### #index [Finance] Budget Allocation
- Approved $15,000 infrastructure allocation for GCP migration.

### Daily Tracker
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
        noteContent: seedNote,
        docUrl: 'https:' + '/' + '/docs.google.com/document/d/mock-local-doc/edit'
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
      const allDailyTasks = Object.values(this.mockData.dailyTasks || {}).flat();
      const combined = [...(this.mockData.masterTasks || []), ...allDailyTasks];
      return buildMasterTasksClearinghouse(combined);
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
   * @param {string} [sourceMasterId] Optional originating master task ID.
   * @returns {Promise<object>} Created daily task item promise.
   */
  async addDailyTask(dateStr, title, category = 'General', sourceMasterId = null) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!this.mockData.dailyTasks[dateStr]) {
        this.mockData.dailyTasks[dateStr] = [];
      }
      const newTask = {
        id: `t_${Date.now()}`,
        title,
        status: '•',
        category,
        dueDate: dateStr,
        sourceMasterId: sourceMasterId || null,
        starred: false,
        notes: ''
      };
      this.mockData.dailyTasks[dateStr].push(newTask);
      return newTask;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addDailyTask(dateStr, title, category, sourceMasterId);
    });
  }

  /**
   * Adds a new master task to the undated backlog.
   * @param {string} title Task title description.
   * @param {string} [category='General'] Optional category classification.
   * @param {string} [dueDate=null] Optional due date in YYYY-MM-DD format.
   * @returns {Promise<object>} Created master task item promise.
   */
  async addMasterTask(title, category = 'General', dueDate = null) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const newTask = {
        id: `m_${Date.now()}`,
        title,
        category: category || 'General',
        status: '•',
        starred: false,
        notes: '',
        dueDate: dueDate || null,
        movedTo: null,
        movedTaskId: null
      };
      this.mockData.masterTasks.push(newTask);
      return newTask;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addMasterTask(title, category, dueDate);
    });
  }

  /**
   * Marks a master task as moved to a specific daily task list.
   * @param {string} masterTaskId Master task ID.
   * @param {string} targetDateStr Target date in YYYY-MM-DD format.
   * @param {string} movedTaskId Linked daily task ID.
   * @returns {Promise<object|null>} Updated master task object or null.
   */
  async markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const task = this.mockData.masterTasks.find(t => t.id === masterTaskId);
      if (!task) return null;
      task.movedTo = targetDateStr;
      task.movedTaskId = movedTaskId;
      task.dueDate = targetDateStr;
      task.status = '→';
      return task;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId);
    });
  }

  /**
   * Updates an existing daily task.
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

      // Mirror a status change back onto the source master task, if this daily task was transferred from one
      if (updates.status !== undefined && tasks[taskIndex].sourceMasterId) {
        const master = this.mockData.masterTasks.find(m => m.id === tasks[taskIndex].sourceMasterId);
        if (master) master.status = updates.status;
      }

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
   * Deletes a daily task entirely.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} taskId Task identifier.
   * @returns {Promise<boolean>} True if deleted.
   */
  async deleteDailyTask(dateStr, taskId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        tasks.splice(taskIndex, 1);
      }
      return true;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .deleteDailyTask(taskId);
    });
  }

  /**
   * Updates an existing master task.
   * @param {string} taskId Task identifier.
   * @param {object} updates Updated task properties.
   * @returns {Promise<object|null>} Updated master task object or null.
   */
  async updateMasterTask(taskId, updates = {}) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const taskIndex = this.mockData.masterTasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return null;

      this.mockData.masterTasks[taskIndex] = { ...this.mockData.masterTasks[taskIndex], ...updates };

      if (updates.status !== undefined && this.mockData.masterTasks[taskIndex].movedTaskId) {
        const movedId = this.mockData.masterTasks[taskIndex].movedTaskId;
        Object.values(this.mockData.dailyTasks).forEach(tasks => {
          const d = tasks.find(t => t.id === movedId);
          if (d) d.status = updates.status;
        });
      }

      return this.mockData.masterTasks[taskIndex];
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .updateMasterTask(taskId, updates);
    });
  }

  /**
   * Deletes a master task entirely.
   * @param {string} taskId Task identifier.
   * @returns {Promise<boolean>} True if deleted.
   */
  async deleteMasterTask(taskId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const taskIndex = this.mockData.masterTasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        this.mockData.masterTasks.splice(taskIndex, 1);
      }
      return true;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .deleteMasterTask(taskId);
    });
  }

  /**
   * Transfers a master task into the daily task list with priority prefix.
   * @param {string|object} masterTaskOrId Unique identifier or master task object.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise or null if master task not found.
   */
  async transferMasterTask(masterTaskOrId, dateStr, priorityGroup = 'A') {
    const masterTaskId = typeof masterTaskOrId === 'object' && masterTaskOrId !== null
      ? masterTaskOrId.id
      : masterTaskOrId;
    const masterTask = typeof masterTaskOrId === 'object' && masterTaskOrId !== null && masterTaskOrId.title
      ? masterTaskOrId
      : this.mockData?.masterTasks?.find(m => m.id === masterTaskId);
    if (!masterTask) return null;

    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const existingDaily = this.mockData.dailyTasks[dateStr] || [];
      const newDailyTask = transferMasterTaskToToday(masterTask, existingDaily, priorityGroup, dateStr);

      if (!this.mockData.dailyTasks[dateStr]) {
        this.mockData.dailyTasks[dateStr] = [];
      }
      this.mockData.dailyTasks[dateStr].push(newDailyTask);
      return newDailyTask;
    }

    const { title, category } = transferMasterTaskToToday(masterTask, [], priorityGroup, dateStr);
    return this.addDailyTask(dateStr, title, category, masterTaskId);
  }

  /**
   * Fetches the Future Planning Matrix (12-month overview) for a given year.
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getFutureMatrix(year);
    });
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .addFutureItem(year, monthKey, title, category);
    });
  }

  /**
   * Cycles a future item's Franklin-style status marker.
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .updateFutureItemStatus(year, monthKey, itemId, status);
    });
  }

  /**
   * Transfers a future planning item onto a specific day's task list, removing it from its month bucket.
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup);
    });
  }

  /**
   * Carries a still-open future item forward into next month's bucket, rolling into next calendar year if Dec.
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

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .pushFutureItemToNextMonth(year, monthKey, itemId);
    });
  }

  /**
   * Deletes a future planning item from a month's bucket.
   * @param {number|string} year Target calendar year.
   * @param {string} monthKey Target month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @returns {Promise<boolean>} Success promise.
   */
  async deleteFutureItem(year, monthKey, itemId) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return false;
      items.splice(idx, 1);
      return true;
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .deleteFutureItem(year, monthKey, itemId);
    });
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

  /**
   * Resolves the display title for a Google Drive / Docs / Sheets URL.
   * @param {string} url Target URL.
   * @returns {Promise<{success: boolean, title?: string, fileId?: string, error?: string}>}
   */
  async resolveLinkTitle(url) {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      if (!url || typeof url !== 'string') return { success: false, error: 'No URL provided.' };
      const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (!idMatch) return { success: false, error: 'Not a recognized Drive URL.' };
      const fileId = idMatch[1];
      let title = 'Document Title';
      if (url.includes('spreadsheets')) title = 'Financial Planning Spreadsheet';
      else if (url.includes('presentation')) title = 'Architecture Slide Deck';
      else if (url.includes('document')) title = 'Executive Briefing Doc';
      return { success: true, title, fileId };
    }

    return new Promise((resolve, reject) => {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .resolveDriveFileTitle(url);
    });
  }

  /**
   * Retrieves the published Google Apps Script web app URL.
   * @returns {Promise<string>} Web app /exec URL.
   */
  async getWebAppUrl() {
    if (this.useMock || typeof window === 'undefined' || !window.google?.script?.run) {
      return 'https:' + '/' + '/script.google.com/macros/s/mock-deployment-id/exec';
    }
    return new Promise((resolve) => {
      window.google.script.run
        .withSuccessHandler(url => resolve(url || ''))
        .withFailureHandler(() => resolve(''))
        .getWebAppUrl();
    });
  }
}
