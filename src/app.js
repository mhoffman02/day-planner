/**
 * @file app.js
 * @description Auto-generated JSDoc header for app.js.
 */

import { GASBridge } from './gasBridge.js';
import { reconcileWorkspaceChanges } from './syncEngine.js';
window.GASBridge = GASBridge;

// Register ServiceWorker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(registration) {
      console.log('[PWA] ServiceWorker registered with scope:', registration.scope);
    }).catch(function(err) {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  });
}

// Helper engine definitions bundled for GAS SPA client
  const STATUS_LIST = ['•', '✓', '→', 'X', 'G/✓'];

  function parseTaskTitle(rawTitle = '') {
    if (!rawTitle) return { priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: '' };
    const match = rawTitle.match(/^\[([A-C])([1-9])\]\s*(.*)$/i);
    if (match) {
      return {
        priorityGroup: match[1].toUpperCase(),
        sequence: parseInt(match[2], 10),
        priorityCode: `${match[1].toUpperCase()}${match[2]}`,
        cleanTitle: match[3].trim()
      };
    }
    return { priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: rawTitle.trim() };
  }

  function formatTaskTitle(priorityGroup, sequence, cleanTitle) {
    const trimmed = (cleanTitle || '').trim();
    if (priorityGroup && sequence) return `[${priorityGroup.toUpperCase()}${sequence}] ${trimmed}`;
    return trimmed;
  }

  function getNextStatus(curr) {
    const idx = STATUS_LIST.indexOf(curr);
    if (idx === -1 || idx === STATUS_LIST.length - 1) return STATUS_LIST[0];
    return STATUS_LIST[idx + 1];
  }



