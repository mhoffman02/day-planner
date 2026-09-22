/**
 * @file gasBridge.js
 * @description Day Planner GAS API Bridge & Local Mock Provider.
 * Bridges client requests to Google Apps Script backend `google.script.run` or local mock state.
 */

import { transferMasterTaskToToday } from './taskEngine.js';
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
        '2026-08-15': `# Daily Log - August 15, 2026

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
        id: `t_${Date.now()}`,
        title,
        status: '•',
        category,
        dueDate: dateStr,
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
        .addDailyTask(dateStr, title, category);
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
}
