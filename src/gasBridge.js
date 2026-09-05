/**
 * @file gasBridge.js
 * @description Day Planner Google Workspace REST Bridge & Local Mock Provider.
 * Talks directly to Calendar/Tasks/Drive/Docs REST APIs using a token from `googleAuth.js`,
 * falling back to local mock state when signed out or in local-dev mock mode.
 */

import { transferMasterTaskToToday, forwardTaskToDate, TASK_STATUSES } from './taskEngine.js';
import { reconcileWorkspaceChanges, planSyncPersistence } from './syncEngine.js';
import IndexedDbStore from './indexedDbStore.js';
import { createFutureItem, nextMonthKey, emptyYearMatrix } from './futureMatrixEngine.js';
import { getAccessToken } from './googleAuth.js';

/**
 * Outbox mutation type tags used to queue and later replay writes made while offline.
 */
export const OUTBOX_MUTATION_TYPES = {
  ADD_DAILY_TASK: 'ADD_DAILY_TASK',
  UPDATE_DAILY_TASK: 'UPDATE_DAILY_TASK',
  ADD_CALENDAR_EVENT: 'ADD_CALENDAR_EVENT',
  UPDATE_CALENDAR_EVENT: 'UPDATE_CALENDAR_EVENT',
  SAVE_DAILY_NOTE: 'SAVE_DAILY_NOTE'
};

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DOCS_API_BASE = 'https://docs.googleapis.com/v1';
// PropertiesService's replacement per the GAS-removal plan: a single root-folder-ID key. Unlike
// gas-app/Code.gs#getValidatedRootFolder, there's no LockService/CacheService equivalent here —
// single-user client-only usage makes the folder-creation race this guarded against rare and
// low-stakes (worst case: a duplicate "Day Planner" folder to delete manually), so it's not
// replicated client-side (see the GAS-removal migration plan's "GAS-only mechanisms" section).
const ROOT_FOLDER_STORAGE_KEY = 'dayPlannerRootFolderId';

// Single visible marker on every mock-mode object, so mock data can never be silently mistaken
// for a real API response mid-debugging — e.g. an expired/missing access token falling through
// to the mock branch and returning plausible-looking fake data with no other signal that it
// wasn't real (this bit us once during Stage 3's live smoke testing).
const MOCK_DATA_FLAG = '🚩 MOCK DATA';
const tagMock = (obj) => ({ ...obj, _mock: MOCK_DATA_FLAG });
const mockYearMatrix = (year) => tagMock(emptyYearMatrix(year));

// Ported from gas-app/Code.gs's TASK_STATUS_MARKER_RE / TASK_EXTRA_STATUSES / TASK_META_MARKER_RE
// / deriveTaskStatus / decodeTaskMeta — Google Tasks has no custom-field support, so status
// glyphs beyond plain done/not-done and app metadata (e.g. which master task a daily task was
// transferred from) are both hidden JSON/marker lines inside the task's `notes` field. This is
// the first time this decoding has needed to run in a browser rather than only in Apps Script.
const TASK_STATUS_MARKER_RE = /^<!--dp-status:(.+?)-->\n?/;
const TASK_EXTRA_STATUSES = ['→', 'X', 'D/✓'];
const TASK_META_MARKER_RE = /<!--dp-meta:(.*?)-->\n?/;

/**
 * Derives the display status glyph for a Google Task, preferring the hidden dp-status marker
 * (for statuses like FORWARDED/CANCELED/DELEGATED that Google Tasks has no native concept of)
 * over the task's plain completed/needsAction state.
 * @param {{status?: string, notes?: string}} googleTask
 * @returns {string}
 */
export function deriveTaskStatus(googleTask) {
  const match = (googleTask.notes || '').match(TASK_STATUS_MARKER_RE);
  if (match && TASK_EXTRA_STATUSES.includes(match[1])) return match[1];
  return googleTask.status === 'completed' ? '✓' : '•';
}

/**
 * Decodes the hidden dp-meta JSON blob from a Task's `notes`, if present.
 * @param {string} notes
 * @returns {object}
 */
export function decodeTaskMeta(notes) {
  const match = (notes || '').match(TASK_META_MARKER_RE);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

/**
 * Strips the hidden dp-status marker line from a task's notes, if present. Ported from
 * gas-app/Code.gs#stripTaskStatusMarker.
 * @param {string} notes
 * @returns {string}
 */
function stripTaskStatusMarker(notes) {
  return (notes || '').replace(TASK_STATUS_MARKER_RE, '');
}

/**
 * Computes the `notes` value to persist for a given app status, preserving any existing
 * non-marker notes content. Native statuses ('•'/'✓') need no marker, since 'completed'/
 * 'needsAction' already represent them; only the 3 extra statuses get one. Ported 1:1 from
 * gas-app/Code.gs#encodeTaskStatusNotes.
 * @param {string} status App status glyph being written.
 * @param {string} existingNotes Current `notes` field on the task before this update.
 * @returns {string} New `notes` value to send in the patch.
 */
export function encodeTaskStatusNotes(status, existingNotes) {
  const rest = stripTaskStatusMarker(existingNotes);
  if (!TASK_EXTRA_STATUSES.includes(status)) return rest;
  const marker = `<!--dp-status:${status}-->`;
  return rest ? `${marker}\n${rest}` : marker;
}

/**
 * Computes the `notes` value to persist after merging `metaPatch` into any existing metadata,
 * preserving other notes content (e.g. a status marker) untouched. Ported 1:1 from
 * gas-app/Code.gs#encodeTaskMeta.
 * @param {string} existingNotes Current `notes` field on the task before this update.
 * @param {object} metaPatch Fields to merge into the existing metadata object.
 * @returns {string} New `notes` value to send in the patch.
 */
export function encodeTaskMeta(existingNotes, metaPatch) {
  const merged = Object.assign({}, decodeTaskMeta(existingNotes), metaPatch);
  const rest = (existingNotes || '').replace(TASK_META_MARKER_RE, '');
  const marker = `<!--dp-meta:${JSON.stringify(merged)}-->`;
  return rest ? `${marker}\n${rest}` : marker;
}

/**
 * Thin fetch() wrapper for authenticated Google REST API calls: attaches the bearer token and
 * throws with the response body on a non-2xx status (no-silent-failures — a caller that awaits
 * this and doesn't catch will see exactly which endpoint/status failed).
 * @param {string} url
 * @param {string} accessToken
 * @param {RequestInit} [options]
 * @returns {Promise<any>} Parsed JSON response body.
 */
async function googleApiFetch(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google API request failed (${res.status} ${res.statusText}): ${url} ${body}`);
  }
  return res.json();
}

/**
 * Fetches a single day's Calendar events via the Calendar v3 REST API. Ported 1:1 from
 * gas-app/Code.gs#getDailyData's Calendar.Events.list branch (field selection, htmlLink,
 * gasTaskId extraction) — see that function's comments for why timeMin/timeMax is built from a
 * local-midnight Date before calling toISOString() rather than by string-slicing.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} accessToken
 * @returns {Promise<Array<object>>}
 */
export async function fetchDayCalendarEvents(dateStr, accessToken) {
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: targetDate.toISOString(),
    timeMax: nextDate.toISOString(),
    singleEvents: 'true',
    maxResults: '250',
    fields: 'items(id,summary,start,end,location,description,hangoutLink,htmlLink,extendedProperties)'
  });
  const data = await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, accessToken);
  return (data.items || []).map(evt => ({
    id: evt.id,
    title: evt.summary || '(untitled)',
    startTime: evt.start && (evt.start.dateTime || evt.start.date),
    endTime: evt.end && (evt.end.dateTime || evt.end.date),
    location: evt.location || '',
    description: evt.description || '',
    meetLink: evt.hangoutLink || null,
    htmlLink: evt.htmlLink || null,
    syncTaskId: (evt.extendedProperties && evt.extendedProperties.shared && evt.extendedProperties.shared.gasTaskId) || null
  }));
}

/**
 * Fetches a single day's Google Tasks via the Tasks v1 REST API. Ported 1:1 from
 * gas-app/Code.gs#getDailyData's Tasks.Tasks.list branch, including the +/-1-day query padding
 * and exact-date re-filter — the Tasks API stores `due` as UTC midnight, so querying a
 * script-timezone day window can silently return an adjacent day's tasks; padding the query and
 * then filtering on the task's own `due` date string sidesteps that instead of trying to convert
 * timezones exactly.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} accessToken
 * @returns {Promise<Array<object>>}
 */
export async function fetchDayTasks(dateStr, accessToken) {
  const dueMinUtc = new Date(`${dateStr}T00:00:00.000Z`);
  dueMinUtc.setUTCDate(dueMinUtc.getUTCDate() - 1);
  const dueMaxUtc = new Date(`${dateStr}T00:00:00.000Z`);
  dueMaxUtc.setUTCDate(dueMaxUtc.getUTCDate() + 2);

  const params = new URLSearchParams({
    dueMin: dueMinUtc.toISOString(),
    dueMax: dueMaxUtc.toISOString(),
    showCompleted: 'true',
    showHidden: 'true'
  });
  const data = await googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks?${params}`, accessToken);
  return (data.items || [])
    .filter(t => t.due && t.due.substring(0, 10) === dateStr)
    .map(t => {
      const meta = decodeTaskMeta(t.notes);
      return {
        id: t.id,
        title: t.title,
        status: deriveTaskStatus(t),
        dueDate: t.due.substring(0, 10),
        category: meta.category || 'General',
        sourceMasterId: meta.sourceMasterId || null
      };
    });
}

