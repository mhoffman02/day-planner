/**
 * @file gasFakesHub.js
 * @description Test fakes for the Gmail/Meeting hub .gs files (Phase 28): Advanced Gmail
 * (Users.Threads.list/get, Users.Labels.list), Advanced Calendar (Events.list/get), Advanced Tasks
 * (Tasks.list/insert/patch with the REAL argument order), a user+script LockService sharing one lock,
 * ScriptApp triggers, a fixed clock, and in-memory stand-ins for the DPConfig / DPLedgerRepo /
 * DPNotesRepo globals owned by another module (same documented interfaces). Builds only on the
 * exported makeGasContext/loadGasFile/loadEngines/toHost of gasRuntimeStubs.js.
 *
 * Contract enforcement: the ledger fake throws when written without the lock held, mirroring
 * "caller must hold the lock". Gmail has no write methods at all, so any attempt throws TypeError.
 * Never put real email content in fakes; message bodies here are synthetic canaries.
 */
import vm from 'node:vm';
import { makeGasContext, loadGasFile, loadEngines } from './gasRuntimeStubs.js';

export const TZ = 'America/Los_Angeles';
export const HUB_FILES = ['GmailRepository.gs', 'CalendarRepository.gs', 'TaskRepository.gs', 'QueueProcessor.gs', 'HubController.gs', 'Triggers.gs'];

function err404(what) {
  const e = new Error(`${what} not found`);
  e.code = 404;
  return e;
}

// The Apps Script Advanced Gmail service hands body.data back already decoded, as a Java byte[] (signed bytes),
// not the REST API's base64url string (live 2026-10-10: decoding it threw "Could not decode string.").
function gasBodyBytes(text) {
  return Array.from(Buffer.from(text, 'utf8')).map((b) => (b > 127 ? b - 256 : b));
}

function formatInZone(date, tz, pattern) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return pattern.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
}

function installClock(ctx, iso) {
  ctx.__nowMs = Date.parse(iso);
  vm.runInContext(`(function(){var R=Date; class F extends R { constructor(...a){ if(a.length===0){ super(globalThis.__nowMs); } else { super(...a); } } static now(){ return globalThis.__nowMs; } } globalThis.Date=F; })()`, ctx);
  ctx.__setNow = (v) => { ctx.__nowMs = Date.parse(v); };
}

function makeLocks() {
  const mk = () => {
  const state = { holder: null, nextId: 1 };
  const handle = () => {
    const id = state.nextId;
    state.nextId += 1;
    return {
      tryLock() { if (state.holder !== null && state.holder !== id) return false; state.holder = id; return true; },
      waitLock() { if (!this.tryLock()) throw new Error('Could not obtain lock'); },
      hasLock: () => state.holder === id,
      releaseLock() { if (state.holder === id) state.holder = null; }
    };
  };
  return { state, handle };
  };
  const script = mk();
  const user = mk();
  return { state: script.state, userState: user.state, getScriptLock: script.handle, getUserLock: user.handle };
}

