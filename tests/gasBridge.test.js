/**
 * @file gasBridge.test.js
 * @description Unit tests for GASBridge client API wrapper, mock data handling, task/calendar updates, and 2-way synchronization.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GASBridge, fetchDayCalendarEvents, fetchDayTasks, deriveTaskStatus, decodeTaskMeta } from '../src/gasBridge.js';
import IndexedDbStore from '../src/indexedDbStore.js';
import * as googleAuth from '../src/googleAuth.js';

/**
 * Simulates `window.google.script.run.withSuccessHandler(fn).withFailureHandler(fn).method(...)`
 * against a plain map of { methodName: (...args) => result | throws }.
 */
function createFakeGoogleScriptRun(handlers) {
  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') return (fn) => makeRunner(fn, failureHandler);
        if (prop === 'withFailureHandler') return (fn) => makeRunner(successHandler, fn);
        return (...args) => {
          const impl = handlers[prop];
          try {
            if (!impl) throw new Error(`No fake handler registered for ${String(prop)}`);
            successHandler(impl(...args));
          } catch (err) {
            failureHandler(err);
          }
        };
      }
    });
  }
  return makeRunner(null, null);
}

function installFakeWindow(handlers) {
  globalThis.window = { google: { script: { run: createFakeGoogleScriptRun(handlers) } } };
}

function uninstallFakeWindow() {
  delete globalThis.window;
}

describe('GAS Bridge Offline Write Queue Unit Tests', () => {
  it('should queue an add-task mutation to the outbox when offline and return a temp-id placeholder', async () => {
    installFakeWindow({});
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
      uninstallFakeWindow();
    }
  });

  it('should queue an update-task mutation when offline and return an optimistic merge', async () => {
    installFakeWindow({});
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
      uninstallFakeWindow();
    }
  });

  it('should replay queued mutations in order once back online and resolve temp ids to real ids', async () => {
    installFakeWindow({
      addDailyTask: (dateStr, title, category) => ({ id: 'real_task_99', title, status: '•', category, dueDate: dateStr })
    });
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;
      const queued = await bridge.addDailyTask('2026-08-21', '[A1] Flush me', 'Work');
      assert.ok(queued.id.startsWith('offline_task_'));

      bridge._forceOffline = false;
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
      uninstallFakeWindow();
    }
  });

  it('should stop flushing at the first failed mutation, leaving later ones queued for retry', async () => {
    installFakeWindow({
      addDailyTask: () => { throw new Error('simulated backend failure'); }
    });
    let firstId, secondId;
    try {
      const bridge = new GASBridge(false);
      bridge._forceOffline = true;
      const first = await bridge.addDailyTask('2026-08-22', '[A1] Will fail to flush', 'Work');
      const second = await bridge.addDailyTask('2026-08-22', '[A2] Should stay queued', 'Work');
      firstId = first.id;
      secondId = second.id;

      bridge._forceOffline = false;
      const flushResult = await bridge.flushOutbox();

      assert.equal(flushResult.flushed, 0);
      assert.equal(flushResult.failed, 1);
      assert.equal(flushResult.remaining, 2);

      const outbox = await IndexedDbStore.idbGetOutbox();
      assert.equal(outbox.filter(m => m.payload.tempId === firstId || m.payload.tempId === secondId).length, 2);
    } finally {
      uninstallFakeWindow();
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

  it('getDailyData() uses the REST path (Calendar + Tasks) when a GIS access token is present, and skips notes for now', async () => {
    installFakeGisSignedIn('tok_rest');
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      fetchedUrls.push(url);
      if (url.includes('/calendar/v3/')) {
        return { ok: true, json: async () => ({ items: [] }) };
      }
      return {
        ok: true,
        json: async () => ({ items: [{ id: 't1', title: 'REST task', status: 'needsAction', due: '2026-08-20T00:00:00.000Z' }] })
      };
    };

    const bridge = new GASBridge(false);
    const data = await bridge.getDailyData('2026-08-20');
    assert.equal(data.date, '2026-08-20');
    assert.equal(data.noteContent, '');
    assert.equal(data.calendarEvents.length, 0);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].title, 'REST task');
    assert.equal(fetchedUrls.length, 2);
  });

  it('getDailyData() falls back to google.script.run when no access token is present but window.google.script.run is', async () => {
    globalThis.window = {
      google: {
        script: {
          run: {
            withSuccessHandler(fn) {
              return { withFailureHandler: () => ({ getDailyData: (dateStr) => fn({ date: dateStr, tasks: ['from-gas'], calendarEvents: [], noteContent: 'n' }) }) };
            }
          }
        }
      }
    };
    const bridge = new GASBridge(false);
    const data = await bridge.getDailyData('2026-08-21');
    assert.deepEqual(data.tasks, ['from-gas']);
  });
});