/**
 * Fetches a whole month's Calendar events via the Calendar v3 REST API, paginated, and buckets
 * them by day. Ported 1:1 from gas-app/Code.gs#getMonthData's Calendar.Events.list branch — see
 * that function's comments for why the range is anchored in UTC rather than local time.
 * @param {string} monthStr Target month in YYYY-MM format.
 * @param {string} accessToken
 * @returns {Promise<Object<string, Array<object>>>} Calendar events keyed by YYYY-MM-DD.
 */
export async function fetchMonthCalendarEvents(monthStr, accessToken) {
  const [year, month] = monthStr.split('-').map(Number);
  const monthStartUtc = new Date(Date.UTC(year, month - 1, 1));
  const monthEndUtc = new Date(Date.UTC(year, month, 1));
  const eventsByDate = {};
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      timeMin: monthStartUtc.toISOString(),
      timeMax: monthEndUtc.toISOString(),
      singleEvents: 'true',
      maxResults: '2500',
      fields: 'nextPageToken,items(id,summary,start,end,location,hangoutLink,extendedProperties)'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, accessToken);
    for (const evt of data.items || []) {
      const startIso = evt.start && (evt.start.dateTime || evt.start.date);
      if (!startIso) continue;
      const dateStr = startIso.substring(0, 10);
      if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
      eventsByDate[dateStr].push({
        id: evt.id,
        title: evt.summary || '(untitled)',
        startTime: startIso,
        endTime: evt.end && (evt.end.dateTime || evt.end.date),
        location: evt.location || '',
        meetLink: evt.hangoutLink || null,
        syncTaskId: (evt.extendedProperties && evt.extendedProperties.shared && evt.extendedProperties.shared.gasTaskId) || null
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return eventsByDate;
}

/**
 * Fetches a whole month's Google Tasks via the Tasks v1 REST API, paginated, and buckets them
 * by due date. Ported 1:1 from gas-app/Code.gs#getMonthData's Tasks.Tasks.list branch — see
 * fetchDayTasks above for why the query is padded a day past each UTC boundary.
 * @param {string} monthStr Target month in YYYY-MM format.
 * @param {string} accessToken
 * @returns {Promise<Object<string, Array<object>>>} Tasks keyed by YYYY-MM-DD.
 */
export async function fetchMonthTasks(monthStr, accessToken) {
  const [year, month] = monthStr.split('-').map(Number);
  const monthStartUtc = new Date(Date.UTC(year, month - 1, 1));
  const monthEndUtc = new Date(Date.UTC(year, month, 1));
  const dueMin = new Date(monthStartUtc.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const dueMax = new Date(monthEndUtc.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const tasksByDate = {};
  let pageToken = null;
  do {
    const params = new URLSearchParams({ dueMin, dueMax, showCompleted: 'true', showHidden: 'true', maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks?${params}`, accessToken);
    for (const t of data.items || []) {
      if (!t.due) continue;
      const dateStr = t.due.substring(0, 10);
      if (!tasksByDate[dateStr]) tasksByDate[dateStr] = [];
      tasksByDate[dateStr].push({ id: t.id, title: t.title, status: deriveTaskStatus(t), dueDate: dateStr });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return tasksByDate;
}

/**
 * Finds or creates the "Day Planner" Drive folder via the Drive v3 REST API, caching its id in
 * localStorage — the PropertiesService replacement described in the GAS-removal migration plan.
 * Ported from gas-app/Code.gs#getValidatedRootFolder/createDayPlannerDriveFolder, minus the
 * LockService-guarded search-then-create race protection (see the ROOT_FOLDER_STORAGE_KEY
 * comment above for why that's an intentionally accepted trade-off here).
 * @param {string} accessToken
 * @returns {Promise<string>} Drive folder id.
 */
export async function getOrCreateRootFolderId(accessToken) {
  if (typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(ROOT_FOLDER_STORAGE_KEY);
    if (cached) return cached;
  }

  const searchParams = new URLSearchParams({
    q: "mimeType = 'application/vnd.google-apps.folder' and name = 'Day Planner' and trashed = false",
    fields: 'files(id,name)'
  });
  const searchResult = await googleApiFetch(`${DRIVE_API_BASE}/files?${searchParams}`, accessToken);

  let folderId;
  if (searchResult.files && searchResult.files.length > 0) {
    folderId = searchResult.files[0].id;
  } else {
    const created = await googleApiFetch(`${DRIVE_API_BASE}/files`, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Day Planner', mimeType: 'application/vnd.google-apps.folder' })
    });
    folderId = created.id;
  }

  if (typeof localStorage !== 'undefined') localStorage.setItem(ROOT_FOLDER_STORAGE_KEY, folderId);
  return folderId;
}

/**
 * Looks up a single file by exact name inside a Drive folder.
 * @param {string} fileName
 * @param {string} folderId
 * @param {string} accessToken
 * @returns {Promise<{id: string, name: string}|null>}
 */
async function findDriveFileInFolder(fileName, folderId, accessToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id,name)'
  });
  const data = await googleApiFetch(`${DRIVE_API_BASE}/files?${params}`, accessToken);
  return (data.files && data.files[0]) || null;
}

/**
 * Downloads a Drive file's content as text. Neither drive.file nor drive.readonly expose a
 * dedicated "download" client method the way Apps Script's Advanced Drive Service needed a
 * UrlFetchApp workaround for — a plain authenticated GET against the alt=media endpoint is the
 * REST-native equivalent, same URL gas-app/Code.gs#readDriveFileContent's workaround already used.
 * @param {string} fileId
 * @param {string} accessToken
 * @returns {Promise<string>}
 */
async function downloadDriveFileText(fileId, accessToken) {
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive file download failed (${res.status} ${res.statusText}): ${fileId} ${body}`);
  }
  return res.text();
}

/**
 * Reads the month-partitioned daily-notes JSON file (Day Planner/notes-YYYY-MM.json) from
 * Drive. Ported from gas-app/Code.gs#getMonthlyNotesData, minus its CacheService 5-minute
 * cache (see the futureMatrix/JS-Map-cache trade-off note in the GAS-removal migration plan —
 * not yet added here since Stage 2 is the first read path to need it; add a shared in-memory
 * cache if repeated calls prove costly in practice, not preemptively).
 * @param {string} monthStr Target month in YYYY-MM format.
 * @param {string} accessToken
 * @returns {Promise<{month: string, days: Object<string, {raw: string, updatedAt: string}>}>}
 */
export async function fetchMonthlyNotesData(monthStr, accessToken) {
  const monthData = { month: monthStr, days: {} };
  const folderId = await getOrCreateRootFolderId(accessToken);
  const file = await findDriveFileInFolder(`notes-${monthStr}.json`, folderId, accessToken);
  if (!file) return monthData;

  const content = await downloadDriveFileText(file.id, accessToken);
  if (!content || !content.trim()) return monthData;
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error(`fetchMonthlyNotesData: JSON parse failed for notes-${monthStr}.json`, err);
    return monthData;
  }
}

/**
 * Fetches master tasks — undated Google Tasks in the '@default' list — via the Tasks v1 REST
 * API. Ported 1:1 from gas-app/Code.gs#getMasterTasks; see that function's comments for why an
 * undated task is by definition a master task and externally-created ones still show up here.
 * @param {string} accessToken
 * @returns {Promise<Array<object>>}
 */
export async function fetchMasterTasks(accessToken) {
  const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' });
  const data = await googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks?${params}`, accessToken);
  return (data.items || [])
    .filter(t => !t.due)
    .map(t => {
      const meta = decodeTaskMeta(t.notes);
      return {
        id: t.id,
        title: t.title,
        category: meta.category || 'General',
        status: deriveTaskStatus(t),
        movedTo: meta.movedTo || null,
        movedTaskId: meta.movedTaskId || null
      };
    });
}

/**
 * Reads the Future Planning Matrix JSON file (Day Planner/future-matrix-YYYY.json) from Drive,
 * falling back to an empty 12-month skeleton when the file doesn't exist yet. Ported from
 * gas-app/Code.gs#getFutureMatrixData_, minus its CacheService cache (see fetchMonthlyNotesData's
 * matching note above).
 * @param {number|string} year Target calendar year.
 * @param {string} accessToken
 * @returns {Promise<{year: string, months: Object<string, Array<object>>}>}
 */
export async function fetchFutureMatrix(year, accessToken) {
  const yearStr = String(year);
  const matrixData = { year: yearStr, months: {} };
  for (let m = 1; m <= 12; m++) matrixData.months[`${yearStr}-${String(m).padStart(2, '0')}`] = [];

  const folderId = await getOrCreateRootFolderId(accessToken);
  const file = await findDriveFileInFolder(`future-matrix-${yearStr}.json`, folderId, accessToken);
  if (!file) return matrixData;

  const content = await downloadDriveFileText(file.id, accessToken);
  if (content && content.trim()) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.months) Object.assign(matrixData.months, parsed.months);
    } catch (err) {
      console.error(`fetchFutureMatrix: JSON parse failed for future-matrix-${yearStr}.json`, err);
    }
  }
  return matrixData;
}

/**
 * Fetches attendee emails from Calendar events in a lookback/lookahead window via the Calendar
 * v3 REST API. Ported from gas-app/Code.gs#getRecentAttendees's CalendarApp-based version, using
 * the Advanced Calendar Service's REST shape (attendees array) instead of getGuestList().
 * @param {number} lookbackDays
 * @param {number} lookaheadDays
 * @param {string} accessToken
 * @returns {Promise<Array<string>>} Unique sorted list of attendee email addresses.
 */
export async function fetchRecentAttendees(lookbackDays, lookaheadDays, accessToken) {
  const pastDays = (typeof lookbackDays === 'number' && lookbackDays > 0) ? lookbackDays : 60;
  const futureDays = (typeof lookaheadDays === 'number' && lookaheadDays > 0) ? lookaheadDays : 15;
  const now = new Date();
  const timeMin = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000).toISOString();

  const attendeeSet = new Set();
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      maxResults: '2500',
      fields: 'nextPageToken,items(attendees(email))'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, accessToken);
    for (const evt of data.items || []) {
      for (const attendee of evt.attendees || []) {
        if (attendee.email && attendee.email.includes('@')) attendeeSet.add(attendee.email.toLowerCase());
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return Array.from(attendeeSet).sort();
}

/**
 * Resolves the display title of a pasted Google Docs/Sheets/Slides/Forms/Drive URL via the
 * Drive v3 REST API, for the Notes "smart paste" hyperlink feature. Ported 1:1 from
 * gas-app/Code.gs#resolveDriveFileTitle — this is the one REST call in this file that
 * deliberately reads a file the app did NOT create, hence needing drive.readonly (see
 * src/googleAuth.js's scope comment).
 * @param {string} url A pasted Google Docs/Sheets/Slides/Forms/Drive URL.
 * @param {string} accessToken
 * @returns {Promise<{success: boolean, title?: string, fileId?: string, error?: string}>}
 */
export async function resolveLinkTitleRest(url, accessToken) {
  if (!url || typeof url !== 'string') {
    return { success: false, error: 'No URL provided.' };
  }
  const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!idMatch) {
    return { success: false, error: 'Not a recognized Google Docs/Sheets/Slides/Forms/Drive URL.' };
  }
  const fileId = idMatch[1];
  try {
    const params = new URLSearchParams({ fields: 'id,name,trashed' });
    const meta = await googleApiFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params}`, accessToken);
    if (meta.trashed) return { success: false, error: 'File is trashed.' };
    return { success: true, title: meta.name, fileId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Creates a new Google Task via the Tasks v1 REST API.
 * @param {object} taskResource Task resource body (title, notes, due, etc.).
 * @param {string} accessToken
 * @returns {Promise<object>} The created Task resource.
 */
async function insertTask(taskResource, accessToken) {
  return googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskResource)
  });
}

/**
 * Patches an existing Google Task via the Tasks v1 REST API.
 * @param {string} taskId
 * @param {object} patch Partial Task resource fields to update.
 * @param {string} accessToken
 * @returns {Promise<object>} The updated Task resource.
 */
async function patchTask(taskId, patch, accessToken) {
  return googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks/${encodeURIComponent(taskId)}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
}

/**
 * Fetches a single Google Task by id via the Tasks v1 REST API.
 * @param {string} taskId
 * @param {string} accessToken
 * @returns {Promise<object>} The Task resource.
 */
async function getTaskById(taskId, accessToken) {
  return googleApiFetch(`${TASKS_API_BASE}/lists/@default/tasks/${encodeURIComponent(taskId)}`, accessToken);
}

/**
 * Creates a new master task — an undated Google Task flagged via the hidden metadata marker.
 * Ported 1:1 from gas-app/Code.gs#addMasterTask.
 * @param {string} title
 * @param {string} category
 * @param {string} accessToken
 * @returns {Promise<object>} Created master task object.
 */
export async function addMasterTaskRest(title, category, accessToken) {
  const created = await insertTask({
    title,
    notes: encodeTaskMeta('', { master: true, category: category || 'General' })
  }, accessToken);
  return {
    id: created.id,
    title: created.title,
    category: category || 'General',
    status: deriveTaskStatus(created),
    movedTo: null,
    movedTaskId: null
  };
}

/**
 * Records that a master task was moved (transferred) to a specific daily task list. Ported 1:1
 * from gas-app/Code.gs#markMasterTaskMoved.
 * @param {string} masterTaskId
 * @param {string} targetDateStr
 * @param {string} movedTaskId
 * @param {string} accessToken
 * @returns {Promise<object>} Updated master task object.
 */
export async function markMasterTaskMovedRest(masterTaskId, targetDateStr, movedTaskId, accessToken) {
  const current = await getTaskById(masterTaskId, accessToken);
  const notes = encodeTaskMeta(current.notes, { movedTo: targetDateStr, movedTaskId });
  const updated = await patchTask(masterTaskId, { notes }, accessToken);
  const meta = decodeTaskMeta(updated.notes);
  return {
    id: updated.id,
    title: updated.title,
    category: meta.category || 'General',
    status: deriveTaskStatus(updated),
    movedTo: meta.movedTo || null,
    movedTaskId: meta.movedTaskId || null
  };
}

/**
 * Creates and appends a new daily task item for the specified date. Ported 1:1 from
 * gas-app/Code.gs#addDailyTask.
 * @param {string} dateStr
 * @param {string} title
 * @param {string} category
 * @param {string} [sourceMasterId]
 * @param {string} accessToken
 * @returns {Promise<object>} Created task object.
 */
export async function addDailyTaskRest(dateStr, title, category, sourceMasterId, accessToken) {
  const metaPatch = { category: category || 'General' };
  if (sourceMasterId) metaPatch.sourceMasterId = sourceMasterId;
  const created = await insertTask({
    title,
    due: `${dateStr}T00:00:00.000Z`,
    notes: encodeTaskMeta('', metaPatch)
  }, accessToken);
  return {
    id: created.id,
    title: created.title,
    status: deriveTaskStatus(created),
    category: category || 'General',
    dueDate: created.due ? created.due.substring(0, 10) : dateStr,
    sourceMasterId: sourceMasterId || null
  };
}

/**
 * Updates an existing Google Task's title/status/category/due date, mirroring a status change
 * onto its source master task best-effort. Ported 1:1 from gas-app/Code.gs#updateDailyTask,
 * including its 404-as-null handling (a task deleted elsewhere shouldn't surface as a hard error)
 * and the best-effort master-task sync (logged loudly on failure per no-silent-failures.md,
 * never allowed to fail the daily task update that already succeeded).
 * @param {string} dateStr
 * @param {string} taskId
 * @param {object} updates {title, status, category, dueDate}
 * @param {string} accessToken
 * @returns {Promise<object|null>} Updated task object, or null if the task no longer exists.
 */
export async function updateDailyTaskRest(dateStr, taskId, updates = {}, accessToken) {
  try {
    const patch = {};
    let current = null;
    async function ensureCurrent() {
      if (!current) current = await getTaskById(taskId, accessToken);
      return current;
    }

    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.status !== undefined) {
      patch.status = (updates.status === '✓' || updates.status === 'D/✓') ? 'completed' : 'needsAction';
      patch.notes = encodeTaskStatusNotes(updates.status, (await ensureCurrent()).notes);
    }
    if (updates.category !== undefined) {
      const notesBase = patch.notes !== undefined ? patch.notes : (await ensureCurrent()).notes;
      patch.notes = encodeTaskMeta(notesBase, { category: updates.category });
    }
    if (updates.dueDate !== undefined) patch.due = `${updates.dueDate}T00:00:00.000Z`;

    const updated = await patchTask(taskId, patch, accessToken);

    if (current && updates.status !== undefined) {
      const meta = decodeTaskMeta(current.notes);
      if (meta.sourceMasterId) {
        try {
          const masterCurrent = await getTaskById(meta.sourceMasterId, accessToken);
          await patchTask(meta.sourceMasterId, {
            status: patch.status,
            notes: encodeTaskStatusNotes(updates.status, masterCurrent.notes)
          }, accessToken);
        } catch (syncErr) {
          console.error(`updateDailyTaskRest->masterSync(${meta.sourceMasterId})`, syncErr);
        }
      }
    }

    return {
      id: updated.id,
      title: updated.title,
      status: deriveTaskStatus(updated),
      category: decodeTaskMeta(updated.notes).category || 'General',
      dueDate: updated.due ? updated.due.substring(0, 10) : (updates.dueDate || dateStr)
    };
  } catch (err) {
    if (err.message && err.message.includes('404')) return null;
    throw err;
  }
}

/**
 * Forwards a daily task to a new date, composed from addDailyTaskRest + updateDailyTaskRest.
 * Ported 1:1 from gas-app/Code.gs#forwardDailyTask.
 * @param {string} dateStr
 * @param {string} taskId
 * @param {{title: string, category?: string}} sourceTaskSnapshot
 * @param {string} targetDateStr
 * @param {string} accessToken
 * @returns {Promise<{originalTask: object, forwardedTask: object}>}
 */
export async function forwardDailyTaskRest(dateStr, taskId, sourceTaskSnapshot, targetDateStr, accessToken) {
  const match = (sourceTaskSnapshot.title || '').match(/^\[([A-C])[1-9]\]\s*(.*)$/i);
  const priorityGroup = match ? match[1].toUpperCase() : 'A';
  const cleanTitle = match ? match[2].trim() : (sourceTaskSnapshot.title || 'Untitled Task').trim();
  const formattedTitle = `[${priorityGroup}1] ${cleanTitle}`;

  const forwardedTask = await addDailyTaskRest(targetDateStr, formattedTitle, sourceTaskSnapshot.category, undefined, accessToken);
  const originalTask = await updateDailyTaskRest(dateStr, taskId, { title: sourceTaskSnapshot.title, status: '→', dueDate: dateStr }, accessToken);

  return { originalTask, forwardedTask };
}

/**
 * Updates an existing calendar event's title/timing via the Calendar v3 REST API. Ported from
 * gas-app/Code.gs#updateCalendarEvent's Advanced-Calendar-Service branch — timeZone is required
 * on start/end the same way Session.getScriptTimeZone() supplied it server-side; the browser's
 * equivalent is Intl.DateTimeFormat().resolvedOptions().timeZone.
 * @param {string} eventId
 * @param {object} updates {title, startTime, endTime, location, description}
 * @param {string} accessToken
 * @returns {Promise<object|null>} Updated event payload, or null if the event no longer exists.
 */
export async function updateCalendarEventRest(eventId, updates = {}, accessToken) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const patch = {};
  if (updates.title !== undefined) patch.summary = updates.title;
  if (updates.location !== undefined) patch.location = updates.location;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.startTime !== undefined) patch.start = { dateTime: updates.startTime, timeZone };
  if (updates.endTime !== undefined) patch.end = { dateTime: updates.endTime, timeZone };

  try {
    const updated = await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    return {
      id: updated.id,
      title: updated.summary,
      startTime: updated.start && (updated.start.dateTime || updated.start.date),
      endTime: updated.end && (updated.end.dateTime || updated.end.date),
      location: updated.location || '',
      description: updated.description || ''
    };
  } catch (err) {
    if (err.message && err.message.includes('404')) return null;
    throw err;
  }
}

