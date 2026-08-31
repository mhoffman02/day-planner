/**
 * @file app.js
 * @description Alpine.js app wiring for the local/browser preview (`index.html` + `server.js`).
 * Defines the `plannerApp` Alpine component (daily/monthly/master-task/future-matrix views,
 * task/event/note CRUD, search, sync, offline outbox, rolling 3-month IndexedDB prefetch) and
 * registers the PWA service worker. Bundled client-script mirrors of `src/taskEngine.js`'s
 * priority parsing/formatting/status-cycling helpers live inline here for the same reason
 * `gas-app/Script.html` duplicates them — see `.agents/rules/sync-src-and-gas-app.md`.
 */

import { GASBridge } from './gasBridge.js';
import { reconcileWorkspaceChanges } from './syncEngine.js';
import IndexedDbStore from './indexedDbStore.js';
window.GASBridge = GASBridge;

// Month-overview cache freshness window for the rolling 3-month background prefetch (see
// _prefetchMonth) — short enough that reopening the monthly-calendar view after a while
// re-syncs, long enough that switching views/months repeatedly doesn't refetch every time.
const MONTH_CACHE_TTL_MS = 15 * 60 * 1000;

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
  const STATUS_LIST = ['•', '✓', '→', 'X', 'D/✓'];

  /**
   * Parses a task title that may contain a priority prefix like [A1] or [B3].
   * Local mirror of `src/taskEngine.js`'s `parseTaskTitle` for this bundled client script.
   * @param {string} [rawTitle=''] Raw task title string.
   * @returns {{priorityGroup: string|null, sequence: number|null, priorityCode: string|null, cleanTitle: string}}
   */
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

  /**
   * Rebuilds a `[A1] Title`-style task title from its parsed parts.
   * @param {string} priorityGroup Priority group letter, e.g. 'A'.
   * @param {number} sequence Sequence number within the group.
   * @param {string} cleanTitle Title text without the priority prefix.
   * @returns {string}
   */
  function formatTaskTitle(priorityGroup, sequence, cleanTitle) {
    const trimmed = (cleanTitle || '').trim();
    if (priorityGroup && sequence) return `[${priorityGroup.toUpperCase()}${sequence}] ${trimmed}`;
    return trimmed;
  }

  /**
   * Advances a task's status glyph to the next one in `STATUS_LIST`, wrapping around at the end.
   * @param {string} curr Current status glyph.
   * @returns {string} Next status glyph.
   */
  function getNextStatus(curr) {
    const idx = STATUS_LIST.indexOf(curr);
    if (idx === -1 || idx === STATUS_LIST.length - 1) return STATUS_LIST[0];
    return STATUS_LIST[idx + 1];
  }

  /**
   * Human-readable labels for each status glyph, backing the status-select dropdown.
   * Local mirror of `src/taskEngine.js`'s `STATUS_OPTIONS` for this bundled client script.
   * @type {Array<{value: string, label: string}>}
   */
  const STATUS_OPTIONS = [
    { value: '•', label: 'Open' },
    { value: '✓', label: 'Done' },
    { value: '→', label: 'Forward' },
    { value: 'X', label: 'Canceled' },
    { value: 'D/✓', label: 'Delegated (Done)' }
  ];

  /**
   * Checks whether a status glyph is a member of `STATUS_LIST`.
   * Local mirror of `src/taskEngine.js`'s `isValidStatus` for this bundled client script.
   * @param {string} status Status glyph to validate.
   * @returns {boolean}
   */
  function isValidStatus(status) {
    return STATUS_LIST.includes(status);
  }

