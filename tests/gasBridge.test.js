/**
 * @file gasBridge.test.js
 * @description Unit tests for GASBridge client API wrapper, mock data handling, task/calendar updates, and 2-way synchronization.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GASBridge,
  fetchDayCalendarEvents,
  fetchDayTasks,
  fetchMonthCalendarEvents,
  fetchMonthTasks,
  getOrCreateRootFolderId,
  fetchMonthlyNotesData,
  fetchMasterTasks,
  fetchFutureMatrix,
  fetchRecentAttendees,
  resolveLinkTitleRest,
  deriveTaskStatus,
  decodeTaskMeta,
  encodeTaskMeta,
  addMasterTaskRest,
  markMasterTaskMovedRest,
  addDailyTaskRest,
  updateDailyTaskRest,
  forwardDailyTaskRest,
  updateCalendarEventRest,
  addCalendarEventRest,
  saveDailyDocCardsRest,
  addFutureItemRest,
  updateFutureItemStatusRest,
  transferFutureItemRest,
  pushFutureItemToNextMonthRest
} from '../src/gasBridge.js';
import IndexedDbStore from '../src/indexedDbStore.js';
import * as googleAuth from '../src/googleAuth.js';

describe('GAS Bridge Offline Write Queue Unit Tests', () => {
  it('should queue an add-task mutation to the outbox when offline and return a temp-id placeholder', async () => {
    installFakeGisSignedIn('tok_offline');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;

      const result = await bridge.addDailyTask('2026-08-20', '[A1] Test offline task', 'Work');
      assert.equal(result._queuedOffline, true);
      assert.ok(result.id.startsWith('offline_task_'));

      const outbox = await IndexedDbStore.idbGetOutbox();
      const match = outbox.find(m => m.type === 'ADD_DAILY_TASK' && m.payload.tempId === result.id);
      assert.ok(match, 'expected an ADD_DAILY_TASK mutation queued for the returned temp id');

      await IndexedDbStore.idbDequeueMutation(match.id);
    } finally {
      googleAuth.signOut();
      uninstallFakeGis();
    }
  });

  it('should queue an update-task mutation when offline and return an optimistic merge', async () => {
    installFakeGisSignedIn('tok_offline');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;

      const result = await bridge.updateDailyTask('2026-08-20', 'real_task_1', { status: '✓' });
      assert.equal(result._queuedOffline, true);
      assert.equal(result.id, 'real_task_1');
      assert.equal(result.status, '✓');

      const outbox = await IndexedDbStore.idbGetOutbox();
      const match = outbox.find(m => m.type === 'UPDATE_DAILY_TASK' && m.payload.taskId === 'real_task_1');
      assert.ok(match, 'expected an UPDATE_DAILY_TASK mutation queued');

      await IndexedDbStore.idbDequeueMutation(match.id);
    } finally {
      googleAuth.signOut();
      uninstallFakeGis();
    }
  });

  it('should replay queued mutations in order once back online and resolve temp ids to real ids', async () => {
    installFakeGisSignedIn('tok_offline');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;
      const queued = await bridge.addDailyTask('2026-08-21', '[A1] Flush me', 'Work');
      assert.ok(queued.id.startsWith('offline_task_'));

      bridge._forceOffline = false;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ id: 'real_task_99', title: '[A1] Flush me', status: 'needsAction', due: '2026-08-21T00:00:00.000Z' })
      });
      const resolutions = [];
      const flushResult = await bridge.flushOutbox((mutation, result, tempIdMap) => {
        resolutions.push({ mutation, result, tempIdMap });
      });

      assert.equal(flushResult.flushed, 1);
      assert.equal(flushResult.remaining, 0);
      assert.equal(flushResult.failed, 0);
      assert.equal(resolutions.length, 1);
      assert.equal(resolutions[0].result.id, 'real_task_99');
      assert.equal(resolutions[0].tempIdMap[queued.id], 'real_task_99');

      const outbox = await IndexedDbStore.idbGetOutbox();
      assert.equal(outbox.some(m => m.payload.tempId === queued.id), false);
    } finally {
      googleAuth.signOut();
      uninstallFakeGis();
    }
  });

  it('should stop flushing at the first failed mutation, leaving later ones queued for retry', async () => {
    installFakeGisSignedIn('tok_offline');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    let firstId, secondId;
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;
      const first = await bridge.addDailyTask('2026-08-22', '[A1] Will fail to flush', 'Work');
      const second = await bridge.addDailyTask('2026-08-22', '[A2] Should stay queued', 'Work');
      firstId = first.id;
      secondId = second.id;

      bridge._forceOffline = false;
      globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Error', text: async () => 'simulated backend failure' });
      const flushResult = await bridge.flushOutbox();

      assert.equal(flushResult.flushed, 0);
      assert.equal(flushResult.failed, 1);
      assert.equal(flushResult.remaining, 2);

      const outbox = await IndexedDbStore.idbGetOutbox();
      assert.equal(outbox.filter(m => m.payload.tempId === firstId || m.payload.tempId === secondId).length, 2);
    } finally {
      googleAuth.signOut();
      uninstallFakeGis();
      const outbox = await IndexedDbStore.idbGetOutbox();
      for (const m of outbox) {
        if (m.payload.tempId === firstId || m.payload.tempId === secondId) {
          await IndexedDbStore.idbDequeueMutation(m.id);
        }
      }
    }
  });

  it('should skip flushing entirely in mock mode without touching the outbox', async () => {
    const bridge = new GASBridge(true);
    const result = await bridge.flushOutbox();
    assert.deepEqual(result, { flushed: 0, remaining: 0, failed: 0 });
  });
});

describe('GAS Bridge Unit Tests', () => {
  it('should fetch daily mock data correctly', async () => {
    const bridge = new GASBridge(true);
    const data = await bridge.getDailyData('2026-08-15');
    assert.equal(data.date, '2026-08-15');
    assert.equal(data.tasks.length, 1);
    assert.equal(data.calendarEvents.length, 0);
    assert.ok(data.noteContent.includes('Get started'));
  });

  it('should fetch a whole month of mock data bucketed by day via getMonthData', async () => {
    const bridge = new GASBridge(true);
    const monthData = await bridge.getMonthData('2026-08');
    assert.equal(monthData.month, '2026-08');
    assert.equal(Object.keys(monthData.days).length, 31);
    assert.ok(monthData.days['2026-08-01']);
    assert.ok(monthData.days['2026-08-31']);

    const day15 = monthData.days['2026-08-15'];
    assert.equal(day15.tasks.length, 1);
    assert.equal(day15.calendarEvents.length, 0);
    assert.ok(day15.noteContent.includes('Get started'));
  });

  it('should fetch master tasks list', async () => {
    const bridge = new GASBridge(true);
    const masterTasks = await bridge.getMasterTasks('August 2026');
    assert.equal(masterTasks.length, 1);
  });

  it('should report smart-paste title lookup unavailable in mock mode rather than fabricating a title', async () => {
    const bridge = new GASBridge(true);
    const result = await bridge.resolveLinkTitle('https://docs.google.com/document/d/abc123/edit');
    assert.equal(result.success, false);
    assert.ok(!result.title);
  });

  it('should add a new daily task via bridge handler', async () => {
    const bridge = new GASBridge(true);
    const newTask = await bridge.addDailyTask('2026-08-15', '[B2] Send weekly status update', 'Work');
    assert.ok(newTask.id);
    assert.equal(newTask.title, '[B2] Send weekly status update');

    const updatedData = await bridge.getDailyData('2026-08-15');
    assert.equal(updatedData.tasks.length, 2);
  });

  it('should update an existing daily task via bridge handler', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateDailyTask('2026-08-15', 't1', { status: '✓', title: 'Try the Day Planner app (Completed)' });
    assert.ok(updated);
    assert.equal(updated.status, '✓');
    assert.equal(updated.title, 'Try the Day Planner app (Completed)');
  });

  it('should add and update calendar events with attendees, Google Meet, and Agenda Doc via bridge', async () => {
    const bridge = new GASBridge(true);
    const newEvt = await bridge.addCalendarEvent('2026-08-15', {
      title: 'Strategy & Architecture Discussion',
      startTime: '2026-08-15T16:00:00',
      endTime: '2026-08-15T16:30:00',
      location: 'Boardroom A',
      attendees: ['alex.rivera@example.com', 'sarah.chen@example.com'],
      autoGoogleMeet: true,
      guestsCanModify: true,
      autoAgendaDoc: true
    });
    assert.ok(newEvt.id);
    assert.equal(newEvt.title, 'Strategy & Architecture Discussion');
    assert.equal(newEvt.attendees.length, 2);
    assert.ok(newEvt.meetLink.includes('meet.google.com'));
    assert.ok(newEvt.agendaDocUrl.includes('docs.google.com'));
    assert.equal(newEvt.guestsCanModify, true);

    const updatedEvt = await bridge.updateCalendarEvent('2026-08-15', newEvt.id, {
      title: 'Strategy & Architecture Discussion (Finalized)',
      isCompleted: true
    });
    assert.ok(updatedEvt);
    assert.equal(updatedEvt.title, 'Strategy & Architecture Discussion (Finalized)');
    assert.equal(updatedEvt.isCompleted, true);
  });

  it('should fetch recent attendees across 60 days past and 15 days future', async () => {
    const bridge = new GASBridge(true);
    const attendees = await bridge.getRecentAttendees(60, 15);
    assert.ok(Array.isArray(attendees));
    assert.ok(attendees.length >= 6);
    assert.ok(attendees.includes('alex.rivera@example.com'));
    assert.ok(attendees.includes('sarah.chen@example.com'));
  });

  it('should perform workspace 2-way sync through the bridge', async () => {
    const bridge = new GASBridge(true);
    // Add a new task without calendar event
    await bridge.addDailyTask('2026-08-15', '[A5] Synchronize Google Cloud endpoints', 'Work');
    
    const syncResult = await bridge.syncWorkspace('2026-08-15');
    assert.ok(syncResult);
    assert.ok(syncResult.tasks.length >= 2);

    // Day planners keep Tasks and Appointments distinct: an untimed task must never
    // project into calendarEvents as a phantom appointment.
    const syncedEvt = syncResult.calendarEvents.find(e => e.title.includes('Synchronize Google Cloud endpoints'));
    assert.equal(syncedEvt, undefined);
  });

  it('should transfer master task to daily task via bridge', async () => {
    const bridge = new GASBridge(true);
    const masterTasks = await bridge.getMasterTasks();
    const m1 = masterTasks.find(m => m.id === 'm1');
    const transferred = await bridge.transferMasterTask(m1, '2026-08-15', 'A');
    assert.ok(transferred);
    assert.ok(transferred.title.startsWith('[A1]'));
    assert.equal(transferred.category, 'Personal');
  });

  it('should mark the master task as moved after transferring it, so it cannot be moved twice', async () => {
    const bridge = new GASBridge(true);
    const masterTasks = await bridge.getMasterTasks();
    const m1 = masterTasks.find(m => m.id === 'm1');
    const transferred = await bridge.transferMasterTask(m1, '2026-08-15', 'A');

    const afterTransfer = await bridge.getMasterTasks();
    const m1After = afterTransfer.find(m => m.id === 'm1');
    assert.equal(m1After.movedTo, '2026-08-15');
    assert.equal(m1After.movedTaskId, transferred.id);
  });

  it('should save daily doc cards content via bridge', async () => {
    const bridge = new GASBridge(true);
    const result = await bridge.saveDailyDocCards('2026-08-16', '### #index [Architecture] System Design\n- Clean 3-col layout');
    assert.ok(result.success);
    assert.ok(result.docName.includes('Day Planner Notes'));
  });

  it('should return null when updating a task or event id that does not exist', async () => {
    const bridge = new GASBridge(true);
    assert.equal(await bridge.updateDailyTask('2026-08-15', 'nonexistent-id', { status: '✓' }), null);
    assert.equal(await bridge.updateCalendarEvent('2026-08-15', 'nonexistent-id', { title: 'x' }), null);
  });

  it('should return null when transferring without a valid master task object', async () => {
    const bridge = new GASBridge(true);
    assert.equal(await bridge.transferMasterTask(null, '2026-08-15'), null);
    assert.equal(await bridge.transferMasterTask({}, '2026-08-15'), null);
  });

  it('should forward a daily task to the next day by default, marking the original FORWARDED', async () => {
    const bridge = new GASBridge(true);
    const added = await bridge.addDailyTask('2026-08-15', '[A2] Conduct team sync on Google Suite integration', 'Work');
    const result = await bridge.forwardDailyTask('2026-08-15', added.id, { title: added.title, category: 'Work' });
    assert.ok(result);
    assert.equal(result.originalTask.status, '→');
    assert.equal(result.forwardedTask.dueDate, '2026-08-16');
    assert.equal(result.forwardedTask.status, '•');
    assert.ok(result.forwardedTask.title.includes('Conduct team sync on Google Suite integration'));

    const nextDayTasks = (await bridge.getDailyData('2026-08-16')).tasks;
    assert.ok(nextDayTasks.some(t => t.id === result.forwardedTask.id));
  });

  it('should forward a daily task to an explicit target date', async () => {
    const bridge = new GASBridge(true);
    const added = await bridge.addDailyTask('2026-08-15', '[B1] Review Q3 budget draft', 'Financial');
    const result = await bridge.forwardDailyTask('2026-08-15', added.id, { title: added.title, category: 'Financial' }, '2026-08-20');
    assert.equal(result.forwardedTask.dueDate, '2026-08-20');
  });

  it('should return null when forwarding a task id that does not exist', async () => {
    const bridge = new GASBridge(true);
    assert.equal(await bridge.forwardDailyTask('2026-08-15', 'nonexistent-id', { title: 'x' }), null);
  });

  it('should fetch the future planning matrix for a year with all 12 months present', async () => {
    const bridge = new GASBridge(true);
    const matrix = await bridge.getFutureMatrix(2026);
    assert.equal(matrix.year, '2026');
    assert.equal(Object.keys(matrix.months).length, 12);
    assert.equal(matrix.months['2026-10'].length, 1);
  });

  it('should add a future planning item to a month bucket via bridge', async () => {
    const bridge = new GASBridge(true);
    const item = await bridge.addFutureItem(2026, '2026-04', 'Renew business license', 'Financial');
    assert.equal(item.title, 'Renew business license');
    assert.equal(item.status, '•');
    const matrix = await bridge.getFutureMatrix(2026);
    assert.ok(matrix.months['2026-04'].some(i => i.id === item.id));
  });

  it('should cycle a future item status via bridge', async () => {
    const bridge = new GASBridge(true);
    const updated = await bridge.updateFutureItemStatus(2026, '2026-10', 'fm_seed', 'X');
    assert.equal(updated, null); // seeded id is randomized, not literally 'fm_seed'

    const matrix = await bridge.getFutureMatrix(2026);
    const seeded = matrix.months['2026-10'][0];
    const cycled = await bridge.updateFutureItemStatus(2026, '2026-10', seeded.id, '✓');
    assert.equal(cycled.status, '✓');
  });

  it('should transfer a future item onto a specific day and remove it from its month bucket', async () => {
    const bridge = new GASBridge(true);
    const item = await bridge.addFutureItem(2026, '2026-11', 'Renew passport', 'Personal');

    const transferred = await bridge.transferFutureItem(2026, '2026-11', item.id, '2026-11-03', 'B');
    assert.ok(transferred.title.includes(item.title));
    assert.equal(transferred.dueDate, '2026-11-03');

    const refreshed = await bridge.getFutureMatrix(2026);
    assert.equal(refreshed.months['2026-11'].length, 0);
  });

  it('should push an open future item into next month, rolling into next year from December', async () => {
    const bridge = new GASBridge(true);
    const item = await bridge.addFutureItem(2026, '2026-12', 'Year-end budget review', 'Financial');

    const pushed = await bridge.pushFutureItemToNextMonth(2026, '2026-12', item.id);
    assert.equal(pushed.id, item.id);

    const nextYearMatrix = await bridge.getFutureMatrix(2027);
    assert.ok(nextYearMatrix.months['2027-01'].some(i => i.id === item.id));

    const refreshed2026 = await bridge.getFutureMatrix(2026);
    assert.equal(refreshed2026.months['2026-12'].length, 0);
  });

  it('should skip Meet link, Agenda Doc, and guest-edit generation when explicitly disabled', async () => {
    const bridge = new GASBridge(true);
    const evt = await bridge.addCalendarEvent('2026-08-17', {
      title: 'Private focus block',
      autoGoogleMeet: false,
      autoAgendaDoc: false,
      guestsCanModify: false
    });
    assert.equal(evt.meetLink, null);
    assert.equal(evt.agendaDocUrl, null);
    assert.equal(evt.guestsCanModify, false);
    assert.equal(evt.location, '');
    assert.equal(evt.description, '');
  });

  it('should parse a comma/semicolon-delimited attendees string into a trimmed list', async () => {
    const bridge = new GASBridge(true);
    const evt = await bridge.addCalendarEvent('2026-08-17', {
      title: 'Cross-team sync',
      attendees: ' alex.rivera@example.com, sarah.chen@example.com; jordan.lee@example.com '
    });
    assert.deepEqual(evt.attendees, ['alex.rivera@example.com', 'sarah.chen@example.com', 'jordan.lee@example.com']);
  });

  it('should initialize an empty daily task list for a date with no seeded tasks', async () => {
    const bridge = new GASBridge(true);
    const newTask = await bridge.addDailyTask('2026-09-01', 'Fresh task on a blank day', 'Personal');
    assert.equal(newTask.category, 'Personal');
    await bridge.getDailyData('2026-09-01');
    // getDailyData falls back to the seeded 2026-08-15 tasks when a date has no entry of its own,
    // so re-read the raw mock store to confirm the new date's own list was created in isolation.
    assert.equal(bridge.mockData.dailyTasks['2026-09-01'].length, 1);
    assert.equal(bridge.mockData.dailyTasks['2026-09-01'][0].title, 'Fresh task on a blank day');
  });
});

/**
 * Fakes window.google.accounts.oauth2 well enough to sign in a real googleAuth.js module
 * instance — the same module gasBridge.js's `getAccessToken` import resolves to, so a signed-in
 * token here is what getDailyData()'s REST branch will see.
 */