/**
 * Moves an existing Drive file into a target folder, replacing whatever parent(s) it currently
 * has. Needed because the Docs API's `documents.create` always drops a new doc into the user's
 * Drive root — there's no "create directly inside this folder" option the way
 * `DriveApp.Folder#createFile`/`doc.moveTo()` gave gas-app/Code.gs#addCalendarEvent.
 * @param {string} fileId
 * @param {string} folderId
 * @param {string} accessToken
 * @returns {Promise<void>}
 */
async function moveDriveFileToFolder(fileId, folderId, accessToken) {
  const meta = await googleApiFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=parents`, accessToken);
  const params = new URLSearchParams({ addParents: folderId, fields: 'id,parents' });
  const previousParents = (meta.parents || []).join(',');
  if (previousParents) params.set('removeParents', previousParents);
  await googleApiFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params}`, accessToken, { method: 'PATCH' });
}

/**
 * Creates the structured meeting-agenda Google Doc (objectives/discussion/action-items sections)
 * via the Docs v3 REST API and files it into the Day Planner Drive folder. Ported from
 * gas-app/Code.gs#addCalendarEvent's `autoAgendaDoc` branch (DocumentApp create + appendParagraph
 * + DriveApp move) — REST has no single call for "create with initial content", so this is a
 * create, then a batchUpdate to insert the body text, then a Drive move, run in sequence.
 * @param {string} title Event title.
 * @param {string} dateStr Event date in YYYY-MM-DD format.
 * @param {string} startIso Event start time (used for the doc's date/time header line).
 * @param {Array<string>} attendeesList
 * @param {string|null} meetLink
 * @param {string} accessToken
 * @returns {Promise<string>} The created doc's edit URL.
 */