function makeGmail(h) {
  const labelId = (name) => {
    let l = h.gmail.labels.find((x) => x.name === name);
    if (!l) { l = { id: `Label_${h.gmail.labels.length + 1}`, name }; h.gmail.labels.push(l); }
    return l.id;
  };
  h.gmail.labelId = labelId;
  return {
    Users: {
      getProfile(userId) { h.gmail.calls.push('getProfile'); return { emailAddress: 'Me@Example.test' }; },
      Labels: { list() { h.gmail.calls.push('labels.list'); return { labels: h.gmail.labels.map((l) => ({ ...l })) }; } },
      Threads: {
        list(userId, opts = {}) {
          h.gmail.calls.push('threads.list');
          if (h.gmail.quotaOnList) throw new Error(QUOTA_MSG('list'));
          // Like Gmail: threads in Trash are left out unless includeSpamTrash; several labelIds must ALL match.
          const ids = Object.values(h.gmail.threads).filter((t) => (opts.includeSpamTrash || !t.trashed) && (!opts.labelIds || opts.labelIds.every((l) => t.messages.some((m) => m.labelIds.includes(l))))).map((t) => ({ id: t.id, historyId: String(t.historyId) }));
          return { threads: ids.slice(0, opts.maxResults || 100) };
        },
        get(userId, id, opts = {}) {
          h.gmail.calls.push(`threads.get:${opts.format}`);
          if (typeof h.gmail.quotaAfterGets === 'number' && h.gmail.calls.filter((c) => c.startsWith('threads.get')).length > h.gmail.quotaAfterGets) throw new Error(QUOTA_MSG('get'));
          if (opts.format !== 'metadata' && opts.format !== 'full') throw new Error(`unexpected Gmail format ${opts.format}`);
          const t = h.gmail.threads[id];
          if (!t) throw err404('thread');
          return {
            id: t.id,
            historyId: String(t.historyId),
            messages: t.messages.map((m) => ({
              id: m.id,
              labelIds: m.labelIds,
              snippet: m.snippet,
              internalDate: String(m.internalDate),
              payload: {
                headers: [{ name: 'From', value: m.from }, { name: 'To', value: m.to }, { name: 'Cc', value: m.cc || '' }, { name: 'Subject', value: m.subject }, { name: 'Date', value: new Date(m.internalDate).toUTCString() }],
                mimeType: 'text/plain',
                body: opts.format === 'full' ? { data: gasBodyBytes(m.body || '') } : {}
              }
            }))
          };
        },
        // Advanced Gmail signature: modify(resource, userId, id). Records the exact label changes.
        modify(resource, userId, id) {
          h.gmail.calls.push(`threads.modify:${JSON.stringify(resource)}`);
          if (h.gmail.failWrite) throw new Error(h.gmail.failWrite);
          const t = h.gmail.threads[id];
          if (!t) throw err404('thread');
          const add = resource.addLabelIds || [];
          const remove = resource.removeLabelIds || [];
          t.messages.forEach((m) => { m.labelIds = m.labelIds.filter((l) => !remove.includes(l)).concat(add.filter((l) => !m.labelIds.includes(l))); });
          t.historyId += 1; // like Gmail: any label change moves the thread historyId
          return { id };
        },
        trash(userId, id) {
          h.gmail.calls.push('threads.trash');
          if (h.gmail.failWrite) throw new Error(h.gmail.failWrite);
          const t = h.gmail.threads[id];
          if (!t) throw err404('thread');
          t.trashed = true;
          t.historyId += 1;
          return { id };
        }
      }
    }
  };
}

function makeCalendar(h) {
  const raw = (e) => ({ ...e, start: { dateTime: e.start }, end: { dateTime: e.end } });
  return {
    Events: {
      list(calendarId, params = {}) {
        h.calendar.calls.push('events.list');
        const min = Date.parse(params.timeMin);
        const max = Date.parse(params.timeMax);
        return { items: h.calendar.events.filter((e) => Date.parse(e.start) >= min && Date.parse(e.start) <= max).map(raw) };
      },
      get(calendarId, eventId) {
        h.calendar.calls.push('events.get');
        const e = h.calendar.events.find((x) => x.id === eventId);
        if (!e) throw err404('event');
        return raw(e);
      }
    }
  };
}

function makeTasks(h) {
  return {
    Tasks: {
      list(listId, params = {}) {
        h.tasks.calls.push('tasks.list');
        const items = h.tasks.items.filter((t) => (params.showCompleted ? true : t.status !== 'completed'));
        const size = params.maxResults || 20;
        const start = params.pageToken ? Number(params.pageToken) : 0;
        const page = items.slice(start, start + size);
        const next = start + size < items.length ? String(start + size) : undefined;
        return { items: page.map((t) => ({ ...t })), nextPageToken: next };
      },
      get(listId, taskId) { const t = h.tasks.items.find((x) => x.id === taskId); if (!t) throw err404('task'); return t; },
      insert(resource, listId) {
        h.tasks.inserts += 1;
        h.tasks.lastList = listId;
        if (h.tasks.onInsert) h.tasks.onInsert(resource);
        if (h.tasks.failInsert) { const e = new Error('Backend Error'); e.code = 500; throw e; }
        const t = { id: `task${h.tasks.items.length + 1}`, status: 'needsAction', ...resource };
        h.tasks.items.push(t);
        return t;
      },
      patch(patch, listId, taskId) { h.tasks.patches += 1; return Object.assign(this.get(listId, taskId), patch); }
    }
  };
}

