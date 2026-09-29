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
import { getQuoteForDateStr } from './quotesEngine.js';
import {
  getCached, setCached, invalidateCached, primeFromRange, hydrateFromIdb, getCachedRange,
  getCachedMasterTasks, setCachedMasterTasks, hydrateMasterTasksFromIdb,
  getCachedFutureMatrix, setCachedFutureMatrix, hydrateFutureMatrixFromIdb
} from './dailyDataCache.js';
window.GASBridge = GASBridge;
window.Alpine = Alpine;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Pure local year/month/day date arithmetic (never .toISOString() on a local date), per this
// repo's timezone-safety rule. Returns YYYY-MM-DD keys from centerDateStr - radiusDays through
// centerDateStr + radiusDays, inclusive, in ascending order.
function buildDateWindow(centerDateStr, radiusDays) {
  const [y, m, d] = centerDateStr.split('-').map(Number);
  const dates = [];
  for (let delta = -radiusDays; delta <= radiusDays; delta++) {
    const dt = new Date(y, m - 1, d + delta);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    dates.push(`${dt.getFullYear()}-${mm}-${dd}`);
  }
  return dates;
}

// Dictation-scratchpad (Google Doc STT fallback) tracking, kept outside Alpine's reactive
// data since sttScratchTargetEl holds a live DOM element reference, not plain state.
let sttScratchDocId = null;
let sttScratchTargetEl = null;

// Dictation popup tracking. SpeechRecognition/getUserMedia is blocked inside this app's own
// iframe by Google's userCodeAppPanel Permissions Policy (confirmed: its `allow` attribute
// omits `microphone`/`camera` — HtmlService renders that wrapper, not our code, so nothing in
// Code.gs/Index.html can change it). A same-origin popup window escapes that restriction (a new
// top-level browsing context gets its own default Permissions Policy, not the iframe's), so
// dictation actually runs there; the popup streams recognized text back via postMessage. Kept
// outside Alpine's reactive data for the same reason as sttScratchTargetEl above.
let dictationPopupWin = null;
let dictationPopupTargetEl = null;
let dictationPopupBaseValue = '';
let dictationPopupSelStart = 0;
let dictationPopupSelEnd = 0;