function installFakeGisSignedIn(accessToken) {
  const tokenClient = {
    callback: () => {},
    requestAccessToken() {
      tokenClient.callback({ access_token: accessToken, expires_in: 3600 });
    }
  };
  globalThis.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            tokenClient.callback = config.callback;
            return tokenClient;
          },
          revoke(_token, cb) {
            cb();
          }
        }
      }
    }
  };
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

function uninstallFakeGis() {
  delete globalThis.window;
  delete globalThis.sessionStorage;
  delete globalThis.fetch;
}

describe('GAS Bridge REST Unit Tests (Google Identity Services token present)', () => {
  afterEach(() => {
    googleAuth.signOut();
    uninstallFakeGis();
  });

  it('deriveTaskStatus() prefers a dp-status marker over the plain completed/needsAction state', () => {
    assert.equal(deriveTaskStatus({ status: 'needsAction', notes: '<!--dp-status:→-->\nsome notes' }), '→');
    assert.equal(deriveTaskStatus({ status: 'completed', notes: '' }), '✓');
    assert.equal(deriveTaskStatus({ status: 'needsAction', notes: '' }), '•');
    assert.equal(deriveTaskStatus({ status: 'needsAction', notes: '<!--dp-status:bogus-->\n' }), '•');
  });

  it('decodeTaskMeta() parses the dp-meta JSON blob and tolerates missing/malformed notes', () => {
    assert.deepEqual(decodeTaskMeta('<!--dp-meta:{"sourceMasterId":"m1"}-->\ntext'), { sourceMasterId: 'm1' });
    assert.deepEqual(decodeTaskMeta('no marker here'), {});
    assert.deepEqual(decodeTaskMeta('<!--dp-meta:{not json-->\n'), {});
    assert.deepEqual(decodeTaskMeta(undefined), {});
  });

  it('fetchDayCalendarEvents() maps Calendar API items to the app event shape', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({
          items: [{
            id: 'evt1',
            summary: 'Standup',
            start: { dateTime: '2026-08-15T09:00:00-04:00' },
            end: { dateTime: '2026-08-15T09:30:00-04:00' },
            location: 'Room 1',
            description: 'Daily sync',
            hangoutLink: 'https://meet.google.com/abc',
            htmlLink: 'https://calendar.google.com/event?eid=1',
            extendedProperties: { shared: { gasTaskId: 'task1' } }
          }]
        })
      };
    };

    const events = await fetchDayCalendarEvents('2026-08-15', 'tok_abc');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      id: 'evt1',
      title: 'Standup',
      startTime: '2026-08-15T09:00:00-04:00',
      endTime: '2026-08-15T09:30:00-04:00',
      location: 'Room 1',
      description: 'Daily sync',
      meetLink: 'https://meet.google.com/abc',
      htmlLink: 'https://calendar.google.com/event?eid=1',
      syncTaskId: 'task1'
    });
    assert.match(calls[0], /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);
  });

  it('fetchDayTasks() filters to the exact due date and decodes status/meta markers', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        items: [
          { id: 't1', title: 'In range', status: 'needsAction', due: '2026-08-15T00:00:00.000Z', notes: '<!--dp-meta:{"sourceMasterId":"m9","category":"Work"}-->\n' },
          { id: 't2', title: 'Adjacent day', status: 'needsAction', due: '2026-08-16T00:00:00.000Z' },
          { id: 't3', title: 'Done', status: 'completed', due: '2026-08-15T00:00:00.000Z' }
        ]
      })
    });

    const tasks = await fetchDayTasks('2026-08-15', 'tok_abc');
    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks[0], { id: 't1', title: 'In range', status: '•', dueDate: '2026-08-15', category: 'Work', sourceMasterId: 'm9' });
    assert.equal(tasks[1].status, '✓');
    // No dp-meta marker at all (e.g. an externally-created task) still defaults to 'General',
    // matching gas-app/Code.gs#getDailyData's category fallback.
    assert.equal(tasks.find(t => t.id === 't3').category, 'General');
    assert.equal(tasks.find(t => t.id === 't2'), undefined);
  });

  it('googleApiFetch throws with the status and body on a non-2xx response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'insufficient scope' });
    await assert.rejects(() => fetchDayTasks('2026-08-15', 'tok_abc'), /403.*insufficient scope/s);
  });

  it('getDailyData() uses the REST path (Calendar + Tasks + Drive notes) when a GIS access token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      fetchedUrls.push(url);
      if (url.includes('/calendar/v3/')) {
        return { ok: true, json: async () => ({ items: [] }) };
      }
      if (url.includes('tasks.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 't1', title: 'REST task', status: 'needsAction', due: '2026-08-20T00:00:00.000Z' }] })
        };
      }
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) {
        // The notes file search inside the folder finds nothing, so noteContent falls back
        // to '' rather than fabricating content.
        return { ok: true, json: async () => ({ files: [] }) };
      }
      // Drive: root folder search finds an existing folder.
      return { ok: true, json: async () => ({ files: [{ id: 'folder1', name: 'Day Planner' }] }) };
    };

    const bridge = new GASBridge(false);
    const data = await bridge.getDailyData('2026-08-20');
    assert.equal(data.date, '2026-08-20');
    assert.equal(data.noteContent, '');
    assert.equal(data.calendarEvents.length, 0);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].title, 'REST task');
    // Calendar + Tasks + Drive folder search + notes file search (found no file, so no download call).
    assert.equal(fetchedUrls.length, 4);
  });

  it('getDailyData() surfaces real note content from the monthly Drive notes JSON', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    globalThis.fetch = async (url) => {
      if (url.includes('/calendar/v3/')) return { ok: true, json: async () => ({ items: [] }) };
      if (url.includes('tasks.googleapis.com')) return { ok: true, json: async () => ({ items: [] }) };
      if (url.includes('alt=media')) {
        return { ok: true, text: async () => JSON.stringify({ month: '2026-08', days: { '2026-08-20': { raw: 'Real note content' } } }) };
      }
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) {
        return { ok: true, json: async () => ({ files: [{ id: 'notesfile1', name: 'notes-2026-08.json' }] }) };
      }
      return { ok: true, json: async () => ({ files: [{ id: 'folder1', name: 'Day Planner' }] }) };
    };

    const bridge = new GASBridge(false);
    const data = await bridge.getDailyData('2026-08-20');
    assert.equal(data.noteContent, 'Real note content');
  });

  it('getDailyData() falls back to mock data when no access token is present (signed out)', async () => {
    const bridge = new GASBridge(false);
    const data = await bridge.getDailyData('2026-08-15');
    assert.equal(data.date, '2026-08-15');
    assert.equal(data.tasks.length, 1);
    assert.ok(data.noteContent.includes('Get started'));
  });

  it('syncWorkspace() reconciles via REST and persists the resulting diff when a GIS access token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    const patchCalls = [];
    globalThis.fetch = async (url, opts = {}) => {
      if (url.includes('/calendar/v3/') && opts.method === 'PATCH') {
        patchCalls.push({ url, body: JSON.parse(opts.body) });
        return {
          ok: true,
          json: async () => ({
            id: 'evt1',
            summary: '[✓] Test Task',
            start: { dateTime: '2026-09-05T09:00:00Z' },
            end: { dateTime: '2026-09-05T09:30:00Z' }
          })
        };
      }
      if (url.includes('/calendar/v3/')) {
        return {
          ok: true,
          json: async () => ({
            items: [{
              id: 'evt1',
              summary: '[A1] Test Task',
              start: { dateTime: '2026-09-05T09:00:00Z' },
              end: { dateTime: '2026-09-05T09:30:00Z' },
              extendedProperties: { shared: { gasTaskId: 't1' } }
            }]
          })
        };
      }
      if (url.includes('tasks.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 't1', title: '[A1] Test Task', status: 'completed', due: '2026-09-05T00:00:00.000Z' }] })
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const bridge = new GASBridge(false);
    const result = await bridge.syncWorkspace('2026-09-05');

    // Task was already marked done ('completed' -> status '✓') but the linked event's title
    // hadn't caught up yet — reconciliation must patch the real Calendar event via REST,
    // not silently mock it, and reflect the patched title back in the returned result.
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.summary, '[✓] Test Task');
    const syncedEvt = result.calendarEvents.find(e => e.id === 'evt1');
    assert.equal(syncedEvt.title, '[✓] Test Task');
  });

  it('fetchMonthCalendarEvents() paginates and buckets events by day', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      const params = new URL(url).searchParams;
      if (!params.get('pageToken')) {
        return {
          ok: true,
          json: async () => ({
            nextPageToken: 'page2',
            items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-08-05T09:00:00-04:00' }, end: { dateTime: '2026-08-05T09:30:00-04:00' } }]
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: [{ id: 'e2', summary: 'Review', start: { date: '2026-08-20' }, end: { date: '2026-08-21' } }]
        })
      };
    };

    const byDate = await fetchMonthCalendarEvents('2026-08', 'tok_abc');
    assert.equal(calls.length, 2);
    assert.equal(byDate['2026-08-05'].length, 1);
    assert.equal(byDate['2026-08-05'][0].title, 'Standup');
    assert.equal(byDate['2026-08-20'][0].title, 'Review');
  });

  it('fetchMonthTasks() paginates and buckets tasks by due date, skipping undated tasks', async () => {
    let call = 0;
    globalThis.fetch = async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ nextPageToken: 'p2', items: [{ id: 't1', title: 'Dated', status: 'needsAction', due: '2026-08-10T00:00:00.000Z' }] }) };
      }
      return { ok: true, json: async () => ({ items: [{ id: 't2', title: 'Undated' }, { id: 't3', title: 'Later', status: 'completed', due: '2026-08-11T00:00:00.000Z' }] }) };
    };

    const byDate = await fetchMonthTasks('2026-08', 'tok_abc');
    assert.equal(call, 2);
    assert.deepEqual(Object.keys(byDate).sort(), ['2026-08-10', '2026-08-11']);
    assert.equal(byDate['2026-08-10'][0].title, 'Dated');
    assert.equal(byDate['2026-08-11'][0].status, '✓');
  });

  it('getOrCreateRootFolderId() returns a cached localStorage id without hitting the network', async () => {
    const store = new Map([['dayPlannerRootFolderId', 'cached_folder_1']]);
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k)
    };
    globalThis.fetch = async () => { throw new Error('should not fetch when a cached folder id exists'); };
    try {
      const id = await getOrCreateRootFolderId('tok_abc');
      assert.equal(id, 'cached_folder_1');
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('getOrCreateRootFolderId() creates the folder via POST when no existing one is found, and caches it', async () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k)
    };
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: (options && options.method) || 'GET' });
      if (options && options.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'created_folder_1' }) };
      }
      return { ok: true, json: async () => ({ files: [] }) };
    };
    try {
      const id = await getOrCreateRootFolderId('tok_abc');
      assert.equal(id, 'created_folder_1');
      assert.equal(calls.length, 2);
      assert.equal(calls[1].method, 'POST');
      assert.equal(store.get('dayPlannerRootFolderId'), 'created_folder_1');
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('getOrCreateRootFolderId() reuses an existing folder found by search without creating one', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: (options && options.method) || 'GET' });
      return { ok: true, json: async () => ({ files: [{ id: 'found_folder_1', name: 'Day Planner' }] }) };
    };
    const id = await getOrCreateRootFolderId('tok_abc');
    assert.equal(id, 'found_folder_1');
    assert.equal(calls.length, 1);
  });

  it('fetchMonthlyNotesData() returns an empty skeleton when the notes file does not exist', async () => {
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [] }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };
    const data = await fetchMonthlyNotesData('2026-08', 'tok_abc');
    assert.deepEqual(data, { month: '2026-08', days: {} });
  });

  it('fetchMonthlyNotesData() falls back to an empty skeleton and logs on a JSON parse failure', async () => {
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [{ id: 'notesfile1' }] }) };
      if (url.includes('alt=media')) return { ok: true, text: async () => '{not valid json' };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };
    try {
      const data = await fetchMonthlyNotesData('2026-08', 'tok_abc');
      assert.deepEqual(data, { month: '2026-08', days: {} });
      assert.equal(errors.length, 1);
    } finally {
      console.error = originalError;
    }
  });

  it('fetchMonthlyNotesData() returns the parsed file content when found and valid', async () => {
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [{ id: 'notesfile1' }] }) };
      if (url.includes('alt=media')) return { ok: true, text: async () => JSON.stringify({ month: '2026-08', days: { '2026-08-05': { raw: 'hi' } } }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };
    const data = await fetchMonthlyNotesData('2026-08', 'tok_abc');
    assert.equal(data.days['2026-08-05'].raw, 'hi');
  });

  it('fetchMasterTasks() keeps only undated tasks and decodes their meta/status', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        items: [
          { id: 'm1', title: 'Master item', status: 'needsAction', notes: '<!--dp-meta:{"category":"Work","movedTo":"2026-08-20","movedTaskId":"t9"}-->\n' },
          { id: 'd1', title: 'Has a due date', status: 'needsAction', due: '2026-08-20T00:00:00.000Z' }
        ]
      })
    });
    const tasks = await fetchMasterTasks('tok_abc');
    assert.equal(tasks.length, 1);
    assert.deepEqual(tasks[0], { id: 'm1', title: 'Master item', category: 'Work', status: '•', movedTo: '2026-08-20', movedTaskId: 't9' });
  });

  it('fetchFutureMatrix() returns an empty 12-month skeleton when the file does not exist', async () => {
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [] }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };
    const matrix = await fetchFutureMatrix(2026, 'tok_abc');
    assert.equal(matrix.year, '2026');
    assert.equal(Object.keys(matrix.months).length, 12);
    assert.deepEqual(matrix.months['2026-01'], []);
  });

  it('fetchFutureMatrix() merges found file content into the skeleton', async () => {
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [{ id: 'matrixfile1' }] }) };
      if (url.includes('alt=media')) return { ok: true, text: async () => JSON.stringify({ months: { '2026-10': [{ id: 'f1', title: 'Plan trip' }] } }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };
    const matrix = await fetchFutureMatrix(2026, 'tok_abc');
    assert.equal(matrix.months['2026-10'].length, 1);
    assert.equal(matrix.months['2026-01'].length, 0);
  });

  it('fetchRecentAttendees() dedupes, lowercases, and sorts attendee emails across pages', async () => {
    let call = 0;
    globalThis.fetch = async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ nextPageToken: 'p2', items: [{ attendees: [{ email: 'Zed@Example.com' }, { email: 'not-an-email' }] }] }) };
      }
      return { ok: true, json: async () => ({ items: [{ attendees: [{ email: 'amy@example.com' }, { email: 'zed@example.com' }] }] }) };
    };
    const emails = await fetchRecentAttendees(60, 15, 'tok_abc');
    assert.deepEqual(emails, ['amy@example.com', 'zed@example.com']);
  });

  it('resolveLinkTitleRest() resolves a Docs URL title', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'doc1', name: 'Meeting Notes', trashed: false }) });
    const result = await resolveLinkTitleRest('https://docs.google.com/document/d/doc1/edit', 'tok_abc');
    assert.deepEqual(result, { success: true, title: 'Meeting Notes', fileId: 'doc1' });
  });

  it('resolveLinkTitleRest() reports failure for a non-Drive URL', async () => {
    const result = await resolveLinkTitleRest('https://example.com/not-drive', 'tok_abc');
    assert.equal(result.success, false);
    assert.match(result.error, /Not a recognized/);
  });

  it('resolveLinkTitleRest() reports failure for a trashed file', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'doc1', name: 'Old Doc', trashed: true }) });
    const result = await resolveLinkTitleRest('https://docs.google.com/document/d/doc1/edit', 'tok_abc');
    assert.deepEqual(result, { success: false, error: 'File is trashed.' });
  });

  it('GASBridge#getMonthData() uses the REST path, pre-seeding every day and overlaying fetched data', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    globalThis.fetch = async (url) => {
      if (url.includes('/calendar/v3/')) {
        return { ok: true, json: async () => ({ items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-08-05T09:00:00-04:00' }, end: { dateTime: '2026-08-05T09:30:00-04:00' } }] }) };
      }
      if (url.includes('tasks.googleapis.com')) {
        return { ok: true, json: async () => ({ items: [{ id: 't1', title: 'A task', status: 'needsAction', due: '2026-08-06T00:00:00.000Z' }] }) };
      }
      if (url.includes('alt=media')) return { ok: true, text: async () => '' };
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [] }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };

    const bridge = new GASBridge(false);
    const data = await bridge.getMonthData('2026-08');
    assert.equal(Object.keys(data.days).length, 31);
    assert.equal(data.days['2026-08-05'].calendarEvents[0].title, 'Standup');
    assert.equal(data.days['2026-08-06'].tasks[0].title, 'A task');
    assert.deepEqual(data.days['2026-08-01'], { tasks: [], calendarEvents: [], noteContent: '' });
  });

  it('GASBridge#getMasterTasks() uses the REST path when a token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ id: 'm1', title: 'Master item', status: 'needsAction' }] }) });

    const bridge = new GASBridge(false);
    const tasks = await bridge.getMasterTasks();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, 'm1');
  });

  it('GASBridge#getFutureMatrix() uses the REST path when a token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    globalThis.fetch = async (url) => {
      const q = new URL(url).searchParams.get('q') || '';
      if (q.includes('in parents')) return { ok: true, json: async () => ({ files: [] }) };
      return { ok: true, json: async () => ({ files: [{ id: 'folder1' }] }) };
    };

    const bridge = new GASBridge(false);
    const matrix = await bridge.getFutureMatrix(2027);
    assert.equal(matrix.year, '2027');
    assert.equal(Object.keys(matrix.months).length, 12);
  });

  it('GASBridge#getRecentAttendees() uses the REST path when a token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ attendees: [{ email: 'rest@example.com' }] }] }) });

    const bridge = new GASBridge(false);
    const emails = await bridge.getRecentAttendees();
    assert.deepEqual(emails, ['rest@example.com']);
  });

  it('GASBridge#resolveLinkTitle() uses the REST path when a token is present', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'doc1', name: 'Rest Doc', trashed: false }) });

    const bridge = new GASBridge(false);
    const result = await bridge.resolveLinkTitle('https://docs.google.com/document/d/doc1/edit');
    assert.deepEqual(result, { success: true, title: 'Rest Doc', fileId: 'doc1' });
  });
});