async function createAgendaDoc(title, dateStr, startIso, attendeesList, meetLink, accessToken) {
  const docName = `Agenda: ${title} (${dateStr})`;
  const created = await googleApiFetch(`${DOCS_API_BASE}/documents`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: docName })
  });
  const documentId = created.documentId;

  const lines = [title, `📅 Date & Time: ${dateStr} ${startIso}`];
  if (attendeesList.length > 0) lines.push(`👥 Attendees: ${attendeesList.join(', ')}`);
  if (meetLink) lines.push(`📹 Google Meet: ${meetLink}`);
  lines.push('', '🎯 Objectives & Goals', '• ', '', '📋 Discussion Topics', '• ', '', '✅ Action Items & Next Steps', '• ');
  const contentText = `${lines.join('\n')}\n`;

  await googleApiFetch(`${DOCS_API_BASE}/documents/${documentId}:batchUpdate`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: contentText } }] })
  });

  const folderId = await getOrCreateRootFolderId(accessToken);
  await moveDriveFileToFolder(documentId, folderId, accessToken);

  return `https://docs.google.com/document/d/${documentId}/edit`;
}

/**
 * Creates a new calendar event via the Calendar v3 REST API, with a real Google Meet conference
 * and an auto-generated agenda Doc — the one method in this file that is an intentional
 * multi-call orchestration rather than a mechanical endpoint swap (see the GAS-removal migration
 * plan's Stage 4 section). Ported from gas-app/Code.gs#addCalendarEvent, split into REST's
 * necessarily separate steps: Calendar insert (with conferenceData) -> Docs create -> Docs
 * batchUpdate -> Drive move -> Calendar patch (to fold the agenda doc link into the description
 * once the doc exists). Each step after the initial event insert can fail independently; per
 * .agents/rules/no-silent-failures.md, a failure there is surfaced via `agendaDocError` and a
 * loud console.error rather than silently downgrading to a fake placeholder URL or losing the
 * event that was already created.
 * @param {string} dateStr Target date in YYYY-MM-DD format.
 * @param {object} eventData Calendar event payload (see addCalendarEvent's JSDoc for shape).
 * @param {string} accessToken
 * @returns {Promise<object>} Created calendar event, with `agendaDocError` set if the agenda-doc
 *   chain failed after the event itself was created successfully.
 */