function makeScriptApp(h) {
  return {
    AuthMode: { FULL: 'FULL' },
    AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
    // h.authUrl set = the owner has not approved the current scopes (like WORK after a scope change).
    getAuthorizationInfo: () => ({
      getAuthorizationStatus: () => (h.authUrl ? 'REQUIRED' : 'NOT_REQUIRED'),
      getAuthorizationUrl: () => h.authUrl || null
    }),
    getProjectTriggers: () => h.triggers.map((t) => ({ getHandlerFunction: () => t.handler, getUniqueId: () => t.id })),
    deleteTrigger(tr) { h.triggers = h.triggers.filter((t) => t.id !== tr.getUniqueId()); },
    newTrigger(handler) {
      return {
        timeBased() { return this; },
        everyMinutes(n) { this.minutes = n; return this; },
        create() { h.triggers.push({ id: `trg${h.triggerSeq += 1}`, handler, minutes: this.minutes }); return {}; }
      };
    }
  };
}

function makeLedger(ctx, h) {
  const assertLocked = () => { if (ctx.LockService.state.holder === null) throw new Error('LEDGER_WITHOUT_LOCK: caller must hold the lock'); };
  const stamp = () => new Date().toISOString();
  return {
    readRange: () => "'Integration Ledger'!A2:N5001",
    flush() {},
    beginSession() {},
    endSession() {},
    get(opKey) { const r = h.ledger.rows.get(opKey); return r ? { ...r } : null; },
    upsert(row) {
      assertLocked();
      if (h.ledger.failUpsert && h.ledger.failUpsert(row)) throw new Error('Sheets write failed');
      const prev = h.ledger.rows.get(row.OperationKey);
      const merged = { ...(prev || {}), ...row, CreatedAt: prev ? prev.CreatedAt : row.CreatedAt, UpdatedAt: row.UpdatedAt || stamp() };
      h.ledger.rows.set(row.OperationKey, merged);
      h.ledger.writes.push({ key: row.OperationKey, status: row.Status });
      return { ...merged };
    },
    list(f = {}) { return [...h.ledger.rows.values()].filter((r) => (!f.status || r.Status === f.status) && (!f.sourceType || r.SourceType === f.sourceType)).map((r) => ({ ...r })); },
    appendMany(rows) { assertLocked(); rows.forEach((r) => h.ledger.rows.set(r.OperationKey, { ...r })); return rows.length; }
  };
}

function makeNotes(ctx, h) {
  return {
    ensureNotesDoc(seriesKey) {
      const docId = `doc-${seriesKey}-0000000000`;
      if (!h.notes.docs[docId]) h.notes.docs[docId] = { paragraphs: [{ text: `Meeting Notes - ${seriesKey}`, style: 'TITLE' }], revisionId: 'r1' };
      const row = h.config.registry.find((r) => r.SeriesKey === seriesKey);
      if (row) row.HumanNotesDocId = docId;
      return docId;
    },
    readDocModel(docId) {
      if (h.notes.inaccessible) { const e = new Error('Notes Doc is inaccessible'); e.code = 'DOC_INACCESSIBLE'; e.retryable = true; throw e; }
      return JSON.parse(JSON.stringify(h.notes.docs[docId]));
    },
    applyPlan(docId, plan) {
      h.notes.applyCalls += 1;
      const next = ctx.DPEngines.applyNotesRequests(h.notes.docs[docId], plan.requests);
      h.notes.docs[docId] = { ...JSON.parse(JSON.stringify(next)), revisionId: `r${h.notes.applyCalls + 1}` };
      return { applied: plan.requests.length };
    },
    carryInCount(docId, occurrence) { return ctx.DPEngines.carryInCount(h.notes.docs[docId], occurrence); }
  };
}

