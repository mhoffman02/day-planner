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

    this.createEventModal = {
      isOpen: false,
      newEventData: {
        title: '',
        startTime: '09:00',
        endTime: '09:25',
        duration: 25,
        attendeesText: '',
        autoGoogleMeet: true,
        guestsCanModify: true,
        autoAgendaDoc: true,
        location: '',
        description: ''
      }
    };

    this.recentAttendees = [];

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
    const [y, m] = this.selectedDate.split('-').map(Number);
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
   * Calculates end time formatted as HH:MM based on start time and duration in minutes.
   * @param {string} startStr Start time in HH:MM format.
   * @param {number} [durationMin=25] Duration in minutes (defaults to 25).
   * @returns {string} Calculated end time in HH:MM format.
   */
  calculateEndTime(startStr = '09:00', durationMin = 25) {
    const [hStr, mStr] = startStr.split(':');
    const h = parseInt(hStr, 10) || 9;
    const m = parseInt(mStr, 10) || 0;
    const totalMinutes = h * 60 + m + parseInt(durationMin, 10);
    const endH = Math.min(23, Math.floor(totalMinutes / 60));
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  /**
   * Sets meeting length duration and recalculates event end time.
   * @param {number} durationMin Duration in minutes (25, 50, 80, etc.).
   * @returns {void}
   */
  setEventDuration(durationMin) {
    this.createEventModal.newEventData.duration = durationMin;
    this.createEventModal.newEventData.endTime = this.calculateEndTime(
      this.createEventModal.newEventData.startTime,
      durationMin
    );
  }

  /**
   * Opens the create appointment modal dialog with optional start time prefill.
   * @param {string} [timeKey] Optional starting time key (e.g. '07:30').
   * @param {number} [durationMin=25] Optional duration in minutes.
   * @returns {void}
   */
  openCreateEventModal(timeKey, durationMin = 25) {
    const defaultStart = timeKey || '09:00';
    const defaultEnd = this.calculateEndTime(defaultStart, durationMin);

    this.createEventModal = {
      isOpen: true,
      newEventData: {
        title: '',
        startTime: defaultStart,
        endTime: defaultEnd,
        duration: durationMin,
        attendeesText: '',
        autoGoogleMeet: true,
        guestsCanModify: true,
        autoAgendaDoc: true,
        location: '',
        description: ''
      }
    };
  }

  /**
   * Closes the create appointment modal dialog.
   * @returns {void}
   */
  closeCreateEventModal() {
    this.createEventModal.isOpen = false;
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