/**
 * Routes a fake fetch() to the first matching entry in `routes` (checked in order), by request
 * method and a URL substring/regex. Throws loudly if nothing matches, rather than silently
 * returning undefined, so a wrong-shaped request in the implementation fails the test instead of
 * hanging.
 */
function fakeFetch(routes) {
  return async (url, options = {}) => {
    const method = options.method || 'GET';
    const decodedUrl = decodeURIComponent(url.replace(/\+/g, ' '));
    for (const route of routes) {
      const methodOk = !route.method || route.method === method;
      const urlOk = typeof route.match === 'string' ? decodedUrl.includes(route.match) : route.match.test(url);
      if (methodOk && urlOk) {
        return typeof route.respond === 'function' ? route.respond(url, options) : route.respond;
      }
    }
    throw new Error(`fakeFetch: no route matched ${method} ${url}`);
  };
}

const okJson = (body) => ({ ok: true, json: async () => body });
const okText = (text) => ({ ok: true, text: async () => text });
const notFound = () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => 'Not Found' });

/**
 * Extracts and parses the text/plain content part of a hand-built multipart/related upload body
 * (see createDriveFileWithContent) — unlike the simple/media PATCH path, its body isn't raw JSON.
 */
function parseMultipartUploadContent(rawBody) {
  const boundary = rawBody.match(/^--(\S+)/)[1];
  const segments = rawBody.split(`--${boundary}`).map((s) => s).filter((s) => s.trim() && s.trim() !== '--');
  const contentPart = segments[1];
  const jsonText = contentPart.replace(/^\r\n[\s\S]*?\r\n\r\n/, '').replace(/\r\n$/, '');
  return JSON.parse(jsonText);
}