export async function addCalendarEventRest(dateStr, eventData = {}, accessToken) {
  const title = (eventData.title || 'New Appointment').trim();
  const startIso = eventData.startTime || `${dateStr}T09:00:00`;
  const endIso = eventData.endTime || `${dateStr}T09:30:00`;
  const location = eventData.location || '';
  const description = eventData.description || '';
  const attendeesList = Array.isArray(eventData.attendees)
    ? eventData.attendees
    : (typeof eventData.attendees === 'string'
        ? eventData.attendees.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
        : []);
  const autoGoogleMeet = eventData.autoGoogleMeet !== undefined ? eventData.autoGoogleMeet : true;
  const guestsCanModify = eventData.guestsCanModify !== undefined ? eventData.guestsCanModify : true;
  const autoAgendaDoc = eventData.autoAgendaDoc !== undefined ? eventData.autoAgendaDoc : true;
  const gasTaskId = eventData.gasTaskId || eventData.syncTaskId || null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const eventResource = {
    summary: title,
    location,
    description,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
    guestsCanModify: !!guestsCanModify
  };
  if (attendeesList.length > 0) {
    eventResource.attendees = attendeesList.map(email => ({ email }));
  }
  if (gasTaskId) {
    // Written to both maps like gas-app/Code.gs's equivalent: `shared` is what a later
    // fetchDayCalendarEvents/fetchMonthCalendarEvents read back as syncTaskId.
    eventResource.extendedProperties = { private: { gasTaskId }, shared: { gasTaskId } };
  }

  const insertParams = new URLSearchParams({ sendUpdates: attendeesList.length > 0 ? 'all' : 'none' });
  if (autoGoogleMeet) {
    eventResource.conferenceData = {
      createRequest: {
        requestId: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
    insertParams.set('conferenceDataVersion', '1');
  }

  const createdEvent = await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events?${insertParams}`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventResource)
  });

  const meetLink = createdEvent.hangoutLink ||
    (createdEvent.conferenceData && createdEvent.conferenceData.entryPoints && createdEvent.conferenceData.entryPoints.length > 0
      ? createdEvent.conferenceData.entryPoints[0].uri
      : null);

  let agendaDocUrl = null;
  let agendaDocError = null;
  if (autoAgendaDoc) {
    try {
      agendaDocUrl = await createAgendaDoc(title, dateStr, startIso, attendeesList, meetLink, accessToken);
    } catch (err) {
      console.error('addCalendarEventRest: agenda doc creation failed — event was still created', err);
      agendaDocError = err.message;
    }
  }

  let fullDescription = description;
  if (agendaDocUrl && !fullDescription.includes(agendaDocUrl)) {
    fullDescription += (fullDescription ? '\n\n' : '') + `📄 Meeting Agenda & Notes Doc: ${agendaDocUrl}`;
  }

  if (fullDescription !== description) {
    try {
      await googleApiFetch(`${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(createdEvent.id)}`, accessToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: fullDescription })
      });
    } catch (err) {
      console.error('addCalendarEventRest: description patch (agenda doc link) failed', err);
      fullDescription = description;
    }
  }

  return {
    id: createdEvent.id,
    title,
    startTime: startIso,
    endTime: endIso,
    location,
    description: fullDescription,
    meetLink,
    agendaDocUrl,
    ...(agendaDocError ? { agendaDocError } : {}),
    attendees: attendeesList,
    guestsCanModify: !!guestsCanModify,
    syncTaskId: gasTaskId
  };
}

/**
 * Overwrites an existing Drive file's content (simple/media upload). Used for updating a monthly
 * notes/future-matrix JSON file that already exists.
 * @param {string} fileId
 * @param {string} content
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
async function updateDriveFileContent(fileId, content, accessToken) {
  const res = await fetch(`${DRIVE_UPLOAD_API_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: content
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive file update failed (${res.status} ${res.statusText}): ${fileId} ${body}`);
  }
  return res.json();
}

/**
 * Creates a new Drive file with metadata + content in one request (multipart upload) — the REST
 * equivalent of DriveApp.Folder#createFile, which sets name/parent/content together.
 * @param {string} fileName
 * @param {string} folderId
 * @param {string} content
 * @param {string} accessToken
 * @returns {Promise<{id: string}>}
 */
async function createDriveFileWithContent(fileName, folderId, content, accessToken) {
  const boundary = `dayplanner_${Math.random().toString(36).slice(2)}`;
  const metadata = { name: fileName, parents: [folderId], mimeType: 'text/plain' };
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Drive file create failed (${res.status} ${res.statusText}): ${fileName} ${errBody}`);
  }
  return res.json();
}

/**
 * Read-modify-write of the month-partitioned daily-notes JSON file. Ported 1:1 from
 * gas-app/Code.gs#saveDailyDocCards, including its fail-loud-on-invalid-JSON behavior — see that
 * function's comment for why a parse failure must reject the save rather than silently
 * overwriting every other day's notes already saved this month (.agents/rules/no-silent-failures.md).
 * @param {string} dateStr
 * @param {string} noteContent
 * @param {string} accessToken
 * @returns {Promise<{success: boolean, fileName: string, fileId: string}>}
 */
export async function saveDailyDocCardsRest(dateStr, noteContent, accessToken) {
  const monthStr = (dateStr || '').substring(0, 7);
  const fileName = `notes-${monthStr}.json`;
  const folderId = await getOrCreateRootFolderId(accessToken);
  const file = await findDriveFileInFolder(fileName, folderId, accessToken);

  let monthData = { month: monthStr, days: {} };
  if (file) {
    const content = await downloadDriveFileText(file.id, accessToken);
    if (content && content.trim()) {
      try {
        monthData = JSON.parse(content);
      } catch (e) {
        throw new Error(`Existing ${fileName} contains invalid JSON and cannot be safely overwritten without losing other days' notes: ${e.message}`, { cause: e });
      }
    }
  }

  if (!monthData.days) monthData.days = {};
  monthData.days[dateStr] = { raw: noteContent || '', updatedAt: new Date().toISOString() };
  const serialized = JSON.stringify(monthData, null, 2);

  let fileId;
  if (file) {
    await updateDriveFileContent(file.id, serialized, accessToken);
    fileId = file.id;
  } else {
    const created = await createDriveFileWithContent(fileName, folderId, serialized, accessToken);
    fileId = created.id;
  }

  return { success: true, fileName, fileId };
}

/**
 * Writes the Future Planning Matrix JSON file for a given year back to Drive. Ported from
 * gas-app/Code.gs#saveFutureMatrixData_, minus its CacheService refresh (no client-side cache
 * exists for this file yet — see fetchFutureMatrix's matching note).
 * @param {number|string} year
 * @param {object} matrixData
 * @param {string} accessToken
 * @returns {Promise<void>}
 */
async function saveFutureMatrixRest(year, matrixData, accessToken) {
  const yearStr = String(year);
  const fileName = `future-matrix-${yearStr}.json`;
  const folderId = await getOrCreateRootFolderId(accessToken);
  const file = await findDriveFileInFolder(fileName, folderId, accessToken);
  const serialized = JSON.stringify(matrixData, null, 2);
  if (file) {
    await updateDriveFileContent(file.id, serialized, accessToken);
  } else {
    await createDriveFileWithContent(fileName, folderId, serialized, accessToken);
  }
}

/**
 * Adds a new future planning item to a month's bucket and persists the year file. Ported 1:1
 * from gas-app/Code.gs#addFutureItem.
 * @param {number|string} year
 * @param {string} monthKey
 * @param {string} title
 * @param {string} category
 * @param {string} accessToken
 * @returns {Promise<object>} Created future item.
 */
export async function addFutureItemRest(year, monthKey, title, category, accessToken) {
  const matrixData = await fetchFutureMatrix(year, accessToken);
  if (!matrixData.months[monthKey]) matrixData.months[monthKey] = [];
  const newItem = createFutureItem(title, category);
  matrixData.months[monthKey].push(newItem);
  await saveFutureMatrixRest(year, matrixData, accessToken);
  return newItem;
}

/**
 * Cycles a future item's Franklin-style status marker and persists the year file. Ported 1:1
 * from gas-app/Code.gs#updateFutureItemStatus.
 * @param {number|string} year
 * @param {string} monthKey
 * @param {string} itemId
 * @param {string} status
 * @param {string} accessToken
 * @returns {Promise<object|null>} Updated future item, or null if not found.
 */
export async function updateFutureItemStatusRest(year, monthKey, itemId, status, accessToken) {
  const matrixData = await fetchFutureMatrix(year, accessToken);
  const items = matrixData.months[monthKey] || [];
  const item = items.find(i => i.id === itemId);
  if (!item) return null;
  item.status = status;
  await saveFutureMatrixRest(year, matrixData, accessToken);
  return item;
}

/**
 * Transfers a future planning item onto a specific day's task list, removing it from its month
 * bucket. Ported 1:1 from gas-app/Code.gs#transferFutureItem.
 * @param {number|string} year
 * @param {string} monthKey
 * @param {string} itemId
 * @param {string} dateStr
 * @param {string} priorityGroup
 * @param {string} accessToken
 * @returns {Promise<object|null>} Created daily task object, or null if item not found.
 */
export async function transferFutureItemRest(year, monthKey, itemId, dateStr, priorityGroup, accessToken) {
  const matrixData = await fetchFutureMatrix(year, accessToken);
  const items = matrixData.months[monthKey] || [];
  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return null;
  const [item] = items.splice(idx, 1);
  await saveFutureMatrixRest(year, matrixData, accessToken);

  const formattedTitle = `[${(priorityGroup || 'A').toUpperCase()}1] ${item.title}`;
  return addDailyTaskRest(dateStr, formattedTitle, item.category, undefined, accessToken);
}

/**
 * Carries a still-open future item forward into next month's bucket, rolling into next calendar
 * year's matrix file when pushed from December. Ported 1:1 from
 * gas-app/Code.gs#pushFutureItemToNextMonth.
 * @param {number|string} year
 * @param {string} monthKey
 * @param {string} itemId
 * @param {string} accessToken
 * @returns {Promise<object|null>} The carried-forward item, or null if not found.
 */
export async function pushFutureItemToNextMonthRest(year, monthKey, itemId, accessToken) {
  const matrixData = await fetchFutureMatrix(year, accessToken);
  const items = matrixData.months[monthKey] || [];
  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return null;
  const [item] = items.splice(idx, 1);

  const nextKey = nextMonthKey(monthKey);
  const nextYear = nextKey.slice(0, 4);

  if (nextYear === String(year)) {
    if (!matrixData.months[nextKey]) matrixData.months[nextKey] = [];
    matrixData.months[nextKey].push(item);
    await saveFutureMatrixRest(year, matrixData, accessToken);
  } else {
    await saveFutureMatrixRest(year, matrixData, accessToken);
    const nextYearData = await fetchFutureMatrix(nextYear, accessToken);
    if (!nextYearData.months[nextKey]) nextYearData.months[nextKey] = [];
    nextYearData.months[nextKey].push(item);
    await saveFutureMatrixRest(nextYear, nextYearData, accessToken);
  }
  return item;
}

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
    // Test-only override; production offline detection uses navigator.onLine.
    this._forceOffline = false;

    // Seed mock data for local dev server & unit tests. The '2026-08-15' bucket is also the
    // fallback every other date resolves to (see getDailyData/getMonthData below), which makes
    // it the actual first-run content a visitor sees before ever signing in — so every collection
    // here is a single, clearly-labeled placeholder rather than fabricated business content
    // someone could mistake for their own synced data.
    this.mockData = {
      dailyTasks: {
        '2026-08-15': [
          tagMock({ id: 't1', title: 'Try the Day Planner app', status: '✓', category: 'Personal', dueDate: '2026-08-15' })
        ]
      },
      masterTasks: [
        tagMock({ id: 'm1', title: 'Example: a long-term to-do that doesn’t belong on one specific day', category: 'Personal', status: '•' })
      ],
      futureMatrix: {
        2026: (() => {
          const matrix = mockYearMatrix(2026);
          matrix.months['2026-10'].push(tagMock(createFutureItem('Example: something planned for a future month', 'Personal')));
          return matrix;
        })()
      },
      calendarEvents: {},
      dailyNotes: {
        '2026-08-15': `### 👋 Sample data
[[color:red]]**This is sample data.**[[/color]] Tap the sync button (🔄) above to connect your real tasks, appointments, and notes.

### 🚀 Get started
1. **Explore today's view** — tasks, appointments, and notes all live on one page.
2. *Tap sync* (🔄) to pull in your real Google Tasks, Calendar, and Drive.
3. [[color:teal]]**Install the app**[[/color]] from the banner below for one-tap access anytime.
4. Want the full walkthrough? See the **About** page.`
      },
      indexEntries: []
    };
  }

  /**
   * Whether the client currently has network connectivity. Falls back to "online"
   * when `navigator` isn't available (Node/test environments).
   * @returns {boolean}
   */
  isOnline() {
    if (this._forceOffline) return false;
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
    return navigator.onLine;
  }

  /**
   * Replays queued offline mutations (in FIFO order) against the live backend once
   * connectivity is restored, dequeuing each on success and stopping at the first failure
   * so ordering/dependencies (e.g. an edit queued after its own offline create) are preserved
   * for retry on the next flush.
   * @param {(mutation: object, result: any, tempIdMap: Object<string,string>) => void} [onResolved]
   *   Called after each mutation successfully replays, so the caller can reconcile any
   *   client-generated temp id against the real server-assigned id.
   * @returns {Promise<{flushed: number, remaining: number, failed: number}>}
   */
  async flushOutbox(onResolved) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      return { flushed: 0, remaining: 0, failed: 0 };
    }
    if (!this.isOnline()) {
      const pending = await IndexedDbStore.idbGetOutbox();
      return { flushed: 0, remaining: pending.length, failed: 0 };
    }

    const outbox = (await IndexedDbStore.idbGetOutbox()).sort((a, b) => a.id - b.id);
    const tempIdMap = {};
    const resolveId = (id) => tempIdMap[id] || id;

    let flushed = 0;
    let failed = 0;

    for (const mutation of outbox) {
      try {
        let result;
        switch (mutation.type) {
          case OUTBOX_MUTATION_TYPES.ADD_DAILY_TASK: {
            const { dateStr, title, category, tempId } = mutation.payload;
            result = await addDailyTaskRest(dateStr, title, category, undefined, accessToken);
            if (result && result.id && tempId) tempIdMap[tempId] = result.id;
            break;
          }
          case OUTBOX_MUTATION_TYPES.UPDATE_DAILY_TASK: {
            const { dateStr, taskId, updates } = mutation.payload;
            result = await updateDailyTaskRest(dateStr, resolveId(taskId), updates, accessToken);
            break;
          }
          case OUTBOX_MUTATION_TYPES.ADD_CALENDAR_EVENT: {
            const { dateStr, eventData, tempId } = mutation.payload;
            result = await addCalendarEventRest(dateStr, eventData, accessToken);
            if (result && result.id && tempId) tempIdMap[tempId] = result.id;
            break;
          }
          case OUTBOX_MUTATION_TYPES.UPDATE_CALENDAR_EVENT: {
            const { eventId, updates } = mutation.payload;
            result = await updateCalendarEventRest(resolveId(eventId), updates, accessToken);
            break;
          }
          case OUTBOX_MUTATION_TYPES.SAVE_DAILY_NOTE: {
            const { dateStr, noteContent } = mutation.payload;
            result = await saveDailyDocCardsRest(dateStr, noteContent, accessToken);
            break;
          }
          default:
            result = null;
        }

        await IndexedDbStore.idbDequeueMutation(mutation.id);
        flushed++;
        if (typeof onResolved === 'function') onResolved(mutation, result, tempIdMap);
      } catch (err) {
        console.error('🔥 flushOutbox: mutation failed, stopping to preserve order', mutation, err);
        failed++;
        break;
      }
    }

    const remainingOutbox = await IndexedDbStore.idbGetOutbox();
    return { flushed, remaining: remainingOutbox.length, failed };
  }

  /**
   * The in-memory mock fallback for getDailyData(), used when no real backend (REST token) is
   * reachable — kept as its own method so getDailyData()'s branching stays readable.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {{date: string, tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}}
   */
  _mockDailyData(dateStr) {
    const seedTasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
    const seedEvents = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];
    const seedNote = this.mockData.dailyNotes[dateStr] || this.mockData.dailyNotes['2026-08-15'] || `No notes recorded for ${dateStr}.`;

    const adjustedTasks = seedTasks.map(t => ({ ...t, dueDate: dateStr }));
    const adjustedEvents = seedEvents.map(e => ({
      ...e,
      startTime: e.startTime ? e.startTime.replace(/^\d{4}-\d{2}-\d{2}/, dateStr).replace(/Z$/, '') : `${dateStr}T09:00:00`,
      endTime: e.endTime ? e.endTime.replace(/^\d{4}-\d{2}-\d{2}/, dateStr).replace(/Z$/, '') : `${dateStr}T10:00:00`
    }));

    return tagMock({
      date: dateStr,
      tasks: adjustedTasks,
      calendarEvents: adjustedEvents,
      noteContent: seedNote
    });
  }

  /**
   * Fetches tasks, calendar events, and notes for a specific date.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {Promise<{date: string, tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}>} Daily dataset promise.
   */
  async getDailyData(dateStr) {
    if (this.useMock) {
      return this._mockDailyData(dateStr);
    }

    const accessToken = getAccessToken();
    if (accessToken) {
      const [calendarEvents, tasks, monthNotes] = await Promise.all([
        fetchDayCalendarEvents(dateStr, accessToken),
        fetchDayTasks(dateStr, accessToken),
        fetchMonthlyNotesData(dateStr.slice(0, 7), accessToken)
      ]);
      const noteContent = (monthNotes.days && monthNotes.days[dateStr] && monthNotes.days[dateStr].raw) || '';
      return { date: dateStr, tasks, calendarEvents, noteContent };
    }

    return this._mockDailyData(dateStr);
  }

  /**
   * Fetches tasks, calendar events, and notes for every day of a given month in one call —
   * the batched counterpart to getDailyData(), used to warm the rolling 3-month client cache
   * without issuing a getDailyData() round trip per day.
   * @param {string} monthStr Target month in YYYY-MM format.
   * @returns {Promise<{month: string, days: Object<string, {tasks: Array<object>, calendarEvents: Array<object>, noteContent: string}>}>}
   */
  async _monthDataViaDailyLoop(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
      const dayData = await this.getDailyData(dateStr);
      days[dateStr] = {
        tasks: dayData.tasks || [],
        calendarEvents: dayData.calendarEvents || [],
        noteContent: dayData.noteContent || ''
      };
    }
    return tagMock({ month: monthStr, days });
  }

  async getMonthData(monthStr) {
    if (this.useMock) {
      return this._monthDataViaDailyLoop(monthStr);
    }

    const accessToken = getAccessToken();
    if (accessToken) {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const days = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
        days[dateStr] = { tasks: [], calendarEvents: [], noteContent: '' };
      }

      const [eventsByDate, tasksByDate, monthNotes] = await Promise.all([
        fetchMonthCalendarEvents(monthStr, accessToken),
        fetchMonthTasks(monthStr, accessToken),
        fetchMonthlyNotesData(monthStr, accessToken)
      ]);
      for (const dateStr of Object.keys(days)) {
        if (eventsByDate[dateStr]) days[dateStr].calendarEvents = eventsByDate[dateStr];
        if (tasksByDate[dateStr]) days[dateStr].tasks = tasksByDate[dateStr];
        if (monthNotes.days && monthNotes.days[dateStr] && monthNotes.days[dateStr].raw) {
          days[dateStr].noteContent = monthNotes.days[dateStr].raw;
        }
      }
      return { month: monthStr, days };
    }

    return this._monthDataViaDailyLoop(monthStr);
  }

  /**
   * Fetches monthly master task list.
   * @param {string} monthYearStr Target month/year identifier string.
   * @returns {Promise<Array<object>>} List of master task items promise.
   */
  async getMasterTasks(monthYearStr) {
    if (this.useMock) return this.mockData.masterTasks;

    const accessToken = getAccessToken();
    if (accessToken) return fetchMasterTasks(accessToken);

    return this.mockData.masterTasks;
  }

  /**
   * Creates a new master task (mock mode only appends to the in-memory list; production is
   * backed by a real Google Task, see gas-app/Code.gs#addMasterTask).
   * @param {string} title Task title.
   * @param {string} [category='General'] Optional category classification.
   * @returns {Promise<object>} Created master task object.
   */
  async addMasterTask(title, category = 'General') {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const newTask = tagMock({
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        category,
        status: '•',
        movedTo: null,
        movedTaskId: null
      });
      this.mockData.masterTasks.push(newTask);
      return newTask;
    }
    return addMasterTaskRest(title, category, accessToken);
  }

  /**
   * Records that a master task was moved to a specific daily task list, for the "Moved to
   * <date>" note in the Master Tasks view. See gas-app/Code.gs#markMasterTaskMoved.
   * @param {string} masterTaskId Master task id.
   * @param {string} targetDateStr Date moved to, in YYYY-MM-DD format.
   * @param {string} movedTaskId Id of the newly created daily task.
   * @returns {Promise<object|null>} Updated master task object, or null if not found (mock mode only).
   */
  async markMasterTaskMoved(masterTaskId, targetDateStr, movedTaskId) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const task = this.mockData.masterTasks.find(t => t.id === masterTaskId);
      if (!task) return null;
      task.movedTo = targetDateStr;
      task.movedTaskId = movedTaskId;
      return task;
    }
    return markMasterTaskMovedRest(masterTaskId, targetDateStr, movedTaskId, accessToken);
  }

  /**
   * Resolves the title of a pasted Google Docs/Sheets/Slides/Forms/Drive URL via the backend's
   * drive.readonly-scoped lookup, for the Notes "smart paste" hyperlink feature. Local/mock mode
   * has no real Drive to query, so it always reports failure rather than fabricating a title —
   * callers fall back to inserting the plain URL, same as pasting any other link.
   * @param {string} url A pasted Google Docs/Sheets/Slides/Forms/Drive URL.
   * @returns {Promise<{success: boolean, title?: string, fileId?: string, error?: string}>}
   */
  async resolveLinkTitle(url) {
    if (this.useMock) {
      return { success: false, error: 'Drive title lookup is unavailable in local/mock mode.' };
    }

    const accessToken = getAccessToken();
    if (accessToken) return resolveLinkTitleRest(url, accessToken);

    return { success: false, error: 'Drive title lookup is unavailable in local/mock mode.' };
  }

  /**
   * Adds a new task to the daily planner.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} title Task title description.
   * @param {string} [category='General'] Optional category name.
   * @param {string} [sourceMasterId] Id of the master task this was transferred from, if any.
   * @returns {Promise<object>} Created daily task item promise.
   */
  async addDailyTask(dateStr, title, category = 'General', sourceMasterId) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      if (!this.mockData.dailyTasks[dateStr]) {
        this.mockData.dailyTasks[dateStr] = [];
      }
      const newTask = tagMock({
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        status: '•',
        category,
        dueDate: dateStr,
        sourceMasterId: sourceMasterId || null
      });
      // Not explicit mock mode (that's the documented, expected local-dev experience) but no
      // Google session either -- this write is only ever going into the in-memory mock store
      // and will vanish on refresh. Flag it so the caller can warn the user rather than let it
      // disappear silently (no-silent-failures.md).
      if (!this.useMock) newTask._localOnly = true;
      this.mockData.dailyTasks[dateStr].push(newTask);
      return newTask;
    }

    if (this.isOnline()) {
      try {
        return await addDailyTaskRest(dateStr, title, category, sourceMasterId, accessToken);
      } catch (err) {
        // Could be a real network drop or a server-side exception (no way to tell them apart
        // client-side) — log loudly rather than assume "just offline". If this is a genuine
        // (non-transient) error, it will keep failing on retry and surface via flushOutbox's
        // `failed` count.
        console.error('addDailyTask online call failed — queueing for offline retry', err);
      }
    }

    const tempId = `offline_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.ADD_DAILY_TASK, { dateStr, title, category, tempId });
    return { id: tempId, title, status: '•', category, dueDate: dateStr, sourceMasterId: sourceMasterId || null, _queuedOffline: true };
  }

  /**
   * Updates an existing daily task (from UI or Google Tasks API sync).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} taskId Task identifier.
   * @param {object} updates Updated task properties.
   * @returns {Promise<object|null>} Updated task object or null.
   */
  async updateDailyTask(dateStr, taskId, updates = {}) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return null;

      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      if (!this.useMock) tasks[taskIndex]._localOnly = true;
      this.mockData.dailyTasks[dateStr] = tasks;

      // Mirror a status change back onto the source master task, if this daily task was
      // transferred from one — see gas-app/Code.gs#updateDailyTask for the production
      // equivalent (best-effort; a missing master task shouldn't fail the daily task update).
      if (updates.status !== undefined && tasks[taskIndex].sourceMasterId) {
        const master = this.mockData.masterTasks.find(m => m.id === tasks[taskIndex].sourceMasterId);
        if (master) master.status = updates.status;
      }

      return tasks[taskIndex];
    }

    if (this.isOnline()) {
      try {
        return await updateDailyTaskRest(dateStr, taskId, updates, accessToken);
      } catch (err) {
        // See addDailyTask above: this may be a real (non-transient) server error, not just
        // offline — log loudly; a persistent failure surfaces via flushOutbox's `failed` count.
        console.error('updateDailyTask online call failed — queueing for offline retry', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_DAILY_TASK, { dateStr, taskId, updates });
    return { id: taskId, ...updates, _queuedOffline: true };
  }

  /**
   * Adds or creates a calendar event / appointment.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {object} eventData Calendar event payload.
   * @returns {Promise<object>} Created calendar event.
   */
  async addCalendarEvent(dateStr, eventData = {}) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      if (!this.mockData.calendarEvents[dateStr]) {
        this.mockData.calendarEvents[dateStr] = [];
      }

      const attendeesList = Array.isArray(eventData.attendees)
        ? eventData.attendees
        : (typeof eventData.attendees === 'string'
            ? eventData.attendees.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
            : []);

      const autoGoogleMeet = eventData.autoGoogleMeet !== undefined ? eventData.autoGoogleMeet : true;
      const guestsCanModify = eventData.guestsCanModify !== undefined ? eventData.guestsCanModify : true;
      const autoAgendaDoc = eventData.autoAgendaDoc !== undefined ? eventData.autoAgendaDoc : true;

      const meetLink = autoGoogleMeet
        ? (eventData.meetLink || ('https://meet.google.com/' + Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 5)))
        : null;

      const agendaDocUrl = autoAgendaDoc
        ? (eventData.agendaDocUrl || ('https://docs.google.com/document/create?title=' + encodeURIComponent('Agenda: ' + (eventData.title || 'New Appointment'))))
        : null;

      let fullDesc = eventData.description || '';
      if (agendaDocUrl && !fullDesc.includes(agendaDocUrl)) {
        fullDesc += (fullDesc ? '\n\n' : '') + `📄 Meeting Agenda Doc: ${agendaDocUrl}`;
      }

      const newEvt = tagMock({
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: eventData.title || 'New Appointment',
        startTime: eventData.startTime || `${dateStr}T09:00:00`,
        endTime: eventData.endTime || `${dateStr}T09:30:00`,
        location: eventData.location || (meetLink ? 'Google Meet' : ''),
        description: fullDesc,
        meetLink: meetLink,
        agendaDocUrl: agendaDocUrl,
        attendees: attendeesList,
        guestsCanModify: guestsCanModify,
        syncTaskId: eventData.gasTaskId || eventData.syncTaskId || null,
        isCompleted: eventData.isCompleted || false
      });
      this.mockData.calendarEvents[dateStr].push(newEvt);
      return newEvt;
    }

    if (this.isOnline()) {
      try {
        return await addCalendarEventRest(dateStr, eventData, accessToken);
      } catch (err) {
        // See addDailyTask above: this may be a real (non-transient) server error, not just
        // offline — log loudly; a persistent failure surfaces via flushOutbox's `failed` count.
        console.error('addCalendarEvent online call failed — queueing for offline retry', err);
      }
    }

    const tempId = `offline_evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const attendeesList = Array.isArray(eventData.attendees)
      ? eventData.attendees
      : (typeof eventData.attendees === 'string'
          ? eventData.attendees.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
          : []);
    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.ADD_CALENDAR_EVENT, { dateStr, eventData, tempId });
    return {
      id: tempId,
      title: eventData.title || 'New Appointment',
      startTime: eventData.startTime || `${dateStr}T09:00:00`,
      endTime: eventData.endTime || `${dateStr}T09:30:00`,
      location: eventData.location || '',
      description: eventData.description || '',
      meetLink: null,
      agendaDocUrl: null,
      attendees: attendeesList,
      guestsCanModify: eventData.guestsCanModify !== undefined ? eventData.guestsCanModify : true,
      syncTaskId: eventData.gasTaskId || eventData.syncTaskId || null,
      isCompleted: eventData.isCompleted || false,
      _queuedOffline: true
    };
  }

  /**
   * Fetches recent meeting attendees looking back (default 60 days) and forward (default 15 days).
   * @param {number} [lookbackDays=60] Days to look back.
   * @param {number} [lookaheadDays=15] Days to look forward.
   * @returns {Promise<Array<string>>} Unique sorted list of attendee email addresses.
   */
  _mockRecentAttendees() {
    const emailSet = new Set([
      'alex.rivera@example.com',
      'sarah.chen@example.com',
      'jordan.lee@example.com',
      'taylor.smith@example.com',
      'morgan.davis@example.com',
      'pat.patel@example.com'
    ]);

    // Collect from mock events
    Object.values(this.mockData.calendarEvents || {}).forEach(events => {
      events.forEach(evt => {
        (evt.attendees || []).forEach(email => {
          if (email && email.includes('@')) emailSet.add(email.toLowerCase().trim());
        });
      });
    });

    return Array.from(emailSet).sort();
  }

  async getRecentAttendees(lookbackDays = 60, lookaheadDays = 15) {
    if (this.useMock) return this._mockRecentAttendees();

    const accessToken = getAccessToken();
    if (accessToken) return fetchRecentAttendees(lookbackDays, lookaheadDays, accessToken);

    return this._mockRecentAttendees();
  }

  /**
   * Updates an existing calendar event / appointment (from UI or Google Calendar API sync).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} eventId Calendar event identifier.
   * @param {object} updates Updated event properties.
   * @returns {Promise<object|null>} Updated event object or null.
   */
  async updateCalendarEvent(dateStr, eventId, updates = {}) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const events = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return null;

      events[eventIndex] = { ...events[eventIndex], ...updates };
      this.mockData.calendarEvents[dateStr] = events;
      return events[eventIndex];
    }

    if (this.isOnline()) {
      try {
        return await updateCalendarEventRest(eventId, updates, accessToken);
      } catch (err) {
        // See addDailyTask above: this may be a real (non-transient) server error, not just
        // offline — log loudly; a persistent failure surfaces via flushOutbox's `failed` count.
        console.error('updateCalendarEvent online call failed — queueing for offline retry', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.UPDATE_CALENDAR_EVENT, { dateStr, eventId, updates });
    return { id: eventId, ...updates, _queuedOffline: true };
  }

  /**
   * Performs 2-way sync reconciliation for a specific date across tasks and calendar appointments.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @returns {Promise<{tasks: Array<object>, calendarEvents: Array<object>, syncTimestamp: string}>}
   */
  async syncWorkspace(dateStr) {
    if (this.useMock) {
      const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
      const events = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];

      const reconciled = reconcileWorkspaceChanges(tasks, events);
      this.mockData.dailyTasks[dateStr] = reconciled.tasks;
      this.mockData.calendarEvents[dateStr] = reconciled.calendarEvents;
      return reconciled;
    }

    const accessToken = getAccessToken();
    if (accessToken) {
      const [beforeEvents, beforeTasks] = await Promise.all([
        fetchDayCalendarEvents(dateStr, accessToken),
        fetchDayTasks(dateStr, accessToken)
      ]);
      const reconciled = reconcileWorkspaceChanges(beforeTasks, beforeEvents);
      const plan = planSyncPersistence(beforeTasks, beforeEvents, reconciled);

      for (const upd of plan.taskUpdates) {
        await updateDailyTaskRest(dateStr, upd.taskId, { title: upd.title, status: upd.status, dueDate: upd.dueDate }, accessToken);
      }
      for (const create of plan.eventCreates) {
        const saved = await addCalendarEventRest(dateStr, create.payload, accessToken);
        if (saved && saved.id) {
          reconciled.calendarEvents[create.index] = { ...reconciled.calendarEvents[create.index], ...saved };
        }
      }
      for (const upd of plan.eventUpdates) {
        await updateCalendarEventRest(upd.eventId, { title: upd.title, startTime: upd.startTime, endTime: upd.endTime }, accessToken);
      }

      return reconciled;
    }

    const tasks = this.mockData.dailyTasks[dateStr] || this.mockData.dailyTasks['2026-08-15'] || [];
    const events = this.mockData.calendarEvents[dateStr] || this.mockData.calendarEvents['2026-08-15'] || [];
    return reconcileWorkspaceChanges(tasks, events);
  }

  /**
   * Transfers a master task into the daily task list with priority prefix. Takes the full
   * master task object (rather than re-looking it up by id) because the caller already has it
   * in hand from the last `getMasterTasks()` fetch — mirroring `forwardDailyTask`'s
   * `sourceTaskSnapshot` pattern, and avoiding a stale/mismatched internal lookup.
   * @param {object} masterTask Master task object to transfer (must have `id`).
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise, or null if `masterTask` is missing/invalid.
   */
  async transferMasterTask(masterTask, dateStr, priorityGroup = 'A') {
    if (!masterTask || !masterTask.id) return null;

    const existingDaily = this.mockData.dailyTasks[dateStr] || [];
    const { title, category } = transferMasterTaskToToday(masterTask, existingDaily, priorityGroup, dateStr);

    const created = await this.addDailyTask(dateStr, title, category, masterTask.id);
    if (created) {
      await this.markMasterTaskMoved(masterTask.id, dateStr, created.id);
    }
    return created;
  }

  /**
   * Forwards a daily task to a new date (default: the day after `dateStr`) — Franklin Covey's
   * "➜ forwarded to a new date" semantics. The original task's status is set to FORWARDED and
   * left in place on its original day so the page still shows it was handled; a new open task
   * carrying the same priority group/category is created on the target date.
   * @param {string} dateStr Source date in YYYY-MM-DD format.
   * @param {string} taskId Task identifier on the source date.
   * @param {{title: string, category?: string}} sourceTaskSnapshot Current title/category of the
   *   task being forwarded — the Tasks API has no server-readable "category" field, so the
   *   caller (which already has the task in hand) supplies it rather than requiring a round trip.
   * @param {string} [targetDateStr] Target date in YYYY-MM-DD format (defaults to the day after `dateStr`).
   * @returns {Promise<{originalTask: object, forwardedTask: object}|null>} Both updated task objects, or null if the source task was not found.
   */
  async forwardDailyTask(dateStr, taskId, sourceTaskSnapshot, targetDateStr) {
    const resolvedTargetDate = targetDateStr || (() => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    })();

    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const tasks = this.mockData.dailyTasks[dateStr] || [];
      const sourceTask = tasks.find(t => t.id === taskId);
      if (!sourceTask) return null;

      const existingTargetDayTasks = this.mockData.dailyTasks[resolvedTargetDate] || [];
      const forwardedTask = tagMock(forwardTaskToDate(sourceTask, existingTargetDayTasks, resolvedTargetDate));

      sourceTask.status = TASK_STATUSES.FORWARDED;
      if (!this.mockData.dailyTasks[resolvedTargetDate]) this.mockData.dailyTasks[resolvedTargetDate] = [];
      this.mockData.dailyTasks[resolvedTargetDate].push(forwardedTask);

      return { originalTask: sourceTask, forwardedTask };
    }

    return forwardDailyTaskRest(dateStr, taskId, sourceTaskSnapshot, resolvedTargetDate, accessToken);
  }

  /**
   * Fetches the Future Planning Matrix (12-month overview) for a given year — month-scoped
   * "big rock" items not yet tied to a specific day, per the Franklin Covey Master Task List
   * model applied across the whole year.
   * @param {number|string} year Target calendar year.
   * @returns {Promise<{year: string, months: Object<string, Array<object>>}>} Year matrix promise.
   */
  async getFutureMatrix(year) {
    if (this.useMock) {
      if (!this.mockData.futureMatrix[year]) {
        this.mockData.futureMatrix[year] = mockYearMatrix(year);
      }
      return this.mockData.futureMatrix[year];
    }

    const accessToken = getAccessToken();
    if (accessToken) return fetchFutureMatrix(year, accessToken);

    if (!this.mockData.futureMatrix[year]) {
      this.mockData.futureMatrix[year] = mockYearMatrix(year);
    }
    return this.mockData.futureMatrix[year];
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
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      if (!this.mockData.futureMatrix[year]) {
        this.mockData.futureMatrix[year] = mockYearMatrix(year);
      }
      const matrix = this.mockData.futureMatrix[year];
      if (!matrix.months[monthKey]) matrix.months[monthKey] = [];
      const newItem = tagMock(createFutureItem(title, category));
      matrix.months[monthKey].push(newItem);
      return newItem;
    }

    return addFutureItemRest(year, monthKey, title, category, accessToken);
  }

  /**
   * Cycles a future item's Franklin-style status marker (open → done → forwarded →
   * canceled → delegated).
   * @param {number|string} year Target calendar year.
   * @param {string} monthKey Target month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @param {string} status New status symbol.
   * @returns {Promise<object|null>} Updated future item promise, or null if not found.
   */
  async updateFutureItemStatus(year, monthKey, itemId, status) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const item = items.find(i => i.id === itemId);
      if (!item) return null;
      item.status = status;
      return item;
    }

    return updateFutureItemStatusRest(year, monthKey, itemId, status, accessToken);
  }

  /**
   * Transfers a future planning item onto a specific day's task list, removing it from its
   * month bucket — Franklin Covey's "forwarded" semantics: the item now lives on that day.
   * @param {number|string} year Source calendar year.
   * @param {string} monthKey Source month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} [priorityGroup='A'] Priority group code ('A', 'B', or 'C').
   * @returns {Promise<object|null>} Created daily task object promise, or null if not found.
   */
  async transferFutureItem(year, monthKey, itemId, dateStr, priorityGroup = 'A') {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return null;
      const [item] = items.splice(idx, 1);

      const existingDaily = this.mockData.dailyTasks[dateStr] || [];
      const newDailyTask = tagMock(transferMasterTaskToToday(item, existingDaily, priorityGroup, dateStr));
      if (!this.mockData.dailyTasks[dateStr]) this.mockData.dailyTasks[dateStr] = [];
      this.mockData.dailyTasks[dateStr].push(newDailyTask);
      return newDailyTask;
    }

    return transferFutureItemRest(year, monthKey, itemId, dateStr, priorityGroup, accessToken);
  }

  /**
   * Carries a still-open future item forward into next month's bucket, rolling into next
   * calendar year's matrix when pushed from December.
   * @param {number|string} year Source calendar year.
   * @param {string} monthKey Source month key in YYYY-MM format.
   * @param {string} itemId Future item identifier.
   * @returns {Promise<object|null>} The carried-forward item promise, or null if not found.
   */
  async pushFutureItemToNextMonth(year, monthKey, itemId) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      const items = this.mockData.futureMatrix[year]?.months?.[monthKey] || [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return null;
      const [item] = items.splice(idx, 1);

      const nextKey = nextMonthKey(monthKey);
      const nextYear = nextKey.slice(0, 4);
      if (!this.mockData.futureMatrix[nextYear]) {
        this.mockData.futureMatrix[nextYear] = mockYearMatrix(nextYear);
      }
      const nextMatrix = this.mockData.futureMatrix[nextYear];
      if (!nextMatrix.months[nextKey]) nextMatrix.months[nextKey] = [];
      nextMatrix.months[nextKey].push(item);
      return item;
    }

    return pushFutureItemToNextMonthRest(year, monthKey, itemId, accessToken);
  }

  /**
   * Saves daily topic cards to the Monthly Google Doc.
   * @param {string} dateStr Target date in YYYY-MM-DD format.
   * @param {string} noteContent Card note content.
   * @returns {Promise<{success: boolean, docName?: string}>} Promise of save result.
   */
  async saveDailyDocCards(dateStr, noteContent) {
    const accessToken = !this.useMock ? getAccessToken() : null;

    if (this.useMock || !accessToken) {
      this.mockData.dailyNotes[dateStr] = noteContent;
      return tagMock({ success: true, docName: `Day Planner Notes - Mock ${dateStr}` });
    }

    if (this.isOnline()) {
      try {
        return await saveDailyDocCardsRest(dateStr, noteContent, accessToken);
      } catch (err) {
        // See addDailyTask above: this may be a real (non-transient) server error, not just
        // offline — log loudly; a persistent failure surfaces via flushOutbox's `failed` count.
        console.error('saveDailyDocCards online call failed — queueing for offline retry', err);
      }
    }

    await IndexedDbStore.idbEnqueueMutation(OUTBOX_MUTATION_TYPES.SAVE_DAILY_NOTE, { dateStr, noteContent });
    return { success: true, queued: true, docName: null };
  }
}
