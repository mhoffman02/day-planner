/**
 * @file binderStore.js
 * @description Day Planner Binder Navigation & State Store.
 * Manages active page view tabs, active date selection, modal state, and universal search filter.
 */

/**
 * Enumeration of available binder view tabs.
 * @enum {string}
 */
export const VIEWS = {
  DAILY: 'daily',
  MONTHLY_CALENDAR: 'monthly-calendar',
  MASTER_TASKS: 'master-tasks',
  MONTHLY_INDEX: 'monthly-index',
  FUTURE_MATRIX: 'future-matrix'
};

/**
 * Formats a Date object or returns a local date string in YYYY-MM-DD format using local timezone.
 * @param {Date|string} [d=new Date()] Date object or string.
 * @returns {string} Date string in YYYY-MM-DD format.
 */
export function getLocalDateStr(d = new Date()) {
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    d = new Date(d);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * State store managing binder views, selected dates, tasks, calendar events, and modal dialog states.
 */
export class BinderStore {
  /**
   * Initializes a new BinderStore instance.
   * @param {string} [initialDateStr] Initial date in YYYY-MM-DD format (defaults to current local date).
   */
  constructor(initialDateStr = getLocalDateStr()) {
    this.activeView = VIEWS.DAILY;
    this.selectedDate = initialDateStr; // YYYY-MM-DD
    this.selectedYear = parseInt(initialDateStr.slice(0, 4), 10);
    this.selectedMonth = parseInt(initialDateStr.slice(5, 7), 10);
    
    this.eventModal = {
      isOpen: false,
      event: null
    };

    this.searchModal = {
      isOpen: false,
      query: '',
      results: { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] }
    };

    this.dailyTasks = [];
    this.masterTasks = [];
    this.calendarEvents = [];
    this.dailyNote = '';
    this.indexRecords = [];
    this.futureMatrix = {};
  }

  /**
   * Sets the active binder tab view.
   * @param {string} viewName Target view name from VIEWS enumeration.
   * @returns {void}
   */
  setView(viewName) {
    if (Object.values(VIEWS).includes(viewName)) {
      this.activeView = viewName;
    }
  }

  /**
   * Sets the selected active date for binder views.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {void}
   */
  setSelectedDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      this.selectedDate = dateStr;
      this.selectedYear = parseInt(dateStr.slice(0, 4), 10);
      this.selectedMonth = parseInt(dateStr.slice(5, 7), 10);
    }
  }

  /**
   * Navigates selected date forward or backward by day count.
   * @param {number} [deltaDays=0] Number of days to offset.
   * @returns {void}
   */
  navigateDay(deltaDays = 0) {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const target = new Date(y, m - 1, d + deltaDays);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    this.setSelectedDate(`${yyyy}-${mm}-${dd}`);
  }

  /**
   * Navigates selected date forward or backward by month count.
   * @param {number} [deltaMonths=0] Number of months to offset.
   * @returns {void}
   */
  navigateMonth(deltaMonths = 0) {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1 + deltaMonths, 1);
    const yearStr = dateObj.getFullYear();
    const monthStr = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    this.setSelectedDate(`${yearStr}-${monthStr}-01`);
  }

  /**
   * Opens event modal dialog with specified event details payload.
   * @param {object} eventPayload Event details payload.
   * @returns {void}
   */
  openEventModal(eventPayload) {
    this.eventModal.event = eventPayload;
    this.eventModal.isOpen = true;
  }

  /**
   * Closes the event modal dialog.
   * @returns {void}
   */
  closeEventModal() {
    this.eventModal.isOpen = false;
    this.eventModal.event = null;
  }

  /**
   * Opens universal search modal dialog.
   * @returns {void}
   */
  openSearchModal() {
    this.searchModal.isOpen = true;
  }

  /**
   * Closes universal search modal dialog and resets query string.
   * @returns {void}
   */
  closeSearchModal() {
    this.searchModal.isOpen = false;
    this.searchModal.query = '';
  }
}
