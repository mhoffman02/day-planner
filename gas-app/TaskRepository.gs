/**
 * @file TaskRepository.gs
 * @description Google Tasks access for the Gmail/Meeting hub (Phase 28) via the Advanced Tasks
 * service. Idempotency: every hub-created Task carries its operation key in the dp-meta marker of
 * its notes (DPEngines.taskPlanner), and findExistingByOpKey scans ALL tasks (completed and hidden
 * included, paged) before any create, because a Task create is not atomic with the ledger write.
 * A Waiting item is a Task tagged [Waiting] (no separate store). Never loops Tasks back into
 * Calendar: this file never touches Calendar.
 *
 * IIFE per .agents/rules/gas-namespace-iife.md; only export is DPTaskRepo. Literal-only top level
 * per .agents/rules/gas-global-init-order.md; DPEngines is read lazily inside functions.
 */
(function(global) {

var TASKS_PAGE_SIZE_ = 100;
var TASKS_MAX_PAGES_ = 50;
var TASKS_DEFAULT_LIST_ = '@default';
var WAITING_TAG_RE_ = /\[Waiting\]/;

/**
 * @param {string} [listId] Tasks list id from config.
 * @returns {string} The list id to use.
 */
function listId_(listId) {
  return listId || TASKS_DEFAULT_LIST_;
}

/**
 * Lists every Task (completed and hidden included), following page tokens.
 * @param {string} [listId] Tasks list id.
 * @returns {Array<object>} Task resources.
 */
function listAllTasks(listId) {
  if (typeof Tasks === 'undefined' || !Tasks.Tasks) throw new Error('Advanced Tasks service is not enabled for this project');
  var out = [];
  var pageToken = null;
  var pages = 0;
  do {
    var params = { maxResults: TASKS_PAGE_SIZE_, showCompleted: true, showHidden: true };
    if (pageToken) params.pageToken = pageToken;
    var resp = Tasks.Tasks.list(listId_(listId), params) || {};
    (resp.items || []).forEach(function(t) { out.push(t); });
    pageToken = resp.nextPageToken || null;
    pages += 1;
  } while (pageToken && pages < TASKS_MAX_PAGES_);
  if (pageToken) throw new Error('Tasks list exceeds the bounded page limit; cannot prove no duplicate exists');
  return out;
}

/**
 * @param {string} opKey Operation key.
 * @param {string} [listId] Tasks list id.
 * @returns {object|null} The Task previously created for the key, or null.
 */
function findExistingByOpKey(opKey, listId) {
  return DPEngines.findExistingByOpKey(listAllTasks(listId), opKey);
}

/**
 * Plans then (only when no Task exists for the key) creates the Task.
 * @param {object} plan Result of DPEngines.planTaskFromThread / planWaiting.
 * @param {string} [listId] Tasks list id.
 * @returns {{created:boolean, task:object}} Outcome.
 */
function createFromPlan_(plan, listId) {
  if (plan.action === 'EXISTS') return { created: false, task: plan.task };
  var task = Tasks.Tasks.insert(plan.task, listId_(listId));
  return { created: true, task: task };
}

/**
 * Creates (or finds) the Task for a labeled Gmail thread.
 * @param {{thread:object, today:boolean, priority?:string, opKey:string, now:Date, timeZone:string, listId?:string}} a Inputs.
 * @returns {{created:boolean, task:object}} Outcome.
 */
function createFromThread(a) {
  var plan = DPEngines.planTaskFromThread({
    thread: { threadId: a.thread.threadId, subject: a.thread.subject, url: a.thread.url },
    today: !!a.today,
    priority: a.priority,
    existingTasks: listAllTasks(a.listId),
    opKey: a.opKey,
    now: a.now,
    timeZone: a.timeZone
  });
  return createFromPlan_(plan, a.listId);
}

/**
 * Creates (or finds) a Waiting item: a Task tagged [Waiting].
 * @param {{thread:object, waitingOn:string, nagDate:string, priority?:string, opKey:string, now:Date, listId?:string}} a Inputs.
 * @returns {{created:boolean, task:object}} Outcome.
 */
function createWaiting(a) {
  var plan = DPEngines.planWaiting({
    thread: { threadId: a.thread.threadId, subject: a.thread.subject, url: a.thread.url },
    waitingOn: a.waitingOn,
    nagDate: a.nagDate,
    priority: a.priority,
    existingTasks: listAllTasks(a.listId),
    opKey: a.opKey,
    now: a.now
  });
  return createFromPlan_(plan, a.listId);
}

/**
 * Open Waiting items whose nag date has arrived.
 * @param {string} today Local date YYYY-MM-DD.
 * @param {string} [listId] Tasks list id.
 * @returns {Array<{id:string,title:string,nagDate:string,waitingOn:string}>} Due items (no notes bodies).
 */
function listWaitingDue(today, listId) {
  return listAllTasks(listId).filter(function(t) {
    return t.status !== 'completed' && WAITING_TAG_RE_.test(t.notes || '');
  }).map(function(t) {
    var meta = DPEngines.taskPlannerReadMeta(t.notes);
    return { id: t.id, title: t.title || '', nagDate: meta.nagDate || '', waitingOn: meta.waitingOn || '' };
  }).filter(function(w) { return w.nagDate && w.nagDate <= today; });
}

/**
 * @param {object} task Task resource.
 * @returns {string} Task web URL (Tasks has no per-task deep link, so the list view).
 */
function taskUrl(task) {
  return (task && task.webViewLink) || 'https://tasks.google.com/tasks/';
}

global.DPTaskRepo = Object.freeze({
  listAllTasks: listAllTasks,
  findExistingByOpKey: findExistingByOpKey,
  createFromThread: createFromThread,
  createWaiting: createWaiting,
  listWaitingDue: listWaitingDue,
  taskUrl: taskUrl
});   // cross-file only: QueueProcessor.gs, Triggers.gs, UnitTests.gs

})(typeof globalThis !== 'undefined' ? globalThis : this);
