import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { GASBridge } from './gasBridge.js';
import { getLocalDateStr } from './binderStore.js';
import {
  parseTaskTitle,
  formatTaskTitle,
  getNextStatus,
  isValidStatus,
  STATUS_OPTIONS,
  sortTasksByColumn,
  extractInlinePriority,
  filterTasksByStatus,
  filterTasksByDateHorizon
} from './taskEngine.js';
import { executeUniversalSearch, flattenSearchResults } from './searchEngine.js';
import { formatEventDescriptionHtml, extractMeetLink } from './calendarEngine.js';
import { parseIndexEntriesFromNote } from './indexParser.js';
window.GASBridge = GASBridge;
window.Alpine = Alpine;

Alpine.data('plannerApp', () => ({
      activeView: 'daily',
      selectedDate: getLocalDateStr(),
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      
      // Data collections
      dailyTasks: [],
      openStatusMenuTaskId: null,
      statusMenuCloseTimer: null,
      statusMenuDropUp: false,
      statusOptions: STATUS_OPTIONS,
      dailyTaskSort: { column: null, direction: 'asc' },
      openNotesPopoverTaskId: null,
      notesPopoverCloseTimer: null,
      notesPopoverDropUp: false,
      masterTasks: [],
      newMasterTaskTitle: '',
      newMasterTaskCategory: '',
      newMasterTaskPriorityGroup: 'A',
      addingMasterTask: false,
      masterTaskSort: { column: null, direction: 'asc' },
      masterTaskStatusFilter: ['•', '○', '✓', '→', 'X', 'Ⓓ'],
      masterTaskDateFilter: 'all',
      dailyDocUrl: '',
      monthPickerOpen: false,
      monthPickerYear: new Date().getFullYear(),
      monthPickerCloseTimer: null,
      MONTH_NAMES_SHORT: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      futureMatrix: { year: String(new Date().getFullYear()), months: {} },
      futureMatrixYear: new Date().getFullYear(),
      newFutureItemTitle: {},
      FUTURE_MONTH_LABELS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      calendarEvents: [],
      scheduleGrid: [],
      dailyNote: '',
      noteCards: [],
      noteViewMode: 'cards', // 'cards' (Option 1) or 'doc' (Option 2)
      noteFilterMenuOpen: false,
      noteCardSearchQuery: '',
      noteCardCategoryFilter: 'ALL',
      noteCategoryOptions: ['Work', 'Personal', 'Meeting', 'Decision', 'Project'],
      selectedNoteCategories: ['Work'],
      topicColWidth: 112,
      isHeaderResizing: false,
      docPreviewEditing: false,
      noteSaveTimer: null,
      taskNoteLinks: [],
      indexRecords: [],
      monthlyGrid: [],

      // Sync & Error states
      isSyncing: false,
      errorMessage: null,

      // Modals
      eventModalOpen: false,
      selectedEvent: null,

      createEventModalOpen: false,
      newEventData: {
        title: '',
        startTime: '09:00',
        endTime: '10:00',
        location: '',
        description: ''
      },

      searchModalOpen: false,
      searchQuery: '',
      searchResults: { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] },
      selectedSearchIndex: -1,

      // Task inputs
      newTaskTitle: '',
      newTaskPriorityGroup: 'A',

      // Resizable 3-Column Layout state
      colWidths: [33.33, 33.33, 33.34],
      isResizing: false,
      activeResizerIndex: null,
      maximizedColumn: null, // 'tasks' | 'appointments' | 'notes' | null

      bridge: null,

      theme: 'light',

      get filteredNoteCards() {
        const q = (this.noteCardSearchQuery || '').trim().toLowerCase();
        const cat = this.noteCardCategoryFilter;

        return (this.noteCards || []).filter(card => {
          let matchCat = (cat === 'ALL');
          if (!matchCat) {
            if (Array.isArray(card.categories)) {
              matchCat = card.categories.includes(cat);
            } else if (typeof card.category === 'string') {
              matchCat = card.category.split(',').map(s => s.trim()).includes(cat);
            }
          }
          const matchText = !q ||
            (card.indexTopic || '').toLowerCase().includes(q) ||
            (card.heading || '').toLowerCase().includes(q) ||
            (card.content || '').toLowerCase().includes(q);
          return matchCat && matchText;
        });
      },

      get filteredMasterTasks() {
        const byStatus = filterTasksByStatus(this.masterTasks || [], this.masterTaskStatusFilter);
        return filterTasksByDateHorizon(byStatus, this.masterTaskDateFilter, getLocalDateStr());
      },

      get isMonthlyView() {
        return ['monthly-calendar', 'monthly-index', 'future-matrix'].includes(this.activeView);
      },

      get selectedMonthName() {
        return new Date(this.selectedYear, this.selectedMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      },

      get currentMonthName() {
        return new Date().toLocaleDateString('en-US', { month: 'long' });
      },

      async init() {
        this.bridge = new GASBridge(false);
        this.initTheme();
        this.initColumnWidths();
        await this.loadDayData();
        await this.loadMasterTasks();
        this.setupKeyboardShortcuts();
        // Defer initial focus to avoid iframe cross-origin autofocus block
        setTimeout(() => {
          this.focusTaskInput();
        }, 150);
      },

      initColumnWidths() {
        try {
          const saved = localStorage.getItem('dayPlannerColumnWidths');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(n => typeof n === 'number' && n >= 15 && n <= 70)) {
              const sum = parsed.reduce((a, b) => a + b, 0);
              this.colWidths = parsed.map(w => (w / sum) * 100);
            }
          }
        } catch (e) {
          console.warn('Could not load saved column widths:', e);
        }
      },

      resetColumnWidths() {
        this.colWidths = [33.33, 33.33, 33.34];
        try {
          localStorage.removeItem('dayPlannerColumnWidths');
        } catch {
          // ignore localStorage unavailable
        }
      },

      toggleMaximizeColumn(name) {
        this.maximizedColumn = this.maximizedColumn === name ? null : name;
      },

      initResize(resizerIdx, event) {
        if (this.maximizedColumn) return;
        if (event.type === 'mousedown' && event.button !== 0) return;
        event.preventDefault();

        const spreadEl = event.currentTarget.closest('.two-page-spread');
        if (!spreadEl) return;

        const rect = spreadEl.getBoundingClientRect();
        const resizersTotalPx = 32;
        const availableWidth = rect.width - resizersTotalPx;
        if (availableWidth <= 0) return;

        const startX = event.touches ? event.touches[0].clientX : event.clientX;
        const startWidths = [...this.colWidths];
        this.isResizing = true;
        this.activeResizerIndex = resizerIdx;

        const minPercent = 15;

        const onPointerMove = (e) => {
          if (!this.isResizing) return;
          const currentX = e.touches ? e.touches[0].clientX : e.clientX;
          const deltaPx = currentX - startX;
          const deltaPercent = (deltaPx / availableWidth) * 100;

          const newWidths = [...startWidths];

          if (resizerIdx === 1) {
            let w1 = startWidths[0] + deltaPercent;
            let w2 = startWidths[1] - deltaPercent;

            if (w1 < minPercent) {
              w1 = minPercent;
              w2 = startWidths[0] + startWidths[1] - minPercent;
            } else if (w2 < minPercent) {
              w2 = minPercent;
              w1 = startWidths[0] + startWidths[1] - minPercent;
            }
            newWidths[0] = w1;
            newWidths[1] = w2;
          } else if (resizerIdx === 2) {
            let w2 = startWidths[1] + deltaPercent;
            let w3 = startWidths[2] - deltaPercent;

            if (w2 < minPercent) {
              w2 = minPercent;
              w3 = startWidths[1] + startWidths[2] - minPercent;
            } else if (w3 < minPercent) {
              w3 = minPercent;
              w2 = startWidths[1] + startWidths[2] - minPercent;
            }
            newWidths[1] = w2;
            newWidths[2] = w3;
          }

          this.colWidths = newWidths;
        };

        const onPointerUp = () => {
          if (!this.isResizing) return;
          this.isResizing = false;
          this.activeResizerIndex = null;
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('mouseup', onPointerUp);
          window.removeEventListener('touchmove', onPointerMove);
          window.removeEventListener('touchend', onPointerUp);

          try {
            localStorage.setItem('dayPlannerColumnWidths', JSON.stringify(this.colWidths));
          } catch {
            // ignore localStorage quota/disabled errors
          }
        };

        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);
      },

      initTheme() {
        try {
          const saved = localStorage.getItem('dayPlannerTheme');
          if (saved) {
            this.theme = saved;
          } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.theme = 'dark';
          } else {
            this.theme = 'light';
          }
        } catch {
          this.theme = 'light';
        }
        this.applyTheme();
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('dayPlannerTheme', this.theme);
        } catch {
          // ignore localStorage quota/disabled errors
        }
        this.applyTheme();
      },

      applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
      },

      setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
          const keyLower = e.key ? e.key.toLowerCase() : '';
          const isAlt = e.altKey && !e.ctrlKey && !e.metaKey;
          const isCtrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey;

          if (isAlt || isCtrlShift) {
            if (keyLower === 'a' || keyLower === 'b' || keyLower === 'c') {
              e.preventDefault();
              const group = keyLower.toUpperCase();
              if (this.activeView === 'master-tasks') {
                this.newMasterTaskPriorityGroup = group;
                this.focusMasterTaskInput();
              } else {
                this.newTaskPriorityGroup = group;
                this.focusTaskInput();
              }
            }
          }

          if ((e.ctrlKey || e.metaKey) && keyLower === 'k') {
            e.preventDefault();
            this.toggleSearchModal();
          } else if (e.key === 'Escape') {
            if (this.searchModalOpen) {
              e.preventDefault();
              this.closeSearchModal();
            } else if (this.eventModalOpen) {
              e.preventDefault();
              this.closeEventModal();
            } else if (this.createEventModalOpen) {
              e.preventDefault();
              this.closeCreateEventModal();
            } else if (this.maximizedColumn) {
              e.preventDefault();
              this.maximizedColumn = null;
            }
          }
        });
      },

      focusTaskInput() {
        const input = document.querySelector('.task-input-field');
        if (input) {
          input.focus();
        }
      },

      focusMasterTaskInput() {
        const input = document.querySelector('.master-task-title-input');
        if (input) {
          input.focus();
        }
      },

      async trigger2WaySync() {
        this.isSyncing = true;
        this.errorMessage = null;

        try {
          await new Promise(r => setTimeout(r, 400)); // Visual indicator

          // Option A: Tasks remain strictly in Tasks; only update existing linked calendar events
          this.dailyTasks.forEach(task => {
            const isDone = task.status === '✓' || task.status === 'Ⓓ';
            const matchEvt = this.calendarEvents.find(e => e.syncTaskId === task.id);
            if (matchEvt) {
              matchEvt.title = isDone ? `[✓] ${parseTaskTitle(task.title).cleanTitle}` : task.title;
            }
          });

          this.buildScheduleGrid();
        } catch (err) {
          console.error('🔥 trigger2WaySync error:', err);
          this.errorMessage = `2-Way Sync Warning: ${err.message || err.toString()}`;
        } finally {
          this.isSyncing = false;
        }
      },

      async setView(viewName) {
        this.activeView = viewName;
        if (viewName === 'monthly-calendar') {
          this.buildMonthlyGrid();
        }
        if (viewName === 'future-matrix') {
          await this.loadFutureMatrix();
        }
        if (viewName === 'master-tasks') {
          await this.loadMasterTasks();
        }
      },

      futureMonthKey(mm) {
        return `${this.futureMatrixYear}-${mm}`;
      },

      futureMonthItems(mm) {
        return this.futureMatrix.months?.[this.futureMonthKey(mm)] || [];
      },

      async loadFutureMatrix() {
        try {
          const matrix = await this.bridge.getFutureMatrix(this.futureMatrixYear);
          Object.keys(matrix.months || {}).forEach(monthKey => {
            (matrix.months[monthKey] || []).forEach(item => {
              if (!item._transferDate) item._transferDate = `${monthKey}-01`;
            });
          });
          this.futureMatrix = matrix;
        } catch (err) {
          console.error('loadFutureMatrix error:', err);
          this.errorMessage = `Could not load Future Planning Matrix: ${err.message || err.toString()}`;
        }
      },

      async changeFutureMatrixYear(delta) {
        this.futureMatrixYear += delta;
        await this.loadFutureMatrix();
      },

      async addFutureItemToMonth(mm) {
        const monthKey = this.futureMonthKey(mm);
        const title = (this.newFutureItemTitle[monthKey] || '').trim();
        if (!title) return;
        try {
          const newItem = await this.bridge.addFutureItem(this.futureMatrixYear, monthKey, title, 'General');
          newItem._transferDate = `${monthKey}-01`;
          if (!this.futureMatrix.months[monthKey]) this.futureMatrix.months[monthKey] = [];
          this.futureMatrix.months[monthKey].push(newItem);
          this.newFutureItemTitle[monthKey] = '';
        } catch (err) {
          console.error('addFutureItemToMonth error:', err);
          this.errorMessage = `Error adding item: ${err.message || err.toString()}`;
        }
      },

      async toggleFutureItemStatus(mm, item) {
        const monthKey = this.futureMonthKey(mm);
        item.status = getNextStatus(item.status);
        try {
          await this.bridge.updateFutureItemStatus(this.futureMatrixYear, monthKey, item.id, item.status);
        } catch (err) {
          console.error('toggleFutureItemStatus error:', err);
          this.errorMessage = `Could not save item status: ${err.message || err.toString()}`;
        }
      },

      async selectFutureItemStatus(mm, item, newStatus) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = null;
        if (!isValidStatus(newStatus)) {
          console.error(`🔥 selectFutureItemStatus: ignoring invalid status "${newStatus}"`);
          return;
        }
        item.status = newStatus;
        const monthKey = this.futureMonthKey(mm);
        try {
          await this.bridge.updateFutureItemStatus(this.futureMatrixYear, monthKey, item.id, item.status);
        } catch (err) {
          console.error('selectFutureItemStatus error:', err);
          this.errorMessage = `Could not save item status: ${err.message || err.toString()}`;
        }
      },

      async transferFutureItemToDay(mm, item) {
        const monthKey = this.futureMonthKey(mm);
        const targetDate = item._transferDate;
        if (!targetDate) return;
        try {
          const transferred = await this.bridge.transferFutureItem(this.futureMatrixYear, monthKey, item.id, targetDate, 'A');
          if (transferred) {
            const items = this.futureMatrix.months[monthKey] || [];
            const idx = items.findIndex(i => i.id === item.id);
            if (idx !== -1) items.splice(idx, 1);
          }
        } catch (err) {
          console.error('transferFutureItemToDay error:', err);
          this.errorMessage = `Error transferring item: ${err.message || err.toString()}`;
        }
      },

      async pushFutureItemForward(mm, item) {
        const monthKey = this.futureMonthKey(mm);
        try {
          const pushed = await this.bridge.pushFutureItemToNextMonth(this.futureMatrixYear, monthKey, item.id);
          if (pushed) {
            const items = this.futureMatrix.months[monthKey] || [];
            const idx = items.findIndex(i => i.id === item.id);
            if (idx !== -1) items.splice(idx, 1);
          }
        } catch (err) {
          console.error('pushFutureItemForward error:', err);
          this.errorMessage = `Error pushing item forward: ${err.message || err.toString()}`;
        }
      },

      async deleteFutureItemFromMonth(mm, item) {
        const monthKey = this.futureMonthKey(mm);
        try {
          await this.bridge.deleteFutureItem(this.futureMatrixYear, monthKey, item.id);
          const items = this.futureMatrix.months[monthKey] || [];
          const idx = items.findIndex(i => i.id === item.id);
          if (idx !== -1) items.splice(idx, 1);
        } catch (err) {
          console.error('deleteFutureItemFromMonth error:', err);
          this.errorMessage = `Error deleting item: ${err.message || err.toString()}`;
        }
      },

      async navigateDay(delta) {
        const d = new Date(`${this.selectedDate}T00:00:00`);
        d.setDate(d.getDate() + delta);
        this.selectedDate = d.toISOString().slice(0, 10);
        this.selectedYear = d.getFullYear();
        this.selectedMonth = d.getMonth() + 1;
        await this.loadDayData();
      },

      async jumpToToday() {
        this.selectedDate = getLocalDateStr();
        const [y, m] = this.selectedDate.split('-').map(Number);
        this.selectedYear = y;
        this.selectedMonth = m;
        await this.loadDayData();
      },

      async navigateMonth(delta) {
        const [y, m] = this.selectedDate.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const monthStr = (d.getMonth() + 1).toString().padStart(2, '0');
        this.selectedDate = `${d.getFullYear()}-${monthStr}-01`;
        this.selectedYear = d.getFullYear();
        this.selectedMonth = d.getMonth() + 1;
        await this.loadDayData();
        await this.loadMasterTasks();
        if (this.activeView === 'monthly-calendar') {
          this.buildMonthlyGrid();
        }
      },

      async jumpToCurrentMonth() {
        const now = new Date();
        this.selectedYear = now.getFullYear();
        this.selectedMonth = now.getMonth() + 1;
        const monthStr = this.selectedMonth.toString().padStart(2, '0');
        this.selectedDate = `${this.selectedYear}-${monthStr}-01`;
        await this.loadDayData();
        await this.loadMasterTasks();
        if (this.activeView === 'monthly-calendar') {
          this.buildMonthlyGrid();
        }
      },

      openMonthPicker() {
        clearTimeout(this.monthPickerCloseTimer);
        this.monthPickerYear = this.selectedYear;
        this.monthPickerOpen = true;
      },

      scheduleMonthPickerClose() {
        clearTimeout(this.monthPickerCloseTimer);
        this.monthPickerCloseTimer = setTimeout(() => {
          this.monthPickerOpen = false;
        }, 250);
      },

      toggleMonthPicker() {
        this.monthPickerOpen = !this.monthPickerOpen;
        if (this.monthPickerOpen) {
          clearTimeout(this.monthPickerCloseTimer);
          this.monthPickerYear = this.selectedYear;
        }
      },

      changeMonthPickerYear(delta) {
        this.monthPickerYear += delta;
      },

      isCurrentCalendarMonth(year, monthNum) {
        const now = new Date();
        return year === now.getFullYear() && monthNum === (now.getMonth() + 1);
      },

      async selectNavMonth(year, monthNum) {
        this.monthPickerOpen = false;
        const monthStr = monthNum.toString().padStart(2, '0');
        this.selectedDate = `${year}-${monthStr}-01`;
        this.selectedYear = year;
        this.selectedMonth = monthNum;
        await this.loadDayData();
        await this.loadMasterTasks();
        if (this.activeView === 'monthly-calendar') {
          this.buildMonthlyGrid();
        }
      },

      async loadDayData() {
        try {
          const data = await this.bridge.getDailyData(this.selectedDate);
          if (data.error) {
            this.errorMessage = data.error;
          }
          if (data.warnings && data.warnings.length > 0) {
            this.errorMessage = data.warnings.join(' | ');
          }
          this.dailyTasks = data.tasks || [];
          this.calendarEvents = data.calendarEvents || [];
          this.dailyNote = data.noteContent || '';
          this.dailyDocUrl = data.docUrl || '';
          this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
          this.buildScheduleGrid();
          this.buildIndexRecords();
        } catch (err) {
          console.error('🔥 loadDayData error:', err);
          this.errorMessage = `Error loading daily workspace: ${err.message || err.toString()}`;
        }
      },

      initHeaderResize(e) {
        e.preventDefault();
        this.isHeaderResizing = true;
        const startX = e.clientX || (e.touches && e.touches[0].clientX);
        const startWidth = this.topicColWidth;
        const onMouseMove = (moveEvt) => {
          if (!this.isHeaderResizing) return;
          const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
          const diff = currentX - startX;
          this.topicColWidth = Math.max(60, Math.min(220, startWidth + diff));
        };
        const onMouseUp = () => {
          this.isHeaderResizing = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('touchmove', onMouseMove);
          window.removeEventListener('touchend', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove);
        window.addEventListener('touchend', onMouseUp);
      },

      resetHeaderSplit() {
        this.topicColWidth = 112;
      },

      autoGrowNoteHeading(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      },

      indexTopicOptions() {
        const topics = new Set();
        (this.noteCards || []).forEach(c => {
          if (c.indexTopic && c.indexTopic.trim()) topics.add(c.indexTopic.trim());
        });
        (this.indexRecords || []).forEach(r => {
          if (r.topic && r.topic.trim()) topics.add(r.topic.trim());
        });
        return Array.from(topics).sort();
      },

      buildTaskNoteLinks() {
        if (!this.dailyNote) {
          this.taskNoteLinks = [];
          return;
        }
        const lines = this.dailyNote.split('\n');
        const links = [];
        lines.forEach(l => {
          const trimmed = l.trim();
          const dehashed = trimmed.replace(/^#+\s+/, '');
          if (/#task\b/i.test(dehashed) || /\[TASK\]/i.test(dehashed)) {
            const clean = dehashed.replace(/#task/i, '').replace(/\[TASK\]/i, '').trim();
            const match = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (match) {
              links.push({ priority: match[1].trim().toUpperCase(), summary: match[2].trim(), rawText: trimmed });
            }
          }
        });
        this.taskNoteLinks = links;
      },

      linkedNoteForTask(task) {
        const priorityCode = this.parseTask(task.title).priorityCode;
        if (!priorityCode) return null;
        return (this.taskNoteLinks || []).find(link => link.priority === priorityCode) || null;
      },

      jumpToLinkedNote(task) {
        const link = this.linkedNoteForTask(task);
        if (!link) return;
        this.noteViewMode = 'cards';
        const card = (this.noteCards || []).find(c =>
          (c.heading || '').includes(link.rawText.replace(/^#+\s+/, '')) ||
          (c.content || '').includes(link.rawText)
        );
        if (!card) return;
        card.collapsed = false;
        this.$nextTick(() => {
          const el = document.getElementById(`note-card-${card.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      },

      taskLinkForCard(card) {
        if (!this.taskNoteLinks || !card) return null;
        return this.taskNoteLinks.find(link =>
          (card.heading || '').includes(link.rawText.replace(/^#+\s+/, '')) ||
          (card.content || '').includes(link.rawText)
        ) || null;
      },

      addNoteCard() {
        const newCard = {
          id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          indexTopic: '',
          heading: '',
          content: '',
          category: 'Work',
          categories: ['Work'],
          collapsed: false
        };
        this.noteCards.push(newCard);
        this.syncCardsToDailyNote();
      },

      deleteNoteCard(cardId) {
        this.noteCards = this.noteCards.filter(c => c.id !== cardId);
        this.syncCardsToDailyNote();
      },

      toggleCardExpand(card) {
        if (card) card.collapsed = !card.collapsed;
      },

      cardLines(card) {
        if (!card || typeof card.content !== 'string') return [''];
        const lines = card.content.split('\n');
        return lines.length > 0 ? lines : [''];
      },

      startEditingLine(card, idx) {
        if (!card) return;
        card._activeLineIndex = idx;
        card._selectedLineRange = null;
        this.$nextTick(() => {
          const el = document.getElementById(`card-line-${card.id}-${idx}`);
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        });
      },

      stopEditingLine(card, idx) {
        if (!card) return;
        if (card._activeLineIndex === idx) {
          card._activeLineIndex = null;
        }
      },

      updateCardLine(card, idx, val) {
        if (!card) return;
        const lines = this.cardLines(card);
        lines[idx] = val;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      handleLineKeydown(e, card, idx) {
        if (!card) return;
        const lines = this.cardLines(card);
        const currentLine = lines[idx] || '';

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
          if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            this.applyLineFormat(card, idx, 'bold');
            return;
          }
          if (e.key === 'i' || e.key === 'I') {
            e.preventDefault();
            this.applyLineFormat(card, idx, 'italic');
            return;
          }
          if (e.key === 'u' || e.key === 'U') {
            e.preventDefault();
            this.applyLineFormat(card, idx, 'underline');
            return;
          }
          if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            this.insertLineLink(card, idx);
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          let prefix = '';
          if (currentLine.startsWith('- ')) prefix = '- ';
          else {
            const numMatch = /^(\d+)\.\s/.exec(currentLine);
            if (numMatch) prefix = `${parseInt(numMatch[1], 10) + 1}. `;
          }
          lines.splice(idx + 1, 0, prefix);
          card.content = lines.join('\n');
          this.syncCardsToDailyNote();
          this.$nextTick(() => {
            this.startEditingLine(card, idx + 1);
          });
        } else if (e.key === 'Backspace' && !currentLine && lines.length > 1) {
          e.preventDefault();
          lines.splice(idx, 1);
          card.content = lines.join('\n');
          this.syncCardsToDailyNote();
          this.$nextTick(() => {
            this.startEditingLine(card, Math.max(0, idx - 1));
          });
        } else if (e.key === 'ArrowUp' && idx > 0) {
          e.preventDefault();
          this.startEditingLine(card, idx - 1);
        } else if (e.key === 'ArrowDown' && idx < lines.length - 1) {
          e.preventDefault();
          this.startEditingLine(card, idx + 1);
        }
      },

      clearLineSelection(card) {
        if (!card) return;
        card._selectedLineRange = null;
      },

      isLineInSelectedRange(card, idx) {
        if (!card || !card._selectedLineRange) return false;
        const lo = Math.min(card._selectedLineRange.start, card._selectedLineRange.end);
        const hi = Math.max(card._selectedLineRange.start, card._selectedLineRange.end);
        return idx >= lo && idx <= hi;
      },

      extendLineSelection(card, idx) {
        if (!card) return;
        const anchor = card._selectedLineRange ? card._selectedLineRange.start : (card._activeLineIndex ?? idx);
        card._selectedLineRange = { start: anchor, end: idx };
        card._activeLineIndex = null;
      },

      normalizeLinkUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (/^(https?|mailto):/i.test(trimmed)) return trimmed;
        if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
        return '';
      },

      insertLineLink(card, idx) {
        if (!card) return;
        const lines = this.cardLines(card);
        const text = lines[idx] || '';
        const rawUrl = window.prompt('Enter web link URL (https://...):', 'https://');
        if (!rawUrl) return;
        const url = this.normalizeLinkUrl(rawUrl);
        if (!url) return;
        const linkText = window.prompt('Enter link text (leave empty to use URL):', '') || url;
        const wrapped = `[[link:${url}]]${linkText}[[/link]]`;
        lines[idx] = text ? `${text} ${wrapped}` : wrapped;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      isGoogleDriveDocUrl(url) {
        return /^https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation|forms)\/d\/[a-zA-Z0-9_-]+/.test(url)
          || /^https:\/\/drive\.google\.com\/(?:file\/d\/[a-zA-Z0-9_-]+|open\?id=[a-zA-Z0-9_-]+)/.test(url);
      },

      async handleLinePaste(e, card, idx) {
        if (!card || idx == null || idx < 0) return;
        const clipboard = e.clipboardData || window.clipboardData;
        const pasted = clipboard ? clipboard.getData('text/plain') : '';
        const trimmed = (pasted || '').trim();
        if (!trimmed || /\s/.test(trimmed) || !this.isGoogleDriveDocUrl(trimmed)) return;

        e.preventDefault();
        const el = document.getElementById(`card-line-${card.id}-${idx}`);
        const lines = this.cardLines(card);
        if (idx >= lines.length) return;
        const text = lines[idx] || '';
        const start = el ? el.selectionStart : text.length;
        const end = el ? el.selectionEnd : text.length;
        const before = text.slice(0, start);
        const after = text.slice(end);

        let displayText = trimmed;
        try {
          const result = this.bridge && typeof this.bridge.resolveLinkTitle === 'function'
            ? await this.bridge.resolveLinkTitle(trimmed)
            : { success: false };
          if (result && result.success && result.title) {
            displayText = result.title;
          }
        } catch (err) {
          console.warn('Smart-paste title lookup failed, pasting plain URL instead:', err);
        }

        const wrapped = displayText === trimmed ? trimmed : `[[link:${trimmed}]]${displayText}[[/link]]`;
        lines[idx] = before + wrapped + after;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();

        const caretPos = before.length + wrapped.length;
        this.$nextTick(() => { if (el) { el.focus(); el.setSelectionRange(caretPos, caretPos); } });
      },

      applyRangeFormat(card, formatType) {
        if (!card || !card._selectedLineRange) return;
        const totalLines = this.cardLines(card).length;
        const lo = Math.max(0, Math.min(card._selectedLineRange.start, card._selectedLineRange.end));
        const hi = Math.min(totalLines - 1, Math.max(card._selectedLineRange.start, card._selectedLineRange.end));
        if (lo > hi) return;
        for (let i = lo; i <= hi; i++) {
          this.applyLineFormat(card, i, formatType);
        }
      },

      applyCardFormat(card, formatType) {
        if (!card) return;
        if (formatType === 'link') {
          const idx = card._activeLineIndex ?? 0;
          this.insertLineLink(card, idx);
          return;
        }
        if (card._selectedLineRange) {
          this.applyRangeFormat(card, formatType);
          return;
        }
        const idx = card._activeLineIndex ?? 0;
        this.applyLineFormat(card, idx, formatType);
      },

      applyLineFormat(card, idx, formatType) {
        if (!card) return;
        const lines = this.cardLines(card);
        if (idx >= lines.length) return;
        let line = lines[idx] || '';

        const prefixMap = { bold: '**', italic: '*', strike: '~~', underline: '__' };
        if (formatType === 'clear') {
          line = line.replace(/\*\*|~~|__|\*/g, '')
                     .replace(/\[\[color:[a-z]+\]\]/g, '')
                     .replace(/\[\[\/color\]\]/g, '')
                     .replace(/^(-\s|\d+\.\s)/, '');
        } else if (formatType === 'bullet') {
          if (line.startsWith('- ')) line = line.slice(2);
          else if (/^\d+\.\s/.test(line)) line = `- ${line.replace(/^\d+\.\s/, '')}`;
          else line = `- ${line}`;
        } else if (formatType === 'ordered') {
          const numMatch = /^(\d+)\.\s/.exec(line);
          if (numMatch) {
            line = line.replace(/^\d+\.\s/, '');
          } else {
            let prevNum = 0;
            if (idx > 0) {
              const prevMatch = /^(\d+)\.\s/.exec(lines[idx - 1] || '');
              if (prevMatch) prevNum = parseInt(prevMatch[1], 10);
            }
            if (line.startsWith('- ')) line = line.slice(2);
            line = `${prevNum + 1}. ${line}`;
          }
        } else if (formatType === 'color-default') {
          line = line.replace(/\[\[color:[a-z]+\]\]/g, '').replace(/\[\[\/color\]\]/g, '');
        } else if (formatType.startsWith('color-')) {
          const color = formatType.replace('color-', '');
          line = line.replace(/\[\[color:[a-z]+\]\]/g, '').replace(/\[\[\/color\]\]/g, '');
          const listMatch = /^(-\s|\d+\.\s)/.exec(line);
          if (listMatch) {
            const marker = listMatch[0];
            const rest = line.slice(marker.length);
            line = `${marker}[[color:${color}]]${rest}[[/color]]`;
          } else {
            line = `[[color:${color}]]${line}[[/color]]`;
          }
        } else if (prefixMap[formatType]) {
          const m = prefixMap[formatType];
          const listMatch = /^(-\s|\d+\.\s)/.exec(line);
          const markerLen = listMatch ? listMatch[0].length : 0;
          const prefix = listMatch ? listMatch[0] : '';
          const body = line.slice(markerLen);
          if (body.startsWith(m) && body.endsWith(m) && body.length >= m.length * 2) {
            line = prefix + body.slice(m.length, body.length - m.length);
          } else {
            line = `${prefix}${m}${body}${m}`;
          }
        }
        lines[idx] = line;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      cardNoteColor(card) {
        const m = /\[\[color:(teal|red|green|blue)\]\]/.exec((card && card.content) || '');
        return m ? m[1] : null;
      },

      normalizeLeadingListMarker(text) {
        const wrapperOpenRe = /^(?:\[\[color:(?:teal|red|green|blue)\]\]|\*\*|~~|__|\*)/;
        const wrapperMatch = wrapperOpenRe.exec(text);
        if (!wrapperMatch) return text;
        const rest = text.slice(wrapperMatch[0].length);
        const listMatch = /^(-\s|\d+\.\s)/.exec(rest);
        if (!listMatch) return text;
        return listMatch[0] + wrapperMatch[0] + rest.slice(listMatch[0].length);
      },

      renderCardLine(text, isPlaceholder) {
        if (isPlaceholder) {
          return '<span class="note-card-empty-placeholder">Click to add notes for this topic&hellip;</span>';
        }

        text = this.normalizeLeadingListMarker(text);
        text = text.replace(/^#+\s*/, '');

        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const renderInline = (line) => {
          let html = escapeHtml(line);
          html = html.replace(/#index\s+\[([^\]]+)\]/gi, '<span class="doc-preview-topic-badge">$1</span>');
          html = html.replace(/#task\s+\[([A-C]\d)\]/gi, '<span class="priority-badge">[$1]</span>');
          html = html.replace(/\[\[color:(teal|red|green|blue)\]\](.+?)\[\[\/color\]\]/g, '<span class="note-render-color-$1">$2</span>');
          html = html.replace(/\[\[link:((?:https?|mailto):[^\]\s]+)\]\](.+?)\[\[\/link\]\]/g, (_m, url, linkText) => {
            const safeHrefUrl = url.replace(/"/g, '&quot;');
            return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${linkText}</a>`;
          });
          html = html.replace(/\*\*(.+?)\*\*/g, '<span class="note-render-bold">$1</span>');
          html = html.replace(/~~(.+?)~~/g, '<span class="note-render-strike">$1</span>');
          html = html.replace(/__(.+?)__/g, '<span class="note-render-underline">$1</span>');
          html = html.replace(/\*(.+?)\*/g, '<span class="note-render-italic">$1</span>');
          return html;
        };

        const orderedRe = /^\d+\.\s/;
        if (text.startsWith('- ')) {
          return `<ul class="note-render-list"><li>${renderInline(text.slice(2))}</li></ul>`;
        }
        if (orderedRe.test(text)) {
          const num = parseInt(orderedRe.exec(text)[0], 10);
          return `<ol class="note-render-list"><li value="${num}">${renderInline(text.replace(orderedRe, ''))}</li></ol>`;
        }
        return `<div class="note-render-line">${renderInline(text) || '&nbsp;'}</div>`;
      },

      renderDailyNotePreview() {
        const text = this.dailyNote || '';
        if (!text.trim()) return this.renderCardLine('', true);

        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        return text.split('\n').map(line => {
          const h3Match = /^###\s+(.*)$/.exec(line);
          if (h3Match) {
            const { indexTopic, heading } = this.decomposeIndexHeading(h3Match[1].trim());
            if (indexTopic) {
              return `<h3 class="doc-preview-heading"><span class="doc-preview-topic-badge">${escapeHtml(indexTopic)}</span><span class="doc-preview-heading-text">${escapeHtml(heading || 'Topic')}</span></h3>`;
            }
            return `<h3 class="doc-preview-heading">${escapeHtml(heading)}</h3>`;
          }
          const h1Match = /^#\s+(.*)$/.exec(line);
          if (h1Match) return `<h2 class="doc-preview-heading-main">${escapeHtml(h1Match[1])}</h2>`;
          return this.renderCardLine(line, false);
        }).join('');
      },

      decomposeIndexHeading(headingClean) {
        if (!/#index|\[INDEX\]/i.test(headingClean)) {
          return { indexTopic: '', heading: headingClean };
        }
        let clean = headingClean.replace(/#index|\[INDEX\]/gi, '').trim();
        let indexTopic = 'General';
        const bracketMatch = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (bracketMatch) {
          indexTopic = bracketMatch[1].trim();
          clean = bracketMatch[2].trim();
        } else if (clean.includes(':')) {
          const parts = clean.split(':');
          indexTopic = parts[0].trim();
          clean = parts.slice(1).join(':').trim();
        }
        return { indexTopic, heading: clean };
      },

      parseDailyNoteToCards(noteText = '') {
        if (!noteText.trim() || noteText.startsWith('No notes recorded for')) {
          return [
            { id: 'nc_1', indexTopic: 'Architecture', heading: 'System Design', content: '- Finalized 3-column binder layout with Alpine.js and clean CSS.', category: 'Work', categories: ['Work'], collapsed: false },
            { id: 'nc_2', indexTopic: 'Finance', heading: 'Budget Sync', content: '- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.', category: 'Meeting', categories: ['Meeting'], collapsed: false }
          ];
        }

        let fileFallbackCategories = null;
        const allLines = (noteText || '').split('\n');
        allLines.forEach(l => {
          const trimmed = l.trim();
          if (!trimmed) return;
          const catMatch = trimmed.match(/^#(?:category|categories):\s*(.+)$/i) || trimmed.match(/^categories:\s*(.+)$/i);
          if (catMatch && !fileFallbackCategories) {
            fileFallbackCategories = catMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          }
        });

        const lines = noteText.split('\n');
        const cards = [];
        let currentCard = null;

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) {
            if (currentCard && currentCard.content) {
              currentCard.content += '\n';
            }
            return;
          }

          // Check for category metadata tag line
          const catMatch = trimmed.match(/^#(?:category|categories):\s*(.+)$/i) || trimmed.match(/^categories:\s*(.+)$/i);
          if (catMatch) {
            const parsedCats = catMatch[1].split(',').map(s => s.trim()).filter(Boolean);
            if (currentCard) {
              currentCard.categories = parsedCats;
              currentCard.category = parsedCats.join(', ');
            }
            return;
          }

          // Skip document title headers (e.g. "# Daily Log - Aug 15, 2026", "# Aug 15, 2026")
          if (/^#\s+(Daily Log|Day Planner|\w+\s+\d{1,2},|\d{4}-\d{2}-\d{2})/i.test(trimmed)) {
            return;
          }

          if (/^#{2,3}\s+/.test(trimmed)) {
            let headingClean = trimmed.replace(/^#+\s*/, '').trim();
            if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}$/i.test(headingClean) ||
                /^\d{4}-\d{2}-\d{2}$/.test(headingClean)) {
              return;
            }
            if (currentCard) {
              if (fileFallbackCategories && (!currentCard.categories || currentCard.categories.length === 0)) {
                currentCard.categories = [...fileFallbackCategories];
                currentCard.category = fileFallbackCategories.join(', ');
              }
              cards.push(currentCard);
            }
            headingClean = headingClean.replace(/^Daily Log\s*[-–—]?\s*/i, '');
            const category = headingClean.toLowerCase().includes('meeting') ? 'Meeting' : headingClean.toLowerCase().includes('finance') ? 'Decision' : headingClean.toLowerCase().includes('personal') ? 'Personal' : 'Work';
            const { indexTopic, heading } = this.decomposeIndexHeading(headingClean);
            currentCard = {
              id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              indexTopic,
              heading: heading || 'Topic',
              content: '',
              category,
              categories: [category],
              collapsed: false
            };
          } else {
            if (!currentCard) {
              currentCard = {
                id: `nc_default_${Date.now()}`,
                indexTopic: '',
                heading: 'General Notes',
                content: '',
                category: (fileFallbackCategories && fileFallbackCategories[0]) || 'Work',
                categories: fileFallbackCategories ? [...fileFallbackCategories] : ['Work'],
                collapsed: false
              };
            }
            currentCard.content += (currentCard.content ? '\n' : '') + line;
          }
        });
        if (currentCard) {
          if (fileFallbackCategories && (!currentCard.categories || currentCard.categories.length === 0)) {
            currentCard.categories = [...fileFallbackCategories];
            currentCard.category = fileFallbackCategories.join(', ');
          }
          cards.push(currentCard);
        }
        return cards;
      },

      syncCardsToDailyNote() {
        if (!this.noteCards || this.noteCards.length === 0) {
          this.dailyNote = '';
          this.buildIndexRecords();
          this.scheduleDailyNoteSave();
          return;
        }

        const cardsMarkdown = this.noteCards.map(c => {
          const headingLine = c.indexTopic
            ? `#index [${c.indexTopic}] ${c.heading || 'Topic'}`
            : (c.heading || 'Topic');
          const cats = (Array.isArray(c.categories) && c.categories.length > 0)
            ? c.categories
            : (c.category ? c.category.split(',').map(s => s.trim()).filter(Boolean) : ['Work']);
          const catLine = cats.length > 0 ? `#category: ${cats.join(', ')}\n` : '';
          return `### ${headingLine}\n${catLine}${c.content || ''}`;
        }).join('\n\n');

        this.dailyNote = cardsMarkdown;
        this.buildIndexRecords();
        this.scheduleDailyNoteSave();
      },

      toggleCardCategory(card, cat) {
        if (!card || !cat) return;
        if (!Array.isArray(card.categories)) {
          card.categories = card.category
            ? card.category.split(',').map(s => s.trim()).filter(Boolean)
            : ['Work'];
        }
        const idx = card.categories.indexOf(cat);
        if (idx !== -1) {
          card.categories.splice(idx, 1);
        } else {
          card.categories.push(cat);
        }
        card.category = card.categories.join(', ');
        this.syncCardsToDailyNote();
      },

      isCardCategorySelected(card, cat) {
        if (!card || !cat) return false;
        if (Array.isArray(card.categories)) {
          return card.categories.includes(cat);
        }
        if (typeof card.category === 'string') {
          return card.category.split(',').map(s => s.trim()).includes(cat);
        }
        return false;
      },

      toggleNoteCategory(cat) {
        if (!cat) return;
        if (!Array.isArray(this.selectedNoteCategories)) {
          this.selectedNoteCategories = [];
        }
        const idx = this.selectedNoteCategories.indexOf(cat);
        if (idx !== -1) {
          this.selectedNoteCategories.splice(idx, 1);
        } else {
          this.selectedNoteCategories.push(cat);
        }
        this.syncCardsToDailyNote();
      },

      isNoteCategorySelected(cat) {
        return Array.isArray(this.selectedNoteCategories) && this.selectedNoteCategories.includes(cat);
      },

      syncDailyNoteToCards() {
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildIndexRecords();
      },

      scheduleDailyNoteSave() {
        if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
        this.noteSaveTimer = setTimeout(async () => {
          if (!this.bridge || typeof this.bridge.saveDailyDocCards !== 'function') return;
          try {
            await this.bridge.saveDailyDocCards(this.selectedDate, this.dailyNote);
          } catch (err) {
            console.error('🔥 saveDailyDocCards error:', err);
            this.errorMessage = `Could not save daily note: ${err.message || err.toString()}`;
          }
        }, 1200);
      },

      async loadMasterTasks() {
        try {
          this.masterTasks = await this.bridge.getMasterTasks(`${this.selectedMonthName} ${this.selectedYear}`);
          const today = getLocalDateStr();
          this.masterTasks.forEach(t => {
            if (!t._moveDate) t._moveDate = today;
            t._moving = false;
          });
        } catch (err) {
          console.error('🔥 loadMasterTasks error:', err);
          this.errorMessage = `Error loading master tasks: ${err.message || err.toString()}`;
        }
      },

      async addMasterTask() {
        const extracted = extractInlinePriority(this.newMasterTaskTitle, this.newMasterTaskPriorityGroup);
        this.newMasterTaskPriorityGroup = extracted.priorityGroup;
        const taskTitle = extracted.cleanTitle;
        if (!taskTitle || this.addingMasterTask) return;
        this.addingMasterTask = true;
        try {
          const category = this.newMasterTaskCategory.trim() || 'General';
          const existingCount = this.masterTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newMasterTaskPriorityGroup, existingCount, taskTitle);
          const created = await this.bridge.addMasterTask(formattedTitle, category);
          created._moveDate = getLocalDateStr();
          created._moving = false;
          if (!created.category) created.category = category;
          if (!created.status) created.status = '•';
          this.masterTasks.push(created);
          this.newMasterTaskTitle = '';
          this.newMasterTaskCategory = '';
        } catch (err) {
          console.error('🔥 addMasterTask error:', err);
          this.errorMessage = `Could not add master task: ${err.message || err.toString()}`;
        } finally {
          this.addingMasterTask = false;
        }
      },

      async deleteMasterTask(task) {
        if (!task || !task.id) return;
        this.openStatusMenuTaskId = null;
        try {
          const idx = this.masterTasks.findIndex(t => t.id === task.id);
          if (idx !== -1) {
            this.masterTasks.splice(idx, 1);
          }
          if (this.bridge && typeof this.bridge.deleteMasterTask === 'function') {
            await this.bridge.deleteMasterTask(task.id);
          } else if (this.bridge && typeof this.bridge.deleteDailyTask === 'function') {
            await this.bridge.deleteDailyTask('', task.id);
          }
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 deleteMasterTask error:', err);
          this.errorMessage = `Error deleting master task: ${err.message || err.toString()}`;
        }
      },

      isMasterTaskStatusFilterActive(statusVal) {
        if (!this.masterTaskStatusFilter || !Array.isArray(this.masterTaskStatusFilter)) return true;
        const norm = (statusVal === 'D/✓') ? 'Ⓓ' : statusVal;
        return this.masterTaskStatusFilter.includes(statusVal) || this.masterTaskStatusFilter.includes(norm);
      },

      toggleMasterTaskStatusFilter(statusVal) {
        if (!this.masterTaskStatusFilter || !Array.isArray(this.masterTaskStatusFilter)) {
          this.masterTaskStatusFilter = this.statusOptions.map(o => o.value);
        }
        const norm = (statusVal === 'D/✓') ? 'Ⓓ' : statusVal;
        const idx = this.masterTaskStatusFilter.findIndex(s => s === statusVal || s === norm);
        if (idx !== -1) {
          this.masterTaskStatusFilter.splice(idx, 1);
        } else {
          this.masterTaskStatusFilter.push(statusVal);
        }
      },

      isAllMasterTaskStatusSelected() {
        if (!this.masterTaskStatusFilter || !this.statusOptions) return true;
        return this.statusOptions.every(opt => this.isMasterTaskStatusFilterActive(opt.value));
      },

      toggleAllMasterTaskStatusFilters() {
        if (this.isAllMasterTaskStatusSelected()) {
          this.masterTaskStatusFilter = ['•'];
        } else {
          this.masterTaskStatusFilter = this.statusOptions.map(opt => opt.value);
        }
      },

      setMasterTaskDateFilter(horizon) {
        this.masterTaskDateFilter = horizon;
      },

      isMasterTaskOverdue(mTask) {
        return Boolean(mTask && mTask.dueDate && mTask.dueDate < getLocalDateStr());
      },

      formatMasterTaskDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },

      formatMovedDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      },

      async moveMasterTaskToDate(mTask) {
        if (mTask._moving) return;
        if (mTask.movedTo) return;
        mTask._moving = true;
        const targetDate = mTask._moveDate || getLocalDateStr();
        try {
          const transferred = await this.bridge.transferMasterTask(mTask, targetDate, 'A');
          if (transferred) {
            if (targetDate === this.selectedDate) {
              this.dailyTasks.push(transferred);
            }
            const updatedMaster = await this.bridge.markMasterTaskMoved(mTask.id, targetDate, transferred.id);
            if (updatedMaster) {
              mTask.movedTo = updatedMaster.movedTo;
              mTask.movedTaskId = updatedMaster.movedTaskId;
              mTask.status = updatedMaster.status || '→';
              mTask.dueDate = updatedMaster.movedTo || targetDate;
            }
            await this.trigger2WaySync();
          }
        } catch (err) {
          console.error('🔥 moveMasterTaskToDate error:', err);
          this.errorMessage = `Error moving master task: ${err.message || err.toString()}`;
        } finally {
          mTask._moving = false;
        }
      },

      buildScheduleGrid() {
        const slots = [];
        for (let hour = 7; hour < 19; hour++) {
          const hourStr = hour > 12 ? `${hour - 12}` : `${hour}`;
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const key00 = `${hour.toString().padStart(2, '0')}:00`;
          const key30 = `${hour.toString().padStart(2, '0')}:30`;

          slots.push({ timeKey: key00, displayTime: `${hourStr}:00 ${ampm}`, events: [] });
          slots.push({ timeKey: key30, displayTime: `${hourStr}:30 ${ampm}`, events: [] });
        }
        slots.push({ timeKey: '19:00', displayTime: '7:00 PM', events: [] });

        // Map events
        this.calendarEvents.forEach(evt => {
          let slotKey = null;
          if (evt.startTime) {
            const start = new Date(evt.startTime);
            if (!isNaN(start.getTime())) {
              const startHour = start.getHours();
              const startMin = start.getMinutes();
              const slotMin = startMin < 30 ? '00' : '30';
              slotKey = `${startHour.toString().padStart(2, '0')}:${slotMin}`;
            }
          }
          if (slotKey) {
            const slot = slots.find(s => s.timeKey === slotKey);
            if (slot) slot.events.push(evt);
          }
        });

        this.scheduleGrid = slots;
      },

      buildIndexRecords() {
        if (this.noteCards && this.noteCards.length > 0) {
          const entries = [];
          const fallbackUrl = this.getDirectDocUrl('');
          this.noteCards.forEach(c => {
            if (c.indexTopic) {
              const cardCats = (Array.isArray(c.categories) && c.categories.length > 0)
                ? c.categories
                : (c.category ? c.category.split(',').map(s => s.trim()).filter(Boolean) : ['Work']);
              entries.push({
                date: this.selectedDate,
                topic: c.indexTopic,
                category: cardCats.join(', '),
                categories: [...cardCats],
                summary: c.heading || '',
                docUrl: fallbackUrl
              });
            }
          });
          this.indexRecords = entries;
          this.buildTaskNoteLinks();
          return;
        }

        if (!this.dailyNote) return;
        const fallbackUrl = this.getDirectDocUrl('');
        this.indexRecords = parseIndexEntriesFromNote(this.dailyNote, this.selectedDate, fallbackUrl);
        this.buildTaskNoteLinks();
      },

      getDirectDocUrl(url) {
        if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('script.googleusercontent.com')) {
          return url;
        }
        if (this.dailyDocUrl && typeof this.dailyDocUrl === 'string' && this.dailyDocUrl.startsWith('http') && !this.dailyDocUrl.includes('script.googleusercontent.com')) {
          return this.dailyDocUrl;
        }
        return 'https:' + '/' + '/docs.google.com/document/';
      },

      async jumpToDailyPage(dateStr, topic = '') {
        if (!dateStr) return;
        this.selectedDate = dateStr;
        await this.setView('daily');
        await this.loadDayData();
        if (topic) {
          const match = (this.noteCards || []).find(c => (c.indexTopic || '').toLowerCase() === topic.toLowerCase());
          if (match) {
            match.collapsed = false;
          }
        }
      },

      buildMonthlyGrid() {
        const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0);
        const days = [];
        const startDayOfWeek = firstDay.getDay();

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        const eventsSource = (this.bridge?.useMock && this.bridge?.mockData?.calendarEvents)
          ? Object.values(this.bridge.mockData.calendarEvents).flat()
          : (this.calendarEvents || []);

        for (let day = 1; day <= lastDay.getDate(); day++) {
          const dateStr = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const dayEvents = eventsSource.filter(e => {
            if (!e.startTime) return false;
            const d = new Date(e.startTime);
            if (isNaN(d.getTime())) return e.startTime.startsWith(dateStr);
            const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return localDate === dateStr;
          });
          days.push({ dateStr, dayNum: day, isCurrentMonth: true, events: dayEvents });
        }

        while (days.length % 7 !== 0) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        this.monthlyGrid = days;
      },

      handleTaskTitleInput() {
        const val = this.newTaskTitle || '';
        const match = val.match(/^#([abcABC])(?:\s*[:-]\s*|\s+|$)/);
        if (match) {
          this.newTaskPriorityGroup = match[1].toUpperCase();
          if (match[0].length < val.length || /\s/.test(match[0])) {
            this.newTaskTitle = val.replace(/^#([abcABC])(?:\s*[:-]\s*|\s+)/, '');
          }
        }
      },

      handleMasterTaskTitleInput() {
        const val = this.newMasterTaskTitle || '';
        const match = val.match(/^#([abcABC])(?:\s*[:-]\s*|\s+|$)/);
        if (match) {
          this.newMasterTaskPriorityGroup = match[1].toUpperCase();
          if (match[0].length < val.length || /\s/.test(match[0])) {
            this.newMasterTaskTitle = val.replace(/^#([abcABC])(?:\s*[:-]\s*|\s+)/, '');
          }
        }
      },

      async addDailyTask() {
        const extracted = extractInlinePriority(this.newTaskTitle, this.newTaskPriorityGroup);
        this.newTaskPriorityGroup = extracted.priorityGroup;
        const taskTitle = extracted.cleanTitle;
        if (!taskTitle) return;
        try {
          const existingCount = this.dailyTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newTaskPriorityGroup, existingCount, taskTitle);
          const newTask = await this.bridge.addDailyTask(this.selectedDate, formattedTitle);
          this.dailyTasks.push(newTask);
          this.newTaskTitle = '';
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 addDailyTask error:', err);
          this.errorMessage = `Error adding task: ${err.message || err.toString()}`;
        }
      },

      async deleteDailyTask(task) {
        if (!task || !task.id) return;
        this.openStatusMenuTaskId = null;
        try {
          const idx = this.dailyTasks.findIndex(t => t.id === task.id);
          if (idx !== -1) {
            this.dailyTasks.splice(idx, 1);
          }
          if (this.bridge && typeof this.bridge.deleteDailyTask === 'function') {
            await this.bridge.deleteDailyTask(this.selectedDate, task.id);
          }
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 deleteDailyTask error:', err);
          this.errorMessage = `Error deleting task: ${err.message || err.toString()}`;
        }
      },

      setTaskSort(sortStateKey, column) {
        const state = this[sortStateKey];
        if (state.column === column) {
          state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.column = column;
          state.direction = 'asc';
        }
      },

      sortedTasks(tasks, sortState) {
        if (!sortState || !sortState.column) return tasks;
        return sortTasksByColumn(tasks, sortState.column, sortState.direction);
      },

      async toggleTaskStar(task) {
        const previous = Boolean(task.starred);
        task.starred = !previous;
        const isMaster = this.masterTasks.some(m => m.id === task.id);
        try {
          let updated = null;
          if (isMaster) {
            if (this.bridge && typeof this.bridge.updateMasterTask === 'function') {
              updated = await this.bridge.updateMasterTask(task.id, { starred: task.starred });
            } else if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
              updated = await this.bridge.updateDailyTask('', task.id, { starred: task.starred });
            }
          } else {
            updated = await this.bridge.updateDailyTask(this.selectedDate, task.id, { starred: task.starred });
          }
          if (!updated) {
            task.starred = previous;
          }
        } catch (err) {
          task.starred = previous;
          console.error('🔥 toggleTaskStar persist error:', err);
        }
      },

      hasNotes(task) {
        return Boolean(task.notes && task.notes.trim());
      },

      openNotesPopover(taskId, event) {
        clearTimeout(this.notesPopoverCloseTimer);
        this.openNotesPopoverTaskId = taskId;
        if (event && (event.currentTarget || event.target)) {
          const el = event.currentTarget || event.target;
          const rect = el.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          this.notesPopoverDropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
        }
      },

      toggleNotesPopover(taskId, event) {
        clearTimeout(this.notesPopoverCloseTimer);
        if (this.openNotesPopoverTaskId === taskId) {
          this.openNotesPopoverTaskId = null;
        } else {
          this.openNotesPopoverTaskId = taskId;
          if (event && (event.currentTarget || event.target)) {
            const el = event.currentTarget || event.target;
            const rect = el.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            this.notesPopoverDropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
          }
        }
      },

      scheduleNotesPopoverClose(taskId) {
        clearTimeout(this.notesPopoverCloseTimer);
        this.notesPopoverCloseTimer = setTimeout(() => {
          if (this.openNotesPopoverTaskId === taskId) this.openNotesPopoverTaskId = null;
        }, 250);
      },

      openStatusMenu(taskId, event) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = taskId;
        if (event && (event.currentTarget || event.target)) {
          const el = event.currentTarget || event.target;
          const rect = el.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          this.statusMenuDropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
        }
      },

      toggleStatusMenu(taskId, event) {
        clearTimeout(this.statusMenuCloseTimer);
        if (this.openStatusMenuTaskId === taskId) {
          this.openStatusMenuTaskId = null;
        } else {
          this.openStatusMenuTaskId = taskId;
          if (event && (event.currentTarget || event.target)) {
            const el = event.currentTarget || event.target;
            const rect = el.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            this.statusMenuDropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
          }
        }
      },

      scheduleStatusMenuClose(taskId) {
        clearTimeout(this.statusMenuCloseTimer);
        this.statusMenuCloseTimer = setTimeout(() => {
          if (this.openStatusMenuTaskId === taskId) this.openStatusMenuTaskId = null;
        }, 250);
      },

      async selectTaskStatus(task, newStatus) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = null;
        await this.setTaskStatus(task, newStatus);
      },

      async setTaskStatus(task, newStatus) {
        if (!isValidStatus(newStatus)) {
          console.error(`🔥 setTaskStatus: ignoring invalid status "${newStatus}"`);
          return;
        }
        task.status = newStatus;
        const isMaster = this.masterTasks.some(m => m.id === task.id);
        const linkedMaster = !isMaster ? this.masterTasks.find(m => m.movedTaskId === task.id) : null;
        if (linkedMaster) linkedMaster.status = newStatus;
        if (isMaster && task.movedTaskId) {
          const linkedDaily = this.dailyTasks.find(d => d.id === task.movedTaskId);
          if (linkedDaily) linkedDaily.status = newStatus;
        }
        try {
          if (isMaster) {
            if (this.bridge && typeof this.bridge.updateMasterTask === 'function') {
              await this.bridge.updateMasterTask(task.id, {
                title: task.title,
                status: task.status,
                category: task.category
              });
            } else if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
              await this.bridge.updateDailyTask('', task.id, {
                title: task.title,
                status: task.status
              });
            }
          } else {
            if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
              await this.bridge.updateDailyTask(this.selectedDate, task.id, {
                title: task.title,
                status: task.status,
                dueDate: task.dueDate
              });
            }
          }
        } catch (err) {
          console.error('🔥 setTaskStatus persist error:', err);
          this.errorMessage = `Could not save task status: ${err.message || err.toString()}`;
        }
        await this.trigger2WaySync();
      },

      async toggleTaskStatus(task) {
        await this.setTaskStatus(task, getNextStatus(task.status));
      },

      async moveMasterTaskToToday(mTask) {
        mTask._moveDate = this.selectedDate;
        await this.moveMasterTaskToDate(mTask);
      },

      openEventModal(evt) {
        if (!evt) return;
        const dateStr = (evt.startTime ? evt.startTime.slice(0, 10) : this.selectedDate) || new Date().toISOString().slice(0, 10);
        const gCalLink = evt.gCalLink || evt.htmlLink || `https://calendar.google.com/calendar/r/day/${dateStr.replace(/-/g, '/')}`;
        const meetLink = this.extractMeetLink(evt);
        this.selectedEvent = {
          ...evt,
          meetLink,
          gCalLink,
          formattedTime: this.formatEventTime(evt)
        };
        this.eventModalOpen = true;
      },

      extractMeetLink(evt) {
        return extractMeetLink(evt);
      },

      formatEventDescription(description) {
        return formatEventDescriptionHtml(description);
      },

      formatEventTime(evt) {
        if (!evt) return '';
        if (evt.formattedTime) return evt.formattedTime;
        if (!evt.startTime) return 'All Day';
        const start = new Date(evt.startTime);
        if (isNaN(start.getTime())) return evt.startTime;
        const startStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (!evt.endTime) return startStr;
        const end = new Date(evt.endTime);
        if (isNaN(end.getTime())) return startStr;
        const endStr = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `${startStr} - ${endStr}`;
      },

      closeEventModal() {
        this.eventModalOpen = false;
        this.selectedEvent = null;
      },

      openCreateEventModal() {
        this.newEventData = {
          title: '',
          startTime: '09:00',
          endTime: '10:00',
          location: '',
          description: ''
        };
        this.createEventModalOpen = true;
      },

      closeCreateEventModal() {
        this.createEventModalOpen = false;
      },

      launchNativeGCalCreate() {
        const title = encodeURIComponent(this.newEventData.title || 'New Appointment');
        const location = encodeURIComponent(this.newEventData.location || '');
        const details = encodeURIComponent(this.newEventData.description || '');

        const dateFormatted = (this.selectedDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
        const startH = (this.newEventData.startTime || '09:00').replace(':', '') + '00';
        const endH = (this.newEventData.endTime || '10:00').replace(':', '') + '00';
        const dates = `${dateFormatted}T${startH}/${dateFormatted}T${endH}`;

        const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&location=${location}&details=${details}`;
        window.open(gCalUrl, 'gCalNativeNewAppt', 'width=750,height=680,resizable=yes,scrollbars=yes');
        this.closeCreateEventModal();
      },

      async saveNewEvent() {
        if (!this.newEventData.title.trim()) return;
        try {
          const startIso = `${this.selectedDate}T${this.newEventData.startTime || '09:00'}:00Z`;
          const endIso = `${this.selectedDate}T${this.newEventData.endTime || '10:00'}:00Z`;

          const newEvt = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: this.newEventData.title.trim(),
            startTime: startIso,
            endTime: endIso,
            location: this.newEventData.location ? this.newEventData.location.trim() : '',
            description: this.newEventData.description ? this.newEventData.description.trim() : '',
            gCalLink: `https://calendar.google.com/calendar/r/day/${this.selectedDate.replace(/-/g, '/')}`
          };

          this.calendarEvents.push(newEvt);
          this.buildScheduleGrid();
          this.closeCreateEventModal();
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 saveNewEvent error:', err);
          this.errorMessage = `Error saving appointment: ${err.message || err.toString()}`;
        }
      },

      openSearchModal() {
        this.searchModalOpen = true;
        this.selectedSearchIndex = this.getFlattenedSearchResults().length > 0 ? 0 : -1;
        this.$nextTick(() => {
          const focusInput = () => {
            const input = this.$refs.searchInput || document.querySelector('.search-input-field');
            if (input) {
              input.focus();
              input.select();
            }
          };
          focusInput();
          setTimeout(focusInput, 50);
        });
      },

      closeSearchModal() {
        this.searchModalOpen = false;
        this.searchQuery = '';
        this.searchResults = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] };
        this.selectedSearchIndex = -1;
      },

      toggleSearchModal() {
        if (this.searchModalOpen) {
          this.closeSearchModal();
        } else {
          this.openSearchModal();
          if (this.searchQuery) {
            this.runSearch();
          }
        }
      },

      getFlattenedSearchResults() {
        return flattenSearchResults(this.searchResults);
      },

      runSearch() {
        const q = this.searchQuery.trim();
        if (!q) {
          this.searchResults = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] };
          this.selectedSearchIndex = -1;
          return;
        }

        const store = {
          calendarEvents: (this.bridge?.useMock && this.bridge?.mockData?.calendarEvents
            ? Object.values(this.bridge.mockData.calendarEvents).flat()
            : this.calendarEvents) || [],
          dailyTasks: (this.bridge?.useMock && this.bridge?.mockData?.dailyTasks
            ? Object.values(this.bridge.mockData.dailyTasks).flat()
            : this.dailyTasks) || [],
          masterTasks: this.masterTasks || [],
          dailyNotes: (this.bridge?.useMock && this.bridge?.mockData?.dailyNotes
            ? this.bridge.mockData.dailyNotes
            : (this.dailyNote ? [{ date: this.selectedDate, content: this.dailyNote }] : [])) || [],
          indexEntries: (this.bridge?.useMock && this.bridge?.mockData?.indexEntries
            ? this.bridge.mockData.indexEntries
            : this.indexRecords) || []
        };

        this.searchResults = executeUniversalSearch(q, store);
        const flat = this.getFlattenedSearchResults();
        this.selectedSearchIndex = flat.length > 0 ? 0 : -1;
      },

      navigateSearchResults(delta) {
        const list = this.getFlattenedSearchResults();
        if (!list.length) {
          this.selectedSearchIndex = -1;
          return;
        }
        let nextIdx = this.selectedSearchIndex + delta;
        if (nextIdx < 0) nextIdx = list.length - 1;
        if (nextIdx >= list.length) nextIdx = 0;
        this.selectedSearchIndex = nextIdx;

        this.$nextTick(() => {
          const selectedEl = document.querySelector('.search-result-item.selected');
          if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
          }
        });
      },

      selectActiveSearchResult() {
        const list = this.getFlattenedSearchResults();
        if (this.selectedSearchIndex >= 0 && this.selectedSearchIndex < list.length) {
          this.selectSearchResult(list[this.selectedSearchIndex]);
        }
      },

      async selectSearchResult(item) {
        if (!item) return;
        this.closeSearchModal();

        const targetDate = item.date;
        const targetView = item.targetView || 'daily';

        if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          this.selectedDate = targetDate;
          const [y, m] = targetDate.split('-').map(Number);
          this.selectedYear = y;
          this.selectedMonth = m;
        }

        await this.setView(targetView);

        if (targetView === 'daily' || targetDate) {
          await this.loadDayData();
        }
      },

      parseTask(title) {
        return parseTaskTitle(title);
      }
    }));
Alpine.start();