function seedRegistry(engines) {
  return engines.DEFAULT_SERIES.map((s) => ({ ...JSON.parse(JSON.stringify(s)), CalendarId: 'primary' }));
}

/**
 * Builds a vm context with all hub fakes and loads Engines.gs plus the six hub .gs files.
 * @param {{now?:string, features?:object, batchSize?:number, load?:boolean}} [o] now is the fixed clock.
 * @returns {object} ctx; ctx.__hub holds seed/inspection state.
 */
export function makeHubContext(o = {}) {
  const ctx = makeGasContext();
  installClock(ctx, o.now || '2026-10-05T22:00:00Z');
  const h = {
    gmail: { labels: [{ id: 'INBOX', name: 'INBOX' }], threads: {}, calls: [] },
    calendar: { events: [], calls: [] },
    tasks: { items: [], inserts: 0, patches: 0, calls: [], onInsert: null, failInsert: false },
    ledger: { rows: new Map(), writes: [], failUpsert: null },
    notes: { docs: {}, applyCalls: 0, inaccessible: false },
    config: { features: o.features || {}, batchSize: o.batchSize || 25, registry: [] },
    triggers: [],
    triggerSeq: 0
  };
  ctx.__hub = h;
  ctx.LockService = makeLocks();
  ctx.CacheService = makeUserCache(h);
  ctx.Gmail = makeGmail(h);
  ctx.Calendar = makeCalendar(h);
  ctx.Tasks = makeTasks(h);
  ctx.ScriptApp = makeScriptApp(h);
  // Production manifest has no userinfo.email scope, so Session user lookups throw (seen live on HOME 2026-10-09).
  const noEmailScope = () => { throw new Error('Specified permissions are not sufficient to call Session.getActiveUser. Required permissions: https://www.googleapis.com/auth/userinfo.email'); };
  ctx.Session = { getScriptTimeZone: () => TZ, getActiveUser: noEmailScope, getEffectiveUser: noEmailScope };
  ctx.Utilities.formatDate = (d, tz, pattern) => formatInZone(d, tz, pattern);
  // Like Apps Script: unpadded input whose length is not a multiple of 4 throws (live 2026-10-10 triage board).
  ctx.Utilities.base64DecodeWebSafe = (s) => {
    if (String(s).length % 4 !== 0 || !/^[A-Za-z0-9_-]*={0,2}$/.test(String(s))) throw new Error('Could not decode string.');
    return Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  };
  ctx.Utilities.newBlob = (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') });
  const engines = loadEngines(ctx);
  h.config.registry = seedRegistry(engines);
  if (o.realStores) {
    // Real Config.gs + LedgerRepository.gs on the Sheets fake (quota / first-run tests).
    loadGasFile(ctx, 'Config.gs');
    loadGasFile(ctx, 'LedgerRepository.gs');
    ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
    if (o.realStores === 'cold') return finishLoad(ctx, o); // first-run state: nothing provisioned yet
    const sheetId = ctx.DPConfig.ensureSetup();
    if (o.batchSize) ctx.__fakes.sheets[sheetId].tabs[0].rows.find((r) => r[0] === 'BatchSize')[1] = String(o.batchSize);
    Object.keys(h.config.features).forEach((k) => ctx.DPConfig.setFeature(k, h.config.features[k]));
    h.config.registry = ctx.DPConfig.getRegistry();
  } else {
    ctx.DPConfig = {
      getFeatures: () => ({ ...engines.DEFAULT_FEATURES, ...h.config.features }),
      getConfig: () => ({ TimeZone: TZ, UserEmail: 'me@example.test', TasksListId: 'LIST1', BatchSize: h.config.batchSize, TriggerMinutes: h.config.triggerMinutes || 10, MaxExcerptChars: 160, features: { ...engines.DEFAULT_FEATURES, ...h.config.features } }),
      getRegistry: () => h.config.registry,
      getSheetId: () => 'sheet1',
      isProvisioned: () => true,
      isFolderBound: () => true,
      needsRepair: () => false,
      getSheetUrl: () => 'https://example.invalid/sheet',
      beginSnapshot: (extra) => extra.map(() => []),
      endSnapshot: () => {},
      resetSheetsMeter: () => {},
      sheetsMeter: () => ({ reads: 0, writes: 0 })
    };
    ctx.DPLedgerRepo = makeLedger(ctx, h);
  }
  ctx.DPNotesRepo = makeNotes(ctx, h);
  return finishLoad(ctx, o);
}

function finishLoad(ctx, o) {
  const h = ctx.__hub;
  if (!ctx.DPNotesRepo) ctx.DPNotesRepo = makeNotes(ctx, h);
  if (o.load !== false) for (const f of HUB_FILES) loadGasFile(ctx, f);
  return ctx;
}

/** Seeds one Gmail thread (single message unless msgs given). */
/** Persistent CacheService user cache (the shared stub hands out a fresh cache per call). h.cache.failGet throws. */
function makeUserCache(h) {
  h.cache = { store: new Map(), ttl: new Map(), failGet: null, calls: [] };
  const c = h.cache;
  const cache = {
    get(k) { c.calls.push('get'); if (c.failGet) throw new Error(c.failGet); return c.store.has(k) ? c.store.get(k) : null; },
    getAll(keys) {
      c.calls.push('getAll');
      if (c.failGet) throw new Error(c.failGet);
      const out = {};
      keys.forEach((k) => { if (c.store.has(k)) out[k] = c.store.get(k); });
      return out;
    },
    put(k, v, ttl) { c.store.set(k, String(v)); c.ttl.set(k, ttl); },
    putAll(obj, ttl) { c.calls.push('putAll'); Object.keys(obj).forEach((k) => { c.store.set(k, String(obj[k])); c.ttl.set(k, ttl); }); },
    remove(k) { c.store.delete(k); },
    removeAll(keys) { keys.forEach((k) => c.store.delete(k)); }
  };
  return { getUserCache: () => cache, getScriptCache: () => cache };
}

/** The live WORK error text (2026-10-12), so tests match what Gmail really throws. */
const QUOTA_MSG = (m) => `API call to gmail.users.threads.${m} failed with error: Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:1'.`;

export function addThread(ctx, t) {
  const h = ctx.__hub;
  // Threads are Inbox mail unless archived: true (Triage filter labels count only in the Inbox).
  const names = t.labels || [];
  const ids = (t.archived || names.includes('INBOX') ? names : ['INBOX', ...names]).map((n) => h.gmail.labelId(n));
  const msgs = t.messages || [{ from: t.from || 'Pat Example <pat@example.test>', to: t.to || 'me@example.test', subject: t.subject || 'Subject', body: t.body || 'plain body', cc: t.cc, snippet: t.snippet }];
  h.gmail.threads[t.id] = {
    id: t.id,
    historyId: t.historyId || 100,
    messages: msgs.map((m, i) => ({ id: `${t.id}m${i}`, labelIds: ids, internalDate: Date.parse(t.date || '2026-10-05T20:00:00Z') + i * 60000, from: m.from, to: m.to || 'me@example.test', cc: m.cc, subject: m.subject || t.subject || 'Subject', body: m.body, snippet: m.snippet || '' }))
  };
}

/** Seeds the Core Tuesday meetings (08:00 PT) with PREP blocks (07:30 PT) for the given dates. */
export function addCoreOccurrences(ctx, dates = ['2026-10-06', '2026-10-13']) {
  const ev = ctx.__hub.calendar.events;
  dates.forEach((d) => {
    const compact = d.replace(/-/g, '');
    ev.push({ id: `prep_${compact}`, summary: 'NCMMS: Core Team Meeting prep / time block', start: `${d}T14:30:00Z`, end: `${d}T15:00:00Z`, recurringEventId: 'prepRec' });
    ev.push({ id: `core_${compact}`, summary: '🛠 NCMMS Core Team Meeting', start: `${d}T15:00:00Z`, end: `${d}T15:30:00Z`, recurringEventId: 'coreRec', attendees: [{ email: 'a@example.test' }, { email: 'b@example.test' }] });
  });
}

export function lines(ctx) { return ctx.__consoleLines.join('\n'); }