describe('GAS Bridge Stage 3 REST Write Path Unit Tests', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  it('addMasterTaskRest() creates an undated task with a master:true meta marker', async () => {
    let capturedBody;
    globalThis.fetch = fakeFetch([
      {
        match: 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', method: 'POST',
        respond: (url, options) => {
          capturedBody = JSON.parse(options.body);
          return okJson({ id: 'm1', title: capturedBody.title, notes: capturedBody.notes, status: 'needsAction' });
        }
      }
    ]);

    const result = await addMasterTaskRest('Long-term goal', 'Work', 'tok_abc');
    assert.equal(capturedBody.due, undefined);
    assert.match(capturedBody.notes, /"master":true/);
    assert.match(capturedBody.notes, /"category":"Work"/);
    assert.deepEqual(result, { id: 'm1', title: 'Long-term goal', category: 'Work', status: '•', movedTo: null, movedTaskId: null });
  });

  it('markMasterTaskMovedRest() merges movedTo/movedTaskId into the existing meta marker', async () => {
    globalThis.fetch = fakeFetch([
      {
        match: /\/tasks\/m1$/, method: 'GET',
        respond: okJson({ id: 'm1', title: 'Old goal', notes: encodeTaskMeta('', { category: 'Personal' }) })
      },
      {
        match: /\/tasks\/m1$/, method: 'PATCH',
        respond: (url, options) => {
          const patch = JSON.parse(options.body);
          return okJson({ id: 'm1', title: 'Old goal', notes: patch.notes, status: 'needsAction' });
        }
      }
    ]);

    const result = await markMasterTaskMovedRest('m1', '2026-09-10', 't99', 'tok_abc');
    assert.deepEqual(result, { id: 'm1', title: 'Old goal', category: 'Personal', status: '•', movedTo: '2026-09-10', movedTaskId: 't99' });
  });

  it('addDailyTaskRest() creates a due-dated task carrying category + sourceMasterId meta', async () => {
    let capturedBody;
    globalThis.fetch = fakeFetch([
      {
        match: 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', method: 'POST',
        respond: (url, options) => {
          capturedBody = JSON.parse(options.body);
          return okJson({ id: 't1', title: capturedBody.title, due: capturedBody.due, status: 'needsAction' });
        }
      }
    ]);

    const result = await addDailyTaskRest('2026-09-05', '[A1] Ship it', 'Work', 'm1', 'tok_abc');
    assert.equal(capturedBody.due, '2026-09-05T00:00:00.000Z');
    assert.match(capturedBody.notes, /"sourceMasterId":"m1"/);
    assert.deepEqual(result, { id: 't1', title: '[A1] Ship it', status: '•', category: 'Work', dueDate: '2026-09-05', sourceMasterId: 'm1' });
  });

  it('updateDailyTaskRest() patches status and mirrors it onto the linked master task best-effort', async () => {
    const masterPatchBodies = [];
    globalThis.fetch = fakeFetch([
      { match: /\/tasks\/t1$/, method: 'GET', respond: okJson({ id: 't1', title: '[A1] Ship it', notes: encodeTaskMeta('', { sourceMasterId: 'm1', category: 'Work' }) }) },
      { match: /\/tasks\/t1$/, method: 'PATCH', respond: (url, options) => okJson({ id: 't1', title: '[A1] Ship it', status: 'completed', notes: JSON.parse(options.body).notes, due: '2026-09-05T00:00:00.000Z' }) },
      { match: /\/tasks\/m1$/, method: 'GET', respond: okJson({ id: 'm1', title: 'Ship it', notes: '' }) },
      { match: /\/tasks\/m1$/, method: 'PATCH', respond: (url, options) => { masterPatchBodies.push(JSON.parse(options.body)); return okJson({ id: 'm1' }); } }
    ]);

    const result = await updateDailyTaskRest('2026-09-05', 't1', { status: '✓' }, 'tok_abc');
    assert.deepEqual(result, { id: 't1', title: '[A1] Ship it', status: '✓', category: 'Work', dueDate: '2026-09-05' });
    assert.equal(masterPatchBodies.length, 1, 'expected the master task status to be mirrored');
    assert.equal(masterPatchBodies[0].status, 'completed');
  });

  it('updateDailyTaskRest() returns null instead of throwing when the task was already deleted (404)', async () => {
    globalThis.fetch = fakeFetch([
      { match: /\/tasks\/gone$/, method: 'PATCH', respond: notFound() }
    ]);

    const result = await updateDailyTaskRest('2026-09-05', 'gone', { title: 'renamed' }, 'tok_abc');
    assert.equal(result, null);
  });

  it('forwardDailyTaskRest() creates the forwarded task and marks the original as forwarded', async () => {
    globalThis.fetch = fakeFetch([
      { match: 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', method: 'POST', respond: (url, options) => { const body = JSON.parse(options.body); return okJson({ id: 't2', title: body.title, due: body.due, status: 'needsAction' }); } },
      { match: /\/tasks\/t1$/, method: 'GET', respond: okJson({ id: 't1', title: '[B2] Old thing', notes: '' }) },
      { match: /\/tasks\/t1$/, method: 'PATCH', respond: (url, options) => okJson({ id: 't1', title: JSON.parse(options.body).title, status: 'needsAction', notes: JSON.parse(options.body).notes, due: '2026-09-05T00:00:00.000Z' }) }
    ]);

    const { originalTask, forwardedTask } = await forwardDailyTaskRest('2026-09-05', 't1', { title: '[B2] Old thing', category: 'Work' }, '2026-09-06', 'tok_abc');
    assert.equal(forwardedTask.title, '[B1] Old thing');
    assert.equal(forwardedTask.dueDate, '2026-09-06');
    assert.equal(originalTask.title, '[B2] Old thing');
  });

  it('updateCalendarEventRest() patches the event with a resolved IANA timeZone on start/end', async () => {
    let capturedBody;
    globalThis.fetch = fakeFetch([
      {
        match: /\/calendar\/v3\/calendars\/primary\/events\/evt1$/, method: 'PATCH',
        respond: (url, options) => {
          capturedBody = JSON.parse(options.body);
          return okJson({ id: 'evt1', summary: capturedBody.summary, start: capturedBody.start, end: capturedBody.end, location: '', description: '' });
        }
      }
    ]);

    const result = await updateCalendarEventRest('evt1', { title: 'Standup', startTime: '2026-09-05T09:00:00-04:00', endTime: '2026-09-05T09:30:00-04:00' }, 'tok_abc');
    assert.equal(capturedBody.start.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.deepEqual(result, {
      id: 'evt1', title: 'Standup',
      startTime: '2026-09-05T09:00:00-04:00', endTime: '2026-09-05T09:30:00-04:00',
      location: '', description: ''
    });
  });

  it('updateCalendarEventRest() returns null instead of throwing when the event no longer exists (404)', async () => {
    globalThis.fetch = fakeFetch([
      { match: /\/events\/gone$/, method: 'PATCH', respond: notFound() }
    ]);
    const result = await updateCalendarEventRest('gone', { title: 'x' }, 'tok_abc');
    assert.equal(result, null);
  });

  it('saveDailyDocCardsRest() creates a new month notes file when none exists yet', async () => {
    let uploadedBody;
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'notes-2026-09.json'", respond: okJson({ files: [] }) },
      {
        match: 'uploadType=multipart', method: 'POST',
        respond: (url, options) => { uploadedBody = options.body; return okJson({ id: 'file1' }); }
      }
    ]);

    const result = await saveDailyDocCardsRest('2026-09-05', 'Wrote some notes', 'tok_abc');
    assert.deepEqual(result, { success: true, fileName: 'notes-2026-09.json', fileId: 'file1' });
    assert.match(uploadedBody, /Wrote some notes/);
  });

  it('saveDailyDocCardsRest() fails loud instead of overwriting the month file when its existing JSON is corrupt', async () => {
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'notes-2026-09.json'", respond: okJson({ files: [{ id: 'existing1', name: 'notes-2026-09.json' }] }) },
      { match: /\/files\/existing1\?alt=media$/, respond: okText('{not valid json') }
    ]);

    await assert.rejects(
      () => saveDailyDocCardsRest('2026-09-05', 'New notes', 'tok_abc'),
      /contains invalid JSON/
    );
  });

  it('addFutureItemRest() appends a new item to the month bucket and persists the year file', async () => {
    let uploadedBody;
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [] }) },
      { match: 'uploadType=multipart', method: 'POST', respond: (url, options) => { uploadedBody = parseMultipartUploadContent(options.body); return okJson({ id: 'fm1' }); } }
    ]);

    const item = await addFutureItemRest(2026, '2026-11', 'Plan the offsite', 'Work', 'tok_abc');
    assert.equal(item.title, 'Plan the offsite');
    assert.equal(item.category, 'Work');
    assert.equal(item.status, '•');
    assert.deepEqual(uploadedBody.months['2026-11'], [item]);
  });

  it('updateFutureItemStatusRest() cycles an existing item\'s status and persists the year file', async () => {
    const seedItem = { id: 'fm9', title: 'Renew passport', category: 'Personal', status: '•' };
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [{ id: 'fmfile1', name: 'future-matrix-2026.json' }] }) },
      { match: /\/files\/fmfile1\?alt=media$/, respond: okText(JSON.stringify({ months: { '2026-11': [seedItem] } })) },
      { match: 'uploadType=media', method: 'PATCH', respond: okJson({}) }
    ]);

    const result = await updateFutureItemStatusRest(2026, '2026-11', 'fm9', '✓', 'tok_abc');
    assert.deepEqual(result, { id: 'fm9', title: 'Renew passport', category: 'Personal', status: '✓' });
  });

  it('updateFutureItemStatusRest() returns null when the item id is not found in that month', async () => {
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [] }) }
    ]);
    const result = await updateFutureItemStatusRest(2026, '2026-11', 'missing', '✓', 'tok_abc');
    assert.equal(result, null);
  });

  it('transferFutureItemRest() removes the item from its month bucket and creates a daily task from it', async () => {
    const seedItem = { id: 'fm9', title: 'Renew passport', category: 'Personal', status: '•' };
    let savedMatrixBody;
    let createdTaskBody;
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [{ id: 'fmfile1', name: 'future-matrix-2026.json' }] }) },
      { match: /\/files\/fmfile1\?alt=media$/, respond: okText(JSON.stringify({ months: { '2026-11': [seedItem] } })) },
      { match: 'uploadType=media', method: 'PATCH', respond: (url, options) => { savedMatrixBody = JSON.parse(options.body); return okJson({}); } },
      { match: 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', method: 'POST', respond: (url, options) => { createdTaskBody = JSON.parse(options.body); return okJson({ id: 't5', title: createdTaskBody.title, due: createdTaskBody.due, status: 'needsAction' }); } }
    ]);

    const result = await transferFutureItemRest(2026, '2026-11', 'fm9', '2026-11-03', 'b', 'tok_abc');
    assert.deepEqual(savedMatrixBody.months['2026-11'], [], 'item should be removed from the month bucket');
    assert.equal(result.title, '[B1] Renew passport');
    assert.equal(result.dueDate, '2026-11-03');
  });

  it('pushFutureItemToNextMonthRest() carries an item into next month within the same year', async () => {
    const seedItem = { id: 'fm9', title: 'Renew passport', category: 'Personal', status: '•' };
    let savedMatrixBody;
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [{ id: 'fmfile1', name: 'future-matrix-2026.json' }] }) },
      { match: /\/files\/fmfile1\?alt=media$/, respond: okText(JSON.stringify({ months: { '2026-11': [seedItem] } })) },
      { match: 'uploadType=media', method: 'PATCH', respond: (url, options) => { savedMatrixBody = JSON.parse(options.body); return okJson({}); } }
    ]);

    const result = await pushFutureItemToNextMonthRest(2026, '2026-11', 'fm9', 'tok_abc');
    assert.deepEqual(result, seedItem);
    assert.deepEqual(savedMatrixBody.months['2026-11'], []);
    assert.deepEqual(savedMatrixBody.months['2026-12'], [seedItem]);
  });

  it('pushFutureItemToNextMonthRest() rolls a December item into next year\'s matrix file', async () => {
    const seedItem = { id: 'fm9', title: 'Renew passport', category: 'Personal', status: '•' };
    const savedBodiesByFile = {};
    globalThis.fetch = fakeFetch([
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: "name = 'future-matrix-2026.json'", respond: okJson({ files: [{ id: 'fmfile2026', name: 'future-matrix-2026.json' }] }) },
      { match: "name = 'future-matrix-2027.json'", respond: okJson({ files: [] }) },
      { match: /\/files\/fmfile2026\?alt=media$/, respond: okText(JSON.stringify({ months: { '2026-12': [seedItem] } })) },
      { match: 'uploadType=media', method: 'PATCH', respond: (url, options) => { savedBodiesByFile['2026'] = JSON.parse(options.body); return okJson({}); } },
      { match: 'uploadType=multipart', method: 'POST', respond: (url, options) => { savedBodiesByFile['2027'] = parseMultipartUploadContent(options.body); return okJson({ id: 'fmfile2027' }); } }
    ]);

    const result = await pushFutureItemToNextMonthRest(2026, '2026-12', 'fm9', 'tok_abc');
    assert.deepEqual(result, seedItem);
    assert.deepEqual(savedBodiesByFile['2026'].months['2026-12'], []);
    assert.deepEqual(savedBodiesByFile['2027'].months['2027-01'], [seedItem]);
  });

  it('addCalendarEventRest() creates a Meet event with an agenda doc and patches the description with its link', async () => {
    let insertBody, batchUpdateBody, patchBody;
    globalThis.fetch = fakeFetch([
      { match: '/calendars/primary/events?', method: 'POST', respond: (url, options) => { insertBody = JSON.parse(options.body); return okJson({ id: 'evt1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }); } },
      { match: ':batchUpdate', method: 'POST', respond: (url, options) => { batchUpdateBody = JSON.parse(options.body); return okJson({}); } },
      { match: 'https://docs.googleapis.com/v1/documents', method: 'POST', respond: okJson({ documentId: 'doc1' }) },
      { match: "mimeType = 'application/vnd.google-apps.folder'", respond: okJson({ files: [{ id: 'folder1', name: 'Day Planner' }] }) },
      { match: /\/files\/doc1\?fields=parents$/, method: 'GET', respond: okJson({ parents: ['root'] }) },
      { match: /\/files\/doc1\?/, method: 'PATCH', respond: okJson({ id: 'doc1', parents: ['folder1'] }) },
      { match: /\/events\/evt1$/, method: 'PATCH', respond: (url, options) => { patchBody = JSON.parse(options.body); return okJson({}); } }
    ]);

    const result = await addCalendarEventRest('2026-09-10', { title: 'Kickoff', attendees: ['a@example.com'] }, 'tok_abc');

    assert.equal(insertBody.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    assert.equal(result.id, 'evt1');
    assert.equal(result.meetLink, 'https://meet.google.com/abc-defg-hij');
    assert.equal(result.agendaDocUrl, 'https://docs.google.com/document/d/doc1/edit');
    assert.match(batchUpdateBody.requests[0].insertText.text, /Kickoff/);
    assert.match(patchBody.description, /Meeting Agenda & Notes Doc: https:\/\/docs\.google\.com\/document\/d\/doc1\/edit/);
    assert.equal(result.agendaDocError, undefined);
  });

  it('addCalendarEventRest() still returns the created event with agendaDocError when the agenda-doc chain fails', async () => {
    globalThis.fetch = fakeFetch([
      { match: '/calendars/primary/events?', method: 'POST', respond: okJson({ id: 'evt2' }) },
      { match: 'https://docs.googleapis.com/v1/documents', method: 'POST', respond: notFound() }
    ]);

    const result = await addCalendarEventRest('2026-09-10', { title: 'Standup', autoGoogleMeet: false }, 'tok_abc');
    assert.equal(result.id, 'evt2');
    assert.equal(result.agendaDocUrl, null);
    assert.match(result.agendaDocError, /404/);
    assert.equal(result.description, '');
  });

  it('addCalendarEventRest() skips the Meet conference and agenda doc chain when both are disabled', async () => {
    let insertBody;
    globalThis.fetch = fakeFetch([
      { match: '/calendars/primary/events?', method: 'POST', respond: (url, options) => { insertBody = JSON.parse(options.body); return okJson({ id: 'evt3' }); } }
    ]);

    const result = await addCalendarEventRest('2026-09-10', { title: 'Quick check-in', autoGoogleMeet: false, autoAgendaDoc: false }, 'tok_abc');
    assert.equal(insertBody.conferenceData, undefined);
    assert.equal(result.meetLink, null);
    assert.equal(result.agendaDocUrl, null);
    assert.equal(result.agendaDocError, undefined);
  });
});
