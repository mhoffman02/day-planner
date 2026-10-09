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

function b64url(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
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
      Labels: { list() { h.gmail.calls.push('labels.list'); return { labels: h.gmail.labels.map((l) => ({ ...l })) }; } },
      Threads: {
        list(userId, opts = {}) {
          h.gmail.calls.push('threads.list');
          const ids = Object.values(h.gmail.threads).filter((t) => !opts.labelIds || t.messages.some((m) => m.labelIds.some((l) => opts.labelIds.includes(l)))).map((t) => ({ id: t.id }));
          return { threads: ids.slice(0, opts.maxResults || 100) };
        },
        get(userId, id, opts = {}) {
          h.gmail.calls.push(`threads.get:${opts.format}`);
          if (opts.format !== 'metadata' && opts.format !== 'full') throw new Error(`unexpected Gmail format ${opts.format}`);
          const t = h.gmail.threads[id];
          if (!t) throw err404('thread');
          return {
            id: t.id,
            messages: t.messages.map((m) => ({
              id: m.id,
              labelIds: m.labelIds,
              internalDate: String(m.internalDate),
              payload: {
                headers: [{ name: 'From', value: m.from }, { name: 'To', value: m.to }, { name: 'Cc', value: m.cc || '' }, { name: 'Subject', value: m.subject }, { name: 'Date', value: new Date(m.internalDate).toUTCString() }],
                mimeType: 'text/plain',
                body: opts.format === 'full' ? { data: b64url(m.body || '') } : {}
              }
            }))
          };
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
  ctx.Gmail = makeGmail(h);
  ctx.Calendar = makeCalendar(h);
  ctx.Tasks = makeTasks(h);
  ctx.ScriptApp = makeScriptApp(h);
  ctx.Session = { getScriptTimeZone: () => TZ, getActiveUser: () => ({ getEmail: () => 'me@example.test' }), getEffectiveUser: () => ({ getEmail: () => 'me@example.test' }) };
  ctx.Utilities.formatDate = (d, tz, pattern) => formatInZone(d, tz, pattern);
  ctx.Utilities.base64DecodeWebSafe = (s) => Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
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
      getSheetUrl: () => 'https://example.invalid/sheet'
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
export function addThread(ctx, t) {
  const h = ctx.__hub;
  const ids = (t.labels || []).map((n) => h.gmail.labelId(n));
  const msgs = t.messages || [{ from: t.from || 'Pat Example <pat@example.test>', to: t.to || 'me@example.test', subject: t.subject || 'Subject', body: t.body || 'plain body', cc: t.cc }];
  h.gmail.threads[t.id] = {
    id: t.id,
    messages: msgs.map((m, i) => ({ id: `${t.id}m${i}`, labelIds: ids, internalDate: Date.parse(t.date || '2026-10-05T20:00:00Z') + i * 60000, from: m.from, to: m.to || 'me@example.test', cc: m.cc, subject: m.subject || t.subject || 'Subject', body: m.body }))
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
