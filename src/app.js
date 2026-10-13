import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { GASBridge } from './gasBridge.js';
import { getLocalDateStr } from './binderStore.js';
import {
  isHubViewVisible, scoreBandLabel, ledgerStatusLabel, canRetryLedger, formatCutoffCountdown,
  QUEUE_ORDER, QUEUE_TITLES
} from './hubUi.js';
import {
  parseTaskTitle,
  formatTaskTitle,
  updateTaskTitleText,
  getNextStatus,
  isValidStatus,
  STATUS_OPTIONS,
  sortTasksByColumn,
  extractTaskDetails,
  extractInlinePriority,
  filterTasksByStatus,
  filterTasksByDateHorizon
} from './taskEngine.js';
import { executeUniversalSearch, flattenSearchResults, mergeArchiveSearchResults } from './searchEngine.js';
import { formatEventDescriptionHtml, extractMeetLink } from './calendarEngine.js';
import { parseIndexEntriesFromNote } from './indexParser.js';
import { getQuoteForDateStr } from './quotesEngine.js';
import {
  getCached, setCached, invalidateCached, primeFromRange, hydrateFromIdb, getCachedRange,
  getCachedMasterTasks, setCachedMasterTasks, hydrateMasterTasksFromIdb,
  getCachedFutureMatrix, setCachedFutureMatrix, hydrateFutureMatrixFromIdb,
  saveNoteRevision, getNoteRevisions, hydrateNoteRevisionsFromIdb
} from './dailyDataCache.js';
import { callBridge, requireSaved, restoreIfUnchanged, staleNoticeText, createSaveQueue } from './saveGuard.js';
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

// Per-field task saves, each serialized through saveQueue under `${prefix}:<task id>` (deletes use
// task-delete:<id>). value(task) is what the queue tracks as confirmed/latest, fields(value) maps
// it back onto a task object, same(a, b) compares two values. Reloads and cache writes consult
// every kind, so a pending title or star is never overwritten or cached as saved, same as status.
// Triage board copy in sessionStorage (stale-while-revalidate; see loadTriageBoard).
const TRIAGE_CACHE_KEY = 'dayPlannerTriageBoard.v1';
const TRIAGE_FRESH_MS = 120000;
const TRIAGE_PREFETCH_MIN_AGE_MS = 300000;
const TRIAGE_RELOAD_DEBOUNCE_MS = 15000;
const GMAIL_COOLDOWN_KEY = 'dayPlannerGmailCooldownUntil';
const GMAIL_COOLDOWN_MS = 75000;
const TRIAGE_CACHE_FIELDS = ['threadId', 'url', 'subject', 'snippet', 'fromName', 'date', 'labels', 'score', 'band', 'signals', 'queue', 'ticketKey',
  'suggestions', 'requireConfirmation', 'humanReviewOnly', 'operationKey', 'ledgerStatus', 'errorMessage'];