// Self-contained popup document (no external CSS/JS) matching the Day Planner binder aesthetic,
// intentionally minimal like Google's own Voice typing popup: a titlebar (label + help + close),
// a big mic button, and an error-only caption -- no separate status readout, no transcript box
// (text already flows live into the destination field via handleDictationPopupMessage below).
// The mic button stays a rounded square, not a circle, per the repo's no-pills rule.
const DICTATION_POPUP_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Voice typing</title><style>
  * { box-sizing:border-box; }
  body { margin:0; font-family: Georgia, 'Times New Roman', serif; background:#fcfbfa; color:#2d2a26;
    display:flex; flex-direction:column; align-items:center; }
  .titlebar { width:100%; display:flex; align-items:center; gap:2px; padding:11px 10px 11px 16px;
    background:#2d6a5a; }
  .titlebar-label { flex:1; font-size:14px; font-weight:700; color:#fcfbfa; letter-spacing:0.02em; }
  .titlebar-icon-btn { width:26px; height:26px; border:none; border-radius:4px; background:transparent;
    color:#dcebe6; display:flex; align-items:center; justify-content:center; cursor:pointer;
    transition: background 0.15s ease; padding:0; }
  .titlebar-icon-btn:hover { background:rgba(255,255,255,0.18); color:#ffffff; }
  .titlebar-icon-btn svg { width:17px; height:17px; }
  .help-panel { width:100%; max-height:0; overflow:hidden; background:#f8fcfa; font-size:12px;
    line-height:1.55; color:#4a453e; transition: max-height 0.22s ease; }
  .help-panel-inner { padding:12px 16px; border-bottom:1px solid #e4ddd0; }
  .help-panel-inner p { margin:0 0 8px; }
  .help-panel-inner p:last-child { margin-bottom:0; }
  .help-panel-inner kbd { font-family: -apple-system, 'Segoe UI', sans-serif; font-size:10px; font-weight:600;
    color:#5a544c; background:#ffffff; border:1px solid #d8d2c8; border-radius:4px; padding:2px 6px; }
  .mic-wrap { flex:1; width:100%; display:flex; flex-direction:column; align-items:center;
    justify-content:center; padding:22px 20px 10px; }
  .mic-btn { width:104px; height:104px; border-radius:16px; border:2px solid #2d6a5a; background:#eaf3f0;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    transition: background 0.15s ease; }
  .mic-btn:hover { background:#dcebe6; }
  .mic-btn.listening { background:#2d6a5a; animation: micGlow 1.6s ease-out infinite; }
  @keyframes micGlow {
    0% { box-shadow:0 0 0 0 rgba(45,106,90,0.45); }
    70% { box-shadow:0 0 0 18px rgba(45,106,90,0); }
    100% { box-shadow:0 0 0 0 rgba(45,106,90,0); }
  }
  .mic-btn svg { width:44px; height:44px; }
  .mic-btn path { fill:#2d6a5a; }
  .mic-btn.listening path { fill:#fcfbfa; }
  .caption { width:100%; min-height:18px; font-size:12px; color:#b0473f; text-align:center;
    padding:8px 16px 16px; overflow-wrap:break-word; }
</style></head>
<body>
  <div class="titlebar">
    <span class="titlebar-label">Voice typing</span>
    <button class="titlebar-icon-btn" id="helpBtn" type="button" aria-label="Voice typing help" title="Voice typing help">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>
    </button>
    <button class="titlebar-icon-btn" id="closeBtn" type="button" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
    </button>
  </div>
  <div class="help-panel" id="helpPanel">
    <div class="help-panel-inner">
      <p>Speaks directly into the Day Planner field you started this from.</p>
      <p><kbd>Space</kbd> start/stop the mic &nbsp; <kbd>Esc</kbd> close this window</p>
    </div>
  </div>
  <div class="mic-wrap">
    <button class="mic-btn" id="micBtn" type="button" aria-label="Start voice typing" title="Start voice typing (Space)">
      <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
    </button>
  </div>
  <div class="caption" id="caption"></div>
<script>(function(){
  var micBtn = document.getElementById('micBtn');
  var closeBtn = document.getElementById('closeBtn');
  var helpBtn = document.getElementById('helpBtn');
  var helpPanel = document.getElementById('helpPanel');
  var captionEl = document.getElementById('caption');
  var helpPanelInner = helpPanel.querySelector('.help-panel-inner');
  var recognition = null;
  var listening = false;
  var helpOpen = false;
  var baseline = '';
  var sessionFinal = '';
  // Difference between the window own outer size (what resizeTo sets) and its inner content
  // viewport -- i.e. the native browser chrome (title bar/toolbar) height/width this popup does
  // not control. Measured once so the eased resize below can request an outer size that leaves
  // exactly enough inner room for the actual content, instead of guessing a fixed pixel count
  // and either clipping content (a scrollbar) or leaving dead space.
  var chromeH = window.outerHeight - window.innerHeight;
  var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;

  function post(type, extra) {
    var payload = Object.assign({ source: 'day-planner-dictation', type: type }, extra || {});
    try { if (window.opener) window.opener.postMessage(payload, window.location.origin); } catch (e) { /* opener gone */ }
  }

  function currentText() { return baseline + sessionFinal; }

  function setMicTitle(text) {
    micBtn.title = text;
    micBtn.setAttribute('aria-label', text);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function easedResizeHeightTo(targetOuterH, duration) {
    var startH = window.outerHeight;
    var outerW = window.outerWidth;
    var startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      var t = Math.min(1, (ts - startTime) / duration);
      var h = Math.round(startH + (targetOuterH - startH) * easeOutCubic(t));
      try { window.resizeTo(outerW, h); } catch (e) { /* ignore */ }
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  helpBtn.addEventListener('click', function () {
    helpOpen = !helpOpen;
    // 25% taller than the panel own natural content height -- otherwise the max-height
    // transition and the resize below can settle a beat apart and clip a scrollbar in briefly.
    helpPanel.style.maxHeight = helpOpen ? Math.round(helpPanelInner.scrollHeight * 1.25) + 'px' : '0px';
    // Wait a frame so layout reflects the new max-height before measuring the page total.
    requestAnimationFrame(function () {
      var targetOuterH = document.body.scrollHeight + chromeH;
      easedResizeHeightTo(targetOuterH, 220);
    });
  });

  if (!Ctor) {
    captionEl.textContent = 'Speech recognition not supported in this window.';
    micBtn.disabled = true;
    post('dictation-unsupported');
  } else {
    micBtn.addEventListener('click', function () {
      if (listening) { recognition.stop(); return; }
      try { recognition = new Ctor(); } catch (e) {
        captionEl.textContent = 'Failed to start: ' + e.message;
        return;
      }
      sessionFinal = '';
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = function (event) {
        var finalT = '', interimT = '';
        for (var i = 0; i < event.results.length; i++) {
          var t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalT += t; else interimT += t;
        }
        sessionFinal = finalT;
        post('dictation-interim', { text: currentText() + interimT });
      };
      recognition.onerror = function (event) {
        listening = false;
        micBtn.classList.remove('listening');
        setMicTitle('Start voice typing (Space)');
        var reason = event.error || 'unknown';
        if (reason === 'not-allowed' || reason === 'permission-denied') {
          captionEl.textContent = 'Microphone permission denied.';
          post('dictation-error', { reason: reason });
        } else if (reason === 'no-speech') {
          captionEl.textContent = 'No speech detected -- click mic to try again.';
        } else if (reason === 'network') {
          captionEl.textContent = 'Network error reaching speech service.';
          post('dictation-error', { reason: reason });
        } else {
          captionEl.textContent = 'Error: ' + reason;
        }
      };
      recognition.onend = function () {
        listening = false;
        micBtn.classList.remove('listening');
        setMicTitle('Start voice typing (Space)');
        baseline = currentText();
        sessionFinal = '';
      };
      try {
        recognition.start();
        listening = true;
        micBtn.classList.add('listening');
        setMicTitle('Stop voice typing (Space)');
        captionEl.textContent = '';
      } catch (e) {
        captionEl.textContent = 'Failed to start: ' + e.message;
      }
    });
  }

  closeBtn.addEventListener('click', function () {
    if (listening && recognition) { try { recognition.stop(); } catch (e) { /* already stopped */ } }
    window.close();
  });

  // Grab keyboard focus so Space/Escape work immediately without an extra click.
  try { window.focus(); } catch (e) { /* ignore */ }
  micBtn.focus();

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar') {
      e.preventDefault();
      micBtn.click();
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeBtn.click();
    }
  });

  window.addEventListener('beforeunload', function () {
    post('dictation-final', { text: currentText(), closed: true });
  });
})();` + '<' + '/script>' + `
</body></html>`;

Alpine.data('plannerApp', () => ({
      activeView: 'daily',
      selectedDate: getLocalDateStr(),
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      appBuildNumber: null,

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
      newMasterTaskDueDate: '',
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
      dailyLoading: true,
      sttSupported: false,
      sttListening: false,
      sttError: null,
      sttBlocked: false,
      sttRefreshing: false,
      sttRefreshedFlash: false,
      sttScratchDocUrl: '',
      sttScratchCreating: false,
      geminiEnabled: true,
      aiAssistError: null,
      noteViewMode: 'cards', // 'cards' (Option 1) or 'doc' (Option 2)
      quoteCardCollapsed: false,
      noteFilterMenuOpen: false,
      noteCardSearchQuery: '',
      noteCardCategoryFilter: 'ALL',
      noteCategoryOptions: ['Work', 'Personal', 'Meeting', 'Decision', 'Project'],
      selectedNoteCategories: ['Work'],
      topicColWidth: 112,
      isHeaderResizing: false,
      docPreviewEditing: false,
      noteSaveTimer: null,
      // Per-date edit counter, bumped on every local write-through (note edit, task mutation).
      // loadDayData snapshots this before a background revalidation fetch and skips applying the
      // response if it changed while the fetch was in flight, so a slow round trip can never
      // stomp an edit the user made in the meantime.
      dailyEditSeq: {},
      // Same edit-guard pattern as dailyEditSeq, but for the single global Master Tasks list and
      // the Future Planning matrix (keyed by year) -- bumped on every local mutation so a
      // background revalidation started before the mutation can't overwrite it afterward.
      masterTasksEditSeq: 0,
      futureMatrixEditSeq: {},
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

      // Themed Day Calendar Picker state
      dayPickerOpen: false,
      dayPickerYear: null,
      dayPickerMonth: null,
      masterTaskDuePickerOpen: false,
      masterTaskDuePickerYear: null,
      masterTaskDuePickerMonth: null,

      // Insert Hyperlink Modal state
      linkModalOpen: false,
      linkModalCard: null,
      linkModalLineIdx: null,
      linkModalSelStart: null,
      linkModalSelEnd: null,
      linkModalUrl: '',
      linkModalText: '',
      linkModalResolving: false,
      linkModalDetectedDrive: false,
      linkModalLastResolvedUrl: '',
      linkModalError: null,

      // Task inputs
      newTaskTitle: '',
      newTaskCategory: '',
      newTaskPriorityGroup: 'A',

      // Resizable 3-Column Layout state
      colWidths: [33.33, 33.33, 33.34],
      isResizing: false,
      activeResizerIndex: null,
      maximizedColumn: null, // 'tasks' | 'appointments' | 'notes' | null

      bridge: null,

      theme: 'light',

      // Topic LRU state (10 items max, persistent)
      recentTopics: [],
      activeTopicCardId: null,
      topicSelectedIndex: -1,

      // Desktop install modal state
      installModalOpen: false,

      get availableCategories() {
        const set = new Set(['General', 'Work', 'Personal', 'Financial', 'Projects', 'Health', 'Meeting', 'Decision']);
        if (Array.isArray(this.masterTasks)) {
          this.masterTasks.forEach(t => {
            if (t.category && typeof t.category === 'string') {
              set.add(t.category.trim());
            }
          });
        }
        if (Array.isArray(this.dailyTasks)) {
          this.dailyTasks.forEach(t => {
            if (t.category && typeof t.category === 'string') {
              set.add(t.category.trim());
            }
          });
        }
        return Array.from(set).sort();
      },

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
        this.appBuildNumber = typeof window !== 'undefined' ? (window.DAY_PLANNER_BUILD_NUMBER ?? null) : null;
        this.sttSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        this.sttBlocked = !this.sttSupported;
        this.initTheme();
        this.initAiAssist();
        this.initColumnWidths();
        this.initRecentTopics();
        await this.loadDayData();
        await this.loadMasterTasks();
        this.setupKeyboardShortcuts();
        if (typeof window !== 'undefined') {
          window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredInstallPrompt = e;
          });
          window.addEventListener('appinstalled', () => {
            window.deferredInstallPrompt = null;
          });
          window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.source !== 'day-planner-dictation') return;
            this.handleDictationPopupMessage(data);
          });
        }
        // Defer initial focus to avoid iframe cross-origin autofocus block
        setTimeout(() => {
          this.focusTaskInput();
        }, 150);
      },

      initRecentTopics() {
        try {
          const saved = localStorage.getItem('dayPlannerRecentTopics');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.recentTopics = parsed.slice(0, 10);
              return;
            }
          }
        } catch {
          // ignore localStorage error
        }
        this.recentTopics = ['Sprint', '1:1', 'Standup', 'Planning', 'Admin', 'Architecture', 'Bug Triage', 'Personal', 'Review', 'General'];
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
        document.documentElement.style.colorScheme = this.theme;
      },

      initAiAssist() {
        try {
          const saved = localStorage.getItem('dayPlannerGeminiEnabled');
          this.geminiEnabled = saved === null ? true : saved === 'true';
        } catch {
          this.geminiEnabled = true;
        }
      },

      toggleGeminiEnabled() {
        this.geminiEnabled = !this.geminiEnabled;
        this.aiAssistError = null;
        try {
          localStorage.setItem('dayPlannerGeminiEnabled', String(this.geminiEnabled));
        } catch {
          // ignore localStorage quota/disabled errors
        }
      },

      disableAiAssist(message) {
        this.geminiEnabled = false;
        this.aiAssistError = message;
        try {
          localStorage.setItem('dayPlannerGeminiEnabled', 'false');
        } catch {
          // ignore localStorage quota/disabled errors
        }
      },

      // Opens the day's real Google Doc so the user can use Docs' own Gemini/dictionary/spelling
      // tools -- Day Planner can't detect whether Gemini is actually available on this account
      // (docs.google.com is cross-origin from this app), so support is a manual toggle instead
      // of a feature probe; any failure here auto-disables the button rather than erroring again.
      async openAiAssist() {
        if (!this.geminiEnabled) return;
        try {
          let url = this.dailyDocUrl;
          if (!url) {
            const data = await this.bridge.getDailyData(this.selectedDate);
            url = (data && data.docUrl) || '';
            if (url) this.dailyDocUrl = url;
          }
          if (!url) throw new Error('No document URL returned for this day.');
          const win = window.open(url, '_blank', 'noopener,noreferrer');
          if (!win) throw new Error('Popup blocked by the browser.');
        } catch (err) {
          console.error('[AI Assist] failed to open Google Doc', err);
          this.disableAiAssist('Couldn’t open the Google Doc, so the AI Assist button has been turned off. Re-enable it from the About page.');
        }
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

          const isInputFocused = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);

          if ((e.ctrlKey || e.metaKey) && e.altKey && keyLower === 's') {
            e.preventDefault();
            if (e.target && e.target.id === 'evtDescInput') {
              this.toggleDictation(e.target);
            } else if (e.target && e.target.id && e.target.id.indexOf('card-line-') === 0) {
              this.toggleDictation(e.target);
            } else if (this.eventModalOpen) {
              const el = document.getElementById('evtDescInput');
              if (el) this.toggleDictation(el);
            } else {
              this.startDictationOnDefaultLine();
            }
            return;
          }

          if ((e.ctrlKey || e.metaKey) && keyLower === 'k') {
            if (!isInputFocused) {
              e.preventDefault();
              this.toggleSearchModal();
            }
          } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'f') {
            e.preventDefault();
            this.toggleSearchModal();
          } else if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === '/')) && !isInputFocused) {
            e.preventDefault();
            this.toggleSearchModal();
          } else if (e.key === 'Escape') {
            if (this.dayPickerOpen) {
              e.preventDefault();
              this.closeDayPicker();
            } else if (this.masterTaskDuePickerOpen) {
              e.preventDefault();
              this.closeMasterTaskDuePicker();
            } else if (this.monthPickerOpen) {
              e.preventDefault();
              this.closeMonthPicker();
            } else if (this.linkModalOpen) {
              e.preventDefault();
              this.closeLinkModal();
            } else if (this.searchModalOpen) {
              e.preventDefault();
              this.closeSearchModal();
            } else if (this.eventModalOpen) {
              e.preventDefault();
              this.closeEventModal();
            } else if (this.createEventModalOpen) {
              e.preventDefault();
              this.closeCreateEventModal();
            } else if (this.installModalOpen) {
              e.preventDefault();
              this.closeInstallModal();
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
          await this.loadMonthlyCalendarData();
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

      applyFutureMatrix(matrix) {
        Object.keys(matrix.months || {}).forEach(monthKey => {
          (matrix.months[monthKey] || []).forEach(item => {
            if (!item._transferDate) item._transferDate = `${monthKey}-01`;
          });
        });
        this.futureMatrix = matrix;
      },

      // Bumps the year's edit guard and writes the current live futureMatrix through to the
      // cache. Called after any in-place mutation so a subsequent visit (or a background
      // revalidation already in flight) never reads back stale data.
      syncFutureMatrixCacheFromLiveState() {
        const year = this.futureMatrixYear;
        this.futureMatrixEditSeq[year] = (this.futureMatrixEditSeq[year] || 0) + 1;
        setCachedFutureMatrix(year, this.futureMatrix);
      },

      // Stale-while-revalidate + IndexedDB hydration, same pattern as loadDayData/loadMasterTasks.
      async loadFutureMatrix() {
        const year = this.futureMatrixYear;
        const cached = getCachedFutureMatrix(year) || await hydrateFutureMatrixFromIdb(year);
        if (cached) this.applyFutureMatrix(cached);
        const seqAtFetchStart = this.futureMatrixEditSeq[year] || 0;
        try {
          const matrix = await this.bridge.getFutureMatrix(year);
          if (year !== this.futureMatrixYear) return; // user navigated to a different year
          if ((this.futureMatrixEditSeq[year] || 0) !== seqAtFetchStart) return; // superseded by a local edit
          setCachedFutureMatrix(year, matrix);
          this.applyFutureMatrix(matrix);
        } catch (err) {
          console.error('loadFutureMatrix error:', err);
          if (!cached) {
            this.errorMessage = `Could not load Future Planning Matrix: ${err.message || err.toString()}`;
          }
        }
      },

      async changeFutureMatrixYear(delta) {
        this.futureMatrixYear += delta;
        await this.loadFutureMatrix();
      },

      async jumpToCurrentFutureYear() {
        this.futureMatrixYear = new Date().getFullYear();
        await this.loadFutureMatrix();
      },

      isCurrentFutureMonth(monthIdx) {
        const now = new Date();
        return this.futureMatrixYear === now.getFullYear() && monthIdx === now.getMonth();
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
          this.syncFutureMatrixCacheFromLiveState();
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
          this.syncFutureMatrixCacheFromLiveState();
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
          this.syncFutureMatrixCacheFromLiveState();
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
            this.syncFutureMatrixCacheFromLiveState();
            // The transfer created a new daily task on targetDate without us holding its full
            // live state here -- invalidate rather than guess, same as moveMasterTaskToDate.
            invalidateCached(targetDate);
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
            this.syncFutureMatrixCacheFromLiveState();
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
          this.syncFutureMatrixCacheFromLiveState();
        } catch (err) {
          console.error('deleteFutureItemFromMonth error:', err);
          this.errorMessage = `Error deleting item: ${err.message || err.toString()}`;
        }
      },

      async navigateDay(delta) {
        const d = new Date(`${this.selectedDate}T00:00:00`);
        d.setDate(d.getDate() + delta);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        this.selectedDate = `${d.getFullYear()}-${mm}-${dd}`;
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

      formatSelectedDateDisplay(dateStr) {
        if (!dateStr) return '';
        const d = new Date(`${dateStr}T00:00:00`);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      },

      formatIndexDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(`${dateStr}T00:00:00`);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },

      openDayPicker() {
        const [y, m] = (this.selectedDate || getLocalDateStr()).split('-').map(Number);
        this.dayPickerYear = y || new Date().getFullYear();
        this.dayPickerMonth = m || (new Date().getMonth() + 1);
        this.dayPickerOpen = true;
      },

      toggleDayPicker() {
        if (this.dayPickerOpen) {
          this.closeDayPicker();
        } else {
          this.openDayPicker();
        }
      },

      closeDayPicker() {
        this.dayPickerOpen = false;
      },

      navigateDayPickerMonth(delta) {
        let m = (this.dayPickerMonth || (new Date().getMonth() + 1)) + delta;
        let y = this.dayPickerYear || new Date().getFullYear();
        if (m > 12) {
          m = 1;
          y += 1;
        } else if (m < 1) {
          m = 12;
          y -= 1;
        }
        this.dayPickerMonth = m;
        this.dayPickerYear = y;
      },

      dayPickerMonthLabel() {
        const m = this.dayPickerMonth || (new Date().getMonth() + 1);
        const y = this.dayPickerYear || new Date().getFullYear();
        const name = MONTH_NAMES[m - 1] || '';
        return `${name} ${y}`;
      },

      dayPickerCells() {
        const y = this.dayPickerYear || new Date().getFullYear();
        const m = this.dayPickerMonth || (new Date().getMonth() + 1);
        const firstDay = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0);
        const totalDays = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        const prevMonthLastDay = new Date(y, m - 1, 0).getDate();
        const todayStr = getLocalDateStr();
        const cells = [];

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          const day = prevMonthLastDay - i;
          const prevM = m === 1 ? 12 : m - 1;
          const prevY = m === 1 ? y - 1 : y;
          const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          cells.push({
            dayNum: day,
            dateStr,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.selectedDate
          });
        }

        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          cells.push({
            dayNum: day,
            dateStr,
            isCurrentMonth: true,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.selectedDate
          });
        }

        let nextDay = 1;
        const nextM = m === 12 ? 1 : m + 1;
        const nextY = m === 12 ? y + 1 : y;
        while (cells.length % 7 !== 0 || cells.length < 35) {
          const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
          cells.push({
            dayNum: nextDay,
            dateStr,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.selectedDate
          });
          nextDay++;
        }

        return cells;
      },

      async selectDayPickerDate(dateStr) {
        if (!dateStr) return;
        this.closeDayPicker();
        await this.jumpToDate(dateStr);
        if (this.activeView !== 'daily') {
          this.setView('daily');
        }
      },

      openMasterTaskDuePicker() {
        const [y, m] = (this.newMasterTaskDueDate || getLocalDateStr()).split('-').map(Number);
        this.masterTaskDuePickerYear = y || new Date().getFullYear();
        this.masterTaskDuePickerMonth = m || (new Date().getMonth() + 1);
        this.masterTaskDuePickerOpen = true;
      },

      toggleMasterTaskDuePicker() {
        if (this.masterTaskDuePickerOpen) {
          this.closeMasterTaskDuePicker();
        } else {
          this.openMasterTaskDuePicker();
        }
      },

      closeMasterTaskDuePicker() {
        this.masterTaskDuePickerOpen = false;
      },

      navigateMasterTaskDuePickerMonth(delta) {
        let m = (this.masterTaskDuePickerMonth || (new Date().getMonth() + 1)) + delta;
        let y = this.masterTaskDuePickerYear || new Date().getFullYear();
        if (m > 12) { m = 1; y += 1; }
        else if (m < 1) { m = 12; y -= 1; }
        this.masterTaskDuePickerMonth = m;
        this.masterTaskDuePickerYear = y;
      },

      masterTaskDuePickerMonthLabel() {
        const m = this.masterTaskDuePickerMonth || (new Date().getMonth() + 1);
        const y = this.masterTaskDuePickerYear || new Date().getFullYear();
        return `${MONTH_NAMES[m - 1] || ''} ${y}`;
      },

      masterTaskDuePickerCells() {
        const y = this.masterTaskDuePickerYear || new Date().getFullYear();
        const m = this.masterTaskDuePickerMonth || (new Date().getMonth() + 1);
        const firstDay = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0);
        const totalDays = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        const prevMonthLastDay = new Date(y, m - 1, 0).getDate();
        const todayStr = getLocalDateStr();
        const cells = [];

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          const day = prevMonthLastDay - i;
          const prevM = m === 1 ? 12 : m - 1;
          const prevY = m === 1 ? y - 1 : y;
          const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          cells.push({
            dayNum: day,
            dateStr,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.newMasterTaskDueDate
          });
        }

        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          cells.push({
            dayNum: day,
            dateStr,
            isCurrentMonth: true,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.newMasterTaskDueDate
          });
        }

        let nextDay = 1;
        const nextM = m === 12 ? 1 : m + 1;
        const nextY = m === 12 ? y + 1 : y;
        while (cells.length % 7 !== 0 || cells.length < 35) {
          const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
          cells.push({
            dayNum: nextDay,
            dateStr,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === this.newMasterTaskDueDate
          });
          nextDay++;
        }

        return cells;
      },

      selectMasterTaskDueDate(dateStr) {
        if (dateStr === 'today') dateStr = getLocalDateStr();
        this.newMasterTaskDueDate = dateStr;
        this.closeMasterTaskDuePicker();
      },

      clearMasterTaskDueDate() {
        this.newMasterTaskDueDate = '';
        this.closeMasterTaskDuePicker();
      },

      _lastDatePickerOpen: 0,
      openDatePicker() {
        this.toggleDayPicker();
      },

      async jumpToDate(targetDateStr) {
        if (!targetDateStr) return;
        const d = new Date(`${targetDateStr}T00:00:00`);
        if (isNaN(d.getTime())) return;
        this.selectedDate = targetDateStr;
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
          await this.loadMonthlyCalendarData();
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
          await this.loadMonthlyCalendarData();
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
          await this.loadMonthlyCalendarData();
        }
      },

      applyDailyData(data) {
        this.dailyTasks = data.tasks || [];
        this.calendarEvents = data.calendarEvents || [];
        this.dailyNote = data.noteContent || '';
        this.dailyDocUrl = data.docUrl || '';
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildScheduleGrid();
        this.buildIndexRecords();
      },

      bumpDailyEditSeq(dateStr) {
        this.dailyEditSeq[dateStr] = (this.dailyEditSeq[dateStr] || 0) + 1;
      },

      // Snapshots the currently-open day's live task/event state into the cache. Called after any
      // in-place mutation of this.dailyTasks/this.calendarEvents so a subsequent revisit of this
      // date (or a background prefetch elsewhere) doesn't read back stale pre-edit data.
      syncDailyCacheFromLiveState(dateStr = this.selectedDate) {
        if (dateStr !== this.selectedDate) return;
        this.bumpDailyEditSeq(dateStr);
        const existing = getCached(dateStr) || { noteContent: this.dailyNote, docUrl: this.dailyDocUrl };
        setCached(dateStr, {
          ...existing,
          tasks: this.dailyTasks,
          calendarEvents: this.calendarEvents,
          docUrl: this.dailyDocUrl
        });
      },

      // Stale-while-revalidate: render instantly from cache (memory, then IndexedDB) if present,
      // then always fetch fresh data in the background to both update the view (if still on this
      // date) and refill the cache. Guards every apply against the user having navigated to a
      // different date while this fetch was in flight (google.script.run responses can arrive out
      // of order), AND against a local edit (note typing, task mutation) landing while the fetch
      // was in flight -- otherwise a slow revalidation response overwrites newer local state with
      // stale server data, and the user's in-progress edit is silently reverted mid-keystroke.
      async loadDayData() {
        const dateStr = this.selectedDate;
        let cached = getCached(dateStr);
        if (!cached) {
          cached = await hydrateFromIdb(dateStr);
        }
        if (cached) {
          this.applyDailyData(cached);
        }
        this.dailyLoading = !cached;
        const seqAtFetchStart = this.dailyEditSeq[dateStr] || 0;
        try {
          const data = await this.bridge.getDailyData(dateStr);
          const editedWhileFetching = (this.dailyEditSeq[dateStr] || 0) !== seqAtFetchStart;
          if (editedWhileFetching) {
            // A local edit already wrote a newer version into the cache; this response is now
            // stale relative to it -- drop it instead of caching/applying over the newer edit.
            // The next navigation away and back will revalidate again.
            return;
          }
          setCached(dateStr, data);
          if (dateStr !== this.selectedDate) return; // user navigated away; cached for next visit
          if (data.error) {
            this.errorMessage = data.error;
          }
          if (data.warnings && data.warnings.length > 0) {
            this.errorMessage = data.warnings.join(' | ');
          }
          this.applyDailyData(data);
        } catch (err) {
          console.error('🔥 loadDayData error:', err);
          if (dateStr === this.selectedDate && !cached) {
            this.errorMessage = `Error loading daily workspace: ${err.message || err.toString()}`;
          }
        } finally {
          if (dateStr === this.selectedDate) this.dailyLoading = false;
        }
        this.scheduleDailyRangePrefetch();
      },

      // Debounced background prefetch of the +/-14-day window around the current day, so
      // repeated day-by-day navigation hits the cache instead of a fresh round trip each time.
      // Debounced so rapid arrow-key/click navigation doesn't fire one range call per day.
      scheduleDailyRangePrefetch() {
        if (this.rangePrefetchTimer) clearTimeout(this.rangePrefetchTimer);
        const centerDate = this.selectedDate;
        this.rangePrefetchTimer = setTimeout(() => {
          this.runDailyRangePrefetch(centerDate);
        }, 500);
      },

      async runDailyRangePrefetch(centerDateStr) {
        if (!this.bridge || typeof this.bridge.getDailyDataRange !== 'function') return;
        const windowDates = buildDateWindow(centerDateStr, 14);
        const missing = windowDates.filter(d => !getCached(d));
        if (missing.length === 0) return;
        try {
          const result = await this.bridge.getDailyDataRange(windowDates[0], windowDates[windowDates.length - 1]);
          if (result && result.days) primeFromRange(result.days);
        } catch (err) {
          console.error('🔥 background range prefetch failed:', err);
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
        (this.recentTopics || []).forEach(t => {
          if (t && t.trim()) topics.add(t.trim());
        });
        (this.noteCards || []).forEach(c => {
          if (c.indexTopic && c.indexTopic.trim()) topics.add(c.indexTopic.trim());
        });
        (this.indexRecords || []).forEach(r => {
          if (r.topic && r.topic.trim()) topics.add(r.topic.trim());
        });
        return Array.from(topics).sort();
      },

      openTopicDropdown(card) {
        if (!card) return;
        this.activeTopicCardId = card.id;
        this.topicSelectedIndex = -1;
      },

      closeTopicDropdown() {
        this.activeTopicCardId = null;
        this.topicSelectedIndex = -1;
      },

      filteredRecentTopics(card) {
        if (!card) return this.recentTopics || [];
        const q = (card.indexTopic || '').trim().toLowerCase();
        if (!q) return this.recentTopics || [];
        return (this.recentTopics || []).filter(t => t.toLowerCase().includes(q));
      },

      recordRecentTopic(topic) {
        if (!topic || typeof topic !== 'string') return;
        const clean = topic.trim();
        if (!clean) return;
        const list = (this.recentTopics || []).filter(t => t.toLowerCase() !== clean.toLowerCase());
        list.unshift(clean);
        this.recentTopics = list.slice(0, 10);
        try {
          localStorage.setItem('dayPlannerRecentTopics', JSON.stringify(this.recentTopics));
        } catch {
          // ignore
        }
      },

      removeRecentTopic(topicToRemove, event) {
        if (event) {
          event.stopPropagation();
          event.preventDefault();
        }
        if (!topicToRemove) return;
        this.recentTopics = (this.recentTopics || []).filter(t => t.toLowerCase() !== topicToRemove.toLowerCase());
        try {
          localStorage.setItem('dayPlannerRecentTopics', JSON.stringify(this.recentTopics));
        } catch {
          // ignore
        }
      },

      selectTopic(card, topic) {
        if (!card) return;
        card.indexTopic = topic;
        this.recordRecentTopic(topic);
        this.syncCardsToDailyNote();
        this.closeTopicDropdown();
      },

      handleTopicKeydown(event, card) {
        if (!event || !card) return;
        const matches = this.filteredRecentTopics(card);
        if (event.key === 'ArrowDown') {
          if (this.activeTopicCardId !== card.id) {
            this.openTopicDropdown(card);
          }
          event.preventDefault();
          if (matches.length > 0) {
            this.topicSelectedIndex = (this.topicSelectedIndex + 1) % matches.length;
          }
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (matches.length > 0) {
            this.topicSelectedIndex = (this.topicSelectedIndex - 1 + matches.length) % matches.length;
          }
        } else if (event.key === 'Enter') {
          if (this.activeTopicCardId === card.id && this.topicSelectedIndex >= 0 && this.topicSelectedIndex < matches.length) {
            event.preventDefault();
            this.selectTopic(card, matches[this.topicSelectedIndex]);
          } else {
            this.recordRecentTopic(card.indexTopic);
            this.closeTopicDropdown();
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.closeTopicDropdown();
        }
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

      toggleQuoteCard() {
        this.quoteCardCollapsed = !this.quoteCardCollapsed;
      },

      todaysQuote() {
        return getQuoteForDateStr(this.selectedDate);
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

      isLineCheckbox(line) {
        if (!line || typeof line !== 'string') return false;
        return /^[☐☒☑]\s/.test(line) || /^-\s\[[ xX]?\]\s/.test(line) || /^\[[ xX]?\]\s/.test(line);
      },

      isLineChecked(line) {
        if (!line || typeof line !== 'string') return false;
        return /^[☒☑]\s/.test(line) || /^-\s\[[xX]\]\s/.test(line) || /^\[[xX]\]\s/.test(line);
      },

      getLineTextWithoutCheckbox(line) {
        if (!line || typeof line !== 'string') return '';
        return line.replace(/^[☐☒☑]\s/, '').replace(/^-\s\[[ xX]?\]\s/, '').replace(/^\[[ xX]?\]\s/, '');
      },

      toggleCardCheckbox(card, idx, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!card) return;
        const lines = this.cardLines(card);
        if (idx == null || idx < 0 || idx >= lines.length) return;
        const line = lines[idx] || '';

        if (/^☐\s/.test(line)) {
          lines[idx] = '☒ ' + line.slice(2);
        } else if (/^[☒☑]\s/.test(line)) {
          lines[idx] = '☐ ' + line.slice(2);
        } else if (/^-\s\[\s?\]\s/.test(line)) {
          lines[idx] = '☒ ' + line.replace(/^-\s\[\s?\]\s/, '');
        } else if (/^-\s\[[xX]\]\s/.test(line)) {
          lines[idx] = '☐ ' + line.replace(/^-\s\[[xX]\]\s/, '');
        } else if (/^\[\s?\]\s/.test(line)) {
          lines[idx] = '☒ ' + line.replace(/^\[\s?\]\s/, '');
        } else if (/^\[[xX]\]\s/.test(line)) {
          lines[idx] = '☐ ' + line.replace(/^\[[xX]\]\s/, '');
        } else {
          return;
        }

        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      updateCardLine(card, idx, val) {
        if (!card) return;
        const lines = this.cardLines(card);
        let updatedVal = val;
        if (updatedVal.startsWith('[] ') || updatedVal.startsWith('[ ] ')) {
          updatedVal = '☐ ' + updatedVal.replace(/^\[\s?\]\s/, '');
        } else if (updatedVal.startsWith('- [ ] ') || updatedVal.startsWith('- [] ')) {
          updatedVal = '☐ ' + updatedVal.replace(/^-\s\[\s?\]\s/, '');
        } else if (updatedVal.startsWith('[x] ') || updatedVal.startsWith('[X] ')) {
          updatedVal = '☒ ' + updatedVal.replace(/^\[[xX]\]\s/, '');
        } else if (updatedVal.startsWith('- [x] ') || updatedVal.startsWith('- [X] ')) {
          updatedVal = '☒ ' + updatedVal.replace(/^-\s\[[xX]\]\s/, '');
        }
        lines[idx] = updatedVal;
        card.content = lines.join('\n');
        this.syncCardsToDailyNote();
      },

      handleLineKeydown(e, card, idx) {
        if (!card) return;
        const lines = this.cardLines(card);
        const currentLine = lines[idx] || '';

        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            this.applyCardFormat(card, 'checklist');
            return;
          }
        }

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
            e.stopPropagation();
            this.insertLineLink(card, idx);
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          if (currentLine === '☐ ' || currentLine === '☒ ' || currentLine === '☑ ' || currentLine === '- ') {
            lines[idx] = '';
            card.content = lines.join('\n');
            this.syncCardsToDailyNote();
            return;
          }
          let prefix = '';
          if (currentLine.startsWith('- ')) prefix = '- ';
          else if (/^[☐☒☑]\s/.test(currentLine)) prefix = '☐ ';
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
          setTimeout(() => {
            this.startEditingLine(card, idx + 1);
            const el = document.getElementById(`card-line-${card.id}-${idx + 1}`);
            if (el) {
              el.focus();
              try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ }
            }
          }, 40);
          return;
        } else if (e.key === 'Backspace') {
          if (currentLine === '☐ ' || currentLine === '☒ ' || currentLine === '☑ ') {
            e.preventDefault();
            lines[idx] = '';
            card.content = lines.join('\n');
            this.syncCardsToDailyNote();
            return;
          }
          if (!currentLine && lines.length > 1) {
            e.preventDefault();
            lines.splice(idx, 1);
            card.content = lines.join('\n');
            this.syncCardsToDailyNote();
            this.$nextTick(() => {
              this.startEditingLine(card, Math.max(0, idx - 1));
            });
            return;
          }
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

      isGoogleDriveDocUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        const isGoogle = /^https:\/\/(?:docs|drive)\.google\.com\//i.test(trimmed);
        if (!isGoogle) return false;
        return /\/d\/[a-zA-Z0-9_-]+/i.test(trimmed)
          || /[?&]id=[a-zA-Z0-9_-]+/i.test(trimmed)
          || /\/folders\/[a-zA-Z0-9_-]+/i.test(trimmed);
      },

      getDefaultLinkText(url) {
        if (!url || typeof url !== 'string') return 'Link';
        const trimmed = url.trim();
        if (/document/i.test(trimmed)) return 'Google Doc';
        if (/spreadsheets/i.test(trimmed)) return 'Google Sheet';
        if (/presentation/i.test(trimmed)) return 'Google Slide Deck';
        if (/forms/i.test(trimmed)) return 'Google Form';
        if (/folders/i.test(trimmed)) return 'Drive Folder';
        if (/drive\.google\.com/i.test(trimmed)) return 'Google Drive File';
        try {
          const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
          return parsed.hostname.replace(/^www\./, '');
        } catch {
          return trimmed;
        }
      },

      openLinkModal(card, idx) {
        if (!card) return;
        const lineIdx = idx ?? card._activeLineIndex ?? 0;
        const lines = this.cardLines(card);
        const lineText = lines[lineIdx] || '';

        const el = document.getElementById(`card-line-${card.id}-${lineIdx}`);
        let selStart = null;
        let selEnd = null;
        let selectedText = '';
        if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
          selStart = el.selectionStart;
          selEnd = el.selectionEnd;
          if (selStart !== selEnd) {
            const start = Math.min(selStart, selEnd);
            const end = Math.max(selStart, selEnd);
            selectedText = lineText.slice(start, end);
          }
        }

        this.linkModalCard = card;
        this.linkModalLineIdx = lineIdx;
        this.linkModalSelStart = selStart;
        this.linkModalSelEnd = selEnd;
        this.linkModalUrl = '';
        this.linkModalText = selectedText;
        this.linkModalResolving = false;
        this.linkModalDetectedDrive = false;
        this.linkModalLastResolvedUrl = '';
        this.linkModalError = null;
        this.linkModalOpen = true;

        this.$nextTick(() => {
          const input = this.$refs.linkModalUrlInput || document.getElementById('linkModalUrlInput');
          if (input) {
            input.focus();
            input.select();
          }
        });
      },

      closeLinkModal() {
        const card = this.linkModalCard;
        const idx = this.linkModalLineIdx;
        this.linkModalOpen = false;
        this.linkModalCard = null;
        this.linkModalLineIdx = null;
        this.linkModalSelStart = null;
        this.linkModalSelEnd = null;
        this.linkModalUrl = '';
        this.linkModalText = '';
        this.linkModalResolving = false;
        this.linkModalDetectedDrive = false;
        this.linkModalLastResolvedUrl = '';
        this.linkModalError = null;

        if (card && idx != null) {
          this.$nextTick(() => {
            const el = document.getElementById(`card-line-${card.id}-${idx}`);
            if (el) el.focus();
          });
        }
      },

      async handleLinkUrlInput() {
        const rawUrl = (this.linkModalUrl || '').trim();
        const normUrl = this.normalizeLinkUrl(rawUrl);
        const candidate = normUrl || rawUrl;
        const isDrive = this.isGoogleDriveDocUrl(candidate);
        this.linkModalDetectedDrive = isDrive;
        this.linkModalError = null;

        if (!isDrive) {
          if (!this.linkModalText || ['Google Doc', 'Drive Folder', 'Google Sheet', 'Google Slide Deck', 'Google Drive File', 'Link'].includes(this.linkModalText)) {
            this.linkModalText = this.getDefaultLinkText(candidate);
          }
          return;
        }

        if (this.linkModalLastResolvedUrl === candidate) return;

        this.linkModalResolving = true;
        try {
          const res = this.bridge && typeof this.bridge.resolveLinkTitle === 'function'
            ? await this.bridge.resolveLinkTitle(candidate)
            : { success: false, error: 'Bridge not available' };

          if (res && res.success && res.title) {
            this.linkModalLastResolvedUrl = candidate;
            this.linkModalText = res.title;
            this.linkModalError = null;
          } else {
            const detail = (res && res.error) ? res.error : 'Title lookup failed';
            this.linkModalError = detail;
            console.warn('Google Drive title lookup failed:', detail);
            if (!this.linkModalText || ['Google Doc', 'Drive Folder', 'Google Sheet', 'Google Slide Deck', 'Google Drive File', 'Link'].includes(this.linkModalText)) {
              this.linkModalText = this.getDefaultLinkText(candidate);
            }
          }
        } catch (err) {
          const errMsg = err?.message || String(err);
          this.linkModalError = errMsg;
          console.warn('Google Drive title lookup error:', err);
          if (!this.linkModalText) {
            this.linkModalText = this.getDefaultLinkText(candidate);
          }
        } finally {
          this.linkModalResolving = false;
        }
      },

      handleLinkUrlPaste(e) {
        const clipboard = e.clipboardData || window.clipboardData;
        const pasted = clipboard ? clipboard.getData('text/plain') : '';
        if (pasted) {
          setTimeout(() => {
            this.handleLinkUrlInput();
          }, 30);
        }
      },

      async submitLinkModal() {
        const rawUrl = (this.linkModalUrl || '').trim();
        const url = this.normalizeLinkUrl(rawUrl);
        if (!url) return;

        const card = this.linkModalCard;
        const idx = this.linkModalLineIdx;
        if (!card || idx == null) {
          this.closeLinkModal();
          return;
        }

        if (this.isGoogleDriveDocUrl(url) && !this.linkModalText && !this.linkModalResolving) {
          this.linkModalResolving = true;
          try {
            const res = this.bridge && typeof this.bridge.resolveLinkTitle === 'function'
              ? await this.bridge.resolveLinkTitle(url)
              : null;
            if (res && res.success && res.title) {
              this.linkModalText = res.title;
            }
          } catch (err) {
            console.warn('Google Drive title lookup failed on submit:', err);
          } finally {
            this.linkModalResolving = false;
          }
        }

        const displayText = (this.linkModalText || '').trim() || this.getDefaultLinkText(url);
        const wrapped = `[[link:${url}]]${displayText}[[/link]]`;

        const lines = this.cardLines(card);
        const lineText = lines[idx] || '';

        const selStart = this.linkModalSelStart;
        const selEnd = this.linkModalSelEnd;

        if (selStart !== null && selEnd !== null && selStart >= 0 && selEnd >= selStart) {
          const before = lineText.slice(0, selStart);
          const after = lineText.slice(selEnd);
          lines[idx] = before + wrapped + after;
        } else {
          lines[idx] = lineText ? `${lineText} ${wrapped}` : wrapped;
        }

        card.content = lines.join('\n');
        this.syncCardsToDailyNote();

        this.closeLinkModal();
        card._activeLineIndex = null;
      },

      insertLineLink(card, idx) {
        this.openLinkModal(card, idx);
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

      sttMicTitle() {
        if (this.sttError) return this.sttError;
        if (this.sttBlocked) return 'Mic blocked — use voice typing doc below (Ctrl+Alt+S)';
        if (!this.sttSupported) return 'Voice typing not supported here (Ctrl+Alt+S)';
        return this.sttListening ? 'Stop voice typing (Ctrl+Alt+S)' : 'Start voice typing (Ctrl+Alt+S)';
      },

      // Default dictation target when nothing/no line is focused: rather than block with an
      // error, behave like pressing Enter on the last line of the given card (or the most
      // recent note card, if none given -- the Ctrl+Alt+S hotkey has no card context) -- carry
      // forward its bullet/checkbox/numbered-list prefix (same convention as handleLineKeydown's
      // Enter handling) onto a fresh line, then dictate into that line. Reuses an existing
      // blank trailing line instead of adding another one. Shared by the mic button's
      // toggleCardDictation (below) and the Ctrl+Alt+S keyboard shortcut.
      startDictationOnDefaultLine(targetCard) {
        const card = targetCard
          || (Array.isArray(this.noteCards) && this.noteCards.length > 0
            ? this.noteCards[this.noteCards.length - 1]
            : null);
        if (!card) {
          this.sttError = 'Add a note card first, then Ctrl+Alt+S.';
          return;
        }
        const lines = this.cardLines(card);
        const lastLine = lines[lines.length - 1] || '';

        let targetIdx = lines.length - 1;
        if (lastLine !== '') {
          let prefix = '';
          if (lastLine.startsWith('- ')) prefix = '- ';
          else if (/^[☐☒☑]\s/.test(lastLine)) prefix = '☐ ';
          else {
            const numMatch = /^(\d+)\.\s/.exec(lastLine);
            if (numMatch) prefix = `${parseInt(numMatch[1], 10) + 1}. `;
          }
          lines.push(prefix);
          card.content = lines.join('\n');
          targetIdx = lines.length - 1;
          this.syncCardsToDailyNote();
        }

        this.startEditingLine(card, targetIdx);
        setTimeout(() => {
          const el = document.getElementById(`card-line-${card.id}-${targetIdx}`);
          if (el) this.toggleDictation(el);
        }, 60);
      },

      toggleCardDictation(card) {
        const idx = card && card._activeLineIndex;
        if (idx === null || idx === undefined || idx < 0) {
          this.startDictationOnDefaultLine(card);
          return;
        }
        const el = document.getElementById('card-line-' + card.id + '-' + idx);
        this.toggleDictation(el);
      },

      // Dictation runs in a popup window, not in this page, because SpeechRecognition/
      // getUserMedia is blocked inside this app's own iframe (Google's userCodeAppPanel wrapper
      // omits `microphone` from its Permissions Policy `allow` attribute — confirmed live, not
      // fixable from Code.gs/Index.html). A same-origin popup is a fresh top-level browsing
      // context, so it gets its own default Permissions Policy instead of inheriting the
      // iframe's, and the mic works there. See gas-namespace-iife.md-style reasoning: this is a
      // platform ceiling, not a bug in our markup.
      toggleDictation(el) {
        if (!el) return;
        if (dictationPopupWin && !dictationPopupWin.closed) {
          dictationPopupWin.close();
          dictationPopupWin = null;
          this.sttListening = false;
          return;
        }
        if (!this.sttSupported) {
          this.sttError = 'Voice typing not supported in this browser.';
          console.error('[STT] SpeechRecognition is not available on this browser/engine.');
          this.ensureDictationScratchDoc(el);
          return;
        }
        dictationPopupTargetEl = el;
        dictationPopupBaseValue = el.value;
        dictationPopupSelStart = el.selectionStart ?? dictationPopupBaseValue.length;
        dictationPopupSelEnd = el.selectionEnd ?? dictationPopupBaseValue.length;

        // Reverted the blob: URL navigation tried earlier this session -- it broke mic access
        // (SpeechRecognition/getUserMedia), likely because a blob:-origin popup does not get the
        // same default Permissions Policy as an about:blank one. Back to opening blank and
        // document.write()-ing the content in; this does mean the browser own popup info-chrome
        // shows about:blank instead of a real title, but a working mic matters more than that
        // cosmetic. The in-page titlebar below is deliberately prominent to compensate.
        const popup = window.open('', 'dayPlannerDictation', 'width=450,height=230');
        if (!popup) {
          this.sttError = 'Voice typing popup was blocked by the browser — using the voice typing doc instead.';
          this.sttBlocked = true;
          this.ensureDictationScratchDoc(el);
          return;
        }
        popup.document.write(DICTATION_POPUP_HTML);
        popup.document.close();
        popup.document.title = 'Voice typing';
        dictationPopupWin = popup;
        this.sttError = null;
        this.sttListening = true;
      },

      // Routes postMessage results from the dictation popup (see toggleDictation above) back
      // into whichever field opened it, and falls back to the Google Doc scratchpad if the
      // popup itself can't get mic access either.
      handleDictationPopupMessage(data) {
        const el = dictationPopupTargetEl;
        if (!el || !document.body.contains(el)) return;
        if (data.type === 'dictation-interim' || data.type === 'dictation-final') {
          el.value = dictationPopupBaseValue.slice(0, dictationPopupSelStart)
            + (data.text || '')
            + dictationPopupBaseValue.slice(dictationPopupSelEnd);
          el.dispatchEvent(new window.Event('input', { bubbles: true }));
          if (data.closed) {
            this.sttListening = false;
            dictationPopupWin = null;
          }
        } else if (data.type === 'dictation-error' || data.type === 'dictation-unsupported') {
          this.sttListening = false;
          this.sttBlocked = true;
          this.sttError = data.type === 'dictation-unsupported'
            ? 'Voice typing not supported in the popup window.'
            : 'Voice typing blocked: microphone permission denied.';
          console.error('[STT] dictation popup reported', data.type, data.reason || '');
          this.ensureDictationScratchDoc(el);
        }
      },

      // Inserts text at the current cursor/selection of a text input or textarea and fires a
      // native 'input' event so existing x-model/@input bindings pick up the change unchanged.
      insertTextIntoField(el, text) {
        const baseValue = el.value;
        const selStart = el.selectionStart ?? baseValue.length;
        const selEnd = el.selectionEnd ?? baseValue.length;
        el.value = baseValue.slice(0, selStart) + text + baseValue.slice(selEnd);
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        el.focus();
        const newPos = selStart + text.length;
        el.setSelectionRange(newPos, newPos);
      },

      openCardDictationScratchpad(card) {
        const idx = card && card._activeLineIndex;
        if (idx === null || idx === undefined || idx < 0) {
          this.sttError = 'Click into a note line first, then open the voice typing doc.';
          return;
        }
        const el = document.getElementById('card-line-' + card.id + '-' + idx);
        this.ensureDictationScratchDoc(el);
      },

      // Creates the scratch doc (if one isn't already ready) and exposes its URL as a real
      // link in the template — a genuine <a target="_blank"> click is what the user acts on,
      // not a programmatic window.open(), since that can silently open as a background tab a
      // window-switcher never surfaces, or get blocked outright with no visible signal. Google
      // Docs also can't be iframed (it sends `Content-Security-Policy: frame-ancestors
      // https://docs.google.com`, confirmed live), so a clickable link is the reliable option.
      async ensureDictationScratchDoc(el) {
        if (el) sttScratchTargetEl = el;
        if (sttScratchDocId && this.sttScratchDocUrl) return;
        this.sttScratchCreating = true;
        try {
          const result = await this.bridge.createDictationScratchDoc();
          if (!result || !result.success) {
            this.sttError = 'Could not create a voice typing doc: ' + ((result && result.error) || 'unknown error');
            console.error('[STT] createDictationScratchDoc failed', result);
            return;
          }
          sttScratchDocId = result.docId;
          this.sttScratchDocUrl = result.docUrl;
        } catch (err) {
          this.sttError = 'Could not create a voice typing doc: ' + (err.message || err);
          console.error('[STT] createDictationScratchDoc threw', err);
        } finally {
          this.sttScratchCreating = false;
        }
      },

      async pullFromDictationScratchpad() {
        if (!sttScratchDocId) {
          this.sttError = 'Open the voice typing doc first, then pull once you’re done.';
          return;
        }
        this.sttRefreshing = true;
        try {
          const result = await this.bridge.pullDictationScratchText(sttScratchDocId);
          if (!result || !result.success) {
            this.sttError = 'Could not pull voice-typed text: ' + ((result && result.error) || 'unknown error');
            console.error('[STT] pullDictationScratchText failed', result);
            return;
          }
          const text = (result.text || '').trim();
          if (!text) {
            this.sttError = 'No voice-typed text found — did you voice type before pulling? (Docs can take a couple seconds to save.)';
            return;
          }
          if (sttScratchTargetEl && document.body.contains(sttScratchTargetEl)) {
            this.insertTextIntoField(sttScratchTargetEl, text);
          } else {
            this.sttError = 'Pulled the text, but lost track of where to insert it — target field is gone.';
            console.error('[STT] scratch target element missing on pull');
            return;
          }
          // Doc read successfully and emptied server-side (Code.gs clears the body on pull) --
          // clear the local pointer so the next dictation starts a fresh doc.
          sttScratchDocId = null;
          this.sttScratchDocUrl = '';
          this.sttError = null;
          this.sttRefreshedFlash = true;
          setTimeout(() => { this.sttRefreshedFlash = false; }, 1800);
        } catch (err) {
          this.sttError = 'Could not pull voice-typed text: ' + (err.message || err);
          console.error('[STT] pullFromDictationScratchpad threw', err);
        } finally {
          this.sttRefreshing = false;
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
                     .replace(/^(-\s|\d+\.\s|[☐☒☑]\s)/, '');
        } else if (formatType === 'checklist') {
          if (/^☐\s/.test(line)) {
            line = '☒ ' + line.slice(2);
          } else if (/^[☒☑]\s/.test(line)) {
            line = line.slice(2);
          } else {
            if (line.startsWith('- ')) line = line.slice(2);
            else if (/^\d+\.\s/.test(line)) line = line.replace(/^\d+\.\s/, '');
            line = `☐ ${line}`;
          }
        } else if (formatType === 'bullet') {
          if (line.startsWith('- ')) line = line.slice(2);
          else if (/^[☐☒☑]\s/.test(line)) line = `- ${line.slice(2)}`;
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
            else if (/^[☐☒☑]\s/.test(line)) line = line.slice(2);
            line = `${prevNum + 1}. ${line}`;
          }
        } else if (formatType === 'color-default') {
          line = line.replace(/\[\[color:[a-z]+\]\]/g, '').replace(/\[\[\/color\]\]/g, '');
        } else if (formatType.startsWith('color-')) {
          const color = formatType.replace('color-', '');
          line = line.replace(/\[\[color:[a-z]+\]\]/g, '').replace(/\[\[\/color\]\]/g, '');
          const listMatch = /^(-\s|\d+\.\s|[☐☒☑]\s)/.exec(line);
          if (listMatch) {
            const marker = listMatch[0];
            const rest = line.slice(marker.length);
            line = `${marker}[[color:${color}]]${rest}[[/color]]`;
          } else {
            line = `[[color:${color}]]${line}[[/color]]`;
          }
        } else if (prefixMap[formatType]) {
          const m = prefixMap[formatType];
          const listMatch = /^(-\s|\d+\.\s|[☐☒☑]\s)/.exec(line);
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
        const listMatch = /^(-\s|\d+\.\s|[☐☒☑]\s)/.exec(rest);
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

          // 1. Bracket syntax: [[link:url]]linkText[[/link]]
          html = html.replace(/\[\[link:((?:https?|mailto):[^\]\s]+)\]\](.*?)\[\[\/link\]\]/g, (_m, url, linkText) => {
            const safeHrefUrl = url.replace(/"/g, '&quot;');
            const label = (linkText || '').trim() || url;
            return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${label}</a>`;
          });

          // 2. Standard markdown links: [link text](url)
          html = html.replace(/\[([^\]]+)\]\(((?:https?|mailto):[^)\s]+)\)/g, (_m, linkText, url) => {
            const safeHrefUrl = url.replace(/"/g, '&quot;');
            return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${linkText}</a>`;
          });

          // 3. Autolinks: <https://...>
          html = html.replace(/&lt;((?:https?|mailto):[^&>\s]+)&gt;/g, (_m, url) => {
            const safeHrefUrl = url.replace(/"/g, '&quot;');
            return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${url}</a>`;
          });

          // 4. Raw standalone URLs
          html = html.replace(/(^|[\s(])((?:https?):\/\/[^\s<)]+)/g, (_m, prefix, url) => {
            const safeHrefUrl = url.replace(/"/g, '&quot;');
            return `${prefix}<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${url}</a>`;
          });

          html = html.replace(/\*\*(.+?)\*\*/g, '<span class="note-render-bold">$1</span>');
          html = html.replace(/~~(.+?)~~/g, '<span class="note-render-strike">$1</span>');
          html = html.replace(/__(.+?)__/g, '<span class="note-render-underline">$1</span>');
          html = html.replace(/\*(.+?)\*/g, '<span class="note-render-italic">$1</span>');
          return html;
        };

        const orderedRe = /^\d+\.\s/;
        if (/^[☐☒☑]\s/.test(text) || /^-\s\[[ xX]?\]\s/.test(text) || /^\[[ xX]?\]\s/.test(text)) {
          const isChecked = /^[☒☑]\s/.test(text) || /^-\s\[[xX]\]\s/.test(text) || /^\[[xX]\]\s/.test(text);
          const glyph = isChecked ? '☒' : '☐';
          const checkedClass = isChecked ? ' note-checkbox-glyph-checked' : ' note-checkbox-glyph-open';
          const lineClass = isChecked ? ' note-line-checked' : '';
          const bodyText = text.replace(/^[☐☒☑]\s/, '').replace(/^-\s\[[ xX]?\]\s/, '').replace(/^\[[ xX]?\]\s/, '');
          return `<div class="note-render-line${lineClass}"><span class="note-checkbox-glyph${checkedClass}">${glyph}</span> ${renderInline(bodyText) || '&nbsp;'}</div>`;
        }
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
          const catMatch = trimmed.match(/^(?:-\s+)?#(?:category|categories):\s*(.+)$/i) || trimmed.match(/^categories:\s*(.+)$/i);
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
          // The leading "- " tolerance absorbs already-saved docs corrupted by the Docs API
          // bullet-inheritance bug (see buildDaySectionRequests_ in Code.gs) that turned this
          // line into "- #category: Work" -- without it, that line fell into card content and a
          // fresh tag got appended on every subsequent save, growing without bound.
          const catMatch = trimmed.match(/^(?:-\s+)?#(?:category|categories):\s*(.+)$/i) || trimmed.match(/^categories:\s*(.+)$/i);
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
        // Capture the date/content now, not when the timer fires -- navigating to a different
        // day within the debounce window changes this.selectedDate/this.dailyNote out from under
        // a fire-time read, which silently saved the note onto the wrong day (or lost it) instead
        // of the day the user was actually typing on.
        const dateStr = this.selectedDate;
        const noteContent = this.dailyNote;
        // Write through into the cache at edit time (optimistic), not on save success -- so
        // navigating back to this date inside the 1200ms debounce window shows the just-typed
        // content instead of the stale pre-edit cache entry.
        const existingCacheEntry = getCached(dateStr) || { tasks: this.dailyTasks, calendarEvents: this.calendarEvents, docUrl: this.dailyDocUrl };
        setCached(dateStr, { ...existingCacheEntry, noteContent });
        this.bumpDailyEditSeq(dateStr);
        this.noteSaveTimer = setTimeout(async () => {
          if (!this.bridge || typeof this.bridge.saveDailyDocCards !== 'function') return;
          try {
            await this.bridge.saveDailyDocCards(dateStr, noteContent);
          } catch (err) {
            console.error('🔥 saveDailyDocCards error:', err);
            this.errorMessage = `Could not save daily note: ${err.message || err.toString()}`;
          }
        }, 1200);
      },

      applyMasterTasks(tasks) {
        this.masterTasks = tasks || [];
        const today = getLocalDateStr();
        this.masterTasks.forEach(t => {
          if (!t._moveDate) t._moveDate = today;
          t._moving = false;
        });
      },

      // Bumps the edit guard and writes the current live masterTasks array through to the cache.
      // Called after any in-place mutation (add/delete/star/status/move) so a subsequent tab
      // switch (or a background revalidation already in flight) never reads back stale data.
      syncMasterTasksCacheFromLiveState() {
        this.masterTasksEditSeq += 1;
        setCachedMasterTasks(this.masterTasks);
      },

      // Stale-while-revalidate + IndexedDB hydration, same pattern as loadDayData: render
      // instantly from whatever's cached (memory, then IndexedDB), then always revalidate in the
      // background, dropping the response instead of applying/caching it if a local mutation
      // (add/delete/star/status/move) landed while the fetch was in flight.
      async loadMasterTasks() {
        const cached = getCachedMasterTasks() || await hydrateMasterTasksFromIdb();
        if (cached) this.applyMasterTasks(cached.tasks);
        const seqAtFetchStart = this.masterTasksEditSeq;
        try {
          const tasks = await this.bridge.getMasterTasks(`${this.selectedMonthName} ${this.selectedYear}`);
          if (this.masterTasksEditSeq !== seqAtFetchStart) return; // a local edit already superseded this
          setCachedMasterTasks(tasks);
          this.applyMasterTasks(tasks);
        } catch (err) {
          console.error('🔥 loadMasterTasks error:', err);
          if (!cached) {
            this.errorMessage = `Error loading master tasks: ${err.message || err.toString()}`;
          }
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
          const dueDate = this.newMasterTaskDueDate ? this.newMasterTaskDueDate.trim() : null;
          const existingCount = this.masterTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newMasterTaskPriorityGroup, existingCount, taskTitle);
          const created = await this.bridge.addMasterTask(formattedTitle, category, dueDate);
          created._moveDate = getLocalDateStr();
          created._moving = false;
          created._isNew = true;
          if (!created.category) created.category = category;
          if (!created.status) created.status = '•';
          this.masterTasks.push(created);
          this.newMasterTaskTitle = '';
          this.newMasterTaskCategory = '';
          this.newMasterTaskDueDate = '';
          this.syncMasterTasksCacheFromLiveState();

          // Guarantee visibility: if user was filtering by future or overdue/today,
          // undated master tasks wouldn't show. Switch horizon to 'all'.
          if (this.masterTaskDateFilter === 'future' || this.masterTaskDateFilter === 'overdue-today') {
            this.masterTaskDateFilter = 'all';
          }
          // Also ensure status filter includes '•' (Open) so new task is visible
          if (Array.isArray(this.masterTaskStatusFilter) && !this.masterTaskStatusFilter.includes('•')) {
            this.masterTaskStatusFilter.push('•');
          }

          setTimeout(() => {
            created._isNew = false;
          }, 2000);
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
          this.syncMasterTasksCacheFromLiveState();
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
              this.syncDailyCacheFromLiveState();
            } else {
              // Forwarding onto a date that isn't currently open touches that day's task list
              // without us having its full live state here -- invalidate rather than guess, so
              // the next visit (or a background prefetch) re-fetches instead of reading stale data.
              invalidateCached(targetDate);
            }
            const updatedMaster = await this.bridge.markMasterTaskMoved(mTask.id, targetDate, transferred.id);
            if (updatedMaster) {
              mTask.movedTo = updatedMaster.movedTo;
              mTask.movedTaskId = updatedMaster.movedTaskId;
              mTask.status = updatedMaster.status || '→';
              mTask.dueDate = updatedMaster.movedTo || targetDate;
            }
            this.syncMasterTasksCacheFromLiveState();
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

      // Builds the grid from whatever of the visible month is already cached (getCachedRange,
      // memory only -- see loadMonthlyCalendarData for the hydrate/revalidate that fills it).
      // Mock mode keeps its own full-dataset events source since there's no RPC/cache to drive.
      buildMonthlyGrid() {
        const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0);
        const days = [];
        const startDayOfWeek = firstDay.getDay();
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const mm = this.selectedMonth.toString().padStart(2, '0');
        const monthStartStr = `${this.selectedYear}-${mm}-01`;
        const monthEndStr = `${this.selectedYear}-${mm}-${lastDay.getDate().toString().padStart(2, '0')}`;

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        const isMock = this.bridge?.useMock && this.bridge?.mockData?.calendarEvents;
        const eventsSource = isMock ? Object.values(this.bridge.mockData.calendarEvents).flat() : null;
        const cachedDays = isMock ? null : getCachedRange(monthStartStr, monthEndStr);

        for (let day = 1; day <= lastDay.getDate(); day++) {
          const dateStr = `${this.selectedYear}-${mm}-${day.toString().padStart(2, '0')}`;
          let dayEvents;
          if (isMock) {
            dayEvents = eventsSource.filter(e => {
              if (!e.startTime) return false;
              const d = new Date(e.startTime);
              if (isNaN(d.getTime())) return e.startTime.startsWith(dateStr);
              const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              return localDate === dateStr;
            });
          } else {
            dayEvents = (cachedDays[dateStr] && cachedDays[dateStr].calendarEvents) || [];
          }
          days.push({ dateStr, dayNum: day, isCurrentMonth: true, events: dayEvents, isToday: dateStr === todayStr });
        }

        while (days.length % 7 !== 0) {
          days.push({ dayNum: '', isCurrentMonth: false, events: [] });
        }

        this.monthlyGrid = days;
      },

      // Stale-while-revalidate for the Monthly Calendar tab: paint instantly from whatever of the
      // visible month is already cached, then always fetch the full month range live in the
      // background to both fill in missing days and refresh stale ones. No separate monthOverview
      // IndexedDB store -- see the header comment in dailyDataCache.js for why (reuses the
      // per-date dailyData store getDailyDataRange already batches for this exact case).
      async loadMonthlyCalendarData() {
        this.buildMonthlyGrid();
        if (this.bridge?.useMock || typeof this.bridge.getDailyDataRange !== 'function') return;
        const mm = this.selectedMonth.toString().padStart(2, '0');
        const lastDay = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
        const monthStartStr = `${this.selectedYear}-${mm}-01`;
        const monthEndStr = `${this.selectedYear}-${mm}-${lastDay.toString().padStart(2, '0')}`;
        const requestedYear = this.selectedYear;
        const requestedMonth = this.selectedMonth;
        try {
          const result = await this.bridge.getDailyDataRange(monthStartStr, monthEndStr);
          if (result && result.days) primeFromRange(result.days);
          if (requestedYear !== this.selectedYear || requestedMonth !== this.selectedMonth) return;
          if (this.activeView === 'monthly-calendar') this.buildMonthlyGrid();
        } catch (err) {
          console.error('🔥 loadMonthlyCalendarData error:', err);
        }
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
          const category = (this.newTaskCategory && this.newTaskCategory.trim()) || 'Work';
          const existingCount = this.dailyTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newTaskPriorityGroup, existingCount, taskTitle);
          const newTask = await this.bridge.addDailyTask(this.selectedDate, formattedTitle, category);
          newTask._isNew = true;
          this.dailyTasks.push(newTask);
          this.newTaskTitle = '';
          this.newTaskCategory = '';
          this.syncDailyCacheFromLiveState();
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
          this.syncDailyCacheFromLiveState();
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
          } else if (isMaster) {
            this.syncMasterTasksCacheFromLiveState();
          } else {
            this.syncDailyCacheFromLiveState();
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
        // A status change can touch both lists at once (a linked master<->daily pair mirrors the
        // status either direction), so sync both caches regardless of which side was edited.
        this.syncDailyCacheFromLiveState();
        this.syncMasterTasksCacheFromLiveState();
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

      openInstallModal() {
        this.installModalOpen = true;
      },

      closeInstallModal() {
        this.installModalOpen = false;
      },

      triggerInstallApp() {
        if (typeof window !== 'undefined' && window.deferredInstallPrompt) {
          window.deferredInstallPrompt.prompt();
          if (window.deferredInstallPrompt.userChoice) {
            window.deferredInstallPrompt.userChoice.then((choiceResult) => {
              if (choiceResult && choiceResult.outcome === 'accepted') {
                window.deferredInstallPrompt = null;
              }
            });
          }
        } else {
          this.openInstallModal();
        }
      },

      parseTask(title) {
        return parseTaskTitle(title);
      }
    }));
Alpine.start();