/**
 * Formats a Date object (or parses a date string) as a local YYYY-MM-DD string.
 * Local mirror of `src/binderStore.js`'s `getLocalDateStr` for this bundled client script.
 * @param {Date|string} [d=new Date()] Date object or string.
 * @returns {string}
 */
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

  /**
   * Registers the `plannerApp` Alpine.js component (all app state and methods) once Alpine has
   * initialized. Safe to call before or after `alpine:init` fires — no-ops if `window.Alpine`
   * isn't present yet.
   * @returns {void}
   */
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
      // Task id whose status-select dropdown is open (see setTaskStatus/toggleTaskStatus), or
      // null when none is open. A single id rather than a per-task flag keeps only one open at
      // a time, matching noteFilterMenuOpen's click-to-open/click-outside-to-close convention.
      openStatusMenuTaskId: null,
      // Pending timeout id from scheduleStatusMenuClose (see below) — cancelled on re-entry so a
      // quick mouse pass over the gap between the button and the dropdown doesn't close it.
      statusMenuCloseTimer: null,
      statusOptions: STATUS_OPTIONS,
      dailyNote: '',
      noteCards: [],
      noteViewMode: 'cards', // 'cards' (Option 1) or 'doc' (Option 2)
      noteFilterMenuOpen: false,
      noteCardSearchQuery: '',
      noteCardCategoryFilter: 'ALL',
      indexRecords: [],
      taskNoteLinks: [],
      monthlyGrid: [],

      // Sync & Error & Toast states
      isSyncing: false,
      errorMessage: null,
      toasts: [],
      noteSaveTimer: null,
      _daySyncTimers: new Map(),
      _prefetchInFlight: new Set(),
      _monthPrefetchInFlight: new Set(),
      outboxCount: 0,

      /**
       * Queues a toast notification, auto-dismissing it after `duration` ms.
       * @param {string} message Toast body text.
       * @param {'info'|'success'|'warning'|'error'} [type='info'] Toast style/severity.
       * @param {number} [duration=10000] Milliseconds before auto-dismiss.
       * @param {string} [title=''] Optional title override; defaults based on `type`.
       * @returns {void}
       */
      showToast(message, type = 'info', duration = 10000, title = '') {
        const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const toastTitle = title || (type === 'error' ? 'Notice' : type === 'warning' ? 'Warning' : type === 'success' ? 'Success' : 'Information');
        const toast = { id, message, type, title: toastTitle, duration };
        this.toasts.push(toast);

        setTimeout(() => {
          this.dismissToast(id);
        }, duration);
      },

      /**
       * Removes a toast by id.
       * @param {string} id Toast id from `showToast`.
       * @returns {void}
       */
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

      /** @returns {Array<object>} Note cards matching the current search text and category filter. */
      get filteredNoteCards() {
        const q = (this.noteCardSearchQuery || '').trim().toLowerCase();
        const cat = this.noteCardCategoryFilter;

        return (this.noteCards || []).filter(card => {
          const matchCat = cat === 'ALL' || card.category === cat;
          const matchText = !q || (card.heading || '').toLowerCase().includes(q) || (card.content || '').toLowerCase().includes(q);
          return matchCat && matchText;
        });
      },

      /** @returns {boolean} Whether the active view is one of the month-scoped tabs. */
      get isMonthlyView() {
        return ['monthly-calendar', 'master-tasks', 'monthly-index', 'future-matrix'].includes(this.activeView);
      },

      /** @returns {string} Full month name for `selectedYear`/`selectedMonth`. */
      get selectedMonthName() {
        return new Date(this.selectedYear, this.selectedMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      },

      /** @returns {string} Full month name for today's date. */
      get currentMonthName() {
        return new Date().toLocaleDateString('en-US', { month: 'long' });
      },

      /**
       * App bootstrap: creates the GAS bridge, restores theme/column-width prefs, loads the
       * selected day/master tasks/recent attendees, wires keyboard shortcuts and auto-sync, and
       * kicks off the rolling 3-month background prefetch. Called once by Alpine on mount.
       * @returns {Promise<void>}
       */
      async init() {
        this.bridge = new GASBridge(false);
        window.showToast = (msg, type, dur, title) => this.showToast(msg, type, dur, title);
        this.initTheme();
        this.initColumnWidths();
        await this.loadDayData();
        await this.loadMasterTasks();
        await this.loadRecentAttendees();
        await this.refreshOutboxCount();
        this.setupKeyboardShortcuts();
        this.setupAutoSync();
        this._scheduleMonthWindowPrefetch(this.selectedDate.slice(0, 7));
      },

      /**
       * Refreshes `outboxCount` from the count of mutations queued in IndexedDB while offline.
       * @returns {Promise<void>}
       */
      async refreshOutboxCount() {
        try {
          const outbox = await IndexedDbStore.idbGetOutbox();
          this.outboxCount = outbox.length;
        } catch (e) {
          console.warn('Could not read outbox count:', e);
        }
      },

      /**
       * Replays any writes queued while offline against the real backend, in FIFO order, then
       * reconciles temp ids (offline_task_ / offline_evt_ prefixed) in local state with the real
       * ids the server assigned. No-op if there's no bridge flush method or the browser is offline.
       * @returns {Promise<void>}
       */
      async flushOutboxIfPossible() {
        if (!this.bridge || typeof this.bridge.flushOutbox !== 'function') return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        try {
          const result = await this.bridge.flushOutbox((mutation, mutationResult) => {
            this.reconcileOfflineMutation(mutation, mutationResult);
          });
          await this.refreshOutboxCount();
          if (result && result.flushed > 0) {
            this.showToast(`Synced ${result.flushed} offline change${result.flushed === 1 ? '' : 's'}.`, 'success', 5000, 'Back Online');
          }
        } catch (err) {
          console.error('🔥 flushOutboxIfPossible error:', err);
        }
      },

      /**
       * Patches a temp id (assigned locally while offline) to the real id the server returned
       * once its queued create actually lands. Updates only apply optimistically before
       * queueing, so they need no patching here.
       * @param {object} mutation Outbox mutation record (has `type` and `payload`).
       * @param {object|null} result Result the flushed mutation resolved to, if any.
       * @returns {void}
       */
      reconcileOfflineMutation(mutation, result) {
        if (!result) return;
        if (mutation.type === 'ADD_DAILY_TASK' && mutation.payload.tempId) {
          const idx = this.dailyTasks.findIndex(t => t.id === mutation.payload.tempId);
          if (idx !== -1) this.dailyTasks[idx] = { ...this.dailyTasks[idx], ...result, _queuedOffline: false };
        } else if (mutation.type === 'ADD_CALENDAR_EVENT' && mutation.payload.tempId) {
          const idx = this.calendarEvents.findIndex(e => e.id === mutation.payload.tempId);
          if (idx !== -1) this.calendarEvents[idx] = { ...this.calendarEvents[idx], ...result, _queuedOffline: false };
        }
        this.buildScheduleGrid();
      },

      /**
       * Loads recently-used calendar attendee emails for autocomplete in the event modal.
       * @returns {Promise<void>}
       */
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

      /**
       * Wires background 2-way sync triggers: a 5-minute interval, tab-visibility regain, and
       * the browser coming back online — each gated by `isSyncing` to avoid overlapping runs.
       * @returns {void}
       */
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

      /**
       * Restores saved 3-column layout widths from localStorage, if a valid saved value exists.
       * @returns {void}
       */
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

      /**
       * Persists `colWidths` to localStorage after `delay` ms of no further calls.
       * @param {number} [delay=500] Debounce delay in milliseconds.
       * @returns {void}
       */
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

      /**
       * Resets the 3-column layout to equal thirds and clears the saved localStorage value.
       * @returns {void}
       */
      resetColumnWidths() {
        if (this._colWidthsSaveTimer) {
          clearTimeout(this._colWidthsSaveTimer);
        }
        this.colWidths = [33.33, 33.33, 33.34];
        try {
          localStorage.removeItem('dayPlannerColumnWidths');
        } catch (e) {
          console.warn('resetColumnWidths: localStorage unavailable', e);
        }
      },

      /**
       * Begins a drag-to-resize gesture on one of the two column dividers, tracking
       * mouse/touch movement until pointer-up and clamping each column to a 15% minimum.
       * @param {1|2} resizerIdx Which divider was grabbed (between columns 1-2 or 2-3).
       * @param {MouseEvent|TouchEvent} event The mousedown/touchstart event.
       * @returns {void}
       */
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

      /**
       * Restores the saved theme from localStorage, falling back to the OS `prefers-color-scheme`
       * and then to light mode, and applies it to the document.
       * @returns {void}
       */
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
          console.warn('initTheme: localStorage/matchMedia unavailable, defaulting to light', e);
          this.theme = 'light';
        }
        this.applyTheme();
      },

      /**
       * Toggles between light/dark theme, persists the choice, and applies it to the document.
       * @returns {void}
       */
      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('dayPlannerTheme', this.theme);
        } catch (e) {
          console.warn('toggleTheme: localStorage unavailable', e);
        }
        this.applyTheme();
      },

      /**
       * Writes the current `theme` value to the document's `data-theme` attribute for CSS.
       * @returns {void}
       */
      applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
      },

      /**
       * Registers global keyboard shortcuts (currently Ctrl/Cmd+K to open universal search).
       * @returns {void}
       */
      setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.toggleSearchModal();
          }
        });
      },

      /**
       * Reconciles local Tasks/Calendar state (`reconcileWorkspaceChanges`) and persists any
       * resulting changes back to Google Tasks/Calendar, then flushes the offline outbox first.
       * @param {boolean} [silent=false] Skip the visual sync indicator and error-message reset
       *   (used for background/interval-triggered syncs vs. a user-initiated sync).
       * @returns {Promise<void>}
       */
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

          await this.flushOutboxIfPossible();

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
          await this._persistCurrentDailyCache();

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

      /**
       * Switches the active binder tab, rebuilding the monthly grid and warming the
       * rolling-month cache when switching into the monthly-calendar view.
       * @param {string} viewName Target view name (e.g. 'daily', 'monthly-calendar').
       * @returns {Promise<void>}
       */
      async setView(viewName) {
        this.activeView = viewName;
        if (viewName === 'monthly-calendar') {
          await this.buildMonthlyGrid();
          this._scheduleMonthWindowPrefetch(`${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`);
        }
      },

      /**
       * Moves the selected date forward/backward by `delta` days and reloads that day's data.
       * @param {number} delta Number of days to offset (negative moves backward).
       * @returns {Promise<void>}
       */
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

      /**
       * Moves the selected month forward/backward by `delta` months, reloading day/master-task
       * data and rebuilding the monthly grid if that view is active.
       * @param {number} delta Number of months to offset (negative moves backward).
       * @returns {Promise<void>}
       */
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
          await this.buildMonthlyGrid();
        }
        this._scheduleMonthWindowPrefetch(`${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`);
      },

      /**
       * Jumps the selected month/year to the real-world current month and reloads its data.
       * @returns {Promise<void>}
       */
      async jumpToCurrentMonth() {
        const now = new Date();
        this.selectedYear = now.getFullYear();
        this.selectedMonth = now.getMonth() + 1;
        const monthStr = this.selectedMonth.toString().padStart(2, '0');
        this.selectedDate = `${this.selectedYear}-${monthStr}-01`;
        await this.loadDayData();
        await this.loadMasterTasks();
        if (this.activeView === 'monthly-calendar') {
          await this.buildMonthlyGrid();
        }
        this._scheduleMonthWindowPrefetch(`${this.selectedYear}-${monthStr}`);
      },

      /**
       * Jumps the selected date to today and reloads that day's data.
       * @returns {Promise<void>}
       */
      async jumpToToday() {
        this.selectedDate = getLocalDateStr();
        const [y, m] = this.selectedDate.split('-').map(Number);
        this.selectedYear = y;
        this.selectedMonth = m;
        await this.loadDayData();
        this._scheduleMonthWindowPrefetch(this.selectedDate.slice(0, 7));
      },

      /**
       * Clears the note-card search text and category filter.
       * @returns {void}
       */
      clearNoteCardFilter() {
        this.noteCardSearchQuery = '';
        this.noteCardCategoryFilter = 'ALL';
      },

      /**
       * Selects a day tapped in the monthly-calendar grid, switches to the daily view for it.
       * @param {{dateStr: string}} day Monthly grid cell for the tapped day.
       * @returns {Promise<void>}
       */
      async selectCalendarDay(day) {
        if (day && day.dateStr) {
          this.selectedDate = day.dateStr;
          await this.setView('daily');
          await this.loadDayData();
        }
      },

      // Offline-first daily load: render instantly from IndexedDB if a cached
      // copy exists, then debounce the live refresh so flipping through many
      // days quickly (e.g. holding an arrow key) only hits the backend once
      // the user settles on one. A never-before-seen date has nothing to show
      // from cache, so it fetches immediately instead of waiting out the debounce.
      /**
       * Offline-first daily load: renders instantly from IndexedDB if a cached copy exists,
       * then debounces the live refresh so flipping through many days quickly (e.g. holding an
       * arrow key) only hits the backend once the user settles on one. A never-before-seen date
       * has nothing to show from cache, so it fetches immediately instead of waiting out the
       * debounce. Also kicks off background prefetch of surrounding days.
       * @returns {Promise<void>}
       */
      async loadDayData() {
        const dateStr = this.selectedDate;
        const cached = await IndexedDbStore.idbGetDaily(dateStr);
        if (cached) {
          this._applyDailyData(cached);
          this._scheduleDaySync(dateStr);
        } else {
          await this._fetchAndCacheDay(dateStr, { applyIfCurrent: true });
        }
        this._prefetchSurroundingDays(dateStr);
      },

      /**
       * Applies a fetched/cached daily-data payload to app state and rebuilds derived views.
       * @param {{tasks?: Array, calendarEvents?: Array, noteContent?: string}} data Daily payload.
       * @returns {void}
       */
      _applyDailyData(data) {
        this.dailyTasks = data.tasks || [];
        this.calendarEvents = data.calendarEvents || [];
        this.dailyNote = data.noteContent || '';
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildScheduleGrid();
        this.buildIndexRecords();
      },

      /**
       * Debounces a live re-fetch of `dateStr` after rendering it from cache, so the backend
       * gets one refresh call once navigation settles rather than one per day flipped through.
       * @param {string} dateStr Date to refresh, in YYYY-MM-DD format.
       * @returns {void}
       */
      _scheduleDaySync(dateStr) {
        const existing = this._daySyncTimers.get(dateStr);
        if (existing) clearTimeout(existing);
        this._daySyncTimers.set(dateStr, setTimeout(() => {
          this._daySyncTimers.delete(dateStr);
          this._fetchAndCacheDay(dateStr, { applyIfCurrent: true });
        }, 2000));
      },

      /**
       * Merges the current in-memory tasks/events (the freshest known state right after a
       * status change or 2-way sync) into the cached daily payload for selectedDate, so a
       * reload or day-away-and-back reads the live values instead of the stale snapshot from
       * whenever that day was last fetched.
       * @returns {Promise<void>}
       */
      async _persistCurrentDailyCache() {
        try {
          const dateStr = this.selectedDate;
          const cached = (await IndexedDbStore.idbGetDaily(dateStr)) || {};
          await IndexedDbStore.idbSaveDaily(dateStr, { ...cached, tasks: this.dailyTasks, calendarEvents: this.calendarEvents });
        } catch (e) {
          console.warn('Could not update cached daily tasks/events:', e);
        }
      },

      /**
       * Fetches a day's data from the backend, caches it in IndexedDB (unless it's an error
       * payload), and optionally applies it to app state if that date is still selected.
       * @param {string} dateStr Date to fetch, in YYYY-MM-DD format.
       * @param {{applyIfCurrent?: boolean}} [options] Whether to apply the result if `dateStr`
       *   still matches `selectedDate` once the fetch resolves.
       * @returns {Promise<object|null>} The fetched payload, or `null` on error.
       */
      async _fetchAndCacheDay(dateStr, { applyIfCurrent = false } = {}) {
        try {
          const data = await this.bridge.getDailyData(dateStr);
          if (data.error) {
            this.errorMessage = data.error;
            this.showToast(data.error, 'error', 10000, 'Workspace Notice');
          }
          if (data.warnings && data.warnings.length > 0) {
            const warningMsg = data.warnings.join(' | ');
            this.errorMessage = warningMsg;
            this.showToast(warningMsg, 'warning', 8000, 'Warning');
          }
          // Don't cache an error payload as if it were real daily data.
          if (!data.error) {
            await IndexedDbStore.idbSaveDaily(dateStr, data);
          }
          if (applyIfCurrent && this.selectedDate === dateStr) {
            this._applyDailyData(data);
          }
          return data;
        } catch (err) {
          console.error('🔥 loadDayData error:', err);
          const errText = `Error loading daily workspace: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Load Error');
          return null;
        }
      },

      /**
       * Keeps `centerDateStr` +/- 7 days warm in IndexedDB in the background so day-to-day
       * navigation reads from cache instantly instead of waiting on a live google.script.run
       * round trip. Skips dates already cached or already in flight.
       * @param {string} centerDateStr Date to prefetch around, in YYYY-MM-DD format.
       * @returns {void}
       */
      _prefetchSurroundingDays(centerDateStr) {
        const [y, m, day] = centerDateStr.split('-').map(Number);
        for (let delta = -7; delta <= 7; delta++) {
          if (delta === 0) continue;
          const d = new Date(y, m - 1, day + delta);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (this._prefetchInFlight.has(dateStr)) continue;
          IndexedDbStore.idbGetDaily(dateStr).then(cached => {
            if (cached) return;
            this._prefetchInFlight.add(dateStr);
            this.bridge.getDailyData(dateStr)
              .then(data => { if (!data.error) return IndexedDbStore.idbSaveDaily(dateStr, data); })
              .catch(() => {})
              .finally(() => this._prefetchInFlight.delete(dateStr));
          });
        }
      },

      /**
       * Fetches+caches a whole month via the batched getMonthData endpoint (one round trip
       * instead of ~30 getDailyData() calls). Skips the network call entirely if a cached copy
       * younger than MONTH_CACHE_TTL_MS already exists. Writes to the dedicated monthOverview
       * IndexedDB store, never to dailyData, so a background month batch can never clobber a
       * fresher single-day edit or a pending offline mutation living there.
       * @param {string} monthStr Month in YYYY-MM format.
       * @param {{force?: boolean}} [options] Set `force: true` to bypass the freshness cache.
       * @returns {Promise<object|null>} Per-day overview map keyed by dateStr, or `null` on error.
       */
      async _prefetchMonth(monthStr, { force = false } = {}) {
        if (this._monthPrefetchInFlight.has(monthStr)) return null;
        if (!force) {
          const cached = await IndexedDbStore.idbGetMonthOverview(monthStr);
          if (cached && cached.cachedAt && (Date.now() - new Date(cached.cachedAt).getTime()) < MONTH_CACHE_TTL_MS) {
            return cached.days;
          }
        }
        this._monthPrefetchInFlight.add(monthStr);
        try {
          const data = await this.bridge.getMonthData(monthStr);
          if (!data || data.error) return null;
          const days = data.days || {};
          await IndexedDbStore.idbSaveMonthOverview(monthStr, days);
          return days;
        } catch (err) {
          console.warn('_prefetchMonth failed for', monthStr, err);
          return null;
        } finally {
          this._monthPrefetchInFlight.delete(monthStr);
        }
      },

      /**
       * Keeps previous/current/next month's overview warm in IndexedDB in the background — the
       * rolling "3 visible tabs" window analogous to a paper day planner. Staggered one at a
       * time via requestIdleCallback (setTimeout fallback for browsers without it, e.g. older
       * iOS Safari) rather than fired in parallel, current month first, so this never competes
       * with the interactive day-load path for network or CPU.
       * @param {string} centerMonthStr Month to prefetch around, in YYYY-MM format.
       * @returns {void}
       */
      _scheduleMonthWindowPrefetch(centerMonthStr) {
        const [y, m] = centerMonthStr.split('-').map(Number);
        const queue = [centerMonthStr, this._monthStrOffset(y, m, 1), this._monthStrOffset(y, m, -1)];
        const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 200);

        const runNext = () => {
          const monthStr = queue.shift();
          if (!monthStr) return;
          idle(() => { this._prefetchMonth(monthStr).finally(runNext); });
        };
        runNext();
      },

      /**
       * Offsets a year/month by a number of months and formats the result as YYYY-MM.
       * @param {number} year Base year.
       * @param {number} month Base month (1-indexed).
       * @param {number} deltaMonths Months to offset (may be negative).
       * @returns {string}
       */
      _monthStrOffset(year, month, deltaMonths) {
        const d = new Date(year, month - 1 + deltaMonths, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      },

      /**
       * Appends a new blank note card and syncs it into `dailyNote`.
       * @returns {void}
       */
      addNoteCard() {
        const newCard = {
          id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          indexTopic: '',
          heading: '',
          content: '',
          category: 'Work',
          collapsed: false
        };
        this.noteCards.push(newCard);
        this.syncCardsToDailyNote();
        this.focusNoteCardHeading(newCard.id);
      },

      /**
       * Focuses a note card's Topic input after it's added to the DOM -- Topic comes first
       * because whether it's filled in is what decides if the card is private or indexed.
       * @param {string} cardId Note card id.
       * @returns {void}
       */
      focusNoteCardHeading(cardId) {
        this.$nextTick(() => {
          document.querySelector(`[data-card-id="${cardId}"] .card-topic-input`)?.focus();
        });
      },

      /**
       * Unique, non-empty Topic values already used on this day's cards, for the Topic
       * datalist's autocomplete suggestions. Free typing still works for a brand-new topic --
       * this only surfaces ones already in use so far today.
       * @returns {string[]}
       */
      indexTopicOptions() {
        const topics = this.noteCards.map(c => (c.indexTopic || '').trim()).filter(Boolean);
        return [...new Set(topics)];
      },

      /**
       * Removes a note card by id and syncs the change into `dailyNote`.
       * @param {string} cardId Note card id.
       * @returns {void}
       */
      deleteNoteCard(cardId) {
        this.noteCards = this.noteCards.filter(c => c.id !== cardId);
        this.syncCardsToDailyNote();
      },

      /**
       * Toggles a note card's collapsed/expanded UI state.
       * @param {object} card Note card object.
       * @returns {void}
       */
      toggleCardExpand(card) {
        if (card) card.collapsed = !card.collapsed;
      },

      /**
       * Splits a note card's content into its lines for per-line live-preview editing.
       * @param {object} card Note card.
       * @returns {Array<string>}
       */
      cardLines(card) {
        return ((card && card.content) || '').split('\n');
      },

      /**
       * Activates a single line of a note card for raw-marker editing, swapping that line's
       * rendered HTML for a plain-text input and focusing it (cursor at end) once Alpine has
       * flipped x-show. Only the activated line ever shows raw markers -- every other line
       * stays rendered.
       * @param {object} card Note card.
       * @param {number} idx Line index to activate.
       * @returns {void}
       */
      startEditingLine(card, idx) {
        if (!card) return;
        card._activeLineIndex = idx;
        card._selectedLineRange = null;
        this.$nextTick(() => {
          const el = document.getElementById('card-line-' + card.id + '-' + idx);
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        });
      },

      /**
       * Extends a whole-line multi-select range on a note card via shift+click on an idle
       * (non-editing) line. The first shift+click after a plain click/selection anchors the
       * range at the currently/previously active line (or the clicked line itself if there is
       * none); subsequent shift+clicks keep that anchor and grow/shrink the range toward the
       * newly clicked line, mirroring standard shift+click text-selection behavior.
       * @param {object} card Note card.
       * @param {number} idx Line index that was shift+clicked.
       * @returns {void}
       */
      extendLineSelection(card, idx) {
        if (!card) return;
        const anchor = card._selectedLineRange ? card._selectedLineRange.anchor
          : (card._activeLineIndex != null ? card._activeLineIndex : idx);
        card._selectedLineRange = { anchor, start: Math.min(anchor, idx), end: Math.max(anchor, idx) };
      },

      /**
       * Clears a note card's whole-line multi-select range (Escape, clicking outside the card,
       * or starting single-line edit all trigger this).
       * @param {object} card Note card.
       * @returns {void}
       */
      clearLineSelection(card) {
        if (card) card._selectedLineRange = null;
      },

      /**
       * Whether a line index falls inside a note card's current whole-line multi-select range,
       * for the highlight class on that line's row.
       * @param {object} card Note card.
       * @param {number} idx Line index to check.
       * @returns {boolean}
       */
      isLineInSelectedRange(card, idx) {
        const r = card && card._selectedLineRange;
        return !!(r && idx >= r.start && idx <= r.end);
      },

      /**
       * Deactivates line-editing on blur, guarded so a blur from a line the user just left
       * can't clobber a different line that became active in the same tick (e.g. clicking
       * straight from one line's input into another line's rendered view).
       * @param {object} card Note card.
       * @param {number} idx Line index that lost focus.
       * @returns {void}
       */
      stopEditingLine(card, idx) {
        if (card && card._activeLineIndex === idx) card._activeLineIndex = null;
      },

      /**
       * Writes a single line's edited text back into the card's `\n`-joined content string.
       * @param {object} card Note card.
       * @param {number} idx Line index being edited.
       * @param {string} text New text for that line.
       * @returns {void}
       */
      updateCardLine(card, idx, text) {
        const lines = this.cardLines(card);
        lines[idx] = text;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      /**
       * Enter/Backspace/Escape line-editing mechanics, plus the Google Docs/Gmail-style
       * keyboard shortcuts (Ctrl/Cmd+B/I/U, Ctrl/Cmd+Shift+8/7 for lists, Ctrl/Cmd+Shift+
       * <letter> for color) for the line currently being edited.
       * @param {KeyboardEvent} e Keydown event from a card line's input.
       * @param {object} card Note card being edited.
       * @param {number} idx Line index the event came from.
       * @returns {void}
       */
      handleLineKeydown(e, card, idx) {
        if (!card) return;

        if (e.key === 'Escape') { e.target.blur(); return; }

        if (e.key === 'Enter') {
          e.preventDefault();
          const lines = this.cardLines(card);
          const caret = e.target.selectionStart;
          const text = lines[idx] || '';
          const before = text.slice(0, caret);
          let after = text.slice(caret);
          // Enter on a list line whose entire content is just the "- " / "N. " marker (no text
          // typed yet) exits list mode instead of continuing it -- Google Docs-style behavior.
          if (/^(\d+\.\s|- )$/.test(text)) {
            lines[idx] = '';
            lines.splice(idx + 1, 0, '');
          } else {
            const orderedMatch = /^(\d+)\.\s/.exec(before);
            if (orderedMatch) {
              after = `${parseInt(orderedMatch[1], 10) + 1}. ${after}`;
            } else if (/^- /.test(before)) {
              after = `- ${after}`;
            }
            lines[idx] = before;
            lines.splice(idx + 1, 0, after);
          }
          card.content = lines.join('\n');
          this.syncCardsToDailyNote();
          this.startEditingLine(card, idx + 1);
          return;
        }

        if (e.key === 'Backspace' && e.target.selectionStart === 0 && e.target.selectionEnd === 0 && idx > 0) {
          e.preventDefault();
          const lines = this.cardLines(card);
          const prevLen = lines[idx - 1].length;
          lines[idx - 1] = lines[idx - 1] + lines[idx];
          lines.splice(idx, 1);
          card.content = lines.join('\n');
          this.syncCardsToDailyNote();
          card._activeLineIndex = idx - 1;
          this.$nextTick(() => {
            const prevEl = document.getElementById('card-line-' + card.id + '-' + (idx - 1));
            if (prevEl) { prevEl.focus(); prevEl.setSelectionRange(prevLen, prevLen); }
          });
          return;
        }

        if (!(e.ctrlKey || e.metaKey)) return;
        const key = e.key.toLowerCase();
        if (e.shiftKey) {
          if (e.code === 'Digit7') { e.preventDefault(); this.applyLineFormat(card, idx, 'ordered'); return; }
          if (e.code === 'Digit8') { e.preventDefault(); this.applyLineFormat(card, idx, 'bullet'); return; }
          const colorKeys = { b: 'color-blue', r: 'color-red', g: 'color-green', t: 'color-teal' };
          if (colorKeys[key]) { e.preventDefault(); this.applyLineFormat(card, idx, colorKeys[key]); }
          return;
        }
        const formatKeys = { b: 'bold', i: 'italic', u: 'underline' };
        if (formatKeys[key]) { e.preventDefault(); this.applyLineFormat(card, idx, formatKeys[key]); }
      },

      /**
       * Applies a lightweight markdown-style inline format to one line of a note card's
       * content. When that line's input has an active text selection, wraps only the selected
       * substring (and toggles the wrap back off if the selection is already immediately
       * surrounded by the same marker); with no selection, wraps the whole line. Bullet/
       * numbered list toggle that one line's prefix. Because formatting only ever targets the
       * single line being edited, it can never leak onto lines the user didn't touch.
       * @param {object} card Note card to format.
       * @param {number} idx Line index to format.
       * @param {'bold'|'italic'|'underline'|'strike'|'bullet'|'ordered'|'color-teal'|'color-red'|'color-green'|'color-blue'|'color-default'} formatType Format to apply.
       * @param {{start: number, end: number}} [overrideSelection] Explicit substring range to
       *   treat as "selected", bypassing the DOM/element selection read. Used by
       *   {@link applyRangeFormat} to drive this same wrap/unwrap logic for whole-line-selected
       *   ranges without duplicating it.
       * @returns {void}
       */
      // Determines what number an ordered-list line should take when it starts or continues a
      // numbered list: one more than the immediately preceding line's number if that line is
      // itself an ordered-list item, otherwise 1 (starting a new list). A blank line right
      // before deliberately breaks the list -- it's a hard reset to 1, not a gap to continue
      // across -- so this only ever looks at lines[idx - 1], never further back.
      nextOrderedNumber(lines, idx) {
        const m = idx > 0 ? /^(\d+)\.\s/.exec(lines[idx - 1] || '') : null;
        return m ? parseInt(m[1], 10) + 1 : 1;
      },

      // Strips every inline/whole-line format marker from a line's raw text, returning plain
      // text: bold/italic/underline/strike wrappers, color spans, and bullet/ordered
      // prefixes are all removed. Bold is stripped before italic since ** is a superset of the
      // * italic marker. The backtick pass stays so "Clear Formatting" still cleans up any
      // stray code markers left over in notes saved before the code format was removed.
      clearLineFormatting(text) {
        let t = text || '';
        t = t.replace(/\[\[color:(?:teal|red|green|blue)\]\]([\s\S]*?)\[\[\/color\]\]/g, '$1');
        t = t.replace(/^-\s/, '');
        t = t.replace(/^\d+\.\s/, '');
        t = t.replace(/\*\*([\s\S]*?)\*\*/g, '$1');
        t = t.replace(/__([\s\S]*?)__/g, '$1');
        t = t.replace(/~~([\s\S]*?)~~/g, '$1');
        t = t.replace(/`([\s\S]*?)`/g, '$1');
        t = t.replace(/\*([\s\S]*?)\*/g, '$1');
        return t;
      },

      applyLineFormat(card, idx, formatType, overrideSelection) {
        if (!card || idx == null || idx < 0) return;
        const lines = this.cardLines(card);
        if (idx >= lines.length) return;
        const el = document.getElementById('card-line-' + card.id + '-' + idx);
        const text = lines[idx] || '';
        const hasSelection = overrideSelection ? true : !!(el && el.selectionEnd > el.selectionStart);
        const start = overrideSelection ? overrideSelection.start : (hasSelection ? el.selectionStart : 0);
        const end = overrideSelection ? overrideSelection.end : (hasSelection ? el.selectionEnd : text.length);

        const prefixMap = { bold: '**', italic: '*', strike: '~~', underline: '__' };
        const colorMap = {
          'color-teal': 'teal',
          'color-red': 'red',
          'color-green': 'green',
          'color-blue': 'blue',
          'color-default': null
        };

        const restoreSelection = (newStart, newEnd) => {
          if (!el || overrideSelection) return;
          this.$nextTick(() => { el.focus(); el.setSelectionRange(newStart, newEnd); });
        };

        const setLine = (newText) => {
          lines[idx] = newText;
          card.content = lines.join('\n');
          this.syncCardsToDailyNote();
        };

        if (formatType === 'clear') {
          setLine(this.clearLineFormatting(text));
        } else if (formatType === 'bullet') {
          setLine(text.startsWith('- ') ? text.slice(2) : `- ${text}`);
        } else if (formatType === 'ordered') {
          const orderedRe = /^\d+\.\s/;
          setLine(orderedRe.test(text) ? text.replace(orderedRe, '') : `${this.nextOrderedNumber(lines, idx)}. ${text}`);
        } else if (formatType in colorMap) {
          const newColor = colorMap[formatType];
          if (!newColor) {
            setLine(text.replace(/\[\[color:(?:teal|red|green|blue)\]\]([\s\S]*?)\[\[\/color\]\]/g, '$1'));
          } else {
            const before = text.slice(0, start);
            const selected = text.slice(start, end);
            const after = text.slice(end);
            const openTag = `[[color:${newColor}]]`;
            setLine(`${before}${openTag}${selected}[[/color]]${after}`);
            restoreSelection(start + openTag.length, end + openTag.length);
          }
        } else if (prefixMap[formatType]) {
          const marker = prefixMap[formatType];
          const before = text.slice(0, start);
          const selected = text.slice(start, end);
          const after = text.slice(end);
          const alreadyWrapped = before.endsWith(marker) && after.startsWith(marker);
          if (alreadyWrapped) {
            setLine(before.slice(0, before.length - marker.length) + selected + after.slice(marker.length));
            restoreSelection(start - marker.length, end - marker.length);
          } else {
            setLine(before + marker + selected + marker + after);
            restoreSelection(start + marker.length, end + marker.length);
          }
        }
      },

      /**
       * Applies a format to every line in a note card's whole-line multi-select range
       * (`card._selectedLineRange`), reusing {@link applyLineFormat}'s own wrap/unwrap encode
       * path for each line rather than duplicating it. Bullet toggles each line independently
       * (its prefix toggle is already a self-contained per-line op). Ordered, bold/italic/
       * underline/strike/color are all "email client" style: if every line in range is
       * already wrapped/ordered, unwrap/un-number all of them; otherwise apply the format only
       * to lines that don't already have it, leaving already-formatted lines untouched (for
       * ordered, this also keeps a newly-added plain line's number chained off the nearest
       * untouched preceding item instead of the just-stripped one).
       * @param {object} card Note card to format.
       * @param {string} formatType Format to apply (see {@link applyLineFormat}).
       * @returns {void}
       */
      applyRangeFormat(card, formatType) {
        if (!card || !card._selectedLineRange) return;
        const totalLines = this.cardLines(card).length;
        const lo = Math.max(0, Math.min(card._selectedLineRange.start, card._selectedLineRange.end));
        const hi = Math.min(totalLines - 1, Math.max(card._selectedLineRange.start, card._selectedLineRange.end));
        if (lo > hi) return;
        const indices = [];
        for (let i = lo; i <= hi; i++) indices.push(i);

        if (formatType === 'bullet' || formatType === 'color-default' || formatType === 'clear') {
          indices.forEach(i => this.applyLineFormat(card, i, formatType));
          return;
        }

        if (formatType === 'ordered') {
          // A naive per-line toggle over a mixed range (some lines already ordered, some not --
          // e.g. selecting an existing numbered item plus a newly added plain line below it)
          // would strip the already-ordered lines' numbering as it goes, so by the time
          // applyLineFormat reaches the new line, nextOrderedNumber reads the just-stripped
          // previous line and resets the count to 1. Mirror the bold/italic "email client" style
          // instead: toggle every line off only if the whole range is already ordered; otherwise
          // leave already-ordered lines untouched and only number the ones that aren't yet.
          const orderedRe = /^\d+\.\s/;
          const allOrdered = indices.every(i => orderedRe.test(this.cardLines(card)[i] || ''));
          indices.forEach(i => {
            const alreadyOrdered = orderedRe.test(this.cardLines(card)[i] || '');
            if (allOrdered || !alreadyOrdered) this.applyLineFormat(card, i, 'ordered');
          });
          return;
        }

        const prefixMap = { bold: '**', italic: '*', strike: '~~', underline: '__' };
        if (formatType in prefixMap) {
          const marker = prefixMap[formatType];
          const isWrapped = (t) => t.length >= marker.length * 2 && t.startsWith(marker) && t.endsWith(marker);
          const allWrapped = indices.every(i => isWrapped(this.cardLines(card)[i] || ''));
          indices.forEach(i => {
            const t = this.cardLines(card)[i] || '';
            if (allWrapped) {
              this.applyLineFormat(card, i, formatType, { start: marker.length, end: t.length - marker.length });
            } else if (!isWrapped(t)) {
              this.applyLineFormat(card, i, formatType, { start: 0, end: t.length });
            }
          });
          return;
        }

        const colorMap = { 'color-teal': 'teal', 'color-red': 'red', 'color-green': 'green', 'color-blue': 'blue' };
        if (formatType in colorMap) {
          const color = colorMap[formatType];
          const sameColorRe = new RegExp(`^\\[\\[color:${color}\\]\\][\\s\\S]*\\[\\[/color\\]\\]$`);
          const allSameColor = indices.every(i => sameColorRe.test(this.cardLines(card)[i] || ''));
          indices.forEach(i => {
            if (allSameColor) {
              this.applyLineFormat(card, i, 'color-default');
            } else {
              this.applyLineFormat(card, i, 'color-default');
              const t = this.cardLines(card)[i] || '';
              this.applyLineFormat(card, i, formatType, { start: 0, end: t.length });
            }
          });
        }
      },

      /**
       * Toolbar/menu entry point for line formatting. Applies to the whole-line multi-select
       * range if one is active (see {@link applyRangeFormat}); otherwise applies to whichever
       * single line is currently active (being edited). No-ops if neither is set, since the
       * toolbar has nothing to act on until the user has clicked or shift+clicked into a line.
       * @param {object} card Note card to format.
       * @param {string} formatType Format to apply (see {@link applyLineFormat}).
       * @returns {void}
       */
      applyCardFormat(card, formatType) {
        if (!card) return;
        // A whole-line multi-select range always wins over a stray _activeLineIndex left over
        // from the click that anchored the range (that line's input blurs asynchronously, so
        // _activeLineIndex can still be set at the moment this runs).
        if (card._selectedLineRange) {
          this.applyRangeFormat(card, formatType);
          return;
        }
        if (card._activeLineIndex == null) return;
        this.applyLineFormat(card, card._activeLineIndex, formatType);
      },

      /**
       * Returns the first color name ('teal'|'red'|'green'|'blue') found anywhere in a card's
       * content (used for the toolbar's active-swatch indicator), or null if uncolored.
       * @param {object} card Note card to inspect.
       * @returns {string|null}
       */
      cardNoteColor(card) {
        const m = /\[\[color:(teal|red|green|blue)\]\]/.exec((card && card.content) || '');
        return m ? m[1] : null;
      },

      /**
       * Renders one line of a card's raw marker-laden content (**bold**, *italic*,
       * __underline__, ~~strike~~, [[color:x]]...[[/color]], "- " bullet / "1. "
       * numbered prefix) as safe, formatted HTML -- the markers are app-internal formatting
       * instructions, not literal text the user should see. The line is HTML-escaped then run
       * through sequential marker-pair regex passes; since none of the generated span markup
       * contains marker characters, passes compose correctly across nesting (e.g. a colored
       * word inside a bolded line).
       * @param {string} text Raw line text.
       * @param {boolean} [isPlaceholder=false] Show the "click to add notes" placeholder instead.
       * @returns {string} Sanitized HTML for the line's rendered view.
       */
      renderCardLine(text, isPlaceholder) {
        if (isPlaceholder) {
          return '<span class="note-card-empty-placeholder">Click to add notes for this topic&hellip;</span>';
        }

        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const renderInline = (line) => {
          let html = escapeHtml(line);
          html = html.replace(/\[\[color:(teal|red|green|blue)\]\](.+?)\[\[\/color\]\]/g, '<span class="note-render-color-$1">$2</span>');
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
          // Each line renders as its own isolated <ol>, so native counting would show every
          // single-item list as "1." -- pin the real stored number via the <li value> attribute.
          const num = parseInt(orderedRe.exec(text)[0], 10);
          return `<ol class="note-render-list"><li value="${num}">${renderInline(text.replace(orderedRe, ''))}</li></ol>`;
        }
        return `<div class="note-render-line">${renderInline(text) || '&nbsp;'}</div>`;
      },

      /**
       * Splits a `#index [Topic] Summary`/`[INDEX] Topic: Summary`-tagged heading line into its
       * Topic and Summary parts, matching the format `indexParser.js`/`buildIndexRecords()`
       * scan for. Untagged headings pass through unchanged with an empty topic. Kept as a
       * decompose step so legacy notes written before the Topic/Summary field split still load
       * into the structured fields instead of showing raw tag syntax in the Summary box.
       * @param {string} headingClean Heading text with the leading `#`/`###` marker stripped.
       * @returns {{indexTopic: string, heading: string}}
       */
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

      /**
       * Splits a daily note's raw markdown text into heading-delimited note cards (`###`/`#`
       * lines start a new card; content lines accumulate under the current card). Returns a
       * placeholder pair of sample cards when given empty/default note text.
       * @param {string} [noteText=''] Raw daily note markdown.
       * @returns {Array<{id: string, indexTopic: string, heading: string, content: string, category: string, collapsed: boolean}>}
       */
      parseDailyNoteToCards(noteText = '') {
        if (!noteText.trim() || noteText.startsWith('No notes recorded for')) {
          return [
            { id: 'nc_1', indexTopic: 'Architecture', heading: 'System Design', content: 'Finalized 3-column binder layout with Alpine.js and clean CSS.', category: 'Work', collapsed: false },
            { id: 'nc_2', indexTopic: 'Finance', heading: 'Budget Sync', content: '- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.', category: 'Meeting', collapsed: false }
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
            const { indexTopic, heading } = this.decomposeIndexHeading(headingClean);
            currentCard = {
              id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              indexTopic,
              heading,
              content: '',
              category,
              collapsed: false
            };
          } else {
            if (!currentCard) {
              currentCard = {
                id: `nc_default_${Date.now()}`,
                indexTopic: '',
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

      /**
       * Serializes `noteCards` back into `dailyNote`'s markdown text (the cards view is the
       * source of truth), rebuilds index records, and schedules a debounced save.
       * @returns {void}
       */
      syncCardsToDailyNote() {
        if (!this.noteCards || this.noteCards.length === 0) {
          this.dailyNote = '';
          this.buildIndexRecords();
          this.scheduleDailyNoteSave();
          return;
        }
        this.dailyNote = this.noteCards.map(c => {
          const headingLine = c.indexTopic
            ? `#index [${c.indexTopic}] ${c.heading || 'Topic'}`
            : (c.heading || 'Topic');
          return `### ${headingLine}\n${c.content || ''}`;
        }).join('\n\n');
        this.buildIndexRecords();
        this.scheduleDailyNoteSave();
      },

      /**
       * Re-parses `dailyNote`'s markdown text back into `noteCards` (the continuous-doc view is
       * the source of truth), rebuilds index records, and schedules a debounced save.
       * @returns {void}
       */
      syncDailyNoteToCards() {
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildIndexRecords();
        this.scheduleDailyNoteSave();
      },

      /**
       * Debounces persistence of `this.dailyNote` so a keystroke in the card/continuous-doc
       * textareas (both wired to fire on every input event) doesn't send a save on every
       * keystroke. Previously nothing ever called saveDailyDocCards at all, so note edits only
       * ever lived in memory and were lost on the next loadDayData().
       * @returns {void}
       */
      scheduleDailyNoteSave() {
        if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
        this.noteSaveTimer = setTimeout(async () => {
          if (!this.bridge || typeof this.bridge.saveDailyDocCards !== 'function') return;
          try {
            const result = await this.bridge.saveDailyDocCards(this.selectedDate, this.dailyNote);
            if (result && result.queued) await this.refreshOutboxCount();
          } catch (err) {
            console.error('🔥 saveDailyDocCards error:', err);
            this.errorMessage = `Could not save daily note: ${err.message || err.toString()}`;
          }
        }, 1200);
      },

      /**
       * Loads the master task list for the selected month.
       * @returns {Promise<void>}
       */
      async loadMasterTasks() {
        try {
          this.masterTasks = await this.bridge.getMasterTasks(`${this.selectedMonthName} ${this.selectedYear}`);
        } catch (err) {
          console.error('🔥 loadMasterTasks error:', err);
          this.errorMessage = `Error loading master tasks: ${err.message || err.toString()}`;
        }
      },

      /**
       * Rebuilds `scheduleGrid`, the 07:00-19:00 half-hour time slots for the daily view, and
       * buckets `calendarEvents` into their start-time slots. Task-mirror events (tagged via
       * `syncTaskId`) are excluded — Tasks and Appointments stay visually distinct columns.
       * @returns {void}
       */
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

        // Map events. Skip task-mirror events (tagged via gasTaskId/syncTaskId) — day
        // planners keep Tasks and Appointments distinct, so a task never shows here even
        // if a linked calendar event exists (e.g. an explicitly time-blocked task, or a
        // legacy event from before auto-projection was removed).
        this.calendarEvents.forEach(evt => {
          if (evt.syncTaskId) return;
          let slotKey = null;
          if (evt.startTime) {
            const start = new Date(evt.startTime);
            const slotMin = start.getMinutes() < 30 ? '00' : '30';
            slotKey = `${start.getHours().toString().padStart(2, '0')}:${slotMin}`;
          }
          if (slotKey) {
            const slot = slots.find(s => s.timeKey === slotKey);
            if (slot) slot.events.push(evt);
          }
        });

        this.scheduleGrid = slots;
      },

      /**
       * Extracts `#index [Topic] Summary`-style lines from `dailyNote` into `indexRecords` for
       * the monthly index view.
       * @returns {void}
       */
      buildIndexRecords() {
        this.buildTaskNoteLinks();
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

      /**
       * Extracts `#task [A1]`-style link lines from `dailyNote` into `taskNoteLinks`, so a task
       * row can show whether the current day's note has a section written about it (the
       * "Paper-Planner method": jot notes under a task's priority label, same as a paper
       * planner's margin). A leading markdown heading marker ("### ") is stripped first so the
       * tag works equally as a note card's heading or as a plain content line. Keys on the
       * task's Priority code (e.g. "A1"), not a stable task id — Google Tasks has none surfaced
       * to note text — so a link goes stale if the task is later re-prioritized (v1 tradeoff).
       * @returns {void}
       */
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

      /**
       * Looks up whether `task` has a linked note in today's `taskNoteLinks` (matched by
       * priority code, e.g. "A1").
       * @param {object} task Daily task object.
       * @returns {{priority: string, summary: string, rawText: string}|null}
       */
      linkedNoteForTask(task) {
        const priorityCode = this.parseTask(task.title).priorityCode;
        if (!priorityCode) return null;
        return this.taskNoteLinks.find(link => link.priority === priorityCode) || null;
      },

      /**
       * Switches Notes to Cards view and expands+scrolls to the note card containing `task`'s
       * `#task [A1]` link line, so clicking a task's link indicator jumps straight to its note.
       * @param {object} task Daily task object.
       * @returns {void}
       */
      jumpToLinkedNote(task) {
        const link = this.linkedNoteForTask(task);
        if (!link) return;
        this.noteViewMode = 'cards';
        const card = this.noteCards.find(c => c.heading.includes(link.rawText.replace(/^#+\s+/, '')) || (c.content || '').includes(link.rawText));
        if (!card) return;
        card.collapsed = false;
        this.$nextTick(() => {
          const el = document.getElementById(`note-card-${card.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      },

      /**
       * Reciprocal lookup for the Notes-side badge: finds the `taskNoteLinks` entry (if any)
       * whose raw link line belongs to `card`'s heading or content.
       * @param {object} card Note card object.
       * @returns {{priority: string, summary: string, rawText: string}|null}
       */
      taskLinkForCard(card) {
        return this.taskNoteLinks.find(link =>
          (card.heading || '').includes(link.rawText.replace(/^#+\s+/, '')) ||
          (card.content || '').includes(link.rawText)
        ) || null;
      },

      /**
       * Renders the month grid from whatever's cached in IndexedDB first (offline-first,
       * instant), then refreshes in place once the batched month fetch resolves — sourcing
       * events from the monthOverview cache across the whole month instead of the
       * single-day-scoped `this.calendarEvents`, which only ever covers the selected day.
       * @returns {Promise<void>}
       */
      async buildMonthlyGrid() {
        const monthStr = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
        const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0);
        const startDayOfWeek = firstDay.getDay();

        const build = (dayMap) => {
          const grid = [];
          for (let i = startDayOfWeek - 1; i >= 0; i--) {
            grid.push({ dayNum: '', isCurrentMonth: false, events: [] });
          }
          for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const dayData = dayMap[dateStr];
            const events = dayData
              ? dayData.calendarEvents
              : (dateStr === this.selectedDate ? this.calendarEvents : []);
            grid.push({ dateStr, dayNum: day, isCurrentMonth: true, events });
          }
          while (grid.length % 7 !== 0) {
            grid.push({ dayNum: '', isCurrentMonth: false, events: [] });
          }
          return grid;
        };

        const cached = await IndexedDbStore.idbGetMonthOverview(monthStr);
        this.monthlyGrid = build((cached && cached.days) || {});

        const freshDays = await this._prefetchMonth(monthStr);
        // Only apply the refreshed grid if this month is still what's on screen -- avoids
        // clobbering a grid the user has since navigated away from.
        if (freshDays && this.activeView === 'monthly-calendar' &&
            `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}` === monthStr) {
          this.monthlyGrid = build(freshDays);
        }
      },

      /**
       * Creates a new daily task from `newTaskTitle`/`newTaskPriorityGroup`, then triggers a
       * 2-way sync.
       * @returns {Promise<void>}
       */
      async addDailyTask() {
        if (!this.newTaskTitle.trim()) return;
        try {
          const existingCount = this.dailyTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newTaskPriorityGroup, existingCount, this.newTaskTitle);
          const newTask = await this.bridge.addDailyTask(this.selectedDate, formattedTitle);
          this.dailyTasks.push(newTask);
          this.newTaskTitle = '';
          if (newTask._queuedOffline) await this.refreshOutboxCount();
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 addDailyTask error:', err);
          const errText = `Error adding task: ${err.message || err.toString()}`;
          this.errorMessage = errText;
          this.showToast(errText, 'error', 10000, 'Task Creation Notice');
        }
      },

      /**
       * Advances a task's status glyph to the next one in the cycle via `setTaskStatus`.
       * @param {object} task Daily task to update (mutated in place).
       * @returns {Promise<void>}
       */
      async toggleTaskStatus(task) {
        await this.setTaskStatus(task, getNextStatus(task.status));
      },

      /**
       * Sets a task's status directly, persists the change, and triggers a 2-way sync. Shared by
       * both the cycle-on-click handler (`toggleTaskStatus`) and the direct-select status
       * dropdown (`selectTaskStatus`), so picking "X" from the dropdown doesn't have to pass
       * through any intermediate status first.
       * @param {object} task Daily task to update (mutated in place).
       * @param {string} newStatus One of `STATUS_LIST`'s glyphs.
       * @returns {Promise<void>}
       */
      async setTaskStatus(task, newStatus) {
        if (!isValidStatus(newStatus)) {
          console.error(`🔥 setTaskStatus: ignoring invalid status "${newStatus}"`);
          return;
        }
        task.status = newStatus;
        try {
          if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
            const updated = await this.bridge.updateDailyTask(this.selectedDate, task.id, {
              title: task.title,
              status: task.status,
              dueDate: task.dueDate
            });
            if (!updated) {
              this.errorMessage = `Task "${task.title}" no longer exists in Google Tasks — status change was not saved.`;
            } else if (updated._queuedOffline) {
              await this.refreshOutboxCount();
            }
          }
        } catch (err) {
          console.error('🔥 toggleTaskStatus persist error:', err);
          this.errorMessage = `Could not save task status: ${err.message || err.toString()}`;
        }
        await this.trigger2WaySync();
      },

      /**
       * Selects a task status directly from the status-select dropdown, closes the dropdown,
       * and persists via `setTaskStatus`.
       * @param {object} task Daily task to update (mutated in place).
       * @param {string} newStatus One of `STATUS_LIST`'s glyphs.
       * @returns {Promise<void>}
       */
      async selectTaskStatus(task, newStatus) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = null;
        await this.setTaskStatus(task, newStatus);
      },

      /**
       * Opens the status-select dropdown for a task (hover or click) and cancels any pending
       * delayed-close from a previous hover, so re-entering the trigger/menu before the delay
       * elapses keeps it open.
       * @param {string} taskId Task whose dropdown to open.
       */
      openStatusMenu(taskId) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = taskId;
      },

      /**
       * Click handler for the status button: toggles the dropdown (same open/close-if-same-id
       * logic as a plain toggle), and cancels any pending hover-close so click and hover never race.
       * @param {string} taskId Task whose dropdown to toggle.
       */
      toggleStatusMenu(taskId) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = (this.openStatusMenuTaskId === taskId ? null : taskId);
      },

      /**
       * Closes the status dropdown ~250ms after the mouse leaves, instead of immediately, so
       * crossing the small gap between the button and the dropdown (or a brief overshoot) doesn't
       * close it. Re-entering before the timer fires (openStatusMenu) cancels it.
       * @param {string} taskId Task whose dropdown to close if still open.
       */
      scheduleStatusMenuClose(taskId) {
        clearTimeout(this.statusMenuCloseTimer);
        this.statusMenuCloseTimer = setTimeout(() => {
          if (this.openStatusMenuTaskId === taskId) this.openStatusMenuTaskId = null;
        }, 250);
      },

      /**
       * Transfers a master task to today's daily task list under priority group A.
       * @param {object} mTask Master task to transfer.
       * @returns {Promise<void>}
       */
      async moveMasterTaskToToday(mTask) {
        try {
          const transferred = await this.bridge.transferMasterTask(mTask, this.selectedDate, 'A');
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

      /**
       * Opens the event detail modal for a calendar event.
       * @param {object} evt Calendar event to display.
       * @returns {void}
       */
      openEventModal(evt) {
        this.selectedEvent = evt;
        this.eventModalOpen = true;
      },

      /**
       * Closes the event detail modal.
       * @returns {void}
       */
      closeEventModal() {
        this.eventModalOpen = false;
        this.selectedEvent = null;
      },

      /**
       * Computes an HH:MM end time from a start time and a duration in minutes.
       * @param {string} [startStr='09:00'] Start time in HH:MM format.
       * @param {number} [durationMin=25] Duration in minutes.
       * @returns {string} End time in HH:MM format.
       */
      calculateEndTime(startStr = '09:00', durationMin = 25) {
        const [hStr, mStr] = startStr.split(':');
        const h = parseInt(hStr, 10) || 9;
        const m = parseInt(mStr, 10) || 0;
        const totalMinutes = h * 60 + m + parseInt(durationMin, 10);
        const endH = Math.min(23, Math.floor(totalMinutes / 60));
        const endM = totalMinutes % 60;
        return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      },

      /**
       * Sets the new-event duration and recalculates its end time.
       * @param {number} durationMin Duration in minutes.
       * @returns {void}
       */
      setEventDuration(durationMin) {
        this.newEventData.duration = durationMin;
        this.newEventData.endTime = this.calculateEndTime(this.newEventData.startTime, durationMin);
      },

      /**
       * Recalculates the new-event end time after its start time input changes.
       * @returns {void}
       */
      onStartTimeChange() {
        this.newEventData.endTime = this.calculateEndTime(
          this.newEventData.startTime,
          this.newEventData.duration || 25
        );
      },

      /**
       * Opens the create-appointment modal, prefilling start/end time from a clicked time slot.
       * @param {string} [timeKey] Starting time key from the clicked grid slot (e.g. '09:00').
       * @param {number} [durationMin=25] Default duration in minutes.
       * @returns {void}
       */
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

      /**
       * Closes the create-appointment modal.
       * @returns {void}
       */
      closeCreateEventModal() {
        this.createEventModalOpen = false;
      },

      /**
       * Opens Google Calendar's native "create event" web UI in a popup window, prefilled from
       * `newEventData`, as an escape hatch for options the in-app modal doesn't cover.
       * @returns {void}
       */
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

      /**
       * Saves the new-event form as a calendar event: adds it optimistically to local state and
       * the schedule grid immediately, then persists it via the bridge (which provisions a real
       * Google Meet link/agenda doc server-side) and reconciles the optimistic entry in place.
       * @returns {Promise<void>}
       */
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
              if (saved._queuedOffline) await this.refreshOutboxCount();
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

      /**
       * Toggles the universal search modal, running a search on open.
       * @returns {void}
       */
      toggleSearchModal() {
        this.searchModalOpen = !this.searchModalOpen;
        if (this.searchModalOpen) {
          this.runSearch();
        }
      },

      /**
       * Closes the universal search modal.
       * @returns {void}
       */
      closeSearchModal() {
        this.searchModalOpen = false;
      },

      /**
       * Runs `searchQuery` against calendar events, daily/master tasks, the current daily note,
       * and index records, populating `searchResults`.
       * @returns {void}
       */
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

      /**
       * Parses a task title's priority prefix for template display. Thin wrapper around the
       * module-level `parseTaskTitle` helper.
       * @param {string} title Raw task title.
       * @returns {{priorityGroup: string|null, sequence: number|null, priorityCode: string|null, cleanTitle: string}}
       */
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