function getLocalDateStr(d = new Date()) {
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    d = new Date(d);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

  function registerPlannerApp() {
    if (!window.Alpine) return;
    window.Alpine.data('plannerApp', () => ({
      activeView: 'daily',
      activeDailyColumn: 'tasks', // 'tasks' | 'appointments' | 'notes' (mobile column switcher)
      selectedDate: getLocalDateStr(),
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      
      // Data collections
      dailyTasks: [],
      masterTasks: [],
      calendarEvents: [],
      scheduleGrid: [],
      dailyNote: '',
      noteCards: [],
      noteViewMode: 'cards', // 'cards' (Option 1) or 'doc' (Option 2)
      noteFilterMenuOpen: false,
      noteCardSearchQuery: '',
      noteCardCategoryFilter: 'ALL',
      indexRecords: [],
      monthlyGrid: [],

      // Sync & Error & Toast states
      isSyncing: false,
      errorMessage: null,
      toasts: [],
      noteSaveTimer: null,

      showToast(message, type = 'info', duration = 10000, title = '') {
        const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const toastTitle = title || (type === 'error' ? 'Notice' : type === 'warning' ? 'Warning' : type === 'success' ? 'Success' : 'Information');
        const toast = { id, message, type, title: toastTitle, duration };
        this.toasts.push(toast);

        setTimeout(() => {
          this.dismissToast(id);
        }, duration);
      },

      dismissToast(id) {
        this.toasts = this.toasts.filter(t => t.id !== id);
      },

      // Modals
      eventModalOpen: false,
      selectedEvent: null,

      createEventModalOpen: false,
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
      },

      recentAttendees: [],

      searchModalOpen: false,
      searchQuery: '',
      searchResults: { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] },

      // Task inputs
      newTaskTitle: '',
      newTaskPriorityGroup: 'A',

      // Resizable 3-Column Layout state
      colWidths: [33.33, 33.33, 33.34],
      isResizing: false,
      activeResizerIndex: null,

      bridge: null,

      theme: 'light',

      get filteredNoteCards() {
        const q = (this.noteCardSearchQuery || '').trim().toLowerCase();
        const cat = this.noteCardCategoryFilter;

        return (this.noteCards || []).filter(card => {
          const matchCat = cat === 'ALL' || card.category === cat;
          const matchText = !q || (card.heading || '').toLowerCase().includes(q) || (card.content || '').toLowerCase().includes(q);
          return matchCat && matchText;
        });
      },

      get isMonthlyView() {
        return ['monthly-calendar', 'master-tasks', 'monthly-index', 'future-matrix'].includes(this.activeView);
      },

      get selectedMonthName() {
        return new Date(this.selectedYear, this.selectedMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      },

      get currentMonthName() {
        return new Date().toLocaleDateString('en-US', { month: 'long' });
      },

      async init() {
        this.bridge = new GASBridge(false);
        window.showToast = (msg, type, dur, title) => this.showToast(msg, type, dur, title);
        this.initTheme();
        this.initColumnWidths();
        await this.loadDayData();
        await this.loadMasterTasks();
        await this.loadRecentAttendees();
        this.setupKeyboardShortcuts();
        this.setupAutoSync();
      },

      async loadRecentAttendees() {
        try {
          if (this.bridge && typeof this.bridge.getRecentAttendees === 'function') {
            const list = await this.bridge.getRecentAttendees(60, 15);
            if (Array.isArray(list)) {
              this.recentAttendees = list.slice().sort();
            }
          }
        } catch (e) {
          console.warn('Could not load recent attendees:', e);
        }
      },

      setupAutoSync() {
        if (this._autoSyncTimer) clearInterval(this._autoSyncTimer);
        this._autoSyncTimer = setInterval(() => {
          if (navigator.onLine && !this.isSyncing) {
            this.trigger2WaySync(true);
          }
        }, 5 * 60 * 1000);

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine && !this.isSyncing) {
            this.trigger2WaySync(true);
          }
        });

        window.addEventListener('online', () => {
          if (!this.isSyncing) {
            this.trigger2WaySync(true);
          }
        });
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

      saveColumnWidthsDebounced(delay = 500) {
        if (this._colWidthsSaveTimer) {
          clearTimeout(this._colWidthsSaveTimer);
        }
        this._colWidthsSaveTimer = setTimeout(() => {
          try {
            localStorage.setItem('dayPlannerColumnWidths', JSON.stringify(this.colWidths));
          } catch (e) {
            console.warn('Could not save column widths:', e);
          }
        }, delay);
      },

      resetColumnWidths() {
        if (this._colWidthsSaveTimer) {
          clearTimeout(this._colWidthsSaveTimer);
        }
        this.colWidths = [33.33, 33.33, 33.34];
        try {
          localStorage.removeItem('dayPlannerColumnWidths');
        } catch (e) {}
      },

      initResize(resizerIdx, event) {
        if (event.type === 'mousedown' && event.button !== 0) return;
        event.preventDefault();

        const spreadEl = event.currentTarget.closest('.two-page-spread');
        if (!spreadEl) return;

        const rect = spreadEl.getBoundingClientRect();
        const resizersTotalPx = 40;
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
          this.saveColumnWidthsDebounced(500);
        };

        const onPointerUp = () => {
          if (!this.isResizing) return;
          this.isResizing = false;
          this.activeResizerIndex = null;
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('mouseup', onPointerUp);
          window.removeEventListener('touchmove', onPointerMove);
          window.removeEventListener('touchend', onPointerUp);

          this.saveColumnWidthsDebounced(500);
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
        } catch (e) {
          this.theme = 'light';
        }
        this.applyTheme();
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('dayPlannerTheme', this.theme);
        } catch (e) {}
        this.applyTheme();
      },

      applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
      },

      setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.toggleSearchModal();
          }
        });
      },

      async trigger2WaySync(silent = false) {
        // isSyncing must gate silent runs too, not just user-initiated ones — the
        // 5-minute interval, visibilitychange, and online listeners all fire silent
        // syncs that can overlap each other (or a non-silent run) and both sides of
        // an overlap independently create the same real Calendar event.
        if (this.isSyncing) return;
        this.isSyncing = true;
        if (!silent) {
          this.errorMessage = null;
        }

        try {
          if (!silent) await new Promise(r => setTimeout(r, 200)); // Visual indicator

          const beforeTasks = this.dailyTasks;
          const beforeEvents = this.calendarEvents;
          const reconciled = reconcileWorkspaceChanges(beforeTasks, beforeEvents);
          // updateDailyTask/updateCalendarEvent return null when the target was deleted
          // upstream (e.g. removed directly in Google Tasks/Calendar) — collected here and
          // surfaced once after the loops instead of being silently dropped.
          const syncWarnings = [];

          // Event -> Task direction: persist any status/title/time changes reconciliation
          // pulled in from linked calendar events.
          if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
            for (const task of reconciled.tasks) {
              const prior = beforeTasks.find(t => t.id === task.id);
              if (prior && (prior.title !== task.title || prior.status !== task.status)) {
                const updated = await this.bridge.updateDailyTask(this.selectedDate, task.id, {
                  title: task.title,
                  status: task.status,
                  dueDate: task.dueDate
                });
                if (!updated) {
                  syncWarnings.push(`Task "${task.title}" no longer exists in Google Tasks — local copy may be stale.`);
                }
              }
            }
          }

          // Task -> Event direction: persist newly-linked events for real (adopting the
          // real Calendar event id in place of the local evt_sync_* placeholder) and push
          // title/time updates to already-linked events.
          for (let i = 0; i < reconciled.calendarEvents.length; i++) {
            const evt = reconciled.calendarEvents[i];
            const prior = beforeEvents.find(e => e.id === evt.id);

            if (!prior) {
              if (this.bridge && typeof this.bridge.addCalendarEvent === 'function') {
                const saved = await this.bridge.addCalendarEvent(this.selectedDate, {
                  ...evt,
                  gasTaskId: evt.syncTaskId || (evt.extendedProperties && evt.extendedProperties.private && evt.extendedProperties.private.gasTaskId) || null,
                  autoGoogleMeet: false,
                  guestsCanModify: false,
                  autoAgendaDoc: false
                });
                if (saved && saved.id) {
                  reconciled.calendarEvents[i] = { ...evt, ...saved };
                }
              }
            } else if (prior.title !== evt.title || prior.startTime !== evt.startTime || prior.endTime !== evt.endTime) {
              if (this.bridge && typeof this.bridge.updateCalendarEvent === 'function') {
                const updated = await this.bridge.updateCalendarEvent(this.selectedDate, evt.id, {
                  title: evt.title,
                  startTime: evt.startTime,
                  endTime: evt.endTime
                });
                if (!updated) {
                  syncWarnings.push(`Event "${evt.title}" no longer exists in Google Calendar — local copy may be stale.`);
                }
              }
            }
          }

          this.dailyTasks = reconciled.tasks;
          this.calendarEvents = reconciled.calendarEvents;

          this.buildScheduleGrid();

          if (syncWarnings.length > 0) {
            console.warn('🔥 trigger2WaySync: stale references', syncWarnings);
            this.errorMessage = syncWarnings.join(' ');
          }
        } catch (err) {
          console.error('🔥 trigger2WaySync error:', err);
          if (!silent) {
            this.errorMessage = `2-Way Sync Warning: ${err.message || err.toString()}`;
          }
        } finally {
          this.isSyncing = false;
        }
      },

      async setView(viewName) {
        this.activeView = viewName;
        if (viewName === 'monthly-calendar') {
          this.buildMonthlyGrid();
        }
      },

      async navigateDay(delta) {
        const [y, m, day] = this.selectedDate.split('-').map(Number);
        const d = new Date(y, m - 1, day + delta);
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        this.selectedDate = `${d.getFullYear()}-${monthStr}-${dayStr}`;
        this.selectedYear = d.getFullYear();
        this.selectedMonth = d.getMonth() + 1;
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

      async jumpToToday() {
        this.selectedDate = getLocalDateStr();
        const [y, m] = this.selectedDate.split('-').map(Number);
        this.selectedYear = y;
        this.selectedMonth = m;
        await this.loadDayData();
      },

      clearNoteCardFilter() {
        this.noteCardSearchQuery = '';
        this.noteCardCategoryFilter = 'ALL';
      },

      async selectCalendarDay(day) {
        if (day && day.dateStr) {
          this.selectedDate = day.dateStr;
          await this.setView('daily');
          await this.loadDayData();
        }
      },

      async loadDayData() {
        try {
          const data = await this.bridge.getDailyData(this.selectedDate);
          if (data.error) {
            this.errorMessage = data.error;
            this.showToast(data.error, 'error', 10000, 'Workspace Notice');
          }
          if (data.warnings && data.warnings.length > 0) {
            const warningMsg = data.warnings.join(' | ');
            this.errorMessage = warningMsg;
            this.showToast(warningMsg, 'warning', 8000, 'Warning');
          }
          this.dailyTasks = data.tasks || [];
          this.calendarEvents = data.calendarEvents || [];
          this.dailyNote = data.noteContent || '';
          this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
          this.buildScheduleGrid();
          this.buildIndexRecords();
        } catch (err) {
          console.error('🔥 loadDayData error:', err);
          const errText = `Error loading daily workspace: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Load Error');
        }
      },

      addNoteCard() {
        const newCard = {
          id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          heading: '#index [Topic] New Card',
          content: '',
          category: 'Work',
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

      applyCardFormat(card, formatType) {
        if (!card) return;
        const prefixMap = {
          bold: '**',
          italic: '*',
          strike: '~~',
          code: '`'
        };

        if (formatType === 'bullet') {
          const lines = (card.content || '').split('\n');
          card.content = lines.map(line => line.startsWith('- ') ? line.substring(2) : `- ${line}`).join('\n');
        } else if (prefixMap[formatType]) {
          const p = prefixMap[formatType];
          card.content = `${p}${card.content || ''}${p}`;
        }
        this.syncCardsToDailyNote();
      },

      parseDailyNoteToCards(noteText = '') {
        if (!noteText.trim() || noteText.startsWith('No notes recorded for')) {
          return [
            { id: 'nc_1', heading: '#index [Architecture] System Design', content: 'Finalized 3-column binder layout with Alpine.js and clean CSS.', category: 'Work', collapsed: false },
            { id: 'nc_2', heading: '#index [Finance] Budget Sync', content: '- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.', category: 'Meeting', collapsed: false }
          ];
        }

        const lines = noteText.split('\n');
        const cards = [];
        let currentCard = null;

        lines.forEach(line => {
          if (line.startsWith('### ') || line.startsWith('# ')) {
            let headingClean = line.replace(/^#+\s*/, '').trim();
            // Skip document date header lines (e.g., "# Aug 15, 2026") from creating boxed topic cards
            if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}$/i.test(headingClean) ||
                /^\d{4}-\d{2}-\d{2}$/.test(headingClean)) {
              return;
            }
            if (currentCard) cards.push(currentCard);
            headingClean = headingClean.replace(/Daily Log\s*-\s*/i, '');
            headingClean = headingClean.replace(/January/i, 'Jan')
                                       .replace(/February/i, 'Feb')
                                       .replace(/March/i, 'Mar')
                                       .replace(/April/i, 'Apr')
                                       .replace(/June/i, 'Jun')
                                       .replace(/July/i, 'Jul')
                                       .replace(/August/i, 'Aug')
                                       .replace(/September/i, 'Sep')
                                       .replace(/October/i, 'Oct')
                                       .replace(/November/i, 'Nov')
                                       .replace(/December/i, 'Dec');
            const category = headingClean.toLowerCase().includes('meeting') ? 'Meeting' : headingClean.toLowerCase().includes('finance') ? 'Decision' : headingClean.toLowerCase().includes('personal') ? 'Personal' : 'Work';
            currentCard = {
              id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              heading: headingClean,
              content: '',
              category,
              collapsed: false
            };
          } else {
            if (!currentCard) {
              currentCard = {
                id: `nc_default_${Date.now()}`,
                heading: 'General Notes',
                content: '',
                category: 'Work',
                collapsed: false
              };
            }
            currentCard.content += (currentCard.content ? '\n' : '') + line;
          }
        });
        if (currentCard) cards.push(currentCard);
        return cards;
      },

      syncCardsToDailyNote() {
        if (!this.noteCards || this.noteCards.length === 0) {
          this.dailyNote = '';
          this.buildIndexRecords();
          this.scheduleDailyNoteSave();
          return;
        }
        this.dailyNote = this.noteCards.map(c => `### ${c.heading || 'Topic'}\n${c.content || ''}`).join('\n\n');
        this.buildIndexRecords();
        this.scheduleDailyNoteSave();
      },

      syncDailyNoteToCards() {
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildIndexRecords();
        this.scheduleDailyNoteSave();
      },

      // Debounces persistence of this.dailyNote so a keystroke in the card/continuous-doc
      // textareas (both wired to fire on every @input) doesn't send a save on every
      // keystroke. Previously nothing ever called saveDailyDocCards at all, so note edits
      // only ever lived in memory and were lost on the next loadDayData().
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
        } catch (err) {
          console.error('🔥 loadMasterTasks error:', err);
          this.errorMessage = `Error loading master tasks: ${err.message || err.toString()}`;
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
            const match = evt.startTime.match(/T(\d{2}):(\d{2})/);
            if (match) {
              const hr = parseInt(match[1], 10);
              const min = parseInt(match[2], 10) < 30 ? '00' : '30';
              slotKey = `${hr.toString().padStart(2, '0')}:${min}`;
            } else {
              const start = new Date(evt.startTime);
              const slotMin = start.getMinutes() < 30 ? '00' : '30';
              slotKey = `${start.getHours().toString().padStart(2, '0')}:${slotMin}`;
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
        if (!this.dailyNote) return;
        const lines = this.dailyNote.split('\n');
        const entries = [];
        lines.forEach(l => {
          if (/#index|\[INDEX\]/i.test(l)) {
            let clean = l.replace(/#index|\[INDEX\]/gi, '').trim();
            let topic = 'General';
            const match = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (match) {
              topic = match[1];
              clean = match[2];
            }
            entries.push({ date: this.selectedDate, topic, summary: clean, docUrl: `#doc-${this.selectedDate}` });
          }
        });
        this.indexRecords = entries;
      },

      buildMonthlyGrid() {
        const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0);
        const days = [];
        const startDayOfWeek = firstDay.getDay();

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
          const dateStr = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          days.push({ dateStr, dayNum: day, isCurrentMonth: true, events: this.calendarEvents.filter(e => e.startTime?.startsWith(dateStr)) });
        }

        while (days.length % 7 !== 0) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        this.monthlyGrid = days;
      },

      async addDailyTask() {
        if (!this.newTaskTitle.trim()) return;
        try {
          const existingCount = this.dailyTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newTaskPriorityGroup, existingCount, this.newTaskTitle);
          const newTask = await this.bridge.addDailyTask(this.selectedDate, formattedTitle);
          this.dailyTasks.push(newTask);
          this.newTaskTitle = '';
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 addDailyTask error:', err);
          const errText = `Error adding task: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Task Creation Notice');
        }
      },

      async toggleTaskStatus(task) {
        task.status = getNextStatus(task.status);
        try {
          if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
            const updated = await this.bridge.updateDailyTask(this.selectedDate, task.id, {
              title: task.title,
              status: task.status,
              dueDate: task.dueDate
            });
            if (!updated) {
              this.errorMessage = `Task "${task.title}" no longer exists in Google Tasks — status change was not saved.`;
            }
          }
        } catch (err) {
          console.error('🔥 toggleTaskStatus persist error:', err);
          this.errorMessage = `Could not save task status: ${err.message || err.toString()}`;
        }
        await this.trigger2WaySync();
      },

      async moveMasterTaskToToday(mTask) {
        try {
          const transferred = await this.bridge.transferMasterTask(mTask.id, this.selectedDate, 'A');
          if (transferred) {
            this.dailyTasks.push(transferred);
            await this.trigger2WaySync();
            this.showToast(`Moved "${mTask.title}" to Today's Task List as ${transferred.title.substring(0, 4)}!`, 'success', 6000, 'Task Transferred');
          }
        } catch (err) {
          console.error('🔥 moveMasterTaskToToday error:', err);
          const errText = `Error moving master task: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Task Transfer Error');
        }
      },

      openEventModal(evt) {
        this.selectedEvent = evt;
        this.eventModalOpen = true;
      },

      closeEventModal() {
        this.eventModalOpen = false;
        this.selectedEvent = null;
      },

      calculateEndTime(startStr = '09:00', durationMin = 25) {
        const [hStr, mStr] = startStr.split(':');
        const h = parseInt(hStr, 10) || 9;
        const m = parseInt(mStr, 10) || 0;
        const totalMinutes = h * 60 + m + parseInt(durationMin, 10);
        const endH = Math.min(23, Math.floor(totalMinutes / 60));
        const endM = totalMinutes % 60;
        return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      },

      setEventDuration(durationMin) {
        this.newEventData.duration = durationMin;
        this.newEventData.endTime = this.calculateEndTime(this.newEventData.startTime, durationMin);
      },

      onStartTimeChange() {
        this.newEventData.endTime = this.calculateEndTime(
          this.newEventData.startTime,
          this.newEventData.duration || 25
        );
      },

      openCreateEventModal(timeKey, durationMin = 25) {
        const defaultStart = timeKey || '09:00';
        const defaultEnd = this.calculateEndTime(defaultStart, durationMin);

        this.newEventData = {
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
        };
        this.createEventModalOpen = true;
        this.$nextTick(() => {
          const input = document.getElementById('evtTitleInput');
          if (input) input.focus();
        });
      },

      closeCreateEventModal() {
        this.createEventModalOpen = false;
      },

      launchNativeGCalCreate() {
        const title = encodeURIComponent(this.newEventData.title || 'New Appointment');
        const location = encodeURIComponent(this.newEventData.location || (this.newEventData.autoGoogleMeet ? 'Google Meet' : ''));
        
        let detailsText = this.newEventData.description || '';
        if (this.newEventData.autoAgendaDoc) {
          detailsText += (detailsText ? '\n\n' : '') + '📄 Meeting Agenda: Auto-created structured meeting notes';
        }
        const details = encodeURIComponent(detailsText);
        const addGuests = encodeURIComponent(this.newEventData.attendeesText || '');

        const dateFormatted = (this.selectedDate || getLocalDateStr()).replace(/-/g, '');
        const startH = (this.newEventData.startTime || '09:00').replace(':', '') + '00';
        const endH = (this.newEventData.endTime || '09:25').replace(':', '') + '00';
        const dates = `${dateFormatted}T${startH}/${dateFormatted}T${endH}`;

        let gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&location=${location}&details=${details}`;
        if (addGuests) {
          gCalUrl += `&add=${addGuests}`;
        }
        window.open(gCalUrl, 'gCalNativeNewAppt', 'width=780,height=720,resizable=yes,scrollbars=yes');
        this.closeCreateEventModal();
      },

      async saveNewEvent() {
        if (!this.newEventData.title.trim()) return;
        try {
          const startIso = `${this.selectedDate}T${this.newEventData.startTime || '09:00'}:00`;
          const endIso = `${this.selectedDate}T${this.newEventData.endTime || '09:25'}:00`;

          const attendeesList = (this.newEventData.attendeesText || '')
            .split(/[,;]+/)
            .map(s => s.trim())
            .filter(Boolean);

          const autoGoogleMeet = this.newEventData.autoGoogleMeet;
          const guestsCanModify = this.newEventData.guestsCanModify;
          const autoAgendaDoc = this.newEventData.autoAgendaDoc;

          const newEvt = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: this.newEventData.title.trim(),
            startTime: startIso,
            endTime: endIso,
            location: this.newEventData.location ? this.newEventData.location.trim() : '',
            description: this.newEventData.description ? this.newEventData.description.trim() : '',
            meetLink: null,
            agendaDocUrl: null,
            attendees: attendeesList,
            guestsCanModify: false,
            gCalLink: `https://calendar.google.com/calendar/r/day/${this.selectedDate.replace(/-/g, '/')}`
          };

          this.calendarEvents.push(newEvt);
          this.buildScheduleGrid();
          this.closeCreateEventModal();

          // meetLink/agendaDocUrl are server-provisioned (real Google Meet conference +
          // Doc) via the Advanced Calendar Service; the optimistic entry above is
          // updated in place once the authoritative event comes back.
          if (this.bridge && typeof this.bridge.addCalendarEvent === 'function') {
            const saved = await this.bridge.addCalendarEvent(this.selectedDate, {
              ...newEvt,
              autoGoogleMeet,
              guestsCanModify,
              autoAgendaDoc
            });
            if (saved) {
              Object.assign(newEvt, saved);
              this.buildScheduleGrid();
            }
          }
          await this.trigger2WaySync();
          this.showToast(`Saved appointment "${newEvt.title}"`, 'success', 5000, 'Appointment Created');
        } catch (err) {
          console.error('🔥 saveNewEvent error:', err);
          const errText = `Error saving appointment: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Calendar Error');
        }
      },

      toggleSearchModal() {
        this.searchModalOpen = !this.searchModalOpen;
        if (this.searchModalOpen) {
          this.runSearch();
        }
      },

      runSearch() {
        const q = this.searchQuery.trim().toLowerCase();
        if (!q) {
          this.searchResults = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] };
          return;
        }

        const res = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [] };

        this.calendarEvents.forEach(e => {
          if ((e.title || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)) {
            res.calendar.push(e);
            res.totalMatches++;
          }
        });

        [...this.dailyTasks, ...this.masterTasks].forEach(t => {
          if ((t.title || '').toLowerCase().includes(q)) {
            res.tasks.push(t);
            res.totalMatches++;
          }
        });

        if (this.dailyNote.toLowerCase().includes(q)) {
          res.notes.push({ date: this.selectedDate, content: this.dailyNote });
          res.totalMatches++;
        }

        this.indexRecords.forEach(i => {
          if ((i.summary || '').toLowerCase().includes(q) || (i.topic || '').toLowerCase().includes(q)) {
            res.index.push(i);
            res.totalMatches++;
          }
        });

        this.searchResults = res;
      },

      parseTask(title) {
        return parseTaskTitle(title);
      }
    }));
  }

  if (window.Alpine) {
    registerPlannerApp();
  } else {
    document.addEventListener('alpine:init', registerPlannerApp);
  }