const TASK_SAVE_KINDS = [
  { prefix: 'task-status', value: t => t.status, fields: v => ({ status: v }), same: (a, b) => a === b },
  {
    prefix: 'task-title',
    value: t => ({ title: t.title, notes: t.notes || '' }),
    fields: v => ({ title: v.title, notes: v.notes }),
    same: (a, b) => Boolean(a && b) && a.title === b.title && a.notes === b.notes
  },
  { prefix: 'task-star', value: t => Boolean(t.starred), fields: v => ({ starred: v }), same: (a, b) => a === b }
];
const TASK_TITLE_KIND = TASK_SAVE_KINDS[1];
const TASK_STAR_KIND = TASK_SAVE_KINDS[2];

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

      // Gmail / Meeting Hub (Triage + Meeting Prep). Hidden until getHubStatus reports flags ON.
      hubFlags: null,
      authApprovalUrl: null,
      hubDryRun: false,
      // Trial mode controls: the Hub Config Sheet holds DRY_RUN; these only drive the banner, dialog and snackbar.
      hubTrialHiddenOn: '',
      goLive: { open: false, busy: false, opener: null },
      hubModeSnack: null,
      hubModeSnackTimer: null,
      hubSnippetOpenId: '',
      hubLastRun: null,
      hubCounts: {},
      hubNowMs: Date.now(),
      triageBoard: { queues: {} },
      triageStale: false,
      triageSavedAt: 0,
      triageLoadPromise: null,
      triageReloadQueued: false,
      triageReloadTimer: null,
      gmailCooldownUntil: 0,
      triageLoading: false,
      triageNotice: null,
      triageReadLater: [],
      showReadLater: false,
      meetingPicker: { open: false, threadId: null, subject: '', loading: false, recommended: null, choices: [], backlogSeriesKey: '', selected: '', framing: 'Decision needed' },
      waitingForm: { open: false, threadId: null, subject: '', waitingOn: '', nagDate: '' },
      meetingPrep: null,
      meetingPrepLoading: false,
      meetingPrepSeries: 'NCMMS_CORE',
      selectedDate: getLocalDateStr(),
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      appBuildNumber: null,

      // Data collections
      dailyTasks: [],
      editingTaskId: null,
      editingTaskTitle: '',
      openStatusMenuTaskId: null,
      statusMenuCloseTimer: null,
      statusMenuDropUp: false,
      statusMenuPos: { top: null, bottom: null, left: null },
      statusOptions: STATUS_OPTIONS,
      dailyTaskSort: { column: null, direction: 'asc' },
      openNotesPopoverTaskId: null,
      notesPopoverCloseTimer: null,
      notesPopoverDropUp: false,
      notesPopoverPos: { top: null, bottom: null, left: null },
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
      // Per-date note-save debounce timers: date -> timer handle for an edit waiting out the
      // debounce (unsaved, not yet in saveQueue). Per date, so typing on another day within the
      // debounce window never cancels this day pending save.
      noteSaveTimers: {},
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
      // Keyed error tray (replaces the single banner). Entries: { key, message, kind, seq, retry }.
      // Keys name the operation (save-note:<date>, task-status:<id>, sync, load-day:<date>, ...):
      // the same key replaces its entry, and that operation succeeding later resolves it.
      // kind error (a failure) ranks above kind stale (offline-copy notice); newest first.
      errorTray: [],
      errorTraySeq: 0,
      errorTrayExpanded: false,
      // Per-item save serializer (one in-flight write per key, latest value wins).
      saveQueue: createSaveQueue(),
      // Per-date note text last confirmed saved to Google Docs; rollback target for a failed save.
      savedNoteByDate: {},
      createEventError: null,
      // True while createCalendarEvent is in flight (a double submit would create a duplicate).
      createEventSaving: false,
      archiveSearchError: null,
      archiveSearchWarning: null,
      timeMachineError: null,

      // Modals
      eventModalOpen: false,
      selectedEvent: null,

      createEventModalOpen: false,
      newEventData: {
        title: '',
        startTime: '09:00',
        endTime: '10:00',
        location: '',
        description: '',
        addMeet: false
      },

      searchModalOpen: false,
      searchQuery: '',
      searchResults: { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [], archive: [] },
      selectedSearchIndex: -1,
      archiveSearching: false,
      archiveSearchQuery: '',
      searchDebounceTimer: null,

      // Note Time Machine / Version History Modal state
      timeMachineOpen: false,
      timeMachineLoading: false,
      timeMachineRevisions: [],
      selectedRevisionIndex: 0,
      timeMachineToast: null,
      taskToast: null,

      // Themed Day Calendar Picker state
      dayPickerOpen: false,
      viewOptionsOpen: false,
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

      // Task inputs
      newTaskTitle: '',
      newTaskCategory: '',
      newTaskPriorityGroup: 'A',

      // Resizable 3-Column Layout state
      colWidths: [33.33, 33.33, 33.34],
      // Whole-UI zoom, percent (80-150). Persisted per device.
      uiZoom: 100,
      isResizing: false,
      activeResizerIndex: null,
      maximizedColumn: null, // 'tasks' | 'appointments' | 'notes' | null

      bridge: null,

      theme: 'light',

      // Topic & Category LRU state (20 items max, persistent)
      recentTopics: [],
      recentCategories: ['General', 'Work', 'Personal', 'Financial', 'Projects', 'Health', 'Meeting', 'Decision'],
      activeTopicCardId: null,
      topicSelectedIndex: -1,

      // Desktop install modal state
      installModalOpen: false,

      get availableCategories() {
        const cats = Array.isArray(this.recentCategories) && this.recentCategories.length > 0
          ? this.recentCategories
          : ['General', 'Work', 'Personal', 'Financial', 'Projects', 'Health', 'Meeting', 'Decision'];
        return [...cats].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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

      // Newest message in the tray (failures before stale notices), or null when empty. The
      // setter files a string under the generic general key; null resolves that key.
      get errorMessage() {
        const first = this.orderedErrors[0];
        return first ? first.message : null;
      },

      set errorMessage(text) {
        if (text) {
          this.reportError('general', text);
        } else {
          this.resolveError('general');
        }
      },

      get orderedErrors() {
        const rank = (e) => (e.kind === 'stale' ? 1 : 0);
        return [...(this.errorTray || [])].sort((a, b) => (rank(a) - rank(b)) || (b.seq - a.seq));
      },

      get visibleErrors() {
        const all = this.orderedErrors;
        return this.errorTrayExpanded ? all : all.slice(0, 3);
      },

      get hiddenErrorCount() {
        return this.orderedErrors.length - this.visibleErrors.length;
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
        // Mock-only: ?hubDryRun=1 previews the Dry run banner and DRY_RUN ledger outcomes.
        this.bridge = new GASBridge(false, { dryRun: new URLSearchParams(window.location.search).get('hubDryRun') === '1' });
        this.appBuildNumber = typeof window !== 'undefined' ? (window.DAY_PLANNER_BUILD_NUMBER ?? null) : null;
        this.sttSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        this.sttBlocked = !this.sttSupported;
        this.initTheme();
        this.initColumnWidths();
        this.initUiZoom();
        this.initRecentTopics();
        this.initCategories();
        const hubReady = this.initHub();
        await this.loadDayData();
        await this.loadMasterTasks();
        // Triage takes several seconds to build: fetch it in the background once the day view is loaded.
        hubReady.then(() => this.prefetchTriage());
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
              this.recentTopics = parsed.slice(0, 20);
              return;
            }
          }
        } catch (err) {
          console.error('initRecentTopics: could not read saved topics from localStorage, using defaults:', err.stack);
        }
        this.recentTopics = ['Sprint', '1:1', 'Standup', 'Planning', 'Admin', 'Architecture', 'Bug Triage', 'Personal', 'Review', 'General'];
      },

      initCategories() {
        const defaultCategories = ['General', 'Work', 'Personal', 'Financial', 'Projects', 'Health', 'Meeting', 'Decision'];
        try {
          const saved = localStorage.getItem('dayPlannerCategories');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.recentCategories = parsed.filter(c => typeof c === 'string' && c.trim()).slice(0, 20);
              return;
            }
          }
        } catch (err) {
          console.error('initCategories: could not read saved categories from localStorage, using defaults:', err.stack);
        }
        this.recentCategories = defaultCategories;
      },

      initUiZoom() {
        try {
          const saved = parseInt(localStorage.getItem('dayPlannerUiZoom'), 10);
          if (saved >= 80 && saved <= 150) this.uiZoom = saved;
        } catch (e) {
          console.error('Could not load saved UI zoom:', e.stack);
        }
      },

      // A- / A+ buttons: step through the standard browser zoom stops.
      stepUiZoom(dir) {
        const stops = [80, 90, 100, 110, 125, 150];
        const cur = this.uiZoom;
        const next = dir > 0 ? stops.find(v => v > cur) : [...stops].reverse().find(v => v < cur);
        if (next !== undefined) this.setUiZoom(next);
      },

      setUiZoom(value) {
        const n = Math.round(Number(value));
        this.uiZoom = Math.min(150, Math.max(80, isNaN(n) ? 100 : n));
        try {
          localStorage.setItem('dayPlannerUiZoom', String(this.uiZoom));
        } catch (e) {
          console.error('Could not save UI zoom:', e.stack);
        }
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
          console.error('Could not load saved column widths:', e.stack);
        }
      },

      resetColumnWidths() {
        this.colWidths = [33.33, 33.33, 33.34];
        try {
          localStorage.removeItem('dayPlannerColumnWidths');
        } catch (err) {
          console.error('resetColumnWidths: could not clear saved column widths from localStorage:', err.stack);
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
          } catch (err) {
            console.error('column resize: could not persist column widths to localStorage (quota/disabled):', err.stack);
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
        } catch (err) {
          console.error('initTheme: could not read saved theme from localStorage, using light:', err.stack);
          this.theme = 'light';
        }
        this.applyTheme();
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('dayPlannerTheme', this.theme);
        } catch (err) {
          console.error('toggleTheme: could not persist theme to localStorage (quota/disabled):', err.stack);
        }
        this.applyTheme();
      },

      applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        document.documentElement.style.colorScheme = this.theme;
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
          } else if (keyLower === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && !isInputFocused && !this.isMonthlyView && this.activeView !== 'master-tasks') {
            e.preventDefault();
            this.jumpToToday();
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
            } else if (this.timeMachineOpen) {
              e.preventDefault();
              this.closeTimeMachine();
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

      // Files (or replaces) the tray entry for key. message is user-facing (err.message only,
      // never a stack). opts.retry: a function re-running the failed operation; opts.kind:
      // error (default) or stale (informational offline-copy notice).
      reportError(key, message, opts = {}) {
        if (!key) throw new Error('reportError: a key is required');
        this.errorTraySeq += 1;
        const rest = (this.errorTray || []).filter(e => e.key !== key);
        this.errorTray = [{ key, message: String(message), kind: opts.kind || 'error', seq: this.errorTraySeq, retry: opts.retry || null }, ...rest];
      },

      resolveError(key) {
        if (!(this.errorTray || []).some(e => e.key === key)) return;
        this.errorTray = this.errorTray.filter(e => e.key !== key);
      },

      resolveErrorsWithPrefix(prefix) {
        if (!(this.errorTray || []).some(e => e.key.startsWith(prefix))) return;
        this.errorTray = this.errorTray.filter(e => !e.key.startsWith(prefix));
      },

      dismissError(key) {
        this.resolveError(key);
        if (this.errorTray.length <= 3) this.errorTrayExpanded = false;
      },

      // Runs the retry stored on the entry. The entry stays until the operation itself succeeds (resolves
      // it) or fails again (replaces it), so a failing retry is never shown as fixed.
      async retryError(key) {
        const entry = (this.errorTray || []).find(e => e.key === key);
        if (!entry || typeof entry.retry !== 'function') return;
        try {
          await entry.retry();
        } catch (err) {
          console.error(`🔥 retry of "${key}" threw; entry kept with the new error:`, err.stack);
          this.reportError(key, `Retry failed: ${err.message || err.toString()}`, { retry: entry.retry });
        }
      },

      // Stale/offline indicator: a load that fell back to cached data files a stale tray entry
      // under the key of the load, with the time the cached copy last matched the server. The next
      // successful load with the same key resolves it.
      showStaleNotice(key, label, cachedEntry, err) {
        this.reportError(key, staleNoticeText(label, cachedEntry && cachedEntry.syncedAt, err), { kind: 'stale' });
      },

      async trigger2WaySync() {
        this.isSyncing = true;
        // A sync success resolves only sync* tray entries: callers run this right after a write,
        // and wiping other entries would hide a failure reported just before (fail-silent).

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
          this.resolveErrorsWithPrefix('sync');
        } catch (err) {
          console.error('🔥 trigger2WaySync error:', err.stack);
          this.reportError('sync', `2-Way Sync Warning: ${err.message || err.toString()}`, { retry: () => this.trigger2WaySync() });
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
        if (viewName === 'triage' && this.showTriageNav) {
          // Board from the background prefetch is fresh for 2 minutes; Refresh always reloads.
          if (this.triageStale || Date.now() - this.triageSavedAt > TRIAGE_FRESH_MS) await this.loadTriageBoard();
        }
        if (viewName === 'meetingPrep' && this.showMeetingPrepNav) {
          await this.loadMeetingPrep();
        }
      },

      // ---- Gmail / Meeting Hub ----
      get showTriageNav() {
        return isHubViewVisible('triage', this.hubFlags);
      },

      get showMeetingPrepNav() {
        return isHubViewVisible('meetingPrep', this.hubFlags);
      },

      get triageQueueList() {
        const queues = (this.triageBoard && this.triageBoard.queues) || {};
        return QUEUE_ORDER.map((key) => ({
          key,
          title: QUEUE_TITLES[key],
          items: (queues[key] || []).filter((t) => this.showReadLater || !this.triageReadLater.includes(t.threadId))
        }));
      },

      get gmailCoolingDown() {
        return this.gmailCooldownUntil > this.hubNowMs;
      },

      get triageStatusText() {
        if (this.gmailCoolingDown && !this.triageLoading) return 'Gmail is limiting requests. Try again in a minute.';
        const age = this.triageSavedAt ? 'Saved ' + this.hubAgeText(this.triageSavedAt) : '';
        if (this.triageLoading) return this.triageStale && age ? age + ' · Refreshing…' : (this.triageItemCount ? 'Refreshing…' : 'Loading…');
        return this.triageStale && age ? age + ' · not updated' : '';
      },

      hubAgeText(ms) {
        const min = Math.max(0, Math.floor((this.hubNowMs - ms) / 60000));
        if (min < 1) return 'just now';
        return min < 60 ? min + ' min ago' : Math.floor(min / 60) + ' h ago';
      },

      get triageItemCount() {
        return this.triageQueueList.reduce((n, q) => n + q.items.length, 0);
      },

      hubBand(score) { return scoreBandLabel(score); },
      hubLedgerLabel(status) { return ledgerStatusLabel(status); },
      hubCanRetry(status) { return canRetryLedger(status); },
      hubCountdown(iso) { return formatCutoffCountdown(iso, this.hubNowMs); },

      get hubTrialBannerVisible() {
        const onHubView = (this.activeView === 'triage' && this.showTriageNav) || (this.activeView === 'meetingPrep' && this.showMeetingPrepNav);
        return this.hubDryRun && onHubView && this.hubTrialHiddenOn !== getLocalDateStr();
      },

      get hubTrialRun() {
        const r = this.hubLastRun;
        if (!r || r.status !== 'DRY_RUN' || !r.counts) return null;
        return { at: String(r.at || '').replace('T', ' ').slice(0, 16), processed: r.counts.processed || 0, skipped: r.counts.skipped || 0 };
      },

      // Sent with every Triage write: the server refuses (MODE_CHANGED) when the Sheet mode differs from the screen.
      hubModeOpts() { return { expectDryRun: this.hubDryRun }; },

      toggleSnippet(threadId) {
        this.hubSnippetOpenId = this.hubSnippetOpenId === threadId ? '' : threadId;
      },

      hideTrialBannerToday() {
        this.hubTrialHiddenOn = getLocalDateStr();
        try {
          localStorage.setItem('dayPlannerTrialBannerHiddenOn', this.hubTrialHiddenOn);
        } catch (err) {
          console.error('hideTrialBannerToday: could not save to localStorage, the banner returns on reload:', err.stack);
        }
      },

      openGoLive(ev) {
        this.goLive = { open: true, busy: false, opener: (ev && ev.currentTarget) || null };
        this.$nextTick(() => { if (this.$refs.goLiveCancel) this.$refs.goLiveCancel.focus(); });
      },

      closeGoLive() {
        if (this.goLive.busy) return;
        const opener = this.goLive.opener;
        this.goLive = { open: false, busy: false, opener: null };
        if (opener && opener.isConnected) opener.focus();
      },

      async setTrialMode(on) {
        const r = await this.bridge.hubSetFeature('DRY_RUN', on);
        if (!r || r.ok !== true) throw new Error((r && r.message) || 'The Hub Config Sheet could not be updated');
        await this.loadHubStatus();
        if (this.hubDryRun !== on) throw new Error('The Hub Config Sheet still shows the old mode. Refresh and try again.');
        if (this.activeView === 'triage' && this.showTriageNav) await this.loadTriageBoard();
      },

      showHubModeSnack(text, undo) {
        clearTimeout(this.hubModeSnackTimer);
        this.hubModeSnack = { text, undo: !!undo };
        this.hubModeSnackTimer = setTimeout(() => { this.hubModeSnack = null; }, 10000);
      },

      async confirmGoLive() {
        this.goLive.busy = true;
        try {
          await this.setTrialMode(false);
          this.resolveError('hub-mode');
          this.showHubModeSnack('Trial mode is off.', true);
          // The banner (the opener) is now hidden, so focus goes to Undo instead.
          this.goLive.opener = null;
          this.$nextTick(() => { if (this.$refs.hubModeUndo) this.$refs.hubModeUndo.focus(); });
        } catch (err) {
          console.error('Go live failed, trial mode stays on:', err.stack);
          this.reportError('hub-mode', 'Could not turn off trial mode: ' + (err.message || err));
        } finally {
          this.goLive.busy = false;
          this.closeGoLive();
        }
      },

      async switchToTrial() {
        clearTimeout(this.hubModeSnackTimer);
        this.hubModeSnack = null;
        try {
          await this.setTrialMode(true);
          this.resolveError('hub-mode');
          this.showHubModeSnack('Trial mode is on. Nothing changes in Gmail, Tasks or Docs.', false);
        } catch (err) {
          console.error('Switch to trial failed, the hub stays live:', err.stack);
          this.reportError('hub-mode', 'Could not turn on trial mode: ' + (err.message || err));
        }
      },

      async refreshTriage() {
        await this.loadHubStatus();
        await this.loadTriageBoard({ after: true });
      },

      async refreshMeetingPrep() {
        await this.loadHubStatus();
        await this.loadMeetingPrep();
      },

      async loadHubStatus() {
        try {
          const st = await this.bridge.getHubStatus();
          // New Google permissions not yet approved: show the Approve access banner, keep hub views hidden.
          this.authApprovalUrl = (st && st.status === 'AUTH_REQUIRED' && st.authUrl) || null;
          if (this.authApprovalUrl) { this.hubFlags = null; this.clearTriageCache(); return; }
          if (!st || st.ok !== true) throw new Error((st && st.message) || 'Hub status unavailable');
          this.hubFlags = (st && st.flags) || null;
          this.hubDryRun = !!(st && st.dryRun);
          this.hubLastRun = (st && st.lastRun) || null;
          this.hubCounts = (st && st.counts) || {};
          if (this.showTriageNav) this.hydrateTriageCache();
          else this.clearTriageCache();
        } catch (err) {
          this.hubFlags = null;
          this.clearTriageCache();
          console.error('Hub status unavailable, Triage and Meeting Prep stay hidden:', err.stack);
        }
      },

      initHub() {
        try {
          const saved = JSON.parse(localStorage.getItem('dayPlannerHubReadLater') || '[]');
          if (Array.isArray(saved)) this.triageReadLater = saved.filter((x) => typeof x === 'string');
        } catch (err) {
          console.error('initHub: could not read Read Later list from localStorage, starting empty:', err.stack);
          this.triageReadLater = [];
        }
        try {
          this.hubTrialHiddenOn = localStorage.getItem('dayPlannerTrialBannerHiddenOn') || '';
        } catch (err) {
          console.error('initHub: could not read the trial banner hide date from localStorage, showing the banner:', err.stack);
          this.hubTrialHiddenOn = '';
        }
        setInterval(() => { this.hubNowMs = Date.now(); }, 60000);
        return this.loadHubStatus();
      },

      loadTriageBoard(opts) {
        // One request at a time: the background prefetch and opening Triage share it. A caller that needs
        // data from after now (a finished action) queues one more load behind the request in flight.
        if (this.triageLoadPromise) {
          if (opts && opts.after) this.triageReloadQueued = true;
          return this.triageLoadPromise;
        }
        if (this.readGmailCooldown() > Date.now()) return Promise.resolve();
        this.triageLoading = true;
        this.triageLoadPromise = (async () => {
          try {
            const board = await this.bridge.getTriageBoard({});
            if (board && board.errorCode === 'RATE_LIMITED') {
              this.startGmailCooldown();
              console.error('Triage board: Gmail quota hit, saved rows stay and loads pause for', GMAIL_COOLDOWN_MS, 'ms', board.message);
              this.reportError('load-triage', board.message || 'Gmail is limiting requests. Try again in a minute.', { retry: () => this.loadTriageBoard() });
              return;
            }
            if (!board || board.ok !== true) throw new Error((board && board.message) || 'Triage board unavailable');
            this.triageBoard = board;
            this.triageStale = false;
            this.triageSavedAt = Date.now();
            this.saveTriageCache(board);
            this.resolveError('load-triage');
          } catch (err) {
            console.error('Triage board failed to load, any saved board stays on screen marked stale:', err.stack);
            this.reportError('load-triage', 'Triage board failed to load: ' + (err.message || err), { retry: () => this.loadTriageBoard() });
          } finally {
            this.triageLoading = false;
            this.triageLoadPromise = null;
            if (this.triageReloadQueued) {
              this.triageReloadQueued = false;
              this.loadTriageBoard();
            }
          }
        })();
        return this.triageLoadPromise;
      },

      // Startup prefetch: only when the saved board is old enough to be worth a Gmail read.
      prefetchTriage() {
        if (!this.showTriageNav) return null;
        if (this.triageSavedAt && Date.now() - this.triageSavedAt < TRIAGE_PREFETCH_MIN_AGE_MS) return null;
        return this.loadTriageBoard();
      },

      // After row actions: one board reload once the clicking stops, not a full Gmail rebuild per click.
      scheduleTriageReload() {
        if (this.triageReloadTimer) clearTimeout(this.triageReloadTimer);
        this.triageReloadTimer = setTimeout(() => {
          this.triageReloadTimer = null;
          this.loadTriageBoard({ after: true });
        }, TRIAGE_RELOAD_DEBOUNCE_MS);
      },

      // Cooldown after Gmail RATE_LIMITED, shared by every tab (a timestamp only, no email content).
      readGmailCooldown() {
        try {
          const until = Number(localStorage.getItem(GMAIL_COOLDOWN_KEY)) || 0;
          this.gmailCooldownUntil = until;
          return until;
        } catch (err) {
          console.error('readGmailCooldown: could not read the Gmail cooldown, loading anyway:', err.stack);
          return 0;
        }
      },

      startGmailCooldown() {
        const until = Date.now() + GMAIL_COOLDOWN_MS;
        this.gmailCooldownUntil = until;
        this.hubNowMs = Date.now();
        try {
          localStorage.setItem(GMAIL_COOLDOWN_KEY, String(until));
        } catch (err) {
          console.error('startGmailCooldown: could not share the cooldown with other tabs:', err.stack);
        }
        setTimeout(() => { this.hubNowMs = Date.now(); }, GMAIL_COOLDOWN_MS + 100);
      },

      applyTriageResult(threadId, r) {
        if (!threadId || !r || r.ok !== true || !r.status || !this.triageBoard || !this.triageBoard.queues) return;
        const queues = this.triageBoard.queues;
        Object.keys(queues).forEach((q) => {
          queues[q].forEach((i) => { if (i.threadId === threadId) i.ledgerStatus = r.status; });
        });
      },

      // Archive, Delete and Dismiss take the row off the screen at click (as Gmail does); a failure puts it back.
      takeTriageRow(threadId) {
        const queues = (this.triageBoard && this.triageBoard.queues) || {};
        for (const q of Object.keys(queues)) {
          const index = queues[q].findIndex((i) => i.threadId === threadId);
          if (index !== -1) return { q, index, item: queues[q].splice(index, 1)[0] };
        }
        return null;
      },

      restoreTriageRow(taken) {
        if (!taken || !this.triageBoard || !this.triageBoard.queues) return;
        const list = this.triageBoard.queues[taken.q] || (this.triageBoard.queues[taken.q] = []);
        if (list.some((i) => i.threadId === taken.item.threadId)) return;
        list.splice(Math.min(taken.index, list.length), 0, taken.item);
      },

      // Last board, this browser tab only (sessionStorage is cleared when the tab closes). Only the
      // fields the rows display are kept, so a new server field never lands in storage by accident.
      saveTriageCache(board) {
        try {
          const queues = {};
          Object.keys(board.queues || {}).forEach((q) => {
            queues[q] = (board.queues[q] || []).map((item) => {
              const kept = {};
              TRIAGE_CACHE_FIELDS.forEach((f) => { if (f in item) kept[f] = item[f]; });
              return kept;
            });
          });
          sessionStorage.setItem(TRIAGE_CACHE_KEY, JSON.stringify({ savedAt: this.triageSavedAt, queues }));
        } catch (err) {
          console.error('saveTriageCache: could not save the Triage board, the next page load waits for the server:', err.stack);
        }
      },

      hydrateTriageCache() {
        if (this.triageSavedAt) return;
        try {
          const raw = sessionStorage.getItem(TRIAGE_CACHE_KEY);
          if (!raw) return;
          const saved = JSON.parse(raw);
          if (!saved || typeof saved.savedAt !== 'number' || !saved.queues || typeof saved.queues !== 'object' || Array.isArray(saved.queues)) {
            console.error('hydrateTriageCache: saved Triage board has the wrong shape, ignoring it');
            return;
          }
          this.triageBoard = { ok: true, queues: saved.queues };
          this.triageSavedAt = saved.savedAt;
          this.triageStale = true;
        } catch (err) {
          console.error('hydrateTriageCache: could not read the saved Triage board, waiting for the server:', err.stack);
        }
      },

      clearTriageCache() {
        try {
          sessionStorage.removeItem(TRIAGE_CACHE_KEY);
        } catch (err) {
          console.error('clearTriageCache: could not remove the saved Triage board:', err.stack);
        }
        this.triageBoard = { queues: {} };
        this.triageStale = false;
        this.triageSavedAt = 0;
      },

      async runTriageAction(label, call, threadId, remove) {
        const taken = remove ? this.takeTriageRow(threadId) : null;
        try {
          const r = await call();
          this.triageNotice = { kind: r.ok ? 'ok' : 'error', text: label + ': ' + r.message, url: r.targetUrl || null };
          if (!r.ok) {
            console.error('Triage action failed, row restored:', label, r);
            this.restoreTriageRow(taken);
          }
          if (r.errorCode === 'MODE_CHANGED') await this.loadHubStatus();
          if (!remove) this.applyTriageResult(threadId, r);
          this.scheduleTriageReload();
          return r;
        } catch (err) {
          console.error('Triage action threw, row restored:', label, err.stack);
          this.restoreTriageRow(taken);
          this.triageNotice = { kind: 'error', text: label + ' failed: ' + (err.message || err), url: null };
          return null;
        }
      },

      triageTask(item, today) {
        const priority = today ? (item.score >= 8 ? 'A1' : 'B1') : (item.score >= 4 ? 'B1' : 'C1');
        return this.runTriageAction(today ? 'Task Today' : 'Task Later', () => this.bridge.routeThreadToTask(item.threadId, { today, priority, ...this.hubModeOpts() }), item.threadId);
      },

      dismissTriageEntry(item) {
        return this.runTriageAction('Dismiss', () => this.bridge.dismissTriageItem(item.threadId, this.hubModeOpts()), item.threadId, true);
      },

      archiveTriageEntry(item) {
        return this.runTriageAction('Archive', () => this.bridge.archiveTriageThread(item.threadId, this.hubModeOpts()), item.threadId, true);
      },

      trashTriageEntry(item) {
        return this.runTriageAction('Delete', () => this.bridge.trashTriageThread(item.threadId, this.hubModeOpts()), item.threadId, true);
      },

      retryTriageItem(item) {
        if (!item.operationKey) {
          console.error('Retry impossible, item has no operationKey:', item);
          this.triageNotice = { kind: 'error', text: 'Retry failed: the server did not supply an operation key for this item.', url: null };
          return null;
        }
        return this.runTriageAction('Retry', () => this.bridge.retryFailedOperation(item.operationKey, this.hubModeOpts()), item.threadId);
      },

      readLaterItem(item) {
        if (!this.triageReadLater.includes(item.threadId)) this.triageReadLater.push(item.threadId);
        this.persistReadLater();
        this.triageNotice = { kind: 'ok', text: 'Read Later: saved in this browser only, Gmail and the ledger are untouched.', url: null };
      },

      persistReadLater() {
        try {
          localStorage.setItem('dayPlannerHubReadLater', JSON.stringify(this.triageReadLater));
        } catch (err) {
          console.error('Read Later could not be persisted:', err.stack);
        }
      },

      openWaitingForm(item) {
        const [y, m, d] = getLocalDateStr().split('-').map(Number);
        const nag = new Date(y, m - 1, d + 3);
        const nagStr = nag.getFullYear() + '-' + String(nag.getMonth() + 1).padStart(2, '0') + '-' + String(nag.getDate()).padStart(2, '0');
        this.waitingForm = { open: true, threadId: item.threadId, subject: item.subject, waitingOn: item.fromName || '', nagDate: nagStr };
      },

      closeWaitingForm() {
        this.waitingForm.open = false;
      },

      async confirmWaiting() {
        const f = this.waitingForm;
        this.closeWaitingForm();
        await this.runTriageAction('Waiting', () => this.bridge.routeThreadToWaiting(f.threadId, { waitingOn: f.waitingOn, nagDate: f.nagDate || null, ...this.hubModeOpts() }), f.threadId);
      },

      async openMeetingPicker(item) {
        this.meetingPicker = { open: true, threadId: item.threadId, subject: item.subject, loading: true, seriesKey: '', recommended: null, choices: [], backlogSeriesKey: '', selected: '', framing: 'Decision needed' };
        try {
          const c = await this.bridge.getUpcomingMeetingChoices(item.threadId);
          if (!c || c.ok !== true) throw new Error((c && c.message) || 'Meeting choices unavailable');
          const dest = (c.choices || []).find((x) => !x.unavailable);
          if (!dest) throw new Error('No enabled meeting series is suggested for this thread');
          this.meetingPicker.seriesKey = dest.seriesKey;
          this.meetingPicker.recommended = dest.recommended || null;
          this.meetingPicker.choices = dest.upcoming || [];
          this.meetingPicker.backlogSeriesKey = dest.seriesKey;
          this.meetingPicker.selected = (dest.recommended && dest.recommended.occurrenceId) || '';
        } catch (err) {
          console.error('Meeting choices failed to load:', err.stack);
          this.meetingPicker.open = false;
          this.triageNotice = { kind: 'error', text: 'Send to Meeting failed: ' + (err.message || err), url: null };
        } finally {
          this.meetingPicker.loading = false;
        }
      },

      closeMeetingPicker() {
        this.meetingPicker.open = false;
      },

      async confirmMeetingRoute() {
        const p = this.meetingPicker;
        this.closeMeetingPicker();
        const backlog = p.selected === '__backlog__';
        const occurrenceId = backlog ? p.backlogSeriesKey : p.selected;
        await this.runTriageAction('Send to Meeting', () => this.bridge.routeThreadToMeeting(p.threadId, occurrenceId, { framing: p.framing, backlog, seriesKey: p.seriesKey, ...this.hubModeOpts() }), p.threadId);
      },

      async loadMeetingPrep() {
        this.meetingPrepLoading = true;
        this.hubNowMs = Date.now();
        try {
          const prep = await this.bridge.getMeetingPrep(this.meetingPrepSeries, null);
          if (!prep || prep.ok !== true) throw new Error((prep && prep.message) || 'Meeting prep unavailable');
          this.meetingPrep = prep;
          this.resolveError('load-meeting-prep');
        } catch (err) {
          console.error('Meeting prep failed to load:', err.stack);
          this.reportError('load-meeting-prep', 'Meeting prep failed to load: ' + (err.message || err), { retry: () => this.loadMeetingPrep() });
        } finally {
          this.meetingPrepLoading = false;
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
          setCachedFutureMatrix(year, matrix, { synced: true });
          this.applyFutureMatrix(matrix);
          this.resolveError(`load-future:${year}`);
        } catch (err) {
          console.error('loadFutureMatrix: refresh failed; showing cached matrix (if any) with a stale notice:', err.stack);
          if (year !== this.futureMatrixYear) return;
          if (cached) {
            this.showStaleNotice(`load-future:${year}`, `Future Planning ${year}`, cached, err);
          } else {
            this.reportError(`load-future:${year}`, `Could not load Future Planning Matrix: ${err.message || err.toString()}`, { retry: () => this.loadFutureMatrix() });
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
          this.resolveError(`future-add:${monthKey}`);
        } catch (err) {
          console.error('addFutureItemToMonth error:', err.stack);
          this.reportError(`future-add:${monthKey}`, `Error adding item: ${err.message || err.toString()}`);
        }
      },

      async toggleFutureItemStatus(mm, item) {
        await this.saveFutureItemStatus(mm, item, getNextStatus(item.status));
      },

      async selectFutureItemStatus(mm, item, newStatus) {
        clearTimeout(this.statusMenuCloseTimer);
        this.openStatusMenuTaskId = null;
        if (!isValidStatus(newStatus)) {
          console.error(`🔥 selectFutureItemStatus: ignoring invalid status "${newStatus}"`);
          return;
        }
        await this.saveFutureItemStatus(mm, item, newStatus);
      },

      // Optimistic status change that rolls back (UI only; the cache is written on success only)
      // if the Tasks write fails, is unavailable, or reports the item missing (null).
      async saveFutureItemStatus(mm, item, newStatus) {
        const year = this.futureMatrixYear;
        const monthKey = this.futureMonthKey(mm);
        const previous = item.status;
        item.status = newStatus;
        try {
          requireSaved(await callBridge(this.bridge, [['updateFutureItemStatus', [year, monthKey, item.id, newStatus]]], 'Future Planning item status'), 'Future Planning item status');
        } catch (err) {
          console.error('saveFutureItemStatus: save failed; status rolled back to last saved value:', err.stack);
          restoreIfUnchanged(item, 'status', newStatus, previous);
          this.reportError(`future-status:${item.id}`, `Could not save item status: ${err.message || err.toString()}`);
          return;
        }
        this.resolveError(`future-status:${item.id}`);
        if (year === this.futureMatrixYear) this.syncFutureMatrixCacheFromLiveState();
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
          console.error('transferFutureItemToDay error:', err.stack);
          this.reportError(`future-transfer:${item.id}`, `Error transferring item: ${err.message || err.toString()}`);
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
          console.error('pushFutureItemForward error:', err.stack);
          this.reportError(`future-push:${item.id}`, `Error pushing item forward: ${err.message || err.toString()}`);
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
          console.error('deleteFutureItemFromMonth error:', err.stack);
          this.reportError(`future-delete:${item.id}`, `Error deleting item: ${err.message || err.toString()}`);
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

      isOffToday() {
        return this.selectedDate !== getLocalDateStr();
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

      // mark: saveQueue.mark() taken before the server read that produced data, or null when
      // data is the local cache. Tasks with an unsaved status keep their on-screen value.
      applyDailyData(data, mark = null) {
        this.dailyTasks = this.reconcileReloadedTasks(data.tasks || [], this.dailyTasks, mark).live;
        this.calendarEvents = data.calendarEvents || [];
        this.dailyNote = data.noteContent || '';
        this.dailyDocUrl = data.docUrl || '';
        this.noteCards = this.parseDailyNoteToCards(this.dailyNote);
        this.buildScheduleGrid();
        this.buildIndexRecords();
        if (this.dailyNote && this.dailyNote.trim()) {
          saveNoteRevision(data.date || this.selectedDate, this.dailyNote);
        }
      },

      // Merges a reloaded task list (a server read since mark, or the cache when mark is null)
      // with the per-task save queue instead of replacing the screen wholesale. For each save
      // kind (status, title, star) whose save is queued, in flight, or submitted/confirmed after
      // the read began, the task keeps its on-screen object and those fields (other fields take
      // the reloaded copy), so the in-flight save still rolls back the object on screen. A task
      // with a delete pending (or confirmed after the read began) is left out entirely, so a
      // reload never resurrects it. Returns { live, confirmed }: live for the screen, confirmed
      // (values known saved) for the cache. Tasks missing from the reloaded list are dropped
      // (the server owns membership).
      reconcileReloadedTasks(incoming, liveList, mark) {
        const liveById = new Map((liveList || []).map(t => [t.id, t]));
        const live = [];
        const confirmed = [];
        (incoming || []).forEach(s => {
          if (this.taskDeleteHidesRead(s.id, mark)) return;
          let saved = s;
          const kept = [];
          TASK_SAVE_KINDS.forEach(kind => {
            const r = this.saveQueue.reconcile(`${kind.prefix}:${s.id}`, kind.value(s), mark);
            if (r.confirmed !== undefined && !kind.same(r.confirmed, kind.value(s))) saved = { ...saved, ...kind.fields(r.confirmed) };
            if (r.keepLocal) kept.push(kind);
          });
          confirmed.push(saved);
          if (kept.length === 0) {
            live.push(s);
            return;
          }
          const keptFields = new Set();
          kept.forEach(kind => Object.keys(kind.fields(kind.value(s))).forEach(f => keptFields.add(f)));
          const local = liveById.get(s.id);
          if (local) {
            Object.keys(s).forEach(f => { if (!keptFields.has(f)) local[f] = s[f]; });
            live.push(local);
            return;
          }
          // No object on screen (e.g. navigated away and back): show the confirmed copy with the
          // latest value of every save still queued or in flight.
          const shown = { ...saved };
          kept.forEach(kind => {
            const key = `${kind.prefix}:${s.id}`;
            if (this.saveQueue.unsaved(key)) Object.assign(shown, kind.fields(this.saveQueue.latest(key)));
          });
          live.push(shown);
        });
        return { live, confirmed };
      },

      // True while a delete of this task is queued or in flight, or when it was confirmed after
      // the read behind mark began (that read may predate it): the reloaded copy must not bring
      // the task back. mark null (a cache copy): hidden once any delete of it was confirmed.
      taskDeleteHidesRead(taskId, mark) {
        const key = `task-delete:${taskId}`;
        if (this.saveQueue.unsaved(key)) return true;
        return this.saveQueue.reconcile(key, false, mark).confirmed === true;
      },

      // The cache copy of a live task: a field whose save is still queued or in flight holds its
      // last confirmed value, so writing one task through to the cache never records another
      // task (or another field) as saved before Google confirmed it.
      confirmedTaskCopy(t) {
        let out = t;
        TASK_SAVE_KINDS.forEach(kind => {
          const key = `${kind.prefix}:${t.id}`;
          if (!this.saveQueue.unsaved(key)) return;
          const confirmed = this.saveQueue.confirmed(key);
          if (confirmed !== undefined) out = { ...out, ...kind.fields(confirmed) };
        });
        return out;
      },

      confirmedTaskList(list) {
        return (list || []).map(t => this.confirmedTaskCopy(t));
      },

      noteSaveDebouncing(dateStr) {
        return Object.prototype.hasOwnProperty.call(this.noteSaveTimers, dateStr);
      },

      // Note counterpart of reconcileReloadedTasks for a server read of dateStr since mark. While
      // a save of that note is debouncing, queued, in flight, or submitted/confirmed after the
      // read began, the local text (the cache write-through) stays. Returns { text, saved,
      // unsaved }: text for the screen and cache, saved for savedNoteByDate (the rollback
      // target), unsaved true when text differs from saved (the cache must not be stamped synced).
      reconcileReloadedNote(dateStr, serverNote, mark) {
        const key = `save-note:${dateStr}`;
        const r = this.saveQueue.reconcile(key, serverNote || '', mark);
        const saved = typeof r.confirmed === 'string' ? r.confirmed : (serverNote || '');
        if (!r.keepLocal && !this.noteSaveDebouncing(dateStr)) return { text: serverNote, saved, unsaved: false };
        const cachedEntry = getCached(dateStr);
        const latest = this.saveQueue.latest(key);
        let text = serverNote;
        if (cachedEntry && typeof cachedEntry.noteContent === 'string') text = cachedEntry.noteContent;
        else if (typeof latest === 'string') text = latest;
        return { text, saved, unsaved: (text || '') !== saved };
      },

      // Offline-copy (stale) notices are about the day on screen: leaving a day resolves its
      // notice (the next visit re-checks and re-files it if still offline). Failures stay.
      resolveStaleDayNotices(keepDate) {
        const keep = `load-day:${keepDate}`;
        const drop = e => e.kind === 'stale' && e.key.startsWith('load-day:') && e.key !== keep;
        if (!(this.errorTray || []).some(drop)) return;
        this.errorTray = this.errorTray.filter(e => !drop(e));
      },

      bumpDailyEditSeq(dateStr) {
        this.dailyEditSeq[dateStr] = (this.dailyEditSeq[dateStr] || 0) + 1;
      },

      // Snapshots the currently-open day's live task/event state into the cache. Called after any
      // in-place mutation of this.dailyTasks/this.calendarEvents so a subsequent revisit of this
      // date (or a background prefetch elsewhere) doesn't read back stale pre-edit data. Tasks
      // are written with confirmed values only (confirmedTaskList).
      syncDailyCacheFromLiveState(dateStr = this.selectedDate) {
        if (dateStr !== this.selectedDate) return;
        this.bumpDailyEditSeq(dateStr);
        const existing = getCached(dateStr) || { noteContent: this.dailyNote, docUrl: this.dailyDocUrl };
        setCached(dateStr, {
          ...existing,
          tasks: this.confirmedTaskList(this.dailyTasks),
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
        this.resolveStaleDayNotices(dateStr);
        let cached = getCached(dateStr);
        if (!cached) {
          cached = await hydrateFromIdb(dateStr);
        }
        if (cached) {
          this.applyDailyData(cached);
        }
        this.dailyLoading = !cached;
        const seqAtFetchStart = this.dailyEditSeq[dateStr] || 0;
        const mark = this.saveQueue.mark();
        try {
          const data = await this.bridge.getDailyData(dateStr);
          const editedWhileFetching = (this.dailyEditSeq[dateStr] || 0) !== seqAtFetchStart;
          if (editedWhileFetching) {
            // A local edit already wrote a newer version into the cache; this response is now
            // stale relative to it -- drop it instead of caching/applying over the newer edit.
            // The next navigation away and back will revalidate again.
            return;
          }
          // Saves still pending (or confirmed after this read began) are merged, not replaced:
          // the cache gets only confirmed task values, the note keeps its unsaved text.
          const onScreen = dateStr === this.selectedDate;
          const tasks = this.reconcileReloadedTasks(data.tasks || [], onScreen ? this.dailyTasks : [], mark);
          const note = this.reconcileReloadedNote(dateStr, data.noteContent, mark);
          // An unsaved note kept in the entry means it does not match Google: no synced stamp.
          setCached(dateStr, { ...data, tasks: tasks.confirmed, noteContent: note.text }, { synced: !note.unsaved });
          // Last note text known to be saved in Google Docs for this date: the rollback target if
          // a later note save fails (see scheduleDailyNoteSave).
          this.savedNoteByDate[dateStr] = note.saved;
          this.resolveError(`load-day:${dateStr}`);
          if (dateStr !== this.selectedDate) return; // user navigated away; cached for next visit
          const problems = [data.error, ...(data.warnings || [])].filter(Boolean);
          if (problems.length > 0) this.reportError(`load-day:${dateStr}`, problems.join(' | '));
          this.applyDailyData({ ...data, noteContent: note.text }, mark);
        } catch (err) {
          console.error('🔥 loadDayData: refresh failed; showing cached day (if any) with a stale notice:', err.stack);
          if (dateStr === this.selectedDate) {
            if (cached) {
              this.showStaleNotice(`load-day:${dateStr}`, `Daily page ${dateStr}`, cached, err);
            } else {
              this.reportError(`load-day:${dateStr}`, `Error loading daily workspace: ${err.message || err.toString()}`);
            }
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
        const first = windowDates[0];
        const last = windowDates[windowDates.length - 1];
        try {
          const result = await this.bridge.getDailyDataRange(first, last);
          this.primeRangeResult(result, 'prefetch-range',
            `Background load of ${first} to ${last} was incomplete, so those days were not cached and each loads on its own when opened`,
            () => this.runDailyRangePrefetch(centerDateStr));
        } catch (err) {
          console.error('🔥 background range prefetch failed; days will load individually on navigation:', err.stack);
        }
      },

      // Primes the cache from a getDailyDataRange result only when the server read was clean.
      // Its warnings are range-wide (a failed Calendar/Tasks/Docs read can leave any day in the
      // range empty), so a result with warnings caches nothing -- an empty calendar must never
      // be stored as a synced day -- and files a tray entry under key (message: what happened,
      // followed by the warnings). A clean result resolves that entry. Throws on a malformed
      // result. Returns true when the days were primed.
      primeRangeResult(result, key, message, retry) {
        if (!result || typeof result.days !== 'object' || result.days === null) {
          throw new Error('getDailyDataRange returned no days');
        }
        const warnings = (Array.isArray(result.warnings) ? result.warnings : []).filter(Boolean);
        if (warnings.length > 0) {
          console.error(`🔥 ${key}: range read returned warnings; nothing cached:`, warnings.join(' | '));
          this.reportError(key, `${message}: ${warnings.join(' | ')}`, { retry });
          return false;
        }
        primeFromRange(result.days);
        this.resolveError(key);
        return true;
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

      recordCategory(category) {
        if (!category || typeof category !== 'string') return;
        const clean = category.trim();
        if (!clean) return;
        const list = (this.recentCategories || []).filter(c => c.toLowerCase() !== clean.toLowerCase());
        list.unshift(clean);
        this.recentCategories = list.slice(0, 20);
        try {
          localStorage.setItem('dayPlannerCategories', JSON.stringify(this.recentCategories));
        } catch (err) {
          console.error('recordCategory: could not persist categories to localStorage:', err.stack);
        }
        this.recordRecentTopic(clean);
      },

      recordRecentTopic(topic) {
        if (!topic || typeof topic !== 'string') return;
        const clean = topic.trim();
        if (!clean) return;
        const list = (this.recentTopics || []).filter(t => t.toLowerCase() !== clean.toLowerCase());
        list.unshift(clean);
        this.recentTopics = list.slice(0, 20);
        try {
          localStorage.setItem('dayPlannerRecentTopics', JSON.stringify(this.recentTopics));
        } catch (err) {
          console.error('recordRecentTopic: could not persist recent topics to localStorage:', err.stack);
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
        } catch (err) {
          console.error('removeRecentTopic: could not persist recent topics to localStorage:', err.stack);
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

      getContinuationPrefix(line) {
        if (!line || typeof line !== 'string') return '';
        if (line.startsWith('- ')) return '- ';
        if (/^[☐☒☑]\s/.test(line)) return '☐ ';
        const numMatch = /^(\d+)\.\s/.exec(line);
        if (numMatch) return `${parseInt(numMatch[1], 10) + 1}. `;
        return '';
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

          const cursorPos = typeof e.target?.selectionStart === 'number' ? e.target.selectionStart : null;
          const isMidLine = cursorPos != null && cursorPos > 0 && cursorPos < currentLine.length;

          if (isMidLine) {
            const before = currentLine.slice(0, cursorPos).trimEnd();
            const afterText = currentLine.slice(cursorPos).trimStart();
            const prefix = this.getContinuationPrefix(currentLine);
            const after = prefix && !afterText.startsWith(prefix.trim()) ? prefix + afterText : afterText;
            lines[idx] = before;
            lines.splice(idx + 1, 0, after);
            card.content = lines.join('\n');
            this.syncCardsToDailyNote();
            const caretPos = prefix ? prefix.length : 0;
            this.$nextTick(() => {
              this.startEditingLine(card, idx + 1);
            });
            setTimeout(() => {
              this.startEditingLine(card, idx + 1);
              const el = document.getElementById(`card-line-${card.id}-${idx + 1}`);
              if (el) {
                el.focus();
                try { el.setSelectionRange(caretPos, caretPos); } catch (err) { console.error('Enter: could not restore caret in new card line:', err.stack); }
              }
            }, 40);
            return;
          }

          const prefix = this.getContinuationPrefix(currentLine);
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
              try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) { console.error('Enter: could not move caret to end of new card line:', err.stack); }
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
        } catch (err) {
          console.error('getDefaultLinkText: not a parseable URL, using raw text as link label:', err.stack);
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
          console.error('Google Drive title lookup error:', err.stack);
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
            console.error('Google Drive title lookup failed on submit:', err.stack);
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
          console.error('Smart-paste title lookup failed, pasting plain URL instead:', err.stack);
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
          console.error('[STT] createDictationScratchDoc threw', err.stack);
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
          if (result.cleared === false) {
            // Text was read and inserted, but the server could not empty the scratch doc.
            console.error('[STT] scratch doc read but NOT cleared:', result.clearError);
            this.sttError = 'Inserted the voice-typed text, but the voice typing doc could not be cleared (' + (result.clearError || 'unknown error') + '). That doc still holds this text, so it may reappear if pulled again.';
          }
          this.sttRefreshedFlash = true;
          setTimeout(() => { this.sttRefreshedFlash = false; }, 1800);
        } catch (err) {
          this.sttError = 'Could not pull voice-typed text: ' + (err.message || err);
          console.error('[STT] pullFromDictationScratchpad threw', err.stack);
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
        if (/^Daily Notes for \d{4}-\d{2}-\d{2}$/i.test(clean)) {
          clean = 'Daily Notes';
        }
        return { indexTopic, heading: clean };
      },

      parseDailyNoteToCards(noteText = '') {
        if (!noteText.trim() || noteText.startsWith('No notes recorded for')) {
          return [
            { id: 'nc_1', indexTopic: 'General', heading: 'Daily Notes', content: '- Initialized daily topic card.', category: 'General', categories: ['General'], collapsed: false }
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
        // Capture the date/content now, not when the timer fires -- navigating to a different
        // day within the debounce window changes this.selectedDate/this.dailyNote out from under
        // a fire-time read, which silently saved the note onto the wrong day (or lost it) instead
        // of the day the user was actually typing on.
        const dateStr = this.selectedDate;
        const noteContent = this.dailyNote;
        // One debounce timer per date: a newer edit of the same day replaces its pending save,
        // an edit of another day never cancels it.
        if (this.noteSaveDebouncing(dateStr)) clearTimeout(this.noteSaveTimers[dateStr]);
        // Write through into the cache at edit time (optimistic), so navigating back to this date
        // inside the 1200ms debounce window shows the just-typed content. If the save then fails,
        // the cache is rolled back to the last saved text (rollbackUnsavedNoteCache) so unsaved
        // text is never served from cache as if it were saved.
        const existingCacheEntry = getCached(dateStr) || { tasks: this.confirmedTaskList(this.dailyTasks), calendarEvents: this.calendarEvents, docUrl: this.dailyDocUrl };
        setCached(dateStr, { ...existingCacheEntry, noteContent });
        this.bumpDailyEditSeq(dateStr);
        this.noteSaveTimers[dateStr] = setTimeout(() => {
          delete this.noteSaveTimers[dateStr];
          this.saveDailyNote(dateStr, noteContent);
        }, 1200);
      },

      // Serialized per date (key save-note:<date>): one saveDailyDocCards call in flight per day;
      // text typed meanwhile replaces the queued text (latest wins). The rollback target is
      // savedNoteByDate (the last text Google confirmed); the editor text is always kept.
      saveDailyNote(dateStr, noteContent) {
        const key = `save-note:${dateStr}`;
        return this.saveQueue.submit(key, {
          value: noteContent,
          baseline: this.savedNoteByDate[dateStr],
          write: async (text) => {
            const result = await callBridge(this.bridge, [['saveDailyDocCards', [dateStr, text]]], `daily note for ${dateStr}`);
            // Code.gs reports Drive/Docs failures as a resolved { success: false, error }.
            if (!result || result.success !== true) {
              throw new Error((result && result.error) || 'the server did not confirm the save');
            }
            return result;
          },
          onSaved: (text) => {
            this.savedNoteByDate[dateStr] = text;
            saveNoteRevision(dateStr, text);
            this.resolveError(key);
          },
          onFailed: (err) => {
            console.error(`🔥 saveDailyDocCards failed for ${dateStr}; note NOT saved, cache rolled back to last saved text, editor text kept:`, err.stack);
            this.rollbackUnsavedNoteCache(dateStr, noteContent);
            this.reportError(key, `Daily note for ${dateStr} NOT saved: ${err.message || err.toString()}. Your text is still in the editor; press Retry or edit again, or copy it before leaving this day.`, {
              retry: () => this.retryDailyNoteSave(dateStr)
            });
          }
        });
      },

      // Re-sends the latest text submitted for dateStr (never an older one, and never whatever
      // day happens to be open now), writing it through to the cache again like a fresh edit.
      retryDailyNoteSave(dateStr) {
        const text = this.saveQueue.latest(`save-note:${dateStr}`);
        if (typeof text !== 'string') throw new Error(`No unsaved note text is known for ${dateStr}.`);
        // Write through only over the rolled-back (last saved) text: if the cache already holds
        // newer typing, that text has its own pending save and must not be replaced.
        const entry = getCached(dateStr);
        if (entry && entry.noteContent === this.savedNoteByDate[dateStr]) {
          setCached(dateStr, { ...entry, noteContent: text });
          this.bumpDailyEditSeq(dateStr);
        }
        return this.saveDailyNote(dateStr, text);
      },

      // Restores the cached note for dateStr to the last text confirmed saved, but only if the
      // cache still holds the text this failed save attempted (a newer edit owns it otherwise,
      // and its own pending save will commit or roll back). Unknown saved text: drop the entry
      // so the next visit refetches from Google instead of trusting the cache.
      rollbackUnsavedNoteCache(dateStr, attemptedContent) {
        const entry = getCached(dateStr);
        if (!entry || entry.noteContent !== attemptedContent) return;
        if (Object.prototype.hasOwnProperty.call(this.savedNoteByDate, dateStr)) {
          setCached(dateStr, { ...entry, noteContent: this.savedNoteByDate[dateStr] });
        } else {
          invalidateCached(dateStr);
        }
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
        setCachedMasterTasks(this.confirmedTaskList(this.masterTasks));
      },

      // Stale-while-revalidate + IndexedDB hydration, same pattern as loadDayData: render
      // instantly from whatever's cached (memory, then IndexedDB), then always revalidate in the
      // background, dropping the response instead of applying/caching it if a local mutation
      // (add/delete/star/status/move) landed while the fetch was in flight.
      async loadMasterTasks() {
        const cached = getCachedMasterTasks() || await hydrateMasterTasksFromIdb();
        if (cached) this.applyMasterTasks(this.reconcileReloadedTasks(cached.tasks, this.masterTasks, null).live);
        const seqAtFetchStart = this.masterTasksEditSeq;
        const mark = this.saveQueue.mark();
        try {
          const tasks = await this.bridge.getMasterTasks(`${this.selectedMonthName} ${this.selectedYear}`);
          if (this.masterTasksEditSeq !== seqAtFetchStart) return; // a local edit already superseded this
          // Unsaved status picks stay on screen; the cache gets only confirmed values.
          const merged = this.reconcileReloadedTasks(tasks || [], this.masterTasks, mark);
          setCachedMasterTasks(merged.confirmed, { synced: true });
          this.applyMasterTasks(merged.live);
          this.resolveError('load-master');
        } catch (err) {
          console.error('🔥 loadMasterTasks: refresh failed; showing cached list (if any) with a stale notice:', err.stack);
          if (cached) {
            this.showStaleNotice('load-master', 'Master Tasks', cached, err);
          } else {
            this.reportError('load-master', `Error loading master tasks: ${err.message || err.toString()}`, { retry: () => this.loadMasterTasks() });
          }
        }
      },

      async addMasterTask() {
        const details = extractTaskDetails(this.newMasterTaskTitle);
        const extracted = extractInlinePriority(details.rawTitle, this.newMasterTaskPriorityGroup);
        this.newMasterTaskPriorityGroup = extracted.priorityGroup;
        const taskTitle = extracted.cleanTitle;
        if (!taskTitle || this.addingMasterTask) return;
        this.addingMasterTask = true;
        try {
          const category = this.newMasterTaskCategory.trim() || 'General';
          this.recordCategory(category);
          const dueDate = this.newMasterTaskDueDate ? this.newMasterTaskDueDate.trim() : null;
          const existingCount = this.masterTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newMasterTaskPriorityGroup, existingCount, taskTitle);
          const created = await this.bridge.addMasterTask(formattedTitle, category, dueDate, details.notes);
          created._moveDate = getLocalDateStr();
          created._moving = false;
          created._isNew = true;
          if (details.notes && !created.notes) created.notes = details.notes;
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
          console.error('🔥 addMasterTask error:', err.stack);
          this.reportError('master-add', `Could not add master task: ${err.message || err.toString()}`);
        } finally {
          this.addingMasterTask = false;
        }
      },

      async deleteMasterTask(task) {
        if (!task || !task.id) return;
        this.openStatusMenuTaskId = null;
        const idx = this.masterTasks.findIndex(t => t.id === task.id);
        if (idx !== -1) this.masterTasks.splice(idx, 1);
        this.syncMasterTasksCacheFromLiveState();
        return this.deleteTaskQueued({
          task,
          isMaster: true,
          dateStr: this.selectedDate,
          what: 'master task',
          send: () => callBridge(this.bridge, [['deleteMasterTask', [task.id]], ['deleteDailyTask', ['', task.id]]], 'master task deletion'),
          restore: () => {
            if (idx !== -1 && !this.masterTasks.some(t => t.id === task.id)) {
              this.masterTasks.splice(Math.min(idx, this.masterTasks.length), 0, task);
            }
            this.syncMasterTasksCacheFromLiveState();
          }
        });
      },

      // Deletes go through the per-item queue (key task-delete:<id>). While one is queued or in
      // flight (or confirmed after a read began) reloads leave the task out (taskDeleteHidesRead),
      // so nothing resurrects it. Before the delete is sent, that task queued status/title/star
      // saves are dropped (never sent after it) and its in-flight ones are awaited, so a late save
      // or its rollback cannot race the delete. A failed delete restores the task (restore) and
      // files task-delete:<id>; a confirmed one resolves every tray entry of that task.
      deleteTaskQueued({ task, isMaster, dateStr, what, send, restore }) {
        const key = `task-delete:${task.id}`;
        return this.saveQueue.submit(key, {
          value: true,
          baseline: false,
          write: async () => {
            await this.supersedeTaskSaves(task, isMaster, dateStr);
            return send();
          },
          onSaved: async () => {
            this.resolveError(key);
            TASK_SAVE_KINDS.forEach(kind => this.resolveError(`${kind.prefix}:${task.id}`));
            await this.trigger2WaySync();
          },
          onFailed: (err) => {
            console.error(`🔥 delete of ${what} ${task.id} failed; task restored to the list and cache:`, err.stack);
            restore();
            this.reportError(key, `Could not delete ${what}: ${err.message || err.toString()}`);
          }
        });
      },

      // Drops the task queued (not yet sent) field saves and waits out the in-flight ones. A live
      // copy still showing a dropped value goes back to the last confirmed value, so a task
      // restored after a failed delete never shows a value that was never saved.
      async supersedeTaskSaves(task, isMaster, dateStr) {
        const dropped = [];
        TASK_SAVE_KINDS.forEach(kind => {
          const key = `${kind.prefix}:${task.id}`;
          const value = this.saveQueue.latest(key);
          if (this.saveQueue.cancel(key)) dropped.push({ kind, key, value });
        });
        await Promise.all(TASK_SAVE_KINDS.map(kind => this.saveQueue.idle(`${kind.prefix}:${task.id}`)));
        dropped.forEach(({ kind, key, value }) => {
          const confirmed = this.saveQueue.confirmed(key);
          if (confirmed === undefined) return;
          console.warn(`${key}: queued value dropped because the task is being deleted; live copies reset to the last confirmed value.`);
          const back = kind.fields(confirmed);
          const tried = kind.fields(value);
          this.liveTaskCopies(task, isMaster, dateStr, true).forEach(t => {
            Object.keys(back).forEach(f => { restoreIfUnchanged(t, f, tried[f], back[f]); });
          });
        });
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
          console.error('🔥 moveMasterTaskToDate error:', err.stack);
          this.reportError(`master-move:${mTask.id}`, `Error moving master task: ${err.message || err.toString()}`);
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
          this.primeRangeResult(result, `load-month:${requestedYear}-${requestedMonth}`,
            `Could not fully load ${MONTH_NAMES[requestedMonth - 1]} ${requestedYear}; the calendar shows only days already cached (others may look empty)`,
            () => this.loadMonthlyCalendarData());
          if (requestedYear !== this.selectedYear || requestedMonth !== this.selectedMonth) return;
          if (this.activeView === 'monthly-calendar') this.buildMonthlyGrid();
        } catch (err) {
          console.error('🔥 loadMonthlyCalendarData failed; month grid shows only already-cached days:', err.stack);
          if (requestedYear !== this.selectedYear || requestedMonth !== this.selectedMonth) return;
          this.reportError(`load-month:${requestedYear}-${requestedMonth}`, `Could not refresh ${MONTH_NAMES[requestedMonth - 1]} ${requestedYear}; the calendar shows only days already cached (others may look empty): ${err.message || err.toString()}`, { retry: () => this.loadMonthlyCalendarData() });
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
        const details = extractTaskDetails(this.newTaskTitle);
        const extracted = extractInlinePriority(details.rawTitle, this.newTaskPriorityGroup);
        this.newTaskPriorityGroup = extracted.priorityGroup;
        const taskTitle = extracted.cleanTitle;
        if (!taskTitle) return;
        try {
          const category = (this.newTaskCategory && this.newTaskCategory.trim()) || 'Work';
          this.recordCategory(category);
          const existingCount = this.dailyTasks.length + 1;
          const formattedTitle = formatTaskTitle(this.newTaskPriorityGroup, existingCount, taskTitle);
          const newTask = await this.bridge.addDailyTask(this.selectedDate, formattedTitle, category, null, details.notes);
          newTask._isNew = true;
          if (details.notes && !newTask.notes) newTask.notes = details.notes;
          this.dailyTasks.push(newTask);
          this.newTaskTitle = '';
          this.newTaskCategory = '';
          this.syncDailyCacheFromLiveState();
          await this.trigger2WaySync();
        } catch (err) {
          console.error('🔥 addDailyTask error:', err.stack);
          this.reportError('task-add', `Error adding task: ${err.message || err.toString()}`);
        }
      },

      startEditingTask(task) {
        if (!task || !task.id) return;
        this.editingTaskId = task.id;
        const parsed = this.parseTask(task.title);
        this.editingTaskTitle = task.notes ? `${parsed.cleanTitle} | ${task.notes}` : parsed.cleanTitle;
        this.$nextTick(() => {
          const el = document.getElementById(`task-title-input-${task.id}`);
          if (el) {
            el.focus();
            el.select();
          }
        });
      },

      cancelEditingTask() {
        this.editingTaskId = null;
        this.editingTaskTitle = '';
      },

      async updateTaskTitle(taskId, newTitle) {
        if (!this.editingTaskId || this.editingTaskId !== taskId) return;
        this.editingTaskId = null;
        const details = extractTaskDetails(newTitle || '');
        const trimmed = details.rawTitle;
        const hasPipe = (newTitle || '').includes('|');
        this.editingTaskTitle = '';

        let task = this.dailyTasks.find(t => t.id === taskId);
        let isMaster = false;
        if (!task) {
          task = this.masterTasks.find(t => t.id === taskId);
          isMaster = true;
        }
        if (!task) return;

        const parsed = this.parseTask(task.title);
        const titleChanged = Boolean(trimmed && trimmed !== parsed.cleanTitle);
        const notesChanged = hasPipe && details.notes !== (task.notes || '');
        if (!titleChanged && !notesChanged) {
          return;
        }

        const newFullTitle = titleChanged ? updateTaskTitleText(task.title, trimmed) : task.title;
        const dateStr = this.selectedDate;
        const key = `task-title:${task.id}`;
        const baseline = TASK_TITLE_KIND.value(task);
        // notesEdited: send notes only when this edit (or a still-unsaved earlier one it
        // supersedes in the queue) changed them.
        const prior = this.saveQueue.unsaved(key) ? this.saveQueue.latest(key) : null;
        const value = {
          title: newFullTitle,
          notes: notesChanged ? details.notes : baseline.notes,
          notesEdited: notesChanged || Boolean(prior && prior.notesEdited)
        };
        // The task and its linked master/daily copy move (and roll back) together.
        this.statusCopies(task, isMaster).forEach(t => {
          t.title = value.title;
          if (notesChanged) t.notes = value.notes;
        });
        // Serialized per task (key task-title:<id>), latest wins; reloads keep the pending edit on
        // screen and the caches get the title only once Google confirmed it.
        return this.saveQueue.submit(key, {
          value,
          baseline,
          write: async (v) => {
            const updates = { title: v.title };
            if (v.notesEdited) updates.notes = v.notes;
            const candidates = isMaster
              ? [['updateMasterTask', [task.id, updates]], ['updateDailyTask', ['', task.id, updates]]]
              : [['updateDailyTask', [dateStr, task.id, updates]]];
            return requireSaved(await callBridge(this.bridge, candidates, 'task title'), 'task title');
          },
          onSaved: async (v, result, hasNewer) => {
            this.resolveError(key);
            if (hasNewer) return;
            this.cacheTaskStatusState(dateStr);
            await this.trigger2WaySync();
          },
          onFailed: (err, confirmed) => this.rollbackTaskField({
            kind: TASK_TITLE_KIND, task, isMaster, dateStr, key, attempted: value, confirmed, err, what: 'task title', linked: true
          })
        });
      },

      // Every live object for this task: the original, the copy on screen now (a reload may have
      // replaced it), and with linked true their linked master/daily copies.
      liveTaskCopies(task, isMaster, dateStr, linked) {
        const onScreen = isMaster
          ? this.masterTasks.find(t => t.id === task.id)
          : (dateStr === this.selectedDate ? this.dailyTasks.find(t => t.id === task.id) : null);
        const copies = new Set([task, onScreen].filter(Boolean));
        if (linked) [...copies].forEach(t => this.statusCopies(t, isMaster).forEach(x => copies.add(x)));
        return [...copies];
      },

      // Rolls a failed title/star save back to the last confirmed value on every live copy still
      // showing the attempted value (a newer edit is never clobbered), writes the caches, and
      // files the tray entry under key.
      rollbackTaskField({ kind, task, isMaster, dateStr, key, attempted, confirmed, err, what, linked }) {
        console.error(`🔥 ${what} save failed for ${task.id}; rolled back to the last confirmed value:`, err.stack);
        if (confirmed !== undefined) {
          const back = kind.fields(confirmed);
          const tried = kind.fields(attempted);
          this.liveTaskCopies(task, isMaster, dateStr, linked).forEach(t => {
            Object.keys(back).forEach(f => { restoreIfUnchanged(t, f, tried[f], back[f]); });
          });
        }
        this.cacheTaskStatusState(dateStr);
        this.reportError(key, `Could not save ${what}: ${err.message || err.toString()}`);
      },

      async deleteDailyTask(task) {
        if (!task || !task.id) return;
        this.openStatusMenuTaskId = null;
        // Capture the day and its live list: if the user navigates away while the delete is in
        // flight, a rollback must restore the task into THAT day, never the newly opened one.
        const dateStr = this.selectedDate;
        const list = this.dailyTasks;
        const idx = list.findIndex(t => t.id === task.id);
        if (idx !== -1) list.splice(idx, 1);
        this.syncDailyCacheFromLiveState();
        return this.deleteTaskQueued({
          task,
          isMaster: false,
          dateStr,
          what: 'task',
          send: () => callBridge(this.bridge, [['deleteDailyTask', [dateStr, task.id]]], 'task deletion'),
          restore: () => {
            if (idx === -1) return;
            // Back into the list on screen when that day is open (a reload may have replaced the
            // array), otherwise into the captured list, and the day cache is dropped.
            const onScreen = dateStr === this.selectedDate;
            const target = onScreen ? this.dailyTasks : list;
            if (!target.some(t => t.id === task.id)) target.splice(Math.min(idx, target.length), 0, task);
            if (onScreen) {
              this.syncDailyCacheFromLiveState();
            } else {
              invalidateCached(dateStr);
            }
          }
        });
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

      // Serialized per task (key task-star:<id>), latest wins; reloads keep the pending star on
      // screen, the caches get it only once Google confirmed it, and a failure rolls back to the
      // last confirmed value.
      async toggleTaskStar(task) {
        const baseline = TASK_STAR_KIND.value(task);
        const next = !baseline;
        task.starred = next;
        const isMaster = this.masterTasks.some(m => m.id === task.id);
        const dateStr = this.selectedDate;
        const key = `task-star:${task.id}`;
        return this.saveQueue.submit(key, {
          value: next,
          baseline,
          write: async (starred) => {
            const candidates = isMaster
              ? [['updateMasterTask', [task.id, { starred }]], ['updateDailyTask', ['', task.id, { starred }]]]
              : [['updateDailyTask', [dateStr, task.id, { starred }]]];
            return requireSaved(await callBridge(this.bridge, candidates, 'task star'), 'task star');
          },
          onSaved: (starred, result, hasNewer) => {
            this.resolveError(key);
            if (!hasNewer) this.cacheTaskStatusState(dateStr);
          },
          onFailed: (err, confirmed) => this.rollbackTaskField({
            kind: TASK_STAR_KIND, task, isMaster, dateStr, key, attempted: next, confirmed, err, what: 'star', linked: false
          })
        });
      },

      hasNotes(task) {
        return Boolean(task.notes && task.notes.trim());
      },

      // Fixed-position popovers live inside the CSS-zoomed container: convert viewport px to its px.
      zoomedRect(el) {
        const z = this.uiZoom / 100;
        const r = el.getBoundingClientRect();
        return { left: r.left / z, right: r.right / z, top: r.top / z, bottom: r.bottom / z };
      },

      zoomedViewport() {
        const z = this.uiZoom / 100;
        return { w: window.innerWidth / z, h: window.innerHeight / z };
      },

      openNotesPopover(taskId, event) {
        clearTimeout(this.notesPopoverCloseTimer);
        this.openNotesPopoverTaskId = taskId;
        if (event && (event.currentTarget || event.target)) {
          const el = event.currentTarget || event.target;
          const btn = el.closest ? (el.closest('.notes-indicator') || el) : el;
          const rect = this.zoomedRect(btn);
          const spaceBelow = this.zoomedViewport().h - rect.bottom;
          const spaceAbove = rect.top;
          const dropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
          this.notesPopoverDropUp = dropUp;

          let left = Math.round(rect.left);
          const popoverWidth = 280;
          if (left + popoverWidth > this.zoomedViewport().w - 16) {
            left = Math.max(16, this.zoomedViewport().w - popoverWidth - 16);
          }
          this.notesPopoverPos = {
            top: dropUp ? null : `${Math.round(rect.bottom)}px`,
            bottom: dropUp ? `${Math.round(this.zoomedViewport().h - rect.top + 4)}px` : null,
            left: `${left}px`
          };
        }
      },

      toggleNotesPopover(taskId, event) {
        clearTimeout(this.notesPopoverCloseTimer);
        if (this.openNotesPopoverTaskId === taskId) {
          this.openNotesPopoverTaskId = null;
        } else {
          this.openNotesPopover(taskId, event);
        }
      },

      // Object (not string) so Alpine merges it and never clobbers the display:none set by x-show.
      notesPopoverStyle(taskId) {
        if (this.openNotesPopoverTaskId !== taskId || !this.notesPopoverPos.left) return { display: 'none' };
        return this.notesPopoverDropUp
          ? { display: 'block', position: 'fixed', bottom: this.notesPopoverPos.bottom, left: this.notesPopoverPos.left }
          : { display: 'block', position: 'fixed', top: this.notesPopoverPos.top, left: this.notesPopoverPos.left };
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
          const btn = el.closest ? (el.closest('.status-btn') || el) : el;
          const rect = this.zoomedRect(btn);
          const spaceBelow = this.zoomedViewport().h - rect.bottom;
          const spaceAbove = rect.top;
          const dropUp = (spaceBelow < 275 && spaceAbove > spaceBelow) || spaceBelow < 160;
          this.statusMenuDropUp = dropUp;
          this.statusMenuPos = {
            top: dropUp ? null : `${Math.round(rect.bottom + 2)}px`,
            bottom: dropUp ? `${Math.round(this.zoomedViewport().h - rect.top + 2)}px` : null,
            left: `${Math.round(rect.left)}px`
          };
        }
      },

      // Object (not string) so Alpine merges it and never clobbers the display:none set by x-show.
      statusMenuStyle(taskId) {
        if (this.openStatusMenuTaskId !== taskId || !this.statusMenuPos.left) return { display: 'none' };
        return this.statusMenuDropUp
          ? { display: 'flex', position: 'fixed', bottom: this.statusMenuPos.bottom, left: this.statusMenuPos.left }
          : { display: 'flex', position: 'fixed', top: this.statusMenuPos.top, left: this.statusMenuPos.left };
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
        const isMaster = this.masterTasks.some(m => m.id === task.id);
        const dateStr = this.selectedDate;
        const key = `task-status:${task.id}`;
        const baseline = task.status;
        // A linked master/daily pair mirrors status either direction, so every copy moves (and
        // rolls back) together.
        this.statusCopies(task, isMaster).forEach(t => { t.status = newStatus; });
        const targetDate = (!isMaster && newStatus === '→') ? this.forwardTargetDate(dateStr) : null;
        // Serialized per task (key task-status:<id>): one write in flight; a status picked
        // meanwhile replaces the queued one. A failure rolls back to the last value Google
        // confirmed, never to an earlier unconfirmed pick. Caches only ever get confirmed values.
        return this.saveQueue.submit(key, {
          value: newStatus,
          baseline,
          write: (status) => this.writeTaskStatus(task, status, isMaster, dateStr, targetDate),
          onSaved: async (status, result, hasNewer) => {
            this.resolveError(key);
            if (hasNewer) return; // the live status is a newer, unconfirmed pick: do not cache it yet
            this.cacheTaskStatusState(dateStr);
            await this.trigger2WaySync();
          },
          onFailed: (err, confirmed) => this.rollbackTaskStatus({ task, isMaster, dateStr, key, attempted: newStatus, confirmed, err, targetDate })
        });
      },

      // The task plus its linked master/daily copy (if any) currently in the live lists.
      statusCopies(task, isMaster) {
        const linkedMaster = !isMaster ? this.masterTasks.find(m => m.movedTaskId === task.id) : null;
        const linkedDaily = (isMaster && task.movedTaskId) ? this.dailyTasks.find(d => d.id === task.movedTaskId) : null;
        return [task, linkedMaster, linkedDaily].filter(Boolean);
      },

      async writeTaskStatus(task, status, isMaster, dateStr, targetDate) {
        if (isMaster) {
          return requireSaved(await callBridge(this.bridge, [
            ['updateMasterTask', [task.id, { title: task.title, status, category: task.category }]],
            ['updateDailyTask', ['', task.id, { title: task.title, status }]]
          ], 'task status'), 'task status');
        }
        if (status === '→') return this.forwardDailyTask(task, targetDate, dateStr);
        return requireSaved(await callBridge(this.bridge, [
          ['updateDailyTask', [dateStr, task.id, { title: task.title, status, dueDate: task.dueDate }]]
        ], 'task status'), 'task status');
      },

      // Writes the live task state through to the caches (confirmed values only, see
      // confirmedTaskCopy) after a status/title/star save settles; a day no longer open is
      // invalidated instead, so its next visit refetches rather than trusting a stale copy.
      cacheTaskStatusState(dateStr) {
        if (dateStr === this.selectedDate) {
          this.syncDailyCacheFromLiveState(dateStr);
        } else {
          invalidateCached(dateStr);
        }
        this.syncMasterTasksCacheFromLiveState();
      },

      async rollbackTaskStatus({ task, isMaster, dateStr, key, attempted, confirmed, err, targetDate }) {
        console.error(`🔥 setTaskStatus failed for ${task.id}; status rolled back to the last confirmed value "${confirmed}":`, err.stack);
        // A reload during the save may have put a different object for this task on screen:
        // roll back that one (and its linked copy) too, never only the detached original.
        const copies = new Set(this.statusCopies(task, isMaster));
        const onScreen = isMaster
          ? this.masterTasks.find(t => t.id === task.id)
          : (dateStr === this.selectedDate ? this.dailyTasks.find(t => t.id === task.id) : null);
        if (onScreen && !copies.has(onScreen)) this.statusCopies(onScreen, isMaster).forEach(t => copies.add(t));
        copies.forEach(t => { restoreIfUnchanged(t, 'status', attempted, confirmed); });
        this.cacheTaskStatusState(dateStr);
        const isForward = !isMaster && attempted === '→';
        let message = `${isForward ? 'Could not forward task' : 'Could not save task status'}: ${err.message || err.toString()}`;
        // A forward that may have left a copy on the target day must not be retried blindly:
        // a second forward would create another copy. The user checks the target day instead.
        const duplicated = isForward && /may be duplicated/i.test(err.message || '');
        if (isForward) {
          // The server writes the target copy first and compensates on failure, so the real end
          // state is unknown here: re-read Google as the truth instead of assuming the rollback.
          const days = [dateStr];
          if (targetDate && (duplicated || getCached(targetDate))) days.push(targetDate);
          for (const day of days) {
            try {
              await this.refetchDayFromServer(day);
            } catch (refetchErr) {
              console.error(`🔥 forward rollback: could not re-read ${day} from Google; showing the rolled-back state, which may not match Google:`, refetchErr.stack);
              message += ` Could not re-check ${day} from Google (${refetchErr.message || refetchErr.toString()}); reload to verify.`;
            }
          }
        }
        this.reportError(key, message, { retry: duplicated ? null : () => this.retryTaskStatus(task.id, dateStr, key) });
      },

      // Re-sends the latest status submitted for the task (looked up by id in the live lists).
      retryTaskStatus(taskId, dateStr, key) {
        const status = this.saveQueue.latest(key);
        const task = this.masterTasks.find(t => t.id === taskId) ||
          (dateStr === this.selectedDate ? this.dailyTasks.find(t => t.id === taskId) : null);
        if (!task || !isValidStatus(status)) {
          throw new Error(`that task is not on the open page; open ${dateStr} and set its status again.`);
        }
        return this.setTaskStatus(task, status);
      },

      // Re-reads one day from Google as the source of truth after a failed multi-step write.
      // Replaces that day tasks and events in the cache (the note keeps its own save pipeline)
      // and, when it is the open day, the live task list. Throws on failure.
      async refetchDayFromServer(dateStr) {
        if (!this.bridge || typeof this.bridge.getDailyData !== 'function') {
          throw new Error('getDailyData is unavailable in this build');
        }
        const mark = this.saveQueue.mark();
        const data = await this.bridge.getDailyData(dateStr);
        if (!data || !Array.isArray(data.tasks)) throw new Error(`the server returned no task list for ${dateStr}`);
        // Merge, never replace: a task with a status save pending (or picked during this read)
        // keeps its on-screen value; only its rollback target takes the server copy.
        const onScreen = dateStr === this.selectedDate;
        const tasks = this.reconcileReloadedTasks(data.tasks, onScreen ? this.dailyTasks : [], mark);
        const existing = getCached(dateStr);
        if (existing) {
          setCached(dateStr, { ...existing, tasks: tasks.confirmed, calendarEvents: data.calendarEvents || existing.calendarEvents });
        } else {
          const note = this.reconcileReloadedNote(dateStr, data.noteContent, mark);
          setCached(dateStr, { ...data, tasks: tasks.confirmed, noteContent: note.text }, { synced: !note.unsaved });
          this.savedNoteByDate[dateStr] = note.saved;
        }
        // Any revalidation started before this read is older than it: make loadDayData drop it.
        this.bumpDailyEditSeq(dateStr);
        this.resolveError(`load-day:${dateStr}`);
        if (onScreen) {
          this.dailyTasks = tasks.live;
          this.buildScheduleGrid();
        }
      },

      showTaskToast(msg) {
        this.taskToast = msg;
        setTimeout(() => {
          if (this.taskToast === msg) {
            this.taskToast = null;
          }
        }, 4000);
      },

      // Past days forward to today; today and later forward to the next day.
      forwardTargetDate(sourceDate) {
        const todayStr = getLocalDateStr();
        if (sourceDate < todayStr) return todayStr;
        const [y, m, d] = sourceDate.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        const mm = String(next.getMonth() + 1).padStart(2, '0');
        const dd = String(next.getDate()).padStart(2, '0');
        return `${next.getFullYear()}-${mm}-${dd}`;
      },

      // Throws on failure (no catch here): its caller setTaskStatus owns the rollback and the
      // user-facing error, so a failed forward can never be cached or toasted as done.
      async forwardDailyTask(task, explicitTargetDate = null, sourceDate = this.selectedDate) {
        if (!task || !task.id) throw new Error('Not saved: no task to forward.');
        const todayStr = getLocalDateStr();
        const targetDate = explicitTargetDate || this.forwardTargetDate(sourceDate);

        const res = await callBridge(this.bridge, [['forwardDailyTask', [sourceDate, task.id, targetDate]]], 'task forward');
        if (!res || !res.forwardedTask) {
          throw new Error(`Not saved: task was not forwarded to ${targetDate} (the server returned no forwarded task).`);
        }
        if (targetDate === this.selectedDate) {
          this.dailyTasks.push(res.forwardedTask);
          this.syncDailyCacheFromLiveState();
        } else {
          invalidateCached(targetDate);
        }
        const parsed = this.parseTask(task.title);
        const cleanTitle = parsed.cleanTitle || task.title;
        const displayDest = targetDate === todayStr ? 'Today' : targetDate;
        this.showTaskToast(`Forwarded "${cleanTitle}" to ${displayDest}`);
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
          description: '',
          addMeet: false
        };
        this.createEventError = null;
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

      // Creates the appointment in Google Calendar (createCalendarEvent RPC) and shows it only
      // once Google returned the created event. On failure the modal stays open with the input
      // intact and the error shown inside it. The day is captured up front: navigating away
      // mid-request adds the event to that day (cache), never to the newly opened one.
      async saveNewEvent() {
        const form = this.newEventData;
        if (!form.title.trim() || this.createEventSaving) return;
        const dateStr = this.selectedDate;
        const payload = {
          title: form.title.trim(),
          dateStr,
          startTime: form.startTime,
          endTime: form.endTime,
          description: form.description || '',
          location: form.location || ''
        };
        if (form.addMeet) payload.addMeet = true;
        this.createEventSaving = true;
        this.createEventError = null;
        let evt;
        try {
          evt = await callBridge(this.bridge, [['createCalendarEvent', [payload]]], 'appointment');
          if (!evt || !evt.id) throw new Error('Not saved: Google Calendar did not return the created event.');
        } catch (err) {
          console.error(`🔥 saveNewEvent: createCalendarEvent failed for ${dateStr}; nothing shown, modal kept open with the input:`, err.stack);
          const msg = err.message || err.toString();
          this.createEventError = /not saved/i.test(msg) ? msg : `Appointment NOT saved: ${msg}`;
          return;
        } finally {
          this.createEventSaving = false;
        }
        // The event IS saved even when its Meet conference failed: keep it and say so in the tray.
        const { meetError, ...event } = evt;
        evt = event;
        if (meetError) {
          console.error(`🔥 saveNewEvent: event ${evt.id} on ${dateStr} saved, but Google Meet was not added:`, meetError);
          this.reportError(`meet:${evt.id}`, `Appointment "${evt.title || payload.title}" was saved, but Google Meet was not added: ${meetError}`);
        }
        if (dateStr === this.selectedDate) {
          this.calendarEvents.push(evt);
          this.buildScheduleGrid();
          this.syncDailyCacheFromLiveState(dateStr);
        } else {
          const entry = getCached(dateStr);
          if (entry) {
            setCached(dateStr, { ...entry, calendarEvents: [...(entry.calendarEvents || []), evt] });
            this.bumpDailyEditSeq(dateStr);
          }
        }
        this.createEventModalOpen = false;
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
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
          this.searchDebounceTimer = null;
        }
        this.archiveSearching = false;
        this.archiveSearchQuery = '';
        this.archiveSearchError = null;
        this.archiveSearchWarning = null;
        this.searchModalOpen = false;
        this.searchQuery = '';
        this.searchResults = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [], archive: [] };
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
          if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
          }
          this.archiveSearching = false;
          this.archiveSearchQuery = '';
          this.searchResults = { totalMatches: 0, calendar: [], tasks: [], notes: [], index: [], archive: [] };
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

        const localResults = executeUniversalSearch(q, store);
        if (this.searchResults?.archive && this.archiveSearchQuery === q) {
          localResults.archive = this.searchResults.archive;
          localResults.totalMatches += localResults.archive.length;
        }
        this.searchResults = localResults;

        const flat = this.getFlattenedSearchResults();
        if (this.selectedSearchIndex < 0 || this.selectedSearchIndex >= flat.length) {
          this.selectedSearchIndex = flat.length > 0 ? 0 : -1;
        }

        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
          this.searchDebounceTimer = null;
        }

        if (q.length >= 2 && this.bridge && typeof this.bridge.searchArchiveNotes === 'function') {
          this.searchDebounceTimer = setTimeout(async () => {
            await this.runArchiveSearch(q);
          }, 350);
        }
      },

      async runArchiveSearch(query) {
        if (!query || query !== this.searchQuery.trim()) return;
        this.archiveSearching = true;
        this.archiveSearchError = null;
        this.archiveSearchWarning = null;
        try {
          const archiveResults = await this.bridge.searchArchiveNotes(query);
          if (query !== this.searchQuery.trim()) return;
          if (!Array.isArray(archiveResults)) {
            throw new Error('the archive search returned an unexpected response');
          }
          // [] is a clean no-match. Partial results (some monthly docs unreadable) carry
          // { partial: true, archiveError } on every item: show them, but say they are incomplete.
          const partial = archiveResults.find(r => r && r.partial);
          if (partial) {
            this.archiveSearchWarning = partial.archiveError || 'Archive search incomplete: some archive docs could not be read.';
          }

          this.archiveSearchQuery = query;
          this.searchResults = mergeArchiveSearchResults(this.searchResults, archiveResults);

          const flat = this.getFlattenedSearchResults();
          if (this.selectedSearchIndex < 0 && flat.length > 0) {
            this.selectedSearchIndex = 0;
          }
        } catch (err) {
          console.error('[search] Deep archive search failed; local results only, error shown in the search modal:', err.stack);
          if (query === this.searchQuery.trim()) {
            this.archiveSearchError = `Archive search failed: ${err.message || err.toString()}`;
          }
        } finally {
          if (query === this.searchQuery.trim()) {
            this.archiveSearching = false;
          }
        }
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

      // Note Time Machine / Version History
      async openTimeMachine() {
        this.timeMachineLoading = true;
        this.timeMachineOpen = true;
        this.timeMachineError = null;
        this.selectedRevisionIndex = 0;
        try {
          let revs = getNoteRevisions(this.selectedDate);
          if (!revs || revs.length === 0) {
            revs = await hydrateNoteRevisionsFromIdb(this.selectedDate);
          }
          if ((!revs || revs.length === 0) && this.dailyNote && this.dailyNote.trim()) {
            saveNoteRevision(this.selectedDate, this.dailyNote);
            revs = getNoteRevisions(this.selectedDate);
          }
          this.timeMachineRevisions = revs || [];
        } catch (err) {
          console.error('[TimeMachine] Failed to load revisions; error shown in the Time Machine panel:', err.stack);
          this.timeMachineError = `Could not load saved snapshots: ${err.message || err.toString()}`;
        } finally {
          this.timeMachineLoading = false;
        }
      },

      closeTimeMachine() {
        this.timeMachineOpen = false;
      },

      selectRevision(idx) {
        this.selectedRevisionIndex = idx;
      },

      selectedRevision() {
        return this.timeMachineRevisions[this.selectedRevisionIndex] || null;
      },

      async restoreRevision(rev) {
        if (!rev || rev.noteContent === undefined) return;
        this.dailyNote = rev.noteContent;
        this.syncDailyNoteToCards();
        this.scheduleDailyNoteSave();
        this.closeTimeMachine();
        const timeStr = this.formatRevisionTime(rev.timestamp);
        this.timeMachineToast = `Restored note snapshot from ${timeStr}`;
        setTimeout(() => {
          if (this.timeMachineToast && this.timeMachineToast.includes(timeStr)) {
            this.timeMachineToast = null;
          }
        }, 4000);
      },

      formatRevisionTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      },

      formatRevisionDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      },

      parseTask(title) {
        return parseTaskTitle(title);
      }
    }));
Alpine.start();