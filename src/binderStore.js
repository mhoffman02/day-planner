/**
 * Franklin Planner Binder Navigation & State Store
 * Manages active page view tabs, active date selection, modal state, and universal search filter.
 */

export const VIEWS = {
  DAILY: 'daily',
  MONTHLY_CALENDAR: 'monthly-calendar',
  MASTER_TASKS: 'master-tasks',
  MONTHLY_INDEX: 'monthly-index',
  FUTURE_MATRIX: 'future-matrix'
};

export class BinderStore {
  constructor(initialDateStr = new Date().toISOString().slice(0, 10)) {
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

  setView(viewName) {
    if (Object.values(VIEWS).includes(viewName)) {
      this.activeView = viewName;
    }
  }

  setSelectedDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      this.selectedDate = dateStr;
      this.selectedYear = parseInt(dateStr.slice(0, 4), 10);
      this.selectedMonth = parseInt(dateStr.slice(5, 7), 10);
    }
  }

  navigateDay(deltaDays = 0) {
    const d = new Date(`${this.selectedDate}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    this.setSelectedDate(d.toISOString().slice(0, 10));
  }

  navigateMonth(deltaMonths = 0) {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1 + deltaMonths, 1);
    const yearStr = dateObj.getFullYear();
    const monthStr = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    this.setSelectedDate(`${yearStr}-${monthStr}-01`);
  }

  openEventModal(eventPayload) {
    this.eventModal.event = eventPayload;
    this.eventModal.isOpen = true;
  }

  closeEventModal() {
    this.eventModal.isOpen = false;
    this.eventModal.event = null;
  }

  openSearchModal() {
    this.searchModal.isOpen = true;
  }

  closeSearchModal() {
    this.searchModal.isOpen = false;
    this.searchModal.query = '';
  }
}
